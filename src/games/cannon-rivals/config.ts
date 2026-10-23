import type { Difficulty, FieldId, ItemId } from "./types";

/*
 * Cannon Rivals 밸런스 값. 숫자는 여기서만 바꾼다.
 * 게임 페이지 설명(src/data/games.ts)의 수치도 이 파일과 일치해야 한다.
 */

/** 월드(캔버스 내부 해상도) 크기. 화면에는 CSS로 늘려 그린다. */
export const WORLD_W = 960;
export const WORLD_H = 540;

export const PHYSICS = {
  /** 중력 가속도 (px/s², 화면 좌표라 아래쪽이 +) */
  gravity: 320,
  /** 파워 100%일 때 발사 속도 (px/s) */
  maxSpeed: 640,
  /** 바람 1단계당 수평 가속도 (px/s²) */
  windAccelPerUnit: 5,
  /** 게임 진행 고정 스텝 (초) */
  fixedDt: 1 / 60,
  /** 한 스텝을 나누는 충돌 검사 단계 수 (1/240초마다 검사 → 최고 속도에서도 3px 이하 이동) */
  substeps: 4,
  /** 이보다 오래 날면 빗나간 것으로 처리 */
  maxFlightTime: 12,
  /** 포신 회전 중심(차체 바닥 기준 위로)과 포신 길이 */
  barrelPivotY: 12,
  barrelLength: 20,
} as const;

export const AIM_LIMITS = {
  minAngle: 5,
  maxAngle: 85,
  minPower: 10,
  maxPower: 100,
} as const;

export const TANK = {
  maxHp: 100,
  /** 포탄 직접 명중 판정 상자 (차체 가운데 기준) */
  hitHalfWidth: 14,
  hitHeight: 16,
  /** 지면에 닿는 궤도 반폭. 이 범위 아래 땅이 모두 사라져야 떨어진다. */
  footHalfWidth: 8,
  /** 시작 위치 아래를 평평하게 다지는 반폭 */
  padHalfWidth: 18,
} as const;

export const DAMAGE = {
  direct: 25,
  /** 폭발 범위 피해: 중심에서 splashMax, 가장자리에서 splashMin */
  splashMax: 20,
  splashMin: 5,
  /** 폭발 범위 피해가 미치는 거리 (폭발 중심 ↔ 차체 가운데) */
  splashRadius: 52,
  /** 지형을 깎는 폭발 반경 */
  craterRadius: 30,
  powerShellScale: 1.4,
  doubleShotScale: 0.6,
  barrierScale: 0.5,
  /** 낙하 피해: fallSafe(px) 이하 무피해, 그 위로는 px당 fallPerPx, fallMin~fallMax */
  fallSafe: 24,
  fallMin: 5,
  fallMax: 20,
  fallPerPx: 0.1,
} as const;

export const ITEM_RULES = {
  maxSlots: 3,
  repairAmount: 25,
  repairPerMatch: 2,
  windShieldScale: 0.3,
  /** Double Shot 두 번째 포탄: 발사 간격(초)과 파워 차이(%) */
  doubleShotDelay: 0.35,
  doubleShotPowerOffset: -3,
} as const;

export const ENERGY = {
  direct: 25,
  splash: 10,
  /** 이 값에 도달하면 아이템 1개 지급 (초과분 이월, 칸이 가득 차면 대기) */
  threshold: 100,
} as const;

/** 보급 상자: 앞 상자가 사라진 뒤 3~4턴마다 탱크 사이에 떨어진다. */
export const CRATE = {
  minTurns: 3,
  maxTurns: 4,
  halfSize: 9,
  /** 탱크에서 이 거리 이상 떨어진 곳에만 놓는다 */
  tankClearance: 80,
  fallSpeed: 70,
} as const;

export const ECONOMY = {
  winCoins: 100,
  loseCoins: 30,
  prices: {
    doubleShot: 80,
    powerShell: 70,
    repairKit: 100,
    windShield: 40,
    barrier: 80,
    aimAssist: 60,
  } satisfies Record<ItemId, number>,
} as const;

/** 랜덤 아이템 지급 확률 가중치 (에너지·보급 상자) */
export const ITEM_WEIGHTS: Record<ItemId, number> = {
  doubleShot: 16,
  powerShell: 18,
  repairKit: 14,
  barrier: 16,
  windShield: 18,
  aimAssist: 18,
};

/** 부분 탄도 가이드: 예상 비행 시간의 이 비율까지만 점선으로 보여 준다. */
export const GUIDE = {
  fraction: 0.3,
  /** 화면 밖으로 나가는 등 비행 시간을 알 수 없을 때 가이드 길이 상한(초) */
  fallbackSeconds: 1.2,
} as const;

/** 턴 진행 연출 시간 */
export const TIMING = {
  aiAim: 1.0,
  settle: 0.6,
} as const;

export interface FieldConfig {
  id: FieldId;
  name: string;
  nameKo: string;
  description: string;
  /** 바람 세기 범위 (절댓값) */
  windMax: number;
  /** 바람이 이보다 약하면 이 값으로 올린다 (0이면 무풍 가능) */
  windMinAbs: number;
  /** 턴마다 바람이 바뀌는 최대 폭 */
  windDrift: number;
  /** 시작 위치 x 범위 */
  playerX: readonly [number, number];
  aiX: readonly [number, number];
}

export const FIELDS: Record<FieldId, FieldConfig> = {
  greenHills: {
    id: "greenHills",
    name: "Green Hills",
    nameKo: "초록 언덕",
    description: "완만한 언덕과 약한 바람. 포격 연습에 알맞은 전장",
    windMax: 3,
    windMinAbs: 0,
    windDrift: 2,
    playerX: [110, 190],
    aiX: [770, 850],
  },
  desertCanyon: {
    id: "desertCanyon",
    name: "Desert Canyon",
    nameKo: "사막 협곡",
    description: "가운데 높은 바위 언덕과 중간 바람. 고각 포격이 유리한 구간이 있다",
    windMax: 6,
    windMinAbs: 1,
    windDrift: 3,
    playerX: [100, 170],
    aiX: [790, 860],
  },
  frozenRidge: {
    id: "frozenRidge",
    name: "Frozen Ridge",
    nameKo: "얼음 능선",
    description: "들쭉날쭉한 설산과 강한 바람. 지형이 무너져 떨어질 위험이 크다",
    windMax: 10,
    windMinAbs: 3,
    windDrift: 4,
    playerX: [100, 180],
    aiX: [780, 860],
  },
};

export interface DifficultyConfig {
  id: Difficulty;
  name: string;
  nameKo: string;
  /** 첫 발 조준 오차 표준편차 (각도°, 파워%) */
  sigmaAngle: number;
  sigmaPower: number;
  /** 다음 턴에 남은 오차를 줄이는 비율 (0~1, 클수록 빠르게 보정) */
  correction: number;
  /**
   * 매 턴 새로 더해지는 오차 (첫 발 표준편차에 대한 비율). 완벽한 명중 반복을 막는다.
   * 오차가 수렴하는 크기 ≈ jitter / √(1 − (1 − correction)²) × 첫 발 표준편차 (쉬움·보통·어려움 약 0.9·0.8·0.75배)
   */
  jitter: number;
  /** 후보 탐색 격자 (각도°, 파워%) */
  angleStep: number;
  powerStep: number;
  /** 아이템 사용 방식 */
  itemStrategy: "simple" | "situational" | "strategic";
}

export const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  easy: {
    id: "easy",
    name: "Easy",
    nameKo: "쉬움",
    sigmaAngle: 5.0,
    sigmaPower: 7.5,
    correction: 0.2,
    jitter: 0.55,
    angleStep: 5,
    powerStep: 5,
    itemStrategy: "simple",
  },
  normal: {
    id: "normal",
    name: "Normal",
    nameKo: "보통",
    sigmaAngle: 2.8,
    sigmaPower: 4.2,
    correction: 0.45,
    jitter: 0.68,
    angleStep: 5,
    powerStep: 4,
    itemStrategy: "situational",
  },
  hard: {
    id: "hard",
    name: "Hard",
    nameKo: "어려움",
    sigmaAngle: 1.65,
    sigmaPower: 2.4,
    correction: 0.7,
    jitter: 0.72,
    angleStep: 4,
    powerStep: 4,
    itemStrategy: "strategic",
  },
};

/** AI 한 번의 결정에서 시뮬레이션할 탄도 수 상한 (브라우저 멈춤 방지) */
export const AI_SIM_BUDGET = 520;

export const ITEMS: Record<ItemId, { name: string; nameKo: string; short: string; description: string; kind: "attack" | "support" | "defense" }> = {
  doubleShot: { name: "Double Shot", nameKo: "더블 샷", short: "x2", description: "포탄 2발 연속 발사, 각 60% 피해", kind: "attack" },
  powerShell: { name: "Power Shell", nameKo: "파워 셸", short: "PW", description: "이번 발사 피해 40% 증가", kind: "attack" },
  repairKit: { name: "Repair Kit", nameKo: "수리 키트", short: "+HP", description: "HP 25 회복 (경기당 2회)", kind: "defense" },
  barrier: { name: "Barrier", nameKo: "배리어", short: "BR", description: "다음 피격 피해 50% 감소", kind: "defense" },
  windShield: { name: "Wind Shield", nameKo: "윈드 실드", short: "WS", description: "이번 발사의 바람 영향 70% 감소", kind: "support" },
  aimAssist: { name: "Aim Assist", nameKo: "조준 보조", short: "AIM", description: "이번 발사의 예상 탄착 지점 표시", kind: "support" },
};

export const STORAGE_KEYS = {
  profile: "my-game-hub:cannon-rivals:profile",
  sfx: "my-game-hub:cannon-rivals:sound",
  music: "my-game-hub:cannon-rivals:music",
} as const;
