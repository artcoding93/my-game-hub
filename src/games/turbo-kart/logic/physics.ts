import { BOOSTER, COLLISION, DRIFT, ITEM_FX, KART, SURFACES } from "../config";
import type { Difficulty, DriveInput, Kart, Mover, Obstacle, RaceEvent, Surface } from "../types";
import { roadAt, surfaceAt, wallContact, type BuiltTrack } from "./track";

/*
 * 아케이드 카트 물리 (플레이어와 AI가 똑같이 쓴다). 고정 시간 간격으로만 호출한다.
 *
 * 속도는 월드 벡터(vx, vy)로 들고, 매 스텝 진행 방향(전진 성분)과 옆 방향(횡 성분)으로 나눠 처리한다.
 * - 전진: 가속·브레이크·후진·자연 감속·노면 저항, 최고 속도(노면·부스터·아이템 배율, 합산 상한)
 * - 조향: 속도에 비례하는 각속도 (정지 상태에서는 돌지 않음)
 * - 횡: 접지력만큼 지수 감쇠 → 접지력이 낮을수록(드리프트·얼음) 옆으로 미끄러진다
 * - 드리프트: 일정 속도 이상 + 조향 + 드리프트 입력. 회전 반경이 줄고 접지력이 낮아지며,
 *   실제로 옆으로 미끄러질 때만 부스터 게이지가 찬다(직선에서 버튼만 눌러서는 차지 않음, 벽 충돌 후 잠시 중단)
 */

export interface DriveEnv {
  track: BuiltTrack;
  difficulty: Difficulty;
  obstacles: readonly Obstacle[];
  movers: readonly Mover[];
}

export const NO_INPUT: DriveInput = { throttle: false, brake: false, steer: 0, drift: false, boost: false, item: false };

/** 부스터·아이템이 겹쳐도 합산 상한을 넘지 않는 최고 속도 배율 */
export function speedScale(kart: Kart): number {
  let scale = 1;
  if (kart.boostTime > 0) scale *= BOOSTER.speedScale;
  if (kart.turboTime > 0) scale *= ITEM_FX.turboSpeedScale;
  if (kart.windTime > 0) scale *= ITEM_FX.windSpeedScale;
  scale = Math.min(scale, BOOSTER.maxCombinedScale);
  if (kart.slowTime > 0) scale *= ITEM_FX.slowSpeedScale;
  return scale;
}

function accelScale(kart: Kart): number {
  let scale = 1;
  if (kart.boostTime > 0) scale = Math.max(scale, BOOSTER.accelScale);
  if (kart.turboTime > 0) scale = Math.max(scale, ITEM_FX.turboAccelScale);
  if (kart.windTime > 0) scale = Math.max(scale, ITEM_FX.windAccelScale);
  return scale;
}

export function maxSpeedOf(kart: Kart, surface: Surface): number {
  return KART.maxSpeed * SURFACES[surface].maxSpeed * speedScale(kart);
}

export function speedOf(kart: Kart): number {
  return Math.hypot(kart.vx, kart.vy);
}

/** 부스터 게이지가 가득 차 있고 쿨다운이 끝났으면 2초 부스터 */
export function tryBoost(kart: Kart, events: RaceEvent[]): boolean {
  if (kart.gauge < 100 || kart.boostTime > 0 || kart.boostCooldown > 0 || kart.frozenTime > 0) return false;
  kart.gauge = 0;
  kart.boostTime = BOOSTER.duration;
  events.push({ type: "boost", kart: kart.index });
  return true;
}

function tick(kart: Kart, dt: number) {
  const dec = (v: number) => Math.max(0, v - dt);
  const wasBoosting = kart.boostTime > 0;
  kart.boostTime = dec(kart.boostTime);
  if (wasBoosting && kart.boostTime === 0) kart.boostCooldown = BOOSTER.cooldown;
  else kart.boostCooldown = dec(kart.boostCooldown);
  kart.turboTime = dec(kart.turboTime);
  kart.windTime = dec(kart.windTime);
  kart.shieldTime = dec(kart.shieldTime);
  kart.slowTime = dec(kart.slowTime);
  kart.spinTime = dec(kart.spinTime);
  kart.smokeTime = dec(kart.smokeTime);
  kart.protectTime = dec(kart.protectTime);
  kart.wallTime = dec(kart.wallTime);
  kart.frozenTime = dec(kart.frozenTime);
}

/** 조작 입력으로 속도·방향을 갱신한다 (이동·충돌은 moveKart). */
export function driveKart(kart: Kart, input: DriveInput, env: DriveEnv, dt: number, events: RaceEvent[]) {
  tick(kart, dt);
  const road = roadAt(env.track, kart.x, kart.y);
  const surface = surfaceAt(env.track, road, env.difficulty);
  kart.surface = surface;
  const surf = SURFACES[surface];

  if (kart.frozenTime > 0) {
    kart.vx = 0;
    kart.vy = 0;
    kart.drifting = false;
    kart.driftCharging = false;
    return;
  }
  if (input.boost) tryBoost(kart, events);

  let fx = Math.cos(kart.heading);
  let fy = Math.sin(kart.heading);
  const vF0 = kart.vx * fx + kart.vy * fy;
  const steer = kart.spinTime > 0 ? 0 : Math.max(-1, Math.min(1, input.steer));

  // 드리프트 시작·유지 조건
  const fastEnough = vF0 >= KART.maxSpeed * DRIFT.minSpeedRatio;
  if (!kart.drifting && input.drift && steer !== 0 && fastEnough && kart.spinTime === 0) {
    kart.drifting = true;
    kart.driftDir = Math.sign(steer);
  }
  if (kart.drifting && (!input.drift || vF0 < KART.maxSpeed * DRIFT.minSpeedRatio * 0.7 || kart.spinTime > 0)) kart.drifting = false;

  // 조향 (속도 비례). 드리프트 중에는 드리프트 방향으로 계속 돌고, 조향으로 각도를 조절한다.
  const speedFactor = Math.min(1, Math.abs(vF0) / KART.turnRefSpeed) * Math.sign(vF0 || 1);
  let turn = steer * KART.turnRate * speedFactor;
  if (kart.drifting) turn = (kart.driftDir * 0.55 + steer * 0.45) * KART.turnRate * KART.driftTurnScale * speedFactor;
  if (kart.spinTime > 0) turn = 9 * (kart.index % 2 ? 1 : -1) * Math.min(1, kart.spinTime);
  kart.heading += turn * dt;

  fx = Math.cos(kart.heading);
  fy = Math.sin(kart.heading);
  const rx = -fy;
  const ry = fx;
  let vF = kart.vx * fx + kart.vy * fy;
  let vR = kart.vx * rx + kart.vy * ry;

  const maxSpeed = maxSpeedOf(kart, surface);
  const accel = KART.accel * accelScale(kart);
  if (input.throttle && !input.brake) {
    if (vF < maxSpeed) vF = Math.min(maxSpeed, vF + accel * dt * (vF < 0 ? 2 : 1));
  } else if (input.brake) {
    vF = vF > 0 ? Math.max(0, vF - KART.brake * dt) : Math.max(-KART.reverseMax, vF - accel * 0.6 * dt);
  } else {
    vF -= vF * KART.coastDrag * dt;
  }
  // 최고 속도를 넘으면(부스터가 끝났거나 감속 노면) 서서히 줄인다
  if (vF > maxSpeed) vF = Math.max(maxSpeed, vF - 520 * dt);
  vF -= vF * surf.drag * dt;

  let grip = KART.grip * surf.grip;
  if (kart.drifting) grip = Math.min(grip, KART.driftGrip);
  if (kart.spinTime > 0) grip = 0.8;
  vR *= Math.exp(-grip * dt);

  kart.vx = fx * vF + rx * vR;
  kart.vy = fy * vF + ry * vR;

  kart.driftCharging =
    kart.drifting && Math.abs(vR) >= DRIFT.minSlip && kart.wallTime === 0 && kart.boostTime === 0 && kart.boostCooldown === 0 && surface !== "offroad";
  if (kart.driftCharging) kart.gauge = Math.min(100, kart.gauge + DRIFT.chargePerSecond * dt);
}

/** 위치를 옮기고 벽·장애물에 부딪히면 밀어낸다. 카트끼리 충돌은 resolveKarts. 도로 범위 밖이면 false. */
export function moveKart(kart: Kart, env: DriveEnv, dt: number, events: RaceEvent[]): boolean {
  kart.x += kart.vx * dt;
  kart.y += kart.vy * dt;

  const contact = wallContact(env.track, kart.x, kart.y, KART.radius * 0.6);
  if (contact === "outside") return false;
  if (contact) {
    const { road, wall } = contact;
    // 벽: 안쪽으로 밀어내고 바깥 방향 속도를 없앤 뒤 감속
    kart.x = road.cx + road.nx * wall;
    kart.y = road.cy + road.ny * wall;
    const vn = kart.vx * road.nx + kart.vy * road.ny;
    if (vn > 0) {
      kart.vx -= road.nx * vn * (1 + COLLISION.restitution);
      kart.vy -= road.ny * vn * (1 + COLLISION.restitution);
      // 세게 부딪히면 절반으로 감속. 살짝 스치면 바깥 방향 속도만 없애고 벽을 따라 미끄러진다
      const keep = vn > 80 ? COLLISION.wallKeep : 1;
      kart.vx *= keep;
      kart.vy *= keep;
      if (vn > 80) events.push({ type: "wall", kart: kart.index, speed: vn });
    }
    kart.wallTime = DRIFT.wallPause;
    kart.drifting = false;
  }

  const bump = (ox: number, oy: number, r: number) => {
    const dx = kart.x - ox;
    const dy = kart.y - oy;
    const d = Math.hypot(dx, dy);
    const min = r + KART.radius;
    if (d >= min) return;
    const nx = d > 1e-6 ? dx / d : Math.cos(kart.heading + Math.PI);
    const ny = d > 1e-6 ? dy / d : Math.sin(kart.heading + Math.PI);
    kart.x = ox + nx * min;
    kart.y = oy + ny * min;
    const vn = kart.vx * nx + kart.vy * ny;
    if (vn < 0) {
      kart.vx -= nx * vn * (1 + COLLISION.restitution);
      kart.vy -= ny * vn * (1 + COLLISION.restitution);
      kart.vx *= COLLISION.wallKeep;
      kart.vy *= COLLISION.wallKeep;
      kart.wallTime = DRIFT.wallPause;
      kart.drifting = false;
      if (vn < -60) events.push({ type: "obstacle", kart: kart.index, x: ox, y: oy });
    }
  };
  for (const o of env.obstacles) bump(o.x, o.y, o.r);
  for (const m of env.movers) bump(m.x, m.y, m.r);
  return true;
}

/** 카트끼리 겹치면 반씩 밀어내고 부딪힌 방향 속도를 나눈다(질량 같음). 지나치게 튕기지 않도록 반발을 작게 둔다. */
export function resolveKarts(karts: Kart[], events: RaceEvent[]) {
  const min = KART.radius * 2;
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i];
      const b = karts[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= min || d < 1e-6) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (min - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const impulse = (-(1 + COLLISION.kartRestitution) * rel) / 2;
        a.vx -= nx * impulse;
        a.vy -= ny * impulse;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
        if (rel < -80) events.push({ type: "bump", kart: a.index, other: b.index });
      }
    }
  }
}
