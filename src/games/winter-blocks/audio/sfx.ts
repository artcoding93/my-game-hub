import { noteToFreq } from "@/lib/audio/synth";
import { playNote, type PlayContext } from "./instruments";
import type { SoundCue } from "./cues";

/*
 * Winter Blocks 효과음. 배경음악과 같은 겨울 악기(오르골·첼레스타·종·썰매 종)와 잡음으로 직접 합성한다.
 * 각 함수는 start초에 소리를 예약한다.
 */

const n = noteToFreq;

function noise(p: PlayContext, t: number, vel: number, type: BiquadFilterType, from: number, to: number, length: number, q = 1) {
  const source = p.ctx.createBufferSource();
  source.buffer = p.noise;
  source.loop = true;
  const filter = p.ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + length);
  const gain = p.ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vel, t + length * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  source.connect(filter).connect(gain).connect(p.out);
  p.voices.add([source], [filter, gain], t, t + length + 0.03);
}

function tone(p: PlayContext, t: number, type: OscillatorType, from: number, to: number, length: number, vel: number) {
  const osc = p.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + length);
  const gain = p.ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vel, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(p.out);
  p.voices.add([osc], [gain], t, t + length + 0.03);
}

export function scheduleCue(cue: SoundCue, p: PlayContext, t: number) {
  const play = (instrument: Parameters<typeof playNote>[1], note: string, at: number, vel: number, length = 0.3) =>
    playNote(p, instrument, t + at, n(note), length, vel);

  switch (cue) {
    case "start":
      // 밝은 4음 오르골 + 종
      ["C5", "E5", "G5", "C6"].forEach((note, i) => play("musicBox", note, i * 0.1, 0.5));
      play("bell", "C6", 0.3, 0.25, 1);
      return;
    case "move":
      // 부드러운 얼음 클릭 (작게)
      tone(p, t, "sine", 2400, 1800, 0.03, 0.08);
      return;
    case "rotate":
      // 맑은 유리 구슬
      tone(p, t, "sine", 1760, 2200, 0.07, 0.16);
      tone(p, t, "sine", 3520, 3700, 0.05, 0.05);
      return;
    case "hold":
      tone(p, t, "triangle", 880, 1320, 0.08, 0.15);
      return;
    case "lock":
      // 눈 뭉치가 착지하는 소리: 둔한 잡음 + 낮은 사인
      noise(p, t, 0.35, "lowpass", 900, 200, 0.12);
      tone(p, t, "sine", 180, 90, 0.1, 0.25);
      return;
    case "hardDrop":
      // 낮고 부드러운 착지음
      tone(p, t, "sine", 140, 55, 0.18, 0.45);
      noise(p, t, 0.3, "lowpass", 700, 150, 0.16);
      return;
    case "bump":
      // 얼음 결정이 생기는 반짝임
      play("celesta", "E6", 0, 0.35);
      play("celesta", "B6", 0.06, 0.3);
      tone(p, t + 0.02, "sine", 5200, 6400, 0.12, 0.04);
      return;
    case "lineClear":
      // 작은 종소리
      play("bell", "G5", 0, 0.4, 1);
      play("celesta", "D6", 0.05, 0.2);
      return;
    case "multiLineClear":
      // 짧은 오르골 멜로디
      ["G5", "B5", "D6", "G6"].forEach((note, i) => play("musicBox", note, i * 0.08, 0.5));
      play("bell", "G5", 0.3, 0.3, 1);
      return;
    case "levelUp":
      // 겨울 축제 팡파르: 종·첼레스타 화음 + 썰매 종
      ["C5", "E5", "G5"].forEach((note, i) => play("celesta", note, i * 0.11, 0.45));
      ["C6", "E6", "G6"].forEach((note) => play("bell", note, 0.36, 0.22, 1.2));
      for (let i = 0; i < 6; i++) playNote(p, "sleigh", t + 0.36 + i * 0.09, 0, 0.1, 0.25);
      return;
    case "iceCreate":
      tone(p, t, "sine", 3000, 4200, 0.15, 0.08);
      play("celesta", "A6", 0.04, 0.2);
      return;
    case "iceCrack":
      // 얼음에 금이 가는 소리: 짧은 고역 잡음 여러 번
      for (let i = 0; i < 4; i++) noise(p, t + i * 0.035 + (i % 2) * 0.01, 0.35, "highpass", 4000, 2500, 0.04);
      tone(p, t, "triangle", 1200, 400, 0.12, 0.12);
      return;
    case "windWarn":
      // 바람 예고: 낮게 깔리는 짧은 바람
      noise(p, t, 0.12, "bandpass", 500, 900, 0.5, 2);
      return;
    case "wind":
      // 짧은 바람 소리: 대역 잡음이 쓸려 간다
      noise(p, t, 0.4, "bandpass", 600, 2400, 0.55, 1.5);
      return;
    case "snowWarn":
      play("celesta", "E6", 0, 0.12);
      play("celesta", "E6", 0.15, 0.1);
      return;
    case "snowfall":
      // 눈 결정이 떨어지는 소리: 내려가는 첼레스타
      ["B6", "G6", "E6"].forEach((note, i) => play("celesta", note, i * 0.07, 0.22));
      return;
    case "gameOver":
      // 느린 오르골 하강 멜로디
      ["E5", "C5", "A4", "F4", "E4"].forEach((note, i) => play("musicBox", note, i * 0.32, 0.45));
      return;
    case "pause":
      play("bell", "E5", 0, 0.25, 0.5);
      return;
    case "resume":
      play("bell", "A5", 0, 0.25, 0.5);
      return;
  }
}
