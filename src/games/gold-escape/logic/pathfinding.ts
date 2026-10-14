import type { MoveKind, Point } from "../types";
import { DIRECTION_DELTA, legalMoves, type TerrainView } from "./terrain";

export interface PathResult {
  /** 시작 칸을 제외한 이동 칸 목록. 비어 있으면 제자리 대기 */
  path: Point[];
  /** 목표 칸까지 실제로 도달하는 경로인지 (false면 가장 가까운 도달 가능 칸으로 가는 경로) */
  reachesTarget: boolean;
}

/**
 * 중력·사다리·로프 규칙을 반영한 BFS 최단 경로.
 *
 * 그래프의 정점은 칸, 간선은 그 칸에서 캐릭터가 실제로 할 수 있는 이동(legalMoves)뿐이다.
 * 따라서 사다리 없는 곳을 오르거나 공중에서 좌우로 움직이는 경로는 만들어지지 않으며,
 * 낙하는 아래로만 이어지는 단방향 간선이 된다.
 *
 * @param firstMoves 시작 칸에서의 이동 목록. 계획용 지형과 실제 지형이 다를 수 있는 시작 칸
 *                   (다른 경비원 머리 위 등)에서는 실제 지형 기준 이동을 넘겨준다.
 */
export function findPath(
  view: TerrainView,
  start: Point,
  target: Point,
  firstMoves: MoveKind[] = legalMoves(view, start.x, start.y),
): PathResult {
  const { width, height } = view;
  const size = width * height;
  const startCell = start.y * width + start.x;
  const targetCell = target.y * width + target.x;

  const parent = new Int32Array(size).fill(-1);
  const distance = new Int32Array(size).fill(-1);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  distance[startCell] = 0;
  queue[tail++] = startCell;

  while (head < tail) {
    const cell = queue[head++];
    if (cell === targetCell) break;

    const x = cell % width;
    const y = (cell - x) / width;
    const moves = cell === startCell ? firstMoves : legalMoves(view, x, y);

    for (const move of moves) {
      const delta = DIRECTION_DELTA[move];
      const nx = x + delta.x;
      const ny = y + delta.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (distance[next] !== -1) continue;
      distance[next] = distance[cell] + 1;
      parent[next] = cell;
      queue[tail++] = next;
    }
  }

  let goal = targetCell;
  const reachesTarget = distance[targetCell] !== -1;

  if (!reachesTarget) {
    // 목표에 닿을 수 없으면 도달 가능한 칸 중 목표와 가장 가까운(맨해튼) 칸으로 간다.
    // 동점이면 더 빨리 갈 수 있는 칸 → 칸 번호 순으로 골라 매번 같은 결과가 나오게 한다(왕복 방지).
    let best = startCell;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < tail; i++) {
      const cell = queue[i];
      const x = cell % width;
      const y = (cell - x) / width;
      const score = (Math.abs(x - target.x) + Math.abs(y - target.y)) * size + distance[cell];
      if (score < bestScore || (score === bestScore && cell < best)) {
        best = cell;
        bestScore = score;
      }
    }
    goal = best;
  }

  const path: Point[] = [];
  for (let cell = goal; cell !== startCell && cell !== -1; cell = parent[cell]) {
    path.push({ x: cell % width, y: Math.floor(cell / width) });
  }
  path.reverse();
  return { path, reachesTarget };
}
