import { GAME_CONFIG } from "./config";
import { InputState } from "./input";
import { createGame, isBossWaveNumber, pause, startGame, stepGame, togglePause, waveClearBonus } from "./logic/simulation";
import type { GameEvent, GamePhase, GameState } from "./types";

/** React HUD·오버레이가 쓰는 요약 정보 */
export interface HudState {
  phase: GamePhase;
  score: number;
  highScore: number;
  lives: number;
  wave: number;
  bossWave: boolean;
  clearBonus: number;
  /** 남은 효과 시간(초, 올림). 0이면 비활성 */
  rapidLeft: number;
  doubleLeft: number;
  shield: boolean;
}

const FIXED_DT = 1 / 60;
/** 탭 전환 등으로 프레임이 크게 밀려도 한 번에 따라잡는 최대 스텝 수 */
const MAX_STEPS_PER_FRAME = 5;

/**
 * 시뮬레이션(logic/)과 화면(Phaser 장면·React UI·사운드) 사이의 연결 지점.
 * 고정 시간 간격(1/60초)으로 시뮬레이션을 진행해 기기 성능과 관계없이 같은 속도로 동작한다.
 * Phaser에 의존하지 않으므로 SSR 환경에서 import해도 안전하다.
 */
export class StarVanguardController {
  readonly state: GameState;
  readonly input = new InputState();
  private accumulator = 0;
  private hud: HudState;
  private hudListeners = new Set<(hud: HudState) => void>();
  private eventListeners = new Set<(events: GameEvent[]) => void>();
  private actionListeners = new Set<(action: "pause" | "resume") => void>();
  /** update() 밖(시작 버튼 등)에서 생긴 이벤트. 다음 프레임에 장면으로 전달한다. */
  private queued: GameEvent[] = [];

  constructor(highScore: number) {
    this.state = createGame(highScore);
    this.hud = this.computeHud();
  }

  /** 프레임마다 호출. 이번 프레임에 일어난 이벤트를 돌려준다. */
  update(deltaSeconds: number): GameEvent[] {
    const events = this.queued;
    this.queued = [];
    const stepped: GameEvent[] = [];
    this.accumulator = Math.min(this.accumulator + deltaSeconds, FIXED_DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= FIXED_DT) {
      stepped.push(...stepGame(this.state, this.input.take(), FIXED_DT));
      this.accumulator -= FIXED_DT;
    }
    this.emit(stepped);
    this.publishHud();
    return events.concat(stepped);
  }

  /** Enter·화면 버튼: 상태에 따라 시작 / 재개 / 다시 시작 */
  primaryAction() {
    const { phase } = this.state;
    if (phase === "ready" || phase === "gameOver") {
      // 시드는 클라이언트에서 게임을 시작할 때만 정한다(같은 시드면 같은 게임이 재현된다).
      const events = startGame(this.state, (Date.now() ^ (this.state.score * 7919)) | 0);
      this.queued.push(...events);
      this.emit(events);
    } else if (phase === "paused") {
      togglePause(this.state);
      this.emitAction("resume");
    }
    this.publishHud();
  }

  togglePause() {
    const wasPaused = this.state.phase === "paused";
    togglePause(this.state);
    this.input.clear();
    if (wasPaused !== (this.state.phase === "paused")) this.emitAction(wasPaused ? "resume" : "pause");
    this.publishHud();
  }

  pause() {
    const wasPaused = this.state.phase === "paused";
    pause(this.state);
    this.input.clear();
    if (!wasPaused && this.state.phase === "paused") this.emitAction("pause");
    this.publishHud();
  }

  /** 일시정지·재개 구독 (배경음악). 이벤트가 없는 조작이라 따로 알린다. */
  onAction(listener: (action: "pause" | "resume") => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  private emitAction(action: "pause" | "resume") {
    for (const listener of this.actionListeners) listener(action);
  }

  getHud(): HudState {
    return this.hud;
  }

  subscribe(listener: (hud: HudState) => void): () => void {
    this.hudListeners.add(listener);
    return () => this.hudListeners.delete(listener);
  }

  /** 게임 이벤트 구독 (효과음 등) */
  onEvents(listener: (events: GameEvent[]) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private emit(events: GameEvent[]) {
    if (events.length === 0) return;
    for (const listener of this.eventListeners) listener(events);
  }

  private computeHud(): HudState {
    const s = this.state;
    const left = (until: number) => Math.max(0, Math.ceil(until - s.time));
    return {
      phase: s.phase,
      score: s.score,
      highScore: s.highScore,
      lives: s.lives,
      wave: s.wave,
      bossWave: isBossWaveNumber(s.wave),
      clearBonus: waveClearBonus(s.wave),
      rapidLeft: s.player.alive ? left(s.player.rapidUntil) : 0,
      doubleLeft: s.player.alive ? left(s.player.doubleUntil) : 0,
      shield: s.player.shield,
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
export const SOUND_KEY = GAME_CONFIG.soundStorageKey;
export const MUSIC_KEY = GAME_CONFIG.musicStorageKey;
