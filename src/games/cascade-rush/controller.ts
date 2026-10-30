import { COLS, ROWS, SPAWN_X, type GameMode } from "./config";
import { InputState } from "./input";
import { createGame, pause, startGame, stepGame, togglePause } from "./logic/game";
import type { Color, EndReason, GameEvent, GamePhase, GameState } from "./types";

/** React UI가 쓰는 요약 정보 */
export interface HudState {
  phase: GamePhase;
  mode: GameMode;
  /** 남은 시간(올림한 초). Endless는 null */
  seconds: number | null;
  score: number;
  crystals: number;
  /** 진행 중인 연쇄 단계 (없으면 0) */
  chain: number;
  maxChain: number;
  speed: number;
  next: [Color, Color][];
  endReason: EndReason | null;
  /** 보드가 거의 가득 참 (생성 위치 근처) */
  danger: boolean;
}

export type ControlAction = "start" | "pause" | "resume" | "title";

const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
/** 생성 열 높이가 이 이상이면 위험 표시 */
const DANGER_HEIGHT = ROWS - 3;

/**
 * 게임 규칙(logic/)과 화면(캔버스·React UI·사운드) 사이의 연결 지점.
 * 고정 시간 간격(1/60초)으로 진행해 기기 성능·화면 주사율과 관계없이 같은 속도로 동작한다. DOM에 의존하지 않는다.
 */
export class CascadeController {
  readonly state: GameState;
  readonly input = new InputState();
  private accumulator = 0;
  private hud: HudState;
  private hudListeners = new Set<(hud: HudState) => void>();
  private eventListeners = new Set<(events: GameEvent[]) => void>();
  private actionListeners = new Set<(action: ControlAction) => void>();

  constructor(seed: number) {
    this.state = createGame("rush", seed);
    this.hud = this.computeHud();
  }

  update(deltaSeconds: number): GameEvent[] {
    const events: GameEvent[] = [];
    this.accumulator = Math.min(this.accumulator + deltaSeconds, FIXED_DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= FIXED_DT) {
      events.push(...stepGame(this.state, this.input.take(), FIXED_DT));
      this.accumulator -= FIXED_DT;
    }
    // 게임이 끝나면 누르고 있던 버튼·남은 회전을 지운다(다음 게임에 넘어가지 않게)
    if (events.some((e) => e.type === "gameOver")) this.input.clear();
    this.emit(events);
    this.publishHud();
    return events;
  }

  start(mode: GameMode, seed: number) {
    this.input.clear();
    this.accumulator = 0;
    const events = startGame(this.state, mode, seed);
    this.emitAction("start");
    this.emit(events);
    this.publishHud();
  }

  togglePause() {
    const before = this.state.phase;
    togglePause(this.state);
    this.input.clear();
    if (before !== this.state.phase) this.emitAction(this.state.phase === "paused" ? "pause" : "resume");
    this.publishHud();
  }

  pause() {
    const before = this.state.phase;
    pause(this.state);
    this.input.clear();
    if (before !== this.state.phase) this.emitAction("pause");
    this.publishHud();
  }

  /** 결과·일시정지 화면 → 처음 화면 (모드 선택) */
  toTitle() {
    if (this.state.phase !== "over" && this.state.phase !== "paused") return;
    this.state.phase = "title";
    this.state.active = null;
    this.state.resolve = null;
    this.input.clear();
    this.emitAction("title");
    this.publishHud();
  }

  getHud() {
    return this.hud;
  }

  subscribe(listener: (hud: HudState) => void): () => void {
    this.hudListeners.add(listener);
    return () => this.hudListeners.delete(listener);
  }

  onEvents(listener: (events: GameEvent[]) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onAction(listener: (action: ControlAction) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  private emit(events: GameEvent[]) {
    if (events.length === 0) return;
    for (const listener of this.eventListeners) listener(events);
  }

  private emitAction(action: ControlAction) {
    for (const listener of this.actionListeners) listener(action);
  }

  private computeHud(): HudState {
    const s = this.state;
    let height = 0;
    for (const x of [SPAWN_X, SPAWN_X + 1].filter((c) => c < COLS)) {
      let y = 0;
      while (y < ROWS && s.board[y][x] === 0) y++;
      height = Math.max(height, ROWS - y);
    }
    return {
      phase: s.phase,
      mode: s.mode,
      seconds: s.mode === "rush" ? Math.ceil(s.timeLeft) : null,
      score: s.score,
      crystals: s.crystals,
      chain: s.resolve?.chain ?? 0,
      maxChain: s.maxChain,
      speed: s.speed,
      next: s.queue.slice(0, 2),
      endReason: s.endReason,
      danger: s.phase !== "title" && height >= DANGER_HEIGHT,
    };
  }

  /** 값이 바뀐 경우에만 알려 React가 매 프레임 다시 렌더링하지 않게 한다. */
  private publishHud() {
    const next = this.computeHud();
    const prev = this.hud;
    const changed = (Object.keys(next) as (keyof HudState)[]).some((key) => {
      const a = next[key];
      const b = prev[key];
      return Array.isArray(a) && Array.isArray(b) ? a.join() !== b.join() : a !== b;
    });
    if (!changed) return;
    this.hud = next;
    for (const listener of this.hudListeners) listener(next);
  }
}
