import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GAME_CONFIG } from "../config";
import { ITEMS } from "../items";
import { FLAG, ROOMS } from "../rooms";
import { ROOM_IDS, type ItemId, type RoomId } from "../types";
import { canLeave, entryNode, reachable } from "./navigation";
import { explore, winningPath } from "./progression";
import { getRoom, makeTileQuery, matchingExit, opposite } from "./world";

/*
 * 지도·방 연결·진행 조건 자동 검증.
 * 실행: npm run test:lost-relic
 */

const { cols: COLS, rows: ROWS } = GAME_CONFIG;
const result = explore();

describe("방 구성", () => {
  test("정확히 8개의 방이 있고 번호가 1~8이다", () => {
    assert.equal(ROOM_IDS.length, 8);
    assert.deepEqual(
      ROOM_IDS.map((id) => ROOMS[id].index),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    for (const id of ROOM_IDS) {
      const room = getRoom(id);
      assert.equal(room.tiles.length, ROWS, `${id} rows`);
      for (const row of room.tiles) assert.equal(row.length, COLS, `${id} cols`);
    }
  });

  test("지도 문자는 모두 정의되어 있고, 모든 마커가 지도에 쓰였다", () => {
    for (const id of ROOM_IDS) {
      const def = ROOMS[id];
      const used = new Set(def.map.join(""));
      for (const marker of Object.keys(def.markers)) assert.ok(used.has(marker), `${id}: marker ${marker} unused`);
    }
  });

  test("사다리는 끊기지 않고 2칸 이상 이어진다 (화면 가장자리 출입구 칸 제외)", () => {
    for (const id of ROOM_IDS) {
      const room = getRoom(id);
      for (let c = 0; c < COLS; c++) {
        let length = 0;
        for (let r = 0; r <= ROWS; r++) {
          if (r < ROWS && room.tiles[r][c] === "ladder") {
            length++;
            continue;
          }
          if (length === 1 && r - 1 !== 0 && r - 1 !== ROWS - 1) assert.fail(`${id}: lone ladder tile at ${c},${r - 1}`);
          length = 0;
        }
      }
    }
  });

  test("오브젝트 id가 유적 전체에서 겹치지 않는다", () => {
    const ids = ROOM_IDS.flatMap((id) => getRoom(id).entities.map((e) => e.def.id));
    assert.equal(new Set(ids).size, ids.length);
  });

  test("방 가장자리는 출입구를 빼고 모두 막혀 있다(화면 밖으로 떨어지거나 나가지 않음)", () => {
    for (const id of ROOM_IDS) {
      const room = getRoom(id);
      const q = makeTileQuery(room, new Set());
      for (let r = 0; r < ROWS; r++) {
        for (const [side, c] of [["left", 0], ["right", COLS - 1]] as const) {
          const open = q(c, r) !== "solid";
          const exit = room.def.exits.some((e) => e.side === side && r >= e.from && r <= e.to);
          const doorway = room.entities.some((e) => (e.def.kind === "exitDoor" || e.def.kind === "lockedDoor") && e.col === c);
          if (open && !doorway) assert.ok(exit, `${id}: open ${side} edge at row ${r} without exit`);
        }
      }
      for (let c = 0; c < COLS; c++) {
        for (const [side, r] of [["up", 0], ["down", ROWS - 1]] as const) {
          if (room.tiles[r][c] === "solid") continue;
          const exit = room.def.exits.some((e) => e.side === side && c >= e.from && c <= e.to);
          assert.ok(exit, `${id}: open ${side} edge at col ${c} without exit`);
        }
      }
    }
  });
});

describe("방 연결", () => {
  test("모든 연결은 양방향이며 반대쪽 출입구와 방향·위치가 일치한다", () => {
    for (const id of ROOM_IDS) {
      for (const exit of ROOMS[id].exits) {
        const back = matchingExit(id, exit);
        assert.ok(back, `${id} → ${exit.room} has no way back`);
        assert.equal(back.side, opposite[exit.side]);
        assert.equal(back.room, id);
        // 좌우 출입구는 같은 높이(행), 상하 출입구는 같은 열이어야 한다.
        assert.equal(back.from, exit.from, `${id}↔${exit.room} from`);
        assert.equal(back.to, exit.to, `${id}↔${exit.room} to`);
        const sameSide = ROOMS[id].exits.filter((e) => e.room === exit.room && e.side === exit.side);
        assert.equal(sameSide.length, 1);
      }
    }
  });

  test("출입구 칸은 실제로 열려 있다 (좌우: 빈칸 + 바닥, 상하: 사다리)", () => {
    for (const id of ROOM_IDS) {
      const room = getRoom(id);
      for (const exit of room.def.exits) {
        if (exit.side === "left" || exit.side === "right") {
          const col = exit.side === "left" ? 0 : COLS - 1;
          for (let r = exit.from; r <= exit.to; r++) assert.notEqual(room.tiles[r][col], "solid", `${id} ${exit.side} row ${r}`);
          assert.equal(room.tiles[exit.to + 1][col], "solid", `${id} ${exit.side} floor`);
          assert.ok(exit.to - exit.from >= 1, "body needs 2 rows");
        } else {
          const row = exit.side === "up" ? 0 : ROWS - 1;
          for (let c = exit.from; c <= exit.to; c++) {
            const placed = room.entities.find((e) => e.col === c && e.row === row && e.def.kind === "hatch");
            assert.ok(room.tiles[row][c] === "ladder" || placed, `${id} ${exit.side} ladder at col ${c}`);
          }
        }
      }
    }
  });

  test("연결 그래프가 기획과 같다", () => {
    const edges = new Set(ROOM_IDS.flatMap((id) => ROOMS[id].exits.map((e) => [id, e.room].sort().join("-"))));
    assert.deepEqual([...edges].sort(), ["r1-r2", "r2-r4", "r3-r4", "r3-r6", "r4-r5", "r4-r7", "r5-r8", "r7-r8"]);
  });

  test("모든 출입구로 들어온 위치에서 같은 방의 출입구로 다시 나갈 수 있다 (문이 모두 열린 상태)", () => {
    for (const id of ROOM_IDS) {
      const room = getRoom(id);
      const allOpen = new Set<string>([FLAG.statuePuzzle, FLAG.trapHatch, FLAG.relic, FLAG.hiddenChest]);
      for (const e of room.entities) allOpen.add(`open:${e.def.id}`);
      const q = makeTileQuery(room, allOpen);
      for (const entry of room.def.exits) {
        const nodes = [...reachable(q, entryNode(entry)).values()];
        for (const exit of room.def.exits) {
          assert.ok(
            nodes.some((n) => canLeave(n, exit, q)),
            `${id}: from ${entry.side}(${entry.room}) cannot reach exit ${exit.side}(${exit.room})`,
          );
        }
      }
    }
  });
});

describe("진행 가능성 (지도 + 실제 상호작용 규칙)", () => {
  test("1번 방에서 시작해 유물을 얻고 1번 방으로 돌아와 탈출할 수 있다", () => {
    assert.ok(result.parent.has("WIN"), "no winning path");
    const path = winningPath(result);
    assert.equal(path.at(-1), "탈출문으로 탈출");
  });

  test("모든 방에 도달할 수 있다", () => {
    assert.deepEqual([...result.rooms].sort(), [...ROOM_IDS].sort());
  });

  test("막다른 상태가 없다: 도달 가능한 모든 상태에서 여전히 클리어할 수 있다", () => {
    const dead = [...result.states.keys()].filter((key) => !result.winning.has(key));
    assert.deepEqual(dead, []);
  });

  test("모든 상자를 열 수 있고, 모든 오브젝트에 손이 닿는다", () => {
    for (const id of ROOM_IDS) {
      for (const entity of getRoom(id).entities) {
        if (entity.def.kind === "chest") assert.ok(result.openableChests.has(entity.def.id), `chest ${entity.def.id}`);
        const interactive = ["chest", "jar", "tablet", "lockedDoor", "crackedWall", "secretSpot", "statue", "plate", "altar", "exitDoor"];
        if (interactive.includes(entity.def.kind) || (entity.def.kind === "hatch" && entity.def.secret)) {
          assert.ok(result.touched.has(entity.def.id), `touch ${entity.def.id}`);
        }
      }
    }
  });

  test("필수 아이템은 각각 정해진 상자 하나에서만 나오고, 그 아이템이 여는 곳 뒤에 있지 않다", () => {
    const sources = new Map<ItemId, string[]>();
    for (const id of ROOM_IDS) {
      for (const e of getRoom(id).entities) {
        if (e.def.kind === "chest" && ITEMS[e.def.item].essential) sources.set(e.def.item, [...(sources.get(e.def.item) ?? []), e.def.id]);
      }
    }
    assert.deepEqual(sources.get("bronzeKey"), ["r2-chest-b"]);
    assert.deepEqual(sources.get("silverKey"), ["r5-chest"]);
    assert.deepEqual(sources.get("blastPowder"), ["r6-hidden-chest"]);
    // 각 필수 아이템을 처음 얻는 상태에서는, 그 아이템으로 여는 문·벽이 아직 닫혀 있다.
    const opens: Partial<Record<ItemId, string>> = { bronzeKey: "open:r4-bronze-door", silverKey: "open:r7-silver-door", blastPowder: "open:r4-cracked-wall" };
    for (const [item, flag] of Object.entries(opens)) {
      const firstWith = [...result.states.values()].filter((s) => (s.inventory[item as ItemId] ?? 0) > 0);
      assert.ok(firstWith.length > 0, `${item} obtainable`);
      assert.ok(firstWith.every((s) => !s.flags.includes(flag)), `${item} behind its own lock`);
    }
  });

  test("열쇠·도구를 잘못 써도 막히지 않는다: 문·벽은 맞는 아이템이 있을 때만 열린다", () => {
    for (const s of result.states.values()) {
      if (s.flags.includes("open:r4-bronze-door")) assert.ok(s.flags.includes("chest:r2-chest-b"));
      if (s.flags.includes("open:r4-cracked-wall")) assert.ok(s.flags.includes("chest:r6-hidden-chest"));
      if (s.flags.includes("open:r7-silver-door")) assert.ok(s.flags.includes("chest:r5-chest"));
      if (s.flags.includes(FLAG.relic)) assert.ok(s.flags.includes("open:r7-silver-door"));
    }
  });

  test("유물을 얻은 뒤 1번 방까지 돌아오는 길이 있다(두 가지 이상)", () => {
    const withRelic = [...result.states.values()].filter((s) => s.flags.includes(FLAG.relic));
    const rooms = new Set<RoomId>(withRelic.map((s) => s.room));
    assert.ok(rooms.has("r1"));
    // 8번 → 5번 지름길과 8번 → 7번 귀환로가 모두 열려 있다.
    assert.ok(rooms.has("r5") && rooms.has("r7"));
  });

  test("클리어 경로 출력 (보고용)", () => {
    const path = winningPath(result);
    assert.ok(path.length > 10);
    console.log(`  상태 ${result.states.size}개 탐색, 클리어 경로 ${path.length}단계:\n    ${path.join("\n    ")}`);
  });
});
