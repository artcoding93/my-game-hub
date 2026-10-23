import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AIM_LIMITS, GUIDE, ITEM_RULES, PHYSICS, WORLD_H, WORLD_W } from "../config";
import { armItem, guidePath, setAim, worldOf } from "./game";
import { clampAngle, clampPower, launchBody, simulateShot, stepBody, SUBSTEP, windAcceleration, type World } from "./physics";
import { flatBattle } from "./testUtils";

/* 실행: npm run test:cannon-rivals */

/** 땅도 탱크도 없는 빈 하늘 (탄도 식 검증용) */
function emptyWorld(wind: number): World {
  const state = flatBattle();
  state.terrain.fill(WORLD_H);
  state.tanks.ai.fell = true;
  state.tanks.player.fell = true;
  return { ...worldOf(state), wind };
}

describe("포탄 궤적", () => {
  test("등가속도 식 x = x0 + vx·t + ½·a·t², y = y0 + vy·t + ½·g·t²과 일치한다", () => {
    const state = flatBattle();
    const world = emptyWorld(6);
    const body = launchBody(state.tanks.player, 50, 70);
    const start = { ...body };
    const ax = windAcceleration(6);
    for (let i = 0; i < 60; i++) stepBody(body, world, PHYSICS.fixedDt);
    const t = body.age;
    assert.ok(Math.abs(t - 1) < 1e-9);
    assert.ok(Math.abs(body.x - (start.x + start.vx * t + 0.5 * ax * t * t)) < 1e-6);
    assert.ok(Math.abs(body.y - (start.y + start.vy * t + 0.5 * PHYSICS.gravity * t * t)) < 1e-6);
  });

  test("위로 쏘면 화면 좌표에서 y가 줄었다가 다시 늘어난다", () => {
    const state = flatBattle();
    const body = launchBody(state.tanks.player, 60, 60);
    assert.ok(body.vy < 0 && body.vx > 0, "플레이어는 오른쪽 위로 쏜다");
    assert.ok(launchBody(state.tanks.ai, 60, 60).vx < 0, "AI는 왼쪽으로 쏜다");
  });

  test("프레임 속도와 관계없이 같은 탄도 (1/60초 한 번 = 1/240초 네 번)", () => {
    const state = flatBattle();
    const world = emptyWorld(-4);
    const a = launchBody(state.tanks.player, 45, 80);
    const b = { ...a };
    for (let i = 0; i < 90; i++) stepBody(a, world, PHYSICS.fixedDt);
    for (let i = 0; i < 360; i++) stepBody(b, world, SUBSTEP);
    assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
  });

  test("각도·파워는 허용 범위로 제한된다", () => {
    assert.equal(clampAngle(-30), AIM_LIMITS.minAngle);
    assert.equal(clampAngle(120), AIM_LIMITS.maxAngle);
    assert.equal(clampPower(0), AIM_LIMITS.minPower);
    assert.equal(clampPower(250), AIM_LIMITS.maxPower);
    const state = flatBattle();
    setAim(state, 200, -5);
    assert.equal(state.tanks.player.angle, AIM_LIMITS.maxAngle);
    assert.equal(state.tanks.player.power, AIM_LIMITS.minPower);
  });
});

describe("바람", () => {
  test("순풍은 탄착점을 바람 방향으로 민다", () => {
    const state = flatBattle();
    const calm = simulateShot({ ...worldOf(state), wind: 0 }, "player", 45, 70);
    const tail = simulateShot({ ...worldOf(state), wind: 6 }, "player", 45, 70);
    const head = simulateShot({ ...worldOf(state), wind: -6 }, "player", 45, 70);
    assert.ok(tail.impact.x > calm.impact.x + 20);
    assert.ok(head.impact.x < calm.impact.x - 20);
  });

  test("Wind Shield는 바람으로 밀리는 거리를 약 70% 줄인다", () => {
    const state = flatBattle();
    const world = emptyWorld(8);
    const calmWorld = emptyWorld(0);
    const tank = state.tanks.player;
    const drift = (windScale: number) => {
      const b = launchBody(tank, 45, 60, windScale);
      const c = launchBody(tank, 45, 60);
      for (let i = 0; i < 60; i++) {
        stepBody(b, world, PHYSICS.fixedDt);
        stepBody(c, calmWorld, PHYSICS.fixedDt);
      }
      return b.x - c.x;
    };
    const ratio = drift(ITEM_RULES.windShieldScale) / drift(1);
    assert.ok(Math.abs(ratio - 0.3) < 1e-6, `ratio ${ratio}`);
  });
});

describe("충돌", () => {
  test("최고 속도로도 1px 두께 기둥을 뚫지 않는다", () => {
    const state = flatBattle();
    state.terrain.fill(WORLD_H);
    state.terrain[500] = 100; // 폭 1px, 높이 440px 기둥
    state.tanks.ai.fell = true;
    const body = { x: 300, y: 300, vx: PHYSICS.maxSpeed, vy: 0, age: 0, windScale: 1 };
    let impact = null;
    for (let i = 0; i < 120 && !impact; i++) impact = stepBody(body, worldOf(state), PHYSICS.fixedDt);
    assert.equal(impact?.kind, "terrain");
    assert.ok(impact && impact.x >= 500 && impact.x < 501 + PHYSICS.maxSpeed * SUBSTEP);
  });

  test("탱크에 직접 닿으면 tank 충돌, 지면에 닿으면 terrain 충돌", () => {
    const state = flatBattle();
    const ai = state.tanks.ai;
    const hit = stepBody({ x: ai.x, y: ai.y - 30, vx: 0, vy: 300, age: 0, windScale: 1 }, worldOf(state), 0.2);
    assert.deepEqual(hit && hit.kind === "tank" ? hit.target : null, "ai");
    const ground = stepBody({ x: 480, y: 380, vx: 0, vy: 300, age: 0, windScale: 1 }, worldOf(state), 0.2);
    assert.equal(ground?.kind, "terrain");
  });

  test("화면 밖으로 나가면 out", () => {
    const state = flatBattle();
    const r = simulateShot({ ...worldOf(state), wind: 0 }, "player", 20, 100);
    assert.ok(r.impact.kind === "out" || r.impact.kind === "tank" || r.impact.kind === "terrain");
    const away = stepBody({ x: WORLD_W + 110, y: 100, vx: 400, vy: 0, age: 0, windScale: 1 }, worldOf(state), 0.1);
    assert.equal(away?.kind, "out");
  });
});

describe("부분 탄도 가이드", () => {
  test("평소에는 예상 비행 시간의 30%까지만, 탄착 지점은 보이지 않는다", () => {
    const state = flatBattle();
    setAim(state, 45, 70);
    const full = simulateShot(worldOf(state), "player", 45, 70, 1, 2);
    const guide = guidePath(state);
    assert.equal(guide.full, false);
    assert.equal(guide.impact, null);
    const guideTime = (guide.points.length - 1) * SUBSTEP * 2;
    assert.ok(Math.abs(guideTime - full.time * GUIDE.fraction) < 0.05, `${guideTime} vs ${full.time * GUIDE.fraction}`);
  });

  test("파워를 바꾸면 가이드가 바로 바뀐다", () => {
    const state = flatBattle();
    setAim(state, 45, 50);
    const a = guidePath(state).points.at(-1)!;
    setAim(state, 45, 80);
    const b = guidePath(state).points.at(-1)!;
    assert.notDeepEqual(a, b);
  });

  test("Aim Assist를 고르면 탄착 지점까지 보여 준다", () => {
    const state = flatBattle();
    state.tanks.player.inventory = ["aimAssist"];
    setAim(state, 45, 70);
    assert.ok(armItem(state, 0));
    const guide = guidePath(state);
    assert.equal(guide.full, true);
    assert.ok(guide.impact);
  });

  test("화면 밖으로 나가는 탄도는 짧은 가이드로 제한된다", () => {
    const state = flatBattle();
    setAim(state, 10, 100);
    const guide = guidePath(state);
    assert.ok((guide.points.length - 1) * SUBSTEP * 2 <= GUIDE.fallbackSeconds * GUIDE.fraction + 0.05);
  });
});
