import { GAME_CONFIG, TILE } from "../config";
import type { InputSnapshot, Player, Tile } from "../types";
import type { TileQuery } from "./world";

/*
 * 플레이어 이동과 지형 충돌 (순수 함수, 고정 시간 간격).
 * - 축 분리 충돌: 가로로 먼저 움직여 벽을 밀어내고, 그다음 세로로 움직여 바닥·천장을 처리한다.
 * - 발판(=)·사다리 꼭대기·무너지는 바닥은 위에서 내려올 때만 막는다(아래에서 점프해 통과).
 * - 한 스텝 이동량은 타일 크기보다 훨씬 작으므로(최대 약 7px) 벽을 뚫고 지나가지 않는다.
 */

const P = GAME_CONFIG.player;
const HALF_W = P.width / 2;
const EPS = 0.001;

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PhysicsEnv {
  tile: TileQuery;
  /** 밀 수 있는 단단한 상자(석상). 위에 설 수 있고 옆으로 밀면 push가 호출된다. */
  obstacles: Box[];
  /** i번째 상자를 dx만큼 밀어 보고 실제로 움직인 거리를 돌려준다. */
  push: (index: number, dx: number) => number;
}

export function playerBox(p: Pick<Player, "x" | "y">): Box {
  return { left: p.x - HALF_W, right: p.x + HALF_W, top: p.y - P.height, bottom: p.y };
}

export const isSolid = (tile: Tile) => tile === "solid";

/** (col,row) 칸 윗면에 설 수 있는지. 사다리는 맨 윗칸만 발판이 된다. */
export function isSupport(query: TileQuery, col: number, row: number): boolean {
  const tile = query(col, row);
  if (tile === "solid" || tile === "platform" || tile === "crumble") return true;
  return tile === "ladder" && query(col, row - 1) !== "ladder";
}

function spanCols(x: number): [number, number] {
  return [Math.floor((x - HALF_W + EPS) / TILE), Math.floor((x + HALF_W - EPS) / TILE)];
}

function spanRows(top: number, bottom: number): [number, number] {
  return [Math.floor((top + EPS) / TILE), Math.floor((bottom - EPS) / TILE)];
}

function overlaps(a: Box, b: Box) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** 가로 이동 + 벽·석상 충돌. 석상을 밀었으면 true */
function moveX(p: Player, env: PhysicsEnv, dx: number): boolean {
  if (dx === 0) return false;
  p.x += dx;
  const [r0, r1] = spanRows(p.y - P.height, p.y);
  if (dx > 0) {
    const col = Math.floor((p.x + HALF_W - EPS) / TILE);
    for (let row = r0; row <= r1; row++) {
      if (isSolid(env.tile(col, row))) {
        p.x = col * TILE - HALF_W;
        p.vx = 0;
        break;
      }
    }
  } else {
    const col = Math.floor((p.x - HALF_W + EPS) / TILE);
    for (let row = r0; row <= r1; row++) {
      if (isSolid(env.tile(col, row))) {
        p.x = (col + 1) * TILE + HALF_W;
        p.vx = 0;
        break;
      }
    }
  }

  let pushed = false;
  env.obstacles.forEach((ob, i) => {
    const box = playerBox(p);
    if (!overlaps(box, ob)) return;
    // 위에 올라서 있는 상태(발이 윗면 근처)에서는 밀지 않는다.
    if (box.bottom <= ob.top + 2) return;
    if (dx > 0) {
      const moved = p.onGround ? env.push(i, box.right - ob.left) : 0;
      if (moved > 0) pushed = true;
      p.x = ob.left + moved - HALF_W;
    } else {
      const moved = p.onGround ? env.push(i, box.left - ob.right) : 0;
      if (moved < 0) pushed = true;
      p.x = ob.right + moved + HALF_W;
    }
    if (!pushed) p.vx = 0;
  });
  return pushed;
}

/** 세로 이동 + 바닥·천장 충돌. 착지하면 true */
function moveY(p: Player, env: PhysicsEnv, dy: number): boolean {
  if (dy === 0) return false;
  const prevBottom = p.y;
  p.y += dy;
  const [c0, c1] = spanCols(p.x);

  if (dy > 0) {
    // 이번 스텝에 윗면을 지나친 행을 위에서부터 확인한다.
    const firstRow = Math.ceil((prevBottom - EPS) / TILE);
    const lastRow = Math.floor(p.y / TILE);
    let landed: number | null = null;
    for (let row = firstRow; row <= lastRow && landed === null; row++) {
      const top = row * TILE;
      for (let col = c0; col <= c1; col++) {
        if (isSolid(env.tile(col, row)) || (prevBottom <= top + EPS && isSupport(env.tile, col, row))) {
          landed = top;
          break;
        }
      }
    }
    for (const ob of env.obstacles) {
      if (p.x + HALF_W > ob.left && p.x - HALF_W < ob.right && prevBottom <= ob.top + EPS && p.y >= ob.top) {
        landed = landed === null ? ob.top : Math.min(landed, ob.top);
      }
    }
    if (landed !== null) {
      p.y = landed;
      p.vy = 0;
      return true;
    }
    return false;
  }

  const head = p.y - P.height;
  const row = Math.floor((head + EPS) / TILE);
  for (let col = c0; col <= c1; col++) {
    if (isSolid(env.tile(col, row))) {
      p.y = (row + 1) * TILE + P.height;
      p.vy = 0;
      return false;
    }
  }
  for (const ob of env.obstacles) {
    if (p.x + HALF_W > ob.left && p.x - HALF_W < ob.right && head < ob.bottom && prevBottom - P.height >= ob.bottom - EPS) {
      p.y = ob.bottom + P.height;
      p.vy = 0;
    }
  }
  return false;
}

/** 발밑을 받쳐 주는 것이 있는지 (지형 또는 석상 윗면) */
export function isGrounded(p: Pick<Player, "x" | "y">, env: PhysicsEnv): boolean {
  const [c0, c1] = spanCols(p.x);
  if (Math.abs(p.y - Math.round(p.y / TILE) * TILE) < 0.01) {
    const row = Math.round(p.y / TILE);
    for (let col = c0; col <= c1; col++) if (isSupport(env.tile, col, row)) return true;
  }
  return env.obstacles.some((ob) => p.x + HALF_W > ob.left && p.x - HALF_W < ob.right && Math.abs(p.y - ob.top) < 0.01);
}

function ladderCol(p: Player) {
  return Math.floor(p.x / TILE);
}

/** 몸통(허리 높이 또는 발)이 사다리에 걸쳐 있는지 */
function touchingLadder(p: Player, query: TileQuery): boolean {
  const col = ladderCol(p);
  const waist = Math.floor((p.y - P.height / 2) / TILE);
  const feet = Math.floor((p.y - 1) / TILE);
  return query(col, waist) === "ladder" || query(col, feet) === "ladder";
}

/** 발밑 바로 아래가 사다리인지 (사다리 꼭대기에 서 있음) */
function ladderBelow(p: Player, query: TileQuery): boolean {
  return Math.abs(p.y - Math.round(p.y / TILE) * TILE) < 0.5 && query(ladderCol(p), Math.round(p.y / TILE)) === "ladder";
}

function startClimb(p: Player) {
  p.climbing = true;
  p.onGround = false;
  p.vx = 0;
  p.vy = 0;
  p.x = ladderCol(p) * TILE + TILE / 2;
}

/** 사다리에서 옆으로 내릴 때, 발 근처(±ladderSnap)에 설 곳이 있으면 그 높이를 돌려준다. */
function dismountHeight(p: Player, env: PhysicsEnv, dir: -1 | 1): number | null {
  const probeX = p.x + dir * (HALF_W + 2);
  const col = Math.floor(probeX / TILE);
  const nearest = Math.round(p.y / TILE);
  for (const row of [nearest, nearest - 1, nearest + 1]) {
    const top = row * TILE;
    if (Math.abs(top - p.y) > P.ladderSnap) continue;
    if (!isSupport(env.tile, col, row)) continue;
    // 내린 자리에 몸이 들어갈 공간이 있어야 한다.
    const [r0, r1] = spanRows(top - P.height, top);
    let free = true;
    for (let r = r0; r <= r1; r++) if (isSolid(env.tile(col, r))) free = false;
    if (free) return top;
  }
  return null;
}

export interface StepResult {
  landed: boolean;
  jumped: boolean;
  pushed: boolean;
}

/** 플레이어를 dt초만큼 움직인다. controllable=false면 입력을 무시한다(피격 경직·상자 열기 중). */
export function stepPlayer(p: Player, input: InputSnapshot, env: PhysicsEnv, dt: number, controllable: boolean): StepResult {
  const result: StepResult = { landed: false, jumped: false, pushed: false };
  const move = controllable ? input.move : 0;
  const vertical = controllable ? input.vertical : 0;
  if (controllable && input.jumpPressed) p.jumpBuffer = P.jumpBuffer;
  else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (move !== 0) p.facing = move;

  if (p.climbing) {
    stepClimbing(p, move, vertical, env, dt, result);
    return result;
  }

  // 사다리 잡기: 위(몸이 사다리에 걸침) 또는 아래(사다리 꼭대기에 서 있음)
  if (vertical === -1 && touchingLadder(p, env.tile) && p.vy > -P.jumpSpeed * 0.6) {
    startClimb(p);
    stepClimbing(p, move, vertical, env, dt, result);
    return result;
  }
  if (vertical === 1 && p.onGround && ladderBelow(p, env.tile)) {
    startClimb(p);
    p.y += 2;
    return result;
  }

  // 가로 속도: 가속·감속
  const target = move * P.runSpeed;
  const accel = move !== 0 ? (p.onGround ? P.groundAccel : P.airAccel) : p.onGround ? P.friction : P.airAccel * 0.5;
  if (p.vx < target) p.vx = Math.min(target, p.vx + accel * dt);
  else if (p.vx > target) p.vx = Math.max(target, p.vx - accel * dt);

  // 점프 (코요테 타임·입력 버퍼)
  if (p.jumpBuffer > 0 && (p.onGround || p.coyote > 0)) {
    p.vy = -P.jumpSpeed;
    p.onGround = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    result.jumped = true;
  }
  if (!input.jumpHeld && p.vy < -P.jumpSpeed * P.jumpCut) p.vy = -P.jumpSpeed * P.jumpCut;

  p.vy = Math.min(p.vy + P.gravity * dt, P.maxFall);

  result.pushed = moveX(p, env, p.vx * dt);
  if (result.pushed) p.vx = Math.sign(p.vx) * Math.min(Math.abs(p.vx), GAME_CONFIG.statue.pushSpeed);
  const wasGround = p.onGround;
  const landed = moveY(p, env, p.vy * dt);
  p.onGround = landed || (p.vy >= 0 && isGrounded(p, env));
  if (p.onGround) {
    p.coyote = P.coyoteTime;
    if (!wasGround) result.landed = true;
  } else {
    p.coyote = Math.max(0, p.coyote - dt);
  }
  return result;
}

function stepClimbing(p: Player, move: -1 | 0 | 1, vertical: -1 | 0 | 1, env: PhysicsEnv, dt: number, result: StepResult) {
  const col = ladderCol(p);

  // 사다리에서 점프해 뛰어내리기
  if (p.jumpBuffer > 0) {
    p.climbing = false;
    p.jumpBuffer = 0;
    p.vy = -P.jumpSpeed * 0.7;
    p.vx = move * P.runSpeed;
    result.jumped = true;
    return;
  }

  // 옆으로 내리기: 발 높이 근처에 설 곳이 있을 때만 내린다(긴 사다리 중간에서 실수로 떨어지지 않게).
  if (move !== 0 && vertical === 0) {
    const top = dismountHeight(p, env, move);
    if (top !== null) {
      p.climbing = false;
      p.y = top;
      p.vy = 0;
      p.onGround = true;
      moveX(p, env, move * 3);
      return;
    }
  }

  const dy = vertical * P.climbSpeed * dt;
  p.vy = vertical * P.climbSpeed;
  if (dy < 0) {
    const nextY = p.y + dy;
    const headRow = Math.floor((nextY - P.height + EPS) / TILE);
    if (isSolid(env.tile(col, headRow))) {
      // 닫힌 석문·격자 아래: 더 올라가지 못한다.
      p.y = (headRow + 1) * TILE + P.height;
      p.vy = 0;
      return;
    }
    const feetRow = Math.floor((nextY - EPS) / TILE);
    if (env.tile(col, feetRow) !== "ladder") {
      // 사다리 꼭대기를 넘어섰다 → 꼭대기 위에 선다.
      p.y = (feetRow + 1) * TILE;
      p.climbing = false;
      p.onGround = true;
      p.vy = 0;
      result.landed = true;
      return;
    }
    p.y = nextY;
  } else if (dy > 0) {
    const nextY = p.y + dy;
    const feetRow = Math.floor(nextY / TILE);
    const tile = env.tile(col, feetRow);
    if (tile !== "ladder") {
      if (tile !== "empty" && tile !== "spikes") {
        // 사다리 아래 바닥에 닿았다.
        p.y = feetRow * TILE;
        p.climbing = false;
        p.onGround = true;
        p.vy = 0;
        result.landed = true;
        return;
      }
      // 허공에서 사다리가 끝남 → 떨어진다.
      p.y = nextY;
      p.climbing = false;
      p.vy = 0;
      return;
    }
    p.y = nextY;
  }
}
