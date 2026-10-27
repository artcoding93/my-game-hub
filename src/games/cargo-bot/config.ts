/*
 * Cargo Bot 설정 값. 화면·입력·애니메이션·저장 키는 여기서만 바꾼다(퍼즐 규칙은 logic/engine.ts).
 */

export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** 보드 한 칸의 내부 해상도(px). 캔버스는 스테이지 크기에 맞춰 칸 수 × TILE로 만들고 CSS로 확대한다 */
export const TILE = 16;
/** 보드 둘레 여백(칸) */
export const BOARD_MARGIN = 0.5;

export const INPUT = {
  /** 키·버튼을 누르고 있을 때 연속 이동 시작까지 / 반복 간격 (초) */
  repeatDelay: 0.26,
  repeatInterval: 0.13,
} as const;

export const ANIM = {
  /** 로봇 한 칸 이동 */
  walk: 0.09,
  /** 상자 효과 이동(컨베이어·얼음) 한 칸 */
  slide: 0.06,
  /** 순간이동 사라짐·등장 */
  teleport: 0.16,
  /** 목표 도착 빛 */
  lamp: 0.5,
} as const;

/** 별 평가: 검증된 최소 밀기 수(par.pushes) 기준. 이동 수는 보조 지표로만 보여 준다 */
export function starsFor(pushes: number, parPushes: number): 1 | 2 | 3 {
  if (pushes <= parPushes) return 3;
  if (pushes <= Math.ceil(parPushes * 1.5)) return 2;
  return 1;
}

export const STORAGE_KEYS = {
  /** 진행 기록 (클리어·스테이지별 최고 기록·진행 중 상태) */
  progress: "my-game-hub:cargo-bot:progress",
  sfx: "my-game-hub:cargo-bot:sound",
  music: "my-game-hub:cargo-bot:music",
  /** 음량 단계 1~3 */
  volume: "my-game-hub:cargo-bot:volume",
} as const;

/** 힌트 탐색 상태 수 상한 (브라우저가 멈추지 않도록) */
export const HINT_MAX_STATES = 250_000;
