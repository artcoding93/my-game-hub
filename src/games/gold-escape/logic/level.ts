import { Tile, type Level, type ParsedStage, type Point, type StageDefinition } from "../types";

/**
 * 스테이지 문자열 범례
 *   .  빈 칸          #  벽돌(파기 가능)   @  단단한 벽(파기 불가)
 *   H  사다리         -  로프              S  탈출 사다리(금괴를 모두 모으면 등장)
 *   $  금괴           P  플레이어 시작      E  경비원 시작
 */
const TILE_BY_CHAR: Record<string, Tile> = {
  ".": Tile.Empty,
  "#": Tile.Brick,
  "@": Tile.Solid,
  H: Tile.Ladder,
  "-": Tile.Rope,
  S: Tile.EscapeLadder,
  $: Tile.Empty,
  P: Tile.Empty,
  E: Tile.Empty,
};

export function parseStage(stage: StageDefinition): ParsedStage {
  const height = stage.map.length;
  const width = stage.map[0]?.length ?? 0;
  const tiles: Tile[] = [];
  const guardStarts: Point[] = [];
  const gold: Point[] = [];
  let playerStart: Point | null = null;

  stage.map.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`[${stage.name}] ${y}행 길이가 ${row.length}입니다 (기대값 ${width}).`);
    }
    [...row].forEach((char, x) => {
      const tile = TILE_BY_CHAR[char];
      if (tile === undefined) throw new Error(`[${stage.name}] 알 수 없는 문자 '${char}' (${x}, ${y})`);
      tiles.push(tile);
      if (char === "P") {
        if (playerStart) throw new Error(`[${stage.name}] 플레이어 시작 위치가 둘 이상입니다.`);
        playerStart = { x, y };
      } else if (char === "E") guardStarts.push({ x, y });
      else if (char === "$") gold.push({ x, y });
    });
  });

  if (!playerStart) throw new Error(`[${stage.name}] 플레이어 시작 위치(P)가 없습니다.`);
  return { level: { width, height, tiles }, playerStart, guardStarts, gold };
}

export function toCell(level: Pick<Level, "width">, x: number, y: number): number {
  return y * level.width + x;
}

export function fromCell(level: Pick<Level, "width">, cell: number): Point {
  return { x: cell % level.width, y: Math.floor(cell / level.width) };
}

export function inBounds(level: Pick<Level, "width" | "height">, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < level.width && y < level.height;
}
