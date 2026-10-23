import type { GameEvent } from "../types";

/*
 * 게임 이벤트 → 효과음 선택 (순수 함수, Web Audio 의존 없음).
 * 같은 프레임의 여러 이벤트는 delay로 조금씩 엇갈려 겹쳐 들리지 않게 한다.
 */

export type SoundCue =
  | "fire"
  | "whistle"
  | "explosion"
  | "hit"
  | "damage"
  | "barrier"
  | "thud"
  | "fall"
  | "item"
  | "repair"
  | "crate"
  | "turn"
  | "win"
  | "lose"
  | "click";

export interface CueEntry {
  cue: SoundCue;
  delay: number;
}

export function cuesForEvents(events: readonly GameEvent[]): CueEntry[] {
  const cues: CueEntry[] = [];
  const add = (cue: SoundCue, delay = 0) => {
    if (!cues.some((c) => c.cue === cue)) cues.push({ cue, delay });
  };
  for (const event of events) {
    switch (event.type) {
      case "fire":
        add("fire");
        add("whistle", 0.05);
        break;
      case "explosion":
        add("explosion");
        break;
      case "hit":
        if (event.blocked) add("barrier", 0.05);
        // 내가 맞힘 = 명중음, 내가 맞음 = 피해음
        add(event.target === "player" ? "damage" : "hit", 0.08);
        break;
      case "fallDamage":
        add("thud");
        break;
      case "fellOff":
        add("fall");
        break;
      case "itemGranted":
        add("item", 0.15);
        break;
      case "repair":
        add("repair");
        break;
      case "crateSpawn":
        add("crate");
        break;
      case "turnStart":
        // 내 차례가 왔을 때만 알림음
        if (event.side === "player") add("turn", 0.05);
        break;
      case "gameOver":
        add(event.winner === "player" ? "win" : "lose", 0.35);
        break;
      default:
        break;
    }
  }
  return cues;
}
