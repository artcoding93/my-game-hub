export interface Point {
  x: number;
  y: number;
}

export type Direction = "up" | "down" | "left" | "right";

/** won: 뱀이 보드를 가득 채워 더 이상 먹이를 놓을 수 없는 상태 */
export type SnakeStatus = "ready" | "playing" | "paused" | "over" | "won";

export interface SnakeState {
  /** 0번 인덱스가 머리 */
  snake: Point[];
  /** 마지막 틱에 실제로 이동한 방향 */
  direction: Direction;
  /**
   * 다음 틱들에 적용할 방향 입력 대기열 (최대 MAX_QUEUED_TURNS개).
   * 한 틱 안에 빠르게 두 번 꺾는 입력(예: → 진행 중 ↑ → ←)을 잃지 않으면서
   * 정반대 방향으로의 즉시 회전도 막기 위해 사용한다.
   */
  queuedDirections: Direction[];
  /** 보드가 가득 차면 null */
  food: Point | null;
  score: number;
  highScore: number;
  /** 이번 판에서 최고 점수를 경신했는지 */
  isNewHighScore: boolean;
  status: SnakeStatus;
}

/**
 * reducer는 순수 함수여야 하므로 난수는 액션에 담아 전달한다.
 * `random`은 [0, 1) 범위 값이다.
 */
export type SnakeAction =
  | { type: "start"; random: number }
  | { type: "restart"; random: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "togglePause" }
  | { type: "turn"; direction: Direction }
  | { type: "tick"; random: number };
