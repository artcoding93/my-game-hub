import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GAME_CONFIG, gravityFor, LEVELS, levelForLines } from "../config";
import { PIECE_TYPES, type GameEvent, type GameState, type InputSnapshot, type PieceType, type Point } from "../types";
import {
  bumpCandidates,
  collides,
  COLS,
  createGame,
  EMPTY_INPUT,
  ghostY,
  HIDDEN,
  linePoints,
  pieceCells,
  placeBumps,
  restoreGame,
  ROWS,
  serializeGame,
  snowTarget,
  startGame,
  stepGame,
} from "./game";
import { shapeCells } from "./pieces";

/* 실행: npm run test:winter-blocks */

const DT = 1 / 60;
const H = GAME_CONFIG.hazards;

function playing(seed = 1): GameState {
  const state = createGame(seed);
  startGame(state, seed);
  state.banner = null;
  return state;
}

function step(state: GameState, input: Partial<InputSnapshot> = {}, frames = 1): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < frames; i++) events.push(...stepGame(state, { ...EMPTY_INPUT, ...input }, DT));
  return events;
}

/** 한 프레임만 누르는 입력 (회전·하드 드롭·홀드) */
function tap(state: GameState, input: Partial<InputSnapshot>) {
  return step(state, input).concat(step(state, {}));
}

/** 판 아래쪽 줄을 채운다 (gapX 열은 비움) */
function fillRow(state: GameState, y: number, gapX: number | null = null, kind: "I" | "snow" = "I") {
  for (let x = 0; x < COLS; x++) state.board[y][x] = x === gapX ? null : { kind };
}

function setActive(state: GameState, type: PieceType, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0) {
  state.active = { type, rot, x, y };
  state.stage = "falling";
  state.lockTimer = 0;
  state.dropTimer = 0;
}

/** 다음 블록이 나올 때까지(고정 → 혹 → 줄 검사 → 생성) 시간을 흘린다 */
function settle(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < 120 && state.stage !== "falling" && state.phase === "playing"; i++) events.push(...step(state));
  return events;
}

function count(state: GameState, kind: string) {
  return state.board.flat().filter((c) => c?.kind === kind).length;
}

describe("기본 블록", () => {
  test("7종 블록은 모두 4칸이고, 회전 4방향 모두 4칸이다", () => {
    for (const type of PIECE_TYPES) for (const rot of [0, 1, 2, 3] as const) assert.equal(shapeCells(type, rot).length, 4);
  });

  test("7-bag: 7개씩 끊어 보면 7종이 정확히 한 번씩 나온다", () => {
    for (const seed of [1, 7, 42]) {
      const state = playing(seed);
      const sequence: PieceType[] = [state.active!.type];
      for (let i = 0; i < 27; i++) {
        step(state, { hardDrop: true });
        settle(state);
        for (let y = 0; y < ROWS; y++) state.board[y].fill(null);
        sequence.push(state.active!.type);
      }
      for (let i = 0; i + 7 <= sequence.length; i += 7) assert.equal(new Set(sequence.slice(i, i + 7)).size, 7, `bag ${i / 7}`);
    }
  });

  test("좌우 이동, 벽에서 멈춤", () => {
    const state = playing();
    setActive(state, "T", 4, 5);
    tap(state, { move: -1 });
    assert.equal(state.active!.x, 3);
    for (let i = 0; i < 20; i++) tap(state, { move: -1 });
    assert.equal(state.active!.x, 0);
    for (let i = 0; i < 20; i++) tap(state, { move: 1 });
    assert.equal(state.active!.x, COLS - 3);
  });

  test("길게 누르면 DAS 뒤에 반복 이동한다", () => {
    const state = playing();
    setActive(state, "O", 4, 5);
    step(state, { move: -1 }, 1);
    assert.equal(state.active!.x, 3);
    step(state, { move: -1 }, Math.floor(GAME_CONFIG.das * 60) - 2);
    assert.equal(state.active!.x, 3, "no repeat before DAS");
    step(state, { move: -1 }, 10);
    assert.equal(state.active!.x, 0);
  });

  test("시계·반시계 회전, 벽에 붙어 있어도 벽 밀기로 회전한다", () => {
    const state = playing();
    setActive(state, "T", 4, 5);
    tap(state, { rotateCW: true });
    assert.equal(state.active!.rot, 1);
    tap(state, { rotateCCW: true });
    assert.equal(state.active!.rot, 0);
    // 세로 I를 오른쪽 벽에 붙인 뒤 회전
    setActive(state, "I", 7, 5, 1);
    for (let i = 0; i < 5; i++) tap(state, { move: 1 });
    assert.ok(pieceCells(state.active!).some((c) => c.x === COLS - 1));
    tap(state, { rotateCW: true });
    assert.equal(state.active!.rot, 2);
    assert.ok(!collides(state.board, state.active!));
  });

  test("바닥·블록과 충돌하고, 고스트는 착지 위치를 가리킨다", () => {
    const state = playing();
    setActive(state, "O", 4, 3);
    assert.equal(ghostY(state.board, state.active!), ROWS - 2);
    fillRow(state, ROWS - 1);
    fillRow(state, ROWS - 2, 0);
    assert.equal(ghostY(state.board, state.active!), ROWS - 4);
  });

  test("하드 드롭은 바로 고정하고 거리 보너스를 준다", () => {
    const state = playing();
    setActive(state, "O", 4, 3);
    const distance = ROWS - 2 - 3;
    const events = step(state, { hardDrop: true });
    assert.ok(events.some((e) => e.type === "hardDrop" && e.distance === distance));
    assert.ok(events.some((e) => e.type === "lock"));
    assert.equal(state.active, null);
    assert.equal(state.score, distance * GAME_CONFIG.score.hardDropPerCell);
  });

  test("자연 낙하로 바닥에 닿으면 잠시 뒤 고정된다", () => {
    const state = playing();
    setActive(state, "O", 4, ROWS - 3);
    const events = step(state, {}, Math.ceil((gravityFor(1) + GAME_CONFIG.lockDelay) * 60) + 4);
    assert.ok(events.some((e) => e.type === "lock"));
  });

  test("홀드: 지금 블록을 보관하고, 다음 홀드는 블록이 고정된 뒤에만 된다", () => {
    const state = playing();
    const first = state.active!.type;
    const next = state.queue[0];
    tap(state, { hold: true });
    assert.equal(state.hold, first);
    assert.equal(state.active!.type, next);
    tap(state, { hold: true });
    assert.equal(state.active!.type, next, "only once per piece");
    step(state, { hardDrop: true });
    settle(state);
    tap(state, { hold: true });
    assert.equal(state.active!.type, first, "swap back from hold");
  });
});

describe("혹 생성", () => {
  test("낙하 중에는 판에 혹이 없고, 착지해 고정된 뒤에 혹 1칸이 생긴다", () => {
    const state = playing();
    setActive(state, "T", 4, 3);
    step(state, {}, 30);
    assert.equal(count(state, "bump"), 0);
    const events = step(state, { hardDrop: true });
    const lock = events.findIndex((e) => e.type === "lock");
    const bump = events.findIndex((e) => e.type === "bump");
    assert.ok(lock >= 0 && bump > lock, "bump after lock");
    assert.equal(count(state, "bump"), 1);
    assert.equal(state.board.flat().filter(Boolean).length, 5);
  });

  test("혹은 고정된 블록 바로 위의 빈칸에 생긴다 (위쪽 우선)", () => {
    for (let seed = 1; seed < 40; seed++) {
      const state = playing(seed);
      setActive(state, "I", 3, 3);
      step(state, { hardDrop: true });
      const bump = state.board.flatMap((row, y) => row.map((c, x) => (c?.kind === "bump" ? { x, y } : null))).find(Boolean)!;
      assert.equal(bump.y, ROWS - 2);
      assert.ok(bump.x >= 3 && bump.x <= 6);
    }
  });

  test("위쪽 후보가 없으면 아래쪽 인접 빈칸, 둘 다 없으면 안전하게 생략한다", () => {
    const state = playing();
    // 위가 모두 막힌 블록
    const cells: Point[] = [{ x: 0, y: 10 }, { x: 1, y: 10 }];
    for (const c of cells) state.board[c.y][c.x] = { kind: "I" };
    state.board[9][0] = { kind: "I" };
    state.board[9][1] = { kind: "I" };
    assert.deepEqual(
      bumpCandidates(state.board, cells).sort((a, b) => a.x - b.x),
      [{ x: 0, y: 11 }, { x: 1, y: 11 }],
    );
    state.board[11][0] = { kind: "I" };
    state.board[11][1] = { kind: "I" };
    assert.deepEqual(bumpCandidates(state.board, cells), []);
    assert.deepEqual(placeBumps(state, cells), []);
  });

  test("판 밖·숨김 생성 영역·이미 찬 칸에는 혹이 생기지 않는다", () => {
    const state = playing();
    const cells: Point[] = [{ x: 0, y: HIDDEN }, { x: COLS - 1, y: HIDDEN }];
    assert.ok(bumpCandidates(state.board, cells).every((p) => p.y >= HIDDEN && p.x >= 0 && p.x < COLS));
    for (let seed = 1; seed < 200; seed++) {
      const s = playing(seed);
      s.level = 2;
      const piece = pieceCells({ type: "T", rot: 0, x: 3, y: 15 });
      for (const c of piece) s.board[c.y][c.x] = { kind: "T" };
      s.board[14][3] = { kind: "I" };
      const placed = placeBumps(s, piece);
      for (const p of placed) {
        assert.ok(!piece.some((c) => c.x === p.x && c.y === p.y));
        assert.ok(!(p.x === 3 && p.y === 14));
      }
      assert.equal(new Set(placed.map((p) => `${p.x},${p.y}`)).size, placed.length);
    }
  });

  test("Level 1은 항상 1칸, Level 2 이상은 약 25% 확률로 2칸", () => {
    let doubles = 0;
    const N = 2000;
    for (let seed = 1; seed <= N; seed++) {
      const s = playing(seed);
      s.level = 2;
      const piece = pieceCells({ type: "I", rot: 0, x: 3, y: 15 });
      for (const c of piece) s.board[c.y][c.x] = { kind: "I" };
      const n = placeBumps(s, piece).length;
      assert.ok(n === 1 || n === 2);
      if (n === 2) doubles++;
      const l1 = playing(seed);
      for (const c of piece) l1.board[c.y][c.x] = { kind: "I" };
      assert.equal(placeBumps(l1, piece).length, 1);
    }
    assert.ok(doubles / N > 0.2 && doubles / N < 0.3, `ratio ${doubles / N}`);
  });

  test("혹으로 완성된 가로줄도 제거된다 (실제 고정 경로: 고정 → 혹 → 줄 검사)", () => {
    const state = playing(4);
    // 아래 5줄은 9열만 비어 있다. 세로 I가 9열 아래 4줄을 채우고, 혹(세로 I 위 한 칸뿐)이 5번째 줄을 완성한다.
    for (let y = ROWS - 5; y < ROWS; y++) fillRow(state, y, 9);
    state.active = { type: "I", rot: 1, x: 7, y: 3 };
    assert.ok(pieceCells(state.active).every((c) => c.x === 9));
    const events = step(state, { hardDrop: true }).concat(settle(state));
    const bump = events.find((e) => e.type === "bump");
    assert.ok(bump && bump.type === "bump");
    assert.deepEqual(bump.cells, [{ x: 9, y: ROWS - 5 }]);
    const clear = events.find((e) => e.type === "lineClear");
    assert.ok(clear && clear.type === "lineClear");
    assert.equal(clear.count, 5);
    assert.ok(clear.rows.includes(ROWS - 5), "row completed by the bump");
    assert.ok(events.indexOf(bump) < events.indexOf(clear));
  });

  test("혹이 가로줄을 완성하면 그 줄이 제거된다 (직접 구성)", () => {
    const state = playing(3);
    // ROWS-1 줄: 0~3열과 6~9열이 차 있고 4·5열이 빈칸. I를 세로로 4열 위에… 대신 판을 직접 구성해 혹 후보를 하나로 만든다.
    for (let x = 0; x < COLS; x++) if (x !== 5) state.board[ROWS - 1][x] = { kind: "I" };
    // 고정될 블록: 5열 위쪽(ROWS-2)에 걸쳐 있지 않도록, 블록 칸 바로 아래(5, ROWS-1)만 후보가 되게 위쪽을 막는다.
    const piece = [{ x: 4, y: ROWS - 2 }, { x: 5, y: ROWS - 2 }, { x: 6, y: ROWS - 2 }, { x: 7, y: ROWS - 2 }];
    for (const c of piece) state.board[c.y][c.x] = { kind: "I" };
    for (const c of piece) state.board[c.y - 1][c.x] = { kind: "I" };
    const placed = placeBumps(state, piece);
    assert.deepEqual(placed, [{ x: 5, y: ROWS - 1 }]);
    state.stage = "settle";
    state.stageTimer = 0;
    state.active = null;
    const events = step(state);
    assert.ok(events.some((e) => e.type === "lineClear" && e.rows.includes(ROWS - 1)));
  });
});

describe("줄 제거와 점수", () => {
  test("1·2·3·4줄 점수 100/300/500/800 × 레벨, 콤보 보너스", () => {
    assert.equal(linePoints(1, 1, 0), 100);
    assert.equal(linePoints(2, 1, 0), 300);
    assert.equal(linePoints(3, 1, 0), 500);
    assert.equal(linePoints(4, 1, 0), 800);
    assert.equal(linePoints(4, 3, 0), 2400);
    assert.equal(linePoints(1, 2, 2), 200 + 50 * 2 * 2);
    assert.ok(linePoints(5, 1, 0) > 800, "5 lines possible with bumps");
  });

  test("완성된 줄은 짧은 연출 뒤 사라지고 위 줄이 내려온다", () => {
    const state = playing();
    fillRow(state, ROWS - 1, 4);
    state.board[ROWS - 2][0] = { kind: "S" };
    setActive(state, "I", 3, 3, 1); // 세로 I: x=5열? 세로 I는 상자 2열
    state.active = { type: "I", rot: 1, x: 2, y: 3 };
    assert.ok(pieceCells(state.active).every((c) => c.x === 4));
    const events = step(state, { hardDrop: true }).concat(settle(state));
    const clear = events.find((e) => e.type === "lineClear");
    assert.ok(clear && clear.type === "lineClear" && clear.count === 1);
    assert.equal(state.lines, 1);
    assert.equal(state.board[ROWS - 1][0]?.kind, "S", "row above shifted down");
  });

  test("콤보: 연속으로 줄을 지우면 combo가 올라가고, 못 지우면 초기화", () => {
    const state = playing();
    state.combo = 0;
    fillRow(state, ROWS - 1);
    state.active = null;
    state.stage = "settle";
    state.stageTimer = 0;
    const events = step(state);
    const e = events.find((x) => x.type === "lineClear");
    assert.ok(e && e.type === "lineClear" && e.combo === 1);
  });
});

describe("난이도", () => {
  test("레벨 전환: 5·12·20·30·42줄, 이후 더 오르지 않는다", () => {
    assert.deepEqual([0, 4, 5, 11, 12, 19, 20, 29, 30, 41, 42, 500].map((n) => levelForLines(n).level), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    assert.deepEqual(LEVELS.map((l) => l.name), ["Snow Bump", "Double Snow", "Frozen Block", "Winter Wind", "Snowfall", "Blizzard"]);
  });

  test("낙하 간격 1.10 → 0.65초, 하한 0.65초", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(gravityFor), [1.1, 1.0, 0.9, 0.8, 0.72, 0.65]);
    assert.equal(gravityFor(9), 0.65);
    assert.ok([1, 2, 3, 4, 5, 6, 7].every((l) => gravityFor(l) >= GAME_CONFIG.minGravity));
  });

  test("줄 제거로 레벨이 오르면 levelUp 이벤트와 안내가 나온다", () => {
    const state = playing();
    state.lines = 4;
    fillRow(state, ROWS - 1);
    state.active = null;
    state.stage = "settle";
    state.stageTimer = 0;
    const events = step(state);
    assert.ok(events.some((e) => e.type === "levelUp" && e.level === 2));
    assert.equal(state.level, 2);
    assert.equal(state.banner?.level, 2);
  });
});

/** 블록을 바닥으로 떨어뜨리고 다음 블록까지 진행 (판이 너무 높아지면 지운다) */
function dropAndSettle(state: GameState): GameEvent[] {
  const events = step(state, { hardDrop: true });
  events.push(...settle(state));
  if (state.board.slice(0, HIDDEN + 8).some((row) => row.some(Boolean))) {
    for (let y = 0; y < ROWS; y++) state.board[y].fill(null);
  }
  return events;
}

describe("방해 효과", () => {
  test("Level 2 이하에서는 얼음·바람·눈이 나오지 않는다", () => {
    const state = playing(5);
    state.level = 2;
    const events: GameEvent[] = [];
    for (let i = 0; i < 60 && state.phase === "playing"; i++) events.push(...dropAndSettle(state));
    assert.ok(!events.some((e) => ["iceCreate", "windWarn", "snowWarn"].includes(e.type)));
  });

  test("얼음: Level 3에서 블록 6개 고정당 최대 1칸", () => {
    const state = playing(5);
    state.level = 3;
    const ices: number[] = [];
    for (let i = 0; i < 60 && state.phase === "playing"; i++) {
      const events = dropAndSettle(state);
      if (events.some((e) => e.type === "iceCreate")) ices.push(state.pieces);
    }
    assert.ok(ices.length >= 5, `ice count ${ices.length}`);
    for (let i = 1; i < ices.length; i++) assert.ok(ices[i] - ices[i - 1] >= H.iceEvery);
  });

  test("얼음이 있는 완성 줄은 금이 가고 남았다가, 다음 고정 때 제거된다", () => {
    const state = playing();
    fillRow(state, ROWS - 1);
    state.board[ROWS - 1][3] = { kind: "T", ice: "solid" };
    state.active = null;
    state.stage = "settle";
    state.stageTimer = 0;
    const first = step(state);
    assert.ok(first.some((e) => e.type === "iceCrack"));
    assert.ok(!first.some((e) => e.type === "lineClear"));
    assert.equal(state.board[ROWS - 1][3]?.ice, "cracked");
    assert.ok(state.active, "next piece spawned");
    // 다음 블록 고정 → 다시 검사 → 제거
    const events = step(state, { hardDrop: true }).concat(settle(state));
    assert.ok(events.some((e) => e.type === "lineClear" && e.rows.length >= 1));
    assert.ok(state.board[ROWS - 1].every((c) => c?.ice !== "cracked") || state.lines >= 1);
    assert.ok(state.lines >= 1);
  });

  test("바람: Level 4에서 2초 이상 예고 후 한 칸 밀고, 막혀 있으면 움직이지 않는다", () => {
    const state = playing(11);
    state.level = 4;
    state.lastWindPiece = -10;
    state.lastHazardPiece = -10;
    // 다음 블록 생성 때 예고
    let warn: GameEvent | undefined;
    for (let i = 0; i < 10 && !warn; i++) warn = dropAndSettle(state).find((e) => e.type === "windWarn");
    assert.ok(warn && warn.type === "windWarn");
    assert.ok(state.wind!.timer >= H.windWarning);
    // 예고 직후 1.9초 동안은 불지 않는다
    setActive(state, "O", 4, 3);
    const early = step(state, {}, Math.floor(1.9 * 60));
    assert.ok(!early.some((e) => e.type === "wind"));
    state.active = { type: "O", rot: 0, x: 4, y: 3 };
    const x0 = state.active.x;
    let gust: GameEvent | undefined;
    for (let i = 0; i < 200 && !gust; i++) gust = step(state).find((e) => e.type === "wind");
    assert.ok(gust && gust.type === "wind" && gust.moved);
    assert.equal(state.active!.x, x0 + gust.dir);
    // 벽에 붙어 있으면 움직이지 않는다
    state.wind = { dir: -1, timer: 0 };
    state.active = { type: "O", rot: 0, x: 0, y: 5 };
    const blocked = step(state).find((e) => e.type === "wind");
    assert.ok(blocked && blocked.type === "wind" && !blocked.moved);
    assert.equal(state.active!.x, 0);
  });

  test("바람은 블록 5개 배치당 최대 1회", () => {
    const state = playing(13);
    state.level = 4;
    const at: number[] = [];
    for (let i = 0; i < 80 && state.phase === "playing"; i++) {
      if (dropAndSettle(state).some((e) => e.type === "windWarn")) at.push(state.pieces);
    }
    assert.ok(at.length >= 5);
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= H.windEvery);
  });

  test("눈 블록: Level 5에서 열을 미리 표시하고, 다음 고정 때 쌓인 블록 위에 생긴다", () => {
    const state = playing(17);
    state.level = 5;
    state.lastSnowPiece = -10;
    state.lastHazardPiece = -10;
    let warn: GameEvent | undefined;
    for (let i = 0; i < 10 && !warn; i++) warn = dropAndSettle(state).find((e) => e.type === "snowWarn");
    assert.ok(warn && warn.type === "snowWarn");
    assert.equal(state.snowColumn, warn.column);
    const events = step(state, { hardDrop: true });
    const snow = events.find((e) => e.type === "snowfall");
    assert.ok(snow && snow.type === "snowfall");
    assert.equal(snow.cell.x, warn.column);
    assert.equal(state.board[snow.cell.y][snow.cell.x]?.kind, "snow");
    // 쌓인 블록 바로 위(또는 바닥)
    assert.ok(snow.cell.y === ROWS - 1 || state.board[snow.cell.y + 1][snow.cell.x] !== null);
    assert.ok(snow.cell.y >= HIDDEN + H.snowSafeRows, "not in spawn area");
  });

  test("눈 블록은 생성 영역 근처(위쪽 줄)에 생기지 않는다", () => {
    const state = playing();
    for (let y = HIDDEN + 2; y < ROWS; y++) state.board[y][0] = { kind: "I" };
    assert.equal(snowTarget(state.board, 0), null);
    assert.deepEqual(snowTarget(state.board, 1), { x: 1, y: ROWS - 1 });
  });

  test("Level 6: 한 번의 고정에서 얼음과 눈 블록이 함께 생기지 않고, 방해 효과 사이에 쿨다운이 있다", () => {
    for (const seed of [21, 22, 23, 24]) {
      const state = playing(seed);
      state.level = 6;
      const hazardsAt: number[] = [];
      for (let i = 0; i < 120 && state.phase === "playing"; i++) {
        const events = dropAndSettle(state);
        const kinds = events.filter((e) => ["iceCreate", "snowfall", "windWarn", "snowWarn"].includes(e.type)).map((e) => e.type);
        assert.ok(!(kinds.includes("iceCreate") && kinds.includes("snowfall")), "ice + snow in one lock");
        // 예고(바람·눈)와 얼음은 동시에 진행되지 않는다
        assert.ok(!(state.wind && state.snowColumn !== null));
        if (kinds.some((k) => k !== "snowfall")) hazardsAt.push(state.pieces);
      }
      assert.ok(hazardsAt.length >= 8, `hazards ${hazardsAt.length}`);
      for (let i = 1; i < hazardsAt.length; i++) assert.ok(hazardsAt[i] - hazardsAt[i - 1] >= 1);
      assert.equal(gravityFor(state.level), 0.65);
    }
  });
});

describe("게임 오버·저장", () => {
  test("새 블록을 놓을 수 없으면 게임 오버", () => {
    const state = playing();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (x !== 0) state.board[y][x] = { kind: "I" };
    state.active = null;
    state.stage = "settle";
    state.stageTimer = 0;
    const events = step(state);
    assert.ok(events.some((e) => e.type === "gameOver"));
    assert.equal(state.phase, "gameOver");
  });

  test("처음부터 블록을 계속 떨어뜨리면 오류 없이 게임 오버까지 진행된다 (여러 시드)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = playing(seed);
      let guard = 0;
      while (state.phase === "playing" && guard++ < 3000) {
        step(state, { hardDrop: guard % 2 === 0, move: guard % 7 === 0 ? -1 : guard % 5 === 0 ? 1 : 0, rotateCW: guard % 3 === 0 });
        // 판 상태 불변식: 모든 칸이 판 안, 낙하 블록은 다른 칸과 겹치지 않음
        if (state.active) assert.ok(!collides(state.board, state.active));
      }
      assert.equal(state.phase, "gameOver", `seed ${seed}`);
      assert.ok(state.score >= 0);
    }
  });

  test("상태를 JSON으로 저장했다가 그대로 복원한다 (금 간 얼음 포함)", () => {
    const state = playing(9);
    state.board[ROWS - 1][2] = { kind: "Z", ice: "cracked" };
    state.board[ROWS - 2][3] = { kind: "snow" };
    state.score = 1234;
    const restored = restoreGame(serializeGame(state));
    assert.ok(restored);
    assert.deepEqual(restored, state);
    assert.equal(restoreGame("broken"), null);
    assert.equal(restoreGame(JSON.stringify({ board: [] })), null);
  });
});
