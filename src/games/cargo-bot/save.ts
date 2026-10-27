import { STAGES } from "./stages";
import type { Board } from "./types";
import type { Snapshot } from "./logic/session";
import { levelOf } from "./logic/session";
import { isWalkable } from "./logic/engine";

/*
 * 진행 기록 저장 형식과 검증. localStorage 문자열을 그대로 믿지 않고, 형식이 맞지 않거나 손상되면 버린다(게임은 새로 시작).
 * 형식을 바꾸면 PROGRESS_VERSION을 올린다.
 */

export const PROGRESS_VERSION = 1;

export interface StageRecord {
  /** 클리어했을 때의 최소 이동 수·최소 밀기 수 (각각 따로 최소) */
  bestMoves: number;
  bestPushes: number;
  stars: 1 | 2 | 3;
}

export interface Progress {
  version: number;
  /** 스테이지 id → 최고 기록 (클리어한 스테이지만) */
  records: Record<number, StageRecord>;
  /** 마지막으로 플레이한 스테이지 번호(0부터) */
  lastStage: number;
  /** 진행 중이던 스테이지 상태 (이어하기) */
  resume: { stage: number; snapshot: Snapshot } | null;
}

export function emptyProgress(): Progress {
  return { version: PROGRESS_VERSION, records: {}, lastStage: 0, resume: null };
}

/** 스테이지 n(0부터)을 플레이할 수 있는지: 1번이거나 바로 앞 스테이지를 클리어했으면 */
export function isUnlocked(p: Progress, stageIndex: number) {
  return stageIndex === 0 || Boolean(p.records[STAGES[stageIndex - 1].id]);
}

/** 가장 높이 클리어한 스테이지 번호(1부터, 없으면 0) */
export function highestCleared(p: Progress) {
  return STAGES.reduce((m, s) => (p.records[s.id] ? Math.max(m, s.id) : m), 0);
}

export function allCleared(p: Progress) {
  return STAGES.every((s) => p.records[s.id]);
}

/** 클리어 기록 반영 (각 항목은 더 좋을 때만 바꾼다). 새 최고 기록이면 true */
export function recordClear(p: Progress, stageIndex: number, moves: number, pushes: number, stars: 1 | 2 | 3): { progress: Progress; newBest: boolean } {
  const id = STAGES[stageIndex].id;
  const old = p.records[id];
  const rec: StageRecord = old
    ? { bestMoves: Math.min(old.bestMoves, moves), bestPushes: Math.min(old.bestPushes, pushes), stars: Math.max(old.stars, stars) as 1 | 2 | 3 }
    : { bestMoves: moves, bestPushes: pushes, stars };
  const newBest = !old || moves < old.bestMoves || pushes < old.bestPushes;
  return { progress: { ...p, records: { ...p.records, [id]: rec }, resume: p.resume?.stage === stageIndex ? null : p.resume }, newBest };
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

function validBoard(stageIndex: number, b: unknown): b is Board {
  if (!b || typeof b !== "object") return false;
  const { player, boxes } = b as Board;
  const level = levelOf(stageIndex);
  const cells = level.cols * level.rows;
  if (!isInt(player, 0, cells - 1) || !isWalkable(level, player)) return false;
  if (!Array.isArray(boxes) || boxes.length !== level.start.boxes.length) return false;
  if (!boxes.every((c) => isInt(c, 0, cells - 1) && isWalkable(level, c) && c !== player)) return false;
  return new Set(boxes).size === boxes.length;
}

/** 저장 문자열 → Progress. 손상·다른 버전이면 null */
export function parseProgress(raw: string | null): Progress | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<Progress>;
    if (!data || data.version !== PROGRESS_VERSION || typeof data.records !== "object" || data.records === null) return null;
    const records: Record<number, StageRecord> = {};
    for (const s of STAGES) {
      const r = (data.records as Record<string, StageRecord>)[s.id];
      if (r === undefined) continue;
      if (!r || !isInt(r.bestMoves, 1, 1e6) || !isInt(r.bestPushes, 1, 1e6) || !isInt(r.stars, 1, 3)) return null;
      // 검증된 최소 기록보다 좋은 기록은 있을 수 없다
      if (r.bestPushes < s.par.pushes || r.bestMoves < s.par.moves) return null;
      records[s.id] = { bestMoves: r.bestMoves, bestPushes: r.bestPushes, stars: r.stars };
    }
    const lastStage = isInt(data.lastStage, 0, STAGES.length - 1) ? data.lastStage : 0;
    let resume: Progress["resume"] = null;
    const rs = data.resume;
    if (rs && isInt(rs.stage, 0, STAGES.length - 1) && rs.snapshot && validBoard(rs.stage, rs.snapshot.board) && isInt(rs.snapshot.moves, 0, 1e6) && isInt(rs.snapshot.pushes, 0, rs.snapshot.moves)) {
      resume = { stage: rs.stage, snapshot: { board: { player: rs.snapshot.board.player, boxes: [...rs.snapshot.board.boxes] }, moves: rs.snapshot.moves, pushes: rs.snapshot.pushes } };
    }
    return { version: PROGRESS_VERSION, records, lastStage, resume };
  } catch {
    return null;
  }
}

export function serializeProgress(p: Progress): string {
  return JSON.stringify(p);
}
