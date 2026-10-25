import { KART } from "../config";
import type { DriveInput, DriverId, Kart } from "../types";
import type { Race } from "./game";
import { canUseItem, lateralOf, nearestShortcutIndex, rankOf, standings } from "./game";
import { random } from "./rng";
import { deltaS, pointAt, roadAt, surfaceAt } from "./track";

/*
 * AI 운전 (플레이어와 같은 DriveInput → 같은 물리·충돌 규칙). 최고 속도·가속 같은 물리 값은 성향과 난이도에 관계없이 같다.
 *
 * 1. 앞쪽 목표점: 코스 중심선(또는 지름길)을 따라 속도에 비례한 거리만큼 앞의 점 → 조향
 * 2. 곡률 감속: 앞쪽 경로의 꺾임 각도로 목표 속도를 정하고, 넘으면 브레이크
 * 3. 회피: 앞쪽 코스 위 장애물·움직이는 장애물·오일·카트의 좌우 위치를 보고 비용이 가장 낮은 차선을 고른다
 *    (커브에서도 진행 방향이 아니라 코스 기준으로 판단). 바로 앞 위험은 핸들을 직접 틀어 피한다
 * 4. 아이템 상자 접근, 성향별 아이템 사용 (대상이 있을 때만)
 * 5. 급커브에서 드리프트, 직선에서 부스터
 * 6. 막히면 잠시 후진. 그래도 못 빠져나오면 공통 복구 규칙(game.ts)이 처리한다
 */

export interface Personality {
  /** 코너 목표 속도 배율 (낮을수록 조심스럽게) */
  caution: number;
  /** 급커브에서 실수할 확률 */
  mistakeChance: number;
  useShortcut: boolean;
  /** 장애물·카트 회피 세기 */
  avoid: number;
  avoidKarts: boolean;
  /** 앞 카트에 붙으려는 정도 */
  chase: number;
  /** 공격 아이템을 들고 기다리는 시간 */
  attackDelay: number;
  /** 부스터를 쓰는 직선 판정 각도 */
  boostAngle: number;
}

export const PERSONALITIES: Record<DriverId, Personality> = {
  // Bolt (공격형): 공격 아이템 즉시 사용, 다른 카트 쪽으로 붙는다, 코너에서 가끔 실수
  bolt: { caution: 1, mistakeChance: 0.18, useShortcut: false, avoid: 0.75, avoidKarts: false, chase: 0.35, attackDelay: 0, boostAngle: 0.3 },
  // Luna (안정형): 장애물 회피 우선, 조심스러운 코너, 방어 아이템을 잘 쓴다
  luna: { caution: 0.94, mistakeChance: 0.02, useShortcut: false, avoid: 1.1, avoidKarts: true, chase: 0, attackDelay: 1.5, boostAngle: 0.25 },
  // Dash (도전형): 지름길·부스터 적극 사용, 위험한 코너에서 가끔 실수
  dash: { caution: 1.03, mistakeChance: 0.14, useShortcut: true, avoid: 0.85, avoidKarts: true, chase: 0, attackDelay: 1, boostAngle: 0.45 },
  // 테스트 자동 주행용 (플레이어 자리)
  player: { caution: 0.97, mistakeChance: 0, useShortcut: false, avoid: 1, avoidKarts: true, chase: 0, attackDelay: 1, boostAngle: 0.3 },
};

export interface AiMemory {
  id: DriverId;
  /** 지금 따라가는 차선 (-1 왼쪽 ~ 1 오른쪽) */
  lane: number;
  /** 장애물에 막혔을 때 빠져나갈 방향(1 = 오른쪽)과 남은 시간 */
  escapeSide: number;
  escapeTime: number;
  /** 앞쪽 가장 가까운 위험까지 거리 (목표점을 당기는 데 쓴다) */
  hazardAhead: number;
  mistakeTime: number;
  lastCorner: number;
  reverseTime: number;
  itemHeld: number;
  /** 통계 (테스트 보고용) */
  drifts: number;
  boosts: number;
  itemsUsed: number;
  wasDrifting: boolean;
}

export function createAiMemory(id: DriverId): AiMemory {
  return { id, lane: 0, escapeSide: 0, escapeTime: 0, hazardAhead: Infinity, mistakeTime: 0, lastCorner: -1, reverseTime: 0, itemHeld: 0, drifts: 0, boosts: 0, itemsUsed: 0, wasDrifting: false };
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** 경로 위 ahead(px) 앞의 점. 지름길을 쓰기로 했으면 지름길을 따라간다. */
export function pathPoint(race: Race, kart: Kart, ahead: number, lane: number, shortcut: boolean): { x: number; y: number } {
  const { track } = race;
  if (shortcut) {
    const toEntry = deltaS(kart.s, track.shortcutFrom, track.length);
    const onShortcut = roadAt(track, kart.x, kart.y)?.onShortcut ?? false;
    let index = -1;
    if (onShortcut) {
      let best = Infinity;
      track.shortcut.forEach((p, i) => {
        const d = (p.x - kart.x) ** 2 + (p.y - kart.y) ** 2;
        if (d < best) {
          best = d;
          index = i;
        }
      });
      index += Math.round(ahead / 8);
    } else if (toEntry >= -10 && toEntry < ahead) {
      index = Math.round((ahead - Math.max(0, toEntry)) / 8);
    }
    if (index >= 0) {
      if (index < track.shortcut.length) {
        const q = track.shortcut[index];
        return { x: q.x - q.ty * lane * q.half, y: q.y + q.tx * lane * q.half };
      }
      return pointAt(track, track.shortcutTo + (index - track.shortcut.length) * 8, lane);
    }
  }
  return pointAt(track, kart.s + ahead, lane);
}

export function aiInput(race: Race, kart: Kart, memory: AiMemory): DriveInput {
  const { state, track, env } = race;
  const p = PERSONALITIES[memory.id];
  const dt = 1 / 60;
  const input: DriveInput = { throttle: true, brake: false, steer: 0, boost: false, item: false };
  if (kart.frozenTime > 0) return { ...input, throttle: false };

  const fx = Math.cos(kart.heading);
  const fy = Math.sin(kart.heading);
  const speed = kart.vx * fx + kart.vy * fy;

  // 지름길: Dash만, 그리고 진입 지점 근처에서만 결정
  const toEntry = deltaS(kart.s, track.shortcutFrom, track.length);
  const useShortcut = p.useShortcut && (toEntry > -20 || (roadAt(track, kart.x, kart.y)?.onShortcut ?? false)) && (toEntry < 400 || (roadAt(track, kart.x, kart.y)?.onShortcut ?? false));

  // 3. 차선 선택: 앞쪽 위험의 코스 기준 좌우 위치로 비용이 가장 낮은 차선을 고른다
  const onShortcutNow = roadAt(track, kart.x, kart.y)?.onShortcut ?? false;
  {
    const ahead: { ds: number; lateral: number; r: number }[] = [];
    const reach = 300;
    let half: number;
    let lanes: number[];
    if (onShortcutNow || (useShortcut && toEntry >= 0 && toEntry < reach)) {
      // 지름길: 폭이 좁으므로 세 차선만. 진입 전이면 입구까지 남은 거리만큼 당겨서 본다.
      const kartIndex = onShortcutNow ? nearestShortcutIndex(track, kart.x, kart.y) : -Math.round(toEntry / 8);
      for (const o of race.obstacleInfo) {
        if (!o.onShortcut) continue;
        const ds = (o.shortIndex - kartIndex) * 8;
        if (ds > -25 && ds < reach) ahead.push({ ds, lateral: o.lateral, r: o.r });
      }
      half = track.def.shortcut.halfWidth;
      lanes = [-0.5, 0, 0.5];
    } else {
      const consider = (s: number, lateral: number, r: number) => {
        const ds = deltaS(kart.s, s, track.length);
        if (ds > -25 && ds < reach) ahead.push({ ds, lateral, r });
      };
      race.obstacleInfo.forEach((o) => !o.onShortcut && consider(o.s, o.lateral, o.r));
      for (const m of state.movers) {
        const road = roadAt(track, m.cx, m.cy);
        if (!road) continue;
        // 움직이는 장애물: 지금이 아니라 도착할 때쯤의 위치를 예측한다
        const ds = deltaS(kart.s, road.s, track.length);
        const eta = Math.max(0, ds) / Math.max(120, speed);
        const offset = Math.sin(((state.time + eta) / m.period) * Math.PI * 2 + m.phase) * m.amplitude;
        consider(road.s, offset / road.half, m.r + 12);
      }
      for (const oil of state.oils) consider(oil.s, oil.lateral, 24);
      if (p.avoidKarts) for (const other of state.karts) if (other !== kart) consider(other.s, lateralOf(track, other.s, other.x, other.y), KART.radius);
      half = pointAt(track, kart.s).half;
      lanes = [-0.65, -0.35, 0, 0.35, 0.65];
    }
    let best = memory.lane;
    let bestCost = Infinity;
    memory.hazardAhead = Infinity;
    for (const h of ahead) {
      if (h.ds > 0 && Math.abs(memory.lane - h.lateral) < (h.r + KART.radius + 16) / half + 0.35) memory.hazardAhead = Math.min(memory.hazardAhead, h.ds);
    }
    for (const lane of lanes) {
      let cost = 0.15 * Math.abs(lane) + 0.25 * Math.abs(lane - memory.lane);
      for (const h of ahead) {
        const clearance = (h.r + KART.radius + 16) / half;
        const overlap = clearance - Math.abs(lane - h.lateral);
        if (overlap > 0) cost += overlap * 10 * p.avoid * (1.4 - Math.max(0, h.ds) / 300);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = lane;
      }
    }
    memory.lane += (best - memory.lane) * 0.12;
  }

  // 1. 목표점과 경로의 꺾임
  // 위험이 가까우면 목표점을 당겨 선택한 차선을 바로 따라가게 한다(커브 안쪽 장애물로 직진하지 않도록)
  const look = Math.min(70 + Math.max(0, speed) * 0.32, Math.max(45, memory.hazardAhead * 0.6));
  const lane = memory.lane;
  const target = pathPoint(race, kart, look, lane, useShortcut);
  const p1 = pathPoint(race, kart, 120, lane, useShortcut);
  const p2 = pathPoint(race, kart, 120 + Math.max(160, speed * 0.6), lane, useShortcut);
  const p3 = pathPoint(race, kart, 120 + Math.max(320, speed * 1.1), lane, useShortcut);
  const a1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const a2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
  const curve = Math.abs(wrapAngle(a2 - a1)) + 0.5 * Math.abs(wrapAngle(a1 - Math.atan2(p1.y - kart.y, p1.x - kart.x)));

  const want = Math.atan2(target.y - kart.y, target.x - kart.x);
  let steer = wrapAngle(want - kart.heading) * 2.6;

  // 3. 회피: 앞쪽 장애물·오일·(성향에 따라) 카트
  const rx = -fy;
  const ry = fx;
  const hazards: { x: number; y: number; r: number }[] = [
    ...env.obstacles,
    ...env.movers,
    ...state.oils.map((o) => ({ x: o.x, y: o.y, r: 22 })),
  ];
  if (p.avoidKarts) for (const other of state.karts) if (other !== kart) hazards.push({ x: other.x, y: other.y, r: KART.radius });
  const road = roadAt(track, kart.x, kart.y);
  const side = road ? Math.sign((kart.x - road.cx) * rx + (kart.y - road.cy) * ry) : 0;
  for (const h of hazards) {
    const dx = h.x - kart.x;
    const dy = h.y - kart.y;
    const along = dx * fx + dy * fy;
    if (along <= 0 || along > (onShortcutNow ? 200 : 80)) continue;
    const lat = dx * rx + dy * ry;
    const clearance = h.r + KART.radius + 14;
    if (Math.abs(lat) >= clearance) continue;
    const push = ((clearance - Math.abs(lat)) / clearance) * p.avoid * (along < 110 ? 1.4 : 0.8);
    const away = lat !== 0 ? -Math.sign(lat) : -side || 1;
    steer += away * push;
  }

  // 4. 아이템 상자 접근 / 앞 카트 추격(Bolt)
  if (!kart.item) {
    for (const box of state.boxes) {
      if (box.respawn > 0) continue;
      const dx = box.x - kart.x;
      const dy = box.y - kart.y;
      const along = dx * fx + dy * fy;
      const lat = dx * rx + dy * ry;
      if (along > 40 && along < 260 && Math.abs(lat) < 70) {
        steer += Math.max(-1, Math.min(1, lat / 60)) * 0.45;
        break;
      }
    }
  }
  if (p.chase > 0) {
    for (const other of state.karts) {
      if (other === kart) continue;
      const dx = other.x - kart.x;
      const dy = other.y - kart.y;
      const along = dx * fx + dy * fy;
      const lat = dx * rx + dy * ry;
      if (along > 50 && along < 260 && Math.abs(lat) < 90) steer += Math.max(-1, Math.min(1, lat / 80)) * p.chase;
    }
  }

  if (kart.smokeTime > 0) steer += Math.sin(state.time * 4 + kart.index) * 0.3;

  // 2. 곡률 감속 (노면이 미끄러우면 더 조심)
  const ahead = roadAt(track, p1.x, p1.y);
  const slick = surfaceAt(track, ahead, state.difficulty);
  // 조향은 부드럽게 반응하고 고속일수록 덜 돌므로(physics의 STEERING) 꺾임이 클수록 미리 충분히 감속한다
  let targetSpeed = KART.maxSpeed * Math.max(0.4, Math.min(1, 1.08 - curve * 0.85)) * p.caution;
  if (slick === "ice" || slick === "sand") targetSpeed *= 0.86;
  if (kart.smokeTime > 0) targetSpeed *= 0.88;

  // 급커브 실수 (Bolt·Dash): 늦은 감속과 덜 꺾기
  const corner = Math.floor(kart.dist / 400);
  if (curve > 0.85 && corner !== memory.lastCorner) {
    memory.lastCorner = corner;
    if (random(state) < p.mistakeChance) memory.mistakeTime = 0.45;
  }
  memory.mistakeTime = Math.max(0, memory.mistakeTime - dt);
  if (memory.mistakeTime > 0) {
    targetSpeed = KART.maxSpeed * 1.2;
    steer *= 0.6;
  }

  input.steer = Math.max(-1, Math.min(1, steer));
  if (speed > targetSpeed + 25) {
    input.throttle = false;
    input.brake = speed > targetSpeed + 60;
  }

  // 5. 드리프트(플레이어와 같은 자동 드리프트: 빠르게 크게 꺾으면 물리가 시작한다)·부스터
  if (kart.drifting && !memory.wasDrifting) memory.drifts++;
  memory.wasDrifting = kart.drifting;
  if (kart.gauge >= 100 && curve < p.boostAngle && kart.surface !== "offroad") {
    input.boost = true;
    memory.boosts++;
  }

  // 6. 막힘: 장애물에 정면으로 붙어 멈췄으면 머리를 장애물 반대쪽으로 돌리며 후진하고, 잠시 그쪽으로 빠져나간다
  if (memory.reverseTime === 0 && Math.abs(speed) < 30 && state.time > 0.5) {
    let contact: { lat: number } | null = null;
    for (const h of [...env.obstacles, ...env.movers, ...state.karts.filter((o) => o !== kart).map((o) => ({ x: o.x, y: o.y, r: KART.radius }))]) {
      const dx = h.x - kart.x;
      const dy = h.y - kart.y;
      if (Math.hypot(dx, dy) < h.r + KART.radius + 6 && dx * fx + dy * fy > 0) contact = { lat: dx * rx + dy * ry };
    }
    if (contact || kart.stuckTime > 1.3) {
      memory.reverseTime = contact ? 0.6 : 0.9;
      memory.escapeSide = contact ? (contact.lat >= 0 ? -1 : 1) : -Math.sign(input.steer) || 1;
    }
  }
  if (memory.reverseTime > 0) {
    memory.reverseTime = Math.max(0, memory.reverseTime - dt);
    if (memory.reverseTime === 0) memory.escapeTime = 0.5;
    input.throttle = false;
    input.brake = true;
    // 후진 중에는 조향 방향이 반대로 작용하므로, 머리가 escapeSide 쪽을 향하도록 반대로 꺾는다
    input.steer = -memory.escapeSide;
  } else if (memory.escapeTime > 0) {
    memory.escapeTime = Math.max(0, memory.escapeTime - dt);
    input.steer = memory.escapeSide;
  }

  input.item = wantsItem(race, kart, memory, p, curve);
  if (input.item) memory.itemsUsed++;
  return input;
}

function wantsItem(race: Race, kart: Kart, memory: AiMemory, p: Personality, curve: number): boolean {
  const { state } = race;
  if (!kart.item) {
    memory.itemHeld = 0;
    return false;
  }
  memory.itemHeld += 1 / 60;
  if (!canUseItem(state, kart)) return false;
  const rank = rankOf(state, kart.index);
  const order = standings(state);
  const behindGap = (range: number) => order.slice(rank).some((i) => kart.dist - state.karts[i].dist < range);
  const threatened = state.projectiles.some((pr) => pr.owner !== kart.index && Math.hypot(pr.x - kart.x, pr.y - kart.y) < 380);
  switch (kart.item) {
    case "quickRepair":
      return kart.slowTime > 0 || kart.spinTime > 0 || kart.smokeTime > 0;
    case "shield":
      if (memory.id === "luna") return threatened || (rank === 1 && behindGap(300)) || memory.itemHeld > 6;
      return threatened || memory.itemHeld > 2;
    case "turboBoost":
    case "speedWind":
      return curve < (memory.id === "dash" ? 0.5 : 0.3) && kart.surface !== "offroad";
    case "snowBomb": {
      if (memory.itemHeld < p.attackDelay) return false;
      const fx = Math.cos(kart.heading);
      const fy = Math.sin(kart.heading);
      return state.karts.some((o) => {
        if (o === kart) return false;
        const dx = o.x - kart.x;
        const dy = o.y - kart.y;
        const d = Math.hypot(dx, dy);
        return d < 450 && (dx * fx + dy * fy) / (d || 1) > Math.cos(Math.PI / 7);
      });
    }
    case "homingRocket":
      return memory.itemHeld >= p.attackDelay;
    case "oilSlick":
      return behindGap(260) || (memory.id === "luna" && memory.itemHeld > 3);
    case "smokeScreen":
      return behindGap(500) && memory.itemHeld >= p.attackDelay;
  }
  return false;
}
