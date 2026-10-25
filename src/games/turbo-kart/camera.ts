import type { Kart } from "./types";

/*
 * Turbo Kart 카메라 (그리기 전용, 순수 계산). 카트의 물리 좌표·속도·충돌에는 관여하지 않는다.
 *
 * - chase(회전, 기본): 카트를 화면 아래쪽 가운데(높이의 anchorY 지점)에 두고, 카트 전방이 항상 화면 위를 향하도록
 *   월드를 반대로 돌려 그린다. 회전은 최단 각도 차이(±180° 경계 처리)로 지수 보간 + 최대 회전 속도 제한.
 *   최대 회전 속도는 카트 각속도 상한(STEERING.yawCap)보다 커서, 조향을 풀면 카메라도 곧 멈춘다(카트가 멈췄는데 화면만 계속 도는 일 없음).
 *   드리프트 중에는 차체 방향과 실제 진행 방향의 가운데를 따라가 차체가 옆으로 흔들려도 화면은 덜 흔들린다.
 *   미끄러짐(스핀) 중에는 회전을 멈춘다.
 * - topdown(고정): 북쪽(월드 -y)이 항상 위. 카트를 따라가며 진행 방향 앞쪽을 조금 더 보여 준다(Look-Ahead).
 *
 * 화면 변환: screen = anchor + R(rotation) · zoom · (world − camera)
 */

export type CameraMode = "chase" | "topdown";

export const CAMERA = {
  /** 화면의 짧은 변이 보여 주는 월드 거리 */
  viewShortSide: 600,
  /** chase: 카트가 놓이는 화면 높이 비율 (위에서부터) */
  anchorY: 0.72,
  /** chase: 회전이 카트 방향을 따라가는 속도 (초당 감쇠율 = 1 / 반응 시간 약 0.16초). 낮을수록 부드럽고 느리다 */
  turnFollow: 6.25,
  /** chase: 화면이 돌 수 있는 최대 각속도 (rad/s). 카트 각속도 상한(3)보다 조금 커야 뒤처져 계속 돌지 않는다 */
  maxTurnSpeed: 3.4,
  /** chase: 드리프트 중 진행 방향(속도 벡터) 쪽으로 섞는 비율 */
  driftVelocityBlend: 0.5,
  /** chase: 위치를 따라가는 속도 */
  positionFollow: 9,
  /** topdown: 앞쪽을 더 보여 주는 시간과 최대 거리 */
  lookAheadTime: 0.42,
  lookAheadMax: 170,
  /** 이보다 멀리 떨어지면(복구 등) 곧바로 따라붙는다 */
  snapDistance: 600,
} as const;

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Camera {
  mode: CameraMode;
  x = 0;
  y = 0;
  /** chase: 카메라가 바라보는 진행 방향 (보간된 카트 heading) */
  heading = 0;
  private ready = false;

  constructor(mode: CameraMode = "chase") {
    this.mode = mode;
  }

  reset() {
    this.ready = false;
  }

  setMode(mode: CameraMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.ready = false;
  }

  update(kart: Kart, dt: number) {
    let tx = kart.x;
    let ty = kart.y;
    if (this.mode === "topdown") {
      tx += Math.max(-CAMERA.lookAheadMax, Math.min(CAMERA.lookAheadMax, kart.vx * CAMERA.lookAheadTime));
      ty += Math.max(-CAMERA.lookAheadMax, Math.min(CAMERA.lookAheadMax, kart.vy * CAMERA.lookAheadTime));
    }
    const far = Math.hypot(tx - this.x, ty - this.y) > CAMERA.snapDistance;
    if (!this.ready || far) {
      this.x = tx;
      this.y = ty;
      this.heading = kart.heading;
      this.ready = true;
      return;
    }
    // 프레임 속도와 무관한 지수 감쇠
    const follow = this.mode === "chase" ? CAMERA.positionFollow : 4.2;
    const k = 1 - Math.exp(-dt * follow);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;

    if (this.mode === "chase" && kart.spinTime === 0) {
      let target = kart.heading;
      if (kart.drifting && Math.hypot(kart.vx, kart.vy) > 60) {
        target += wrapAngle(Math.atan2(kart.vy, kart.vx) - kart.heading) * CAMERA.driftVelocityBlend;
      }
      const diff = wrapAngle(target - this.heading);
      let step = diff * (1 - Math.exp(-dt * CAMERA.turnFollow));
      const limit = CAMERA.maxTurnSpeed * dt;
      step = Math.max(-limit, Math.min(limit, step));
      this.heading = wrapAngle(this.heading + step);
    }
  }

  /** 월드에 적용할 화면 회전 (chase: 카메라 heading이 화면 위(-y)를 향하도록) */
  rotation(): number {
    return this.mode === "chase" ? -Math.PI / 2 - this.heading : 0;
  }

  zoom(width: number, height: number): number {
    return Math.min(width, height) / CAMERA.viewShortSide;
  }

  anchor(width: number, height: number): { x: number; y: number } {
    return { x: width / 2, y: this.mode === "chase" ? height * CAMERA.anchorY : height / 2 };
  }

  /** 캔버스에 월드 → 화면 변환을 건다 */
  apply(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const a = this.anchor(width, height);
    ctx.translate(a.x, a.y);
    ctx.rotate(this.rotation());
    const z = this.zoom(width, height);
    ctx.scale(z, z);
    ctx.translate(-this.x, -this.y);
  }

  worldToScreen(x: number, y: number, width: number, height: number): { x: number; y: number } {
    const a = this.anchor(width, height);
    const z = this.zoom(width, height);
    const r = this.rotation();
    const dx = (x - this.x) * z;
    const dy = (y - this.y) * z;
    return { x: a.x + dx * Math.cos(r) - dy * Math.sin(r), y: a.y + dx * Math.sin(r) + dy * Math.cos(r) };
  }

  screenToWorld(sx: number, sy: number, width: number, height: number): { x: number; y: number } {
    const a = this.anchor(width, height);
    const z = this.zoom(width, height);
    const r = -this.rotation();
    const dx = (sx - a.x) / z;
    const dy = (sy - a.y) / z;
    return { x: this.x + dx * Math.cos(r) - dy * Math.sin(r), y: this.y + dx * Math.sin(r) + dy * Math.cos(r) };
  }

  /**
   * 화면 네 모서리를 월드로 되돌려 감싼 범위 (+여유). 회전해도 이 범위 안의 땅·장식·오브젝트를 모두 그리므로
   * 모서리에 빈 공간이 생기지 않는다(배경색은 캔버스 전체를 먼저 칠한다).
   */
  viewBounds(width: number, height: number, margin = 60): { x0: number; x1: number; y0: number; y1: number } {
    const corners = [
      this.screenToWorld(0, 0, width, height),
      this.screenToWorld(width, 0, width, height),
      this.screenToWorld(0, height, width, height),
      this.screenToWorld(width, height, width, height),
    ];
    return {
      x0: Math.min(...corners.map((c) => c.x)) - margin,
      x1: Math.max(...corners.map((c) => c.x)) + margin,
      y0: Math.min(...corners.map((c) => c.y)) - margin,
      y1: Math.max(...corners.map((c) => c.y)) + margin,
    };
  }
}
