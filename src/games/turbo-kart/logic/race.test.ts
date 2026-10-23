import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DIFFICULTY, HELPFUL_ITEMS, ITEM_FX, ITEM_ODDS, KART, RACE, RECOVERY } from "../config";
import type { RaceEvent } from "../types";
import { ITEM_IDS } from "../types";
import { canUseItem, createRace, currentLap, hitKart, itemWeights, PLAYER, rankOf, recoverKart, stepRace, togglePause, useItem, type Race } from "./game";
import { NO_INPUT } from "./physics";
import { pointAt, roadAt } from "./track";
import { DT } from "./testUtils";

/** 카운트다운을 건너뛰고 AI는 멈춰 둔 레이스 (플레이어만 직접 옮긴다) */
function racing(track: "greenValley" | "desertCanyon" | "frostCircuit" = "greenValley", difficulty: "easy" | "normal" | "hard" = "easy"): Race {
  const race = createRace({ track, difficulty, seed: 9 });
  race.state.phase = "racing";
  race.state.countdown = 0;
  for (const k of race.state.karts) if (k.index !== PLAYER) k.frozenTime = 9999;
  race.state.boxes = [];
  return race;
}

/** 플레이어를 코스 중심선을 따라 s0 → s1로 옮기며 한 스텝씩 진행 (step px 간격) */
function moveAlong(race: Race, s0: number, s1: number, step = 30): RaceEvent[] {
  const me = race.state.karts[PLAYER];
  const events: RaceEvent[] = [];
  const dir = Math.sign(s1 - s0);
  for (let s = s0; dir > 0 ? s <= s1 : s >= s1; s += dir * step) {
    const p = pointAt(race.track, s, 0);
    Object.assign(me, { x: p.x, y: p.y, vx: 0, vy: 0, heading: Math.atan2(p.ty * dir, p.tx * dir) });
    events.push(...stepRace(race, NO_INPUT, DT));
  }
  return events;
}

describe("체크포인트와 랩", () => {
  test("출발선을 지나면 1바퀴째, 체크포인트를 모두 순서대로 지나 한 바퀴 돌면 2바퀴째", () => {
    const race = racing();
    const me = race.state.karts[PLAYER];
    const L = race.track.length;
    assert.equal(me.passed, 0);
    moveAlong(race, L - 110, L + 50);
    assert.equal(me.passed, 1);
    assert.equal(currentLap(me, 3), 1);
    const events = moveAlong(race, 50, L + 50);
    assert.equal(me.passed, RACE.checkpoints + 1);
    assert.equal(currentLap(me, 3), 2);
    assert.ok(events.some((e) => e.type === "lap" && e.kart === PLAYER && e.lap === 2));
  });

  test("결승선을 앞뒤로 오가거나 거꾸로 지나도 바퀴 수가 늘지 않는다", () => {
    const race = racing();
    const me = race.state.karts[PLAYER];
    const L = race.track.length;
    moveAlong(race, L - 110, L + 60);
    const passed = me.passed;
    for (let i = 0; i < 4; i++) {
      moveAlong(race, L + 60, L - 120); // 역방향
      moveAlong(race, L - 120, L + 60); // 다시 앞으로
    }
    assert.equal(me.passed, passed);
    assert.equal(currentLap(me, 3), 1);
  });

  test("순간적으로 멀리 옮겨져도 체크포인트를 건너뛸 수 없다", () => {
    const race = racing();
    const me = race.state.karts[PLAYER];
    const L = race.track.length;
    moveAlong(race, L - 110, L + 30);
    const before = me.dist;
    const far = pointAt(race.track, L * 0.5);
    Object.assign(me, { x: far.x, y: far.y });
    stepRace(race, NO_INPUT, DT);
    assert.ok(me.dist - before < 400, `${me.dist - before}`);
    assert.ok(me.passed <= 2);
  });

  test("지름길로 가도 체크포인트 순서가 이어져 바퀴가 인정된다", () => {
    for (const id of ["greenValley", "desertCanyon", "frostCircuit"] as const) {
      const race = racing(id);
      const me = race.state.karts[PLAYER];
      const t = race.track;
      // 진행 거리는 출발선 통과 후 한 바퀴 기준이므로 s에 트랙 길이를 더해 앞으로만 움직인다
      moveAlong(race, t.length - 110, t.length + t.shortcutFrom - 10);
      const before = me.passed;
      for (const p of t.shortcut) {
        Object.assign(me, { x: p.x, y: p.y, heading: Math.atan2(p.ty, p.tx) });
        stepRace(race, NO_INPUT, DT);
      }
      const skipped = t.checkpoints.filter((c) => c > t.shortcutFrom && c <= t.shortcutTo).length;
      assert.equal(me.passed - before, skipped, id);
      moveAlong(race, t.length + t.shortcutTo + 10, 2 * t.length + 60);
      assert.equal(currentLap(me, 3), 2, `${id}: 지름길을 써도 한 바퀴`);
    }
  });

  test("3바퀴 완주 → 완주 시간 기록, 플레이어가 먼저 끝나면 AI 기록은 남은 거리로 추정", () => {
    const race = racing();
    const me = race.state.karts[PLAYER];
    const L = race.track.length;
    const ai = race.state.karts[0];
    ai.frozenTime = 0;
    race.state.time = 100;
    const events = moveAlong(race, L - 110, 4 * L + 40, 60);
    assert.ok(me.finished);
    assert.ok(events.some((e) => e.type === "finish" && e.kart === PLAYER && e.rank === 1));
    const over = events.find((e) => e.type === "raceOver");
    assert.ok(over && over.type === "raceOver" && over.playerRank === 1);
    const results = race.state.results!;
    assert.deepEqual(results.map((r) => r.rank), [1, 2, 3, 4]);
    for (const r of results) if (r.index !== PLAYER) assert.ok(r.estimated && r.time > results[0].time);
    assert.equal(race.state.phase, "finished");
  });
});

describe("순위", () => {
  test("거리 차이가 아니라 진행도(체크포인트·진행 거리)로 정한다", () => {
    const race = racing();
    const [bolt, luna, dash] = race.state.karts;
    const me = race.state.karts[PLAYER];
    dash.dist = 1000;
    me.dist = 2000;
    bolt.dist = 2500;
    luna.dist = 1500;
    assert.equal(rankOf(race.state, 0), 1);
    assert.equal(rankOf(race.state, PLAYER), 2);
    // 위치가 결승선 바로 앞이라도 바퀴를 덜 돈 카트는 뒤
    luna.dist = -50;
    assert.equal(rankOf(race.state, 1), 4);
  });
});

describe("아이템", () => {
  test("확률표: 각 순위 열의 합은 100", () => {
    for (let col = 0; col < 4; col++) assert.equal(ITEM_IDS.reduce((sum, item) => sum + ITEM_ODDS[item][col], 0), 100);
  });

  test("1위는 앞 대상이 필요한 아이템, 4위는 뒤 대상이 필요한 아이템을 얻지 않는다", () => {
    const race = racing("greenValley", "normal");
    const me = race.state.karts[PLAYER];
    me.dist = 9999;
    let w = itemWeights(race.state, me);
    assert.equal(w.homingRocket, 0);
    assert.equal(w.snowBomb, 0);
    me.dist = -9999;
    w = itemWeights(race.state, me);
    assert.equal(w.oilSlick, 0);
    assert.equal(w.smokeScreen, 0);
    assert.equal(w.homingRocket, ITEM_ODDS.homingRocket[3]);
  });

  test("쉬움은 부스터·방어 아이템 확률이 높고 어려움은 낮다", () => {
    for (const d of ["easy", "hard"] as const) {
      const race = racing("greenValley", d);
      const w = itemWeights(race.state, race.state.karts[PLAYER]);
      for (const item of HELPFUL_ITEMS) assert.equal(w[item], ITEM_ODDS[item][3] * DIFFICULTY[d].helpfulItemScale);
    }
  });

  test("상자: 지나가면 아이템 1개, 이미 가지고 있으면 새로 얻지 못함, 4초 뒤 다시 나타남", () => {
    const race = racing();
    const me = race.state.karts[PLAYER];
    race.state.boxes = [
      { x: me.x + 200, y: me.y, respawn: 0 },
      { x: me.x + 400, y: me.y, respawn: 0 },
    ];
    Object.assign(me, { x: race.state.boxes[0].x, y: race.state.boxes[0].y });
    const events = stepRace(race, NO_INPUT, DT);
    assert.ok(events.some((e) => e.type === "itemGet"));
    const item = me.item;
    assert.ok(item);
    Object.assign(me, { x: race.state.boxes[1].x, y: race.state.boxes[1].y });
    stepRace(race, NO_INPUT, DT);
    assert.equal(me.item, item, "하나만 보유");
    assert.ok(race.state.boxes[0].respawn > 0);
    for (let t = 0; t < ITEM_FX.boxRespawn + 0.1; t += DT) {
      Object.assign(me, { x: race.state.boxes[0].x, y: race.state.boxes[0].y + 300 });
      stepRace(race, NO_INPUT, DT);
    }
    assert.equal(race.state.boxes[0].respawn, 0);
  });

  test("Shield는 공격 1회를 막고, 공격을 맞으면 보호 시간 동안 다음 공격을 받지 않는다", () => {
    const race = racing();
    const me = race.state.karts[PLAYER];
    const events: RaceEvent[] = [];
    me.shieldTime = ITEM_FX.shieldTime;
    hitKart(me, "homingRocket", events);
    assert.equal(me.slowTime, 0);
    assert.equal(me.shieldTime, 0);
    me.protectTime = 0;
    hitKart(me, "snowBomb", events);
    assert.equal(me.slowTime, ITEM_FX.snowSlowTime);
    assert.equal(me.protectTime, ITEM_FX.protectTime);
    me.slowTime = 0;
    assert.equal(hitKart(me, "homingRocket", events), false, "보호 시간 중");
    assert.equal(me.spinTime, 0);
    assert.deepEqual(events.map((e) => e.type === "hit" && e.blocked), [true, false]);
  });

  test("Quick Repair는 감속·미끄러짐·연막을 즉시 해제한다", () => {
    const race = racing();
    const me = race.state.karts[PLAYER];
    Object.assign(me, { item: "quickRepair", slowTime: 2, spinTime: 1, smokeTime: 3 });
    assert.ok(useItem(race, me, []));
    assert.deepEqual([me.slowTime, me.spinTime, me.smokeTime, me.item], [0, 0, 0, null]);
  });

  test("Homing Rocket은 바로 앞 순위 카트를 추적해 맞힌다", () => {
    const race = racing();
    const me = race.state.karts[PLAYER];
    const target = race.state.karts[1];
    const p = pointAt(race.track, 300);
    Object.assign(me, { x: p.x, y: p.y, heading: Math.atan2(p.ty, p.tx), s: 300, sample: 37, dist: 300 });
    const q = pointAt(race.track, 900, 0.5);
    Object.assign(target, { x: q.x, y: q.y, s: 900, sample: 112, dist: 900, frozenTime: 0 });
    race.state.karts[0].dist = 5000;
    race.state.karts[2].dist = -100;
    target.frozenTime = 0;
    race.env.obstacles = [];
    me.item = "homingRocket";
    assert.ok(useItem(race, me, []));
    assert.equal(race.state.projectiles[0].target, 1);
    let hit = false;
    for (let t = 0; t < 4 && !hit; t += DT) {
      Object.assign(target, { x: q.x, y: q.y, vx: 0, vy: 0 });
      hit = stepRace(race, NO_INPUT, DT).some((e) => e.type === "hit" && e.kart === 1 && e.by === "homingRocket");
    }
    assert.ok(hit);
    assert.ok(target.spinTime > 0 || target.slowTime > 0);
  });

  test("대상이 없으면 쓸 수 없다 (1위의 Snow Bomb)", () => {
    const race = racing();
    const me = race.state.karts[PLAYER];
    me.dist = 9999;
    me.item = "snowBomb";
    assert.equal(canUseItem(race.state, me), false);
    assert.equal(useItem(race, me, []), false);
    assert.equal(me.item, "snowBomb");
  });

  test("Oil Slick을 밟으면 미끄러지고, Smoke Screen은 뒤쪽 경쟁자에게만", () => {
    const race = racing();
    const [bolt, luna] = race.state.karts;
    const me = race.state.karts[PLAYER];
    me.dist = 1000;
    bolt.dist = 900;
    luna.dist = 1200;
    me.item = "smokeScreen";
    useItem(race, me, []);
    assert.ok(bolt.smokeTime > 0);
    assert.equal(luna.smokeTime, 0);
    me.item = "oilSlick";
    useItem(race, me, []);
    const oil = race.state.oils[0];
    Object.assign(bolt, { x: oil.x, y: oil.y, frozenTime: 0 });
    stepRace(race, NO_INPUT, DT);
    assert.ok(bolt.spinTime > 0);
    assert.equal(race.state.oils.length, 0, "밟히면 사라진다");
  });

  test("Turbo Boost·Speed Wind는 정해진 시간만큼만 효과", () => {
    const race = racing();
    const me = race.state.karts[PLAYER];
    me.item = "turboBoost";
    useItem(race, me, []);
    assert.equal(me.turboTime, ITEM_FX.turboTime);
    me.item = "speedWind";
    useItem(race, me, []);
    assert.equal(me.windTime, ITEM_FX.windTime);
  });
});

describe("복구·진행", () => {
  test("3초 동안 앞으로 못 가면 마지막 체크포인트 근처로 복구, 진행 거리 이득 없음, 멈춤·부스터 해제", () => {
    const race = racing();
    const me = race.state.karts[PLAYER];
    const L = race.track.length;
    moveAlong(race, L - 110, L + L * 0.3);
    const passed = me.passed;
    const dist = me.dist;
    me.boostTime = 1;
    let recovered = false;
    for (let t = 0; t < RECOVERY.stuckSeconds + 0.5 && !recovered; t += DT) recovered = stepRace(race, NO_INPUT, DT).some((e) => e.type === "recover");
    assert.ok(recovered);
    assert.ok(me.dist <= dist);
    assert.equal(me.passed, passed, "체크포인트는 그대로");
    assert.ok(me.frozenTime > 0);
    assert.equal(me.boostTime, 0);
    const road = roadAt(race.track, me.x, me.y)!;
    assert.ok(road.d < road.half, "도로 위로 복귀");
  });

  test("복구 위치는 다른 카트와 겹치지 않는다", () => {
    const race = racing();
    const me = race.state.karts[PLAYER];
    const L = race.track.length;
    moveAlong(race, L - 110, L + 400);
    const spot = pointAt(race.track, race.track.checkpoints[1] + 20);
    for (const k of race.state.karts) if (k !== me) Object.assign(k, { x: spot.x, y: spot.y });
    me.passed = 2;
    recoverKart(race, me, []);
    for (const k of race.state.karts) if (k !== me) assert.ok(Math.hypot(k.x - me.x, k.y - me.y) > KART.radius * 2);
  });

  test("카운트다운 동안은 움직이지 않고, 3초 뒤 출발", () => {
    const race = createRace({ track: "frostCircuit", difficulty: "normal", seed: 3 });
    const start = race.state.karts.map((k) => [k.x, k.y]);
    const events: RaceEvent[] = [];
    for (let t = 0; t < 2.9; t += DT) events.push(...stepRace(race, { ...NO_INPUT, throttle: true }, DT));
    assert.deepEqual(race.state.karts.map((k) => [k.x, k.y]), start);
    assert.deepEqual(events.filter((e) => e.type === "countdown").map((e) => e.type === "countdown" && e.value), [2, 1]);
    for (let t = 0; t < 0.2; t += DT) events.push(...stepRace(race, { ...NO_INPUT, throttle: true }, DT));
    assert.ok(events.some((e) => e.type === "go"));
    assert.equal(race.state.phase, "racing");
  });

  test("일시정지 중에는 아무것도 움직이지 않는다, 재시작은 독립된 새 레이스", () => {
    const race = createRace({ track: "greenValley", difficulty: "normal", seed: 4 });
    for (let t = 0; t < 4; t += DT) stepRace(race, { ...NO_INPUT, throttle: true }, DT);
    togglePause(race.state);
    const before = JSON.stringify(race.state.karts.map((k) => [k.x, k.y]));
    for (let t = 0; t < 1; t += DT) assert.deepEqual(stepRace(race, { ...NO_INPUT, throttle: true }, DT), []);
    assert.equal(JSON.stringify(race.state.karts.map((k) => [k.x, k.y])), before);
    const again = createRace({ track: "greenValley", difficulty: "normal", seed: 4 });
    assert.equal(again.state.time, 0);
    assert.notEqual(again.state.karts, race.state.karts);
  });
});
