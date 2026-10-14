import { GAME_CONFIG } from "./config";
import { InputState } from "./input";
import { createGame, pause, selfDestruct, startGame, stepGame, togglePause } from "./logic/simulation";
import { STAGES } from "./stages";
import type { GameEvent, GamePhase, GameState } from "./types";

/** React HUD·오버레이가 쓰는 요약 정보 */
export interface HudState {
  phase: GamePhase;
  score: number;
  highScore: number;
  lives: number;
  round: number;
  stage: number;
  stageName: string;
  goldLeft: number;
  escapeRevealed: boolean;
}

const FIXED_DT = 1 / 60;
/** 탭 전환 등으로 프레임이 크게 밀려도 한 번에 따라잡는 최대 스텝 수 */
const MAX_STEPS_PER_FRAME = 5;

/**
 * 시뮬레이션(logic/)과 화면(Phaser 장면·React UI) 사이의 연결 지점.
 * 고정 시간 간격(1/60초)으로 시뮬레이션을 진행해 기기 성능과 관계없이 같은 속도로 동작한다.
 * Phaser에 의존하지 않으므로 SSR 환경에서 import해도 안전하다.
 */
export class GoldEscapeController {
  readonly state: GameState;
  readonly input = new InputState();
  private accumulator = 0;
  private hud: HudState;
  private hudListeners = new Set<(hud: HudState) => void>();

  constructor(highScore: number) {
    this.state = createGame(highScore);
    this.hud = this.computeHud();
  }

  /** 프레임마다 호출. 이번 프레임에 일어난 이벤트를 돌려준다. */
  update(deltaSeconds: number): GameEvent[] {
    const events: GameEvent[] = [];
    this.accumulator = Math.min(this.accumulator + deltaSeconds, FIXED_DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= FIXED_DT) {
      events.push(...stepGame(this.state, this.input.take(), FIXED_DT));
      this.accumulator -= FIXED_DT;
    }
    this.publishHud();
    return events;
  }

  /** Enter·Space·화면 버튼: 상태에 따라 시작 / 재개 / 다시 시작 */
  primaryAction() {
    const { phase } = this.state;
    if (phase === "ready" || phase === "gameOver") startGame(this.state);
    else if (phase === "paused") togglePause(this.state);
    this.publishHud();
  }

  togglePause() {
    togglePause(this.state);
    this.input.clear();
    this.publishHud();
  }

  pause() {
    pause(this.state);
    this.input.clear();
    this.publishHud();
  }

  selfDestruct() {
    selfDestruct(this.state);
    this.publishHud();
  }

  getHud(): HudState {
    return this.hud;
  }

  subscribe(listener: (hud: HudState) => void): () => void {
    this.hudListeners.add(listener);
    return () => this.hudListeners.delete(listener);
  }

  private computeHud(): HudState {
    const s = this.state;
    return {
      phase: s.phase,
      score: s.score,
      highScore: s.highScore,
      lives: s.lives,
      round: s.round,
      stage: s.stageIndex + 1,
      stageName: STAGES[s.stageIndex].name,
      goldLeft: s.gold.size,
      escapeRevealed: s.escapeRevealed,
    };
  }

  /** 값이 바뀐 경우에만 알려 React가 매 프레임 다시 렌더링하지 않게 한다. */
  private publishHud() {
    const next = this.computeHud();
    const changed = (Object.keys(next) as (keyof HudState)[]).some((key) => next[key] !== this.hud[key]);
    if (!changed) return;
    this.hud = next;
    for (const listener of this.hudListeners) listener(next);
  }
}

export const HIGH_SCORE_KEY = GAME_CONFIG.highScoreStorageKey;
