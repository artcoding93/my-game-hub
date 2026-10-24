import { parseEighthNotes, type LoopNote, type LoopSpec } from "@/lib/audio/loopPlayer";
import { noteToFreq } from "@/lib/audio/synth";

/*
 * Frosty Roll 배경음악 두 곡. 이 게임을 위해 새로 쓴 16마디 칩튠 루프다(기존 게임 음악을 옮기거나 편곡하지 않음).
 *
 * Snowball Parade (스테이지 1~4): 150 BPM, 다장조. 통통 튀는 8분음표 멜로디와 걷는 베이스로 경쾌하게.
 *   C G Am F | C G F G | C Em F G | Am F G C
 * Clockwork Showdown (보스): 160 BPM, 가단조. 시계 초침 같은 16분 하이햇과 낮은 펄스 베이스로 긴장감.
 *   Am Am F G | Am Am E E | F G Em Am | Dm E Am E
 */

type ChordNotes = { root: string; fifth: string; arp: [string, string, string] };

const CHORDS: Record<string, ChordNotes> = {
  C: { root: "C3", fifth: "G3", arp: ["C5", "E5", "G5"] },
  G: { root: "G2", fifth: "D3", arp: ["G4", "B4", "D5"] },
  Am: { root: "A2", fifth: "E3", arp: ["A4", "C5", "E5"] },
  F: { root: "F2", fifth: "C3", arp: ["F4", "A4", "C5"] },
  Em: { root: "E2", fifth: "B2", arp: ["E4", "G4", "B4"] },
  E: { root: "E2", fifth: "B2", arp: ["E4", "G#4", "B4"] },
  Dm: { root: "D3", fifth: "A3", arp: ["D4", "F4", "A4"] },
};

const PARADE_MELODY = [
  "E5 G5 C6 G5 E5 . C5 .",
  "D5 G5 B5 G5 D5 . B4 .",
  "C5 E5 A5 E5 C5 . A4 .",
  "F5 A5 C6 A5 F5 E5 D5 .",
  "E5 . E5 G5 C6 - B5 A5",
  "G5 - D5 . G5 A5 B5 .",
  "A5 . F5 A5 C6 - A5 F5",
  "G5 - - . D5 E5 F5 G5",
  "C6 . G5 . E5 G5 C6 .",
  "B5 . G5 . E5 G5 B5 .",
  "A5 . F5 A5 C6 . A5 .",
  "B5 A5 G5 F5 E5 D5 C5 B4",
  "A4 C5 E5 A5 G5 E5 C5 .",
  "F4 A4 C5 F5 E5 C5 A4 .",
  "G4 B4 D5 G5 F5 D5 B4 G4",
  "C5 - E5 - G5 - C6 .",
];
const PARADE_CHORDS = ["C", "G", "Am", "F", "C", "G", "F", "G", "C", "Em", "F", "G", "Am", "F", "G", "C"];

const SHOWDOWN_MELODY = [
  "A4 . A4 C5 E5 . D5 C5",
  "B4 . A4 B4 C5 . E5 .",
  "F5 . E5 D5 C5 . A4 .",
  "B4 - G4 . B4 D5 G5 .",
  "A5 . E5 . A5 . E5 .",
  "C6 B5 A5 G5 A5 . E5 .",
  "G#5 . E5 . B4 . E5 .",
  "G#5 - B5 - E6 - . .",
  "F5 A5 C6 A5 F5 . C5 .",
  "G5 B5 D6 B5 G5 . D5 .",
  "E5 G5 B5 G5 E5 . B4 .",
  "A5 . C6 . E6 - . .",
  "D6 . A5 F5 D5 . F5 A5",
  "E5 . G#5 B5 E6 . D6 B5",
  "C6 . B5 A5 E5 . C5 A4",
  "B4 - G#4 - E4 - . .",
];
const SHOWDOWN_CHORDS = ["Am", "Am", "F", "G", "Am", "Am", "E", "E", "F", "G", "Em", "Am", "Dm", "E", "Am", "E"];

function buildScore(melody: string[], chords: string[], style: "parade" | "showdown"): LoopNote[][] {
  const score = parseEighthNotes(melody, "lead", noteToFreq);
  chords.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    const root = noteToFreq(chord.root);
    const fifth = noteToFreq(chord.fifth);
    if (style === "parade") {
      // 통통 튀는 베이스: 근음 · 5음 · 옥타브 · 5음
      [root, fifth, root * 2, fifth].forEach((freq, i) => score[base + i * 4].push({ part: "bass", freq, steps: 2.5 }));
      for (let s = 2; s < 16; s += 4) score[base + s].push({ part: "arp", freq: noteToFreq(chord.arp[(s >> 2) % 3]), steps: 1.4 });
      score[base].push({ part: "kick", freq: 0, steps: 0.5 });
      score[base + 8].push({ part: "kick", freq: 0, steps: 0.5 });
      score[base + 4].push({ part: "snare", freq: 0, steps: 0.6 });
      score[base + 12].push({ part: "snare", freq: 0, steps: 0.6 });
      for (let s = 2; s < 16; s += 4) score[base + s].push({ part: "hat", freq: 0, steps: 0.25 });
    } else {
      // 8분음표 펄스 베이스 + 16분 초침 하이햇
      for (let s = 0; s < 16; s += 2) score[base + s].push({ part: "bass", freq: s % 8 === 6 ? fifth : root, steps: 1.5 });
      for (let s = 0; s < 16; s++) score[base + s].push({ part: "arp", freq: noteToFreq(chord.arp[s % 3]), steps: 0.6 });
      for (let s = 0; s < 16; s += 4) score[base + s].push({ part: "kick", freq: 0, steps: 0.5 });
      score[base + 4].push({ part: "snare", freq: 0, steps: 0.6 });
      score[base + 12].push({ part: "snare", freq: 0, steps: 0.6 });
      for (let s = 1; s < 16; s += 2) score[base + s].push({ part: "hat", freq: 0, steps: 0.2 });
    }
  });
  return score;
}

export const PARADE_LOOP: LoopSpec = {
  score: buildScore(PARADE_MELODY, PARADE_CHORDS, "parade"),
  parts: {
    lead: { wave: "square", volume: 0.18 },
    bass: { wave: "triangle", volume: 0.42 },
    arp: { wave: "triangle", volume: 0.12 },
    kick: { wave: "noise", volume: 0.12, filter: "lowpass", cutoff: 220 },
    snare: { wave: "noise", volume: 0.09, filter: "bandpass", cutoff: 2000 },
    hat: { wave: "noise", volume: 0.04, filter: "highpass", cutoff: 7500 },
  },
  baseBpm: 150,
  maxBpm: 162,
};

export const SHOWDOWN_LOOP: LoopSpec = {
  score: buildScore(SHOWDOWN_MELODY, SHOWDOWN_CHORDS, "showdown"),
  parts: {
    lead: { wave: "square", volume: 0.17 },
    bass: { wave: "triangle", volume: 0.44 },
    arp: { wave: "square", volume: 0.035 },
    kick: { wave: "noise", volume: 0.13, filter: "lowpass", cutoff: 200 },
    snare: { wave: "noise", volume: 0.1, filter: "bandpass", cutoff: 1800 },
    hat: { wave: "noise", volume: 0.035, filter: "highpass", cutoff: 8000 },
  },
  baseBpm: 160,
  maxBpm: 160,
};

/** 스테이지 번호에 따른 템포 (스테이지마다 +3 BPM) */
export function paradeTempo(stageIndex: number) {
  return Math.min(150 + stageIndex * 3, 162);
}
