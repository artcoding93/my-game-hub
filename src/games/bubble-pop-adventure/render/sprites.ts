import { Pix } from "./pixels";

/*
 * 픽셀 아트 정의 (모두 이 게임을 위한 오리지널 디자인). 오른쪽을 보는 그림을 만들고, 왼쪽은 좌우 반전한다.
 *   플레이어: 머리에 별 장식을 단 둥근 별빛 정령 "Lumi" (보라색 망토)
 *   적(기계 요정): 톱니 몸통의 외눈 Cogling, 깡통 머리 스프링 Springlet, 프로펠러 비행 Whirlwing, 바퀴 달린 태엽 Zipwind
 *   보스: 종 모양 몸통에 시계 창과 톱니 왕관을 쓴 Chime Queen
 */

const OUT = "#231a3f";

/** 별 모양 (꼭짓점 5개) */
export function star(p: Pix, cx: number, cy: number, outer: number, inner: number, color: string, rot = 0) {
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + rot + (i * Math.PI * 2) / 5;
    const ox = cx + Math.cos(a) * outer;
    const oy = cy + Math.sin(a) * outer;
    const l = a - Math.PI / 5;
    const r = a + Math.PI / 5;
    p.tri(cx, cy, cx + Math.cos(l) * inner, cy + Math.sin(l) * inner, ox, oy, color);
    p.tri(cx, cy, ox, oy, cx + Math.cos(r) * inner, cy + Math.sin(r) * inner, color);
  }
}

// ── 플레이어 (20×18, 발 = 아래 가운데) ──

const LUMI = {
  body: "#fff3c4",
  shade: "#f2cf74",
  crest: "#ffd23f",
  crestHi: "#fffbe0",
  cape: "#7b5cff",
  capeHi: "#a993ff",
  eye: "#2a1f4a",
  cheek: "#ff9ab8",
  feet: "#e0a83c",
};

export type LumiPose = "idle0" | "idle1" | "walk0" | "walk1" | "walk2" | "walk3" | "jump" | "fall" | "blow" | "hurt" | "win0" | "win1";

export function buildLumi(pose: LumiPose): Pix {
  const p = new Pix(20, 18);
  const bob = pose === "idle1" || pose === "walk1" || pose === "walk3" ? 1 : pose === "win0" ? -1 : 0;
  const air = pose === "jump" || pose === "fall" || pose === "win0";
  // 망토 (몸 뒤, 바람에 날림)
  const flap = pose === "walk1" || pose === "walk3" || air ? -1 : 0;
  p.tri(7, 8 + bob, 2, 14 + flap * 2 + bob, 8, 15 + bob, LUMI.cape);
  p.tri(6, 9 + bob, 3, 13 + flap * 2 + bob, 6, 13 + bob, LUMI.capeHi);
  // 발
  const feet: Record<LumiPose, [number, number]> = {
    idle0: [7, 11],
    idle1: [7, 11],
    walk0: [7, 11],
    walk1: [8, 10],
    walk2: [7, 11],
    walk3: [6, 12],
    jump: [7.5, 11],
    fall: [6, 12],
    blow: [7, 11],
    hurt: [7, 11],
    win0: [7.5, 10.5],
    win1: [7, 11],
  };
  const [back, front] = feet[pose];
  const footY = air ? 15 : 16;
  p.rect(Math.round(back), footY, 3, 2, LUMI.feet);
  p.rect(Math.round(front), footY, 3, 2, LUMI.feet);
  // 둥근 몸 (머리와 몸이 하나)
  const cx = pose === "blow" ? 10.5 : 10;
  const cy = 10.5 + bob + (pose === "hurt" ? 0.5 : 0);
  p.ellipse(cx, cy, 5.6, 5.3, LUMI.body);
  p.ellipse(cx - 1, cy + 3.2, 3.6, 1.6, LUMI.shade);
  p.ellipse(cx - 1.6, cy - 2, 1.2, 1, "#ffffff");
  // 별 장식 (머리 위)
  const tilt = pose === "hurt" ? 0.5 : pose === "blow" ? 0.15 : 0;
  star(p, cx + 0.5, cy - 6.2, 3.6, 1.6, LUMI.crest, tilt);
  p.set(cx, cy - 7, LUMI.crestHi);
  // 팔
  if (pose === "blow") p.rect(Math.round(cx + 4), Math.round(cy + 1), 2, 2, LUMI.body);
  if (pose === "win0" || pose === "win1") {
    p.rect(Math.round(cx - 6), Math.round(cy - 4), 2, 3, LUMI.body);
    p.rect(Math.round(cx + 5), Math.round(cy - 5), 2, 3, LUMI.body);
  }
  // 얼굴
  const ex = cx + 1.5;
  const ey = cy - 1;
  if (pose === "hurt") {
    p.set(ex, ey, LUMI.eye);
    p.set(ex + 1, ey + 1, LUMI.eye);
    p.set(ex + 3, ey, LUMI.eye);
    p.set(ex + 2, ey + 1, LUMI.eye);
  } else if (pose === "win0" || pose === "win1") {
    p.rect(Math.round(ex), Math.round(ey), 2, 1, LUMI.eye);
    p.rect(Math.round(ex + 3), Math.round(ey), 2, 1, LUMI.eye);
  } else {
    p.rect(Math.round(ex), Math.round(ey - 1), 1, 2, LUMI.eye);
    p.rect(Math.round(ex + 3), Math.round(ey - 1), 1, 2, LUMI.eye);
  }
  p.set(ex - 0.5, ey + 2, LUMI.cheek);
  p.set(ex + 4, ey + 2, LUMI.cheek);
  if (pose === "blow") {
    // 볼을 부풀려 "후": 동그란 입
    p.rect(Math.round(ex + 4), Math.round(ey + 2), 2, 2, LUMI.cheek);
    p.set(ex + 5, ey + 3, LUMI.eye);
  } else p.set(ex + 1.5, ey + 2, LUMI.eye);
  p.outline(OUT);
  return p;
}

// ── 적 (기계 요정) ──

function wing(p: Pix, x: number, y: number, up: boolean, color: string) {
  if (up) p.tri(x, y, x - 4, y - 5, x - 1, y + 1, color);
  else p.tri(x, y, x - 5, y + 2, x - 1, y + 2, color);
}

export function buildCogling(frame: number, angry: boolean): Pix {
  const p = new Pix(18, 16);
  const body = angry ? "#ff6b6b" : "#3fc1aa";
  const tooth = angry ? "#c43d4d" : "#24887a";
  // 날개 (얇은 요정 날개)
  wing(p, 5, 6, frame % 2 === 0, "#c9f6ff");
  // 다리
  const step = frame % 2;
  p.rect(6 + step, 13, 2, 2, "#4a4e6e");
  p.rect(11 - step, 13, 2, 2, "#4a4e6e");
  // 톱니 몸통
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + frame * 0.2;
    p.rect(Math.round(9.5 + Math.cos(a) * 6 - 1), Math.round(8 + Math.sin(a) * 6 - 1), 2, 2, tooth);
  }
  p.ellipse(9.5, 8, 5.4, 5.4, body);
  // 외눈 렌즈
  p.ellipse(10.5, 7.5, 2.6, 2.6, "#ffffff");
  p.rect(11, 7, 2, 2, OUT);
  p.set(10, 6, "#ffffff");
  if (angry) p.line(8, 4, 12, 5, OUT);
  // 나사 입
  p.rect(9, 11, 3, 1, OUT);
  p.outline("#1d2a3a");
  return p;
}

export function buildSpringlet(pose: "idle" | "squash" | "air", angry: boolean): Pix {
  const p = new Pix(18, 18);
  const top = pose === "squash" ? 4 : pose === "air" ? 0 : 2;
  const can = angry ? "#ff5d5d" : "#ff9f43";
  const canHi = angry ? "#ffb0a0" : "#ffd29a";
  // 스프링 다리 (하나)
  const springTop = top + 10;
  const coils = pose === "squash" ? 2 : pose === "air" ? 4 : 3;
  const springH = 16 - springTop;
  for (let i = 0; i < coils; i++) {
    const y = springTop + (springH * i) / coils;
    p.line(7, y, 11, y + springH / coils / 2, "#cfd6e4");
    p.line(11, y + springH / coils / 2, 7, y + springH / coils, "#8e98ad");
  }
  p.rect(6, 16, 6, 1, "#4a4e6e");
  // 깡통 머리 (둥근 뚜껑)
  p.ellipse(9, top + 6, 5.5, 4.5, can);
  p.rect(4, top + 6, 11, 4, can);
  p.rect(5, top + 3, 8, 1, canHi);
  // 안테나와 전구
  p.line(9, top + 1, 9, top - 1, "#8e98ad");
  p.set(9, top - 1, angry ? "#ff2a2a" : "#7dffb2");
  // 눈 (둥근 단추)
  p.rect(10, top + 5, 2, 2, "#ffffff");
  p.rect(13, top + 5, 1, 2, "#ffffff");
  p.set(11, top + 6, OUT);
  p.set(13, top + 6, OUT);
  // 리벳
  p.set(6, top + 8, "#c26a1c");
  p.set(12, top + 8, "#c26a1c");
  p.outline("#3a1e10");
  return p;
}

export function buildWhirlwing(frame: number, angry: boolean): Pix {
  const p = new Pix(22, 14);
  const body = angry ? "#ff7ab0" : "#b57bff";
  // 프로펠러 (두 프레임 번갈아)
  p.rect(10, 1, 2, 2, "#8e98ad");
  if (frame % 2 === 0) p.rect(3, 0, 16, 1, "#e6ebf5");
  else {
    p.rect(6, 0, 5, 1, "#e6ebf5");
    p.rect(12, 1, 5, 1, "#e6ebf5");
  }
  // 몸통
  p.ellipse(11, 8, 5.5, 4.6, body);
  p.ellipse(10, 10.5, 3.2, 1.4, angry ? "#d84f8a" : "#8a52d6");
  // 고글 눈
  p.rect(11, 6, 3, 3, "#7ff0ff");
  p.rect(15, 6, 2, 3, "#7ff0ff");
  p.set(13, 7, OUT);
  p.set(16, 7, OUT);
  p.rect(10, 7, 1, 1, "#4a4e6e");
  // 작은 팔
  p.set(5, 9, body);
  p.set(17, 9, body);
  p.outline("#2a1446");
  return p;
}

export function buildZipwind(frame: number, angry: boolean): Pix {
  const p = new Pix(18, 14);
  const body = angry ? "#ff4040" : "#ff5d8f";
  const hi = angry ? "#ff9a9a" : "#ffb3cb";
  // 태엽 열쇠 (뒤)
  const turn = frame % 2;
  p.rect(1, 4, 2, 1, "#ffd23f");
  p.rect(0, 3 - turn, 1, 3 + turn * 0, "#ffd23f");
  // 차체 (앞이 낮은 쐐기)
  p.tri(3, 3, 3, 11, 16, 11, body);
  p.rect(3, 6, 13, 5, body);
  p.rect(4, 6, 9, 1, hi);
  // 눈
  p.rect(11, 7, 2, 2, "#ffffff");
  p.set(12, 8, OUT);
  // 바퀴 (살이 돌아간다)
  for (const wx of [5, 13]) {
    p.ellipse(wx, 12, 2, 2, "#3a3a52");
    p.set(wx + (turn ? 1 : 0), 12 + (turn ? 0 : -1), "#cfd6e4");
  }
  p.outline("#3a0f22");
  return p;
}

/** 보스 몸 (34×32). 종 모양 몸통, 시계 창 얼굴, 톱니 왕관, 꽃잎 날개 */
export function buildQueen(frame: number, glow: boolean): Pix {
  const p = new Pix(34, 32);
  const gold = "#e8b84a";
  const goldHi = "#ffe08a";
  const goldLo = "#a87422";
  // 날개 (뒤쪽, 펄럭임)
  const up = frame % 2 === 0;
  p.tri(9, 12, 0, up ? 3 : 9, 3, up ? 16 : 19, "#c9f6ff");
  p.tri(25, 12, 34, up ? 3 : 9, 31, up ? 16 : 19, "#c9f6ff");
  p.tri(9, 14, 2, up ? 9 : 14, 6, 19, "#9fe2ff");
  p.tri(25, 14, 32, up ? 9 : 14, 28, 19, "#9fe2ff");
  // 종 몸통
  p.ellipse(17, 14, 9, 8, gold);
  p.rect(8, 14, 18, 10, gold);
  p.rect(5, 23, 24, 4, gold);
  p.rect(5, 26, 24, 1, goldLo);
  p.rect(10, 9, 5, 2, goldHi);
  // 치맛단 무늬
  for (let x = 6; x < 28; x += 4) p.rect(x, 24, 2, 2, goldHi);
  // 시계 창 얼굴
  p.ellipse(17, 15, 6, 5.5, "#fdf6e3");
  const eye = glow ? "#ff3a7a" : "#3a2a5a";
  p.rect(14, 13, 2, 3, eye);
  p.rect(19, 13, 2, 3, eye);
  p.rect(16, 18, 3, 1, glow ? "#ff3a7a" : "#c06080");
  // 톱니 왕관
  p.rect(11, 3, 12, 3, "#c4ceda");
  for (let x = 11; x < 23; x += 3) p.rect(x, 1, 2, 2, "#c4ceda");
  p.set(17, 4, glow ? "#ff3a7a" : "#7dffb2");
  // 종 추 (아래)
  p.ellipse(17, 29, 2.5, 2.5, goldLo);
  p.outline("#2a1a10");
  return p;
}

// ── 방울 ──

/** 방울 (지름 size). tint: 보통 하늘색, 경고 중 분홍색 */
export function buildBubble(size: number, tint: "normal" | "warn" | "giant"): Pix {
  const p = new Pix(size, size);
  const r = size / 2 - 0.5;
  const c = size / 2;
  const ring = tint === "warn" ? "#ff8fc8" : tint === "giant" ? "#ffe27a" : "#8feaff";
  const fill = tint === "warn" ? "rgba(255,150,210,0.28)" : tint === "giant" ? "rgba(255,230,140,0.22)" : "rgba(150,230,255,0.22)";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d > r) continue;
      p.set(x, y, d > r - 1.3 ? ring : fill);
    }
  }
  // 반짝이는 하이라이트 (왼쪽 위)
  const h = Math.max(2, Math.round(size / 6));
  p.rect(Math.round(c - r * 0.55), Math.round(c - r * 0.6), h, 1, "#ffffff");
  p.rect(Math.round(c - r * 0.65), Math.round(c - r * 0.45), 1, h, "#ffffff");
  p.set(Math.round(c + r * 0.45), Math.round(c + r * 0.5), "rgba(255,255,255,0.7)");
  return p;
}

// ── 아이템 (14×14) ──

export function buildItem(kind: string): Pix {
  const p = new Pix(14, 14);
  switch (kind) {
    case "rapid":
      // 방울 두 개 + 속도선
      p.ellipse(9, 7, 4, 4, "#4fc3ff");
      p.ellipse(4.5, 9, 2.6, 2.6, "#8feaff");
      p.rect(8, 5, 2, 1, "#ffffff");
      p.rect(0, 3, 3, 1, "#ffffff");
      p.rect(1, 5, 2, 1, "#ffffff");
      break;
    case "giant":
      p.ellipse(7, 7, 6, 6, "#ffd23f");
      p.ellipse(7, 7, 4.6, 4.6, "#fff3c4");
      p.rect(6, 4, 2, 6, "#e0a83c");
      p.rect(4, 6, 6, 2, "#e0a83c");
      p.set(4, 3, "#ffffff");
      break;
    case "shield": {
      // 둥근 고리 안의 금별
      for (let y = 0; y < 14; y++)
        for (let x = 0; x < 14; x++) {
          const d = Math.hypot(x + 0.5 - 7, y + 0.5 - 7);
          if (d <= 6.4 && d > 5.2) p.set(x, y, "#8feaff");
        }
      star(p, 7, 7.3, 4.6, 2, "#ffd23f");
      p.set(6, 5, "#ffffff");
      break;
    }
    case "lucky":
      star(p, 7, 7.5, 6.6, 2.8, "#ff7ac8");
      star(p, 7, 7.5, 3.4, 1.5, "#ffd1ec");
      p.set(6, 5, "#ffffff");
      break;
    case "freeze":
      // 모래시계 (얼음색)
      p.rect(3, 1, 8, 2, "#7fb7ff");
      p.rect(3, 11, 8, 2, "#7fb7ff");
      p.tri(4, 3, 10, 3, 7, 7, "#d6f2ff");
      p.tri(7, 7, 4, 11, 10, 11, "#d6f2ff");
      p.rect(6, 9, 3, 2, "#4fc3ff");
      break;
    case "candy":
      // 별사탕: 뿔이 돋은 작은 사탕
      p.ellipse(7, 7, 4, 4, "#ffb3d9");
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        p.rect(Math.round(7 + Math.cos(a) * 5.2 - 0.5), Math.round(7 + Math.sin(a) * 5.2 - 0.5), 1, 1, "#ffb3d9");
      }
      p.rect(5, 5, 2, 1, "#ffffff");
      p.set(9, 8, "#ff7ac8");
      break;
    case "gem":
      p.tri(2, 5, 12, 5, 7, 13, "#36d8ff");
      p.rect(4, 2, 6, 3, "#8ff0ff");
      p.tri(2, 5, 4, 2, 4, 5, "#8ff0ff");
      p.tri(12, 5, 10, 2, 10, 5, "#8ff0ff");
      p.set(5, 3, "#ffffff");
      break;
    case "life":
      // HUD 목숨: Lumi 얼굴
      star(p, 7, 3.5, 3.2, 1.4, LUMI.crest);
      p.ellipse(7, 8.5, 5, 4.4, LUMI.body);
      p.rect(6, 7, 1, 2, LUMI.eye);
      p.rect(9, 7, 1, 2, LUMI.eye);
      p.set(5, 10, LUMI.cheek);
      p.set(10, 10, LUMI.cheek);
      break;
  }
  p.outline(OUT);
  return p;
}

/** 보스가 쏘는 음표 (10×10) */
export function buildNote(): Pix {
  const p = new Pix(10, 10);
  p.ellipse(3.5, 7, 2.6, 2, "#ff5d8f");
  p.rect(5, 1, 1, 6, "#ff5d8f");
  p.rect(6, 1, 3, 1, "#ff5d8f");
  p.rect(8, 2, 1, 2, "#ff5d8f");
  p.set(2, 6, "#ffd1e0");
  p.outline("#3a0f22");
  return p;
}
