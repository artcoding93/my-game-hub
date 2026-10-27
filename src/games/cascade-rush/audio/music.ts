import { parseEighthNotes, type LoopNote, type LoopSpec } from "@/lib/audio/loopPlayer";
import { noteToFreq } from "@/lib/audio/synth";

/*
 * Cascade Rush 배경음악 "Crystal Rush". 이 게임을 위해 새로 쓴 16마디 아케이드 루프다(기존 게임 음악을 옮기거나 편곡하지 않음).
 * 16-bit 아케이드 느낌: 펄스파 멜로디 + 옥타브를 오가는 8분음표 베이스 + 킥·스네어·하이햇.
 * 낙하 속도 단계가 오르면 템포가 128 → 150 BPM까지 서서히 빨라지고, 긴박한 순간(남은 시간 10초 이하·보드가 거의 가득 참)에는
 * 16분음표 아르페지오와 하이햇이 더해진다(tension 레이어).
 *   Em C D B | Em C D D | Am Em C B | Em C B Em
 */

type ChordNotes = { root: string; arp: [string, string, string] };

const CHORDS: Record<string, ChordNotes> = {
  Em: { root: "E2", arp: ["E4", "G4", "B4"] },
  C: { root: "C2", arp: ["C4", "E4", "G4"] },
  D: { root: "D2", arp: ["D4", "F#4", "A4"] },
  B: { root: "B1", arp: ["B3", "D#4", "F#4"] },
  Am: { root: "A1", arp: ["A3", "C4", "E4"] },
};

const MELODY = [
  "E5 . G5 . B5 - A5 G5",
  "G5 - E5 . C5 . E5 .",
  "F#5 . A5 . D6 - C6 B5",
  "B5 - - . D#5 . F#5 .",
  "E5 . G5 . B5 - E6 .",
  "D6 . C6 . B5 . G5 .",
  "A5 - F#5 . D5 . F#5 A5",
  "A5 - - - . . F#5 G5",
  "A5 . C6 . E6 - D6 C6",
  "B5 - G5 . E5 . G5 .",
  "C6 . B5 . A5 . G5 .",
  "F#5 - D#5 . B4 . D#5 F#5",
  "E5 . B5 . E6 - D6 .",
  "C6 . E6 . G6 - E6 .",
  "D#6 . B5 . F#5 . D#5 .",
  "E5 - - - . . B4 .",
];
const CHORD_BARS = ["Em", "C", "D", "B", "Em", "C", "D", "D", "Am", "Em", "C", "B", "Em", "C", "B", "Em"];

function buildScore(): LoopNote[][] {
  const score = parseEighthNotes(MELODY, "lead", noteToFreq);
  CHORD_BARS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    const root = noteToFreq(chord.root);
    // 옥타브를 오가는 8분음표 베이스
    for (let s = 0; s < 16; s += 2) score[base + s].push({ part: "bass", freq: s % 4 === 0 ? root : root * 2, steps: 1.6 });
    // 드럼: 킥 1·3박(+ 마지막 8분), 스네어 2·4박, 하이햇 8분
    for (const s of [0, 8, 14]) score[base + s].push({ part: "kick", freq: 0, steps: 0.5 });
    for (const s of [4, 12]) score[base + s].push({ part: "snare", freq: 0, steps: 0.7 });
    for (let s = 2; s < 16; s += 4) score[base + s].push({ part: "hat", freq: 0, steps: 0.25 });
    // 화음 받침 (박마다 짧게)
    for (let s = 0; s < 16; s += 4) score[base + s].push({ part: "pad", freq: noteToFreq(chord.arp[(s >> 2) % 3]), steps: 2 });
    // 긴장 레이어: 16분음표 아르페지오와 빠른 하이햇
    for (let s = 0; s < 16; s++) {
      score[base + s].push({ part: "arp", freq: noteToFreq(chord.arp[s % 3]) * 2, steps: 0.8 });
      if (s % 2 === 1) score[base + s].push({ part: "fastHat", freq: 0, steps: 0.2 });
    }
  });
  return score;
}

export const BASE_BPM = 128;
export const MAX_BPM = 150;

export const RUSH_LOOP: LoopSpec = {
  score: buildScore(),
  parts: {
    lead: { wave: "square", volume: 0.11 },
    pad: { wave: "triangle", volume: 0.08 },
    bass: { wave: "triangle", volume: 0.34 },
    kick: { wave: "noise", volume: 0.12, filter: "lowpass", cutoff: 170 },
    snare: { wave: "noise", volume: 0.07, filter: "bandpass", cutoff: 1900 },
    hat: { wave: "noise", volume: 0.025, filter: "highpass", cutoff: 8000 },
    arp: { wave: "square", volume: 0.035, layer: "tension" },
    fastHat: { wave: "noise", volume: 0.02, filter: "highpass", cutoff: 9000, layer: "tension" },
  },
  baseBpm: BASE_BPM,
  maxBpm: MAX_BPM,
};

/** 낙하 속도 단계 → 템포 (1단계 128, 단계마다 +6, 최대 150) */
export function tempoFor(speedLevel: number): number {
  return Math.min(BASE_BPM + (speedLevel - 1) * 6, MAX_BPM);
}
