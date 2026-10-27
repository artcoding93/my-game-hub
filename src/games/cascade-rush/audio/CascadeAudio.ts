import { closeAudioContext, resumeAudioContext, suspendAudioContext } from "@/lib/audio/unlock";
import { LoopPlayer } from "@/lib/audio/loopPlayer";
import { createAudioContext, makeNoiseBuffer, VoiceTracker } from "@/lib/audio/synth";
import type { GameEvent, GamePhase } from "../types";
import { RUSH_LOOP, tempoFor } from "./music";
import { CUE_CHANNEL, scheduleCue, type SoundCue } from "./sfx";

export const SFX_VOLUME = 0.24;
export const MUSIC_VOLUME = 0.07;
/** 같은 효과음을 이보다 짧은 간격으로 반복하지 않는다 (빠른 연속 이동) */
const MIN_REPEAT: Partial<Record<SoundCue, number>> = { move: 0.035, rotate: 0.04 };

export interface Cue {
  cue: SoundCue;
  /** 연쇄 단계·남은 초 등 */
  value?: number;
}

/** 게임 이벤트 → 효과음 (순수 함수: 테스트 가능) */
export function cuesFor(events: readonly GameEvent[]): Cue[] {
  const out: Cue[] = [];
  for (const e of events) {
    switch (e.type) {
      case "move":
        out.push({ cue: "move" });
        break;
      case "rotate":
        out.push({ cue: "rotate" });
        break;
      case "land":
        out.push({ cue: e.hard ? "hardDrop" : "land" });
        break;
      case "pop":
        out.push({ cue: "pop", value: e.chain });
        break;
      case "chainEnd":
        if (e.chain >= 3) out.push({ cue: "chainEnd", value: e.chain });
        break;
      case "timeBonus":
        out.push({ cue: "timeBonus", value: e.seconds });
        break;
      case "countdown":
        out.push({ cue: "countdown", value: e.seconds });
        break;
      case "speedUp":
        out.push({ cue: "speedUp", value: e.level });
        break;
      case "go":
        out.push({ cue: "go" });
        break;
      case "gameOver":
        out.push({ cue: e.reason === "time" ? "timeUp" : "topout" });
        break;
    }
  }
  return out;
}

/**
 * Cascade Rush 사운드: 효과음과 BGM을 하나의 AudioContext에서 각각 켜고 끈다(기본 둘 다 꺼짐).
 * AudioContext는 사용자 입력 안의 unlock()에서 처음 만든다(자동재생 정책, iOS Safari).
 * 둘 다 꺼져 있으면 만들지 않고, 둘 다 끄면 suspend해 배터리를 아낀다. 재생 실패는 조용히 무시한다.
 */
export class CascadeAudio {
  sfxEnabled: boolean;
  musicEnabled: boolean;
  private music: LoopPlayer;
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new VoiceTracker();
  private lastPlayed = new Map<SoundCue, number>();
  private phase: GamePhase | null = null;

  constructor(sfxEnabled: boolean, musicEnabled: boolean) {
    this.sfxEnabled = sfxEnabled;
    this.musicEnabled = musicEnabled;
    this.music = new LoopPlayer(RUSH_LOOP, musicEnabled);
  }

  unlock() {
    if (!this.sfxEnabled && !this.musicEnabled) return;
    try {
      if (!this.ctx) {
        this.ctx = createAudioContext();
        if (!this.ctx) return;
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = SFX_VOLUME;
        this.sfxBus.connect(this.ctx.destination);
        this.music.attach(this.ctx, MUSIC_VOLUME);
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
    this.music.setEnabled(enabled);
    if (enabled) this.unlock();
    this.sleepIfSilent();
  }

  private sleepIfSilent() {
    if (this.ctx && !this.sfxEnabled && !this.musicEnabled) suspendAudioContext(this.ctx);
  }

  /**
   * 화면 단계에 맞춰 BGM을 켜고 멈춘다. 처음 화면·READY·플레이 중에는 재생, 일시정지는 위치를 기억해 멈춤,
   * 결과 화면은 페이드아웃. speed: 낙하 속도 단계(템포), tension: 긴박한 순간(아르페지오 레이어)
   */
  setScene(phase: GamePhase, speed: number, tension: boolean) {
    const prev = this.phase;
    this.phase = phase;
    this.music.setTempo(tempoFor(phase === "playing" ? speed : 1), prev === "over" || prev === "title");
    this.music.setTension(phase === "playing" && tension);
    if (phase === prev) return;
    if (phase === "over") this.music.stop(0.6);
    else if (phase === "paused") this.music.setActive(false);
    else if (phase === "ready" && prev !== "paused") this.music.start(0.2);
    else this.music.setActive(true);
  }

  handle(events: readonly GameEvent[]) {
    this.play(cuesFor(events));
  }

  play(cues: readonly Cue[]) {
    const { ctx, sfxBus } = this;
    if (!this.sfxEnabled || !ctx || !sfxBus || cues.length === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      this.noise ??= makeNoiseBuffer(ctx, 0.6);
      const now = ctx.currentTime;
      for (const { cue, value } of cues) {
        if (now - (this.lastPlayed.get(cue) ?? -Infinity) < (MIN_REPEAT[cue] ?? 0)) continue;
        this.voices.stopChannel(CUE_CHANNEL[cue], now);
        scheduleCue(cue, { ctx, out: sfxBus, voices: this.voices, noise: this.noise }, now, value);
        this.lastPlayed.set(cue, now);
        if (cue === "pop" || cue === "chainEnd" || cue === "timeUp" || cue === "topout") this.music.duck(0.5, 0.25);
      }
    } catch {
      // 재생 실패는 조용히 무시한다
    }
  }

  // 테스트·디버깅용
  get context() {
    return this.ctx;
  }
  get musicPlaying() {
    return this.music.isPlaying;
  }
  get musicTension() {
    return this.music.tensionOn;
  }
  get liveVoices() {
    return this.voices.size;
  }

  dispose() {
    this.music.dispose();
    if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
    this.sfxBus?.disconnect();
    if (this.ctx) closeAudioContext(this.ctx);
    this.ctx = null;
    this.sfxBus = null;
    this.noise = null;
  }
}
