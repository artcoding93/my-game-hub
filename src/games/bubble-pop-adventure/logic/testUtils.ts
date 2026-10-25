import { BUBBLE, FIXED_DT, TILE } from "../config";
import { NO_INPUT, type Bubble, type Enemy, type GameEvent, type GameState, type Input } from "../types";
import { createGame, makeEnemy, stepGame } from "./game";

/* 테스트 전용 도우미 (게임 코드에서 쓰지 않는다) */

export const DT = FIXED_DT;

/** 스테이지를 바로 플레이 상태로 연다 (시작 연출 생략) */
export function playing(stageIndex = 0, seed = 7): GameState {
  const s = createGame({ seed, startStage: stageIndex });
  s.phase = "play";
  s.phaseTime = 0;
  return s;
}

/** 빈 바닥 위에 적을 배치한다 (칸 좌표, 바닥 행 = 그 칸의 아래 발판 행) */
export function placeEnemy(s: GameState, kind: Enemy["kind"], col: number, floorRow: number): Enemy {
  const e = makeEnemy(s, kind, (col + 0.5) * TILE, floorRow * TILE, s.stage.enhanced);
  e.grounded = true;
  s.enemies.push(e);
  return e;
}

export function placePlayer(s: GameState, col: number, floorRow: number, facing: 1 | -1 = 1) {
  const p = s.player;
  p.x = (col + 0.5) * TILE - p.w / 2;
  p.y = floorRow * TILE - p.h;
  p.vx = 0;
  p.vy = 0;
  p.grounded = true;
  p.facing = facing;
}

/** 떠 있는 빈 방울을 (중심 x, 중심 y)에 만든다 */
export function placeBubble(s: GameState, cx: number, cy: number, size: number = BUBBLE.size): Bubble {
  const b: Bubble = {
    id: s.nextId++,
    x: cx - size / 2,
    y: cy - size / 2,
    w: size,
    h: size,
    vx: 0,
    vy: 0,
    phase: "float",
    dir: 1,
    age: 1,
    shotTime: BUBBLE.shotTime,
    giant: false,
    captive: null,
    captiveTime: 0,
    popIn: -1,
    chain: 0,
  };
  s.bubbles.push(b);
  return b;
}

export function run(s: GameState, seconds: number, input: Partial<Input> | ((s: GameState, step: number) => Partial<Input>) = {}, stop?: (s: GameState, events: GameEvent[]) => boolean): GameEvent[] {
  const all: GameEvent[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const inp = typeof input === "function" ? input(s, i) : input;
    const events = stepGame(s, { ...NO_INPUT, ...inp }, DT);
    all.push(...events);
    if (stop?.(s, events)) break;
  }
  return all;
}

export const count = (events: GameEvent[], type: GameEvent["type"]) => events.filter((e) => e.type === type).length;

/**
 * 적을 모두 치우되, 스테이지가 바로 클리어되지 않도록 아무 데도 없는 "갇힌" 적 하나를 남긴다
 * (방울 밖의 trapped 적은 움직이지도, 그려지지도, 피해를 주지도 않는다).
 */
export function clearEnemies(s: GameState) {
  const parked = makeEnemy(s, "cogling", -100, -100, false);
  parked.state = "trapped";
  s.enemies = [parked];
}
