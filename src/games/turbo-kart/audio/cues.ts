import type { RaceEvent } from "../types";

/*
 * 레이스 이벤트 → 효과음 (순수 함수). 플레이어 카트(index 3)와 관련된 소리만 크게 낸다:
 * 다른 카트끼리의 충돌·아이템 소리까지 모두 내면 시끄럽기 때문에, AI 이벤트는 공격 피격·완주만 고른다.
 */

export type SoundCue =
  | "countdown"
  | "go"
  | "boost"
  | "crash"
  | "bump"
  | "itemGet"
  | "itemUse"
  | "hit"
  | "block"
  | "lap"
  | "finish"
  | "win"
  | "lose"
  | "wrongWay"
  | "recover"
  | "brake"
  | "click";

export interface CueEntry {
  cue: SoundCue;
  delay: number;
}

export function cuesForEvents(events: readonly RaceEvent[], player: number): CueEntry[] {
  const cues: CueEntry[] = [];
  const add = (cue: SoundCue, delay = 0) => {
    if (!cues.some((c) => c.cue === cue)) cues.push({ cue, delay });
  };
  for (const e of events) {
    switch (e.type) {
      case "countdown":
        add("countdown");
        break;
      case "go":
        add("go");
        break;
      case "boost":
        if (e.kart === player) add("boost");
        break;
      case "wall":
      case "obstacle":
        if (e.kart === player) add("crash");
        break;
      case "bump":
        if (e.kart === player || e.other === player) add("bump");
        break;
      case "itemGet":
        if (e.kart === player) add("itemGet");
        break;
      case "itemUse":
        if (e.kart === player) add("itemUse");
        break;
      case "hit":
        if (e.kart === player) add(e.blocked ? "block" : "hit");
        else if (!e.blocked) add("hit", 0.02);
        break;
      case "lap":
        if (e.kart === player) add("lap");
        break;
      case "finish":
        if (e.kart === player) add("finish");
        break;
      case "raceOver":
        add(e.playerRank === 1 ? "win" : "lose", 0.6);
        break;
      case "wrongWay":
        if (e.kart === player) add("wrongWay");
        break;
      case "recover":
        if (e.kart === player) add("recover");
        break;
    }
  }
  return cues;
}
