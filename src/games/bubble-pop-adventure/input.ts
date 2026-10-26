import type { Input } from "./types";

/*
 * 키보드·터치 공용 입력 상태. 여러 입력원(키 두 개, 터치 버튼 여러 개)이 같은 동작을 동시에 누를 수 있으므로
 * 동작별로 누르고 있는 입력원 집합을 둔다(멀티터치: 이동 + 점프 + 발사 동시 입력).
 * 점프는 "새로 누름"을 고정 스텝 하나에 한 번만 전달하고(누르고 있는 상태는 jumpHeld로 따로 전달: 방울 밟기),
 * 같은 동작의 키 두 개(↑·Z)를 함께 눌러도 첫 키만 새 입력이 되므로 중복 점프가 없다. 키를 누르고 있어도 다시 점프하지 않는다.
 * 발사는 누르고 있으면 쿨다운 간격으로 연사하고, 키 두 개(Space·X)를 함께 눌러도 쿨다운은 하나다.
 * 키는 배열과 무관한 event.code로 찾는다.
 */

export type Action = "left" | "right" | "jump" | "fire";

export const KEY_TO_ACTION: Record<string, Action> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "jump",
  KeyZ: "jump",
  Space: "fire",
  KeyX: "fire",
};

/** 화면 안내용 키 표기 (타이틀·게임 방법·일시정지 화면이 함께 쓴다) */
export const CONTROL_HINTS: { keys: string; action: string }[] = [
  { keys: "← →", action: "Move" },
  { keys: "↑ / Z", action: "Jump" },
  { keys: "Space / X", action: "Shoot Bubble" },
  { keys: "P / Esc", action: "Pause" },
];

export class InputState {
  private held: Record<Action, Set<string>> = { left: new Set(), right: new Set(), jump: new Set(), fire: new Set() };
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
    };
    this.tapped.clear();
    return input;
  }
}
