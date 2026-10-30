import {
  chainStepPoints,
  COLOR_COUNT,
  GAME_CONFIG,
  SPAWN_X,
  SPAWN_Y,
  speedFor,
  timeBonusFor,
  type GameMode,
} from "../config";
import type { Color, GameEvent, GameState, InputSnapshot, Pair } from "../types";
import { applyGravity, dropDistance, emptyBoard, findGroups, fits, landingCells, pairCells, place, rotate, shifted } from "./board";
import { shuffle } from "./rng";

/*
 * Cascade Rush 상태 전이 (순수 TypeScript, 고정 시간 간격으로 호출).
 *
 * 한 쌍의 순서: 생성 → 이동·회전·낙하 → 착지(고정) → 중력(갈라진 크리스털 낙하) → [3개 이상 연결 터짐 → 중력]* → 연쇄 끝 → 다음 쌍
 * - 연쇄 처리(resolve) 중에는 입력·새 쌍 생성·타이머·낙하 속도 시간이 모두 멈춘다. 그동안 눌린 회전·즉시 낙하는 버린다.
 * - 시간 보너스는 연쇄가 끝날 때 한 번만, 가장 큰 보너스 하나만 준다(resolveId로 중복 지급 방지).
 * - 낙하 속도는 실제 조작 시간(playTime)으로 정하므로 보너스로 남은 시간이 늘어도 느려지지 않는다.
 * - 착지 유예(lockDelay): 바닥에 닿아 있는 동안만 시간이 흐르고, 이동·회전으로 maxLockResets번까지 미룰 수 있다.
 *   더 낮은 줄에 닿기 전에는 대기 시간·횟수가 다시 채워지지 않는다(회전으로 들어 올렸다 내리는 무한 지연 방지).
 */

const QUEUE_SIZE = 2;

export function createGame(mode: GameMode = "rush", seed = 1): GameState {
  return {
    mode,
    phase: "title",
    resumePhase: "playing",
    board: emptyBoard(),
    active: null,
    queue: [],
    bag: [],
    rng: seed | 0,
    timeLeft: mode === "rush" ? GAME_CONFIG.rush.startTime : Infinity,
    playTime: 0,
    readyTimer: 0,
    speed: 1,
    gravityTimer: 0,
    lockTimer: 0,
    lockResets: 0,
    lowestY: 0,
    moveDir: 0,
    dasTimer: 0,
    resolve: null,
    score: 0,
    crystals: 0,
    maxChain: 0,
    lastChain: 0,
    pairs: 0,
    endReason: null,
    bonusPaidFor: -1,
    resolveId: 0,
  };
}

/** 새 게임 (READY 안내부터). 같은 시드면 같은 크리스털 순서가 나온다. */
export function startGame(state: GameState, mode: GameMode, seed: number): GameEvent[] {
  Object.assign(state, createGame(mode, seed));
  state.phase = "ready";
  state.readyTimer = GAME_CONFIG.readyTime;
  refillQueue(state);
  return [{ type: "start", mode }];
}

/** 색이 고르게 나오도록 색마다 4개씩(20개) 섞은 묶음에서 두 개씩 꺼낸다. */
function nextColors(state: GameState): [Color, Color] {
  if (state.bag.length === 0) {
    const crystals: Color[] = [];
    for (let c = 1; c <= COLOR_COUNT; c++) for (let i = 0; i < 4; i++) crystals.push(c as Color);
    shuffle(state, crystals);
    for (let i = 0; i < crystals.length; i += 2) state.bag.push([crystals[i], crystals[i + 1]]);
  }
  return state.bag.shift()!;
}

function refillQueue(state: GameState) {
  while (state.queue.length < QUEUE_SIZE + 1) state.queue.push(nextColors(state));
}

function spawn(state: GameState, events: GameEvent[]) {
  const [pivot, child] = state.queue.shift()!;
  refillQueue(state);
  const pair: Pair = { x: SPAWN_X, y: SPAWN_Y, orientation: 0, pivot, child };
  if (!fits(state.board, pair)) {
    end(state, "topout", events);
    return;
  }
  state.active = pair;
  state.pairs++;
  state.gravityTimer = 0;
  state.lockTimer = 0;
  state.lockResets = 0;
  state.lowestY = pair.y;
  // 이동 키를 누른 채 다음 쌍이 나오면 첫 반복 시간(DAS)부터 다시 센다
  state.dasTimer = GAME_CONFIG.das;
  events.push({ type: "spawn" });
}

function end(state: GameState, reason: "time" | "topout", events: GameEvent[]) {
  state.phase = "over";
  state.endReason = reason;
  state.active = null;
  state.resolve = null;
  events.push({ type: "gameOver", reason });
}

export function togglePause(state: GameState) {
  if (state.phase === "paused") state.phase = state.resumePhase;
  else pause(state);
}

export function pause(state: GameState) {
  if (state.phase !== "playing" && state.phase !== "ready") return;
  state.resumePhase = state.phase;
  state.phase = "paused";
}

export function stepGame(state: GameState, input: InputSnapshot, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.phase === "ready") {
    state.readyTimer -= dt;
    if (state.readyTimer > 0) return events;
    state.phase = "playing";
    events.push({ type: "go" });
    spawn(state, events);
    return events;
  }
  if (state.phase !== "playing") return events;

  if (state.resolve) {
    // 연쇄 중: 입력을 받지 않고(버림) 타이머도 멈춘다. 이동 키 반복 상태만 따라간다.
    state.moveDir = input.move;
    advanceResolve(state, dt, events);
    return events;
  }
  if (!state.active) return events;

  if (tickClock(state, dt, events)) return events;
  control(state, input, dt, events);
  return events;
}

/** 남은 시간·조작 시간·속도 단계. 시간이 다 되면 true */
function tickClock(state: GameState, dt: number, events: GameEvent[]): boolean {
  state.playTime += dt;
  const speed = speedFor(state.mode, state.playTime).level;
  if (speed > state.speed) {
    state.speed = speed;
    events.push({ type: "speedUp", level: speed });
  }
  if (state.mode !== "rush") return false;
  const before = Math.ceil(state.timeLeft);
  state.timeLeft = Math.max(state.timeLeft - dt, 0);
  const after = Math.ceil(state.timeLeft);
  if (after < before && after > 0 && after <= GAME_CONFIG.rush.countdownFrom) events.push({ type: "countdown", seconds: after });
  if (state.timeLeft > 0) return false;
  end(state, "time", events);
  return true;
}

function control(state: GameState, input: InputSnapshot, dt: number, events: GameEvent[]) {
  const cfg = GAME_CONFIG;
  // 1. 회전
  for (const dir of [input.rotateCW ? 1 : 0, input.rotateCCW ? -1 : 0] as const) {
    if (!dir || !state.active) continue;
    const turned = rotate(state.board, state.active, dir);
    if (turned) {
      state.active = turned;
      events.push({ type: "rotate" });
      resetLock(state);
    }
  }

  // 2. 좌우 이동: 누른 순간 한 칸, 계속 누르면 DAS 뒤 ARR 간격으로 반복 (한 스텝에 최대 몇 칸이어도 벽에서 멈춤)
  if (input.move !== state.moveDir) {
    state.moveDir = input.move;
    state.dasTimer = cfg.das;
    if (input.move !== 0) tryShift(state, input.move, events);
  } else if (state.moveDir !== 0) {
    state.dasTimer -= dt;
    while (state.dasTimer <= 0) {
      tryShift(state, state.moveDir, events);
      state.dasTimer += cfg.arr;
    }
  }

  const pair = state.active!;
  // 3. 즉시 낙하
  if (input.hardDrop) {
    const d = dropDistance(state.board, pair);
    state.active = shifted(pair, 0, d);
    lock(state, true, events);
    return;
  }

  // 4. 자연 낙하·빠른 낙하
  const gravity = speedFor(state.mode, state.playTime).gravity;
  const interval = input.softDrop ? Math.min(cfg.softDropInterval, gravity) : gravity;
  state.gravityTimer += dt;
  while (state.gravityTimer >= interval) {
    const down = shifted(state.active!, 0, 1);
    if (!fits(state.board, down)) {
      state.gravityTimer = 0;
      break;
    }
    state.gravityTimer -= interval;
    state.active = down;
    if (down.y > state.lowestY) {
      state.lowestY = down.y;
      state.lockTimer = 0;
      state.lockResets = 0;
    }
    if (input.softDrop) events.push({ type: "softStep" });
  }

  // 5. 착지: 바닥에 닿은 뒤 잠깐(lockDelay) 움직일 수 있다. ↓를 누르고 있으면 바로 고정한다.
  if (!fits(state.board, shifted(state.active!, 0, 1))) {
    state.lockTimer += dt;
    if (input.softDrop || state.lockTimer >= cfg.lockDelay) lock(state, false, events);
  }
}

function tryShift(state: GameState, dir: -1 | 1, events: GameEvent[]) {
  if (!state.active) return;
  const moved = shifted(state.active, dir, 0);
  if (!fits(state.board, moved)) return;
  state.active = moved;
  events.push({ type: "move" });
  resetLock(state);
}

/** 바닥에 닿은 상태에서 움직이면 고정을 미룬다 (최대 maxLockResets회, 무한 지연 방지) */
function resetLock(state: GameState) {
  if (!state.active || fits(state.board, shifted(state.active, 0, 1))) return;
  if (state.lockResets >= GAME_CONFIG.maxLockResets) return;
  state.lockResets++;
  state.lockTimer = 0;
}

function lock(state: GameState, hard: boolean, events: GameEvent[]) {
  const pair = state.active!;
  state.active = null;
  const landed = landingCells(state.board, pair).filter((c) => c.y >= 0);
  const cells = place(state.board, pairCells(pair));
  state.resolveId++;
  events.push({ type: "land", hard, cells, crystals: landed });
  state.resolve = { stage: "drop", timer: 0, duration: 0, chain: 0, total: 0, falls: [], popping: [] };
  startDrop(state, events);
}

/** 중력 적용. 떨어질 크리스털이 있으면 낙하 연출, 없으면 바로 그룹 검사 */
function startDrop(state: GameState, events: GameEvent[]) {
  const r = state.resolve!;
  const falls = applyGravity(state.board);
  if (falls.length === 0) {
    checkGroups(state, events);
    return;
  }
  const longest = Math.max(...falls.map((f) => f.toY - f.fromY));
  r.stage = "drop";
  r.falls = falls;
  r.popping = [];
  r.timer = 0;
  r.duration = GAME_CONFIG.dropBase + GAME_CONFIG.dropPerCell * longest + (r.chain > 0 ? GAME_CONFIG.chainPause : 0);
  if (r.chain === 0) events.push({ type: "settle" });
}

function checkGroups(state: GameState, events: GameEvent[]) {
  const r = state.resolve!;
  const groups = findGroups(state.board);
  if (groups.length === 0) {
    finishResolve(state, events);
    return;
  }
  // 동시에 터지는 여러 그룹은 하나의 연쇄 단계
  r.chain++;
  const crystals = groups.flat();
  const sizes = groups.map((g) => g.length);
  const points = chainStepPoints(sizes, r.chain);
  r.total += points;
  state.score += points;
  state.crystals += crystals.length;
  r.stage = "pop";
  r.popping = crystals;
  r.falls = [];
  r.timer = 0;
  r.duration = GAME_CONFIG.popTime;
  events.push({ type: "pop", chain: r.chain, crystals, groups: groups.length, sizes, points });
}

function advanceResolve(state: GameState, dt: number, events: GameEvent[]) {
  const r = state.resolve!;
  r.timer += dt;
  if (r.timer < r.duration) return;
  if (r.stage === "pop") {
    for (const c of r.popping) state.board[c.y][c.x] = 0;
    startDrop(state, events);
  } else {
    checkGroups(state, events);
  }
}

function finishResolve(state: GameState, events: GameEvent[]) {
  const r = state.resolve!;
  state.resolve = null;
  if (r.chain > 0) {
    state.lastChain = r.chain;
    state.maxChain = Math.max(state.maxChain, r.chain);
    let bonus = 0;
    if (state.mode === "rush" && state.bonusPaidFor !== state.resolveId) {
      bonus = timeBonusFor(r.chain);
      state.bonusPaidFor = state.resolveId;
      if (bonus > 0) state.timeLeft = Math.min(state.timeLeft + bonus, GAME_CONFIG.rush.maxTime);
    }
    events.push({ type: "chainEnd", chain: r.chain, total: r.total, bonus });
    if (bonus > 0) events.push({ type: "timeBonus", seconds: bonus });
  }
  spawn(state, events);
}
