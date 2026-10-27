import { closeAudioContext, resumeAudioContext, suspendAudioContext } from "@/lib/audio/unlock";
import { LoopPlayer } from "@/lib/audio/loopPlayer";
import { createAudioContext, makeNoiseBuffer, VoiceTracker } from "@/lib/audio/synth";
import type { Level, StepResult } from "../types";
import { HUM_LOOP, NIGHT_LOOP, songFor } from "./music";
import { CUE_CHANNEL, scheduleCue, type SoundCue } from "./sfx";

export const SFX_VOLUME = 0.22;
export const MUSIC_RATIO = 0.3;
/** 음량 단계 1~3 */
export const VOLUME_LEVELS = [0.45, 0.75, 1.1] as const;
/** 같은 효과음을 이보다 짧은 간격으로 반복하지 않는다 (빠른 연속 이동) */
const MIN_REPEAT: Partial<Record<SoundCue, number>> = { move: 0.05, blocked: 0.12, push: 0.05 };

export interface Cue {
  cue: SoundCue;
  /** 컨베이어·얼음: 지나간 칸 수 */
  length?: number;
}

/** 한 턴의 결과 → 효과음 (순수 함수: 테스트 가능). 효과는 일어난 순서대로 */
export function cuesFor(res: StepResult, level: Level, solvedNow: boolean): Cue[] {
  if (!res.moved) return [{ cue: "blocked" }];
  if (!res.box) return [{ cue: "move" }];
  const out: Cue[] = [{ cue: "push" }];
  const belt = res.box.path.filter((p) => p.kind === "conveyor").length;
  const ice = res.box.path.filter((p) => p.kind === "ice").length;
  if (belt) out.push({ cue: "conveyor", length: belt });
  if (ice) out.push({ cue: "ice", length: ice });
  if (res.box.path.some((p) => p.kind === "teleport")) out.push({ cue: "teleport" });
  const last = res.box.path[res.box.path.length - 1].cell;
  if (level.targets.has(last)) out.push({ cue: "lamp" });
  if (solvedNow) out.push({ cue: "stageClear" });
  return out;
}

/**
 * Cargo Bot 사운드: 효과음과 BGM 두 곡을 하나의 AudioContext에서 각각 켜고 끈다.
 * AudioContext는 사용자 입력 안의 unlock()에서 처음 만든다(자동재생 정책, iOS Safari).
 * 둘 다 꺼져 있으면 만들지 않고, 둘 다 끄면 suspend해 배터리를 아낀다. 재생 실패는 조용히 무시한다.
 */
export class CargoAudio {
  sfxEnabled: boolean;
  musicEnabled: boolean;
  volume: 1 | 2 | 3;
  private night: LoopPlayer;
  private hum: LoopPlayer;
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new VoiceTracker();
  private lastPlayed = new Map<SoundCue, number>();
  private current: "night" | "hum" | null = null;
  private wantMusic = false;

  constructor(sfxEnabled: boolean, musicEnabled: boolean, volume: 1 | 2 | 3) {
    this.sfxEnabled = sfxEnabled;
    this.musicEnabled = musicEnabled;
    this.volume = volume;
    this.night = new LoopPlayer(NIGHT_LOOP, musicEnabled);
    this.hum = new LoopPlayer(HUM_LOOP, musicEnabled);
  }

  private get gain() {
    return VOLUME_LEVELS[this.volume - 1];
  }

  unlock() {
    if (!this.sfxEnabled && !this.musicEnabled) return;
    try {
      if (!this.ctx) {
        this.ctx = createAudioContext();
        if (!this.ctx) return;
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = SFX_VOLUME * this.gain;
        this.sfxBus.connect(this.ctx.destination);
        this.night.attach(this.ctx, SFX_VOLUME * MUSIC_RATIO * this.gain);
        this.hum.attach(this.ctx, SFX_VOLUME * MUSIC_RATIO * this.gain);
      }
      resumeAudioContext(this.ctx);
    } catch {
      // 오디오를 쓸 수 없는 환경: 게임은 소리 없이 계속된다
    }
  }

  setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
    if (enabled) this.unlock();
    else if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
    this.sleepIfSilent();
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    this.night.setEnabled(enabled);
    this.hum.setEnabled(enabled);
    if (enabled) this.unlock();
    this.sleepIfSilent();
  }

  /** 음량 단계 변경: 효과음은 바로, BGM은 재생기를 새 음량으로 다시 연결한다 */
  setVolume(volume: 1 | 2 | 3) {
    this.volume = volume;
    if (!this.ctx || !this.sfxBus) return;
    this.sfxBus.gain.setTargetAtTime(SFX_VOLUME * this.gain, this.ctx.currentTime, 0.02);
    const playing = this.current;
    this.night.dispose();
    this.hum.dispose();
    this.night = new LoopPlayer(NIGHT_LOOP, this.musicEnabled);
    this.hum = new LoopPlayer(HUM_LOOP, this.musicEnabled);
    this.night.attach(this.ctx, SFX_VOLUME * MUSIC_RATIO * this.gain);
    this.hum.attach(this.ctx, SFX_VOLUME * MUSIC_RATIO * this.gain);
    this.current = null;
    if (playing && this.wantMusic) this.startFor(playing === "night" ? 0 : 6);
  }

  private sleepIfSilent() {
    if (this.ctx && !this.sfxEnabled && !this.musicEnabled) suspendAudioContext(this.ctx);
  }

  /** 스테이지에 맞는 곡을 튼다 (이미 같은 곡이면 이어서) */
  startFor(stageIndex: number) {
    this.wantMusic = true;
    const song = songFor(stageIndex);
    if (this.current === song) {
      (song === "night" ? this.night : this.hum).setActive(true);
      return;
    }
    (song === "night" ? this.hum : this.night).stop(0.4);
    (song === "night" ? this.night : this.hum).start(0.3);
    this.current = song;
  }

  pauseMusic(paused: boolean) {
    if (!this.current) return;
    (this.current === "night" ? this.night : this.hum).setActive(!paused);
  }

  stopMusic(fade = 0.4) {
    this.wantMusic = false;
    this.night.stop(fade);
    this.hum.stop(fade);
    this.current = null;
  }

  play(cues: readonly Cue[]) {
    const { ctx, sfxBus } = this;
    if (!this.sfxEnabled || !ctx || !sfxBus || cues.length === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      this.noise ??= makeNoiseBuffer(ctx, 0.3);
      const now = ctx.currentTime;
      const playable = cues.filter(({ cue }) => now - (this.lastPlayed.get(cue) ?? -Infinity) >= (MIN_REPEAT[cue] ?? 0));
      for (const channel of new Set(playable.map(({ cue }) => CUE_CHANNEL[cue]))) this.voices.stopChannel(channel, now);
      // 한 턴의 효과는 순서대로 이어서 (밀기 → 벨트 → 얼음 → 순간이동 → 도착)
      let offset = 0;
      for (const { cue, length } of playable) {
        const len = scheduleCue(cue, { ctx, out: sfxBus, voices: this.voices, noise: this.noise }, now + offset, length);
        if (cue === "push" || cue === "conveyor" || cue === "ice") offset += len * 0.7;
        this.lastPlayed.set(cue, now);
        if (cue === "stageClear" || cue === "gameClear") (this.current === "night" ? this.night : this.hum).duck(0.3, 1);
      }
    } catch {
      // 재생 실패는 조용히 무시한다
    }
  }

  dispose() {
    this.night.dispose();
    this.hum.dispose();
    if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
    this.sfxBus?.disconnect();
    if (this.ctx) closeAudioContext(this.ctx);
    this.ctx = null;
    this.sfxBus = null;
    this.noise = null;
  }
}
