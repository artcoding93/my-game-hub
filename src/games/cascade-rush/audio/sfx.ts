import { noteToFreq, scheduleNoise, scheduleTone, type VoiceTracker } from "@/lib/audio/synth";

/*
 * Cascade Rush 효과음. 모두 이 게임을 위해 새로 만든 짧은 합성음이다(다른 게임의 효과음을 흉내 내지 않음).
 * 연쇄 폭발음은 단계마다 음이 한 칸씩 올라가고(5음 음계), 3연쇄부터 화음·잔향, 5연쇄부터 큰 폭발 노이즈가 더해진다.
 * 각 함수는 start초에 소리를 예약한다. 같은 채널의 새 소리는 이전 소리를 끊는다.
 */

export type SoundCue =
  | "ui"
  | "move"
  | "rotate"
  | "land"
  | "hardDrop"
  | "pop"
  | "chainEnd"
  | "timeBonus"
  | "countdown"
  | "speedUp"
  | "go"
  | "timeUp"
  | "topout";

export const CUE_CHANNEL: Record<SoundCue, string> = {
  ui: "ui",
  move: "move",
  rotate: "rotate",
  land: "land",
  hardDrop: "land",
  pop: "pop",
  chainEnd: "fanfare",
  timeBonus: "bonus",
  countdown: "count",
  speedUp: "fanfare",
  go: "fanfare",
  timeUp: "end",
  topout: "end",
};

export interface SfxContext {
  ctx: BaseAudioContext;
  out: AudioNode;
  voices: VoiceTracker;
  noise: AudioBuffer;
}

const n = noteToFreq;
/** 연쇄 폭발음 음계 (C 장조 5음 음계, 단계마다 한 칸씩 위로) */
const POP_SCALE = ["C5", "D5", "E5", "G5", "A5", "C6", "D6", "E6", "G6", "A6", "C7"].map(n);

/** n연쇄 폭발음의 기본 음높이. 연쇄가 길수록 높다 (테스트 가능한 순수 함수) */
export function popPitch(chain: number): number {
  return POP_SCALE[Math.min(Math.max(chain, 1), POP_SCALE.length) - 1];
}

/** n연쇄 폭발음 세기 0~1 */
export function popIntensity(chain: number): number {
  return Math.min(0.35 + chain * 0.13, 1);
}

export function scheduleCue(cue: SoundCue, sfx: SfxContext, start: number, value = 1) {
  const channel = CUE_CHANNEL[cue];
  const tone = (type: OscillatorType, from: number, at: number, len: number, volume: number, to?: number) =>
    scheduleTone(sfx.ctx, sfx.out, sfx.voices, { type, from, to, start: start + at, length: len, volume, channel });
  const noise = (at: number, len: number, filter: BiquadFilterType, cutoff: number, volume: number) =>
    scheduleNoise(sfx.ctx, sfx.out, sfx.voices, { buffer: sfx.noise, start: start + at, length: len, volume, filter, cutoff, channel });

  switch (cue) {
    case "ui":
      tone("square", n("A5"), 0, 0.05, 0.08);
      return;
    case "move":
      tone("square", n("E5"), 0, 0.025, 0.05);
      return;
    case "rotate":
      tone("square", n("B5"), 0, 0.035, 0.07, n("E6"));
      return;
    case "land":
      tone("triangle", n("C3"), 0, 0.08, 0.4, n("G2"));
      noise(0, 0.04, "lowpass", 900, 0.12);
      return;
    case "hardDrop":
      noise(0, 0.07, "bandpass", 2400, 0.12);
      tone("triangle", n("G3"), 0.03, 0.12, 0.5, n("C2"));
      return;
    case "pop": {
      // value = 연쇄 단계
      const chain = value;
      const base = popPitch(chain);
      const power = popIntensity(chain);
      tone("square", base, 0, 0.09, 0.12 * power, base * 1.5);
      tone("square", base * 2, 0.06, 0.12, 0.08 * power);
      noise(0, 0.12 + chain * 0.03, "highpass", 3000 - Math.min(chain, 5) * 300, 0.1 * power);
      if (chain >= 3) {
        // 화음과 반짝이는 잔향
        tone("triangle", base * 1.25, 0.02, 0.22, 0.25 * power);
        for (let i = 0; i < 3; i++) tone("square", base * 2 * 1.5 ** (i % 2), 0.12 + i * 0.07, 0.06, 0.04 * power);
      }
      if (chain >= 5) {
        // 큰 폭발: 낮은 울림 + 긴 노이즈
        tone("triangle", n("C3"), 0, 0.45, 0.5, n("C2"));
        noise(0.02, 0.5, "lowpass", 1400, 0.18);
      }
      return;
    }
    case "chainEnd": {
      // value = 연쇄 수. 3연쇄 이상만 짧은 축하 아르페지오
      const notes = value >= 5 ? ["C5", "E5", "G5", "C6", "E6", "G6", "C7"] : ["E5", "G5", "C6", "E6"];
      notes.forEach((note, i) => tone("square", n(note), i * 0.055, 0.12, 0.07));
      tone("triangle", n(value >= 5 ? "C4" : "G3"), 0, 0.5, 0.3);
      return;
    }
    case "timeBonus":
      tone("square", n("B5"), 0, 0.08, 0.09);
      tone("square", n("E6"), 0.09, 0.2, 0.09);
      tone("triangle", n("E5"), 0.09, 0.25, 0.25);
      return;
    case "countdown": {
      // value = 남은 초. 3초 이하는 더 높고 두 번
      const urgent = value <= 3;
      tone("square", n(urgent ? "A5" : "E5"), 0, 0.07, 0.1);
      if (urgent) tone("square", n("A5"), 0.1, 0.05, 0.07);
      return;
    }
    case "speedUp":
      ["G4", "C5", "E5", "G5"].forEach((note, i) => tone("square", n(note), i * 0.06, 0.08, 0.07));
      return;
    case "go":
      tone("square", n("C5"), 0, 0.1, 0.08);
      tone("square", n("G5"), 0.12, 0.25, 0.09);
      return;
    case "timeUp":
      ["C6", "G5", "E5", "C5"].forEach((note, i) => tone("square", n(note), i * 0.12, 0.14, 0.09));
      tone("triangle", n("C3"), 0.48, 0.6, 0.35);
      return;
    case "topout":
      noise(0, 0.6, "lowpass", 1200, 0.2);
      tone("square", n("E5"), 0, 0.7, 0.08, n("A2"));
      tone("triangle", n("E3"), 0.1, 0.7, 0.35, n("E2"));
      return;
  }
}
