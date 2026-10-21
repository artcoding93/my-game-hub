import { GAME_CONFIG } from "../config";
import type { ExitDef, ParsedRoom, PlacedEntity } from "../types";
import { isSupport } from "./physics";
import { entityCells, type TileQuery } from "./world";

/*
 * 지도 검증용 이동 모델 (게임 실행에는 쓰지 않는다).
 * 플레이어가 "설 수 있는 칸"을 노드로 보고, 걷기·떨어지기·점프·사다리 이동으로 갈 수 있는 칸을 BFS로 찾는다.
 * 점프 한계는 실제 물리(config.player)보다 보수적으로 잡는다: 위로 2칸(가로 2칸까지), 같은 높이·아래로 3칸.
 * logic/physics.test.ts가 이 한계를 실제 물리로 넘을 수 있는지 확인한다.
 */

const { cols: COLS, rows: ROWS } = GAME_CONFIG;

/** 플레이어 위치: 발이 row 칸 안(바닥은 row+1)에 있고, climbing이면 사다리에 매달려 있다. */
export interface NavNode {
  col: number;
  row: number;
  climbing: boolean;
}

export const nodeKey = (n: NavNode) => `${n.col},${n.row},${n.climbing ? 1 : 0}`;

const free = (q: TileQuery, col: number, row: number) => q(col, row) !== "solid";

/** 몸(발 칸과 그 위 칸)이 들어갈 수 있는지 */
function bodyFree(q: TileQuery, col: number, row: number) {
  return free(q, col, row) && free(q, col, row - 1);
}

export function standable(q: TileQuery, col: number, row: number) {
  if (col < 0 || col >= COLS || row < 1 || row >= ROWS) return false;
  return bodyFree(q, col, row) && isSupport(q, col, row + 1);
}

/** (col,row)에서 아래로 떨어져 처음 닿는 설 수 있는 칸 */
function fallFrom(q: TileQuery, col: number, row: number): NavNode | null {
  for (let r = row; r < ROWS; r++) {
    if (!free(q, col, r)) return null;
    if (isSupport(q, col, r + 1)) return { col, row: r, climbing: false };
  }
  return null;
}

/** 직사각형 영역이 모두 비어 있는지 */
function clearBox(q: TileQuery, c0: number, c1: number, r0: number, r1: number) {
  for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) for (let r = r0; r <= r1; r++) if (!free(q, c, r)) return false;
  return true;
}

function neighbors(q: TileQuery, n: NavNode): NavNode[] {
  const out: NavNode[] = [];
  const { col, row } = n;

  if (n.climbing) {
    // 사다리 위아래
    if (q(col, row - 1) === "ladder" && free(q, col, row - 2)) out.push({ col, row: row - 1, climbing: true });
    else if (q(col, row - 1) !== "ladder" && bodyFree(q, col, row - 1)) out.push({ col, row: row - 1, climbing: false });
    if (q(col, row + 1) === "ladder") out.push({ col, row: row + 1, climbing: true });
    else if (isSupport(q, col, row + 1)) out.push({ col, row, climbing: false });
    // 사다리 옆 발판으로 내리기
    for (const dc of [-1, 1]) if (standable(q, col + dc, row)) out.push({ col: col + dc, row, climbing: false });
    return out;
  }

  // 사다리 잡기
  if (q(col, row) === "ladder" || q(col, row - 1) === "ladder") out.push({ col, row, climbing: true });
  if (q(col, row + 1) === "ladder") out.push({ col, row: row + 1, climbing: true });

  for (const dc of [-1, 1]) {
    // 걷기, 또는 가장자리에서 떨어지기
    if (bodyFree(q, col + dc, row)) {
      const landing = fallFrom(q, col + dc, row);
      if (landing) out.push(landing);
    }
    // 점프: 위로 dy칸, 옆으로 dx칸
    for (let dy = 1; dy <= 2; dy++) {
      for (let dx = 0; dx <= (dy === 2 ? 2 : 3); dx++) {
        const tc = col + dc * dx;
        const tr = row - dy;
        if (!standable(q, tc, tr)) continue;
        // 출발 칸 위로 머리 공간, 이동 경로 전체에 몸이 지나갈 공간이 필요하다.
        if (!clearBox(q, col, col, row - dy - 1, row)) continue;
        if (!clearBox(q, col, tc, tr - 1, tr)) continue;
        out.push({ col: tc, row: tr, climbing: false });
      }
    }
    // 같은 높이로 틈 건너뛰기 (최대 3칸) 또는 조금 아래로 뛰어내리기
    for (let dx = 2; dx <= 3; dx++) {
      const tc = col + dc * dx;
      if (!clearBox(q, col, tc, row - 2, row)) continue;
      const landing = fallFrom(q, tc, row);
      if (landing) out.push(landing);
    }
  }
  return out;
}

/** start에서 갈 수 있는 모든 위치 */
export function reachable(q: TileQuery, start: NavNode): Map<string, NavNode> {
  const seen = new Map<string, NavNode>([[nodeKey(start), start]]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const next of neighbors(q, node)) {
      if (next.col < 0 || next.col >= COLS || next.row < 0 || next.row >= ROWS) continue;
      const key = nodeKey(next);
      if (seen.has(key)) continue;
      seen.set(key, next);
      queue.push(next);
    }
  }
  return seen;
}

/** 출입구로 들어왔을 때의 위치 */
export function entryNode(exit: ExitDef): NavNode {
  switch (exit.side) {
    case "left":
      return { col: 1, row: exit.to, climbing: false };
    case "right":
      return { col: COLS - 2, row: exit.to, climbing: false };
    case "up":
      return { col: exit.from, row: 1, climbing: true };
    case "down":
      return { col: exit.from, row: ROWS - 1, climbing: true };
  }
}

/** 이 위치에서 출입구로 나갈 수 있는지 */
export function canLeave(n: NavNode, exit: ExitDef, q: TileQuery): boolean {
  switch (exit.side) {
    case "left":
      return !n.climbing && n.col <= 1 && n.row === exit.to && free(q, 0, n.row) && free(q, 0, n.row - 1);
    case "right":
      return !n.climbing && n.col >= COLS - 2 && n.row === exit.to && free(q, COLS - 1, n.row) && free(q, COLS - 1, n.row - 1);
    case "up":
      return n.col >= exit.from && n.col <= exit.to && n.row <= 1 && q(n.col, 0) === "ladder" && (n.climbing || q(n.col, n.row) === "ladder");
    case "down":
      return n.col >= exit.from && n.col <= exit.to && n.row >= ROWS - 2 && q(n.col, ROWS - 1) === "ladder" && (n.climbing || q(n.col, n.row + 1) === "ladder");
  }
}

/** 오브젝트를 조사할 수 있는 위치인지 (가로 1칸, 세로로 몸이 걸치는 범위) */
export function canTouch(n: NavNode, entity: PlacedEntity): boolean {
  const cells = entityCells(entity);
  const top = Math.min(...cells.map((c) => c.row));
  const bottom = entity.row;
  if (Math.abs(n.col - entity.col) > 1) return false;
  // 플레이어 몸은 row-1 ~ row 칸
  return n.row - 1 <= bottom + 1 && n.row >= top - 1;
}

export function reachableExits(room: ParsedRoom, q: TileQuery, nodes: Iterable<NavNode>): ExitDef[] {
  const list = [...nodes];
  return room.def.exits.filter((exit) => list.some((n) => canLeave(n, exit, q)));
}
