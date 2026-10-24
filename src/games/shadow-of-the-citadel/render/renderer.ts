import type { Animator } from "../animation/animator";
import type { Camera } from "../camera";
import { BODY, LEDGE, VIEW } from "../config";
import { DECOR } from "../level";
import type { Player, PlayerEvent } from "../logic/player";
import { allLedges, groundBelow, type Ledge, type World } from "../logic/world";
import { ART, buildBackground, PARALLAX, torchFlamePosition, type BackgroundArt } from "./background";
import { CharacterPainter } from "./character";

/*
 * 캔버스 그리기. 규칙·물리를 읽기만 한다.
 * 순서: 먼 배경 → 중간 배경 → 벽 → 지형 → 캐릭터(+그림자) → 먼지 → 횃불 불꽃·빛 → 화면 가장자리 어둡게 → 디버그 표시
 * Math.random()은 먼지·불씨 같은 연출에만 쓴다.
 */

export interface DebugFlags {
  hitbox: boolean;
  ledges: boolean;
  skeleton: boolean;
}

export interface RenderFrame {
  player: Player;
  /** 보간된 발 위치 */
  x: number;
  y: number;
  anim: Animator;
  camera: Camera;
  /** 시간 배율이 적용된 누적 시간 / 이번 프레임 시간 */
  time: number;
  dt: number;
  debug: DebugFlags;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
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

const TORCHES = DECOR.filter((d) => d.kind === "torch").map(torchFlamePosition);

export class ShadowRenderer {
  private art: BackgroundArt;
  private painter = new CharacterPainter();
  private particles: Particle[] = [];
  private ledges: Ledge[];
  private world: World;
  private skidDust = 0;

  constructor(world: World, viewW: number, viewH: number) {
    this.world = world;
    this.art = buildBackground(world, DECOR, viewW, viewH);
    this.ledges = allLedges(world);
  }

  resetEffects() {
    this.particles = [];
    this.painter.reset();
  }

  /** 물리 이벤트 → 먼지 효과 */
  handleEvents(events: PlayerEvent[], p: Player) {
    for (const e of events) {
      if (e.type === "land") {
        const n = e.level === "heavy" ? 18 : e.level === "medium" ? 10 : 5;
        this.dust(p.x, p.y, n, 30 + e.impact * 0.12, 0.45);
      } else if (e.type === "jump") this.dust(p.x - p.facing * 4, p.y, 4, 40, 0.3);
      else if (e.type === "grab" && p.ledge) this.crumbs(p.ledge.x + p.ledge.dir * 3, p.ledge.y, 4);
      else if (e.type === "climbEnd") this.dust(p.x, p.y, 3, 25, 0.3);
      else if (e.type === "respawn") this.resetEffects();
    }
  }

  private dust(x: number, y: number, n: number, speed: number, life: number) {
    for (let i = 0; i < n; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y - 1,
        vx: dir * speed * (0.4 + Math.random() * 0.8),
        vy: -speed * (0.15 + Math.random() * 0.35),
        life: 0,
        max: life * (0.6 + Math.random() * 0.8),
        size: 2 + Math.random() * 2.5,
        color: "#8a7462",
        gravity: 60,
      });
    }
  }

  private crumbs(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, life: 0, max: 0.6, size: 1.6, color: "#a58566", gravity: 900 });
    }
  }

  render(ctx: CanvasRenderingContext2D, f: RenderFrame) {
    const { camera } = f;
    const vw = camera.viewWidth;
    const vh = camera.viewHeight;
    const left = camera.x - vw / 2;
    const top = camera.y - vh / 2;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#07050a";
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.scale(VIEW.zoom, VIEW.zoom);

    // 패럴랙스 층: 카메라 이동의 일부만큼 움직인다
    const layer = (img: HTMLCanvasElement, factor: number) => {
      ctx.drawImage(img, (left * factor) / ART, (top * factor) / ART, vw / ART, vh / ART, 0, 0, vw, vh);
    };
    layer(this.art.far, PARALLAX.far);
    layer(this.art.mid, PARALLAX.mid);
    layer(this.art.wall, 1);

    ctx.translate(-left, -top);
    // 지형 그림자: 오른쪽 아래로 밀어 벽에 드리운다 (발판이 벽에서 떨어져 보이게)
    ctx.drawImage(this.art.tileShadow, (left - 6) / ART, (top - 8) / ART, vw / ART, vh / ART, left, top, vw, vh);
    // 지형은 월드와 1:1 (아트 픽셀 2배)
    ctx.drawImage(this.art.tiles, left / ART, top / ART, vw / ART, vh / ART, left, top, vw, vh);

    this.drawTorches(ctx, f.time, left, top, vw, vh);

    // 캐릭터
    ctx.imageSmoothingEnabled = true;
    const view = {
      x: f.x + f.anim.offset.x,
      y: f.y + f.anim.offset.y,
      scaleX: f.anim.facingScale,
      pose: f.anim.pose,
      groundY: f.player.mode === "hang" || f.player.mode === "climb" ? null : groundBelow(this.world, f.x, f.y),
    };
    this.painter.simulate(view, f.dt);
    this.painter.draw(ctx, view, f.debug.skeleton);

    this.updateParticles(ctx, f);
    this.drawLight(ctx, f.time, left, top, vw, vh);

    if (f.debug.ledges) this.drawLedgeZones(ctx, f.player);
    if (f.debug.hitbox) this.drawHitbox(ctx, f);
    ctx.restore();

    // 화면 가장자리를 어둡게 (집중·분위기)
    const g = ctx.createRadialGradient(VIEW.width / 2, VIEW.height * 0.55, VIEW.height * 0.35, VIEW.width / 2, VIEW.height * 0.55, VIEW.width * 0.65);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  private flicker(time: number, i: number) {
    return 0.82 + 0.1 * Math.sin(time * 11 + i * 1.7) + 0.08 * Math.sin(time * 23.3 + i * 4.1);
  }

  /** 픽셀 불꽃 (아트 픽셀 단위로 그려 배경과 같은 질감) */
  private drawTorches(ctx: CanvasRenderingContext2D, time: number, left: number, top: number, vw: number, vh: number) {
    TORCHES.forEach((t, i) => {
      if (t.x < left - 40 || t.x > left + vw + 40 || t.y < top - 40 || t.y > top + vh + 40) return;
      const k = this.flicker(time, i);
      const px = ART;
      const cols = [-2, -1, 0, 1, 2];
      for (const c of cols) {
        const h = Math.max(1, Math.round((5 - Math.abs(c) * 1.6) * k + Math.sin(time * 17 + c * 2 + i) * 1.2));
        for (let y = 0; y < h; y++) {
          const frac = y / h;
          ctx.fillStyle = frac < 0.35 && Math.abs(c) < 2 ? "#fff2b8" : frac < 0.7 ? "#ffb347" : "#e2632a";
          const sway = Math.round(Math.sin(time * 6 + i + y * 0.6) * (y / 6));
          ctx.fillRect(t.x + (c + sway) * px - px / 2, t.y - y * px, px, px);
        }
      }
      // 불씨
      if (Math.random() < 0.04) {
        this.particles.push({ x: t.x + (Math.random() - 0.5) * 6, y: t.y - 10, vx: (Math.random() - 0.5) * 12, vy: -30 - Math.random() * 30, life: 0, max: 1 + Math.random(), size: 1.5, color: "#ffb35a", gravity: -6 });
      }
    });
  }

  /** 횃불 빛: 가산 혼합으로 주변(캐릭터 포함)을 따뜻하게 비춘다 */
  private drawLight(ctx: CanvasRenderingContext2D, time: number, left: number, top: number, vw: number, vh: number) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    TORCHES.forEach((t, i) => {
      const r = 170;
      if (t.x < left - r || t.x > left + vw + r || t.y < top - r || t.y > top + vh + r) return;
      const k = this.flicker(time, i);
      const g = ctx.createRadialGradient(t.x, t.y, 4, t.x, t.y, r * (0.92 + 0.08 * k));
      g.addColorStop(0, `rgba(255,170,90,${0.26 * k})`);
      g.addColorStop(0.35, `rgba(200,100,40,${0.1 * k})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(t.x - r, t.y - r, r * 2, r * 2);
    });
    ctx.restore();
  }

  private updateParticles(ctx: CanvasRenderingContext2D, f: RenderFrame) {
    const dt = f.dt;
    // 미끄러지며 멈출 때·달리기 발자국 먼지
    if (f.player.mode === "skid" || f.player.mode === "turn") {
      this.skidDust += dt;
      if (this.skidDust > 0.035) {
        this.skidDust = 0;
        this.dust(f.x + f.player.facing * 10, f.y, 1, 25 + Math.abs(f.player.vx) * 0.15, 0.4);
      }
    }
    for (const s of f.anim.steps) if (s.strength > 0.6 && Math.random() < 0.7) this.dust(s.x, s.y, 1, 18, 0.3);

    const next: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(0.04, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a * (p.color === "#ffb35a" ? 0.9 : 0.5);
      ctx.fillStyle = p.color;
      const s = p.size * (p.color === "#8a7462" ? 1 + p.life * 2 : 1);
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      next.push(p);
    }
    ctx.globalAlpha = 1;
    this.particles = next.length > 300 ? next.slice(-300) : next;
  }

  private drawHitbox(ctx: CanvasRenderingContext2D, f: RenderFrame) {
    const p = f.player;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#4ade80";
    ctx.strokeRect(f.x - BODY.halfWidth, f.y - BODY.height, BODY.halfWidth * 2, BODY.height);
    // 발 기준점(지면 접촉)
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(f.x - 3, f.y - 0.5, 6, 1);
    ctx.fillRect(f.x - 0.5, f.y - 3, 1, 6);
    // 손 기준점(난간 판정): 몸 앞면, 매달렸을 때의 손 높이
    const hx = f.x + p.facing * BODY.halfWidth;
    const hy = f.y - LEDGE.hangDepth;
    ctx.fillStyle = "#facc15";
    ctx.fillRect(hx - 2, hy - 2, 4, 4);
  }

  private drawLedgeZones(ctx: CanvasRenderingContext2D, p: Player) {
    for (const l of this.ledges) {
      const active = p.probe && p.probe.x === l.x && p.probe.y === l.y && p.probe.dir === l.dir;
      // 손 기준점이 이 사각형 안에 들어오면 잡는다
      const x0 = l.x - l.dir * LEDGE.reachMax;
      const x1 = l.x - l.dir * LEDGE.reachMin;
      const y0 = l.y - LEDGE.windowAbove;
      const y1 = l.y + LEDGE.windowBelow;
      ctx.fillStyle = active ? "rgba(250,204,21,0.45)" : "rgba(251,146,60,0.18)";
      ctx.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0);
      ctx.strokeStyle = active ? "#facc15" : "rgba(251,146,60,0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0);
      // 모서리
      ctx.fillStyle = active ? "#fde047" : "#fb923c";
      ctx.fillRect(l.x - 1.5, l.y - 1.5, 3, 3);
    }
  }
}
