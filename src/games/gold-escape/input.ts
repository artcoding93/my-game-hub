import type { Direction, InputSnapshot } from "./types";

/**
 * 키보드와 터치 버튼이 함께 쓰는 입력 상태.
 * 방향은 "누르고 있는 동안" 유지되고, 땅파기는 누른 순간 한 번만 전달된다.
 */
export class InputState {
  /** 누르고 있는 방향 (최근에 누른 것이 앞) */
  private held: Direction[] = [];
  private queuedDig: -1 | 1 | null = null;

  press(direction: Direction) {
    this.held = [direction, ...this.held.filter((d) => d !== direction)];
  }

  release(direction: Direction) {
    this.held = this.held.filter((d) => d !== direction);
  }

  dig(dir: -1 | 1) {
    this.queuedDig = dir;
  }

  /** 창 포커스를 잃으면 keyup이 오지 않으므로 눌린 키를 모두 해제한다. */
  clear() {
    this.held = [];
    this.queuedDig = null;
  }

  /** 한 시뮬레이션 스텝에 전달할 입력. 땅파기 입력은 꺼내는 순간 비워진다. */
  take(): InputSnapshot {
    const snapshot = { directions: this.held, dig: this.queuedDig };
    this.queuedDig = null;
    return snapshot;
  }
}

export const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};
