import { parseEighthNotes, type LoopNote, type LoopSpec } from "@/lib/audio/loopPlayer";
import { noteToFreq } from "@/lib/audio/synth";

/*
 * Bubble Pop Adventure 배경음악 두 곡. 이 게임을 위해 새로 쓴 16마디 칩튠 루프다(기존 게임 음악을 옮기거나 편곡하지 않음).
 *
 * Starlight Hop (스테이지 1~4): 148 BPM, 사장조. 뛰어오르는 아르페지오 멜로디와 통통 튀는 베이스.
 *   G Em C D | G Em Am D | C D Bm Em | C D G G
 * Midnight Chime (보스): 160 BPM, 라단조. 종소리 같은 높은 아르페지오와 8분음표 펄스 베이스로 긴장감.
 *   Dm Dm A# C | Dm Dm A A | Gm C F A | A# C Dm A
 * (A#은 B♭. noteToFreq가 샤프 표기만 받는다)
 */

type ChordNotes = { root: string; fifth: string; arp: [string, string, string] };

const CHORDS: Record<string, ChordNotes> = {
  G: { root: "G2", fifth: "D3", arp: ["G4", "B4", "D5"] },
  Em: { root: "E2", fifth: "B2", arp: ["E4", "G4", "B4"] },
  C: { root: "C3", fifth: "G3", arp: ["C5", "E5", "G5"] },
  D: { root: "D3", fifth: "A3", arp: ["D5", "F#5", "A5"] },
  Am: { root: "A2", fifth: "E3", arp: ["A4", "C5", "E5"] },
  Bm: { root: "B2", fifth: "F#3", arp: ["B4", "D5", "F#5"] },
  Dm: { root: "D3", fifth: "A3", arp: ["D5", "F5", "A5"] },
  "A#": { root: "A#2", fifth: "F3", arp: ["A#4", "D5", "F5"] },
  A: { root: "A2", fifth: "E3", arp: ["A4", "C#5", "E5"] },
  Gm: { root: "G2", fifth: "D3", arp: ["G4", "A#4", "D5"] },
  F: { root: "F2", fifth: "C3", arp: ["F4", "A4", "C5"] },
};

const HOP_MELODY = [
  "D5 . G5 B5 D6 . B5 G5",
  "E5 . G5 B5 E6 - D6 B5",
  "C6 . G5 E5 C5 . E5 G5",
  "A5 - F#5 . D5 E5 F#5 A5",
  "B5 . B5 A5 G5 . D5 .",
  "E5 G5 B5 . G5 . E5 .",
  "A5 . C6 . E6 D6 C6 A5",
  "D6 - - . A5 B5 C6 .",
  "E6 . D6 C6 G5 . C6 .",
  "F#6 . E6 D6 A5 . D6 .",
  "D6 . B5 F#5 D5 . F#5 B5",
  "G5 - E5 . B4 . E5 G5",
  "C6 B5 A5 G5 E5 . G5 .",
  "A5 B5 C6 D6 E6 . F#6 .",
  "G6 . D6 . B5 . G5 .",
  "D5 G5 B5 D6 G6 - . .",
];
const HOP_CHORDS = ["G", "Em", "C", "D", "G", "Em", "Am", "D", "C", "D", "Bm", "Em", "C", "D", "G", "G"];

const CHIME_MELODY = [
  "D5 . F5 A5 D6 . A5 F5",
  "E5 F5 A5 . D6 . C6 A5",
  "A#5 . F5 D5 A#4 . D5 F5",
  "C6 - G5 . E5 G5 C6 .",
  "A5 . D6 . A5 . F5 .",
  "D6 E6 F6 E6 D6 . A5 .",
  "C#6 . A5 . E5 . A5 .",
  "C#6 - E6 - A6 - . .",
  "G5 A#5 D6 A#5 G5 . D5 .",
  "E5 G5 C6 G5 E5 . C5 .",
  "F5 A5 C6 A5 F5 . C6 .",
  "E6 . C#6 . A5 - . .",
  "D6 . A#5 F5 D5 . F5 A#5",
  "E6 . C6 G5 E5 . G5 C6",
  "F6 . D6 . A5 F5 D5 .",
  "C#5 - E5 - A5 - . .",
];
const CHIME_CHORDS = ["Dm", "Dm", "A#", "C", "Dm", "Dm", "A", "A", "Gm", "C", "F", "A", "A#", "C", "Dm", "A"];

function buildScore(melody: string[], chords: string[], style: "hop" | "chime"): LoopNote[][] {
  const score = parseEighthNotes(melody, "lead", noteToFreq);
  chords.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    const root = noteToFreq(chord.root);
    const fifth = noteToFreq(chord.fifth);
    if (style === "hop") {
      // 통통 튀는 베이스: 근음 · 옥타브 · 5음 · 옥타브 (엇박 강조)
      [root, root * 2, fifth, root * 2].forEach((freq, i) => score[base + i * 4].push({ part: "bass", freq, steps: i % 2 ? 1.5 : 2.5 }));
      // 방울이 톡톡 터지는 듯한 높은 아르페지오 (8분음표 엇박)
      for (let s = 2; s < 16; s += 4) score[base + s].push({ part: "arp", freq: noteToFreq(chord.arp[(s >> 2) % 3]) * 2, steps: 1 });
      score[base].push({ part: "kick", freq: 0, steps: 0.5 });
      score[base + 6].push({ part: "kick", freq: 0, steps: 0.5 });
      score[base + 8].push({ part: "kick", freq: 0, steps: 0.5 });
      score[base + 4].push({ part: "snare", freq: 0, steps: 0.6 });
      score[base + 12].push({ part: "snare", freq: 0, steps: 0.6 });
      for (let s = 0; s < 16; s += 2) score[base + s].push({ part: "hat", freq: 0, steps: 0.25 });
    } else {
      // 8분음표 펄스 베이스 + 종소리 같은 16분 아르페지오
      for (let s = 0; s < 16; s += 2) score[base + s].push({ part: "bass", freq: s % 8 === 6 ? fifth : root, steps: 1.5 });
      for (let s = 0; s < 16; s++) score[base + s].push({ part: "arp", freq: noteToFreq(chord.arp[(s * 2) % 3]) * 2, steps: 0.5 });
      for (let s = 0; s < 16; s += 4) score[base + s].push({ part: "kick", freq: 0, steps: 0.5 });
      score[base + 4].push({ part: "snare", freq: 0, steps: 0.6 });
      score[base + 12].push({ part: "snare", freq: 0, steps: 0.6 });
      score[base + 14].push({ part: "snare", freq: 0, steps: 0.4 });
      for (let s = 1; s < 16; s += 2) score[base + s].push({ part: "hat", freq: 0, steps: 0.2 });
    }
  });
  return score;
}

export const HOP_LOOP: LoopSpec = {
  score: buildScore(HOP_MELODY, HOP_CHORDS, "hop"),
  parts: {
    lead: { wave: "square", volume: 0.17 },
    bass: { wave: "triangle", volume: 0.42 },
    arp: { wave: "triangle", volume: 0.1 },
    kick: { wave: "noise", volume: 0.12, filter: "lowpass", cutoff: 220 },
    snare: { wave: "noise", volume: 0.08, filter: "bandpass", cutoff: 2200 },
    hat: { wave: "noise", volume: 0.035, filter: "highpass", cutoff: 7800 },
  },
  baseBpm: 148,
  maxBpm: 160,
};

export const CHIME_LOOP: LoopSpec = {
  score: buildScore(CHIME_MELODY, CHIME_CHORDS, "chime"),
  parts: {
    lead: { wave: "square", volume: 0.16 },
    bass: { wave: "triangle", volume: 0.44 },
    arp: { wave: "triangle", volume: 0.06 },
    kick: { wave: "noise", volume: 0.13, filter: "lowpass", cutoff: 200 },
    snare: { wave: "noise", volume: 0.1, filter: "bandpass", cutoff: 1800 },
    hat: { wave: "noise", volume: 0.035, filter: "highpass", cutoff: 8000 },
  },
  baseBpm: 160,
  maxBpm: 160,
};

/** 스테이지 번호에 따른 템포 (스테이지마다 +3 BPM) */
export function hopTempo(stageIndex: number) {
  return Math.min(148 + stageIndex * 3, 160);
}
