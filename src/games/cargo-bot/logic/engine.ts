import { DX, DY, type Board, type BoxMove, type BoxStepKind, type Dir, type Level, type StepResult, type Tile } from "../types";

/*
 * Cargo Bot 규칙 엔진 (순수 함수, React·DOM·캔버스 비의존). 화면·실제 플레이·해답 탐색기·힌트가 모두 이 파일만 쓴다.
 *
 * 기본(정통 창고 퍼즐) 규칙
 *   - 로봇은 상하좌우로 한 칸씩 움직인다. 벽·창고 바깥으로는 갈 수 없다.
 *   - 앞에 상자가 있으면 같은 방향으로 한 칸 민다. 상자 너머가 벽·다른 상자면 밀 수 없다(두 개 동시 밀기 불가). 당기기는 없다.
 *   - 모든 상자가 목표 위치에 있으면 클리어. 로봇이 목표 위에 서는 것은 상관없다.
 *
 * 특수 타일 (상자에만 작용, 한 번의 입력 = 한 턴 안에서 모두 끝난다)
 *   상자가 어떤 칸에 "도착"할 때마다 그 칸의 효과를 아래 우선순위로 한 번 적용한다.
 *   1. 순간이동 장치: 짝 장치가 비어 있으면(벽·상자·로봇 없음) 짝 장치로 옮겨지고 그 자리에서 멈춘다.
 *      짝 장치에 막 도착한 상자는 다시 전송되지 않는다(되돌이 방지). 짝이 막혀 있으면 들어간 장치 위에서 멈춘다.
 *   2. 컨베이어: 벨트 방향으로 한 칸 옮긴다(다음 칸에 도착 → 다시 효과 적용). 막혀 있으면 벨트 위에서 멈춘다.
 *   3. 얼음: 들어온 방향으로 한 칸 더 미끄러진다. 막히면 얼음 위에서 멈춘다. 얼음을 벗어나 일반 바닥에 닿으면 그 칸에서 멈춘다.
 *   4. 일반 바닥: 멈춘다.
 *   "막힘"은 벽·창고 바깥·다른 상자·로봇이다. 같은 (칸, 방향)을 두 번 지나면 순환으로 보고 그 자리에서 멈춘다(무한 루프 방지).
 *   멈춘 상자는 다시 밀 때까지 움직이지 않는다(벨트 위에 멈춰 있는 상자도 다음 턴에 저절로 움직이지 않는다).
 */

/** 한 턴에 상자가 효과로 움직일 수 있는 최대 칸 수 (순환 감지와 별개의 안전장치) */
const MAX_CHAIN = 256;

export function idx(level: Pick<Level, "cols">, x: number, y: number) {
  return y * level.cols + x;
}

export function neighbor(level: Level, cell: number, dir: Dir): number {
  const x = (cell % level.cols) + DX[dir];
  const y = Math.floor(cell / level.cols) + DY[dir];
  if (x < 0 || y < 0 || x >= level.cols || y >= level.rows) return -1;
  return y * level.cols + x;
}

export function tileAt(level: Level, cell: number): Tile {
  return cell < 0 ? { kind: "void" } : level.tiles[cell];
}

export function isWalkable(level: Level, cell: number) {
  const k = tileAt(level, cell).kind;
  return k !== "wall" && k !== "void";
}

/** 칸이 비어 있는지 (상자·로봇이 들어갈 수 있는지) */
function isFree(level: Level, cell: number, boxes: readonly number[], player: number, skipBox = -1) {
  if (!isWalkable(level, cell) || cell === player) return false;
  for (let i = 0; i < boxes.length; i++) if (i !== skipBox && boxes[i] === cell) return false;
  return true;
}

/** 상자 i가 dir 방향으로 움직여 cell에 도착한 뒤 특수 타일 효과를 끝까지 적용한다 */
function resolveBox(level: Level, boxes: number[], player: number, i: number, dir: Dir, path: BoxMove["path"]): boolean {
  let momentum = dir;
  const seen = new Set<number>();
  for (let n = 0; n < MAX_CHAIN; n++) {
    const cell = boxes[i];
    const key = cell * 4 + momentum;
    if (seen.has(key)) return true;
    seen.add(key);
    const tile = tileAt(level, cell);
    if (tile.kind === "teleport") {
      const exit = level.partner.get(cell);
      if (exit === undefined || !isFree(level, exit, boxes, player, i)) return false;
      boxes[i] = exit;
      path.push({ cell: exit, kind: "teleport" });
      // 짝 장치 위에서 멈춘다 (도착 칸은 다시 효과를 받지 않으므로 되돌아가지 않는다)
      return false;
    }
    let kind: BoxStepKind;
    if (tile.kind === "conveyor") {
      momentum = tile.dir;
      kind = "conveyor";
    } else if (tile.kind === "ice") kind = "ice";
    else return false;
    const next = neighbor(level, cell, momentum);
    if (!isFree(level, next, boxes, player, i)) return false;
    boxes[i] = next;
    path.push({ cell: next, kind });
  }
  return true;
}

/** 한 번의 방향 입력을 한 턴으로 처리한다. 막히면 board를 그대로 돌려준다(moved = false) */
export function step(level: Level, board: Board, dir: Dir): StepResult {
  const from = board.player;
  const to = neighbor(level, from, dir);
  const blocked: StepResult = { board, moved: false, dir, playerFrom: from, box: null };
  if (!isWalkable(level, to)) return blocked;
  const hit = board.boxes.indexOf(to);
  if (hit < 0) return { board: { player: to, boxes: board.boxes }, moved: true, dir, playerFrom: from, box: null };

  const dest = neighbor(level, to, dir);
  if (!isFree(level, dest, board.boxes, to, hit)) return blocked;
  const boxes = board.boxes.slice();
  boxes[hit] = dest;
  const path: BoxMove["path"] = [{ cell: dest, kind: "push" }];
  const looped = resolveBox(level, boxes, to, hit, dir, path);
  return { board: { player: to, boxes }, moved: true, dir, playerFrom: from, box: { box: hit, from: to, path, looped } };
}

/** 모든 목표가 상자로 채워졌는지 (상자 수와 목표 수가 같으므로 모든 상자가 목표 위라는 뜻) */
export function isSolved(level: Level, board: Board) {
  return board.boxes.length === level.targets.size && board.boxes.every((b) => level.targets.has(b));
}

export function boxesOnTarget(level: Level, board: Board) {
  return board.boxes.filter((b) => level.targets.has(b)).length;
}

const blocksForever = (level: Level, cell: number) => !isWalkable(level, cell);

/**
 * 확실한 데드락: 목표가 아닌 칸의 상자가 벽 구석(가로 한쪽 + 세로 한쪽이 벽)에 있으면 다시는 밀 수 없다.
 * (밀려면 로봇이 반대편에 서야 하는데, 구석이면 두 방향 모두 반대편이 벽이고 나머지 두 방향은 벽 쪽이다.)
 * 특수 타일은 민 상자에만 작용하므로 어느 바닥이든 같다. 상자끼리 막힌 경우 등 복잡한 데드락은 판정하지 않는다.
 */
export function isCornerDeadlock(level: Level, cell: number) {
  if (level.targets.has(cell)) return false;
  const v = blocksForever(level, neighbor(level, cell, 0)) || blocksForever(level, neighbor(level, cell, 2));
  const h = blocksForever(level, neighbor(level, cell, 1)) || blocksForever(level, neighbor(level, cell, 3));
  return v && h;
}

/** 경고용: 일반 바닥 위의 구석 데드락 상자 번호들 */
export function deadlockedBoxes(level: Level, board: Board): number[] {
  return board.boxes.flatMap((b, i) => (tileAt(level, b).kind === "floor" && isCornerDeadlock(level, b) ? [i] : []));
}

/** 로봇이 걸어서 갈 수 있는 칸 (상자는 막힘, 특수 타일은 그냥 바닥) */
export function reachable(level: Level, board: Board): Uint8Array {
  const seen = new Uint8Array(level.cols * level.rows);
  const occupied = new Set(board.boxes);
  const queue = [board.player];
  seen[board.player] = 1;
  for (let q = 0; q < queue.length; q++) {
    const cell = queue[q];
    for (let d = 0; d < 4; d++) {
      const n = neighbor(level, cell, d as Dir);
      if (n < 0 || seen[n] || !isWalkable(level, n) || occupied.has(n)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return seen;
}

/** 걸어서 가는 최단 경로 (방향 목록). 갈 수 없으면 null */
export function walkPath(level: Level, board: Board, goal: number): Dir[] | null {
  if (goal === board.player) return [];
  const prev = new Int32Array(level.cols * level.rows).fill(-1);
  const occupied = new Set(board.boxes);
  const queue = [board.player];
  prev[board.player] = board.player;
  for (let q = 0; q < queue.length; q++) {
    const cell = queue[q];
    for (let d = 0; d < 4; d++) {
      const n = neighbor(level, cell, d as Dir);
      if (n < 0 || prev[n] >= 0 || !isWalkable(level, n) || occupied.has(n)) continue;
      prev[n] = cell;
      if (n === goal) {
        const dirs: Dir[] = [];
        for (let c = goal; c !== board.player; c = prev[c]) {
          const p = prev[c];
          const dx = (c % level.cols) - (p % level.cols);
          const dy = Math.floor(c / level.cols) - Math.floor(p / level.cols);
          dirs.push((dy === -1 ? 0 : dx === 1 ? 1 : dy === 1 ? 2 : 3) as Dir);
        }
        return dirs.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}
