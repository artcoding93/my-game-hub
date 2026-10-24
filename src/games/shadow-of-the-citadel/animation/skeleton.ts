/*
 * 2D 관절 골격. 좌표계: 캐릭터가 오른쪽을 본다고 가정한 지역 좌표(x = 앞, y = 위), 원점 = 발 위치(물리 좌표).
 * 왼쪽을 볼 때는 렌더러가 x를 뒤집는다.
 *
 * 팔다리 각도는 "절대 각도"로 저장한다: 0 = 아래로 늘어뜨림, +π/2 = 앞, π = 위, -π/2 = 뒤.
 * 몸통(lean)은 위 방향 기준 앞으로 숙인 각도, head는 몸통 대비 고개 각도, foot은 발바닥 기울기(0 = 평평, + = 발끝 듦).
 * 뼈 길이는 고정이므로 어떤 포즈든 팔다리가 늘어나거나 줄어들지 않는다.
 */

export const SK = {
  thigh: 18,
  shin: 18,
  /** 발목 높이(발바닥에서 발목까지) */
  ankle: 3,
  torso: 24,
  /** 목 아래에서 어깨까지 */
  shoulderDrop: 3.5,
  neck: 3,
  headR: 6.5,
  upperArm: 14,
  foreArm: 13,
  /** 발목 기준 발끝·뒤꿈치 위치 (평평할 때) */
  toe: { x: 8, y: -3 },
  heel: { x: -3, y: -3 },
} as const;

export const LEG_LENGTH = SK.thigh + SK.shin;
export const ARM_LENGTH = SK.upperArm + SK.foreArm;
/** 편히 선 자세의 엉덩이 높이 (무릎을 아주 살짝 굽힘) */
export const STAND_HIP = SK.ankle + LEG_LENGTH - 0.6;

export interface Vec {
  x: number;
  y: number;
}

export interface LegPose {
  thigh: number;
  shin: number;
  foot: number;
}

export interface ArmPose {
  upper: number;
  fore: number;
}

export interface Pose {
  hipX: number;
  hipY: number;
  lean: number;
  head: number;
  /** 화면 앞쪽(관찰자 쪽) 다리·팔 / 뒤쪽 다리·팔 */
  legN: LegPose;
  legF: LegPose;
  armN: ArmPose;
  armF: ArmPose;
}

export interface LegJoints {
  hip: Vec;
  knee: Vec;
  ankle: Vec;
  toe: Vec;
  heel: Vec;
}

export interface ArmJoints {
  shoulder: Vec;
  elbow: Vec;
  hand: Vec;
}

export interface Joints {
  hip: Vec;
  chest: Vec;
  neck: Vec;
  head: Vec;
  /** 머리 방향 (몸통 + 고개) */
  headAngle: number;
  legN: LegJoints;
  legF: LegJoints;
  armN: ArmJoints;
  armF: ArmJoints;
}

export function dirOf(angle: number): Vec {
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

const add = (a: Vec, b: Vec, s = 1): Vec => ({ x: a.x + b.x * s, y: a.y + b.y * s });

function rotate(v: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** 몸통 위쪽 방향 */
export function torsoUp(lean: number): Vec {
  return { x: Math.sin(lean), y: Math.cos(lean) };
}

/** 어깨 위치 (뒤쪽 어깨는 살짝 뒤·위) */
export function shoulderOf(hip: Vec, lean: number, far: boolean): Vec {
  const up = torsoUp(lean);
  const forward = { x: up.y, y: -up.x };
  const base = add(hip, up, SK.torso - SK.shoulderDrop);
  return add(base, forward, far ? -1.6 : -0.6);
}

function legJoints(hip: Vec, leg: LegPose): LegJoints {
  const knee = add(hip, dirOf(leg.thigh), SK.thigh);
  const ankle = add(knee, dirOf(leg.shin), SK.shin);
  return { hip, knee, ankle, toe: add(ankle, rotate(SK.toe, leg.foot)), heel: add(ankle, rotate(SK.heel, leg.foot)) };
}

function armJoints(shoulder: Vec, arm: ArmPose): ArmJoints {
  const elbow = add(shoulder, dirOf(arm.upper), SK.upperArm);
  return { shoulder, elbow, hand: add(elbow, dirOf(arm.fore), SK.foreArm) };
}

export function forwardKinematics(pose: Pose): Joints {
  const hip = { x: pose.hipX, y: pose.hipY };
  const up = torsoUp(pose.lean);
  const neck = add(hip, up, SK.torso);
  const headAngle = pose.lean + pose.head;
  const head = add(neck, torsoUp(headAngle), SK.neck + SK.headR);
  return {
    hip,
    chest: add(hip, up, SK.torso * 0.62),
    neck,
    head,
    headAngle,
    legN: legJoints(hip, pose.legN),
    legF: legJoints(hip, pose.legF),
    armN: armJoints(shoulderOf(hip, pose.lean, false), pose.armN),
    armF: armJoints(shoulderOf(hip, pose.lean, true), pose.armF),
  };
}

/**
 * 두 마디 IK: root에서 target까지 길이 l1·l2 뼈 두 개를 잇는 절대 각도 [위 마디, 아래 마디].
 * bend = +1이면 첫 마디를 root→target 선에서 + 방향(앞)으로 돌린다(무릎 앞, 머리 위로 뻗은 팔의 팔꿈치 뒤).
 * 닿지 않는 거리면 곧게 편다.
 */
export function solveTwoBone(root: Vec, target: Vec, l1: number, l2: number, bend: 1 | -1): [number, number] {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const dist = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-4);
  const base = Math.atan2(dx, -dy);
  const cos = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const a1 = base + bend * Math.acos(Math.min(1, Math.max(-1, cos)));
  const mid = add(root, dirOf(a1), l1);
  const a2 = Math.atan2(target.x - mid.x, -(target.y - mid.y));
  return [a1, a2];
}

/** 발목 목표 위치로 다리 포즈를 만든다 (무릎은 앞으로 굽힘) */
export function legTo(hip: Vec, ankle: Vec, foot: number, bend: 1 | -1 = 1): LegPose {
  const [thigh, shin] = solveTwoBone(hip, ankle, SK.thigh, SK.shin, bend);
  return { thigh, shin, foot };
}

/** 손 목표 위치로 팔 포즈를 만든다 */
export function armTo(shoulder: Vec, hand: Vec, bend: 1 | -1): ArmPose {
  const [upper, fore] = solveTwoBone(shoulder, hand, SK.upperArm, SK.foreArm, bend);
  return { upper, fore };
}

/** 바닥에 닿는 발의 발목 위치: 발끝을 축으로 뒤꿈치를 든 만큼(foot < 0) 발목이 올라간다 */
export function plantedAnkle(x: number, groundY: number, foot: number): Vec {
  if (foot >= 0) {
    // 뒤꿈치로 디딤(발끝 듦): 뒤꿈치를 축으로 회전
    const heel = rotate(SK.heel, foot);
    return { x, y: groundY - heel.y };
  }
  const toe = rotate(SK.toe, foot);
  const flatToe = SK.toe;
  return { x: x + (flatToe.x - toe.x), y: groundY - toe.y };
}

// ── 보간 ──

export function wrapAngle(a: number): number {
  return a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number) {
  return a + wrapAngle(b - a) * t;
}

function lerpLeg(a: LegPose, b: LegPose, t: number): LegPose {
  return { thigh: lerpAngle(a.thigh, b.thigh, t), shin: lerpAngle(a.shin, b.shin, t), foot: lerpAngle(a.foot, b.foot, t) };
}

/**
 * 팔 각도 보간: 가장 짧은 쪽으로 돌되, 머리 위를 지나 뒤로 크게 도는 경로(차이 < -2.2rad)는 앞쪽으로 돌린다.
 * 사람은 팔을 뒤로 젖혔다가 위로 올릴 때 몸 앞을 지나 올린다(뒤로 풍차처럼 돌리지 않는다).
 */
export function lerpArmAngle(a: number, b: number, t: number) {
  let d = wrapAngle(b - a);
  if (d < -2.2) d += 2 * Math.PI;
  return a + d * t;
}

export function lerpArm(a: ArmPose, b: ArmPose, t: number): ArmPose {
  return { upper: lerpArmAngle(a.upper, b.upper, t), fore: lerpArmAngle(a.fore, b.fore, t) };
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    hipX: lerp(a.hipX, b.hipX, t),
    hipY: lerp(a.hipY, b.hipY, t),
    lean: lerpAngle(a.lean, b.lean, t),
    head: lerpAngle(a.head, b.head, t),
    legN: lerpLeg(a.legN, b.legN, t),
    legF: lerpLeg(a.legF, b.legF, t),
    armN: lerpArm(a.armN, b.armN, t),
    armF: lerpArm(a.armF, b.armF, t),
  };
}

/** 포즈 전체를 pivot 기준으로 angle만큼 돌린다 (매달린 몸의 진자 흔들림) */
export function rotatePose(pose: Pose, pivot: Vec, angle: number): Pose {
  const hip = add(pivot, rotate({ x: pose.hipX - pivot.x, y: pose.hipY - pivot.y }, angle));
  const leg = (l: LegPose): LegPose => ({ thigh: l.thigh + angle, shin: l.shin + angle, foot: l.foot + angle });
  const arm = (a: ArmPose): ArmPose => ({ upper: a.upper + angle, fore: a.fore + angle });
  return {
    hipX: hip.x,
    hipY: hip.y,
    lean: pose.lean - angle,
    head: pose.head,
    legN: leg(pose.legN),
    legF: leg(pose.legF),
    armN: arm(pose.armN),
    armF: arm(pose.armF),
  };
}

export function clonePose(p: Pose): Pose {
  return { ...p, legN: { ...p.legN }, legF: { ...p.legF }, armN: { ...p.armN }, armF: { ...p.armF } };
}

export function smoothstep(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function smootherstep(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (6 * x - 15) + 10);
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
