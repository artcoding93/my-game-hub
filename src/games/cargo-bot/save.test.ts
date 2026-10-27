import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { STAGES } from "./stages";
import { allCleared, emptyProgress, highestCleared, isUnlocked, parseProgress, recordClear, serializeProgress } from "./save";
import { starsFor } from "./config";

describe("진행 저장", () => {
  test("처음에는 1번만 열려 있고, 클리어하면 다음 스테이지가 열린다", () => {
    let p = emptyProgress();
    assert.ok(isUnlocked(p, 0));
    assert.equal(isUnlocked(p, 1), false);
    p = recordClear(p, 0, 5, 2, 3).progress;
    assert.ok(isUnlocked(p, 1));
    assert.equal(isUnlocked(p, 2), false);
    assert.equal(highestCleared(p), 1);
  });

  test("최고 기록은 이동·밀기를 각각 더 좋을 때만 바꾸고, 별은 높은 쪽을 유지한다", () => {
    let p = recordClear(emptyProgress(), 1, 12, 7, 2).progress;
    const r1 = recordClear(p, 1, 9, 8, 1);
    assert.ok(r1.newBest);
    p = r1.progress;
    assert.deepEqual(p.records[2], { bestMoves: 9, bestPushes: 7, stars: 2 });
    assert.equal(recordClear(p, 1, 20, 20, 1).newBest, false);
  });

  test("저장 → 읽기 왕복 (이어하기 상태 포함)", () => {
    let p = recordClear(emptyProgress(), 0, 3, 2, 3).progress;
    p = { ...p, lastStage: 1, resume: { stage: 1, snapshot: { board: { player: 17, boxes: [11] }, moves: 2, pushes: 0 } } };
    const back = parseProgress(serializeProgress(p));
    assert.deepEqual(back, p);
  });

  test("손상되거나 조작된 데이터는 버린다", () => {
    assert.equal(parseProgress("{not json"), null);
    assert.equal(parseProgress(JSON.stringify({ version: 999, records: {} })), null, "다른 버전");
    assert.equal(parseProgress(JSON.stringify({ version: 1, records: { 1: { bestMoves: 1, bestPushes: 1, stars: 3 } } })), null, "검증된 최소 기록보다 좋음");
    assert.equal(parseProgress(JSON.stringify({ version: 1, records: { 1: { bestMoves: "x", bestPushes: 2, stars: 3 } } })), null);
    // 이어하기 상태가 지도와 맞지 않으면(벽 속 상자) 이어하기만 버린다
    const bad = parseProgress(JSON.stringify({ version: 1, records: {}, lastStage: 0, resume: { stage: 0, snapshot: { board: { player: 15, boxes: [0] }, moves: 1, pushes: 0 } } }));
    assert.ok(bad);
    assert.equal(bad.resume, null);
  });

  test("15개를 모두 깨면 전체 클리어", () => {
    let p = emptyProgress();
    for (const [i, s] of STAGES.entries()) p = recordClear(p, i, s.par.moves, s.par.pushes, 3).progress;
    assert.ok(allCleared(p));
    assert.equal(highestCleared(p), 15);
  });

  test("별 평가: 최소 밀기 = 3개, 1.5배 이내 = 2개, 그 밖 = 1개", () => {
    assert.equal(starsFor(16, 16), 3);
    assert.equal(starsFor(24, 16), 2);
    assert.equal(starsFor(25, 16), 1);
    assert.equal(starsFor(3, 2), 2);
  });
});
