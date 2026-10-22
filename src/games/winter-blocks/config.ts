/**
 * Winter Blocks 밸런스·규칙 설정.
 * 게임 로직(logic/)은 이 값만 참조하므로 난이도 조정은 이 파일만 수정하면 된다. (시간 단위: 초)
 */

/** 게임 설명에 반드시 들어가는 핵심 규칙 문장 (시작 화면·HOW TO PLAY·게임 소개) */
export const RULE_SENTENCE = "블록이 착지하면 위쪽에 새로운 블록이 생성됩니다. 겨울의 방해 요소를 극복하고 최대한 많은 줄을 완성하세요!";

export interface LevelInfo {
  level: number;
  name: string;
  /** 이 레벨에 들어가는 누적 제거 줄 수 */
  lines: number;
  /** 한 칸 자연 낙하 간격(초) */
  gravity: number;
  /** 레벨업 때 화면에 보여 주는 새 규칙 안내 */
  rule: string;
}

export const LEVELS: readonly LevelInfo[] = [
  { level: 1, name: "Snow Bump", lines: 0, gravity: 1.1, rule: "블록이 착지하면 위쪽에 혹이 1칸 생깁니다" },
  { level: 2, name: "Double Snow", lines: 5, gravity: 1.0, rule: "가끔(25%) 혹이 2칸 생깁니다" },
  { level: 3, name: "Frozen Block", lines: 12, gravity: 0.9, rule: "얼음 칸이 섞인 줄은 금이 간 뒤 다음 차례에 사라집니다" },
  { level: 4, name: "Winter Wind", lines: 20, gravity: 0.8, rule: "예고된 바람이 떨어지는 블록을 한 칸 밉니다" },
  { level: 5, name: "Snowfall", lines: 30, gravity: 0.72, rule: "표시된 열 위에 눈 블록이 쌓입니다" },
  { level: 6, name: "Blizzard", lines: 42, gravity: 0.65, rule: "모든 겨울 방해 요소가 함께 찾아옵니다" },
];

export const GAME_CONFIG = {
  cols: 10,
  /** 보이는 줄 수 */
  visibleRows: 20,
  /** 보이는 판 위의 생성 영역(숨김) 줄 수 */
  hiddenRows: 2,

  /** 낙하 간격 하한 (Level 6 값) */
  minGravity: 0.65,
  /** 아래 키를 누르고 있을 때 한 칸 내려가는 간격 */
  softDropInterval: 0.04,
  /** 바닥에 닿은 뒤 고정까지 기다리는 시간과, 이동·회전으로 다시 미룰 수 있는 최대 횟수 */
  lockDelay: 0.5,
  maxLockResets: 15,
  /** 길게 누를 때 반복 이동: 첫 반복까지(DAS)와 이후 간격(ARR) */
  das: 0.17,
  arr: 0.05,

  /** 블록이 고정된 뒤 혹 생성 연출을 보여 주는 시간 */
  settleTime: 0.18,
  /** 줄 제거 연출 시간 */
  clearTime: 0.3,

  bump: {
    /** Level 2부터 두 번째 혹을 시도할 확률 */
    secondChance: 0.25,
    secondFromLevel: 2,
  },
  hazards: {
    /** 얼음: Level 3부터, 블록 6개 고정당 최대 1칸 */
    iceFromLevel: 3,
    iceEvery: 6,
    /** 바람: Level 4부터, 블록 5개 배치당 최대 1회, 2초 이상 예고 */
    windFromLevel: 4,
    windEvery: 5,
    windWarning: 2.0,
    /** 눈 블록: Level 5부터, 블록 7개 배치마다 1칸 (한 블록 동안 미리 표시한 뒤 다음 고정 때 생성) */
    snowFromLevel: 5,
    snowEvery: 7,
    /** 눈 블록이 생길 수 없는 위쪽 줄 수 (보이는 판 기준). 새 블록 생성 영역을 막지 않기 위함 */
    snowSafeRows: 4,
    /** 방해 효과(얼음·바람·눈)가 한 번 일어난 뒤 다른 방해 효과를 쉬는 블록 수 */
    cooldown: 2,
  },

  score: {
    /** 동시에 지운 줄 수별 기본 점수 (× 레벨) */
    lines: [0, 100, 300, 500, 800],
    /** 연속 줄 제거 콤보: 50 × 콤보 × 레벨 */
    combo: 50,
    softDropPerCell: 1,
    hardDropPerCell: 2,
  },

  bestScoreStorageKey: "my-game-hub:winter-blocks:high-score",
  sfxStorageKey: "my-game-hub:winter-blocks:sound",
  musicStorageKey: "my-game-hub:winter-blocks:music",
  trackStorageKey: "my-game-hub:winter-blocks:track",
} as const;

export const TOTAL_ROWS = GAME_CONFIG.visibleRows + GAME_CONFIG.hiddenRows;

export function levelForLines(lines: number): LevelInfo {
  let current = LEVELS[0];
  for (const info of LEVELS) if (lines >= info.lines) current = info;
  return current;
}

export function gravityFor(level: number): number {
  const info = LEVELS[Math.min(Math.max(level, 1), LEVELS.length) - 1];
  return Math.max(info.gravity, GAME_CONFIG.minGravity);
}
