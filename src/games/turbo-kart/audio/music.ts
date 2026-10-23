import { LoopPlayer, parseEighthNotes, type LoopNote, type LoopSpec } from "@/lib/audio/loopPlayer";
import { noteToFreq } from "@/lib/audio/synth";
import type { TrackId } from "../types";

/*
 * Turbo Kart 배경음악 3곡. 모두 이 게임을 위해 새로 쓴 16마디 곡이다(기존 레이싱 게임 음악을 옮기지 않음).
 * 파트: 멜로디(lead) · 화음(harmony) · 베이스(bass) · 드럼(kick·snare·hat), 공용 LoopPlayer로 끊김 없이 반복한다.
 *
 * Green Valley — "Valley Sprint" 150 BPM, A장조, 밝고 경쾌한 레이싱
 *   A E F#m D · A E D E · F#m D A E · D E A A
 * Desert Canyon — "Mirage Rush" 164 BPM, E 프리지안 도미넌트(E F G# A B C D), 빠른 리듬의 사막 레이싱
 *   E F E Dm · E F G F · Am G F E · Dm F E E   16분 셰이커와 당김음 킥
 * Frost Circuit — "Snowline Drive" 156 BPM, D장조, 썰매 방울 같은 16분 하이햇과 종소리 아르페지오의 겨울 레이싱
 *   D Bm G A · D Bm Em A · G A F#m Bm · G A D D
 */

const n = noteToFreq;

const CHORDS: Record<string, { root: string; fifth: string; tones: [string, string, string] }> = {
  A: { root: "A2", fifth: "E3", tones: ["A3", "C#4", "E4"] },
  E: { root: "E2", fifth: "B2", tones: ["G#3", "B3", "E4"] },
  "F#m": { root: "F#2", fifth: "C#3", tones: ["F#3", "A3", "C#4"] },
  D: { root: "D3", fifth: "A3", tones: ["F#3", "A3", "D4"] },
  F: { root: "F2", fifth: "C3", tones: ["F3", "A3", "C4"] },
  Dm: { root: "D3", fifth: "A3", tones: ["D4", "F4", "A4"] },
  G: { root: "G2", fifth: "D3", tones: ["G3", "B3", "D4"] },
  Am: { root: "A2", fifth: "E3", tones: ["A3", "C4", "E4"] },
  Bm: { root: "B2", fifth: "F#3", tones: ["F#3", "B3", "D4"] },
  Em: { root: "E2", fifth: "B2", tones: ["E3", "G3", "B3"] },
};

const SPRINT = [
  "E5 A5 C#6 A5 E6 - C#6 A5",
  "B5 G#5 E5 G#5 B5 - E6 .",
  "C#6 A5 F#5 A5 C#6 E6 C#6 A5",
  "D6 - A5 F#5 D6 - E6 .",
  "C#6 - B5 A5 E5 A5 C#6 E6",
  "D6 - C#6 B5 G#5 B5 E6 .",
  "F#6 E6 D6 C#6 B5 A5 F#5 A5",
  "G#5 - B5 - E6 - . .",
  "A5 C#6 F#6 - E6 C#6 A5 .",
  "F#5 A5 D6 - C#6 A5 F#5 .",
  "E5 A5 C#6 E6 A6 - E6 C#6",
  "B5 - G#5 E5 B5 - G#5 .",
  "A5 - F#5 A5 D6 - F#6 .",
  "E6 D6 C#6 B5 G#5 B5 E6 G#6",
  "A6 - E6 C#6 A5 - C#6 E6",
  "A5 - - . E5 . A4 .",
];
const SPRINT_CHORDS = ["A", "E", "F#m", "D", "A", "E", "D", "E", "F#m", "D", "A", "E", "D", "E", "A", "A"];

const MIRAGE = [
  "E5 F5 G#5 B5 - G#5 F5 E5",
  "F5 A5 C6 - B5 A5 G#5 .",
  "E5 . B5 . G#5 F5 E5 D5",
  "D5 F5 A5 - G#5 F5 E5 .",
  "B5 C6 B5 G#5 E5 G#5 B5 E6",
  "C6 - A5 F5 C6 D6 C6 A5",
  "B5 - G5 D5 B5 C6 D6 .",
  "C6 B5 A5 G#5 F5 E5 F5 G#5",
  "A5 C6 E6 - D6 C6 B5 A5",
  "G5 B5 D6 - C6 B5 A5 G5",
  "F5 A5 C6 - B5 A5 G#5 F5",
  "E5 G#5 B5 E6 - D6 C6 B5",
  "A5 - F5 D5 A5 - C6 .",
  "C6 - A5 F5 C6 - D6 .",
  "E6 - B5 G#5 E5 - G#5 B5",
  "E6 - - . B5 . E5 .",
];
const MIRAGE_CHORDS = ["E", "F", "E", "Dm", "E", "F", "G", "F", "Am", "G", "F", "E", "Dm", "F", "E", "E"];

const SNOWLINE = [
  "F#5 A5 D6 - F#6 - E6 D6",
  "D6 B5 F#5 B5 D6 - C#6 .",
  "B5 - G5 B5 D6 - B5 G5",
  "A5 C#6 E6 - D6 C#6 A5 .",
  "D6 - A5 F#5 D6 - F#6 A6",
  "F#6 - D6 B5 F#5 B5 D6 .",
  "E6 - B5 G5 E5 G5 B5 E6",
  "C#6 - E6 - A6 - . .",
  "G6 F#6 E6 D6 B5 D6 G6 .",
  "A6 G6 F#6 E6 C#6 E6 A6 .",
  "F#6 - C#6 A5 F#5 A5 C#6 .",
  "D6 - B5 F#5 D6 - F#6 .",
  "B5 D6 G6 - F#6 D6 B5 .",
  "C#6 E6 A6 - G6 E6 C#6 .",
  "D6 - F#6 - A6 - F#6 D6",
  "D6 - - . A5 . D5 .",
];
const SNOWLINE_CHORDS = ["D", "Bm", "G", "A", "D", "Bm", "Em", "A", "G", "A", "F#m", "Bm", "G", "A", "D", "D"];

const push = (score: LoopNote[][], step: number, note: LoopNote) => score[step].push(note);

function build(melody: string[], chords: string[], style: "sprint" | "mirage" | "snowline"): LoopNote[][] {
  const score = parseEighthNotes(melody, "lead", n);
  chords.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    // 화음: 오프비트 스탭 (8분 뒤박)
    for (let s = 2; s < 16; s += 4) for (const tone of chord.tones) push(score, base + s, { part: "harmony", freq: n(tone), steps: 1.6 });
    // 베이스: 8분 근음 질주, 마디 끝에 5음
    for (let s = 0; s < 16; s += 2) push(score, base + s, { part: "bass", freq: n(s >= 12 ? chord.fifth : chord.root), steps: 1.4 });
    // 드럼
    const kicks = style === "mirage" ? [0, 6, 8, 11] : [0, 8];
    for (const s of kicks) push(score, base + s, { part: "kick", freq: 55, steps: 1 });
    push(score, base + 4, { part: "snare", freq: 0, steps: 1 });
    push(score, base + 12, { part: "snare", freq: 0, steps: 1 });
    const hatEvery = style === "sprint" ? 2 : 1;
    for (let s = 0; s < 16; s += hatEvery) if (s % 4 !== 0) push(score, base + s, { part: "hat", freq: 0, steps: 0.3 });
    if (style === "snowline") {
      // 종소리 아르페지오 (한 옥타브 위, 마디마다)
      const arp = [chord.tones[0], chord.tones[1], chord.tones[2], chord.tones[1]];
      for (let s = 0; s < 16; s += 2) push(score, base + s, { part: "bell", freq: n(arp[(s / 2) % 4]) * 4, steps: 0.8 });
    }
    if (style === "mirage" && bar % 4 === 3) for (const s of [13, 14, 15]) push(score, base + s, { part: "tom", freq: 0, steps: 0.8 });
  });
  return score;
}

const DRUMS = {
  kick: { wave: "sine", volume: 0.3 },
  snare: { wave: "noise", volume: 0.1, filter: "bandpass", cutoff: 1900 },
  hat: { wave: "noise", volume: 0.03, filter: "highpass", cutoff: 8000 },
} as const satisfies LoopSpec["parts"];

export const SONGS: Record<TrackId, { title: string; spec: LoopSpec }> = {
  greenValley: {
    title: "Valley Sprint",
    spec: {
      score: build(SPRINT, SPRINT_CHORDS, "sprint"),
      baseBpm: 150,
      maxBpm: 150,
      parts: { lead: { wave: "square", volume: 0.1 }, harmony: { wave: "triangle", volume: 0.045 }, bass: { wave: "triangle", volume: 0.22 }, ...DRUMS },
    },
  },
  desertCanyon: {
    title: "Mirage Rush",
    spec: {
      score: build(MIRAGE, MIRAGE_CHORDS, "mirage"),
      baseBpm: 164,
      maxBpm: 164,
      parts: {
        lead: { wave: "sawtooth", volume: 0.065 },
        harmony: { wave: "square", volume: 0.028 },
        bass: { wave: "triangle", volume: 0.24 },
        tom: { wave: "noise", volume: 0.12, filter: "lowpass", cutoff: 420 },
        ...DRUMS,
      },
    },
  },
  frostCircuit: {
    title: "Snowline Drive",
    spec: {
      score: build(SNOWLINE, SNOWLINE_CHORDS, "snowline"),
      baseBpm: 156,
      maxBpm: 156,
      parts: {
        lead: { wave: "square", volume: 0.085 },
        harmony: { wave: "triangle", volume: 0.045 },
        bass: { wave: "triangle", volume: 0.2 },
        bell: { wave: "sine", volume: 0.035 },
        ...DRUMS,
        hat: { wave: "noise", volume: 0.035, filter: "highpass", cutoff: 9500 },
      },
    },
  },
};

/** 트랙별 곡 전환. 한 번에 한 곡만 재생하고, enabled(사용자 설정)와 active(게임 상태)가 모두 참일 때만 울린다. */
export class KartMusic {
  private players: Record<TrackId, LoopPlayer>;
  private current: TrackId = "greenValley";
  private active = false;
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    this.players = {
      greenValley: new LoopPlayer(SONGS.greenValley.spec, enabled),
      desertCanyon: new LoopPlayer(SONGS.desertCanyon.spec, enabled),
      frostCircuit: new LoopPlayer(SONGS.frostCircuit.spec, enabled),
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

  play(track: TrackId) {
    if (this.current !== track) this.players[this.current].stop(0.5);
    this.current = track;
    this.active = true;
    for (const [id, player] of Object.entries(this.players)) player.setEnabled(this.enabled && id === track);
    this.players[track].start(0.2);
  }

  cue(track: TrackId) {
    if (this.current === track && this.active) return;
    this.play(track);
  }

  setActive(active: boolean) {
    this.active = active;
    this.players[this.current].setActive(active);
  }

  stop(fade = 1.5) {
    this.active = false;
    this.players[this.current].stop(fade);
  }

  duck() {
    this.players[this.current].duck(0.55, 0.2);
  }

  dispose() {
    for (const player of Object.values(this.players)) player.dispose();
  }

  get playing() {
    return this.players[this.current].isPlaying;
  }
}
