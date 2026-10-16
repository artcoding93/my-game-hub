import { LoopPlayer } from "@/lib/audio/loopPlayer";
import { createAudioContext, makeNoiseBuffer, VoiceTracker } from "@/lib/audio/synth";
import type { GameEvent, GameState } from "../types";
import { cuesForEvents, musicCommands, type ControlAction, type SoundCue } from "./cues";
import { GOLD_ESCAPE_LOOP, tempoForProgress } from "./music";
import { CUE_CHANNEL, scheduleCue } from "./sfx";
import { TensionTracker } from "./tension";

/** 효과음 전체 음량. BGM은 이 값의 30%로 재생한다. */
export const SFX_VOLUME = 0.18;
export const MUSIC_RATIO = 0.3;
/** 같은 효과음을 이보다 짧은 간격으로 다시 울리지 않는다(키를 연타·길게 눌러도 과도하게 반복되지 않음). */
const MIN_REPEAT: Partial<Record<SoundCue, number>> = { dig: 0.1, holeClose: 0.08, gold: 0.05 };
/** 효과음이 날 때 BGM을 잠깐 낮추는 효과음 */
const DUCKING: ReadonlySet<SoundCue> = new Set(["gold", "allGold", "trapped"]);

/**
 * Gold Escape 사운드: 효과음(SFX)과 배경음악(BGM)을 하나의 AudioContext에서 각자 음량·켜짐을 두고 관리한다.
 * - AudioContext는 사용자 입력 안의 unlock()에서 처음 만든다(자동재생 정책). 둘 다 꺼져 있으면 만들지 않는다.
 * - 게임 규칙에는 관여하지 않고, 컨트롤러가 전달하는 이벤트·상태를 읽기만 한다.
 */
export class GoldEscapeAudio {
  sfxEnabled: boolean;
  readonly music: LoopPlayer;
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new VoiceTracker();
  private lastPlayed = new Map<SoundCue, number>();
  private tension = new TensionTracker();
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sfxEnabled: boolean, musicEnabled: boolean) {
    this.sfxEnabled = sfxEnabled;
    this.music = new LoopPlayer(GOLD_ESCAPE_LOOP, musicEnabled);
  }

  /** 사용자 입력(클릭·키·터치) 핸들러 안에서 호출한다. */
  unlock() {
    if (!this.sfxEnabled && !this.music.enabled) return;
    if (!this.ctx) {
      this.ctx = createAudioContext();
      if (!this.ctx) return;
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = SFX_VOLUME;
      this.sfxBus.connect(this.ctx.destination);
      this.music.attach(this.ctx, SFX_VOLUME * MUSIC_RATIO);
    }
    if (this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
  }

  setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
    if (enabled) this.unlock();
    else {
      // 끄는 즉시 재생 중인 효과음도 멈춘다.
      if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
      this.suspendIfSilent();
    }
  }

  setMusicEnabled(enabled: boolean) {
    this.music.setEnabled(enabled);
    if (enabled) this.unlock();
    else this.suspendIfSilent();
  }

  /**
   * 컨트롤러가 매 프레임(그리고 시작·일시정지·재개 때) 호출한다.
   * 이벤트는 시뮬레이션이 상태가 바뀐 순간 한 번만 만들므로, React 리렌더링과 무관하게 한 번씩만 재생된다.
   */
  handle(events: readonly GameEvent[], state: GameState, action?: ControlAction) {
    for (const command of musicCommands(events, action)) {
      if (command.type === "start") {
        this.tension.reset();
        this.music.setTension(false);
        this.music.setTempo(tempoForProgress(state.round, state.stageIndex), true);
        this.music.start(action === "start" ? 0.45 : 0.15);
      } else if (command.type === "pause") this.music.setActive(false, 0.12);
      else if (command.type === "resume") this.music.setActive(true);
      else this.music.stop(0.4);
    }
    this.music.setTension(this.tension.update(state));

    const cues = cuesForEvents(events);
    if (action) cues.unshift(action);
    this.play(cues);
  }

  play(cues: readonly SoundCue[]) {
    const { ctx, sfxBus } = this;
    if (!this.sfxEnabled || !ctx || !sfxBus || cues.length === 0) return;
    // 탭을 벗어나 자동 일시정지될 때는 비프음을 내지 않는다.
    if (typeof document !== "undefined" && document.hidden) return;
    this.noise ??= makeNoiseBuffer(ctx, 0.2);
    const now = ctx.currentTime;

    const playable = cues.filter((cue) => now - (this.lastPlayed.get(cue) ?? -Infinity) >= (MIN_REPEAT[cue] ?? 0));
    // 같은 채널의 이전 소리를 먼저 멈춘 뒤, 채널별로 순서대로 이어서 예약한다(예: 금괴 → 모든 금괴 팡파르).
    for (const channel of new Set(playable.map((cue) => CUE_CHANNEL[cue]))) this.voices.stopChannel(channel, now);
    const offsets = new Map<string, number>();
    for (const cue of playable) {
      const channel = CUE_CHANNEL[cue];
      const offset = offsets.get(channel) ?? 0;
      offsets.set(channel, offset + scheduleCue(cue, { ctx, out: sfxBus, voices: this.voices, noise: this.noise }, now + offset));
      this.lastPlayed.set(cue, now);
      if (DUCKING.has(cue)) this.music.duck();
    }
  }

  dispose() {
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.music.dispose();
    if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
    this.sfxBus?.disconnect();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.sfxBus = null;
    this.noise = null;
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
    if (this.sfxEnabled || this.music.enabled) return;
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      if (!this.sfxEnabled && !this.music.enabled && this.ctx?.state === "running") void this.ctx.suspend().catch(() => {});
    }, 350);
  }
}
