import type { Board, Dir, Level, Tile } from "../types";

/*
 * 스테이지 지도 문자열 해석. 범례는 stages.ts 상단 주석과 같다.
 *   ' ' 창고 바깥   '#' 벽   '-' 바닥   'o' 목표   'B' 상자   'X' 목표 위 상자   'P' 로봇   'p' 목표 위 로봇
 *   '^' '>' 'v' '<' 컨베이어(화살표 방향)   '~' 얼음   '%' 얼음 위 목표   '1'~'4' 순간이동 장치(같은 숫자 두 개가 한 쌍)
 *   목표는 바닥·얼음에만 둔다(컨베이어·순간이동 장치 위에는 두지 않는다).
 */

const CONVEYOR: Record<string, Dir> = { "^": 0, ">": 1, v: 2, "<": 3 };

export function parseLevel(map: readonly string[]): Level {
  const rows = map.length;
  const cols = Math.max(...map.map((r) => r.length));
  const tiles: Tile[] = [];
  const targets = new Set<number>();
  const pads = new Map<number, number[]>();
  const boxes: number[] = [];
  let player = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = map[y][x] ?? " ";
      const cell = y * cols + x;
      let tile: Tile = { kind: "floor" };
      if (ch === " ") tile = { kind: "void" };
      else if (ch === "#") tile = { kind: "wall" };
      else if (ch === "~" || ch === "%") tile = { kind: "ice" };
      else if (ch in CONVEYOR) tile = { kind: "conveyor", dir: CONVEYOR[ch] };
      else if (/[1-4]/.test(ch)) {
        tile = { kind: "teleport", pair: Number(ch) };
        pads.set(Number(ch), [...(pads.get(Number(ch)) ?? []), cell]);
      } else if (!"-oBXPp%".includes(ch)) throw new Error(`unknown map char '${ch}' at ${x},${y}`);
      if ("oXp%".includes(ch)) targets.add(cell);
      if ("BX".includes(ch)) boxes.push(cell);
      if ("Pp".includes(ch)) {
        if (player >= 0) throw new Error("two players");
        player = cell;
      }
      tiles.push(tile);
    }
  }
  if (player < 0) throw new Error("no player");
  const partner = new Map<number, number>();
  for (const [pair, cells] of pads) {
    if (cells.length !== 2) throw new Error(`teleporter ${pair} needs exactly 2 pads`);
    partner.set(cells[0], cells[1]);
    partner.set(cells[1], cells[0]);
  }
  const start: Board = { player, boxes };
  return { cols, rows, tiles, targets, partner, start };
}
