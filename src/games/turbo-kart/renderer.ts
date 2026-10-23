import { DIFFICULTY, DRIVERS, ITEM_FX, ITEMS, KART } from "./config";
import { currentLap, PLAYER, rankOf, type Race } from "./logic/game";
import { deltaS, pointAt, roadAt, type BuiltTrack } from "./logic/track";
import { formatTime } from "./records";
import type { Difficulty, ItemId, Kart, RaceEvent, TrackId } from "./types";

/*
 * Turbo Kart 캔버스 그리기 (자체 디자인 탑다운 아케이드). 레이스 상태를 읽기만 하고 바꾸지 않는다.
 *
 * 좌표: 규칙·충돌은 월드 좌표(트랙 크기, px)만 쓰고, 카메라는 그리기에서만 쓴다(월드 → 화면 변환).
 * 카메라: 플레이어를 부드럽게 따라가며 진행 방향 앞쪽을 더 보여 준다(Look-Ahead). 회전하지 않는다(조작 혼란 방지).
 * 확대 배율은 캔버스의 짧은 변 기준이라 가로(PC)·세로(모바일) 화면 모두 비슷한 거리를 보여 준다.
 * 성능: 트랙 도로·갓길·경계는 처음 한 번 Path2D로 만들어 두고 매 프레임 재사용하며, 장식은 화면 안에 있는 것만 그린다.
 * 연출용 파티클·스키드 자국은 Math.random()을 써도 된다(규칙과 무관).
 */

/** 짧은 변이 이만큼의 월드 거리를 보여 준다 */
const VIEW_SHORT_SIDE = 600;
const LOOK_AHEAD_TIME = 0.42;
const LOOK_AHEAD_MAX = 170;

export class Camera {
  x = 0;
  y = 0;
  private ready = false;

  reset() {
    this.ready = false;
  }

  update(kart: Kart, dt: number) {
    const lx = Math.max(-LOOK_AHEAD_MAX, Math.min(LOOK_AHEAD_MAX, kart.vx * LOOK_AHEAD_TIME));
    const ly = Math.max(-LOOK_AHEAD_MAX, Math.min(LOOK_AHEAD_MAX, kart.vy * LOOK_AHEAD_TIME));
    const tx = kart.x + lx;
    const ty = kart.y + ly;
    if (!this.ready) {
      this.x = tx;
      this.y = ty;
      this.ready = true;
      return;
    }
    // 지수 감쇠로 부드럽게 따라간다 (프레임 속도와 무관). 복구 등으로 멀리 떨어지면 빠르게 따라잡는다.
    const far = Math.hypot(tx - this.x, ty - this.y) > 600;
    const k = 1 - Math.exp(-dt * (far ? 12 : 4.2));
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }
}

export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// ── 트랙 그림 (한 번 만들어 재사용) ──

interface TrackArt {
  wall: Path2D;
  shoulder: Path2D;
  road: Path2D;
  edges: Path2D;
  center: Path2D;
  shortcutWall: Path2D;
  shortcutShoulder: Path2D;
  shortcutRoad: Path2D;
  bridgeWater: Path2D;
  bridgePlanks: Path2D;
  curbs: { a: Path2D; b: Path2D };
  finish: { x: number; y: number; tx: number; ty: number; half: number };
  decor: { kind: string; x: number; y: number; r: number; t: number }[];
  minimap: { path: Path2D; short: Path2D; scale: number; w: number; h: number };
}

const artCache = new Map<TrackId, TrackArt>();

function bandLoop(path: Path2D, samples: { x: number; y: number; tx: number; ty: number }[], width: (i: number) => number, closed: boolean) {
  const left = samples.map((p, i) => ({ x: p.x + p.ty * width(i), y: p.y - p.tx * width(i) }));
  const right = samples.map((p, i) => ({ x: p.x - p.ty * width(i), y: p.y + p.tx * width(i) }));
  if (closed) {
    path.moveTo(left[0].x, left[0].y);
    for (const p of left) path.lineTo(p.x, p.y);
    path.closePath();
    path.moveTo(right[0].x, right[0].y);
    for (const p of right) path.lineTo(p.x, p.y);
    path.closePath();
  } else {
    path.moveTo(left[0].x, left[0].y);
    for (const p of left) path.lineTo(p.x, p.y);
    for (let i = right.length - 1; i >= 0; i--) path.lineTo(right[i].x, right[i].y);
    path.closePath();
    // 양 끝을 둥글게 (메인 도로와 자연스럽게 이어지도록)
    for (const i of [0, samples.length - 1]) {
      path.moveTo(samples[i].x + width(i), samples[i].y);
      path.arc(samples[i].x, samples[i].y, width(i), 0, Math.PI * 2);
    }
  }
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildArt(track: BuiltTrack): TrackArt {
  const { main, shortcut, def } = track;
  const wall = new Path2D();
  bandLoop(wall, main, (i) => main[i].half + main[i].shoulder + 6, true);
  const shoulder = new Path2D();
  bandLoop(shoulder, main, (i) => main[i].half + main[i].shoulder, true);
  const road = new Path2D();
  bandLoop(road, main, (i) => main[i].half, true);
  const edges = new Path2D();
  for (const side of [1, -1]) {
    main.forEach((p, i) => {
      const x = p.x + side * p.ty * (p.half - 3);
      const y = p.y - side * p.tx * (p.half - 3);
      if (i === 0) edges.moveTo(x, y);
      else edges.lineTo(x, y);
    });
    edges.closePath();
  }
  const center = new Path2D();
  main.forEach((p, i) => (i === 0 ? center.moveTo(p.x, p.y) : center.lineTo(p.x, p.y)));
  center.closePath();

  const shortcutWall = new Path2D();
  bandLoop(shortcutWall, shortcut, (i) => shortcut[i].half + shortcut[i].shoulder + 5, false);
  const shortcutShoulder = new Path2D();
  bandLoop(shortcutShoulder, shortcut, (i) => shortcut[i].half + shortcut[i].shoulder, false);
  const shortcutRoad = new Path2D();
  bandLoop(shortcutRoad, shortcut, (i) => shortcut[i].half, false);

  // 다리: 물 위 널빤지
  const bridgeWater = new Path2D();
  const bridgePlanks = new Path2D();
  for (const narrow of def.narrows) {
    if (narrow.kind !== "bridge") continue;
    const from = Math.floor(narrow.from * main.length);
    const to = Math.ceil(narrow.to * main.length);
    const span = main.slice(from, to + 1);
    bandLoop(bridgeWater, span, () => def.halfWidth + def.shoulder + 30, false);
    for (let i = 0; i < span.length; i += 2) {
      const p = span[i];
      bridgePlanks.moveTo(p.x + p.ty * p.half, p.y - p.tx * p.half);
      bridgePlanks.lineTo(p.x - p.ty * p.half, p.y + p.tx * p.half);
    }
  }

  // 커브 연석: 꺾임이 큰 곳의 도로 가장자리에 빨강·흰색 블록
  const curbs = { a: new Path2D(), b: new Path2D() };
  const n = main.length;
  for (let i = 0; i < n; i += 2) {
    const p = main[i];
    const q = main[(i + 6) % n];
    const turn = Math.atan2(p.tx * q.ty - p.ty * q.tx, p.tx * q.tx + p.ty * q.ty);
    if (Math.abs(turn) < 0.09) continue;
    const side = turn > 0 ? 1 : -1; // 바깥쪽
    const target = (i / 2) % 2 === 0 ? curbs.a : curbs.b;
    const w0 = p.half;
    const w1 = p.half + 7;
    const a = main[(i + 2) % n];
    target.moveTo(p.x - side * p.ty * w0, p.y + side * p.tx * w0);
    target.lineTo(p.x - side * p.ty * w1, p.y + side * p.tx * w1);
    target.lineTo(a.x - side * a.ty * w1, a.y + side * a.tx * w1);
    target.lineTo(a.x - side * a.ty * w0, a.y + side * a.tx * w0);
    target.closePath();
  }

  // 장식: 벽 밖에만, 호수 밖에만 (시드 고정)
  const rand = seeded(def.id.length * 7919 + def.points.length);
  const decor: TrackArt["decor"] = [];
  const inLake = (x: number, y: number) => def.lakes.some((l) => ((x - l.x) / (l.rx + 20)) ** 2 + ((y - l.y) / (l.ry + 20)) ** 2 < 1);
  for (const d of def.decor) {
    let placed = 0;
    for (let tries = 0; placed < d.count && tries < d.count * 30; tries++) {
      const x = rand() * def.world.w;
      const y = rand() * def.world.h;
      const r = roadAt(track, x, y);
      if (r && r.d < r.limit + 30) continue;
      if (inLake(x, y)) continue;
      decor.push({ kind: d.kind, x, y, r: 10 + rand() * 14, t: rand() });
      placed++;
    }
  }

  const finish = pointAt(track, 0);

  // 미니맵 (전체 트랙 기준)
  const scale = 1 / Math.max(def.world.w, def.world.h);
  const mm = new Path2D();
  main.forEach((p, i) => (i % 3 === 0 ? (i === 0 ? mm.moveTo(p.x * scale, p.y * scale) : mm.lineTo(p.x * scale, p.y * scale)) : null));
  mm.closePath();
  const ms = new Path2D();
  shortcut.forEach((p, i) => (i === 0 ? ms.moveTo(p.x * scale, p.y * scale) : ms.lineTo(p.x * scale, p.y * scale)));

  return {
    wall,
    shoulder,
    road,
    edges,
    center,
    shortcutWall,
    shortcutShoulder,
    shortcutRoad,
    bridgeWater,
    bridgePlanks,
    curbs,
    finish,
    decor,
    minimap: { path: mm, short: ms, scale, w: def.world.w * scale, h: def.world.h * scale },
  };
}

function artFor(track: BuiltTrack): TrackArt {
  let art = artCache.get(track.def.id);
  if (!art) {
    art = buildArt(track);
    artCache.set(track.def.id, art);
  }
  return art;
}

const slipperyCache = new Map<string, { path: Path2D; surface: "sand" | "ice" }[]>();

function slipperyFor(track: BuiltTrack, difficulty: Difficulty) {
  const key = `${track.def.id}-${difficulty}`;
  let zones = slipperyCache.get(key);
  if (!zones) {
    zones = track.def.slippery.map((zone) => {
      const len = zone.length * DIFFICULTY[difficulty].slipperyScale;
      const center = zone.at * track.length;
      const span = track.main.filter((p) => Math.abs(deltaS(center, p.s, track.length)) <= len / 2);
      span.sort((a, b) => deltaS(center, a.s, track.length) - deltaS(center, b.s, track.length));
      const path = new Path2D();
      bandLoop(path, span, (i) => span[i].half - 4, false);
      return { path, surface: zone.surface };
    });
    slipperyCache.set(key, zones);
  }
  return zones;
}

// ── 연출 ──

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

interface Skid {
  x: number;
  y: number;
  x2: number;
  y2: number;
  life: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class KartRenderer {
  readonly camera = new Camera();
  private particles: Particle[] = [];
  private skids: Skid[] = [];
  private lastRear = new Map<number, { x: number; y: number }>();
  private flashes: { x: number; y: number; life: number; color: string }[] = [];
  private banner: { text: string; life: number; color: string } | null = null;
  private clock = 0;

  reset() {
    this.camera.reset();
    this.particles = [];
    this.skids = [];
    this.lastRear.clear();
    this.flashes = [];
    this.banner = null;
  }

  handleEvents(events: readonly RaceEvent[], race: Race) {
    const karts = race.state.karts;
    for (const e of events) {
      switch (e.type) {
        case "go":
          this.banner = { text: "GO!", life: 0.9, color: "#4ade80" };
          break;
        case "lap":
          if (e.kart === PLAYER) this.banner = { text: e.lap === race.state.laps ? "FINAL LAP" : `LAP ${e.lap}`, life: 1.3, color: "#fde047" };
          break;
        case "finish":
          if (e.kart === PLAYER) this.banner = { text: "FINISH!", life: 2.5, color: "#fde047" };
          break;
        case "wall":
        case "obstacle": {
          const k = karts[e.kart];
          for (let i = 0; i < 8; i++) this.spawn(k.x, k.y, rnd(-80, 80), rnd(-80, 80), 0.4, rnd(2, 4), "#e5e7eb");
          break;
        }
        case "hit": {
          const k = karts[e.kart];
          this.flashes.push({ x: k.x, y: k.y, life: 0.4, color: e.blocked ? "#7dd3fc" : "#fb923c" });
          for (let i = 0; i < 14; i++) this.spawn(k.x, k.y, rnd(-160, 160), rnd(-160, 160), 0.6, rnd(2, 5), e.by === "snowBomb" ? "#f8fafc" : e.by === "oilSlick" ? "#1f2937" : "#f97316");
          break;
        }
        case "itemGet": {
          const k = karts[e.kart];
          for (let i = 0; i < 10; i++) this.spawn(k.x, k.y, rnd(-120, 120), rnd(-120, 120), 0.5, rnd(2, 4), ["#f472b6", "#fde047", "#38bdf8"][i % 3]);
          break;
        }
        case "boost": {
          const k = karts[e.kart];
          this.flashes.push({ x: k.x, y: k.y, life: 0.3, color: "#fde047" });
          break;
        }
        case "recover": {
          const k = karts[e.kart];
          this.flashes.push({ x: k.x, y: k.y, life: 0.6, color: "#a5f3fc" });
          break;
        }
        default:
          break;
      }
    }
  }

  private spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) {
    this.particles.push({ x, y, vx, vy, life, max: life, size, color });
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  private advance(race: Race, dt: number) {
    this.clock += dt;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 2;
      p.vy *= 1 - dt * 2;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const s of this.skids) s.life -= dt;
    this.skids = this.skids.filter((s) => s.life > 0);
    for (const f of this.flashes) f.life -= dt;
    this.flashes = this.flashes.filter((f) => f.life > 0);
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    if (dt === 0) return;
    // 드리프트·미끄러짐 자국과 파티클
    for (const k of race.state.karts) {
      const rear = { x: k.x - Math.cos(k.heading) * 11, y: k.y - Math.sin(k.heading) * 11 };
      const prev = this.lastRear.get(k.index);
      if (prev && (k.drifting || k.spinTime > 0) && Math.hypot(rear.x - prev.x, rear.y - prev.y) < 40) {
        this.skids.push({ x: prev.x, y: prev.y, x2: rear.x, y2: rear.y, life: 3 });
        if (this.skids.length > 900) this.skids.shift();
        if (Math.random() < 0.5) this.spawn(rear.x, rear.y, rnd(-30, 30), rnd(-30, 30), 0.35, rnd(1.5, 3), k.driftCharging ? (k.gauge >= 100 ? "#fde047" : "#60a5fa") : "#d1d5db");
      }
      if (k.surface === "offroad" && Math.hypot(k.vx, k.vy) > 120 && Math.random() < 0.3) this.spawn(rear.x, rear.y, rnd(-20, 20), rnd(-20, 20), 0.5, rnd(2, 4), "rgba(120,90,50,0.6)");
      if ((k.boostTime > 0 || k.turboTime > 0) && Math.random() < 0.8)
        this.spawn(rear.x, rear.y, -Math.cos(k.heading) * 120 + rnd(-30, 30), -Math.sin(k.heading) * 120 + rnd(-30, 30), 0.25, rnd(3, 5), k.turboTime > 0 ? "#38bdf8" : "#fb923c");
      this.lastRear.set(k.index, rear);
    }
  }

  draw(ctx: CanvasRenderingContext2D, race: Race, width: number, height: number, dt: number) {
    const { state, track } = race;
    const frozen = state.paused;
    this.advance(race, frozen ? 0 : dt);
    const player = state.karts[PLAYER];
    if (!frozen) this.camera.update(player, dt);
    const zoom = Math.min(width, height) / VIEW_SHORT_SIDE;
    const art = artFor(track);
    const def = track.def;
    const pal = def.palette;

    // 보이는 월드 범위 (컬링용)
    const halfW = width / 2 / zoom + 60;
    const halfH = height / 2 / zoom + 60;
    const view = { x0: this.camera.x - halfW, x1: this.camera.x + halfW, y0: this.camera.y - halfH, y1: this.camera.y + halfH };
    const visible = (x: number, y: number, r = 40) => x > view.x0 - r && x < view.x1 + r && y > view.y0 - r && y < view.y1 + r;

    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 땅 무늬
    ctx.fillStyle = pal.groundDark;
    const grid = 90;
    for (let gx = Math.floor(view.x0 / grid) * grid; gx < view.x1; gx += grid) {
      for (let gy = Math.floor(view.y0 / grid) * grid; gy < view.y1; gy += grid) {
        const h = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
        if (h % 3 === 0) ctx.fillRect(gx + (h % 50), gy + ((h >> 3) % 50), 6, 3);
      }
    }
    for (const lake of def.lakes) {
      if (!visible(lake.x, lake.y, Math.max(lake.rx, lake.ry))) continue;
      ctx.fillStyle = lake.color;
      ctx.beginPath();
      ctx.ellipse(lake.x, lake.y, lake.rx, lake.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.fillStyle = "#38bdf8";
    ctx.fill(art.bridgeWater);

    // 도로 (벽 → 갓길 → 노면 순서, 지름길 포함)
    ctx.fillStyle = pal.wall;
    ctx.fill(art.wall, "evenodd");
    ctx.fill(art.shortcutWall);
    ctx.fillStyle = pal.shoulder;
    ctx.fill(art.shoulder, "evenodd");
    ctx.fill(art.shortcutShoulder);
    ctx.fillStyle = pal.road;
    ctx.fill(art.road, "evenodd");
    const sc = def.shortcut.surface;
    ctx.fillStyle = sc === "dirt" ? "#a16207" : sc === "ice" ? "#bae6fd" : "#a8a29e";
    ctx.fill(art.shortcutRoad);
    // 다리 널빤지
    ctx.strokeStyle = "rgba(120,53,15,0.55)";
    ctx.lineWidth = 3;
    ctx.stroke(art.bridgePlanks);
    // 미끄러운 구간
    for (const zone of slipperyFor(track, state.difficulty)) {
      ctx.fillStyle = zone.surface === "ice" ? "rgba(186,230,253,0.85)" : "rgba(251,191,36,0.75)";
      ctx.fill(zone.path);
    }
    ctx.fillStyle = pal.curbA;
    ctx.fill(art.curbs.a);
    ctx.fillStyle = pal.curbB;
    ctx.fill(art.curbs.b);
    ctx.strokeStyle = pal.roadEdge;
    ctx.lineWidth = 3;
    ctx.stroke(art.edges);
    ctx.setLineDash([26, 30]);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 3;
    ctx.stroke(art.center);
    ctx.setLineDash([]);

    // 결승선 (체크무늬)
    drawFinishLine(ctx, art.finish);

    // 장식 (화면 안만)
    for (const d of art.decor) if (visible(d.x, d.y)) drawDecor(ctx, d.kind, d.x, d.y, d.r, d.t);

    // 스키드 자국
    ctx.lineCap = "round";
    for (const s of this.skids) {
      if (!visible(s.x, s.y, 10)) continue;
      ctx.strokeStyle = `rgba(30,30,30,${Math.min(0.35, s.life * 0.15)})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }

    // 아이템 상자, 오일, 장애물
    for (const box of state.boxes) if (box.respawn === 0 && visible(box.x, box.y)) drawItemBox(ctx, box.x, box.y, this.clock);
    for (const oil of state.oils) {
      if (!visible(oil.x, oil.y)) continue;
      ctx.globalAlpha = Math.min(1, oil.life);
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.ellipse(oil.x, oil.y, ITEM_FX.oilRadius, ITEM_FX.oilRadius * 0.7, oil.id, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(167,139,250,0.4)";
      ctx.beginPath();
      ctx.ellipse(oil.x - 5, oil.y - 4, 8, 4, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const o of race.env.obstacles) if (visible(o.x, o.y)) drawObstacle(ctx, o.kind, o.x, o.y, o.r);
    for (const m of state.movers) if (visible(m.x, m.y)) drawObstacle(ctx, m.kind, m.x, m.y, m.r, this.clock);

    // 카트
    for (const k of state.karts) if (visible(k.x, k.y)) drawKart(ctx, k, this.clock);

    // 투사체
    for (const p of state.projectiles) {
      if (!visible(p.x, p.y)) continue;
      if (p.kind === "snowBomb") {
        ctx.fillStyle = "#f8fafc";
        ctx.strokeStyle = "#93c5fd";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, ITEM_FX.projectileRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.heading);
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-8, -6);
        ctx.lineTo(-8, 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fde047";
        ctx.fillRect(-14, -3, 6, 6);
        ctx.restore();
        if (Math.random() < 0.9) this.spawn(p.x, p.y, rnd(-20, 20), rnd(-20, 20), 0.4, rnd(2, 4), "rgba(156,163,175,0.7)");
      }
    }

    for (const p of this.particles) {
      if (!visible(p.x, p.y, 5)) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of this.flashes) {
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = Math.min(1, f.life * 2.5);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 20 + (1 - f.life) * 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 연막 (플레이어 시야 방해)
    if (player.smokeTime > 0) {
      const a = Math.min(1, player.smokeTime) * 0.75;
      const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.1, width / 2, height / 2, Math.max(width, height) * 0.7);
      g.addColorStop(0, `rgba(75,85,99,${a * 0.5})`);
      g.addColorStop(1, `rgba(55,65,81,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }

    this.drawHud(ctx, race, width, height, art);
  }

  // ── 화면 고정 HUD (매 프레임 바뀌는 값은 React가 아닌 캔버스에 그린다) ──

  private drawHud(ctx: CanvasRenderingContext2D, race: Race, width: number, height: number, art: TrackArt) {
    const { state } = race;
    const me = state.karts[PLAYER];
    const small = width < 480;
    const pad = small ? 8 : 12;
    const font = (size: number, weight = 800) => `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`;
    const outlined = (text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left") => {
      ctx.font = font(size);
      ctx.textAlign = align;
      ctx.lineWidth = Math.max(3, size / 6);
      ctx.strokeStyle = "rgba(15,23,42,0.85)";
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };

    // 순위·바퀴·시간
    const rank = me.finished && state.results ? state.results.find((r) => r.index === PLAYER)!.rank : rankOf(state, PLAYER);
    const suffix = ["st", "nd", "rd", "th"][rank - 1];
    const rankSize = small ? 30 : 40;
    outlined(`${rank}${suffix}`, pad, pad + rankSize, rankSize, rank === 1 ? "#fde047" : "#f8fafc");
    outlined(`LAP ${currentLap(me, state.laps)}/${state.laps}`, pad, pad + rankSize + (small ? 20 : 26), small ? 15 : 18, "#e2e8f0");
    outlined(formatTime(me.finishTime ?? state.time), pad, pad + rankSize + (small ? 40 : 50), small ? 14 : 17, "#e2e8f0");

    // 미니맵 (전체 트랙)
    const mmW = Math.min(small ? 110 : 170, width * 0.32);
    const mmScale = mmW / art.minimap.w;
    const mmH = art.minimap.h * mmScale;
    const mx = width - mmW - pad;
    const my = pad;
    ctx.fillStyle = "rgba(15,23,42,0.55)";
    roundRect(ctx, mx - 6, my - 6, mmW + 12, mmH + 12, 8);
    ctx.fill();
    ctx.save();
    ctx.translate(mx, my);
    ctx.scale(mmScale, mmScale);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 3.5 / mmScale;
    ctx.stroke(art.minimap.path);
    ctx.setLineDash([3 / mmScale, 3 / mmScale]);
    ctx.lineWidth = 2 / mmScale;
    ctx.stroke(art.minimap.short);
    ctx.setLineDash([]);
    const s = art.minimap.scale;
    for (const k of [...state.karts].sort((a) => (a.index === PLAYER ? 1 : -1))) {
      ctx.fillStyle = DRIVERS[k.id].color;
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5 / mmScale;
      ctx.beginPath();
      ctx.arc(k.x * s, k.y * s, (k.index === PLAYER ? 4.5 : 3.2) / mmScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // 속도·부스터 게이지
    const speed = Math.round(Math.hypot(me.vx, me.vy) * 0.36);
    const by = height - pad;
    outlined(`${speed}`, pad, by - (small ? 22 : 28), small ? 22 : 28, "#f8fafc");
    ctx.font = font(small ? 10 : 12, 700);
    ctx.fillStyle = "#cbd5e1";
    ctx.textAlign = "left";
    ctx.fillText("km/h", pad + (small ? 44 : 58), by - (small ? 22 : 28));
    const gw = small ? 110 : 160;
    ctx.fillStyle = "rgba(15,23,42,0.7)";
    roundRect(ctx, pad, by - 14, gw, 12, 6);
    ctx.fill();
    const ready = me.gauge >= 100 && me.boostCooldown === 0;
    const grad = ctx.createLinearGradient(pad, 0, pad + gw, 0);
    grad.addColorStop(0, "#38bdf8");
    grad.addColorStop(1, ready ? "#fde047" : "#818cf8");
    ctx.fillStyle = me.boostTime > 0 ? "#fb923c" : grad;
    roundRect(ctx, pad, by - 14, (gw * (me.boostTime > 0 ? me.boostTime / 2 : me.gauge / 100)), 12, 6);
    ctx.fill();
    ctx.font = font(10, 800);
    ctx.fillStyle = ready ? "#fde047" : "#e2e8f0";
    ctx.fillText(me.boostTime > 0 ? "BOOST!" : ready ? "BOOST READY" : "BOOST", pad + gw + 6, by - 4);

    // 아이템 칸
    const box = small ? 44 : 56;
    const ix = width - box - pad;
    const iy = height - box - pad;
    ctx.fillStyle = "rgba(15,23,42,0.7)";
    roundRect(ctx, ix, iy, box, box, 10);
    ctx.fill();
    ctx.strokeStyle = me.item ? "#fde047" : "rgba(226,232,240,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (me.item) drawItemIcon(ctx, me.item, ix + box / 2, iy + box / 2, box * 0.36);
    if (me.item) outlined(ITEMS[me.item].name, ix + box, iy - 6, small ? 10 : 12, "#fde047", "right");

    // 상태 표시
    const status: string[] = [];
    if (me.shieldTime > 0) status.push("SHIELD");
    if (me.turboTime > 0) status.push("TURBO");
    if (me.windTime > 0) status.push("SPEED WIND");
    if (me.slowTime > 0) status.push("SLOWED");
    if (me.spinTime > 0) status.push("SPIN!");
    if (me.surface === "ice" || me.surface === "sand") status.push(me.surface === "ice" ? "ICE" : "SAND");
    if (status.length) outlined(status.join(" · "), width / 2, height - pad - 4, small ? 12 : 14, "#a5f3fc", "center");

    // 카운트다운·배너·역주행
    if (state.phase === "countdown") outlined(String(Math.ceil(state.countdown)), width / 2, height / 2, small ? 70 : 96, "#fde047", "center");
    if (this.banner) {
      ctx.globalAlpha = Math.min(1, this.banner.life * 2);
      outlined(this.banner.text, width / 2, height * 0.38, small ? 34 : 48, this.banner.color, "center");
      ctx.globalAlpha = 1;
    }
    if (me.wrongWayTime > 1 && !me.finished) outlined("WRONG WAY", width / 2, height * 0.28, small ? 26 : 34, "#f87171", "center");
    if (me.frozenTime > 0 && state.phase === "racing" && me.recoveries > 0) outlined("RECOVERING...", width / 2, height * 0.3, small ? 18 : 22, "#a5f3fc", "center");
  }
}

// ── 그리기 도우미 ──

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawFinishLine(ctx: CanvasRenderingContext2D, f: { x: number; y: number; tx: number; ty: number; half: number }) {
  const cells = 10;
  const size = (f.half * 2) / cells;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(Math.atan2(f.ty, f.tx));
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle = (i + row) % 2 ? "#0f172a" : "#f8fafc";
      ctx.fillRect(-size + row * size, -f.half + i * size, size, size);
    }
  }
  ctx.restore();
}

function drawItemBox(ctx: CanvasRenderingContext2D, x: number, y: number, clock: number) {
  const r = ITEM_FX.boxRadius;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(clock * 2) * 0.3 + 0.4);
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, "#f472b6");
  g.addColorStop(0.5, "#fde047");
  g.addColorStop(1, "#38bdf8");
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.92;
  roundRect(ctx, -r, -r, r * 2, r * 2, 5);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.rotate(-(Math.sin(clock * 2) * 0.3 + 0.4));
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 15px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("?", 0, 5);
  ctx.restore();
}

const ITEM_COLORS: Record<ItemId, string> = {
  turboBoost: "#fb923c",
  snowBomb: "#e0f2fe",
  shield: "#38bdf8",
  oilSlick: "#1f2937",
  homingRocket: "#ef4444",
  speedWind: "#5eead4",
  smokeScreen: "#9ca3af",
  quickRepair: "#4ade80",
};

export function drawItemIcon(ctx: CanvasRenderingContext2D, item: ItemId, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = ITEM_COLORS[item];
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = item === "snowBomb" || item === "quickRepair" || item === "speedWind" ? "#0f172a" : "#ffffff";
  ctx.font = `900 ${Math.round(r * 0.75)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ITEMS[item].short, 0, 1);
  ctx.restore();
}

function drawDecor(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number, t: number) {
  switch (kind) {
    case "tree":
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.beginPath();
      ctx.arc(x + 5, y + 6, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#15803d";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "pine":
    case "snowTree":
      for (let i = 0; i < 3; i++) {
        const s = r * (1 - i * 0.25);
        ctx.fillStyle = i === 2 && kind === "snowTree" ? "#f8fafc" : i % 2 ? "#166534" : "#14532d";
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s, y + s * 0.6);
        ctx.lineTo(x - s, y + s * 0.6);
        ctx.closePath();
        ctx.fill();
      }
      if (kind === "snowTree") {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(x, y - r * 0.6, r * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "rock":
      ctx.fillStyle = "#78716c";
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.8, r * 0.6, t * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#a8a29e";
      ctx.beginPath();
      ctx.ellipse(x - r * 0.2, y - r * 0.2, r * 0.35, r * 0.25, t * 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "cactus":
      ctx.strokeStyle = "#15803d";
      ctx.lineCap = "round";
      ctx.lineWidth = r * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y + r);
      ctx.lineTo(x, y - r);
      ctx.moveTo(x - r * 0.6, y - r * 0.1);
      ctx.lineTo(x - r * 0.6, y - r * 0.6);
      ctx.moveTo(x + r * 0.6, y + r * 0.2);
      ctx.lineTo(x + r * 0.6, y - r * 0.3);
      ctx.stroke();
      break;
    case "dune":
      ctx.fillStyle = "rgba(217,119,6,0.35)";
      ctx.beginPath();
      ctx.ellipse(x, y, r * 2.2, r, t, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "flower":
      ctx.fillStyle = t > 0.5 ? "#fde047" : "#f9a8d4";
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

/** 충돌하는 장애물 (판정 반지름 r과 같은 크기로 그린다) */
function drawObstacle(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number, clock = 0) {
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.arc(x + 4, y + 5, r, 0, Math.PI * 2);
  ctx.fill();
  switch (kind) {
    case "rock":
    case "boulder":
      ctx.fillStyle = kind === "boulder" ? "#92400e" : "#6b7280";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "tree":
      ctx.fillStyle = "#166534";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4ade80";
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "cone":
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "cactus":
      ctx.fillStyle = "#16a34a";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#14532d";
      ctx.lineWidth = 2;
      for (let a = 0; a < 6; a++) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.stroke();
      }
      break;
    case "sandpile":
      ctx.fillStyle = "#d97706";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(x - 3, y - 3, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "snowman":
      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.arc(x, y + r * 0.2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y - r * 0.6, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f97316";
      ctx.fillRect(x - 1, y - r * 0.65, r * 0.5, 3);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(x - 4, y - r * 0.85, 2, 2);
      ctx.fillRect(x + 2, y - r * 0.85, 2, 2);
      break;
    case "iceblock":
    case "iceSlide":
      ctx.fillStyle = "#bae6fd";
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - r, y - r, r * 2, r * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath();
      ctx.moveTo(x - r * 0.6, y - r * 0.2);
      ctx.lineTo(x - r * 0.1, y - r * 0.7);
      ctx.stroke();
      break;
    case "log":
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(clock * 3);
      ctx.fillStyle = "#92400e";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fcd34d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.6, 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.restore();
      break;
    case "tumbleweed":
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(clock * 4);
      ctx.strokeStyle = "#a16207";
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(i - 2, 0, r - i * 2, i, i + 4);
        ctx.stroke();
      }
      ctx.restore();
      break;
    default:
      ctx.fillStyle = "#6b7280";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
  }
}

/** 카트: 드라이버마다 색과 앞부분 모양이 다르다 (YOU 줄무늬, Bolt 뾰족한 코, Luna 둥근 몸체, Dash 넓은 날개) */
function drawKart(ctx: CanvasRenderingContext2D, k: Kart, clock: number) {
  const d = DRIVERS[k.id];
  ctx.save();
  ctx.translate(k.x, k.y);
  ctx.rotate(k.heading);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  roundRect(ctx, -13, -8, 30, 20, 6);
  ctx.fill();
  // 바퀴
  ctx.fillStyle = "#111827";
  for (const [wx, wy] of [
    [-9, -10],
    [-9, 6],
    [7, -10],
    [7, 6],
  ])
    ctx.fillRect(wx, wy, 7, 4);
  // 몸체
  ctx.fillStyle = d.color;
  ctx.strokeStyle = d.dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (k.id === "bolt") {
    ctx.moveTo(18, 0);
    ctx.lineTo(4, -8);
    ctx.lineTo(-13, -8);
    ctx.lineTo(-13, 8);
    ctx.lineTo(4, 8);
    ctx.closePath();
  } else if (k.id === "luna") {
    ctx.ellipse(1, 0, 15, 9, 0, 0, Math.PI * 2);
  } else if (k.id === "dash") {
    ctx.moveTo(15, -6);
    ctx.lineTo(15, 6);
    ctx.lineTo(-6, 11);
    ctx.lineTo(-14, 7);
    ctx.lineTo(-14, -7);
    ctx.lineTo(-6, -11);
    ctx.closePath();
  } else {
    roundRect(ctx, -14, -8, 30, 16, 6);
  }
  ctx.fill();
  ctx.stroke();
  if (k.id === "player") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-14, -2, 30, 4);
  }
  // 드라이버 헬멧
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(-3, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = d.dark;
  ctx.fillRect(-1, -2, 4, 4);
  // 부스터 불꽃
  if (k.boostTime > 0 || k.turboTime > 0) {
    ctx.fillStyle = k.turboTime > 0 ? "#38bdf8" : "#fb923c";
    const flick = 6 + Math.sin(clock * 40) * 3;
    ctx.beginPath();
    ctx.moveTo(-14, -5);
    ctx.lineTo(-14 - flick * 2, 0);
    ctx.lineTo(-14, 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  if (k.shieldTime > 0) {
    ctx.strokeStyle = "rgba(125,211,252,0.9)";
    ctx.fillStyle = "rgba(125,211,252,0.18)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(k.x, k.y, KART.radius + 9 + Math.sin(clock * 6) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (k.slowTime > 0) {
    ctx.fillStyle = "#e0f2fe";
    for (let i = 0; i < 3; i++) {
      const a = clock * 3 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(k.x + Math.cos(a) * 18, k.y + Math.sin(a) * 18, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (k.spinTime > 0) {
    ctx.fillStyle = "#fde047";
    for (let i = 0; i < 3; i++) {
      const a = -clock * 8 + (i * Math.PI * 2) / 3;
      ctx.fillRect(k.x + Math.cos(a) * 20 - 2, k.y - 18 + Math.sin(a) * 5 - 2, 4, 4);
    }
  }
  if (k.protectTime > 0 && Math.floor(clock * 10) % 2 === 0) {
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(k.x, k.y, KART.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 이름표
  ctx.font = "800 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(15,23,42,0.8)";
  ctx.strokeText(d.name, k.x, k.y - 22);
  ctx.fillStyle = d.color;
  ctx.fillText(d.name, k.x, k.y - 22);
}

