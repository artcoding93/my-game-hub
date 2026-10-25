import { MAP_COLS, MAP_ROWS, TILE } from "../config";
import type { MovingPlatformSpec, StageSpec } from "../stages";

export type Tile = "empty" | "solid" | "platform";

export type SpawnKind = "cogling" | "springlet" | "whirlwing" | "zipwind" | "boss";

export interface Spawn {
  kind: SpawnKind;
  /** 칸 가운데 x, 칸 바닥 y (그 칸 아래 발판 윗면) */
  x: number;
  y: number;
}

export interface Level {
  tiles: Tile[];
  player: { x: number; y: number };
  spawns: Spawn[];
}

const SPAWN_CHARS: Record<string, SpawnKind> = { c: "cogling", s: "springlet", w: "whirlwing", z: "zipwind", Q: "boss" };

export function parseLevel(stage: StageSpec): Level {
  if (stage.map.length !== MAP_ROWS) throw new Error(`stage ${stage.id}: ${stage.map.length} rows`);
  const tiles: Tile[] = [];
  const spawns: Spawn[] = [];
  let player = { x: TILE * 2, y: (MAP_ROWS - 1) * TILE };
  stage.map.forEach((line, row) => {
    if (line.length !== MAP_COLS) throw new Error(`stage ${stage.id} row ${row}: ${line.length} cols`);
    [...line].forEach((ch, col) => {
      tiles.push(ch === "#" ? "solid" : ch === "=" ? "platform" : "empty");
      const at = { x: (col + 0.5) * TILE, y: (row + 1) * TILE };
      if (ch === "P") player = at;
      else if (SPAWN_CHARS[ch]) spawns.push({ kind: SPAWN_CHARS[ch], ...at });
    });
  });
  return { tiles, player, spawns };
}

export function tileAt(level: Level, col: number, row: number): Tile {
  if (col < 0 || col >= MAP_COLS || row < 0) return "solid";
  if (row >= MAP_ROWS) return "empty";
  return level.tiles[row * MAP_COLS + col];
}

export function isSolidAt(level: Level, x: number, y: number) {
  return tileAt(level, Math.floor(x / TILE), Math.floor(y / TILE)) === "solid";
}

/** 움직이는 발판 (발판과 같은 규칙: 위에서만 착지) */
export interface MovingPlatform {
  x: number;
  y: number;
  w: number;
  /** 이번 스텝 이동량 (위에 선 물체를 함께 옮긴다) */
  dx: number;
  dir: 1 | -1;
  minX: number;
  maxX: number;
  speed: number;
}

export function createMovingPlatforms(specs: MovingPlatformSpec[]): MovingPlatform[] {
  return specs.map((s) => {
    const a = s.fromCol * TILE;
    const b = s.toCol * TILE;
    return { x: a, y: s.row * TILE, w: s.width * TILE, dx: 0, dir: b >= a ? 1 : -1, minX: Math.min(a, b), maxX: Math.max(a, b), speed: s.speed };
  });
}

export function stepMovingPlatforms(platforms: MovingPlatform[], dt: number) {
  for (const p of platforms) {
    const before = p.x;
    p.x += p.dir * p.speed * dt;
    if (p.x > p.maxX) {
      p.x = p.maxX;
      p.dir = -1;
    } else if (p.x < p.minX) {
      p.x = p.minX;
      p.dir = 1;
    }
    p.dx = p.x - before;
  }
}

/** 발판 위층: (x, y)에서 위로 maxRise 안에 있는 발판·벽 윗면 y (없으면 null). 적 AI가 위층으로 뛸지 정할 때 쓴다 */
export function floorAbove(level: Level, x: number, y: number, maxRise: number): number | null {
  const col = Math.floor(x / TILE);
  for (let row = Math.floor(y / TILE) - 2; row * TILE >= y - maxRise && row > 0; row--) {
    const t = tileAt(level, col, row);
    if (t !== "empty" && tileAt(level, col, row - 1) === "empty") return row * TILE;
  }
  return null;
}
