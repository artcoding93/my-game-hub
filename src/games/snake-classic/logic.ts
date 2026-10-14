import {
  DIRECTION_VECTORS,
  GRID_SIZE,
  INITIAL_DIRECTION,
  INITIAL_SNAKE_LENGTH,
  MAX_QUEUED_TURNS,
  OPPOSITE_DIRECTION,
  POINTS_PER_FOOD,
} from "./constants";
import type { Direction, Point, SnakeAction, SnakeState } from "./types";

/*
 * Snake Classic 게임 규칙.
 * React·DOM·브라우저 API에 의존하지 않는 순수 함수만 둔다.
 * 난수는 호출자가 [0, 1) 값으로 넘겨준다.
 */

export function isSamePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function isOutOfBounds({ x, y }: Point): boolean {
  return x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE;
}

/** 뱀이 차지하지 않은 칸 중 하나를 고른다. 빈 칸이 없으면 null. */
export function spawnFood(snake: Point[], random: number): Point | null {
  const occupied = new Set(snake.map(({ x, y }) => y * GRID_SIZE + x));
  const freeCells: Point[] = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (!occupied.has(y * GRID_SIZE + x)) freeCells.push({ x, y });
    }
  }

  if (freeCells.length === 0) return null;
  return freeCells[Math.floor(random * freeCells.length)];
}

export function createInitialState(highScore: number, random: number): SnakeState {
  const center = Math.floor(GRID_SIZE / 2);
  // 머리가 오른쪽, 꼬리가 왼쪽으로 가로 3칸
  const snake = Array.from({ length: INITIAL_SNAKE_LENGTH }, (_, i) => ({
    x: center - i,
    y: center,
  }));

  return {
    snake,
    direction: INITIAL_DIRECTION,
    queuedDirections: [],
    food: spawnFood(snake, random),
    score: 0,
    highScore,
    isNewHighScore: false,
    status: "ready",
  };
}

/**
 * 방향 입력을 대기열에 추가한다.
 * 기준은 "대기열의 마지막 방향(없으면 현재 진행 방향)"이므로,
 * 한 틱 안에 ↑ → ← 처럼 두 번 꺾어 정반대로 도는 것도 막힌다.
 */
export function queueTurn(state: SnakeState, direction: Direction): SnakeState {
  const lastDirection = state.queuedDirections.at(-1) ?? state.direction;

  if (
    direction === lastDirection ||
    direction === OPPOSITE_DIRECTION[lastDirection] ||
    state.queuedDirections.length >= MAX_QUEUED_TURNS
  ) {
    return state;
  }

  return { ...state, queuedDirections: [...state.queuedDirections, direction] };
}

/** 한 칸 전진: 방향 적용 → 충돌 판정 → 먹이 섭취/성장 */
export function step(state: SnakeState, random: number): SnakeState {
  if (state.status !== "playing") return state;

  const [nextDirection = state.direction, ...restQueue] = state.queuedDirections;
  const vector = DIRECTION_VECTORS[nextDirection];
  const head = state.snake[0];
  const newHead = { x: head.x + vector.x, y: head.y + vector.y };

  const ateFood = state.food !== null && isSamePoint(newHead, state.food);
  // 먹지 않았다면 이번 틱에 꼬리가 빠지므로, 꼬리가 있던 칸으로 들어가는 것은 충돌이 아니다.
  const bodyAfterMove = ateFood ? state.snake : state.snake.slice(0, -1);

  if (isOutOfBounds(newHead) || bodyAfterMove.some((segment) => isSamePoint(segment, newHead))) {
    return { ...state, direction: nextDirection, queuedDirections: [], status: "over" };
  }

  const snake = [newHead, ...bodyAfterMove];

  if (!ateFood) {
    return { ...state, snake, direction: nextDirection, queuedDirections: restQueue };
  }

  const score = state.score + POINTS_PER_FOOD;
  const isNewHighScore = score > state.highScore;
  const food = spawnFood(snake, random);

  return {
    ...state,
    snake,
    direction: nextDirection,
    queuedDirections: restQueue,
    food,
    score,
    highScore: Math.max(score, state.highScore),
    isNewHighScore: state.isNewHighScore || isNewHighScore,
    status: food === null ? "won" : "playing",
  };
}

export function snakeReducer(state: SnakeState, action: SnakeAction): SnakeState {
  switch (action.type) {
    case "start":
      return state.status === "ready" ? { ...state, status: "playing" } : state;

    case "restart":
      return { ...createInitialState(state.highScore, action.random), status: "playing" };

    case "pause":
      return state.status === "playing" ? { ...state, status: "paused" } : state;

    case "resume":
      return state.status === "paused" ? { ...state, status: "playing" } : state;

    case "togglePause":
      if (state.status === "playing") return { ...state, status: "paused" };
      if (state.status === "paused") return { ...state, status: "playing" };
      return state;

    case "turn":
      // 대기 화면에서 방향키를 누르면 바로 그 방향으로 시작한다.
      if (state.status === "ready") {
        return { ...queueTurn(state, action.direction), status: "playing" };
      }
      return state.status === "playing" ? queueTurn(state, action.direction) : state;

    case "tick":
      return step(state, action.random);
  }
}
