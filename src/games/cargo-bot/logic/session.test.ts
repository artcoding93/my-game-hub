import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SOLUTIONS } from "../solutions";
import { STAGES } from "../stages";
import type { Dir } from "../types";
import { hintFor } from "./hint";
import { Session } from "./session";
import { fromLurd } from "./solver";

const R: Dir = 1;
const D: Dir = 2;
const L: Dir = 3;

describe("Undo / Redo / Restart", () => {
  test("이동·밀기를 여러 단계 되돌리고 다시 실행한다 (횟수도 함께)", () => {
    const s = new Session(0);
    const start = s.current;
    s.move(R);
    const afterWalk = s.current;
    s.move(R);
    assert.deepEqual([s.current.moves, s.current.pushes], [2, 1]);
    assert.ok(s.undo());
    assert.equal(s.current, afterWalk);
    assert.ok(s.undo());
    assert.equal(s.current, start);
    assert.equal(s.undo(), false, "더 되돌릴 것 없음");
    assert.ok(s.redo());
    assert.ok(s.redo());
    assert.deepEqual([s.current.moves, s.current.pushes], [2, 1]);
    assert.equal(s.redo(), false);
  });

  test("Undo 뒤에 새로 움직이면 Redo 기록이 사라진다", () => {
    const s = new Session(0);
    s.move(R);
    s.move(R);
    s.undo();
    assert.ok(s.canRedo);
    s.move(D);
    assert.equal(s.canRedo, false);
  });

  test("막힌 입력은 기록에 남지 않는다", () => {
    const s = new Session(0);
    s.move(L);
    assert.equal(s.current.moves, 0);
    assert.equal(s.canUndo, false);
  });

  test("컨베이어·얼음·순간이동 연쇄도 한 턴: Undo 한 번에 턴 전체가 돌아온다", () => {
    for (const id of [7, 10, 13]) {
      const s = new Session(id - 1);
      const dirs = fromLurd(SOLUTIONS[id]);
      for (const d of dirs) {
        const before = s.current;
        const r = s.move(d);
        if (r?.box && r.box.path.length > 1) {
          assert.ok(s.undo());
          assert.equal(s.current, before, `stage ${id}: 연쇄 이동 Undo`);
          assert.ok(s.redo());
          return;
        }
      }
      assert.fail(`stage ${id}: 연쇄 이동 없음`);
    }
  });

  test("Restart: 처음 상태, 횟수 0, 기록 비움", () => {
    const s = new Session(1);
    for (const d of fromLurd(SOLUTIONS[2]).slice(0, 4)) s.move(d);
    s.restart();
    assert.equal(s.current.board, s.level.start);
    assert.deepEqual([s.current.moves, s.current.pushes, s.canUndo, s.canRedo], [0, 0, false, false]);
  });

  test("빠른 연속 입력(수백 번 무작위 이동·Undo·Redo)에도 상태가 항상 규칙에 맞다", () => {
    const s = new Session(5);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 2000; i++) {
      const r = rnd();
      if (r < 0.7) s.move(Math.floor(rnd() * 4) as Dir);
      else if (r < 0.85) s.undo();
      else s.redo();
      const { board, moves, pushes } = s.current;
      assert.equal(new Set(board.boxes).size, board.boxes.length, "상자 겹침 없음");
      assert.ok(!board.boxes.includes(board.player), "로봇과 상자 겹침 없음");
      assert.ok(pushes <= moves);
    }
    // 끝까지 되돌리면 정확히 처음 상태
    while (s.undo());
    assert.equal(s.current.board, s.level.start);
    assert.deepEqual([s.current.moves, s.current.pushes], [0, 0]);
  });

  test("해답대로 두면 클리어되고, 클리어 후에는 입력을 받지 않는다", () => {
    const s = new Session(3);
    for (const d of fromLurd(SOLUTIONS[4])) s.move(d);
    assert.ok(s.solved);
    assert.equal(s.current.moves, STAGES[3].par.moves);
    assert.equal(s.move(R), null);
  });

  test("데드락 경고: 3번 스테이지에서 상자를 오른쪽 아래 구석으로 밀면 경고, Undo하면 사라진다", () => {
    const s = new Session(2);
    // 상자를 오른쪽 끝까지 민 뒤 아래 구석으로
    for (const d of fromLurd("rRRRurDD")) s.move(d);
    assert.deepEqual(s.deadlocks(), [0]);
    s.undo();
    assert.deepEqual(s.deadlocks(), []);
  });
});

describe("힌트", () => {
  test("처음에는 전략 문장, 그다음 단계에서 다음에 밀 상자 하나만 강조한다", () => {
    const s = new Session(5);
    const n = STAGES[5].hints.length;
    for (let i = 0; i < n; i++) assert.equal(hintFor(s, i).kind, "text");
    const h = hintFor(s, n);
    assert.equal(h.kind, "push");
    if (h.kind === "push") {
      assert.ok(h.push.box >= 0 && h.push.box < s.board.boxes.length);
      assert.equal(h.remaining, STAGES[5].par.pushes);
    }
  });

  test("이미 풀 수 없는 상태면 Undo·Restart를 권한다", () => {
    const s = new Session(2);
    for (const d of fromLurd("rRRRurDD")) s.move(d);
    assert.equal(hintFor(s, 99).kind, "stuck");
  });

  test("강조한 수를 따라가면 실제로 클리어된다 (모든 스테이지)", () => {
    for (const [i, stage] of STAGES.entries()) {
      const s = new Session(i);
      for (let guard = 0; guard < 80 && !s.solved; guard++) {
        const h = hintFor(s, 99);
        assert.equal(h.kind, "push", `stage ${stage.id}`);
        if (h.kind !== "push") break;
        // 걸어서 미는 자리로 간 뒤 민다 (테스트에서는 위치만 옮김)
        s.current = { ...s.current, board: { ...s.board, player: h.push.stand } };
        s.move(h.push.dir);
      }
      assert.ok(s.solved, `stage ${stage.id}: 힌트로 클리어`);
    }
  });
});
