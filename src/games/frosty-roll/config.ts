/*
 * Frosty Roll 밸런스 값. 물리·눈덩이·점수·아이템·적·보스 수치는 여기서만 바꾼다.
 * 단위: 픽셀(px), 초(s). 화면은 512×288 고정(위 32px는 HUD), 지도는 32×16 타일(16px).
 */

export const TILE = 16;
export const MAP_COLS = 32;
export const MAP_ROWS = 16;
export const SCREEN_W = 512;
export const SCREEN_H = 288;
/** 지도가 화면에서 시작하는 y (위쪽 HUD 아래) */
export const HUD_H = 32;
export const WORLD_W = MAP_COLS * TILE;
export const WORLD_H = MAP_ROWS * TILE;

export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;

export const GRAVITY = 980;
export const MAX_FALL = 420;

export const PLAYER = {
  w: 12,
  h: 15,
  speed: 72,
  /** Speed Boots 효과 중 */
  fastSpeed: 100,
  accel: 900,
  jumpVelocity: 380,
  coyote: 0.08,
  jumpBuffer: 0.1,
  lives: 3,
  maxLives: 5,
  /** 피격 후 무적 */
  invulnerable: 2,
  /** 스테이지 시작 무적 */
  startInvulnerable: 1.5,
  hurtTime: 0.45,
};

export const SHOT = {
  speed: 230,
  life: 0.36,
  /** 살짝 아래로 휘는 궤적 */
  gravity: 160,
  cooldown: 0.3,
  rapidCooldown: 0.15,
  maxOnScreen: 3,
  rapidMaxOnScreen: 5,
  w: 6,
  h: 6,
};

export const SNOW = {
  /** 눈덩이가 되기까지 필요한 명중 수 (0% → 33% → 66% → 100%) */
  hitsToFreeze: 3,
  /** Giant Flake 효과 중 한 번에 쌓이는 양 */
  giantHit: 2,
  /** 마지막 명중 후 이 시간이 지나면 한 단계씩 녹는다 */
  decayDelay: 2.6,
  decayStep: 1.2,
  /** 눈이 쌓인 단계별 이동 속도 배율 (1단계, 2단계는 거의 멈춤) */
  slowFactor: [1, 0.5, 0.15],
  /** 2단계(66%)부터는 몸이 굳어 닿아도 피해가 없다 */
  harmlessLevel: 2,
};

export const BALL = {
  size: 18,
  /** 그대로 두면 이 시간 뒤 적이 탈출 (강화 적은 enhancedEscape) */
  escapeTime: 6.5,
  enhancedEscape: 5.2,
  /** 탈출 경고: 이 비율에서 금 1단계, 2단계, 마지막 1초는 흔들림 */
  crack1: 0.55,
  crack2: 0.78,
  /** 굴러가는 속도 (최우선 손맛: 빠르고 시원하게) */
  rollSpeed: 260,
  /** 벽에 부딪혀 방향을 바꾸는 최대 횟수. 다음 벽에서 부서진다 */
  maxBounces: 2,
  maxRollTime: 7,
  /** 걸어서 밀 때 속도 */
  pushSpeed: 30,
  /** 차기 판정: 몸 앞쪽 이 거리 안 */
  kickReach: 6,
  kickCooldown: 0.25,
  /** 탈출한 적의 화난 상태 */
  angryTime: 4,
  angryScale: 1.6,
};

/** 한 눈덩이로 n번째 적을 쓰러뜨릴 때의 점수 (n ≥ 5는 마지막 값) */
export const CHAIN_POINTS = [500, 1000, 2000, 4000, 8000];
export const POINTS = {
  snowHit: 10,
  freeze: 100,
  /** 눈덩이가 부서질 때 안에 갇힌 적 */
  contained: 300,
  bossHit: 3000,
  bossDefeat: 20000,
  candy: 2000,
  gem: 5000,
  itemPickup: 200,
  stageClear: 1000,
  /** 시간 보너스: 최대값에서 초당 감소 */
  timeBonusMax: 3000,
  timeBonusPerSecond: 30,
};

/** 연쇄 수 이상이면 보너스 아이템 */
export const BONUS = { candyChain: 3, gemChain: 4 };

export type ItemKind = "boots" | "rapid" | "giant" | "shield" | "life";
export type BonusKind = "candy" | "gem";

export const ITEMS = {
  dropChance: 0.22,
  /** 스테이지당 최대 아이템 수 (보너스 별사탕·보석 제외) */
  perStage: 3,
  /** 아이템 사이 최소 간격 */
  cooldown: 9,
  /** 바닥에 놓인 뒤 사라지기까지 (마지막 3초 깜빡임) */
  life: 9,
  duration: 15,
  weights: { boots: 26, rapid: 26, giant: 22, shield: 18, life: 8 } as Record<ItemKind, number>,
  size: 12,
};

export type EnemyKind = "imp" | "hopper" | "bat" | "runner";

export const ENEMY: Record<EnemyKind, { w: number; h: number; speed: number }> = {
  imp: { w: 14, h: 14, speed: 36 },
  hopper: { w: 14, h: 15, speed: 55 },
  bat: { w: 14, h: 10, speed: 42 },
  runner: { w: 13, h: 14, speed: 82 },
};

export const AI = {
  /** 판단 주기 (위층으로 점프할지 등) */
  thinkInterval: 1.4,
  /** 발판 끝에서 그냥 떨어질 확률 (Imp) */
  impDropChance: 0.4,
  /** 플레이어가 아래에 있을 때 Runner가 떨어질 확률 */
  runnerDropChance: 0.35,
  hopInterval: [0.9, 1.5] as const,
  hopVelocity: 330,
  jumpVelocity: 380,
  /** 이 시간 동안 거의 움직이지 않으면 방향을 바꾸거나 뛴다 (끼임 방지) */
  stuckTime: 2.2,
};

export const BOSS = {
  w: 28,
  h: 34,
  hp: 3,
  speed: 30,
  invulnerable: 1.3,
  attackInterval: 4.2,
  telegraph: 0.8,
  gearSpeed: 95,
  gearSize: 10,
  spawnInterval: 6.5,
  maxMinions: 2,
  maxSpawned: 14,
  dyingTime: 2.2,
};

export const PHASE = {
  intro: 1.8,
  clear: 2.8,
  /** 마지막 목숨을 잃은 뒤 게임 오버 화면까지 */
  dying: 1.4,
};

/** 화면 흔들림 (설정에서 끌 수 있음) */
export const SHAKE = { chain2: 1.5, chain4: 2.5, boss: 3, time: 0.18 };

export const STORAGE_KEYS = {
  best: "my-game-hub:frosty-roll:high-score",
  checkpoint: "my-game-hub:frosty-roll:checkpoint",
  sfx: "my-game-hub:frosty-roll:sound",
  music: "my-game-hub:frosty-roll:music",
  shake: "my-game-hub:frosty-roll:shake",
  easyPush: "my-game-hub:frosty-roll:easy-push",
};

/** 체크포인트: 이 스테이지(0부터)를 깨면 고급 구간(다음 스테이지)부터 시작할 수 있다 */
export const CHECKPOINT_AFTER = 1;
