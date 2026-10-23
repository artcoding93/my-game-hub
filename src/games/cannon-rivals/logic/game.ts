import { CRATE, DAMAGE, ENERGY, FIELDS, GUIDE, ITEM_RULES, ITEM_WEIGHTS, PHYSICS, TANK, TIMING, WORLD_H } from "../config";
import type { Difficulty, FieldId, GameEvent, GameState, ItemId, Projectile, Side, Tank } from "../types";
import { createAiMemory, planAiShot } from "./ai";
import { clampAngle, clampPower, launchBody, simulateShot, stepBody, SUBSTEP, type Body, type Impact, type World } from "./physics";
import { random, randomInt, weightedPick } from "./rng";
import { carveCrater, createTank, createValidLayout, supportY } from "./terrain";

/*
 * Cannon Rivals 규칙 (순수 함수, React·DOM·Canvas 의존 없음).
 *
 * 턴 흐름: playerAim → (FIRE) resolving → aiAim(약 1초 조준 연출) → resolving → playerAim …
 * resolving: 포탄 비행 → 착탄(지형 파괴·피해·상자) → 탱크·상자 낙하 → 연출 대기 → 다음 턴.
 * HP가 0 이하가 되거나 화면 밖으로 떨어지는 즉시 gameOver가 되고, 날아가던 포탄은 사라진다.
 * 아이템: 한 턴에 하나만 고를 수 있고 FIRE할 때 소모·적용된다(공격형·회복·방어 동시 사용 불가).
 */

export const other = (side: Side): Side => (side === "player" ? "ai" : "player");

export interface BattleOptions {
  field: FieldId;
  difficulty: Difficulty;
  seed: number;
  /** 상점에서 산 아이템 (전투 시작 시 플레이어 인벤토리에 넣는다) */
  loadout?: readonly ItemId[];
}

export function createBattle({ field, difficulty, seed, loadout = [] }: BattleOptions): { state: GameState; events: GameEvent[] } {
  const rng = { rng: seed | 0 };
  const layout = createValidLayout(field, rng);
  const player = createTank("player", layout.playerX, layout.terrain);
  const ai = createTank("ai", layout.aiX, layout.terrain);
  player.inventory = loadout.slice(0, ITEM_RULES.maxSlots);
  const state: GameState = {
    phase: "playerAim",
    paused: false,
    battleId: `${field}-${difficulty}-${(seed >>> 0).toString(36)}`,
    field,
    difficulty,
    rng: rng.rng,
    time: 0,
    terrain: layout.terrain,
    tanks: { player, ai },
    turn: "player",
    turnCount: 0,
    wind: 0,
    projectiles: [],
    pending: [],
    nextProjectileId: 1,
    crate: null,
    crateIn: 0,
    armedSlot: null,
    aimAssistShot: false,
    settleTimer: 0,
    aiTimer: 0,
    aiPlan: null,
    aiAimFrom: 45,
    ai: createAiMemory(),
    winner: null,
    endReason: null,
  };
  state.wind = rollWind(state, randomInt(state, -FIELDS[field].windMax, FIELDS[field].windMax));
  state.crateIn = randomInt(state, CRATE.minTurns, CRATE.maxTurns);
  return { state, events: [{ type: "turnStart", side: "player", wind: state.wind }] };
}

/** 전장 범위 안의 바람. 최소 세기보다 약하면 그 세기로 올린다. */
function rollWind(state: GameState, value: number): number {
  const { windMax, windMinAbs } = FIELDS[state.field];
  let wind = Math.max(-windMax, Math.min(windMax, Math.round(value)));
  if (Math.abs(wind) < windMinAbs) wind = (wind === 0 ? (random(state) < 0.5 ? -1 : 1) : Math.sign(wind)) * windMinAbs;
  return wind;
}

export function worldOf(state: GameState): World {
  return { terrain: state.terrain, wind: state.wind, tanks: state.tanks, crate: state.crate };
}

// ── 아이템 ──

export function canUseItem(tank: Tank, item: ItemId): boolean {
  if (item === "repairKit") return tank.repairsUsed < ITEM_RULES.repairPerMatch && tank.hp < TANK.maxHp;
  if (item === "barrier") return !tank.barrier;
  return true;
}

/** 지급 가능한 랜덤 아이템 (경기 중 더 쓸 수 없는 Repair Kit은 제외) */
function rollItem(state: GameState, tank: Tank): ItemId {
  const weights = { ...ITEM_WEIGHTS };
  const kits = tank.inventory.filter((item) => item === "repairKit").length;
  if (tank.repairsUsed + kits >= ITEM_RULES.repairPerMatch) weights.repairKit = 0;
  return weightedPick(state, weights);
}

/** 에너지가 100 이상이면 아이템을 준다. 초과분은 이월하고, 칸이 가득 차면 100에서 대기한다. */
function grantFromEnergy(state: GameState, side: Side, events: GameEvent[]) {
  const tank = state.tanks[side];
  while (tank.energy >= ENERGY.threshold && tank.inventory.length < ITEM_RULES.maxSlots) {
    tank.energy -= ENERGY.threshold;
    const item = rollItem(state, tank);
    tank.inventory.push(item);
    events.push({ type: "itemGranted", side, item, source: "energy" });
  }
  if (tank.inventory.length >= ITEM_RULES.maxSlots) tank.energy = Math.min(tank.energy, ENERGY.threshold);
}

/** 플레이어: 이번 턴에 쓸 아이템 칸을 고른다. 같은 칸을 다시 누르면 취소. 쓸 수 없는 아이템이면 false. */
export function armItem(state: GameState, slot: number): boolean {
  if (state.phase !== "playerAim" || state.paused) return false;
  const tank = state.tanks.player;
  const item = tank.inventory[slot];
  if (!item) return false;
  if (state.armedSlot === slot) {
    state.armedSlot = null;
    return true;
  }
  if (!canUseItem(tank, item)) return false;
  state.armedSlot = slot;
  return true;
}

export function armedItem(state: GameState): ItemId | null {
  if (state.armedSlot === null) return null;
  return state.tanks[state.turn].inventory[state.armedSlot] ?? null;
}

// ── 조준 ──

export function setAim(state: GameState, angle: number, power: number) {
  if (state.phase !== "playerAim" || state.paused) return;
  const tank = state.tanks.player;
  tank.angle = clampAngle(angle);
  tank.power = clampPower(power);
}

export function adjustAim(state: GameState, dAngle: number, dPower: number) {
  const tank = state.tanks.player;
  setAim(state, tank.angle + dAngle, tank.power + dPower);
}

/**
 * 탄도 가이드. 평소에는 예상 비행 시간의 30%까지만, Aim Assist를 고르면 탄착 지점까지 돌려준다.
 * 비행 시간을 알 수 없는 경우(화면 밖으로 나감)에는 GUIDE.fallbackSeconds의 30%로 제한한다.
 */
export function guidePath(state: GameState): { points: { x: number; y: number }[]; full: boolean; impact: { x: number; y: number } | null } {
  const tank = state.tanks.player;
  const item = armedItem(state);
  const windScale = item === "windShield" ? ITEM_RULES.windShieldScale : 1;
  const full = item === "aimAssist";
  const result = simulateShot(worldOf(state), "player", tank.angle, tank.power, windScale, 2);
  const path = result.path ?? [];
  if (full) return { points: path, full, impact: result.impact.kind === "out" ? null : { x: result.impact.x, y: result.impact.y } };
  const knownTime = result.impact.kind === "out" ? Math.min(result.time, GUIDE.fallbackSeconds) : result.time;
  const limit = knownTime * GUIDE.fraction;
  const count = Math.max(2, Math.floor(limit / (SUBSTEP * 2)));
  return { points: path.slice(0, count), full, impact: null };
}

// ── 발사 ──

function spawnProjectile(state: GameState, owner: Side, angle: number, power: number, damageScale: number, windScale: number): Projectile {
  const body = launchBody(state.tanks[owner], angle, power, windScale);
  const projectile: Projectile = { id: state.nextProjectileId++, owner, ...body, damageScale };
  state.projectiles.push(projectile);
  return projectile;
}

/** 현재 턴의 탱크가 발사한다. 고른 아이템은 여기서 소모·적용된다. */
function shoot(state: GameState, events: GameEvent[]) {
  const side = state.turn;
  const tank = state.tanks[side];
  const item = armedItem(state);
  if (item && state.armedSlot !== null) {
    tank.inventory.splice(state.armedSlot, 1);
    events.push({ type: "itemUsed", side, item });
  }
  state.armedSlot = null;
  state.aimAssistShot = item === "aimAssist";

  let damageScale = 1;
  let windScale = 1;
  if (item === "repairKit") {
    const amount = Math.min(ITEM_RULES.repairAmount, TANK.maxHp - tank.hp);
    tank.hp += amount;
    tank.repairsUsed++;
    events.push({ type: "repair", side, amount });
  }
  if (item === "barrier") tank.barrier = true;
  if (item === "powerShell") damageScale = DAMAGE.powerShellScale;
  if (item === "windShield") windScale = ITEM_RULES.windShieldScale;

  if (item === "doubleShot") {
    spawnProjectile(state, side, tank.angle, tank.power, DAMAGE.doubleShotScale, windScale);
    state.pending.push({
      delay: ITEM_RULES.doubleShotDelay,
      owner: side,
      angle: tank.angle,
      power: tank.power + ITEM_RULES.doubleShotPowerOffset,
      damageScale: DAMAGE.doubleShotScale,
      windScale,
    });
  } else {
    spawnProjectile(state, side, tank.angle, tank.power, damageScale, windScale);
  }
  if (side === "ai") state.ai.lastDamage = 0;
  const from = launchBody(tank, tank.angle, tank.power);
  events.push({ type: "fire", side, x: from.x, y: from.y, angle: tank.angle, double: item === "doubleShot", item });
  state.phase = "resolving";
  state.settleTimer = 0;
}

/** 플레이어 FIRE. 플레이어 조준 단계가 아니면 무시한다. */
export function playerFire(state: GameState): GameEvent[] {
  if (state.phase !== "playerAim" || state.paused) return [];
  const events: GameEvent[] = [];
  shoot(state, events);
  return events;
}

// ── 착탄 ──

function tankCenterY(tank: Tank) {
  return tank.y - TANK.hitHeight / 2;
}

function applyDamage(state: GameState, target: Side, by: Side, raw: number, direct: boolean, events: GameEvent[]) {
  const tank = state.tanks[target];
  if (tank.fell || tank.hp <= 0) return;
  let damage = raw;
  const blocked = tank.barrier;
  if (blocked) {
    damage *= DAMAGE.barrierScale;
    tank.barrier = false;
  }
  const amount = Math.max(1, Math.round(damage));
  tank.hp = Math.max(0, tank.hp - amount);
  events.push({ type: "hit", target, by, damage: amount, direct, blocked });
  if (target !== by) {
    state.tanks[by].energy += direct ? ENERGY.direct : ENERGY.splash;
    grantFromEnergy(state, by, events);
    if (by === "ai") state.ai.lastDamage += amount;
  }
}

function explode(state: GameState, projectile: Projectile, impact: Exclude<Impact, { kind: "out" }>, events: GameEvent[]) {
  const { owner, damageScale } = projectile;
  const x = impact.x;
  const y = impact.y;
  events.push({ type: "explosion", x, y, radius: DAMAGE.craterRadius, owner });

  // 보급 상자: 직접 맞히면 쏜 쪽이 아이템을 얻고, 폭발에 휘말리면 그냥 부서진다.
  if (state.crate) {
    const crate = state.crate;
    if (impact.kind === "crate") {
      const tank = state.tanks[owner];
      let item: ItemId | null = null;
      if (tank.inventory.length < ITEM_RULES.maxSlots) {
        item = rollItem(state, tank);
        tank.inventory.push(item);
      } else {
        tank.energy += ENERGY.direct;
        grantFromEnergy(state, owner, events);
      }
      events.push({ type: "crateCollected", by: owner, item });
      if (item) events.push({ type: "itemGranted", side: owner, item, source: "crate" });
      removeCrate(state);
    } else if (Math.hypot(x - crate.x, y - (crate.y - CRATE.halfSize)) <= DAMAGE.craterRadius + CRATE.halfSize) {
      events.push({ type: "crateDestroyed" });
      removeCrate(state);
    }
  }

  carveCrater(state.terrain, x, y, DAMAGE.craterRadius);

  for (const side of ["player", "ai"] as const) {
    const tank = state.tanks[side];
    if (tank.fell) continue;
    if (impact.kind === "tank" && impact.target === side) {
      applyDamage(state, side, owner, DAMAGE.direct * damageScale, true, events);
      continue;
    }
    const d = Math.hypot(x - tank.x, y - tankCenterY(tank));
    if (d <= DAMAGE.splashRadius) {
      const splash = DAMAGE.splashMin + (DAMAGE.splashMax - DAMAGE.splashMin) * (1 - d / DAMAGE.splashRadius);
      applyDamage(state, side, owner, splash * damageScale, false, events);
    }
  }
  if (owner === "ai") state.ai.lastMissX = x - state.tanks.player.x;
}

function removeCrate(state: GameState) {
  state.crate = null;
  state.crateIn = randomInt(state, CRATE.minTurns, CRATE.maxTurns);
}

/** HP 0 이하·낙하가 생기면 즉시 승패를 정한다. 둘 다 쓰러지면 공격한 쪽이 이긴다. */
function checkGameOver(state: GameState, events: GameEvent[]): boolean {
  if (state.phase === "gameOver") return true;
  const downPlayer = state.tanks.player.hp <= 0 || state.tanks.player.fell;
  const downAi = state.tanks.ai.hp <= 0 || state.tanks.ai.fell;
  if (!downPlayer && !downAi) return false;
  const winner: Side = downPlayer && downAi ? state.turn : downPlayer ? "ai" : "player";
  const loser = state.tanks[other(winner)];
  state.phase = "gameOver";
  state.winner = winner;
  state.endReason = loser.fell ? "fell" : "hp";
  state.projectiles = [];
  state.pending = [];
  state.armedSlot = null;
  events.push({ type: "gameOver", winner, reason: state.endReason });
  return true;
}

// ── 낙하 ──

function updateTankFall(state: GameState, tank: Tank, dt: number, events: GameEvent[]) {
  if (tank.fell) return;
  const support = supportY(state.terrain, tank.x);
  if (!tank.falling) {
    if (tank.y >= support - 0.5) return;
    tank.falling = true;
    tank.fallStartY = tank.y;
    tank.vy = 0;
  }
  tank.vy += PHYSICS.gravity * 1.4 * dt;
  tank.y += tank.vy * dt;
  if (support < WORLD_H && tank.y >= support) {
    tank.y = support;
    tank.falling = false;
    tank.vy = 0;
    const height = tank.y - tank.fallStartY;
    if (height > DAMAGE.fallSafe) {
      const damage = Math.round(Math.min(DAMAGE.fallMax, DAMAGE.fallMin + (height - DAMAGE.fallSafe) * DAMAGE.fallPerPx));
      tank.hp = Math.max(0, tank.hp - damage);
      events.push({ type: "fallDamage", target: tank.side, damage });
    }
  } else if (tank.y > WORLD_H + 40) {
    tank.fell = true;
    tank.falling = false;
    tank.hp = 0;
    events.push({ type: "fellOff", target: tank.side });
  }
}

function updateCrate(state: GameState, dt: number, events: GameEvent[]) {
  const crate = state.crate;
  if (!crate) return;
  const support = supportY(state.terrain, crate.x, CRATE.halfSize - 2);
  if (crate.landing) {
    crate.y += CRATE.fallSpeed * dt;
  } else if (crate.y < support - 0.5) {
    crate.vy += PHYSICS.gravity * dt;
    crate.y += crate.vy * dt;
  } else return;
  if (support < WORLD_H && crate.y >= support) {
    crate.y = support;
    crate.vy = 0;
    crate.landing = false;
  } else if (crate.y > WORLD_H + 30) {
    events.push({ type: "crateDestroyed" });
    removeCrate(state);
  }
}

function spawnCrate(state: GameState, events: GameEvent[]) {
  const left = state.tanks.player.x + CRATE.tankClearance;
  const right = state.tanks.ai.x - CRATE.tankClearance;
  for (let attempt = 0; attempt < 8; attempt++) {
    const x = Math.round(left + random(state) * (right - left));
    if (supportY(state.terrain, x, CRATE.halfSize) >= WORLD_H - 4) continue;
    state.crate = { x, y: -20, vy: 0, landing: true };
    events.push({ type: "crateSpawn", x });
    return;
  }
  state.crateIn = 1;
}

// ── 턴 ──

function anythingMoving(state: GameState): boolean {
  return (
    state.projectiles.length > 0 ||
    state.pending.length > 0 ||
    state.tanks.player.falling ||
    state.tanks.ai.falling ||
    (state.crate !== null && (state.crate.landing || state.crate.vy > 0))
  );
}

function startTurn(state: GameState, side: Side, events: GameEvent[]) {
  const field = FIELDS[state.field];
  state.turn = side;
  state.armedSlot = null;
  state.aimAssistShot = false;
  state.wind = rollWind(state, state.wind + randomInt(state, -field.windDrift, field.windDrift));
  if (!state.crate) {
    state.crateIn--;
    if (state.crateIn <= 0) spawnCrate(state, events);
  }
  grantFromEnergy(state, side, events);
  events.push({ type: "turnStart", side, wind: state.wind });
  if (side === "player") {
    state.phase = "playerAim";
    return;
  }
  // AI: 바뀐 지형·바람으로 탄도를 다시 계산한 뒤 약 1초 동안 포신을 돌리며 조준한다.
  state.phase = "aiAim";
  state.aiTimer = 0;
  state.aiAimFrom = state.tanks.ai.angle;
  state.aiPlan = planAiShot(state);
}

export function togglePause(state: GameState) {
  if (state.phase === "gameOver") return;
  state.paused = !state.paused;
}

export function pause(state: GameState) {
  if (state.phase !== "gameOver") state.paused = true;
}

/** 고정 시간 간격(PHYSICS.fixedDt)마다 호출한다. */
export function stepGame(state: GameState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.paused || state.phase === "gameOver") return events;
  state.time += dt;

  if (state.phase === "aiAim" && state.aiPlan) {
    const plan = state.aiPlan;
    state.aiTimer += dt;
    const t = Math.min(1, state.aiTimer / TIMING.aiAim);
    const eased = t * t * (3 - 2 * t);
    const ai = state.tanks.ai;
    ai.angle = state.aiAimFrom + (plan.angle - state.aiAimFrom) * eased;
    if (state.aiTimer >= TIMING.aiAim) {
      ai.angle = plan.angle;
      ai.power = plan.power;
      state.armedSlot = plan.item ? ai.inventory.indexOf(plan.item) : null;
      if (state.armedSlot === -1) state.armedSlot = null;
      state.ai.shots++;
      shoot(state, events);
      state.aiPlan = null;
    }
    return events;
  }

  if (state.phase !== "resolving") return events;

  for (const shell of state.pending) shell.delay -= dt;
  for (const shell of state.pending.filter((s) => s.delay <= 0)) {
    const { x, y } = spawnProjectile(state, shell.owner, shell.angle, shell.power, shell.damageScale, shell.windScale);
    events.push({ type: "fire", side: shell.owner, x, y, angle: shell.angle, double: true, item: null });
  }
  state.pending = state.pending.filter((s) => s.delay > 0);

  const world = worldOf(state);
  for (const projectile of [...state.projectiles]) {
    const impact = stepBody(projectile as Body, world, dt);
    if (!impact) continue;
    state.projectiles = state.projectiles.filter((p) => p !== projectile);
    if (impact.kind === "out") events.push({ type: "projectileLost", owner: projectile.owner });
    else explode(state, projectile, impact, events);
    world.crate = state.crate;
    if (checkGameOver(state, events)) return events;
  }

  for (const side of ["player", "ai"] as const) updateTankFall(state, state.tanks[side], dt, events);
  updateCrate(state, dt, events);
  if (checkGameOver(state, events)) return events;

  if (anythingMoving(state)) {
    state.settleTimer = 0;
    return events;
  }
  state.settleTimer += dt;
  if (state.settleTimer >= TIMING.settle) {
    state.turnCount++;
    startTurn(state, other(state.turn), events);
  }
  return events;
}
