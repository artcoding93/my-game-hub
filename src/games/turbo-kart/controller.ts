import { RACE } from "./config";
import { InputState } from "./input";
import { canUseItem, createRace, currentLap, pause, PLAYER, rankOf, stepRace, togglePause, type Race, type RaceOptions } from "./logic/game";
import type { Difficulty, ItemId, RaceEvent, RacePhase, RaceResult, TrackId } from "./types";

/**
 * React UI가 쓰는 요약 정보. 순위·바퀴·아이템처럼 가끔 바뀌는 값만 둔다.
 * 시간·속도·게이지처럼 매 프레임 바뀌는 값은 캔버스에 직접 그려 React를 다시 렌더링하지 않는다.
 */
export interface HudState {
  inRace: boolean;
  phase: RacePhase | null;
  paused: boolean;
  countdown: number;
  track: TrackId | null;
  difficulty: Difficulty | null;
  lap: number;
  rank: number;
  item: ItemId | null;
  itemUsable: boolean;
  boostReady: boolean;
  results: RaceResult[] | null;
  raceId: string | null;
}

const EMPTY_HUD: HudState = {
  inRace: false,
  phase: null,
  paused: false,
  countdown: 0,
  track: null,
  difficulty: null,
  lap: 1,
  rank: 4,
  item: null,
  itemUsable: false,
  boostReady: false,
  results: null,
  raceId: null,
};

const MAX_STEPS_PER_FRAME = 6;

/**
 * 규칙(logic/)과 화면(캔버스·React·사운드) 사이의 연결 지점. DOM에 의존하지 않는다.
 * 고정 시간 간격(1/60초)으로 진행해 기기 성능과 관계없이 같은 속도·조작감으로 동작한다.
 */
export class TurboKartController {
  race: Race | null = null;
  readonly input = new InputState();
  private accumulator = 0;
  private hud: HudState = EMPTY_HUD;
  private hudListeners = new Set<(hud: HudState) => void>();
  private eventListeners = new Set<(events: RaceEvent[]) => void>();

  startRace(options: RaceOptions) {
    this.race = createRace(options);
    this.accumulator = 0;
    this.input.clear();
    this.publishHud();
  }

  quit() {
    this.race = null;
    this.input.clear();
    this.publishHud();
  }

  update(deltaSeconds: number): RaceEvent[] {
    const race = this.race;
    if (!race) return [];
    const events: RaceEvent[] = [];
    const dt = RACE.fixedDt;
    this.accumulator = Math.min(this.accumulator + deltaSeconds, dt * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= dt) {
      events.push(...stepRace(race, this.input.take(), dt));
      this.accumulator -= dt;
    }
    if (events.length > 0) for (const listener of this.eventListeners) listener(events);
    this.publishHud();
    return events;
  }

  togglePause() {
    if (!this.race) return;
    togglePause(this.race.state);
    this.input.clear();
    this.accumulator = 0;
    this.publishHud();
  }

  pause() {
    if (!this.race) return;
    pause(this.race.state);
    this.input.clear();
    this.publishHud();
  }

  getHud() {
    return this.hud;
  }

  subscribe(listener: (hud: HudState) => void): () => void {
    this.hudListeners.add(listener);
    return () => this.hudListeners.delete(listener);
  }

  onEvents(listener: (events: RaceEvent[]) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private computeHud(): HudState {
    const race = this.race;
    if (!race) return EMPTY_HUD;
    const s = race.state;
    const me = s.karts[PLAYER];
    return {
      inRace: true,
      phase: s.phase,
      paused: s.paused,
      countdown: Math.ceil(s.countdown),
      track: s.track,
      difficulty: s.difficulty,
      lap: currentLap(me, s.laps),
      rank: rankOf(s, PLAYER),
      item: me.item,
      itemUsable: canUseItem(s, me),
      boostReady: me.gauge >= 100 && me.boostTime === 0 && me.boostCooldown === 0,
      results: s.results,
      raceId: s.raceId,
    };
  }

  private publishHud() {
    const next = this.computeHud();
    const prev = this.hud;
    if ((Object.keys(next) as (keyof HudState)[]).every((key) => next[key] === prev[key])) return;
    this.hud = next;
    for (const listener of this.hudListeners) listener(next);
  }
}
