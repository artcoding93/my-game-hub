import { createAudioContext, makeNoiseBuffer, VoiceTracker } from "@/lib/audio/synth";
import type { FieldId, GameEvent } from "../types";
import { cuesForEvents, type CueEntry, type SoundCue } from "./cues";
import { CannonMusic } from "./music";
import { scheduleCue } from "./sfx";

/** 효과음 전체 음량. BGM은 이 값의 MUSIC_RATIO배. */
export const SFX_VOLUME = 0.3;
export const MUSIC_RATIO = 0.55;
const MIN_REPEAT: Partial<Record<SoundCue, number>> = { click: 0.05, explosion: 0.08, hit: 0.1 };

/**
 * Cannon Rivals 사운드. 효과음(SFX)과 배경음악(BGM)을 따로 켜고 끈다(기본 둘 다 꺼짐).
 * - AudioContext는 사용자 입력 안의 unlock()에서 처음 만든다(자동 재생 정책·iOS). 둘 다 꺼져 있으면 만들지 않는다.
 * - 게임 규칙에는 관여하지 않고 컨트롤러 이벤트를 읽기만 한다.
 */
export class CannonAudio {
  sfxEnabled: boolean;
  readonly music: CannonMusic;
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new VoiceTracker();
  private lastPlayed = new Map<SoundCue, number>();

  constructor(sfxEnabled: boolean, musicEnabled: boolean) {
    this.sfxEnabled = sfxEnabled;
    this.music = new CannonMusic(musicEnabled);
  }

  get musicEnabled() {
    return this.music.enabled;
  }

  unlock() {
    if (!this.sfxEnabled && !this.music.enabled) return;
    if (!this.ctx) {
      const ctx = createAudioContext();
      if (!ctx) return;
      this.ctx = ctx;
      this.bus = ctx.createGain();
      this.bus.gain.value = SFX_VOLUME;
      this.bus.connect(ctx.destination);
      this.music.attach(ctx, SFX_VOLUME * MUSIC_RATIO);
    }
    const state = this.ctx.state as string;
    if (state !== "running" && state !== "closed") void this.ctx.resume().catch(() => {});
  }

  setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
    if (enabled) this.unlock();
    else if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
  }

  setMusicEnabled(enabled: boolean) {
    this.music.setEnabled(enabled);
    if (enabled) this.unlock();
  }

  /** 메뉴·전투에서 들려줄 곡 (BGM이 켜져 있을 때만 실제로 울린다) */
  cueMusic(field: FieldId) {
    this.music.cue(field);
  }

  startBattleMusic(field: FieldId) {
    this.music.play(field);
  }

  setPaused(paused: boolean) {
    this.music.setActive(!paused);
  }

  handle(events: readonly GameEvent[]) {
    if (events.some((e) => e.type === "gameOver")) this.music.stop(1.5);
    if (events.some((e) => e.type === "explosion")) this.music.duck();
    this.play(cuesForEvents(events));
  }

  click() {
    this.play([{ cue: "click", delay: 0 }]);
  }

  play(cues: readonly CueEntry[]) {
    const { ctx, bus } = this;
    if (!this.sfxEnabled || !ctx || !bus || cues.length === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    this.noise ??= makeNoiseBuffer(ctx, 1);
    const now = ctx.currentTime;
    for (const { cue, delay } of cues) {
      if (now - (this.lastPlayed.get(cue) ?? -Infinity) < (MIN_REPEAT[cue] ?? 0)) continue;
      this.lastPlayed.set(cue, now);
      scheduleCue(cue, { ctx, out: bus, voices: this.voices, noise: this.noise }, now + delay);
    }
  }

  dispose() {
    this.music.dispose();
    if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
    this.bus?.disconnect();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.bus = null;
    this.noise = null;
  }

  // 테스트·디버깅용
  get context() {
    return this.ctx;
  }
}
