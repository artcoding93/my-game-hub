import { DIFFICULTIES, TRACK_IDS, type Difficulty, type TrackId } from "./types";

/*
 * 레이스 기록 (localStorage 한 키에 JSON, 순수 함수).
 * - 트랙별 최고 기록·최고 순위, 트랙×난이도별 최고 기록, 총 경기 수, 1위 횟수
 * - 같은 레이스(raceId)는 한 번만 반영한다.
 * 형식을 바꾸면 RECORDS_VERSION을 올린다. 손상되었거나 다른 버전이면 버리고 새로 시작한다(게임은 정상 시작).
 */

export const RECORDS_VERSION = 1;

export interface TrackRecord {
  bestTime: number | null;
  bestRank: number | null;
  byDifficulty: Record<Difficulty, number | null>;
}

export interface Records {
  v: number;
  races: number;
  wins: number;
  tracks: Record<TrackId, TrackRecord>;
  lastRaceId: string | null;
}

function emptyTrack(): TrackRecord {
  return { bestTime: null, bestRank: null, byDifficulty: { easy: null, normal: null, hard: null } };
}

export function newRecords(): Records {
  return {
    v: RECORDS_VERSION,
    races: 0,
    wins: 0,
    tracks: { greenValley: emptyTrack(), desertCanyon: emptyTrack(), frostCircuit: emptyTrack() },
    lastRaceId: null,
  };
}

const isCount = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9;
const isTime = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e5);
const isRank = (v: unknown) => v === null || (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 4);

export function parseRecords(raw: string | null): Records | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const r = data as Record<string, unknown>;
  if (r.v !== RECORDS_VERSION || !isCount(r.races) || !isCount(r.wins)) return null;
  if (typeof r.tracks !== "object" || r.tracks === null) return null;
  if (r.lastRaceId !== null && (typeof r.lastRaceId !== "string" || r.lastRaceId.length > 80)) return null;
  const out = newRecords();
  out.races = r.races as number;
  out.wins = r.wins as number;
  out.lastRaceId = r.lastRaceId as string | null;
  for (const id of TRACK_IDS) {
    const t = (r.tracks as Record<string, unknown>)[id];
    if (typeof t !== "object" || t === null) return null;
    const tr = t as Record<string, unknown>;
    if (!isTime(tr.bestTime) || !isRank(tr.bestRank) || typeof tr.byDifficulty !== "object" || tr.byDifficulty === null) return null;
    const by = tr.byDifficulty as Record<string, unknown>;
    if (!DIFFICULTIES.every((d) => isTime(by[d]))) return null;
    out.tracks[id] = {
      bestTime: tr.bestTime as number | null,
      bestRank: tr.bestRank as number | null,
      byDifficulty: { easy: by.easy as number | null, normal: by.normal as number | null, hard: by.hard as number | null },
    };
  }
  return out;
}

export function serializeRecords(records: Records): string {
  return JSON.stringify(records);
}

const better = (prev: number | null, next: number) => (prev === null ? next : Math.min(prev, next));

/**
 * 레이스 결과 반영. 기록(시간)은 실제로 완주한 경우만 갱신한다(추정 기록은 제외).
 * 이미 반영한 레이스면 그대로 돌려준다.
 */
export function recordRace(records: Records, raceId: string, track: TrackId, difficulty: Difficulty, rank: number, time: number): { records: Records; newBest: boolean } {
  if (records.lastRaceId === raceId) return { records, newBest: false };
  time = Math.round(time * 1000) / 1000;
  const prev = records.tracks[track];
  const newBest = prev.bestTime === null || time < prev.bestTime;
  return {
    newBest,
    records: {
      ...records,
      races: records.races + 1,
      wins: records.wins + (rank === 1 ? 1 : 0),
      lastRaceId: raceId,
      tracks: {
        ...records.tracks,
        [track]: {
          bestTime: better(prev.bestTime, time),
          bestRank: better(prev.bestRank, rank),
          byDifficulty: { ...prev.byDifficulty, [difficulty]: better(prev.byDifficulty[difficulty], time) },
        },
      },
    },
  };
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}
