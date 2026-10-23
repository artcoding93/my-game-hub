import { noteToFreq, scheduleNoise, scheduleTone, type VoiceTracker } from "@/lib/audio/synth";
import type { SoundCue } from "./cues";

/* 효과음 합성 (오디오 파일 없음). 공용 synth의 엔벨로프·VoiceTracker를 써서 클릭 노이즈 없이 재생·정리한다. */

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
    case "countdown":
      tone("square", n("A5"), undefined, 0, 0.18, 0.16);
      break;
    case "go":
      tone("square", n("A6"), undefined, 0, 0.4, 0.16);
      tone("triangle", n("A5"), undefined, 0, 0.4, 0.18);
      break;
    case "boost":
      hiss("bandpass", 1200, 0, 0.6, 0.3);
      tone("sawtooth", 180, 620, 0, 0.5, 0.08);
      break;
    case "crash":
      hiss("lowpass", 900, 0, 0.3, 0.45);
      tone("sine", 120, 50, 0, 0.25, 0.4);
      break;
    case "bump":
      tone("sine", 160, 80, 0, 0.12, 0.3);
      hiss("lowpass", 700, 0, 0.08, 0.2);
      break;
    case "itemGet":
      ["E5", "A5", "C#6", "E6"].forEach((note, i) => tone("triangle", n(note), undefined, i * 0.05, 0.1, 0.18));
      break;
    case "itemUse":
      tone("square", n("C6"), n("G6"), 0, 0.12, 0.1);
      hiss("highpass", 3000, 0, 0.12, 0.12);
      break;
    case "hit":
      tone("square", n("E5"), n("A3"), 0, 0.35, 0.14);
      hiss("bandpass", 800, 0, 0.25, 0.25);
      break;
    case "block":
      tone("triangle", n("E6"), n("B6"), 0, 0.2, 0.2);
      tone("sine", n("B6"), undefined, 0.1, 0.2, 0.12);
      break;
    case "lap":
      tone("square", n("E6"), undefined, 0, 0.1, 0.12);
      tone("square", n("A6"), undefined, 0.11, 0.16, 0.12);
      break;
    case "finish":
      ["A5", "C#6", "E6", "A6"].forEach((note, i) => tone("square", n(note), undefined, i * 0.1, i === 3 ? 0.4 : 0.1, 0.12));
      break;
    case "win":
      [
        ["A5", 0, 0.12],
        ["C#6", 0.12, 0.12],
        ["E6", 0.24, 0.12],
        ["A6", 0.36, 0.2],
        ["E6", 0.58, 0.1],
        ["A6", 0.7, 0.6],
      ].forEach(([note, start, length]) => {
        tone("square", n(note as string), undefined, start as number, length as number, 0.12);
        tone("triangle", n(note as string) / 2, undefined, start as number, length as number, 0.16);
      });
      break;
    case "lose":
      ["E5", "C5", "A4"].forEach((note, i) => tone("triangle", n(note), undefined, i * 0.2, 0.22, 0.2));
      break;
    case "wrongWay":
      tone("square", 220, undefined, 0, 0.15, 0.12);
      tone("square", 220, undefined, 0.22, 0.15, 0.12);
      break;
    case "recover":
      tone("sine", 300, 900, 0, 0.3, 0.12);
      break;
    case "brake":
      hiss("bandpass", 3200, 0, 0.25, 0.1);
      break;
    case "click":
      tone("square", n("A5"), undefined, 0, 0.03, 0.06);
      break;
  }
}
