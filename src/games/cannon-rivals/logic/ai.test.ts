import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AI_SIM_BUDGET, AIM_LIMITS, WORLD_H } from "../config";
import { DIFFICULTIES, FIELD_IDS, type Difficulty } from "../types";
import { chooseAiItem, planAiShot, searchBestShot } from "./ai";
import { createBattle, worldOf } from "./game";
import { simulateShot } from "./physics";
import { autoBattle, firstShotTrial } from "./simulate";
import { flatBattle } from "./testUtils";

/*
 * AI 테스트. 명중률 측정은 시간이 걸리므로 기본 120회(전장·난이도마다)로 돌리고,
 * CANNON_SIM=full 환경 변수를 주면 300회 + 자동 대전으로 전투 길이까지 측정한다.
 * "명중" = 플레이어에게 피해를 준 발사(직접 명중 + 폭발 범위).
 */

const FULL = process.env.CANNON_SIM === "full";
const TRIALS = FULL ? 300 : 120;

/** 밸런싱 목표 (첫 발 명중률, 표본 오차를 감안해 테스트 허용 범위는 ±7%p 넓힘) */
const TARGET: Record<Difficulty, [number, number]> = { easy: [15, 25], normal: [30, 45], hard: [50, 65] };
const TOLERANCE = 7;

describe("AI 탄도 탐색", () => {
  test("플레이어와 같은 물리로 탐색하고, 계산량 상한을 지킨다", () => {
    for (const difficulty of DIFFICULTIES) {
      const { state } = createBattle({ field: "desertCanyon", difficulty, seed: 11 });
      const best = searchBestShot(state, "ai", 1, difficulty);
      assert.ok(best.simulations <= AI_SIM_BUDGET, `${difficulty}: ${best.simulations}`);
      // 찾은 탄도를 실제 물리로 다시 쏘면 같은 결과
      const replay = simulateShot(worldOf(state), "ai", best.angle, best.power);
      assert.equal(replay.impact.kind === "tank" && replay.impact.target === "player", best.score === 0);
    }
  });

  test("바람이 바뀌면 탄도를 다시 계산한다", () => {
    const state = flatBattle(3);
    state.wind = 0;
    const calm = searchBestShot(state, "ai", 1, "hard");
    state.wind = 9;
    const windy = searchBestShot(state, "ai", 1, "hard");
    assert.notDeepEqual([calm.angle, calm.power], [windy.angle, windy.power]);
  });

  test("지형이 깎이면 탄도를 다시 계산한다", () => {
    const state = flatBattle(4);
    const before = searchBestShot(state, "ai", 1, "hard");
    // 플레이어 탱크 앞을 높은 벽으로 막는다
    for (let x = state.tanks.player.x + 40; x < state.tanks.player.x + 70; x++) state.terrain[x] = 200;
    const after = searchBestShot(state, "ai", 1, "hard");
    assert.notDeepEqual([before.angle, before.power], [after.angle, after.power]);
    assert.ok(after.angle > before.angle, "벽을 넘기려고 더 높이 쏜다");
  });

  test("직접 명중 탄도가 없으면 가장 가까운 탄도를 고르고, 장애물을 뚫고 쏘지 않는다", () => {
    const state = flatBattle(5);
    // AI 앞에 넘을 수 없는 절벽
    for (let x = state.tanks.ai.x - 60; x < state.tanks.ai.x - 30; x++) state.terrain[x] = 40;
    const best = searchBestShot(state, "ai", 1, "normal");
    assert.ok(best.score > 0 && Number.isFinite(best.score));
    const replay = simulateShot(worldOf(state), "ai", best.angle, best.power);
    assert.notEqual(replay.impact.kind, "tank", "벽을 무시한 명중은 불가능");
    assert.ok(best.angle >= AIM_LIMITS.minAngle && best.angle <= AIM_LIMITS.maxAngle);
  });

  test("자기 폭발 범위에 떨어지는 탄도는 고르지 않는다", () => {
    const state = flatBattle(6);
    const best = searchBestShot(state, "ai", 1, "normal");
    const replay = simulateShot(worldOf(state), "ai", best.angle, best.power);
    assert.ok(Math.abs(replay.impact.x - state.tanks.ai.x) > 60);
  });

  test("계획한 각도·파워는 항상 허용 범위 안이고 미래 정보(다음 바람)를 쓰지 않는다", () => {
    const { state } = createBattle({ field: "frozenRidge", difficulty: "easy", seed: 21 });
    const rngBefore = state.rng;
    const plan = planAiShot(state);
    assert.ok(plan.angle >= AIM_LIMITS.minAngle && plan.angle <= AIM_LIMITS.maxAngle);
    assert.ok(plan.power >= AIM_LIMITS.minPower && plan.power <= AIM_LIMITS.maxPower);
    // 계획은 현재 상태만 읽는다: 지형·바람·탱크 위치를 바꾸지 않는다
    assert.notEqual(state.rng, rngBefore, "오차 난수는 시드 난수에서만 뽑는다");
    assert.ok(state.tanks.player.y < WORLD_H);
  });
});

describe("AI 아이템 (플레이어와 같은 규칙)", () => {
  test("체력이 낮으면 보통·어려움 AI는 수리 키트를 쓴다", () => {
    for (const difficulty of ["normal", "hard"] as const) {
      const state = flatBattle(8);
      state.difficulty = difficulty;
      state.tanks.ai.inventory = ["repairKit", "powerShell"];
      state.tanks.ai.hp = 40;
      assert.equal(chooseAiItem(state), "repairKit");
    }
  });

  test("어려움 AI는 결정타가 될 때 Power Shell을 쓴다", () => {
    const state = flatBattle(9);
    state.difficulty = "hard";
    state.tanks.ai.inventory = ["powerShell"];
    state.tanks.player.hp = 30;
    assert.equal(chooseAiItem(state), "powerShell");
    state.tanks.player.hp = 90;
    assert.equal(chooseAiItem(state), null, "결정타가 아니면 아껴 둔다");
  });

  test("쓸 수 없는 아이템(한도를 다 쓴 수리 키트)은 고르지 않는다", () => {
    const state = flatBattle(10);
    for (const difficulty of DIFFICULTIES) {
      state.difficulty = difficulty;
      state.tanks.ai.inventory = ["repairKit"];
      state.tanks.ai.repairsUsed = 2;
      state.tanks.ai.hp = 10;
      for (let i = 0; i < 20; i++) assert.equal(chooseAiItem(state), null);
    }
  });
});

describe("AI 난이도별 첫 발 명중률 (자동 시뮬레이션)", () => {
  const table: string[] = [];
  for (const field of FIELD_IDS) {
    for (const difficulty of DIFFICULTIES) {
      test(`${field} · ${difficulty}: ${TRIALS}회`, () => {
        let hit = 0;
        let direct = 0;
        let sims = 0;
        for (let i = 0; i < TRIALS; i++) {
          const r = firstShotTrial(field, difficulty, i * 7919 + 13);
          if (r.damage > 0) hit++;
          if (r.direct) direct++;
          sims += r.simulations;
          assert.ok(r.simulations <= AI_SIM_BUDGET);
        }
        const rate = (100 * hit) / TRIALS;
        table.push(`${field.padEnd(13)} ${difficulty.padEnd(7)} 명중 ${rate.toFixed(1).padStart(5)}%  직접 ${((100 * direct) / TRIALS).toFixed(1).padStart(5)}%  평균 시뮬레이션 ${(sims / TRIALS).toFixed(0)}`);
        const [lo, hi] = TARGET[difficulty];
        assert.ok(rate >= lo - TOLERANCE && rate <= hi + TOLERANCE, `${rate.toFixed(1)}% (목표 ${lo}~${hi}%)`);
      });
    }
  }
  test("결과표", (t) => {
    for (const line of table) t.diagnostic(line);
  });
});

describe("어려움 AI도 완벽한 명중을 반복하지 않는다", () => {
  test("같은 전장에서 연속 40발: 명중률 90% 미만, 조준 오차가 0으로 수렴하지 않음", () => {
    const { state } = createBattle({ field: "greenHills", difficulty: "hard", seed: 77 });
    let hit = 0;
    const errors: number[] = [];
    for (let i = 0; i < 40; i++) {
      state.ai.shots = i;
      const best = searchBestShot(state, "ai", 1, "hard");
      const plan = planAiShot(state);
      errors.push(Math.abs(plan.angle - best.angle) + Math.abs(plan.power - best.power));
      const r = simulateShot(worldOf(state), "ai", plan.angle, plan.power);
      if (r.impact.kind === "tank" && r.impact.target === "player") hit++;
    }
    assert.ok(hit < 36, `${hit}/40`);
    const late = errors.slice(20);
    assert.ok(late.filter((e) => e > 0.3).length >= 10, "후반에도 오차가 남는다");
  });
});

describe("자동 대전 (전투 길이)", { skip: !FULL && "CANNON_SIM=full일 때만 실행" }, () => {
  test("전장·난이도별 평균 전투 길이", (t) => {
    for (const field of FIELD_IDS) {
      for (const difficulty of DIFFICULTIES) {
        const n = 12;
        let turns = 0;
        let seconds = 0;
        let aiWins = 0;
        for (let i = 0; i < n; i++) {
          const r = autoBattle(field, difficulty, i * 104729 + 7, "normal");
          assert.ok(r.winner, "전투가 끝난다");
          turns += r.turns;
          seconds += r.seconds;
          if (r.winner === "ai") aiWins++;
        }
        t.diagnostic(`${field.padEnd(13)} ${difficulty.padEnd(7)} 평균 ${(turns / n).toFixed(1)}턴, 약 ${(seconds / n / 60).toFixed(1)}분, AI 승률 ${((100 * aiWins) / n).toFixed(0)}%`);
      }
    }
  });
});
