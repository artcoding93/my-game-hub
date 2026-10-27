import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseLevel } from "../logic/level";
import { isSolved, step } from "../logic/engine";
import { cuesFor } from "./CargoAudio";
import { HUM_LOOP, NIGHT_LOOP, songFor } from "./music";
import { CUE_CHANNEL } from "./sfx";

describe("사운드", () => {
  test("이동·막힘·밀기·도착·클리어 효과음", () => {
    const lv = parseLevel(["#######", "#P-Bo-#", "#######"]);
    assert.deepEqual(cuesFor(step(lv, lv.start, 0), lv, false), [{ cue: "blocked" }]);
    const walk = step(lv, lv.start, 1);
    assert.deepEqual(cuesFor(walk, lv, false), [{ cue: "move" }]);
    const push = step(lv, walk.board, 1);
    assert.deepEqual(cuesFor(push, lv, isSolved(lv, push.board)).map((c) => c.cue), ["push", "lamp", "stageClear"]);
  });

  test("특수 타일 연쇄는 순서대로: 밀기 → 컨베이어 → 얼음 → 순간이동", () => {
    const lv = parseLevel(["############", "#PB>~1#-1--#", "#----#-----#", "############"]);
    const r = step(lv, lv.start, 1);
    assert.deepEqual(cuesFor(r, lv, false).map((c) => c.cue), ["push", "conveyor", "ice", "teleport"]);
    for (const c of cuesFor(r, lv, false)) assert.ok(CUE_CHANNEL[c.cue]);
  });

  test("배경음악 두 곡은 16마디(256칸), 모든 음이 유효하고 차분한 템포", () => {
    for (const loop of [NIGHT_LOOP, HUM_LOOP]) {
      assert.equal(loop.score.length, 256);
      for (const s of loop.score) for (const note of s) assert.ok(loop.parts[note.part] && Number.isFinite(note.freq) && note.steps > 0);
      assert.ok(loop.baseBpm <= 100);
    }
    assert.equal(songFor(0), "night");
    assert.equal(songFor(6), "hum");
  });
});
