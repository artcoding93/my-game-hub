import { LoopPlayer, parseEighthNotes, type LoopNote, type LoopSpec } from "@/lib/audio/loopPlayer";
import { noteToFreq } from "@/lib/audio/synth";
import { bossCycle } from "./config";
import type { GameEvent, GameState } from "./types";

/*
 * Star Vanguard 배경음악. 두 곡 모두 이 게임을 위해 새로 쓴 16마디 칩튠이다
 * (기존 슈팅 게임 음악의 멜로디·편곡을 옮기거나 샘플링하지 않음).
 *
 * SPACE BATTLE (일반 웨이브, 135 BPM, 약 28초) — 마단조(E minor), 밝고 빠른 전투
 *   A(1~4) Em C D Em · A'(5~8) Em C D B · B(9~12) C D Bm Em · C(13~16) C D B B
 *   상승 프레이즈로 시작해 후반에 빠른 하강 프레이즈, 마지막 B(딸림화음)가 첫 마디 Em으로 돌아간다.
 * COMMAND CORE BATTLE (보스, 155 BPM, 약 25초) — 가단조에 반음 위 B♭ 화음과 반음 꾸밈음으로 어둡고 긴박하게
 *   Am B♭ Am E · Am B♭ F E · Dm B♭ Am E · Dm B♭ E E, 4박 킥과 16분 하이햇, 근음을 계속 두드리는 베이스
 */

const n = noteToFreq;

type ChordNotes = { root: string; fifth: string; arp: [string, string, string] };

const CHORDS: Record<string, ChordNotes> = {
  Em: { root: "E2", fifth: "B2", arp: ["E5", "G5", "B5"] },
  C: { root: "C3", fifth: "G3", arp: ["C5", "E5", "G5"] },
  D: { root: "D3", fifth: "A3", arp: ["D5", "F#5", "A5"] },
  B: { root: "B2", fifth: "F#3", arp: ["B4", "D#5", "F#5"] },
  Bm: { root: "B2", fifth: "F#3", arp: ["B4", "D5", "F#5"] },
  Am: { root: "A2", fifth: "E3", arp: ["A4", "C5", "E5"] },
  Bb: { root: "A#2", fifth: "F3", arp: ["A#4", "D5", "F5"] },
  F: { root: "F2", fifth: "C3", arp: ["F4", "A4", "C5"] },
  E: { root: "E2", fifth: "B2", arp: ["E4", "G#4", "B4"] },
  Dm: { root: "D3", fifth: "A3", arp: ["D4", "F4", "A4"] },
};

// ── SPACE BATTLE ──
const BATTLE_MELODY = [
  "E5 . G5 B5 A5 G5 F#5 E5",
  "G5 . E5 C5 D5 E5 G5 .",
  "F#5 . A5 D6 C6 B5 A5 F#5",
  "G5 - E5 . B4 . E5 .",
  "E5 . G5 B5 E6 . D6 B5",
  "C6 . B5 G5 E5 G5 C6 .",
  "D6 . C6 A5 F#5 A5 D6 C6",
  "B5 - F#5 . D#5 F#5 B5 .",
  "E5 E5 G5 . E5 E5 C6 .",
  "F#5 F#5 A5 . F#5 F#5 D6 .",
  "B5 . A5 F#5 D5 F#5 B5 A5",
  "G5 . E5 B4 E5 G5 B5 .",
  "C6 B5 G5 E5 C6 B5 G5 E5",
  "D6 C6 A5 F#5 D6 C6 A5 F#5",
  "D#6 . B5 F#5 D#5 F#5 B5 D#6",
  "B5 . . F#5 B4 . D#5 F#5",
];
const BATTLE_CHORDS = ["Em", "C", "D", "Em", "Em", "C", "D", "B", "C", "D", "Bm", "Em", "C", "D", "B", "B"];

function battleScore(): LoopNote[][] {
  const score = parseEighthNotes(BATTLE_MELODY, "lead", n);
  BATTLE_CHORDS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    const root = n(chord.root);
    const fifth = n(chord.fifth);
    // 베이스: 근음과 옥타브를 빠르게 오가는 8분음표
    [root, root * 2, root, root * 2, root, root * 2, fifth, root * 2].forEach((freq, i) =>
      score[base + i * 2].push({ part: "bass", freq, steps: 1.3 }),
    );
    // 아르페지오: 16분음표 화음 분산 (우주적인 반짝임)
    for (let s = 0; s < 16; s++) score[base + s].push({ part: "arp", freq: n(chord.arp[s % 3]), steps: 0.7 });
    // 드럼: 1·3박 킥, 2·4박 스네어, 8분(후반부는 16분) 하이햇
    score[base].push({ part: "kick", freq: 0, steps: 0.8 });
    score[base + 8].push({ part: "kick", freq: 0, steps: 0.8 });
    score[base + 4].push({ part: "snare", freq: 0, steps: 0.8 });
    score[base + 12].push({ part: "snare", freq: 0, steps: 0.8 });
    const hatEvery = bar < 8 ? 2 : 1;
    for (let s = 0; s < 16; s += hatEvery) if (s % 4 !== 0) score[base + s].push({ part: "hat", freq: 0, steps: 0.25 });
  });
  return score;
}

// ── COMMAND CORE BATTLE ──
const BOSS_MELODY = [
  "A4 A4 C5 A4 E5 . D#5 E5",
  "F5 . D5 A#4 D5 F5 A#5 .",
  "A5 . G#5 A5 E5 . C5 E5",
  "B4 - G#4 . E4 . G#4 B4",
  "A4 A4 C5 A4 E5 . D#5 E5",
  "A#5 . F5 D5 F5 A#5 D6 .",
  "C6 . A5 F5 C6 . A5 F5",
  "G#5 - E5 . B4 . G#5 B5",
  "D5 F5 A5 . D6 . A5 F5",
  "D5 F5 A#5 . D6 . A#5 F5",
  "E5 A5 C6 . E6 . C6 A5",
  "G#5 . B5 . E6 - . .",
  "F5 E5 D5 F5 A5 G#5 A5 D6",
  "D6 C6 A#5 F5 D5 F5 A#5 D6",
  "E6 . B5 G#5 E5 G#5 B5 E6",
  "D6 . B5 . G#5 . E5 .",
];
const BOSS_CHORDS = ["Am", "Bb", "Am", "E", "Am", "Bb", "F", "E", "Dm", "Bb", "Am", "E", "Dm", "Bb", "E", "E"];

function bossScore(): LoopNote[][] {
  const score = parseEighthNotes(BOSS_MELODY, "lead", n);
  BOSS_CHORDS.forEach((name, bar) => {
    const base = bar * 16;
    const chord = CHORDS[name];
    const root = n(chord.root);
    // 베이스: 근음을 계속 두드리다 마디 끝에서 옥타브로 튀어 오른다
    [root, root, root, root * 2, root, root, root * 2, root].forEach((freq, i) =>
      score[base + i * 2].push({ part: "bass", freq, steps: 1.2 }),
    );
    // 2·4박 뒤에만 짧은 화음 찌르기 (어두운 분위기를 위해 아르페지오를 줄임)
    for (const s of [6, 7, 14, 15]) score[base + s].push({ part: "arp", freq: n(chord.arp[s % 3]), steps: 0.7 });
    // 드럼: 4박 킥, 2·4박 스네어, 16분 하이햇
    for (const s of [0, 4, 8, 12]) score[base + s].push({ part: "kick", freq: 0, steps: 0.8 });
    score[base + 4].push({ part: "snare", freq: 0, steps: 0.8 });
    score[base + 12].push({ part: "snare", freq: 0, steps: 0.8 });
    for (let s = 1; s < 16; s += 2) score[base + s].push({ part: "hat", freq: 0, steps: 0.25 });
  });
  return score;
}

const DRUMS = {
  kick: { wave: "noise", volume: 0.3, filter: "lowpass", cutoff: 160 },
  snare: { wave: "noise", volume: 0.1, filter: "bandpass", cutoff: 1900 },
  hat: { wave: "noise", volume: 0.045, filter: "highpass", cutoff: 7500 },
} as const;

export const BATTLE_LOOP: LoopSpec = {
  score: battleScore(),
  parts: {
    lead: { wave: "square", volume: 0.2 },
    bass: { wave: "triangle", volume: 0.42 },
    arp: { wave: "square", volume: 0.045 },
    ...DRUMS,
  },
  baseBpm: 135,
  maxBpm: 165,
};

export const BOSS_LOOP: LoopSpec = {
  score: bossScore(),
  parts: {
    lead: { wave: "square", volume: 0.19 },
    bass: { wave: "triangle", volume: 0.48 },
    arp: { wave: "square", volume: 0.06 },
    ...DRUMS,
  },
  baseBpm: 155,
  maxBpm: 165,
};

/** 일반 웨이브 템포: 1~2 → 135, 3~4 → 145, 6~9 → 150, 11~14 → 155, 16~19 → 160, 21~ → 165 (상한) */
export function battleTempo(wave: number): number {
  if (wave <= 2) return 135;
  if (wave <= 4) return 145;
  if (wave <= 9) return 150;
  return Math.min(150 + 5 * Math.floor((wave - 5) / 5), 165);
}

/** 보스 템포: 155에서 시작해 보스 회차마다 +3, 최대 165 */
export function bossTempo(wave: number): number {
  return Math.min(155 + (bossCycle(wave) - 1) * 3, 165);
}

/** 보스 경보 효과음(sound.ts, 약 1.4초)이 끝날 즈음 보스 BGM이 들어오도록 기다리는 시간 */
const BOSS_ENTRY_DELAY = 1.3;

export type MusicAction = "pause" | "resume";
type Track = "battle" | "boss";

/**
 * 두 곡 사이를 전환하는 BGM 관리자. 게임 이벤트와 상태를 읽기만 한다.
 * - 보스 여부는 웨이브 번호가 아니라, 시작한 웨이브에 실제로 Command Core가 있는지로 판단한다.
 * - 일반 웨이브가 이어지면 곡을 다시 시작하지 않고 템포만 서서히 올린다.
 */
export class StarVanguardMusic {
  readonly battle: LoopPlayer;
  readonly boss: LoopPlayer;
  private track: Track | null = null;

  constructor(enabled: boolean) {
    this.battle = new LoopPlayer(BATTLE_LOOP, enabled);
    this.boss = new LoopPlayer(BOSS_LOOP, enabled);
  }

  get enabled() {
    return this.battle.enabled;
  }

  /** 지금 재생하려는 곡 (테스트용) */
  get currentTrack() {
    return this.track;
  }

  attach(ctx: AudioContext, volume: number) {
    this.battle.attach(ctx, volume);
    this.boss.attach(ctx, volume);
  }

  setEnabled(enabled: boolean) {
    this.battle.setEnabled(enabled);
    this.boss.setEnabled(enabled);
  }

  duck(level?: number) {
    this.player()?.duck(level);
  }

  handle(events: readonly GameEvent[], state: GameState, action?: MusicAction) {
    if (action === "pause") this.player()?.setActive(false, 0.12);
    if (action === "resume") this.player()?.setActive(true);

    for (const event of events) {
      switch (event.type) {
        case "waveStarted": {
          const bossPresent = state.enemies.some((enemy) => enemy.kind === "core");
          if (bossPresent) this.switchTo("boss", bossTempo(event.wave), BOSS_ENTRY_DELAY, 0.6);
          else if (this.track === "battle" && event.wave > 1) this.battle.setTempo(battleTempo(event.wave));
          else this.switchTo("battle", battleTempo(event.wave), 0.25, 0.5);
          break;
        }
        case "enemyKilled":
          // 보스 격파: 보스 곡을 내리고, 다음 일반 웨이브가 시작될 때 전투 곡으로 돌아간다.
          if (event.kind === "core") this.stopAll(0.5);
          break;
        case "playerHit":
          // 마지막 목숨을 잃으면 GAME OVER 화면 전에 음악을 내린다.
          if (state.lives <= 0) this.stopAll(0.4);
          break;
        case "gameOver":
          this.stopAll(0.4);
          break;
        default:
          break;
      }
    }
  }

  dispose() {
    this.battle.dispose();
    this.boss.dispose();
    this.track = null;
  }

  private player(): LoopPlayer | null {
    return this.track === "battle" ? this.battle : this.track === "boss" ? this.boss : null;
  }

  private switchTo(track: Track, bpm: number, delay: number, fadeOut: number) {
    const other = track === "battle" ? this.boss : this.battle;
    other.stop(fadeOut);
    const next = track === "battle" ? this.battle : this.boss;
    next.setTempo(bpm, true);
    next.start(delay);
    this.track = track;
  }

  private stopAll(fade: number) {
    this.battle.stop(fade);
    this.boss.stop(fade);
    this.track = null;
  }
}
