import { AI_SIM_BUDGET, AIM_LIMITS, DAMAGE, DIFFICULTY, ITEM_RULES, TANK } from "../config";
import type { AiMemory, AiPlan, Difficulty, GameState, ItemId, Side, Tank } from "../types";
import { clampAngle, clampPower, simulateShot, type ShotResult, type World } from "./physics";
import { gaussian, random } from "./rng";

/*
 * AI 포격 (플레이어와 같은 물리 엔진·같은 아이템 규칙).
 *
 * 1. 현재 플레이어 위치·바람·지형(상자 포함)을 읽는다. 다음 턴 바람 같은 미래 정보는 쓰지 않는다.
 * 2. 아이템을 고른다(난이도별 전략). Wind Shield를 쓰면 줄어든 바람으로 탐색한다.
 * 3. 각도×파워 격자를 시뮬레이션하고, 가장 좋은 후보 주변을 더 촘촘히 탐색한다(시뮬레이션 수 상한 AI_SIM_BUDGET).
 *    지형·장애물에 막히는 탄도는 실제로 막힌 곳에서 평가되므로 "장애물을 무시한 발사"가 없다.
 *    직접 명중 탄도가 없으면 탄착점이 플레이어에 가장 가까운 탄도를 고른다.
 * 4. 난이도별 조준 오차를 더한다. 오차는 턴마다 correction 비율만큼 줄고(이전 탄착 보정),
 *    jitter만큼 새 오차가 더해져 어려움 난이도도 완벽한 명중을 반복하지 않는다.
 */

/** 후보 탄도 점수 (낮을수록 좋음) */
export function scoreShot(result: ShotResult, self: Tank, target: Tank): number {
  const { impact } = result;
  if (impact.kind === "tank") return impact.target === target.side ? 0 : 2000;
  if (impact.kind === "out") return 600 + result.closest;
  const targetCx = target.x;
  const targetCy = target.y - TANK.hitHeight / 2;
  const miss = Math.hypot(impact.x - targetCx, impact.y - targetCy);
  // 자기 폭발 범위에 떨어지는 탄도는 크게 감점
  const selfDistance = Math.hypot(impact.x - self.x, impact.y - (self.y - TANK.hitHeight / 2));
  const selfPenalty = selfDistance <= DAMAGE.splashRadius + 10 ? 1500 : 0;
  return miss + selfPenalty;
}

export interface SearchResult {
  angle: number;
  power: number;
  score: number;
  simulations: number;
}

/** 각도·파워 후보를 시뮬레이션해 가장 좋은 탄도를 찾는다. shooter는 보통 "ai"(테스트의 자동 대전에서는 "player"도 쓴다). */
export function searchBestShot(state: GameState, shooter: Side, windScale: number, difficulty: Difficulty, budget = AI_SIM_BUDGET): SearchResult {
  const { angleStep, powerStep } = DIFFICULTY[difficulty];
  const self = state.tanks[shooter];
  const target = state.tanks[shooter === "ai" ? "player" : "ai"];
  const world: World = { terrain: state.terrain, wind: state.wind, tanks: state.tanks, crate: state.crate };
  let best: SearchResult = { angle: 45, power: 60, score: Infinity, simulations: 0 };
  let simulations = 0;

  const evaluate = (angle: number, power: number) => {
    if (simulations >= budget) return;
    const a = clampAngle(angle);
    const p = clampPower(power);
    simulations++;
    const score = scoreShot(simulateShot(world, shooter, a, p, windScale), self, target);
    // 같은 점수면 낮은 각도(빠르게 도달) 선호
    if (score < best.score || (score === best.score && a < best.angle)) best = { angle: a, power: p, score, simulations: 0 };
  };

  // 1단계: 거친 격자 (낮은 파워는 거의 닿지 않으므로 20%부터)
  for (let angle = AIM_LIMITS.minAngle + 5; angle <= AIM_LIMITS.maxAngle; angle += angleStep) {
    for (let power = 20; power <= AIM_LIMITS.maxPower; power += powerStep) evaluate(angle, power);
  }
  // 2단계: 최선 후보 주변을 촘촘히 (예산이 남는 만큼)
  const center = { angle: best.angle, power: best.power };
  for (let da = -angleStep / 2; da <= angleStep / 2; da += 1) {
    for (let dp = -powerStep; dp <= powerStep; dp += 0.5) {
      if (best.score === 0) break;
      evaluate(center.angle + da, center.power + dp);
    }
  }
  // 3단계: 직접 명중이면 파워를 조금씩 바꿔 명중 구간의 가운데를 고른다(경계에 걸친 탄도 피하기)
  if (best.score === 0) {
    const hits: number[] = [];
    for (let dp = -3; dp <= 3; dp += 0.5) {
      if (simulations >= budget) break;
      simulations++;
      const p = clampPower(best.power + dp);
      if (scoreShot(simulateShot(world, shooter, best.angle, p, windScale), self, target) === 0) hits.push(p);
    }
    if (hits.length > 0) best = { ...best, power: hits[Math.floor(hits.length / 2)] };
  }
  return { ...best, simulations };
}

function usable(tank: Tank, item: ItemId): boolean {
  if (item === "repairKit") return tank.repairsUsed < ITEM_RULES.repairPerMatch && tank.hp < TANK.maxHp;
  if (item === "barrier") return !tank.barrier;
  return true;
}

/** 난이도별 아이템 선택. 한 턴에 하나만, 사용할 수 있는 것만 고른다. */
export function chooseAiItem(state: GameState): ItemId | null {
  const self = state.tanks.ai;
  const enemy = state.tanks.player;
  const has = (item: ItemId) => self.inventory.includes(item) && usable(self, item);
  const strategy = DIFFICULTY[state.difficulty].itemStrategy;
  const windStrong = Math.abs(state.wind);
  const missedLast = state.ai.shots > 0 && state.ai.lastDamage === 0;

  if (strategy === "simple") {
    // 쉬움: 가진 아이템 중 첫 번째를 가끔 쓴다
    const first = self.inventory.find((item) => usable(self, item));
    return first && random(state) < 0.4 ? first : null;
  }
  if (strategy === "situational") {
    if (has("repairKit") && self.hp <= 55) return "repairKit";
    if (has("barrier") && self.hp <= 45) return "barrier";
    if (has("powerShell") && enemy.hp <= 35) return "powerShell";
    if (has("doubleShot") && enemy.hp <= 30) return "doubleShot";
    if (has("windShield") && windStrong >= 5) return "windShield";
    if (has("aimAssist") && missedLast) return "aimAssist";
    if (self.inventory.length >= ITEM_RULES.maxSlots) return self.inventory.find((item) => usable(self, item)) ?? null;
    return null;
  }
  // 전략적(어려움): 결정타·생존·정확도 순으로 판단하고, 아니면 아이템을 아껴 둔다
  const lethalPower = DAMAGE.direct * DAMAGE.powerShellScale;
  if (has("powerShell") && enemy.hp <= lethalPower && enemy.hp > DAMAGE.direct * (enemy.barrier ? DAMAGE.barrierScale : 1)) return "powerShell";
  if (has("repairKit") && self.hp <= 60 && self.hp + ITEM_RULES.repairAmount <= TANK.maxHp) return "repairKit";
  if (has("barrier") && self.hp <= 50 && (enemy.inventory.some((item) => item === "powerShell" || item === "doubleShot") || enemy.energy >= 75)) return "barrier";
  if (has("windShield") && windStrong >= 4) return "windShield";
  if (has("aimAssist") && missedLast) return "aimAssist";
  if (has("doubleShot") && enemy.hp <= DAMAGE.direct * DAMAGE.doubleShotScale * 2) return "doubleShot";
  if (self.inventory.length >= ITEM_RULES.maxSlots) {
    const attack = self.inventory.find((item) => item === "powerShell" || item === "doubleShot");
    return attack ?? self.inventory.find((item) => usable(self, item)) ?? null;
  }
  return null;
}

/** 다음 발사의 조준 오차를 갱신한다(첫 발은 새 오차, 이후는 보정 + 새 흔들림). */
export function updateAiError(memory: AiMemory, difficulty: Difficulty, rng: { rng: number }) {
  const d = DIFFICULTY[difficulty];
  if (memory.shots === 0) {
    memory.errAngle = gaussian(rng) * d.sigmaAngle;
    memory.errPower = gaussian(rng) * d.sigmaPower;
    return;
  }
  const keep = 1 - d.correction;
  memory.errAngle = memory.errAngle * keep + gaussian(rng) * d.sigmaAngle * d.jitter;
  memory.errPower = memory.errPower * keep + gaussian(rng) * d.sigmaPower * d.jitter;
}

/** AI 턴 시작 시 한 번 호출: 아이템 → 탄도 탐색 → 오차 적용 */
export function planAiShot(state: GameState): AiPlan {
  const item = chooseAiItem(state);
  const windScale = item === "windShield" ? ITEM_RULES.windShieldScale : 1;
  const best = searchBestShot(state, "ai", windScale, state.difficulty);
  updateAiError(state.ai, state.difficulty, state);
  // Aim Assist: 탄착 지점을 보는 효과 → 이번 발사의 오차를 절반으로
  const errorScale = item === "aimAssist" ? 0.5 : 1;
  return {
    angle: clampAngle(best.angle + state.ai.errAngle * errorScale),
    power: clampPower(best.power + state.ai.errPower * errorScale),
    item,
    expectedMiss: best.score,
    simulations: best.simulations,
  };
}

export function createAiMemory(): AiMemory {
  return { errAngle: 0, errPower: 0, shots: 0, lastMissX: null, lastDamage: 0 };
}
