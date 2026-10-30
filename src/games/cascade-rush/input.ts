import type { InputSnapshot } from "./types";

type Dir = -1 | 1;
export type Press = "rotateCW" | "rotateCCW" | "hardDrop";

/**
 * 키보드와 터치 버튼이 함께 쓰는 입력 상태.
 * 입력원(키 코드·터치 버튼)마다 따로 기록하므로 ←와 ◀ 버튼을 함께 누르거나, 이동 버튼과 ▼ 버튼을 동시에 눌렀다가
 * 하나만 떼어도 나머지 입력은 유지된다(멀티터치). 마지막으로 누른 방향이 이긴다.
 * 회전은 누른 횟수만큼(최대 MAX_PENDING_ROTATIONS) 한 스텝에 하나씩 전달해 빠른 연타도 빠지지 않는다.
 * 즉시 낙하는 "눌린 순간"을 다음 스텝에 한 번만 전달한다(같은 스텝에 두 번 눌려도 한 번).
 * 길게 누를 때의 반복 이동(DAS/ARR)은 게임 로직이 처리한다.
 */
const MAX_PENDING_ROTATIONS = 3;

export class InputState {
  private moves: { source: string; dir: Dir }[] = [];
  private softSources = new Set<string>();
  private rotations: ("rotateCW" | "rotateCCW")[] = [];
  private hardDrop = false;

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
    if (action === "hardDrop") this.hardDrop = true;
    else if (this.rotations.length < MAX_PENDING_ROTATIONS) this.rotations.push(action);
  }

  clear() {
    this.moves = [];
    this.softSources.clear();
    this.rotations = [];
    this.hardDrop = false;
  }

  take(): InputSnapshot {
    const rotation = this.rotations.shift();
    const snapshot: InputSnapshot = {
      move: this.moves[0]?.dir ?? 0,
      softDrop: this.softSources.size > 0,
      rotateCW: rotation === "rotateCW",
      rotateCCW: rotation === "rotateCCW",
      // 남은 회전이 있으면 즉시 낙하는 회전을 모두 적용한 뒤에 전달한다
      hardDrop: this.hardDrop && this.rotations.length === 0,
    };
    if (snapshot.hardDrop) this.hardDrop = false;
    return snapshot;
  }
}

export const KEY_TO_MOVE: Record<string, Dir> = { ArrowLeft: -1, ArrowRight: 1 };
export const SOFT_DROP_KEYS = new Set(["ArrowDown"]);
export const KEY_TO_PRESS: Record<string, Press> = {
  ArrowUp: "rotateCW",
  KeyX: "rotateCW",
  KeyZ: "rotateCCW",
  Space: "hardDrop",
};
export const PAUSE_KEYS = new Set(["KeyP", "Escape"]);
