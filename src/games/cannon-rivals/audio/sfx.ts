import { noteToFreq, scheduleNoise, scheduleTone, type VoiceTracker } from "@/lib/audio/synth";
import type { SoundCue } from "./cues";

/*
 * 효과음 합성 (오디오 파일 없음). 모든 소리는 공용 synth의 엔벨로프·VoiceTracker를 써서
 * 클릭 노이즈 없이 시작·종료되고, 끝나면 연결이 끊긴다.
 */

export interface SfxContext {
  ctx: AudioContext;
  out: AudioNode;
  voices: VoiceTracker;
  noise: AudioBuffer;
}

const n = noteToFreq;

export function scheduleCue(cue: SoundCue, { ctx, out, voices, noise }: SfxContext, at: number) {
  const tone = (type: OscillatorType, from: number, to: number | undefined, start: number, length: number, volume: number) =>
    scheduleTone(ctx, out, voices, { type, from, to, start: at + start, length, volume, channel: cue });
  const hiss = (filter: BiquadFilterType, cutoff: number, start: number, length: number, volume: number) =>
    scheduleNoise(ctx, out, voices, { buffer: noise, filter, cutoff, start: at + start, length, volume, channel: cue });

  switch (cue) {
    case "fire":
      // 포성: 낮은 쿵 + 짧은 파열음
      tone("sine", 140, 45, 0, 0.22, 0.5);
      hiss("lowpass", 1600, 0, 0.16, 0.5);
      tone("square", 220, 90, 0, 0.08, 0.12);
      break;
    case "whistle":
      // 포탄 비행: 높은 음에서 천천히 내려가는 휘파람
      tone("sine", 1400, 520, 0.05, 1.3, 0.05);
      break;
    case "explosion":
      hiss("lowpass", 900, 0, 0.7, 0.6);
      hiss("bandpass", 300, 0.02, 0.5, 0.35);
      tone("sine", 90, 32, 0, 0.5, 0.5);
      break;
    case "hit":
      // 명중: 밝은 두 음
      tone("square", n("E5"), undefined, 0, 0.08, 0.14);
      tone("square", n("B5"), undefined, 0.08, 0.14, 0.14);
      break;
    case "damage":
      // 피해: 내려가는 경고음
      tone("square", n("A4"), n("D4"), 0, 0.28, 0.16);
      hiss("highpass", 2500, 0, 0.1, 0.12);
      break;
    case "barrier":
      tone("triangle", n("C6"), n("G6"), 0, 0.2, 0.18);
      break;
    case "thud":
      tone("sine", 110, 50, 0, 0.25, 0.45);
      hiss("lowpass", 500, 0, 0.18, 0.3);
      break;
    case "fall":
      tone("sawtooth", 600, 80, 0, 0.9, 0.12);
      break;
    case "item":
      ["C5", "E5", "G5", "C6"].forEach((note, i) => tone("triangle", n(note), undefined, i * 0.07, 0.12, 0.2));
      break;
    case "repair":
      ["G4", "C5", "E5"].forEach((note, i) => tone("sine", n(note), undefined, i * 0.09, 0.2, 0.22));
      break;
    case "crate":
      tone("triangle", n("A5"), undefined, 0, 0.12, 0.14);
      tone("triangle", n("E6"), undefined, 0.12, 0.2, 0.12);
      break;
    case "turn":
      tone("sine", n("G5"), undefined, 0, 0.1, 0.12);
      tone("sine", n("D6"), undefined, 0.1, 0.16, 0.1);
      break;
    case "win":
      [
        ["C5", 0, 0.14],
        ["E5", 0.14, 0.14],
        ["G5", 0.28, 0.14],
        ["C6", 0.42, 0.5],
      ].forEach(([note, start, length]) => {
        tone("square", n(note as string), undefined, start as number, length as number, 0.13);
        tone("triangle", n(note as string) / 2, undefined, start as number, length as number, 0.18);
      });
      break;
    case "lose":
      [
        ["G4", 0, 0.22],
        ["E4", 0.22, 0.22],
        ["C4", 0.44, 0.22],
        ["B3", 0.66, 0.6],
      ].forEach(([note, start, length]) => tone("triangle", n(note as string), undefined, start as number, length as number, 0.22));
      break;
    case "click":
      tone("square", n("A5"), undefined, 0, 0.03, 0.06);
      break;
  }
}
