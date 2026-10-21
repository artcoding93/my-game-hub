import { GAME_CONFIG, TILE } from "../config";
import { ROOMS } from "../rooms";
import type { EntityDef, ExitDef, ParsedRoom, PlacedEntity, RoomDef, RoomId, Side, Tile } from "../types";

const { cols: COLS, rows: ROWS } = GAME_CONFIG;

const TILE_CHARS: Record<string, Tile> = {
  "#": "solid",
  ".": "empty",
  "=": "platform",
  H: "ladder",
  "~": "crumble",
  "^": "spikes",
  t: "empty",
};

/** 지도 문자열을 타일·오브젝트 목록으로 바꾼다. 지도 오류는 개발 중에 바로 드러나도록 예외를 던진다. */
export function parseRoom(def: RoomDef): ParsedRoom {
  if (def.map.length !== ROWS) throw new Error(`Room ${def.id}: map must have ${ROWS} rows`);
  const counts = new Map<string, number>();
  for (const line of def.map) for (const char of line) if (def.markers[char]) counts.set(char, (counts.get(char) ?? 0) + 1);

  const tiles: Tile[][] = [];
  const entities: PlacedEntity[] = [];
  const torches: ParsedRoom["torches"] = [];
  const crumbles: ParsedRoom["crumbles"] = [];
  const spikeCells: { col: number; row: number }[] = [];

  def.map.forEach((line, row) => {
    if (line.length !== COLS) throw new Error(`Room ${def.id}: row ${row} must have ${COLS} columns (has ${line.length})`);
    const tileRow: Tile[] = [];
    [...line].forEach((char, col) => {
      const marker = def.markers[char];
      if (marker) {
        // 같은 문자가 여러 번 나오면(금화 등) 위치를 붙여 id를 구분한다.
        const def2: EntityDef = (counts.get(char) ?? 0) > 1 ? { ...marker, id: `${marker.id}:${col}:${row}` } : marker;
        entities.push({ def: def2, col, row });
        tileRow.push(marker.kind === "hatch" ? "ladder" : "empty");
        return;
      }
      const tile = TILE_CHARS[char];
      if (!tile) throw new Error(`Room ${def.id}: unknown map character "${char}" at ${col},${row}`);
      if (char === "t") torches.push({ col, row });
      if (tile === "crumble") crumbles.push({ id: `${def.id}:${col}:${row}`, col, row });
      if (tile === "spikes") spikeCells.push({ col, row });
      tileRow.push(tile);
    });
    tiles.push(tileRow);
  });

  // 가로로 붙어 있는 가시를 한 묶음으로 본다(묶음마다 주기를 어긋나게 해 리듬을 만든다).
  const spikes: ParsedRoom["spikes"] = [];
  let group = -1;
  spikeCells.forEach((cell, i) => {
    const prev = spikeCells[i - 1];
    if (!prev || prev.row !== cell.row || prev.col !== cell.col - 1) group++;
    spikes.push({ ...cell, group });
  });

  return { def, tiles, entities, torches, crumbles, spikes };
}

const PARSED = new Map<RoomId, ParsedRoom>();

export function getRoom(id: RoomId): ParsedRoom {
  let room = PARSED.get(id);
  if (!room) {
    room = parseRoom(ROOMS[id]);
    PARSED.set(id, room);
  }
  return room;
}

export function findEntity(room: ParsedRoom, id: string): PlacedEntity | undefined {
  return room.entities.find((entity) => entity.def.id === id);
}

/** 방 밖 좌표는 가장자리 칸을 그대로 이어 붙인 것으로 본다(출입구 열린 칸·사다리가 화면 밖으로 이어짐). */
export function baseTile(room: ParsedRoom, col: number, row: number): Tile {
  const c = Math.min(Math.max(col, 0), COLS - 1);
  const r = Math.min(Math.max(row, 0), ROWS - 1);
  return room.tiles[r][c];
}

export const opposite: Record<Side, Side> = { left: "right", right: "left", up: "down", down: "up" };

/** A 방의 출입구와 짝을 이루는 B 방의 출입구 */
export function matchingExit(from: RoomId, exit: ExitDef): ExitDef | undefined {
  return ROOMS[exit.room].exits.find((e) => e.room === from && e.side === opposite[exit.side]);
}

/** 출입구로 들어왔을 때 서는 위치 (발 위치) */
export function entrySpawn(exit: ExitDef): { x: number; y: number; climbing: boolean; facing: -1 | 1 } {
  const { width: W, height: H } = GAME_CONFIG;
  switch (exit.side) {
    case "left":
      return { x: TILE * 1.5, y: (exit.to + 1) * TILE, climbing: false, facing: 1 };
    case "right":
      return { x: W - TILE * 1.5, y: (exit.to + 1) * TILE, climbing: false, facing: -1 };
    case "up":
      // 위쪽 출입구로 들어오면 사다리를 타고 내려오는 중이다.
      return { x: exit.from * TILE + TILE / 2, y: GAME_CONFIG.player.height + 4, climbing: true, facing: 1 };
    case "down":
      return { x: exit.from * TILE + TILE / 2, y: H + 8, climbing: true, facing: 1 };
  }
}

/** 오브젝트가 차지하는 칸 (문·벽은 3칸 높이) */
export function entityCells(entity: PlacedEntity): { col: number; row: number }[] {
  const tall = entity.def.kind === "lockedDoor" || entity.def.kind === "crackedWall" || entity.def.kind === "exitDoor";
  if (!tall) return [{ col: entity.col, row: entity.row }];
  return [0, 1, 2].map((i) => ({ col: entity.col, row: entity.row - i }));
}

/** 오브젝트 중심 좌표 */
export function entityCenter(entity: PlacedEntity): { x: number; y: number } {
  const cells = entityCells(entity);
  const top = Math.min(...cells.map((c) => c.row));
  return { x: entity.col * TILE + TILE / 2, y: ((top + entity.row + 1) / 2) * TILE };
}

/** 문·덮개·벽처럼 열리기 전까지 막는 오브젝트가 열렸는지 (flags 기준) */
export function isBarrierOpen(def: EntityDef, flags: ReadonlySet<string>): boolean {
  switch (def.kind) {
    case "lockedDoor":
    case "crackedWall":
      return flags.has(openFlag(def.id));
    case "hatch":
      return flags.has(def.flag);
    case "exitDoor":
      return false;
    default:
      return true;
  }
}

export function openFlag(id: string) {
  return `open:${id}`;
}

export function chestFlag(id: string) {
  return `chest:${id}`;
}

export function searchedFlag(id: string) {
  return `searched:${id}`;
}

/** 지금 막혀 있는 칸 목록 (닫힌 문·덮개·균열 벽) */
export function barrierCells(room: ParsedRoom, flags: ReadonlySet<string>): Set<string> {
  const cells = new Set<string>();
  for (const entity of room.entities) {
    const kind = entity.def.kind;
    if (kind !== "lockedDoor" && kind !== "crackedWall" && kind !== "hatch" && kind !== "exitDoor") continue;
    if (isBarrierOpen(entity.def, flags)) continue;
    for (const cell of entityCells(entity)) cells.add(`${cell.col},${cell.row}`);
  }
  return cells;
}

/**
 * 진행 상태를 반영한 타일 조회기. 닫힌 문은 solid, 열린 덮개는 사다리가 된다.
 * 물리(logic/physics.ts)와 지도 탐색 검증(logic/navigation.ts)이 같은 함수를 쓴다.
 */
export function makeTileQuery(room: ParsedRoom, flags: ReadonlySet<string>, crumbleIntact?: (id: string) => boolean) {
  const barriers = barrierCells(room, flags);
  return (col: number, row: number): Tile => {
    const c = Math.min(Math.max(col, 0), COLS - 1);
    const r = Math.min(Math.max(row, 0), ROWS - 1);
    if (barriers.has(`${c},${r}`)) return "solid";
    const tile = room.tiles[r][c];
    if (tile === "crumble" && crumbleIntact && !crumbleIntact(`${room.def.id}:${c}:${r}`)) return "empty";
    return tile;
  };
}

export type TileQuery = ReturnType<typeof makeTileQuery>;
