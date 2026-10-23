/** Cannon Rivals 공용 타입. 규칙은 logic/, 그리기는 renderer.ts, 화면은 CannonRivalsGame.tsx에 있다. */

export const FIELD_IDS = ["greenHills", "desertCanyon", "frozenRidge"] as const;
export type FieldId = (typeof FIELD_IDS)[number];

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const ITEM_IDS = ["doubleShot", "powerShell", "repairKit", "barrier", "windShield", "aimAssist"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type Side = "player" | "ai";

export interface Tank {
  side: Side;
  /** 차체 가운데 x (월드 픽셀) */
  x: number;
  /** 궤도 바닥 y (화면 좌표: 아래로 갈수록 커짐) */
  y: number;
  /** 낙하 중 세로 속도 */
  vy: number;
  falling: boolean;
  /** 낙하를 시작한 높이 (착지 시 낙하 피해 계산) */
  fallStartY: number;
  hp: number;
  /** 발사 각도(도). 수평 0°, 수직 90°. 바라보는 방향으로 잰다. */
  angle: number;
  /** 발사 파워(%) */
  power: number;
  /** 1 = 오른쪽을 바라봄(플레이어), -1 = 왼쪽(AI) */
  facing: 1 | -1;
  inventory: ItemId[];
  energy: number;
  repairsUsed: number;
  /** 다음 피격 피해 50% 감소 */
  barrier: boolean;
  /** 화면 밖(아래)으로 떨어짐 */
  fell: boolean;
}

export interface Projectile {
  id: number;
  owner: Side;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 비행 시간(초) */
  age: number;
  /** 피해 배율 (Power Shell 1.4, Double Shot 0.6) */
  damageScale: number;
  /** 바람 영향 배율 (Wind Shield 0.3) */
  windScale: number;
}

export interface Crate {
  x: number;
  y: number;
  vy: number;
  /** 하늘에서 내려오는 중(낙하산) */
  landing: boolean;
}

/** 아직 발사되지 않은 Double Shot의 두 번째 포탄 */
export interface PendingShell {
  delay: number;
  owner: Side;
  angle: number;
  power: number;
  damageScale: number;
  windScale: number;
}

/** AI가 기억하는 직전 발사 결과와 조준 오차 (다음 턴 보정에 사용) */
export interface AiMemory {
  /** 현재 남아 있는 조준 오차 (각도°, 파워%) */
  errAngle: number;
  errPower: number;
  shots: number;
  /** 직전 실제 탄착점과 목표 사이 x 거리 (기록) */
  lastMissX: number | null;
  lastDamage: number;
}

export interface AiPlan {
  angle: number;
  power: number;
  item: ItemId | null;
  /** 시뮬레이션으로 찾은 최선 후보의 예상 오차(px). 디버그·테스트용 */
  expectedMiss: number;
  simulations: number;
}

export type GamePhase =
  /** 플레이어 조준 (시간 제한 없음) */
  | "playerAim"
  /** AI 조준 연출 (약 1초) */
  | "aiAim"
  /** 포탄 비행·폭발·낙하 처리 중 */
  | "resolving"
  | "gameOver";

export type EndReason = "hp" | "fell";

export interface GameState {
  phase: GamePhase;
  paused: boolean;
  /** 전투 고유 번호 (보상 중복 지급 방지) */
  battleId: string;
  field: FieldId;
  difficulty: Difficulty;
  /** 시드 난수 상태 (규칙에만 사용) */
  rng: number;
  time: number;
  /** 열마다 지면 y. 이 값 아래(큰 y)가 땅이다. WORLD_H면 땅이 없음(낭떠러지). */
  terrain: Float32Array;
  tanks: Record<Side, Tank>;
  turn: Side;
  /** 지금까지 발사한 턴 수 */
  turnCount: number;
  /** 바람 세기 (-max..max, 양수 = 오른쪽) */
  wind: number;
  projectiles: Projectile[];
  pending: PendingShell[];
  nextProjectileId: number;
  crate: Crate | null;
  /** 다음 보급 상자까지 남은 턴 */
  crateIn: number;
  /** 이번 턴에 선택한 아이템 (보유 칸 번호) */
  armedSlot: number | null;
  /** 이번 발사에 Aim Assist를 썼는지 (화면 표시용) */
  aimAssistShot: boolean;
  /** 폭발 뒤 다음 턴으로 넘어가기 전 연출 대기 시간 */
  settleTimer: number;
  aiTimer: number;
  aiPlan: AiPlan | null;
  /** AI 조준 연출 시작 각도 */
  aiAimFrom: number;
  ai: AiMemory;
  winner: Side | null;
  endReason: EndReason | null;
}

export type GameEvent =
  | { type: "turnStart"; side: Side; wind: number }
  | { type: "fire"; side: Side; x: number; y: number; angle: number; double: boolean; item: ItemId | null }
  | { type: "itemUsed"; side: Side; item: ItemId }
  | { type: "repair"; side: Side; amount: number }
  | { type: "explosion"; x: number; y: number; radius: number; owner: Side }
  | { type: "hit"; target: Side; by: Side; damage: number; direct: boolean; blocked: boolean }
  | { type: "fallDamage"; target: Side; damage: number }
  | { type: "fellOff"; target: Side }
  | { type: "projectileLost"; owner: Side }
  | { type: "crateSpawn"; x: number }
  | { type: "crateCollected"; by: Side; item: ItemId | null }
  | { type: "crateDestroyed" }
  | { type: "itemGranted"; side: Side; item: ItemId; source: "energy" | "crate" }
  | { type: "gameOver"; winner: Side; reason: EndReason };
