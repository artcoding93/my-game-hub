/** Cargo Bot 공용 타입. 규칙은 logic/, 스테이지 데이터는 stages.ts, 그리기는 render/에 있다. */

/** 0 = 위, 1 = 오른쪽, 2 = 아래, 3 = 왼쪽 */
export type Dir = 0 | 1 | 2 | 3;

export const DIRS: readonly Dir[] = [0, 1, 2, 3];
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

/**
 * 바닥 종류. wall·void는 지나갈 수 없다(void는 창고 바깥이라 그리지 않는다).
 * 특수 타일(conveyor·ice·teleport)은 상자에만 작용한다. 로봇은 자석 바퀴로 그냥 걸어 다닌다.
 */
export type Tile =
  | { kind: "void" }
  | { kind: "wall" }
  | { kind: "floor" }
  | { kind: "ice" }
  | { kind: "conveyor"; dir: Dir }
  | { kind: "teleport"; pair: number };

export interface Level {
  cols: number;
  rows: number;
  tiles: Tile[];
  /** 목표 위치(칸 번호) */
  targets: ReadonlySet<number>;
  /** 순간이동 장치: 칸 번호 → 짝 칸 번호 */
  partner: ReadonlyMap<number, number>;
  start: Board;
}

/**
 * 한 시점의 논리 상태. boxes[i]는 상자 i의 칸 번호이며 상자 순서(정체성)는 바뀌지 않는다(애니메이션용).
 * 불변 값으로만 다룬다: 이동하면 새 Board를 만든다.
 */
export interface Board {
  player: number;
  boxes: readonly number[];
}

/** 상자 한 개가 한 턴 동안 지나간 경로. 각 단계는 어떤 효과로 움직였는지 함께 기록한다(애니메이션·효과음) */
export type BoxStepKind = "push" | "conveyor" | "ice" | "teleport";

export interface BoxMove {
  box: number;
  from: number;
  path: { cell: number; kind: BoxStepKind }[];
  /** 무한 순환을 감지해 멈췄는지 */
  looped: boolean;
}

export interface StepResult {
  board: Board;
  /** 로봇이 움직였는지 (false면 벽·밀 수 없는 상자에 막힘) */
  moved: boolean;
  dir: Dir;
  playerFrom: number;
  /** 상자를 밀었으면 그 상자의 경로 */
  box: BoxMove | null;
}
