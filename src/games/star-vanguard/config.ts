import type { EnemyKind, PowerUpKind } from "./types";

/**
 * Star Vanguard 밸런스·규칙 설정.
 * 게임 로직(logic/)은 이 값만 참조하므로 난이도 조정은 이 파일만 수정하면 된다.
 * (시간 단위: 초, 거리 단위: 내부 해상도 픽셀, 속도 단위: 초당 픽셀)
 */
export const GAME_CONFIG = {
  /** 내부 해상도. 실제 화면 크기는 CSS(aspect-[3/4])로 맞춘다. */
  width: 240,
  height: 320,

  startingLives: 3,
  maxLives: 5,

  player: {
    y: 296,
    speed: 120,
    /** 화면 가장자리와의 최소 간격(우주선 중심 기준) */
    margin: 9,
    /** 피격 판정 반지름. 그림보다 작게 잡아 억울한 피격을 줄인다. */
    hitRadius: 4,
    fireInterval: 0.18,
    rapidFireInterval: 0.1,
    bulletSpeed: 300,
    /** 화면에 동시에 존재할 수 있는 플레이어 탄환 수 (Double Shot 중에는 2배) */
    maxBullets: 4,
    rapidMaxBullets: 6,
    /** Double Shot 두 탄환의 좌우 간격 */
    doubleShotSpread: 5,
    respawnDelay: 1.5,
    respawnInvincibility: 2.2,
    /** Shield가 공격을 막은 직후 무적 시간 */
    shieldInvincibility: 1,
    /** 마지막 목숨을 잃은 뒤 GAME OVER 화면까지 걸리는 시간 */
    gameOverDelay: 1.6,
  },

  enemies: {
    scout: { hp: 1, score: 100, halfWidth: 6, halfHeight: 6, diveDuration: 3.0, diveShots: [0.35], formationFireRate: 0.02, dropChance: 0.06 },
    interceptor: { hp: 1, score: 200, halfWidth: 7, halfHeight: 5, diveDuration: 1.9, diveShots: [0.3], formationFireRate: 0.03, dropChance: 0.1 },
    sentinel: { hp: 3, score: 400, halfWidth: 8, halfHeight: 7, diveDuration: 3.6, diveShots: [0.22, 0.38, 0.54], formationFireRate: 0.16, dropChance: 0.18 },
    core: { hp: 12, score: 1000, halfWidth: 14, halfHeight: 14, diveDuration: 0, diveShots: [], formationFireRate: 0, dropChance: 1 },
  } satisfies Record<EnemyKind, EnemyStats>,

  /** Command Core: 5웨이브마다 등장하는 보스 */
  boss: {
    /** 회차(5웨이브 묶음)마다 늘어나는 체력과 상한 */
    hpPerCycle: 6,
    maxHp: 40,
    patrolAmplitude: 70,
    patrolSpeed: 0.6,
    fireInterval: 2.2,
    minFireInterval: 1.2,
    /** 부채꼴 탄 수 (회차마다 +1, 상한) */
    fanBullets: 5,
    maxFanBullets: 7,
    /** 부채꼴 탄 사이 각도(도). 플레이어가 지나갈 틈이 생기도록 충분히 벌린다. */
    fanSpreadDeg: 17,
    /** 원형 탄 수 (아래쪽 반원에 고르게) */
    ringBullets: 7,
    /** 보스 탄은 일반 탄 상한에 더해 이만큼 더 허용한다. */
    extraBulletCap: 8,
  },

  formation: {
    top: 46,
    rowGap: 19,
    columnGap: 22,
    swayAmplitude: 18,
    swaySpeed: 0.8,
    /** 행마다 엇갈려 흔들리는 세로 물결 크기 */
    rippleAmplitude: 2,
  },

  entry: {
    /** 웨이브 시작 후 첫 적이 들어오기까지 */
    startDelay: 0.6,
    groupGap: 1.0,
    memberGap: 0.14,
    duration: 2.1,
    durationJitter: 0.25,
  },

  /** 급강하 후 화면 위에서 다시 나타나 편대 자리로 돌아가는 시간 */
  returnDuration: 1.5,

  /** 이 높이보다 아래(플레이어와 가까운 곳)에서는 적이 탄을 쏘지 않는다. 피할 시간이 없는 탄을 막는다. */
  noFireBelowY: 210,
  /** 적 탄이 아래쪽에서 벗어날 수 있는 최대 각도(도). 거의 수평으로 날아오는 탄을 막는다. */
  maxAimAngleDeg: 28,

  powerUps: {
    fallSpeed: 45,
    halfSize: 6,
    /** 아이템이 연달아 나오지 않도록 하는 최소 간격 (보스 드롭은 예외) */
    minInterval: 12,
    rapidDuration: 8,
    doubleDuration: 10,
    weights: { rapid: 35, double: 30, shield: 25, life: 10 } satisfies Record<PowerUpKind, number>,
  },

  score: {
    waveClear: 500,
    /** 5웨이브마다 생존 보너스 */
    survivalBonus: 1000,
    survivalEvery: 5,
  },

  timing: {
    waveIntro: 1.6,
    waveClear: 1.8,
  },

  highScoreStorageKey: "my-game-hub:star-vanguard:high-score",
  soundStorageKey: "my-game-hub:star-vanguard:sound",
  /** 배경음악 켜기(1)/끄기(0). 기본값은 꺼짐. */
  musicStorageKey: "my-game-hub:star-vanguard:music",
} as const;

export interface EnemyStats {
  hp: number;
  score: number;
  halfWidth: number;
  halfHeight: number;
  diveDuration: number;
  /** 급강하 진행률(0~1) 중 탄을 쏘는 지점 */
  diveShots: readonly number[];
  /** 편대에 있을 때 초당 발사 확률 */
  formationFireRate: number;
  /** 격추 시 아이템이 나올 확률 */
  dropChance: number;
}

/** 웨이브별 난이도. 모든 값에 상한이 있어 높은 웨이브에서도 피할 수 없는 탄막이 생기지 않는다. */
export function difficulty(wave: number) {
  const n = wave - 1;
  return {
    /** 이동(진입·급강하) 속도 배율 */
    speed: Math.min(1 + 0.05 * n, 1.6),
    /** 급강하 공격 간격 */
    diveInterval: Math.max(4.2 - 0.32 * n, 1.4),
    /** 한 번에 급강하하는 적 수 */
    diveGroup: Math.min(1 + Math.floor(wave / 2), 4),
    /** 동시에 급강하 중일 수 있는 최대 적 수 */
    maxDivers: Math.min(2 + wave, 7),
    /** 화면에 동시에 존재할 수 있는 적 탄 수 */
    bulletCap: Math.min(3 + wave, 12),
    bulletSpeed: Math.min(95 + 5 * n, 150),
    /** 편대 사격 확률 배율 */
    fireRate: Math.min(0.5 + 0.15 * n, 2),
    /** 조준 정확도 (0 = 수직 낙하, 1 = 플레이어 정조준). 초반 웨이브는 탄이 덜 정확하다. */
    aim: Math.min(0.35 + 0.15 * n, 1),
    /** 급강하 중 예정된 사격을 실제로 할 확률 */
    diveShotChance: Math.min(0.5 + 0.15 * n, 1),
  };
}

/** 보스 회차(1부터). 5웨이브 = 1회차, 10웨이브 = 2회차 ... */
export function bossCycle(wave: number) {
  return Math.ceil(wave / 5);
}

export function bossHp(wave: number) {
  const { hp } = GAME_CONFIG.enemies.core;
  return Math.min(hp + (bossCycle(wave) - 1) * GAME_CONFIG.boss.hpPerCycle, GAME_CONFIG.boss.maxHp);
}
