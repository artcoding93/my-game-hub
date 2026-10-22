import type { PieceType, Point, Rotation } from "../types";

/*
 * 7종 4칸 블록 모양과 회전.
 * 각 블록은 n×n 상자 안의 칸 목록으로 정의하고(0번 방향), 시계 방향 회전은 상자 안에서 (x, y) → (n-1-y, x)로 계산한다.
 * 벽 밀기(wall kick)는 낙하형 블록 퍼즐에서 널리 쓰이는 표준 회전 규칙(SRS)의 오프셋 표를 따른다.
 */

interface Shape {
  size: number;
  cells: Point[];
}

const SHAPES: Record<PieceType, Shape> = {
  I: { size: 4, cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }] },
  O: { size: 2, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
  T: { size: 3, cells: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
  S: { size: 3, cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
  Z: { size: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
  J: { size: 3, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
  L: { size: 3, cells: [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
};

/** 회전 방향별 칸 (미리 계산) */
const ROTATED: Record<PieceType, Point[][]> = Object.fromEntries(
  (Object.keys(SHAPES) as PieceType[]).map((type) => {
    const { size, cells } = SHAPES[type];
    const states: Point[][] = [cells];
    for (let r = 1; r < 4; r++) states.push(states[r - 1].map(({ x, y }) => ({ x: size - 1 - y, y: x })));
    return [type, states];
  }),
) as Record<PieceType, Point[][]>;

export function shapeCells(type: PieceType, rot: Rotation): Point[] {
  return ROTATED[type][rot];
}

export function shapeSize(type: PieceType): number {
  return SHAPES[type].size;
}

/** 생성 위치 (판 가운데, 숨김 줄) */
export function spawnX(type: PieceType, cols: number): number {
  return Math.floor((cols - SHAPES[type].size) / 2);
}

// 표의 y는 위쪽이 +이므로, 판 좌표(아래쪽이 +)로 쓸 때 부호를 바꾼다.
type Kick = [number, number];
const JLSTZ_KICKS: Record<string, Kick[]> = {
  "0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const I_KICKS: Record<string, Kick[]> = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

/** 회전할 때 차례로 시도하는 위치 이동 (판 좌표) */
export function kicks(type: PieceType, from: Rotation, to: Rotation): Point[] {
  if (type === "O") return [{ x: 0, y: 0 }];
  const table = type === "I" ? I_KICKS : JLSTZ_KICKS;
  return table[`${from}>${to}`].map(([x, y]) => ({ x, y: -y }));
}
