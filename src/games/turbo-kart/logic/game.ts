import { DIFFICULTY, HELPFUL_ITEMS, ITEM_FX, ITEM_ODDS, KART, NEEDS_TARGET_AHEAD, NEEDS_TARGET_BEHIND, RACE, RECOVERY } from "../config";
import type { Difficulty, DriveInput, DriverId, ItemId, Kart, RaceEvent, RaceResult, RaceState, TrackId } from "../types";
import { ITEM_IDS } from "../types";
import { aiInput, createAiMemory, type AiMemory } from "./ai";
import { driveKart, moveKart, NO_INPUT, resolveKarts, type DriveEnv } from "./physics";
import { random, weightedPick } from "./rng";
import { buildTrack, deltaS, layoutFor, pointAt, projectProgress, roadAt, SAMPLE_STEP, wallContact, wrapS, type BuiltTrack } from "./track";

/*
 * Turbo Kart 레이스 규칙 (순수 함수, React·Canvas 의존 없음).
 *
 * 진행·순위: 카트마다 "진행 거리(dist)"를 둔다. 매 스텝 메인 코스 위 위치 s를 직전 위치 주변에서만 다시 찾고
 * 변화량만큼 dist를 더한다(역주행하면 줄어든다). 체크포인트는 dist가 다음 체크포인트 위치를 넘을 때 하나씩만 통과로 센다.
 * 그래서 순서를 건너뛸 수 없고, 결승선을 앞뒤로 오가도 다음 체크포인트를 지나기 전에는 바퀴 수가 늘지 않는다.
 * 순위 = 완주한 카트(완주 시간 순) → 나머지는 dist 순.
 */

export const DRIVER_ORDER: DriverId[] = ["bolt", "luna", "dash", "player"];

export interface RaceOptions {
  track: TrackId;
  difficulty: Difficulty;
  seed: number;
  /** 테스트용: 플레이어 자리도 AI가 운전 */
  autopilot?: boolean;
}

/** AI 회피용: 장애물의 코스 위 위치(s)와 좌우 위치(-1~1). 지름길 위 장애물은 onShortcut */
export interface HazardInfo {
  s: number;
  lateral: number;
  r: number;
  onShortcut: boolean;
  /** 지름길 위 장애물이면 지름길 샘플 번호 */
  shortIndex: number;
}

export interface Race {
  state: RaceState;
  track: BuiltTrack;
  env: DriveEnv;
  ai: AiMemory[];
  autopilot: boolean;
  obstacleInfo: HazardInfo[];
}

export function nearestShortcutIndex(track: BuiltTrack, x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  track.shortcut.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** 점의 코스 위 좌우 위치 (-1 = 왼쪽 끝, 1 = 오른쪽 끝) */
export function lateralOf(track: BuiltTrack, s: number, x: number, y: number): number {
  const p = pointAt(track, s, 0);
  return ((x - p.x) * -p.ty + (y - p.y) * p.tx) / p.half;
}

function newKart(id: DriverId, index: number, x: number, y: number, heading: number, s: number, sample: number, dist: number): Kart {
  return {
    id,
    index,
    x,
    y,
    heading,
    vx: 0,
    vy: 0,
    drifting: false,
    driftDir: 0,
    driftCharging: false,
    gauge: 0,
    boostTime: 0,
    boostCooldown: 0,
    turboTime: 0,
    windTime: 0,
    shieldTime: 0,
    slowTime: 0,
    spinTime: 0,
    smokeTime: 0,
    protectTime: 0,
    wallTime: 0,
    frozenTime: 0,
    item: null,
    s,
    dist,
    sample,
    passed: 0,
    finished: false,
    finishTime: null,
    stuckTime: 0,
    bestDist: dist,
    wrongWayTime: 0,
    surface: "road",
    recoveries: 0,
  };
}

export function createRace({ track: trackId, difficulty, seed, autopilot = false }: RaceOptions): Race {
  const track = buildTrack(trackId);
  const layout = layoutFor(track, difficulty);
  // 출발 격자: 결승선 뒤 2열 × 2칸. 플레이어는 맨 뒤 줄에서 출발한다.
  const slots = [
    { back: 50, lateral: -0.38 },
    { back: 50, lateral: 0.38 },
    { back: 110, lateral: -0.38 },
    { back: 110, lateral: 0.38 },
  ];
  const karts = DRIVER_ORDER.map((id, index) => {
    const slot = slots[index];
    const s = wrapS(-slot.back, track.length);
    const p = pointAt(track, s, slot.lateral);
    return newKart(id, index, p.x, p.y, Math.atan2(p.ty, p.tx), s, Math.round(s / SAMPLE_STEP) % track.main.length, -slot.back);
  });
  const state: RaceState = {
    phase: "countdown",
    paused: false,
    track: trackId,
    difficulty,
    laps: RACE.laps,
    rng: seed | 0,
    countdown: RACE.countdown,
    time: 0,
    karts,
    projectiles: [],
    oils: [],
    boxes: layout.boxes,
    movers: layout.movers,
    nextId: 1,
    results: null,
    raceId: `${trackId}-${difficulty}-${(seed >>> 0).toString(36)}`,
  };
  const env: DriveEnv = { track, difficulty, obstacles: layout.obstacles, movers: state.movers };
  const obstacleInfo = layout.obstacles.map((o) => {
    const road = roadAt(track, o.x, o.y);
    const s = road?.s ?? 0;
    if (road?.onShortcut) {
      const shortIndex = nearestShortcutIndex(track, o.x, o.y);
      const p = track.shortcut[shortIndex];
      return { s, lateral: ((o.x - p.x) * -p.ty + (o.y - p.y) * p.tx) / p.half, r: o.r, onShortcut: true, shortIndex };
    }
    return { s, lateral: lateralOf(track, s, o.x, o.y), r: o.r, onShortcut: false, shortIndex: -1 };
  });
  return { state, track, env, ai: karts.map((k) => createAiMemory(k.id)), autopilot, obstacleInfo };
}

export const PLAYER = 3;

// ── 진행·순위 ──

/** g번째(0 = 출발선 첫 통과) 체크포인트의 진행 거리 */
export function checkpointDist(track: BuiltTrack, g: number): number {
  const n = track.checkpoints.length;
  return Math.floor(g / n) * track.length + track.checkpoints[g % n];
}

export function currentLap(kart: Kart, laps: number): number {
  if (kart.passed <= 0) return 1;
  return Math.min(laps, Math.floor((kart.passed - 1) / RACE.checkpoints) + 1);
}

/** 순위대로 정렬한 카트 번호 */
export function standings(state: RaceState): number[] {
  return [...state.karts]
    .sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.dist - a.dist;
    })
    .map((k) => k.index);
}

export function rankOf(state: RaceState, index: number): number {
  return standings(state).indexOf(index) + 1;
}

function updateProgress(race: Race, kart: Kart, events: RaceEvent[]) {
  const { track, state } = race;
  const proj = projectProgress(track, kart.x, kart.y, kart.sample);
  const ds = deltaS(kart.s, proj.s, track.length);
  kart.s = proj.s;
  kart.sample = proj.index;
  kart.dist += ds;
  const total = state.laps * RACE.checkpoints;
  while (!kart.finished && kart.dist >= checkpointDist(track, kart.passed)) {
    kart.passed++;
    const g = kart.passed - 1;
    if (g > 0 && g % RACE.checkpoints === 0 && g < total) events.push({ type: "lap", kart: kart.index, lap: g / RACE.checkpoints + 1 });
    if (g >= total) {
      kart.finished = true;
      kart.finishTime = state.time;
      const rank = state.karts.filter((k) => k.finished).length;
      events.push({ type: "finish", kart: kart.index, rank, time: state.time });
    }
  }
  // 역주행 감지: 진행 방향과 코스 방향이 반대이고 실제로 움직이는 중
  const t = track.main[kart.sample];
  const dot = Math.cos(kart.heading) * t.tx + Math.sin(kart.heading) * t.ty;
  const moving = Math.hypot(kart.vx, kart.vy) > 40;
  if (dot < -0.3 && moving && ds < 0) {
    kart.wrongWayTime += RACE.fixedDt;
    if (Math.abs(kart.wrongWayTime - RECOVERY.wrongWaySeconds) < RACE.fixedDt / 2) events.push({ type: "wrongWay", kart: kart.index });
  } else kart.wrongWayTime = 0;
}

/** 막힘·코스 이탈 복구: 마지막으로 통과한 체크포인트 근처, 다른 카트와 겹치지 않는 자리, 코스 방향으로. 진행 거리는 그 위치로 되돌리고 잠시 멈춘다. */
export function recoverKart(race: Race, kart: Kart, events: RaceEvent[]) {
  const { track, state } = race;
  const g = Math.max(0, kart.passed - 1);
  const dist = kart.passed > 0 ? checkpointDist(track, g) + 20 : kart.dist;
  const s = wrapS(dist, track.length);
  const lanes = [0, -0.45, 0.45, -0.75, 0.75];
  let spot = pointAt(track, s, 0);
  const clear = (x: number, y: number) =>
    state.karts.every((k) => k === kart || Math.hypot(k.x - x, k.y - y) > KART.radius * 2.6) &&
    race.env.obstacles.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + KART.radius + 30);
  for (const lane of lanes) {
    const p = pointAt(track, s, lane);
    if (clear(p.x, p.y)) {
      spot = p;
      break;
    }
  }
  kart.x = spot.x;
  kart.y = spot.y;
  kart.heading = Math.atan2(spot.ty, spot.tx);
  kart.vx = 0;
  kart.vy = 0;
  kart.s = s;
  kart.sample = Math.round(s / SAMPLE_STEP) % track.main.length;
  kart.dist = Math.min(kart.dist, dist);
  kart.bestDist = kart.dist;
  kart.stuckTime = 0;
  kart.frozenTime = RECOVERY.freeze;
  kart.boostTime = 0;
  kart.turboTime = 0;
  kart.windTime = 0;
  kart.drifting = false;
  kart.spinTime = 0;
  kart.recoveries++;
  events.push({ type: "recover", kart: kart.index });
}

// ── 아이템 ──

function hasAhead(state: RaceState, rank: number) {
  return rank > 1 && state.karts.some((k) => !k.finished && rankOf(state, k.index) < rank);
}

/** 순위별 확률표에서 지금 쓸 수 있는 아이템만 남겨 뽑는다. */
export function itemWeights(state: RaceState, kart: Kart): Partial<Record<ItemId, number>> {
  const rank = rankOf(state, kart.index);
  const col = Math.min(4, rank) - 1;
  const helpful = DIFFICULTY[state.difficulty].helpfulItemScale;
  const ahead = rank > 1;
  const behind = rank < state.karts.length;
  const weights: Partial<Record<ItemId, number>> = {};
  for (const item of ITEM_IDS) {
    let w = ITEM_ODDS[item][col];
    if (NEEDS_TARGET_AHEAD.includes(item) && !ahead) w = 0;
    if (NEEDS_TARGET_BEHIND.includes(item) && !behind) w = 0;
    if (HELPFUL_ITEMS.includes(item)) w *= helpful;
    weights[item] = w;
  }
  return weights;
}

/** 지금 쓸 수 있는 아이템인지 (대상이 있어야 하는 아이템) */
export function canUseItem(state: RaceState, kart: Kart): boolean {
  if (!kart.item || kart.frozenTime > 0 || state.phase !== "racing") return false;
  const rank = rankOf(state, kart.index);
  if (NEEDS_TARGET_AHEAD.includes(kart.item)) return hasAhead(state, rank);
  if (NEEDS_TARGET_BEHIND.includes(kart.item)) return standings(state).slice(rank).some((i) => !state.karts[i].finished);
  return true;
}

export function useItem(race: Race, kart: Kart, events: RaceEvent[]): boolean {
  const { state } = race;
  if (!canUseItem(state, kart)) return false;
  const item = kart.item!;
  kart.item = null;
  events.push({ type: "itemUse", kart: kart.index, item });
  const fx = Math.cos(kart.heading);
  const fy = Math.sin(kart.heading);
  switch (item) {
    case "turboBoost":
      kart.turboTime = ITEM_FX.turboTime;
      break;
    case "speedWind":
      kart.windTime = ITEM_FX.windTime;
      break;
    case "shield":
      kart.shieldTime = ITEM_FX.shieldTime;
      break;
    case "quickRepair":
      kart.slowTime = 0;
      kart.spinTime = 0;
      kart.smokeTime = 0;
      break;
    case "snowBomb": {
      // 앞쪽 30° 안에 있는 가장 가까운 카트 방향으로, 없으면 정면으로 던진다
      let heading = kart.heading;
      let best = Infinity;
      for (const other of state.karts) {
        if (other === kart) continue;
        const dx = other.x - kart.x;
        const dy = other.y - kart.y;
        const d = Math.hypot(dx, dy);
        const cos = (dx * fx + dy * fy) / (d || 1);
        if (cos > Math.cos(Math.PI / 6) && d < best && d < 700) {
          best = d;
          heading = Math.atan2(dy, dx);
        }
      }
      state.projectiles.push({ id: state.nextId++, kind: "snowBomb", owner: kart.index, target: null, x: kart.x + fx * 18, y: kart.y + fy * 18, heading, life: ITEM_FX.snowBombLife, sample: kart.sample, age: 0 });
      break;
    }
    case "homingRocket": {
      const order = standings(state);
      const target = order[order.indexOf(kart.index) - 1] ?? null;
      state.projectiles.push({ id: state.nextId++, kind: "homingRocket", owner: kart.index, target, x: kart.x + fx * 18, y: kart.y + fy * 18, heading: kart.heading, life: ITEM_FX.rocketLife, sample: kart.sample, age: 0 });
      break;
    }
    case "oilSlick": {
      const x = kart.x - fx * 30;
      const y = kart.y - fy * 30;
      const s = wrapS(kart.s - 30, race.track.length);
      state.oils.push({ id: state.nextId++, owner: kart.index, x, y, life: ITEM_FX.oilLife, s, lateral: lateralOf(race.track, s, x, y) });
      break;
    }
    case "smokeScreen": {
      for (const other of state.karts) {
        if (other === kart || other.finished) continue;
        const gap = kart.dist - other.dist;
        if (gap > 0 && gap < ITEM_FX.smokeRange) other.smokeTime = ITEM_FX.smokeTime;
      }
      break;
    }
  }
  return true;
}

/** 공격(Snow Bomb·Homing Rocket·Oil Slick)에 맞음. 보호 시간 중이면 무시, Shield가 있으면 1회 막는다. */
export function hitKart(kart: Kart, by: ItemId, events: RaceEvent[]): boolean {
  if (kart.protectTime > 0 || kart.frozenTime > 0) return false;
  if (kart.shieldTime > 0) {
    kart.shieldTime = 0;
    kart.protectTime = 0.6;
    events.push({ type: "hit", kart: kart.index, by, blocked: true });
    return true;
  }
  const scale = (k: number) => {
    kart.vx *= k;
    kart.vy *= k;
  };
  if (by === "snowBomb") {
    kart.slowTime = ITEM_FX.snowSlowTime;
    scale(0.6);
  } else if (by === "homingRocket") {
    kart.slowTime = ITEM_FX.rocketSlowTime;
    kart.spinTime = ITEM_FX.rocketSpinTime;
    scale(0.4);
  } else if (by === "oilSlick") {
    kart.spinTime = ITEM_FX.oilSpinTime;
    scale(0.6);
  }
  kart.drifting = false;
  kart.protectTime = ITEM_FX.protectTime;
  events.push({ type: "hit", kart: kart.index, by, blocked: false });
  return true;
}

function updateProjectiles(race: Race, dt: number, events: RaceEvent[]) {
  const { state, track } = race;
  const keep = [];
  for (const p of state.projectiles) {
    p.life -= dt;
    p.age += dt;
    const speed = p.kind === "snowBomb" ? ITEM_FX.snowBombSpeed : ITEM_FX.rocketSpeed;
    if (p.kind === "homingRocket") {
      const target = p.target !== null ? state.karts[p.target] : null;
      const proj = projectProgress(track, p.x, p.y, p.sample, 30);
      p.sample = proj.index;
      let aimX: number;
      let aimY: number;
      if (target && hasLineOfSight(track, p.x, p.y, target.x, target.y)) {
        aimX = target.x;
        aimY = target.y;
      } else {
        // 대상이 벽 너머면 코스를 따라 앞쪽으로
        const ahead = pointAt(track, proj.s + 140);
        aimX = ahead.x;
        aimY = ahead.y;
      }
      const want = Math.atan2(aimY - p.y, aimX - p.x);
      let diff = want - p.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.heading += Math.max(-ITEM_FX.rocketTurn * dt, Math.min(ITEM_FX.rocketTurn * dt, diff));
    }
    p.x += Math.cos(p.heading) * speed * dt;
    p.y += Math.sin(p.heading) * speed * dt;
    let alive = p.life > 0 && wallContact(track, p.x, p.y, -6) === null;
    if (alive && race.env.obstacles.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < o.r + ITEM_FX.projectileRadius)) alive = false;
    if (alive) {
      for (const kart of state.karts) {
        if (kart.index === p.owner && p.age < 0.3) continue;
        if (kart.finished) continue;
        if (Math.hypot(kart.x - p.x, kart.y - p.y) < KART.radius + ITEM_FX.projectileRadius) {
          hitKart(kart, p.kind, events);
          alive = false;
          break;
        }
      }
    }
    if (alive) keep.push(p);
  }
  state.projectiles = keep;
}

function hasLineOfSight(track: BuiltTrack, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(d / 30);
  for (let i = 1; i < steps; i++) {
    if (wallContact(track, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, 0) !== null) return false;
  }
  return true;
}

function updateBoxesAndOil(race: Race, dt: number, events: RaceEvent[]) {
  const { state } = race;
  for (const box of state.boxes) {
    if (box.respawn > 0) {
      box.respawn = Math.max(0, box.respawn - dt);
      continue;
    }
    for (const kart of state.karts) {
      if (kart.finished || Math.hypot(kart.x - box.x, kart.y - box.y) > KART.radius + ITEM_FX.boxRadius) continue;
      box.respawn = ITEM_FX.boxRespawn;
      // 아이템은 하나만: 이미 가지고 있으면 상자만 깨진다
      if (!kart.item) {
        const item = weightedPick(state, itemWeights(state, kart));
        if (item) {
          kart.item = item;
          events.push({ type: "itemGet", kart: kart.index, item });
        }
      }
      break;
    }
  }
  const oils = [];
  for (const oil of state.oils) {
    oil.life -= dt;
    let alive = oil.life > 0;
    for (const kart of state.karts) {
      if (!alive) break;
      if (kart.finished || (kart.index === oil.owner && oil.life > ITEM_FX.oilLife - 1)) continue;
      if (Math.hypot(kart.x - oil.x, kart.y - oil.y) < ITEM_FX.oilRadius + KART.radius * 0.5) {
        if (hitKart(kart, "oilSlick", events)) alive = false;
      }
    }
    if (alive) oils.push(oil);
  }
  state.oils = oils;
}

function updateMovers(race: Race) {
  const { state } = race;
  for (const m of state.movers) {
    const offset = Math.sin((state.time / m.period) * Math.PI * 2 + m.phase) * m.amplitude;
    m.x = m.cx + m.nx * offset;
    m.y = m.cy + m.ny * offset;
  }
}

/** 플레이어가 완주하면 순위를 확정한다. 아직 달리는 AI는 지금까지 평균 속도로 남은 거리를 달린다고 보고 기록을 추정한다. */
function finalizeResults(race: Race): RaceResult[] {
  const { state, track } = race;
  const total = state.laps * track.length;
  const entries = state.karts.map((k) => {
    if (k.finished) return { index: k.index, id: k.id, time: k.finishTime!, estimated: false };
    const avg = Math.max(60, k.dist / Math.max(1, state.time));
    return { index: k.index, id: k.id, time: state.time + Math.max(0, total - k.dist) / avg, estimated: true };
  });
  entries.sort((a, b) => a.time - b.time);
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}

export function togglePause(state: RaceState) {
  if (state.phase !== "finished") state.paused = !state.paused;
}

export function pause(state: RaceState) {
  if (state.phase !== "finished") state.paused = true;
}

/** 고정 시간 간격(RACE.fixedDt)마다 호출한다. */
export function stepRace(race: Race, playerInput: DriveInput, dt: number): RaceEvent[] {
  const { state, env } = race;
  const events: RaceEvent[] = [];
  if (state.paused) return events;

  if (state.phase === "countdown") {
    const before = Math.ceil(state.countdown);
    state.countdown -= dt;
    const after = Math.ceil(state.countdown);
    if (after !== before && after > 0) events.push({ type: "countdown", value: after });
    if (state.countdown <= 0) {
      state.phase = "racing";
      events.push({ type: "go" });
    }
    updateMovers(race);
    return events;
  }

  state.time += dt;
  updateMovers(race);

  const inputs = state.karts.map((kart) => {
    if (kart.index === PLAYER && !race.autopilot && !kart.finished) return playerInput;
    if (kart.finished && kart.index !== PLAYER && state.phase === "finished") return NO_INPUT;
    return aiInput(race, kart, race.ai[kart.index]);
  });

  state.karts.forEach((kart, i) => {
    const input = inputs[i];
    if (input.item && kart.item) useItem(race, kart, events);
    driveKart(kart, input, env, dt, events);
  });

  const sub = dt / RACE.substeps;
  for (let k = 0; k < RACE.substeps; k++) {
    for (const kart of state.karts) {
      if (!moveKart(kart, env, sub, events)) recoverKart(race, kart, events);
    }
    resolveKarts(state.karts, events);
  }

  for (const kart of state.karts) {
    if (roadAt(race.track, kart.x, kart.y) === null) recoverKart(race, kart, events);
    updateProgress(race, kart, events);
    // 막힘 감지 (출발 직후·복구 대기 중·완주 후 제외)
    if (kart.frozenTime > 0 || kart.finished) {
      kart.stuckTime = 0;
      kart.bestDist = Math.max(kart.bestDist, kart.dist);
    } else if (kart.dist > kart.bestDist + RECOVERY.stuckDistance) {
      kart.bestDist = kart.dist;
      kart.stuckTime = 0;
    } else {
      kart.stuckTime += dt;
      if (kart.stuckTime > RECOVERY.stuckSeconds) recoverKart(race, kart, events);
    }
  }

  updateProjectiles(race, dt, events);
  updateBoxesAndOil(race, dt, events);

  const player = state.karts[PLAYER];
  if (state.phase === "racing" && player.finished) {
    state.phase = "finished";
    state.results = finalizeResults(race);
    const mine = state.results.find((r) => r.index === PLAYER)!;
    events.push({ type: "raceOver", playerRank: mine.rank, playerTime: mine.time });
  }
  return events;
}

/** 시드 고정 난수 (AI 실수 등) */
export function raceRandom(race: Race): number {
  return random(race.state);
}
