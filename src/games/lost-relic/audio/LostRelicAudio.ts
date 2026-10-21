import { LoopPlayer } from "@/lib/audio/loopPlayer";
import { createAudioContext, makeNoiseBuffer, VoiceTracker } from "@/lib/audio/synth";
import type { ControlAction } from "../controller";
import type { GameEvent, RoomId } from "../types";
import { cueForAction, cuesForEvents, musicCommands, type CueRequest, type MusicTrack, type SoundCue } from "./cues";
import { LOOPS } from "./music";
import { CUE_CHANNEL, scheduleCue } from "./sfx";

/** 효과음 전체 음량. BGM은 이 값의 30%로 재생한다. */
export const SFX_VOLUME = 0.2;
export const MUSIC_RATIO = 0.3;
/** 같은 효과음을 이보다 짧은 간격으로 다시 울리지 않는다. */
const MIN_REPEAT: Partial<Record<SoundCue, number>> = { trapTrigger: 0.3, coin: 0.05, thud: 0.15, denied: 0.15, roomTransition: 0.2 };
/** 효과음이 날 때 BGM을 잠깐 낮추는 효과음 */
const DUCKING: ReadonlySet<SoundCue> = new Set(["itemFound", "keyPickup", "secretFound", "playerHit", "toolUse"]);
const TRACKS: MusicTrack[] = ["exploration", "danger", "relic"];

/**
 * Lost Relic 사운드: 효과음(SFX)과 배경음악(BGM 3곡)을 하나의 AudioContext에서 따로 켜고 끈다.
 * - AudioContext는 사용자 입력 안의 unlock()에서 처음 만든다(자동재생 정책). 둘 다 꺼져 있으면 만들지 않는다.
 * - 효과음은 전용 GainNode(sfxBus), 곡마다 LoopPlayer가 자체 GainNode를 가진다.
 * - 곡 전환: 이전 곡은 페이드아웃, 새 곡은 페이드인. 같은 곡이면 다시 시작하지 않는다.
 * - 게임 규칙에는 관여하지 않고, 컨트롤러가 전달하는 이벤트를 읽기만 한다.
 */
export class LostRelicAudio {
  sfxEnabled: boolean;
  readonly players: Record<MusicTrack, LoopPlayer>;
  private musicOn: boolean;
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new VoiceTracker();
  private lastPlayed = new Map<SoundCue, number>();
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  /** 지금 재생하려는 곡 (일시정지 중에도 유지) */
  private track: MusicTrack | null = null;

  constructor(sfxEnabled: boolean, musicEnabled: boolean) {
    this.sfxEnabled = sfxEnabled;
    this.musicOn = musicEnabled;
    this.players = {
      exploration: new LoopPlayer(LOOPS.exploration, musicEnabled),
      danger: new LoopPlayer(LOOPS.danger, musicEnabled),
      relic: new LoopPlayer(LOOPS.relic, musicEnabled),
    };
  }

  get musicEnabled() {
    return this.musicOn;
  }

  /** 테스트·디버깅용: 지금 재생하려는 곡 */
  get currentTrack() {
    return this.track;
  }

  /** 사용자 입력(클릭·키·터치) 핸들러 안에서 호출한다. */
  unlock() {
    if (!this.sfxEnabled && !this.musicOn) return;
    if (!this.ctx) {
      this.ctx = createAudioContext();
      if (!this.ctx) return;
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = SFX_VOLUME;
      this.sfxBus.connect(this.ctx.destination);
      for (const track of TRACKS) this.players[track].attach(this.ctx, SFX_VOLUME * MUSIC_RATIO);
    }
    if (this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
  }

  setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
    if (enabled) this.unlock();
    else {
      if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
      this.suspendIfSilent();
    }
  }

  setMusicEnabled(enabled: boolean) {
    this.musicOn = enabled;
    for (const track of TRACKS) this.players[track].setEnabled(enabled);
    if (enabled) this.unlock();
    else this.suspendIfSilent();
  }

  /** 컨트롤러 이벤트(매 프레임)·조작(시작·일시정지 등)을 받아 효과음과 BGM을 처리한다. */
  handle(events: readonly GameEvent[], room: RoomId, action?: ControlAction) {
    for (const command of musicCommands(events, action, room)) {
      switch (command.type) {
        case "play":
          this.playTrack(command.track, command.restart);
          break;
        case "pause":
          if (this.track) this.players[this.track].setActive(false, 0.12);
          break;
        case "resume":
          if (this.track) this.players[this.track].setActive(true);
          break;
        case "duck":
          if (this.track) this.players[this.track].duck(command.level, command.hold);
          break;
        case "stop":
          for (const track of TRACKS) this.players[track].stop(command.fade);
          this.track = null;
          break;
      }
    }
    const cues = cuesForEvents(events);
    const actionCue = action ? cueForAction(action) : null;
    if (actionCue) cues.unshift({ cue: actionCue, delay: 0 });
    this.play(cues);
  }

  private playTrack(track: MusicTrack, restart: boolean) {
    if (this.track === track && !restart) return;
    for (const other of TRACKS) if (other !== track) this.players[other].stop(0.6);
    // 다른 곡에서 넘어올 때는 이전 곡이 줄어드는 동안 잠깐 기다렸다가 들어온다.
    this.players[track].start(this.track && this.track !== track ? 0.35 : 0.2);
    this.track = track;
  }

  play(cues: readonly CueRequest[]) {
    const { ctx, sfxBus } = this;
    if (!this.sfxEnabled || !ctx || !sfxBus || cues.length === 0) return;
    // 탭을 벗어나 자동 일시정지될 때는 비프음을 내지 않는다.
    if (typeof document !== "undefined" && document.hidden) return;
    this.noise ??= makeNoiseBuffer(ctx, 0.5);
    const now = ctx.currentTime;
    const playable = cues.filter(({ cue }) => now - (this.lastPlayed.get(cue) ?? -Infinity) >= (MIN_REPEAT[cue] ?? 0));
    for (const channel of new Set(playable.map(({ cue }) => CUE_CHANNEL[cue]))) this.voices.stopChannel(channel, now);
    for (const { cue, delay } of playable) {
      scheduleCue(cue, { ctx, out: sfxBus, voices: this.voices, noise: this.noise }, now + delay);
      this.lastPlayed.set(cue, now);
      if (DUCKING.has(cue) && this.track) this.players[this.track].duck();
    }
  }

  dispose() {
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    for (const track of TRACKS) this.players[track].dispose();
    if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
    this.sfxBus?.disconnect();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.sfxBus = null;
    this.noise = null;
    this.track = null;
  }

  // 테스트용
  get liveSfxVoices() {
    return this.voices.size;
  }
  get context() {
    return this.ctx;
  }

  /** 효과음·BGM이 모두 꺼졌을 때만 AudioContext를 잠재운다(BGM 페이드아웃이 끝난 뒤). */
  private suspendIfSilent() {
    if (this.sfxEnabled || this.musicOn) return;
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      if (!this.sfxEnabled && !this.musicOn && this.ctx?.state === "running") void this.ctx.suspend().catch(() => {});
    }, 700);
  }
}
