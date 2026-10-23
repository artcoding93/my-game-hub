import { DIFFICULTY, ITEM_FX, RACE } from "../config";
import { TRACKS, type TrackDef } from "../tracks";
import type { Difficulty, ItemBox, Mover, Obstacle, Surface, TrackId, Vec } from "../types";

/*
 * 트랙 데이터(tracks.ts)를 주행용 구조로 바꾼다 (순수 함수, 캔버스 의존 없음).
 * - 중심선: Catmull-Rom 스플라인을 약 8px 간격으로 다시 샘플링한 닫힌 폴리라인
 * - 도로 판정: 격자(20px)마다 가장 가까운 메인·지름길 샘플을 미리 찾아 두고, 조회할 때 주변 선분으로 정확한 거리를 잰다
 * - 진행 거리 s: 메인 코스 위 거리. 지름길 위의 점은 입구 s → 출구 s로 고르게 대응시켜 체크포인트 순서가 그대로 이어진다
 */

export const SAMPLE_STEP = 8;
const GRID = 20;
/** 이보다 먼 격자는 "도로와 무관"으로 표시 (벽 밖) */
const FIELD_RANGE = 260;

export interface Sample {
  x: number;
  y: number;
  /** 진행 방향 단위 벡터 */
  tx: number;
  ty: number;
  /** 메인 코스 위 진행 거리 */
  s: number;
  half: number;
  shoulder: number;
}

export interface BuiltTrack {
  def: TrackDef;
  length: number;
  main: Sample[];
  shortcut: Sample[];
  shortcutFrom: number;
  shortcutTo: number;
  checkpoints: number[];
  /** 격자마다 가장 가까운 메인 샘플 / 지름길 샘플 번호 (-1 = 범위 밖) */
  field: { cols: number; rows: number; main: Int32Array; short: Int32Array };
}

export interface RoadInfo {
  /** 가장 가까운 중심선까지 거리 */
  d: number;
  half: number;
  /** 벽까지 허용 거리 (half + shoulder) */
  limit: number;
  onShortcut: boolean;
  /** 가장 가까운 중심선 위의 점과 그 점에서 바깥쪽을 향하는 단위 벡터 */
  cx: number;
  cy: number;
  nx: number;
  ny: number;
  /** 메인 코스 기준 진행 거리 */
  s: number;
  mainIndex: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** 제어점을 부드러운 곡선으로 잇고 같은 간격으로 다시 샘플링한다. */
function resample(points: [number, number][], closed: boolean): Vec[] {
  const dense: Vec[] = [];
  const n = points.length;
  const segs = closed ? n : n - 1;
  const at = (i: number) => {
    if (closed) return points[((i % n) + n) % n];
    return points[Math.max(0, Math.min(n - 1, i))];
  };
  for (let i = 0; i < segs; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      dense.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), y: catmull(p0[1], p1[1], p2[1], p3[1], t) });
    }
  }
  if (!closed) dense.push({ x: points[n - 1][0], y: points[n - 1][1] });
  else dense.push({ ...dense[0] });

  const out: Vec[] = [dense[0]];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    let pos = SAMPLE_STEP - carry;
    while (pos <= segLen) {
      const t = pos / segLen;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      pos += SAMPLE_STEP;
    }
    carry = segLen - (pos - SAMPLE_STEP);
  }
  if (closed) {
    // 마지막 점이 첫 점과 거의 겹치면 뺀다
    const last = out[out.length - 1];
    if (Math.hypot(last.x - out[0].x, last.y - out[0].y) < SAMPLE_STEP * 0.5) out.pop();
  }
  return out;
}

function withTangents(points: Vec[], closed: boolean): { x: number; y: number; tx: number; ty: number }[] {
  const n = points.length;
  return points.map((p, i) => {
    const prev = closed ? points[(i - 1 + n) % n] : points[Math.max(0, i - 1)];
    const next = closed ? points[(i + 1) % n] : points[Math.min(n - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x, y: p.y, tx: dx / len, ty: dy / len };
  });
}

export function wrapS(s: number, length: number): number {
  return ((s % length) + length) % length;
}

/** b - a를 (-L/2, L/2] 범위로 */
export function deltaS(a: number, b: number, length: number): number {
  let d = wrapS(b - a, length);
  if (d > length / 2) d -= length;
  return d;
}

function halfAt(def: TrackDef, fraction: number): { half: number; shoulder: number } {
  let half = def.halfWidth;
  let shoulder = def.shoulder;
  const blend = 0.012;
  for (const narrow of def.narrows) {
    let t = 0;
    if (fraction >= narrow.from && fraction <= narrow.to) t = 1;
    else if (fraction > narrow.from - blend && fraction < narrow.from) t = (fraction - (narrow.from - blend)) / blend;
    else if (fraction > narrow.to && fraction < narrow.to + blend) t = 1 - (fraction - narrow.to) / blend;
    if (t > 0) {
      half = half * (1 - t) + narrow.halfWidth * t;
      // 다리·협곡은 갓길이 거의 없다(바로 난간·절벽)
      shoulder = shoulder * (1 - t) + 8 * t;
    }
  }
  return { half, shoulder };
}

const cache = new Map<TrackId, BuiltTrack>();

export function buildTrack(id: TrackId): BuiltTrack {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = TRACKS[id];
  const raw = withTangents(resample(def.points, true), true);
  const length = raw.length * SAMPLE_STEP;
  const main: Sample[] = raw.map((p, i) => ({ ...p, s: i * SAMPLE_STEP, ...halfAt(def, i / raw.length) }));

  // 지름길: 입구·출구를 메인 코스에 투영해 진행 거리를 고르게 대응시킨다
  const nearestMain = (x: number, y: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < main.length; i++) {
      const d = (main[i].x - x) ** 2 + (main[i].y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const scPts = def.shortcut.points;
  const fromIdx = nearestMain(scPts[0][0], scPts[0][1]);
  const toIdx = nearestMain(scPts[scPts.length - 1][0], scPts[scPts.length - 1][1]);
  const shortcutFrom = main[fromIdx].s;
  const shortcutTo = main[toIdx].s;
  const span = wrapS(shortcutTo - shortcutFrom, length);
  const scRaw = withTangents(resample(scPts, false), false);
  const shortcut: Sample[] = scRaw.map((p, i) => ({
    ...p,
    s: wrapS(shortcutFrom + (span * i) / Math.max(1, scRaw.length - 1), length),
    half: def.shortcut.halfWidth,
    shoulder: 10,
  }));

  const checkpoints = Array.from({ length: RACE.checkpoints }, (_, k) => (k * length) / RACE.checkpoints);

  // 격자별 가장 가까운 샘플
  const cols = Math.ceil(def.world.w / GRID);
  const rows = Math.ceil(def.world.h / GRID);
  const fieldMain = new Int32Array(cols * rows).fill(-1);
  const fieldShort = new Int32Array(cols * rows).fill(-1);
  const fill = (samples: Sample[], out: Int32Array) => {
    const best = new Float32Array(cols * rows).fill(FIELD_RANGE * FIELD_RANGE);
    const reach = Math.ceil(FIELD_RANGE / GRID);
    samples.forEach((p, i) => {
      const cx = Math.floor(p.x / GRID);
      const cy = Math.floor(p.y / GRID);
      for (let gy = Math.max(0, cy - reach); gy <= Math.min(rows - 1, cy + reach); gy++) {
        for (let gx = Math.max(0, cx - reach); gx <= Math.min(cols - 1, cx + reach); gx++) {
          const dx = (gx + 0.5) * GRID - p.x;
          const dy = (gy + 0.5) * GRID - p.y;
          const d = dx * dx + dy * dy;
          const k = gy * cols + gx;
          if (d < best[k]) {
            best[k] = d;
            out[k] = i;
          }
        }
      }
    });
  };
  fill(main, fieldMain);
  fill(shortcut, fieldShort);

  const built: BuiltTrack = { def, length, main, shortcut, shortcutFrom, shortcutTo, checkpoints, field: { cols, rows, main: fieldMain, short: fieldShort } };
  cache.set(id, built);
  return built;
}

/** 점에서 폴리라인 i번 샘플 주변(±2 선분)까지의 가장 가까운 점 */
function nearestOnPolyline(samples: Sample[], i: number, x: number, y: number, closed: boolean) {
  const n = samples.length;
  let best = { d: Infinity, cx: 0, cy: 0, t: 0, a: i, b: i };
  for (let k = -3; k <= 2; k++) {
    let ia = i + k;
    let ib = ia + 1;
    if (closed) {
      ia = ((ia % n) + n) % n;
      ib = ((ib % n) + n) % n;
    } else if (ia < 0 || ib >= n) continue;
    const a = samples[ia];
    const b = samples[ib];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / len2));
    const cx = a.x + abx * t;
    const cy = a.y + aby * t;
    const d = Math.hypot(x - cx, y - cy);
    if (d < best.d) best = { d, cx, cy, t, a: ia, b: ib };
  }
  return best;
}

function info(track: BuiltTrack, samples: Sample[], i: number, x: number, y: number, closed: boolean, onShortcut: boolean): RoadInfo {
  const near = nearestOnPolyline(samples, i, x, y, closed);
  const a = samples[near.a];
  const b = samples[near.b];
  const half = a.half + (b.half - a.half) * near.t;
  const shoulder = a.shoulder + (b.shoulder - a.shoulder) * near.t;
  const nx = near.d > 1e-6 ? (x - near.cx) / near.d : -a.ty;
  const ny = near.d > 1e-6 ? (y - near.cy) / near.d : a.tx;
  const s = onShortcut ? wrapS(a.s + deltaS(a.s, b.s, track.length) * near.t, track.length) : wrapS(a.s + SAMPLE_STEP * near.t, track.length);
  const mainIndex = onShortcut ? Math.round(s / SAMPLE_STEP) % track.main.length : near.a;
  return { d: near.d, half, limit: half + shoulder, onShortcut, cx: near.cx, cy: near.cy, nx, ny, s, mainIndex };
}

/** 이 점 근처의 도로 (메인·지름길, 겹치는 곳에서는 둘 다). 범위 밖이면 빈 배열(벽 밖). */
export function roadsAt(track: BuiltTrack, x: number, y: number): RoadInfo[] {
  const { cols, rows } = track.field;
  const gx = Math.floor(x / GRID);
  const gy = Math.floor(y / GRID);
  if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return [];
  const k = gy * cols + gx;
  const mi = track.field.main[k];
  const si = track.field.short[k];
  const out: RoadInfo[] = [];
  if (mi >= 0) out.push(info(track, track.main, mi, x, y, true, false));
  if (si >= 0) out.push(info(track, track.shortcut, si, x, y, false, true));
  return out;
}

/** 도로 판정: 메인·지름길 중 도로 가장자리 안쪽으로 더 깊이 있는 쪽 (노면·진행 판단용). 범위 밖이면 null. */
export function roadAt(track: BuiltTrack, x: number, y: number): RoadInfo | null {
  const roads = roadsAt(track, x, y);
  if (roads.length === 2) return roads[1].d - roads[1].half < roads[0].d - roads[0].half ? roads[1] : roads[0];
  return roads[0] ?? null;
}

/**
 * 벽 판정: 메인 도로와 지름길이 겹치는 곳은 두 영역을 합친 곳이 주행 가능 영역이다.
 * 어느 쪽의 벽 안에라도 있으면 null, 모두 밖이면 가장 가까운 벽(밀어낼 거리가 가장 짧은 쪽)을 돌려준다.
 */
export function wallContact(track: BuiltTrack, x: number, y: number, margin: number): { road: RoadInfo; wall: number } | null | "outside" {
  const roads = roadsAt(track, x, y);
  if (roads.length === 0) return "outside";
  let best: { road: RoadInfo; wall: number } | null = null;
  for (const road of roads) {
    const wall = road.limit - margin;
    if (road.d <= wall) return null;
    if (!best || road.d - wall < best.road.d - best.wall) best = { road, wall };
  }
  return best;
}

/**
 * 진행 거리 투영: 직전 메인 샘플 주변(±window)만 찾는다. 코스가 가까이 지나가는 곳에서 다른 구간으로 건너뛰지 않게 하기 위함.
 * 지름길 위라면 지름길 샘플의 대응 s를 쓴다.
 */
export function projectProgress(track: BuiltTrack, x: number, y: number, prevIndex: number, window = 40): { s: number; index: number; d: number } {
  const n = track.main.length;
  let best = { s: 0, index: prevIndex, d: Infinity };
  for (let k = -window; k <= window; k++) {
    const i = (((prevIndex + k) % n) + n) % n;
    const p = track.main[i];
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < best.d) best = { s: p.s, index: i, d };
  }
  const prevS = track.main[prevIndex].s;
  for (const p of track.shortcut) {
    if (Math.abs(deltaS(prevS, p.s, track.length)) > window * SAMPLE_STEP) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < best.d) best = { s: p.s, index: Math.round(p.s / SAMPLE_STEP) % n, d };
  }
  // 샘플 간격보다 촘촘하게: 가장 가까운 메인 선분으로 보정
  const exact = info(track, track.main, best.index, x, y, true, false);
  const onShort = roadAt(track, x, y)?.onShortcut ?? false;
  return { s: onShort ? best.s : exact.s, index: best.index, d: Math.sqrt(best.d) };
}

/** 코스 위 위치(s, 좌우 lateral -1~1) → 월드 좌표 */
export function pointAt(track: BuiltTrack, s: number, lateral = 0): { x: number; y: number; tx: number; ty: number; half: number } {
  const n = track.main.length;
  const f = wrapS(s, track.length) / SAMPLE_STEP;
  const i = Math.floor(f) % n;
  const j = (i + 1) % n;
  const t = f - Math.floor(f);
  const a = track.main[i];
  const b = track.main[j];
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const half = a.half + (b.half - a.half) * t;
  // 진행 방향의 오른쪽 = (-ty, tx) (화면 좌표: y 아래)
  return { x: x - a.ty * lateral * half, y: y + a.tx * lateral * half, tx: a.tx, ty: a.ty, half };
}

/** 지금 노면 (미끄러운 구간·지름길 노면·도로 밖) */
export function surfaceAt(track: BuiltTrack, road: RoadInfo | null, difficulty: Difficulty): Surface {
  if (!road || road.d > road.half) return "offroad";
  if (road.onShortcut) return track.def.shortcut.surface;
  const scale = DIFFICULTY[difficulty].slipperyScale;
  for (const zone of track.def.slippery) {
    const center = zone.at * track.length;
    if (Math.abs(deltaS(center, road.s, track.length)) <= (zone.length * scale) / 2) return zone.surface;
  }
  return "road";
}

/** 난이도에 맞는 장애물·움직이는 장애물·아이템 상자 배치 */
export function layoutFor(track: BuiltTrack, difficulty: Difficulty): { obstacles: Obstacle[]; movers: Mover[]; boxes: ItemBox[] } {
  const tiers = DIFFICULTY[difficulty].obstacleTiers;
  const obstacles = track.def.obstacles
    .filter((o) => tiers.includes(o.tier))
    .map((o) => {
      const p = pointAt(track, o.at * track.length, o.lateral);
      return { kind: o.kind, x: p.x, y: p.y, r: o.r };
    });
  for (const o of track.def.shortcut.obstacles ?? []) {
    if (!tiers.includes(o.tier)) continue;
    const i = Math.min(track.shortcut.length - 1, Math.round(o.at * (track.shortcut.length - 1)));
    const p = track.shortcut[i];
    obstacles.push({ kind: o.kind, x: p.x - p.ty * o.lateral * p.half, y: p.y + p.tx * o.lateral * p.half, r: o.r });
  }
  const movers = track.def.movers
    .filter((m) => tiers.includes(m.tier))
    .map((m, i) => {
      const p = pointAt(track, m.at * track.length);
      return { kind: m.kind, cx: p.x, cy: p.y, nx: -p.ty, ny: p.tx, amplitude: m.amplitude * p.half, period: m.period, phase: i * 1.7, r: m.r, x: p.x, y: p.y };
    });
  const perRow = DIFFICULTY[difficulty].boxesPerRow;
  const boxes: ItemBox[] = [];
  for (const at of track.def.itemRows) {
    for (let k = 0; k < perRow; k++) {
      const lateral = perRow === 1 ? 0 : -0.6 + (1.2 * k) / (perRow - 1);
      const p = pointAt(track, at * track.length, lateral);
      boxes.push({ x: p.x, y: p.y, respawn: 0 });
    }
  }
  return { obstacles, movers, boxes };
}

export const BOX_RADIUS = ITEM_FX.boxRadius;
