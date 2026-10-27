import { INPUT } from "./config";
import type { Dir } from "./types";

/*
 * 키보드·터치 공용 입력. 키는 배열과 무관한 event.code로 찾는다.
 * 방향은 누른 순간 정확히 한 칸 움직이고, 누르고 있으면 repeatDelay 뒤부터 repeatInterval마다 한 칸씩 반복한다
 * (운영체제 키 반복과 무관하게 일정). 여러 방향을 누르고 있으면 마지막에 누른 방향을 쓴다.
 */

export const KEY_TO_DIR: Record<string, Dir> = {
  ArrowUp: 0,
  KeyW: 0,
  ArrowRight: 1,
  KeyD: 1,
  ArrowDown: 2,
  KeyS: 2,
  ArrowLeft: 3,
  KeyA: 3,
};

export type Command = "undo" | "redo" | "restart" | "menu" | "hint" | "confirm";

/** 방향 키가 아닌 단축키 (Ctrl/⌘ 조합 포함) */
export function commandFor(e: { code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): Command | null {
  const mod = e.ctrlKey || e.metaKey;
  if (e.code === "KeyZ") return mod && e.shiftKey ? "redo" : "undo";
  if (e.code === "KeyY") return "redo";
  if (mod) return null;
  if (e.code === "KeyR") return "restart";
  if (e.code === "Escape") return "menu";
  if (e.code === "KeyH") return "hint";
  if (e.code === "Enter" || e.code === "NumpadEnter") return "confirm";
  return null;
}

export class DirectionRepeater {
  private held: { source: string; dir: Dir }[] = [];
  private nextAt = Infinity;

  /** 새로 누름: 바로 움직일 방향을 돌려준다 (이미 누르고 있는 입력원이면 null) */
  press(source: string, dir: Dir, now: number): Dir | null {
    if (this.held.some((h) => h.source === source)) return null;
    this.held.push({ source, dir });
    this.nextAt = now + INPUT.repeatDelay;
    return dir;
  }

  release(source: string, now: number) {
    const before = this.held.length;
    this.held = this.held.filter((h) => h.source !== source);
    if (this.held.length === 0) this.nextAt = Infinity;
    else if (this.held.length !== before) this.nextAt = now + INPUT.repeatDelay;
  }

  clear() {
    this.held = [];
    this.nextAt = Infinity;
  }

  /** 반복할 때가 되었으면 방향 (한 번 호출에 최대 한 칸: 멈칫해도 몰아서 움직이지 않는다) */
  poll(now: number): Dir | null {
    if (this.held.length === 0 || now < this.nextAt) return null;
    this.nextAt = Math.max(now, this.nextAt) + INPUT.repeatInterval;
    return this.held[this.held.length - 1].dir;
  }
}
