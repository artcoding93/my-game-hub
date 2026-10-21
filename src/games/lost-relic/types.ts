/*
 * Lost Relic: Temple of Secrets — 타입 정의.
 * 좌표 단위: 내부 해상도 픽셀(640×360). 타일 하나는 20px이며, 방 하나는 32×18 타일이다.
 */

export const ROOM_IDS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"] as const;
export type RoomId = (typeof ROOM_IDS)[number];

export const ITEM_IDS = ["coin", "bronzeKey", "silverKey", "potion", "blastPowder", "relic"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export type Side = "left" | "right" | "up" | "down";

/**
 * 방 출입구. left/right는 방 가장자리 열의 행 범위(from~to, to 아래 행이 바닥),
 * up/down은 사다리가 지나가는 열 범위(from~to)다. 연결된 방에는 반대쪽 출입구가 반드시 있다.
 */
export interface ExitDef {
  side: Side;
  from: number;
  to: number;
  room: RoomId;
}

/** 지도 문자로 배치하는 오브젝트. 위치는 지도에서 문자가 놓인 칸(오브젝트의 맨 아래 칸)이다. */
export type EntityDef =
  /** hiddenUntil: 이 플래그가 생기기 전에는 보이지 않음 · lockedUntil: 이 플래그가 생기기 전에는 열 수 없음 */
  | { kind: "chest"; id: string; item: ItemId; count?: number; hiddenUntil?: string; lockedUntil?: string }
  | { kind: "jar"; id: string; item?: ItemId }
  | { kind: "tablet"; id: string; text: string }
  /** 열쇠로 여는 3칸 높이 문 */
  | { kind: "lockedDoor"; id: string; key: ItemId }
  /** 바닥·천장의 1칸 덮개(밑에는 사다리). secret이면 조사해서 직접 연다. 아니면 flag가 생길 때 열린다. */
  | { kind: "hatch"; id: string; flag: string; secret?: boolean; hint: string }
  /** 도구로 부수는 3칸 높이 균열 벽 */
  | { kind: "crackedWall"; id: string; tool: ItemId }
  /** 조사하면 reveals 플래그를 세우는 수상한 지점(숨겨진 상자 등) */
  | { kind: "secretSpot"; id: string; reveals: string; text: string }
  /** 밀어서 옮기는 석상. 레일(minCol~maxCol) 위에서만 움직인다. */
  | { kind: "statue"; id: string; minCol: number; maxCol: number }
  /** 석상을 올리면 flag가 세워지는 바닥 스위치 */
  | { kind: "plate"; id: string; statue: string; flag: string }
  | { kind: "altar"; id: string }
  | { kind: "exitDoor"; id: string }
  | { kind: "coin"; id: string }
  | { kind: "snake"; id: string; minCol: number; maxCol: number }
  | { kind: "bat"; id: string; minCol: number; maxCol: number; amplitude: number }
  | { kind: "guardian"; id: string; minCol: number; maxCol: number }
  /** 위아래로 움직이는 돌 블록. topRow까지 올라갔다가 마커 칸 바닥까지 내려온다(가로 2칸). */
  | { kind: "crusher"; id: string; topRow: number };

export type EntityKind = EntityDef["kind"];

export interface RoomDef {
  id: RoomId;
  index: number;
  name: string;
  /** 영어 부제(픽셀 폰트) */
  title: string;
  /** 32×18 지도. 범례는 logic/world.ts */
  map: readonly string[];
  markers: Record<string, EntityDef>;
  exits: ExitDef[];
  /** 유물 획득 후 떨어지는 돌 (열 목록, 순서대로 반복) */
  rockfall?: number[];
}

export type Tile = "solid" | "empty" | "platform" | "ladder" | "crumble" | "spikes";

export interface PlacedEntity {
  def: EntityDef;
  col: number;
  row: number;
}

export interface ParsedRoom {
  def: RoomDef;
  tiles: Tile[][];
  entities: PlacedEntity[];
  torches: { col: number; row: number }[];
  /** 무너지는 바닥 칸 (id = "<room>:<col>:<row>") */
  crumbles: { id: string; col: number; row: number }[];
  /** 주기적으로 솟는 가시 칸. group은 붙어 있는 가시 묶음 번호 */
  spikes: { col: number; row: number; group: number }[];
}

// ── 실행 상태 ──

export type GamePhase = "title" | "playing" | "paused" | "inventory" | "dying" | "gameOver" | "cleared";

export type PlayerAnim = "idle" | "walk" | "jump" | "fall" | "climb" | "hurt" | "interact";

export interface Player {
  /** 중심 x */
  x: number;
  /** 발 위치 y */
  y: number;
  vx: number;
  vy: number;
  facing: -1 | 1;
  onGround: boolean;
  climbing: boolean;
  /** 땅을 떠난 뒤에도 점프를 받아 주는 남은 시간 */
  coyote: number;
  /** 착지 직전에 누른 점프를 기억하는 남은 시간 */
  jumpBuffer: number;
  /** 피격 무적 남은 시간 */
  invincible: number;
  /** 피격 직후 조작 불가 남은 시간 */
  stun: number;
  /** 상자 열기·조사 동작 남은 시간 */
  busy: number;
  /** 걷기·사다리 애니메이션 진행량 */
  stride: number;
  anim: PlayerAnim;
  /** 위·아래 출입구로 들어온 직후 저절로 사다리를 타는 방향과 남은 시간 */
  autoClimb: -1 | 0 | 1;
  autoTimer: number;
}

export interface Enemy {
  id: string;
  kind: "snake" | "bat" | "guardian";
  x: number;
  /** 발(바닥) 위치. 박쥐는 몸 중심 */
  y: number;
  baseY: number;
  minX: number;
  maxX: number;
  dir: -1 | 1;
  /** patrol · alert(발견해서 멈칫) · chase(추격) · rest(방향 전환 전 쉬기) */
  mode: "patrol" | "alert" | "chase" | "rest";
  timer: number;
  phase: number;
  amplitude: number;
}

export interface Crusher {
  id: string;
  x: number;
  /** 블록 아래쪽 y */
  bottom: number;
  topBottom: number;
  floorBottom: number;
  mode: "up" | "shake" | "drop" | "down" | "rise";
  timer: number;
}

export interface Rock {
  id: number;
  x: number;
  y: number;
  vy: number;
  /** 낙하 전 경고 남은 시간 (0이면 떨어지는 중) */
  warn: number;
}

export interface CrumbleState {
  mode: "intact" | "shaking" | "fallen";
  timer: number;
}

export interface Statue {
  x: number;
  /** 스위치에 올라가 고정됨 */
  locked: boolean;
}

export interface Transition {
  stage: "out" | "in";
  timer: number;
  to: RoomId;
  /** 도착하는 방에서 사용할 출입구 */
  entry: ExitDef;
}

export interface Message {
  id: number;
  text: string;
  /** 남은 표시 시간 */
  timer: number;
  tone: "info" | "item" | "secret" | "warn";
}

export interface Prompt {
  text: string;
  /** 안내를 띄울 위치(오브젝트 위쪽, 내부 해상도 좌표) */
  x: number;
  y: number;
  /** E 키로 실행할 수 있는 안내인지 (false면 단순 힌트) */
  actionable: boolean;
}

export interface Checkpoint {
  room: RoomId;
  x: number;
  y: number;
  climbing: boolean;
  facing: -1 | 1;
}

export interface GameState {
  phase: GamePhase;
  room: RoomId;
  player: Player;
  health: number;
  inventory: Record<ItemId, number>;
  selected: ItemId | null;
  /** 열린 상자·문, 찾은 비밀, 해결한 퍼즐 등 영구 진행 상태 */
  flags: Set<string>;
  /** 플래그가 세워진 시각(연출용) */
  flagTimes: Map<string, number>;
  visited: Set<RoomId>;
  statues: Record<string, Statue>;
  score: number;
  /** 플레이 시간(일시정지·인벤토리·전환 중 제외) */
  time: number;
  /** 현재 방에 들어온 뒤 흐른 시간(함정 주기 기준) */
  roomTime: number;
  /** 방에 들어온 직후 피격 보호 남은 시간 */
  safeTime: number;
  transition: Transition | null;
  /** 여는 중인 상자 (id → 남은 시간) */
  openingChest: { id: string; timer: number } | null;
  enemies: Enemy[];
  crushers: Crusher[];
  crumbles: Record<string, CrumbleState>;
  rocks: Rock[];
  rockTimer: number;
  rockIndex: number;
  nextRockId: number;
  message: Message | null;
  nextMessageId: number;
  prompt: Prompt | null;
  checkpoint: Checkpoint;
  /** dying 단계 남은 시간 */
  endTimer: number;
  /** 마지막 가시 경고음 주기(같은 주기에 두 번 울리지 않게) */
  spikeCycle: number;
}

export interface InputSnapshot {
  move: -1 | 0 | 1;
  vertical: -1 | 0 | 1;
  jumpHeld: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
  usePressed: boolean;
  cyclePressed: boolean;
}

export type GameEvent =
  | { type: "start" }
  | { type: "chestOpen"; id: string }
  | { type: "itemFound"; item: ItemId; count: number; x: number; y: number }
  | { type: "doorUnlock"; id: string }
  | { type: "doorOpen"; id: string }
  | { type: "secretFound"; id: string; x: number; y: number }
  | { type: "switchActivate"; id: string }
  | { type: "trapTrigger"; kind: "spikes" | "crumble" | "crusher" | "rock" }
  | { type: "playerHit"; health: number }
  | { type: "heal"; health: number }
  | { type: "toolUse"; id: string; x: number; y: number }
  | { type: "relicFound"; x: number; y: number }
  | { type: "roomTransition"; from: RoomId; to: RoomId }
  | { type: "roomEnter"; room: RoomId }
  | { type: "coin"; x: number; y: number }
  | { type: "denied" }
  | { type: "message"; text: string }
  | { type: "rockLanded"; x: number }
  | { type: "gameClear" }
  | { type: "gameOver" };
