import type { GameMode } from "./config";

/**
 * 기록 저장 형식. 형식을 바꾸면 RECORDS_VERSION을 올린다.
 * v2: 3개 연결 규칙(점수 체계 변경). 예전 v1(4개 연결·90초) 기록은 지우지 않고 classic으로 옮겨 따로 보여 준다
 * (규칙이 달라 같은 표에서 비교하지 않는다). 그 밖의 알 수 없는 버전은 버린다.
 */
export const RECORDS_VERSION = 2;
const CLASSIC_VERSION = 1;

export interface ModeRecord {
  score: number;
  maxChain: number;
  crystals: number;
}

export interface ModeRecords {
  rush: ModeRecord;
  endless: ModeRecord;
}

export interface Records extends ModeRecords {
  version: typeof RECORDS_VERSION;
  /** 이전 규칙(v1: 4개 연결)으로 세운 기록. 없으면 null */
  classic: ModeRecords | null;
}

export interface GameResult {
  score: number;
  maxChain: number;
  crystals: number;
}

export function emptyRecords(): Records {
  return { version: RECORDS_VERSION, rush: emptyRecord(), endless: emptyRecord(), classic: null };
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

/** maxChainLimit: 보드 72칸 ÷ 터지는 최소 개수 (v2: 3개 → 24, v1: 4개 → 18) */
function parseRecord(value: unknown, maxChainLimit: number): ModeRecord | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (!validCount(r.score) || !validCount(r.maxChain) || !validCount(r.crystals)) return null;
  if (r.maxChain > maxChainLimit) return null;
  return { score: r.score, maxChain: r.maxChain, crystals: r.crystals };
}

function parseModes(data: Record<string, unknown>, maxChainLimit: number): ModeRecords {
  return {
    rush: parseRecord(data.rush, maxChainLimit) ?? emptyRecord(),
    endless: parseRecord(data.endless, maxChainLimit) ?? emptyRecord(),
  };
}

function hasScore(modes: ModeRecords) {
  return modes.rush.score > 0 || modes.endless.score > 0;
}

/** 저장된 문자열 → 기록. 손상되었거나 형식이 다르면 해당 모드만(또는 전체를) 빈 기록으로 둔다. */
export function parseRecords(raw: string | null): Records {
  if (!raw) return emptyRecords();
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== "object") return emptyRecords();
    if (data.version === CLASSIC_VERSION) {
      const classic = parseModes(data, 18);
      return { ...emptyRecords(), classic: hasScore(classic) ? classic : null };
    }
    if (data.version !== RECORDS_VERSION) return emptyRecords();
    const classic = data.classic && typeof data.classic === "object" ? parseModes(data.classic as Record<string, unknown>, 18) : null;
    return {
      version: RECORDS_VERSION,
      ...parseModes(data, 24),
      classic: classic && hasScore(classic) ? classic : null,
    };
  } catch {
    return emptyRecords();
  }
}

export function serializeRecords(records: Records): string {
  return JSON.stringify(records);
}
