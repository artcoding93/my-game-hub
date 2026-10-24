import { JUMP, LEDGE, MOVE } from "../config";
import {
  armTo,
  clamp,
  forwardKinematics,
  LEG_LENGTH,
  legTo,
  lerp,
  lerpArm,
  lerpAngle,
  plantedAnkle,
  rotatePose,
  shoulderOf,
  smootherstep,
  smoothstep,
  STAND_HIP,
  type ArmPose,
  type LegPose,
  type Pose,
  type Vec,
} from "./skeleton";

/*
 * 동작별 포즈 생성기. 모두 "오른쪽을 보는" 지역 좌표(원점 = 물리 발 위치, y = 위)의 Pose를 돌려준다.
 * 땅을 딛는 발과 난간을 잡는 손은 목표 위치를 정하고 IK로 관절 각도를 구한다(접지·손 위치가 물리와 일치).
 * 공중 자세처럼 접촉이 없는 동작은 관절 각도 키 포즈를 속도·시간에 따라 섞는다.
 */

const TAU = Math.PI * 2;

// ── 서기 ──

/** 숨쉬기(3.6초 주기)·체중 이동(7.3초)·가끔 고개 돌림이 있는 대기 자세. dip은 착지 충격 등으로 엉덩이를 낮추는 양 */
export function idlePose(time: number, lean = 0, dip = 0): Pose {
  const breath = Math.sin((TAU * time) / 3.6);
  const sway = Math.sin((TAU * time) / 7.3 + 0.6);
  // 9초마다 1.6초 동안 살짝 앞을 살피는 동작
  const cycle = time % 9;
  const glance = cycle > 6 && cycle < 7.6 ? Math.sin((Math.PI * (cycle - 6)) / 1.6) : 0;
  const hip = { x: 0.7 * sway, y: STAND_HIP - 0.7 - 0.35 * (breath * 0.5 + 0.5) - dip };
  return {
    hipX: hip.x,
    hipY: hip.y,
    lean: 0.035 + 0.012 * breath + lean,
    head: -0.03 - 0.012 * breath - 0.1 * glance - lean * 0.5,
    legN: legTo(hip, plantedAnkle(5, 0, 0), 0),
    legF: legTo(hip, plantedAnkle(-4, 0, 0), 0),
    armN: { upper: -0.04 + 0.02 * breath - 0.03 * sway, fore: 0.14 + 0.03 * breath },
    armF: { upper: 0.05 + 0.02 * breath, fore: 0.2 + 0.02 * breath },
  };
}

// ── 걷기·달리기 ──

export interface Gait {
  /** 0 = 걷기, 1 = 달리기 */
  run: number;
  /** 걷기 속도 대비 (느린 출발 시 보폭·팔 흔들림 축소) */
  walk: number;
  /** 한 주기(왼발+오른발 두 걸음) 동안 몸이 나아가는 거리 */
  cycle: number;
  /** 한 발이 땅에 닿아 있는 비율. 걷기 0.62(양발 지지 구간), 달리기 0.36(공중 구간) */
  duty: number;
  /** 디딤발이 몸 뒤로 지나가는 거리 = duty × cycle */
  stance: number;
}

export function gaitFor(speed: number): Gait {
  const walkSpeed = MOVE.walkSpeed;
  const run = smoothstep((speed - walkSpeed * 1.05) / (MOVE.runSpeed - walkSpeed * 1.05));
  const walk = clamp(speed / walkSpeed, 0, 1);
  const cycle = speed < walkSpeed ? lerp(26, 58, walk) : lerp(58, 132, run);
  const duty = lerp(0.62, 0.36, run);
  return { run, walk, cycle, duty, stance: duty * cycle };
}

export interface FootSample {
  ankle: Vec;
  foot: number;
  grounded: boolean;
}

/**
 * 걸음 주기 위상 p(0~1)에서 발 위치. 디딤 구간에서는 발이 몸 뒤로 정확히 이동 속도만큼 지나가므로
 * (위상이 이동 거리 / cycle로 진행) 월드 좌표에서 발이 미끄러지지 않는다.
 */
export function footAt(p: number, g: Gait): FootSample {
  const { duty: D, stance: S, run: r, walk: w } = g;
  const center = lerp(0.5, 2.5, r);
  const strikeTilt = (1 - r) * 0.28;
  const offTilt = -lerp(0.55, 0.8, r);
  if (p < D) {
    const u = p / D;
    const offStart = lerp(0.68, 0.55, r);
    const tilt = strikeTilt * (1 - smoothstep(u / 0.2)) + offTilt * smoothstep((u - offStart) / (1 - offStart));
    return { ankle: plantedAnkle(center + S / 2 - u * S, 0, tilt), foot: tilt, grounded: true };
  }
  const u = (p - D) / (1 - D);
  // 흔드는 다리: 걷기는 낮은 호, 달리기는 뒤꿈치를 엉덩이 쪽으로 차올린 뒤 무릎을 앞으로 끌고 나온다.
  const e = smootherstep(lerp(u, Math.pow(u, 1.4), r));
  const x = center - S / 2 + e * S + r * 6 * Math.sin(Math.PI * u) * u;
  const lift = lerp(4.5 * w + 0.5, 16, r);
  const h = lift * Math.sin(Math.PI * Math.pow(u, lerp(0.85, 0.6, r)));
  const tilt = lerp(offTilt, strikeTilt, smoothstep(u)) - r * 0.45 * Math.sin(Math.PI * u);
  return { ankle: plantedAnkle(x, h, tilt), foot: tilt, grounded: false };
}

/** 위상 → 다리 앞뒤 위치의 매끄러운 주기 (0 = 가장 앞, 0.5 = 가장 뒤). 팔 흔들기에 쓴다 */
function swingCycle(p: number, D: number) {
  return p < D ? (0.5 * p) / D : 0.5 + (0.5 * (p - D)) / (1 - D);
}

/** 두 값 중 작은 값에 가깝게 매끄럽게 (꺾임 없는 min) */
function softMin(a: number, b: number, k = 1.2) {
  return -k * Math.log(Math.exp(-a / k) + Math.exp(-b / k));
}

export interface LocoOptions {
  /** 가속·제동에 따른 추가 기울기 (스프링) */
  lean?: number;
  dip?: number;
}

export function locomotionPose(speed: number, phase: number, options: LocoOptions = {}): Pose {
  const g = gaitFor(speed);
  const { run: r, walk: w, duty: D } = g;
  const pN = phase % 1;
  const pF = (phase + 0.5) % 1;
  const footN = footAt(pN, g);
  const footF = footAt(pF, g);

  // 엉덩이 높이: 걷기는 디딤발 위로 올라타는 역진자(디딤 중간에 가장 높음),
  // 달리기는 디딤 중간에 무릎이 눌려 가장 낮고 공중 구간에서 높다. 디딤발이 닿을 수 있는 높이를 넘지 않는다.
  const bob = Math.cos(2 * TAU * (pN - D / 2));
  const walkHip = STAND_HIP - 0.9 + 1.1 * bob * w;
  const runHip = STAND_HIP - 4.6 - 2.4 * bob;
  const hipX = lerp(0.5, 3, r);
  let hipY = lerp(walkHip, runHip, r) - (options.dip ?? 0);
  // 흔드는 발도 포함: 디딤 직전 발이 닿지 않아 엉덩이가 착지 순간 툭 떨어지는 것을 막는다
  for (const f of [footN, footF]) {
    const dx = f.ankle.x - hipX;
    const reach = f.ankle.y + Math.sqrt(Math.max(0, (LEG_LENGTH * 0.985) ** 2 - dx * dx));
    hipY = softMin(hipY, reach);
  }
  const hip = { x: hipX, y: hipY };

  const lean = lerp(0.06, 0.21, r) * w + 0.018 * r * Math.cos(2 * TAU * (pN - D / 2 - 0.06)) + (options.lean ?? 0);
  // 팔: 반대쪽 다리와 함께 움직인다(앞쪽 팔 ↔ 뒤쪽 다리). 다리보다 조금 늦게 따라온다.
  const armAmp = lerp(0.3, 0.74, r) * (0.35 + 0.65 * w);
  const flex = lerp(0.22, 1.45, r);
  const arm = (legPhase: number): ArmPose => {
    const swing = Math.cos(TAU * (swingCycle(legPhase, D) - 0.035));
    const upper = -0.06 - 0.12 * r + armAmp * swing;
    return { upper, fore: upper + flex + 0.2 * Math.max(0, swing) * (1 + r) };
  };

  return {
    hipX: hip.x,
    hipY: hip.y,
    lean,
    head: -lean * 0.6 + 0.02 * bob * r,
    legN: legTo(hip, footN.ankle, footN.foot),
    legF: legTo(hip, footF.ankle, footF.foot),
    armN: arm(pF),
    armF: arm(pN),
  };
}

// ── 정지·방향 전환 ──

/** 미끄러지며 멈추기: 앞발 뒤꿈치로 제동, 뒷발은 발끝, 팔을 앞뒤로 벌려 균형을 잡는다. k = 남은 속도 비율 */
export function skidPose(k: number, lean = 0, dip = 0): Pose {
  const hip = { x: -1.5 - 2 * k, y: STAND_HIP - 5 - 4 * k - dip };
  return {
    hipX: hip.x,
    hipY: hip.y,
    lean: 0.02 - 0.1 * k + lean,
    head: 0.06 - lean * 0.4,
    legN: legTo(hip, plantedAnkle(12 + 5 * k, 0, 0.32 * k), 0.32 * k),
    legF: legTo(hip, plantedAnkle(-7, 0, -0.35), -0.35),
    armN: { upper: 0.55 + 0.35 * k, fore: 1.25 + 0.2 * k },
    armF: { upper: -0.45 - 0.3 * k, fore: -0.15 },
  };
}

// ── 점프 ──

/**
 * 도약 준비: 무릎을 굽혀 몸을 낮추고 팔을 뒤로 젖힌다. e = 진행도(0~1).
 * reach(0~1): 바로 앞이 벽이면 팔을 덜 젖힌다(곧바로 머리 위로 뻗어 난간을 잡을 준비).
 */
export function jumpPrepPose(e: number, dip = 0, reach = 0): Pose {
  const k = smoothstep(e) * (1 - 0.65 * reach);
  const crouch = smoothstep(e);
  const hip = { x: 1.5 * crouch, y: STAND_HIP - 10 * crouch - dip };
  return {
    hipX: hip.x,
    hipY: hip.y,
    lean: 0.05 + 0.34 * crouch - 0.12 * reach * crouch,
    head: -0.18 * crouch + 0.25 * reach * crouch,
    legN: legTo(hip, plantedAnkle(4.5, 0, -0.1 * crouch), -0.1 * crouch),
    legF: legTo(hip, plantedAnkle(-3.5, 0, -0.12 * crouch), -0.12 * crouch),
    armN: { upper: -0.8 * k, fore: -0.45 * k + 0.15 },
    armF: { upper: -0.62 * k, fore: -0.3 * k + 0.2 },
  };
}

const leg = (thigh: number, shin: number, foot: number): LegPose => ({ thigh, shin, foot });
const arm = (upper: number, fore: number): ArmPose => ({ upper, fore });

interface AirKey {
  lean: number;
  head: number;
  hipY: number;
  legN: LegPose;
  legF: LegPose;
  armN: ArmPose;
  armF: ArmPose;
}

// 제자리 점프: 밀어내며 몸을 편다 → 무릎을 모은다 → 다리를 내려 착지를 준비한다
const STAND_TAKEOFF: AirKey = { lean: 0.1, head: -0.08, hipY: STAND_HIP + 1, legN: leg(0.05, -0.05, -0.7), legF: leg(-0.12, -0.2, -0.8), armN: arm(1.35, 1.85), armF: arm(1.15, 1.65) };
const STAND_TUCK: AirKey = { lean: 0.16, head: -0.1, hipY: STAND_HIP, legN: leg(1.2, -0.15, -0.25), legF: leg(0.9, -0.45, -0.35), armN: arm(1.35, 1.9), armF: arm(1.1, 1.7) };
const STAND_FALL: AirKey = { lean: -0.04, head: 0.06, hipY: STAND_HIP, legN: leg(0.42, -0.05, 0.1), legF: leg(0.05, -0.45, -0.2), armN: arm(1.85, 2.15), armF: arm(2.1, 2.45) };
// 달리기 점프: 뒷발로 차고 앞무릎을 끌어올린다 → 다리를 앞뒤로 벌린 도약 → 앞발을 내밀어 착지 준비
const RUN_TAKEOFF: AirKey = { lean: 0.22, head: -0.12, hipY: STAND_HIP - 1, legN: leg(1.15, 0.35, -0.2), legF: leg(-0.55, -0.45, -0.9), armN: arm(-0.6, -0.1), armF: arm(0.8, 1.85) };
const RUN_LEAP: AirKey = { lean: 0.2, head: -0.1, hipY: STAND_HIP - 1, legN: leg(1.25, 0.75, 0.1), legF: leg(-0.5, -1.7, -0.6), armN: arm(-0.4, 0.2), armF: arm(1.1, 2.0) };
const RUN_FALL: AirKey = { lean: 0.08, head: 0.02, hipY: STAND_HIP - 1, legN: leg(0.85, 0.25, 0.2), legF: leg(0.2, -0.75, -0.3), armN: arm(0.6, 1.4), armF: arm(1.35, 2.1) };

function mixKey(a: AirKey, b: AirKey, t: number): AirKey {
  const ml = (x: LegPose, y: LegPose) => leg(lerpAngle(x.thigh, y.thigh, t), lerpAngle(x.shin, y.shin, t), lerpAngle(x.foot, y.foot, t));
  const ma = (x: ArmPose, y: ArmPose) => lerpArm(x, y, t);
  return {
    lean: lerp(a.lean, b.lean, t),
    head: lerp(a.head, b.head, t),
    hipY: lerp(a.hipY, b.hipY, t),
    legN: ml(a.legN, b.legN),
    legF: ml(a.legF, b.legF),
    armN: ma(a.armN, b.armN),
    armF: ma(a.armF, b.armF),
  };
}

export interface AirOptions {
  vx: number;
  vy: number;
  /** 공중에 뜬 시간 */
  airTime: number;
  /** 아래로 떨어지기 시작한 뒤 지난 시간 (긴 낙하의 팔 버둥거림) */
  fallTime: number;
  time: number;
  /** 점프로 뜬 것인지 (발판에서 걸어 떨어지거나 손을 놓은 경우 false) */
  jumped: boolean;
  /** 0~1: 바로 앞이 벽이면 팔을 앞이 아니라 머리 위로 뻗어 난간을 찾는다 (애니메이터가 부드럽게 바꿔 준다) */
  reach: number;
}

/** 공중 자세: 수직 속도로 상승→정점→낙하 자세를, 수평 속도로 제자리/달리기 도약 자세를 연속으로 섞는다 */
export function airPose(o: AirOptions): Pose {
  const V = JUMP.velocity;
  const u = clamp((o.vy + V) / (2 * V), 0, 1.3);
  const takeoff = o.jumped ? 1 - smoothstep(o.airTime / 0.16) : 0;
  const fall = smoothstep((u - 0.42) / 0.45);
  const leap = smoothstep((Math.abs(o.vx) - 100) / (MOVE.runSpeed - 100));
  const stand = mixKey(mixKey(STAND_TUCK, STAND_FALL, fall), STAND_TAKEOFF, takeoff);
  const run = mixKey(mixKey(RUN_LEAP, RUN_FALL, fall), RUN_TAKEOFF, takeoff);
  const k = mixKey(stand, run, leap);

  // 오래 떨어지면 팔을 위로 벌리고 다리를 살짝 젓는다
  const flail = smoothstep((o.fallTime - 0.35) / 0.4);
  const wave = Math.sin(o.time * 8.5);
  const wave2 = Math.sin(o.time * 8.5 + 2.1);
  // 벽 앞: 팔이 돌을 뚫지 않도록 머리 위로 뻗는다 (제자리에서 뛰어 난간을 잡는 동작)
  const reach = o.reach;
  // 발판에서 걸어 떨어지면(점프가 아니면) 팔이 갑자기 들리지 않고 떨어지면서 서서히 올라간다
  const lift = o.jumped ? 1 : smoothstep(o.airTime / 0.35);
  const armN = mixArm(mixArm(arm(0.25, 0.55), k.armN, lift), arm(2.75, 2.95), reach);
  const armF = mixArm(mixArm(arm(0.1, 0.4), k.armF, lift), arm(2.55, 2.85), reach);
  return {
    hipX: 0,
    hipY: k.hipY,
    lean: k.lean - 0.05 * flail - 0.08 * reach,
    head: k.head + 0.08 * flail,
    // 긴 낙하: 무릎을 굽혀 다리를 앞뒤로 벌리고, 팔은 위·옆으로 벌려 균형을 잡는다
    legN: { ...k.legN, thigh: k.legN.thigh + flail * (0.3 + 0.12 * wave), shin: k.legN.shin - flail * 0.45, foot: k.legN.foot - flail * 0.2 },
    legF: { ...k.legF, thigh: k.legF.thigh - flail * (0.12 + 0.12 * wave), shin: k.legF.shin - flail * 0.55 },
    armN: { upper: armN.upper + flail * (0.45 + 0.15 * wave), fore: armN.fore + flail * (0.35 + 0.15 * wave2) },
    armF: { upper: armF.upper + flail * (0.65 + 0.15 * wave2), fore: armF.fore + flail * (0.4 + 0.15 * wave) },
  };
}

// ── 착지 ──

export interface LandOptions {
  /** 충격 0~1 (낙하 속도 기준) */
  impact: number;
  /** 착지 후 시간 */
  time: number;
  heavy: boolean;
}

/** 착지: 무릎을 굽혀 충격을 흡수했다가 일어선다. 큰 착지는 더 깊이 앉고 앞쪽 손으로 바닥을 짚는다 */
export function landPose(o: LandOptions): Pose {
  const h = clamp(o.impact, 0, 1);
  const peak = 0.07 + 0.1 * h;
  const hold = o.heavy ? 0.16 : 0.02;
  const recover = o.heavy ? 0.22 : 0.12;
  const t = o.time;
  const env = t < peak ? smoothstep(t / peak) : t < peak + hold ? 1 : 1 - smoothstep((t - peak - hold) / recover);
  const depth = lerp(7, 21, h);
  const hip = { x: lerp(1, 3, h) * env, y: STAND_HIP - depth * env };
  // 상체는 무릎보다 조금 늦게 숙여진다 (충격이 아래에서 위로 전달)
  const leanEnv = t < peak * 1.25 ? smoothstep(t / (peak * 1.25)) : env;
  const lean = 0.05 + (0.3 + 0.45 * h) * leanEnv;
  // 착지 직후 팔은 공중 자세(앞·위)에서 내려오기 시작한다
  const early = 1 - smoothstep(t / 0.42);
  let armN: ArmPose = { upper: lerp(0.55 * env, 1.85, early), fore: lerp(0.95 * env + 0.1, 2.15, early) };
  if (o.heavy) {
    const shoulder = shoulderOf(hip, lean, false);
    const reach = armTo(shoulder, { x: 14, y: 4.5 }, -1);
    // 손은 무릎이 먼저 굽은 뒤 조금 늦게 바닥에 닿는다
    const w = h * smoothstep(t / 0.3) * (t < peak + hold ? 1 : env);
    armN = { upper: lerpAngle(armN.upper, reach.upper, w), fore: lerpAngle(armN.fore, reach.fore, w) };
  }
  return {
    hipX: hip.x,
    hipY: hip.y,
    lean,
    head: 0.04 - 0.28 * h * env,
    legN: legTo(hip, plantedAnkle(6 + 2 * h, 0, 0), 0),
    legF: legTo(hip, plantedAnkle(-4 - 2 * h, 0, -0.25 * env), -0.25 * env),
    armN,
    armF: { upper: lerp(-0.2 + (0.9 * h - 0.4) * env, 2.0, early), fore: lerp(0.1 + 0.8 * h * env, 2.35, early) },
  };
}

// ── 매달리기·올라오기 ──
// 아래 좌표는 난간 모서리 기준(벽면 x = 0, 윗면 y = 0, 돌은 x > 0·y < 0 쪽). 물리 발 위치는 모서리에서 (-hangOffsetX, -hangDepth).

/** 모서리 기준 좌표 → 물리 발 위치 기준 좌표 */
export const CORNER_TO_ANCHOR: Vec = { x: LEDGE.hangOffsetX, y: LEDGE.hangDepth };

/** 매달린 손 위치 (손가락이 모서리를 감싼다) */
export const HAND_N: Vec = { x: 2, y: 1.5 };
export const HAND_F: Vec = { x: 0.5, y: 2.2 };

type LimbKey = { ik: Vec; foot?: number; lift?: number } | { fk: LegPose | ArmPose };

interface ClimbKey {
  t: number;
  hip: Vec;
  lean: number;
  head: number;
  legN: LimbKey;
  legF: LimbKey;
  armN: LimbKey;
  armF: LimbKey;
}

function hangKey(breath: number): ClimbKey {
  return {
    t: 0,
    hip: { x: -7, y: -44 + 0.35 * breath },
    lean: 0.12,
    head: 0.1,
    legN: { ik: { x: -7, y: -78.6 + 0.35 * breath }, foot: -0.5 },
    legF: { ik: { x: -10, y: -78 + 0.35 * breath }, foot: -0.6 },
    armN: { ik: HAND_N },
    armF: { ik: HAND_F },
  };
}

/** 올라오기가 끝나는 자세 = 난간 위 대기 자세의 시작 (끊김 없이 이어지도록 같은 함수를 쓴다) */
function standKey(): ClimbKey {
  const idle = idlePose(0);
  const j = forwardKinematics(idle);
  const off = LEDGE.standX;
  return {
    t: 1,
    hip: { x: idle.hipX + off, y: idle.hipY },
    lean: idle.lean,
    head: idle.head,
    legN: { ik: { x: j.legN.ankle.x + off, y: j.legN.ankle.y }, foot: 0, lift: 5 },
    legF: { ik: { x: j.legF.ankle.x + off, y: j.legF.ankle.y }, foot: 0, lift: 7 },
    armN: { fk: idle.armN },
    armF: { fk: idle.armF },
  };
}

/*
 * 올라오기 키 포즈: 매달림 → 턱걸이(가슴이 난간 높이) → 어깨가 손 위로 → 팔로 밀며 상체를 난간 위로
 * → 앞무릎을 난간에 올림 → 앞발을 딛고 일어섬 → 선 자세. 손은 밀어 올리는 구간까지 모서리에 고정된다.
 * 모든 관절이 돌(x > 0, y < 0) 안으로 들어가지 않도록 잡았다(animation.test.ts가 검사).
 */
const CLIMB_KEYS: ClimbKey[] = [
  hangKey(0),
  {
    // 턱걸이: 가슴이 난간 높이까지, 팔꿈치는 몸 뒤로
    t: 0.22,
    hip: { x: -8, y: -25 },
    lean: 0.2,
    head: 0.02,
    legN: { fk: leg(0.22, -0.35, -0.4) },
    legF: { fk: leg(0.08, -0.6, -0.5) },
    armN: { ik: HAND_N },
    armF: { ik: HAND_F },
  },
  {
    // 어깨가 손 위로 올라오며 팔뚝을 난간 위에 얹는다
    t: 0.43,
    hip: { x: -8, y: -6 },
    lean: 0.55,
    head: -0.1,
    legN: { fk: leg(0.12, -0.2, -0.3) },
    legF: { fk: leg(0.02, -0.45, -0.45) },
    armN: { ik: HAND_N },
    armF: { ik: HAND_F },
  },
  {
    // 팔뚝으로 버티며 상체를 난간 위로 내민다
    t: 0.53,
    hip: { x: -4.5, y: 3 },
    lean: 0.95,
    head: -0.3,
    legN: { fk: leg(-0.05, -0.25, -0.35) },
    legF: { fk: leg(-0.12, -0.4, -0.45) },
    armN: { ik: HAND_N },
    armF: { ik: HAND_F },
  },
  {
    // 손을 앞으로 옮겨 짚고 팔을 펴서 엉덩이를 난간 높이 위로 밀어 올린다 (다리는 벽을 따라 늘어짐)
    t: 0.64,
    hip: { x: -6, y: 15 },
    lean: 1.0,
    head: -0.28,
    legN: { fk: leg(-0.08, -0.15, -0.4) },
    legF: { fk: leg(-0.15, -0.3, -0.45) },
    armN: { ik: { x: 9, y: 1.5 }, lift: 4 },
    armF: { ik: { x: 6.5, y: 1.8 }, lift: 3 },
  },
  {
    // 앞무릎을 난간 위로 올려 꿇는다
    t: 0.75,
    hip: { x: -5, y: 16.5 },
    lean: 1.0,
    head: -0.25,
    legN: { ik: { x: -9, y: 6 }, foot: -1.2 },
    legF: { fk: leg(-0.1, -0.25, -0.4) },
    armN: { ik: { x: 9, y: 1.5 } },
    armF: { ik: { x: 6.5, y: 1.8 } },
  },
  {
    // 앞발을 딛고 일어서며 뒷무릎이 난간 위로 따라온다
    t: 0.87,
    hip: { x: 6, y: 25 },
    lean: 0.5,
    head: -0.1,
    legN: { ik: plantedAnkle(10, 0, 0), foot: 0, lift: 9 },
    legF: { ik: { x: -4, y: 5 }, foot: -1.1 },
    armN: { fk: arm(0.5, 1.2) },
    armF: { fk: arm(0.25, 0.85) },
  },
  standKey(),
];

function resolveLeg(hip: Vec, key: LimbKey): LegPose {
  if ("fk" in key) return key.fk as LegPose;
  return legTo(hip, key.ik, key.foot ?? 0);
}

/**
 * 매달리기·올라오기의 팔은 항상 같은 쪽으로 굽힌다(bend +1): 매달렸을 때는 팔꿈치가 몸 뒤, 어깨가 손 위로 올라오면
 * 팔꿈치가 난간 위로 넘어가 팔뚝을 얹은 자세가 된다. 해를 중간에 바꾸면 팔꿈치가 순간이동하므로 바꾸지 않는다.
 */
function armToward(shoulder: Vec, hand: Vec): ArmPose {
  return armTo(shoulder, hand, 1);
}

function resolveArm(shoulder: Vec, key: LimbKey): ArmPose {
  if ("fk" in key) return key.fk as ArmPose;
  return armToward(shoulder, key.ik);
}

function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** Catmull-Rom: 키 사이 엉덩이 경로를 꺾임 없이 잇는다 */
function catmull(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

function limbBlend<T extends LegPose | ArmPose>(
  a: LimbKey,
  b: LimbKey,
  s: number,
  rootA: Vec,
  rootB: Vec,
  root: Vec,
  solveIk: (root: Vec, target: Vec, foot: number) => T,
  resolve: (root: Vec, key: LimbKey) => T,
  mix: (x: T, y: T, t: number) => T,
): T {
  if ("ik" in a && "ik" in b) {
    // 양쪽 키 모두 목표 위치면 위치를 보간해 IK로 푼다(손·발이 고정점을 벗어나지 않음). lift는 옮겨 딛는 호.
    const target = lerpVec(a.ik, b.ik, s);
    target.y += (b.lift ?? 0) * Math.sin(Math.PI * s);
    return solveIk(root, target, lerp(a.foot ?? 0, b.foot ?? 0, s));
  }
  return mix(resolve(rootA, a), resolve(rootB, b), s);
}

const mixLeg = (x: LegPose, y: LegPose, t: number) => leg(lerpAngle(x.thigh, y.thigh, t), lerpAngle(x.shin, y.shin, t), lerpAngle(x.foot, y.foot, t));
const mixArm = (x: ArmPose, y: ArmPose, t: number) => lerpArm(x, y, t);

function poseFromKeys(keys: ClimbKey[], t: number): Pose {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const raw = clamp((t - a.t) / (b.t - a.t), 0, 1);
  // 키마다 완전히 멈추지 않도록 선형과 smoothstep을 반씩 섞는다
  const s = lerp(raw, smoothstep(raw), 0.5);
  const hip = catmull(keys[Math.max(0, i - 1)].hip, a.hip, b.hip, keys[Math.min(keys.length - 1, i + 2)].hip, s);
  const lean = lerp(a.lean, b.lean, s);
  const shoulderN = shoulderOf(hip, lean, false);
  const shoulderF = shoulderOf(hip, lean, true);
  return {
    hipX: hip.x,
    hipY: hip.y,
    lean,
    head: lerp(a.head, b.head, s),
    legN: limbBlend(a.legN, b.legN, s, a.hip, b.hip, hip, (r, tg, f) => legTo(r, tg, f), resolveLeg, mixLeg),
    legF: limbBlend(a.legF, b.legF, s, a.hip, b.hip, hip, (r, tg, f) => legTo(r, tg, f), resolveLeg, mixLeg),
    armN: limbBlend(a.armN, b.armN, s, shoulderOf(a.hip, a.lean, false), shoulderOf(b.hip, b.lean, false), shoulderN, (r, tg) => armToward(r, tg), resolveArm, mixArm),
    armF: limbBlend(a.armF, b.armF, s, shoulderOf(a.hip, a.lean, true), shoulderOf(b.hip, b.lean, true), shoulderF, (r, tg) => armToward(r, tg), resolveArm, mixArm),
  };
}

function toAnchor(pose: Pose): Pose {
  return { ...pose, hipX: pose.hipX + CORNER_TO_ANCHOR.x, hipY: pose.hipY + CORNER_TO_ANCHOR.y };
}

/** 올라오기 포즈 (모서리 기준). t = 물리 climbT */
export function climbPoseAtCorner(t: number): Pose {
  return poseFromKeys(CLIMB_KEYS, t);
}

/** 올라오기 포즈 (물리 발 위치 기준) */
export function climbPose(t: number): Pose {
  return toAnchor(climbPoseAtCorner(t));
}

/** 매달린 포즈 (모서리 기준). swing = 손을 축으로 한 몸의 흔들림(+ = 다리가 벽 쪽), kick = 무릎 굽힘 추가 */
export function hangPoseAtCorner(time: number, swing: number, kick: number): Pose {
  const breath = Math.sin((TAU * time) / 3.2);
  const key = hangKey(breath);
  const base = poseFromKeys([key, { ...key, t: 1 }], 0);
  const sway = Math.sin(time * 1.7) * 0.04;
  const legs: Pose = {
    ...base,
    // kick: 흔들릴 때 다리가 뒤따라오며 무릎이 굽는다(정강이가 뒤로). 허벅지는 거의 그대로 두어 무릎이 벽에 박히지 않는다.
    legN: { thigh: base.legN.thigh + 0.02 + kick * 0.15, shin: base.legN.shin - sway - kick * 0.8, foot: base.legN.foot - kick * 0.3 },
    legF: { thigh: base.legF.thigh - 0.02 + kick * 0.1, shin: base.legF.shin + sway - kick * 1.0, foot: base.legF.foot - kick * 0.3 },
  };
  return rotatePose(legs, HAND_N, swing);
}

export function hangPose(time: number, swing: number, kick: number): Pose {
  return toAnchor(hangPoseAtCorner(time, swing, kick));
}
