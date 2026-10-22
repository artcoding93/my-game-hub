import type { GameEvent } from "../types";

/*
 * 게임 이벤트 → 효과음 (순수 함수, 테스트 가능).
 * 좌우 이동처럼 자주 일어나는 소리는 WinterAudio에서 최소 간격을 두고 작게 재생한다.
 */

export type SoundCue =
  | "start"
  | "move"
  | "rotate"
  | "lock"
  | "hardDrop"
  | "bump"
  | "lineClear"
  | "multiLineClear"
  | "levelUp"
  | "iceCreate"
  | "iceCrack"
  | "windWarn"
  | "wind"
  | "snowWarn"
  | "snowfall"
  | "hold"
  | "gameOver"
  | "pause"
  | "resume";

export type ControlAction = "start" | "pause" | "resume" | "title";

export function cuesForEvents(events: readonly GameEvent[]): { cue: SoundCue; delay: number }[] {
  const out: { cue: SoundCue; delay: number }[] = [];
  const hard = events.some((e) => e.type === "hardDrop");
  for (const event of events) {
    switch (event.type) {
      case "start":
        out.push({ cue: "start", delay: 0 });
        break;
      case "move":
        out.push({ cue: "move", delay: 0 });
        break;
      case "rotate":
        out.push({ cue: "rotate", delay: 0 });
        break;
      case "hardDrop":
        out.push({ cue: "hardDrop", delay: 0 });
        break;
      case "lock":
        // 하드 드롭은 자체 착지음이 있으므로 고정음을 겹치지 않는다.
        if (!hard) out.push({ cue: "lock", delay: 0 });
        break;
      case "bump":
        out.push({ cue: "bump", delay: 0.08 });
        break;
      case "lineClear":
        out.push({ cue: event.count >= 2 ? "multiLineClear" : "lineClear", delay: 0 });
        break;
      case "levelUp":
        out.push({ cue: "levelUp", delay: 0.35 });
        break;
      case "iceCreate":
        out.push({ cue: "iceCreate", delay: 0.12 });
        break;
      case "iceCrack":
        out.push({ cue: "iceCrack", delay: 0 });
        break;
      case "windWarn":
        out.push({ cue: "windWarn", delay: 0 });
        break;
      case "wind":
        out.push({ cue: "wind", delay: 0 });
        break;
      case "snowWarn":
        out.push({ cue: "snowWarn", delay: 0 });
        break;
      case "snowfall":
        out.push({ cue: "snowfall", delay: 0.1 });
        break;
      case "hold":
        out.push({ cue: "hold", delay: 0 });
        break;
      case "gameOver":
        out.push({ cue: "gameOver", delay: 0.1 });
        break;
      default:
        break;
    }
  }
  return out;
}

export function cueForAction(action: ControlAction): SoundCue | null {
  if (action === "pause") return "pause";
  if (action === "resume") return "resume";
  return null;
}
