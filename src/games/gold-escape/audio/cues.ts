import type { ControlAction } from "../controller";
import type { GameEvent } from "../types";

export type { ControlAction };

/*
 * 게임 이벤트 → 효과음·BGM 동작. 게임 규칙에는 관여하지 않는 순수 함수다.
 * 시뮬레이션 이벤트는 상태가 실제로 바뀐 순간 한 번만 나오므로(구멍 생성 성공, 경비원 갇힘 등)
 * 효과음도 실제 사건에만 반응한다.
 */

export type SoundCue =
  | "start"
  | "gold"
  | "allGold"
  | "dig"
  | "holeClose"
  | "trapped"
  | "escape"
  | "death"
  | "stageClear"
  | "gameOver"
  | "pause"
  | "resume";

const CUE_FOR_EVENT: Partial<Record<GameEvent["type"], SoundCue>> = {
  goldCollected: "gold",
  // 금괴를 모두 모은 순간 = 탈출 사다리가 나타나는 순간(같은 상태 변화)이므로 한 효과음으로 처리한다.
  escapeRevealed: "allGold",
  dug: "dig",
  holeClosed: "holeClose",
  guardTrapped: "trapped",
  guardEscaped: "escape",
  playerDied: "death",
  stageCleared: "stageClear",
  gameOver: "gameOver",
};

/** 한 프레임의 이벤트에서 재생할 효과음 (같은 효과음은 프레임당 한 번, 발생 순서 유지) */
export function cuesForEvents(events: readonly GameEvent[]): SoundCue[] {
  const cues: SoundCue[] = [];
  for (const event of events) {
    const cue = CUE_FOR_EVENT[event.type];
    if (cue && !cues.includes(cue)) cues.push(cue);
  }
  return cues;
}

export type MusicCommand = { type: "start" } | { type: "pause" } | { type: "resume" } | { type: "stop" };

/**
 * BGM 동작
 * - 스테이지 시작(새 게임·다음 스테이지·사망 후 재시작): 처음부터 재생 (템포는 진행도에 맞춤)
 * - 사망·스테이지 클리어: 페이드아웃 (게임 오버 시 이미 멈춰 있다)
 * - 일시정지·재개: 위치를 기억해 이어서 재생
 */
export function musicCommands(events: readonly GameEvent[], action?: ControlAction): MusicCommand[] {
  const commands: MusicCommand[] = [];
  if (action === "pause") commands.push({ type: "pause" });
  if (action === "resume") commands.push({ type: "resume" });
  for (const event of events) {
    if (event.type === "stageStarted") commands.push({ type: "start" });
    else if (event.type === "playerDied" || event.type === "stageCleared" || event.type === "gameOver") {
      commands.push({ type: "stop" });
    }
  }
  return commands;
}
