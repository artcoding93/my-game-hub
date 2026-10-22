import { GAME_CONFIG, gravityFor, levelForLines, TOTAL_ROWS } from "../config";
import {
  PIECE_TYPES,
  type ActivePiece,
  type Board,
  type Cell,
  type GameEvent,
  type GameState,
  type InputSnapshot,
  type PieceType,
  type Point,
  type Rotation,
} from "../types";
import { kicks, shapeCells, spawnX } from "./pieces";

/*
 * Winter Blocks 게임 규칙 (순수 TypeScript, React·DOM·Canvas 비의존).
 * stepGame()을 고정 시간 간격으로 호출하며, 소리·연출에 쓸 이벤트를 돌려준다.
 *
 * 블록 한 개의 순서 (기획서 순서를 그대로 지킨다)
 *   1. 4칸 블록 생성 → 2. 이동·회전 → 3. 낙하 → 4. 착지 → 5. 4칸 블록 고정
 *   6. 고정된 블록 위쪽에 혹 생성 (+ 방해 효과: 눈 블록·얼음) → 짧은 혹 연출(settle)
 *   7. 가로줄 검사 (얼음이 있으면 금이 가고 다음 검사 때 제거) → 줄 제거 연출(clear) → 8. 다음 블록 생성
 * 낙하 중인 블록은 언제나 4칸이며, 혹은 고정 이후에만 판에 추가된다.
 */

const C = GAME_CONFIG;
const H = C.hazards;
export const COLS = C.cols;
export const ROWS = TOTAL_ROWS;
export const HIDDEN = C.hiddenRows;

export const EMPTY_INPUT: InputSnapshot = {
  move: 0,
  softDrop: false,
  rotateCW: false,
  rotateCCW: false,
  hardDrop: false,
  hold: false,
};

// ── 난수 (시드 고정, mulberry32) ──

export function random(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pick<T>(state: { rng: number }, list: readonly T[]): T {
  return list[Math.floor(random(state) * list.length)];
}

/** 7종을 한 번씩 섞은 묶음(7-bag)을 큐 뒤에 붙인다. 같은 블록이 오래 안 나오는 일을 막는다. */
function refillQueue(state: GameState) {
  while (state.queue.length < 7) {
    const bag = [...PIECE_TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random(state) * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    state.queue.push(...bag);
  }
}

// ── 판 ──

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell | null>(COLS).fill(null));
}

export function pieceCells(piece: ActivePiece): Point[] {
  return shapeCells(piece.type, piece.rot).map(({ x, y }) => ({ x: piece.x + x, y: piece.y + y }));
}

export function collides(board: Board, piece: ActivePiece): boolean {
  return pieceCells(piece).some(({ x, y }) => x < 0 || x >= COLS || y < 0 || y >= ROWS || board[y][x] !== null);
}

/** 고스트 블록(바로 떨어뜨렸을 때 놓일 자리)의 y */
export function ghostY(board: Board, piece: ActivePiece): number {
  let y = piece.y;
  while (!collides(board, { ...piece, y: y + 1 })) y++;
  return y;
}

function isEmpty(board: Board, x: number, y: number) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS && board[y][x] === null;
}

// ── 상태 ──

export function createGame(seed: number, highScore = 0): GameState {
  const state: GameState = {
    phase: "title",
    stage: "falling",
    stageTimer: 0,
    board: emptyBoard(),
    active: null,
    hold: null,
    holdUsed: false,
    queue: [],
    rng: seed | 0,
    score: 0,
    lines: 0,
    level: 1,
    combo: -1,
    dropTimer: 0,
    lockTimer: 0,
    lockResets: 0,
    pieces: 0,
    repeatDir: 0,
    repeatTimer: 0,
    clearingRows: [],
    lastIcePiece: 0,
    lastWindPiece: 0,
    lastSnowPiece: 0,
    lastHazardPiece: -99,
    wind: null,
    snowColumn: null,
    banner: null,
    highScore,
    time: 0,
  };
  refillQueue(state);
  return state;
}

export function startGame(state: GameState, seed: number): GameEvent[] {
  Object.assign(state, createGame(seed, state.highScore), { phase: "playing" });
  const events: GameEvent[] = [{ type: "start" }];
  state.banner = { level: 1, timer: 3 };
  spawnNext(state, events);
  return events;
}

export function togglePause(state: GameState) {
  if (state.phase === "playing") state.phase = "paused";
  else if (state.phase === "paused") state.phase = "playing";
}

export function pause(state: GameState) {
  if (state.phase === "playing") state.phase = "paused";
}

function endGame(state: GameState, events: GameEvent[]) {
  state.phase = "gameOver";
  state.active = null;
  state.wind = null;
  state.snowColumn = null;
  state.highScore = Math.max(state.highScore, state.score);
  events.push({ type: "gameOver" });
}

// ── 생성·홀드 ──

function makePiece(type: PieceType): ActivePiece {
  return { type, rot: 0, x: spawnX(type, COLS), y: 0 };
}

/** 블록을 생성 위치에 놓는다. 놓을 수 없으면 게임 오버 */
function placeNew(state: GameState, type: PieceType, events: GameEvent[]): boolean {
  const piece = makePiece(type);
  if (collides(state.board, piece)) {
    endGame(state, events);
    return false;
  }
  // 숨김 줄에서 한 칸 내려와 보이는 판에 바로 모습을 드러낸다.
  if (!collides(state.board, { ...piece, y: piece.y + 1 })) piece.y += 1;
  state.active = piece;
  state.stage = "falling";
  state.dropTimer = 0;
  state.lockTimer = 0;
  state.lockResets = 0;
  return true;
}

function spawnNext(state: GameState, events: GameEvent[]) {
  const type = state.queue.shift()!;
  refillQueue(state);
  state.holdUsed = false;
  if (!placeNew(state, type, events)) return;
  scheduleHazards(state, events);
}

function holdPiece(state: GameState, events: GameEvent[]) {
  if (!state.active || state.holdUsed) return;
  const current = state.active.type;
  const next = state.hold;
  state.hold = current;
  state.holdUsed = true;
  events.push({ type: "hold" });
  if (next) placeNew(state, next, events);
  else {
    const type = state.queue.shift()!;
    refillQueue(state);
    placeNew(state, type, events);
  }
}

// ── 이동·회전 ──

function tryMove(state: GameState, dx: number, dy: number): boolean {
  const piece = state.active;
  if (!piece) return false;
  const moved = { ...piece, x: piece.x + dx, y: piece.y + dy };
  if (collides(state.board, moved)) return false;
  state.active = moved;
  return true;
}

function tryRotate(state: GameState, dir: 1 | -1): boolean {
  const piece = state.active;
  if (!piece) return false;
  const to = (((piece.rot + dir) % 4) + 4) % 4 as Rotation;
  for (const kick of kicks(piece.type, piece.rot, to)) {
    const rotated = { ...piece, rot: to, x: piece.x + kick.x, y: piece.y + kick.y };
    if (!collides(state.board, rotated)) {
      state.active = rotated;
      return true;
    }
  }
  return false;
}

function grounded(state: GameState) {
  return state.active !== null && collides(state.board, { ...state.active, y: state.active.y + 1 });
}

/** 바닥에 닿은 상태에서 이동·회전하면 고정을 조금 미룬다(횟수 제한). */
function resetLock(state: GameState) {
  if (grounded(state) && state.lockResets < C.maxLockResets) {
    state.lockTimer = 0;
    state.lockResets++;
  }
}

// ── 고정·혹·방해 효과 ──

/**
 * 혹 후보: 고정된 블록 칸과 상하로 인접한 빈칸.
 * 위쪽 칸이 하나라도 있으면 위쪽만, 없으면 아래쪽(블록이 걸쳐 생긴 빈칸)을 쓴다.
 * 판 밖·숨김 줄·이미 찬 칸·제외 목록은 빠진다.
 */
export function bumpCandidates(board: Board, cells: Point[], exclude: Point[] = []): Point[] {
  const key = (p: Point) => `${p.x},${p.y}`;
  const own = new Set(cells.map(key));
  const skip = new Set(exclude.map(key));
  const valid = (p: Point) => p.y >= HIDDEN && isEmpty(board, p.x, p.y) && !own.has(key(p)) && !skip.has(key(p));
  const unique = (list: Point[]) => [...new Map(list.filter(valid).map((p) => [key(p), p])).values()];
  const up = unique(cells.map(({ x, y }) => ({ x, y: y - 1 })));
  if (up.length > 0) return up;
  return unique(cells.map(({ x, y }) => ({ x, y: y + 1 })));
}

/** 혹 생성. 첫 혹은 항상 시도하고, Level 2부터 25% 확률로 두 번째 혹을 시도한다. 후보가 없으면 생략한다. */
export function placeBumps(state: GameState, cells: Point[]): Point[] {
  const placed: Point[] = [];
  const attempts = 1 + (state.level >= C.bump.secondFromLevel && random(state) < C.bump.secondChance ? 1 : 0);
  for (let i = 0; i < attempts; i++) {
    const candidates = bumpCandidates(state.board, cells, placed);
    if (candidates.length === 0) break;
    const spot = pick(state, candidates);
    state.board[spot.y][spot.x] = { kind: "bump" };
    placed.push(spot);
  }
  return placed;
}

/** 열에서 눈 블록이 쌓일 칸 (쌓인 블록 바로 위, 빈 열이면 바닥). 생성 영역 근처면 null */
export function snowTarget(board: Board, column: number): Point | null {
  let y = ROWS - 1;
  for (let row = 0; row < ROWS; row++) {
    if (board[row][column] !== null) {
      y = row - 1;
      break;
    }
  }
  if (y < HIDDEN + H.snowSafeRows || !isEmpty(board, column, y)) return null;
  return { x: column, y };
}

function hazardReady(state: GameState) {
  return state.pieces - state.lastHazardPiece >= H.cooldown && state.wind === null && state.snowColumn === null;
}

/** 새 블록이 나올 때: 바람·눈 블록 예고 (한 번에 하나만) */
function scheduleHazards(state: GameState, events: GameEvent[]) {
  if (!hazardReady(state)) return;
  if (state.level >= H.snowFromLevel && state.pieces - state.lastSnowPiece >= H.snowEvery) {
    const columns = Array.from({ length: COLS }, (_, x) => x).filter((x) => snowTarget(state.board, x) !== null);
    if (columns.length > 0) {
      state.snowColumn = pick(state, columns);
      state.lastHazardPiece = state.pieces;
      events.push({ type: "snowWarn", column: state.snowColumn });
      return;
    }
  }
  if (state.level >= H.windFromLevel && state.pieces - state.lastWindPiece >= H.windEvery) {
    const dir: -1 | 1 = random(state) < 0.5 ? -1 : 1;
    state.wind = { dir, timer: H.windWarning + random(state) * 1.0 };
    state.lastWindPiece = state.pieces;
    state.lastHazardPiece = state.pieces;
    events.push({ type: "windWarn", dir });
  }
}

function lockActive(state: GameState, events: GameEvent[]) {
  const piece = state.active;
  if (!piece) return;
  const cells = pieceCells(piece);
  for (const { x, y } of cells) state.board[y][x] = { kind: piece.type };
  state.active = null;
  state.pieces++;
  events.push({ type: "lock", cells });

  // 블록 전체가 생성 영역(숨김 줄)에 고정되면 더 진행할 수 없다.
  if (cells.every(({ y }) => y < HIDDEN)) {
    endGame(state, events);
    return;
  }

  // 6. 고정된 블록 위쪽에 혹 생성
  const bumps = placeBumps(state, cells);
  if (bumps.length > 0) events.push({ type: "bump", cells: bumps });

  // 방해 효과 (한 번의 고정에 하나만): 예고된 눈 블록이 우선, 없으면 얼음
  if (state.snowColumn !== null) {
    const target = snowTarget(state.board, state.snowColumn);
    if (target) {
      state.board[target.y][target.x] = { kind: "snow" };
      events.push({ type: "snowfall", cell: target });
    }
    state.snowColumn = null;
    state.lastSnowPiece = state.pieces;
    state.lastHazardPiece = state.pieces;
  } else if (
    state.level >= H.iceFromLevel &&
    state.pieces - state.lastIcePiece >= H.iceEvery &&
    hazardReady(state)
  ) {
    const options = cells.filter(({ y }) => y >= HIDDEN);
    if (options.length > 0) {
      const cell = pick(state, options);
      state.board[cell.y][cell.x] = { ...state.board[cell.y][cell.x]!, ice: "solid" };
      state.lastIcePiece = state.pieces;
      state.lastHazardPiece = state.pieces;
      events.push({ type: "iceCreate", cell });
    }
  }

  state.stage = "settle";
  state.stageTimer = C.settleTime;
}

export function linePoints(count: number, level: number, combo: number): number {
  const table = C.score.lines;
  const base = count < table.length ? table[count] : table[table.length - 1] + (count - (table.length - 1)) * 400;
  return base * level + (combo > 0 ? C.score.combo * combo * level : 0);
}

/**
 * 7. 줄 검사. 얼음(solid)이 있는 완성 줄은 금이 가기만 하고 남는다.
 * 금 간 얼음만 있는 완성 줄(이전 검사에서 금이 간 줄)과 얼음 없는 완성 줄은 제거 대상이다.
 */
export function resolveLines(state: GameState, events: GameEvent[]): number[] {
  const full = state.board.map((row, y) => (row.every((c) => c !== null) ? y : -1)).filter((y) => y >= 0);
  const cracked: number[] = [];
  const clear: number[] = [];
  for (const y of full) {
    const row = state.board[y];
    if (row.some((c) => c?.ice === "solid")) {
      for (const c of row) if (c?.ice === "solid") c.ice = "cracked";
      cracked.push(y);
    } else clear.push(y);
  }
  if (cracked.length > 0) events.push({ type: "iceCrack", rows: cracked });
  if (clear.length === 0) {
    state.combo = -1;
    return [];
  }
  state.combo++;
  const points = linePoints(clear.length, state.level, state.combo);
  state.score += points;
  state.lines += clear.length;
  events.push({ type: "lineClear", rows: clear, count: clear.length, combo: state.combo, points });
  const info = levelForLines(state.lines);
  if (info.level > state.level) {
    state.level = info.level;
    state.banner = { level: info.level, timer: 3.2 };
    events.push({ type: "levelUp", level: info.level });
  }
  return clear;
}

export function removeRows(board: Board, rows: number[]) {
  const remove = new Set(rows);
  const kept = board.filter((_, y) => !remove.has(y));
  while (kept.length < ROWS) kept.unshift(Array<Cell | null>(COLS).fill(null));
  board.splice(0, board.length, ...kept);
}

// ── 메인 루프 ──

export function stepGame(state: GameState, input: InputSnapshot, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.phase !== "playing") return events;
  state.time += dt;
  if (state.banner) {
    state.banner.timer -= dt;
    if (state.banner.timer <= 0) state.banner = null;
  }

  // 바람: 예고 후 시간이 다 되면, 떨어지는 블록이 있을 때 한 칸 민다(막히면 그대로).
  if (state.wind) {
    state.wind.timer -= dt;
    if (state.wind.timer <= 0 && state.active && state.stage === "falling") {
      const { dir } = state.wind;
      const moved = tryMove(state, dir, 0);
      if (moved) resetLock(state);
      state.wind = null;
      events.push({ type: "wind", dir, moved });
    }
  }

  if (state.stage === "settle") {
    state.stageTimer -= dt;
    if (state.stageTimer <= 0) {
      const rows = resolveLines(state, events);
      if (rows.length > 0) {
        state.stage = "clear";
        state.stageTimer = C.clearTime;
        state.clearingRows = rows;
      } else spawnNext(state, events);
    }
    return events;
  }
  if (state.stage === "clear") {
    state.stageTimer -= dt;
    if (state.stageTimer <= 0) {
      removeRows(state.board, state.clearingRows);
      state.clearingRows = [];
      spawnNext(state, events);
    }
    return events;
  }
  if (!state.active) return events;

  if (input.hold && !state.holdUsed) {
    holdPiece(state, events);
    if (state.phase !== "playing") return events;
  }
  if (input.rotateCW && tryRotate(state, 1)) {
    resetLock(state);
    events.push({ type: "rotate" });
  }
  if (input.rotateCCW && tryRotate(state, -1)) {
    resetLock(state);
    events.push({ type: "rotate" });
  }

  // 좌우 이동: 누른 순간 한 칸, 계속 누르면 DAS 뒤 ARR 간격으로 반복
  const dir = input.move;
  if (dir !== state.repeatDir) {
    state.repeatDir = dir;
    state.repeatTimer = C.das;
    if (dir !== 0 && tryMove(state, dir, 0)) {
      resetLock(state);
      events.push({ type: "move" });
    }
  } else if (dir !== 0) {
    state.repeatTimer -= dt;
    while (state.repeatTimer <= 0) {
      state.repeatTimer += C.arr;
      if (!tryMove(state, dir, 0)) break;
      resetLock(state);
      events.push({ type: "move" });
    }
  }

  if (input.hardDrop) {
    const piece = state.active;
    const target = ghostY(state.board, piece);
    const distance = target - piece.y;
    state.active = { ...piece, y: target };
    state.score += distance * C.score.hardDropPerCell;
    events.push({ type: "hardDrop", distance });
    lockActive(state, events);
    return events;
  }

  // 낙하
  const gravity = gravityFor(state.level);
  const interval = input.softDrop ? Math.min(C.softDropInterval, gravity) : gravity;
  state.dropTimer += dt;
  while (state.dropTimer >= interval) {
    if (!tryMove(state, 0, 1)) {
      state.dropTimer = 0;
      break;
    }
    state.dropTimer -= interval;
    if (input.softDrop) {
      state.score += C.score.softDropPerCell;
      events.push({ type: "softDrop" });
    }
  }

  if (grounded(state)) {
    state.lockTimer += dt;
    if (state.lockTimer >= C.lockDelay) lockActive(state, events);
  } else state.lockTimer = 0;
  return events;
}

// ── 저장·복원 (게임 상태는 순수 데이터이므로 JSON으로 그대로 저장할 수 있다) ──

export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

export function restoreGame(json: string): GameState | null {
  try {
    const data = JSON.parse(json) as GameState;
    const ok =
      Array.isArray(data.board) &&
      data.board.length === ROWS &&
      data.board.every((row) => Array.isArray(row) && row.length === COLS) &&
      Array.isArray(data.queue) &&
      typeof data.score === "number" &&
      typeof data.level === "number";
    return ok ? data : null;
  } catch {
    return null;
  }
}
