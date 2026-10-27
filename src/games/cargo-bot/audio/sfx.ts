import { noteToFreq, scheduleNoise, scheduleTone, type VoiceTracker } from "@/lib/audio/synth";

/*
 * Cargo Bot 효과음. 모두 이 게임을 위해 새로 만든 짧은 합성음이다(기존 게임 효과음을 흉내 내지 않음).
 * 각 함수는 start초에 소리를 예약하고 길이(초)를 돌려준다. 같은 채널의 새 소리는 이전 소리를 끊는다.
 */

export type SoundCue =
  | "ui"
  | "move"
  | "push"
  | "blocked"
  | "lamp"
  | "undo"
  | "redo"
  | "restart"
  | "conveyor"
  | "ice"
  | "teleport"
  | "warn"
  | "hint"
  | "stageClear"
  | "gameClear";

export const CUE_CHANNEL: Record<SoundCue, string> = {
  ui: "ui",
  move: "step",
  push: "box",
  blocked: "step",
  lamp: "lamp",
  undo: "ui",
  redo: "ui",
  restart: "ui",
  conveyor: "fx",
  ice: "fx",
  teleport: "fx",
  warn: "warn",
  hint: "ui",
  stageClear: "end",
  gameClear: "end",
};

export interface SfxContext {
  ctx: BaseAudioContext;
  out: AudioNode;
  voices: VoiceTracker;
  noise: AudioBuffer;
}

const n = noteToFreq;
const SQ = 0.16;
const TRI = 0.45;
const NOISE = 0.2;

export function scheduleCue(cue: SoundCue, sfx: SfxContext, start: number, length = 1): number {
  const channel = CUE_CHANNEL[cue];
  const tone = (type: OscillatorType, from: number, at: number, len: number, to?: number, volume?: number) =>
    scheduleTone(sfx.ctx, sfx.out, sfx.voices, { type, from, to, start: start + at, length: len, volume: volume ?? (type === "square" ? SQ : TRI), channel });
  const noise = (at: number, len: number, filter: BiquadFilterType, cutoff: number, volume = NOISE) =>
    scheduleNoise(sfx.ctx, sfx.out, sfx.voices, { buffer: sfx.noise, start: start + at, length: len, volume, filter, cutoff, channel });

  switch (cue) {
    case "ui":
      tone("square", n("E5"), 0, 0.05, undefined, SQ * 0.6);
      return 0.05;
    case "move":
      // 무한궤도가 한 칸 굴러가는 짧은 딸깍
      noise(0, 0.03, "bandpass", 1800, NOISE * 0.35);
      tone("triangle", 220, 0, 0.03, 180, TRI * 0.3);
      return 0.04;
    case "push":
      // 묵직한 상자 끌림
      noise(0, 0.09, "lowpass", 700, NOISE * 0.9);
      tone("square", 110, 0, 0.08, 90, SQ * 0.7);
      return 0.09;
    case "blocked":
      tone("square", 98, 0, 0.07, 82, SQ * 0.55);
      return 0.08;
    case "lamp":
      // 배송 완료: 녹색 등이 켜지는 두 음
      tone("triangle", n("E5"), 0, 0.08);
      tone("triangle", n("B5"), 0.07, 0.16);
      tone("square", n("E6"), 0.07, 0.1, undefined, SQ * 0.35);
      return 0.24;
    case "undo":
      tone("triangle", n("A4"), 0, 0.05, n("E4"), TRI * 0.6);
      return 0.06;
    case "redo":
      tone("triangle", n("E4"), 0, 0.05, n("A4"), TRI * 0.6);
      return 0.06;
    case "restart":
      ["C5", "G4", "C4"].forEach((note, i) => tone("triangle", n(note), i * 0.05, 0.05, undefined, TRI * 0.6));
      return 0.16;
    case "conveyor": {
      // 벨트 모터 윙 (지나간 칸 수만큼 길게)
      const len = Math.min(0.5, 0.06 * length + 0.08);
      tone("square", 70, 0, len, 74, SQ * 0.35);
      noise(0, len, "bandpass", 500, NOISE * 0.3);
      return len;
    }
    case "ice": {
      const len = Math.min(0.5, 0.05 * length + 0.1);
      noise(0, len, "highpass", 5000, NOISE * 0.35);
      tone("triangle", 900, 0, len, 600, TRI * 0.2);
      return len;
    }
    case "teleport":
      tone("square", 300, 0, 0.12, 1500, SQ * 0.5);
      tone("triangle", 1500, 0.12, 0.12, 400, TRI * 0.5);
      return 0.24;
    case "warn":
      tone("square", n("A3"), 0, 0.1, undefined, SQ * 0.5);
      tone("square", n("F3"), 0.12, 0.14, undefined, SQ * 0.5);
      return 0.26;
    case "hint":
      tone("triangle", n("G5"), 0, 0.06);
      tone("triangle", n("D6"), 0.06, 0.1);
      return 0.16;
    case "stageClear":
      ["C5", "E5", "G5", "C6"].forEach((note, i) => tone("square", n(note), i * 0.1, 0.1, undefined, SQ * 0.8));
      tone("triangle", n("C4"), 0.4, 0.5);
      tone("triangle", n("G5"), 0.4, 0.5, undefined, TRI * 0.5);
      return 0.9;
    case "gameClear":
      ["C5", "D5", "E5", "G5", "E5", "G5", "C6", "E6"].forEach((note, i) => tone("square", n(note), i * 0.12, 0.11, undefined, SQ * 0.8));
      tone("triangle", n("C4"), 0.96, 0.8);
      tone("triangle", n("G4"), 0.96, 0.8, undefined, TRI * 0.6);
      tone("square", n("C6"), 0.96, 0.8, undefined, SQ * 0.5);
      return 1.8;
  }
}
