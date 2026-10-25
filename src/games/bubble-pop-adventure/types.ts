import type { BonusKind, EnemyKind, ItemKind } from "./config";
import type { Level, MovingPlatform } from "./logic/level";
import type { Body } from "./logic/physics";
import type { StageSpec } from "./stages";

export interface Input {
  move: -1 | 0 | 1;
  /** 이번 스텝에 새로 누름 */
  jump: boolean;
  jumpHeld: boolean;
  fire: boolean;
}

export const NO_INPUT: Input = { move: 0, jump: false, jumpHeld: false, fire: false };

export interface Player extends Body {
  facing: 1 | -1;
  lives: number;
  invulnerable: number;
  hurt: number;
  shootCooldown: number;
  /** 애니메이션용: 마지막 발사 후 시간 */
  shootAnim: number;
  coyote: number;
  jumpBuffer: number;
  shield: boolean;
  /** 남은 효과 시간 */
  rapid: number;
  giant: number;
  walkTime: number;
  alive: boolean;
}

/**
 * 적 상태:
 *   active   돌아다님
 *   trapped  방울에 갇힘 (위치는 방울을 따라간다. 그대로 두면 탈출)
 *   dead     쓰러짐 연출 중 (날아간 뒤 목록에서 빠짐)
 */
export type EnemyState = "active" | "trapped" | "dead";

export interface Enemy extends Body {
  id: number;
  kind: EnemyKind;
  state: EnemyState;
  dir: 1 | -1;
  /** 비행 요정의 세로 방향 */
  vdir: 1 | -1;
  angry: number;
  thinkTimer: number;
  hopTimer: number;
  stuckTimer: number;
  stuckX: number;
  deadTime: number;
  enhanced: boolean;
  /** 보스가 만든 졸개 */
  minion: boolean;
}

/**
 * 방울: shot(앞으로 날아가며 적을 가둠) → float(천천히 떠오름, 바람·천장을 따라 이동).
 * captive가 있으면 적이 갇힌 방울. popIn ≥ 0이면 연쇄로 곧 터진다.
 */
export interface Bubble {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  phase: "shot" | "float";
  dir: 1 | -1;
  age: number;
  shotTime: number;
  giant: boolean;
  captive: Enemy | null;
  captiveTime: number;
  popIn: number;
  /** 연쇄 출처 (같은 연쇄로 터진 방울 묶음) */
  chain: number;
}

export type BossState = "float" | "telegraph" | "hurt" | "dying" | "dead";

export interface Boss {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  state: BossState;
  dir: 1 | -1;
  timer: number;
  /** 위아래 흔들림 위상 */
  bob: number;
  attackTimer: number;
  spawnTimer: number;
  invulnerable: number;
  spawned: number;
}

/** 보스가 쏘는 음표 (벽에 닿으면 사라짐) */
export interface Note {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  life: number;
}

/** 잡은 적을 터뜨리면 나오는 별빛 조각 (보스 스테이지에서 여왕을 따라감) */
export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface Item extends Body {
  id: number;
  kind: ItemKind | BonusKind;
  life: number;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
  /** 큰 글씨 (콤보 표시) */
  big: boolean;
}

export type Phase = "intro" | "play" | "clear" | "dying" | "gameover" | "victory";

export type GameEvent =
  | { type: "stageStart"; stage: number }
  | { type: "jump" }
  | { type: "shoot"; giant: boolean }
  | { type: "capture"; x: number; y: number }
  | { type: "pop"; x: number; y: number }
  | { type: "fizz"; x: number; y: number }
  | { type: "bubbleBounce"; x: number; y: number }
  | { type: "kill"; combo: number; points: number; x: number; y: number }
  | { type: "warn"; x: number; y: number }
  | { type: "escape"; x: number; y: number }
  | { type: "itemSpawn"; kind: ItemKind | BonusKind }
  | { type: "item"; kind: ItemKind | BonusKind; x: number; y: number }
  | { type: "extraLife" }
  | { type: "hurt" }
  | { type: "shieldBlock" }
  | { type: "spark"; x: number; y: number }
  | { type: "bossTelegraph" }
  | { type: "bossShoot" }
  | { type: "bossHit"; hp: number; x: number; y: number }
  | { type: "bossDefeat"; x: number; y: number }
  | { type: "minion" }
  | { type: "stageClear"; bonus: number; checkpoint: boolean }
  | { type: "gameOver" }
  | { type: "victory" };

export interface GameState {
  phase: Phase;
  phaseTime: number;
  stageIndex: number;
  stage: StageSpec;
  level: Level;
  platforms: MovingPlatform[];
  player: Player;
  enemies: Enemy[];
  bubbles: Bubble[];
  boss: Boss | null;
  notes: Note[];
  sparks: Spark[];
  items: Item[];
  popups: Popup[];
  score: number;
  /** 다음 목숨 추가 점수 */
  nextLifeAt: number;
  /** 시드 난수 상태 */
  rng: number;
  time: number;
  stageTime: number;
  nextId: number;
  itemsThisStage: number;
  itemCooldown: number;
  /** Time Freeze 남은 시간 (적·보스·음표 정지) */
  freeze: number;
  /** 콤보: 이어진 수와 남은 시간 */
  combo: { count: number; timer: number };
  /** 바람 세기 (-1 ~ 1, 바람 스테이지에서만) */
  wind: number;
  /** 화면 흔들림 요청 (렌더러가 읽음. 설정에서 끌 수 있음) */
  shake: { amount: number; time: number };
  stats: { kills: number; bestCombo: number };
  /** 이번 게임에서 고급 구간 체크포인트를 열었는지 */
  checkpointReached: boolean;
}
