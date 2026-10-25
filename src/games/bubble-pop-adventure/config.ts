/*
 * Bubble Pop Adventure 밸런스 값. 물리·방울·점수·아이템·적·보스 수치는 여기서만 바꾼다.
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
  speed: 74,
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

export const BUBBLE = {
  /** 보통 방울 크기, Giant Bubble 크기, 적이 갇힌 방울 크기 */
  size: 16,
  giantSize: 24,
  captiveSize: 20,
  /** 발사: 이 시간 동안 앞으로 빠르게 날아간 뒤(약 5칸) 떠오르기 시작한다 */
  shotSpeed: 250,
  shotTime: 0.32,
  giantShotTime: 0.4,
  /** 막 쏜 방울은 이 시간 동안 플레이어에게 터지지 않는다 */
  grace: 0.25,
  cooldown: 0.32,
  rapidCooldown: 0.15,
  /** 떠오르는 속도·가속 */
  floatSpeed: 26,
  floatAccel: 110,
  /** 천장(또는 벽 아래)에 닿으면 스테이지의 모이는 지점(gatherX) 쪽으로 미끄러진다 */
  gatherSpeed: 22,
  /** 바람 스테이지: 바람 세기 1일 때 가로 속도 */
  windSpeed: 46,
  /** 빈 방울은 이 시간 뒤 저절로 터진다 (점수·연쇄 없음) */
  life: 9,
  /** 갇힌 적이 탈출하기까지 (강화 적은 enhancedEscape). warnAt 비율부터 깜빡이며 경고 */
  escapeTime: 7,
  enhancedEscape: 5.5,
  warnAt: 0.7,
  /** 화면에 있을 수 있는 방울 최대 수 (넘으면 가장 오래된 빈 방울이 터진다) */
  maxOnScreen: 16,
  /** 닿아 있는 방울이 차례로 터지는 간격 (연쇄) */
  chainDelay: 0.06,
  /** 두 방울 사이가 이 거리 이하로 붙어 있으면 연쇄로 함께 터진다 */
  chainGap: 4,
  /** 점프 키를 누른 채 위에서 밟으면 튕겨 오른다 (일시적인 발판) */
  bounceVelocity: 400,
  /** 발이 방울 윗면에서 이 거리 안으로 들어왔을 때만 밟은 것으로 본다 */
  bounceTolerance: 7,
  /** 밟힌 방울이 아래로 눌리는 속도 */
  bouncePush: 70,
};

/** 콤보: 이 시간 안에 다음 적을 없애면 콤보가 이어진다(닿은 방울 연쇄는 자동으로 이어짐) */
export const COMBO = { window: 0.7 };
/** 콤보 n번째 적의 점수 (n ≥ 5는 마지막 값) */
export const COMBO_POINTS = [500, 1000, 2000, 4000, 8000];
export const POINTS = {
  capture: 50,
  /** 빈 방울을 터뜨림 */
  pop: 10,
  candy: 500,
  gem: 2000,
  itemPickup: 200,
  lucky: 5000,
  bossHit: 2000,
  bossDefeat: 20000,
  stageClear: 1000,
  /** 시간 보너스: 최대값에서 초당 감소 */
  timeBonusMax: 3000,
  timeBonusPerSecond: 30,
};

/** 이 점수마다 목숨 +1 (최대 PLAYER.maxLives) */
export const EXTRA_LIFE_EVERY = 30000;

/** 적을 없애면 그 자리에 보너스(별사탕). 콤보가 이 수 이상이면 보석 */
export const BONUS = { gemCombo: 3, life: 8 };

export type ItemKind = "rapid" | "giant" | "shield" | "lucky" | "freeze";
export type BonusKind = "candy" | "gem";

export const ITEMS = {
  dropChance: 0.28,
  /** 스테이지당 최대 아이템 수 (보너스 별사탕·보석 제외) */
  perStage: 3,
  /** 아이템 사이 최소 간격 */
  cooldown: 8,
  /** 바닥에 놓인 뒤 사라지기까지 (마지막 3초 깜빡임) */
  life: 10,
  /** Rapid·Giant 효과 시간, Time Freeze 시간 */
  duration: 15,
  freezeTime: 5,
  weights: { rapid: 24, giant: 22, shield: 18, lucky: 18, freeze: 18 } as Record<ItemKind, number>,
  size: 12,
};

export type EnemyKind = "cogling" | "springlet" | "whirlwing" | "zipwind";

export const ENEMY: Record<EnemyKind, { w: number; h: number; speed: number }> = {
  cogling: { w: 14, h: 14, speed: 38 },
  springlet: { w: 14, h: 15, speed: 55 },
  whirlwing: { w: 14, h: 12, speed: 40 },
  zipwind: { w: 14, h: 12, speed: 84 },
};

export const AI = {
  /** 판단 주기 (위층으로 점프할지 등) */
  thinkInterval: 1.4,
  /** 발판 끝에서 그냥 떨어질 확률 (Cogling) */
  walkerDropChance: 0.4,
  /** 플레이어가 아래에 있을 때 Zipwind가 떨어질 확률 */
  runnerDropChance: 0.35,
  hopInterval: [0.9, 1.5] as const,
  hopVelocity: 330,
  jumpVelocity: 380,
  /** 비행 요정의 세로 속도 비율 (대각선 비행) */
  flyerRise: 0.7,
  /** 이 시간 동안 거의 움직이지 않으면 방향을 바꾸거나 뛴다 (끼임 방지) */
  stuckTime: 2.2,
  /** 방울에서 탈출한 적이 화난 시간과 속도 배율 */
  angryTime: 5,
  angryScale: 1.5,
};

export const BOSS = {
  w: 32,
  h: 30,
  hp: 6,
  speed: 34,
  /** 떠 있는 높이(위쪽 y)와 위아래 흔들림 */
  baseY: 44,
  bob: 12,
  invulnerable: 0.5,
  attackInterval: 4.4,
  telegraph: 0.9,
  noteSpeed: 82,
  noteSize: 8,
  /** 부채꼴로 쏘는 음표 수와 사이 각도 */
  notes: 3,
  noteSpread: 0.38,
  spawnInterval: 5,
  maxMinions: 2,
  maxSpawned: 24,
  dyingTime: 2.2,
  /** 잡은 적을 터뜨리면 나오는 별빛 조각: 여왕에게 날아가 1 피해 */
  sparkSpeed: 210,
  sparkTurn: 9,
  sparkLife: 3.5,
};

export const PHASE = {
  intro: 1.8,
  /** 클리어 후 남은 보너스를 주울 수 있는 시간 */
  clear: 3,
  /** 마지막 목숨을 잃은 뒤 게임 오버 화면까지 */
  dying: 1.4,
};

/** 화면 흔들림 (설정에서 끌 수 있음) */
export const SHAKE = { combo2: 1.5, combo4: 2.5, boss: 3, time: 0.18 };

export const STORAGE_KEYS = {
  best: "my-game-hub:bubble-pop-adventure:high-score",
  checkpoint: "my-game-hub:bubble-pop-adventure:checkpoint",
  sfx: "my-game-hub:bubble-pop-adventure:sound",
  music: "my-game-hub:bubble-pop-adventure:music",
  shake: "my-game-hub:bubble-pop-adventure:shake",
};

/** 체크포인트: 이 스테이지(0부터)를 깨면 고급 구간(다음 스테이지)부터 시작할 수 있다 */
export const CHECKPOINT_AFTER = 1;
