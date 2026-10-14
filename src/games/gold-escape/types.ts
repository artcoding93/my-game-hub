/** 지형 타일. 금괴·캐릭터는 지형이 아니라 별도 상태로 관리한다. */
export const Tile = {
  Empty: 0,
  /** 파낼 수 있는 벽돌 */
  Brick: 1,
  /** 파낼 수 없는 단단한 벽 */
  Solid: 2,
  Ladder: 3,
  Rope: 4,
  /** 금괴를 모두 모으면 나타나는 탈출 사다리 (그 전에는 빈 칸) */
  EscapeLadder: 5,
} as const;

export type Tile = (typeof Tile)[keyof typeof Tile];

export type Direction = "left" | "right" | "up" | "down";

/** 한 칸 이동의 종류. fall은 지지대가 없어 떨어지는 이동이다. */
export type MoveKind = Direction | "fall";

export interface Point {
  x: number;
  y: number;
}

export interface StageDefinition {
  name: string;
  /** 같은 길이의 문자열 배열. 범례는 stages.ts 참고 */
  map: readonly string[];
}

export interface Level {
  width: number;
  height: number;
  /** 원래 지형 (구멍·탈출 사다리 공개 여부는 GameState에서 따로 관리) */
  tiles: Tile[];
}

export interface ParsedStage {
  level: Level;
  playerStart: Point;
  guardStarts: Point[];
  gold: Point[];
}

/** 타일 사이를 한 칸씩 이동하는 캐릭터 공통 상태 */
export interface Actor {
  /** 출발 칸 (정지 상태면 현재 칸) */
  x: number;
  y: number;
  /** 이동 중인 목표 칸 (정지 상태면 x, y와 같다) */
  tx: number;
  ty: number;
  /** 0~1, 출발 칸에서 목표 칸까지 진행률 */
  progress: number;
  move: MoveKind | null;
  facing: -1 | 1;
}

export type PlayerStatus = "alive" | "dead";

export interface Player extends Actor {
  status: PlayerStatus;
  invincibleUntil: number;
  digCooldownUntil: number;
  /** 버퍼에 남아 있는 땅파기 입력 */
  pendingDig: { dir: -1 | 1; until: number } | null;
}

export type GuardStatus = "chasing" | "trapped" | "climbing" | "dead";

export interface Guard extends Actor {
  id: number;
  status: GuardStatus;
  /** trapped: 갇힌 시각 / dead: 소멸 시각 */
  statusSince: number;
  respawnAt: number;
  /** BFS로 계산한 다음 이동 칸들 (첫 칸이 다음 목적지) */
  path: Point[];
  nextRepathAt: number;
  lastRepathAt: number;
  /** 방금 기어 나온 구멍. 이 열을 벗어날 때까지 그 구멍을 바닥으로 취급해 다시 빠지지 않는다. */
  ignoreHole: number | null;
  blockedFor: number;
}

export interface Hole {
  cell: number;
  dugAt: number;
}

export type GamePhase =
  | "ready"
  | "stageIntro"
  | "playing"
  | "paused"
  | "dying"
  | "stageClear"
  | "gameOver";

export interface GameState {
  phase: GamePhase;
  /** 일시정지에서 돌아갈 단계 */
  pausedFrom: GamePhase | null;
  /** 시뮬레이션 시간(초). 일시정지 중에는 흐르지 않는다. */
  time: number;
  /** stageIntro·dying·stageClear가 끝나는 시각 */
  phaseUntil: number;

  stageIndex: number;
  round: number;
  score: number;
  /** 스테이지 시작 시점 점수. 사망으로 재시작하면 이 점수로 되돌린다(점수 반복 획득 방지). */
  stageStartScore: number;
  highScore: number;
  lives: number;

  level: Level;
  escapeRevealed: boolean;
  /** 남은 금괴 위치 (cell index) */
  gold: Set<number>;
  holes: Map<number, Hole>;

  player: Player;
  guards: Guard[];
  guardStarts: Point[];
  playerStart: Point;
}

export interface InputSnapshot {
  /** 누르고 있는 방향 (최근에 누른 것이 앞) */
  directions: readonly Direction[];
  /** 이번 프레임에 새로 누른 땅파기 (-1: 왼쪽 아래, 1: 오른쪽 아래) */
  dig: -1 | 1 | null;
}

export type GameEvent =
  | { type: "goldCollected"; cell: number }
  | { type: "escapeRevealed" }
  | { type: "dug"; cell: number }
  | { type: "holeClosed"; cell: number }
  | { type: "guardTrapped"; guardId: number }
  | { type: "guardEscaped"; guardId: number }
  | { type: "guardKilled"; guardId: number }
  | { type: "guardRespawned"; guardId: number }
  | { type: "playerDied"; cause: "guard" | "hole" | "selfDestruct" }
  | { type: "stageCleared" }
  | { type: "stageStarted" }
  | { type: "gameOver" };
