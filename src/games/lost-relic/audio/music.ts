import { parseEighthNotes, type LoopNote, type LoopSpec } from "@/lib/audio/loopPlayer";
import { noteToFreq } from "@/lib/audio/synth";
import type { MusicTrack } from "./cues";

/*
 * Lost Relic 배경음악 3곡. 모두 이 게임을 위해 새로 쓴 칩튠이다(기존 게임 음악의 멜로디·편곡을 옮기거나 샘플링하지 않음).
 *
 * ANCIENT EXPLORATION (100 BPM, 16마디, 약 38초) — 라 단조(D minor)와 도리안 색채의 신비로운 탐험
 *   Dm Dm C Am · B♭ F Gm A · Dm Dm B♭ C · Dm Gm A A
 *   사각파 리드는 긴 음 위주로 쉬어 가며, 삼각파 베이스는 근음-5도를 4분음표로 걷고, 아르페지오는 아주 작게 깔린다.
 *   타악기는 마디 첫 박의 낮은 북과 2·4박의 작은 하이햇만 써서 반복해 들어도 피로하지 않게 했다.
 * HIDDEN DANGER (125 BPM, 8마디, 약 15초) — E 프리지안(반음 위 F 화음)의 긴장감
 *   Em F Em D · Em F G F, 8분음표로 계속 두드리는 낮은 베이스와 16분 하이햇, 짧게 끊는 리드
 * SACRED RELIC (84 BPM, 8마디, 약 23초) — A 장조의 장엄하고 신비로운 분위기
 *   A F#m D E · A C#m D E, 느린 8분 아르페지오와 높은 음역의 반짝이는 종소리, 삼각파 리드
 */

const n = noteToFreq;

type Chord = { root: string; fifth: string; arp: [string, string, string] };

const CHORDS: Record<string, Chord> = {
  Dm: { root: "D2", fifth: "A2", arp: ["D4", "F4", "A4"] },
  C: { root: "C2", fifth: "G2", arp: ["C4", "E4", "G4"] },
  Am: { root: "A2", fifth: "E3", arp: ["A3", "C4", "E4"] },
  Bb: { root: "A#1", fifth: "F2", arp: ["A#3", "D4", "F4"] },
  F: { root: "F2", fifth: "C3", arp: ["F3", "A3", "C4"] },
  Gm: { root: "G2", fifth: "D3", arp: ["G3", "A#3", "D4"] },
  A: { root: "A2", fifth: "E3", arp: ["A3", "C#4", "E4"] },
  Em: { root: "E2", fifth: "B2", arp: ["E4", "G4", "B4"] },
  Fd: { root: "F2", fifth: "C3", arp: ["F4", "A4", "C5"] },
  D: { root: "D2", fifth: "A2", arp: ["D4", "F#4", "A4"] },
  G: { root: "G2", fifth: "D3", arp: ["G4", "B4", "D5"] },
  AM: { root: "A2", fifth: "E3", arp: ["A5", "C#6", "E6"] },
  Fsm: { root: "F#2", fifth: "C#3", arp: ["F#5", "A5", "C#6"] },
  DM: { root: "D2", fifth: "A2", arp: ["D5", "F#5", "A5"] },
  EM: { root: "E2", fifth: "B2", arp: ["E5", "G#5", "B5"] },
  Csm: { root: "C#2", fifth: "G#2", arp: ["C#5", "E5", "G#5"] },
};

// ── ANCIENT EXPLORATION ──
const EXPLORE_MELODY = [
  "D5 - - A4 F5 - E5 D5",
  "E5 - F5 - A4 - - .",
  "G5 - E5 - C5 - D5 E5",
  "E5 - - - A4 - - .",
  "F5 - D5 - A#4 - D5 F5",
  "A5 - G5 F5 C5 - - .",
  "G5 - A#5 - A5 G5 F5 E5",
  "E5 - - - C#5 - - .",
  "A5 - - F5 D5 - E5 F5",
  "G5 - F5 E5 D5 - - .",
  "D5 - F5 - A#5 - A5 G5",
  "G5 - - E5 C5 - - .",
  "F5 - E5 D5 A4 - D5 E5",
  "G5 - - A#4 D5 - G5 F5",
  "E5 - C#5 - A4 - E5 -",
  "C#5 - - - . . . .",
];
const EXPLORE_CHORDS = ["Dm", "Dm", "C", "Am", "Bb", "F", "Gm", "A", "Dm", "Dm", "Bb", "C", "Dm", "Gm", "A", "A"];

function explorationScore(): LoopNote[][] {
  const score = parseEighthNotes(EXPLORE_MELODY, "lead", n);
  EXPLORE_CHORDS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    const root = n(chord.root);
    const fifth = n(chord.fifth);
    // 베이스: 근음-5도-옥타브-5도 4분음표
    [root, fifth, root * 2, fifth].forEach((freq, i) => score[base + i * 4].push({ part: "bass", freq, steps: 3.2 }));
    // 부드러운 아르페지오: 8분음표로 위아래
    [0, 1, 2, 1, 0, 1, 2, 1].forEach((tone, i) => score[base + i * 2].push({ part: "arp", freq: n(chord.arp[tone]), steps: 1.4 }));
    // 절제된 타악기
    score[base].push({ part: "kick", freq: 0, steps: 1 });
    if (bar % 4 === 3) score[base + 10].push({ part: "kick", freq: 0, steps: 1 });
    score[base + 4].push({ part: "hat", freq: 0, steps: 0.3 });
    score[base + 12].push({ part: "hat", freq: 0, steps: 0.3 });
  });
  return score;
}

// ── HIDDEN DANGER ──
const DANGER_MELODY = [
  "E5 . E5 F5 G5 . F5 E5",
  "F5 . A5 . G5 F5 E5 .",
  "B4 . E5 . G5 . B5 A5",
  "A5 - F#5 . D5 . F#5 .",
  "E5 . E5 F5 G5 . A5 B5",
  "C6 . B5 A5 F5 . A5 .",
  "B5 - G5 . D5 . G5 B5",
  "A5 . F5 . E5 - D#5 .",
];
const DANGER_CHORDS = ["Em", "Fd", "Em", "D", "Em", "Fd", "G", "Fd"];

function dangerScore(): LoopNote[][] {
  const score = parseEighthNotes(DANGER_MELODY, "lead", n);
  DANGER_CHORDS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    const root = n(chord.root);
    // 베이스: 근음을 8분음표로 두드리고 마디 끝에 옥타브
    [root, root, root, root, root, root, root * 2, root].forEach((freq, i) => score[base + i * 2].push({ part: "bass", freq, steps: 1.2 }));
    // 화음 찌르기
    for (const s of [2, 6, 10, 14]) score[base + s].push({ part: "arp", freq: n(chord.arp[(s / 2) % 3]), steps: 0.8 });
    // 빠른 리듬: 1·3박과 엇박 킥, 2·4박 스네어, 16분 하이햇
    for (const s of [0, 7, 8]) score[base + s].push({ part: "kick", freq: 0, steps: 0.8 });
    score[base + 4].push({ part: "snare", freq: 0, steps: 0.7 });
    score[base + 12].push({ part: "snare", freq: 0, steps: 0.7 });
    for (let s = 1; s < 16; s += 2) score[base + s].push({ part: "hat", freq: 0, steps: 0.25 });
  });
  return score;
}

// ── SACRED RELIC ──
const RELIC_MELODY = [
  "E5 - - - C#5 - A4 -",
  "F#5 - - - C#5 - - -",
  "A5 - - F#5 D5 - E5 F#5",
  "G#5 - - - E5 - - -",
  "A5 - - - E5 - C#6 -",
  "B5 - - G#5 E5 - - -",
  "F#5 - A5 - D6 - C#6 B5",
  "B5 - - - G#5 - E5 -",
];
const RELIC_CHORDS = ["AM", "Fsm", "DM", "EM", "AM", "Csm", "DM", "EM"];

function relicScore(): LoopNote[][] {
  const score = parseEighthNotes(RELIC_MELODY, "lead", n);
  RELIC_CHORDS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    const root = n(chord.root);
    // 베이스: 마디 첫 박에 길게, 3박에 5도
    score[base].push({ part: "bass", freq: root, steps: 7.5 });
    score[base + 8].push({ part: "bass", freq: n(chord.fifth), steps: 7.5 });
    // 느린 아르페지오 (8분음표, 위로만 올라가며 반짝임)
    [0, 1, 2, 1, 0, 1, 2, 1].forEach((tone, i) => score[base + i * 2].push({ part: "arp", freq: n(chord.arp[tone]), steps: 1.8 }));
    // 높은 종소리: 마디마다 한 번, 화음의 맨 위 음 한 옥타브 위
    score[base + 12].push({ part: "bell", freq: n(chord.arp[2]) * 2, steps: 3 });
    score[base].push({ part: "kick", freq: 0, steps: 1.2 });
  });
  return score;
}

const KICK = { wave: "noise", volume: 0.26, filter: "lowpass", cutoff: 150 } as const;

export const EXPLORATION_LOOP: LoopSpec = {
  score: explorationScore(),
  parts: {
    lead: { wave: "square", volume: 0.15 },
    bass: { wave: "triangle", volume: 0.4 },
    arp: { wave: "square", volume: 0.035 },
    kick: KICK,
    hat: { wave: "noise", volume: 0.03, filter: "highpass", cutoff: 7000 },
  },
  baseBpm: 100,
  maxBpm: 100,
};

export const DANGER_LOOP: LoopSpec = {
  score: dangerScore(),
  parts: {
    lead: { wave: "square", volume: 0.15 },
    bass: { wave: "triangle", volume: 0.45 },
    arp: { wave: "square", volume: 0.05 },
    kick: KICK,
    snare: { wave: "noise", volume: 0.08, filter: "bandpass", cutoff: 1800 },
    hat: { wave: "noise", volume: 0.035, filter: "highpass", cutoff: 7500 },
  },
  baseBpm: 125,
  maxBpm: 125,
};

export const RELIC_LOOP: LoopSpec = {
  score: relicScore(),
  parts: {
    lead: { wave: "triangle", volume: 0.42 },
    bass: { wave: "triangle", volume: 0.3 },
    arp: { wave: "square", volume: 0.04 },
    bell: { wave: "square", volume: 0.04 },
    kick: { ...KICK, volume: 0.18 },
  },
  baseBpm: 84,
  maxBpm: 84,
};

export const LOOPS: Record<MusicTrack, LoopSpec> = {
  exploration: EXPLORATION_LOOP,
  danger: DANGER_LOOP,
  relic: RELIC_LOOP,
};
