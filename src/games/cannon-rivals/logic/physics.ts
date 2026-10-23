import { AIM_LIMITS, CRATE, PHYSICS, TANK, WORLD_H, WORLD_W } from "../config";
import type { Crate, Side, Tank } from "../types";

/*
 * 포탄 물리. 플레이어 발사, AI 탄도 탐색, 탄도 가이드가 모두 stepBody 하나를 쓰므로 결과가 항상 같다.
 *
 * 화면 좌표계(y 아래가 +)에서 등가속도 운동:
 *   x(t) = x0 + vx0·t + ½·windAccel·t²
 *   y(t) = y0 + vy0·t + ½·gravity·t²     (위로 쏘면 vy0 < 0)
 * 한 스텝(1/60초)을 SUBSTEP(1/240초)으로 나눠 위 식을 그대로 적분하고 단계마다 충돌을 검사한다.
 * 등가속도이므로 이 적분은 해석해와 오차 없이 같고, 프레임 속도와 무관하게 같은 탄도가 나온다.
 */

export const SUBSTEP = PHYSICS.fixedDt / PHYSICS.substeps;

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  windScale: number;
}

export interface World {
  terrain: Float32Array;
  wind: number;
  tanks: Record<Side, Tank>;
  crate: Crate | null;
}

export type Impact =
  | { kind: "tank"; x: number; y: number; target: Side }
  | { kind: "crate"; x: number; y: number }
  | { kind: "terrain"; x: number; y: number }
  | { kind: "out"; x: number; y: number };

export function windAcceleration(wind: number, windScale = 1): number {
  return wind * PHYSICS.windAccelPerUnit * windScale;
}

export function clampAngle(angle: number): number {
  return Math.min(AIM_LIMITS.maxAngle, Math.max(AIM_LIMITS.minAngle, Math.round(angle * 10) / 10));
}

export function clampPower(power: number): number {
  return Math.min(AIM_LIMITS.maxPower, Math.max(AIM_LIMITS.minPower, Math.round(power * 10) / 10));
}

/** 포신 끝(포탄이 나오는 곳) */
export function muzzle(tank: Tank, angle = tank.angle): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return {
    x: tank.x + tank.facing * Math.cos(rad) * PHYSICS.barrelLength,
    y: tank.y - PHYSICS.barrelPivotY - Math.sin(rad) * PHYSICS.barrelLength,
  };
}

export function launchBody(tank: Tank, angle: number, power: number, windScale = 1): Body {
  const a = (clampAngle(angle) * Math.PI) / 180;
  const speed = (clampPower(power) / 100) * PHYSICS.maxSpeed;
  const start = muzzle(tank, clampAngle(angle));
  return {
    x: start.x,
    y: start.y,
    vx: tank.facing * speed * Math.cos(a),
    vy: -speed * Math.sin(a),
    age: 0,
    windScale,
  };
}

export function hitsTank(tank: Tank, x: number, y: number): boolean {
  if (tank.fell) return false;
  return Math.abs(x - tank.x) <= TANK.hitHalfWidth && y >= tank.y - TANK.hitHeight && y <= tank.y + 2;
}

export function hitsCrate(crate: Crate, x: number, y: number): boolean {
  return Math.abs(x - crate.x) <= CRATE.halfSize && y >= crate.y - CRATE.halfSize * 2 && y <= crate.y + 1;
}

export function groundAt(terrain: Float32Array, x: number): number {
  const xi = Math.floor(x);
  if (xi < 0 || xi >= WORLD_W) return WORLD_H;
  return terrain[xi];
}

/** 충돌 검사 한 단계: 탱크 → 상자 → 지형 → 화면 밖 순서 */
function collide(world: World, x: number, y: number): Impact | null {
  for (const side of ["player", "ai"] as const) {
    if (hitsTank(world.tanks[side], x, y)) return { kind: "tank", x, y, target: side };
  }
  if (world.crate && hitsCrate(world.crate, x, y)) return { kind: "crate", x, y };
  const xi = Math.floor(x);
  if (xi >= 0 && xi < WORLD_W && y >= world.terrain[xi]) return { kind: "terrain", x, y: world.terrain[xi] };
  if (x < -120 || x > WORLD_W + 120 || y > WORLD_H + 20) return { kind: "out", x, y };
  return null;
}

/**
 * 포탄을 dt초 진행한다(SUBSTEP 단위로 쪼개 충돌 검사). 충돌하면 그 자리에서 멈추고 Impact를 돌려준다.
 * dt는 SUBSTEP의 배수여야 한다(고정 스텝).
 */
export function stepBody(body: Body, world: World, dt: number): Impact | null {
  const ax = windAcceleration(world.wind, body.windScale);
  const ay = PHYSICS.gravity;
  const steps = Math.max(1, Math.round(dt / SUBSTEP));
  const h = SUBSTEP;
  for (let i = 0; i < steps; i++) {
    body.x += body.vx * h + 0.5 * ax * h * h;
    body.y += body.vy * h + 0.5 * ay * h * h;
    body.vx += ax * h;
    body.vy += ay * h;
    body.age += h;
    const impact = collide(world, body.x, body.y);
    if (impact) return impact;
    if (body.age >= PHYSICS.maxFlightTime) return { kind: "out", x: body.x, y: body.y };
  }
  return null;
}

export interface ShotResult {
  impact: Impact;
  /** 비행 시간(초) */
  time: number;
  /** 비행 중 target 차체 가운데에 가장 가까이 간 거리 (빗나간 탄도 평가용) */
  closest: number;
  path?: { x: number; y: number }[];
}

/**
 * 한 발을 끝까지 시뮬레이션한다(지형은 바꾸지 않음). AI 탐색·지형 검증·탄도 가이드가 쓴다.
 * recordEvery: 몇 SUBSTEP마다 경로 점을 기록할지 (0이면 기록 안 함)
 */
export function simulateShot(world: World, shooter: Side, angle: number, power: number, windScale = 1, recordEvery = 0): ShotResult {
  const tank = world.tanks[shooter];
  const target = world.tanks[shooter === "player" ? "ai" : "player"];
  const body = launchBody(tank, angle, power, windScale);
  const path = recordEvery > 0 ? [{ x: body.x, y: body.y }] : undefined;
  let closest = Infinity;
  let count = 0;
  const targetY = target.y - TANK.hitHeight / 2;
  for (;;) {
    const impact = stepBody(body, world, SUBSTEP);
    const d = Math.hypot(body.x - target.x, body.y - targetY);
    if (d < closest) closest = d;
    count++;
    if (path && count % recordEvery === 0) path.push({ x: body.x, y: body.y });
    if (impact) {
      if (path) path.push({ x: impact.x, y: impact.y });
      return { impact, time: body.age, closest, path };
    }
  }
}
