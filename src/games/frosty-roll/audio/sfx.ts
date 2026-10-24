import { noteToFreq, scheduleNoise, scheduleTone, type VoiceTracker } from "@/lib/audio/synth";

/*
 * Frosty Roll 효과음. 모두 이 게임을 위해 새로 만든 짧은 합성음이다(원작 효과음을 흉내 내지 않음).
 * 각 함수는 start초에 소리를 예약하고 길이(초)를 돌려준다. 같은 채널의 새 소리는 이전 소리를 끊는다.
 */

export type SoundCue =
  | "start"
  | "pause"
  | "resume"
  | "jump"
  | "shoot"
  | "snowHit"
  | "freeze"
  | "tink"
  | "kick"
  | "roll"
  | "bounce"
  | "kill"
  | "chain"
  | "shatter"
  | "crack"
  | "escape"
  | "item"
  | "bonus"
  | "life"
  | "hurt"
  | "shield"
  | "bossTelegraph"
  | "bossThrow"
  | "bossHit"
  | "bossDefeat"
  | "minion"
  | "stageClear"
  | "gameOver"
  | "victory";

export const CUE_CHANNEL: Record<SoundCue, string> = {
  start: "ui",
  pause: "ui",
  resume: "ui",
  jump: "player",
  shoot: "shot",
  snowHit: "hit",
  freeze: "hit",
  tink: "hit",
  kick: "ball",
  roll: "roll",
  bounce: "ball",
  kill: "chain",
  chain: "chain",
  shatter: "shatter",
  crack: "warn",
  escape: "warn",
  item: "item",
  bonus: "item",
  life: "item",
  hurt: "player",
  shield: "player",
  bossTelegraph: "boss",
  bossThrow: "boss",
  bossHit: "boss",
  bossDefeat: "end",
  minion: "warn",
  stageClear: "end",
  gameOver: "end",
  victory: "end",
};

export interface SfxContext {
  ctx: BaseAudioContext;
  out: AudioNode;
  voices: VoiceTracker;
  noise: AudioBuffer;
}

const n = noteToFreq;
const SQ = 0.18;
const TRI = 0.5;
const NOISE = 0.22;

/** 연쇄 음계: 연쇄가 이어질수록 한 음씩 올라간다 (도레미솔라도…) */
const CHAIN_NOTES = ["C5", "D5", "E5", "G5", "A5", "C6", "D6", "E6"];

export function scheduleCue(cue: SoundCue, sfx: SfxContext, start: number, chain = 1): number {
  const channel = CUE_CHANNEL[cue];
  const tone = (type: OscillatorType, from: number, at: number, length: number, to?: number, volume?: number) =>
    scheduleTone(sfx.ctx, sfx.out, sfx.voices, { type, from, to, start: start + at, length, volume: volume ?? (type === "square" ? SQ : TRI), channel });
  const noise = (at: number, length: number, filter: BiquadFilterType, cutoff: number, volume = NOISE) =>
    scheduleNoise(sfx.ctx, sfx.out, sfx.voices, { buffer: sfx.noise, start: start + at, length, volume, filter, cutoff, channel });

  switch (cue) {
    case "start":
      ["C5", "E5", "G5", "C6"].forEach((note, i) => tone("square", n(note), i * 0.09, 0.09));
      return 0.4;
    case "pause":
      tone("square", n("E5"), 0, 0.07);
      tone("square", n("C5"), 0.08, 0.1);
      return 0.2;
    case "resume":
      tone("square", n("C5"), 0, 0.07);
      tone("square", n("E5"), 0.08, 0.1);
      return 0.2;
    case "jump":
      tone("square", 380, 0, 0.12, 760, SQ * 0.6);
      return 0.12;
    case "shoot":
      // 바람 빠지는 듯한 "퓨" + 가벼운 노이즈
      tone("triangle", 1500, 0, 0.08, 700, TRI * 0.5);
      noise(0, 0.06, "highpass", 4000, NOISE * 0.35);
      return 0.08;
    case "snowHit":
      noise(0, 0.08, "bandpass", 2400, NOISE * 0.7);
      tone("triangle", 600 + chain * 140, 0, 0.06, undefined, TRI * 0.5);
      return 0.08;
    case "freeze":
      // 얼어붙는 반짝임: 높은 아르페지오
      ["E6", "G6", "B6", "E7"].forEach((note, i) => tone("triangle", n(note), i * 0.035, 0.08, undefined, TRI * 0.6));
      noise(0, 0.12, "highpass", 6000, NOISE * 0.4);
      return 0.22;
    case "tink":
      tone("square", 1800, 0, 0.05, 1500, SQ * 0.5);
      return 0.05;
    case "kick":
      noise(0, 0.07, "lowpass", 900, NOISE);
      tone("square", 220, 0, 0.1, 110, SQ * 0.8);
      return 0.1;
    case "roll":
      noise(0, 0.07, "lowpass", 420, NOISE * 0.45);
      return 0.07;
    case "bounce":
      tone("triangle", 160, 0, 0.12, 320, TRI);
      noise(0, 0.05, "lowpass", 700, NOISE * 0.6);
      return 0.12;
    case "kill":
    case "chain": {
      // 연쇄 수만큼 음이 올라가고, 2연쇄부터 화음을 겹친다
      const k = Math.min(chain, CHAIN_NOTES.length) - 1;
      tone("square", n(CHAIN_NOTES[k]), 0, 0.09);
      tone("square", n(CHAIN_NOTES[k]) * 1.5, 0.05, 0.12, undefined, SQ * (chain >= 2 ? 0.8 : 0.4));
      if (chain >= 3) tone("triangle", n(CHAIN_NOTES[k]) * 2, 0.1, 0.18, undefined, TRI * 0.5);
      noise(0, 0.05, "bandpass", 3000, NOISE * 0.4);
      return 0.2;
    }
    case "shatter":
      noise(0, 0.22, "lowpass", 1800, NOISE * 0.9);
      tone("triangle", 300, 0, 0.18, 90, TRI * 0.6);
      return 0.22;
    case "crack":
      noise(0, 0.05, "highpass", 3000, NOISE * 0.5);
      tone("square", 900, 0, 0.04, 700, SQ * 0.35);
      return 0.06;
    case "escape":
      tone("square", 300, 0, 0.18, 700, SQ * 0.6);
      noise(0, 0.12, "bandpass", 1500, NOISE * 0.6);
      return 0.18;
    case "item":
      ["A5", "C#6", "E6"].forEach((note, i) => tone("square", n(note), i * 0.05, 0.06, undefined, SQ * 0.7));
      return 0.18;
    case "bonus":
      ["C6", "E6", "G6", "C7", "G6", "C7"].forEach((note, i) => tone("square", n(note), i * 0.045, 0.06, undefined, SQ * 0.7));
      return 0.3;
    case "life":
      ["G5", "C6", "E6", "G6", "C7"].forEach((note, i) => tone("square", n(note), i * 0.07, 0.1, undefined, SQ * 0.8));
      return 0.45;
    case "hurt":
      tone("square", 520, 0, 0.3, 140, SQ);
      noise(0, 0.15, "bandpass", 1200, NOISE * 0.6);
      return 0.3;
    case "shield":
      tone("triangle", n("E6"), 0, 0.1);
      tone("triangle", n("B6"), 0.08, 0.16);
      return 0.24;
    case "bossTelegraph":
      tone("square", n("A3"), 0, 0.12);
      tone("square", n("A3"), 0.18, 0.12);
      return 0.3;
    case "bossThrow":
      tone("triangle", 700, 0, 0.15, 250, TRI * 0.7);
      return 0.15;
    case "bossHit":
      noise(0, 0.25, "lowpass", 1200, NOISE);
      tone("square", 200, 0, 0.28, 60, SQ);
      tone("square", 900, 0.02, 0.12, 400, SQ * 0.6);
      return 0.3;
    case "bossDefeat":
      for (let i = 0; i < 5; i++) noise(i * 0.12, 0.18, "lowpass", 900 + i * 200, NOISE);
      ["C5", "E5", "G5", "C6", "E6", "G6"].forEach((note, i) => tone("square", n(note), 0.6 + i * 0.08, 0.12));
      return 1.2;
    case "minion":
      tone("square", 800, 0, 0.06, 1200, SQ * 0.4);
      tone("square", 1200, 0.07, 0.06, 1600, SQ * 0.4);
      return 0.14;
    case "stageClear":
      ["C5", "E5", "G5", "C6"].forEach((note, i) => tone("square", n(note), i * 0.11, 0.1));
      tone("square", n("B5"), 0.48, 0.1);
      tone("square", n("C6"), 0.6, 0.4);
      tone("triangle", n("C4"), 0.6, 0.4);
      return 1.05;
    case "gameOver":
      ["G4", "E4", "C4"].forEach((note, i) => tone("square", n(note), i * 0.22, 0.2));
      tone("triangle", n("C3"), 0.66, 0.6);
      return 1.3;
    case "victory":
      ["C5", "G4", "C5", "E5", "G5", "E5", "G5", "C6"].forEach((note, i) => tone("square", n(note), i * 0.12, 0.11));
      tone("triangle", n("C4"), 0.96, 0.6);
      tone("square", n("C6"), 0.96, 0.6, undefined, SQ * 0.7);
      return 1.6;
  }
}
