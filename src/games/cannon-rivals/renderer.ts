import { CRATE, PHYSICS, TANK, WORLD_H, WORLD_W } from "./config";
import type { FieldId, GameEvent, GameState, Side, Tank } from "./types";

/*
 * Cannon Rivals 캔버스 그리기 (자체 디자인 카툰 스타일). 게임 상태를 읽기만 하고 바꾸지 않는다.
 * 지형은 높이맵(state.terrain)을 그대로 그리므로 폭발로 깎인 모양과 충돌 데이터가 항상 같다.
 * 폭발 파편·연기·흔들림 같은 연출은 여기서만 관리하며 Math.random()을 쓴다(규칙과 무관).
 */

interface Palette {
  skyTop: string;
  skyBottom: string;
  far: string;
  near: string;
  soilTop: string;
  soil: string;
  soilDeep: string;
  crust: string;
  debris: string[];
}

const PALETTES: Record<FieldId, Palette> = {
  greenHills: {
    skyTop: "#7dd3fc",
    skyBottom: "#e0f2fe",
    far: "#a7d7b8",
    near: "#7cc29a",
    soilTop: "#4ade80",
    soil: "#8b5a2b",
    soilDeep: "#5b3a1e",
    crust: "#15803d",
    debris: ["#8b5a2b", "#4ade80", "#6b4423"],
  },
  desertCanyon: {
    skyTop: "#fb923c",
    skyBottom: "#fde68a",
    far: "#e9a46a",
    near: "#d9824a",
    soilTop: "#fcd34d",
    soil: "#d97706",
    soilDeep: "#92400e",
    crust: "#b45309",
    debris: ["#d97706", "#fcd34d", "#92400e"],
  },
  frozenRidge: {
    skyTop: "#1e3a8a",
    skyBottom: "#93c5fd",
    far: "#94a3b8",
    near: "#cbd5e1",
    soilTop: "#f8fafc",
    soil: "#64748b",
    soilDeep: "#334155",
    crust: "#bae6fd",
    debris: ["#f8fafc", "#94a3b8", "#bae6fd"],
  },
};

export const TANK_COLORS: Record<Side, { body: string; dark: string; light: string }> = {
  player: { body: "#14b8a6", dark: "#0f766e", light: "#99f6e4" },
  ai: { body: "#f43f5e", dark: "#9f1239", light: "#fecdd3" },
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: "debris" | "spark" | "smoke" | "confetti";
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export interface GuideView {
  points: { x: number; y: number }[];
  full: boolean;
  impact: { x: number; y: number } | null;
}

export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export class CannonRenderer {
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private trails = new Map<number, { x: number; y: number }[]>();
  private recoil: Record<Side, number> = { player: 0, ai: 0 };
  private flash: Record<Side, number> = { player: 0, ai: 0 };
  private rings: { x: number; y: number; r: number; life: number }[] = [];
  private shake = 0;
  private clock = 0;

  reset() {
    this.particles = [];
    this.texts = [];
    this.trails.clear();
    this.rings = [];
    this.shake = 0;
  }

  /** 컨트롤러 이벤트로 연출을 만든다. */
  handleEvents(events: readonly GameEvent[], state: GameState) {
    const palette = PALETTES[state.field];
    for (const event of events) {
      switch (event.type) {
        case "fire":
          this.recoil[event.side] = 1;
          for (let i = 0; i < 8; i++) this.spawn({ x: event.x, y: event.y, vx: rand(-40, 40), vy: rand(-50, 10), life: 0.5, size: rand(3, 6), color: "rgba(226,232,240,0.8)", kind: "smoke" });
          break;
        case "explosion": {
          this.shake = Math.min(1, this.shake + 0.7);
          this.rings.push({ x: event.x, y: event.y, r: event.radius, life: 0.45 });
          for (let i = 0; i < 26; i++) {
            const a = rand(-Math.PI, 0);
            const speed = rand(80, 260);
            this.spawn({ x: event.x, y: event.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: rand(0.6, 1.1), size: rand(2, 4), color: palette.debris[i % palette.debris.length], kind: "debris" });
          }
          for (let i = 0; i < 14; i++) {
            const a = rand(0, Math.PI * 2);
            const speed = rand(60, 200);
            this.spawn({ x: event.x, y: event.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: rand(0.2, 0.45), size: rand(2, 3.5), color: i % 2 ? "#fde047" : "#fb923c", kind: "spark" });
          }
          for (let i = 0; i < 10; i++) this.spawn({ x: event.x + rand(-12, 12), y: event.y + rand(-10, 4), vx: rand(-15, 15), vy: rand(-40, -15), life: rand(0.9, 1.6), size: rand(8, 14), color: "rgba(71,85,105,0.55)", kind: "smoke" });
          break;
        }
        case "hit": {
          const tank = state.tanks[event.target];
          this.flash[event.target] = 1;
          this.texts.push({ x: tank.x, y: tank.y - 40, text: `-${event.damage}${event.blocked ? " (BARRIER)" : ""}`, color: event.direct ? "#fde047" : "#fecaca", life: 1.3 });
          if (event.direct) this.texts.push({ x: tank.x, y: tank.y - 58, text: "DIRECT HIT!", color: "#ffffff", life: 1.1 });
          break;
        }
        case "fallDamage": {
          const tank = state.tanks[event.target];
          this.flash[event.target] = 1;
          this.texts.push({ x: tank.x, y: tank.y - 40, text: `-${event.damage} FALL`, color: "#fecaca", life: 1.2 });
          break;
        }
        case "repair": {
          const tank = state.tanks[event.side];
          this.texts.push({ x: tank.x, y: tank.y - 44, text: `+${event.amount} HP`, color: "#86efac", life: 1.2 });
          break;
        }
        case "itemGranted": {
          const tank = state.tanks[event.side];
          this.texts.push({ x: tank.x, y: tank.y - 74, text: event.source === "crate" ? "SUPPLY ITEM!" : "ENERGY ITEM!", color: "#a5f3fc", life: 1.4 });
          break;
        }
        case "crateCollected":
          if (!event.item) this.texts.push({ x: state.tanks[event.by].x, y: state.tanks[event.by].y - 74, text: "+25 ENERGY", color: "#a5f3fc", life: 1.2 });
          break;
        case "projectileLost":
          this.texts.push({ x: WORLD_W / 2, y: 70, text: "MISS", color: "#e2e8f0", life: 0.9 });
          break;
        case "gameOver": {
          if (event.winner === "player") {
            for (let i = 0; i < 70; i++) {
              this.spawn({ x: rand(0, WORLD_W), y: rand(-60, 0), vx: rand(-30, 30), vy: rand(40, 110), life: rand(2.5, 4), size: rand(3, 5), color: ["#f43f5e", "#fde047", "#22d3ee", "#a3e635", "#c084fc"][i % 5], kind: "confetti" });
            }
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private spawn(p: Omit<Particle, "maxLife">) {
    this.particles.push({ ...p, maxLife: p.life });
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  /** 연출 진행 (일시정지 중에는 dt=0) */
  private advance(dt: number, state: GameState) {
    this.clock += dt;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "debris") p.vy += 420 * dt;
      if (p.kind === "smoke") {
        p.vx *= 1 - dt;
        p.size += dt * 8;
      }
      if (p.kind === "confetti") p.vx += Math.sin(this.clock * 3 + p.y / 30) * 20 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 26 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const ring of this.rings) ring.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const side of ["player", "ai"] as const) {
      this.recoil[side] = Math.max(0, this.recoil[side] - dt * 5);
      this.flash[side] = Math.max(0, this.flash[side] - dt * 3);
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);

    // 포탄 꼬리
    const alive = new Set(state.projectiles.map((p) => p.id));
    for (const id of this.trails.keys()) if (!alive.has(id)) this.trails.delete(id);
    for (const p of state.projectiles) {
      const trail = this.trails.get(p.id) ?? [];
      trail.push({ x: p.x, y: p.y });
      if (trail.length > 18) trail.shift();
      this.trails.set(p.id, trail);
    }
  }

  draw(ctx: CanvasRenderingContext2D, state: GameState, guide: GuideView | null, dt: number) {
    this.advance(state.paused ? 0 : dt, state);
    const palette = PALETTES[state.field];
    ctx.save();
    if (this.shake > 0) ctx.translate(rand(-1, 1) * this.shake * 5, rand(-1, 1) * this.shake * 4);

    drawSky(ctx, state.field, palette, state.wind, this.clock);
    drawTerrain(ctx, state.terrain, palette);

    if (state.crate) drawCrate(ctx, state.crate.x, state.crate.y, state.crate.landing, this.clock);
    for (const side of ["player", "ai"] as const) drawTank(ctx, state.tanks[side], this.recoil[side], this.flash[side], state.turn === side && state.phase !== "gameOver", this.clock);

    if (guide && guide.points.length > 1) drawGuide(ctx, guide, this.clock);

    for (const [, trail] of this.trails) {
      for (let i = 1; i < trail.length; i++) {
        ctx.strokeStyle = `rgba(255,255,255,${(i / trail.length) * 0.6})`;
        ctx.lineWidth = 1 + (i / trail.length) * 3;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
    }
    for (const p of state.projectiles) drawShell(ctx, p.x, p.y, p.damageScale > 1);

    for (const ring of this.rings) {
      const t = 1 - ring.life / 0.45;
      ctx.strokeStyle = `rgba(255,237,160,${1 - t})`;
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r * (0.4 + t * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      if (t < 0.35) {
        ctx.fillStyle = `rgba(255,250,220,${0.7 * (1 - t / 0.35)})`;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const p of this.particles) {
      const alpha = Math.min(1, p.life / (p.maxLife * 0.5));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.kind === "smoke" || p.kind === "spark") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * (p.kind === "confetti" ? 0.6 : 1));
    }
    ctx.globalAlpha = 1;

    // 화면 위로 나간 포탄 위치 표시
    for (const p of state.projectiles) {
      if (p.y >= 0) continue;
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.moveTo(p.x, 4);
      ctx.lineTo(p.x - 7, 16);
      ctx.lineTo(p.x + 7, 16);
      ctx.closePath();
      ctx.fill();
    }

    ctx.textAlign = "center";
    ctx.font = "bold 15px system-ui, sans-serif";
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(15,23,42,0.85)";
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ── 배경 ──

function drawSky(ctx: CanvasRenderingContext2D, field: FieldId, palette: Palette, wind: number, clock: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  if (field === "greenHills") {
    ctx.fillStyle = "rgba(255,251,235,0.95)";
    ctx.beginPath();
    ctx.arc(820, 80, 34, 0, Math.PI * 2);
    ctx.fill();
    // 바람 방향으로 흐르는 구름
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 4; i++) {
      const x = ((i * 280 + clock * wind * 4) % (WORLD_W + 200) + WORLD_W + 200) % (WORLD_W + 200) - 100;
      const y = 60 + (i % 2) * 50;
      for (const [dx, dy, r] of [[0, 0, 22], [24, -8, 26], [50, 0, 20]]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (field === "desertCanyon") {
    ctx.fillStyle = "rgba(255,247,237,0.9)";
    ctx.beginPath();
    ctx.arc(160, 95, 44, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 별과 오로라
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % WORLD_W, (i * 53) % 200, 2, 2);
    const aurora = ctx.createLinearGradient(0, 60, WORLD_W, 160);
    aurora.addColorStop(0, "rgba(45,212,191,0)");
    aurora.addColorStop(0.5, "rgba(45,212,191,0.25)");
    aurora.addColorStop(1, "rgba(167,139,250,0)");
    ctx.fillStyle = aurora;
    ctx.beginPath();
    ctx.moveTo(0, 120);
    for (let x = 0; x <= WORLD_W; x += 40) ctx.lineTo(x, 100 + Math.sin(x / 120 + clock * 0.4) * 25);
    ctx.lineTo(WORLD_W, 170);
    ctx.lineTo(0, 170);
    ctx.fill();
  }

  // 먼 산·언덕 실루엣 (장식, 충돌 없음)
  for (const [color, base, amp, freq] of [
    [palette.far, 300, 40, 140],
    [palette.near, 340, 30, 90],
  ] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, WORLD_H);
    for (let x = 0; x <= WORLD_W; x += 8) {
      const y = field === "frozenRidge" ? base - Math.abs(Math.sin(x / freq)) * amp * 1.8 : field === "desertCanyon" ? base - (Math.sin(x / freq) > 0.3 ? amp * 1.4 : amp * 0.3) : base - Math.sin(x / freq) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WORLD_W, WORLD_H);
    ctx.fill();
  }

  // 바람 줄기 (바람이 셀수록 많고 빠르게)
  const strength = Math.abs(wind);
  if (strength > 0) {
    ctx.strokeStyle = field === "frozenRidge" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.5;
    const count = 4 + strength * 2;
    for (let i = 0; i < count; i++) {
      const speed = 60 + strength * 25;
      const x = (((i * 173 + clock * speed * Math.sign(wind)) % WORLD_W) + WORLD_W) % WORLD_W;
      const y = 40 + ((i * 61) % 220);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - Math.sign(wind) * (10 + strength * 3), y);
      ctx.stroke();
    }
  }
}

function drawTerrain(ctx: CanvasRenderingContext2D, terrain: Float32Array, palette: Palette) {
  ctx.beginPath();
  ctx.moveTo(0, WORLD_H);
  for (let x = 0; x < WORLD_W; x++) ctx.lineTo(x, terrain[x]);
  ctx.lineTo(WORLD_W, terrain[WORLD_W - 1]);
  ctx.lineTo(WORLD_W, WORLD_H);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, 180, 0, WORLD_H);
  fill.addColorStop(0, palette.soil);
  fill.addColorStop(1, palette.soilDeep);
  ctx.fillStyle = fill;
  ctx.fill();

  // 흙 무늬 (지형 안쪽에만)
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  for (let y = 200; y < WORLD_H; y += 22) for (let x = (y / 22) % 2 ? 0 : 18; x < WORLD_W; x += 36) ctx.fillRect(x, y, 10, 4);
  ctx.restore();

  // 지표층 (풀·모래·눈): 깎이지 않은 곳과 구덩이 모두 표면을 따라 그린다
  ctx.lineJoin = "round";
  ctx.strokeStyle = palette.crust;
  ctx.lineWidth = 8;
  strokeSurface(ctx, terrain, 3);
  ctx.strokeStyle = palette.soilTop;
  ctx.lineWidth = 5;
  strokeSurface(ctx, terrain, 1.5);
}

function strokeSurface(ctx: CanvasRenderingContext2D, terrain: Float32Array, offset: number) {
  ctx.beginPath();
  let drawing = false;
  for (let x = 0; x < WORLD_W; x++) {
    const y = terrain[x];
    if (y >= WORLD_H - 1) {
      drawing = false;
      continue;
    }
    if (!drawing) {
      ctx.moveTo(x, y + offset);
      drawing = true;
    } else ctx.lineTo(x, y + offset);
  }
  ctx.stroke();
}

// ── 오브젝트 ──

function drawTank(ctx: CanvasRenderingContext2D, tank: Tank, recoil: number, flash: number, active: boolean, clock: number) {
  if (tank.fell) return;
  const c = TANK_COLORS[tank.side];
  const { x, y } = tank;
  ctx.save();

  if (active) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    const bob = Math.sin(clock * 5) * 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 46 + bob);
    ctx.lineTo(x - 6, y - 54 + bob);
    ctx.lineTo(x + 6, y - 54 + bob);
    ctx.closePath();
    ctx.fill();
  }

  // 포신 (반동: 발사 직후 뒤로 밀림)
  const rad = (tank.angle * Math.PI) / 180;
  const back = recoil * 6;
  const px = x;
  const py = y - PHYSICS.barrelPivotY;
  const dx = tank.facing * Math.cos(rad);
  const dy = -Math.sin(rad);
  ctx.strokeStyle = c.dark;
  ctx.lineCap = "round";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(px - dx * back, py - dy * back);
  ctx.lineTo(px + dx * (PHYSICS.barrelLength - back), py + dy * (PHYSICS.barrelLength - back));
  ctx.stroke();

  // 궤도
  ctx.fillStyle = "#334155";
  roundRect(ctx, x - 15, y - 7, 30, 8, 4);
  ctx.fill();
  ctx.fillStyle = "#94a3b8";
  for (let i = -10; i <= 10; i += 5) {
    ctx.beginPath();
    ctx.arc(x + i, y - 3, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // 차체·포탑
  ctx.fillStyle = c.body;
  roundRect(ctx, x - 13, y - 13, 26, 7, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - 12, 8, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = c.light;
  ctx.fillRect(x - 10, y - 12, 8, 2);

  if (flash > 0) {
    ctx.globalAlpha = flash * 0.8;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x - 15, y - 21, 30, 22, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (tank.barrier) {
    ctx.strokeStyle = "rgba(125,211,252,0.9)";
    ctx.fillStyle = "rgba(125,211,252,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 10, 24 + Math.sin(clock * 4) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // HP 막대
  const w = 36;
  const ratio = Math.max(0, tank.hp) / TANK.maxHp;
  ctx.fillStyle = "rgba(15,23,42,0.75)";
  roundRect(ctx, x - w / 2 - 1, y - 34, w + 2, 7, 3);
  ctx.fill();
  ctx.fillStyle = ratio > 0.5 ? "#4ade80" : ratio > 0.25 ? "#facc15" : "#f87171";
  roundRect(ctx, x - w / 2, y - 33, w * ratio, 5, 2);
  ctx.fill();
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(tank.side === "player" ? "YOU" : "CPU", x, y - 38);
  ctx.restore();
}

function drawShell(ctx: CanvasRenderingContext2D, x: number, y: number, power: boolean) {
  ctx.fillStyle = power ? "#f97316" : "#1e293b";
  ctx.strokeStyle = power ? "#fde047" : "#f8fafc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, power ? 5 : 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawCrate(ctx: CanvasRenderingContext2D, x: number, y: number, landing: boolean, clock: number) {
  const s = CRATE.halfSize;
  if (landing) {
    // 낙하산
    const sway = Math.sin(clock * 2) * 3;
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#e11d48";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + sway, y - s * 2 - 22, 18, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(15,23,42,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + sway - 17, y - s * 2 - 22);
    ctx.lineTo(x - s, y - s * 2);
    ctx.moveTo(x + sway + 17, y - s * 2 - 22);
    ctx.lineTo(x + s, y - s * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#b45309";
  ctx.fillRect(x - s, y - s * 2, s * 2, s * 2);
  ctx.strokeStyle = "#78350f";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - s + 1, y - s * 2 + 1, s * 2 - 2, s * 2 - 2);
  ctx.beginPath();
  ctx.moveTo(x - s + 1, y - s * 2 + 1);
  ctx.lineTo(x + s - 1, y - 1);
  ctx.stroke();
  ctx.fillStyle = "#fde047";
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("?", x, y - s + 4);
}

function drawGuide(ctx: CanvasRenderingContext2D, guide: GuideView, clock: number) {
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < guide.points.length; i += 3) {
    const p = guide.points[i];
    const fade = guide.full ? 1 : 1 - i / guide.points.length;
    ctx.fillStyle = `rgba(15,23,42,${0.45 * fade})`;
    ctx.beginPath();
    ctx.arc(p.x + 1, p.y + 1, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = guide.full ? `rgba(165,243,252,${fade})` : `rgba(255,255,255,${fade})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (guide.impact) {
    const pulse = 10 + Math.sin(clock * 6) * 3;
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(guide.impact.x, guide.impact.y, pulse, 0, Math.PI * 2);
    ctx.moveTo(guide.impact.x - pulse - 5, guide.impact.y);
    ctx.lineTo(guide.impact.x + pulse + 5, guide.impact.y);
    ctx.stroke();
  }
  ctx.restore();
}

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
