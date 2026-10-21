import type { ControlAction } from "../controller";
import type { GameEvent, RoomId } from "../types";

/*
 * 게임 이벤트 → 효과음·배경음악 명령 (순수 함수, 테스트 가능).
 * 걷기·사다리 이동처럼 계속 일어나는 동작에는 효과음을 붙이지 않는다.
 */

export type SoundCue =
  | "start"
  | "chestOpen"
  | "itemFound"
  | "keyPickup"
  | "coin"
  | "heal"
  | "doorUnlock"
  | "doorOpen"
  | "secretFound"
  | "switchActivate"
  | "trapTrigger"
  | "playerHit"
  | "toolUse"
  | "relicFound"
  | "roomTransition"
  | "denied"
  | "thud"
  | "gameClear"
  | "gameOver"
  | "pause"
  | "resume"
  | "menu";

export interface CueRequest {
  cue: SoundCue;
  /** 같은 묶음의 앞 소리가 끝난 뒤 울리도록 미루는 시간(초) */
  delay: number;
}

export function cuesForEvents(events: readonly GameEvent[]): CueRequest[] {
  const out: CueRequest[] = [];
  const types = new Set(events.map((e) => e.type));
  for (const event of events) {
    switch (event.type) {
      case "start":
        out.push({ cue: "start", delay: 0 });
        break;
      case "chestOpen":
        out.push({ cue: "chestOpen", delay: 0 });
        break;
      case "itemFound":
        if (event.item === "bronzeKey" || event.item === "silverKey") out.push({ cue: "keyPickup", delay: 0 });
        else if (event.item === "coin") out.push({ cue: "coin", delay: 0 }, { cue: "itemFound", delay: 0.12 });
        else out.push({ cue: "itemFound", delay: 0 });
        break;
      case "coin":
        out.push({ cue: "coin", delay: 0 });
        break;
      case "heal":
        out.push({ cue: "heal", delay: 0 });
        break;
      case "doorUnlock":
        out.push({ cue: "doorUnlock", delay: 0 });
        break;
      case "doorOpen":
        // 유물 팡파르와 겹치는 격자 열림 소리는 생략하고, 잠금 해제·스위치 뒤에는 이어서 울린다.
        if (types.has("relicFound")) break;
        out.push({ cue: "doorOpen", delay: types.has("doorUnlock") ? 0.4 : types.has("switchActivate") ? 0.25 : 0 });
        break;
      case "secretFound":
        out.push({ cue: "secretFound", delay: types.has("toolUse") ? 0.42 : 0 });
        break;
      case "switchActivate":
        out.push({ cue: "switchActivate", delay: 0 });
        break;
      case "trapTrigger":
        out.push({ cue: "trapTrigger", delay: 0 });
        break;
      case "playerHit":
        out.push({ cue: "playerHit", delay: 0 });
        break;
      case "toolUse":
        out.push({ cue: "toolUse", delay: 0 });
        break;
      case "relicFound":
        out.push({ cue: "relicFound", delay: 0 });
        break;
      case "roomTransition":
        out.push({ cue: "roomTransition", delay: 0 });
        break;
      case "denied":
        out.push({ cue: "denied", delay: 0 });
        break;
      case "rockLanded":
        out.push({ cue: "thud", delay: 0 });
        break;
      case "gameClear":
        out.push({ cue: "gameClear", delay: 0 });
        break;
      case "gameOver":
        out.push({ cue: "gameOver", delay: 0 });
        break;
      default:
        break;
    }
  }
  return out;
}

export function cueForAction(action: ControlAction): SoundCue | null {
  switch (action) {
    case "pause":
      return "pause";
    case "resume":
      return "resume";
    case "inventoryOpen":
    case "inventoryClose":
      return "menu";
    default:
      return null;
  }
}

// ── 배경음악 ──

export type MusicTrack = "exploration" | "danger" | "relic";

/** 3번 함정 회랑·7번 수호자의 방은 위험 구역, 8번 유물의 방은 전용 곡, 나머지는 탐험 곡 */
export function trackForRoom(room: RoomId): MusicTrack {
  if (room === "r3" || room === "r7") return "danger";
  if (room === "r8") return "relic";
  return "exploration";
}

export type MusicCommand =
  | { type: "play"; track: MusicTrack; restart: boolean }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "duck"; level: number; hold: number }
  | { type: "stop"; fade: number };

export function musicCommands(events: readonly GameEvent[], action: ControlAction | undefined, room: RoomId): MusicCommand[] {
  const out: MusicCommand[] = [];
  if (action === "start") out.push({ type: "play", track: trackForRoom(room), restart: true });
  if (action === "pause") out.push({ type: "pause" });
  if (action === "resume") out.push({ type: "resume" });
  for (const event of events) {
    switch (event.type) {
      case "roomEnter":
        // 같은 곡을 쓰는 방 사이에서는 곡을 다시 시작하지 않는다(재생기에서 판단).
        if (action !== "start") out.push({ type: "play", track: trackForRoom(event.room), restart: false });
        break;
      case "relicFound":
        // 팡파르(약 1초)가 잘 들리도록 BGM을 크게 낮췄다가 되돌린다.
        out.push({ type: "duck", level: 0.15, hold: 1.1 });
        break;
      case "playerHit":
        if (event.health <= 0) out.push({ type: "stop", fade: 0.9 });
        break;
      case "gameClear":
        out.push({ type: "stop", fade: 1.2 });
        break;
      case "gameOver":
        out.push({ type: "stop", fade: 0.6 });
        break;
      default:
        break;
    }
  }
  return out;
}
