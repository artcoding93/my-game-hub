import { COLS, POP_SIZE, ROWS } from "../config";
import type { Board, Cell, Color, Crystal, Fall, Orientation, Pair } from "../types";

/*
 * 보드 규칙 (순수 함수). 화면·입력과 무관하다.
 * - 좌표: x 0~5(왼→오), y 0~11(위→아래). 보드 위(y < 0)는 비어 있는 공간으로 보고, 떨어지는 쌍의 짝이 잠시 머무를 수 있다.
 * - 연결: 상하좌우만 인정한다(대각선 제외). 너비 우선 탐색(BFS)으로 같은 색 그룹을 찾는다.
 */

export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

/** 칸이 비어 있는지 (벽·바닥 밖은 막힘, 천장 위는 빈 공간) */
export function isFree(board: Board, x: number, y: number): boolean {
  if (x < 0 || x >= COLS || y >= ROWS) return false;
  return y < 0 || board[y][x] === 0;
}

export function pairCells(pair: Pair): [Crystal, Crystal] {
  return [
    { x: pair.x, y: pair.y, color: pair.pivot },
    { x: pair.x + DX[pair.orientation], y: pair.y + DY[pair.orientation], color: pair.child },
  ];
}

export function fits(board: Board, pair: Pair): boolean {
  return pairCells(pair).every((c) => isFree(board, c.x, c.y));
}

export function shifted(pair: Pair, dx: number, dy: number): Pair {
  return { ...pair, x: pair.x + dx, y: pair.y + dy };
}

/**
 * 회전 (dir 1 = 시계, -1 = 반시계). 짝이 들어갈 자리가 막혔으면 축을 반대쪽으로 한 칸 밀어 본다(벽·바닥 밀어내기).
 * 양옆이 모두 막힌 세로 통로에서는 위아래를 뒤집는다(빠른 반 바퀴). 어느 것도 안 되면 null.
 */
export function rotate(board: Board, pair: Pair, dir: 1 | -1): Pair | null {
  const target = ((pair.orientation + dir + 4) % 4) as Orientation;
  const turned = tryOrientation(board, pair, target);
  if (turned) return turned;
  if (target === 1 || target === 3) return tryOrientation(board, pair, ((pair.orientation + 2) % 4) as Orientation);
  return null;
}

function tryOrientation(board: Board, pair: Pair, orientation: Orientation): Pair | null {
  const turned = { ...pair, orientation };
  if (fits(board, turned)) return turned;
  const kicked = shifted(turned, -DX[orientation], -DY[orientation]);
  return fits(board, kicked) ? kicked : null;
}

/** 지금 쌍을 그대로 내렸을 때 내려갈 수 있는 칸 수 */
export function dropDistance(board: Board, pair: Pair): number {
  let d = 0;
  while (fits(board, shifted(pair, 0, d + 1))) d++;
  return d;
}

/** 크리스털을 보드에 놓는다. 천장 위(y < 0)에 남은 크리스털은 놓을 곳이 없어 사라진다. */
export function place(board: Board, crystals: readonly Crystal[]): number {
  let placed = 0;
  for (const c of crystals) {
    if (c.y < 0 || c.y >= ROWS || c.x < 0 || c.x >= COLS) continue;
    board[c.y][c.x] = c.color;
    placed++;
  }
  return placed;
}

/** 중력: 열마다 빈칸 위의 크리스털을 아래로 모은다. 보드를 직접 바꾸고 떨어진 크리스털 목록을 돌려준다. */
export function applyGravity(board: Board): Fall[] {
  const falls: Fall[] = [];
  for (let x = 0; x < COLS; x++) {
    let write = ROWS - 1;
    for (let y = ROWS - 1; y >= 0; y--) {
      const color = board[y][x];
      if (color === 0) continue;
      if (write !== y) {
        board[write][x] = color;
        board[y][x] = 0;
        falls.push({ x, fromY: y, toY: write, color });
      }
      write--;
    }
  }
  return falls;
}

/** 같은 색으로 상하좌우 연결된 그룹 중 POP_SIZE개 이상인 것 (BFS) */
export function findGroups(board: Board, minSize = POP_SIZE): Crystal[][] {
  const seen = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  const groups: Crystal[][] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const color = board[y][x];
      if (color === 0 || seen[y][x]) continue;
      const group: Crystal[] = [];
      const queue: [number, number][] = [[x, y]];
      seen[y][x] = true;
      while (queue.length > 0) {
        const [cx, cy] = queue.shift()!;
        group.push({ x: cx, y: cy, color });
        for (let d = 0; d < 4; d++) {
          const nx = cx + DX[d];
          const ny = cy + DY[d];
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || seen[ny][nx] || board[ny][nx] !== color) continue;
          seen[ny][nx] = true;
          queue.push([nx, ny]);
        }
      }
      if (group.length >= minSize) groups.push(group);
    }
  }
  return groups;
}

/** 즉시 낙하했을 때 두 크리스털이 각각 멈출 자리 (쌍이 갈라져 한쪽이 더 떨어지는 경우 포함, 미리보기용) */
export function landingCells(board: Board, pair: Pair): Crystal[] {
  const landed = pairCells(shifted(pair, 0, dropDistance(board, pair)));
  // 아래쪽 크리스털부터 놓아야 같은 열의 위 크리스털이 그 위에 쌓인다
  const order = [...landed].sort((a, b) => b.y - a.y);
  const heights = new Map<number, number>();
  return order.map((c) => {
    let y = heights.get(c.x);
    if (y === undefined) {
      y = c.y;
      while (y + 1 < ROWS && isFree(board, c.x, y + 1)) y++;
    }
    heights.set(c.x, y - 1);
    return { ...c, y };
  });
}

/** 테스트·디버깅용: 문자열 지도 → 보드. "." 빈칸, 1~5 색 (아래쪽 줄을 맞춰 위를 빈칸으로 채운다) */
export function boardFrom(rows: readonly string[]): Board {
  const board = emptyBoard();
  const offset = ROWS - rows.length;
  rows.forEach((row, i) => {
    for (let x = 0; x < COLS; x++) {
      const ch = row[x] ?? ".";
      board[offset + i][x] = ch === "." ? 0 : (Number(ch) as Color);
    }
  });
  return board;
}
