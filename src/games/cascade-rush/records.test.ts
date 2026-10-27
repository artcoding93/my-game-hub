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
  });
});
