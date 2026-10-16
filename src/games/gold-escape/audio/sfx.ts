import { noteToFreq, scheduleNoise, scheduleTone, type VoiceTracker } from "@/lib/audio/synth";
import type { SoundCue } from "./cues";

/*
 * Gold Escape 효과음 정의. 모두 이 게임을 위해 새로 만든 짧은 합성음이다.
 * 각 함수는 start초에 소리를 예약하고 그 길이(초)를 돌려준다. 같은 채널의 다음 소리는 그 뒤에 이어진다.
 */

/** 파형별 기준 음량 (사각파는 같은 음량에서 더 크게 들리므로 낮춘다) */
const SQUARE = 0.2;
const TRIANGLE = 0.5;
const NOISE = 0.22;

/** 같은 채널끼리는 새 소리가 이전 소리를 끊는다(연속 재생 시 소리가 쌓이지 않음). */
export const CUE_CHANNEL: Record<SoundCue, string> = {
  start: "ui",
  pause: "ui",
  resume: "ui",
  gold: "gold",
  allGold: "gold",
  dig: "dig",
  holeClose: "hole",
  trapped: "guard",
  escape: "guard",
  death: "end",
  stageClear: "end",
  gameOver: "end",
};

export interface SfxContext {
  ctx: BaseAudioContext;
  out: AudioNode;
  voices: VoiceTracker;
  noise: AudioBuffer;
}

const n = noteToFreq;

export function scheduleCue(cue: SoundCue, sfx: SfxContext, start: number): number {
  const channel = CUE_CHANNEL[cue];
  const tone = (type: OscillatorType, from: number, at: number, length: number, to?: number, volume?: number) =>
    scheduleTone(sfx.ctx, sfx.out, sfx.voices, {
      type,
      from,
      to,
      start: start + at,
      length,
      volume: volume ?? (type === "square" ? SQUARE : TRIANGLE),
      channel,
    });
  const noise = (at: number, length: number, filter: BiquadFilterType, cutoff: number, volume = NOISE) =>
    scheduleNoise(sfx.ctx, sfx.out, sfx.voices, { buffer: sfx.noise, start: start + at, length, volume, filter, cutoff, channel });

  switch (cue) {
    case "start":
      // 4음 상승 (약 0.6초)
      tone("square", n("A4"), 0, 0.11);
      tone("square", n("C5"), 0.13, 0.11);
      tone("square", n("E5"), 0.26, 0.11);
      tone("square", n("A5"), 0.39, 0.21);
      return 0.6;
    case "gold":
      // 반짝이는 두 음 상승 (약 0.25초)
      tone("square", n("E6"), 0, 0.07, undefined, SQUARE * 0.9);
      tone("square", n("A6"), 0.07, 0.17, undefined, SQUARE * 0.9);
      return 0.24;
    case "allGold":
      // 장조 팡파르 4음 + 받침 (약 0.8초). 금괴 효과음 뒤에 이어진다.
      tone("square", n("A5"), 0, 0.1);
      tone("square", n("C#6"), 0.11, 0.1);
      tone("square", n("E6"), 0.22, 0.1);
      tone("square", n("A6"), 0.33, 0.45);
      tone("triangle", n("A4"), 0.33, 0.45);
      return 0.8;
    case "dig":
      // 둔탁한 전자 퍼커션 (약 0.14초)
      tone("triangle", 190, 0, 0.12, 70);
      noise(0, 0.08, "bandpass", 900, NOISE * 0.8);
      return 0.14;
    case "holeClose":
      // 낮고 짧은 "둑" (약 0.15초)
      tone("triangle", 150, 0, 0.13, 85);
      noise(0, 0.05, "lowpass", 600, NOISE * 0.7);
      return 0.15;
    case "trapped":
      // 코믹한 두 단계 하강 (약 0.3초)
      tone("square", 660, 0, 0.12, 440, SQUARE * 0.8);
      tone("square", 440, 0.13, 0.17, 220, SQUARE * 0.8);
      return 0.3;
    case "escape":
      // 짧은 상승 경고음 두 번 (약 0.2초)
      tone("square", 520, 0, 0.08, 780, SQUARE * 0.8);
      tone("square", 620, 0.1, 0.1, 930, SQUARE * 0.8);
      return 0.2;
    case "death":
      // 낮게 빠르게 떨어지는 소리 (약 0.5초)
      tone("triangle", 620, 0, 0.5, 60);
      tone("square", 310, 0, 0.45, 40, SQUARE * 0.5);
      return 0.5;
    case "stageClear":
      // 승리 멜로디 (약 1.4초)
      tone("square", n("E5"), 0, 0.09);
      tone("square", n("A5"), 0.1, 0.09);
      tone("square", n("C#6"), 0.2, 0.09);
      tone("square", n("E6"), 0.3, 0.16);
      tone("square", n("C#6"), 0.52, 0.11);
      tone("square", n("E6"), 0.65, 0.11);
      tone("square", n("A6"), 0.8, 0.55);
      tone("triangle", n("E3"), 0, 0.3);
      tone("triangle", n("A3"), 0.8, 0.55);
      return 1.4;
    case "gameOver":
      // 5음 하강 (약 1.1초)
      tone("triangle", n("E5"), 0, 0.18);
      tone("triangle", n("C5"), 0.2, 0.18);
      tone("triangle", n("A4"), 0.4, 0.18);
      tone("triangle", n("E4"), 0.6, 0.18);
      tone("triangle", n("A3"), 0.8, 0.32);
      return 1.15;
    case "pause":
      tone("square", 300, 0, 0.1);
      return 0.1;
    case "resume":
      tone("square", 450, 0, 0.1);
      return 0.1;
  }
}
