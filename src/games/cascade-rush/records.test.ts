import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { emptyRecords, parseRecords, recordResult, RECORDS_VERSION, serializeRecords } from "./records";

describe("기록 저장 (localStorage)", () => {
  test("Rush·Endless 기록은 따로 관리하고 항목마다 최고값만 남긴다", () => {
    let r = emptyRecords();
    let out = recordResult(r, "rush", { score: 1200, maxChain: 3, crystals: 40 });
    assert.equal(out.newBest, true);
    r = out.records;
    out = recordResult(r, "rush", { score: 800, maxChain: 5, crystals: 30 });
    assert.equal(out.newBest, false);
    r = out.records;
    assert.deepEqual(r.rush, { score: 1200, maxChain: 5, crystals: 40 });
    assert.deepEqual(r.endless, { score: 0, maxChain: 0, crystals: 0 });
    r = recordResult(r, "endless", { score: 300, maxChain: 2, crystals: 12 }).records;
    assert.equal(r.endless.score, 300);
    assert.equal(r.rush.score, 1200);
  });

  test("저장 → 불러오기 왕복", () => {
    const r = recordResult(emptyRecords(), "endless", { score: 5000, maxChain: 6, crystals: 99 }).records;
    assert.deepEqual(parseRecords(serializeRecords(r)), r);
  });

  test("손상·변조·다른 버전 데이터는 버린다", () => {
    assert.deepEqual(parseRecords(null), emptyRecords());
    assert.deepEqual(parseRecords("{broken"), emptyRecords());
    assert.deepEqual(parseRecords(JSON.stringify({ version: RECORDS_VERSION + 1, rush: { score: 9, maxChain: 1, crystals: 4 } })), emptyRecords());
    const bad = parseRecords(
      JSON.stringify({ version: RECORDS_VERSION, rush: { score: -5, maxChain: 1, crystals: 4 }, endless: { score: 100, maxChain: 99, crystals: 4 } }),
    );
    assert.deepEqual(bad, emptyRecords());
    const half = parseRecords(JSON.stringify({ version: RECORDS_VERSION, rush: { score: 10, maxChain: 1, crystals: 4 }, endless: "x" }));
    assert.equal(half.rush.score, 10);
    assert.equal(half.endless.score, 0);
    // 3개 연결 규칙에서는 연쇄 수가 24(72칸 ÷ 3)까지 가능하다
    assert.equal(parseRecords(JSON.stringify({ version: RECORDS_VERSION, rush: { score: 10, maxChain: 20, crystals: 60 } })).rush.maxChain, 20);
  });

  test("이전 규칙(v1: 4개 연결) 기록은 지우지 않고 CLASSIC으로 따로 보관한다", () => {
    const v1 = JSON.stringify({ version: 1, rush: { score: 4200, maxChain: 5, crystals: 80 }, endless: { score: 900, maxChain: 3, crystals: 20 } });
    const parsed = parseRecords(v1);
    assert.deepEqual(parsed.rush, { score: 0, maxChain: 0, crystals: 0 }, "새 규칙 기록과 섞지 않음");
    assert.deepEqual(parsed.classic, { rush: { score: 4200, maxChain: 5, crystals: 80 }, endless: { score: 900, maxChain: 3, crystals: 20 } });
    // 새 기록을 저장해도 CLASSIC은 그대로 남는다
    const next = recordResult(parsed, "rush", { score: 300, maxChain: 2, crystals: 9 });
    assert.equal(next.newBest, true);
    const reloaded = parseRecords(serializeRecords(next.records));
    assert.equal(reloaded.rush.score, 300);
    assert.deepEqual(reloaded.classic, parsed.classic);
    // 빈 v1 기록은 CLASSIC을 만들지 않는다
    assert.equal(parseRecords(JSON.stringify({ version: 1, rush: { score: 0, maxChain: 0, crystals: 0 } })).classic, null);
  });
});
