import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FIELD_IDS } from "../types";
import { cuesForEvents } from "./cues";
import { CannonMusic, SONGS } from "./music";

describe("배경음악 3곡", () => {
  for (const field of FIELD_IDS) {
    test(`${field}: 16마디 루프, 멜로디·화성·베이스·리듬 파트가 모두 있다`, () => {
      const { spec } = SONGS[field];
      assert.equal(spec.score.length, 16 * 16);
      const parts = new Set(spec.score.flat().map((note) => note.part));
      for (const part of ["lead", "harmony", "bass", "kick", "snare", "hat"]) assert.ok(parts.has(part), `${field}: ${part}`);
      for (const note of spec.score.flat()) {
        assert.ok(spec.parts[note.part], `정의되지 않은 파트 ${note.part}`);
        assert.ok(Number.isFinite(note.freq) && note.freq >= 0 && note.steps > 0);
      }
      // 마디마다 멜로디가 있어 단순 반복 비프음이 아니다
      for (let bar = 0; bar < 16; bar++) {
        const notes = spec.score.slice(bar * 16, bar * 16 + 16).flat().filter((n) => n.part === "lead");
        assert.ok(notes.length > 0 || bar === 15, `${field} ${bar + 1}마디 멜로디`);
      }
    });
  }

  test("곡마다 템포·멜로디가 다르다", () => {
    const tempos = FIELD_IDS.map((f) => SONGS[f].spec.baseBpm);
    assert.equal(new Set(tempos).size, 3);
    const melodies = FIELD_IDS.map((f) => SONGS[f].spec.score.slice(0, 64).flat().filter((n) => n.part === "lead").map((n) => n.freq.toFixed(1)).join());
    assert.equal(new Set(melodies).size, 3);
  });

  test("BGM은 기본 꺼짐이면 AudioContext 없이도 안전하게 동작한다", () => {
    const music = new CannonMusic(false);
    music.play("desertCanyon");
    music.setActive(false);
    music.stop();
    assert.equal(music.playing, false);
    assert.equal(music.track, "desertCanyon");
    music.dispose();
  });
});

describe("효과음 선택", () => {
  test("발사·폭발·명중·피해·아이템·승리·패배", () => {
    assert.deepEqual(
      cuesForEvents([{ type: "fire", side: "player", x: 0, y: 0, angle: 45, double: false, item: null }]).map((c) => c.cue),
      ["fire", "whistle"],
    );
    assert.deepEqual(cuesForEvents([{ type: "explosion", x: 0, y: 0, radius: 30, owner: "ai" }]).map((c) => c.cue), ["explosion"]);
    assert.deepEqual(cuesForEvents([{ type: "hit", target: "ai", by: "player", damage: 25, direct: true, blocked: false }]).map((c) => c.cue), ["hit"]);
    assert.deepEqual(cuesForEvents([{ type: "hit", target: "player", by: "ai", damage: 25, direct: true, blocked: true }]).map((c) => c.cue), ["barrier", "damage"]);
    assert.deepEqual(cuesForEvents([{ type: "itemGranted", side: "player", item: "barrier", source: "crate" }]).map((c) => c.cue), ["item"]);
    assert.deepEqual(cuesForEvents([{ type: "gameOver", winner: "player", reason: "hp" }]).map((c) => c.cue), ["win"]);
    assert.deepEqual(cuesForEvents([{ type: "gameOver", winner: "ai", reason: "fell" }]).map((c) => c.cue), ["lose"]);
  });

  test("같은 프레임의 같은 효과음은 한 번만", () => {
    const explosion = { type: "explosion", x: 0, y: 0, radius: 30, owner: "player" } as const;
    assert.equal(cuesForEvents([explosion, explosion]).length, 1);
  });
});
