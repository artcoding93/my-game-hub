import type { GameMode } from "./config";

/** 크리스털 색 1~5 (0 = 빈칸) */
export type Color = 1 | 2 | 3 | 4 | 5;
export type Cell = Color | 0;

/** board[y][x], y = 0이 맨 위 */
export type Board = Cell[][];

/** 붙어 있는 쪽 크리스털의 방향: 0 위 · 1 오른쪽 · 2 아래 · 3 왼쪽 */
export type Orientation = 0 | 1 | 2 | 3;

/** 떨어지는 크리스털 쌍. 축(pivot)을 중심으로 짝(child)이 돈다. */
export interface Pair {
  x: number;
  y: number;
  orientation: Orientation;
  pivot: Color;
  child: Color;
}

export interface Crystal {
  x: number;
  y: number;
  color: Color;
}

export interface Fall {
  x: number;
  fromY: number;
  toY: number;
  color: Color;
}

export type GamePhase = "title" | "ready" | "playing" | "paused" | "over";
export type EndReason = "time" | "topout";

/**
 * 크리스털 쌍이 고정된 뒤의 연쇄 처리. 이 동안 입력·새 쌍 생성·타이머가 멈춘다.
 * drop(중력 낙하 연출) → 터질 그룹이 있으면 pop(반짝임) → drop … → 없으면 끝.
 */
export interface Resolve {
  stage: "drop" | "pop";
  timer: number;
  duration: number;
  /** 지금까지 진행한 연쇄 단계 수 (아직 안 터졌으면 0) */
  chain: number;
  /** 이번 연쇄에서 얻은 점수 합 */
  total: number;
  /** drop 단계에서 떨어지는 크리스털 (화면 보간용) */
  falls: Fall[];
  /** pop 단계에서 터지는 크리스털 */
  popping: Crystal[];
}

export interface GameState {
  mode: GameMode;
  phase: GamePhase;
  /** 일시정지 직전 단계 (ready·playing) */
  resumePhase: "ready" | "playing";
  board: Board;
  active: Pair | null;
  /** 다음 쌍 [pivot, child] (앞에서부터) */
  queue: [Color, Color][];
  bag: [Color, Color][];
  rng: number;

  /** 남은 시간 (Rush). Endless는 Infinity */
  timeLeft: number;
  /** 실제로 조작한 시간 (낙하 속도 기준, 줄지 않음) */
  playTime: number;
  readyTimer: number;
  speed: number;

  gravityTimer: number;
  lockTimer: number;
  lockResets: number;
  /** 길게 누를 때 반복 이동 */
  moveDir: -1 | 0 | 1;
  dasTimer: number;

  resolve: Resolve | null;
  score: number;
  crystals: number;
  maxChain: number;
  /** 가장 최근에 끝난 연쇄 (화면 표시용) */
  lastChain: number;
  pairs: number;
  endReason: EndReason | null;
  /** 시간 보너스가 이미 지급된 연쇄 번호 (중복 지급 방지) */
  bonusPaidFor: number;
  resolveId: number;
}

export interface InputSnapshot {
  move: -1 | 0 | 1;
  softDrop: boolean;
  rotateCW: boolean;
  rotateCCW: boolean;
  hardDrop: boolean;
}

export const NO_INPUT: InputSnapshot = { move: 0, softDrop: false, rotateCW: false, rotateCCW: false, hardDrop: false };

export type GameEvent =
  | { type: "start"; mode: GameMode }
  | { type: "go" }
  | { type: "spawn" }
  | { type: "move" }
  | { type: "rotate" }
  | { type: "softStep" }
  | { type: "land"; hard: boolean; cells: number }
  | { type: "settle" }
  | { type: "pop"; chain: number; crystals: Crystal[]; groups: number; points: number }
  | { type: "chainEnd"; chain: number; total: number; bonus: number }
  | { type: "timeBonus"; seconds: number }
  | { type: "countdown"; seconds: number }
  | { type: "speedUp"; level: number }
  | { type: "gameOver"; reason: EndReason };
