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
  kick: boolean;
}

export const NO_INPUT: Input = { move: 0, jump: false, jumpHeld: false, fire: false, kick: false };

export interface Player extends Body {
  facing: 1 | -1;
  lives: number;
  invulnerable: number;
  hurt: number;
  shootCooldown: number;
  kickCooldown: number;
  /** 애니메이션용: 마지막 공격·차기 후 시간 */
  shootAnim: number;
  kickAnim: number;
  coyote: number;
  jumpBuffer: number;
  shield: boolean;
  /** 남은 효과 시간 */
  speedBoost: number;
  rapid: number;
  giant: number;
  walkTime: number;
  alive: boolean;
}

/**
 * 적 상태:
 *   active   돌아다님 (snow 0~2: 눈 쌓임 단계)
 *   ball     눈덩이에 완전히 갇힘. 그대로 두면 escapeTime 뒤 탈출
 *   rolling  차서 굴러가는 눈덩이 (다른 적을 쓰러뜨림)
 *   dead     쓰러짐 연출 중 (화면 밖으로 날아간 뒤 목록에서 빠짐)
 */
export type EnemyState = "active" | "ball" | "rolling" | "dead";

export interface Enemy extends Body {
  id: number;
  kind: EnemyKind;
  state: EnemyState;
  dir: 1 | -1;
  /** 쌓인 눈 (0 ~ SNOW.hitsToFreeze) */
  snow: number;
  /** 마지막 명중 후 시간 (녹기 판정) */
  sinceHit: number;
  /** 눈덩이로 갇힌 시간 */
  ballTime: number;
  /** 굴러가는 눈덩이: 이번에 쓰러뜨린 적 수, 벽에 튕긴 횟수, 굴러간 시간 */
  chain: number;
  bounces: number;
  rollTime: number;
  angry: number;
  thinkTimer: number;
  hopTimer: number;
  stuckTimer: number;
  stuckX: number;
  deadTime: number;
  /** 박쥐 비행 위상 */
  phase: number;
  enhanced: boolean;
  /** 보스가 만든 졸개 */
  minion: boolean;
  /** 눈덩이 금 (0 없음, 1·2 탈출 경고) */
  crack: number;
}

export type BossState = "walk" | "telegraph" | "hurt" | "dying" | "dead";

export interface Boss extends Body {
  hp: number;
  state: BossState;
  dir: 1 | -1;
  timer: number;
  attackTimer: number;
  spawnTimer: number;
  invulnerable: number;
  spawned: number;
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  w: number;
  h: number;
  giant: boolean;
}

export interface Gear extends Body {
  life: number;
  spin: number;
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
  /** 큰 글씨 (연쇄 표시) */
  big: boolean;
}

export type Phase = "intro" | "play" | "clear" | "dying" | "gameover" | "victory";

export type GameEvent =
  | { type: "stageStart"; stage: number }
  | { type: "jump" }
  | { type: "shoot" }
  | { type: "snowHit"; level: number; x: number; y: number }
  | { type: "freeze"; x: number; y: number }
  | { type: "tink"; x: number; y: number }
  | { type: "kick"; x: number; y: number }
  | { type: "bounce"; x: number; y: number }
  | { type: "kill"; chain: number; points: number; x: number; y: number }
  | { type: "shatter"; chain: number; x: number; y: number }
  | { type: "crack"; level: 1 | 2; x: number; y: number }
  | { type: "escape"; x: number; y: number }
  | { type: "itemSpawn"; kind: ItemKind | BonusKind }
  | { type: "item"; kind: ItemKind | BonusKind; x: number; y: number }
  | { type: "hurt" }
  | { type: "shieldBlock" }
  | { type: "bossTelegraph" }
  | { type: "bossThrow" }
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
  boss: Boss | null;
  shots: Shot[];
  gears: Gear[];
  items: Item[];
  popups: Popup[];
  score: number;
  /** 시드 난수 상태 */
  rng: number;
  time: number;
  stageTime: number;
  nextId: number;
  itemsThisStage: number;
  itemCooldown: number;
  lifeDroppedThisStage: boolean;
  /** 바람 세기 (-1 ~ 1, 바람 스테이지에서만) */
  wind: number;
  /** 굴러가는 눈덩이가 있으면 > 0 (굴러가는 소리 간격) */
  rollSoundTimer: number;
  /** 화면 흔들림 요청 (렌더러가 읽음. 설정에서 끌 수 있음) */
  shake: { amount: number; time: number };
  easyPush: boolean;
  stats: { kills: number; bestChain: number };
  /** 이번 게임에서 고급 구간 체크포인트를 열었는지 */
  checkpointReached: boolean;
}
