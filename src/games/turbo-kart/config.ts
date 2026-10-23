import type { Difficulty, DriverId, ItemId } from "./types";

/*
 * Turbo Kart 밸런스 값. 숫자는 여기서만 바꾼다(트랙 모양·배치는 tracks.ts).
 * 게임 페이지 설명(src/data/games.ts)의 수치도 이 파일과 일치해야 한다.
 */

export const RACE = {
  laps: 3,
  countdown: 3,
  fixedDt: 1 / 60,
  /** 충돌 검사를 위해 한 스텝을 나누는 수 */
  substeps: 2,
  /** 체크포인트 수 (출발선 포함) */
  checkpoints: 12,
} as const;

export const KART = {
  radius: 13,
  /** 기본 최고 속도 (px/s). 플레이어와 AI가 같다. */
  maxSpeed: 400,
  accel: 300,
  brake: 560,
  reverseMax: 120,
  /** 가속 페달을 떼었을 때 감속 비율 (초당) */
  coastDrag: 0.55,
  /** 조향 각속도 (rad/s). refSpeed보다 느리면 비례해서 줄어든다. */
  turnRate: 2.7,
  turnRefSpeed: 170,
  /** 옆미끄러짐을 줄이는 접지력 (초당 감쇠) */
  grip: 11,
  driftGrip: 2.4,
  driftTurnScale: 1.45,
} as const;

export const SURFACES = {
  road: { maxSpeed: 1, grip: 1, drag: 0 },
  /** Green Valley 지름길 흙길 */
  dirt: { maxSpeed: 0.9, grip: 0.85, drag: 0.15 },
  /** Desert Canyon 모래 구간 */
  sand: { maxSpeed: 0.72, grip: 0.55, drag: 0.6 },
  /** Frost Circuit 얼음 구간 */
  ice: { maxSpeed: 1, grip: 0.14, drag: 0 },
  offroad: { maxSpeed: 0.55, grip: 0.8, drag: 1.4 },
} as const;

export const COLLISION = {
  /** 벽·장애물에 부딪혔을 때 남는 속도 비율 */
  wallKeep: 0.5,
  restitution: 0.25,
  kartRestitution: 0.35,
} as const;

export const DRIFT = {
  /** 이 속도(최고 속도 대비) 이상, 조향 중, 드리프트 버튼일 때만 드리프트 */
  minSpeedRatio: 0.5,
  /** 실제로 옆으로 미끄러지는 속도(px/s)가 이 이상일 때만 게이지 충전 */
  minSlip: 22,
  chargePerSecond: 40,
  /** 벽에 부딪힌 뒤 충전이 멈추는 시간 */
  wallPause: 0.8,
} as const;

export const BOOSTER = {
  duration: 2,
  speedScale: 1.3,
  accelScale: 1.8,
  /** 끝난 뒤 다시 충전되기까지 */
  cooldown: 1,
  /** 부스터·Turbo Boost·Speed Wind를 함께 써도 넘지 않는 최고 속도 배율 */
  maxCombinedScale: 1.42,
} as const;

export const ITEM_FX = {
  turboTime: 3,
  turboSpeedScale: 1.25,
  turboAccelScale: 1.8,
  windTime: 5,
  windAccelScale: 1.6,
  windSpeedScale: 1.05,
  shieldTime: 5,
  snowBombSpeed: 760,
  snowBombLife: 1.1,
  snowSlowTime: 2,
  slowSpeedScale: 0.55,
  rocketSpeed: 640,
  rocketTurn: 4.2,
  rocketLife: 6,
  rocketSlowTime: 2.5,
  rocketSpinTime: 1,
  oilLife: 8,
  oilRadius: 22,
  oilSpinTime: 1.1,
  smokeTime: 3,
  /** 연막이 닿는 뒤쪽 거리 (진행 거리 기준) */
  smokeRange: 600,
  projectileRadius: 9,
  /** 공격을 맞은 뒤 다음 공격을 받지 않는 보호 시간 */
  protectTime: 2.5,
  boxRespawn: 4,
  boxRadius: 14,
} as const;

/**
 * 순위별 아이템 획득 확률 (%). 각 열의 합은 100.
 * 쓸 대상이 없는 아이템(1위의 Snow Bomb·Homing Rocket, 4위의 Oil Slick·Smoke Screen)은 뽑을 때 제외하고 나머지 비율로 다시 나눈다.
 */
export const ITEM_ODDS: Record<ItemId, [number, number, number, number]> = {
  turboBoost: [10, 20, 25, 25],
  snowBomb: [5, 15, 15, 10],
  shield: [25, 15, 10, 5],
  oilSlick: [25, 10, 5, 5],
  homingRocket: [0, 10, 20, 25],
  speedWind: [10, 15, 15, 20],
  smokeScreen: [15, 5, 5, 5],
  quickRepair: [10, 10, 5, 5],
};

/** 앞 순위 카트가 있어야 쓸 수 있는 아이템 / 뒤 순위 카트가 있어야 쓸 수 있는 아이템 */
export const NEEDS_TARGET_AHEAD: readonly ItemId[] = ["snowBomb", "homingRocket"];
export const NEEDS_TARGET_BEHIND: readonly ItemId[] = ["oilSlick", "smokeScreen"];

export interface DifficultyConfig {
  id: Difficulty;
  name: string;
  nameKo: string;
  /** 줄마다 아이템 상자 수 */
  boxesPerRow: number;
  /** 미끄러운 구간 길이 배율 */
  slipperyScale: number;
  /** 부스터·방어 아이템(Turbo Boost·Speed Wind·Shield·Quick Repair) 확률 배율 */
  helpfulItemScale: number;
  /** 이 등급까지의 장애물을 배치 (tracks.ts의 tier) */
  obstacleTiers: readonly ("easy" | "normal" | "hard")[];
}

export const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  easy: { id: "easy", name: "Easy", nameKo: "쉬움", boxesPerRow: 4, slipperyScale: 0.5, helpfulItemScale: 1.4, obstacleTiers: ["easy"] },
  normal: { id: "normal", name: "Normal", nameKo: "보통", boxesPerRow: 3, slipperyScale: 1, helpfulItemScale: 1, obstacleTiers: ["easy", "normal"] },
  hard: { id: "hard", name: "Hard", nameKo: "어려움", boxesPerRow: 2, slipperyScale: 1.5, helpfulItemScale: 0.6, obstacleTiers: ["easy", "normal", "hard"] },
};

export const HELPFUL_ITEMS: readonly ItemId[] = ["turboBoost", "speedWind", "shield", "quickRepair"];

export const RECOVERY = {
  /** 이 시간 동안 진행 거리가 늘지 않으면 막힌 것으로 보고 복구 */
  stuckSeconds: 3,
  stuckDistance: 40,
  /** 복구 후 멈춰 있는 시간 (시간 손실) */
  freeze: 1.5,
  wrongWaySeconds: 1,
} as const;

export interface DriverConfig {
  id: DriverId;
  name: string;
  nameKo: string;
  color: string;
  dark: string;
  style: string;
}

export const DRIVERS: Record<DriverId, DriverConfig> = {
  player: { id: "player", name: "YOU", nameKo: "플레이어", color: "#22d3ee", dark: "#0e7490", style: "플레이어" },
  bolt: { id: "bolt", name: "Bolt", nameKo: "볼트", color: "#ef4444", dark: "#991b1b", style: "공격형" },
  luna: { id: "luna", name: "Luna", nameKo: "루나", color: "#a78bfa", dark: "#5b21b6", style: "안정형" },
  dash: { id: "dash", name: "Dash", nameKo: "대시", color: "#facc15", dark: "#a16207", style: "도전형" },
};

export const ITEMS: Record<ItemId, { name: string; nameKo: string; short: string; description: string }> = {
  turboBoost: { name: "Turbo Boost", nameKo: "터보 부스트", short: "TB", description: "3초간 가속 (부스터 게이지와 별개)" },
  snowBomb: { name: "Snow Bomb", nameKo: "스노 봄", short: "SB", description: "앞으로 던져 맞은 카트를 2초간 감속" },
  shield: { name: "Shield", nameKo: "실드", short: "SH", description: "공격 1회 방어 (최대 5초)" },
  oilSlick: { name: "Oil Slick", nameKo: "오일 슬릭", short: "OIL", description: "뒤에 8초간 미끄럼 함정 설치" },
  homingRocket: { name: "Homing Rocket", nameKo: "호밍 로켓", short: "RKT", description: "바로 앞 순위 카트를 추적해 감속" },
  speedWind: { name: "Speed Wind", nameKo: "스피드 윈드", short: "WND", description: "5초간 가속력 증가" },
  smokeScreen: { name: "Smoke Screen", nameKo: "스모크 스크린", short: "SMK", description: "뒤쪽 경쟁자의 시야를 3초간 가림" },
  quickRepair: { name: "Quick Repair", nameKo: "퀵 리페어", short: "FIX", description: "감속·미끄럼·연막 상태 즉시 해제" },
};

export const STORAGE_KEYS = {
  records: "my-game-hub:turbo-kart:records",
  sfx: "my-game-hub:turbo-kart:sound",
  music: "my-game-hub:turbo-kart:music",
} as const;
