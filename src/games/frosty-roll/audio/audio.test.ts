import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cuesFor } from "./FrostyAudio";
import { PARADE_LOOP, paradeTempo, SHOWDOWN_LOOP } from "./music";

describe("사운드", () => {
  test("연쇄가 이어지면 chain 효과음(연쇄 수 포함), 첫 타격은 kill", () => {
    const cues = cuesFor([
      { type: "kill", chain: 1, points: 500, x: 0, y: 0 },
      { type: "kill", chain: 2, points: 1000, x: 0, y: 0 },
      { type: "kill", chain: 3, points: 2000, x: 0, y: 0 },
    ]);
    assert.deepEqual(cues, [
      { cue: "kill", chain: 1 },
      { cue: "chain", chain: 2 },
      { cue: "chain", chain: 3 },
    ]);
  });

  test("아이템 종류별 효과음: 보너스·목숨·일반", () => {
    const cues = cuesFor([
      { type: "item", kind: "gem", x: 0, y: 0 },
      { type: "item", kind: "life", x: 0, y: 0 },
      { type: "item", kind: "boots", x: 0, y: 0 },
    ]).map((c) => c.cue);
    assert.deepEqual(cues, ["bonus", "life", "item"]);
  });

  test("눈덩이 이벤트마다 효과음: 눈덩이 완성·차기·튕김·부서짐·탈출", () => {
    const cues = cuesFor([
      { type: "freeze", x: 0, y: 0 },
      { type: "kick", x: 0, y: 0 },
      { type: "bounce", x: 0, y: 0 },
      { type: "shatter", chain: 2, x: 0, y: 0 },
      { type: "escape", x: 0, y: 0 },
    ]).map((c) => c.cue);
    assert.deepEqual(cues, ["freeze", "kick", "bounce", "shatter", "escape"]);
  });

  test("배경음악 두 곡은 16마디(256칸)이고 모든 음이 유효하다", () => {
    for (const loop of [PARADE_LOOP, SHOWDOWN_LOOP]) {
      assert.equal(loop.score.length, 256);
      for (const step of loop.score) {
        for (const note of step) {
          assert.ok(loop.parts[note.part], note.part);
          assert.ok(Number.isFinite(note.freq) && note.steps > 0);
        }
      }
    }
    assert.ok(paradeTempo(3) > paradeTempo(0));
  });
});
