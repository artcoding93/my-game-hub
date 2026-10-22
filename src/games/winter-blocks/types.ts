/*
 * Winter Blocks 타입 정의.
 * 판 좌표: (x, y) = (열, 행). y=0이 맨 위(숨김 생성 영역)이고 y가 클수록 아래다.
 */

export const PIECE_TYPES = ["I", "O", "T", "S", "Z", "J", "L"] as const;
export type PieceType = (typeof PIECE_TYPES)[number];

/** 0: 생성 방향, 1: 시계 방향 90°, 2: 180°, 3: 반시계 방향 90° */
export type Rotation = 0 | 1 | 2 | 3;

export type CellKind = PieceType | "bump" | "snow";

export interface Cell {
  kind: CellKind;
  /** 얼음: solid(단단함) → cracked(금 감, 다음 검사 때 줄이 완성 상태면 제거) */
  ice?: "solid" | "cracked";
}

export type Board = (Cell | null)[][];

export interface ActivePiece {
  type: PieceType;
  rot: Rotation;
  x: number;
  y: number;
}

export type GamePhase = "title" | "playing" | "paused" | "gameOver";

/** 고정 이후 진행 단계: 조작 중 → 혹 연출 → 줄 제거 연출 */
export type Stage = "falling" | "settle" | "clear";

export interface Point {
  x: number;
  y: number;
}

export interface WindState {
  dir: -1 | 1;
  /** 바람이 불 때까지 남은 시간 */
  timer: number;
}

export interface GameState {
  phase: GamePhase;
  stage: Stage;
  stageTimer: number;
  board: Board;
  active: ActivePiece | null;
  hold: PieceType | null;
  holdUsed: boolean;
  /** 다음 블록들 (앞에서부터) */
  queue: PieceType[];
  /** 시드 난수 상태 (mulberry32) */
  rng: number;
  score: number;
  lines: number;
  level: number;
  /** 연속 줄 제거 횟수 (-1이면 콤보 없음) */
  combo: number;
  dropTimer: number;
  lockTimer: number;
  lockResets: number;
  /** 고정된 블록 수 */
  pieces: number;
  /** 길게 누르기 반복 상태 */
  repeatDir: -1 | 0 | 1;
  repeatTimer: number;
  /** 줄 제거 연출 중인 줄 */
  clearingRows: number[];
  /** 방해 효과 */
  lastIcePiece: number;
  lastWindPiece: number;
  lastSnowPiece: number;
  /** 마지막 방해 효과가 일어난 블록 번호 (쿨다운) */
  lastHazardPiece: number;
  wind: WindState | null;
  /** 다음 고정 때 눈 블록이 쌓일 열 (미리 표시) */
  snowColumn: number | null;
  /** 레벨업 안내 표시 남은 시간 */
  banner: { level: number; timer: number } | null;
  /** 이번 게임 최고 점수 비교용 */
  highScore: number;
  /** 연출용 시간 (초) */
  time: number;
}

export interface InputSnapshot {
  /** 누르고 있는 좌우 방향 (둘 다 누르면 나중에 누른 쪽) */
  move: -1 | 0 | 1;
  softDrop: boolean;
  rotateCW: boolean;
  rotateCCW: boolean;
  hardDrop: boolean;
  hold: boolean;
}

export type GameEvent =
  | { type: "start" }
  | { type: "move" }
  | { type: "rotate" }
  | { type: "softDrop" }
  | { type: "hardDrop"; distance: number }
  | { type: "lock"; cells: Point[] }
  | { type: "bump"; cells: Point[] }
  | { type: "lineClear"; rows: number[]; count: number; combo: number; points: number }
  | { type: "iceCreate"; cell: Point }
  | { type: "iceCrack"; rows: number[] }
  | { type: "windWarn"; dir: -1 | 1 }
  | { type: "wind"; dir: -1 | 1; moved: boolean }
  | { type: "snowWarn"; column: number }
  | { type: "snowfall"; cell: Point }
  | { type: "hold" }
  | { type: "levelUp"; level: number }
  | { type: "gameOver" };
