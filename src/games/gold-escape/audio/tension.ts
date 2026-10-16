import { occupiedCellOf } from "../logic/terrain";
import type { GameState } from "../types";

/*
 * BGM 긴장 레이어용 "추격 중" 판정. 게임 상태를 읽기만 한다.
 * 쫓아오는 경비원과의 맨해튼 거리로 판단하고, 히스테리시스(들어갈 때 4칸 이하, 나올 때 7칸 이상)와
 * 최소 유지 시간으로 음악이 자주 바뀌지 않게 한다.
 */

export const TENSION = { enterDistance: 4, exitDistance: 7, minHold: 2.5 } as const;

/** 쫓아오는(chasing) 경비원 중 가장 가까운 거리. 없으면 Infinity */
export function nearestChaserDistance(state: GameState): number {
  const { player, guards, level } = state;
  if (player.status !== "alive") return Infinity;
  const playerCell = occupiedCellOf(player, level.width);
  const px = playerCell % level.width;
  const py = Math.floor(playerCell / level.width);
  let best = Infinity;
  for (const guard of guards) {
    if (guard.status !== "chasing") continue;
    const cell = occupiedCellOf(guard, level.width);
    const distance = Math.abs((cell % level.width) - px) + Math.abs(Math.floor(cell / level.width) - py);
    if (distance < best) best = distance;
  }
  return best;
}

export class TensionTracker {
  private on = false;
  private changedAt = -Infinity;

  get active() {
    return this.on;
  }

  /** 매 프레임 호출. playing 단계가 아니면 긴장을 풀어 둔다. */
  update(state: GameState): boolean {
    if (state.phase !== "playing") {
      if (state.phase !== "paused") this.reset();
      return this.on;
    }
    if (state.time - this.changedAt < TENSION.minHold) return this.on;
    const distance = nearestChaserDistance(state);
    const next = this.on ? distance < TENSION.exitDistance : distance <= TENSION.enterDistance;
    if (next !== this.on) {
      this.on = next;
      this.changedAt = state.time;
    }
    return this.on;
  }

  reset() {
    this.on = false;
    this.changedAt = -Infinity;
  }
}
