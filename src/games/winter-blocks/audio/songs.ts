import { noteToFreq } from "@/lib/audio/synth";
import type { Instrument } from "./instruments";

/*
 * Winter Blocks 배경음악 3곡. 모두 이 게임을 위해 새로 쓴 곡이다(기존 캐롤·게임 음악의 멜로디·편곡을 옮기거나 녹음을 쓰지 않음).
 * 악보는 마디마다 8칸(8분음표): 음 이름, "-" = 앞 음 이어서, "." = 쉼표. 화성은 마디마다 코드 이름 하나.
 *
 * 1. SNOWY NIGHT (95 BPM, F장조, 16마디, 약 40초)
 *    F C Dm B♭ · F Gm C C · Dm Am B♭ F · Gm C F F
 *    오르골 멜로디, 부드러운 피치카토 베이스(2분음표), 마디 첫 박의 은은한 종, 낮은 패드. 후반 8마디에 첼레스타 대선율과 셰이커.
 * 2. WINTER FESTIVAL (115 BPM, G장조, 16마디, 약 33초)
 *    G C G D · G Em A D · C G Am D · G C D G
 *    첼레스타+종 멜로디, 8분음표 썰매 종(2·4박 강조), 근음-5도 피치카토 베이스, 따뜻한 패드, 2·4박 브러시.
 * 3. CRYSTAL DREAMS (90 BPM, E단조, 16마디, 약 43초)
 *    Em Cmaj7 Am7 B7 · Em Gmaj7 Cmaj7 D · Em Am C B7 · Em Cmaj7 Am B
 *    오르골 멜로디와 16분음표로 반짝이는 첼레스타 아르페지오, 넓게 펼친 패드, 온음표 베이스, 4마디마다 높은 종.
 */

export type TrackId = "snowyNight" | "winterFestival" | "crystalDreams";

export interface SongNote {
  instrument: Instrument;
  freq: number;
  /** 길이 (16분음표 수) */
  steps: number;
  vel: number;
}

export interface Song {
  id: TrackId;
  title: string;
  bpm: number;
  bars: number;
  /** 16분음표 칸마다 울릴 음 */
  score: SongNote[][];
}

const n = noteToFreq;

/** 코드: 베이스 근음, 5도, 화음 구성음(아래에서 위로) */
const CHORDS: Record<string, { root: string; fifth: string; tones: string[] }> = {
  F: { root: "F2", fifth: "C3", tones: ["F4", "A4", "C5"] },
  C: { root: "C3", fifth: "G2", tones: ["E4", "G4", "C5"] },
  Dm: { root: "D3", fifth: "A2", tones: ["D4", "F4", "A4"] },
  Bb: { root: "A#2", fifth: "F2", tones: ["D4", "F4", "A#4"] },
  Gm: { root: "G2", fifth: "D3", tones: ["D4", "G4", "A#4"] },
  Am: { root: "A2", fifth: "E3", tones: ["C4", "E4", "A4"] },
  G: { root: "G2", fifth: "D3", tones: ["D4", "G4", "B4"] },
  D: { root: "D3", fifth: "A2", tones: ["D4", "F#4", "A4"] },
  Em: { root: "E2", fifth: "B2", tones: ["E4", "G4", "B4"] },
  A: { root: "A2", fifth: "E3", tones: ["C#4", "E4", "A4"] },
  Cmaj7: { root: "C3", fifth: "G2", tones: ["E4", "G4", "B4", "C5"] },
  Am7: { root: "A2", fifth: "E3", tones: ["C4", "E4", "G4", "A4"] },
  B7: { root: "B2", fifth: "F#2", tones: ["D#4", "F#4", "A4", "B4"] },
  Gmaj7: { root: "G2", fifth: "D3", tones: ["D4", "F#4", "G4", "B4"] },
  B: { root: "B2", fifth: "F#2", tones: ["D#4", "F#4", "B4"] },
};

/** 8분음표 악보 → 16분음표 칸 배열 */
export function parseMelody(bars: readonly string[], instrument: Instrument, vel: number): SongNote[][] {
  const score: SongNote[][] = Array.from({ length: bars.length * 16 }, () => []);
  bars.forEach((bar, b) => {
    const tokens = bar.split(" ");
    if (tokens.length !== 8) throw new Error(`Bar ${b + 1} must have 8 slots: "${bar}"`);
    tokens.forEach((token, i) => {
      if (token === "-" || token === ".") return;
      let length = 2;
      for (let j = i + 1; j < 8 && tokens[j] === "-"; j++) length += 2;
      score[b * 16 + i * 2].push({ instrument, freq: n(token), steps: length, vel });
    });
  });
  return score;
}

const at = (score: SongNote[][], step: number, note: SongNote) => score[step].push(note);
const up = (name: string, octaves: number) => n(name) * 2 ** octaves;

// ── 1. SNOWY NIGHT ──
const SNOWY_MELODY = [
  "C5 - A4 - F4 - A4 C5",
  "E5 - D5 C5 G4 - - .",
  "F5 - E5 D5 A4 - D5 -",
  "D5 - C5 A#4 F4 - - .",
  "A4 - C5 - F5 - E5 F5",
  "G5 - F5 D5 A#4 - D5 -",
  "C5 - D5 E5 G5 - E5 -",
  "C5 - - - . . . .",
  "D5 - F5 - A5 - G5 F5",
  "E5 - - C5 A4 - C5 -",
  "D5 - - F5 A#5 - A5 G5",
  "A5 - - - F5 - . .",
  "G5 - A#5 - D6 - C6 A#5",
  "A5 - G5 - E5 - C5 -",
  "F5 - A5 - C6 - A5 -",
  "F5 - - - . . C5 -",
];
const SNOWY_CHORDS = ["F", "C", "Dm", "Bb", "F", "Gm", "C", "C", "Dm", "Am", "Bb", "F", "Gm", "C", "F", "F"];

function snowyNight(): Song {
  const score = parseMelody(SNOWY_MELODY, "musicBox", 0.34);
  SNOWY_CHORDS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    // 부드러운 베이스: 2분음표 근음 → 5도
    at(score, base, { instrument: "pizz", freq: n(chord.root), steps: 8, vel: 0.42 });
    at(score, base + 8, { instrument: "pizz", freq: n(chord.fifth), steps: 8, vel: 0.32 });
    // 낮은 패드 (마디 전체)
    for (const tone of chord.tones) at(score, base, { instrument: "pad", freq: n(tone), steps: 16, vel: 0.035 });
    // 은은한 종: 마디 첫 박, 화음 맨 위 음 한 옥타브 위
    at(score, base, { instrument: "bell", freq: up(chord.tones[chord.tones.length - 1], 1), steps: 16, vel: bar % 2 === 0 ? 0.08 : 0.05 });
    // 후반 8마디: 첼레스타 대선율(4분음표 분산화음)과 셰이커
    if (bar >= 8) {
      [0, 1, 2, 1].forEach((tone, i) => at(score, base + i * 4 + 2, { instrument: "celesta", freq: up(chord.tones[tone], 1), steps: 2, vel: 0.1 }));
      for (let s = 2; s < 16; s += 4) at(score, base + s, { instrument: "shaker", freq: 0, steps: 1, vel: 0.05 });
    }
  });
  return { id: "snowyNight", title: "Snowy Night", bpm: 95, bars: 16, score };
}

// ── 2. WINTER FESTIVAL ──
const FESTIVAL_MELODY = [
  "D5 D5 G5 - G5 A5 B5 G5",
  "E5 - C5 E5 G5 - E5 -",
  "D5 D5 B4 - D5 G5 B5 -",
  "A5 - F#5 - D5 - . .",
  "B5 B5 A5 G5 A5 - B5 -",
  "G5 - E5 - B4 - E5 -",
  "A5 G5 F#5 E5 C#5 - E5 -",
  "D5 - - - F#5 - A5 -",
  "G5 - E5 - C5 - E5 G5",
  "B5 - D6 - B5 - G5 -",
  "C6 - A5 - E5 - A5 C6",
  "B5 - A5 - F#5 - D5 -",
  "G5 A5 B5 G5 D6 - B5 -",
  "C6 B5 A5 G5 E5 - G5 -",
  "F#5 - A5 - D6 - F#5 -",
  "G5 - - - G4 . . .",
];
const FESTIVAL_CHORDS = ["G", "C", "G", "D", "G", "Em", "A", "D", "C", "G", "Am", "D", "G", "C", "D", "G"];

function winterFestival(): Song {
  const score = parseMelody(FESTIVAL_MELODY, "celesta", 0.3);
  // 멜로디를 종으로 살짝 겹쳐 밝게
  parseMelody(FESTIVAL_MELODY, "bell", 0.07).forEach((notes, i) => score[i].push(...notes));
  FESTIVAL_CHORDS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    // 경쾌한 베이스: 4분음표 근음-5도
    [chord.root, chord.fifth, chord.root, chord.fifth].forEach((tone, i) =>
      at(score, base + i * 4, { instrument: "pizz", freq: n(tone), steps: 3, vel: i % 2 === 0 ? 0.45 : 0.36 }),
    );
    // 따뜻한 화성: 패드 + 엇박 화음 찌르기(첼레스타)
    for (const tone of chord.tones) at(score, base, { instrument: "pad", freq: n(tone), steps: 16, vel: 0.03 });
    for (const s of [2, 6, 10, 14]) {
      for (const tone of chord.tones) at(score, base + s, { instrument: "celesta", freq: n(tone), steps: 1, vel: 0.04 });
    }
    // 썰매 종: 8분음표, 2·4박 강조
    for (let s = 0; s < 16; s += 2) at(score, base + s, { instrument: "sleigh", freq: 0, steps: 1, vel: s === 4 || s === 12 ? 0.11 : 0.06 });
    // 잔잔한 타악기: 1·3박 킥, 2·4박 브러시
    at(score, base, { instrument: "kick", freq: 0, steps: 1, vel: 0.35 });
    at(score, base + 8, { instrument: "kick", freq: 0, steps: 1, vel: 0.28 });
    at(score, base + 4, { instrument: "brush", freq: 0, steps: 1, vel: 0.08 });
    at(score, base + 12, { instrument: "brush", freq: 0, steps: 1, vel: 0.08 });
  });
  return { id: "winterFestival", title: "Winter Festival", bpm: 115, bars: 16, score };
}

// ── 3. CRYSTAL DREAMS ──
const CRYSTAL_MELODY = [
  "B4 - E5 - G5 - F#5 E5",
  "G5 - - - B5 - - .",
  "A5 - G5 E5 C5 - E5 -",
  "D#5 - F#5 - A5 - - .",
  "G5 - F#5 G5 B5 - E6 -",
  "D6 - - B5 F#5 - - .",
  "E5 - G5 B5 C6 - B5 G5",
  "A5 - - - F#5 - D5 -",
  "E5 - G5 - B5 - G5 -",
  "C6 - B5 - A5 - E5 -",
  "G5 - E5 - C6 - G5 -",
  "F#5 - D#5 - B4 - - .",
  "E6 - D6 B5 G5 - B5 -",
  "C6 - B5 G5 E5 - G5 -",
  "A5 - C6 - E6 - D6 C6",
  "B5 - - - D#5 - F#5 -",
];
const CRYSTAL_CHORDS = ["Em", "Cmaj7", "Am7", "B7", "Em", "Gmaj7", "Cmaj7", "D", "Em", "Am", "C", "B7", "Em", "Cmaj7", "Am", "B"];

function crystalDreams(): Song {
  const score = parseMelody(CRYSTAL_MELODY, "musicBox", 0.3);
  CRYSTAL_CHORDS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    // 온음표 베이스
    at(score, base, { instrument: "pizz", freq: n(chord.root), steps: 16, vel: 0.36 });
    // 넓은 패드
    for (const tone of chord.tones) at(score, base, { instrument: "pad", freq: n(tone), steps: 16, vel: 0.04 });
    // 반짝이는 16분음표 아르페지오: 화음을 두 옥타브 위에서 오르내린다
    const tones = chord.tones.map((t) => up(t, 1));
    const pattern = [...tones, ...tones.slice(1, -1).reverse()];
    for (let s = 0; s < 16; s++) at(score, base + s, { instrument: "celesta", freq: pattern[s % pattern.length], steps: 1, vel: s % 4 === 0 ? 0.07 : 0.045 });
    // 4마디마다 높은 종
    if (bar % 4 === 0) at(score, base, { instrument: "bell", freq: up(chord.tones[0], 2), steps: 16, vel: 0.07 });
  });
  return { id: "crystalDreams", title: "Crystal Dreams", bpm: 90, bars: 16, score };
}

export const SONGS: Record<TrackId, Song> = {
  snowyNight: snowyNight(),
  winterFestival: winterFestival(),
  crystalDreams: crystalDreams(),
};

export const TRACK_IDS: readonly TrackId[] = ["snowyNight", "winterFestival", "crystalDreams"];

export function isTrackId(value: unknown): value is TrackId {
  return typeof value === "string" && (TRACK_IDS as readonly string[]).includes(value);
}
