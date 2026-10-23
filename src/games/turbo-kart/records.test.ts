import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatTime, newRecords, parseRecords, recordRace, RECORDS_VERSION, serializeRecords } from "./records";

describe("기록 저장", () => {
  test("트랙별 최고 기록·최고 순위, 난이도별 최고 기록, 총 경기·1위 횟수", () => {
    let r = newRecords();
    r = recordRace(r, "a", "greenValley", "easy", 2, 70).records;
    const second = recordRace(r, "b", "greenValley", "hard", 1, 65);
    r = second.records;
    assert.equal(second.newBest, true);
    r = recordRace(r, "c", "greenValley", "easy", 3, 80).records;
    const t = r.tracks.greenValley;
    assert.equal(t.bestTime, 65);
    assert.equal(t.bestRank, 1);
    assert.deepEqual(t.byDifficulty, { easy: 70, normal: null, hard: 65 });
    assert.equal(r.races, 3);
    assert.equal(r.wins, 1);
    assert.equal(r.tracks.frostCircuit.bestTime, null);
  });

  test("같은 레이스는 한 번만 반영한다", () => {
    const once = recordRace(newRecords(), "race-1", "frostCircuit", "normal", 1, 90).records;
    const twice = recordRace(once, "race-1", "frostCircuit", "normal", 1, 90);
    assert.equal(twice.records, once);
    assert.equal(twice.records.races, 1);
  });

  test("저장 → 읽기 왕복, 손상되거나 다른 버전이면 null(게임은 새 기록으로 시작)", () => {
    const r = recordRace(newRecords(), "x", "desertCanyon", "hard", 4, 120).records;
    assert.deepEqual(parseRecords(serializeRecords(r)), r);
    const good = JSON.parse(serializeRecords(r));
    for (const raw of [
      null,
      "",
      "{",
      JSON.stringify({ ...good, v: RECORDS_VERSION + 1 }),
      JSON.stringify({ ...good, races: -1 }),
      JSON.stringify({ ...good, tracks: { ...good.tracks, greenValley: { ...good.tracks.greenValley, bestRank: 7 } } }),
      JSON.stringify({ ...good, tracks: { ...good.tracks, frostCircuit: null } }),
    ])
      assert.equal(parseRecords(raw), null, String(raw));
  });

  test("시간 표시", () => {
    assert.equal(formatTime(65.4), "1:05.40");
    assert.equal(formatTime(9.05), "0:09.05");
  });
});
