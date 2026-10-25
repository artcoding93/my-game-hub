import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Camera, CAMERA } from "./camera";
import { createRace, PLAYER, stepRace } from "./logic/game";
import { NO_INPUT } from "./logic/physics";
import { STEERING } from "./config";

const W = 390;
const H = 488;
const DT = 1 / 60;

function kartAt(heading: number) {
  const race = createRace({ track: "frostCircuit", difficulty: "normal", seed: 5 });
  const kart = race.state.karts[PLAYER];
  Object.assign(kart, { x: 1000, y: 800, heading, vx: Math.cos(heading) * 300, vy: Math.sin(heading) * 300 });
  return kart;
}

describe("회전 카메라 (chase)", () => {
  test("카트는 화면 아래쪽 가운데, 전방은 항상 화면 위", () => {
    for (const heading of [0, 1, 2.5, -2, Math.PI]) {
      const kart = kartAt(heading);
      const cam = new Camera("chase");
      cam.update(kart, DT);
      const p = cam.worldToScreen(kart.x, kart.y, W, H);
      assert.ok(Math.abs(p.x - W / 2) < 1e-6 && Math.abs(p.y - H * CAMERA.anchorY) < 1e-6);
      const ahead = cam.worldToScreen(kart.x + Math.cos(heading) * 100, kart.y + Math.sin(heading) * 100, W, H);
      assert.ok(Math.abs(ahead.x - p.x) < 1e-6, "앞쪽 점은 바로 위");
      assert.ok(ahead.y < p.y - 50, "앞쪽 점은 위쪽");
    }
  });

  test("방향이 갑자기 바뀌어도 화면은 최대 회전 속도로 천천히 따라간다", () => {
    const kart = kartAt(0);
    const cam = new Camera("chase");
    cam.update(kart, DT);
    kart.heading = Math.PI / 2;
    const before = cam.heading;
    cam.update(kart, DT);
    assert.ok(Math.abs(cam.heading - before) <= CAMERA.maxTurnSpeed * DT + 1e-9, "한 프레임 회전량 제한");
    for (let t = 0; t < 2; t += DT) cam.update(kart, DT);
    assert.ok(Math.abs(cam.heading - Math.PI / 2) < 0.02, `2초 안에 수렴 ${cam.heading}`);
  });

  test("스핀(미끄러짐) 중에는 화면을 돌리지 않는다", () => {
    const kart = kartAt(0);
    const cam = new Camera("chase");
    cam.update(kart, DT);
    kart.spinTime = 1;
    kart.heading = 2;
    for (let t = 0; t < 0.5; t += DT) cam.update(kart, DT);
    assert.equal(cam.heading, 0);
  });

  test("±π 경계를 넘을 때 반대로 한 바퀴 돌지 않는다", () => {
    const kart = kartAt(Math.PI - 0.1);
    const cam = new Camera("chase");
    cam.update(kart, DT);
    kart.heading = -Math.PI + 0.1;
    cam.update(kart, DT);
    assert.ok(Math.abs(Math.atan2(Math.sin(cam.heading - (Math.PI - 0.1)), Math.cos(cam.heading - (Math.PI - 0.1)))) <= CAMERA.maxTurnSpeed * DT + 1e-9);
  });

  test("회전해도 화면 네 모서리가 모두 그리기 범위 안 (빈 공간 없음)", () => {
    for (const heading of [0, 0.7, 1.6, 2.9, -1.2]) {
      const cam = new Camera("chase");
      cam.update(kartAt(heading), DT);
      const b = cam.viewBounds(W, H, 0);
      for (const [sx, sy] of [
        [0, 0],
        [W, 0],
        [0, H],
        [W, H],
      ]) {
        const p = cam.screenToWorld(sx, sy, W, H);
        assert.ok(p.x >= b.x0 - 1e-6 && p.x <= b.x1 + 1e-6 && p.y >= b.y0 - 1e-6 && p.y <= b.y1 + 1e-6);
      }
      const back = cam.worldToScreen(cam.screenToWorld(10, 20, W, H).x, cam.screenToWorld(10, 20, W, H).y, W, H);
      assert.ok(Math.abs(back.x - 10) < 1e-6 && Math.abs(back.y - 20) < 1e-6, "역변환 일치");
    }
  });
});

describe("고정 카메라 (topdown)와 공통", () => {
  test("고정 카메라는 회전 없이 북쪽(-y)이 위", () => {
    const cam = new Camera("topdown");
    cam.update(kartAt(1.2), DT);
    assert.equal(cam.rotation(), 0);
    const a = cam.worldToScreen(0, 0, W, H);
    const b = cam.worldToScreen(0, -100, W, H);
    assert.ok(Math.abs(a.x - b.x) < 1e-9 && b.y < a.y);
  });

  test("카메라는 카트 상태(좌표·속도·방향)를 바꾸지 않고, 같은 레이스 결과를 만든다", () => {
    const run = (withCamera: boolean) => {
      const race = createRace({ track: "greenValley", difficulty: "normal", seed: 11, autopilot: true });
      const cam = new Camera("chase");
      for (let t = 0; t < 20; t += DT) {
        stepRace(race, NO_INPUT, DT);
        if (withCamera) {
          const k = race.state.karts[PLAYER];
          const before = JSON.stringify([k.x, k.y, k.vx, k.vy, k.heading]);
          cam.update(k, DT);
          cam.viewBounds(W, H);
          assert.equal(JSON.stringify([k.x, k.y, k.vx, k.vy, k.heading]), before);
        }
      }
      return JSON.stringify(race.state.karts.map((k) => [k.x, k.y, k.dist]));
    };
    assert.equal(run(true), run(false));
  });

  test("모드를 바꾸면 다음 프레임에 새 모드로 바로 맞춘다", () => {
    const cam = new Camera("chase");
    const kart = kartAt(0.5);
    cam.update(kart, DT);
    cam.setMode("topdown");
    cam.update(kart, DT);
    assert.equal(cam.rotation(), 0);
    cam.setMode("chase");
    cam.update(kart, DT);
    assert.ok(Math.abs(cam.heading - 0.5) < 1e-9);
  });

});

describe("카메라 안정화 (조향 개선)", () => {
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  /** 카트가 rate(rad/s)로 duration초 돌다가 멈춘 뒤 settle초 동안, frameDt 간격으로 카메라를 갱신한다 */
  function follow(frameDt: number, rate: number, duration: number, settle: number) {
    const cam = new Camera("chase");
    const kart = kartAt(0);
    cam.update(kart, frameDt);
    let maxLag = 0;
    let t = 0;
    while (t < duration - 1e-9) {
      kart.heading += rate * frameDt;
      cam.update(kart, frameDt);
      maxLag = Math.max(maxLag, Math.abs(wrap(kart.heading - cam.heading)));
      t += frameDt;
    }
    const stopAt = cam.heading;
    let afterHalf = cam.heading;
    for (let u = 0; u < settle - 1e-9; u += frameDt) {
      cam.update(kart, frameDt);
      if (u < 0.5) afterHalf = cam.heading;
    }
    return { cam, kart, maxLag, stopAt, afterHalf };
  }

  test("카트가 가장 빨리 돌아도 화면이 크게 뒤처지지 않고, 카트가 멈추면 0.5초 안에 화면도 멈춘다", () => {
    const r = follow(DT, STEERING.yawCap, 1, 1.5);
    assert.ok(r.maxLag < 0.6, `최대 지연 ${r.maxLag.toFixed(2)} rad`);
    assert.ok(Math.abs(wrap(r.kart.heading - r.afterHalf)) < 0.03, `0.5초 뒤 남은 차이 ${wrap(r.kart.heading - r.afterHalf).toFixed(3)}`);
    assert.ok(Math.abs(wrap(r.kart.heading - r.cam.heading)) < 1e-3, "결국 정확히 맞춤");
    assert.ok(CAMERA.maxTurnSpeed > STEERING.yawCap, "화면 최대 회전 속도가 카트 각속도 상한보다 커야 뒤처져 계속 돌지 않는다");
  });

  test("순간적인 방향 흔들림(0.05초)에는 화면이 조금만 반응한다", () => {
    const cam = new Camera("chase");
    const kart = kartAt(0);
    cam.update(kart, DT);
    kart.heading = 0.3;
    for (let i = 0; i < 3; i++) cam.update(kart, DT);
    kart.heading = 0;
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      cam.update(kart, DT);
      peak = Math.max(peak, Math.abs(cam.heading));
    }
    assert.ok(peak < 0.12, `흔들림이 화면에 전해진 양 ${peak.toFixed(3)}`);
  });

  test("30·60·120FPS에서 같은 움직임이면 화면 회전도 거의 같다", () => {
    const results = [1 / 30, 1 / 60, 1 / 120].map((dt) => follow(dt, 2, 0.6, 0.3).cam.heading);
    for (const h of results) assert.ok(Math.abs(wrap(h - results[1])) < 0.03, `${results.map((x) => x.toFixed(3)).join(" / ")}`);
  });

  test("±180° 경계를 넘어 돌아도 짧은 쪽으로 따라간다", () => {
    const cam = new Camera("chase");
    const kart = kartAt(Math.PI - 0.05);
    cam.update(kart, DT);
    for (let i = 0; i < 30; i++) {
      kart.heading = wrap(kart.heading + 2 * DT);
      cam.update(kart, DT);
      assert.ok(Math.abs(wrap(kart.heading - cam.heading)) < 0.5, "반대쪽으로 한 바퀴 돌지 않음");
    }
  });

  test("드리프트 중에는 차체와 진행 방향의 가운데를 따라가 차체가 옆으로 돌아가도 덜 흔들린다", () => {
    const cam = new Camera("chase");
    const kart = kartAt(0);
    cam.update(kart, DT);
    Object.assign(kart, { heading: 0.4, vx: 300, vy: 0, drifting: true });
    for (let i = 0; i < 120; i++) cam.update(kart, DT);
    assert.ok(Math.abs(cam.heading - 0.2) < 0.01, `${cam.heading}`);
  });
});

