import { Tile, type Guard, type GameState, type MoveKind, type Point } from "../types";
import { inBounds, toCell } from "./level";

/**
 * 이동 규칙이 바라보는 지형.
 * 실제 이동(dynamicView)과 경비원 BFS(staticView)가 같은 규칙 함수(legalMoves)를 쓰고,
 * "무엇을 벽·사다리·지지대로 보느냐"만 이 뷰로 바꾼다.
 */
export interface TerrainView {
  width: number;
  height: number;
  /** 들어갈 수 없는 칸 (벽돌·단단한 벽·맵 밖). 맵 위쪽 밖도 막힌 것으로 본다. */
  isBlocked(x: number, y: number): boolean;
  isLadder(x: number, y: number): boolean;
  isRope(x: number, y: number): boolean;
  /** 지형이 아닌 지지대 (예: 구멍에 갇힌 경비원의 머리) */
  hasActorSupport(x: number, y: number): boolean;
}

export const DIRECTION_DELTA: Record<MoveKind, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  fall: { x: 0, y: 1 },
};

/** 발밑(또는 현재 칸)에 몸을 지탱할 것이 있는가 */
export function isSupported(view: TerrainView, x: number, y: number): boolean {
  if (view.isLadder(x, y) || view.isRope(x, y)) return true;
  if (y + 1 >= view.height) return true;
  return view.isBlocked(x, y + 1) || view.isLadder(x, y + 1) || view.hasActorSupport(x, y + 1);
}

/**
 * (x, y) 칸에 멈춰 있는 캐릭터가 할 수 있는 이동 목록.
 * - 지지대가 없으면 낙하만 가능하다 (공중에서 좌우 이동 불가).
 * - 위로는 사다리에서만, 아래로는 사다리·로프에서(로프는 손을 놓아 떨어지기) 또는 발밑이 사다리일 때만 이동한다.
 * - 막힌 칸으로는 어떤 이동도 할 수 없다.
 */
export function legalMoves(view: TerrainView, x: number, y: number): MoveKind[] {
  if (!isSupported(view, x, y)) {
    return view.isBlocked(x, y + 1) ? [] : ["fall"];
  }

  const moves: MoveKind[] = [];
  if (!view.isBlocked(x - 1, y)) moves.push("left");
  if (!view.isBlocked(x + 1, y)) moves.push("right");
  if (view.isLadder(x, y) && !view.isBlocked(x, y - 1)) moves.push("up");
  if (
    y + 1 < view.height &&
    !view.isBlocked(x, y + 1) &&
    !view.hasActorSupport(x, y + 1) &&
    (view.isLadder(x, y) || view.isRope(x, y) || view.isLadder(x, y + 1))
  ) {
    moves.push("down");
  }
  return moves;
}

function baseTile(state: GameState, x: number, y: number): Tile {
  return state.level.tiles[toCell(state.level, x, y)];
}

interface ViewOptions {
  /** true면 구멍을 메워진 벽돌로 본다 (경비원 경로 계획용) */
  holesAsBricks: boolean;
  /** 이 구멍은 바닥으로 본다 (방금 기어 나온 경비원용) */
  ignoreHole?: number | null;
  actorSupport: (x: number, y: number) => boolean;
}

function createView(state: GameState, options: ViewOptions): TerrainView {
  const { level } = state;

  const effectiveTile = (x: number, y: number): Tile => {
    const tile = baseTile(state, x, y);
    if (tile === Tile.Brick) {
      const cell = toCell(level, x, y);
      if (state.holes.has(cell) && !options.holesAsBricks && cell !== options.ignoreHole) {
        return Tile.Empty;
      }
    }
    if (tile === Tile.EscapeLadder) return state.escapeRevealed ? Tile.Ladder : Tile.Empty;
    return tile;
  };

  return {
    width: level.width,
    height: level.height,
    isBlocked(x, y) {
      // 좌우·아래쪽 맵 밖은 벽, 위쪽 맵 밖은 출구 판정 이후에만 의미가 있으므로 막는다.
      if (!inBounds(level, x, y)) return true;
      const tile = effectiveTile(x, y);
      return tile === Tile.Brick || tile === Tile.Solid;
    },
    isLadder(x, y) {
      return inBounds(level, x, y) && effectiveTile(x, y) === Tile.Ladder;
    },
    isRope(x, y) {
      return inBounds(level, x, y) && effectiveTile(x, y) === Tile.Rope;
    },
    hasActorSupport: options.actorSupport,
  };
}

/** 지금 이 순간의 실제 지형 (구멍은 빈 칸) */
export function playerView(state: GameState): TerrainView {
  return createView(state, {
    holesAsBricks: false,
    // 플레이어는 구멍에 갇힌 경비원의 머리 위만 밟고 지나갈 수 있다.
    actorSupport: (x, y) =>
      state.guards.some((g) => g.status === "trapped" && g.x === x && g.y === y),
  });
}

export function guardView(state: GameState, self: Guard): TerrainView {
  return createView(state, {
    holesAsBricks: false,
    ignoreHole: self.ignoreHole,
    // 경비원은 다른 경비원 위에 설 수 있다 (같은 칸에 겹쳐 떨어지지 않도록).
    actorSupport: (x, y) =>
      state.guards.some((g) => g !== self && g.status !== "dead" && occupiedCellOf(g, state.level.width) === toCell(state.level, x, y)),
  });
}

/**
 * 경비원 경로 계획용 지형.
 * 구멍은 메워진 벽돌로 본다: 경비원은 구멍을 피해 돌아가지 않고 그대로 걸어오다 빠진다.
 * (구멍이 생기거나 메워지면 경로를 다시 계산한다.)
 */
export function planningView(state: GameState): TerrainView {
  return createView(state, { holesAsBricks: true, actorSupport: () => false });
}

/** 이동 중인 캐릭터가 차지한 칸: 절반 이상 이동했으면 목표 칸 */
export function occupiedCellOf(actor: { x: number; y: number; tx: number; ty: number; progress: number }, width: number): number {
  return actor.progress >= 0.5 ? actor.ty * width + actor.tx : actor.y * width + actor.x;
}
