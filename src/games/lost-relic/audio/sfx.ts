import { noteToFreq, scheduleNoise, scheduleTone, type VoiceTracker } from "@/lib/audio/synth";
import type { SoundCue } from "./cues";

/*
 * Lost Relic 효과음 정의. 모두 이 게임을 위해 새로 만든 짧은 합성음이다(외부 음원·샘플 미사용).
 * 각 함수는 start초에 소리를 예약하고 그 길이(초)를 돌려준다. 공용 synth의 엔벨로프로 클릭 노이즈를 막는다.
 */

const SQUARE = 0.18;
const TRIANGLE = 0.45;
const NOISE = 0.2;

/** 같은 채널끼리는 새 소리가 이전 소리를 끊는다(연속 재생 시 소리가 쌓이지 않음). */
export const CUE_CHANNEL: Record<SoundCue, string> = {
  start: "jingle",
  gameClear: "jingle",
  gameOver: "jingle",
  relicFound: "jingle",
  chestOpen: "chest",
  itemFound: "item",
  keyPickup: "item",
  coin: "coin",
  heal: "item",
  doorUnlock: "door",
  doorOpen: "door2",
  secretFound: "secret",
  switchActivate: "switch",
  trapTrigger: "trap",
  playerHit: "hit",
  toolUse: "tool",
  roomTransition: "room",
  denied: "ui",
  thud: "thud",
  pause: "ui",
  resume: "ui",
  menu: "ui",
};

/** 대략적인 길이(초). 테스트와 문서용 */
export const CUE_LENGTH: Record<SoundCue, number> = {
  start: 0.6,
  chestOpen: 0.2,
  itemFound: 0.4,
  keyPickup: 0.25,
  coin: 0.14,
  heal: 0.3,
  doorUnlock: 0.4,
  doorOpen: 0.3,
  secretFound: 0.6,
  switchActivate: 0.2,
  trapTrigger: 0.2,
  playerHit: 0.3,
  toolUse: 0.4,
  relicFound: 1.0,
  roomTransition: 0.12,
  denied: 0.12,
  thud: 0.12,
  gameClear: 2.0,
  gameOver: 1.0,
  pause: 0.08,
  resume: 0.08,
  menu: 0.05,
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
  const melody = (type: OscillatorType, notes: string[], step: number, length: number, volume?: number) =>
    notes.forEach((note, i) => tone(type, n(note), i * step, length, undefined, volume));

  switch (cue) {
    case "start":
      // 밝은 4음 상승 (D 장조 분산화음, 약 0.6초)
      melody("square", ["D5", "F#5", "A5"], 0.12, 0.1);
      tone("square", n("D6"), 0.36, 0.24);
      tone("triangle", n("D4"), 0.36, 0.24);
      return CUE_LENGTH.start;
    case "chestOpen":
      // 나무 뚜껑이 "끼익-탁" 열리는 느낌: 짧은 상승 스윕 + 둔탁한 잡음 (약 0.2초)
      tone("square", 180, 0, 0.12, 420, SQUARE * 0.7);
      noise(0, 0.06, "bandpass", 1200, NOISE * 0.7);
      tone("triangle", 140, 0.12, 0.08, 90);
      return CUE_LENGTH.chestOpen;
    case "itemFound":
      // 반짝이는 3음 상승 (약 0.4초)
      melody("square", ["E6", "G#6"], 0.09, 0.08, SQUARE * 0.8);
      tone("square", n("B6"), 0.18, 0.2, undefined, SQUARE * 0.8);
      tone("triangle", n("E5"), 0.18, 0.2);
      return CUE_LENGTH.itemFound;
    case "keyPickup":
      // 금속성 고음: 짧게 떨리는 두 음 (약 0.25초)
      tone("square", n("A6"), 0, 0.06, undefined, SQUARE * 0.7);
      tone("square", n("E7"), 0.06, 0.06, undefined, SQUARE * 0.6);
      tone("square", n("A6"), 0.12, 0.12, n("A7"), SQUARE * 0.5);
      noise(0, 0.04, "highpass", 6000, NOISE * 0.4);
      return CUE_LENGTH.keyPickup;
    case "coin":
      tone("square", n("B5"), 0, 0.05, undefined, SQUARE * 0.7);
      tone("square", n("E6"), 0.05, 0.09, undefined, SQUARE * 0.7);
      return CUE_LENGTH.coin;
    case "heal":
      melody("triangle", ["C5", "E5", "G5", "C6"], 0.06, 0.08);
      return CUE_LENGTH.heal;
    case "doorUnlock":
      // 기계적인 잠금 해제: 철컥 두 번 + 낮은 회전음 (약 0.4초)
      noise(0, 0.03, "bandpass", 2400, NOISE);
      tone("square", 900, 0, 0.04, 600, SQUARE * 0.6);
      noise(0.14, 0.03, "bandpass", 2000, NOISE);
      tone("square", 700, 0.14, 0.04, 450, SQUARE * 0.6);
      tone("triangle", 160, 0.2, 0.2, 240);
      return CUE_LENGTH.doorUnlock;
    case "doorOpen":
      // 낮고 부드러운 돌문 열림 (약 0.3초)
      tone("triangle", 110, 0, 0.3, 75);
      noise(0, 0.28, "lowpass", 420, NOISE * 0.8);
      return CUE_LENGTH.doorOpen;
    case "secretFound":
      // 신비로운 상승형 멜로디: 온음 음계로 올라간다 (약 0.6초)
      melody("triangle", ["C5", "D5", "E5", "F#5", "G#5"], 0.09, 0.12);
      tone("square", n("A#5"), 0.45, 0.15, undefined, SQUARE * 0.5);
      tone("square", n("C6"), 0.45, 0.15, undefined, SQUARE * 0.35);
      return CUE_LENGTH.secretFound;
    case "switchActivate":
      // 클릭 + 기계 작동음 (약 0.2초)
      noise(0, 0.025, "highpass", 3000, NOISE);
      tone("square", 1200, 0, 0.03, undefined, SQUARE * 0.5);
      tone("square", 220, 0.05, 0.14, 330, SQUARE * 0.6);
      return CUE_LENGTH.switchActivate;
    case "trapTrigger":
      // 짧고 날카로운 경고음 (약 0.2초)
      tone("square", 1600, 0, 0.07, 1100, SQUARE * 0.6);
      tone("square", 1600, 0.1, 0.08, 1100, SQUARE * 0.6);
      return CUE_LENGTH.trapTrigger;
    case "playerHit":
      // 낮은 충돌음 (약 0.3초)
      tone("square", 240, 0, 0.28, 70, SQUARE * 0.9);
      noise(0, 0.14, "lowpass", 1400, NOISE);
      return CUE_LENGTH.playerHit;
    case "toolUse":
      // 폭약 폭발: 낮은 굉음 + 잡음이 서서히 줄어든다 (약 0.4초)
      noise(0, 0.4, "lowpass", 1600, NOISE * 1.6);
      tone("triangle", 160, 0, 0.38, 40);
      tone("square", 90, 0, 0.18, 45, SQUARE * 0.6);
      return CUE_LENGTH.toolUse;
    case "relicFound":
      // 유물 팡파르 (약 1초): 상승 아르페지오 후 긴 화음
      melody("square", ["G5", "B5", "D6"], 0.1, 0.1);
      tone("square", n("G6"), 0.3, 0.65);
      tone("square", n("D6"), 0.3, 0.65, undefined, SQUARE * 0.5);
      tone("triangle", n("G3"), 0.3, 0.65);
      tone("triangle", n("B6"), 0.55, 0.4, undefined, TRIANGLE * 0.4);
      return CUE_LENGTH.relicFound;
    case "roomTransition":
      // 매우 짧고 부드러운 전환음
      tone("triangle", n("A4"), 0, 0.1, n("E5"), TRIANGLE * 0.35);
      return CUE_LENGTH.roomTransition;
    case "denied":
      tone("square", 200, 0, 0.1, 160, SQUARE * 0.45);
      return CUE_LENGTH.denied;
    case "thud":
      tone("triangle", 120, 0, 0.1, 60, TRIANGLE * 0.5);
      noise(0, 0.07, "lowpass", 500, NOISE * 0.5);
      return CUE_LENGTH.thud;
    case "gameClear":
      // 밝은 승리 멜로디 (약 2초)
      melody("square", ["D5", "F#5", "A5", "D6"], 0.12, 0.11);
      tone("square", n("C#6"), 0.6, 0.18);
      tone("square", n("D6"), 0.8, 0.18);
      tone("square", n("E6"), 1.0, 0.18);
      tone("square", n("F#6"), 1.2, 0.75);
      tone("square", n("A5"), 1.2, 0.75, undefined, SQUARE * 0.5);
      tone("triangle", n("D3"), 0, 0.5);
      tone("triangle", n("A3"), 0.6, 0.5);
      tone("triangle", n("D3"), 1.2, 0.75);
      return CUE_LENGTH.gameClear;
    case "gameOver":
      // 하강형 8비트 멜로디 (약 1초)
      melody("triangle", ["A4", "F4", "D4"], 0.2, 0.18);
      tone("triangle", n("C#4"), 0.6, 0.38, n("A3"));
      tone("square", n("A3"), 0.6, 0.38, n("F3"), SQUARE * 0.4);
      return CUE_LENGTH.gameOver;
    case "pause":
      tone("square", 520, 0, 0.07, undefined, SQUARE * 0.6);
      return CUE_LENGTH.pause;
    case "resume":
      tone("square", 780, 0, 0.07, undefined, SQUARE * 0.6);
      return CUE_LENGTH.resume;
    case "menu":
      tone("square", 660, 0, 0.04, undefined, SQUARE * 0.4);
      return CUE_LENGTH.menu;
  }
}
