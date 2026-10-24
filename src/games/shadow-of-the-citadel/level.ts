import { TILE } from "./config";

/*
 * 움직임 검증용 테스트 공간 하나 (100 × 20 타일, 좌→우 진행).
 * 높이 기준: 바닥 윗면 = 15행(y 480). 캐릭터 키 ≈ 2.4타일, 제자리 점프 ≈ 2.5타일, 달리기 점프 ≈ 4.5타일.
 *
 *  1 긴 평지 (2~27열)          걷기·달리기·정지
 *  2 짧은 틈 (28~29열, 2칸)     걷기 점프로 건넌다
 *  3 넓은 틈 (36~39열, 4칸)     달리기 점프만 건넌다. 거리가 모자라면 건너편 난간을 잡는다
 *  4 높이가 다른 플랫폼          2칸(점프로 오름)·3칸·3칸 계단 → 최고 7행. 7행에서 바닥까지 8칸(큰 착지), 3칸 받침(중간 착지)
 *  5 떠 있는 석판 (44~47열)      아래에서 제자리 점프로 잡고 매달리기·손 놓기
 *  6 높은 플랫폼 (58~61열)       난간 두 번 오르기
 *  7 좁은 회랑 (76~95열, 높이 3칸) 방향 전환·정지
 *
 * 틈 아래는 바닥이 없다(떨어지면 테스트 위치로 리셋).
 */

export const COLS = 100;
export const ROWS = 20;

/** 바닥 윗면 y */
export const FLOOR_Y = 15 * TILE;

export interface TestSpot {
  key: string;
  label: string;
  /** 발 위치 (x 가운데, y 바닥) */
  x: number;
  y: number;
  facing: 1 | -1;
}

const spot = (key: string, label: string, col: number, row: number, facing: 1 | -1 = 1): TestSpot => ({
  key,
  label,
  x: (col + 0.5) * TILE,
  y: row * TILE,
  facing,
});

export const TEST_SPOTS: TestSpot[] = [
  spot("1", "긴 평지", 5, 15),
  spot("2", "짧은 틈", 22, 15),
  spot("3", "넓은 틈", 30, 15),
  spot("4", "매달리기", 41, 15),
  spot("5", "높이 차 플랫폼", 49, 15),
  spot("6", "높은 플랫폼 위", 59, 7),
  spot("7", "좁은 회랑", 82, 15),
];

export type DecorKind = "torch" | "column" | "alcove" | "banner" | "opening";

export interface Decor {
  kind: DecorKind;
  /** 타일 좌표 (열, 행). torch는 받침대 위치, column·alcove는 바닥 쪽 아래 끝, opening은 뒤 회랑이 보이는 아치 창의 왼쪽 아래 (폭 4칸) */
  col: number;
  row: number;
}

function buildSolids(): Uint8Array {
  const grid = new Uint8Array(COLS * ROWS);
  const fill = (c0: number, c1: number, r0: number, r1: number) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r * COLS + c] = 1;
  };
  fill(0, 99, 0, 0); // 천장
  fill(0, 1, 0, 19); // 왼쪽 벽
  fill(98, 99, 0, 19); // 오른쪽 벽
  fill(2, 27, 15, 19); // 1 긴 평지
  // 28~29: 짧은 틈
  fill(30, 35, 15, 19); // 두 틈 사이 발판
  // 36~39: 넓은 틈
  fill(40, 97, 15, 19); // 나머지 바닥
  fill(44, 47, 11, 11); // 5 떠 있는 석판 (아래 통로 높이 3칸)
  fill(50, 53, 13, 14); // 4 계단 1 (2칸)
  fill(54, 57, 10, 14); // 계단 2 (+3칸)
  fill(58, 61, 7, 14); // 6 높은 플랫폼 (+3칸)
  fill(66, 68, 12, 14); // 중간 받침 (3칸)
  fill(76, 95, 1, 11); // 7 회랑 천장 (통로 12~14행)
  return grid;
}

export const SOLIDS = buildSolids();

export const DECOR: Decor[] = [
  { kind: "opening", col: 3, row: 12 },
  { kind: "opening", col: 27, row: 12 },
  { kind: "opening", col: 36, row: 12 },
  { kind: "opening", col: 51, row: 9 },
  { kind: "opening", col: 66, row: 10 },
  { kind: "column", col: 8, row: 15 },
  { kind: "torch", col: 12, row: 11 },
  { kind: "alcove", col: 17, row: 15 },
  { kind: "column", col: 21, row: 15 },
  { kind: "torch", col: 25, row: 11 },
  { kind: "banner", col: 32, row: 6 },
  { kind: "torch", col: 34, row: 11 },
  { kind: "column", col: 42, row: 15 },
  { kind: "torch", col: 49, row: 10 },
  { kind: "banner", col: 56, row: 4 },
  { kind: "torch", col: 63, row: 11 },
  { kind: "alcove", col: 71, row: 15 },
  { kind: "torch", col: 74, row: 11 },
  { kind: "torch", col: 81, row: 13 },
  { kind: "torch", col: 89, row: 13 },
];
