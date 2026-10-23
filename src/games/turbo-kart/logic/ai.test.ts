import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BOOSTER, KART, RACE } from "../config";
import { DIFFICULTIES, TRACK_IDS, type Difficulty, type TrackId } from "../types";
import { PERSONALITIES } from "./ai";
import { createRace, stepRace } from "./game";
import { NO_INPUT } from "./physics";
import { wallContact } from "./track";
import { DT } from "./testUtils";

/*
 * AI 자동 완주 테스트: 플레이어 자리까지 AI가 운전하는 4대 레이스를 트랙 3 × 난이도 3 조합마다 반복한다.
 * 기본은 조합마다 2회, TURBO_SIM=full이면 5회.
 * 매 스텝 검사: 순간이동(복구 제외 한 스텝 이동량), 벽 통과, 체크포인트 역행, 최고 속도 초과.
 */

const RUNS = process.env.TURBO_SIM === "full" ? 5 : 2;
const TIME_LIMIT = 400;
/** 한 스텝(1/60초) 최대 이동: 합산 상한 속도 + 충돌 밀림 여유 */
const MAX_STEP = (KART.maxSpeed * BOOSTER.maxCombinedScale * DT) + KART.radius;

interface RunReport {
  times: (number | null)[];
  recoveries: number[];
  maxStep: number;
  wallViolations: number;
  checkpointRegressions: number;
  overSpeed: number;
  drifts: number;
  boosts: number;
  items: number;
  lapEvents: number;
}

function runRace(track: TrackId, difficulty: Difficulty, seed: number): RunReport {
  const race = createRace({ track, difficulty, seed, autopilot: true });
  const report: RunReport = { times: [], recoveries: [], maxStep: 0, wallViolations: 0, checkpointRegressions: 0, overSpeed: 0, drifts: 0, boosts: 0, items: 0, lapEvents: 0 };
  const passed = race.state.karts.map(() => 0);
  while (race.state.karts.some((k) => !k.finished) && race.state.time < TIME_LIMIT) {
    const before = race.state.karts.map((k) => ({ x: k.x, y: k.y }));
    const events = stepRace(race, NO_INPUT, DT);
    for (const e of events) {
      if (e.type === "boost") report.boosts++;
      if (e.type === "itemUse") report.items++;
      if (e.type === "lap") report.lapEvents++;
    }
    race.state.karts.forEach((k, i) => {
      const recovered = events.some((e) => e.type === "recover" && e.kart === i);
      if (!recovered) report.maxStep = Math.max(report.maxStep, Math.hypot(k.x - before[i].x, k.y - before[i].y));
      if (wallContact(race.track, k.x, k.y, -0.5) !== null) report.wallViolations++;
      if (k.passed < passed[i]) report.checkpointRegressions++;
      passed[i] = k.passed;
      if (Math.hypot(k.vx, k.vy) > KART.maxSpeed * BOOSTER.maxCombinedScale + 1) report.overSpeed++;
    });
  }
  report.times = race.state.karts.map((k) => k.finishTime);
  report.recoveries = race.state.karts.map((k) => k.recoveries);
  report.drifts = race.ai.reduce((sum, m) => sum + m.drifts, 0);
  return report;
}

describe("AI 3대 (+ 자동 주행 플레이어) 완주", () => {
  const table: string[] = [];
  const totals = { drifts: 0, boosts: 0, items: 0 };
  for (const track of TRACK_IDS) {
    for (const difficulty of DIFFICULTIES) {
      test(`${track} · ${difficulty}: ${RUNS}회`, () => {
        for (let run = 0; run < RUNS; run++) {
          const r = runRace(track, difficulty, run * 7919 + 101);
          totals.drifts += r.drifts;
          totals.boosts += r.boosts;
          totals.items += r.items;
          const label = `${track} ${difficulty} #${run + 1}`;
          table.push(
            `${track.padEnd(13)} ${difficulty.padEnd(7)} #${run + 1}  기록 ${r.times.map((t) => (t === null ? "DNF" : t.toFixed(1))).join("/")}  복구 ${r.recoveries.join("/")}  ` +
              `최대 이동 ${r.maxStep.toFixed(1)}px  드리프트 ${r.drifts} 부스터 ${r.boosts} 아이템 ${r.items}`,
          );
          assert.ok(r.times.every((t) => t !== null), `${label}: 완주 실패 ${r.times}`);
          assert.equal(r.lapEvents, 4 * (RACE.laps - 1), `${label}: 랩 이벤트`);
          assert.ok(r.maxStep <= MAX_STEP, `${label}: 순간이동 ${r.maxStep}`);
          assert.equal(r.wallViolations, 0, `${label}: 벽 통과`);
          assert.equal(r.checkpointRegressions, 0, `${label}: 체크포인트 역행`);
          assert.equal(r.overSpeed, 0, `${label}: 최고 속도 초과`);
          assert.ok(Math.max(...r.recoveries) <= 10, `${label}: 복구가 너무 많음 ${r.recoveries}`);
        }
      });
    }
  }
  test("AI가 드리프트·부스터·아이템을 실제로 쓴다", (t) => {
    for (const line of table) t.diagnostic(line);
    t.diagnostic(`합계: 드리프트 ${totals.drifts}, 부스터 ${totals.boosts}, 아이템 사용 ${totals.items}`);
    assert.ok(totals.drifts > 0 && totals.boosts > 0 && totals.items > 0);
  });
});

describe("AI 공정성", () => {
  test("성향은 주행 판단만 바꾸고 물리 값(최고 속도·가속)은 모두 같다", () => {
    for (const p of Object.values(PERSONALITIES)) {
      assert.ok(!("maxSpeed" in p) && !("accel" in p));
      assert.ok(p.caution <= 1.05, "목표 속도 배율은 물리 최고 속도를 넘지 못한다(물리에서 상한)");
    }
  });
});
