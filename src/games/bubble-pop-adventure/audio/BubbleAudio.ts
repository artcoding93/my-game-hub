import { closeAudioContext, resumeAudioContext } from "@/lib/audio/unlock";
import { LoopPlayer } from "@/lib/audio/loopPlayer";
import { createAudioContext, makeNoiseBuffer, VoiceTracker } from "@/lib/audio/synth";
import type { GameEvent, GameState } from "../types";
import { CHIME_LOOP, HOP_LOOP, hopTempo } from "./music";
import { CUE_CHANNEL, scheduleCue, type SoundCue } from "./sfx";

export const SFX_VOLUME = 0.2;
export const MUSIC_RATIO = 0.32;
/** 같은 효과음을 이보다 짧은 간격으로 반복하지 않는다 */
const MIN_REPEAT: Partial<Record<SoundCue, number>> = { shoot: 0.06, pop: 0.04, fizz: 0.08, spark: 0.05, bonus: 0.05 };
/** 효과음이 날 때 BGM을 잠깐 낮춘다 */
const DUCKING: ReadonlySet<SoundCue> = new Set(["combo", "lucky", "life", "bossHit", "bossDefeat"]);

export interface Cue {
  cue: SoundCue;
  combo?: number;
}

/** 게임 이벤트 → 효과음 (순수 함수: 테스트 가능) */
export function cuesFor(events: readonly GameEvent[]): Cue[] {
  const out: Cue[] = [];
  for (const e of events) {
    switch (e.type) {
      case "jump":
      case "capture":
      case "pop":
      case "fizz":
      case "warn":
      case "escape":
      case "hurt":
      case "spark":
      case "bossTelegraph":
      case "bossShoot":
      case "bossDefeat":
      case "minion":
      case "stageClear":
      case "gameOver":
      case "victory":
        out.push({ cue: e.type });
        break;
      case "shoot":
        out.push({ cue: e.giant ? "giantShoot" : "shoot" });
        break;
      case "bubbleBounce":
        out.push({ cue: "bounce" });
        break;
      case "kill":
        out.push({ cue: e.combo >= 2 ? "combo" : "kill", combo: e.combo });
        break;
      case "item":
        out.push({ cue: e.kind === "candy" || e.kind === "gem" ? "bonus" : e.kind === "lucky" ? "lucky" : e.kind === "freeze" ? "freeze" : "item" });
        break;
      case "extraLife":
        out.push({ cue: "life" });
        break;
      case "shieldBlock":
        out.push({ cue: "shield" });
        break;
      case "bossHit":
        out.push({ cue: "bossHit" });
        break;
    }
  }
  return out;
}

/**
 * Bubble Pop Adventure 사운드: 효과음과 BGM(스테이지 곡·보스 곡)을 하나의 AudioContext에서 각각 켜고 끈다.
 * AudioContext는 사용자 입력 안의 unlock()에서 처음 만든다(자동재생 정책). 둘 다 꺼져 있으면 만들지 않는다.
 */
export class BubbleAudio {
  sfxEnabled: boolean;
  musicEnabled: boolean;
  readonly hop: LoopPlayer;
  readonly chime: LoopPlayer;
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new VoiceTracker();
  private lastPlayed = new Map<SoundCue, number>();
  private current: LoopPlayer | null = null;

  constructor(sfxEnabled: boolean, musicEnabled: boolean) {
    this.sfxEnabled = sfxEnabled;
    this.musicEnabled = musicEnabled;
    this.hop = new LoopPlayer(HOP_LOOP, musicEnabled);
    this.chime = new LoopPlayer(CHIME_LOOP, musicEnabled);
  }

  unlock() {
    if (!this.sfxEnabled && !this.musicEnabled) return;
    if (!this.ctx) {
      this.ctx = createAudioContext();
      if (!this.ctx) return;
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = SFX_VOLUME;
      this.sfxBus.connect(this.ctx.destination);
      this.hop.attach(this.ctx, SFX_VOLUME * MUSIC_RATIO);
      this.chime.attach(this.ctx, SFX_VOLUME * MUSIC_RATIO);
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
    this.hop.setEnabled(enabled);
    this.chime.setEnabled(enabled);
    if (enabled) this.unlock();
  }

  /** 스테이지 곡 시작 (처음부터) */
  startMusic(state: GameState, delay = 0.2) {
    const next = state.stage.music === "boss" ? this.chime : this.hop;
    const other = next === this.hop ? this.chime : this.hop;
    other.stop(0.2);
    if (next === this.hop) next.setTempo(hopTempo(state.stageIndex), true);
    next.start(delay);
    this.current = next;
  }

  setPaused(paused: boolean) {
    this.current?.setActive(!paused);
  }

  stopMusic(fade = 0.4) {
    this.hop.stop(fade);
    this.chime.stop(fade);
    this.current = null;
  }

  /** 매 프레임 호출한다: 이벤트는 상태가 바뀐 순간 한 번만 생기므로 소리도 한 번씩만 난다 */
  handle(events: readonly GameEvent[], state: GameState) {
    for (const e of events) {
      if (e.type === "stageStart") this.startMusic(state, 0.6);
      else if (e.type === "stageClear" || e.type === "gameOver" || e.type === "victory") this.stopMusic(0.25);
      else if (e.type === "bossDefeat") this.stopMusic(0.6);
    }
    this.play(cuesFor(events));
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
    for (const { cue, combo } of playable) {
      const channel = CUE_CHANNEL[cue];
      const offset = offsets.get(channel) ?? 0;
      offsets.set(channel, offset + scheduleCue(cue, { ctx, out: sfxBus, voices: this.voices, noise: this.noise }, now + offset, combo));
      this.lastPlayed.set(cue, now);
      if (DUCKING.has(cue)) this.current?.duck();
    }
  }

  click() {
    this.play([{ cue: "resume" }]);
  }

  dispose() {
    this.hop.dispose();
    this.chime.dispose();
    if (this.ctx) this.voices.stopAll(this.ctx.currentTime);
    this.sfxBus?.disconnect();
    if (this.ctx) closeAudioContext(this.ctx);
    this.ctx = null;
    this.sfxBus = null;
    this.noise = null;
  }
}
