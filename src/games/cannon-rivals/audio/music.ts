import { LoopPlayer, parseEighthNotes, type LoopNote, type LoopSpec } from "@/lib/audio/loopPlayer";
import { noteToFreq } from "@/lib/audio/synth";
import type { FieldId } from "../types";

/*
 * Cannon Rivals 배경음악 3곡. 모두 이 게임을 위해 새로 쓴 16마디 곡이다
 * (기존 게임·영화·민요의 멜로디를 옮기지 않음). 공용 LoopPlayer로 look-ahead 예약 재생한다.
 *
 * Green Hills — "Meadow March" 126 BPM, C장조, 경쾌한 모험
 *   C G Am F · C G F G · Am F C G · F G C C   스퀘어 리드 + 트라이앵글 화음·베이스 + 킥·스네어·8분 하이햇
 * Desert Canyon — "Canyon Drums" 138 BPM, D단조(화성단음계 C#), 리듬감 있는 전투
 *   Dm Dm B♭ C · Dm Gm A A · Dm B♭ Gm A · B♭ C A A   당김음 킥과 탐, 16분 셰이커, 16분 베이스
 * Frozen Ridge — "Icefall" 104 BPM, F#단조, 신비로운 겨울 전투
 *   F#m D Bm C# · F#m D E C# · D E C#m F#m · Bm C# F#m F#m   종소리 같은 사인 리드, 16분 아르페지오, 긴 화음
 */

const n = noteToFreq;

interface Chord {
  root: string;
  fifth: string;
  /** 화음 구성음 (리드보다 아래 음역) */
  tones: [string, string, string];
}

const CHORDS: Record<string, Chord> = {
  C: { root: "C3", fifth: "G3", tones: ["C4", "E4", "G4"] },
  G: { root: "G2", fifth: "D3", tones: ["B3", "D4", "G4"] },
  Am: { root: "A2", fifth: "E3", tones: ["A3", "C4", "E4"] },
  F: { root: "F2", fifth: "C3", tones: ["A3", "C4", "F4"] },
  Dm: { root: "D3", fifth: "A3", tones: ["D4", "F4", "A4"] },
  Bb: { root: "A#2", fifth: "F3", tones: ["A#3", "D4", "F4"] },
  Gm: { root: "G2", fifth: "D3", tones: ["G3", "A#3", "D4"] },
  A: { root: "A2", fifth: "E3", tones: ["A3", "C#4", "E4"] },
  "F#m": { root: "F#2", fifth: "C#3", tones: ["F#4", "A4", "C#5"] },
  D: { root: "D3", fifth: "A3", tones: ["F#4", "A4", "D5"] },
  Bm: { root: "B2", fifth: "F#3", tones: ["F#4", "B4", "D5"] },
  "C#": { root: "C#3", fifth: "G#3", tones: ["F4", "G#4", "C#5"] },
  E: { root: "E2", fifth: "B2", tones: ["G#4", "B4", "E5"] },
  "C#m": { root: "C#3", fifth: "G#3", tones: ["E4", "G#4", "C#5"] },
};

const push = (score: LoopNote[][], step: number, note: LoopNote) => score[step].push(note);

// ── Green Hills: Meadow March ──
const MEADOW_MELODY = [
  "E5 G5 C6 - B5 G5 E5 G5",
  "D5 G5 B5 - A5 G5 D5 .",
  "C5 E5 A5 - G5 E5 C5 E5",
  "F5 . A5 G5 F5 E5 D5 .",
  "E5 G5 C6 - D6 C6 G5 E5",
  "D5 G5 B5 - D6 B5 G5 .",
  "A5 G5 F5 A5 C6 - A5 .",
  "B5 . A5 G5 F5 E5 D5 .",
  "C6 . B5 A5 E5 - A5 .",
  "C6 . A5 F5 C5 - F5 .",
  "E5 F5 G5 - E5 F5 G5 C6",
  "B5 - G5 . D5 - G5 .",
  "A5 . F5 A5 C6 . A5 C6",
  "D6 . B5 D6 G6 - F6 D6",
  "E6 - C6 . G5 . E5 G5",
  "C6 - - . G5 . C5 .",
];
const MEADOW_CHORDS = ["C", "G", "Am", "F", "C", "G", "F", "G", "Am", "F", "C", "G", "F", "G", "C", "C"];

function meadowScore(): LoopNote[][] {
  const score = parseEighthNotes(MEADOW_MELODY, "lead", n);
  MEADOW_CHORDS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    // 화음: 반 마디마다 두 음을 길게 (오프비트 느낌)
    for (const half of [0, 8]) {
      push(score, base + half + 2, { part: "harmony", freq: n(chord.tones[0]), steps: 5 });
      push(score, base + half + 2, { part: "harmony", freq: n(chord.tones[2]), steps: 5 });
    }
    // 베이스: 근음–5음 행진
    [chord.root, chord.fifth, chord.root, chord.fifth].forEach((note, i) => push(score, base + i * 4, { part: "bass", freq: n(note), steps: 3 }));
    push(score, base, { part: "kick", freq: 58, steps: 1 });
    push(score, base + 8, { part: "kick", freq: 58, steps: 1 });
    push(score, base + 4, { part: "snare", freq: 0, steps: 1 });
    push(score, base + 12, { part: "snare", freq: 0, steps: 1 });
    for (let s = 2; s < 16; s += 4) push(score, base + s, { part: "hat", freq: 0, steps: 0.4 });
  });
  return score;
}

// ── Desert Canyon: Canyon Drums ──
const CANYON_MELODY = [
  "D5 . F5 A5 . G5 F5 E5",
  "D5 - A4 . D5 E5 F5 .",
  "F5 . D5 A#4 . D5 F5 G5",
  "E5 . G5 C6 . A#5 A5 G5",
  "A5 . F5 D5 A5 . F5 D5",
  "G5 . A#5 D6 . A#5 A5 G5",
  "A5 C#6 E6 - C#6 A5 E5 C#5",
  "A5 - - . E5 . A4 .",
  "D6 . A5 F5 D6 . A5 F5",
  "D6 . A#5 F5 D6 C6 A#5 A5",
  "G5 . D5 G5 A#5 . A5 G5",
  "A5 . E5 . C#5 . E5 A5",
  "A#5 A5 G5 F5 A#5 A5 G5 F5",
  "C6 A#5 A5 G5 C6 A#5 A5 G5",
  "C#6 . A5 . E5 . C#5 E5",
  "A5 - . . E6 . C#6 .",
];
const CANYON_CHORDS = ["Dm", "Dm", "Bb", "C", "Dm", "Gm", "A", "A", "Dm", "Bb", "Gm", "A", "Bb", "C", "A", "A"];

function canyonScore(): LoopNote[][] {
  const score = parseEighthNotes(CANYON_MELODY, "lead", n);
  CANYON_CHORDS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name] ?? CHORDS.C;
    // 화음: 마디 첫 박과 3박 앞 당김음
    for (const at of [0, 6, 10]) for (const tone of chord.tones) push(score, base + at, { part: "harmony", freq: n(tone), steps: 2 });
    // 베이스: 16분 질주 (근음 위주, 마디 끝에 5음)
    for (let s = 0; s < 16; s += 2) push(score, base + s, { part: "bass", freq: n(s >= 12 ? chord.fifth : chord.root), steps: 1.2 });
    // 드럼: 1박·2박 뒤·3박 킥, 2·4박 스네어, 탐 필인, 16분 셰이커
    for (const s of [0, 6, 8]) push(score, base + s, { part: "kick", freq: 55, steps: 1 });
    push(score, base + 4, { part: "snare", freq: 0, steps: 1 });
    push(score, base + 12, { part: "snare", freq: 0, steps: 1 });
    if (bar % 4 === 3) for (const s of [13, 14, 15]) push(score, base + s, { part: "tom", freq: 0, steps: 0.8 });
    for (let s = 0; s < 16; s++) if (s % 4 !== 0) push(score, base + s, { part: "hat", freq: 0, steps: 0.25 });
  });
  return score;
}

// ── Frozen Ridge: Icefall ──
const ICEFALL_MELODY = [
  "C#6 - - A5 F#5 - A5 C#6",
  "D6 - - A5 F#5 - D5 .",
  "B5 - - F#5 D5 - B4 D5",
  "F5 - G#5 - C#6 - - .",
  "C#6 - E6 - D6 C#6 A5 .",
  "F#5 - A5 - D6 - C#6 D6",
  "E6 - - B5 G#5 - E5 G#5",
  "G#5 - F5 - C#5 - - .",
  "A5 - D6 - F#6 - E6 D6",
  "G#5 - B5 - E6 - D6 B5",
  "C#6 - - E6 G#5 - - E5",
  "F#5 - A5 - C#6 - - .",
  "D6 - C#6 - B5 - F#5 .",
  "F5 - G#5 - C#6 - F6 .",
  "F#6 - - C#6 A5 - F#5 .",
  "F#5 - - . . . . .",
];
const ICEFALL_CHORDS = ["F#m", "D", "Bm", "C#", "F#m", "D", "E", "C#", "D", "E", "C#m", "F#m", "Bm", "C#", "F#m", "F#m"];

function icefallScore(): LoopNote[][] {
  const score = parseEighthNotes(ICEFALL_MELODY, "lead", n);
  ICEFALL_CHORDS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    // 긴 화음 패드 (한 마디)
    for (const tone of chord.tones) push(score, base, { part: "harmony", freq: n(tone) / 2, steps: 15 });
    // 16분 아르페지오 (한 옥타브 위)
    const arp = [chord.tones[0], chord.tones[1], chord.tones[2], chord.tones[1]];
    for (let s = 0; s < 16; s++) push(score, base + s, { part: "arp", freq: n(arp[s % 4]) * 2, steps: 0.8 });
    push(score, base, { part: "bass", freq: n(chord.root), steps: 7 });
    push(score, base + 8, { part: "bass", freq: n(chord.fifth), steps: 6 });
    push(score, base, { part: "kick", freq: 52, steps: 1 });
    push(score, base + 10, { part: "kick", freq: 52, steps: 1 });
    push(score, base + 8, { part: "snare", freq: 0, steps: 1.5 });
    for (let s = 0; s < 16; s += 2) push(score, base + s, { part: "hat", freq: 0, steps: 0.3 });
  });
  return score;
}

const DRUMS = {
  kick: { wave: "sine", volume: 0.32 },
  snare: { wave: "noise", volume: 0.1, filter: "bandpass", cutoff: 1900 },
  hat: { wave: "noise", volume: 0.035, filter: "highpass", cutoff: 7500 },
} as const satisfies LoopSpec["parts"];

export const SONGS: Record<FieldId, { title: string; spec: LoopSpec }> = {
  greenHills: {
    title: "Meadow March",
    spec: {
      score: meadowScore(),
      baseBpm: 126,
      maxBpm: 126,
      parts: { lead: { wave: "square", volume: 0.11 }, harmony: { wave: "triangle", volume: 0.07 }, bass: { wave: "triangle", volume: 0.22 }, ...DRUMS },
    },
  },
  desertCanyon: {
    title: "Canyon Drums",
    spec: {
      score: canyonScore(),
      baseBpm: 138,
      maxBpm: 138,
      parts: {
        lead: { wave: "sawtooth", volume: 0.07 },
        harmony: { wave: "square", volume: 0.035 },
        bass: { wave: "triangle", volume: 0.24 },
        tom: { wave: "noise", volume: 0.12, filter: "lowpass", cutoff: 420 },
        ...DRUMS,
      },
    },
  },
  frozenRidge: {
    title: "Icefall",
    spec: {
      score: icefallScore(),
      baseBpm: 104,
      maxBpm: 104,
      parts: {
        lead: { wave: "sine", volume: 0.16 },
        arp: { wave: "triangle", volume: 0.035 },
        harmony: { wave: "sine", volume: 0.05 },
        bass: { wave: "triangle", volume: 0.2 },
        ...DRUMS,
        hat: { wave: "noise", volume: 0.025, filter: "highpass", cutoff: 9000 },
      },
    },
  },
};

/**
 * 전장별 곡 전환 관리. 곡마다 LoopPlayer를 하나씩 두고, 한 번에 하나만 재생한다.
 * enabled(사용자 설정)와 active(게임이 음악을 원하는 상태)가 모두 참일 때만 실제로 울린다.
 */
export class CannonMusic {
  private players: Record<FieldId, LoopPlayer>;
  private current: FieldId = "greenHills";
  private active = false;
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    this.players = {
      greenHills: new LoopPlayer(SONGS.greenHills.spec, enabled),
      desertCanyon: new LoopPlayer(SONGS.desertCanyon.spec, enabled),
      frozenRidge: new LoopPlayer(SONGS.frozenRidge.spec, enabled),
    };
  }

  attach(ctx: AudioContext, volume: number) {
    for (const player of Object.values(this.players)) player.attach(ctx, volume);
  }

  get track() {
    return this.current;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    for (const [id, player] of Object.entries(this.players)) player.setEnabled(enabled && id === this.current);
  }

  /** 곡을 고르고 처음부터 재생 상태로 둔다. 다른 곡은 페이드아웃. */
  play(field: FieldId) {
    if (this.current !== field) this.players[this.current].stop(0.5);
    this.current = field;
    this.active = true;
    for (const [id, player] of Object.entries(this.players)) player.setEnabled(this.enabled && id === field);
    this.players[field].start(0.2);
  }

  /** 같은 곡이면 이어서, 다른 곡이면 바꿔서 재생 (메뉴에서 전장을 고를 때) */
  cue(field: FieldId) {
    if (this.current === field && this.active) return;
    this.play(field);
  }

  setActive(active: boolean) {
    this.active = active;
    this.players[this.current].setActive(active);
  }

  stop(fade = 1.2) {
    this.active = false;
    this.players[this.current].stop(fade);
  }

  duck() {
    this.players[this.current].duck(0.5, 0.25);
  }

  dispose() {
    for (const player of Object.values(this.players)) player.dispose();
  }

  // 테스트용
  get playing() {
    return this.players[this.current].isPlaying;
  }
}
