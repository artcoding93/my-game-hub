import type { InputSnapshot } from "./types";

type Dir = -1 | 1;

/**
 * 키보드와 터치 버튼이 함께 쓰는 입력 상태.
 * 입력원(키 코드·터치 버튼)마다 따로 기록하므로 ←와 A를 함께 누르거나, 이동 버튼과 점프 버튼을 동시에 눌렀다가
 * 하나만 떼어도 나머지 입력은 유지된다(멀티터치).
 * 점프·조사·사용·아이템 변경은 "눌린 순간"을 다음 시뮬레이션 스텝에 한 번만 전달한다.
 */
export class InputState {
  private moves: { source: string; dir: Dir }[] = [];
  private verticals: { source: string; dir: Dir }[] = [];
  private jumpSources = new Set<string>();
  private jumpPressed = false;
  private interactPressed = false;
  private usePressed = false;
  private cyclePressed = false;

  pressMove(source: string, dir: Dir) {
    this.moves = [{ source, dir }, ...this.moves.filter((m) => m.source !== source)];
  }

  pressVertical(source: string, dir: Dir) {
    this.verticals = [{ source, dir }, ...this.verticals.filter((m) => m.source !== source)];
  }

  release(source: string) {
    this.moves = this.moves.filter((m) => m.source !== source);
    this.verticals = this.verticals.filter((m) => m.source !== source);
    this.jumpSources.delete(source);
  }

  setJump(source: string, down: boolean) {
    if (down) {
      if (!this.jumpSources.has(source)) this.jumpPressed = true;
      this.jumpSources.add(source);
    } else {
      this.jumpSources.delete(source);
    }
  }

  trigger(action: "interact" | "use" | "cycle") {
    if (action === "interact") this.interactPressed = true;
    else if (action === "use") this.usePressed = true;
    else this.cyclePressed = true;
  }

  /** 창 포커스를 잃으면 keyup이 오지 않으므로 눌린 입력을 모두 해제한다. */
  clear() {
    this.moves = [];
    this.verticals = [];
    this.jumpSources.clear();
    this.jumpPressed = false;
    this.interactPressed = false;
    this.usePressed = false;
    this.cyclePressed = false;
  }

  take(): InputSnapshot {
    const snapshot: InputSnapshot = {
      move: this.moves[0]?.dir ?? 0,
      vertical: this.verticals[0]?.dir ?? 0,
      jumpHeld: this.jumpSources.size > 0,
      jumpPressed: this.jumpPressed,
      interactPressed: this.interactPressed,
      usePressed: this.usePressed,
      cyclePressed: this.cyclePressed,
    };
    this.jumpPressed = false;
    this.interactPressed = false;
    this.usePressed = false;
    this.cyclePressed = false;
    return snapshot;
  }
}

export const KEY_TO_MOVE: Record<string, Dir> = {
  ArrowLeft: -1,
  KeyA: -1,
  ArrowRight: 1,
  KeyD: 1,
};

export const KEY_TO_VERTICAL: Record<string, Dir> = {
  ArrowUp: -1,
  KeyW: -1,
  ArrowDown: 1,
  KeyS: 1,
};
