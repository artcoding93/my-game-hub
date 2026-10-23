import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BOOSTER, DRIFT, ITEM_FX, KART, SURFACES } from "../config";
import type { RaceEvent } from "../types";
import { maxSpeedOf, resolveKarts, speedScale, tryBoost } from "./physics";
import { roadAt } from "./track";
import { DT, drive, input, speed, testKart } from "./testUtils";

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
    drive(kart, env, input({ throttle: true, steer: 1 }), 0.3);
    assert.ok(kart.heading > h1 + 0.3, "오른쪽(화면 시계 방향)으로");
    const h2 = kart.heading;
    drive(kart, env, input({ throttle: true, steer: -1 }), 0.3);
    assert.ok(kart.heading < h2 - 0.3, "왼쪽으로");
  });
});

describe("드리프트", () => {
  test("빠를 때 조향 + 드리프트 → 드리프트 상태, 회전 반경이 줄고 옆으로 미끄러진다", () => {
    const normal = testKart();
    const drifting = testKart();
    for (const t of [normal, drifting]) drive(t.kart, t.env, input({ throttle: true }), 2);
    const h = normal.kart.heading;
    drive(normal.kart, normal.env, input({ throttle: true, steer: 1 }), 0.25);
    drive(drifting.kart, drifting.env, input({ throttle: true, steer: 1, drift: true }), 0.25);
    assert.ok(drifting.kart.drifting);
    assert.ok(drifting.kart.heading - h > normal.kart.heading - h, "드리프트가 더 많이 돈다");
    const k = drifting.kart;
    const slip = Math.abs(-Math.sin(k.heading) * k.vx + Math.cos(k.heading) * k.vy);
    assert.ok(slip > DRIFT.minSlip, `횡미끄러짐 ${slip}`);
  });

  test("유효한 드리프트를 유지할 때만 게이지가 찬다", () => {
    const { kart, env } = testKart();
    drive(kart, env, input({ throttle: true }), 2);
    drive(kart, env, input({ throttle: true, steer: 1, drift: true }), 0.5);
    assert.ok(kart.gauge > 5, `${kart.gauge}`);
  });

  test("직선에서 드리프트 버튼만 누르거나, 느릴 때는 충전되지 않는다", () => {
    const straight = testKart();
    drive(straight.kart, straight.env, input({ throttle: true }), 2);
    drive(straight.kart, straight.env, input({ throttle: true, drift: true }), 1);
    assert.equal(straight.kart.gauge, 0);
    assert.equal(straight.kart.drifting, false);
    const slow = testKart();
    drive(slow.kart, slow.env, input({ throttle: true }), 0.3);
    drive(slow.kart, slow.env, input({ drift: true, steer: 1 }), 0.5);
    assert.ok(speed(slow.kart) < KART.maxSpeed * DRIFT.minSpeedRatio);
    assert.equal(slow.kart.gauge, 0, "느릴 때는 드리프트가 되지 않는다");
  });

  test("벽에 부딪히면 드리프트가 끝나고 잠시 충전이 멈춘다", () => {
    const { kart, env } = testKart();
    drive(kart, env, input({ throttle: true }), 2);
    drive(kart, env, input({ throttle: true, steer: 1, drift: true }), 0.3);
    // 바깥 벽 쪽으로 강제로 밀어 붙인다
    const road = roadAt(env.track, kart.x, kart.y)!;
    kart.x = road.cx + road.nx * (road.limit + 5);
    kart.y = road.cy + road.ny * (road.limit + 5);
    kart.vx += road.nx * 200;
    kart.vy += road.ny * 200;
    drive(kart, env, input({ throttle: true, steer: 1, drift: true }), DT);
    assert.ok(kart.wallTime > 0);
    const g = kart.gauge;
    drive(kart, env, input({ throttle: true, steer: 1, drift: true }), DT * 5);
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
