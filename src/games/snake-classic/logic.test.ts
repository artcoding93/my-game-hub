import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MAX_QUEUED_TURNS, OPPOSITE_DIRECTION } from "./constants";
import { createInitialState, snakeReducer } from "./logic";
import type { Direction, SnakeState } from "./types";

/* 방향 입력 규칙: 키보드와 모바일 방향 버튼이 같은 turn 액션을 쓰므로 여기서 함께 검증한다. */

const start = () => snakeReducer(createInitialState(0, 0.5), { type: "start", random: 0.5 });
const turn = (s: SnakeState, direction: Direction) => snakeReducer(s, { type: "turn", direction });
const tick = (s: SnakeState) => snakeReducer(s, { type: "tick", random: 0.5 });

/** 한 틱 동안 머리가 직전 몸통(목) 칸으로 들어가지 않았는지 = 180도 반전 없음 */
function assertNoReverse(before: SnakeState, after: SnakeState) {
  if (after.status !== "playing") return;
  const neck = before.snake[1];
  const head = after.snake[0];
  assert.ok(!(neck && head.x === neck.x && head.y === neck.y), "머리가 목 칸으로 되돌아감(180도 반전)");
}

describe("방향 입력", () => {
  test("진행 방향의 정반대 입력은 무시된다", () => {
    const s = start();
    const reversed = turn(s, OPPOSITE_DIRECTION[s.direction]);
    assert.deepEqual(reversed.queuedDirections, []);
    const next = tick(reversed);
    assert.equal(next.direction, s.direction);
  });

  test("한 틱 안의 빠른 연속 입력(위→반대)은 마지막 예약 방향 기준으로 막혀 180도 반전이 생기지 않는다", () => {
    let s = start();
    const side: Direction = s.direction === "left" || s.direction === "right" ? "up" : "left";
    s = turn(s, side);
    s = turn(s, OPPOSITE_DIRECTION[side]);
    assert.deepEqual(s.queuedDirections, [side]);
  });

  test("빠르게 누른 90도 꺾기 두 번은 한 틱에 하나씩 차례로 적용된다", () => {
    let s = start();
    const first: Direction = s.direction === "left" || s.direction === "right" ? "up" : "left";
    const back = OPPOSITE_DIRECTION[s.direction];
    s = turn(s, first);
    s = turn(s, back);
    assert.equal(s.queuedDirections.length, 2);
    const a = tick(s);
    assertNoReverse(s, a);
    assert.equal(a.direction, first);
    const b = tick(a);
    assertNoReverse(a, b);
    assert.equal(b.direction, back);
  });

  test("예약은 최대 개수까지만 쌓인다 (버튼 연타)", () => {
    let s = start();
    const cycle: Direction[] = ["up", "left", "down", "right", "up", "left", "down", "right"];
    for (const d of cycle) s = turn(s, d);
    assert.ok(s.queuedDirections.length <= MAX_QUEUED_TURNS);
  });

  test("무작위 버튼 연타 2,000번에도 한 틱 사이 180도 반전이 생기지 않는다", () => {
    let s = start();
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const dirs: Direction[] = ["up", "down", "left", "right"];
    for (let i = 0; i < 2000 && s.status === "playing"; i++) {
      for (let k = 0; k < 3; k++) s = turn(s, dirs[Math.floor(rand() * 4)]);
      const next = tick(s);
      assertNoReverse(s, next);
      s = next;
    }
  });

  test("대기 중 방향 입력은 바로 시작하고, 일시정지 중에는 무시되며, 재시작하면 예약이 비워진다", () => {
    const ready = createInitialState(0, 0.5);
    const started = turn(ready, "up");
    assert.equal(started.status, "playing");
    const paused = snakeReducer(started, { type: "togglePause" });
    assert.equal(paused.status, "paused");
    assert.deepEqual(turn(paused, "left").queuedDirections, paused.queuedDirections);
    const restarted = snakeReducer(turn(started, "left"), { type: "restart", random: 0.5 });
    assert.deepEqual(restarted.queuedDirections, []);
  });
});
