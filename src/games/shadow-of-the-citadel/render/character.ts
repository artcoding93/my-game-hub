import { forwardKinematics, torsoUp, type ArmJoints, type Joints, type LegJoints, type Pose, type Vec } from "../animation/skeleton";

/*
 * 탐험가 그리기 (오리지널 디자인): 짙은 청록 여행복, 가죽 허리띠·팔 보호대·어깨끈·가방, 짧은 망토, 묶은 짙은 머리.
 * 배경은 픽셀 아트지만 캐릭터는 매끄러운 벡터 실루엣(가는 외곽선 + 2단 음영)으로 그린다.
 * 팔다리는 끝이 가늘어지는 캡슐, 몸통·치마·장화는 관절 위치를 따라 매 프레임 다시 만든 다각형이다.
 * 망토·머리끈은 월드 좌표의 작은 질점 사슬(verlet)로 관성에 따라 흔들린다(그리기 전용, 물리와 무관).
 */

const C = {
  outline: "#120b09",
  skin: "#c9956a",
  skinShade: "#a3704b",
  hair: "#241712",
  hairHi: "#3e2a1f",
  tunic: "#1e5b57",
  tunicShade: "#15423f",
  tunicHi: "#2d7d75",
  trim: "#c49a52",
  pants: "#3b3747",
  pantsFar: "#2a2733",
  boot: "#5c3b23",
  bootFar: "#40291a",
  bootHi: "#7d5534",
  leather: "#70482a",
  leatherDark: "#4f321d",
  buckle: "#d2ae62",
  cape: "#143a39",
  capeEdge: "#0e2a29",
  capeLining: "#6b2f27",
  scarf: "#8b6a3c",
};

const OUTLINE = 1.15;

type Shape = { path: (ctx: CanvasRenderingContext2D) => void; fill: string };

const add = (a: Vec, b: Vec, s = 1): Vec => ({ x: a.x + b.x * s, y: a.y + b.y * s });
const lerpV = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** 끝이 가늘어지는 캡슐 (a 반지름 ra → b 반지름 rb) */
function capsule(a: Vec, b: Vec, ra: number, rb: number) {
  return (ctx: CanvasRenderingContext2D) => {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.arc(b.x, b.y, rb, angle - Math.PI / 2, angle + Math.PI / 2);
    ctx.arc(a.x, a.y, ra, angle + Math.PI / 2, angle + (3 * Math.PI) / 2);
    ctx.closePath();
  };
}

function circle(c: Vec, r: number) {
  return (ctx: CanvasRenderingContext2D) => ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
}

/** 부드러운 다각형 (꼭짓점 사이 중점을 지나는 2차 곡선) */
function blob(points: Vec[]) {
  return (ctx: CanvasRenderingContext2D) => {
    const n = points.length;
    const mid = (i: number) => lerpV(points[i % n], points[(i + 1) % n], 0.5);
    const start = mid(n - 1);
    ctx.moveTo(start.x, start.y);
    for (let i = 0; i < n; i++) {
      const m = mid(i);
      ctx.quadraticCurveTo(points[i].x, points[i].y, m.x, m.y);
    }
    ctx.closePath();
  };
}

/** 묶음 단위로 외곽선을 먼저 그리고 채운다: 같은 묶음 안(허벅지-정강이 등)에는 이음선이 보이지 않는다 */
function drawGroup(ctx: CanvasRenderingContext2D, shapes: Shape[]) {
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = OUTLINE * 2;
  ctx.lineJoin = "round";
  for (const s of shapes) {
    ctx.beginPath();
    s.path(ctx);
    ctx.stroke();
  }
  for (const s of shapes) {
    ctx.beginPath();
    s.path(ctx);
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
}

function fillShape(ctx: CanvasRenderingContext2D, path: Shape["path"], fill: string, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** 발 모양 (장화): 발목 기준, 발바닥 기울기만큼 회전 */
function bootShape(leg: LegJoints, foot: number) {
  const c = Math.cos(foot);
  const s = Math.sin(foot);
  const at = (x: number, y: number): Vec => ({ x: leg.ankle.x + x * c - y * s, y: leg.ankle.y + x * s + y * c });
  return blob([at(-3.6, -3), at(3, -3.2), at(8.6, -3), at(8.4, -1), at(5, 1.2), at(1.5, 3.2), at(-3.2, 2.6)]);
}

function legShapes(leg: LegJoints, foot: number, far: boolean): Shape[] {
  const pants = far ? C.pantsFar : C.pants;
  const boot = far ? C.bootFar : C.boot;
  const shaftTop = lerpV(leg.knee, leg.ankle, 0.45);
  return [
    { path: capsule(leg.hip, leg.knee, 4.3, 3.3), fill: pants },
    { path: capsule(leg.knee, leg.ankle, 3.2, 2.5), fill: pants },
    { path: capsule(shaftTop, leg.ankle, 3.3, 3), fill: boot },
    { path: bootShape(leg, foot), fill: boot },
  ];
}

function armShapes(arm: ArmJoints, far: boolean): Shape[] {
  const bracerStart = lerpV(arm.elbow, arm.hand, 0.32);
  return [
    { path: capsule(arm.shoulder, arm.elbow, 3, 2.4), fill: far ? C.tunicShade : C.tunic },
    { path: capsule(arm.elbow, arm.hand, 2.3, 2), fill: far ? C.skinShade : C.skin },
    { path: capsule(bracerStart, lerpV(arm.elbow, arm.hand, 0.9), 2.55, 2.3), fill: far ? C.leatherDark : C.leather },
    { path: circle(arm.hand, 2.45), fill: far ? C.skinShade : C.skin },
  ];
}

// ── 망토·머리끈 (질점 사슬) ──

interface Chain {
  pts: Vec[];
  prev: Vec[];
  seg: number;
  /** 직전 스텝 시간: 스텝 시간이 바뀌어도(느린 재생·프레임 지연) 속도가 유지되도록 보정한다 */
  lastDt: number;
}

function makeChain(n: number, seg: number, at: Vec): Chain {
  const pts = Array.from({ length: n }, (_, i) => ({ x: at.x, y: at.y + i * seg }));
  return { pts, prev: pts.map((p) => ({ ...p })), seg, lastDt: 1 / 60 };
}

/**
 * keepBehind: 점을 몸 뒤로 밀어내는 제약(망토가 몸을 뚫지 않게). 한 번에 조금씩만 밀어 방향 전환 때 튀지 않는다.
 * maxRise: 고정점보다 이만큼 넘게 위로 올라가지 않는다(어깨에 달린 짧은 망토가 막대처럼 서지 않게).
 */
function stepChain(chain: Chain, anchor: Vec, dt: number, gravity: number, drag: number, keepBehind: ((p: Vec) => Vec) | null, maxRise: number) {
  const { pts, prev } = chain;
  if (dt <= 0) return;
  pts[0] = { ...anchor };
  prev[0] = { ...anchor };
  // 시간 보정 verlet: (현재 - 이전) / 이전 dt × 이번 dt, 감쇠는 초당 비율로
  const ratio = dt / chain.lastDt;
  chain.lastDt = dt;
  const damp = Math.pow(drag, dt * 60) * ratio;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const vx = (p.x - prev[i].x) * damp;
    const vy = (p.y - prev[i].y) * damp;
    prev[i] = { ...p };
    pts[i] = { x: p.x + vx, y: p.y + vy + gravity * dt * dt };
  }
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = (d - chain.seg) / d;
      // 앞 점은 고정(0번) 또는 반만 움직인다
      if (i === 1) {
        b.x -= dx * k;
        b.y -= dy * k;
      } else {
        a.x += dx * k * 0.5;
        a.y += dy * k * 0.5;
        b.x -= dx * k * 0.5;
        b.y -= dy * k * 0.5;
      }
      if (keepBehind) pts[i] = keepBehind(pts[i]);
      const limit = pts[0].y - maxRise + i * 0.5;
      if (pts[i].y < limit) pts[i].y = limit;
    }
  }
}

export interface CharacterView {
  /** 물리 발 위치 + 화면 오프셋 (월드 좌표) */
  x: number;
  y: number;
  /** 좌우 방향 (-1~1, 돌아서는 중에는 사이 값) */
  scaleX: number;
  pose: Pose;
  /** 발 그림자를 둘 바닥 높이 (없으면 그림자 없음) */
  groundY: number | null;
}

/** 지역 좌표(y 위) → 월드 좌표(y 아래) */
function toWorld(view: CharacterView, p: Vec): Vec {
  return { x: view.x + p.x * view.scaleX, y: view.y - p.y };
}

export class CharacterPainter {
  private cape: Chain | null = null;
  private hairTail: Chain | null = null;

  reset() {
    this.cape = null;
    this.hairTail = null;
  }

  /** 보조 움직임(망토·머리끈)을 진행한다. 렌더링 시간 배율과 같은 dt를 쓴다 */
  simulate(view: CharacterView, dt: number) {
    const j = forwardKinematics(view.pose);
    const up = torsoUp(view.pose.lean);
    const fwd = { x: up.y, y: -up.x };
    const capeAnchor = toWorld(view, add(add(j.neck, fwd, -3.2), up, -1.5));
    const hairAnchor = toWorld(view, add(j.head, torsoUp(j.headAngle - 0.9), 5.4));
    if (!this.cape || Math.hypot(this.cape.pts[0].x - capeAnchor.x, this.cape.pts[0].y - capeAnchor.y) > 60) this.cape = makeChain(5, 6.2, capeAnchor);
    if (!this.hairTail || Math.hypot(this.hairTail.pts[0].x - hairAnchor.x, this.hairTail.pts[0].y - hairAnchor.y) > 60) this.hairTail = makeChain(3, 3.6, hairAnchor);

    // 망토가 몸통을 뚫고 앞으로 넘어오지 않도록 등 뒤 평면 뒤에 둔다.
    // 돌아서는 중(몸 폭이 좁을 때)에는 약하게, 한 번에 조금씩만 밀어 망토가 몸 둘레를 돌아 넘어가게 한다.
    const back = { x: -fwd.x * Math.sign(view.scaleX || 1), y: fwd.y };
    const hipW = toWorld(view, j.hip);
    const strength = Math.abs(view.scaleX) ** 2;
    const keepBehind = (p: Vec): Vec => {
      const d = (p.x - hipW.x) * back.x + (p.y - hipW.y) * back.y;
      const min = 4.2;
      if (d >= min) return p;
      const push = Math.min(min - d, 1.4) * strength;
      return { x: p.x + back.x * push, y: p.y + back.y * push };
    };
    const step = Math.min(dt, 1 / 30);
    stepChain(this.cape, capeAnchor, step, 900, 0.965, keepBehind, 6);
    stepChain(this.hairTail, hairAnchor, step, 600, 0.93, null, 3);
  }

  draw(ctx: CanvasRenderingContext2D, view: CharacterView, debugSkeleton = false) {
    const pose = view.pose;
    const j = forwardKinematics(pose);
    const up = torsoUp(pose.lean);
    const fwd = { x: up.y, y: -up.x };

    if (view.groundY !== null) this.drawShadow(ctx, view, j);

    // 망토·머리끈(월드 좌표)은 몸 뒤에 먼저 그린다
    this.drawCape(ctx);
    this.drawHairTail(ctx);

    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scaleX, -1);

    drawGroup(ctx, armShapes(j.armF, true));
    drawGroup(ctx, legShapes(j.legF, pose.legF.foot, true));

    // 몸통
    const hip = j.hip;
    const chest = j.chest;
    const neck = j.neck;
    const torso = blob([
      add(add(hip, fwd, 5.2), up, -1),
      add(chest, fwd, 6.4),
      add(add(neck, fwd, 3.4), up, -1.2),
      add(add(neck, fwd, -3.6), up, -0.6),
      add(chest, fwd, -5.6),
      add(add(hip, fwd, -5.6), up, -1),
    ]);
    // 튜닉 자락: 두 허벅지 윗부분을 덮고 다리 움직임을 따라 벌어진다
    const thighs = [j.legN, j.legF].map((l) => lerpV(l.hip, l.knee, 0.55));
    const frontThigh = thighs[0].x > thighs[1].x ? thighs[0] : thighs[1];
    const backThigh = thighs[0].x > thighs[1].x ? thighs[1] : thighs[0];
    const skirt = blob([
      add(add(hip, fwd, 5.6), up, 2),
      add(frontThigh, { x: 4.2, y: -0.5 }),
      lerpV(add(frontThigh, { x: 1, y: -2.5 }), add(backThigh, { x: -1, y: -2.5 }), 0.5),
      add(backThigh, { x: -4.6, y: -0.2 }),
      add(add(hip, fwd, -6), up, 2),
    ]);
    drawGroup(ctx, [
      { path: torso, fill: C.tunic },
      { path: skirt, fill: C.tunic },
    ]);
    // 음영: 등 쪽 절반을 어둡게, 가슴 앞쪽에 밝은 결
    fillShape(ctx, blob([add(chest, fwd, -1), add(add(neck, fwd, -3.4), up, -0.8), add(chest, fwd, -5.4), add(add(hip, fwd, -5.4), up, -0.6), add(hip, fwd, -1)]), C.tunicShade, 0.85);
    fillShape(ctx, capsule(add(add(hip, fwd, 3.6), up, 4), add(add(neck, fwd, 2.4), up, -3.5), 1.1, 1.3), C.tunicHi, 0.55);
    // 앞섶 장식선
    ctx.strokeStyle = C.trim;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    const collar = add(add(neck, fwd, 2.6), up, -1.6);
    ctx.moveTo(collar.x, collar.y);
    const trimEnd = add(add(hip, fwd, 4.8), up, 2.5);
    ctx.lineTo(trimEnd.x, trimEnd.y);
    ctx.stroke();

    // 허리띠·버클, 어깨끈, 허리 가방
    const beltA = add(add(hip, fwd, -5.9), up, 2.6);
    const beltB = add(add(hip, fwd, 5.6), up, 2.6);
    drawGroup(ctx, [
      { path: capsule(beltA, beltB, 1.6, 1.6), fill: C.leather },
      { path: blob([add(add(hip, fwd, -5.2), up, 1.5), add(add(hip, fwd, -8.6), up, 0.8), add(add(hip, fwd, -8.8), up, -4.5), add(add(hip, fwd, -5.4), up, -4.8)]), fill: C.leatherDark },
    ]);
    fillShape(ctx, circle(add(add(hip, fwd, 4.8), up, 2.6), 1.3), C.buckle);
    ctx.strokeStyle = C.leatherDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const strapA = add(add(neck, fwd, -2.6), up, -1.5);
    const strapB = add(add(hip, fwd, 4), up, 3.6);
    ctx.moveTo(strapA.x, strapA.y);
    ctx.lineTo(strapB.x, strapB.y);
    ctx.stroke();

    drawGroup(ctx, legShapes(j.legN, pose.legN.foot, false));
    // 장화 윗단 접힌 가죽
    const cuff = lerpV(j.legN.knee, j.legN.ankle, 0.45);
    fillShape(ctx, capsule(add(cuff, { x: -0.2, y: 0.6 }), add(cuff, { x: 0.2, y: -0.8 }), 3.6, 3.4), C.bootHi, 0.9);

    // 목도리 + 머리
    drawGroup(ctx, [{ path: capsule(add(add(neck, fwd, -3.4), up, -0.5), add(add(neck, fwd, 2.8), up, -0.8), 2.8, 2.6), fill: C.scarf }]);
    this.drawHead(ctx, j);

    drawGroup(ctx, armShapes(j.armN, false));

    if (debugSkeleton) drawSkeleton(ctx, j);
    ctx.restore();
  }

  private drawHead(ctx: CanvasRenderingContext2D, j: Joints) {
    ctx.save();
    ctx.translate(j.head.x, j.head.y);
    ctx.rotate(-j.headAngle);
    // 얼굴·턱·코 (옆모습)
    const face = blob([
      { x: -4.8, y: 5.6 },
      { x: 3.2, y: 6.6 },
      { x: 5.8, y: 2.4 },
      { x: 6.9, y: -0.4 },
      { x: 5.6, y: -1.4 },
      { x: 5.4, y: -4.4 },
      { x: 2.6, y: -6.9 },
      { x: -1.6, y: -6.2 },
      { x: -5.6, y: -1.6 },
    ]);
    drawGroup(ctx, [{ path: face, fill: C.skin }]);
    fillShape(ctx, blob([{ x: -5, y: 2 }, { x: -1, y: 3 }, { x: 0, y: -3 }, { x: -3, y: -5.4 }, { x: -5.4, y: -1.8 }]), C.skinShade, 0.6);
    // 머리카락: 정수리와 뒤통수를 덮고 뒤로 묶는다
    drawGroup(ctx, [
      {
        path: blob([
          { x: -6.4, y: 3.4 },
          { x: -3.6, y: 7.4 },
          { x: 2.6, y: 7.6 },
          { x: 5.8, y: 4.4 },
          { x: 4.4, y: 3.3 },
          { x: 1, y: 4.4 },
          { x: -1.4, y: 2.2 },
          { x: -2.6, y: -2.6 },
          { x: -6.2, y: -2.4 },
        ]),
        fill: C.hair,
      },
    ]);
    fillShape(ctx, capsule({ x: -3.4, y: 6.2 }, { x: 2, y: 6.6 }, 0.9, 0.7), C.hairHi, 0.8);
    // 가죽 머리띠
    ctx.strokeStyle = C.leather;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-6, 2.2);
    ctx.quadraticCurveTo(0, 5.4, 5.2, 4.2);
    ctx.stroke();
    // 귀·눈·눈썹
    fillShape(ctx, circle({ x: -1.6, y: 0.4 }, 1.4), C.skinShade);
    ctx.fillStyle = C.outline;
    ctx.fillRect(2.9, 1.1, 1.4, 1.5);
    ctx.fillRect(2.4, 3.1, 2.6, 0.7);
    // 입선
    ctx.fillRect(3.4, -3.3, 1.8, 0.5);
    ctx.restore();
  }

  private drawCape(ctx: CanvasRenderingContext2D) {
    const chain = this.cape;
    if (!chain) return;
    const pts = chain.pts;
    const left: Vec[] = [];
    const right: Vec[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const w = 4.6 - i * 0.35 + (i === pts.length - 1 ? 0.6 : 0);
      left.push({ x: pts[i].x - (dy / d) * w, y: pts[i].y + (dx / d) * w });
      right.push({ x: pts[i].x + (dy / d) * w, y: pts[i].y - (dx / d) * w });
    }
    const outline = [...left, ...right.reverse()];
    drawGroup(ctx, [{ path: blob(outline), fill: C.cape }]);
    // 안감이 보이는 아랫단
    const hem = pts.length - 1;
    fillShape(ctx, capsule(left[hem], right[right.length - 1 - hem], 1.1, 1.1), C.capeLining, 0.9);
  }

  private drawHairTail(ctx: CanvasRenderingContext2D) {
    const chain = this.hairTail;
    if (!chain) return;
    const [a, b, c] = chain.pts;
    drawGroup(ctx, [
      { path: capsule(a, b, 1.8, 1.5), fill: C.hair },
      { path: capsule(b, c, 1.5, 0.8), fill: C.hair },
    ]);
  }

  private drawShadow(ctx: CanvasRenderingContext2D, view: CharacterView, j: Joints) {
    const ground = view.groundY as number;
    const height = Math.max(0, ground - view.y);
    const fade = Math.max(0, 1 - height / 180);
    if (fade <= 0) return;
    const cx = view.x + ((j.legN.ankle.x + j.legF.ankle.x) / 2) * view.scaleX;
    ctx.save();
    ctx.globalAlpha = 0.42 * fade;
    ctx.fillStyle = "#050303";
    ctx.beginPath();
    ctx.ellipse(cx, ground + 0.5, 13 * (0.6 + 0.4 * fade), 2.6 * fade + 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawSkeleton(ctx: CanvasRenderingContext2D, j: Joints) {
  ctx.lineWidth = 0.9;
  const bone = (a: Vec, b: Vec, color: string) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  for (const [leg, color] of [
    [j.legF, "#7dd3fc"],
    [j.legN, "#22d3ee"],
  ] as const) {
    bone(leg.hip, leg.knee, color);
    bone(leg.knee, leg.ankle, color);
    bone(leg.heel, leg.toe, color);
  }
  for (const [arm, color] of [
    [j.armF, "#fda4af"],
    [j.armN, "#f43f5e"],
  ] as const) {
    bone(arm.shoulder, arm.elbow, color);
    bone(arm.elbow, arm.hand, color);
  }
  bone(j.hip, j.neck, "#facc15");
  bone(j.neck, j.head, "#facc15");
  ctx.fillStyle = "#fff";
  for (const p of [j.hip, j.neck, j.legN.knee, j.legF.knee, j.legN.ankle, j.legF.ankle, j.armN.elbow, j.armF.elbow, j.armN.hand, j.armF.hand]) {
    ctx.fillRect(p.x - 0.9, p.y - 0.9, 1.8, 1.8);
  }
}
