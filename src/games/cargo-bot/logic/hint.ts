import { HINT_MAX_STATES } from "../config";
import { STAGES } from "../stages";
import { solvePushes, type Push } from "./solver";
import type { Session } from "./session";

/*
 * 힌트: 요청할 때마다 한 단계씩 더 구체적으로 (전체 해답은 보여 주지 않는다).
 *   1~n단계: 스테이지 전략 문장
 *   그다음: 현재 상태에서 탐색기로 찾은 "다음에 밀 상자와 방향" 하나만 강조
 * 현재 상태가 이미 풀 수 없으면(데드락) 그렇다고 알려 Undo·Restart를 권한다.
 */

export type Hint =
  | { kind: "text"; text: string }
  | { kind: "push"; text: string; push: Push; remaining: number }
  | { kind: "stuck"; text: string }
  | { kind: "unknown"; text: string };

const DIR_NAME = ["up", "right", "down", "left"];

export function hintFor(session: Session, level: number): Hint {
  const stage = STAGES[session.stageIndex];
  if (level < stage.hints.length) return { kind: "text", text: stage.hints[level] };
  const sol = solvePushes(session.level, session.board, HINT_MAX_STATES);
  if (!sol) {
    // 탐색 상한 안에서 해답을 못 찾았다: 상태가 크면 확신할 수 없으므로 막혔다고 단정하지 않는다
    const full = solvePushes(session.level, session.board, HINT_MAX_STATES * 4);
    if (!full) return { kind: "stuck", text: "This layout can no longer be solved. Undo a few steps or restart." };
    return pushHint(full.firstPush!, full.pushes);
  }
  if (!sol.firstPush) return { kind: "unknown", text: "All crates are already in place!" };
  return pushHint(sol.firstPush, sol.pushes);
}

function pushHint(push: Push, remaining: number): Hint {
  return { kind: "push", push, remaining, text: `Push the highlighted crate ${DIR_NAME[push.dir]}. (${remaining} push${remaining === 1 ? "" : "es"} left at best)` };
}
