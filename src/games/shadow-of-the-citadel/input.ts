import type { PlayerInput } from "./logic/player";

/*
 * 키보드·터치 공용 입력 상태. 같은 동작을 여러 입력원(키 두 개, 터치 버튼)이 동시에 누를 수 있으므로
 * 동작별로 누르고 있는 입력원 집합을 둔다. 점프는 "새로 누름"을 한 번만 전달한다(물리 스텝 단위).
 */

export type HoldAction = "left" | "right" | "run" | "up" | "down" | "jump";

export const KEY_TO_HOLD: Record<string, HoldAction> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ShiftLeft: "run",
  ShiftRight: "run",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  Space: "jump",
};

export class InputState {
  private held: Record<HoldAction, Set<string>> = {
    left: new Set(),
    right: new Set(),
    run: new Set(),
    up: new Set(),
    down: new Set(),
    jump: new Set(),
  };
  private jumpTapped = false;
  /** 마지막으로 누른 방향 (양쪽을 함께 누르면 나중에 누른 쪽) */
  private lastDir: -1 | 1 = 1;

  press(source: string, action: HoldAction) {
    if (action === "jump" && this.held.jump.size === 0) this.jumpTapped = true;
    if (action === "left") this.lastDir = -1;
    if (action === "right") this.lastDir = 1;
    this.held[action].add(source);
  }

  release(source: string) {
    for (const set of Object.values(this.held)) set.delete(source);
  }

  clear() {
    for (const set of Object.values(this.held)) set.clear();
    this.jumpTapped = false;
  }

  isHeld(action: HoldAction) {
    return this.held[action].size > 0;
  }

  /** 이번 고정 스텝의 입력 */
  take(): PlayerInput {
    const left = this.isHeld("left");
    const right = this.isHeld("right");
    const move = left && right ? this.lastDir : left ? -1 : right ? 1 : 0;
    const input: PlayerInput = {
      move,
      run: this.isHeld("run"),
      jumpPressed: this.jumpTapped,
      jumpHeld: this.isHeld("jump"),
      up: this.isHeld("up"),
      down: this.isHeld("down"),
    };
    this.jumpTapped = false;
    return input;
  }
}
