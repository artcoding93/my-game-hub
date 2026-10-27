import type { GameMode } from "./config";

/** 기록 저장 형식. 형식을 바꾸면 RECORDS_VERSION을 올린다(예전 형식은 버림). */
export const RECORDS_VERSION = 1;

export interface ModeRecord {
  score: number;
  maxChain: number;
  crystals: number;
}

export interface Records {
  version: typeof RECORDS_VERSION;
  rush: ModeRecord;
  endless: ModeRecord;
}

export interface GameResult {
  score: number;
  maxChain: number;
  crystals: number;
}

export function emptyRecords(): Records {
  return { version: RECORDS_VERSION, rush: emptyRecord(), endless: emptyRecord() };
}

function emptyRecord(): ModeRecord {
  return { score: 0, maxChain: 0, crystals: 0 };
}

/** 모드별로 항목마다 최고값만 남긴다. newBest: 최고 점수를 새로 세웠는지 */
export function recordResult(records: Records, mode: GameMode, result: GameResult): { records: Records; newBest: boolean } {
  const prev = records[mode];
  const next: ModeRecord = {
    score: Math.max(prev.score, result.score),
    maxChain: Math.max(prev.maxChain, result.maxChain),
    crystals: Math.max(prev.crystals, result.crystals),
  };
  return { records: { ...records, [mode]: next }, newBest: result.score > prev.score };
}

const MAX_VALUE = 1e12;

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_VALUE;
}

function parseRecord(value: unknown): ModeRecord | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (!validCount(r.score) || !validCount(r.maxChain) || !validCount(r.crystals)) return null;
  // 연쇄 수는 보드(72칸 ÷ 4)보다 클 수 없다
  if (r.maxChain > 18) return null;
  return { score: r.score, maxChain: r.maxChain, crystals: r.crystals };
}

/** 저장된 문자열 → 기록. 손상되었거나 형식이 다르면 해당 모드만(또는 전체를) 빈 기록으로 둔다. */
export function parseRecords(raw: string | null): Records {
  if (!raw) return emptyRecords();
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || data.version !== RECORDS_VERSION) return emptyRecords();
    return {
      version: RECORDS_VERSION,
      rush: parseRecord(data.rush) ?? emptyRecord(),
      endless: parseRecord(data.endless) ?? emptyRecord(),
    };
  } catch {
    return emptyRecords();
  }
}

export function serializeRecords(records: Records): string {
  return JSON.stringify(records);
}
