import { GAME_CONFIG, TILE } from "../config";
import { ITEM_ORDER, ITEMS, withJosa } from "../items";
import { FLAG, ROOMS, START } from "../rooms";
import {
  ITEM_IDS,
  type Checkpoint,
  type Crusher,
  type Enemy,
  type ExitDef,
  type GameEvent,
  type GameState,
  type InputSnapshot,
  type ItemId,
  type Message,
  type ParsedRoom,
  type PlacedEntity,
  type Player,
  type Prompt,
  type RoomId,
  type Side,
} from "../types";
import { playerBox, stepPlayer, type Box, type PhysicsEnv } from "./physics";
import {
  chestFlag,
  entityCenter,
  entityCells,
  entrySpawn,
  getRoom,
  makeTileQuery,
  matchingExit,
  openFlag,
  searchedFlag,
} from "./world";

/*
 * Lost Relic 게임 규칙 (순수 TypeScript, Phaser·React·DOM 비의존).
 * stepGame()이 고정 시간 간격으로 상태를 진행하고, 소리·연출에 쓸 이벤트를 돌려준다.
 * 점수와 아이템은 상태가 바뀌는 순간(상자가 다 열림·비밀 발견·퍼즐 해결) 한 번만 지급하며, 플래그로 중복을 막는다.
 */

const { width: W, height: H } = GAME_CONFIG;
const PC = GAME_CONFIG.player;
const SCORE = GAME_CONFIG.score;
const TRAPS = GAME_CONFIG.traps;
const EN = GAME_CONFIG.enemies;

export const EMPTY_INPUT: InputSnapshot = {
  move: 0,
  vertical: 0,
  jumpHeld: false,
  jumpPressed: false,
  interactPressed: false,
  usePressed: false,
  cyclePressed: false,
};

function emptyInventory(): Record<ItemId, number> {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<ItemId, number>;
}

function makePlayer(x: number, y: number, facing: -1 | 1, climbing: boolean): Player {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    facing,
    onGround: !climbing,
    climbing,
    coyote: 0,
    jumpBuffer: 0,
    invincible: 0,
    stun: 0,
    busy: 0,
    stride: 0,
    anim: climbing ? "climb" : "idle",
    autoClimb: 0,
    autoTimer: 0,
  };
}

function startCheckpoint(): Checkpoint {
  return { room: START.room, x: START.col * TILE + TILE / 2, y: (START.row + 1) * TILE, climbing: false, facing: 1 };
}

/** 석상 초기 위치 (지도 기준) */
export function initialStatues(): GameState["statues"] {
  const statues: GameState["statues"] = {};
  for (const id of Object.keys(ROOMS) as RoomId[]) {
    for (const entity of getRoom(id).entities) {
      if (entity.def.kind === "statue") statues[entity.def.id] = { x: entity.col * TILE + TILE / 2, locked: false };
    }
  }
  return statues;
}

export function createGame(): GameState {
  const checkpoint = startCheckpoint();
  const state: GameState = {
    phase: "title",
    room: checkpoint.room,
    player: makePlayer(checkpoint.x, checkpoint.y, 1, false),
    health: GAME_CONFIG.maxHealth,
    inventory: emptyInventory(),
    selected: null,
    flags: new Set(),
    flagTimes: new Map(),
    visited: new Set([checkpoint.room]),
    statues: initialStatues(),
    score: 0,
    time: 0,
    roomTime: 0,
    safeTime: 0,
    transition: null,
    openingChest: null,
    enemies: [],
    crushers: [],
    crumbles: {},
    rocks: [],
    rockTimer: 0,
    rockIndex: 0,
    nextRockId: 1,
    message: null,
    nextMessageId: 1,
    prompt: null,
    checkpoint,
    endTimer: 0,
    spikeCycle: -1,
  };
  resetRoomRuntime(state);
  return state;
}

/** 새 게임: 모든 진행 상태를 처음으로 되돌린다. */
export function newGame(state: GameState): GameEvent[] {
  const fresh = createGame();
  Object.assign(state, fresh, { phase: "playing" });
  enterRoom(state, fresh.checkpoint.room, fresh.checkpoint);
  say(state, "고대 유적에 들어왔다. 깊은 곳에 잠든 유물을 찾아라!", "info");
  return [{ type: "start" }, { type: "roomEnter", room: state.room }];
}

export interface RestoreData {
  checkpoint: Checkpoint;
  health: number;
  inventory: Record<ItemId, number>;
  selected: ItemId | null;
  flags: string[];
  visited: RoomId[];
  statues: GameState["statues"];
  score: number;
  time: number;
}

/** 저장 데이터로 이어하기. 데이터 검증은 save.ts에서 끝낸 상태로 들어온다. */
export function continueGame(state: GameState, data: RestoreData): GameEvent[] {
  const fresh = createGame();
  Object.assign(state, fresh, {
    phase: "playing",
    health: data.health,
    inventory: { ...emptyInventory(), ...data.inventory },
    selected: data.selected,
    flags: new Set(data.flags),
    visited: new Set(data.visited),
    statues: { ...fresh.statues, ...data.statues },
    score: data.score,
    time: data.time,
  });
  enterRoom(state, data.checkpoint.room, data.checkpoint);
  say(state, `${ROOMS[state.room].name}에서 탐험을 이어간다.`, "info");
  return [{ type: "start" }, { type: "roomEnter", room: state.room }];
}

// ── 방 ──

function resetRoomRuntime(state: GameState) {
  const room = getRoom(state.room);
  state.enemies = [];
  state.crushers = [];
  state.crumbles = {};
  state.rocks = [];
  state.rockTimer = 0.8;
  state.rockIndex = 0;
  state.spikeCycle = -1;
  for (const crumble of room.crumbles) state.crumbles[crumble.id] = { mode: "intact", timer: 0 };
  for (const { def, col, row } of room.entities) {
    const floor = (row + 1) * TILE;
    if (def.kind === "snake" || def.kind === "guardian") {
      state.enemies.push({
        id: def.id,
        kind: def.kind,
        x: col * TILE + TILE / 2,
        y: floor,
        baseY: floor,
        minX: def.minCol * TILE + TILE / 2,
        maxX: def.maxCol * TILE + TILE / 2,
        dir: -1,
        mode: "patrol",
        timer: 0,
        phase: 0,
        amplitude: 0,
      });
    } else if (def.kind === "bat") {
      const y = row * TILE + TILE / 2;
      state.enemies.push({
        id: def.id,
        kind: "bat",
        x: col * TILE + TILE / 2,
        y,
        baseY: y,
        minX: def.minCol * TILE + TILE / 2,
        maxX: def.maxCol * TILE + TILE / 2,
        dir: 1,
        mode: "patrol",
        timer: 0,
        phase: 0,
        amplitude: def.amplitude,
      });
    } else if (def.kind === "crusher") {
      const topBottom = def.topRow * TILE + TRAPS.crusher.height;
      state.crushers.push({ id: def.id, x: (col + 1) * TILE, bottom: topBottom, topBottom, floorBottom: floor, mode: "up", timer: 0.6 });
    }
  }
}

function enterRoom(state: GameState, room: RoomId, spawn: { x: number; y: number; climbing: boolean; facing: -1 | 1 }, keepVx = 0) {
  state.room = room;
  state.visited.add(room);
  const player = makePlayer(spawn.x, spawn.y, spawn.facing, spawn.climbing);
  player.vx = keepVx;
  player.invincible = state.player.invincible;
  if (spawn.climbing) {
    // 위·아래 출입구로 들어오면 몸이 화면 안에 다 들어올 때까지 저절로 사다리를 탄다.
    player.autoClimb = spawn.y > H / 2 ? -1 : 1;
    player.autoTimer = 0.4;
  }
  state.player = player;
  state.roomTime = 0;
  state.safeTime = GAME_CONFIG.roomEntrySafeTime;
  state.openingChest = null;
  state.checkpoint = { room, x: spawn.x, y: spawn.y, climbing: spawn.climbing, facing: spawn.facing };
  resetRoomRuntime(state);
}

/** 테스트·디버깅용: 지정한 방·위치로 바로 옮긴다(방 상태는 새로 들어온 것처럼 초기화). */
export function teleport(state: GameState, room: RoomId, spawn: { x: number; y: number; climbing?: boolean; facing?: -1 | 1 }) {
  enterRoom(state, room, { x: spawn.x, y: spawn.y, climbing: spawn.climbing ?? false, facing: spawn.facing ?? 1 });
  state.transition = null;
}

// ── 메시지·플래그 ──

export function say(state: GameState, text: string, tone: Message["tone"] = "info", seconds: number = GAME_CONFIG.messageTime) {
  state.message = { id: state.nextMessageId++, text, timer: seconds, tone };
}

function setFlag(state: GameState, flag: string) {
  if (state.flags.has(flag)) return false;
  state.flags.add(flag);
  state.flagTimes.set(flag, state.time);
  return true;
}

function giveItem(state: GameState, item: ItemId, count: number) {
  state.inventory[item] += count;
  if (item === "coin") state.score += SCORE.coin * count;
  if (state.selected === null || state.inventory[state.selected] <= 0) state.selected = item === "coin" ? firstUsable(state) ?? item : item;
}

function takeItem(state: GameState, item: ItemId) {
  state.inventory[item] = Math.max(0, state.inventory[item] - 1);
  if (state.selected === item && state.inventory[item] === 0) state.selected = firstUsable(state) ?? firstOwned(state);
}

function firstUsable(state: GameState): ItemId | null {
  return ITEM_ORDER.find((id) => id !== "coin" && state.inventory[id] > 0) ?? null;
}

function firstOwned(state: GameState): ItemId | null {
  return ITEM_ORDER.find((id) => state.inventory[id] > 0) ?? null;
}

export function ownedItems(state: GameState): ItemId[] {
  return ITEM_ORDER.filter((id) => state.inventory[id] > 0);
}

/** Q: 다음 아이템 선택 */
export function cycleItem(state: GameState, dir: 1 | -1 = 1) {
  const owned = ownedItems(state);
  if (owned.length === 0) {
    state.selected = null;
    return;
  }
  const index = state.selected ? owned.indexOf(state.selected) : -1;
  state.selected = owned[(index + dir + owned.length) % owned.length];
}

export function selectItem(state: GameState, item: ItemId) {
  if (state.inventory[item] > 0) state.selected = item;
}

// ── 조사·상호작용 ──

type Action =
  | { type: "openChest" }
  | { type: "searchJar" }
  | { type: "read" }
  | { type: "unlockDoor" }
  | { type: "blastWall" }
  | { type: "revealHatch" }
  | { type: "revealSpot" }
  | { type: "takeRelic" }
  | { type: "escape" }
  | { type: "say"; text: string; deny?: boolean };

export interface Interaction {
  entity: PlacedEntity;
  prompt: string;
  /** E로 실행할 동작. 없으면 단순 힌트 */
  action: Action | null;
}

const has = (state: GameState, item: ItemId) => state.inventory[item] > 0;

function chestVisible(state: GameState, def: Extract<PlacedEntity["def"], { kind: "chest" }>) {
  return !def.hiddenUntil || state.flags.has(def.hiddenUntil);
}

function describe(state: GameState, entity: PlacedEntity): Interaction | null {
  const { def } = entity;
  const flags = state.flags;
  switch (def.kind) {
    case "chest":
      if (!chestVisible(state, def) || flags.has(chestFlag(def.id))) return null;
      if (def.lockedUntil && !flags.has(def.lockedUntil)) {
        return {
          entity,
          prompt: "봉인된 상자 — 장치가 잠그고 있다",
          action: { type: "say", text: "빛나는 문양이 상자를 봉인하고 있다. 방 안의 장치를 풀어야 할 것 같다.", deny: true },
        };
      }
      return { entity, prompt: "E: 상자 열기", action: { type: "openChest" } };
    case "jar":
      if (flags.has(searchedFlag(def.id))) return null;
      return { entity, prompt: "E: 항아리 조사", action: { type: "searchJar" } };
    case "tablet":
      return { entity, prompt: "E: 석판 읽기", action: { type: "read" } };
    case "lockedDoor": {
      if (flags.has(openFlag(def.id))) return null;
      const keyName = ITEMS[def.key].name;
      if (has(state, def.key)) return { entity, prompt: `E: 문 열기 (${keyName})`, action: { type: "unlockDoor" } };
      return {
        entity,
        prompt: `${withJosa(keyName, "이", "가")} 필요합니다`,
        action: { type: "say", text: `단단히 잠긴 문이다. ${withJosa(keyName, "이", "가")} 필요하다.`, deny: true },
      };
    }
    case "crackedWall":
      if (flags.has(openFlag(def.id))) return null;
      if (has(state, def.tool)) return { entity, prompt: `E: ${ITEMS[def.tool].name} 사용`, action: { type: "blastWall" } };
      return {
        entity,
        prompt: "벽에 수상한 균열이 있습니다",
        action: { type: "say", text: "벽에 깊은 균열이 있다. 폭약 같은 것이 있으면 무너뜨릴 수 있을 것 같다.", deny: true },
      };
    case "hatch":
      if (flags.has(def.flag)) return null;
      if (def.secret) return { entity, prompt: `E: 조사 — ${def.hint}`, action: { type: "revealHatch" } };
      return { entity, prompt: def.hint, action: null };
    case "secretSpot":
      if (flags.has(def.reveals)) return null;
      return { entity, prompt: "E: 조사 — 벽돌 하나가 튀어나와 있다", action: { type: "revealSpot" } };
    case "statue":
      if (state.statues[def.id]?.locked) return null;
      return { entity, prompt: "← → 로 석상 밀기", action: null };
    case "plate":
      if (flags.has(def.flag)) return null;
      return { entity, prompt: "빛나는 판 — 무거운 것을 올려야 할 것 같다", action: null };
    case "altar":
      if (flags.has(FLAG.relic)) return null;
      return { entity, prompt: "E: 유물 획득", action: { type: "takeRelic" } };
    case "exitDoor":
      if (has(state, "relic")) return { entity, prompt: "E: 유적 탈출하기", action: { type: "escape" } };
      return {
        entity,
        prompt: "탈출문 — 유물을 찾아야 합니다",
        action: { type: "say", text: "육중한 탈출문이 닫혀 있다. 유적 깊은 곳의 유물을 찾아 돌아오자.", deny: true },
      };
    default:
      return null;
  }
}

/** 오브젝트가 조사 범위 안에 있는지. 석상·스위치는 현재 석상 위치를 쓴다. */
function entityAnchor(state: GameState, entity: PlacedEntity): { x: number; top: number; bottom: number } {
  const cells = entityCells(entity);
  const top = Math.min(...cells.map((c) => c.row)) * TILE;
  const bottom = (entity.row + 1) * TILE;
  if (entity.def.kind === "statue") {
    const statue = state.statues[entity.def.id];
    return { x: statue?.x ?? entity.col * TILE + TILE / 2, top: bottom - GAME_CONFIG.statue.height, bottom };
  }
  return { x: entity.col * TILE + TILE / 2, top, bottom };
}

/** 지금 플레이어 앞의 상호작용 대상 (E로 실행할 수 있는 것을 우선) */
export function findInteraction(state: GameState): Interaction | null {
  const room = getRoom(state.room);
  const p = state.player;
  const body = playerBox(p);
  let best: { interaction: Interaction; score: number } | null = null;
  for (const entity of room.entities) {
    const interaction = describe(state, entity);
    if (!interaction) continue;
    const anchor = entityAnchor(state, entity);
    const range = entity.def.kind === "statue" ? PC.interactRange + 4 : PC.interactRange;
    const dx = Math.abs(p.x - anchor.x);
    if (dx > range) continue;
    if (body.top > anchor.bottom + 6 || body.bottom < anchor.top - 6) continue;
    const score = dx + (interaction.action ? 0 : 100);
    if (!best || score < best.score) best = { interaction, score };
  }
  return best?.interaction ?? null;
}

function interact(state: GameState, events: GameEvent[]) {
  const target = findInteraction(state);
  if (!target?.action) return;
  const { entity, action } = target;
  const def = entity.def;
  const center = entityCenter(entity);
  const p = state.player;
  p.facing = center.x >= p.x ? 1 : -1;

  switch (action.type) {
    case "openChest":
      if (def.kind !== "chest" || !setFlag(state, chestFlag(def.id))) return;
      state.openingChest = { id: def.id, timer: GAME_CONFIG.chestOpenTime };
      p.busy = GAME_CONFIG.chestOpenTime + 0.1;
      p.vx = 0;
      events.push({ type: "chestOpen", id: def.id });
      return;
    case "searchJar": {
      if (def.kind !== "jar" || !setFlag(state, searchedFlag(def.id))) return;
      p.busy = PC.interactTime;
      if (def.item) {
        giveItem(state, def.item, 1);
        say(state, `항아리 속에서 ${withJosa(ITEMS[def.item].name, "을", "를")} 발견했다!`, "item");
        events.push({ type: "itemFound", item: def.item, count: 1, x: center.x, y: center.y - 10 });
      } else {
        say(state, "빈 항아리다. 먼지만 가득하다.");
        events.push({ type: "denied" });
      }
      return;
    }
    case "read":
      if (def.kind !== "tablet") return;
      p.busy = PC.interactTime;
      say(state, def.text, "info", 5);
      events.push({ type: "message", text: def.text });
      return;
    case "unlockDoor":
      if (def.kind !== "lockedDoor") return;
      unlockDoor(state, entity, events);
      return;
    case "blastWall":
      if (def.kind !== "crackedWall") return;
      blastWall(state, entity, events);
      return;
    case "revealHatch":
      if (def.kind !== "hatch" || !setFlag(state, def.flag)) return;
      p.busy = PC.interactTime;
      state.score += SCORE.secret;
      say(state, "헐거운 석판을 들어 올리자 아래로 이어진 비밀 사다리가 나타났다! (+500)", "secret");
      events.push({ type: "secretFound", id: def.id, x: center.x, y: center.y });
      return;
    case "revealSpot":
      if (def.kind !== "secretSpot" || !setFlag(state, def.reveals)) return;
      p.busy = PC.interactTime;
      state.score += SCORE.secret;
      say(state, `${def.text} (+500)`, "secret");
      events.push({ type: "secretFound", id: def.id, x: center.x, y: center.y });
      return;
    case "takeRelic":
      takeRelic(state, entity, events);
      return;
    case "escape":
      escape(state, events);
      return;
    case "say":
      say(state, action.text, action.deny ? "warn" : "info");
      events.push(action.deny ? { type: "denied" } : { type: "message", text: action.text });
      return;
  }
}

function unlockDoor(state: GameState, entity: PlacedEntity, events: GameEvent[]) {
  const def = entity.def;
  if (def.kind !== "lockedDoor" || !has(state, def.key) || !setFlag(state, openFlag(def.id))) return;
  takeItem(state, def.key);
  state.player.busy = PC.interactTime;
  say(state, `${withJosa(ITEMS[def.key].name, "으로", "로")} 문을 열었다!`, "item");
  events.push({ type: "doorUnlock", id: def.id }, { type: "doorOpen", id: def.id });
}

function blastWall(state: GameState, entity: PlacedEntity, events: GameEvent[]) {
  const def = entity.def;
  if (def.kind !== "crackedWall" || !has(state, def.tool) || !setFlag(state, openFlag(def.id))) return;
  takeItem(state, def.tool);
  state.player.busy = PC.interactTime;
  state.score += SCORE.secret;
  const center = entityCenter(entity);
  say(state, "쾅! 균열 벽이 무너지고 숨겨진 통로가 나타났다! (+500)", "secret");
  events.push({ type: "toolUse", id: def.id, x: center.x, y: center.y }, { type: "secretFound", id: def.id, x: center.x, y: center.y });
}

function takeRelic(state: GameState, entity: PlacedEntity, events: GameEvent[]) {
  if (!setFlag(state, FLAG.relic)) return;
  giveItem(state, "relic", 1);
  state.selected = "relic";
  state.score += SCORE.relic;
  state.player.busy = 0.6;
  state.rockTimer = 1.6;
  const center = entityCenter(entity);
  say(state, "고대 유물 '태양의 눈'을 손에 넣었다! 천장이 무너진다 — 입구로 돌아가 탈출하자! (+1,000)", "secret", 4.5);
  events.push({ type: "relicFound", x: center.x, y: center.y - 16 });
  // 유물을 들면 8번 방 바닥과 5번 방 천장의 격자가 함께 열려 지름길이 생긴다.
  for (const id of ["r8-grate", "r5-grate"]) events.push({ type: "doorOpen", id });
}

function escape(state: GameState, events: GameEvent[]) {
  if (!has(state, "relic") || state.phase !== "playing") return;
  state.score += SCORE.clear;
  state.phase = "cleared";
  state.prompt = null;
  state.message = null;
  events.push({ type: "gameClear" });
}

/** F: 선택한 아이템 사용. 맞지 않는 장소에서는 소모하지 않는다. */
export function applySelectedItem(state: GameState, events: GameEvent[]) {
  const item = state.selected;
  if (!item || state.inventory[item] <= 0) {
    say(state, "선택한 아이템이 없다. 상자와 주변을 조사해 보자.");
    events.push({ type: "denied" });
    return;
  }
  const near = findInteraction(state)?.entity;
  switch (item) {
    case "potion":
      if (state.health >= GAME_CONFIG.maxHealth) {
        say(state, "체력이 이미 가득하다. 물약은 아껴 두자.");
        events.push({ type: "denied" });
        return;
      }
      takeItem(state, "potion");
      state.health += 1;
      say(state, "회복 물약을 마셨다. 체력 +1", "item");
      events.push({ type: "heal", health: state.health });
      return;
    case "bronzeKey":
    case "silverKey": {
      const door = near?.def.kind === "lockedDoor" && near.def.key === item ? near : undefined;
      if (door) unlockDoor(state, door, events);
      else {
        say(state, `여기서는 ${withJosa(ITEMS[item].name, "을", "를")} 쓸 수 없다. 맞는 문 앞에서 사용하자.`);
        events.push({ type: "denied" });
      }
      return;
    }
    case "blastPowder": {
      const wall = near?.def.kind === "crackedWall" ? near : undefined;
      if (wall) blastWall(state, wall, events);
      else {
        say(state, "여기서 폭약을 쓰면 위험하다. 금이 간 벽을 찾아보자.");
        events.push({ type: "denied" });
      }
      return;
    }
    case "relic":
      say(state, state.room === "r1" ? "탈출문 앞에서 E 키로 탈출하자!" : "유물이 은은하게 빛난다. 1번 방 입구의 탈출문으로 돌아가자!");
      return;
    case "coin":
      say(state, `금화 ${state.inventory.coin}개를 모았다. (개당 100점)`);
      return;
  }
}

// ── 피해 ──

function hurt(state: GameState, sourceX: number, events: GameEvent[]) {
  const p = state.player;
  if (state.phase !== "playing" || state.safeTime > 0 || p.invincible > 0) return;
  state.health -= 1;
  p.invincible = PC.hurtInvincibility;
  p.stun = PC.hurtStun;
  p.climbing = false;
  p.busy = 0;
  const dir = p.x >= sourceX ? 1 : -1;
  p.vx = dir * PC.knockbackX;
  p.vy = -PC.knockbackY;
  p.onGround = false;
  state.openingChest = finishChestEarly(state, events);
  events.push({ type: "playerHit", health: state.health });
  if (state.health <= 0) {
    state.phase = "dying";
    state.endTimer = GAME_CONFIG.deathDelay;
    state.prompt = null;
  }
}

/** 상자를 여는 중에 맞아도 아이템은 그대로 받는다(진행 아이템 보호). */
function finishChestEarly(state: GameState, events: GameEvent[]): null {
  if (state.openingChest) grantChest(state, state.openingChest.id, events);
  return null;
}

function grantChest(state: GameState, id: string, events: GameEvent[]) {
  const entity = getRoom(state.room).entities.find((e) => e.def.id === id);
  if (!entity || entity.def.kind !== "chest") return;
  const { item } = entity.def;
  const count = entity.def.count ?? 1;
  giveItem(state, item, count);
  const center = entityCenter(entity);
  const name = ITEMS[item].name;
  say(state, count > 1 ? `${name} ${count}개를 찾았다! (+${SCORE.coin * count})` : `${withJosa(name, "을", "를")} 찾았다!`, "item");
  events.push({ type: "itemFound", item, count, x: center.x, y: center.y - 12 });
}

// ── 함정·적 ──

export function spikePhase(roomTime: number, group: number): { mode: "hidden" | "warn" | "up"; cycle: number } {
  const period = TRAPS.spikeHidden + TRAPS.spikeWarn + TRAPS.spikeUp;
  const t = roomTime + group * TRAPS.spikeGroupOffset;
  const cycle = Math.floor(t / period);
  const m = t - cycle * period;
  if (m < TRAPS.spikeHidden) return { mode: "hidden", cycle };
  if (m < TRAPS.spikeHidden + TRAPS.spikeWarn) return { mode: "warn", cycle };
  return { mode: "up", cycle };
}

function boxesOverlap(a: Box, b: Box) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function enemyBox(enemy: Enemy): Box {
  const stats = EN[enemy.kind];
  const halfW = stats.width / 2;
  if (enemy.kind === "bat") return { left: enemy.x - halfW, right: enemy.x + halfW, top: enemy.y - stats.height / 2, bottom: enemy.y + stats.height / 2 };
  return { left: enemy.x - halfW, right: enemy.x + halfW, top: enemy.y - stats.height, bottom: enemy.y };
}

export function crusherBox(crusher: Crusher): Box {
  const half = TRAPS.crusher.width / 2;
  return { left: crusher.x - half, right: crusher.x + half, top: crusher.bottom - TRAPS.crusher.height, bottom: crusher.bottom };
}

function updateEnemies(state: GameState, dt: number, events: GameEvent[]) {
  const p = state.player;
  const body = playerBox(p);
  for (const enemy of state.enemies) {
    switch (enemy.kind) {
      case "snake":
        if (enemy.mode === "rest") {
          enemy.timer -= dt;
          if (enemy.timer <= 0) {
            enemy.mode = "patrol";
            enemy.dir = enemy.dir === 1 ? -1 : 1;
          }
        } else {
          enemy.x += enemy.dir * EN.snake.speed * dt;
          if (enemy.x <= enemy.minX || enemy.x >= enemy.maxX) {
            enemy.x = Math.min(Math.max(enemy.x, enemy.minX), enemy.maxX);
            enemy.mode = "rest";
            enemy.timer = EN.snake.restTime;
          }
        }
        enemy.phase += dt;
        break;
      case "bat":
        enemy.x += enemy.dir * EN.bat.speed * dt;
        if (enemy.x <= enemy.minX) enemy.dir = 1;
        if (enemy.x >= enemy.maxX) enemy.dir = -1;
        enemy.x = Math.min(Math.max(enemy.x, enemy.minX), enemy.maxX);
        enemy.phase += EN.bat.waveSpeed * dt;
        enemy.y = enemy.baseY + Math.sin(enemy.phase) * enemy.amplitude;
        break;
      case "guardian":
        updateGuardian(state, enemy, dt);
        break;
    }
    if (boxesOverlap(body, enemyBox(enemy))) hurt(state, enemy.x, events);
  }
}

function updateGuardian(state: GameState, g: Enemy, dt: number) {
  const G = EN.guardian;
  const p = state.player;
  const dx = p.x - g.x;
  const sameFloor = Math.abs(p.y - g.y) < 24;
  g.phase += dt;
  switch (g.mode) {
    case "patrol": {
      g.x += g.dir * G.speed * dt;
      if (g.x <= g.minX || g.x >= g.maxX) {
        g.x = Math.min(Math.max(g.x, g.minX), g.maxX);
        g.mode = "rest";
        g.timer = 0.7;
      }
      const inFront = dx * g.dir > 0 && Math.abs(dx) < G.sightRange;
      if (state.safeTime <= 0 && sameFloor && inFront) {
        g.mode = "alert";
        g.timer = G.alertTime;
      }
      break;
    }
    case "rest":
      g.timer -= dt;
      if (g.timer <= 0) {
        g.mode = "patrol";
        g.dir = g.x >= g.maxX ? -1 : g.x <= g.minX ? 1 : g.dir;
      }
      break;
    case "alert":
      g.timer -= dt;
      g.dir = dx >= 0 ? 1 : -1;
      if (g.timer <= 0) g.mode = "chase";
      break;
    case "chase":
      g.dir = dx >= 0 ? 1 : -1;
      if (Math.abs(dx) > 4) g.x += g.dir * G.chaseSpeed * dt;
      g.x = Math.min(Math.max(g.x, g.minX), g.maxX);
      if (!sameFloor || Math.abs(dx) > G.loseRange) {
        g.mode = "rest";
        g.timer = 0.9;
      }
      break;
  }
}

function updateCrushers(state: GameState, dt: number, events: GameEvent[]) {
  const C = TRAPS.crusher;
  const body = playerBox(state.player);
  for (const c of state.crushers) {
    switch (c.mode) {
      case "up":
        c.timer -= dt;
        if (c.timer <= 0) {
          c.mode = "shake";
          c.timer = C.shake;
          if (Math.abs(state.player.x - c.x) < 140) events.push({ type: "trapTrigger", kind: "crusher" });
        }
        break;
      case "shake":
        c.timer -= dt;
        if (c.timer <= 0) c.mode = "drop";
        break;
      case "drop":
        c.bottom = Math.min(c.floorBottom, c.bottom + C.dropSpeed * dt);
        if (c.bottom >= c.floorBottom) {
          c.mode = "down";
          c.timer = C.downHold;
          events.push({ type: "rockLanded", x: c.x });
        }
        break;
      case "down":
        c.timer -= dt;
        if (c.timer <= 0) c.mode = "rise";
        break;
      case "rise":
        c.bottom = Math.max(c.topBottom, c.bottom - C.riseSpeed * dt);
        if (c.bottom <= c.topBottom) {
          c.mode = "up";
          c.timer = C.upHold;
        }
        break;
    }
    if ((c.mode === "drop" || c.mode === "down") && boxesOverlap(body, crusherBox(c))) hurt(state, c.x, events);
  }
}

function updateRocks(state: GameState, dt: number, events: GameEvent[]) {
  const def = ROOMS[state.room];
  if (!def.rockfall || !state.flags.has(FLAG.relic)) return;
  const R = TRAPS.rock;
  state.rockTimer -= dt;
  if (state.rockTimer <= 0) {
    const col = def.rockfall[state.rockIndex % def.rockfall.length];
    state.rockIndex++;
    state.rockTimer = R.interval;
    state.rocks.push({ id: state.nextRockId++, x: col * TILE + TILE / 2, y: R.startY, vy: 0, warn: R.warn });
    if (state.rockIndex === 1) events.push({ type: "trapTrigger", kind: "rock" });
  }
  const query = makeTileQuery(getRoom(state.room), state.flags);
  const body = playerBox(state.player);
  state.rocks = state.rocks.filter((rock) => {
    if (rock.warn > 0) {
      rock.warn -= dt;
      return true;
    }
    rock.vy = Math.min(rock.vy + R.gravity * dt, R.maxSpeed);
    rock.y += rock.vy * dt;
    const half = R.size / 2;
    const box = { left: rock.x - half, right: rock.x + half, top: rock.y - half, bottom: rock.y + half };
    if (boxesOverlap(body, box)) {
      hurt(state, rock.x, events);
      events.push({ type: "rockLanded", x: rock.x });
      return false;
    }
    const row = Math.floor((rock.y + half) / TILE);
    const tile = query(Math.floor(rock.x / TILE), row);
    if (tile === "solid" || tile === "platform" || row >= GAME_CONFIG.rows) {
      events.push({ type: "rockLanded", x: rock.x });
      return false;
    }
    return true;
  });
}

function updateSpikes(room: ParsedRoom, state: GameState, events: GameEvent[]) {
  if (room.spikes.length === 0) return;
  const body = playerBox(state.player);
  for (const spike of room.spikes) {
    const phase = spikePhase(state.roomTime, spike.group);
    if (phase.mode === "warn" && phase.cycle !== state.spikeCycle && Math.abs(state.player.x - spike.col * TILE) < 6 * TILE) {
      state.spikeCycle = phase.cycle;
      events.push({ type: "trapTrigger", kind: "spikes" });
    }
    if (phase.mode !== "up") continue;
    const box = { left: spike.col * TILE + 3, right: spike.col * TILE + TILE - 3, top: spike.row * TILE + TILE - 10, bottom: spike.row * TILE + TILE };
    if (boxesOverlap(body, box)) hurt(state, spike.col * TILE + TILE / 2, events);
  }
}

function updateCrumbles(room: ParsedRoom, state: GameState, dt: number, events: GameEvent[]) {
  const p = state.player;
  const body = playerBox(p);
  for (const tile of room.crumbles) {
    const crumble = state.crumbles[tile.id];
    if (!crumble) continue;
    const left = tile.col * TILE;
    const top = tile.row * TILE;
    switch (crumble.mode) {
      case "intact": {
        const standing = p.onGround && Math.abs(p.y - top) < 0.5 && body.right > left + 1 && body.left < left + TILE - 1;
        if (standing) {
          crumble.mode = "shaking";
          crumble.timer = TRAPS.crumbleDelay;
          events.push({ type: "trapTrigger", kind: "crumble" });
        }
        break;
      }
      case "shaking":
        crumble.timer -= dt;
        if (crumble.timer <= 0) {
          crumble.mode = "fallen";
          crumble.timer = TRAPS.crumbleRespawn;
        }
        break;
      case "fallen": {
        crumble.timer -= dt;
        const blocked = body.right > left && body.left < left + TILE && body.bottom > top && body.top < top + TILE;
        if (crumble.timer <= 0 && !blocked) crumble.mode = "intact";
        break;
      }
    }
  }
}

function updateCoins(room: ParsedRoom, state: GameState, events: GameEvent[]) {
  const body = playerBox(state.player);
  for (const entity of room.entities) {
    if (entity.def.kind !== "coin") continue;
    const flag = `coin:${entity.def.id}`;
    if (state.flags.has(flag)) continue;
    const x = entity.col * TILE + TILE / 2;
    const y = entity.row * TILE + TILE / 2;
    if (!boxesOverlap(body, { left: x - 7, right: x + 7, top: y - 7, bottom: y + 7 })) continue;
    setFlag(state, flag);
    giveItem(state, "coin", 1);
    events.push({ type: "coin", x, y });
  }
}

function updatePlates(room: ParsedRoom, state: GameState, events: GameEvent[]) {
  for (const entity of room.entities) {
    const def = entity.def;
    if (def.kind !== "plate" || state.flags.has(def.flag)) continue;
    const statue = state.statues[def.statue];
    const plateX = entity.col * TILE + TILE / 2;
    if (!statue || Math.abs(statue.x - plateX) > GAME_CONFIG.statue.plateSnap) continue;
    statue.x = plateX;
    statue.locked = true;
    setFlag(state, def.flag);
    state.score += SCORE.puzzle;
    say(state, "철컥! 석상이 판에 맞물렸다. 상자의 봉인이 풀리고, 멀리서 석문이 열리는 소리가 들린다. (+300)", "secret", 4.5);
    events.push({ type: "switchActivate", id: def.id }, { type: "doorOpen", id: "r4-stone-gate" });
  }
}

// ── 출입구 ──

function checkExits(state: GameState, events: GameEvent[]) {
  const p = state.player;
  const center = p.y - PC.height / 2;
  let side: Side | null = null;
  if (p.x < 2) side = "left";
  else if (p.x > W - 2) side = "right";
  else if (center < 0) side = "up";
  else if (center > H) side = "down";
  if (!side) return;
  const def = ROOMS[state.room];
  const feetRow = Math.floor((p.y - 1) / TILE);
  const col = Math.floor(p.x / TILE);
  const exit = def.exits.find((e) => e.side === side && (side === "left" || side === "right" ? feetRow >= e.from && feetRow <= e.to : col >= e.from && col <= e.to));
  if (!exit) {
    // 지도상 출입구가 아닌 곳: 화면 밖으로 나가지 않게 막는다.
    p.x = Math.min(Math.max(p.x, 2), W - 2);
    return;
  }
  beginTransition(state, exit, events);
}

function beginTransition(state: GameState, exit: ExitDef, events: GameEvent[]) {
  const entry = matchingExit(state.room, exit);
  if (!entry) throw new Error(`Exit ${state.room} → ${exit.room} has no matching entrance`);
  state.transition = { stage: "out", timer: GAME_CONFIG.transition.fadeOut, to: exit.room, entry };
  state.prompt = null;
  events.push({ type: "roomTransition", from: state.room, to: exit.room });
}

function stepTransition(state: GameState, dt: number, events: GameEvent[]) {
  const t = state.transition;
  if (!t) return;
  t.timer -= dt;
  if (t.timer > 0) return;
  if (t.stage === "out") {
    const keepVx = t.entry.side === "left" || t.entry.side === "right" ? state.player.vx : 0;
    enterRoom(state, t.to, entrySpawn(t.entry), keepVx);
    events.push({ type: "roomEnter", room: t.to });
    state.transition = { ...t, stage: "in", timer: GAME_CONFIG.transition.fadeIn };
  } else {
    state.transition = null;
  }
}

// ── 메인 루프 ──

function physicsEnv(state: GameState, room: ParsedRoom): PhysicsEnv {
  const statues = room.entities.filter((e) => e.def.kind === "statue");
  const S = GAME_CONFIG.statue;
  const obstacles: Box[] = statues.map((entity) => {
    const statue = state.statues[entity.def.id];
    const floor = (entity.row + 1) * TILE;
    return { left: statue.x - S.width / 2, right: statue.x + S.width / 2, top: floor - S.height, bottom: floor };
  });
  return {
    tile: makeTileQuery(room, state.flags, (id) => state.crumbles[id]?.mode !== "fallen"),
    obstacles,
    push: (index, dx) => {
      const entity = statues[index];
      if (!entity || entity.def.kind !== "statue") return 0;
      const statue = state.statues[entity.def.id];
      if (statue.locked) return 0;
      const limit = S.pushSpeed / 60;
      const step = Math.min(Math.max(dx, -limit), limit);
      const minX = entity.def.minCol * TILE + TILE / 2;
      const maxX = entity.def.maxCol * TILE + TILE / 2;
      const next = Math.min(Math.max(statue.x + step, minX), maxX);
      const moved = next - statue.x;
      statue.x = next;
      return moved;
    },
  };
}

function updateAnim(p: Player, dt: number) {
  if (p.stun > 0) p.anim = "hurt";
  else if (p.busy > 0) p.anim = "interact";
  else if (p.climbing) {
    p.anim = "climb";
    p.stride += Math.abs(p.vy) * dt;
  } else if (!p.onGround) p.anim = p.vy < 0 ? "jump" : "fall";
  else if (Math.abs(p.vx) > 8) {
    p.anim = "walk";
    p.stride += Math.abs(p.vx) * dt;
  } else p.anim = "idle";
}

/** 한 스텝(고정 dt) 진행. 이번 스텝에 일어난 이벤트를 돌려준다. */
export function stepGame(state: GameState, input: InputSnapshot, dt: number): GameEvent[] {
  const events: GameEvent[] = [];

  if (state.phase === "dying") {
    state.endTimer -= dt;
    // 쓰러지는 동안에도 몸은 바닥까지 떨어진다.
    const room = getRoom(state.room);
    stepPlayer(state.player, EMPTY_INPUT, physicsEnv(state, room), dt, false);
    state.player.anim = "hurt";
    if (state.endTimer <= 0) {
      state.phase = "gameOver";
      events.push({ type: "gameOver" });
    }
    return events;
  }
  if (state.phase !== "playing") return events;

  if (state.message) {
    state.message.timer -= dt;
    if (state.message.timer <= 0) state.message = null;
  }

  if (state.transition?.stage === "out") {
    stepTransition(state, dt, events);
    return events;
  }
  if (state.transition) stepTransition(state, dt, events);

  state.time += dt;
  state.roomTime += dt;
  state.safeTime = Math.max(0, state.safeTime - dt);
  const room = getRoom(state.room);
  const p = state.player;
  p.invincible = Math.max(0, p.invincible - dt);
  p.stun = Math.max(0, p.stun - dt);
  p.busy = Math.max(0, p.busy - dt);

  if (state.openingChest) {
    state.openingChest.timer -= dt;
    if (state.openingChest.timer <= 0) {
      grantChest(state, state.openingChest.id, events);
      state.openingChest = null;
    }
  }

  const controllable = p.stun <= 0 && p.busy <= 0;
  let move = input;
  if (p.autoTimer > 0) {
    p.autoTimer -= dt;
    if (input.vertical === 0 && p.climbing) move = { ...input, vertical: p.autoClimb };
  }
  if (controllable) {
    if (input.interactPressed) interact(state, events);
    else if (input.usePressed) applySelectedItem(state, events);
    if (input.cyclePressed) cycleItem(state);
  }
  if (state.phase !== "playing") return events;

  const env = physicsEnv(state, room);
  stepPlayer(p, move, env, dt, controllable && p.busy <= 0);
  updateCrumbles(room, state, dt, events);
  updatePlates(room, state, events);
  updateCoins(room, state, events);
  updateSpikes(room, state, events);
  updateEnemies(state, dt, events);
  updateCrushers(state, dt, events);
  updateRocks(state, dt, events);
  updateAnim(p, dt);
  if (state.phase === "playing" && !state.transition) checkExits(state, events);

  if (state.phase === "playing" && !state.transition) {
    const interaction = p.busy > 0 ? null : findInteraction(state);
    state.prompt = interaction ? promptFor(state, interaction) : null;
  }
  return events;
}

function promptFor(state: GameState, interaction: Interaction): Prompt {
  const anchor = entityAnchor(state, interaction.entity);
  return { text: interaction.prompt, x: anchor.x, y: anchor.top - 4, actionable: interaction.action !== null };
}

// ── 일시정지·인벤토리 ──

export function togglePause(state: GameState) {
  if (state.phase === "playing") state.phase = "paused";
  else if (state.phase === "paused") state.phase = "playing";
}

export function pause(state: GameState) {
  if (state.phase === "playing" || state.phase === "inventory") state.phase = "paused";
}

export function toggleInventory(state: GameState) {
  if (state.phase === "playing") state.phase = "inventory";
  else if (state.phase === "inventory") state.phase = "playing";
}

/** 클리어 결과 요약 */
export function clearStats(state: GameState) {
  const totalChests = (Object.keys(ROOMS) as RoomId[]).reduce(
    (sum, id) => sum + getRoom(id).entities.filter((e) => e.def.kind === "chest").length,
    0,
  );
  const opened = [...state.flags].filter((flag) => flag.startsWith("chest:")).length;
  return {
    score: state.score,
    time: state.time,
    chests: opened,
    totalChests,
    rooms: state.visited.size,
    totalRooms: Object.keys(ROOMS).length,
    health: state.health,
  };
}
