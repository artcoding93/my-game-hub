import { closeAudioContext, resumeAudioContext, suspendAudioContext } from "@/lib/audio/unlock";
import { createAudioContext, makeNoiseBuffer } from "@/lib/audio/synth";
import type { GameEvent } from "../types";
import { cueForAction, cuesForEvents, type ControlAction, type SoundCue } from "./cues";
import { Voices } from "./instruments";
import { Sequencer } from "./sequencer";
import { scheduleCue } from "./sfx";
import { SONGS, type TrackId } from "./songs";

/** 효과음 전체 음량. BGM은 이 값의 30%로 재생한다. */
export const SFX_VOLUME = 0.3;
export const MUSIC_RATIO = 0.3;
/** 같은 효과음을 이보다 짧은 간격으로 다시 울리지 않는다(길게 누르기·연타 대비). */
const MIN_REPEAT: Partial<Record<SoundCue, number>> = { move: 0.045, rotate: 0.04, lock: 0.05, bump: 0.05 };

/**
 * Winter Blocks 사운드: 효과음(SFX)과 배경음악(BGM)을 하나의 AudioContext에서 따로 켜고 끈다.
 * - AudioContext는 사용자 입력 안의 unlock()에서 처음 만들고 계속 재사용한다(자동재생 정책). 둘 다 꺼져 있으면 만들지 않는다.
 * - 효과음 버스와 음악 버스는 별도 GainNode다. 음악 버스에는 짧은 딜레이(공간감)와 컴프레서를 건다.
 * - 게임 규칙에는 관여하지 않고, 컨트롤러가 전달하는 이벤트·조작을 읽기만 한다.
 */
export class WinterAudio {
  sfxEnabled: boolean;
  readonly music: Sequencer;
  track: TrackId;
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicNodes: AudioNode[] = [];
  private noise: AudioBuffer | null = null;
  private voices = new Voices();
  private lastPlayed = new Map<SoundCue, number>();
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sfxEnabled: boolean, musicEnabled: boolean, track: TrackId) {
    this.sfxEnabled = sfxEnabled;
    this.track = track;
    this.music = new Sequencer(musicEnabled);
  }

  get musicEnabled() {
    return this.music.enabled;
  }

  /** 사용자 입력(클릭·키·터치) 핸들러 안에서 호출한다. */
  unlock() {
    if (!this.sfxEnabled && !this.music.enabled) return;
    if (!this.ctx) {
      const ctx = createAudioContext();
      if (!ctx) return;
      this.ctx = ctx;
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = SFX_VOLUME;
      this.sfxBus.connect(ctx.destination);

      // 음악 버스: 음량 → (원음 + 딜레이) → 컴프레서 → 출력
      const musicGain = ctx.createGain();
      musicGain.gain.value = SFX_VOLUME * MUSIC_RATIO;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 3;
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.32;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.28;
      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 3000;
      const wet = ctx.createGain();
      wet.gain.value = 0.22;
      musicGain.connect(compressor);
      musicGain.connect(delay);
      delay.connect(damp).connect(feedback).connect(delay);
      damp.connect(wet).connect(compressor);
      compressor.connect(ctx.destination);
      this.musicNodes = [musicGain, compressor, delay, feedback, damp, wet];
      this.music.attach(ctx, musicGain);
    }
    resumeAudioContext(this.ctx);
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
    this.music.setEnabled(enabled);
    if (enabled) this.unlock();
    else this.suspendIfSilent();
  }

  /** 곡 선택. 재생 중이면 페이드아웃 → 새 곡 페이드인 */
  setTrack(track: TrackId) {
    this.track = track;
    this.music.select(SONGS[track]);
  }

  /** 시작 화면·게임 중에는 선택한 곡을 들려준다(BGM이 켜져 있을 때만 실제로 재생). */
  handle(events: readonly GameEvent[], action?: ControlAction) {
    if (action === "start") this.music.play(SONGS[this.track], 0.6);
    if (action === "title") {
      this.music.select(SONGS[this.track]);
      this.music.setActive(true);
    }
    if (action === "pause") this.music.setActive(false);
    if (action === "resume") this.music.setActive(true);
    if (events.some((e) => e.type === "gameOver")) this.music.stop(1.6);

    const cues = cuesForEvents(events);
    const actionCue = action ? cueForAction(action) : null;
    if (actionCue) cues.unshift({ cue: actionCue, delay: 0 });
    this.play(cues);
  }

  play(cues: readonly { cue: SoundCue; delay: number }[]) {
    const { ctx, sfxBus } = this;
    if (!this.sfxEnabled || !ctx || !sfxBus || cues.length === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    this.noise ??= makeNoiseBuffer(ctx, 1);
    const now = ctx.currentTime;
    for (const { cue, delay } of cues) {
      if (now - (this.lastPlayed.get(cue) ?? -Infinity) < (MIN_REPEAT[cue] ?? 0)) continue;
      this.lastPlayed.set(cue, now);
      scheduleCue(cue, { ctx, out: sfxBus, voices: this.voices, noise: this.noise }, now + delay);
    }
  }

  dispose() {
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.music.dispose();
    if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
    this.sfxBus?.disconnect();
    for (const node of this.musicNodes) node.disconnect();
    this.musicNodes = [];
    if (this.ctx) closeAudioContext(this.ctx);
    this.ctx = null;
    this.sfxBus = null;
    this.noise = null;
  }

  // 테스트용
  get context() {
    return this.ctx;
  }
  get liveSfxVoices() {
    return this.voices.size;
  }

  private suspendIfSilent() {
    if (this.sfxEnabled || this.music.enabled) return;
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      if (!this.sfxEnabled && !this.music.enabled && this.ctx) suspendAudioContext(this.ctx);
    }, 900);
  }
}
