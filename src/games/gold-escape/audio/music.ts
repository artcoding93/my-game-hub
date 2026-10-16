import { parseEighthNotes, type LoopNote, type LoopSpec } from "@/lib/audio/loopPlayer";
import { noteToFreq } from "@/lib/audio/synth";

/*
 * Gold Escape 배경음악. 이 게임을 위해 새로 쓴 16마디 칩튠 루프다(기존 게임 음악을 옮기거나 샘플링하지 않음).
 *
 * 110 BPM, 16마디 ≈ 35초. 가 단조(A minor) 펜타토닉 위주에 G#(이끔음)으로 긴장감을 준다.
 *   A (1~8):  Am Am F G | Am Am Dm E   — 탐험하는 느낌의 낮은 음역 멜로디
 *   B (9~16): F G Em Am | F G Dm E     — 한 옥타브 올라가 고조, 마지막 E가 첫 마디 Am으로 돌아간다
 * 파트: 사각파 멜로디 · 삼각파 베이스(8분음표 근음-옥타브 진행) · 삼각파 아르페지오 · 노이즈 하이햇/스네어
 * 긴장 레이어(경비원이 가까울 때만): 16분음표 베이스 펄스 + 16분 하이햇
 */

export const BASE_BPM = 110;
export const MAX_BPM = 135;

const MELODY = [
  "A4 . C5 A4 E5 . D5 C5",
  "A4 . C5 D5 E5 - G5 E5",
  "F5 . E5 C5 A4 . C5 .",
  "D5 - B4 G4 B4 D5 G5 .",
  "A5 . G5 E5 G5 . E5 D5",
  "E5 . C5 A4 C5 D5 E5 .",
  "F5 . E5 D5 A4 . D5 F5",
  "E5 - B4 G#4 B4 . E5 .",
  "C6 . A5 F5 A5 . C6 .",
  "B5 . G5 D5 G5 . B5 .",
  "G5 . E5 B4 E5 G5 B5 .",
  "A5 . E5 C5 E5 . A5 G5",
  "F5 . A5 F5 C5 . F5 A5",
  "G5 . B5 G5 D5 . G5 B5",
  "A5 . F5 D5 F5 A5 D6 .",
  "B5 - G#5 E5 G#5 . B4 .",
];

const CHORDS = ["Am", "Am", "F", "G", "Am", "Am", "Dm", "E", "F", "G", "Em", "Am", "F", "G", "Dm", "E"] as const;
type Chord = (typeof CHORDS)[number];

const CHORD_NOTES: Record<Chord, { root: string; fifth: string; arp: [string, string, string] }> = {
  Am: { root: "A2", fifth: "E3", arp: ["A4", "C5", "E5"] },
  F: { root: "F2", fifth: "C3", arp: ["F4", "A4", "C5"] },
  G: { root: "G2", fifth: "D3", arp: ["G4", "B4", "D5"] },
  Dm: { root: "D3", fifth: "A3", arp: ["D4", "F4", "A4"] },
  E: { root: "E2", fifth: "B2", arp: ["E4", "G#4", "B4"] },
  Em: { root: "E2", fifth: "B2", arp: ["E4", "G4", "B4"] },
};

function buildScore(): LoopNote[][] {
  const score = parseEighthNotes(MELODY, "lead", noteToFreq);
  CHORDS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORD_NOTES[name];
    const root = noteToFreq(chord.root);
    const fifth = noteToFreq(chord.fifth);
    // 베이스: 근음 · 근음 · 옥타브 · 근음 · 5음 · 근음 · 옥타브 · 5음 (규칙적으로 걷는 8분음표)
    [root, root, root * 2, root, fifth, root, root * 2, fifth].forEach((freq, i) =>
      score[base + i * 2].push({ part: "bass", freq, steps: 1.4 }),
    );
    // 아르페지오: 앞 8마디는 8분음표로 가볍게, 뒤 8마디는 16분음표로 촘촘하게
    const arpEvery = bar < 8 ? 2 : 1;
    for (let s = 0; s < 16; s += arpEvery) {
      score[base + s].push({ part: "arp", freq: noteToFreq(chord.arp[(s / arpEvery) % 3]), steps: arpEvery * 0.8 });
    }
    // 퍼커션: 8분 뒷박 하이햇, 2·4박 스네어
    for (let s = 2; s < 16; s += 4) score[base + s].push({ part: "hat", freq: 0, steps: 0.3 });
    score[base + 4].push({ part: "snare", freq: 0, steps: 0.7 });
    score[base + 12].push({ part: "snare", freq: 0, steps: 0.7 });
    // 긴장 레이어: 16분음표 베이스 펄스 + 16분 하이햇
    for (let s = 0; s < 16; s++) {
      score[base + s].push({ part: "pulse", freq: s % 8 === 7 ? fifth * 2 : root * 2, steps: 0.6 });
      if (s % 2 === 1) score[base + s].push({ part: "tick", freq: 0, steps: 0.2 });
    }
  });
  return score;
}

export const GOLD_ESCAPE_LOOP: LoopSpec = {
  score: buildScore(),
  parts: {
    lead: { wave: "square", volume: 0.2 },
    bass: { wave: "triangle", volume: 0.42 },
    arp: { wave: "triangle", volume: 0.1 },
    hat: { wave: "noise", volume: 0.05, filter: "highpass", cutoff: 7000 },
    snare: { wave: "noise", volume: 0.1, filter: "bandpass", cutoff: 1800 },
    pulse: { wave: "triangle", volume: 0.16, layer: "tension" },
    tick: { wave: "noise", volume: 0.035, filter: "highpass", cutoff: 8000, layer: "tension" },
  },
  baseBpm: BASE_BPM,
  maxBpm: MAX_BPM,
};

/**
 * 진행도에 따른 템포. 스테이지마다 +4 BPM, 최대 135 BPM.
 * (음악 템포만 바뀌고 게임 속도·난이도는 그대로다.)
 */
export function tempoForProgress(round: number, stageIndex: number): number {
  const progress = (round - 1) * 3 + stageIndex;
  return Math.min(BASE_BPM + progress * 4, MAX_BPM);
}
