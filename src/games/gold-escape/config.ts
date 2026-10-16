/**
 * Gold Escape 밸런스·규칙 설정.
 * 게임 로직은 이 값만 참조하므로, 난이도 조정은 이 파일만 수정하면 된다.
 * (시간 단위: 초, 속도 단위: 초당 타일 수)
 */
export const GAME_CONFIG = {
  /** 렌더링 기준 타일 크기(px). 실제 화면 크기는 CSS로 맞춘다. */
  tileSize: 16,

  startingLives: 5,

  player: {
    speed: 6,
    fallSpeed: 9,
    /** 땅파기 쿨다운 */
    digCooldown: 0.35,
    /** 이동 중에 누른 땅파기 입력을 다음 칸 도착 시까지 유지하는 시간 */
    digBuffer: 0.25,
    /** 재시작 직후 무적 시간 */
    respawnInvincibility: 2,
  },

  guard: {
    /** 1회차 기본 이동 속도 (플레이어보다 느리게) */
    baseSpeed: 3.4,
    fallSpeed: 8,
    /** 구멍에 갇힌 뒤 스스로 기어 나오기까지 걸리는 시간 */
    trapDuration: 3,
    /** 소멸 후 다시 나타나기까지 걸리는 시간 */
    respawnDelay: 2.5,
    /** 리스폰 위치는 플레이어와 이 거리(맨해튼) 이상 떨어진 곳에서 고른다 */
    respawnMinDistance: 8,
    /** 경로 재계산 주기 (경비원마다 시작 시점을 엇갈리게 둔다) */
    repathInterval: 0.4,
    /** 다른 경비원에게 막혀 이 시간 이상 기다리면 겹쳐서 지나간다 (교착 방지) */
    maxBlockedWait: 1.2,
  },

  /** 회차가 오를 때마다 경비원 속도 배율: min(1 + (round - 1) * perRound, max) */
  roundSpeedUp: {
    perRound: 0.1,
    maxMultiplier: 1.5,
  },

  hole: {
    /** 구멍이 자동으로 메워지기까지 걸리는 시간 */
    lifetime: 5,
    /** 메워지기 전 경고 효과를 보여 주는 시간 */
    warningTime: 1,
  },

  score: {
    gold: 250,
    guardTrapped: 75,
    guardKilled: 75,
    stageClear: 1500,
  },

  timing: {
    /** 스테이지 시작 시 "ROUND n · STAGE n" 안내를 보여 주며 정지해 있는 시간 */
    stageIntro: 1.5,
    /** 사망 연출 시간 */
    dying: 1.5,
    /** 스테이지 클리어 안내 시간 */
    stageClear: 2.5,
  },

  highScoreStorageKey: "my-game-hub:gold-escape:high-score",
  /** 효과음·배경음악 켜기(1)/끄기(0). 기본값은 둘 다 꺼짐. 다른 게임과 겹치지 않는 게임별 키를 쓴다. */
  sfxStorageKey: "my-game-hub:gold-escape:sound",
  musicStorageKey: "my-game-hub:gold-escape:music",
} as const;

export function guardSpeedMultiplier(round: number): number {
  const { perRound, maxMultiplier } = GAME_CONFIG.roundSpeedUp;
  return Math.min(1 + (round - 1) * perRound, maxMultiplier);
}
