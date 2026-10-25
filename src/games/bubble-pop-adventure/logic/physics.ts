import { GRAVITY, MAX_FALL, TILE } from "../config";
import { tileAt, type Level, type MovingPlatform } from "./level";

/*
 * 사각형 몸체(왼쪽 위 기준)의 이동과 지형 충돌. 플레이어·적·아이템·보스 졸개가 모두 이 함수를 쓴다.
 * 가로 → 세로 순으로 축마다 풀고, 한 스텝 이동량(최대 약 7px)이 타일(16px)보다 작아 벽을 뚫지 않는다.
 * 발판(=)과 움직이는 발판은 아래로 떨어지는 중에, 직전 스텝에 발이 그 윗면보다 위에 있었을 때만 착지한다.
 */

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  grounded: boolean;
  /** 올라서 있는 움직이는 발판 번호 (-1 = 없음) */
  onPlatform: number;
}

export interface MoveResult {
  /** 벽에 막힌 방향 (-1 왼쪽, 1 오른쪽, 0 없음) */
  wall: -1 | 0 | 1;
  landed: boolean;
  ceiling: boolean;
}

export interface MoveOptions {
  gravity?: number;
  /** 발판(=)에 착지하는지 (비행 요정은 false) */
  platforms?: boolean;
}

function hitsSolid(level: Level, x: number, y: number, w: number, h: number) {
  const c0 = Math.floor(x / TILE);
  const c1 = Math.floor((x + w - 1e-4) / TILE);
  const r0 = Math.floor(y / TILE);
  const r1 = Math.floor((y + h - 1e-4) / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (tileAt(level, c, r) === "solid") return true;
  return false;
}

export function bodyHitsSolid(level: Level, b: Pick<Body, "x" | "y" | "w" | "h">) {
  return hitsSolid(level, b.x, b.y, b.w, b.h);
}

export function moveBody(level: Level, platforms: MovingPlatform[], b: Body, dt: number, opts: MoveOptions = {}): MoveResult {
  const result: MoveResult = { wall: 0, landed: false, ceiling: false };
  // 움직이는 발판에 서 있으면 함께 이동
  if (b.onPlatform >= 0 && platforms[b.onPlatform]) {
    const carried = b.x + platforms[b.onPlatform].dx;
    if (!hitsSolid(level, carried, b.y, b.w, b.h)) b.x = carried;
  }
  const g = opts.gravity ?? GRAVITY;
  b.vy = Math.min(b.vy + g * dt, MAX_FALL);

  // 가로
  const nx = b.x + b.vx * dt;
  if (hitsSolid(level, nx, b.y, b.w, b.h)) {
    if (b.vx > 0) {
      b.x = Math.floor((nx + b.w) / TILE) * TILE - b.w - 0.01;
      result.wall = 1;
    } else if (b.vx < 0) {
      b.x = Math.ceil(nx / TILE) * TILE + 0.01;
      result.wall = -1;
    }
    if (hitsSolid(level, b.x, b.y, b.w, b.h)) b.x = nx - b.vx * dt;
  } else b.x = nx;

  // 세로
  const prevBottom = b.y + b.h;
  const ny = b.y + b.vy * dt;
  const wasGrounded = b.grounded;
  b.grounded = false;
  b.onPlatform = -1;
  if (b.vy >= 0) {
    const bottom = ny + b.h;
    let landY: number | null = null;
    if (hitsSolid(level, b.x, ny, b.w, b.h)) landY = Math.floor(bottom / TILE) * TILE;
    else if (opts.platforms !== false) {
      // 발판 타일: 윗면을 위에서 아래로 지날 때만
      const row = Math.floor(bottom / TILE);
      const top = row * TILE;
      if (prevBottom <= top + 0.01 && bottom >= top) {
        const c0 = Math.floor(b.x / TILE);
        const c1 = Math.floor((b.x + b.w - 1e-4) / TILE);
        for (let c = c0; c <= c1; c++) if (tileAt(level, c, row) === "platform") landY = top;
      }
      platforms.forEach((p, i) => {
        if (prevBottom <= p.y + 0.01 && bottom >= p.y && b.x + b.w > p.x + 1 && b.x < p.x + p.w - 1) {
          if (landY === null || p.y < landY) {
            landY = p.y;
            b.onPlatform = i;
          }
        }
      });
      if (landY !== null && b.onPlatform >= 0 && landY !== platforms[b.onPlatform].y) b.onPlatform = -1;
    }
    if (landY !== null) {
      b.y = landY - b.h;
      result.landed = !wasGrounded;
      b.grounded = true;
      b.vy = 0;
    } else b.y = ny;
  } else {
    if (hitsSolid(level, b.x, ny, b.w, b.h)) {
      b.y = Math.ceil(ny / TILE) * TILE + 0.01;
      b.vy = 0;
      result.ceiling = true;
    } else b.y = ny;
  }
  return result;
}

/** 몸 앞쪽 발밑에 딛을 곳(벽·발판·움직이는 발판)이 있는지. 적이 발판 끝을 알아챌 때 쓴다 */
export function groundAhead(level: Level, platforms: MovingPlatform[], b: Body, dir: 1 | -1, lookAhead = 2): boolean {
  const x = dir > 0 ? b.x + b.w + lookAhead : b.x - lookAhead;
  const y = b.y + b.h + 1;
  const t = tileAt(level, Math.floor(x / TILE), Math.floor(y / TILE));
  if (t !== "empty") return true;
  return platforms.some((p) => Math.abs(p.y - (b.y + b.h)) < 1.5 && x >= p.x && x <= p.x + p.w);
}

export function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, shrink = 0) {
  return a.x + shrink < b.x + b.w && a.x + a.w - shrink > b.x && a.y + shrink < b.y + b.h && a.y + a.h - shrink > b.y;
}
