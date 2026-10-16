import type { InputSnapshot } from "./types";

/**
 * 키보드와 터치 버튼이 함께 쓰는 입력 상태.
 * 입력원(키 코드·터치 버튼)마다 따로 기록하므로, ←와 A를 함께 누르거나 Space와 터치 FIRE를 동시에 눌렀다가
 * 하나만 떼어도 나머지 입력은 유지된다(멀티터치).
 */
export class InputState {
  /** 누르고 있는 이동 입력 (최근에 누른 것이 앞) */
  private moves: { source: string; dir: -1 | 1 }[] = [];
  private fireSources = new Set<string>();

  press(source: string, dir: -1 | 1) {
    this.moves = [{ source, dir }, ...this.moves.filter((m) => m.source !== source)];
  }

  release(source: string) {
    this.moves = this.moves.filter((m) => m.source !== source);
  }

  setFire(source: string, down: boolean) {
    if (down) this.fireSources.add(source);
    else this.fireSources.delete(source);
  }

  /** 창 포커스를 잃으면 keyup이 오지 않으므로 눌린 입력을 모두 해제한다. */
  clear() {
    this.moves = [];
    this.fireSources.clear();
  }

  take(): InputSnapshot {
    return { move: this.moves[0]?.dir ?? 0, fire: this.fireSources.size > 0 };
  }
}

export const KEY_TO_MOVE: Record<string, -1 | 1> = {
  ArrowLeft: -1,
  KeyA: -1,
  ArrowRight: 1,
  KeyD: 1,
};
