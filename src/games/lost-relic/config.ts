/**
 * Lost Relic 밸런스·규칙 설정.
 * 게임 로직(logic/)은 이 값만 참조하므로 난이도 조정은 이 파일만 수정하면 된다.
 * (시간 단위: 초, 거리 단위: 내부 해상도 픽셀, 속도 단위: 초당 픽셀)
 */
export const GAME_CONFIG = {
  /** 내부 해상도(16:9). 실제 화면 크기는 CSS(aspect-video)로 맞춘다. */
  width: 640,
  height: 360,
  tile: 20,
  cols: 32,
  rows: 18,

  maxHealth: 3,

  player: {
    /** 충돌 상자. 그림(20×30)보다 조금 작게 잡아 억울한 충돌을 줄인다. */
    width: 12,
    height: 28,
    runSpeed: 115,
    groundAccel: 1500,
    airAccel: 950,
    friction: 1900,
    gravity: 1300,
    /** 점프 최고 높이 약 58px(2.9칸): 2칸 높이 턱을 넘고 3칸 틈을 건널 수 있다. */
    jumpSpeed: 390,
    /** 점프 키를 일찍 떼면 상승 속도를 이 비율로 줄인다(낮은 점프). */
    jumpCut: 0.4,
    maxFall: 430,
    coyoteTime: 0.09,
    jumpBuffer: 0.12,
    climbSpeed: 95,
    /** 사다리에서 옆으로 내릴 때 이 거리 안의 발판에 발을 맞춘다(끼임 방지). */
    ladderSnap: 9,
    hurtInvincibility: 1.5,
    hurtStun: 0.3,
    knockbackX: 130,
    knockbackY: 210,
    /** 상자 열기·조사 동작 시간 */
    interactTime: 0.3,
    /** 조사 가능한 거리 (플레이어 중심 ↔ 오브젝트 중심, 가로) */
    interactRange: 24,
  },

  /** 방 전환 페이드 */
  transition: { fadeOut: 0.2, fadeIn: 0.25 },
  /** 방에 들어온 직후 피격 보호 시간 */
  roomEntrySafeTime: 1.0,
  /** 상자 뚜껑이 열리는 시간. 다 열린 뒤 아이템이 나온다. */
  chestOpenTime: 0.45,
  messageTime: 2.8,
  /** 체력 0 → GAME OVER 화면까지 */
  deathDelay: 1.3,

  statue: { width: 18, height: 36, pushSpeed: 48, plateSnap: 6 },

  traps: {
    /** 가시: 숨음 → 경고(살짝 올라옴, 무해) → 솟음(피해) 순서로 반복 */
    spikeHidden: 1.3,
    spikeWarn: 0.45,
    spikeUp: 1.0,
    /** 가시 묶음마다 주기를 이만큼 어긋나게 한다 */
    spikeGroupOffset: 0.8,
    /** 무너지는 바닥: 밟은 뒤 무너지기까지, 무너진 뒤 복구까지 */
    crumbleDelay: 0.55,
    crumbleRespawn: 3.0,
    crusher: { upHold: 1.4, shake: 0.5, dropSpeed: 420, downHold: 0.7, riseSpeed: 75, width: 30, height: 28 },
    /** 유물을 든 뒤 유물의 방 천장에서 떨어지는 돌 */
    rock: { interval: 1.25, warn: 0.85, gravity: 700, maxSpeed: 340, size: 14, startY: 62 },
  },

  enemies: {
    snake: { speed: 36, width: 18, height: 10, restTime: 0.5 },
    bat: { speed: 48, width: 14, height: 10, waveSpeed: 2.3 },
    guardian: {
      speed: 36,
      chaseSpeed: 66,
      width: 16,
      height: 34,
      /** 가로 이 거리 안, 같은 층에서 바라보는 방향에 플레이어가 있으면 발견 */
      sightRange: 120,
      alertTime: 0.45,
      /** 이 거리보다 멀어지면 추격을 멈춘다 */
      loseRange: 170,
    },
  },

  score: { coin: 100, secret: 500, puzzle: 300, relic: 1000, clear: 2000 },

  /** 진행 상황 자동 저장 간격(방 이동·아이템 획득 때는 즉시 저장) */
  autosaveInterval: 10,

  saveStorageKey: "my-game-hub:lost-relic:save",
  bestScoreStorageKey: "my-game-hub:lost-relic:best-score",
  bestTimeStorageKey: "my-game-hub:lost-relic:best-time",
  sfxStorageKey: "my-game-hub:lost-relic:sound",
  musicStorageKey: "my-game-hub:lost-relic:music",
} as const;

export const TILE = GAME_CONFIG.tile;
