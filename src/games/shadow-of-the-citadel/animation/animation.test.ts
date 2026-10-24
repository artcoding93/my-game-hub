import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FIXED_DT, LEDGE, MOVE } from "../config";
import { TEST_SPOTS } from "../level";
import { createPlayer, NO_INPUT, stepPlayer, type Player, type PlayerEvent, type PlayerInput } from "../logic/player";
import { createWorld } from "../logic/world";
import { Animator } from "./animator";
import { climbPoseAtCorner, footAt, gaitFor, hangPoseAtCorner, HAND_F, HAND_N, idlePose, locomotionPose } from "./poses";
import { forwardKinematics, SK, type Joints, type Vec } from "./skeleton";

const world = createWorld();
const spot = (key: string) => TEST_SPOTS.find((s) => s.key === key)!;

function allPoints(j: Joints): Vec[] {
  const mid = (a: Vec, b: Vec) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const pts: Vec[] = [j.hip, j.chest, j.neck, j.head];
  for (const l of [j.legN, j.legF]) pts.push(l.knee, l.ankle, l.toe, l.heel, mid(l.hip, l.knee), mid(l.knee, l.ankle));
  for (const a of [j.armN, j.armF]) pts.push(a.shoulder, a.elbow, a.hand, mid(a.shoulder, a.elbow), mid(a.elbow, a.hand));
  pts.push(mid(j.hip, j.neck));
  return pts;
}

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

describe("걷기·달리기", () => {
  for (const speed of [30, MOVE.walkSpeed, 150, MOVE.runSpeed]) {
    test(`속도 ${speed}: 디딤발이 땅에서 미끄러지지 않고 발목이 IK 목표에 닿는다`, () => {
      const g = gaitFor(speed);
      const dt = 1 / 120;
      let phase = 0;
      let x = 0;
      const prev: (number | null)[] = [null, null];
      let maxSlide = 0;
      let maxReachError = 0;
      for (let i = 0; i < 600; i++) {
        phase = (phase + (speed * dt) / g.cycle) % 1;
        x += speed * dt;
        const pose = locomotionPose(speed, phase);
        const j = forwardKinematics(pose);
        [phase, (phase + 0.5) % 1].forEach((p, k) => {
          const f = footAt(p, g);
          const ankle = k === 0 ? j.legN.ankle : j.legF.ankle;
          maxReachError = Math.max(maxReachError, dist(ankle, f.ankle));
          if (f.grounded) {
            // 뒤꿈치를 들기 전(발바닥이 평평한 구간)의 발목 월드 x 이동량
            if (prev[k] !== null && f.foot >= 0) maxSlide = Math.max(maxSlide, Math.abs(x + f.ankle.x - (prev[k] as number)));
            prev[k] = f.foot >= 0 ? x + f.ankle.x : null;
          } else prev[k] = null;
        });
      }
      assert.ok(maxSlide < 0.05, `발 미끄러짐 ${maxSlide.toFixed(3)}px`);
      assert.ok(maxReachError < 0.6, `발목 IK 오차 ${maxReachError.toFixed(2)}px`);
    });
  }

  test("팔과 다리가 엇갈린다 (앞쪽 다리가 앞일 때 앞쪽 팔은 뒤)", () => {
    const g = gaitFor(MOVE.runSpeed);
    let opposite = 0;
    let samples = 0;
    for (let p = 0; p < 1; p += 0.02) {
      const j = forwardKinematics(locomotionPose(MOVE.runSpeed, p));
      const legForward = footAt(p, g).ankle.x - j.hip.x;
      const armForward = j.armN.hand.x - j.armN.shoulder.x;
      if (Math.abs(legForward) < 8) continue;
      samples++;
      if (Math.sign(legForward) !== Math.sign(armForward)) opposite++;
    }
    assert.ok(opposite / samples > 0.8, `${opposite}/${samples}`);
  });
});

describe("매달리기·올라오기", () => {
  test("매달린 손은 흔들림과 관계없이 난간 모서리에 정확히 맞는다", () => {
    for (const time of [0, 0.4, 1.3, 2.7]) {
      for (const swing of [-0.3, -0.1, 0, 0.04]) {
        const j = forwardKinematics(hangPoseAtCorner(time, swing, 0.1));
        assert.ok(dist(j.armN.hand, HAND_N) < 0.5, `앞손 ${time} ${swing}`);
        assert.ok(dist(j.armF.hand, HAND_F) < 1.2, `뒷손 ${time} ${swing}`);
      }
    }
  });

  test("올라오는 동안 몸이 돌(난간 안쪽)을 관통하지 않는다", () => {
    let worst = 0;
    for (let i = 0; i <= 400; i++) {
      const j = forwardKinematics(climbPoseAtCorner(i / 400));
      for (const p of allPoints(j)) {
        // 돌: x > 0 이면서 y < 0 (모서리 기준). 관절 반지름을 고려해 1px까지 허용한다.
        if (p.x > 0 && p.y < 0) worst = Math.max(worst, Math.min(p.x, -p.y));
      }
    }
    assert.ok(worst <= 1, `최대 관통 ${worst.toFixed(2)}px`);
  });

  test("밀어 올리는 구간까지 손이 모서리에 고정되어 있다", () => {
    for (let t = 0; t <= 0.53; t += 0.01) {
      const j = forwardKinematics(climbPoseAtCorner(t));
      assert.ok(dist(j.armN.hand, HAND_N) < 0.6, `t=${t.toFixed(2)} 손 ${dist(j.armN.hand, HAND_N).toFixed(2)}px`);
    }
  });

  test("올라오기 끝 자세는 난간 위 대기 자세와 같고, 중간에 자세가 튀지 않는다", () => {
    const end = forwardKinematics(climbPoseAtCorner(1));
    const idle = forwardKinematics(idlePose(0));
    const a = allPoints(end);
    const b = allPoints(idle).map((p) => ({ x: p.x + LEDGE.standX, y: p.y }));
    for (let i = 0; i < a.length; i++) assert.ok(dist(a[i], b[i]) < 0.05, `점 ${i}`);

    // 0.95초 동안 1/120초마다: 한 스텝에 관절이 4.5px(초당 540px) 넘게 움직이지 않는다
    const steps = Math.round(LEDGE.climbTime / FIXED_DT);
    let prev = allPoints(forwardKinematics(climbPoseAtCorner(0)));
    let maxJump = 0;
    for (let i = 1; i <= steps; i++) {
      const cur = allPoints(forwardKinematics(climbPoseAtCorner(i / steps)));
      for (let k = 0; k < cur.length; k++) maxJump = Math.max(maxJump, dist(cur[k], prev[k]));
      prev = cur;
    }
    assert.ok(maxJump < 4.5, `최대 순간 이동 ${maxJump.toFixed(2)}px`);
  });
});

describe("애니메이터: 실제 조작 흐름", () => {
  /**
   * 60fps로 물리(1/120 두 스텝) + 애니메이터를 돌리며 프레임 간 관절의 최대 이동을 잰다.
   * 몸 전체의 이동(물리 좌표)은 빼고 포즈 자체의 변화(+ 화면 오프셋)만 본다: 동작 전환 때 자세가 튀는지 검사.
   */
  function play(start: Player, script: (p: Player, frame: number) => Partial<PlayerInput>, frames: number) {
    const p = start;
    const anim = new Animator();
    anim.reset(p);
    let prev: Vec[] | null = null;
    let prevWorld: Vec[] | null = null;
    let teleports = p.teleports;
    let maxJump = 0;
    let worstFrame = -1;
    const keys = new Set<string>();
    for (let f = 0; f < frames; f++) {
      const events: PlayerEvent[] = [];
      const input = { ...NO_INPUT, ...script(p, f) };
      for (let s = 0; s < 2; s++) stepPlayer(p, s === 0 ? input : { ...input, jumpPressed: false }, world, FIXED_DT, events);
      anim.handle(events, p);
      anim.update(1 / 60, p);
      keys.add(anim.key);
      const j = forwardKinematics(anim.pose);
      const sx = anim.facingScale;
      const local = allPoints(j).map((q) => ({ x: anim.offset.x + q.x * sx, y: anim.offset.y - q.y }));
      const world2 = local.map((q) => ({ x: q.x + p.x, y: q.y + p.y }));
      // 물리 위치가 순간 정렬된 프레임(난간 잡기·올라오기 끝)은 월드 좌표로 비교한다: 화면에서 이어져 보이는지
      const realigned = p.teleports !== teleports;
      teleports = p.teleports;
      const [cur, before] = realigned ? [world2, prevWorld] : [local, prev];
      if (before && !events.some((e) => e.type === "respawn")) {
        for (let k = 0; k < cur.length; k++) {
          const d = dist(cur[k], before[k]);
          if (d > maxJump) {
            maxJump = d;
            worstFrame = f;
          }
        }
      }
      prev = local;
      prevWorld = world2;
    }
    return { maxJump, worstFrame, keys };
  }

  test("달리기 → 멈춤 → 반대로 달리기 → 점프 → 착지에서 자세가 튀지 않는다", () => {
    const p = createPlayer(spot("1"));
    const r = play(
      p,
      (_q, f) => {
        if (f < 70) return { move: 1, run: f > 15 };
        if (f < 110) return {};
        if (f < 170) return { move: -1, run: true };
        if (f < 200) return { move: 1, run: true };
        return { move: 1, run: true, jumpPressed: f === 230, jumpHeld: true };
      },
      330,
    );
    for (const k of ["idle", "loco", "skid", "turn", "prep", "air"]) assert.ok(r.keys.has(k), `${k} 동작 없음`);
    // 달리기에서 흔드는 발은 몸 기준 프레임당 약 7px(초당 420px) 움직인다
    assert.ok(r.maxJump < 10, `프레임 간 최대 이동 ${r.maxJump.toFixed(1)}px (frame ${r.worstFrame})`);
  });

  test("점프해 난간 잡기 → 매달림 → 올라오기 → 대기에서 자세가 튀지 않는다", () => {
    const p = createPlayer(spot("4"));
    p.x = 44 * 32 - 14;
    const r = play(p, (q, f) => ({ jumpPressed: f === 5, jumpHeld: true, up: q.mode === "hang" && q.modeTime > 0.6 }), 200);
    for (const k of ["prep", "air", "hang", "climb", "idle"]) assert.ok(r.keys.has(k), `${k} 동작 없음`);
    assert.ok(r.maxJump < 10, `프레임 간 최대 이동 ${r.maxJump.toFixed(1)}px (frame ${r.worstFrame})`);
  });

  test("높은 곳에서 떨어져 큰 착지 → 다시 걷기", () => {
    const p = createPlayer(spot("6"));
    const r = play(p, () => ({ move: 1 }), 150);
    assert.ok(r.keys.has("land"));
    // 8칸 낙하의 충격 흡수: 0.17초 동안 엉덩이 20px·상체 0.8rad가 함께 내려가 손이 가장 빠르다(초당 720px 이하)
    assert.ok(r.maxJump < 12, `프레임 간 최대 이동 ${r.maxJump.toFixed(1)}px (frame ${r.worstFrame})`);
  });
});

test("뼈 길이가 고정이다 (팔다리가 늘어나지 않음)", () => {
  const j = forwardKinematics(climbPoseAtCorner(0.63));
  assert.ok(Math.abs(dist(j.legN.hip, j.legN.knee) - SK.thigh) < 1e-6);
  assert.ok(Math.abs(dist(j.armN.elbow, j.armN.hand) - SK.foreArm) < 1e-6);
});
