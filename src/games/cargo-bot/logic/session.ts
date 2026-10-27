import { STAGES } from "../stages";
import type { Board, Dir, Level, StepResult } from "../types";
import { deadlockedBoxes, isSolved, step } from "./engine";
import { parseLevel } from "./level";

/*
 * 한 스테이지 플레이 상태: 현재 보드, 이동·밀기 수, Undo/Redo 기록. DOM에 의존하지 않는다.
 * 한 번의 입력(컨베이어·얼음·순간이동 연쇄 포함)이 한 턴이며, Undo는 그 턴 직전의 전체 상태(보드 + 횟수)를 되돌린다.
 * 상태는 불변 스냅숏으로만 저장하므로 아무리 빠르게 입력·Undo해도 기록이 어긋나지 않는다.
 */

export interface Snapshot {
  board: Board;
  moves: number;
  pushes: number;
}

const levels = new Map<number, Level>();

export function levelOf(stageIndex: number): Level {
  let level = levels.get(stageIndex);
  if (!level) {
    level = parseLevel(STAGES[stageIndex].map);
    levels.set(stageIndex, level);
  }
  return level;
}

export class Session {
  readonly stageIndex: number;
  readonly level: Level;
  current: Snapshot;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  constructor(stageIndex: number, resume?: Snapshot) {
    this.stageIndex = stageIndex;
    this.level = levelOf(stageIndex);
    this.current = resume ?? { board: this.level.start, moves: 0, pushes: 0 };
  }

  get board() {
    return this.current.board;
  }

  get solved() {
    return isSolved(this.level, this.current.board);
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** 한 턴 진행. 막히면 상태·기록은 그대로이고 moved = false. 이미 클리어했으면 null */
  move(dir: Dir): StepResult | null {
    if (this.solved) return null;
    const res = step(this.level, this.current.board, dir);
    if (!res.moved) return res;
    this.undoStack.push(this.current);
    this.redoStack = [];
    this.current = { board: res.board, moves: this.current.moves + 1, pushes: this.current.pushes + (res.box ? 1 : 0) };
    return res;
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this.current);
    this.current = prev;
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.current);
    this.current = next;
    return true;
  }

  /** 처음 상태로 (이동·밀기 수 0, 기록 비움) */
  restart() {
    this.current = { board: this.level.start, moves: 0, pushes: 0 };
    this.undoStack = [];
    this.redoStack = [];
  }

  /** 확실한 데드락(목표가 아닌 일반 바닥의 벽 구석)에 들어간 상자 번호 */
  deadlocks(): number[] {
    return deadlockedBoxes(this.level, this.current.board);
  }
}
