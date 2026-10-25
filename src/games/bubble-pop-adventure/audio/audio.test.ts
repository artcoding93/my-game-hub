import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cuesFor } from "./BubbleAudio";
import { CHIME_LOOP, HOP_LOOP, hopTempo } from "./music";
import { CUE_CHANNEL } from "./sfx";

describe("사운드", () => {
  test("콤보가 이어지면 combo 효과음(콤보 수 포함), 첫 적은 kill", () => {
    const cues = cuesFor([
      { type: "kill", combo: 1, points: 500, x: 0, y: 0 },
      { type: "kill", combo: 2, points: 1000, x: 0, y: 0 },
      { type: "kill", combo: 3, points: 2000, x: 0, y: 0 },
    ]);
    assert.deepEqual(cues, [
      { cue: "kill", combo: 1 },
      { cue: "combo", combo: 2 },
      { cue: "combo", combo: 3 },
    ]);
  });

  test("방울 이벤트마다 효과음: 발사·큰 방울·포획·터짐·밟기·경고·탈출", () => {
    const cues = cuesFor([
      { type: "shoot", giant: false },
      { type: "shoot", giant: true },
      { type: "capture", x: 0, y: 0 },
      { type: "pop", x: 0, y: 0 },
      { type: "bubbleBounce", x: 0, y: 0 },
      { type: "warn", x: 0, y: 0 },
      { type: "escape", x: 0, y: 0 },
      { type: "jump" },
      { type: "stageClear", bonus: 0, checkpoint: false },
    ]).map((c) => c.cue);
    assert.deepEqual(cues, ["shoot", "giantShoot", "capture", "pop", "bounce", "warn", "escape", "jump", "stageClear"]);
  });

  test("아이템 종류별 효과음", () => {
    const cues = cuesFor([
      { type: "item", kind: "gem", x: 0, y: 0 },
      { type: "item", kind: "lucky", x: 0, y: 0 },
      { type: "item", kind: "freeze", x: 0, y: 0 },
      { type: "item", kind: "rapid", x: 0, y: 0 },
      { type: "extraLife" },
    ]).map((c) => c.cue);
    assert.deepEqual(cues, ["bonus", "lucky", "freeze", "item", "life"]);
    for (const c of cues) assert.ok(CUE_CHANNEL[c]);
  });

  test("배경음악 두 곡은 16마디(256칸)이고 모든 음이 유효하다", () => {
    for (const loop of [HOP_LOOP, CHIME_LOOP]) {
      assert.equal(loop.score.length, 256);
      for (const step of loop.score) {
        for (const note of step) {
          assert.ok(loop.parts[note.part], note.part);
          assert.ok(Number.isFinite(note.freq) && note.steps > 0);
        }
      }
    }
    assert.ok(hopTempo(3) > hopTempo(0));
  });
});
