import { closeAudioContext, resumeAudioContext } from "@/lib/audio/unlock";
import { LoopPlayer } from "@/lib/audio/loopPlayer";
import { createAudioContext, makeNoiseBuffer, VoiceTracker } from "@/lib/audio/synth";
import type { GameEvent, GameState } from "../types";
import { paradeTempo, PARADE_LOOP, SHOWDOWN_LOOP } from "./music";
import { CUE_CHANNEL, scheduleCue, type SoundCue } from "./sfx";

export const SFX_VOLUME = 0.2;
export const MUSIC_RATIO = 0.32;
const ROLL_INTERVAL = 0.11;
/** 같은 효과음을 이보다 짧은 간격으로 반복하지 않는다 */
const MIN_REPEAT: Partial<Record<SoundCue, number>> = { shoot: 0.06, snowHit: 0.04, roll: 0.08, bounce: 0.05, crack: 0.1 };
/** 효과음이 날 때 BGM을 잠깐 낮춘다 */
const DUCKING: ReadonlySet<SoundCue> = new Set(["chain", "bonus", "life", "bossHit", "bossDefeat"]);

export interface Cue {
  cue: SoundCue;
  chain?: number;
}

/** 게임 이벤트 → 효과음 (순수 함수: 테스트 가능) */
export function cuesFor(events: readonly GameEvent[]): Cue[] {
  const out: Cue[] = [];
  for (const e of events) {
    switch (e.type) {
      case "jump":
      case "shoot":
      case "freeze":
      case "tink":
      case "kick":
      case "bounce":
      case "escape":
      case "hurt":
      case "bossTelegraph":
      case "bossThrow":
      case "bossDefeat":
      case "minion":
      case "gameOver":
      case "victory":
        out.push({ cue: e.type });
        break;
      case "snowHit":
        out.push({ cue: "snowHit", chain: e.level });
        break;
      case "kill":
        out.push({ cue: e.chain >= 2 ? "chain" : "kill", chain: e.chain });
        break;
      case "shatter":
        out.push({ cue: "shatter" });
        break;
      case "crack":
        out.push({ cue: "crack" });
        break;
      case "item":
        out.push({ cue: e.kind === "candy" || e.kind === "gem" ? "bonus" : e.kind === "life" ? "life" : "item" });
        break;
      case "shieldBlock":
        out.push({ cue: "shield" });
        break;
      case "bossHit":
        out.push({ cue: "bossHit" });
        break;
      case "stageClear":
        out.push({ cue: "stageClear" });
        break;
    }
  }
  return out;
}

/**
 * Frosty Roll 사운드: 효과음과 BGM(스테이지 곡·보스 곡)을 하나의 AudioContext에서 각각 켜고 끈다.
 * AudioContext는 사용자 입력 안의 unlock()에서 처음 만든다(자동재생 정책). 둘 다 꺼져 있으면 만들지 않는다.
 */
export class FrostyAudio {
  sfxEnabled: boolean;
  musicEnabled: boolean;
  readonly parade: LoopPlayer;
  readonly showdown: LoopPlayer;
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new VoiceTracker();
  private lastPlayed = new Map<SoundCue, number>();
  private lastRoll = 0;
  private current: LoopPlayer | null = null;

  constructor(sfxEnabled: boolean, musicEnabled: boolean) {
    this.sfxEnabled = sfxEnabled;
    this.musicEnabled = musicEnabled;
    this.parade = new LoopPlayer(PARADE_LOOP, musicEnabled);
    this.showdown = new LoopPlayer(SHOWDOWN_LOOP, musicEnabled);
  }

  unlock() {
    if (!this.sfxEnabled && !this.musicEnabled) return;
    if (!this.ctx) {
      this.ctx = createAudioContext();
      if (!this.ctx) return;
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = SFX_VOLUME;
      this.sfxBus.connect(this.ctx.destination);
      this.parade.attach(this.ctx, SFX_VOLUME * MUSIC_RATIO);
      this.showdown.attach(this.ctx, SFX_VOLUME * MUSIC_RATIO);
    }
    resumeAudioContext(this.ctx);
  }

  setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
    if (enabled) this.unlock();
    else if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    this.parade.setEnabled(enabled);
    this.showdown.setEnabled(enabled);
    if (enabled) this.unlock();
  }

  /** 스테이지 곡 시작 (처음부터) */
  startMusic(state: GameState, delay = 0.2) {
    const next = state.stage.music === "boss" ? this.showdown : this.parade;
    const other = next === this.parade ? this.showdown : this.parade;
    other.stop(0.2);
    if (next === this.parade) next.setTempo(paradeTempo(state.stageIndex), true);
    next.start(delay);
    this.current = next;
  }

  setPaused(paused: boolean) {
    this.current?.setActive(!paused);
  }

  stopMusic(fade = 0.4) {
    this.parade.stop(fade);
    this.showdown.stop(fade);
    this.current = null;
  }

  /** 컨트롤러가 매 프레임 호출한다: 이벤트는 상태가 바뀐 순간 한 번만 생기므로 소리도 한 번씩만 난다 */
  handle(events: readonly GameEvent[], state: GameState) {
    for (const e of events) {
      if (e.type === "stageStart") this.startMusic(state, 0.6);
      else if (e.type === "stageClear" || e.type === "gameOver" || e.type === "victory") this.stopMusic(0.25);
      else if (e.type === "bossDefeat") this.stopMusic(0.6);
    }
    const cues = cuesFor(events);
    // 굴러가는 눈덩이: 일정 간격으로 낮은 "드르륵"
    if (state.rollSoundTimer > 0 && state.rollSoundTimer - this.lastRoll >= ROLL_INTERVAL) {
      this.lastRoll = state.rollSoundTimer;
      cues.push({ cue: "roll" });
    } else if (state.rollSoundTimer === 0) this.lastRoll = 0;
    this.play(cues);
  }

  play(cues: readonly Cue[]) {
    const { ctx, sfxBus } = this;
    if (!this.sfxEnabled || !ctx || !sfxBus || cues.length === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    this.noise ??= makeNoiseBuffer(ctx, 0.3);
    const now = ctx.currentTime;
    const playable = cues.filter(({ cue }) => now - (this.lastPlayed.get(cue) ?? -Infinity) >= (MIN_REPEAT[cue] ?? 0));
    for (const channel of new Set(playable.map(({ cue }) => CUE_CHANNEL[cue]))) this.voices.stopChannel(channel, now);
    const offsets = new Map<string, number>();
    for (const { cue, chain } of playable) {
      const channel = CUE_CHANNEL[cue];
      const offset = offsets.get(channel) ?? 0;
      offsets.set(channel, offset + scheduleCue(cue, { ctx, out: sfxBus, voices: this.voices, noise: this.noise }, now + offset, chain));
      this.lastPlayed.set(cue, now);
      if (DUCKING.has(cue)) this.current?.duck();
    }
  }

  click() {
    this.play([{ cue: "resume" }]);
  }

  dispose() {
    this.parade.dispose();
    this.showdown.dispose();
    if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
    this.sfxBus?.disconnect();
    if (this.ctx) closeAudioContext(this.ctx);
    this.ctx = null;
    this.sfxBus = null;
    this.noise = null;
  }
}
