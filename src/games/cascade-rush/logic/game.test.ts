import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chainLabel, chainMultiplier, chainStepPoints, COLS, ENDLESS_SPEEDS, GAME_CONFIG, ROWS, RUSH_SPEEDS, SPAWN_X, SPAWN_Y, sizeMultiplier, speedFor, timeBonusFor } from "../config";
import { InputState } from "../input";
import { NO_INPUT, type Color, type GameEvent, type GameState, type InputSnapshot, type Pair } from "../types";
import { applyGravity, boardFrom, emptyBoard, findGroups, landingCells, pairCells, rotate } from "./board";
import { createGame, startGame, stepGame, togglePause } from "./game";

const DT = 1 / 60;

/** 연쇄 시험용 보드 (3개 연결 규칙, 실제 엔진으로 연쇄 수를 확인해 둔 배치). pair는 즉시 낙하시킬 세로 쌍 */
const CHAIN_BOARDS: Record<number, { rows: string[]; x: number; pivot: Color; child: Color }> = {
  2: { rows: ["....3.", "....1.", "....3.", "..211.", ".24434"], x: 3, pivot: 3, child: 3 },
  3: { rows: [".2....", ".3....", ".2....", "41....", "122...", "144.5."], x: 2, pivot: 2, child: 1 },
  4: { rows: ["....3.", "....41", "....14", "..1.15", "..3.41", "311243"], x: 3, pivot: 4, child: 3 },
  5: { rows: [".1.1..", ".1.3..", ".5.4.3", ".445.5", ".525.5", ".11234", "152435"], x: 2, pivot: 4, child: 5 },
  6: { rows: ["..1.54", "..1432", ".54143", "335435", "142254"], x: 0, pivot: 3, child: 5 },
};

/** 조작 중인 상태를 바로 만든다 */
function playing(rows: string[] = [], pair: Partial<Pair> = {}, mode: "rush" | "endless" = "rush"): GameState {
  const s = createGame(mode, 7);
  startGame(s, mode, 7);
  s.phase = "playing";
  s.board = rows.length ? boardFrom(rows) : emptyBoard();
  s.active = { x: 2, y: 0, orientation: 0, pivot: 1, child: 2, ...pair };
  return s;
}

function run(s: GameState, seconds: number, input: Partial<InputSnapshot> = {}): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) events.push(...stepGame(s, { ...NO_INPUT, ...input }, DT));
  return events;
}

function once(s: GameState, input: Partial<InputSnapshot>): GameEvent[] {
  return stepGame(s, { ...NO_INPUT, ...input }, DT);
}

/** 즉시 낙하 후 연쇄가 끝날 때까지 진행 */
function dropAndResolve(s: GameState): GameEvent[] {
  const events = once(s, { hardDrop: true });
  for (let i = 0; i < 5000 && s.resolve; i++) events.push(...once(s, {}));
  assert.equal(s.resolve, null, "연쇄가 끝나지 않음");
  return events;
}

function chainState(n: number, mode: "rush" | "endless" = "rush") {
  const spec = CHAIN_BOARDS[n];
  return playing(spec.rows, { x: spec.x, pivot: spec.pivot, child: spec.child }, mode);
}

function pops(events: GameEvent[]) {
  return events.filter((e): e is Extract<GameEvent, { type: "pop" }> => e.type === "pop");
}

describe("1. 좌우 이동과 회전", () => {
  test("한 번 누르면 한 칸, 누르고 있으면 반복 이동하다 벽에서 멈춘다", () => {
    const s = playing();
    once(s, { move: 1 });
    assert.equal(s.active!.x, 3);
    once(s, { move: 1 });
    assert.equal(s.active!.x, 3, "DAS 전에는 반복하지 않음");
    run(s, 0.6, { move: 1 });
    assert.equal(s.active!.x, 5);
    once(s, {});
    run(s, 1, { move: -1 });
    assert.equal(s.active!.x, 0);
  });

  test("시계·반시계 회전: 짝이 위 → 오른쪽 → 아래 → 왼쪽", () => {
    const s = playing([], { y: 5 });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      once(s, { rotateCW: true });
      seen.push(s.active!.orientation);
    }
    assert.deepEqual(seen, [1, 2, 3, 0]);
    once(s, { rotateCCW: true });
    assert.equal(s.active!.orientation, 3);
    assert.equal(s.active!.x, 2, "빈 곳에서는 축이 움직이지 않음");
  });

  test("다른 크리스털이 있는 열로는 이동할 수 없다", () => {
    const s = playing(Array.from({ length: 11 }, (_, i) => `....${(i % 5) + 1}.`), { x: 3, y: 1 });
    once(s, { move: 1 });
    assert.equal(s.active!.x, 3);
  });
});

describe("2. 벽 근처 회전과 충돌", () => {
  test("오른쪽 벽에서 시계 회전하면 축이 왼쪽으로 한 칸 밀린다", () => {
    const s = playing([], { x: 5, y: 4 });
    once(s, { rotateCW: true });
    assert.deepEqual([s.active!.x, s.active!.orientation], [4, 1]);
    assert.ok(pairCells(s.active!).every((c) => c.x >= 0 && c.x < COLS));
  });

  test("왼쪽 벽에서 반시계 회전하면 오른쪽으로 밀린다", () => {
    const s = playing([], { x: 0, y: 4 });
    once(s, { rotateCCW: true });
    assert.deepEqual([s.active!.x, s.active!.orientation], [1, 3]);
  });

  test("바닥에서 짝을 아래로 돌리면 축이 위로 올라간다", () => {
    const board = emptyBoard();
    const pair: Pair = { x: 2, y: ROWS - 1, orientation: 1, pivot: 1, child: 2 };
    const turned = rotate(board, pair, 1)!;
    assert.deepEqual([turned.y, turned.orientation], [ROWS - 2, 2]);
    assert.ok(pairCells(turned).every((c) => c.y < ROWS));
  });

  test("양옆이 막힌 세로 통로에서는 위아래가 뒤집힌다", () => {
    const rows = Array.from({ length: 10 }, (_, i) => `${(i % 5) + 1}.${((i + 2) % 5) + 1}...`);
    const board = boardFrom(rows);
    const pair: Pair = { x: 1, y: 4, orientation: 0, pivot: 1, child: 2 };
    const turned = rotate(board, pair, 1)!;
    assert.equal(turned.orientation, 2);
    assert.equal(turned.x, 1);
    assert.ok(pairCells(turned).every((c) => c.y < 0 || board[c.y][c.x] === 0));
  });

  test("회전 결과는 어떤 경우에도 벽·크리스털과 겹치지 않는다 (무작위 보드)", () => {
    for (let trial = 0; trial < 300; trial++) {
      const board = emptyBoard();
      for (let y = 4; y < ROWS; y++) for (let x = 0; x < COLS; x++) if ((x * 7 + y * 3 + trial) % 3 === 0) board[y][x] = (((x + y + trial) % 5) + 1) as Color;
      for (let x = 0; x < COLS; x++)
        for (let y = 0; y < ROWS; y++)
          for (const o of [0, 1, 2, 3] as const) {
            const pair: Pair = { x, y, orientation: o, pivot: 1, child: 2 };
            if (!pairCells(pair).every((c) => c.x >= 0 && c.x < COLS && c.y < ROWS && (c.y < 0 || board[c.y][c.x] === 0))) continue;
            for (const dir of [1, -1] as const) {
              const turned = rotate(board, pair, dir);
              if (turned) assert.ok(pairCells(turned).every((c) => c.x >= 0 && c.x < COLS && c.y < ROWS && (c.y < 0 || board[c.y][c.x] === 0)));
            }
          }
    }
  });
});

describe("3. 빠른 낙하와 즉시 낙하", () => {
  test("↓를 누르면 자연 낙하보다 빨리 내려간다", () => {
    const normal = playing();
    const soft = playing();
    run(normal, 0.5);
    run(soft, 0.2, { softDrop: true });
    assert.ok(soft.active!.y > normal.active!.y + 3, `soft ${soft.active!.y} normal ${normal.active!.y}`);
  });

  test("즉시 낙하: 그 자리에서 바로 고정되고 다음 쌍이 나온다", () => {
    const s = playing([], { x: 4, orientation: 2, pivot: 3, child: 4 });
    const events = once(s, { hardDrop: true });
    assert.equal(s.board[ROWS - 1][4], 4);
    assert.equal(s.board[ROWS - 2][4], 3);
    assert.equal(events.filter((e) => e.type === "land").length, 1);
    assert.deepEqual([s.active!.x, s.active!.y], [SPAWN_X, SPAWN_Y]);
  });

  test("가로 쌍이 높이가 다른 곳에 떨어지면 한쪽이 갈라져 더 떨어진다", () => {
    const s = playing(["3....."], { x: 0, orientation: 1, pivot: 1, child: 2 });
    const preview = landingCells(s.board, s.active!);
    dropAndResolve(s);
    assert.equal(s.board[ROWS - 2][0], 1);
    assert.equal(s.board[ROWS - 1][1], 2);
    assert.deepEqual(preview.map((c) => [c.x, c.y]).sort(), [[0, ROWS - 2], [1, ROWS - 1]]);
  });

  test("바닥에 닿으면 잠깐 움직일 수 있고, 시간이 지나면 고정된다", () => {
    const s = playing([], { y: ROWS - 1 });
    once(s, {});
    assert.ok(s.active);
    once(s, { move: 1 });
    assert.equal(s.active!.x, 3, "착지 직후에도 이동 가능");
    run(s, GAME_CONFIG.lockDelay + 0.05);
    assert.equal(s.board[ROWS - 1][3], 1);
  });

  test("같은 스텝에 즉시 낙하를 두 번 눌러도 한 번만 처리된다", () => {
    const input = new InputState();
    input.trigger("hardDrop");
    input.trigger("hardDrop");
    const s = playing();
    const events = stepGame(s, input.take(), DT);
    assert.equal(events.filter((e) => e.type === "land").length, 1);
    assert.equal(input.take().hardDrop, false);
  });

  test("연쇄 처리 중 누른 즉시 낙하·회전·이동은 버려지고 다음 쌍에 넘어가지 않는다", () => {
    const s = chainState(2);
    once(s, { hardDrop: true });
    assert.ok(s.resolve);
    for (let i = 0; i < 5; i++) once(s, { hardDrop: true, rotateCW: true });
    while (s.resolve) once(s, {});
    assert.deepEqual([s.active!.x, s.active!.y, s.active!.orientation], [SPAWN_X, SPAWN_Y, 0]);
  });
});

describe("4. 3개 이상 연결 시 제거", () => {
  test("같은 색 3개가 상하좌우로 이어지면 사라진다 (기본 폭발)", () => {
    const s = playing(["1....."], { x: 1, orientation: 1, pivot: 1, child: 1 });
    const events = dropAndResolve(s);
    assert.equal(pops(events).length, 1);
    assert.equal(pops(events)[0].crystals.length, 3);
    assert.deepEqual(pops(events)[0].sizes, [3]);
    assert.equal(s.score, 30);
    assert.ok(s.board.every((row) => row.every((c) => c === 0)));
  });

  test("세로로 3개를 쌓아도 터진다", () => {
    const s = playing(["1....."], { x: 0, pivot: 1, child: 1 });
    const events = dropAndResolve(s);
    assert.equal(pops(events)[0]?.crystals.length, 3);
  });

  test("2개는 남는다", () => {
    const s = playing([], { x: 0, pivot: 1, child: 1 });
    const events = dropAndResolve(s);
    assert.equal(pops(events).length, 0);
    assert.equal(s.board[ROWS - 1][0], 1);
    assert.equal(s.board[ROWS - 2][0], 1);
    assert.equal(findGroups(boardFrom(["1.....", "1....."])).length, 0);
  });

  test("대각선 연결은 인정하지 않는다", () => {
    assert.equal(findGroups(boardFrom(["1.....", ".1....", "..1..."])).length, 0);
    assert.equal(findGroups(boardFrom([".1....", "1.1...", ".1...."])).length, 0);
    assert.equal(findGroups(boardFrom(["1.....", "11...."])).length, 1);
  });

  test("4개 연결: 강화 폭발 (기본 점수 ×1.5)", () => {
    const s = playing(["11...."], { x: 2, orientation: 1, pivot: 1, child: 1 });
    const events = dropAndResolve(s);
    assert.deepEqual(pops(events)[0].sizes, [4]);
    assert.equal(s.score, 4 * 10 * 1.5);
  });

  test("5개 이상 연결: 대형 폭발 (기본 점수 ×2), 그룹 전부 사라진다", () => {
    const groups = findGroups(boardFrom(["1.....", "1.....", "1111.."]));
    assert.equal(groups.length, 1);
    assert.equal(groups[0].length, 6);
    // 바닥 줄 1·1 옆에 가로 쌍 1·1 + 그 위 줄 1 하나 → 5개
    const big = playing(["1.....", "11...."], { x: 2, orientation: 1, pivot: 1, child: 1 });
    const bigEvents = dropAndResolve(big);
    assert.deepEqual(pops(bigEvents)[0].sizes, [5]);
    assert.equal(big.score, 5 * 10 * 2);
  });

  test("동시에 터진 두 그룹은 하나의 연쇄 단계 (그룹마다 크기 보너스, 연쇄 배율은 한 번)", () => {
    // 가로 쌍(1·2)이 0열의 1 두 개, 1열의 2 두 개 위에 동시에 놓인다
    const s = playing(["12....", "12...."], { x: 0, orientation: 1, pivot: 1, child: 2 });
    const events = dropAndResolve(s);
    const p = pops(events);
    assert.equal(p.length, 1);
    assert.equal(p[0].groups, 2);
    assert.deepEqual(p[0].sizes, [3, 3]);
    assert.equal(p[0].chain, 1);
    assert.equal(s.score, 60);
  });

  test("중력: 빈칸 위 크리스털이 아래로 떨어진다", () => {
    const board = boardFrom(["1.....", "......", "2.3..."]);
    const falls = applyGravity(board);
    assert.equal(board[ROWS - 2][0], 1);
    assert.deepEqual(falls, [{ x: 0, fromY: ROWS - 3, toY: ROWS - 2, color: 1 }]);
  });
});

describe("5. 연쇄", () => {
  for (const n of [2, 3, 4, 5, 6]) {
    test(`${n}연쇄: 터진 뒤 떨어진 크리스털이 새 그룹을 만들어 연속으로 터진다`, () => {
      const s = chainState(n, "endless");
      assert.equal(findGroups(s.board).length, 0, "시작 보드에는 터질 그룹이 없음");
      const events = dropAndResolve(s);
      assert.deepEqual(pops(events).map((e) => e.chain), Array.from({ length: n }, (_, i) => i + 1));
      const end = events.find((e) => e.type === "chainEnd");
      assert.ok(end && end.type === "chainEnd" && end.chain === n);
      assert.equal(s.maxChain, n);
      assert.equal(findGroups(s.board).length, 0, "연쇄가 끝나면 터질 그룹이 남지 않음");
    });
  }

  test("연쇄가 끝난 뒤에만 새 쌍이 나온다", () => {
    const s = chainState(3);
    const events = dropAndResolve(s);
    const spawnAt = events.findIndex((e) => e.type === "spawn");
    const lastPop = events.map((e) => e.type).lastIndexOf("pop");
    assert.ok(spawnAt > lastPop);
    assert.equal(events.filter((e) => e.type === "spawn").length, 1);
  });

  test("연쇄 중 크리스털은 실제로 떨어지는 연출 시간을 거친다", () => {
    const s = chainState(2);
    once(s, { hardDrop: true });
    const stages: string[] = [];
    while (s.resolve) {
      const stage = `${s.resolve.stage}${s.resolve.chain}`;
      if (stages.at(-1) !== stage) stages.push(stage);
      once(s, {});
    }
    assert.deepEqual(stages.slice(0, 3), ["pop1", "drop1", "pop2"]);
  });

  test("연쇄 문구", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 7].map(chainLabel), ["POP!", "NICE!", "GREAT CASCADE!", "AMAZING!", "MEGA CASCADE!", "MEGA CASCADE!"]);
  });
});

describe("6. 연쇄 점수 배율", () => {
  test("연쇄 배율: ×1, ×2, ×4, ×8, 5연쇄 이상 ×16", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(chainMultiplier), [1, 2, 4, 8, 16, 16, 16]);
  });

  test("연결 개수 보너스: 3개 ×1, 4개 ×1.5, 5개 이상 ×2", () => {
    assert.deepEqual([3, 4, 5, 8].map(sizeMultiplier), [1, 1.5, 2, 2]);
    assert.equal(chainStepPoints([3], 1), 30);
    assert.equal(chainStepPoints([4], 1), 60);
    assert.equal(chainStepPoints([5], 3), 5 * 10 * 2 * 4);
    // 동시에 터진 그룹: 각자 크기 보너스 후 연쇄 배율 한 번
    assert.equal(chainStepPoints([3, 4], 2), (30 + 60) * 2);
  });

  test("점수 = Σ 연쇄 단계마다 (그룹 크기 × 10 × 크기 보너스) × 연쇄 배율, 중복 없이 한 번씩", () => {
    for (const n of [2, 3, 5, 6]) {
      const s = chainState(n);
      const events = dropAndResolve(s);
      const p = pops(events);
      const expected = p.reduce((sum, e) => sum + e.sizes.reduce((a, size) => a + size * 10 * sizeMultiplier(size), 0) * chainMultiplier(e.chain), 0);
      assert.equal(s.score, expected, `${n}연쇄`);
      assert.equal(p.reduce((sum, e) => sum + e.points, 0), s.score);
      assert.equal(s.crystals, p.reduce((sum, e) => sum + e.crystals.length, 0));
      const end = events.find((e) => e.type === "chainEnd");
      assert.ok(end?.type === "chainEnd" && end.total === s.score);
      // 같은 크리스털이 두 번 세어지지 않는다
      for (const e of p) assert.equal(new Set(e.crystals.map((c) => `${c.x},${c.y}`)).size, e.crystals.length);
    }
  });
});

describe("7·8. 시간 보너스", () => {
  test("3연쇄 +3초, 5연쇄 +5초 (가장 큰 것 하나만), 2연쇄는 없음", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(timeBonusFor), [0, 0, 3, 3, 5, 5]);
    for (const [n, bonus] of [[2, 0], [3, 3], [4, 3], [5, 5], [6, 5]] as const) {
      const s = chainState(n);
      s.timeLeft = 50;
      const events = dropAndResolve(s);
      // 즉시 낙하한 프레임(1/60초)까지는 시간이 흐른다
      assert.ok(Math.abs(s.timeLeft - (50 - DT + bonus)) < 1e-9, `${n}연쇄`);
      assert.equal(events.filter((e) => e.type === "timeBonus").length, bonus ? 1 : 0);
    }
  });

  test("보너스는 연쇄 하나에 한 번만 (계속 진행해도 다시 주지 않음)", () => {
    const s = chainState(5);
    s.timeLeft = 50;
    const events = dropAndResolve(s);
    events.push(...run(s, 0.3));
    assert.equal(events.filter((e) => e.type === "timeBonus").length, 1);
    assert.ok(s.timeLeft <= 55 && s.timeLeft > 54);
  });

  test("남은 시간은 150초를 넘지 않는다", () => {
    const s = chainState(5);
    s.timeLeft = 148;
    dropAndResolve(s);
    assert.equal(s.timeLeft, GAME_CONFIG.rush.maxTime);
  });

  test("Endless 모드에는 시간 보너스가 없다", () => {
    const s = chainState(5, "endless");
    const events = dropAndResolve(s);
    assert.equal(events.filter((e) => e.type === "timeBonus").length, 0);
    assert.equal(s.timeLeft, Infinity);
  });
});

describe("9. 연쇄 연출 중 타이머 정지", () => {
  test("착지부터 연쇄가 끝날 때까지 남은 시간·조작 시간이 줄지 않는다", () => {
    const s = chainState(4);
    s.timeLeft = 40;
    once(s, { hardDrop: true });
    const time = s.timeLeft;
    const play = s.playTime;
    let frames = 0;
    while (s.resolve) {
      once(s, {});
      frames++;
    }
    assert.ok(frames > 30, "연쇄 연출이 실제로 시간이 걸림");
    assert.equal(s.timeLeft, time + 3);
    assert.equal(s.playTime, play);
    run(s, 1);
    assert.ok(Math.abs(s.timeLeft - (time + 3 - 1)) < 0.02, "다음 쌍부터 다시 흐름");
  });

  test("READY 안내 동안에는 타이머가 멈춘다", () => {
    const s = createGame("rush", 1);
    startGame(s, "rush", 1);
    run(s, GAME_CONFIG.readyTime - 0.1);
    assert.equal(s.phase, "ready");
    assert.equal(s.timeLeft, 120);
    run(s, 0.2);
    assert.equal(s.phase, "playing");
    assert.ok(s.active);
  });
});

describe("10. 120초 종료", () => {
  test("120초에서 시작해 조작 시간만큼 줄고, 0초가 되면 조작을 끝내고 결과 화면", () => {
    const s = createGame("rush", 3);
    startGame(s, "rush", 3);
    assert.equal(s.timeLeft, 120);
    run(s, GAME_CONFIG.readyTime + DT);
    run(s, 2);
    assert.ok(Math.abs(s.timeLeft - 118) < 0.05, `${s.timeLeft}`);

    s.board = emptyBoard();
    s.active = { x: 2, y: 3, orientation: 0, pivot: 1, child: 2 };
    s.timeLeft = 1.5;
    const events = run(s, 1.6);
    assert.equal(s.phase, "over");
    assert.equal(s.endReason, "time");
    assert.equal(s.active, null);
    assert.equal(s.timeLeft, 0);
    assert.equal(events.filter((e) => e.type === "gameOver").length, 1);
    run(s, 1, { hardDrop: true, move: 1 });
    assert.equal(s.board.flat().filter((c) => c !== 0).length, 0, "종료 뒤 입력은 무시");
  });

  test("10초 이하에서 1초마다 카운트다운 이벤트", () => {
    const s = playing([], { y: 0 });
    s.timeLeft = 10.5;
    s.active = { x: 0, y: 0, orientation: 0, pivot: 1, child: 2 };
    const events: GameEvent[] = [];
    for (let i = 0; i < 4 * 60 && s.phase === "playing"; i++) {
      if (s.active && s.active.y > 6) s.active = { ...s.active, y: 0 };
      events.push(...once(s, {}));
    }
    assert.deepEqual(events.filter((e) => e.type === "countdown").map((e) => (e.type === "countdown" ? e.seconds : 0)), [10, 9, 8, 7]);
  });
});

describe("11. 천장까지 쌓이면 Game Over", () => {
  test("새 쌍이 나오는 칸이 막히면 즉시 Game Over", () => {
    const rows = Array.from({ length: 11 }, (_, i) => `..${(i % 5) + 1}...`);
    const s = playing(rows, { x: 2, pivot: 3, child: 4 });
    s.timeLeft = 80;
    const events = dropAndResolve(s);
    assert.equal(s.phase, "over");
    assert.equal(s.endReason, "topout");
    assert.ok(events.some((e) => e.type === "gameOver" && e.reason === "topout"));
    assert.ok(s.timeLeft > 79, "시간이 남아 있어도 종료");
  });

  test("다른 열이 가득 찬 것만으로는 끝나지 않는다", () => {
    const rows = Array.from({ length: 12 }, (_, i) => `${(i % 5) + 1}.....`);
    const s = playing(rows, { x: 3 });
    dropAndResolve(s);
    assert.equal(s.phase, "playing");
  });
});

describe("12. 일시정지와 재개", () => {
  test("일시정지 중에는 시간·낙하가 멈추고 재개하면 이어서 진행", () => {
    const s = playing([], { y: 2 });
    s.timeLeft = 60;
    togglePause(s);
    assert.equal(s.phase, "paused");
    run(s, 3, { move: 1, hardDrop: true, softDrop: true });
    assert.deepEqual([s.timeLeft, s.active!.x, s.active!.y], [60, 2, 2]);
    togglePause(s);
    assert.equal(s.phase, "playing");
    run(s, speedFor("rush", 0).gravity + 0.1);
    assert.ok(s.timeLeft < 60 && s.active!.y > 2);
  });

  test("연쇄 도중 일시정지하면 연쇄 연출도 멈췄다가 이어진다", () => {
    const s = chainState(3);
    once(s, { hardDrop: true });
    const timer = s.resolve!.timer;
    togglePause(s);
    run(s, 2);
    assert.equal(s.resolve!.timer, timer);
    togglePause(s);
    while (s.resolve) once(s, {});
    assert.equal(s.lastChain, 3);
  });

  test("READY 안내 중 일시정지하면 READY로 돌아온다", () => {
    const s = createGame("rush", 1);
    startGame(s, "rush", 1);
    togglePause(s);
    run(s, 3);
    togglePause(s);
    assert.equal(s.phase, "ready");
  });
});

describe("13. Endless 모드", () => {
  test("시간 제한이 없고, 조작 시간 45초마다 낙하 속도가 한 단계씩 빨라진다", () => {
    const s = playing([], {}, "endless");
    const levels: number[] = [];
    for (let i = 0; i < 300 * 60; i++) {
      if (s.active && s.active.y > 4) s.active = { ...s.active, y: 0 };
      for (const e of once(s, {})) if (e.type === "speedUp") levels.push(e.level);
    }
    assert.equal(s.phase, "playing");
    assert.equal(s.timeLeft, Infinity);
    assert.deepEqual(levels, [2, 3, 4, 5, 6, 7]);
    assert.ok(speedFor("endless", 300).gravity < speedFor("endless", 0).gravity);
  });

  test("Endless 속도 상승 완화: 주기 45초 이상, 단계마다 속도 증가 20% 이하, 최고 속도도 예전(칸당 0.2초)보다 느리다", () => {
    for (let i = 1; i < ENDLESS_SPEEDS.length; i++) {
      assert.ok(ENDLESS_SPEEDS[i].from - ENDLESS_SPEEDS[i - 1].from >= 45);
      assert.ok(ENDLESS_SPEEDS[i - 1].gravity / ENDLESS_SPEEDS[i].gravity <= 1.2, `LV ${i + 1}`);
    }
    assert.ok(ENDLESS_SPEEDS.at(-1)!.gravity >= 0.4);
  });

  test("Rush 낙하 속도: 40초마다 한 단계. 시간 보너스를 받아도 내려가지 않는다", () => {
    assert.deepEqual([0, 39, 40, 79, 80, 200].map((t) => speedFor("rush", t).level), [1, 1, 2, 2, 3, 5]);
    for (let i = 1; i < RUSH_SPEEDS.length; i++) assert.ok(RUSH_SPEEDS[i - 1].gravity / RUSH_SPEEDS[i].gravity <= 1.2);
    const s = chainState(5);
    s.playTime = 81;
    s.speed = 3;
    s.timeLeft = 20;
    dropAndResolve(s);
    run(s, 0.1);
    assert.equal(s.speed, 3);
    assert.equal(speedFor("rush", s.playTime).level, 3);
  });

  test("보드가 막히면 Endless도 끝난다", () => {
    const rows = Array.from({ length: 11 }, (_, i) => `..${(i % 5) + 1}...`);
    const s = playing(rows, { pivot: 3, child: 4 }, "endless");
    dropAndResolve(s);
    assert.equal(s.endReason, "topout");
  });
});

describe("16. 난이도: 낙하 속도와 착지 유예", () => {
  test("시작 낙하 속도는 예전(칸당 0.8초)의 약 70% (칸당 간격 약 1.14초)", () => {
    for (const mode of ["rush", "endless"] as const) {
      const ratio = 0.8 / speedFor(mode, 0).gravity;
      assert.ok(ratio > 0.67 && ratio < 0.73, `${mode} ${ratio}`);
    }
    // 실제 진행: 5초 동안 내려간 칸 수
    const s = playing([], { y: 1 });
    run(s, 5);
    assert.equal(s.active!.y, 1 + Math.floor(5 / speedFor("rush", 0).gravity));
  });

  test("착지 유예 0.6초: 닿은 뒤 0.55초까지는 움직일 수 있고 0.6초가 지나면 고정", () => {
    assert.equal(GAME_CONFIG.lockDelay, 0.6);
    const s = playing([], { y: ROWS - 1 });
    run(s, 0.55);
    assert.ok(s.active, "아직 고정되지 않음");
    once(s, { move: 1 });
    assert.equal(s.active!.x, 3);
    const t = run(s, 0.65);
    assert.ok(t.some((e) => e.type === "land"));
  });

  test("유예 중 옆으로 옮겨 다시 공중에 뜨면 착지를 다시 판정한다", () => {
    const s = playing(["3....."], { x: 0, y: ROWS - 3 });
    run(s, 0.3);
    assert.ok(s.active && s.active.y === ROWS - 3, "3 위에 닿아 있음");
    once(s, { move: 1 });
    run(s, 0.4, { move: 1 });
    assert.ok(s.active, "빈 열로 옮기면 고정되지 않음");
    run(s, GAME_CONFIG.lockDelay + 2);
    assert.equal(s.board[ROWS - 1][5], 1, "바닥까지 떨어진 뒤 고정");
  });

  test("착지 유예 악용 방지: 계속 이동·회전해도 일정 시간 안에 반드시 고정된다", () => {
    const s = playing([], { y: ROWS - 1, orientation: 1, x: 2 });
    let frames = 0;
    let landed = false;
    for (; frames < 30 * 60 && !landed; frames++) {
      const input: Partial<InputSnapshot> = frames % 2 === 0 ? { rotateCW: true } : { move: frames % 4 === 1 ? 1 : -1 };
      landed = stepGame(s, { ...NO_INPUT, ...input }, DT).some((e) => e.type === "land");
    }
    assert.ok(landed, "고정되지 않음");
    const limit = (GAME_CONFIG.maxLockResets + 1) * GAME_CONFIG.lockDelay + 2 * speedFor("rush", 0).gravity;
    assert.ok(frames * DT < limit, `${(frames * DT).toFixed(2)}초 > ${limit}`);
  });

  test("즉시 낙하는 유예 없이 바로 배치", () => {
    const s = playing([], { y: 2 });
    const events = once(s, { hardDrop: true });
    assert.ok(events.some((e) => e.type === "land" && e.hard));
  });

  test("착지 이벤트에 갈라진 크리스털까지 반영한 최종 자리가 담긴다", () => {
    const s = playing(["3....."], { x: 0, orientation: 1, pivot: 1, child: 2 });
    const land = once(s, { hardDrop: true }).find((e) => e.type === "land");
    assert.ok(land?.type === "land");
    assert.deepEqual(land.crystals.map((c) => [c.x, c.y]).sort(), [[0, ROWS - 2], [1, ROWS - 1]]);
  });
});

describe("17. 다음 크리스털 2쌍과 회전 입력", () => {
  test("대기열은 현재 쌍을 빼고 앞의 두 쌍이 다음 순서 그대로 나온다", () => {
    const s = createGame("endless", 9);
    startGame(s, "endless", 9);
    run(s, GAME_CONFIG.readyTime + DT);
    for (let i = 0; i < 12; i++) {
      const next = s.queue.slice(0, 2).map((p) => p.slice());
      assert.equal(next.length, 2);
      once(s, { hardDrop: true });
      while (s.resolve) once(s, {});
      if (s.phase !== "playing") break;
      assert.deepEqual([s.active!.pivot, s.active!.child], next[0]);
      assert.deepEqual(s.queue[0], next[1]);
    }
  });

  test("한 프레임에 회전을 두 번 눌러도 두 번 모두 처리된다 (빠른 연타)", () => {
    const input = new InputState();
    input.trigger("rotateCW");
    input.trigger("rotateCW");
    const s = playing([], { y: 4 });
    stepGame(s, input.take(), DT);
    stepGame(s, input.take(), DT);
    assert.equal(s.active!.orientation, 2);
    assert.equal(input.take().rotateCW, false);
  });
});

describe("크리스털 생성과 안정성", () => {
  test("같은 시드면 같은 순서, 20개마다 색이 4개씩 고르게 나온다", () => {
    const a = createGame("rush", 42);
    const b = createGame("rush", 42);
    startGame(a, "rush", 42);
    startGame(b, "rush", 42);
    assert.deepEqual(a.queue, b.queue);
    const colors: number[] = [...a.queue.flat(), ...a.bag.flat()];
    assert.equal(colors.length, 20);
    for (let c = 1; c <= 5; c++) assert.equal(colors.filter((x) => x === c).length, 4);
  });

  test("무작위 입력 5분: 보드는 항상 유효하고, 연쇄가 끝나면 떠 있는 크리스털·터질 그룹이 없다", () => {
    let r = 99;
    const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (const mode of ["rush", "endless"] as const) {
      const s = createGame(mode, 5);
      startGame(s, mode, 5);
      let games = 0;
      for (let i = 0; i < 5 * 60 * 60; i++) {
        const input: InputSnapshot = {
          move: rand() < 0.3 ? (rand() < 0.5 ? -1 : 1) : 0,
          softDrop: rand() < 0.2,
          rotateCW: rand() < 0.05,
          rotateCCW: rand() < 0.05,
          hardDrop: rand() < 0.02,
        };
        const hadResolve = s.resolve !== null;
        stepGame(s, input, DT);
        assert.ok(s.board.flat().every((c) => c >= 0 && c <= 5));
        if (s.active) assert.ok(pairCells(s.active).every((c) => c.x >= 0 && c.x < COLS && c.y < ROWS && (c.y < 0 || s.board[c.y][c.x] === 0)));
        if (hadResolve && !s.resolve && s.phase === "playing") {
          assert.equal(findGroups(s.board).length, 0);
          const copy = s.board.map((row) => row.slice());
          assert.equal(applyGravity(copy).length, 0);
        }
        if (s.phase === "over") {
          games++;
          startGame(s, mode, 5 + games);
        }
      }
      assert.ok(s.score >= 0);
    }
  });
});
