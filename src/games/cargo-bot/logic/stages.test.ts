import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SOLUTIONS } from "../solutions";
import { STAGES } from "../stages";
import { isSolved, isWalkable, step, tileAt } from "./engine";
import { parseLevel } from "./level";
import { fromLurd, solveMoves, solvePushes } from "./solver";

/*
 * 스테이지 검증: 15개 모두 실제 엔진 규칙(컨베이어·얼음·순간이동 포함)으로 풀 수 있는지 상태 공간 탐색으로 확인하고,
 * 저장된 검증 해답을 재생해 클리어되는지, 기록(par)이 탐색 결과와 같은지 검사한다.
 */

describe("스테이지 데이터", () => {
  test("15개, 번호 1~15, 이름이 서로 다르다", () => {
    assert.equal(STAGES.length, 15);
    assert.deepEqual(STAGES.map((s) => s.id), Array.from({ length: 15 }, (_, i) => i + 1));
    assert.equal(new Set(STAGES.map((s) => s.name)).size, 15);
  });

  for (const stage of STAGES) {
    test(`${stage.id}. ${stage.name}: 상자 수 = 목표 수, 처음부터 클리어 상태가 아니고, 목표는 바닥·얼음 위에만`, () => {
      const lv = parseLevel(stage.map);
      assert.ok(lv.start.boxes.length >= 1);
      assert.equal(lv.start.boxes.length, lv.targets.size);
      assert.equal(isSolved(lv, lv.start), false);
      for (const t of lv.targets) assert.ok(["floor", "ice"].includes(tileAt(lv, t).kind), `목표 칸 ${t}: ${tileAt(lv, t).kind}`);
      for (const b of lv.start.boxes) assert.equal(tileAt(lv, b).kind, "floor", "상자는 일반 바닥에서 시작");
      // 지도 바깥 테두리는 막혀 있어야 한다 (창고 밖으로 나갈 수 없음)
      for (let x = 0; x < lv.cols; x++) for (const y of [0, lv.rows - 1]) assert.ok(!isWalkable(lv, y * lv.cols + x));
      assert.ok(stage.hints.length >= 1);
    });
  }
});

describe("15개 스테이지 모두 해결 가능 (상태 공간 탐색)", () => {
  for (const stage of STAGES) {
    test(`${stage.id}. ${stage.name}: 최소 밀기 ${stage.par.pushes}, 최소 이동 ${stage.par.moves}`, () => {
      const lv = parseLevel(stage.map);
      const byPush = solvePushes(lv, lv.start);
      assert.ok(byPush, "해답 없음");
      assert.equal(byPush.pushes, stage.par.pushes, "최소 밀기");
      const byMove = solveMoves(lv, lv.start);
      assert.ok(byMove);
      assert.equal(byMove.moves, stage.par.moves, "최소 이동");
    });
  }
});

describe("검증된 해답 재생", () => {
  for (const stage of STAGES) {
    test(`${stage.id}. ${stage.name}`, () => {
      const lv = parseLevel(stage.map);
      let board = lv.start;
      let pushes = 0;
      const dirs = fromLurd(SOLUTIONS[stage.id]);
      for (const [i, d] of dirs.entries()) {
        assert.equal(isSolved(lv, board), false, `${i}번째 입력 전에 이미 클리어`);
        const r = step(lv, board, d);
        assert.ok(r.moved, `${i}번째 입력이 막힘`);
        // 대문자(밀기) 표기와 실제 밀기가 일치
        assert.equal(Boolean(r.box), SOLUTIONS[stage.id][i] === SOLUTIONS[stage.id][i].toUpperCase());
        if (r.box) pushes++;
        board = r.board;
      }
      assert.ok(isSolved(lv, board), "해답 끝에서 클리어");
      assert.equal(dirs.length, stage.par.moves);
      assert.ok(pushes >= stage.par.pushes);
    });
  }
});

describe("기믹이 실제로 필요하다", () => {
  const plain = (map: string[]) => parseLevel(map.map((r) => r.replace(/[<>^v~1-4]/g, "-").replace(/%/g, "o")));
  test("7·8·9·13 (컨베이어·순간이동 소개): 특수 타일을 바닥으로 바꾸면 풀 수 없다", () => {
    for (const id of [7, 8, 9, 13]) assert.equal(solvePushes(plain(STAGES[id - 1].map), plain(STAGES[id - 1].map).start), null, `stage ${id}`);
  });
  test("10~12·14·15: 특수 타일이 최소 해법을 바꾼다", () => {
    for (const id of [10, 11, 12, 14, 15]) {
      const p = plain(STAGES[id - 1].map);
      const s = solvePushes(p, p.start);
      assert.ok(s === null || s.pushes !== STAGES[id - 1].par.pushes, `stage ${id}`);
    }
  });
  test("스테이지마다 해당 기믹이 해답에서 쓰인다", () => {
    const expect: Record<number, string[]> = { 7: ["conveyor"], 8: ["conveyor"], 9: ["conveyor"], 10: ["ice"], 11: ["ice"], 12: ["ice", "conveyor"], 13: ["teleport"], 14: ["teleport", "ice"], 15: ["teleport", "ice", "conveyor"] };
    for (const [id, want] of Object.entries(expect)) {
      const lv = parseLevel(STAGES[Number(id) - 1].map);
      const used = new Set<string>();
      let board = lv.start;
      for (const d of fromLurd(SOLUTIONS[Number(id)])) {
        const r = step(lv, board, d);
        r.box?.path.forEach((p) => used.add(p.kind));
        board = r.board;
      }
      for (const k of want) assert.ok(used.has(k), `stage ${id}: ${k}`);
    }
  });
});

describe("난이도 곡선", () => {
  test("1~3은 초보용(밀기 6회 이하), 마지막 스테이지가 가장 어렵다", () => {
    for (const s of STAGES.slice(0, 3)) assert.ok(s.par.pushes <= 6 && s.difficulty === 1);
    const last = STAGES[14];
    for (const s of STAGES.slice(0, 14)) assert.ok(s.par.pushes < last.par.pushes);
    assert.equal(last.difficulty, 5);
  });
});
