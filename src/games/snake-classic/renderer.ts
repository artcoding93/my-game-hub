import { BOARD_PIXELS, CELL_SIZE, COLORS, DIRECTION_VECTORS, GRID_SIZE } from "./constants";
import type { Direction, Point, SnakeState } from "./types";

/** 한 칸 안에서 쓰는 도트 크기. 3px 단위로 그려 픽셀아트 느낌을 낸다. */
const PIXEL = CELL_SIZE / 8;

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = COLORS.gridDot;
  for (let y = 1; y < GRID_SIZE; y++) {
    for (let x = 1; x < GRID_SIZE; x++) {
      ctx.fillRect(x * CELL_SIZE - 1, y * CELL_SIZE - 1, 2, 2);
    }
  }
}

function drawSegment(ctx: CanvasRenderingContext2D, { x, y }: Point, isHead: boolean) {
  const left = x * CELL_SIZE + 1;
  const top = y * CELL_SIZE + 1;
  const size = CELL_SIZE - 2;

  // 아래·오른쪽 그림자로 도트 블록의 입체감을 만든다.
  ctx.fillStyle = COLORS.snakeShade;
  ctx.fillRect(left, top, size, size);
  ctx.fillStyle = isHead ? COLORS.snakeHead : COLORS.snakeBody;
  ctx.fillRect(left, top, size - PIXEL, size - PIXEL);
}

function drawEyes(ctx: CanvasRenderingContext2D, head: Point, direction: Direction) {
  const { x: dx, y: dy } = DIRECTION_VECTORS[direction];
  const centerX = head.x * CELL_SIZE + CELL_SIZE / 2 - PIXEL / 2;
  const centerY = head.y * CELL_SIZE + CELL_SIZE / 2 - PIXEL / 2;
  // 진행 방향 쪽으로 치우치고, 진행 방향에 수직으로 벌어진 두 눈
  const forward = PIXEL * 1.5;
  const spread = PIXEL * 2;

  ctx.fillStyle = COLORS.snakeEye;
  for (const side of [-1, 1]) {
    ctx.fillRect(
      centerX + dx * forward + dy * spread * side,
      centerY + dy * forward + dx * spread * side,
      PIXEL,
      PIXEL,
    );
  }
}

function drawFood(ctx: CanvasRenderingContext2D, { x, y }: Point) {
  const left = x * CELL_SIZE;
  const top = y * CELL_SIZE;

  // 8×8 도트로 그린 둥근 먹이
  ctx.fillStyle = COLORS.food;
  ctx.fillRect(left + PIXEL * 2, top + PIXEL, PIXEL * 4, PIXEL * 6);
  ctx.fillRect(left + PIXEL, top + PIXEL * 2, PIXEL * 6, PIXEL * 4);
  ctx.fillStyle = COLORS.foodHighlight;
  ctx.fillRect(left + PIXEL * 2, top + PIXEL * 2, PIXEL, PIXEL);
}

/** 현재 상태를 캔버스에 그린다. 상태를 변경하지 않는다. */
export function drawBoard(ctx: CanvasRenderingContext2D, state: SnakeState) {
  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, BOARD_PIXELS, BOARD_PIXELS);
  drawGrid(ctx);

  if (state.food) drawFood(ctx, state.food);

  // 꼬리부터 그려서 머리가 항상 위에 보이게 한다.
  for (let i = state.snake.length - 1; i >= 0; i--) {
    drawSegment(ctx, state.snake[i], i === 0);
  }
  drawEyes(ctx, state.snake[0], state.direction);
}
