import { PHYSICS } from "./config";
import { adjustAim, armItem, createBattle, pause, playerFire, setAim, stepGame, togglePause, type BattleOptions } from "./logic/game";
import type { Difficulty, FieldId, GameEvent, GamePhase, GameState, ItemId, Side } from "./types";

/** React UI가 쓰는 요약 정보 (값이 바뀔 때만 다시 알린다) */
export interface HudState {
  inBattle: boolean;
  phase: GamePhase | null;
  paused: boolean;
  turn: Side;
  turnCount: number;
  field: FieldId | null;
  difficulty: Difficulty | null;
  wind: number;
  angle: number;
  power: number;
  playerHp: number;
  aiHp: number;
  inventory: readonly ItemId[];
  aiInventory: number;
  armedSlot: number | null;
  energy: number;
  aiEnergy: number;
  repairsUsed: number;
  playerBarrier: boolean;
  aiBarrier: boolean;
  winner: Side | null;
  battleId: string | null;
}

const EMPTY_HUD: HudState = {
  inBattle: false,
  phase: null,
  paused: false,
  turn: "player",
  turnCount: 0,
  field: null,
  difficulty: null,
  wind: 0,
  angle: 45,
  power: 60,
  playerHp: 100,
  aiHp: 100,
  inventory: [],
  aiInventory: 0,
  armedSlot: null,
  energy: 0,
  aiEnergy: 0,
  repairsUsed: 0,
  playerBarrier: false,
  aiBarrier: false,
  winner: null,
  battleId: null,
};

const MAX_STEPS_PER_FRAME = 6;

/**
 * 규칙(logic/)과 화면(캔버스·React·사운드) 사이의 연결 지점. DOM에 의존하지 않는다.
 * 고정 시간 간격(1/60초)으로 진행해 기기 성능과 관계없이 같은 탄도·같은 속도로 동작한다.
 */
export class CannonRivalsController {
  state: GameState | null = null;
  private accumulator = 0;
  private hud: HudState = EMPTY_HUD;
  private hudListeners = new Set<(hud: HudState) => void>();
  private eventListeners = new Set<(events: GameEvent[]) => void>();

  startBattle(options: BattleOptions) {
    const { state, events } = createBattle(options);
    this.state = state;
    this.accumulator = 0;
    this.emit(events);
    this.publishHud();
  }

  /** 전투를 끝내고 메뉴로 (보상 없음) */
  quit() {
    this.state = null;
    this.publishHud();
  }

  update(deltaSeconds: number): GameEvent[] {
    const state = this.state;
    if (!state) return [];
    const events: GameEvent[] = [];
    const dt = PHYSICS.fixedDt;
    this.accumulator = Math.min(this.accumulator + deltaSeconds, dt * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= dt) {
      events.push(...stepGame(state, dt));
      this.accumulator -= dt;
    }
    this.emit(events);
    this.publishHud();
    return events;
  }

  fire() {
    if (!this.state) return;
    this.emit(playerFire(this.state));
    this.publishHud();
  }

  adjustAim(dAngle: number, dPower: number) {
    if (!this.state) return;
    adjustAim(this.state, dAngle, dPower);
    this.publishHud();
  }

  setAim(angle: number, power: number) {
    if (!this.state) return;
    setAim(this.state, angle, power);
    this.publishHud();
  }

  armItem(slot: number): boolean {
    if (!this.state) return false;
    const ok = armItem(this.state, slot);
    this.publishHud();
    return ok;
  }

  togglePause() {
    if (!this.state) return;
    togglePause(this.state);
    this.accumulator = 0;
    this.publishHud();
  }

  pause() {
    if (!this.state) return;
    pause(this.state);
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

  private emit(events: GameEvent[]) {
    if (events.length === 0) return;
    for (const listener of this.eventListeners) listener(events);
  }

  private computeHud(): HudState {
    const s = this.state;
    if (!s) return EMPTY_HUD;
    const { player, ai } = s.tanks;
    return {
      inBattle: true,
      phase: s.phase,
      paused: s.paused,
      turn: s.turn,
      turnCount: s.turnCount,
      field: s.field,
      difficulty: s.difficulty,
      wind: s.wind,
      angle: Math.round(player.angle * 10) / 10,
      power: Math.round(player.power * 10) / 10,
      playerHp: player.hp,
      aiHp: ai.hp,
      inventory: player.inventory,
      aiInventory: ai.inventory.length,
      armedSlot: s.turn === "player" ? s.armedSlot : null,
      energy: player.energy,
      aiEnergy: ai.energy,
      repairsUsed: player.repairsUsed,
      playerBarrier: player.barrier,
      aiBarrier: ai.barrier,
      winner: s.winner,
      battleId: s.battleId,
    };
  }

  private publishHud() {
    const next = this.computeHud();
    const prev = this.hud;
    const changed = (Object.keys(next) as (keyof HudState)[]).some((key) => {
      const a = next[key];
      const b = prev[key];
      return Array.isArray(a) && Array.isArray(b) ? a.join() !== b.join() : a !== b;
    });
    if (!changed) return;
    // 인벤토리는 복사해 React가 바뀐 값을 확실히 보게 한다
    this.hud = { ...next, inventory: [...next.inventory] };
    for (const listener of this.hudListeners) listener(this.hud);
  }
}
