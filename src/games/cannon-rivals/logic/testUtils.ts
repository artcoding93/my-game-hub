import { PHYSICS, WORLD_H } from "../config";
import type { GameEvent, GameState, Side } from "../types";
import { createBattle, stepGame } from "./game";
import { supportY } from "./terrain";

/* 테스트 전용 도우미 (게임 화면에서는 쓰지 않는다) */

export const DT = PHYSICS.fixedDt;

/** 평평한 지형(y=ground)에 두 탱크를 세운 전투. 바람 0, 보급 상자 없음 */
export function flatBattle(seed = 1, ground = 400): GameState {
  const { state } = createBattle({ field: "greenHills", difficulty: "normal", seed });
  state.terrain.fill(ground);
  state.wind = 0;
  state.crate = null;
  state.crateIn = 99;
  for (const side of ["player", "ai"] as const) state.tanks[side].y = supportY(state.terrain, state.tanks[side].x);
  return state;
}

export function run(state: GameState, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += DT) events.push(...stepGame(state, DT));
  return events;
}

/** 현재 턴이 끝날 때까지 진행 */
export function runTurn(state: GameState, maxSeconds = 30): GameEvent[] {
  const start = state.turnCount;
  const events: GameEvent[] = [];
  for (let t = 0; t < maxSeconds && state.turnCount === start && state.phase !== "gameOver"; t += DT) events.push(...stepGame(state, DT));
  return events;
}

/** 지정한 곳 바로 위에서 포탄을 떨어뜨린다(착탄 지점을 정확히 정하기 위함). */
export function dropShell(state: GameState, x: number, y: number, owner: Side = "player", damageScale = 1) {
  state.projectiles.push({ id: state.nextProjectileId++, owner, x, y: y - 3, vx: 0, vy: 200, age: 0, damageScale, windScale: 1 });
  state.phase = "resolving";
  state.turn = owner;
}

export const NO_GROUND = WORLD_H;
