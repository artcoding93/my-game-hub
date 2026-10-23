/** Turbo Kart 공용 타입. 규칙은 logic/, 트랙 데이터는 tracks.ts, 그리기는 renderer.ts에 있다. */

export const TRACK_IDS = ["greenValley", "desertCanyon", "frostCircuit"] as const;
export type TrackId = (typeof TRACK_IDS)[number];

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const ITEM_IDS = ["turboBoost", "snowBomb", "shield", "oilSlick", "homingRocket", "speedWind", "smokeScreen", "quickRepair"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type DriverId = "player" | "bolt" | "luna" | "dash";

export type Surface = "road" | "dirt" | "sand" | "ice" | "offroad";

export interface Vec {
  x: number;
  y: number;
}

/** 한 스텝의 조작 입력 (플레이어 키보드·터치와 AI가 같은 형식을 쓴다) */
export interface DriveInput {
  throttle: boolean;
  brake: boolean;
  /** -1 = 왼쪽, 1 = 오른쪽 */
  steer: number;
  drift: boolean;
  /** 이번 스텝에 눌렀는지 (한 번만 동작) */
  boost: boolean;
  item: boolean;
}

export interface Kart {
  id: DriverId;
  index: number;
  x: number;
  y: number;
  /** 진행 방향 (라디안, +x에서 시계 방향: 화면 좌표) */
  heading: number;
  vx: number;
  vy: number;
  /** 드리프트 중 */
  drifting: boolean;
  driftDir: number;
  /** 이번 스텝에 유효한 드리프트(게이지 충전 중)였는지 */
  driftCharging: boolean;
  /** 부스터 게이지 0~100 */
  gauge: number;
  /** 게이지 부스터 남은 시간 */
  boostTime: number;
  boostCooldown: number;
  /** 아이템 효과 남은 시간 */
  turboTime: number;
  windTime: number;
  shieldTime: number;
  /** 감속 효과(눈 폭탄·로켓) */
  slowTime: number;
  /** 미끄러짐(오일·로켓) */
  spinTime: number;
  smokeTime: number;
  /** 공격을 연속으로 맞지 않는 보호 시간 */
  protectTime: number;
  /** 벽에 부딪힌 뒤 드리프트 충전을 막는 시간 */
  wallTime: number;
  /** 복구 후 멈춰 있는 시간 (시간 손실) */
  frozenTime: number;
  item: ItemId | null;
  /** 메인 코스 위 위치 (0 ~ 트랙 길이) */
  s: number;
  /** 진행 거리 (출발선 0, 바퀴마다 트랙 길이만큼 증가, 역주행하면 줄어듦) */
  dist: number;
  /** 메인 코스 위 투영 샘플 번호 */
  sample: number;
  /** 지금까지 순서대로 통과한 체크포인트 수 (출발선 첫 통과 포함) */
  passed: number;
  finished: boolean;
  finishTime: number | null;
  /** 진행이 없는 시간 (막힘 감지) */
  stuckTime: number;
  bestDist: number;
  wrongWayTime: number;
  surface: Surface;
  recoveries: number;
}

export interface Projectile {
  id: number;
  kind: "snowBomb" | "homingRocket";
  owner: number;
  target: number | null;
  x: number;
  y: number;
  heading: number;
  life: number;
  /** 메인 코스 위 투영 샘플 (로켓이 코스를 따라갈 때) */
  sample: number;
  age: number;
}

export interface OilSlick {
  id: number;
  owner: number;
  x: number;
  y: number;
  life: number;
  /** 코스 위 위치 (AI 회피용) */
  s: number;
  lateral: number;
}

export interface ItemBox {
  x: number;
  y: number;
  /** 다시 나타나기까지 남은 시간 (0이면 있음) */
  respawn: number;
}

export interface Obstacle {
  kind: string;
  x: number;
  y: number;
  r: number;
}

export interface Mover {
  kind: string;
  /** 도로 가운데 기준점과 좌우 방향 */
  cx: number;
  cy: number;
  nx: number;
  ny: number;
  amplitude: number;
  period: number;
  phase: number;
  r: number;
  x: number;
  y: number;
}

export type RacePhase = "countdown" | "racing" | "finished";

export interface RaceState {
  phase: RacePhase;
  paused: boolean;
  track: TrackId;
  difficulty: Difficulty;
  laps: number;
  rng: number;
  /** 카운트다운 남은 시간 (초) */
  countdown: number;
  /** 출발 후 경과 시간 */
  time: number;
  karts: Kart[];
  projectiles: Projectile[];
  oils: OilSlick[];
  boxes: ItemBox[];
  movers: Mover[];
  nextId: number;
  /** 플레이어 완주 시 확정된 최종 순위 (kart index 배열) */
  results: RaceResult[] | null;
  raceId: string;
}

export interface RaceResult {
  index: number;
  id: DriverId;
  rank: number;
  time: number;
  /** 플레이어가 먼저 완주해 남은 거리로 추정한 기록 */
  estimated: boolean;
}

export type RaceEvent =
  | { type: "countdown"; value: number }
  | { type: "go" }
  | { type: "lap"; kart: number; lap: number }
  | { type: "finish"; kart: number; rank: number; time: number }
  | { type: "raceOver"; playerRank: number; playerTime: number }
  | { type: "wall"; kart: number; speed: number }
  | { type: "bump"; kart: number; other: number }
  | { type: "obstacle"; kart: number; x: number; y: number }
  | { type: "itemGet"; kart: number; item: ItemId }
  | { type: "itemUse"; kart: number; item: ItemId }
  | { type: "hit"; kart: number; by: ItemId; blocked: boolean }
  | { type: "boost"; kart: number }
  | { type: "recover"; kart: number }
  | { type: "wrongWay"; kart: number };
