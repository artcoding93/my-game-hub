import { parseEighthNotes, type LoopNote, type LoopSpec } from "@/lib/audio/loopPlayer";
import { noteToFreq } from "@/lib/audio/synth";

/*
 * Cargo Bot 배경음악 두 곡. 이 게임을 위해 새로 쓴 16마디 칩튠 루프다(기존 게임 음악을 옮기거나 편곡하지 않음).
 * 퍼즐에 집중할 수 있도록 템포를 낮추고, 멜로디에 쉼표를 많이 두며, 타악기는 아주 작게 둔다.
 *
 * Night Shift (스테이지 1~6): 84 BPM, 가단조 느낌의 차분한 창고 야간 근무.
 *   Am F C G | Am F E E | Dm Am F G | Am F E Am
 * Machine Hum (스테이지 7~15): 90 BPM, 라도리안. 기계가 다시 돌아가기 시작하는 낮은 펄스.
 *   Dm Dm C C | A# A# C C | Dm F C G | A# C Dm Dm   (A#은 B♭)
 */

type ChordNotes = { root: string; arp: [string, string, string] };

const CHORDS: Record<string, ChordNotes> = {
  Am: { root: "A2", arp: ["A3", "C4", "E4"] },
  F: { root: "F2", arp: ["F3", "A3", "C4"] },
  C: { root: "C3", arp: ["C4", "E4", "G4"] },
  G: { root: "G2", arp: ["G3", "B3", "D4"] },
  E: { root: "E2", arp: ["E3", "G#3", "B3"] },
  Dm: { root: "D3", arp: ["D4", "F4", "A4"] },
  "A#": { root: "A#2", arp: ["A#3", "D4", "F4"] },
};

const NIGHT_MELODY = [
  "E5 - - . C5 . D5 .",
  "C5 - A4 - . . . .",
  "G4 . C5 . E5 - D5 .",
  "D5 - - - . . . .",
  "E5 - - . A5 . G5 .",
  "F5 - E5 - D5 . . .",
  "E5 . . G#4 B4 - . .",
  "E5 - - - . . . .",
  "D5 - F5 . A5 - G5 .",
  "E5 - - - C5 . . .",
  "C5 . A4 . C5 . F5 .",
  "D5 - - - . . B4 .",
  "C5 - E5 . A5 - G5 .",
  "F5 - - . E5 . D5 .",
  "B4 - G#4 - E4 - . .",
  "A4 - - - . . . .",
];
const NIGHT_CHORDS = ["Am", "F", "C", "G", "Am", "F", "E", "E", "Dm", "Am", "F", "G", "Am", "F", "E", "Am"];

const HUM_MELODY = [
  "D5 . . F5 A5 - . .",
  "G5 - F5 . E5 - . .",
  "E5 . . G5 C6 - . .",
  "A5 - G5 . E5 - . .",
  "F5 . . A#5 D6 - . .",
  "C6 - A#5 . A5 - . .",
  "G5 . . E5 C5 - . .",
  "E5 - - - . . . .",
  "A5 . . F5 D5 - . .",
  "A5 - C6 . A5 - . .",
  "G5 . . E5 C5 - . .",
  "D5 - B4 . G4 - . .",
  "A#4 . D5 . F5 - . .",
  "E5 - G5 . C6 - . .",
  "A5 - - . F5 . E5 .",
  "D5 - - - . . . .",
];
const HUM_CHORDS = ["Dm", "Dm", "C", "C", "A#", "A#", "C", "C", "Dm", "F", "C", "G", "A#", "C", "Dm", "Dm"];

function buildScore(melody: string[], chords: string[], style: "night" | "hum"): LoopNote[][] {
  const score = parseEighthNotes(melody, "lead", noteToFreq);
  chords.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    const root = noteToFreq(chord.root);
    if (style === "night") {
      // 긴 베이스 음과 느린 아르페지오
      score[base].push({ part: "bass", freq: root, steps: 7 });
      score[base + 8].push({ part: "bass", freq: root * 1.5, steps: 6 });
      for (let s = 0; s < 16; s += 4) score[base + s].push({ part: "arp", freq: noteToFreq(chord.arp[(s >> 2) % 3]), steps: 3 });
      score[base + 8].push({ part: "hat", freq: 0, steps: 0.2 });
    } else {
      // 기계 펄스: 8분음표 베이스, 박마다 작은 금속음
      for (let s = 0; s < 16; s += 2) score[base + s].push({ part: "bass", freq: s % 8 === 6 ? root * 1.5 : root, steps: 1.4 });
      for (let s = 2; s < 16; s += 4) score[base + s].push({ part: "arp", freq: noteToFreq(chord.arp[(s >> 2) % 3]) * 2, steps: 1 });
      score[base].push({ part: "kick", freq: 0, steps: 0.4 });
      score[base + 8].push({ part: "kick", freq: 0, steps: 0.4 });
      for (let s = 4; s < 16; s += 8) score[base + s].push({ part: "hat", freq: 0, steps: 0.2 });
    }
  });
  return score;
}

export const NIGHT_LOOP: LoopSpec = {
  score: buildScore(NIGHT_MELODY, NIGHT_CHORDS, "night"),
  parts: {
    lead: { wave: "triangle", volume: 0.2 },
    bass: { wave: "triangle", volume: 0.32 },
    arp: { wave: "square", volume: 0.03 },
    hat: { wave: "noise", volume: 0.02, filter: "highpass", cutoff: 8000 },
  },
  baseBpm: 84,
  maxBpm: 84,
};

export const HUM_LOOP: LoopSpec = {
  score: buildScore(HUM_MELODY, HUM_CHORDS, "hum"),
  parts: {
    lead: { wave: "square", volume: 0.1 },
    bass: { wave: "triangle", volume: 0.34 },
    arp: { wave: "triangle", volume: 0.07 },
    kick: { wave: "noise", volume: 0.06, filter: "lowpass", cutoff: 180 },
    hat: { wave: "noise", volume: 0.02, filter: "highpass", cutoff: 7500 },
  },
  baseBpm: 90,
  maxBpm: 90,
};

/** 스테이지에 맞는 곡: 기본 창고(1~6) / 기계가 돌아가는 구역(7~15) */
export function songFor(stageIndex: number): "night" | "hum" {
  return stageIndex < 6 ? "night" : "hum";
}
