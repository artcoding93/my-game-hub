import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GAME_CONFIG, TILE } from "../config";
import { LostRelicController, type Persistence } from "../controller";
import { FLAG, ROOMS } from "../rooms";
import { parseSaveData, toSaveData, type SaveData } from "../save";
import { ROOM_IDS, type ExitDef, type GameEvent, type GameState, type InputSnapshot, type RoomId } from "../types";
import { explore, winningStates } from "./progression";
import {
  applySelectedItem,
  continueGame,
  createGame,
  cycleItem,
  EMPTY_INPUT,
  findInteraction,
  newGame,
  stepGame,
  teleport,
} from "./simulation";
import { chestFlag, getRoom, matchingExit, openFlag } from "./world";

const DT = 1 / 60;

function playing(): GameState {
  const state = createGame();
  newGame(state);
  return state;
}

function at(state: GameState, room: RoomId, col: number, row: number, climbing = false) {
  teleport(state, room, { x: col * TILE + TILE / 2, y: (row + 1) * TILE, climbing });
  state.safeTime = 0;
}

function step(state: GameState, input: Partial<InputSnapshot> = {}, frames = 1): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < frames; i++) events.push(...stepGame(state, { ...EMPTY_INPUT, ...input }, DT));
  return events;
}

function press(state: GameState, key: "interactPressed" | "usePressed" | "cyclePressed", settle = 40) {
  const events = step(state, { [key]: true });
  events.push(...step(state, {}, settle));
  return events;
}

/** 방 안의 안전한 대기: 적·함정을 치운다 */
function calm(state: GameState) {
  state.enemies = [];
  state.crushers = [];
  state.rocks = [];
  state.safeTime = 1e9;
}

/** 출입구 바로 앞 위치와 나가는 방향 입력 */
function exitApproach(exit: ExitDef): { col: number; row: number; climbing: boolean; input: Partial<InputSnapshot> } {
  switch (exit.side) {
    case "left":
      return { col: 1, row: exit.to, climbing: false, input: { move: -1 } };
    case "right":
      return { col: GAME_CONFIG.cols - 2, row: exit.to, climbing: false, input: { move: 1 } };
    case "up":
      return { col: exit.from, row: 2, climbing: true, input: { vertical: -1 } };
    case "down":
      return { col: exit.from, row: GAME_CONFIG.rows - 2, climbing: false, input: { vertical: 1 } };
  }
}

/** 실제 물리로 출입구를 지나 다음 방으로 넘어간다. 넘어가면 true */
function walkOut(state: GameState, exit: ExitDef, maxFrames = 600): boolean {
  const from = state.room;
  const approach = exitApproach(exit);
  at(state, from, approach.col, approach.row, approach.climbing);
  calm(state);
  for (let i = 0; i < maxFrames; i++) {
    step(state, approach.input);
    if (state.room !== from && !state.transition) return true;
  }
  return false;
}

function openEverything(state: GameState) {
  for (const id of ROOM_IDS) for (const e of getRoom(id).entities) state.flags.add(openFlag(e.def.id));
  state.flags.add(FLAG.statuePuzzle);
  state.flags.add(FLAG.trapHatch);
  state.flags.add(FLAG.relic);
}

describe("방 전환 (실제 물리)", () => {
  for (const id of ROOM_IDS) {
    for (const exit of ROOMS[id].exits) {
      test(`${id} ${exit.side} → ${exit.room}: 걸어서 넘어가고 대응 출입구에 나타나며, 되돌아갈 수 있다`, () => {
        const state = playing();
        openEverything(state);
        teleport(state, id, { x: 100, y: 100 });
        assert.ok(walkOut(state, exit), `did not leave ${id} via ${exit.side}`);
        assert.equal(state.room, exit.room);
        const back = matchingExit(id, exit)!;
        // 도착 위치는 반대쪽 출입구 근처다.
        const p = state.player;
        if (back.side === "left") assert.ok(p.x < 5 * TILE, `arrived at x=${p.x}`);
        if (back.side === "right") assert.ok(p.x > GAME_CONFIG.width - 5 * TILE, `arrived at x=${p.x}`);
        if (back.side === "up") assert.ok(p.y < 4 * TILE && Math.abs(p.x - (back.from * TILE + TILE / 2)) < 1);
        if (back.side === "down") assert.ok(p.y > GAME_CONFIG.height - 3 * TILE && Math.abs(p.x - (back.from * TILE + TILE / 2)) < 1);
        // 방에 들어온 직후 보호 시간이 있다.
        assert.ok(state.safeTime > 0.5);
        assert.ok(state.visited.has(exit.room));
        step(state, {}, 30);
        assert.ok(walkOut(state, back), `cannot go back ${exit.room} → ${id}`);
        assert.equal(state.room, id);
      });
    }
  }

  test("전환 중에는 페이드가 진행되고, 이벤트 roomTransition·roomEnter가 한 번씩 나온다", () => {
    const state = playing();
    at(state, "r1", 29, 11);
    calm(state);
    const events = step(state, { move: 1 }, 60);
    assert.equal(events.filter((e) => e.type === "roomTransition").length, 1);
    assert.equal(events.filter((e) => e.type === "roomEnter").length, 1);
    assert.equal(state.room, "r2");
  });
});

describe("상자와 아이템", () => {
  test("E로 상자를 열면 애니메이션 뒤 아이템을 얻고, 다시 열 수 없다", () => {
    const state = playing();
    at(state, "r2", 17, 7);
    calm(state);
    assert.equal(findInteraction(state)?.prompt, "E: 상자 열기");
    const first = step(state, { interactPressed: true });
    assert.ok(first.some((e) => e.type === "chestOpen"));
    assert.equal(state.inventory.bronzeKey, 0, "item appears after the lid opens");
    const later = step(state, {}, 40);
    assert.ok(later.some((e) => e.type === "itemFound" && e.item === "bronzeKey"));
    assert.equal(state.inventory.bronzeKey, 1);
    assert.match(state.message?.text ?? "", /청동 열쇠/);
    // 다시 E: 아무 일도 없다
    const again = press(state, "interactPressed");
    assert.ok(!again.some((e) => e.type === "chestOpen" || e.type === "itemFound"));
    assert.equal(state.inventory.bronzeKey, 1);
  });

  test("금화 상자는 점수를 준다 (+100 × 개수)", () => {
    const state = playing();
    at(state, "r2", 4, 16);
    calm(state);
    press(state, "interactPressed");
    assert.equal(state.inventory.coin, 3);
    assert.equal(state.score, 300);
  });

  test("다른 방에 다녀와도 열린 상자는 열린 상태로 남는다", () => {
    const state = playing();
    at(state, "r2", 17, 7);
    calm(state);
    press(state, "interactPressed");
    assert.ok(walkOut(state, ROOMS.r2.exits[1]));
    assert.equal(state.room, "r4");
    assert.ok(walkOut(state, ROOMS.r4.exits[0]));
    assert.equal(state.room, "r2");
    assert.ok(state.flags.has(chestFlag("r2-chest-b")));
    at(state, "r2", 17, 7);
    assert.notEqual(findInteraction(state)?.prompt, "E: 상자 열기");
  });

  test("항아리를 조사하면 금화를 찾거나 빈 항아리라고 알려 준다", () => {
    const state = playing();
    at(state, "r2", 12, 16);
    calm(state);
    press(state, "interactPressed");
    assert.match(state.message?.text ?? "", /빈 항아리/);
    at(state, "r2", 21, 7);
    calm(state);
    press(state, "interactPressed");
    assert.equal(state.inventory.coin, 1);
  });

  test("떠 있는 금화는 닿으면 얻는다", () => {
    const state = playing();
    at(state, "r3", 13, 10);
    calm(state);
    step(state, {}, 2);
    assert.equal(state.inventory.coin, 1);
    assert.equal(state.score, 100);
  });
});

describe("문·비밀·퍼즐", () => {
  test("청동 열쇠가 없으면 청동 문이 열리지 않고 안내만 나온다", () => {
    const state = playing();
    at(state, "r4", 27, 16);
    calm(state);
    assert.equal(findInteraction(state)?.prompt, "청동 열쇠가 필요합니다");
    const events = press(state, "interactPressed");
    assert.ok(events.some((e) => e.type === "denied"));
    assert.ok(!state.flags.has(openFlag("r4-bronze-door")));
  });

  test("청동 열쇠로 문을 열면 열쇠가 소모되고 문이 열린 상태로 저장된다", () => {
    const state = playing();
    state.inventory.bronzeKey = 1;
    at(state, "r4", 27, 16);
    calm(state);
    assert.equal(findInteraction(state)?.prompt, "E: 문 열기 (청동 열쇠)");
    const events = press(state, "interactPressed");
    assert.ok(events.some((e) => e.type === "doorUnlock"));
    assert.ok(events.some((e) => e.type === "doorOpen"));
    assert.ok(state.flags.has(openFlag("r4-bronze-door")));
    assert.equal(state.inventory.bronzeKey, 0);
    // 문을 지나 3번 방으로 걸어갈 수 있다
    assert.ok(walkOut(state, ROOMS.r4.exits[1]));
    assert.equal(state.room, "r3");
  });

  test("잘못된 곳에서 F로 열쇠·폭약을 써도 소모되지 않는다", () => {
    const state = playing();
    state.inventory.bronzeKey = 1;
    state.inventory.silverKey = 1;
    state.inventory.blastPowder = 1;
    at(state, "r2", 10, 16);
    calm(state);
    for (const item of ["bronzeKey", "silverKey", "blastPowder"] as const) {
      state.selected = item;
      const events: GameEvent[] = [];
      applySelectedItem(state, events);
      assert.ok(events.some((e) => e.type === "denied"), item);
      assert.equal(state.inventory[item], 1, item);
    }
    // 은빛 열쇠는 청동 문에 맞지 않는다
    at(state, "r4", 27, 16);
    calm(state);
    state.selected = "silverKey";
    applySelectedItem(state, []);
    assert.equal(state.inventory.silverKey, 1);
    assert.ok(!state.flags.has(openFlag("r4-bronze-door")));
  });

  test("균열 벽은 고대 폭약으로만 무너지고 비밀 점수를 준다", () => {
    const state = playing();
    at(state, "r4", 29, 7);
    calm(state);
    assert.equal(findInteraction(state)?.prompt, "벽에 수상한 균열이 있습니다");
    press(state, "interactPressed");
    assert.ok(!state.flags.has(openFlag("r4-cracked-wall")));
    state.inventory.blastPowder = 1;
    state.selected = "blastPowder";
    const events = press(state, "usePressed");
    assert.ok(events.some((e) => e.type === "toolUse"));
    assert.ok(events.some((e) => e.type === "secretFound"));
    assert.ok(state.flags.has(openFlag("r4-cracked-wall")));
    assert.equal(state.inventory.blastPowder, 0);
    assert.equal(state.score, GAME_CONFIG.score.secret);
    assert.ok(walkOut(state, ROOMS.r4.exits[2]));
    assert.equal(state.room, "r5");
  });

  test("3번 방 헐거운 석판을 조사하면 비밀 사다리가 열리고 6번 방으로 내려갈 수 있다", () => {
    const state = playing();
    at(state, "r3", 29, 16);
    calm(state);
    assert.match(findInteraction(state)?.prompt ?? "", /헐겁다/);
    const events = press(state, "interactPressed");
    assert.ok(events.some((e) => e.type === "secretFound"));
    assert.ok(state.flags.has(FLAG.trapHatch));
    assert.equal(state.score, 500);
    // 실제로 ↓를 눌러 사다리를 타고 내려간다
    for (let i = 0; i < 300 && state.room === "r3"; i++) step(state, { vertical: 1 });
    step(state, {}, 30);
    assert.equal(state.room, "r6");
  });

  test("6번 방 느슨한 벽돌을 조사하면 숨겨진 상자가 나타나고 고대 폭약을 얻는다", () => {
    const state = playing();
    at(state, "r6", 3, 16);
    calm(state);
    // 숨겨진 상자는 아직 조사 대상이 아니다
    assert.match(findInteraction(state)?.prompt ?? "", /벽돌/);
    press(state, "interactPressed");
    assert.ok(state.flags.has(FLAG.hiddenChest));
    at(state, "r6", 4, 16);
    calm(state);
    assert.equal(findInteraction(state)?.prompt, "E: 상자 열기");
    press(state, "interactPressed");
    assert.equal(state.inventory.blastPowder, 1);
  });

  test("석상을 실제로 밀어 스위치에 올리면 퍼즐이 풀리고 봉인 상자·석문이 열린다", () => {
    const state = playing();
    at(state, "r5", 10, 16);
    calm(state);
    // 봉인된 상자는 아직 열 수 없다
    at(state, "r5", 27, 16);
    calm(state);
    press(state, "interactPressed");
    assert.equal(state.inventory.silverKey, 0);
    at(state, "r5", 10, 16);
    calm(state);
    let events: GameEvent[] = [];
    for (let i = 0; i < 900 && !state.flags.has(FLAG.statuePuzzle); i++) events = events.concat(step(state, { move: 1 }));
    assert.ok(state.flags.has(FLAG.statuePuzzle), `statue at ${state.statues["r5-statue"].x}`);
    assert.ok(events.some((e) => e.type === "switchActivate"));
    assert.ok(state.statues["r5-statue"].locked);
    assert.equal(state.score, GAME_CONFIG.score.puzzle);
    // 고정된 석상은 더 이상 밀리지 않는다
    const x = state.statues["r5-statue"].x;
    step(state, { move: 1 }, 120);
    assert.equal(state.statues["r5-statue"].x, x);
    at(state, "r5", 27, 16);
    calm(state);
    press(state, "interactPressed");
    assert.equal(state.inventory.silverKey, 1);
  });

  test("석상을 반대쪽으로 밀어 레일 끝에 붙여도 뛰어넘어 다시 밀 수 있다(막힘 없음)", () => {
    const state = playing();
    at(state, "r5", 15, 16);
    calm(state);
    step(state, { move: -1 }, 400);
    const minX = 9 * TILE + TILE / 2;
    assert.equal(state.statues["r5-statue"].x, minX);
    // 석상 위로 점프해 넘어가 오른쪽으로 민다
    at(state, "r5", 8, 16);
    calm(state);
    step(state, { move: 1, jumpHeld: true, jumpPressed: true });
    step(state, { move: 1, jumpHeld: true }, 40);
    assert.ok(state.player.x > minX, "jumped over");
    at(state, "r5", 8, 16);
    calm(state);
    for (let i = 0; i < 900 && !state.flags.has(FLAG.statuePuzzle); i++) step(state, { move: 1 });
    assert.ok(state.flags.has(FLAG.statuePuzzle));
  });

  test("4번 방 천장 석문은 퍼즐 전에는 막고, 퍼즐 후에는 7번 방으로 올라갈 수 있다", () => {
    const state = playing();
    at(state, "r4", 4, 7);
    calm(state);
    for (let i = 0; i < 200; i++) step(state, { vertical: -1 });
    assert.equal(state.room, "r4");
    state.flags.add(FLAG.statuePuzzle);
    for (let i = 0; i < 300 && state.room === "r4"; i++) step(state, { vertical: -1 });
    step(state, {}, 30);
    assert.equal(state.room, "r7");
  });
});

describe("함정·적·체력", () => {
  test("가시는 숨음→경고→솟음 주기로 움직이고, 솟았을 때만 피해를 준다", () => {
    const state = playing();
    at(state, "r3", 5, 16);
    calm(state);
    state.safeTime = 0;
    const T = GAME_CONFIG.traps;
    step(state, {}, Math.floor((T.spikeHidden + T.spikeWarn) * 60) - 2);
    assert.equal(state.health, 3, "no damage while hidden/warning");
    const events = step(state, {}, 10);
    assert.ok(events.some((e) => e.type === "playerHit"));
    assert.equal(state.health, 2);
  });

  test("피격 뒤 무적 시간에는 다시 맞지 않는다", () => {
    const state = playing();
    at(state, "r3", 18, 16);
    state.safeTime = 0;
    state.enemies = state.enemies.filter((e) => e.kind === "snake");
    state.enemies[0].x = state.player.x;
    step(state, {}, 1);
    assert.equal(state.health, 2);
    state.enemies[0].x = state.player.x;
    step(state, {}, 20);
    assert.equal(state.health, 2);
    assert.ok(state.player.invincible > 0);
  });

  test("방에 들어온 직후에는 적에게 닿아도 피해가 없다", () => {
    const state = playing();
    at(state, "r3", 18, 16);
    state.safeTime = GAME_CONFIG.roomEntrySafeTime;
    state.enemies[0].x = state.player.x;
    for (const e of state.enemies) if (e.kind === "snake") e.x = state.player.x;
    step(state, {}, 10);
    assert.equal(state.health, 3);
  });

  test("뱀은 범위 안을 왕복하고, 박쥐는 물결 모양으로 난다", () => {
    const state = playing();
    at(state, "r3", 2, 16);
    const snake = state.enemies.find((e) => e.kind === "snake")!;
    const bat = state.enemies.find((e) => e.kind === "bat")!;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < 60 * 30; i++) {
      step(state);
      state.player.invincible = 99;
      xs.push(snake.x);
      ys.push(bat.y);
    }
    assert.ok(Math.min(...xs) >= snake.minX - 0.01 && Math.max(...xs) <= snake.maxX + 0.01);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 200);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 40);
  });

  test("수호병은 앞의 플레이어를 발견하면 멈칫한 뒤 추격하고, 순찰 범위를 벗어나지 않는다", () => {
    const state = playing();
    at(state, "r7", 16, 16);
    state.safeTime = 0;
    state.player.invincible = 99;
    const g = state.enemies.find((e) => e.kind === "guardian")!;
    g.x = 12 * TILE;
    g.dir = 1;
    step(state);
    assert.equal(g.mode, "alert");
    step(state, {}, 40);
    assert.equal(g.mode, "chase");
    for (let i = 0; i < 600; i++) {
      step(state, { move: 1 });
      state.player.invincible = 99;
      assert.ok(g.x <= g.maxX + 0.01);
    }
  });

  test("돌 블록은 내려올 때만 피해를 준다", () => {
    const state = playing();
    at(state, "r7", 15, 10);
    state.safeTime = 0;
    state.enemies = [];
    const crusher = state.crushers[0];
    assert.equal(crusher.mode, "up");
    step(state, {}, 30);
    assert.equal(state.health, 3, "safe while the block is up");
    let hit = false;
    for (let i = 0; i < 200 && !hit; i++) hit = step(state).some((e) => e.type === "playerHit");
    assert.ok(hit);
  });

  test("체력이 0이 되면 잠시 뒤 GAME OVER가 된다", () => {
    const state = playing();
    state.health = 1;
    at(state, "r3", 18, 16);
    state.enemies = state.enemies.filter((e) => e.kind === "snake");
    state.enemies[0].x = state.player.x;
    step(state);
    assert.equal(state.phase, "dying");
    const events = step(state, {}, Math.ceil(GAME_CONFIG.deathDelay * 60) + 2);
    assert.equal(state.phase, "gameOver");
    assert.ok(events.some((e) => e.type === "gameOver"));
  });

  test("회복 물약: 체력이 가득하면 소모되지 않고, 다쳤을 때 1 회복한다", () => {
    const state = playing();
    state.inventory.potion = 1;
    state.selected = "potion";
    applySelectedItem(state, []);
    assert.equal(state.inventory.potion, 1);
    state.health = 2;
    const events: GameEvent[] = [];
    applySelectedItem(state, events);
    assert.equal(state.health, 3);
    assert.equal(state.inventory.potion, 0);
    assert.ok(events.some((e) => e.type === "heal"));
  });

  test("Q로 가진 아이템을 순서대로 바꾼다", () => {
    const state = playing();
    state.inventory.bronzeKey = 1;
    state.inventory.potion = 2;
    state.inventory.coin = 3;
    state.selected = "bronzeKey";
    cycleItem(state);
    assert.equal(state.selected, "potion");
    cycleItem(state);
    assert.equal(state.selected, "coin");
    cycleItem(state);
    assert.equal(state.selected, "bronzeKey");
  });
});

describe("유물과 탈출", () => {
  test("유물을 얻으면 점수·격자 개방·떨어지는 돌이 시작되고, 1번 방에서 탈출하면 클리어", () => {
    const state = playing();
    at(state, "r8", 16, 14);
    calm(state);
    const events = press(state, "interactPressed");
    assert.ok(events.some((e) => e.type === "relicFound"));
    assert.ok(state.flags.has(FLAG.relic));
    assert.equal(state.inventory.relic, 1);
    assert.equal(state.score, GAME_CONFIG.score.relic);
    // 떨어지는 돌
    state.safeTime = 1e9;
    step(state, {}, 200);
    assert.ok(state.rocks.length > 0 || state.rockIndex > 0);
    // 8번 바닥 격자로 5번 방에 내려갈 수 있다
    at(state, "r8", 24, 16);
    calm(state);
    for (let i = 0; i < 300 && state.room === "r8"; i++) step(state, { vertical: 1 });
    assert.equal(state.room, "r5");
    // 1번 방 탈출
    at(state, "r1", 2, 16);
    calm(state);
    assert.equal(findInteraction(state)?.prompt, "E: 유적 탈출하기");
    const end = press(state, "interactPressed", 0);
    assert.ok(end.some((e) => e.type === "gameClear"));
    assert.equal(state.phase, "cleared");
    assert.equal(state.score, GAME_CONFIG.score.relic + GAME_CONFIG.score.clear);
  });

  test("유물 없이는 탈출문이 열리지 않는다", () => {
    const state = playing();
    at(state, "r1", 2, 16);
    calm(state);
    press(state, "interactPressed");
    assert.equal(state.phase, "playing");
  });
});

describe("저장·이어하기", () => {
  test("저장 데이터를 JSON으로 저장했다가 그대로 이어할 수 있다", () => {
    const state = playing();
    at(state, "r4", 2, 16);
    state.inventory.bronzeKey = 1;
    state.inventory.coin = 4;
    state.selected = "bronzeKey";
    state.flags.add(chestFlag("r2-chest-b"));
    state.flags.add(openFlag("r4-bronze-door"));
    state.visited.add("r2");
    state.statues["r5-statue"].x = 300;
    state.health = 2;
    state.score = 900;
    state.time = 123.4;
    const raw = JSON.stringify(toSaveData(state));
    const data = parseSaveData(raw);
    assert.ok(data);
    const loaded = createGame();
    continueGame(loaded, data);
    assert.equal(loaded.room, "r4");
    assert.equal(loaded.phase, "playing");
    assert.equal(loaded.health, 2);
    assert.equal(loaded.inventory.bronzeKey, 1);
    assert.equal(loaded.inventory.coin, 4);
    assert.equal(loaded.selected, "bronzeKey");
    assert.ok(loaded.flags.has(openFlag("r4-bronze-door")));
    assert.ok(loaded.flags.has(chestFlag("r2-chest-b")));
    assert.ok(loaded.visited.has("r2"));
    assert.equal(loaded.statues["r5-statue"].x, 300);
    assert.equal(loaded.score, 900);
    assert.equal(loaded.time, 123.4);
    assert.equal(loaded.player.x, state.checkpoint.x);
  });

  test("손상되거나 형식이 다른 저장 데이터는 거부한다", () => {
    const good = toSaveData(playing());
    const bad: unknown[] = [
      "not json",
      "null",
      "[]",
      JSON.stringify({ ...good, v: 99 }),
      JSON.stringify({ ...good, health: 0 }),
      JSON.stringify({ ...good, health: 2.5 }),
      JSON.stringify({ ...good, score: -1 }),
      JSON.stringify({ ...good, checkpoint: { ...good.checkpoint, room: "r9" } }),
      JSON.stringify({ ...good, checkpoint: { ...good.checkpoint, x: "10" } }),
      JSON.stringify({ ...good, inventory: { sword: 1 } }),
      JSON.stringify({ ...good, inventory: { coin: -3 } }),
      JSON.stringify({ ...good, flags: ["<script>"] }),
      JSON.stringify({ ...good, flags: "open:x" }),
      JSON.stringify({ ...good, visited: ["r1", "x"] }),
      JSON.stringify({ ...good, statues: { unknown: { x: 1, locked: false } } }),
      JSON.stringify({ ...good, selected: "map" }),
    ];
    for (const raw of bad) assert.equal(parseSaveData(raw as string), null, String(raw).slice(0, 60));
    assert.ok(parseSaveData(JSON.stringify(good)));
    assert.equal(parseSaveData(null), null);
  });

  test("컨트롤러: 방 이동·아이템 획득 때 저장하고, 클리어하면 저장을 지우고 기록을 남긴다", () => {
    const saves: SaveData[] = [];
    let cleared = 0;
    let records: [number, number] = [0, 0];
    const persistence: Persistence = {
      writeSave: (data) => saves.push(data),
      clearSave: () => cleared++,
      writeRecords: (score, time) => (records = [score, time]),
    };
    const controller = new LostRelicController(persistence, { bestScore: 0, bestTime: 0, hasSave: false });
    controller.newGame();
    assert.ok(saves.length >= 1, "saved on start");
    const before = saves.length;
    at(controller.state, "r8", 16, 14);
    calm(controller.state);
    controller.input.trigger("interact");
    for (let i = 0; i < 30; i++) controller.update(DT);
    assert.ok(saves.length > before, "saved after relic");
    at(controller.state, "r1", 2, 16);
    calm(controller.state);
    controller.state.time = 300.5;
    controller.input.trigger("interact");
    controller.update(DT * 2);
    assert.equal(controller.state.phase, "cleared");
    assert.equal(cleared, 1);
    assert.equal(records[0], controller.state.score);
    assert.equal(records[1], 300);
    const hud = controller.getHud();
    assert.ok(hud.newBestScore && hud.newBestTime);
    assert.equal(hud.stats?.rooms, 2); // r1(시작) + r8
  });
});

describe("처음부터 끝까지 클리어 (실제 시뮬레이션)", () => {
  test("탐색기가 찾은 경로를 하나의 게임 상태로 따라가 탈출한다", () => {
    const steps = winningStates(explore());
    const state = playing();
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1].state;
      const next = steps[i].state;
      if (next.room !== prev.room) {
        // 방 이동: 실제 물리로 출입구를 걸어서 지나간다.
        const exit = ROOMS[prev.room].exits.find((e) => e.room === next.room)!;
        assert.ok(walkOut(state, exit), `walk ${prev.room} → ${next.room}`);
        assert.equal(state.room, next.room);
      } else if (steps[i].label === "석상을 스위치 위로 밀기") {
        at(state, "r5", 10, 16);
        calm(state);
        for (let f = 0; f < 900 && !state.flags.has(FLAG.statuePuzzle); f++) step(state, { move: 1 });
        assert.ok(state.flags.has(FLAG.statuePuzzle));
      } else {
        // 상호작용: 탐색기가 찾은 위치에서 E
        at(state, next.room, next.node.col, next.node.row, next.node.climbing);
        calm(state);
        press(state, "interactPressed");
        for (const flag of next.flags) assert.ok(state.flags.has(flag), `${steps[i].label}: missing ${flag}`);
      }
    }
    // 마지막: 1번 방 탈출문 앞에서 E
    assert.equal(state.room, "r1");
    at(state, "r1", 2, 16);
    calm(state);
    if (state.phase === "playing") press(state, "interactPressed", 0);
    assert.equal(state.phase, "cleared");
    assert.equal(state.inventory.relic, 1);
    assert.equal(state.visited.size, 8);
  });
});
