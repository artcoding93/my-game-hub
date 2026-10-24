import { JUMP, LAND, MOVE } from "../config";
import type { Player, PlayerEvent } from "../logic/player";
import { airPose, climbPose, footAt, gaitFor, hangPose, idlePose, jumpPrepPose, landPose, locomotionPose, skidPose } from "./poses";
import { clamp, clonePose, lerpPose, smoothstep, type Pose, type Vec } from "./skeleton";

/*
 * 물리 상태 → 화면 포즈. 렌더링 프레임마다 한 번 호출한다(물리와 같은 시간 배율).
 * - 동작이 바뀌면 직전 포즈에서 새 포즈로 짧게 섞는다(갑작스러운 자세 변화 방지).
 * - 걷기·달리기 위상은 이동 거리로 진행해 발이 미끄러지지 않는다.
 * - 보조 움직임: 가감속에 따른 상체 기울기(스프링), 착지 충격 흡수(스프링), 매달린 몸의 진자 흔들림.
 * 물리 좌표는 바꾸지 않는다(읽기 전용).
 */

export type AnimKey = "idle" | "loco" | "skid" | "turn" | "prep" | "air" | "land" | "hang" | "climb";

export interface FootStep {
  x: number;
  y: number;
  /** 0 = 조용한 걸음, 1 = 힘찬 달리기 */
  strength: number;
}

interface Spring {
  x: number;
  v: number;
}

function stepSpring(s: Spring, target: number, omega: number, zeta: number, dt: number) {
  const a = -2 * zeta * omega * s.v - omega * omega * (s.x - target);
  s.v += a * dt;
  s.x += s.v * dt;
}

function blendTime(from: AnimKey, to: AnimKey): number {
  if (from === "climb") return 0; // 올라오기 마지막 자세 = 대기 자세 시작
  if (to === "climb") return 0.1;
  if (to === "hang") return 0.1;
  if (to === "land") return 0.15;
  if (from === "hang") return 0.1;
  if (from === "air") return 0.08;
  if (to === "prep") return 0.06;
  if (from === "prep") return 0.24;
  if (from === "loco" && to === "idle") return 0.22;
  if (from === "idle" && to === "loco") return 0.14;
  if (to === "skid" || to === "turn") return 0.15;
  return 0.12;
}

/** 진자: 손에서 엉덩이까지 약 62px → 고유 진동 약 0.8Hz */
const SWING_OMEGA2 = JUMP.gravity / 62;
const SWING_DAMP = 2.6;
/** 다리가 벽 쪽으로 이만큼 넘게 흔들리면 벽에 닿아 튕긴다 */
const SWING_WALL = 0.04;

export class Animator {
  pose: Pose = idlePose(0);
  key: AnimKey = "idle";
  /** 좌우 방향 (방향 전환 중에는 -1~1 사이를 지나간다) */
  facingScale = 1;
  /** 순간 정렬(난간 잡기)을 부드럽게 보이게 하는 화면 오프셋 (월드 좌표, 점점 0으로) */
  offset: Vec = { x: 0, y: 0 };
  /** 이번 프레임에 땅에 닿은 발 (먼지 효과용, 월드 좌표) */
  steps: FootStep[] = [];

  private keyTime = 0;
  private idleTime = 0;
  private time = 0;
  private from: Pose | null = null;
  private blend = 0;
  private blendDur = 0;
  private phase = 0;
  private lean: Spring = { x: 0, v: 0 };
  private dip: Spring = { x: 0, v: 0 };
  private swing: Spring = { x: 0, v: 0 };
  private prevForward = 0;
  private fallTime = 0;
  private reach = 0;
  private flipFrom: 1 | -1 = 1;
  private flipT = 1;
  private flipDur = 0.13;
  private facing: 1 | -1 = 1;
  private feetDown: [boolean, boolean] = [true, true];

  reset(player: Player) {
    this.key = "idle";
    this.keyTime = 0;
    this.idleTime = 0;
    this.from = null;
    this.blend = this.blendDur = 0;
    this.lean = { x: 0, v: 0 };
    this.dip = { x: 0, v: 0 };
    this.swing = { x: 0, v: 0 };
    this.offset = { x: 0, y: 0 };
    this.facing = player.facing;
    this.facingScale = player.facing;
    this.flipT = 1;
    this.prevForward = 0;
    this.fallTime = 0;
    this.pose = idlePose(0);
  }

  /** 물리 이벤트 반영 (프레임마다 update 전에) */
  handle(events: PlayerEvent[], player: Player) {
    for (const e of events) {
      if (e.type === "respawn") this.reset(player);
      else if (e.type === "grab") {
        // 손이 난간에 맞도록 위치를 맞춘 만큼 화면에서는 몸이 따라 들어오게 한다.
        this.offset.x -= e.dx;
        this.offset.y -= e.dy;
        this.swing = { x: 0, v: -(0.35 + Math.abs(e.vy) * 0.0016 + Math.abs(e.vx) * 0.004) };
      } else if (e.type === "land") {
        // 작은 착지만 스프링으로 흡수한다. 중간·큰 착지는 landPose가 무릎을 굽힌다.
        if (e.level === "light") this.dip.v += e.impact * 0.35;
      }
    }
  }

  update(dt: number, player: Player) {
    this.time += dt;
    this.steps = [];

    // 방향 전환: 옆으로 돌아서는 순간 몸 폭이 좁아졌다가 반대로 펼쳐진다.
    if (player.facing !== this.facing) {
      this.flipFrom = this.facing;
      this.facing = player.facing;
      this.flipT = 0;
      // 달리다 제동 후 돌아설 때는 조금 더 길게 (몸을 돌리며 다시 출발)
      this.flipDur = this.key === "turn" || Math.abs(player.vx) > MOVE.walkSpeed ? 0.2 : 0.12;
    }
    if (this.flipT < 1) this.flipT = Math.min(1, this.flipT + dt / this.flipDur);
    const flip = this.flipFrom * Math.cos(Math.PI * smoothstep(this.flipT));
    this.facingScale = this.flipT >= 1 ? this.facing : Math.sign(flip || this.facing) * Math.max(0.12, Math.abs(flip));

    // 가감속 기울기: 앞으로 가속하면 앞으로, 제동하면 뒤로 버티다가 멈추는 순간 관성으로 앞으로 쏠린 뒤 돌아온다.
    const forward = player.vx * player.facing;
    const accel = dt > 0 ? (forward - this.prevForward) / dt : 0;
    this.prevForward = forward;
    // 착지 순간의 속도 감소는 제동이 아니다(착지 자세가 앞으로 숙인다). 지면에서 스스로 가감속할 때만 기울인다.
    const driving = player.mode === "move" || player.mode === "skid" || player.mode === "turn";
    const leanTarget = driving && this.key !== "air" ? clamp(accel * 0.00022, -0.2, 0.16) : 0;
    stepSpring(this.lean, leanTarget, 13, 0.42, dt);
    stepSpring(this.dip, 0, 16, 0.55, dt);
    this.dip.x = clamp(this.dip.x, -4, 12);

    const decay = Math.exp(-dt * 24);
    this.offset.x *= decay;
    this.offset.y *= decay;

    this.fallTime = player.mode === "air" && player.vy > 0 ? this.fallTime + dt : 0;
    const reachTarget = (player.mode === "air" || player.mode === "jumpPrep") && player.wallAhead !== null ? smoothstep(1 - player.wallAhead / 26) : 0;
    this.reach += (reachTarget - this.reach) * (1 - Math.exp(-dt * 6));

    const next = this.chooseKey(player);
    if (next !== this.key) {
      const dur = blendTime(this.key, next);
      if (next === "loco" && this.key !== "air") this.phase = gaitFor(Math.abs(player.vx)).duty + 0.02;
      this.from = dur > 0 ? clonePose(this.pose) : null;
      this.blend = 0;
      this.blendDur = dur;
      this.key = next;
      this.keyTime = 0;
      if (next === "idle") this.idleTime = 0;
    }
    this.keyTime += dt;
    if (this.key === "idle") this.idleTime += dt;

    const target = this.targetPose(dt, player);
    if (this.from && this.blend < this.blendDur) {
      this.blend += dt;
      this.pose = lerpPose(this.from, target, smoothstep(this.blend / this.blendDur));
    } else {
      this.from = null;
      this.pose = target;
    }
  }

  private chooseKey(p: Player): AnimKey {
    switch (p.mode) {
      case "move": {
        const speed = Math.abs(p.vx);
        // 경계에서 두 동작을 오가며 깜빡이지 않도록 이력 현상(hysteresis)을 둔다
        if (this.key === "loco") return speed < 2 ? "idle" : "loco";
        return speed > 6 ? "loco" : "idle";
      }
      case "skid":
        return "skid";
      case "turn":
        return "turn";
      case "jumpPrep":
        return "prep";
      case "air":
        return "air";
      case "land":
        return "land";
      case "hang":
        return "hang";
      case "climb":
        return "climb";
    }
  }

  private targetPose(dt: number, p: Player): Pose {
    const speed = Math.abs(p.vx);
    const lean = this.lean.x;
    const dip = Math.max(0, this.dip.x);
    switch (this.key) {
      case "idle":
        return idlePose(this.idleTime, lean, dip);
      case "loco": {
        const g = gaitFor(speed);
        this.phase = (this.phase + (speed * dt) / g.cycle) % 1;
        this.collectSteps(p, g);
        return locomotionPose(speed, this.phase, { lean, dip });
      }
      case "skid":
        return skidPose(clamp(speed / MOVE.runSpeed, 0, 1), lean, dip);
      case "turn":
        return skidPose(clamp(speed / MOVE.runSpeed + 0.2, 0, 1), lean * 1.2, dip + 1.5);
      case "prep": {
        const e = clamp(p.modeTime / (p.prepRun ? JUMP.prepRun : JUMP.prepStand), 0, 1);
        if (p.prepRun) return locomotionPose(speed, this.phase, { lean: lean + 0.08 * e, dip: dip + 3 * e });
        return jumpPrepPose(e, dip, this.reach);
      }
      case "air":
        return airPose({ vx: p.vx, vy: p.vy, airTime: p.airTime, fallTime: this.fallTime, time: this.time, jumped: p.jumped, reach: this.reach });
      case "land":
        return landPose({
          impact: clamp((p.landImpact - LAND.mediumImpact * 0.6) / (JUMP.maxFall - LAND.mediumImpact * 0.6), 0, 1),
          time: p.modeTime,
          heavy: p.landLevel === "heavy",
        });
      case "hang": {
        const s = this.swing;
        const a = -SWING_OMEGA2 * Math.sin(s.x) - SWING_DAMP * s.v;
        s.v += a * dt;
        s.x += s.v * dt;
        if (s.x > SWING_WALL) {
          s.x = SWING_WALL;
          s.v = -Math.abs(s.v) * 0.35;
        }
        const kick = clamp(-s.v * 0.12, -0.05, 0.25);
        return hangPose(this.keyTime, s.x, kick);
      }
      case "climb":
        return climbPose(p.climbT);
    }
  }

  /** 디딤 구간에 들어선 발을 기록한다 (먼지·발소리용) */
  private collectSteps(p: Player, g: ReturnType<typeof gaitFor>) {
    const phases = [this.phase % 1, (this.phase + 0.5) % 1];
    phases.forEach((ph, i) => {
      const f = footAt(ph, g);
      if (f.grounded && !this.feetDown[i]) {
        this.steps.push({ x: p.x + p.facing * f.ankle.x, y: p.y, strength: g.run });
      }
      this.feetDown[i] = f.grounded;
    });
  }
}
