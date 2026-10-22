import { LEVELS } from "./config";
import { InputState } from "./input";
import { createGame, pause, startGame, stepGame, togglePause } from "./logic/game";
import type { GameEvent, GamePhase, GameState, PieceType } from "./types";

/** React UI가 쓰는 요약 정보 */
export interface HudState {
  phase: GamePhase;
  score: number;
  highScore: number;
  lines: number;
  level: number;
  levelName: string;
  hold: PieceType | null;
  holdUsed: boolean;
  next: PieceType[];
  /** 레벨업 안내 (레벨 번호, 없으면 null) */
  banner: number | null;
  wind: -1 | 1 | null;
  snowColumn: number | null;
  newRecord: boolean;
}

export type ControlAction = "start" | "pause" | "resume" | "title";

const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;

/**
 * 게임 규칙(logic/)과 화면(캔버스·React UI·사운드) 사이의 연결 지점.
 * 고정 시간 간격(1/60초)으로 진행해 기기 성능과 관계없이 같은 속도로 동작한다. DOM에 의존하지 않는다.
 */
export class WinterBlocksController {
  readonly state: GameState;
  readonly input = new InputState();
  private accumulator = 0;
  private hud: HudState;
  private hudListeners = new Set<(hud: HudState) => void>();
  private eventListeners = new Set<(events: GameEvent[]) => void>();
  private actionListeners = new Set<(action: ControlAction) => void>();
  /** 화면 연출용: 최근 이벤트와 발생 시각 */
  readonly recent: { event: GameEvent; at: number }[] = [];
  private startedBest = 0;

  constructor(highScore: number, seed: number) {
    this.state = createGame(seed, highScore);
    this.hud = this.computeHud();
  }

  update(deltaSeconds: number): GameEvent[] {
    const events: GameEvent[] = [];
    this.accumulator = Math.min(this.accumulator + deltaSeconds, FIXED_DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= FIXED_DT) {
      events.push(...stepGame(this.state, this.input.take(), FIXED_DT));
      this.accumulator -= FIXED_DT;
    }
    this.emit(events);
    this.publishHud();
    return events;
  }

  start(seed: number) {
    this.input.clear();
    this.accumulator = 0;
    this.startedBest = this.state.highScore;
    const events = startGame(this.state, seed);
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

  /** 게임 오버 화면 → 처음 화면 */
  toTitle() {
    if (this.state.phase !== "gameOver") return;
    this.state.phase = "title";
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
    for (const event of events) this.recent.push({ event, at: this.state.time });
    while (this.recent.length > 40) this.recent.shift();
    for (const listener of this.eventListeners) listener(events);
  }

  private emitAction(action: ControlAction) {
    for (const listener of this.actionListeners) listener(action);
  }

  private computeHud(): HudState {
    const s = this.state;
    return {
      phase: s.phase,
      score: s.score,
      highScore: Math.max(s.highScore, s.score),
      lines: s.lines,
      level: s.level,
      levelName: LEVELS[s.level - 1].name,
      hold: s.hold,
      holdUsed: s.holdUsed,
      next: s.queue.slice(0, 3),
      banner: s.banner?.level ?? null,
      wind: s.wind?.dir ?? null,
      snowColumn: s.snowColumn,
      newRecord: s.phase === "gameOver" && s.score > this.startedBest && s.score > 0,
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
