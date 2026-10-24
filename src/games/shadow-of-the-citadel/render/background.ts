import { TILE } from "../config";
import type { Decor } from "../level";
import { isSolid, type World } from "../logic/world";

/*
 * 픽셀 아트 배경 (오리지널, 외부 에셋 없음). 처음 한 번 오프스크린 캔버스에 그려 두고 매 프레임 잘라 붙인다.
 * ART = 월드 픽셀 2개당 아트 픽셀 1개. 그릴 때 이미지 보간을 꺼서 픽셀이 또렷하게 보인다.
 *   far  (패럴랙스 0.25): 거대한 아치가 이어지는 먼 회랑, 높은 창의 희미한 빛
 *   mid  (0.55): 돌기둥과 아치 열주
 *   wall (1.0, 지형 뒤): 벽돌 벽, 붙임 기둥·벽감·깃발·횃불 받침, 횃불 주변 따뜻한 빛
 *   tiles(1.0): 바닥·발판 석재 (닳은 윗면, 이음매, 금, 그늘)
 * 난수는 고정 시드: 매번 같은 그림이 나온다(연출 전용, 규칙과 무관).
 */

export const ART = 2;

export const PARALLAX = { far: 0.25, mid: 0.55 } as const;

export interface BackgroundArt {
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  wall: HTMLCanvasElement;
  tiles: HTMLCanvasElement;
  /** 지형이 벽에 드리우는 그림자 (지형 모양을 검게 칠한 것, 렌더러가 오른쪽 아래로 밀어 그린다) */
  tileShadow: HTMLCanvasElement;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** 패럴랙스 층의 크기: 화면 크기 + (월드 - 화면) × 배율 */
function layerSize(worldW: number, worldH: number, viewW: number, viewH: number, factor: number) {
  return { w: (viewW + (worldW - viewW) * factor) / ART + 4, h: (viewH + (worldH - viewH) * factor) / ART + 4 };
}

function drawArchShape(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, bottom: number) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, bottom);
  ctx.lineTo(x, top + r);
  ctx.arc(x + r, top + r, r, Math.PI, 0);
  ctx.lineTo(x + w, bottom);
  ctx.closePath();
}

function buildFar(worldW: number, worldH: number, viewW: number, viewH: number) {
  const { w, h } = layerSize(worldW, worldH, viewW, viewH, PARALLAX.far);
  const { c, ctx } = canvas(w, h);
  const rand = mulberry32(11);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0b0810");
  grad.addColorStop(0.65, "#140e15");
  grad.addColorStop(1, "#1d1416");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // 먼 아치 열: 안쪽은 더 어둡고, 높은 창에서 차가운 빛이 조금 새어 든다
  const span = 92;
  for (let x = -20; x < w + span; x += span) {
    ctx.fillStyle = "#1b131b";
    ctx.fillRect(x, 26, 18, h);
    ctx.fillStyle = "#0d0a10";
    drawArchShape(ctx, x + 18, 40, span - 18, h);
    ctx.fill();
    if (rand() < 0.75) {
      const wx = x + 18 + (span - 18) / 2 - 3;
      ctx.fillStyle = "#24314a";
      ctx.fillRect(wx, 58, 6, 22);
      ctx.fillRect(wx + 1, 55, 4, 3);
      ctx.fillStyle = "rgba(90,120,170,0.10)";
      ctx.beginPath();
      ctx.moveTo(wx, 80);
      ctx.lineTo(wx + 6, 80);
      ctx.lineTo(wx + 22, h);
      ctx.lineTo(wx - 14, h);
      ctx.closePath();
      ctx.fill();
    }
    // 기둥 이음선
    ctx.fillStyle = "#231920";
    for (let y = 30; y < h; y += 9) ctx.fillRect(x, y, 18, 1);
  }
  // 아래쪽 안개
  const haze = ctx.createLinearGradient(0, h * 0.6, 0, h);
  haze.addColorStop(0, "rgba(60,36,28,0)");
  haze.addColorStop(1, "rgba(70,42,30,0.35)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);
  return c;
}

function buildMid(worldW: number, worldH: number, viewW: number, viewH: number) {
  const { w, h } = layerSize(worldW, worldH, viewW, viewH, PARALLAX.mid);
  const { c, ctx } = canvas(w, h);
  const rand = mulberry32(23);
  const span = 70;
  const capY = 52;
  for (let x = 10; x < w + span; x += span) {
    // 아치 (기둥 사이)
    ctx.fillStyle = "#231a1c";
    ctx.beginPath();
    ctx.moveTo(x + 12, capY);
    ctx.arc(x + 12 + (span - 12) / 2, capY, (span - 12) / 2, Math.PI, 0);
    ctx.lineTo(x + span, capY - 6);
    ctx.lineTo(x + 12, capY - 6);
    ctx.closePath();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#2b2022";
    ctx.stroke();
    // 기둥
    ctx.fillStyle = "#2b2023";
    ctx.fillRect(x, capY, 12, h);
    ctx.fillStyle = "#35282a";
    ctx.fillRect(x + 8, capY, 2, h);
    ctx.fillStyle = "#1e1618";
    ctx.fillRect(x + 1, capY, 2, h);
    // 기둥머리·받침
    ctx.fillStyle = "#3a2c2c";
    ctx.fillRect(x - 3, capY - 4, 18, 4);
    ctx.fillRect(x - 2, capY, 16, 2);
    for (let y = capY + 12; y < h; y += 14) {
      ctx.fillStyle = "#211819";
      ctx.fillRect(x, y, 12, 1);
    }
    // 사슬
    if (rand() < 0.4) {
      const cx = x + 12 + rand() * (span - 20);
      const len = 20 + rand() * 40;
      ctx.fillStyle = "#1a1416";
      for (let y = capY - 4; y < capY + len; y += 3) ctx.fillRect(cx, y, 1, 2);
      ctx.fillRect(cx - 1, capY + len, 3, 3);
    }
  }
  return c;
}

/** 벽돌 벽 + 장식 + 구운 조명 */
function buildWall(world: World, decor: Decor[]) {
  const worldW = world.cols * TILE;
  const worldH = world.rows * TILE;
  const { c, ctx } = canvas(worldW / ART, worldH / ART);
  const rand = mulberry32(37);
  const bw = 16;
  const bh = 8;
  // 뒤 벽은 지형보다 어둡고 채도가 낮다 (딛는 돌과 구분되도록)
  ctx.fillStyle = "#17100d";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let row = 0; row * bh < c.height; row++) {
    const offset = row % 2 ? bw / 2 : 0;
    for (let x = -offset; x < c.width; x += bw) {
      const tone = (rand() - 0.5) * 12;
      ctx.fillStyle = shade("#2c221d", tone);
      ctx.fillRect(x + 1, row * bh + 1, bw - 1, bh - 1);
      ctx.fillStyle = shade("#352a23", tone);
      ctx.fillRect(x + 1, row * bh + 1, bw - 1, 1);
      if (rand() < 0.12) {
        ctx.fillStyle = shade("#221a15", tone);
        ctx.fillRect(x + 2 + Math.floor(rand() * 10), row * bh + 3, 3, 2);
      }
    }
  }
  // 위아래로 갈수록 어둡게
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, "rgba(8,5,6,0.55)");
  grad.addColorStop(0.35, "rgba(8,5,6,0.1)");
  grad.addColorStop(0.75, "rgba(8,5,6,0.15)");
  grad.addColorStop(1, "rgba(4,2,3,0.7)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  // 틈(바닥 없는 열) 아래는 깊은 어둠
  for (let col = 0; col < world.cols; col++) {
    if (isSolid(world, col, world.rows - 1)) continue;
    const g = ctx.createLinearGradient(0, (15 * TILE) / ART, 0, c.height);
    g.addColorStop(0, "rgba(0,0,0,0.2)");
    g.addColorStop(1, "rgba(0,0,0,0.92)");
    ctx.fillStyle = g;
    ctx.fillRect((col * TILE) / ART, (15 * TILE) / ART, TILE / ART, c.height);
  }

  for (const d of decor) {
    const x = (d.col * TILE) / ART;
    const y = (d.row * TILE) / ART;
    if (d.kind === "column") {
      // 붙임 기둥: 세로 홈, 기둥머리, 받침
      const top = 40 / ART;
      ctx.fillStyle = "#4a3a30";
      ctx.fillRect(x + 2, top, 14, y - top);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = "#3a2d25";
        ctx.fillRect(x + 4 + i * 4, top + 4, 1, y - top - 8);
        ctx.fillStyle = "#5a4739";
        ctx.fillRect(x + 5 + i * 4, top + 4, 1, y - top - 8);
      }
      ctx.fillStyle = "#594536";
      ctx.fillRect(x, top - 2, 18, 4);
      ctx.fillRect(x, y - 4, 18, 4);
      ctx.fillStyle = "#2a1f19";
      ctx.fillRect(x, top + 2, 18, 1);
    } else if (d.kind === "alcove") {
      // 벽감: 아치형 움푹한 자리와 항아리
      ctx.fillStyle = "#4b3a2f";
      drawArchShape(ctx, x - 1, y - 46, 20, y - 6);
      ctx.fill();
      ctx.fillStyle = "#120c0a";
      drawArchShape(ctx, x + 1, y - 44, 16, y - 8);
      ctx.fill();
      ctx.fillStyle = "#6a4a30";
      ctx.fillRect(x + 6, y - 18, 6, 9);
      ctx.fillRect(x + 7, y - 20, 4, 2);
      ctx.fillStyle = "#8a6440";
      ctx.fillRect(x + 7, y - 17, 1, 6);
      ctx.fillStyle = "#3a2b22";
      ctx.fillRect(x - 2, y - 8, 22, 3);
    } else if (d.kind === "banner") {
      // 깃발: 청록 천에 단순한 기하 문양 (오리지널)
      const w = 14;
      const h = 34;
      ctx.fillStyle = "#2b211b";
      ctx.fillRect(x - 2, y - 1, w + 4, 2);
      ctx.fillStyle = "#1c4a47";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w / 2, y + h - 5);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#143735";
      ctx.fillRect(x, y, 2, h);
      ctx.fillStyle = "#b08a4a";
      ctx.fillRect(x + 6, y + 8, 2, 14);
      ctx.fillRect(x + 3, y + 13, 8, 2);
      ctx.fillRect(x + 4, y + 26, 6, 1);
    } else if (d.kind === "torch") {
      // 횃불 받침 (불꽃은 매 프레임 그린다)
      ctx.fillStyle = "#1b1412";
      ctx.fillRect(x + 6, y + 6, 4, 10);
      ctx.fillStyle = "#3d2f28";
      ctx.fillRect(x + 5, y + 2, 6, 4);
      ctx.fillStyle = "#5a3a22";
      ctx.fillRect(x + 6, y - 3, 4, 6);
    }
  }

  // 아치 창: 벽을 뚫어 뒤쪽 회랑(중간·먼 배경)이 보이게 한다 → 패럴랙스 깊이감
  for (const d of decor) {
    if (d.kind !== "opening") continue;
    const x = (d.col * TILE) / ART;
    const bottom = (d.row * TILE) / ART;
    const w = (4 * TILE) / ART;
    const top = bottom - (6 * TILE) / ART;
    // 테두리 돌(아치 둘레석)
    ctx.fillStyle = "#4e3c30";
    drawArchShape(ctx, x - 4, top - 4, w + 8, bottom + 4);
    ctx.fill();
    for (let a = 0; a <= 8; a++) {
      const ang = Math.PI + (a / 8) * Math.PI;
      const r = w / 2 + 2;
      ctx.fillStyle = "#2a1f19";
      ctx.fillRect(x + w / 2 + Math.cos(ang) * r, top + w / 2 + Math.sin(ang) * r, 1, 1);
    }
    ctx.fillStyle = "#5d4838";
    ctx.fillRect(x - 6, bottom, w + 12, 4);
    ctx.fillStyle = "#2f231c";
    ctx.fillRect(x - 6, bottom + 4, w + 12, 1);
    ctx.globalCompositeOperation = "destination-out";
    drawArchShape(ctx, x, top, w, bottom);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    // 창 안쪽 가장자리 그늘
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x, top + w / 2, 2, bottom - top - w / 2);
  }

  // 횃불 주변 벽이 따뜻하게 밝아진다(정적 조명). 깜빡임은 렌더러가 위에 더한다.
  ctx.globalCompositeOperation = "lighter";
  for (const d of decor) {
    if (d.kind !== "torch") continue;
    const { x, y } = torchFlamePosition(d);
    const g = ctx.createRadialGradient(x / ART, y / ART, 2, x / ART, y / ART, 150 / ART);
    g.addColorStop(0, "rgba(150,80,30,0.42)");
    g.addColorStop(0.45, "rgba(110,50,20,0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x / ART - 150 / ART, y / ART - 150 / ART, 300 / ART, 300 / ART);
  }
  ctx.globalCompositeOperation = "source-over";
  return c;
}

/** 바닥·발판 석재 */
function buildTiles(world: World) {
  const { c, ctx } = canvas((world.cols * TILE) / ART, (world.rows * TILE) / ART);
  const rand = mulberry32(53);
  const t = TILE / ART;
  for (let row = 0; row < world.rows; row++) {
    for (let col = 0; col < world.cols; col++) {
      if (!isSolid(world, col, row)) continue;
      const x = col * t;
      const y = row * t;
      const openUp = !isSolid(world, col, row - 1);
      const openDown = row + 1 < world.rows && !isSolid(world, col, row + 1);
      const openL = !isSolid(world, col - 1, row);
      const openR = !isSolid(world, col + 1, row);
      const exposed = openUp || openDown || openL || openR;
      // 깊은 안쪽은 어둡고 단순하게
      const depth = exposed ? 0 : isSolid(world, col, row - 2) && isSolid(world, col, row - 1) ? 2 : 1;
      const tone = (rand() - 0.5) * 5 - depth * 12;
      // 돌마다 조금씩 다른 색 (타일 단위로 바꾸면 세로 줄무늬가 생긴다)
      ctx.fillStyle = shade("#6b513d", tone + (rand() - 0.5) * 8);
      ctx.fillRect(x, y, t, t / 2);
      ctx.fillStyle = shade("#6b513d", tone + (rand() - 0.5) * 8);
      ctx.fillRect(x, y + t / 2, t, t / 2);
      // 큰 돌 두 개 (줄마다 이음매를 엇갈림)
      ctx.fillStyle = shade("#35271e", tone);
      ctx.fillRect(x, y + t / 2, t, 1);
      const seam = row % 2 ? 5 : 11;
      ctx.fillRect(x + seam, y, 1, t / 2);
      ctx.fillRect(x + ((seam + 8) % t), y + t / 2, 1, t / 2);
      ctx.fillStyle = shade("#6a5240", tone);
      ctx.fillRect(x, y + t / 2 + 1, t, 1);
      ctx.fillRect(x, y + 1, t, 1);
      // 금·얼룩
      if (rand() < 0.25) {
        ctx.fillStyle = shade("#2e2219", tone);
        const cx = x + 2 + Math.floor(rand() * 10);
        const cy = y + 3 + Math.floor(rand() * 9);
        ctx.fillRect(cx, cy, 1, 1);
        ctx.fillRect(cx + 1, cy + 1, 1, 1);
        ctx.fillRect(cx + 1, cy + 2, 1, 1);
      }
      if (openUp) {
        // 닳은 윗면: 밝은 띠와 하이라이트, 그 아래 그늘
        ctx.fillStyle = shade("#a07e5c", tone);
        ctx.fillRect(x, y, t, 2);
        ctx.fillStyle = shade("#c7a37a", tone);
        ctx.fillRect(x, y, t, 1);
        ctx.fillStyle = shade("#3b2c22", tone);
        ctx.fillRect(x, y + 2, t, 1);
        if (rand() < 0.3) {
          ctx.fillStyle = shade("#6e5440", tone);
          ctx.fillRect(x + Math.floor(rand() * 12), y, 3, 1);
        }
      }
      if (openDown) {
        ctx.fillStyle = "#1c130f";
        ctx.fillRect(x, y + t - 2, t, 2);
      }
      if (openL) {
        ctx.fillStyle = "#1a110c";
        ctx.fillRect(x, y, 1, t);
        ctx.fillStyle = shade("#7c5f47", tone);
        ctx.fillRect(x + 1, y + 2, 1, t - 2);
        if (openUp) {
          ctx.fillStyle = shade("#b8956f", tone);
          ctx.fillRect(x, y, 2, 1);
        }
      }
      if (openR) {
        ctx.fillStyle = "#1a110c";
        ctx.fillRect(x + t - 1, y, 1, t);
        if (openUp) {
          ctx.fillStyle = shade("#b8956f", tone);
          ctx.fillRect(x + t - 2, y, 2, 1);
        }
      }
    }
  }
  // 위쪽이 막힌 바닥 근처(천장 아래)는 어둡게
  return c;
}

export function torchFlamePosition(d: Decor): { x: number; y: number } {
  return { x: d.col * TILE + 16, y: d.row * TILE - 8 };
}

function silhouette(src: HTMLCanvasElement, color: string) {
  const { c, ctx } = canvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export function buildBackground(world: World, decor: Decor[], viewW: number, viewH: number): BackgroundArt {
  const worldW = world.cols * TILE;
  const worldH = world.rows * TILE;
  const tiles = buildTiles(world);
  return {
    far: buildFar(worldW, worldH, viewW, viewH),
    mid: buildMid(worldW, worldH, viewW, viewH),
    wall: buildWall(world, decor),
    tiles,
    tileShadow: silhouette(tiles, "rgba(0,0,0,0.55)"),
  };
}
