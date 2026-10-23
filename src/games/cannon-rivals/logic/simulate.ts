import { PHYSICS } from "../config";
import type { AiMemory, Difficulty, FieldId, GameState } from "../types";
import { createAiMemory, planAiShot, searchBestShot, updateAiError } from "./ai";
import { createBattle, playerFire, stepGame } from "./game";
import { clampAngle, clampPower } from "./physics";

/*
 * 자동 대전 시뮬레이션 (테스트·밸런싱 전용, 게임 화면에서는 쓰지 않는다).
 * - firstShotTrial: 새 전투에서 AI의 첫 발만 쏴서 명중 여부를 본다.
 * - autoBattle: 플레이어 자리에 같은 알고리즘의 봇(지정 난이도, 아이템 미사용)을 앉혀 끝까지 싸운다.
 */

const DT = PHYSICS.fixedDt;

export interface ShotOutcome {
  /** AI가 플레이어에게 준 피해 */
  damage: number;
  direct: boolean;
  simulations: number;
  /** 탐색으로 찾은 최선 후보의 예상 오차(px, 0 = 직접 명중 탄도 있음) */
  expectedMiss: number;
}

/** 현재 턴이 끝날 때까지(또는 전투가 끝날 때까지) 진행하고 AI가 플레이어에게 준 피해를 센다. */
function finishTurn(state: GameState, maxSeconds = 40): { damage: number; direct: boolean; seconds: number } {
  const start = state.turnCount;
  let damage = 0;
  let direct = false;
  let seconds = 0;
  while (state.phase !== "gameOver" && state.turnCount === start && seconds < maxSeconds) {
    for (const e of stepGame(state, DT)) {
      if (e.type === "hit" && e.target === "player" && e.by === "ai") {
        damage += e.damage;
        direct ||= e.direct;
      }
    }
    seconds += DT;
  }
  return { damage, direct, seconds };
}

/** 새 전투에서 플레이어가 쏘지 않고 넘긴 직후 AI의 첫 발 */
export function firstShotTrial(field: FieldId, difficulty: Difficulty, seed: number): ShotOutcome {
  const { state } = createBattle({ field, difficulty, seed });
  state.turn = "ai";
  state.phase = "aiAim";
  state.aiTimer = 0;
  state.aiAimFrom = state.tanks.ai.angle;
  state.aiPlan = planAiShot(state);
  const { simulations, expectedMiss } = state.aiPlan;
  const { damage, direct } = finishTurn(state);
  return { damage, direct, simulations, expectedMiss };
}

function botAim(state: GameState, skill: Difficulty, memory: AiMemory) {
  const best = searchBestShot(state, "player", 1, skill);
  updateAiError(memory, skill, state);
  memory.shots++;
  state.tanks.player.angle = clampAngle(best.angle + memory.errAngle);
  state.tanks.player.power = clampPower(best.power + memory.errPower);
}

export interface BattleSummary {
  winner: GameState["winner"];
  turns: number;
  /** 예상 전투 시간(초) = 실제 진행 시간(비행·폭발·AI 조준 연출) + 플레이어 턴마다 thinkSeconds */
  seconds: number;
  aiShots: number;
  aiHits: number;
}

export function autoBattle(field: FieldId, difficulty: Difficulty, seed: number, playerSkill: Difficulty, thinkSeconds = 12, maxTurns = 100): BattleSummary {
  const { state } = createBattle({ field, difficulty, seed });
  const bot = createAiMemory();
  let seconds = 0;
  let aiShots = 0;
  let aiHits = 0;
  while (state.phase !== "gameOver" && state.turnCount < maxTurns) {
    if (state.phase === "playerAim") {
      botAim(state, playerSkill, bot);
      seconds += thinkSeconds;
      playerFire(state);
      seconds += finishTurn(state).seconds;
    } else {
      const result = finishTurn(state);
      seconds += result.seconds;
      aiShots++;
      if (result.damage > 0) aiHits++;
    }
  }
  return { winner: state.winner, turns: state.turnCount, seconds, aiShots, aiHits };
}
