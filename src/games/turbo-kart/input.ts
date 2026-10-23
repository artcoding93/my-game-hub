import type { DriveInput } from "./types";

/*
 * 키보드·터치 공용 입력 상태. 여러 입력원(키·버튼)이 같은 동작을 동시에 누를 수 있으므로
 * 동작별로 누르고 있는 입력원 집합을 둔다(멀티터치: 조향 + 가속 + 드리프트 동시 입력).
 */

export type HoldAction = "throttle" | "brake" | "left" | "right" | "drift";
export type TapAction = "boost" | "item";

export const KEY_TO_HOLD: Record<string, HoldAction> = {
  KeyW: "throttle",
  ArrowUp: "throttle",
  KeyS: "brake",
  ArrowDown: "brake",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "drift",
  ShiftRight: "drift",
};

export const KEY_TO_TAP: Record<string, TapAction> = {
  Space: "boost",
  KeyE: "item",
};

export class InputState {
  private held: Record<HoldAction, Set<string>> = {
    throttle: new Set(),
    brake: new Set(),
    left: new Set(),
    right: new Set(),
    drift: new Set(),
  };
  private taps = new Set<TapAction>();

  press(source: string, action: HoldAction) {
    this.held[action].add(source);
  }

  release(source: string) {
    for (const set of Object.values(this.held)) set.delete(source);
  }

  tap(action: TapAction) {
    this.taps.add(action);
  }

  clear() {
    for (const set of Object.values(this.held)) set.clear();
    this.taps.clear();
  }

  isHeld(action: HoldAction) {
    return this.held[action].size > 0;
  }

  /** 이번 고정 스텝의 입력 (탭 동작은 한 번만 전달) */
  take(): DriveInput {
    const input: DriveInput = {
      throttle: this.isHeld("throttle"),
      brake: this.isHeld("brake"),
      steer: (this.isHeld("right") ? 1 : 0) - (this.isHeld("left") ? 1 : 0),
      drift: this.isHeld("drift"),
      boost: this.taps.has("boost"),
      item: this.taps.has("item"),
    };
    this.taps.clear();
    return input;
  }
}
