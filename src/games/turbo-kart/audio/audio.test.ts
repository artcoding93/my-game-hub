import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TRACK_IDS } from "../types";
import { cuesForEvents } from "./cues";
import { KartMusic, SONGS } from "./music";

describe("배경음악 3곡", () => {
  for (const id of TRACK_IDS) {
    test(`${id}: 16마디 루프, 멜로디·화음·베이스·드럼이 분리되어 있다`, () => {
      const { spec } = SONGS[id];
      assert.equal(spec.score.length, 16 * 16);
      const parts = new Set(spec.score.flat().map((n) => n.part));
      for (const part of ["lead", "harmony", "bass", "kick", "snare", "hat"]) assert.ok(parts.has(part), part);
      for (const n of spec.score.flat()) {
        assert.ok(spec.parts[n.part], n.part);
        assert.ok(Number.isFinite(n.freq) && n.steps > 0);
      }
    });
  }

  test("곡마다 템포·멜로디가 다르다", () => {
    assert.equal(new Set(TRACK_IDS.map((id) => SONGS[id].spec.baseBpm)).size, 3);
    const leads = TRACK_IDS.map((id) => SONGS[id].spec.score.flat().filter((n) => n.part === "lead").map((n) => n.freq.toFixed(1)).join());
    assert.equal(new Set(leads).size, 3);
  });

  test("BGM 기본 꺼짐: AudioContext 없이도 안전", () => {
    const music = new KartMusic(false);
    music.play("frostCircuit");
    music.setActive(false);
    music.stop();
    assert.equal(music.playing, false);
    music.dispose();
  });
});

describe("효과음 선택", () => {
  test("플레이어 관련 이벤트 → 카운트다운·출발·부스터·충돌·아이템·피격·완주·승리", () => {
    const cue = (e: Parameters<typeof cuesForEvents>[0][number]) => cuesForEvents([e], 3).map((c) => c.cue);
    assert.deepEqual(cue({ type: "countdown", value: 2 }), ["countdown"]);
    assert.deepEqual(cue({ type: "go" }), ["go"]);
    assert.deepEqual(cue({ type: "boost", kart: 3 }), ["boost"]);
    assert.deepEqual(cue({ type: "wall", kart: 3, speed: 200 }), ["crash"]);
    assert.deepEqual(cue({ type: "itemGet", kart: 3, item: "shield" }), ["itemGet"]);
    assert.deepEqual(cue({ type: "itemUse", kart: 3, item: "shield" }), ["itemUse"]);
    assert.deepEqual(cue({ type: "hit", kart: 3, by: "snowBomb", blocked: false }), ["hit"]);
    assert.deepEqual(cue({ type: "hit", kart: 3, by: "snowBomb", blocked: true }), ["block"]);
    assert.deepEqual(cue({ type: "finish", kart: 3, rank: 1, time: 60 }), ["finish"]);
    assert.deepEqual(cue({ type: "raceOver", playerRank: 1, playerTime: 60 }), ["win"]);
    assert.deepEqual(cue({ type: "raceOver", playerRank: 3, playerTime: 60 }), ["lose"]);
  });

  test("다른 카트끼리의 부스터·충돌·아이템 획득은 소리를 내지 않는다", () => {
    assert.deepEqual(cuesForEvents([{ type: "boost", kart: 0 }, { type: "wall", kart: 1, speed: 300 }, { type: "itemGet", kart: 2, item: "shield" }], 3), []);
  });
});
