import type { Direction, Point } from "./types";

/** 보드 한 변의 칸 수 (20×20) */
export const GRID_SIZE = 20;

/** 캔버스 내부 해상도 기준 한 칸의 픽셀 크기 (CSS로 반응형 축소/확대) */
export const CELL_SIZE = 24;

export const BOARD_PIXELS = GRID_SIZE * CELL_SIZE;

export const INITIAL_SNAKE_LENGTH = 3;

export const INITIAL_DIRECTION: Direction = "right";

/** 한 틱(한 칸 이동)당 시간(ms) */
export const TICK_MS = 120;

export const POINTS_PER_FOOD = 10;

/** 한 틱 사이에 미리 받아 둘 수 있는 방향 입력 수 */
export const MAX_QUEUED_TURNS = 2;

export const HIGH_SCORE_STORAGE_KEY = "my-game-hub:snake-classic:high-score";

export const DIRECTION_VECTORS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

/** 레트로 아케이드 팔레트 */
export const COLORS = {
  board: "#000000",
  gridDot: "#14281a",
  snakeHead: "#7CFF6B",
  snakeBody: "#22C55E",
  snakeShade: "#15803D",
  snakeEye: "#000000",
  food: "#FF2E2E",
  foodHighlight: "#FF9C9C",
} as const;
