import type { SnakeState } from "./types";

export type SnakeSoundEvent = "start" | "eat" | "highScore" | "collision" | "gameOver" | "win" | "pause" | "resume";

/**
 * 상태 변화(prev → next)에서 재생할 효과음을 고른다. 게임 규칙에는 관여하지 않는 순수 함수다.
 * `restarted`: Restart 버튼·키로 새 판을 시작한 경우(playing → playing 재시작은 상태만으로 구분할 수 없으므로 호출자가 알려 준다).
 */
export function getSoundEvents(prev: SnakeState, next: SnakeState, restarted = false): SnakeSoundEvent[] {
  if (restarted) return ["start"];
  if (prev === next) return [];

  if (prev.status === "ready" && next.status === "playing") return ["start"];
  if (prev.status === "playing" && next.status === "paused") return ["pause"];
  if (prev.status === "paused" && next.status === "playing") return ["resume"];
  if (prev.status !== "playing") return [];

  // 충돌음 뒤에 게임 오버 멜로디가 이어진다(사운드 엔진이 순서대로 예약).
  if (next.status === "over") return ["collision", "gameOver"];
  if (next.status === "won") return ["win"];

  if (next.score > prev.score) {
    // 기존 기록(0점 초과)을 처음 넘어선 순간 한 번만 팡파르. 먹이 효과음 대신 재생해 겹치지 않게 한다.
    const brokeRecord = next.isNewHighScore && !prev.isNewHighScore && prev.highScore > 0;
    return [brokeRecord ? "highScore" : "eat"];
  }
  return [];
}
