import { GAME_CONFIG } from "./config";
import type { RestoreData } from "./logic/simulation";
import { initialStatues } from "./logic/simulation";
import { ITEM_IDS, ROOM_IDS, type GameState, type ItemId, type RoomId } from "./types";

/*
 * 진행 상태 저장 형식 (localStorage, 브라우저에만 저장).
 * 이어하기는 마지막으로 들어온 방의 출입구(체크포인트)에서 다시 시작한다.
 * 데이터가 손상되었거나 형식이 다르면 null을 돌려주고, 호출하는 쪽은 저장을 지운 뒤 새 게임으로 시작한다.
 */

export const SAVE_VERSION = 1;

export interface SaveData {
  v: typeof SAVE_VERSION;
  checkpoint: RestoreData["checkpoint"];
  health: number;
  inventory: Partial<Record<ItemId, number>>;
  selected: ItemId | null;
  flags: string[];
  visited: RoomId[];
  statues: Record<string, { x: number; locked: boolean }>;
  score: number;
  time: number;
}

export function toSaveData(state: GameState): SaveData {
  const inventory: SaveData["inventory"] = {};
  for (const id of ITEM_IDS) if (state.inventory[id] > 0) inventory[id] = state.inventory[id];
  return {
    v: SAVE_VERSION,
    checkpoint: { ...state.checkpoint },
    health: state.health,
    inventory,
    selected: state.selected,
    flags: [...state.flags].sort(),
    visited: [...state.visited],
    statues: Object.fromEntries(Object.entries(state.statues).map(([id, s]) => [id, { x: Math.round(s.x * 10) / 10, locked: s.locked }])),
    score: state.score,
    time: Math.round(state.time * 10) / 10,
  };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const isNum = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const isRoom = (value: unknown): value is RoomId => typeof value === "string" && (ROOM_IDS as readonly string[]).includes(value);
const isItem = (value: unknown): value is ItemId => typeof value === "string" && (ITEM_IDS as readonly string[]).includes(value);

/** 진행 플래그로 쓰일 수 있는 형식 */
const FLAG_PATTERN = /^(open|chest|searched|coin|secret|puzzle|relic):[\w:-]{1,60}$/;

/** 검증을 통과한 경우에만 이어하기 데이터를 돌려준다. */
export function parseSaveData(raw: string | null): RestoreData | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data) || data.v !== SAVE_VERSION) return null;

  const cp = data.checkpoint;
  if (!isObject(cp) || !isRoom(cp.room)) return null;
  if (!isNum(cp.x, 0, GAME_CONFIG.width) || !isNum(cp.y, 0, GAME_CONFIG.height + 20)) return null;
  if (typeof cp.climbing !== "boolean" || (cp.facing !== 1 && cp.facing !== -1)) return null;
  if (!isInt(data.health, 1, GAME_CONFIG.maxHealth)) return null;
  if (!isInt(data.score, 0, 1e7) || !isNum(data.time, 0, 1e7)) return null;

  const inventory: Partial<Record<ItemId, number>> = {};
  if (!isObject(data.inventory)) return null;
  for (const [id, count] of Object.entries(data.inventory)) {
    if (!isItem(id) || !isInt(count, 0, 99)) return null;
    inventory[id] = count;
  }
  if (data.selected !== null && !isItem(data.selected)) return null;

  if (!Array.isArray(data.flags) || !data.flags.every((f) => typeof f === "string" && FLAG_PATTERN.test(f))) return null;
  if (!Array.isArray(data.visited) || !data.visited.every(isRoom)) return null;

  const known = initialStatues();
  const statues: RestoreData["statues"] = {};
  if (!isObject(data.statues)) return null;
  for (const [id, value] of Object.entries(data.statues)) {
    if (!(id in known) || !isObject(value) || !isNum(value.x, 0, GAME_CONFIG.width) || typeof value.locked !== "boolean") return null;
    statues[id] = { x: value.x, locked: value.locked };
  }

  const checkpoint = { room: cp.room, x: cp.x, y: cp.y, climbing: cp.climbing, facing: cp.facing } as RestoreData["checkpoint"];
  const visited = [...new Set([...data.visited, checkpoint.room])] as RoomId[];
  const selected = data.selected !== null && (inventory[data.selected] ?? 0) > 0 ? data.selected : null;
  return {
    checkpoint,
    health: data.health,
    inventory: inventory as Record<ItemId, number>,
    selected,
    flags: data.flags as string[],
    visited,
    statues,
    score: data.score,
    time: data.time,
  };
}
