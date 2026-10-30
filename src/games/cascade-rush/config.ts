/**
 * Cascade Rush 밸런스·규칙 설정.
 * 게임 로직(logic/)은 이 값만 참조하므로 난이도 조정은 이 파일만 수정하면 된다. (시간 단위: 초)
 */

export const COLS = 6;
export const ROWS = 12;
/** 크리스털 색 수 (1~5) */
export const COLOR_COUNT = 5;
/** 새 크리스털 쌍이 나오는 열과 줄(축 위치, 짝은 그 위 칸). 두 칸 중 하나라도 막혀 있으면 Game Over */
export const SPAWN_X = 2;
export const SPAWN_Y = 1;
/** 같은 색이 이 수 이상 상하좌우로 이어지면 터진다 */
export const POP_SIZE = 3;

export interface SpeedLevel {
  level: number;
  /** 이 단계가 시작되는 실제 플레이 경과 시간 */
  from: number;
  /** 한 칸 자연 낙하 간격 */
  gravity: number;
}

/**
 * 낙하 속도 단계. 남은 시간이 아니라 "실제로 조작한 시간"으로 정하므로 시간 보너스를 받아도 느려지지 않는다.
 * gravity는 "칸당 낙하 간격"이므로 속도를 70%로 줄이려면 간격을 ÷0.7(약 1.43배) 한다. 첫 단계 0.8초 → 1.15초.
 * Rush: 40초마다 한 단계(단계마다 약 15%씩 빨라짐). Endless: 45초마다 한 단계(약 14%씩).
 */
export const RUSH_SPEEDS: readonly SpeedLevel[] = [
  { level: 1, from: 0, gravity: 1.15 },
  { level: 2, from: 40, gravity: 0.97 },
  { level: 3, from: 80, gravity: 0.82 },
  { level: 4, from: 120, gravity: 0.7 },
  { level: 5, from: 160, gravity: 0.6 },
];

export const ENDLESS_SPEEDS: readonly SpeedLevel[] = [
  { level: 1, from: 0, gravity: 1.15 },
  { level: 2, from: 45, gravity: 0.99 },
  { level: 3, from: 90, gravity: 0.85 },
  { level: 4, from: 135, gravity: 0.73 },
  { level: 5, from: 180, gravity: 0.63 },
  { level: 6, from: 225, gravity: 0.54 },
  { level: 7, from: 270, gravity: 0.46 },
];

export const GAME_CONFIG = {
  rush: {
    startTime: 120,
    maxTime: 150,
    /** 연쇄 시간 보너스: 큰 조건부터 검사해 하나만 준다 */
    bonuses: [
      { chain: 5, seconds: 5 },
      { chain: 3, seconds: 3 },
    ],
    /** 카운트다운 효과음이 나는 남은 시간 */
    countdownFrom: 10,
  },

  /** READY → GO 안내 시간 (타이머 정지) */
  readyTime: 1.4,
  /** ↓를 누르고 있을 때 한 칸 내려가는 간격 */
  softDropInterval: 0.035,
  /**
   * 바닥에 닿은 뒤 고정까지 기다리는 시간과, 이동·회전으로 다시 미룰 수 있는 최대 횟수.
   * 횟수는 쌍이 지금까지보다 더 낮은 줄에 닿았을 때만 다시 채워진다(회전으로 들어 올렸다 내리는 무한 지연 방지).
   */
  lockDelay: 0.6,
  maxLockResets: 10,
  /** 길게 누를 때 반복 이동: 첫 반복까지(DAS)와 이후 간격(ARR) */
  das: 0.16,
  arr: 0.06,

  /** 연쇄 연출 시간 (타이머 정지 구간): 터지기 전 반짝임, 중력 낙하(기본 + 칸당) */
  popTime: 0.42,
  dropBase: 0.1,
  dropPerCell: 0.045,
  /** 연쇄 단계 사이 잠깐 멈춤 (새 연결이 생겼는지 보이도록) */
  chainPause: 0.08,

  score: {
    /** 크리스털 1개 기본 점수 */
    perCrystal: 10,
    /** 연쇄 배율: 1연쇄 ×1, 2연쇄 ×2, 3연쇄 ×4, 4연쇄 ×8, 5연쇄 이상 ×16 (두 배씩, 상한 maxMultiplier) */
    maxMultiplier: 16,
    /** 그룹 크기 보너스: 3개 ×1, 4개 ×1.5, 5개 이상 ×2 (큰 것부터 검사) */
    sizeBonus: [
      { size: 5, multiplier: 2 },
      { size: 4, multiplier: 1.5 },
    ],
  },

  /** 연쇄 단계별 화면 흔들림 세기(px, 내부 해상도 기준). 설정에서 줄이거나 끌 수 있다 */
  shake: [0, 0, 1.5, 2.5, 3.5, 5],
} as const;

/** 연쇄 단계별 안내 문구 */
export function chainLabel(chain: number): string {
  if (chain >= 5) return "MEGA CASCADE!";
  return ["", "POP!", "NICE!", "GREAT CASCADE!", "AMAZING!"][chain] ?? "";
}

export function chainMultiplier(chain: number): number {
  return Math.min(2 ** Math.max(chain - 1, 0), GAME_CONFIG.score.maxMultiplier);
}

/** 그룹 하나의 크기 보너스 배율 */
export function sizeMultiplier(size: number): number {
  return GAME_CONFIG.score.sizeBonus.find((b) => size >= b.size)?.multiplier ?? 1;
}

/**
 * 한 연쇄 단계 점수 = Σ(그룹 크기 × 기본 점수 × 크기 보너스) × 연쇄 배율.
 * 동시에 터진 그룹은 각자 크기 보너스를 받고, 연쇄 배율은 단계마다 한 번만 곱한다.
 */
export function chainStepPoints(groupSizes: readonly number[], chain: number): number {
  const base = groupSizes.reduce((sum, size) => sum + size * GAME_CONFIG.score.perCrystal * sizeMultiplier(size), 0);
  return Math.round(base * chainMultiplier(chain));
}

/** 한 번의 연쇄에서 받는 시간 보너스 (가장 큰 것 하나) */
export function timeBonusFor(chain: number): number {
  return GAME_CONFIG.rush.bonuses.find((b) => chain >= b.chain)?.seconds ?? 0;
}

export type GameMode = "rush" | "endless";

export function speedFor(mode: GameMode, playTime: number): SpeedLevel {
  const table = mode === "rush" ? RUSH_SPEEDS : ENDLESS_SPEEDS;
  let current = table[0];
  for (const info of table) if (playTime >= info.from) current = info;
  return current;
}

export const STORAGE_KEYS = {
  records: "my-game-hub:cascade-rush:records",
  sound: "my-game-hub:cascade-rush:sound",
  music: "my-game-hub:cascade-rush:music",
  /** 화면 흔들림: 2 = 보통(기본), 1 = 약하게, 0 = 끔 */
  shake: "my-game-hub:cascade-rush:shake",
} as const;
