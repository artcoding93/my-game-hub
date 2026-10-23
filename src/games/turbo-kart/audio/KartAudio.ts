import { createAudioContext, makeNoiseBuffer, VoiceTracker } from "@/lib/audio/synth";
import type { Kart, RaceEvent, TrackId } from "../types";
import { cuesForEvents, type CueEntry, type SoundCue } from "./cues";
import { KartMusic } from "./music";
import { scheduleCue } from "./sfx";

export const SFX_VOLUME = 0.3;
export const MUSIC_RATIO = 0.5;
const MIN_REPEAT: Partial<Record<SoundCue, number>> = { crash: 0.25, bump: 0.2, hit: 0.15, click: 0.05, brake: 0.6 };

/**
 * Turbo Kart 사운드. 효과음(SFX)·배경음악(BGM)을 따로 켜고 끈다(기본 둘 다 꺼짐).
 * - AudioContext는 사용자 입력 안의 unlock()에서 처음 만든다(자동 재생 정책·iOS).
 * - 엔진음(톱니파 + 저역 필터, 속도에 따라 음높이)과 드리프트 타이어음(필터 노이즈)은 레이스 중에만 이어서 울린다.
 * - 게임 규칙에는 관여하지 않는다.
 */
export class KartAudio {
  sfxEnabled: boolean;
  readonly music: KartMusic;
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new VoiceTracker();
  private lastPlayed = new Map<SoundCue, number>();
  private engine: { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private skid: { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;

  constructor(sfxEnabled: boolean, musicEnabled: boolean) {
    this.sfxEnabled = sfxEnabled;
    this.music = new KartMusic(musicEnabled);
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
    else this.stopLoops();
  }

  setMusicEnabled(enabled: boolean) {
    this.music.setEnabled(enabled);
    if (enabled) this.unlock();
  }

  cueMusic(track: TrackId) {
    this.music.cue(track);
  }

  startRaceMusic(track: TrackId) {
    this.music.play(track);
  }

  setPaused(paused: boolean) {
    this.music.setActive(!paused);
    if (paused) this.stopLoops();
  }

  handle(events: readonly RaceEvent[], player: number) {
    if (events.some((e) => e.type === "raceOver")) {
      this.music.stop(2);
      this.stopLoops();
    }
    if (events.some((e) => (e.type === "wall" || e.type === "obstacle" || e.type === "hit") && e.kart === player)) this.music.duck();
    this.play(cuesForEvents(events, player));
  }

  /** 매 프레임: 플레이어 카트 상태로 엔진음·타이어음 갱신 */
  updateLoops(kart: Kart | null, racing: boolean) {
    const { ctx, bus } = this;
    if (!ctx || !bus || !this.sfxEnabled || !kart || !racing || (typeof document !== "undefined" && document.hidden)) {
      this.stopLoops();
      return;
    }
    this.noise ??= makeNoiseBuffer(ctx, 1);
    const now = ctx.currentTime;
    const speed = Math.hypot(kart.vx, kart.vy);
    if (!this.engine) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const sub = ctx.createOscillator();
      sub.type = "square";
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 600;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain).connect(bus);
      osc.start();
      sub.start();
      this.engine = { osc, sub, filter, gain };
    }
    const pitch = 55 + speed * 0.32 + (kart.boostTime > 0 || kart.turboTime > 0 ? 40 : 0);
    this.engine.osc.frequency.setTargetAtTime(pitch, now, 0.05);
    this.engine.sub.frequency.setTargetAtTime(pitch / 2, now, 0.05);
    this.engine.filter.frequency.setTargetAtTime(400 + speed * 3, now, 0.05);
    this.engine.gain.gain.setTargetAtTime(0.06 + Math.min(0.06, speed / 6000), now, 0.08);

    if (!this.skid) {
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2400;
      filter.Q.value = 3;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(bus);
      source.start();
      this.skid = { source, filter, gain };
    }
    const skidding = kart.drifting || kart.spinTime > 0;
    this.skid.gain.gain.setTargetAtTime(skidding ? 0.12 : 0, now, 0.04);
  }

  /** 빠르게 달리다 브레이크를 밟기 시작했을 때 (입력 쪽에서 알린다) */
  brake(speed: number) {
    if (speed > 200) this.play([{ cue: "brake", delay: 0 }]);
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

  private stopLoops() {
    const ctx = this.ctx;
    if (this.engine) {
      const { osc, sub, gain, filter } = this.engine;
      this.engine = null;
      const t = ctx?.currentTime ?? 0;
      try {
        gain.gain.setTargetAtTime(0, t, 0.03);
        osc.stop(t + 0.15);
        sub.stop(t + 0.15);
      } catch {
        // 이미 멈춤
      }
      setTimeout(() => {
        osc.disconnect();
        sub.disconnect();
        filter.disconnect();
        gain.disconnect();
      }, 250);
    }
    if (this.skid) {
      const { source, filter, gain } = this.skid;
      this.skid = null;
      const t = ctx?.currentTime ?? 0;
      try {
        gain.gain.setTargetAtTime(0, t, 0.02);
        source.stop(t + 0.1);
      } catch {
        // 이미 멈춤
      }
      setTimeout(() => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      }, 200);
    }
  }

  dispose() {
    this.stopLoops();
    this.music.dispose();
    if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
    this.bus?.disconnect();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.bus = null;
    this.noise = null;
  }

  get context() {
    return this.ctx;
  }
}
