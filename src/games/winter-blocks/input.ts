import type { InputSnapshot } from "./types";

type Dir = -1 | 1;
type Press = "rotateCW" | "rotateCCW" | "hardDrop" | "hold";

/**
 * 키보드와 터치 버튼이 함께 쓰는 입력 상태.
 * 입력원(키 코드·터치 버튼)마다 따로 기록하므로 ←와 A를 함께 누르거나, 이동 버튼과 아래 버튼을 동시에 눌렀다가
 * 하나만 떼어도 나머지 입력은 유지된다(멀티터치). 회전·하드 드롭·홀드는 "눌린 순간"을 다음 스텝에 한 번만 전달한다.
 * 길게 누를 때의 반복 이동(DAS/ARR)은 게임 로직이 처리한다.
 */
export class InputState {
  private moves: { source: string; dir: Dir }[] = [];
  private softSources = new Set<string>();
  private pressed = new Set<Press>();

  pressMove(source: string, dir: Dir) {
    this.moves = [{ source, dir }, ...this.moves.filter((m) => m.source !== source)];
  }

  setSoftDrop(source: string, down: boolean) {
    if (down) this.softSources.add(source);
    else this.softSources.delete(source);
  }

  release(source: string) {
    this.moves = this.moves.filter((m) => m.source !== source);
    this.softSources.delete(source);
  }

  trigger(action: Press) {
    this.pressed.add(action);
  }

  clear() {
    this.moves = [];
    this.softSources.clear();
    this.pressed.clear();
  }

  take(): InputSnapshot {
    const snapshot: InputSnapshot = {
      move: this.moves[0]?.dir ?? 0,
      softDrop: this.softSources.size > 0,
      rotateCW: this.pressed.has("rotateCW"),
      rotateCCW: this.pressed.has("rotateCCW"),
      hardDrop: this.pressed.has("hardDrop"),
      hold: this.pressed.has("hold"),
    };
    this.pressed.clear();
    return snapshot;
  }
}

export const KEY_TO_MOVE: Record<string, Dir> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
export const SOFT_DROP_KEYS = new Set(["ArrowDown", "KeyS"]);
export const KEY_TO_PRESS: Record<string, Press> = {
  ArrowUp: "rotateCW",
  KeyX: "rotateCW",
  KeyZ: "rotateCCW",
  Space: "hardDrop",
  KeyC: "hold",
};
