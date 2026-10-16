export type EnemyKind = "scout" | "interceptor" | "sentinel" | "core";

export type PowerUpKind = "rapid" | "double" | "shield" | "life";

export type GamePhase = "ready" | "waveIntro" | "playing" | "waveClear" | "paused" | "gameOver";

export interface Vec {
  x: number;
  y: number;
}

/**
 * 3차 베지어 곡선 경로. `to`가 null이면 끝점은 적의 현재 편대 자리를 따라간다
 * (편대가 좌우로 흔들리는 중에도 자연스럽게 자리에 들어가도록).
 */
export interface CurvePath {
  from: Vec;
  c1: Vec;
  c2: Vec;
  to: Vec | null;
  duration: number;
  elapsed: number;
  /** "out": 끝에서 감속(편대 자리에 부드럽게 도착) */
  ease: "linear" | "out";
}

/**
 * - waiting: 화면 밖에서 진입 순서를 기다림
 * - entering: 곡선을 따라 편대 자리로 이동
 * - formation: 편대 자리에서 대기(보스는 좌우 순찰)
 * - diving: 플레이어를 향해 급강하
 * - returning: 화면 아래로 빠져나간 뒤 위에서 다시 나타나 자리로 복귀
 */
export type EnemyMode = "waiting" | "entering" | "formation" | "diving" | "returning";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  /** 편대 기준 자리 (흔들림 적용 전) */
  slot: Vec;
  /** 편대 열 번호. 세로 물결의 위상에 쓴다. */
  column: number;
  x: number;
  y: number;
  mode: EnemyMode;
  /** waiting → entering 전환 시각 */
  spawnAt: number;
  path: CurvePath | null;
  /** 이번 급강하에서 아직 쏘지 않은 발사 지점(진행률) */
  pendingShots: number[];
  /** 마지막으로 맞은 시각 (피격 반짝임 연출용) */
  hitAt: number;
  /** 보스 전용: 다음 발사 시각과 패턴 순번 */
  nextFireAt: number;
  pattern: number;
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 보스 탄은 모양·상한이 다르다 */
  fromBoss?: boolean;
}

export interface PowerUp {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
}

export interface Player {
  x: number;
  y: number;
  alive: boolean;
  /** 죽은 뒤 다시 나타나는 시각 */
  respawnAt: number;
  invincibleUntil: number;
  fireCooldown: number;
  shield: boolean;
  rapidUntil: number;
  doubleUntil: number;
}

export interface PendingDive {
  enemyId: number;
  at: number;
}

export interface GameState {
  phase: GamePhase;
  /** 일시정지 해제 시 돌아갈 단계 */
  resumePhase: GamePhase;
  /** waveIntro·waveClear가 끝나는 시각 */
  phaseUntil: number;
  /** 게임 시간(일시정지 중에는 멈춘다) */
  time: number;
  score: number;
  highScore: number;
  lives: number;
  wave: number;
  player: Player;
  enemies: Enemy[];
  playerBullets: Bullet[];
  enemyBullets: Bullet[];
  powerUps: PowerUp[];
  pendingDives: PendingDive[];
  nextDiveAt: number;
  lastDropAt: number;
  /** 마지막 목숨을 잃었을 때 GAME OVER로 넘어가는 시각 (없으면 null) */
  gameOverAt: number | null;
  nextId: number;
  /** 결정적 난수 상태 (같은 시드 + 같은 입력 = 같은 결과) */
  rng: number;
}

export interface InputSnapshot {
  /** -1 왼쪽, 0 정지, 1 오른쪽 */
  move: -1 | 0 | 1;
  fire: boolean;
}

export type GameEvent =
  | { type: "waveStarted"; wave: number; boss: boolean }
  | { type: "waveCleared"; wave: number; bonus: number }
  | { type: "playerShot" }
  | { type: "enemyHit"; id: number; kind: EnemyKind; x: number; y: number }
  | { type: "enemyKilled"; id: number; kind: EnemyKind; x: number; y: number; points: number }
  | { type: "enemyDived"; id: number }
  | { type: "playerHit"; x: number; y: number }
  | { type: "shieldBlocked"; x: number; y: number }
  | { type: "playerRespawned" }
  | { type: "powerUpSpawned"; kind: PowerUpKind }
  | { type: "powerUpCollected"; kind: PowerUpKind; x: number; y: number }
  | { type: "gameOver"; score: number };
