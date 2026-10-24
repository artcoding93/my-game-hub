import { FIXED_DT, MAX_STEPS_PER_FRAME } from "./config";
import { InputState } from "./input";
import { createGame, stepGame } from "./logic/game";
import type { GameEvent, GameState, Phase } from "./types";

/** React UI가 쓰는 요약 정보 (가끔 바뀌는 값만). 점수 등 매 프레임 값은 캔버스 HUD가 그린다 */
export interface HudState {
  running: boolean;
  phase: Phase | null;
  paused: boolean;
  stageIndex: number;
  checkpointReached: boolean;
}

const EMPTY: HudState = { running: false, phase: null, paused: false, stageIndex: 0, checkpointReached: false };

/**
 * 규칙(logic/)과 화면(캔버스·React·사운드)의 연결 지점. DOM에 의존하지 않는다.
 * 고정 1/60초 스텝으로 진행해 화면 주사율과 관계없이 같은 속도·조작감으로 동작한다.
 */
export class FrostyController {
  state: GameState | null = null;
  readonly input = new InputState();
  paused = false;
  private accumulator = 0;
  private hud: HudState = EMPTY;
  private listeners = new Set<() => void>();

  start(opts: { seed: number; startStage: number; easyPush: boolean }) {
    this.state = createGame(opts);
    this.paused = false;
    this.accumulator = 0;
    this.input.clear();
    this.publish();
  }

  quit() {
    this.state = null;
    this.paused = false;
    this.input.clear();
    this.publish();
  }

  setEasyPush(on: boolean) {
    if (this.state) this.state.easyPush = on;
  }

  /** 실제 경과 시간만큼 고정 스텝을 진행하고 그동안의 이벤트를 돌려준다 */
  update(realDt: number): GameEvent[] {
    const s = this.state;
    if (!s || this.paused) return [];
    const events: GameEvent[] = [];
    this.accumulator = Math.min(this.accumulator + realDt, FIXED_DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= FIXED_DT) {
      events.push(...stepGame(s, this.input.take(), FIXED_DT));
      this.accumulator -= FIXED_DT;
    }
    this.publish();
    return events;
  }

  setPaused(paused: boolean) {
    const s = this.state;
    if (!s || s.phase === "gameover" || s.phase === "victory") return;
    this.paused = paused;
    this.input.clear();
    this.accumulator = 0;
    this.publish();
  }

  getHud = () => this.hud;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish() {
    const s = this.state;
    const next: HudState = s
      ? { running: true, phase: s.phase, paused: this.paused, stageIndex: s.stageIndex, checkpointReached: s.checkpointReached }
      : EMPTY;
    const prev = this.hud;
    if ((Object.keys(next) as (keyof HudState)[]).every((k) => next[k] === prev[k])) return;
    this.hud = next;
    for (const l of this.listeners) l();
  }
}
