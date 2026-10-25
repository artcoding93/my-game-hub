import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BOOSTER, DRIFT, ITEM_FX, KART, STEERING, SURFACES } from "../config";
import type { RaceEvent } from "../types";
import { maxSpeedOf, resolveKarts, speedScale, tryBoost } from "./physics";
import { roadAt } from "./track";
import { DT, drive, driveFree, input, speed, testKart } from "./testUtils";

/* 실행: npm run test:turbo-kart */

describe("가속·브레이크·마찰", () => {
  test("정지 상태에서 가속하면 점점 빨라지고 최고 속도를 넘지 않는다", () => {
    const { kart, env } = testKart();
    drive(kart, env, input({ throttle: true }), 0.5);
    const early = speed(kart);
    drive(kart, env, input({ throttle: true }), 2.5);
    assert.ok(early > 100 && early < KART.maxSpeed * 0.6, `0.5초 ${early}`);
    assert.ok(Math.abs(speed(kart) - KART.maxSpeed) < 2, `3초 ${speed(kart)}`);
  });

  test("브레이크는 자연 감속보다 훨씬 빨리 멈춘다", () => {
    const a = testKart();
    const b = testKart();
    for (const t of [a, b]) drive(t.kart, t.env, input({ throttle: true }), 2);
    drive(a.kart, a.env, input({ brake: true }), 0.5);
    drive(b.kart, b.env, input({}), 0.5);
    assert.ok(speed(a.kart) < speed(b.kart) - 150, `${speed(a.kart)} vs ${speed(b.kart)}`);
    drive(a.kart, a.env, input({ brake: true }), 1);
    const fx = Math.cos(a.kart.heading);
    assert.ok(a.kart.vx * fx < 0, "계속 누르면 후진");
    assert.ok(speed(a.kart) <= KART.reverseMax + 1);
  });

  test("가속을 떼면 마찰로 서서히 감속한다 (관성)", () => {
    const { kart, env } = testKart();
    drive(kart, env, input({ throttle: true }), 2);
    const v0 = speed(kart);
    drive(kart, env, input({}), 0.5);
    const v1 = speed(kart);
    assert.ok(v1 < v0 && v1 > v0 * 0.6, `${v0} → ${v1}`);
  });

  test("도로 밖(갓길)에서는 최고 속도가 55%", () => {
    const { kart } = testKart();
    assert.equal(maxSpeedOf(kart, "offroad"), KART.maxSpeed * SURFACES.offroad.maxSpeed);
  });
});

describe("조향", () => {
  test("멈춰 있으면 돌지 않고, 달리면 조향 방향으로 돈다", () => {
    const { kart, env } = testKart();
    const h0 = kart.heading;
    drive(kart, env, input({ steer: 1 }), 0.5);
    assert.ok(Math.abs(kart.heading - h0) < 1e-9, "정지 상태");
    drive(kart, env, input({ throttle: true }), 1);
    const h1 = kart.heading;
    drive(kart, env, input({ throttle: true, steer: 1 }), 0.4);
    assert.ok(kart.heading > h1 + 0.3, "오른쪽(화면 시계 방향)으로");
    const h2 = kart.heading;
    drive(kart, env, input({ throttle: true, steer: -1 }), 0.5);
    assert.ok(kart.heading < h2 - 0.2, "왼쪽으로");
  });
});

/** 직선에서 최고 속도까지 달린 카트 */
function cruising() {
  const t = testKart();
  drive(t.kart, t.env, input({ throttle: true }), 2.5);
  return t;
}

const slipOf = (k: { heading: number; vx: number; vy: number }) => Math.abs(-Math.sin(k.heading) * k.vx + Math.cos(k.heading) * k.vy);

describe("자동 드리프트", () => {
  test("빠를 때 한쪽으로 강하게 0.25초 이상 꺾으면 드리프트가 시작되고 옆으로 미끄러진다", () => {
    const { kart, env } = cruising();
    driveFree(kart, env, input({ throttle: true, steer: 1 }), 0.2);
    assert.equal(kart.drifting, false, "0.2초: 아직 아님");
    driveFree(kart, env, input({ throttle: true, steer: 1 }), 0.3);
    assert.ok(kart.drifting, "0.5초: 드리프트");
    assert.equal(kart.driftDir, 1);
    driveFree(kart, env, input({ throttle: true, steer: 1 }), 0.2);
    assert.ok(slipOf(kart) > DRIFT.minSlip, `횡미끄러짐 ${slipOf(kart)}`);
  });

  test("직선 주행·짧은 조향·느린 속도에서는 드리프트하지 않는다", () => {
    const straight = cruising();
    driveFree(straight.kart, straight.env, input({ throttle: true }), 1);
    assert.equal(straight.kart.drifting, false);
    const tap = cruising();
    for (let i = 0; i < 4; i++) {
      driveFree(tap.kart, tap.env, input({ throttle: true, steer: 1 }), 0.2);
      driveFree(tap.kart, tap.env, input({ throttle: true }), 0.3);
    }
    assert.equal(tap.kart.drifting, false, "톡톡 끊어 꺾으면 드리프트하지 않음");
    const slow = testKart();
    driveFree(slow.kart, slow.env, input({ throttle: true }), 0.4);
    driveFree(slow.kart, slow.env, input({ steer: 1 }), 1);
    assert.ok(speed(slow.kart) < KART.maxSpeed * DRIFT.minSpeedRatio);
    assert.equal(slow.kart.drifting, false);
    assert.equal(slow.kart.gauge, 0, "느릴 때는 충전되지 않는다");
  });

  test("조향을 풀면 곧 끝나고, 아주 짧게 풀었다 다시 꺾으면 유지된다 (히스테리시스)", () => {
    const { kart, env } = cruising();
    driveFree(kart, env, input({ throttle: true, steer: 1 }), 0.6);
    assert.ok(kart.drifting);
    driveFree(kart, env, input({ throttle: true }), 0.1);
    driveFree(kart, env, input({ throttle: true, steer: 1 }), 0.2);
    assert.ok(kart.drifting, "0.1초만 풀면 유지");
    driveFree(kart, env, input({ throttle: true }), 0.35);
    assert.equal(kart.drifting, false, "계속 풀면 종료");
    // 끝난 직후 같은 방향으로 바로 다시 꺾어도 진입 시간을 다시 채워야 한다
    driveFree(kart, env, input({ throttle: true, steer: 1 }), 0.15);
    assert.equal(kart.drifting, false);
  });

  test("드리프트 중 키를 잠깐씩 놓아도 들어갔다 나왔다를 반복하지 않는다 (2초 동안 전환 1회)", () => {
    const { kart, env } = cruising();
    let switches = 0;
    let was = kart.drifting;
    for (let i = 0; i < 120; i++) {
      // 0.5초 꺾고, 이후 0.07초 꺾고 0.03초 놓기를 반복 (키를 잠깐씩 놓는 손 떨림)
      const steer = i < 30 ? 1 : i % 6 < 4 ? 1 : 0;
      driveFree(kart, env, input({ throttle: true, steer }), DT);
      if (kart.drifting !== was) switches++;
      was = kart.drifting;
    }
    assert.ok(switches <= 1, `전환 ${switches}회`);
  });

  test("드리프트는 각속도 상한을 넘지 않고, 조향을 풀면 회전이 멈춘다", () => {
    const { kart, env } = cruising();
    let maxYaw = 0;
    for (let i = 0; i < 90; i++) {
      const h = kart.heading;
      driveFree(kart, env, input({ throttle: true, steer: 1 }), DT);
      maxYaw = Math.max(maxYaw, Math.abs(kart.heading - h) / DT);
    }
    assert.ok(kart.drifting);
    assert.ok(maxYaw <= STEERING.yawCap + 1e-9, `최대 각속도 ${maxYaw}`);
    driveFree(kart, env, input({ throttle: true }), 0.4);
    assert.ok(Math.abs(kart.yawRate) < 0.05, `남은 각속도 ${kart.yawRate}`);
  });

  test("유효한 드리프트를 유지할 때만 게이지가 찬다", () => {
    const { kart, env } = cruising();
    driveFree(kart, env, input({ throttle: true, steer: 1 }), 0.8);
    assert.ok(kart.gauge > 5, `${kart.gauge}`);
  });

  test("벽에 부딪히면 드리프트가 끝나고 잠시 충전이 멈춘다", () => {
    const { kart, env } = cruising();
    drive(kart, env, input({ throttle: true, steer: 1 }), 0.5);
    assert.ok(kart.drifting);
    // 바깥 벽 쪽으로 강제로 밀어 붙인다
    const road = roadAt(env.track, kart.x, kart.y)!;
    kart.x = road.cx + road.nx * (road.limit + 5);
    kart.y = road.cy + road.ny * (road.limit + 5);
    kart.vx += road.nx * 200;
    kart.vy += road.ny * 200;
    drive(kart, env, input({ throttle: true, steer: 1 }), DT);
    assert.ok(kart.wallTime > 0);
    assert.equal(kart.drifting, false);
    const g = kart.gauge;
    drive(kart, env, input({ throttle: true, steer: 1 }), DT * 5);
    assert.equal(kart.gauge, g, "벽 충돌 직후에는 충전 중단");
  });
});

describe("부스터", () => {
  test("게이지 100%일 때만 2초, 최고 속도 30% 증가, 사용 후 게이지 0과 쿨다운", () => {
    const { kart, env } = testKart();
    const events: RaceEvent[] = [];
    assert.equal(tryBoost(kart, events), false, "게이지 부족");
    kart.gauge = 100;
    assert.ok(tryBoost(kart, events));
    assert.equal(kart.gauge, 0);
    assert.equal(kart.boostTime, BOOSTER.duration);
    assert.equal(maxSpeedOf(kart, "road"), KART.maxSpeed * BOOSTER.speedScale);
    drive(kart, env, input({ throttle: true }), 1.6);
    assert.ok(speed(kart) > KART.maxSpeed * 1.15, `부스터 중 ${speed(kart)}`);
    drive(kart, env, input({ throttle: true }), 0.5);
    assert.equal(kart.boostTime, 0);
    assert.ok(kart.boostCooldown > 0, "끝난 뒤 쿨다운");
    kart.gauge = 100;
    assert.equal(tryBoost(kart, events), false, "쿨다운 중 연속 사용 불가");
    drive(kart, env, input({ throttle: true }), 2);
    assert.ok(speed(kart) < KART.maxSpeed + 5, "끝나면 원래 최고 속도로 돌아온다");
  });

  test("부스터·Turbo Boost·Speed Wind를 함께 써도 합산 상한을 넘지 않는다", () => {
    const { kart } = testKart();
    kart.boostTime = 2;
    kart.turboTime = 3;
    kart.windTime = 5;
    assert.equal(speedScale(kart), BOOSTER.maxCombinedScale);
    assert.ok(BOOSTER.speedScale * ITEM_FX.turboSpeedScale > BOOSTER.maxCombinedScale);
  });
});

describe("충돌", () => {
  test("벽: 바깥으로 나가지 못하고 세게 부딪히면 속도가 줄며 끼지 않는다", () => {
    const { kart, env } = testKart();
    drive(kart, env, input({ throttle: true }), 2);
    kart.heading += Math.PI / 2; // 오른쪽 벽을 향해
    const fx = Math.cos(kart.heading);
    const fy = Math.sin(kart.heading);
    kart.vx = fx * KART.maxSpeed;
    kart.vy = fy * KART.maxSpeed;
    const events = drive(kart, env, input({ throttle: true }), 1);
    const road = roadAt(env.track, kart.x, kart.y)!;
    assert.ok(road.d <= road.limit, "벽 안쪽");
    assert.ok(events.some((e) => e.type === "wall"));
    kart.heading -= Math.PI / 2;
    drive(kart, env, input({ throttle: true }), 1.5);
    assert.ok(speed(kart) > KART.maxSpeed * SURFACES.offroad.maxSpeed * 0.7, `벽을 따라 다시 달린다 ${speed(kart)}`);
  });

  test("장애물: 최고 속도에서도 뚫고 지나가지 않는다", () => {
    const { kart, env } = testKart(150);
    const ahead = { x: kart.x + Math.cos(kart.heading) * 200, y: kart.y + Math.sin(kart.heading) * 200 };
    env.obstacles = [{ kind: "rock", x: ahead.x, y: ahead.y, r: 16 }];
    kart.vx = Math.cos(kart.heading) * KART.maxSpeed * BOOSTER.maxCombinedScale;
    kart.vy = Math.sin(kart.heading) * KART.maxSpeed * BOOSTER.maxCombinedScale;
    const events = drive(kart, env, input({ throttle: true }), 0.6);
    const along = (kart.x - ahead.x) * Math.cos(kart.heading) + (kart.y - ahead.y) * Math.sin(kart.heading);
    assert.ok(along < 0, "장애물 앞에서 멈춘다");
    assert.ok(Math.hypot(kart.x - ahead.x, kart.y - ahead.y) >= 16 + KART.radius - 0.5);
    assert.ok(events.some((e) => e.type === "obstacle"));
  });

  test("카트끼리: 겹치면 밀어내고 지나치게 튀지 않는다", () => {
    const a = testKart(150).kart;
    const { race } = testKart(150);
    const b = race.state.karts[0];
    Object.assign(b, { x: a.x + 10, y: a.y, vx: -100, vy: 0 });
    a.vx = 100;
    a.vy = 0;
    resolveKarts([a, b], []);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= KART.radius * 2 - 1e-6);
    assert.ok(Math.abs(a.vx) <= 100 && Math.abs(b.vx) <= 100, "에너지가 늘지 않는다");
  });
});

describe("고정 시간 간격", () => {
  test("같은 입력이면 같은 결과 (결정적)", () => {
    const a = testKart();
    const b = testKart();
    const inp = input({ throttle: true, steer: 0.4 });
    drive(a.kart, a.env, inp, 2);
    drive(b.kart, b.env, inp, 1);
    drive(b.kart, b.env, inp, 1);
    assert.equal(a.kart.x, b.kart.x);
    assert.equal(a.kart.y, b.kart.y);
  });
});
