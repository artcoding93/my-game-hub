import { GAME_CONFIG, TILE } from "../config";
import { ITEMS } from "../items";
import { ROOMS, START } from "../rooms";
import { type GameState, type ItemId, type PlacedEntity, type RoomId } from "../types";
import { canTouch, entryNode, nodeKey, reachable, reachableExits, type NavNode } from "./navigation";
import { createGame, EMPTY_INPUT, stepGame } from "./simulation";
import { getRoom, makeTileQuery, matchingExit } from "./world";

/*
 * 진행 가능성 검증기 (자동화 테스트 전용, 게임 실행에는 쓰지 않는다).
 *
 * 추상 상태 = (방, 위치, 진행 플래그, 인벤토리). 위치 사이의 이동은 navigation.ts의 BFS로,
 * 상자 열기·문 열기 같은 상호작용은 실제 시뮬레이션(simulation.ts의 stepGame + E 입력)으로 계산한다.
 * 그래서 지도 문자열·출입구·열쇠/도구 규칙 중 하나라도 어긋나면 테스트가 실패한다.
 *
 * 탐색 대상은 진행에 영향을 주는 상호작용만이다(필수 아이템 상자·문·비밀·퍼즐·유물·탈출).
 * 금화·물약 같은 선택 보상은 상태 수를 폭발시키므로 따로 "도달 가능한지"만 확인한다.
 */

export interface AbstractState {
  room: RoomId;
  node: NavNode;
  flags: string[];
  inventory: Partial<Record<ItemId, number>>;
  statueSolved: boolean;
}

export interface ExploreResult {
  states: Map<string, AbstractState>;
  edges: Map<string, Set<string>>;
  winning: Set<string>;
  /** 모든 상태에서 방문한 방 */
  rooms: Set<RoomId>;
  /** 어떤 상태에서든 손이 닿은(조사 범위에 들어간) 오브젝트 id */
  touched: Set<string>;
  /** 어떤 상태에서든 열 수 있었던(보이고 잠기지 않은) 상자 id */
  openableChests: Set<string>;
  /** 각 동작이 처음 일어난 순서 기록 (첫 클리어 경로 재구성용) */
  parent: Map<string, { from: string; label: string }>;
}

const WIN = "WIN";

function stateKey(s: AbstractState) {
  const inv = Object.entries(s.inventory)
    .filter(([, n]) => (n ?? 0) > 0)
    .sort()
    .map(([id, n]) => `${id}${n}`)
    .join("");
  return `${s.room}|${nodeKey(s.node)}|${[...s.flags].sort().join(",")}|${inv}|${s.statueSolved ? 1 : 0}`;
}

function isProgressEntity(entity: PlacedEntity): boolean {
  const def = entity.def;
  switch (def.kind) {
    case "chest":
      return ITEMS[def.item].essential;
    case "lockedDoor":
    case "crackedWall":
    case "secretSpot":
    case "altar":
    case "exitDoor":
      return true;
    case "hatch":
      return Boolean(def.secret);
    default:
      return false;
  }
}

/** 추상 상태를 실제 게임 상태로 만든다(적·함정 없음, 피해 없음). */
function toGameState(s: AbstractState): GameState {
  const game = createGame();
  game.phase = "playing";
  game.room = s.room;
  game.flags = new Set(s.flags);
  for (const [id, n] of Object.entries(s.inventory)) game.inventory[id as ItemId] = n ?? 0;
  game.player.x = s.node.col * TILE + TILE / 2;
  game.player.y = (s.node.row + 1) * TILE;
  game.player.climbing = s.node.climbing;
  game.player.onGround = !s.node.climbing;
  game.enemies = [];
  game.crushers = [];
  game.rocks = [];
  game.crumbles = {};
  game.safeTime = 1e9;
  game.visited = new Set([s.room]);
  if (s.statueSolved) {
    for (const statue of Object.values(game.statues)) statue.locked = true;
  }
  return game;
}

function fromGameState(game: GameState, node: NavNode, statueSolved: boolean): AbstractState {
  const keep = [...game.flags].filter((f) => /^(open|secret|puzzle|relic|chest):/.test(f));
  const inventory: AbstractState["inventory"] = {};
  for (const id of Object.keys(game.inventory) as ItemId[]) {
    if (id !== "coin" && id !== "potion" && game.inventory[id] > 0) inventory[id] = game.inventory[id];
  }
  return { room: game.room, node, flags: keep, inventory, statueSolved };
}

/** E를 눌러 상호작용하고, 상자가 다 열릴 때까지 시간을 흘린다. */
function simulateInteract(s: AbstractState): GameState {
  const game = toGameState(s);
  stepGame(game, { ...EMPTY_INPUT, interactPressed: true }, 1 / 60);
  for (let i = 0; i < Math.ceil((GAME_CONFIG.chestOpenTime + 0.2) * 60) && game.phase === "playing"; i++) {
    stepGame(game, EMPTY_INPUT, 1 / 60);
  }
  return game;
}

/** 석상을 스위치 위로 옮긴 결과 (석상 밀기 자체의 물리는 simulation.test.ts가 검증) */
function simulatePuzzle(s: AbstractState, plate: PlacedEntity, statueId: string): GameState {
  const game = toGameState(s);
  game.statues[statueId] = { x: plate.col * TILE + TILE / 2, locked: false };
  stepGame(game, EMPTY_INPUT, 1 / 60);
  return game;
}

export function explore(): ExploreResult {
  const startNode: NavNode = { col: START.col, row: START.row, climbing: false };
  const start: AbstractState = { room: START.room, node: startNode, flags: [], inventory: {}, statueSolved: false };
  const states = new Map<string, AbstractState>();
  const edges = new Map<string, Set<string>>();
  const parent = new Map<string, { from: string; label: string }>();
  const rooms = new Set<RoomId>();
  const touched = new Set<string>();
  const openableChests = new Set<string>();
  const queue: string[] = [];

  const add = (from: string | null, s: AbstractState | typeof WIN, label: string) => {
    const key = s === WIN ? WIN : stateKey(s);
    if (from) {
      if (!edges.has(from)) edges.set(from, new Set());
      edges.get(from)!.add(key);
    }
    if (s === WIN) {
      if (from && !parent.has(WIN)) parent.set(WIN, { from, label });
      return;
    }
    if (states.has(key)) return;
    states.set(key, s);
    if (from) parent.set(key, { from, label });
    queue.push(key);
  };
  add(null, start, "start");

  while (queue.length > 0) {
    const key = queue.shift()!;
    const s = states.get(key)!;
    rooms.add(s.room);
    const room = getRoom(s.room);
    const flags = new Set(s.flags);
    const q = makeTileQuery(room, flags);
    const nodes = [...reachable(q, s.node).values()];

    // 출입구
    for (const exit of reachableExits(room, q, nodes)) {
      const entry = matchingExit(s.room, exit);
      if (!entry) continue;
      add(key, { ...s, room: exit.room, node: entryNode(entry) }, `${ROOMS[s.room].name} → ${ROOMS[exit.room].name}`);
    }

    for (const entity of room.entities) {
      const touching = nodes.filter((n) => canTouch(n, entity));
      if (touching.length === 0) continue;
      touched.add(entity.def.id);
      const def = entity.def;
      if (def.kind === "chest") {
        const visible = !def.hiddenUntil || flags.has(def.hiddenUntil);
        const unlocked = !def.lockedUntil || flags.has(def.lockedUntil);
        if (visible && unlocked) openableChests.add(def.id);
      }

      if (def.kind === "plate" && !s.statueSolved && !flags.has(def.flag)) {
        const statue = room.entities.find((e) => e.def.id === def.statue);
        if (statue && nodes.some((n) => canTouch(n, statue))) {
          const game = simulatePuzzle(s, entity, def.statue);
          if (game.flags.has(def.flag)) add(key, fromGameState(game, touching[0], true), "석상을 스위치 위로 밀기");
        }
        continue;
      }
      if (!isProgressEntity(entity)) continue;

      // 손이 닿는 위치마다 실제로 E를 눌러 보고, 상태가 바뀐 첫 결과를 쓴다.
      for (const node of touching) {
        const game = simulateInteract({ ...s, node });
        if (game.phase === "cleared") {
          add(key, WIN, "탈출문으로 탈출");
          break;
        }
        const next = fromGameState(game, node, s.statueSolved);
        const changed = stateKey({ ...next, node: s.node }) !== stateKey({ ...s, node: s.node });
        if (changed) {
          const gained = next.flags.filter((f) => !s.flags.includes(f));
          add(key, next, `${ROOMS[s.room].name}: ${gained.join(", ") || def.id}`);
          break;
        }
      }
    }
  }

  // 클리어할 수 있는 상태 (역방향 탐색)
  const reverse = new Map<string, string[]>();
  for (const [from, tos] of edges) for (const to of tos) reverse.set(to, [...(reverse.get(to) ?? []), from]);
  const winning = new Set<string>();
  const stack = [WIN];
  while (stack.length > 0) {
    const k = stack.pop()!;
    for (const prev of reverse.get(k) ?? []) {
      if (winning.has(prev)) continue;
      winning.add(prev);
      stack.push(prev);
    }
  }

  return { states, edges, winning, rooms, touched, openableChests, parent };
}

/** 처음 찾은 클리어 경로 (사람이 읽는 동작 목록) */
export function winningPath(result: ExploreResult): string[] {
  const steps: string[] = [];
  let key = "WIN";
  while (result.parent.has(key)) {
    const { from, label } = result.parent.get(key)!;
    steps.unshift(label);
    key = from;
  }
  return steps;
}

/** 처음 찾은 클리어 경로의 상태 목록 (각 상태에 도달한 동작 이름 포함) */
export function winningStates(result: ExploreResult): { state: AbstractState; label: string }[] {
  const list: { state: AbstractState; label: string }[] = [];
  let key = "WIN";
  while (result.parent.has(key)) {
    const { from, label } = result.parent.get(key)!;
    if (key !== "WIN") list.unshift({ state: result.states.get(key)!, label });
    key = from;
  }
  list.unshift({ state: result.states.get(key)!, label: "start" });
  return list;
}
