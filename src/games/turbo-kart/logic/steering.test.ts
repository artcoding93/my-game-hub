import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DRIFT, KART, RACE, STEERING } from "../config";
import type { DriveInput, Kart, Obstacle, RaceEvent } from "../types";
import { driveKart, moveKart, tryBoost, yawLimit, type DriveEnv } from "./physics";
import { buildTrack, pointAt, roadAt, wrapS } from "./track";
import { DT, drive, driveFree, input, speed, testKart } from "./testUtils";

/*
 * 조작 감각 테스트 (Smooth Steering · 스핀 방지 · 자동 드리프트 · 부스터).
 * 키보드·터치처럼 -1·0·1만 넣고, 사람이 누르는 시간 그대로 검사한다.
 * driveFree는 위치를 고정해 좁은 출발 직선에서도 벽에 닿지 않고 조향·속도만 본다.
 */

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const slipAngle = (k: Kart) => (speed(k) < 1 ? 0 : wrap(k.heading - Math.atan2(k.vy, k.vx)));

/** 최고 속도로 직선 주행 중인 카트 */
function cruising() {
  const t = testKart();
  drive(t.kart, t.env, input({ throttle: true }), 2.5);
  return t;
}

/** 입력을 seconds 동안 넣으며 매 스텝 관찰 */
function watch(kart: Kart, env: DriveEnv, inp: Partial<DriveInput>, seconds: number, each: (k: Kart, step: number) => void = () => {}) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    driveFree(kart, env, input({ throttle: true, ...inp }), DT);
    each(kart, i);
  }
}

describe("1·2. 짧게 눌렀다 놓기: 놓으면 바로 똑바로 간다 (빙글빙글 돌지 않음)", () => {
  for (const [label, steer, hold, min, max] of [
    ["좌회전 0.2초", -1, 0.2, 0.08, 0.4],
    ["우회전 0.5초", 1, 0.5, 0.45, 1.05],
  ] as const) {
    test(label, () => {
      const { kart, env } = cruising();
      const h0 = kart.heading;
      watch(kart, env, { steer }, hold);
      const atRelease = kart.heading;
      watch(kart, env, {}, 0.3);
      const afterSettle = kart.heading;
      watch(kart, env, {}, 1);
      const turned = wrap(kart.heading - h0) * steer;
      assert.ok(turned > min && turned < max, `${label}: 회전 ${turned.toFixed(3)} rad`);
      const extra = Math.abs(wrap(afterSettle - atRelease));
      assert.ok(extra < 0.22, `놓은 뒤 0.3초 동안 더 돈 양 ${extra.toFixed(3)} (누른 동안 ${turned.toFixed(3)})`);
      assert.ok(Math.abs(wrap(kart.heading - afterSettle)) < 0.01, "그 뒤로는 회전이 멈춤");
      assert.ok(Math.abs(kart.yawRate) < 0.01);
      assert.equal(kart.drifting, false, "짧은 조향은 드리프트가 아니다");
    });
  }

  test("10초 동안 좌우를 짧게 마구 눌러도 스핀하지 않고, 놓으면 곧 멈춘다", () => {
    const { kart, env } = cruising();
    let maxYaw = 0;
    let maxSlip = 0;
    // 0.1~0.3초 간격으로 왼쪽·오른쪽·놓기를 섞는다 (고정 패턴)
    const pattern = [-1, 1, 0, 1, -1, -1, 0, 1, 0, -1, 1, 1, -1, 0];
    const lengths = [0.1, 0.2, 0.15, 0.3, 0.1, 0.25, 0.1, 0.2, 0.3, 0.15];
    let t = 0;
    for (let i = 0; t < 10; i++) {
      const len = lengths[i % lengths.length];
      watch(kart, env, { steer: pattern[i % pattern.length] }, len, (k) => {
        maxYaw = Math.max(maxYaw, Math.abs(k.yawRate));
        maxSlip = Math.max(maxSlip, Math.abs(slipAngle(k)));
      });
      t += len;
    }
    const h = kart.heading;
    watch(kart, env, {}, 0.35);
    const settled = kart.heading;
    watch(kart, env, {}, 1);
    assert.ok(maxYaw <= STEERING.yawCap + 1e-9, `최대 각속도 ${maxYaw}`);
    assert.ok(maxSlip < STEERING.maxSlipAngle + 0.15, `최대 슬립각 ${maxSlip}`);
    assert.ok(Math.abs(wrap(settled - h)) < 0.25, "놓은 뒤 0.35초 안에 거의 멈춤");
    assert.ok(Math.abs(wrap(kart.heading - settled)) < 0.01, "그 뒤로는 회전 없음");
    assert.ok(speed(kart) > KART.maxSpeed * 0.8, `속도 유지 ${speed(kart)}`);
  });
});

describe("3. 좌회전 후 즉시 우회전 (장애물 회피)", () => {
  test("반대 조향에 빠르게 반응하고, 원래 방향으로 돌아온 뒤 반대로 흔들리지 않는다", () => {
    const { kart, env } = cruising();
    const h0 = kart.heading;
    let lateral = 0;
    let minDev = 0;
    let maxDev = 0;
    const track = (k: Kart) => {
      const dev = wrap(k.heading - h0);
      minDev = Math.min(minDev, dev);
      maxDev = Math.max(maxDev, dev);
      lateral += Math.sin(Math.atan2(k.vy, k.vx) - h0) * speed(k) * DT;
    };
    watch(kart, env, { steer: -1 }, 0.3, track);
    // 반대로 꺾은 뒤 각속도 부호가 바뀌기까지
    let flipStep = -1;
    watch(kart, env, { steer: 1 }, 0.3, (k, i) => {
      track(k);
      if (flipStep < 0 && k.yawRate > 0) flipStep = i;
    });
    watch(kart, env, {}, 1, track);
    assert.ok(flipStep >= 0 && flipStep * DT <= 0.15, `반대 방향 반응 ${(flipStep * DT).toFixed(3)}초`);
    assert.ok(Math.abs(lateral) > 25, `옆으로 비켜난 거리 ${lateral.toFixed(1)}px`);
    assert.ok(minDev > -0.8, `왼쪽으로 지나치게 돌지 않음 ${minDev.toFixed(2)}`);
    assert.ok(maxDev < 0.45, `오른쪽으로 지나치게 넘어가지 않음 ${maxDev.toFixed(2)}`);
    assert.ok(Math.abs(wrap(kart.heading - h0)) < 0.45, `회피 후 방향 ${wrap(kart.heading - h0).toFixed(2)}`);
    assert.ok(Math.abs(kart.yawRate) < 0.01, "놓으면 멈춤");
    assert.equal(kart.drifting, false);
  });

  test("작은 입력(0.1초)으로도 진로를 바꿀 수 있다 (조향이 지나치게 느리지 않음)", () => {
    const { kart, env } = cruising();
    const h0 = kart.heading;
    watch(kart, env, { steer: 1 }, 0.1);
    watch(kart, env, {}, 0.5);
    const turned = wrap(kart.heading - h0);
    assert.ok(turned > 0.03 && turned < 0.2, `0.1초 탭 회전 ${turned.toFixed(3)} rad`);
  });
});

describe("4·5. 고속 코너", () => {
  test("속도가 높을수록 최대 각속도가 줄어든다", () => {
    const { kart } = testKart();
    const at = (v: number) => yawLimit(kart, v);
    assert.equal(at(0), 0, "정지 상태에서는 돌지 않음");
    assert.ok(at(STEERING.refSpeed) > at(KART.maxSpeed), `${at(STEERING.refSpeed)} > ${at(KART.maxSpeed)}`);
    assert.ok(at(KART.maxSpeed) > at(KART.maxSpeed * 1.3));
    assert.ok(at(KART.maxSpeed) > 1.7 && at(KART.maxSpeed) < 2.3, `최고 속도에서 ${at(KART.maxSpeed)} rad/s`);
  });

  test("고속에서 계속 꺾으면(급커브) 자동 드리프트로 조금 더 돌지만 각속도·슬립각 상한을 넘지 않고 속도도 크게 줄지 않는다", () => {
    const { kart, env } = cruising();
    let maxYaw = 0;
    let maxSlip = 0;
    const h0 = kart.heading;
    watch(kart, env, { steer: 1 }, 1.5, (k) => {
      maxYaw = Math.max(maxYaw, Math.abs(k.yawRate));
      maxSlip = Math.max(maxSlip, Math.abs(slipAngle(k)));
    });
    assert.ok(kart.drifting, "자동 드리프트");
    assert.ok(maxYaw <= STEERING.yawCap, `각속도 ${maxYaw}`);
    assert.ok(maxSlip <= STEERING.maxSlipAngle + 0.1, `슬립각 ${maxSlip}`);
    assert.ok(speed(kart) > KART.maxSpeed * 0.75, `속도 ${speed(kart)}`);
    const turned = wrap(kart.heading - h0 - Math.PI) + Math.PI;
    assert.ok(turned > 2.4 && turned < 2 * Math.PI, `1.5초 동안 ${turned.toFixed(2)} rad (360° 미만)`);
    watch(kart, env, {}, 0.5);
    assert.equal(kart.drifting, false, "조향을 풀면 드리프트 종료");
    assert.ok(Math.abs(kart.yawRate) < 0.05);
  });

  // 초보자 봇: 방향키(-1·0·1)와 가속 페달만 쓴다. 코스 앞쪽 점을 보고 꺾고, 많이 틀어졌을 때만 가속을 뗀다(브레이크 없음).
  for (const trackId of ["greenValley", "desertCanyon", "frostCircuit"] as const) {
    test(`방향키만으로 한 바퀴: ${trackId} (완만한 코너·급커브 포함, 장애물 없이 코스만)`, () => {
      const { kart } = testKart();
      const built = buildTrack(trackId);
      const env: DriveEnv = { track: built, difficulty: "easy", obstacles: [], movers: [] };
      const start = pointAt(built, 50, 0);
      Object.assign(kart, { x: start.x, y: start.y, heading: Math.atan2(start.ty, start.tx), vx: 0, vy: 0, steerValue: 0, yawRate: 0, drifting: false });
      let s = 50;
      let progress = 0;
      let wallHits = 0;
      let maxYaw = 0;
      let worstHeadingError = 0;
      const events: RaceEvent[] = [];
      for (let step = 0; step < 60 * 140 && progress < built.length; step++) {
        const look = pointAt(built, wrapS(s + 70 + speed(kart) * 0.35, built.length), 0);
        const err = wrap(Math.atan2(look.y - kart.y, look.x - kart.x) - kart.heading);
        const steer = Math.abs(err) < 0.05 ? 0 : Math.sign(err);
        const inp = input({ throttle: Math.abs(err) < 0.45, steer });
        const before = events.length;
        driveKart(kart, inp, env, DT, events);
        for (let k = 0; k < RACE.substeps; k++) moveKart(kart, env, DT / RACE.substeps, events);
        wallHits += events.slice(before).filter((e) => e.type === "wall").length;
        maxYaw = Math.max(maxYaw, Math.abs(kart.yawRate));
        // 코스 위 위치를 따라간다 (가까운 점 찾기)
        let best = s;
        let bestD = Infinity;
        for (let d = -20; d <= 60; d += 4) {
          const p = pointAt(built, wrapS(s + d, built.length), 0);
          const dist = Math.hypot(p.x - kart.x, p.y - kart.y);
          if (dist < bestD) {
            bestD = dist;
            best = s + d;
          }
        }
        progress += best - s;
        s = wrapS(best, built.length);
        const here = pointAt(built, s, 0);
        worstHeadingError = Math.max(worstHeadingError, Math.abs(wrap(kart.heading - Math.atan2(here.ty, here.tx))));
        assert.ok(roadAt(built, kart.x, kart.y), "코스 밖으로 나가지 않음");
      }
      assert.ok(progress >= built.length, `${trackId}: 한 바퀴 완주 못 함 (${progress.toFixed(0)} / ${built.length.toFixed(0)})`);
      assert.ok(maxYaw <= STEERING.yawCap + 1e-9);
      assert.ok(worstHeadingError < Math.PI / 2, `${trackId}: 코스 방향에서 ${worstHeadingError.toFixed(2)} rad까지 틀어짐 (스핀)`);
      assert.ok(wallHits <= 6, `${trackId}: 강한 벽 충돌 ${wallHits}회`);
    });
  }
});

describe("6·7. 부스터", () => {
  test("부스터 중 코너링: 최대 각속도가 더 낮고 스핀하지 않는다", () => {
    const normal = cruising();
    const boosted = cruising();
    boosted.kart.gauge = 100;
    assert.ok(tryBoost(boosted.kart, []));
    watch(boosted.kart, boosted.env, {}, 0.6);
    assert.ok(yawLimit(boosted.kart, speed(boosted.kart)) < yawLimit(normal.kart, speed(normal.kart)), "부스터 중 회전 제한 강화");
    let maxYaw = 0;
    let maxSlip = 0;
    watch(boosted.kart, boosted.env, { steer: 1 }, 1, (k) => {
      maxYaw = Math.max(maxYaw, Math.abs(k.yawRate));
      maxSlip = Math.max(maxSlip, Math.abs(slipAngle(k)));
    });
    assert.ok(boosted.kart.boostTime > 0);
    assert.ok(maxYaw < STEERING.maxYaw, `부스터 코너 각속도 ${maxYaw}`);
    assert.ok(maxSlip <= STEERING.maxSlipAngle + 0.1, `슬립각 ${maxSlip}`);
    watch(boosted.kart, boosted.env, {}, 0.4);
    assert.ok(Math.abs(boosted.kart.yawRate) < 0.05, "놓으면 멈춤");
  });

  test("자동 드리프트 중 부스터: 두 상태가 함께 유지되고, 이펙트 조건(drifting·boostTime)이 그대로다", () => {
    const { kart, env } = cruising();
    watch(kart, env, { steer: 1 }, 0.6);
    assert.ok(kart.drifting);
    kart.gauge = 100;
    const events: RaceEvent[] = [];
    driveKart(kart, input({ throttle: true, steer: 1, boost: true }), env, DT, events);
    assert.ok(events.some((e) => e.type === "boost"), "부스터 이벤트(효과음·이펙트)");
    let maxYaw = 0;
    watch(kart, env, { steer: 1 }, 0.8, (k) => (maxYaw = Math.max(maxYaw, Math.abs(k.yawRate))));
    assert.ok(kart.drifting && kart.boostTime > 0, "드리프트와 부스터 동시");
    assert.ok(maxYaw <= STEERING.yawCap);
    assert.ok(Math.abs(slipAngle(kart)) <= STEERING.maxSlipAngle + 0.1);
    watch(kart, env, {}, 0.5);
    assert.equal(kart.drifting, false);
    assert.ok(Math.abs(kart.yawRate) < 0.05);
  });
});

describe("8. 충돌 직후", () => {
  test("장애물에 부딪히면 남은 회전이 줄고, 조향을 풀면 계속 돌지 않으며, 다시 꺾으면 정상 반응한다", () => {
    const { kart, env } = cruising();
    // 오른쪽으로 꺾으며 달리는 진로 앞에 장애물
    watch(kart, env, { steer: 1 }, 0.15);
    const yawBefore = kart.yawRate;
    const o: Obstacle = { x: kart.x + Math.cos(kart.heading) * 30, y: kart.y + Math.sin(kart.heading) * 30, r: 16 } as Obstacle;
    const hitEnv: DriveEnv = { ...env, obstacles: [o] };
    const events: RaceEvent[] = [];
    for (let i = 0; i < 10 && !events.some((e) => e.type === "obstacle"); i++) {
      driveKart(kart, input({ throttle: true, steer: 1 }), hitEnv, DT, events);
      for (let k = 0; k < RACE.substeps; k++) moveKart(kart, hitEnv, DT / RACE.substeps, events);
    }
    assert.ok(events.some((e) => e.type === "obstacle"), "충돌");
    assert.ok(Math.abs(kart.yawRate) < Math.abs(yawBefore), `충돌 후 각속도 ${kart.yawRate} < ${yawBefore}`);
    assert.equal(kart.drifting, false);
    const h = kart.heading;
    for (let i = 0; i < 30; i++) driveKart(kart, input({ throttle: true }), env, DT, []);
    const settled = kart.heading;
    for (let i = 0; i < 60; i++) driveKart(kart, input({ throttle: true }), env, DT, []);
    assert.ok(Math.abs(wrap(settled - h)) < 0.15, "충돌 뒤 저절로 돌지 않음");
    assert.ok(Math.abs(wrap(kart.heading - settled)) < 0.01);
    const h2 = kart.heading;
    for (let i = 0; i < 24; i++) driveKart(kart, input({ throttle: true, steer: -1 }), env, DT, []);
    assert.ok(wrap(kart.heading - h2) < -0.15, "다시 조향 가능");
  });

  test("오일·로켓 미끄러짐(아이템 규칙)이 끝나면 남은 회전 없이 바로 조작이 돌아온다", () => {
    const { kart, env } = cruising();
    kart.spinTime = 0.5;
    watch(kart, env, { steer: 1 }, 0.55);
    assert.equal(kart.spinTime, 0);
    const h = kart.heading;
    watch(kart, env, {}, 0.5);
    assert.ok(Math.abs(wrap(kart.heading - h)) < 0.01, "미끄러짐 뒤 회전 없음");
  });
});

describe("드리프트 연출 조건 유지", () => {
  test("드리프트 중에는 drifting·driftCharging이 켜진다 (타이어 자국·먼지·스키드음·게이지 색이 이 값을 읽는다)", () => {
    const { kart, env } = cruising();
    let charging = false;
    watch(kart, env, { steer: -1 }, 0.9, (k) => (charging ||= k.driftCharging));
    assert.ok(kart.drifting && charging);
    assert.equal(kart.driftDir, -1);
    assert.ok(kart.gauge > 0 && kart.gauge < 100);
    assert.ok(DRIFT.chargePerSecond > 0);
  });
});
