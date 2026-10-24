import { BODY, LEDGE, TILE } from "../config";
import { COLS, ROWS, SOLIDS } from "../level";

/** 타일 지도 조회. 좌우 바깥과 천장 위는 벽으로, 바닥 아래는 빈 공간(낙하)으로 본다. */
export interface World {
  cols: number;
  rows: number;
  solids: Uint8Array;
}

export function createWorld(solids: Uint8Array = SOLIDS, cols = COLS, rows = ROWS): World {
  return { cols, rows, solids };
}

export function isSolid(world: World, col: number, row: number): boolean {
  if (col < 0 || col >= world.cols || row < 0) return true;
  if (row >= world.rows) return false;
  return world.solids[row * world.cols + col] === 1;
}

/** 직사각형 [left, right) × [top, bottom)이 벽과 겹치는지 */
export function rectHitsSolid(world: World, left: number, top: number, right: number, bottom: number): boolean {
  const c0 = Math.floor(left / TILE);
  const c1 = Math.floor((right - 1e-6) / TILE);
  const r0 = Math.floor(top / TILE);
  const r1 = Math.floor((bottom - 1e-6) / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (isSolid(world, c, r)) return true;
  return false;
}

/** 발 위치 (x, y)에 선 몸 충돌 상자가 벽과 겹치는지 */
export function bodyHitsSolid(world: World, x: number, y: number): boolean {
  return rectHitsSolid(world, x - BODY.halfWidth, y - BODY.height, x + BODY.halfWidth, y);
}

/** 난간: 벽면 x, 윗면 y, 그리고 그 난간을 잡을 때 바라보는 방향 */
export interface Ledge {
  x: number;
  y: number;
  dir: 1 | -1;
}

/**
 * (col, row) 타일의 dir 쪽을 바라보고 잡는 난간인지: 타일이 벽이고, 위·앞(플레이어 쪽)이 비어 있으며,
 * 매달린 몸 상자가 다른 벽과 겹치지 않아야 한다(바로 아래에 바닥이 있는 낮은 턱은 잡지 않는다).
 */
export function ledgeAt(world: World, col: number, row: number, dir: 1 | -1): Ledge | null {
  if (!isSolid(world, col, row) || isSolid(world, col, row - 1)) return null;
  if (isSolid(world, col - dir, row) || isSolid(world, col - dir, row - 1)) return null;
  const ledge: Ledge = { x: dir > 0 ? col * TILE : (col + 1) * TILE, y: row * TILE, dir };
  const hang = hangPosition(ledge);
  if (bodyHitsSolid(world, hang.x, hang.y)) return null;
  return ledge;
}

/** 매달린 자세의 발 위치 (손이 난간 모서리에 맞도록) */
export function hangPosition(ledge: Ledge): { x: number; y: number } {
  return { x: ledge.x - ledge.dir * LEDGE.hangOffsetX, y: ledge.y + LEDGE.hangDepth };
}

/** 올라온 뒤 발 위치 */
export function standPosition(ledge: Ledge): { x: number; y: number } {
  return { x: ledge.x + ledge.dir * LEDGE.standX, y: ledge.y };
}

/** 올라온 자리에 설 공간이 있는지 */
export function canClimb(world: World, ledge: Ledge): boolean {
  const stand = standPosition(ledge);
  return !bodyHitsSolid(world, stand.x, stand.y);
}

/**
 * 발 위치·방향 기준으로 손이 닿는 난간을 찾는다(가장 가까운 것).
 * 몸 앞면과 벽면 사이 거리, 손 높이(매달렸을 때의 손 위치)와 난간 윗면 사이 거리로 판정한다.
 */
export function findLedge(world: World, x: number, y: number, facing: 1 | -1): Ledge | null {
  const front = x + facing * BODY.halfWidth;
  const handY = y - LEDGE.hangDepth;
  const row0 = Math.ceil((handY - LEDGE.windowBelow) / TILE);
  const row1 = Math.floor((handY + LEDGE.windowAbove) / TILE);
  const col0 = Math.floor((front - TILE) / TILE);
  const col1 = Math.floor((front + TILE) / TILE);
  let best: Ledge | null = null;
  let bestScore = Infinity;
  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      const ledge = ledgeAt(world, col, row, facing);
      if (!ledge) continue;
      const gap = facing * (ledge.x - front);
      if (gap < LEDGE.reachMin || gap > LEDGE.reachMax) continue;
      const score = Math.abs(gap) + Math.abs(handY - ledge.y);
      if (score < bestScore) {
        best = ledge;
        bestScore = score;
      }
    }
  }
  return best;
}

/** 지도 전체의 잡을 수 있는 난간 (디버그 표시·지도 검증용) */
export function allLedges(world: World): Ledge[] {
  const out: Ledge[] = [];
  for (let row = 0; row < world.rows; row++) {
    for (let col = 0; col < world.cols; col++) {
      for (const dir of [1, -1] as const) {
        const ledge = ledgeAt(world, col, row, dir);
        if (ledge) out.push(ledge);
      }
    }
  }
  return out;
}

/** x 아래로 처음 만나는 바닥 윗면 y (없으면 null). 그림자 표시용 */
export function groundBelow(world: World, x: number, y: number, maxDepth = 400): number | null {
  const col = Math.floor(x / TILE);
  for (let row = Math.max(0, Math.floor(y / TILE)); row * TILE <= y + maxDepth && row < world.rows; row++) {
    if (isSolid(world, col, row) && !isSolid(world, col, row - 1) && row * TILE >= y - 1) return row * TILE;
  }
  return null;
}
