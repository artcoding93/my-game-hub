import { GAME_CONFIG, guardSpeedMultiplier } from "../config";
import { STAGES } from "../stages";
import {
  Tile,
  type Actor,
  type Direction,
  type GameEvent,
  type GameState,
  type Guard,
  type InputSnapshot,
  type MoveKind,
  type Player,
  type Point,
} from "../types";
import { fromCell, inBounds, parseStage, toCell } from "./level";
import { findPath } from "./pathfinding";
import {
  DIRECTION_DELTA,
  guardView,
  isSupported,
  legalMoves,
  occupiedCellOf,
  planningView,
  playerView,
} from "./terrain";

/*
 * Gold Escape 게임 규칙.
 * 브라우저·Phaser·React에 의존하지 않는다. 렌더러는 GameState를 읽기만 하고,
 * 상태 변경은 아래 export 함수로만 한다. 같은 입력이면 항상 같은 결과가 나온다(난수 없음).
 *
 * 캐릭터는 칸 단위로 이동하며, 칸 중앙에 도착했을 때만 다음 이동을 결정한다.
 * 이동 가능 여부는 terrain.ts의 legalMoves 하나로 판단하므로 플레이어·경비원·BFS가 같은 규칙을 따른다.
 */

const { player: PLAYER, guard: GUARD, hole: HOLE, score: SCORE, timing: TIMING } = GAME_CONFIG;

// ── 생성·단계 전환 ────────────────────────────────────────────────

function createActor(start: Point): Actor {
  return { x: start.x, y: start.y, tx: start.x, ty: start.y, progress: 0, move: null, facing: 1 };
}

function createPlayer(start: Point, invincibleUntil: number): Player {
  return { ...createActor(start), status: "alive", invincibleUntil, digCooldownUntil: 0, pendingDig: null };
}

function createGuard(id: number, start: Point, time: number, total: number): Guard {
  return {
    ...createActor(start),
    id,
    status: "chasing",
    statusSince: time,
    respawnAt: 0,
    path: [],
    // 경로 계산 시점을 경비원마다 엇갈리게 해 한 프레임에 몰리지 않게 한다.
    nextRepathAt: time + (GUARD.repathInterval * id) / Math.max(total, 1),
    lastRepathAt: -Infinity,
    ignoreHole: null,
    blockedFor: 0,
  };
}

function loadStage(state: GameState, stageIndex: number, events: GameEvent[], invincibleFor = 0) {
  const parsed = parseStage(STAGES[stageIndex]);
  state.stageIndex = stageIndex;
  state.level = parsed.level;
  state.playerStart = parsed.playerStart;
  state.guardStarts = parsed.guardStarts;
  state.gold = new Set(parsed.gold.map((p) => toCell(parsed.level, p.x, p.y)));
  state.holes = new Map();
  state.escapeRevealed = false;
  state.phase = "stageIntro";
  state.phaseUntil = state.time + TIMING.stageIntro;
  state.player = createPlayer(parsed.playerStart, state.phaseUntil + invincibleFor);
  state.guards = parsed.guardStarts.map((start, i) => createGuard(i, start, state.phaseUntil, parsed.guardStarts.length));
  events.push({ type: "stageStarted" });
}

/** 시작 화면 상태. 첫 스테이지를 미리 불러와 배경으로 보여 준다. */
export function createGame(highScore: number): GameState {
  const state = {
    phase: "ready",
    pausedFrom: null,
    time: 0,
    phaseUntil: 0,
    stageIndex: 0,
    round: 1,
    score: 0,
    stageStartScore: 0,
    highScore,
    lives: GAME_CONFIG.startingLives,
  } as GameState;
  loadStage(state, 0, []);
  state.phase = "ready";
  return state;
}

/** 시작 화면·게임 오버에서 새 게임을 시작한다. */
export function startGame(state: GameState): GameEvent[] {
  if (state.phase !== "ready" && state.phase !== "gameOver") return [];
  const events: GameEvent[] = [];
  state.round = 1;
  state.score = 0;
  state.stageStartScore = 0;
  state.lives = GAME_CONFIG.startingLives;
  loadStage(state, 0, events);
  return events;
}

export function togglePause(state: GameState): void {
  if (state.phase === "paused") {
    state.phase = state.pausedFrom ?? "playing";
    state.pausedFrom = null;
  } else if (state.phase === "playing" || state.phase === "stageIntro") {
    state.pausedFrom = state.phase;
    state.phase = "paused";
  }
}

export function pause(state: GameState): void {
  if (state.phase === "playing" || state.phase === "stageIntro") togglePause(state);
}

/** 구멍에 갇혀 빠져나올 수 없을 때 스스로 목숨 하나를 잃고 스테이지를 다시 시작한다. */
export function selfDestruct(state: GameState): GameEvent[] {
  if (state.phase !== "playing" || state.player.status !== "alive") return [];
  const events: GameEvent[] = [];
  killPlayer(state, "selfDestruct", events);
  return events;
}

export function guardSpeed(round: number) {
  const multiplier = guardSpeedMultiplier(round);
  return { move: GUARD.baseSpeed * multiplier, fall: GUARD.fallSpeed * multiplier };
}

// ── 메인 루프 ───────────────────────────────────────────────────

/** dt초만큼 게임을 진행하고 이번 프레임에 일어난 이벤트를 돌려준다. */
export function stepGame(state: GameState, input: InputSnapshot, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.phase === "ready" || state.phase === "paused" || state.phase === "gameOver") return events;

  state.time += dt;

  switch (state.phase) {
    case "stageIntro":
      if (state.time >= state.phaseUntil) state.phase = "playing";
      break;

    case "dying":
      if (state.time >= state.phaseUntil) {
        if (state.lives > 0) {
          // 같은 스테이지를 처음부터. 이번 시도에서 얻은 점수는 되돌린다.
          state.score = state.stageStartScore;
          loadStage(state, state.stageIndex, events, PLAYER.respawnInvincibility);
        } else {
          state.phase = "gameOver";
          events.push({ type: "gameOver" });
        }
      }
      break;

    case "stageClear":
      if (state.time >= state.phaseUntil) {
        const next = state.stageIndex + 1;
        if (next >= STAGES.length) state.round += 1;
        state.stageStartScore = state.score;
        loadStage(state, next % STAGES.length, events);
      }
      break;

    case "playing":
      updatePlaying(state, input, dt, events);
      break;
  }

  if (state.score > state.highScore) state.highScore = state.score;
  return events;
}

function updatePlaying(state: GameState, input: InputSnapshot, dt: number, events: GameEvent[]) {
  if (input.dig !== null) {
    state.player.pendingDig = { dir: input.dig, until: state.time + PLAYER.digBuffer };
  }

  updateHoles(state, events);
  if (state.phase !== "playing") return;

  updatePlayer(state, input, dt, events);
  if (state.phase !== "playing") return;

  for (const guard of state.guards) updateGuard(state, guard, dt, events);
  checkGuardContact(state, events);
}

// ── 공통 이동 ──────────────────────────────────────────────────

function startMove(actor: Actor, move: MoveKind) {
  const delta = DIRECTION_DELTA[move];
  actor.tx = actor.x + delta.x;
  actor.ty = actor.y + delta.y;
  actor.progress = 0;
  actor.move = move;
  if (delta.x !== 0) actor.facing = delta.x as -1 | 1;
}

function arrive(actor: Actor) {
  actor.x = actor.tx;
  actor.y = actor.ty;
  actor.progress = 0;
  actor.move = null;
}

/**
 * 남은 시간 동안 칸 이동을 진행한다. 칸에 도착할 때마다 onArrive → decide 순으로 호출하고,
 * 남은 시간은 다음 이동에 이어 써서 프레임 속도와 관계없이 일정한 속도를 유지한다.
 */
function advance(
  actor: Actor,
  dt: number,
  speedOf: (move: MoveKind) => number,
  decide: () => void,
  onArrive: () => boolean,
) {
  let remaining = dt;
  for (let steps = 0; remaining > 1e-9 && steps < 8; steps++) {
    if (!actor.move) {
      decide();
      if (!actor.move) return;
    }
    const speed = speedOf(actor.move);
    const needed = (1 - actor.progress) / speed;
    if (remaining < needed) {
      actor.progress += remaining * speed;
      return;
    }
    remaining -= needed;
    arrive(actor);
    if (!onArrive()) return;
  }
}

export function actorPosition(actor: Actor): Point {
  return {
    x: actor.x + (actor.tx - actor.x) * actor.progress,
    y: actor.y + (actor.ty - actor.y) * actor.progress,
  };
}

// ── 플레이어 ──────────────────────────────────────────────────

const OPPOSITE: Record<Direction, Direction> = { left: "right", right: "left", up: "down", down: "up" };

function updatePlayer(state: GameState, input: InputSnapshot, dt: number, events: GameEvent[]) {
  const player = state.player;
  if (player.status !== "alive") return;

  if (player.pendingDig && state.time > player.pendingDig.until) player.pendingDig = null;
  maybeReverse(state, player, input);

  advance(
    player,
    dt,
    (move) => (move === "fall" ? PLAYER.fallSpeed : PLAYER.speed),
    () => decidePlayerMove(state, input, events),
    () => onPlayerArrive(state, events),
  );
}

/** 이동 도중 반대 방향을 누르면 그 자리에서 되돌아간다 (칸 끝까지 기다리지 않아 조작감이 좋아진다). */
function maybeReverse(state: GameState, player: Player, input: InputSnapshot) {
  const wanted = input.directions[0];
  if (!player.move || player.move === "fall" || !wanted || wanted !== OPPOSITE[player.move]) return;
  // 로프에서 손을 놓고 내려가는 중(목표 칸이 사다리가 아님)에는 다시 올라갈 수 없다.
  if (player.move === "down" && !playerView(state).isLadder(player.tx, player.ty)) return;

  [player.x, player.tx] = [player.tx, player.x];
  [player.y, player.ty] = [player.ty, player.y];
  player.progress = 1 - player.progress;
  player.move = wanted;
  if (wanted === "left") player.facing = -1;
  if (wanted === "right") player.facing = 1;
}

function decidePlayerMove(state: GameState, input: InputSnapshot, events: GameEvent[]) {
  const player = state.player;
  const view = playerView(state);

  if (!isSupported(view, player.x, player.y)) {
    if (!view.isBlocked(player.x, player.y + 1)) startMove(player, "fall");
    return;
  }

  if (player.pendingDig && state.time >= player.digCooldownUntil) {
    const { dir } = player.pendingDig;
    player.pendingDig = null;
    if (tryDig(state, dir, events)) return; // 파는 순간에는 이동하지 않는다.
  }

  const moves = legalMoves(view, player.x, player.y);
  // 최근에 누른 방향부터 시도한다. (예: → 를 누른 채 ↑ 를 누르면 사다리에서 오르고, 아니면 계속 오른쪽)
  for (const direction of input.directions) {
    if (moves.includes(direction)) {
      startMove(player, direction);
      return;
    }
  }
}

/** 플레이어 기준 대각선 아래(dir: -1 왼쪽, 1 오른쪽) 벽돌을 판다. */
export function tryDig(state: GameState, dir: -1 | 1, events: GameEvent[]): boolean {
  const player = state.player;
  const view = playerView(state);
  if (player.move || !isSupported(view, player.x, player.y)) return false;

  const x = player.x + dir;
  const y = player.y + 1;
  if (!inBounds(state.level, x, y)) return false;

  const cell = toCell(state.level, x, y);
  if (state.level.tiles[cell] !== Tile.Brick || state.holes.has(cell)) return false;

  // 파려는 벽돌 바로 위 칸이 비어 있어야 한다 (벽·사다리·금괴·경비원이 있으면 불가).
  const aboveCell = toCell(state.level, x, player.y);
  if (view.isBlocked(x, player.y) || view.isLadder(x, player.y) || state.gold.has(aboveCell)) return false;
  if (state.guards.some((g) => g.status !== "dead" && occupiedCellOf(g, state.level.width) === aboveCell)) {
    return false;
  }

  state.holes.set(cell, { cell, dugAt: state.time });
  player.digCooldownUntil = state.time + PLAYER.digCooldown;
  player.facing = dir;
  events.push({ type: "dug", cell });
  requestRepathAll(state);
  return true;
}

function onPlayerArrive(state: GameState, events: GameEvent[]): boolean {
  const { player, level } = state;
  const cell = toCell(level, player.x, player.y);

  if (state.gold.delete(cell)) {
    state.score += SCORE.gold;
    events.push({ type: "goldCollected", cell });
    if (state.gold.size === 0 && !state.escapeRevealed) {
      state.escapeRevealed = true;
      events.push({ type: "escapeRevealed" });
      requestRepathAll(state);
    }
  }

  // 탈출 사다리를 타고 맨 윗줄(출구)에 도착하면 클리어
  if (player.y === 0 && state.escapeRevealed && level.tiles[cell] === Tile.EscapeLadder) {
    state.score += SCORE.stageClear;
    state.phase = "stageClear";
    state.phaseUntil = state.time + TIMING.stageClear;
    events.push({ type: "stageCleared" });
    return false;
  }
  return true;
}

function killPlayer(state: GameState, cause: "guard" | "hole" | "selfDestruct", events: GameEvent[]) {
  if (state.player.status !== "alive") return; // 같은 죽음을 두 번 처리하지 않는다.
  state.player.status = "dead";
  state.player.move = null;
  state.lives -= 1;
  state.phase = "dying";
  state.phaseUntil = state.time + TIMING.dying;
  events.push({ type: "playerDied", cause });
}

function checkGuardContact(state: GameState, events: GameEvent[]) {
  const player = state.player;
  if (player.status !== "alive" || state.time < player.invincibleUntil) return;
  const p = actorPosition(player);
  for (const guard of state.guards) {
    if (guard.status === "dead") continue;
    const g = actorPosition(guard);
    if (Math.abs(p.x - g.x) < 0.7 && Math.abs(p.y - g.y) < 0.7) {
      killPlayer(state, "guard", events);
      return;
    }
  }
}

// ── 구멍 ─────────────────────────────────────────────────────

function updateHoles(state: GameState, events: GameEvent[]) {
  for (const hole of [...state.holes.values()]) {
    if (state.time - hole.dugAt < HOLE.lifetime) continue;
    const { width } = state.level;

    // 메워지는 칸 안에 있던 캐릭터 처리
    if (state.player.status === "alive" && occupiedCellOf(state.player, width) === hole.cell) {
      killPlayer(state, "hole", events);
    }
    for (const guard of state.guards) {
      if (guard.status !== "dead" && occupiedCellOf(guard, width) === hole.cell) killGuard(state, guard, events);
      if (guard.ignoreHole === hole.cell) guard.ignoreHole = null;
    }

    state.holes.delete(hole.cell);
    events.push({ type: "holeClosed", cell: hole.cell });
    requestRepathAll(state);
  }
}

/** 구멍이 생기거나 메워지는 등 지형이 바뀌면 모든 경비원이 다음 칸에서 경로를 다시 계산한다. */
function requestRepathAll(state: GameState) {
  for (const guard of state.guards) guard.nextRepathAt = Math.min(guard.nextRepathAt, state.time);
}

// ── 경비원 ───────────────────────────────────────────────────

function updateGuard(state: GameState, guard: Guard, dt: number, events: GameEvent[]) {
  const speed = guardSpeed(state.round);

  switch (guard.status) {
    case "dead":
      if (state.time >= guard.respawnAt) respawnGuard(state, guard, events);
      return;

    case "trapped":
      if (state.time - guard.statusSince >= GUARD.trapDuration) startClimbOut(state, guard);
      return;

    case "climbing":
      advance(
        guard,
        dt,
        () => speed.move,
        () => {},
        () => {
          // 구멍 위 칸에 올라섰다. 이 구멍은 이 열을 벗어날 때까지 바닥으로 취급한다.
          guard.ignoreHole = toCell(state.level, guard.x, guard.y + 1);
          guard.status = "chasing";
          guard.statusSince = state.time;
          guard.nextRepathAt = state.time;
          events.push({ type: "guardEscaped", guardId: guard.id });
          return false;
        },
      );
      return;

    case "chasing":
      advance(
        guard,
        dt,
        (move) => (move === "fall" ? speed.fall : speed.move),
        () => decideGuardMove(state, guard, dt),
        () => onGuardArrive(state, guard, events),
      );
      return;
  }
}

function startClimbOut(state: GameState, guard: Guard) {
  const view = guardView(state, guard);
  const aboveCell = toCell(state.level, guard.x, guard.y - 1);
  if (guard.y - 1 < 0 || view.isBlocked(guard.x, guard.y - 1) || isCellTakenByOtherGuard(state, guard, aboveCell)) {
    return; // 위가 막혀 있으면 계속 갇혀 있다 (구멍이 메워지면 소멸).
  }
  guard.status = "climbing";
  guard.statusSince = state.time;
  startMove(guard, "up");
}

function onGuardArrive(state: GameState, guard: Guard, events: GameEvent[]): boolean {
  const { width } = state.level;
  if (guard.ignoreHole !== null && fromCell(state.level, guard.ignoreHole).x !== guard.x) guard.ignoreHole = null;

  const cell = guard.y * width + guard.x;
  if (state.holes.has(cell) && cell !== guard.ignoreHole) {
    guard.status = "trapped";
    guard.statusSince = state.time;
    guard.path = [];
    state.score += SCORE.guardTrapped;
    events.push({ type: "guardTrapped", guardId: guard.id });
    return false;
  }
  return true;
}

function killGuard(state: GameState, guard: Guard, events: GameEvent[]) {
  guard.status = "dead";
  guard.statusSince = state.time;
  guard.respawnAt = state.time + GUARD.respawnDelay;
  guard.move = null;
  guard.path = [];
  guard.ignoreHole = null;
  state.score += SCORE.guardKilled;
  events.push({ type: "guardKilled", guardId: guard.id });
}

function isCellTakenByOtherGuard(state: GameState, self: Guard, cell: number): boolean {
  const { width } = state.level;
  return state.guards.some(
    (g) =>
      g !== self &&
      g.status !== "dead" &&
      (g.y * width + g.x === cell || (g.move !== null && g.ty * width + g.tx === cell)),
  );
}

/** 플레이어를 추적할 목표 칸: 이동 중이면 절반 이상 간 쪽 칸 */
function playerTargetCell(state: GameState): Point {
  return fromCell(state.level, occupiedCellOf(state.player, state.level.width));
}

function repath(state: GameState, guard: Guard) {
  const firstMoves = legalMoves(guardView(state, guard), guard.x, guard.y);
  const result = findPath(planningView(state), guard, playerTargetCell(state), firstMoves);
  guard.path = result.path;
  guard.lastRepathAt = state.time;
  guard.nextRepathAt = state.time + GUARD.repathInterval;
}

/** 경로가 맞지 않을 때의 즉시 재계산도 이 간격 이상 벌어지게 해, 갈 곳 없는 경비원이 매 프레임 BFS를 돌리지 않게 한다. */
const MIN_REPATH_GAP = 0.1;

function moveToward(from: Point, to: Point): MoveKind | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  if (dx === -1) return "left";
  if (dx === 1) return "right";
  return dy === -1 ? "up" : "down";
}

function decideGuardMove(state: GameState, guard: Guard, dt: number) {
  const view = guardView(state, guard);

  // 중력이 경로보다 우선한다.
  if (!isSupported(view, guard.x, guard.y)) {
    if (!view.isBlocked(guard.x, guard.y + 1)) {
      startMove(guard, "fall");
      const next = guard.path[0];
      if (next && next.x === guard.tx && next.y === guard.ty) guard.path.shift();
      else guard.nextRepathAt = state.time;
    }
    return;
  }

  const canRepath = state.time - guard.lastRepathAt >= MIN_REPATH_GAP;
  if (state.time >= guard.nextRepathAt || (guard.path.length === 0 && canRepath)) repath(state, guard);

  const moves = legalMoves(view, guard.x, guard.y);
  const plannedMove = () => {
    const next = guard.path[0];
    const move = next ? moveToward(guard, next) : null;
    return next && move && moves.includes(move) ? { next, move } : null;
  };

  let step = plannedMove();
  if (!step && guard.path.length > 0 && state.time - guard.lastRepathAt >= MIN_REPATH_GAP) {
    // 계획한 경로가 실제 지형과 맞지 않으면(구멍·다른 경비원 등) 다시 계산한다.
    repath(state, guard);
    step = plannedMove();
  }
  if (!step) return; // 갈 곳이 없으면 제자리 대기
  const { next, move } = step;

  const targetCell = toCell(state.level, next.x, next.y);
  if (isCellTakenByOtherGuard(state, guard, targetCell) && guard.blockedFor < GUARD.maxBlockedWait) {
    guard.blockedFor += dt;
    return;
  }

  guard.blockedFor = 0;
  guard.path.shift();
  startMove(guard, move);
}

/** 화면 위쪽에서 플레이어와 충분히 떨어진, 설 수 있는 빈 칸에 다시 나타난다. */
function respawnGuard(state: GameState, guard: Guard, events: GameEvent[]) {
  const view = planningView(state);
  const { width, height } = state.level;
  const playerCell = fromCell(state.level, occupiedCellOf(state.player, width));

  for (let y = 0; y < height; y++) {
    let best: Point | null = null;
    let bestDistance = -1;
    for (let x = 0; x < width; x++) {
      const cell = y * width + x;
      if (view.isBlocked(x, y) || !isSupported(view, x, y) || state.holes.has(cell)) continue;
      if (state.level.tiles[cell] === Tile.EscapeLadder) continue;
      if (isCellTakenByOtherGuard(state, guard, cell)) continue;
      const distance = Math.abs(x - playerCell.x) + Math.abs(y - playerCell.y);
      if (distance < GUARD.respawnMinDistance) continue;
      if (distance > bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
    if (best) {
      Object.assign(guard, createActor(best));
      guard.status = "chasing";
      guard.statusSince = state.time;
      guard.path = [];
      guard.nextRepathAt = state.time;
      guard.blockedFor = 0;
      events.push({ type: "guardRespawned", guardId: guard.id });
      return;
    }
  }
  guard.respawnAt = state.time + 1; // 적당한 자리가 없으면 잠시 후 다시 시도
}
