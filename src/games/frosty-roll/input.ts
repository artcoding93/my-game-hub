import type { Input } from "./types";

/*
 * 키보드·터치 공용 입력 상태. 여러 입력원(키 두 개, 터치 버튼 여러 개)이 같은 동작을 동시에 누를 수 있으므로
 * 동작별로 누르고 있는 입력원 집합을 둔다(멀티터치: 이동 + 점프 + 공격 동시 입력).
 * 점프·차기는 "새로 누름"을 고정 스텝 하나에 한 번만 전달하고, 공격은 누르고 있으면 연사한다.
 */

export type Action = "left" | "right" | "jump" | "fire" | "kick";

export const KEY_TO_ACTION: Record<string, Action> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "jump",
  ArrowUp: "jump",
  KeyW: "jump",
  KeyZ: "fire",
  KeyJ: "fire",
  KeyX: "kick",
  KeyK: "kick",
};

export class InputState {
  private held: Record<Action, Set<string>> = { left: new Set(), right: new Set(), jump: new Set(), fire: new Set(), kick: new Set() };
  private tapped = new Set<Action>();
  private lastDir: -1 | 1 = 1;

  press(source: string, action: Action) {
    if (this.held[action].size === 0) this.tapped.add(action);
    if (action === "left") this.lastDir = -1;
    if (action === "right") this.lastDir = 1;
    this.held[action].add(source);
  }

  release(source: string) {
    for (const set of Object.values(this.held)) set.delete(source);
  }

  clear() {
    for (const set of Object.values(this.held)) set.clear();
    this.tapped.clear();
  }

  isHeld(action: Action) {
    return this.held[action].size > 0;
  }

  take(): Input {
    const left = this.isHeld("left");
    const right = this.isHeld("right");
    const input: Input = {
      move: left && right ? this.lastDir : left ? -1 : right ? 1 : 0,
      jump: this.tapped.has("jump"),
      jumpHeld: this.isHeld("jump"),
      fire: this.isHeld("fire") || this.tapped.has("fire"),
      kick: this.tapped.has("kick"),
    };
    this.tapped.clear();
    return input;
  }
}
