import { GAME_CONFIG } from "./config";
import { InputState } from "./input";
import { ROOMS } from "./rooms";
import { toSaveData, type SaveData } from "./save";
import {
  clearStats,
  continueGame,
  createGame,
  cycleItem,
  newGame,
  ownedItems,
  pause,
  selectItem,
  stepGame,
  toggleInventory,
  togglePause,
  applySelectedItem,
  type RestoreData,
} from "./logic/simulation";
import type { GameEvent, GamePhase, GameState, ItemId, Message, Prompt, RoomId } from "./types";

/** React HUD·오버레이가 쓰는 요약 정보 */
export interface HudState {
  phase: GamePhase;
  health: number;
  maxHealth: number;
  score: number;
  /** 플레이 시간(초, 내림) */
  seconds: number;
  room: RoomId;
  roomIndex: number;
  roomName: string;
  roomTitle: string;
  inventory: { id: ItemId; count: number }[];
  selected: ItemId | null;
  message: Pick<Message, "id" | "text" | "tone"> | null;
  prompt: Prompt | null;
  hasRelic: boolean;
  hasSave: boolean;
  bestScore: number;
  /** 최단 클리어 시간(초). 0이면 기록 없음 */
  bestTime: number;
  newBestScore: boolean;
  newBestTime: boolean;
  stats: ReturnType<typeof clearStats> | null;
}

export interface Persistence {
  writeSave(data: SaveData): void;
  clearSave(): void;
  writeRecords(bestScore: number, bestTime: number): void;
}

export type ControlAction = "start" | "pause" | "resume" | "inventoryOpen" | "inventoryClose";

const FIXED_DT = 1 / 60;
/** 탭 전환 등으로 프레임이 크게 밀려도 한 번에 따라잡는 최대 스텝 수 */
const MAX_STEPS_PER_FRAME = 5;
/** 진행 상태가 바뀌어 즉시 저장하는 이벤트 */
const SAVE_ON: ReadonlySet<GameEvent["type"]> = new Set([
  "roomEnter",
  "itemFound",
  "doorOpen",
  "secretFound",
  "switchActivate",
  "relicFound",
  "heal",
  "playerHit",
  "coin",
]);

/**
 * 시뮬레이션(logic/)과 화면(Phaser 장면·React UI·사운드) 사이의 연결 지점.
 * 고정 시간 간격(1/60초)으로 시뮬레이션을 진행해 기기 성능과 관계없이 같은 속도로 동작한다.
 * Phaser에 의존하지 않으므로 SSR 환경에서 import해도 안전하다.
 */
export class LostRelicController {
  readonly state: GameState;
  readonly input = new InputState();
  private accumulator = 0;
  private hud: HudState;
  private hudListeners = new Set<(hud: HudState) => void>();
  private eventListeners = new Set<(events: GameEvent[]) => void>();
  private actionListeners = new Set<(action: ControlAction) => void>();
  /** update() 밖(시작 버튼·인벤토리 사용 등)에서 생긴 이벤트. 다음 프레임에 장면으로 전달한다. */
  private queued: GameEvent[] = [];
  private persistence: Persistence;
  private savedAt = 0;
  private hasSave: boolean;
  private bestScore: number;
  private bestTime: number;
  private newBestScore = false;
  private newBestTime = false;

  constructor(persistence: Persistence, records: { bestScore: number; bestTime: number; hasSave: boolean }) {
    this.state = createGame();
    this.persistence = persistence;
    this.bestScore = records.bestScore;
    this.bestTime = records.bestTime;
    this.hasSave = records.hasSave;
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
    this.afterEvents(stepped);
    if (this.state.phase === "playing" && this.state.time - this.savedAt >= GAME_CONFIG.autosaveInterval) this.save();
    this.publishHud();
    return events.concat(stepped);
  }

  newGame() {
    this.input.clear();
    this.newBestScore = false;
    this.newBestTime = false;
    this.accumulator = 0;
    const events = newGame(this.state);
    // 시작 알림(BGM 처음부터 재생)을 먼저 보내야, 뒤이은 roomEnter가 같은 곡을 다시 시작하지 않는다.
    this.emitAction("start");
    this.queue(events);
    this.publishHud();
  }

  continueGame(data: RestoreData) {
    this.input.clear();
    this.newBestScore = false;
    this.newBestTime = false;
    this.accumulator = 0;
    const events = continueGame(this.state, data);
    // 시작 알림(BGM 처음부터 재생)을 먼저 보내야, 뒤이은 roomEnter가 같은 곡을 다시 시작하지 않는다.
    this.emitAction("start");
    this.queue(events);
    this.publishHud();
  }

  togglePause() {
    const before = this.state.phase;
    if (before === "inventory") {
      this.toggleInventory();
      return;
    }
    togglePause(this.state);
    this.input.clear();
    if (before !== this.state.phase) {
      if (this.state.phase === "paused") {
        this.save();
        this.emitAction("pause");
      } else this.emitAction("resume");
    }
    this.publishHud();
  }

  pause() {
    const before = this.state.phase;
    pause(this.state);
    this.input.clear();
    if (before !== this.state.phase) {
      this.save();
      this.emitAction("pause");
    }
    this.publishHud();
  }

  toggleInventory() {
    const before = this.state.phase;
    toggleInventory(this.state);
    this.input.clear();
    if (before !== this.state.phase) this.emitAction(this.state.phase === "inventory" ? "inventoryOpen" : "inventoryClose");
    this.publishHud();
  }

  /** 인벤토리 화면의 사용 버튼·F 키 (게임 진행 중에는 input.trigger("use")를 쓴다) */
  applySelected() {
    const events: GameEvent[] = [];
    applySelectedItem(this.state, events);
    this.queue(events);
    this.publishHud();
  }

  cycle(dir: 1 | -1 = 1) {
    cycleItem(this.state, dir);
    this.publishHud();
  }

  select(item: ItemId) {
    selectItem(this.state, item);
    this.publishHud();
  }

  /** 진행 상태를 저장한다(게임 중일 때만). */
  save() {
    const { phase } = this.state;
    if (phase !== "playing" && phase !== "paused" && phase !== "inventory") return;
    this.persistence.writeSave(toSaveData(this.state));
    this.savedAt = this.state.time;
    this.hasSave = true;
  }

  onAction(listener: (action: ControlAction) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  getHud(): HudState {
    return this.hud;
  }

  subscribe(listener: (hud: HudState) => void): () => void {
    this.hudListeners.add(listener);
    return () => this.hudListeners.delete(listener);
  }

  /** 게임 이벤트 구독 (효과음·배경음악) */
  onEvents(listener: (events: GameEvent[]) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private queue(events: GameEvent[]) {
    this.queued.push(...events);
    this.afterEvents(events);
  }

  private afterEvents(events: GameEvent[]) {
    if (events.length === 0) return;
    for (const listener of this.eventListeners) listener(events);
    if (events.some((e) => e.type === "gameClear")) this.finish(true);
    else if (events.some((e) => e.type === "gameOver")) this.finish(false);
    else if (events.some((e) => SAVE_ON.has(e.type))) this.save();
  }

  /** 게임이 끝나면 저장을 지우고 기록을 갱신한다. */
  private finish(cleared: boolean) {
    this.persistence.clearSave();
    this.hasSave = false;
    if (this.state.score > this.bestScore) {
      this.bestScore = this.state.score;
      this.newBestScore = true;
    }
    if (cleared) {
      const time = Math.max(1, Math.floor(this.state.time));
      if (this.bestTime === 0 || time < this.bestTime) {
        this.bestTime = time;
        this.newBestTime = true;
      }
    }
    this.persistence.writeRecords(this.bestScore, this.bestTime);
  }

  private emitAction(action: ControlAction) {
    for (const listener of this.actionListeners) listener(action);
  }

  private computeHud(): HudState {
    const s = this.state;
    const room = ROOMS[s.room];
    return {
      phase: s.phase,
      health: s.health,
      maxHealth: GAME_CONFIG.maxHealth,
      score: s.score,
      seconds: Math.floor(s.time),
      room: s.room,
      roomIndex: room.index,
      roomName: room.name,
      roomTitle: room.title,
      inventory: ownedItems(s).map((id) => ({ id, count: s.inventory[id] })),
      selected: s.selected,
      message: s.message ? { id: s.message.id, text: s.message.text, tone: s.message.tone } : null,
      prompt: s.prompt,
      hasRelic: s.inventory.relic > 0,
      hasSave: this.hasSave,
      bestScore: this.bestScore,
      bestTime: this.bestTime,
      newBestScore: this.newBestScore,
      newBestTime: this.newBestTime,
      stats: s.phase === "cleared" ? clearStats(s) : null,
    };
  }

  /** 값이 바뀐 경우에만 알려 React가 매 프레임 다시 렌더링하지 않게 한다. */
  private publishHud() {
    const next = this.computeHud();
    const prev = this.hud;
    const changed = (Object.keys(next) as (keyof HudState)[]).some((key) => {
      const a = next[key];
      const b = prev[key];
      if (a === b) return false;
      if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) !== JSON.stringify(b);
      return true;
    });
    if (!changed) return;
    this.hud = next;
    for (const listener of this.hudListeners) listener(next);
  }
}
