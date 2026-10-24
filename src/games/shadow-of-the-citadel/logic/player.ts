import { BODY, JUMP, LAND, LEDGE, MOVE, RESPAWN_MARGIN, TILE } from "../config";
import type { TestSpot } from "../level";
import { bodyHitsSolid, canClimb, findLedge, hangPosition, rectHitsSolid, standPosition, type Ledge, type World } from "./world";

/*
 * 플레이어 물리와 동작 상태. 순수 함수이며 React·DOM·캔버스에 의존하지 않는다.
 * 좌표는 발 위치(x = 몸 가운데, y = 발바닥)다. 지면 접촉은 발 기준, 매달리기는 손 기준(난간 모서리)으로 정렬한다.
 *
 * 상태(mode):
 *   move      서기·걷기·달리기 (속도로 구분)
 *   skid      달리다가 방향키를 떼서 미끄러지며 멈춤
 *   turn      달리다가 반대 방향 입력: 제동 → 속도 0에서 방향 전환
 *   jumpPrep  도약 준비(무릎 굽힘). 끝나면 실제로 뛰어오른다
 *   air       상승·낙하
 *   land      중간·큰 착지의 짧은 경직 (작은 착지는 move로 바로 이어진다)
 *   hang      난간에 매달림 (중력 없음)
 *   climb     올라오기. 애니메이션과 같은 진행도(climbT)로 진행하고 끝나면 난간 위에 선다
 */

export type Mode = "move" | "skid" | "turn" | "jumpPrep" | "air" | "land" | "hang" | "climb";

export interface PlayerInput {
  /** -1 왼쪽, 0 없음, 1 오른쪽 */
  move: -1 | 0 | 1;
  run: boolean;
  /** 이번 스텝에 새로 누름 */
  jumpPressed: boolean;
  jumpHeld: boolean;
  up: boolean;
  down: boolean;
}

export const NO_INPUT: PlayerInput = { move: 0, run: false, jumpPressed: false, jumpHeld: false, up: false, down: false };

export type PlayerEvent =
  | { type: "jump"; running: boolean }
  | { type: "land"; impact: number; level: "light" | "medium" | "heavy" }
  | { type: "grab"; dx: number; dy: number; vx: number; vy: number }
  | { type: "climb" }
  | { type: "climbEnd" }
  | { type: "drop" }
  | { type: "skid" }
  | { type: "turn" }
  | { type: "bump" }
  | { type: "respawn" };

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  mode: Mode;
  /** 현재 mode에 머문 시간 */
  modeTime: number;
  grounded: boolean;
  /** 땅을 떠난 뒤 남은 코요테 시간 */
  coyote: number;
  jumpBuffer: number;
  /** 이번 공중 상태가 점프로 시작했는지 (점프 키를 떼면 낮은 점프) */
  jumped: boolean;
  /** 도약 준비가 달리기 점프인지 */
  prepRun: boolean;
  /** 공중에서 허용하는 최대 수평 속도 (도약 순간 속도 이상) */
  airMaxSpeed: number;
  airTime: number;
  landLevel: "light" | "medium" | "heavy";
  landImpact: number;
  ledge: Ledge | null;
  /** 올라오기 진행도 0~1 */
  climbT: number;
  regrab: number;
  /** 지금 손이 닿는 난간 (디버그 표시용, 상태와 무관) */
  probe: Ledge | null;
  /** 바라보는 쪽 가슴~머리 위 높이의 벽까지 거리 (30px 이내만, 없으면 null). 애니메이션이 벽 앞에서 팔을 위로 뻗는 데 쓴다 */
  wallAhead: number | null;
  /** 위치가 불연속으로 바뀔 때마다 1씩 증가 (렌더러 보간 생략용) */
  teleports: number;
  spot: TestSpot;
}

export function createPlayer(spot: TestSpot): Player {
  return {
    x: spot.x,
    y: spot.y,
    vx: 0,
    vy: 0,
    facing: spot.facing,
    mode: "move",
    modeTime: 0,
    grounded: true,
    coyote: 0,
    jumpBuffer: 0,
    jumped: false,
    prepRun: false,
    airMaxSpeed: JUMP.airMaxSpeed,
    airTime: 0,
    landLevel: "light",
    landImpact: 0,
    ledge: null,
    climbT: 0,
    regrab: 0,
    probe: null,
    wallAhead: null,
    teleports: 0,
    spot,
  };
}

export function resetPlayer(p: Player, spot: TestSpot = p.spot) {
  const teleports = p.teleports + 1;
  Object.assign(p, createPlayer(spot), { teleports });
}

function setMode(p: Player, mode: Mode) {
  p.mode = mode;
  p.modeTime = 0;
}

function approach(value: number, target: number, delta: number) {
  return value < target ? Math.min(value + delta, target) : Math.max(value - delta, target);
}

/** 한 고정 스텝 진행. 일어난 일은 events에 추가한다. */
export function stepPlayer(p: Player, input: PlayerInput, world: World, dt: number, events: PlayerEvent[]) {
  p.modeTime += dt;
  p.jumpBuffer = input.jumpPressed ? JUMP.buffer : Math.max(0, p.jumpBuffer - dt);
  p.regrab = Math.max(0, p.regrab - dt);

  if (p.mode === "hang") stepHang(p, input, world, events);
  else if (p.mode === "climb") stepClimb(p, world, dt, events);
  else {
    if (p.mode === "air") stepAirControl(p, input, dt);
    else stepGround(p, input, dt, events);
    integrate(p, input, world, dt, events);
  }

  p.probe = p.mode === "hang" || p.mode === "climb" ? p.ledge : findLedge(world, p.x, p.y, p.facing);
  p.wallAhead = wallDistance(world, p.x, p.y, p.facing);

  if (p.y > world.rows * TILE + RESPAWN_MARGIN) {
    resetPlayer(p);
    events.push({ type: "respawn" });
  }
}

// ── 지면 ──

function targetSpeed(input: PlayerInput) {
  return input.move * (input.run ? MOVE.runSpeed : MOVE.walkSpeed);
}

function startJumpPrep(p: Player) {
  p.jumpBuffer = 0;
  p.prepRun = Math.abs(p.vx) > MOVE.walkSpeed * 1.3;
  setMode(p, "jumpPrep");
}

function stepGround(p: Player, input: PlayerInput, dt: number, events: PlayerEvent[]) {
  const dir = input.move;
  const movingForward = Math.sign(p.vx) === p.facing;

  switch (p.mode) {
    case "move": {
      if (p.jumpBuffer > 0) {
        startJumpPrep(p);
        return;
      }
      if (dir !== 0 && dir !== p.facing) {
        if (movingForward && Math.abs(p.vx) > MOVE.turnThreshold) {
          setMode(p, "turn");
          events.push({ type: "turn" });
          return;
        }
        p.facing = dir;
      } else if (dir === 0 && Math.abs(p.vx) > MOVE.skidThreshold) {
        setMode(p, "skid");
        events.push({ type: "skid" });
        return;
      }
      const target = targetSpeed(input);
      let rate: number;
      if (target === 0 || Math.sign(target) !== Math.sign(p.vx) && p.vx !== 0) rate = MOVE.stopDecel;
      else if (Math.abs(target) > Math.abs(p.vx)) rate = input.run ? MOVE.runAccel : MOVE.walkAccel;
      else rate = MOVE.slowDownDecel;
      p.vx = approach(p.vx, target, rate * dt);
      return;
    }
    case "skid": {
      if (p.jumpBuffer > 0) return startJumpPrep(p);
      if (dir === p.facing) {
        setMode(p, "move");
        return;
      }
      if (dir === -p.facing) {
        setMode(p, "turn");
        events.push({ type: "turn" });
        return;
      }
      p.vx = approach(p.vx, 0, MOVE.skidDecel * dt);
      if (p.vx === 0) setMode(p, "move");
      return;
    }
    case "turn": {
      p.vx = approach(p.vx, 0, MOVE.turnDecel * dt);
      if (p.vx === 0) {
        p.facing = p.facing === 1 ? -1 : 1;
        setMode(p, "move");
      }
      return;
    }
    case "jumpPrep": {
      // 달리기 점프는 속도를 그대로 싣고, 제자리 점프는 준비 동작 동안 살짝 멈춘다.
      if (!p.prepRun) p.vx = approach(p.vx, 0, MOVE.stopDecel * dt);
      if (p.modeTime >= (p.prepRun ? JUMP.prepRun : JUMP.prepStand)) launch(p, input, events);
      return;
    }
    case "land": {
      const heavy = p.landLevel === "heavy";
      if (heavy) p.vx = approach(p.vx, 0, MOVE.stopDecel * 1.5 * dt);
      else p.vx = approach(p.vx, targetSpeed(input) * LAND.mediumKeep, MOVE.walkAccel * dt);
      const duration = heavy ? LAND.heavyTime : LAND.mediumTime;
      if (p.modeTime >= duration) setMode(p, "move");
      return;
    }
  }
}

function launch(p: Player, input: PlayerInput, events: PlayerEvent[]) {
  const running = Math.abs(p.vx) > MOVE.walkSpeed * 1.3;
  if (input.move !== 0 && Math.abs(p.vx) < JUMP.standJumpSpeed) p.vx = input.move * JUMP.standJumpSpeed;
  p.vy = -JUMP.velocity;
  p.jumped = true;
  p.jumpBuffer = 0;
  p.coyote = 0;
  p.grounded = false;
  p.airTime = 0;
  p.airMaxSpeed = Math.max(JUMP.airMaxSpeed, Math.abs(p.vx));
  setMode(p, "air");
  events.push({ type: "jump", running });
}

// ── 공중 ──

function stepAirControl(p: Player, input: PlayerInput, dt: number) {
  p.airTime += dt;
  p.coyote = Math.max(0, p.coyote - dt);
  const dir = input.move;
  if (dir === 0) return;
  const accel = Math.sign(p.vx) === -dir ? JUMP.airReverseAccel : JUMP.airAccel;
  p.vx = approach(p.vx, dir * p.airMaxSpeed, accel * dt);
}

function integrate(p: Player, input: PlayerInput, world: World, dt: number, events: PlayerEvent[]) {
  // 코요테 점프: 발판 끝을 막 벗어난 직후의 점프 입력
  if (p.mode === "air" && !p.jumped && p.coyote > 0 && p.jumpBuffer > 0) launch(p, input, events);

  const cut = p.mode === "air" && p.jumped && p.vy < 0 && !input.jumpHeld;
  p.vy = Math.min(p.vy + JUMP.gravity * (cut ? JUMP.cutGravityScale : 1) * dt, JUMP.maxFall);

  // 가로 이동 → 세로 이동 순으로 축마다 충돌을 풀어 지형을 관통하지 않게 한다(한 스텝 이동량 < 타일 크기).
  const nx = p.x + p.vx * dt;
  if (bodyHitsSolid(world, nx, p.y)) {
    p.x = p.vx > 0 ? Math.floor((nx + BODY.halfWidth) / TILE) * TILE - BODY.halfWidth - 0.001 : Math.ceil((nx - BODY.halfWidth) / TILE) * TILE + BODY.halfWidth + 0.001;
    if (bodyHitsSolid(world, p.x, p.y)) p.x = nx - p.vx * dt; // 안전장치: 원래 자리로
    p.vx = 0;
  } else p.x = nx;

  const fallSpeed = p.vy;
  const ny = p.y + p.vy * dt;
  const wasGrounded = p.grounded;
  if (bodyHitsSolid(world, p.x, ny)) {
    if (p.vy > 0) {
      p.y = Math.floor(ny / TILE) * TILE;
      p.grounded = true;
    } else {
      p.y = Math.ceil((ny - BODY.height) / TILE) * TILE + BODY.height + 0.001;
      if (p.mode === "air") events.push({ type: "bump" });
    }
    if (bodyHitsSolid(world, p.x, p.y)) p.y = ny - p.vy * dt;
    p.vy = 0;
  } else {
    p.y = ny;
    p.grounded = false;
  }

  if (p.mode === "air") {
    if (p.grounded) land(p, fallSpeed, events);
    else tryGrab(p, input, world, events);
    return;
  }

  // 지면 상태에서 발밑이 비면 낙하 (코요테 시간 시작)
  if (!p.grounded && wasGrounded) {
    const fromPrep = p.mode === "jumpPrep";
    setMode(p, "air");
    p.jumped = false;
    p.coyote = JUMP.coyote;
    p.airTime = 0;
    p.airMaxSpeed = Math.max(JUMP.airMaxSpeed, Math.abs(p.vx));
    if (fromPrep) p.jumpBuffer = JUMP.buffer;
  }
}

function land(p: Player, impact: number, events: PlayerEvent[]) {
  const level = impact >= LAND.heavyImpact ? "heavy" : impact >= LAND.mediumImpact ? "medium" : "light";
  p.landLevel = level;
  p.landImpact = impact;
  p.jumped = false;
  if (level === "light") setMode(p, "move");
  else {
    setMode(p, "land");
    if (level === "heavy") p.vx *= 0.3;
  }
  events.push({ type: "land", impact, level });
}

function tryGrab(p: Player, input: PlayerInput, world: World, events: PlayerEvent[]) {
  if (p.regrab > 0 || p.vy < LEDGE.minVy || input.down || input.move === -p.facing) return;
  const ledge = findLedge(world, p.x, p.y, p.facing);
  if (!ledge) return;
  const hang = hangPosition(ledge);
  events.push({ type: "grab", dx: hang.x - p.x, dy: hang.y - p.y, vx: p.vx, vy: p.vy });
  p.x = hang.x;
  p.y = hang.y;
  p.vx = 0;
  p.vy = 0;
  p.ledge = ledge;
  p.jumped = false;
  p.teleports++;
  setMode(p, "hang");
}

// ── 매달리기·올라오기 ──

function stepHang(p: Player, input: PlayerInput, world: World, events: PlayerEvent[]) {
  const ledge = p.ledge;
  if (!ledge) return setMode(p, "air");
  if (input.down) {
    setMode(p, "air");
    p.ledge = null;
    p.regrab = LEDGE.regrabDelay;
    p.jumped = false;
    p.coyote = 0;
    p.airTime = 0;
    p.grounded = false;
    p.airMaxSpeed = JUMP.airMaxSpeed;
    events.push({ type: "drop" });
    return;
  }
  if ((input.up || input.jumpPressed) && p.modeTime >= LEDGE.climbDelay && canClimb(world, ledge)) {
    p.climbT = 0;
    setMode(p, "climb");
    events.push({ type: "climb" });
  }
}

function stepClimb(p: Player, world: World, dt: number, events: PlayerEvent[]) {
  const ledge = p.ledge;
  if (!ledge) return setMode(p, "air");
  // 올라오는 동안 충돌 상자는 매달린 자리에 둔다(벽과 겹치지 않는 자리). 그림은 climbT로 같은 경로를 따라간다.
  p.climbT = Math.min(1, p.climbT + dt / LEDGE.climbTime);
  if (p.climbT < 1) return;
  const stand = standPosition(ledge);
  if (bodyHitsSolid(world, stand.x, stand.y)) {
    setMode(p, "hang");
    return;
  }
  p.x = stand.x;
  p.y = stand.y;
  p.ledge = null;
  p.grounded = true;
  p.vx = 0;
  p.vy = 0;
  p.teleports++;
  setMode(p, "move");
  events.push({ type: "climbEnd" });
}

function wallDistance(world: World, x: number, y: number, facing: 1 | -1): number | null {
  const front = x + facing * BODY.halfWidth;
  for (let d = 0; d <= 30; d += 2) {
    const probe = front + facing * d;
    // 가슴 높이부터 머리 위 팔 길이까지: 머리 위로 튀어나온 석판도 "앞의 벽"으로 본다
    if (rectHitsSolid(world, Math.min(probe, probe + facing), y - BODY.height - 40, Math.max(probe, probe + facing), y - BODY.height * 0.45)) return d;
  }
  return null;
}

/** 디버그 표시용 동작 이름 */
export function describeMode(p: Player): string {
  switch (p.mode) {
    case "move": {
      const speed = Math.abs(p.vx);
      if (speed < 4) return "Idle";
      return speed > MOVE.walkSpeed * 1.15 ? "Run" : "Walk";
    }
    case "skid":
      return "Stop";
    case "turn":
      return "Turn";
    case "jumpPrep":
      return "Jump Start";
    case "air":
      return p.vy < 0 ? "Jump" : "Fall";
    case "land":
      return p.landLevel === "heavy" ? "Landing (heavy)" : "Landing";
    case "hang":
      return "Ledge Hang";
    case "climb":
      return "Ledge Climb";
  }
}
