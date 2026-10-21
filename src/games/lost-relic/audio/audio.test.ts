import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ITEMS } from "../items";
import * as S from "../render/sprites";
import { ROOM_IDS, type GameEvent } from "../types";
import { cueForAction, cuesForEvents, musicCommands, trackForRoom } from "./cues";
import { DANGER_LOOP, EXPLORATION_LOOP, LOOPS, RELIC_LOOP } from "./music";
import { CUE_LENGTH } from "./sfx";

describe("효과음 선택", () => {
  test("이벤트마다 기획한 효과음이 하나씩 고른다", () => {
    const cases: [GameEvent, string][] = [
      [{ type: "start" }, "start"],
      [{ type: "chestOpen", id: "x" }, "chestOpen"],
      [{ type: "itemFound", item: "potion", count: 1, x: 0, y: 0 }, "itemFound"],
      [{ type: "itemFound", item: "bronzeKey", count: 1, x: 0, y: 0 }, "keyPickup"],
      [{ type: "itemFound", item: "silverKey", count: 1, x: 0, y: 0 }, "keyPickup"],
      [{ type: "doorUnlock", id: "x" }, "doorUnlock"],
      [{ type: "doorOpen", id: "x" }, "doorOpen"],
      [{ type: "secretFound", id: "x", x: 0, y: 0 }, "secretFound"],
      [{ type: "switchActivate", id: "x" }, "switchActivate"],
      [{ type: "trapTrigger", kind: "spikes" }, "trapTrigger"],
      [{ type: "playerHit", health: 2 }, "playerHit"],
      [{ type: "toolUse", id: "x", x: 0, y: 0 }, "toolUse"],
      [{ type: "relicFound", x: 0, y: 0 }, "relicFound"],
      [{ type: "roomTransition", from: "r1", to: "r2" }, "roomTransition"],
      [{ type: "gameClear" }, "gameClear"],
      [{ type: "gameOver" }, "gameOver"],
    ];
    for (const [event, cue] of cases) assert.deepEqual(cuesForEvents([event]).map((c) => c.cue), [cue], event.type);
    assert.equal(cueForAction("pause"), "pause");
    assert.equal(cueForAction("resume"), "resume");
  });

  test("잠금 해제 뒤 문 열림, 폭파 뒤 비밀 발견 소리가 이어서 울린다", () => {
    const door = cuesForEvents([{ type: "doorUnlock", id: "d" }, { type: "doorOpen", id: "d" }]);
    assert.ok(door.find((c) => c.cue === "doorOpen")!.delay > 0.3);
    const blast = cuesForEvents([{ type: "toolUse", id: "w", x: 0, y: 0 }, { type: "secretFound", id: "w", x: 0, y: 0 }]);
    assert.ok(blast.find((c) => c.cue === "secretFound")!.delay > 0.3);
  });

  test("효과음 길이가 기획(±)과 맞다", () => {
    const spec = { start: 0.6, chestOpen: 0.2, itemFound: 0.4, keyPickup: 0.25, doorUnlock: 0.4, doorOpen: 0.3, secretFound: 0.6, switchActivate: 0.2, trapTrigger: 0.2, playerHit: 0.3, toolUse: 0.4, relicFound: 1, gameClear: 2, gameOver: 1 } as const;
    for (const [cue, length] of Object.entries(spec)) assert.equal(CUE_LENGTH[cue as keyof typeof spec], length, cue);
  });
});

describe("배경음악", () => {
  test("방마다 곡: 3·7번은 위험 구역, 8번은 유물의 방, 나머지는 탐험", () => {
    assert.deepEqual(
      ROOM_IDS.map(trackForRoom),
      ["exploration", "exploration", "danger", "exploration", "exploration", "exploration", "danger", "relic"],
    );
  });

  test("곡 규격: 탐험 100 BPM 16마디, 위험 125 BPM 8마디, 유물 84 BPM 8마디", () => {
    assert.equal(EXPLORATION_LOOP.baseBpm, 100);
    assert.equal(EXPLORATION_LOOP.score.length, 16 * 16);
    assert.equal(DANGER_LOOP.baseBpm, 125);
    assert.equal(DANGER_LOOP.score.length, 8 * 16);
    assert.ok(RELIC_LOOP.baseBpm >= 80 && RELIC_LOOP.baseBpm <= 90);
    assert.equal(RELIC_LOOP.score.length, 8 * 16);
    assert.equal(EXPLORATION_LOOP.parts.lead.wave, "square");
    assert.equal(EXPLORATION_LOOP.parts.bass.wave, "triangle");
    for (const loop of Object.values(LOOPS)) {
      for (const slot of loop.score) for (const note of slot) {
        assert.ok(loop.parts[note.part], `unknown part ${note.part}`);
        assert.ok(note.part === "kick" || note.part === "snare" || note.part === "hat" || (note.freq > 30 && note.freq < 5000));
      }
    }
  });

  test("방에 들어오면 그 방의 곡을 요청하고(같은 곡이면 재생기에서 유지), 일시정지·재개·종료를 전달한다", () => {
    assert.deepEqual(musicCommands([{ type: "roomEnter", room: "r3" }], undefined, "r3"), [{ type: "play", track: "danger", restart: false }]);
    assert.deepEqual(musicCommands([], "start", "r1"), [{ type: "play", track: "exploration", restart: true }]);
    assert.deepEqual(musicCommands([], "pause", "r1"), [{ type: "pause" }]);
    assert.deepEqual(musicCommands([], "resume", "r1"), [{ type: "resume" }]);
    assert.equal(musicCommands([{ type: "relicFound", x: 0, y: 0 }], undefined, "r8")[0].type, "duck");
    assert.equal(musicCommands([{ type: "gameClear" }], undefined, "r1")[0].type, "stop");
    assert.equal(musicCommands([{ type: "gameOver" }], undefined, "r1")[0].type, "stop");
    assert.equal(musicCommands([{ type: "playerHit", health: 0 }], undefined, "r1")[0].type, "stop");
    assert.deepEqual(musicCommands([{ type: "playerHit", health: 2 }], undefined, "r1"), []);
  });
});

describe("픽셀아트", () => {
  test("모든 스프라이트·아이콘의 행 길이가 같고 팔레트에 없는 문자가 없다", () => {
    const sprites: [string, S.SpriteDef][] = [];
    for (const [name, value] of Object.entries(S)) {
      if (Array.isArray(value)) value.forEach((v, i) => typeof v === "object" && "art" in v && sprites.push([`${name}${i}`, v]));
      else if (value && typeof value === "object" && "art" in value) sprites.push([name, value as S.SpriteDef]);
      else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) if (v && typeof v === "object" && "art" in v) sprites.push([`${name}.${k}`, v as S.SpriteDef]);
    }
    for (const [id, item] of Object.entries(ITEMS)) sprites.push([`item ${id}`, { art: item.icon, palette: item.palette }]);
    assert.ok(sprites.length > 40);
    for (const [name, sprite] of sprites) {
      S.assertPixelArt(name, sprite.art);
      for (const row of sprite.art) for (const char of row) assert.ok(char === "." || sprite.palette[char], `${name}: "${char}"`);
    }
  });
});
