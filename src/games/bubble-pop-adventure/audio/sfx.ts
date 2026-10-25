import { noteToFreq, scheduleNoise, scheduleTone, type VoiceTracker } from "@/lib/audio/synth";

/*
 * Bubble Pop Adventure 효과음. 모두 이 게임을 위해 새로 만든 짧은 합성음이다(원작 효과음을 흉내 내지 않음).
 * 각 함수는 start초에 소리를 예약하고 길이(초)를 돌려준다. 같은 채널의 새 소리는 이전 소리를 끊는다.
 */

export type SoundCue =
  | "start"
  | "pause"
  | "resume"
  | "jump"
  | "shoot"
  | "giantShoot"
  | "capture"
  | "pop"
  | "fizz"
  | "bounce"
  | "kill"
  | "combo"
  | "warn"
  | "escape"
  | "item"
  | "bonus"
  | "lucky"
  | "freeze"
  | "life"
  | "hurt"
  | "shield"
  | "spark"
  | "bossTelegraph"
  | "bossShoot"
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
  giantShoot: "shot",
  capture: "hit",
  pop: "pop",
  fizz: "pop",
  bounce: "player",
  kill: "combo",
  combo: "combo",
  warn: "warn",
  escape: "warn",
  item: "item",
  bonus: "item",
  lucky: "item",
  freeze: "item",
  life: "item",
  hurt: "player",
  shield: "player",
  spark: "spark",
  bossTelegraph: "boss",
  bossShoot: "boss",
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

/** 콤보 음계: 콤보가 이어질수록 한 음씩 올라간다 (펜타토닉) */
const COMBO_NOTES = ["D5", "E5", "G5", "A5", "B5", "D6", "E6", "G6"];

export function scheduleCue(cue: SoundCue, sfx: SfxContext, start: number, combo = 1): number {
  const channel = CUE_CHANNEL[cue];
  const tone = (type: OscillatorType, from: number, at: number, length: number, to?: number, volume?: number) =>
    scheduleTone(sfx.ctx, sfx.out, sfx.voices, { type, from, to, start: start + at, length, volume: volume ?? (type === "square" ? SQ : TRI), channel });
  const noise = (at: number, length: number, filter: BiquadFilterType, cutoff: number, volume = NOISE) =>
    scheduleNoise(sfx.ctx, sfx.out, sfx.voices, { buffer: sfx.noise, start: start + at, length, volume, filter, cutoff, channel });

  switch (cue) {
    case "start":
      ["G4", "D5", "G5", "B5", "D6"].forEach((note, i) => tone("square", n(note), i * 0.07, 0.08));
      return 0.42;
    case "pause":
      tone("triangle", n("A5"), 0, 0.07);
      tone("triangle", n("D5"), 0.08, 0.1);
      return 0.2;
    case "resume":
      tone("triangle", n("D5"), 0, 0.07);
      tone("triangle", n("A5"), 0.08, 0.1);
      return 0.2;
    case "jump":
      tone("square", 420, 0, 0.1, 840, SQ * 0.55);
      return 0.1;
    case "shoot":
      // 입으로 부는 듯한 "뽁": 낮은 음에서 위로 휘는 사인 + 짧은 숨소리
      tone("sine", 320, 0, 0.11, 900, TRI * 0.9);
      noise(0, 0.05, "bandpass", 1800, NOISE * 0.25);
      return 0.11;
    case "giantShoot":
      tone("sine", 200, 0, 0.16, 620, TRI);
      tone("triangle", 400, 0.02, 0.14, 1200, TRI * 0.4);
      return 0.16;
    case "capture":
      // 갇힘: 물방울이 감기는 듯한 떨림
      tone("triangle", n("E5"), 0, 0.05);
      tone("triangle", n("B5"), 0.05, 0.05);
      tone("triangle", n("E6"), 0.1, 0.09, n("G6"));
      return 0.2;
    case "pop":
      tone("sine", 1400, 0, 0.05, 500, TRI * 0.8);
      noise(0, 0.04, "highpass", 3500, NOISE * 0.45);
      return 0.06;
    case "fizz":
      noise(0, 0.08, "highpass", 6000, NOISE * 0.25);
      return 0.08;
    case "bounce":
      tone("sine", 260, 0, 0.14, 700, TRI);
      tone("triangle", 520, 0.03, 0.1, 1200, TRI * 0.35);
      return 0.14;
    case "kill":
    case "combo": {
      // 콤보 수만큼 음이 올라가고, 2콤보부터 화음을 겹친다
      const k = Math.min(combo, COMBO_NOTES.length) - 1;
      tone("sine", 1600, 0, 0.04, 600, TRI * 0.7);
      tone("square", n(COMBO_NOTES[k]), 0.03, 0.09);
      tone("square", n(COMBO_NOTES[k]) * 1.25, 0.08, 0.12, undefined, SQ * (combo >= 2 ? 0.8 : 0.4));
      if (combo >= 3) tone("triangle", n(COMBO_NOTES[k]) * 2, 0.13, 0.18, undefined, TRI * 0.5);
      return 0.25;
    }
    case "warn":
      tone("square", 880, 0, 0.05, undefined, SQ * 0.4);
      tone("square", 880, 0.1, 0.05, undefined, SQ * 0.4);
      return 0.15;
    case "escape":
      tone("square", 260, 0, 0.18, 620, SQ * 0.6);
      noise(0, 0.1, "bandpass", 1500, NOISE * 0.5);
      return 0.18;
    case "item":
      ["D6", "F#6", "A6"].forEach((note, i) => tone("square", n(note), i * 0.05, 0.06, undefined, SQ * 0.7));
      return 0.18;
    case "bonus":
      tone("triangle", n("A6"), 0, 0.05);
      tone("triangle", n("E7"), 0.05, 0.08);
      return 0.13;
    case "lucky":
      ["G5", "B5", "D6", "G6", "B6", "D7"].forEach((note, i) => tone("square", n(note), i * 0.045, 0.07, undefined, SQ * 0.7));
      return 0.35;
    case "freeze":
      // 시간이 멈추는 느낌: 내려가는 반짝임
      ["E7", "B6", "G6", "E6"].forEach((note, i) => tone("triangle", n(note), i * 0.06, 0.1, undefined, TRI * 0.6));
      tone("sine", 600, 0, 0.3, 150, TRI * 0.5);
      return 0.35;
    case "life":
      ["D5", "G5", "B5", "D6", "G6"].forEach((note, i) => tone("square", n(note), i * 0.07, 0.1, undefined, SQ * 0.8));
      return 0.45;
    case "hurt":
      tone("square", 560, 0, 0.3, 150, SQ);
      noise(0, 0.15, "bandpass", 1200, NOISE * 0.6);
      return 0.3;
    case "shield":
      tone("triangle", n("D6"), 0, 0.1);
      tone("triangle", n("A6"), 0.08, 0.16);
      return 0.24;
    case "spark":
      tone("triangle", n("A6"), 0, 0.06, n("E7"), TRI * 0.5);
      return 0.07;
    case "bossTelegraph":
      // 종소리 두 번 (여왕의 차임)
      tone("triangle", n("D4"), 0, 0.22);
      tone("sine", n("D5") * 1.5, 0, 0.18, undefined, TRI * 0.3);
      tone("triangle", n("D4"), 0.28, 0.22);
      return 0.5;
    case "bossShoot":
      ["A5", "F5", "D5"].forEach((note, i) => tone("square", n(note), i * 0.04, 0.06, undefined, SQ * 0.6));
      return 0.15;
    case "bossHit":
      noise(0, 0.22, "lowpass", 1400, NOISE);
      tone("square", 220, 0, 0.26, 70, SQ);
      tone("triangle", n("D6"), 0.02, 0.2, n("A5"), TRI * 0.6);
      return 0.28;
    case "bossDefeat":
      for (let i = 0; i < 5; i++) noise(i * 0.12, 0.18, "lowpass", 900 + i * 200, NOISE);
      ["D5", "F#5", "A5", "D6", "F#6", "A6"].forEach((note, i) => tone("square", n(note), 0.6 + i * 0.08, 0.12));
      return 1.2;
    case "minion":
      tone("square", 700, 0, 0.06, 1000, SQ * 0.4);
      tone("square", 1000, 0.07, 0.06, 1400, SQ * 0.4);
      return 0.14;
    case "stageClear":
      ["G5", "A5", "B5", "D6"].forEach((note, i) => tone("square", n(note), i * 0.1, 0.09));
      tone("square", n("C6"), 0.44, 0.1);
      tone("square", n("D6"), 0.56, 0.42);
      tone("triangle", n("G4"), 0.56, 0.42);
      return 1.0;
    case "gameOver":
      ["D5", "A4", "F4", "D4"].forEach((note, i) => tone("square", n(note), i * 0.2, 0.18));
      tone("triangle", n("D3"), 0.8, 0.6);
      return 1.4;
    case "victory":
      ["G4", "D5", "G5", "B5", "A5", "B5", "D6", "G6"].forEach((note, i) => tone("square", n(note), i * 0.12, 0.11));
      tone("triangle", n("G4"), 0.96, 0.6);
      tone("square", n("G6"), 0.96, 0.6, undefined, SQ * 0.7);
      return 1.6;
  }
}
