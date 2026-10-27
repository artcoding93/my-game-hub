import { DIRS, type Board, type Dir, type Level } from "../types";
import { isCornerDeadlock, isSolved, neighbor, reachable, step, walkPath } from "./engine";

/*
 * 상태 공간 탐색 (스테이지 검증·힌트). 실제 게임과 같은 engine.step으로만 다음 상태를 만들므로
 * 컨베이어·얼음·순간이동 규칙이 게임과 정확히 같다.
 *
 * 상태 = (상자 위치 집합, 로봇이 걸어서 갈 수 있는 영역). 상자는 정렬해 같은 배치를 하나로 보고(정규화),
 * 로봇 위치는 갈 수 있는 영역에서 가장 작은 칸 번호로 대표한다(걸어서 오가는 상태를 하나로 합침).
 * 목표가 아닌 칸의 벽 구석 상자는 다시 밀 수 없으므로 그 상태는 버린다(확실한 데드락만).
 */

export interface Push {
  /** 이 상태에서 밀 상자 번호 (board.boxes 순서) */
  box: number;
  dir: Dir;
  /** 로봇이 미는 순간 서 있어야 하는 칸 */
  stand: number;
}

export interface Solution {
  pushes: number;
  /** 실제 입력 순서 (걷기 포함). LURD 문자열로 바꾸려면 toLurd */
  moves: Dir[];
  firstPush: Push | null;
  explored: number;
}

function key(level: Level, board: Board, region: Uint8Array) {
  let norm = board.player;
  for (let c = 0; c < region.length; c++)
    if (region[c]) {
      norm = c;
      break;
    }
  return `${norm}|${board.boxes.slice().sort((a, b) => a - b).join(",")}`;
}

interface Node {
  board: Board;
  parent: string | null;
  push: Push | null;
}

/** 밀기 횟수가 가장 적은 해답 (BFS). maxStates를 넘으면 null */
export function solvePushes(level: Level, start: Board, maxStates = 2_000_000): Solution | null {
  if (isSolved(level, start)) return { pushes: 0, moves: [], firstPush: null, explored: 1 };
  const startKey = key(level, start, reachable(level, start));
  const nodes = new Map<string, Node>([[startKey, { board: start, parent: null, push: null }]]);
  let frontier = [startKey];
  let depth = 0;
  while (frontier.length > 0) {
    depth++;
    const next: string[] = [];
    for (const k of frontier) {
      const { board } = nodes.get(k)!;
      const region = reachable(level, board);
      for (let i = 0; i < board.boxes.length; i++) {
        for (const dir of DIRS) {
          const stand = neighbor(level, board.boxes[i], ((dir + 2) % 4) as Dir);
          if (stand < 0 || !region[stand]) continue;
          const res = step(level, { player: stand, boxes: board.boxes }, dir);
          if (!res.box) continue;
          const moved = res.board.boxes[i];
          if (isCornerDeadlock(level, moved)) continue;
          const nk = key(level, res.board, reachable(level, res.board));
          if (nodes.has(nk)) continue;
          const node: Node = { board: res.board, parent: k, push: { box: i, dir, stand } };
          nodes.set(nk, node);
          if (isSolved(level, res.board)) return build(level, start, nodes, nk, depth);
          next.push(nk);
        }
      }
      if (nodes.size > maxStates) return null;
    }
    frontier = next;
  }
  return null;
}

function build(level: Level, start: Board, nodes: Map<string, Node>, goal: string, pushes: number): Solution {
  const chain: Node[] = [];
  for (let k: string | null = goal; k; k = nodes.get(k)!.parent) chain.push(nodes.get(k)!);
  chain.reverse();
  const moves: Dir[] = [];
  let board = start;
  for (const node of chain.slice(1)) {
    const push = node.push!;
    const walk = walkPath(level, board, push.stand);
    if (!walk) throw new Error("solver: walk path missing");
    moves.push(...walk, push.dir);
    board = node.board;
  }
  return { pushes, moves, firstPush: chain[1]?.push ?? null, explored: nodes.size };
}

/** 이동 횟수가 가장 적은 해답 (로봇 위치까지 그대로 상태로 쓰는 BFS). 작은 스테이지 검증용 */
export function solveMoves(level: Level, start: Board, maxStates = 3_000_000): { moves: number; pushes: number; path: Dir[] } | null {
  const k0 = `${start.player}|${start.boxes.slice().sort((a, b) => a - b).join(",")}`;
  const seen = new Map<string, { parent: string | null; dir: Dir | null; board: Board; pushes: number }>([[k0, { parent: null, dir: null, board: start, pushes: 0 }]]);
  let frontier = [k0];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const k of frontier) {
      const cur = seen.get(k)!;
      for (const dir of DIRS) {
        const res = step(level, cur.board, dir);
        if (!res.moved) continue;
        if (res.box && isCornerDeadlock(level, res.board.boxes[res.box.box])) continue;
        const nk = `${res.board.player}|${res.board.boxes.slice().sort((a, b) => a - b).join(",")}`;
        if (seen.has(nk)) continue;
        seen.set(nk, { parent: k, dir, board: res.board, pushes: cur.pushes + (res.box ? 1 : 0) });
        if (isSolved(level, res.board)) {
          const path: Dir[] = [];
          for (let c: string | null = nk; c && seen.get(c)!.dir !== null; c = seen.get(c)!.parent) path.push(seen.get(c)!.dir!);
          return { moves: path.length, pushes: seen.get(nk)!.pushes, path: path.reverse() };
        }
        next.push(nk);
      }
      if (seen.size > maxStates) return null;
    }
    frontier = next;
  }
  return null;
}

const LURD = ["u", "r", "d", "l"] as const;

/** 입력 순서를 창고 퍼즐 표기로 (u r d l = 걷기, U R D L = 밀기) */
export function toLurd(level: Level, start: Board, moves: readonly Dir[]): string {
  let board = start;
  let out = "";
  for (const dir of moves) {
    const res = step(level, board, dir);
    out += res.box ? LURD[dir].toUpperCase() : LURD[dir];
    board = res.board;
  }
  return out;
}

export function fromLurd(text: string): Dir[] {
  return [...text].map((ch) => LURD.indexOf(ch.toLowerCase() as (typeof LURD)[number]) as Dir);
}
