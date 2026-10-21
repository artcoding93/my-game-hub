import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GAME_CONFIG, TILE } from "../config";
import { ROOMS } from "../rooms";
import { ROOM_IDS, type InputSnapshot, type Player, type RoomDef } from "../types";
import { isSolid, playerBox, stepPlayer, type PhysicsEnv } from "./physics";
import { EMPTY_INPUT } from "./simulation";
import { entrySpawn, getRoom, makeTileQuery, parseRoom } from "./world";

/*
 * 플레이어 물리 검증: 지도 검증 모델(navigation.ts)이 가정하는 점프·사다리 능력을 실제 물리로 확인하고,
 * 무작위 입력으로 오래 움직여도 벽·바닥에 끼지 않는지 확인한다.
 */

const DT = 1 / 60;
const BLANK = "................................";
const FLOOR = "################################";

function room(rows: Record<number, string>): RoomDef {
  const map = Array.from({ length: 18 }, (_, r) => rows[r] ?? (r === 17 ? FLOOR : BLANK));
  return { id: "r1", index: 1, name: "test", title: "TEST", map, markers: {}, exits: [] };
}

function env(def: RoomDef): PhysicsEnv {
  return { tile: makeTileQuery(parseRoom(def), new Set()), obstacles: [], push: () => 0 };
}

function player(col: number, row: number, climbing = false): Player {
  return {
    x: col * TILE + TILE / 2,
    y: (row + 1) * TILE,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: !climbing,
    climbing,
    coyote: 0,
    jumpBuffer: 0,
    invincible: 0,
    stun: 0,
    busy: 0,
    stride: 0,
    anim: "idle",
    autoClimb: 0,
    autoTimer: 0,
  };
}

function run(p: Player, e: PhysicsEnv, input: Partial<InputSnapshot>, frames: number, firstFrame?: Partial<InputSnapshot>) {
  for (let i = 0; i < frames; i++) stepPlayer(p, { ...EMPTY_INPUT, ...input, ...(i === 0 ? firstFrame : {}) }, e, DT, true);
}

const jump = { jumpPressed: true, jumpHeld: true };

describe("점프", () => {
  test("최고 점프 높이는 2칸보다 높고 3칸보다 낮다", () => {
    const e = env(room({}));
    const p = player(10, 16);
    let top = p.y;
    for (let i = 0; i < 60; i++) {
      stepPlayer(p, { ...EMPTY_INPUT, jumpHeld: true, jumpPressed: i === 0 }, e, DT, true);
      top = Math.min(top, p.y);
    }
    const height = (17 * TILE - top) / TILE;
    assert.ok(height > 2.2 && height < 3, `jump height ${height}`);
    assert.equal(p.y, 17 * TILE);
    assert.ok(p.onGround);
  });

  test("짧게 누르면 낮게 뛴다", () => {
    const e = env(room({}));
    const p = player(10, 16);
    let top = p.y;
    for (let i = 0; i < 60; i++) {
      stepPlayer(p, { ...EMPTY_INPUT, jumpHeld: i < 4, jumpPressed: i === 0 }, e, DT, true);
      top = Math.min(top, p.y);
    }
    assert.ok(17 * TILE - top < 1.8 * TILE, `short jump ${(17 * TILE - top) / TILE}`);
  });

  for (const gap of [0, 1]) {
    test(`멈춘 상태에서 2칸 높이 턱에 오른다 (사이 빈칸 ${gap})`, () => {
      const ledge = "#".repeat(8);
      const start = 5;
      const col = start + 1 + gap;
      const row = BLANK.slice(0, col) + ledge + BLANK.slice(col + ledge.length);
      const e = env(room({ 15: row, 16: row }));
      const p = player(start, 16);
      run(p, e, { move: 1, jumpHeld: true }, 70, jump);
      assert.equal(p.y, 15 * TILE, `landed at ${p.y}`);
    });
  }

  test("같은 높이의 3칸 틈을 건너뛴다", () => {
    const platform = "##########...###################";
    const e = env(room({ 12: platform.slice(0, 32) }));
    const p = player(9, 11);
    p.x = 10 * TILE - 7; // 발판 끝
    run(p, e, { move: 1, jumpHeld: true }, 70, jump);
    assert.equal(p.y, 12 * TILE, `fell to ${p.y}`);
    assert.ok(p.x > 13 * TILE);
  });

  test("가장자리를 막 벗어난 직후에도 점프가 된다 (코요테 타임)", () => {
    const e = env(room({ 12: "##########......................" }));
    const p = player(9, 11);
    // 걸어서 가장자리를 벗어난 직후(공중) 점프
    let frames = 0;
    while (p.onGround && frames++ < 60) run(p, e, { move: 1 }, 1);
    assert.equal(p.onGround, false);
    run(p, e, { move: 1, jumpHeld: true }, 1, jump);
    assert.ok(p.vy < -300);
  });

  test("아래에서 발판(=)을 뚫고 올라가 그 위에 선다", () => {
    const e = env(room({ 15: "..........======................" }));
    const p = player(12, 16);
    run(p, e, { jumpHeld: true }, 70, jump);
    assert.equal(p.y, 15 * TILE);
  });

  test("천장에 머리를 부딪히면 끼지 않고 내려온다", () => {
    const e = env(room({ 14: "########..######################" }));
    const p = player(3, 16);
    run(p, e, { jumpHeld: true }, 60, jump);
    assert.equal(p.y, 17 * TILE);
    assert.ok(p.onGround);
  });
});

describe("사다리", () => {
  const ladder = (r: number) => (r >= 10 && r <= 16 ? "..........H....................." : BLANK);
  const rows: Record<number, string> = {};
  for (let r = 10; r <= 16; r++) rows[r] = ladder(r);
  // 사다리 꼭대기(10행) 오른쪽은 돌바닥
  rows[10] = "..........H#####################";

  test("바닥에서 ↑로 끝까지 올라가 꼭대기 위에 선다", () => {
    const e = env(room(rows));
    const p = player(10, 16);
    run(p, e, { vertical: -1 }, 200);
    assert.equal(p.climbing, false);
    assert.equal(p.y, 10 * TILE);
    assert.ok(p.onGround);
  });

  test("꼭대기에서 ↓로 내려가 바닥에 선다", () => {
    const e = env(room(rows));
    const p = player(10, 9);
    run(p, e, { vertical: 1 }, 200);
    assert.equal(p.y, 17 * TILE);
    assert.equal(p.climbing, false);
  });

  test("꼭대기에서 옆 발판으로 걸어 나간다", () => {
    const e = env(room(rows));
    const p = player(10, 16);
    run(p, e, { vertical: -1 }, 200);
    run(p, e, { move: 1 }, 40);
    assert.equal(p.y, 10 * TILE);
    assert.ok(p.x > 12 * TILE);
  });

  test("사다리 중간에서 옆을 눌러도 떨어지지 않고, 점프로만 뛰어내린다", () => {
    const e = env(room(rows));
    const p = player(10, 16);
    run(p, e, { vertical: -1 }, 30);
    assert.ok(p.climbing);
    const y = p.y;
    run(p, e, { move: -1 }, 20);
    assert.ok(p.climbing);
    assert.equal(p.y, y);
    run(p, e, { move: -1, jumpHeld: true }, 1, jump);
    assert.equal(p.climbing, false);
  });

  test("떨어지는 중에 ↑를 누르면 사다리를 잡는다", () => {
    const e = env(room(rows));
    const p = player(10, 9);
    p.x += 4;
    p.y = 12 * TILE;
    p.onGround = false;
    run(p, e, { vertical: -1 }, 2);
    assert.ok(p.climbing);
    assert.equal(p.x, 10 * TILE + TILE / 2);
  });
});

describe("실제 유적 지도에서 끼임 방지", () => {
  /** 몸이 단단한 칸과 겹치는지 (가장자리 0.5px 허용) */
  function stuck(p: Player, e: PhysicsEnv) {
    const box = playerBox(p);
    for (let c = Math.floor((box.left + 0.5) / TILE); c <= Math.floor((box.right - 0.5) / TILE); c++) {
      for (let r = Math.floor((box.top + 0.5) / TILE); r <= Math.floor((box.bottom - 0.5) / TILE); r++) {
        if (isSolid(e.tile(c, r))) return `${c},${r}`;
      }
    }
    return null;
  }

  for (const id of ROOM_IDS) {
    test(`${id}: 무작위 입력 4,000스텝 동안 벽 속에 들어가지 않는다`, () => {
      const parsed = getRoom(id);
      const flags = new Set<string>(["puzzle:r5-statue", "secret:r3-hatch", "relic:taken"]);
      for (const e2 of parsed.entities) flags.add(`open:${e2.def.id}`);
      const e: PhysicsEnv = { tile: makeTileQuery(parsed, flags), obstacles: [], push: () => 0 };
      let seed = 12345 + ROOMS[id].index;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      for (const exit of ROOMS[id].exits) {
        const spawn = entrySpawn(exit);
        const p = player(0, 0, spawn.climbing);
        p.x = spawn.x;
        p.y = spawn.y;
        let input: InputSnapshot = EMPTY_INPUT;
        for (let i = 0; i < 4000; i++) {
          if (i % 12 === 0) {
            const r = rand();
            input = {
              ...EMPTY_INPUT,
              move: r < 0.33 ? -1 : r < 0.66 ? 1 : 0,
              vertical: rand() < 0.3 ? -1 : rand() < 0.3 ? 1 : 0,
              jumpHeld: rand() < 0.4,
              jumpPressed: rand() < 0.25,
            };
          }
          stepPlayer(p, input, e, DT, true);
          // 출입구 밖으로 나가면 시작 위치로 되돌린다(전환은 simulation.test.ts에서 검증)
          if (p.x < 2 || p.x > GAME_CONFIG.width - 2 || p.y - 14 < 0 || p.y - 14 > GAME_CONFIG.height) {
            p.x = spawn.x;
            p.y = spawn.y;
            p.climbing = spawn.climbing;
            p.vx = 0;
            p.vy = 0;
            continue;
          }
          const where = stuck(p, e);
          assert.equal(where, null, `${id} step ${i}: stuck in solid ${where} at ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        }
      }
    });
  }
});
