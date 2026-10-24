/*
 * Shadow of the Citadel (프로토타입) 밸런스 값. 물리·애니메이션 수치는 여기서만 바꾼다.
 * 단위: 월드 픽셀(px), 초(s). y축은 아래가 +.
 */

/** 타일 한 칸 크기 */
export const TILE = 32;

/** 물리 고정 스텝(1/120초). 렌더링 프레임 속도와 무관하게 같은 움직임을 만든다. */
export const FIXED_DT = 1 / 120;
/** 프레임이 크게 밀렸을 때 한 번에 따라잡는 최대 스텝 수 (탭 복귀 직후 순간이동 방지) */
export const MAX_STEPS_PER_FRAME = 12;

/** 캔버스 내부 해상도와 카메라 확대 배율 */
export const VIEW = {
  width: 960,
  height: 540,
  zoom: 1.6,
};

/** 충돌 상자: 발 위치(x 가운데, y 바닥)를 기준으로 한 직사각형 */
export const BODY = {
  halfWidth: 10,
  height: 76,
};

export const MOVE = {
  walkSpeed: 80,
  runSpeed: 210,
  walkAccel: 520,
  runAccel: 640,
  /** 걷기 속도 이하에서 방향키를 뗐을 때 */
  stopDecel: 950,
  /** 달리다가 Shift만 뗐을 때(걷기로 감속) */
  slowDownDecel: 520,
  /** 달리다가 방향키를 떼면 이 속도 이상일 때 미끄러지며 멈춘다 */
  skidThreshold: 130,
  skidDecel: 620,
  /** 이 속도 이상으로 달리다가 반대 방향을 누르면 제동 후 돌아선다 */
  turnThreshold: 120,
  turnDecel: 1050,
};

export const JUMP = {
  gravity: 1700,
  velocity: 520,
  /** 상승 중 점프 키를 떼면 중력 배율 (낮은 점프) */
  cutGravityScale: 2.2,
  maxFall: 950,
  /** 도약 준비(무릎 굽힘) 시간: 제자리 / 달리기 */
  prepStand: 0.1,
  prepRun: 0.06,
  /** 제자리 점프에서 방향키를 누르고 있으면 주는 최소 수평 속도 */
  standJumpSpeed: 60,
  coyote: 0.09,
  buffer: 0.12,
  airAccel: 650,
  airReverseAccel: 420,
  airMaxSpeed: 130,
};

export const LAND = {
  /** 착지 직전 낙하 속도 기준: 이상이면 중간 착지(짧은 경직), heavy 이상이면 큰 착지 */
  mediumImpact: 520,
  heavyImpact: 820,
  mediumTime: 0.16,
  heavyTime: 0.42,
  /** 중간 착지 때 남기는 수평 속도 비율 */
  mediumKeep: 0.65,
};

export const LEDGE = {
  /** 매달렸을 때 손(난간 윗면)에서 발까지의 높이 */
  hangDepth: 83,
  /** 매달렸을 때 벽면에서 몸 중심까지의 거리 */
  hangOffsetX: 11,
  /** 몸 앞면과 벽면 사이 허용 거리 (음수 = 이미 벽에 닿음) */
  reachMin: -3,
  reachMax: 14,
  /** 손 높이가 난간 윗면보다 이만큼 위 ~ 아래 사이일 때 잡는다 */
  windowAbove: 8,
  windowBelow: 20,
  /** 이 속도보다 빠르게 올라가는 중에는 잡지 않는다 */
  minVy: -80,
  /** 손을 놓은 뒤 다시 잡을 수 있을 때까지 */
  regrabDelay: 0.3,
  /** 매달린 뒤 올라오기를 받기 시작할 때까지 (잡는 동작이 보이도록) */
  climbDelay: 0.12,
  climbTime: 0.95,
  /** 올라온 뒤 벽면에서 몸 중심까지의 거리 */
  standX: 16,
};

/** 월드 아래로 이만큼 떨어지면 테스트 위치로 되돌린다 */
export const RESPAWN_MARGIN = 220;

export const CAMERA = {
  /** 진행 방향 여유 공간 (정지 / 최고 속도) */
  lookAheadMin: 36,
  lookAheadMax: 110,
  followX: 4.5,
  followY: 3.2,
  lookAheadRate: 2.2,
  /** 카메라 중심을 발보다 이만큼 위에 둔다 */
  focusAbove: 70,
  /** 점프 중에는 이 범위를 벗어날 때만 세로로 따라간다 */
  airDeadZoneUp: 90,
};

/** 디버그 패널에서 고를 수 있는 재생 속도 */
export const TIME_SCALES = [0.25, 0.5, 1, 1.5] as const;
