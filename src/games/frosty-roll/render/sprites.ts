import { Pix } from "./pixels";

/*
 * 픽셀 아트 정의 (모두 이 게임을 위한 오리지널 디자인). 오른쪽을 보는 그림을 만들고, 왼쪽은 좌우 반전한다.
 *   플레이어: 파란 겨울 목도리를 두른 북극여우 "Frosty"
 *   적: 태엽 장난감 괴물(Clockwork Imp), 스프링 점퍼(Spring Hopper), 얼음 박쥐(Frost Bat), 수정 러너(Crystal Runner)
 *   보스: 시계 기사(Clockwork Guardian, 렌더러가 시곗바늘을 덧그린다)
 */

const OUT = "#1b2140";

// ── 플레이어 (20×18, 발 = 아래 가운데) ──

const FOX = {
  fur: "#f6f9ff",
  shade: "#c3d0ea",
  ear: "#9fb0d0",
  scarf: "#2f6fe0",
  scarfHi: "#7cb8ff",
  eye: "#1b2140",
  nose: "#2b2233",
  cheek: "#f6a6bd",
};

export type FoxPose = "idle0" | "idle1" | "walk0" | "walk1" | "walk2" | "walk3" | "jump" | "fall" | "throw" | "kick" | "hurt" | "win0" | "win1";

export function buildFox(pose: FoxPose): Pix {
  const p = new Pix(20, 18);
  const bob = pose === "idle1" || pose === "walk1" || pose === "walk3" ? 1 : pose === "win0" ? -1 : 0;
  const air = pose === "jump" || pose === "fall" || pose === "win0";
  const tailY = pose === "jump" ? 8.2 : pose === "fall" ? 7.6 : pose === "walk1" || pose === "walk3" ? 10 : 10.6;
  // 꼬리 (몸 뒤)
  p.ellipse(4.4, tailY + bob * 0.5, 3.3, 2.5, FOX.fur);
  p.ellipse(3.2, tailY + bob * 0.5 + 0.8, 1.8, 1, FOX.shade);
  // 다리
  const legs: Record<FoxPose, [number, number, number, number]> = {
    idle0: [6, 11, 3, 3],
    idle1: [6, 11, 3, 3],
    walk0: [6, 11, 3, 3],
    walk1: [7.5, 9.5, 2, 3],
    walk2: [6, 11, 3, 3],
    walk3: [5, 12.5, 3, 2],
    jump: [6.5, 12, 2, 2],
    fall: [5, 12.5, 3, 3],
    throw: [6, 11.5, 3, 3],
    kick: [5.5, 13, 3, 2],
    hurt: [6, 11, 3, 2],
    win0: [6, 11.5, 2, 2],
    win1: [6, 11, 3, 3],
  };
  const [backX, frontX, backH, frontH] = legs[pose];
  const legTop = air ? 13 : 14;
  p.rect(Math.round(backX), legTop, 2, backH, FOX.shade);
  if (pose === "kick") p.rect(13, 13, 4, 2, FOX.fur);
  else p.rect(Math.round(frontX), legTop, 2, frontH, FOX.fur);
  // 몸통
  p.ellipse(9.5, 12 + bob, 4.1, 3, FOX.fur);
  p.rect(7, 14 + bob, 5, 1, FOX.shade);
  // 목도리 끝자락 (뒤로 날린다)
  const flap = pose === "walk1" || pose === "walk3" || air || pose === "win1" ? -1 : 0;
  p.rect(6, 9 + bob + flap, 3, 2, FOX.scarf);
  p.set(5, 10 + bob + flap * 2, FOX.scarf);
  // 머리
  const headX = pose === "throw" ? 13 : pose === "kick" ? 12 : 12.5;
  const headY = 6.5 + bob + (pose === "hurt" ? 1 : 0);
  p.ellipse(headX, headY, 3.8, 3.4, FOX.fur);
  p.ellipse(headX + 3.5, headY + 1.3, 1.9, 1.3, FOX.fur);
  // 귀
  const earDrop = pose === "hurt" || pose === "fall" ? 1.2 : 0;
  p.tri(headX - 2.9, headY - 2, headX - 1.7, headY - 5.9 + earDrop, headX + 0.1, headY - 3.1, FOX.fur);
  p.tri(headX + 0.5, headY - 3.3, headX + 2.5, headY - 5.9 + earDrop, headX + 3.3, headY - 2.1, FOX.fur);
  p.set(headX - 1.5, headY - 4 + earDrop, FOX.ear);
  p.set(headX + 1.9, headY - 4 + earDrop, FOX.ear);
  // 목도리 (목에 두른 부분)
  p.rect(9, 9 + bob, 6, 2, FOX.scarf);
  p.rect(10, 9 + bob, 3, 1, FOX.scarfHi);
  // 앞발: 던지기·만세
  if (pose === "throw") p.rect(15, 10 + bob, 3, 2, FOX.fur);
  if (pose === "win0" || pose === "win1") {
    p.rect(8, 4 + bob, 2, 3, FOX.fur);
    p.rect(15, 3 + bob, 2, 3, FOX.fur);
  }
  // 얼굴
  if (pose === "hurt") {
    p.set(headX + 1, headY - 1, FOX.eye);
    p.set(headX + 2, headY, FOX.eye);
    p.set(headX + 1, headY + 1, FOX.eye);
  } else if (pose === "win0" || pose === "win1") {
    p.set(headX + 1, headY - 1, FOX.eye);
    p.set(headX + 2, headY - 1, FOX.eye);
  } else {
    p.set(headX + 1.5, headY - 1, FOX.eye);
    p.set(headX + 1.5, headY, FOX.eye);
  }
  p.set(headX + 5, headY + 0.6, FOX.nose);
  p.set(headX + 0.5, headY + 1.6, FOX.cheek);
  p.outline(OUT);
  return p;
}

// ── 적 ──

export function buildImp(frame: number, angry: boolean): Pix {
  const p = new Pix(18, 16);
  const body = angry ? "#ff4f6a" : "#e2553c";
  // 태엽 열쇠 (등 뒤)
  p.rect(1, 6, 1, 5, "#c9a13a");
  p.rect(2, 8, 2, 1, "#c9a13a");
  p.set(0, 6, "#f2d06b");
  p.set(0, 10, "#f2d06b");
  // 발
  const step = frame % 2;
  p.rect(5 + step, 13, 3, 2, "#7a2a22");
  p.rect(10 - step, 13, 3, 2, "#7a2a22");
  // 몸
  p.ellipse(9.5, 8.5, 6, 5.4, body);
  p.ellipse(10, 10.4, 3.4, 2.4, "#f39a6a");
  // 뿔
  p.tri(5.5, 4, 6.5, 0.8, 8, 3.4, "#f2d06b");
  p.tri(11, 3.4, 12.6, 0.8, 13.6, 4, "#f2d06b");
  // 눈
  p.ellipse(8, 6.8, 1.6, 1.9, "#ffffff");
  p.ellipse(12, 6.8, 1.6, 1.9, "#ffffff");
  p.set(8.5, 7, OUT);
  p.set(12.5, 7, OUT);
  if (angry) {
    p.set(7, 4.8, OUT);
    p.set(13, 4.8, OUT);
  }
  // 입 (톱니 이빨)
  p.rect(9, 10, 4, 1, "#5a1a1a");
  p.set(9, 10, "#ffffff");
  p.set(11, 10, "#ffffff");
  p.outline("#2a1220");
  return p;
}

export function buildHopper(pose: "idle" | "squash" | "air", angry: boolean): Pix {
  const p = new Pix(18, 18);
  const top = pose === "squash" ? 4 : pose === "air" ? 0 : 2;
  const head = angry ? "#ff8f3a" : "#5cc86a";
  // 스프링
  const springTop = top + 9;
  const coils = pose === "squash" ? 2 : pose === "air" ? 4 : 3;
  const springH = 16 - springTop;
  for (let i = 0; i <= coils; i++) {
    const y = springTop + (springH * i) / coils;
    p.line(6, y, 11, y + springH / coils / 2, "#b7c2d0");
    p.line(11, y + springH / coils / 2, 6, y + springH / coils, "#8d99aa");
  }
  p.rect(5, 16, 8, 1, "#3a4656");
  // 머리 (네모난 상자)
  p.rect(3, top + 1, 12, 8, head);
  p.rect(4, top, 10, 1, head);
  p.rect(4, top + 1, 10, 1, angry ? "#ffc27a" : "#9ce6a6");
  // 눈·입
  p.rect(8, top + 3, 2, 2, "#ffffff");
  p.rect(12, top + 3, 2, 2, "#ffffff");
  p.set(9, top + 4, OUT);
  p.set(13, top + 4, OUT);
  p.rect(9, top + 6, 5, 1, "#1b3a22");
  p.outline("#16301c");
  return p;
}

export function buildBat(frame: number, angry: boolean): Pix {
  const p = new Pix(22, 14);
  const body = angry ? "#ff9ad6" : "#7fd0ff";
  const wing = angry ? "#e06ab0" : "#4aa6e8";
  if (frame % 2 === 0) {
    p.tri(8, 6, 1, 0.5, 3.5, 8.5, wing);
    p.tri(14, 6, 21, 0.5, 18.5, 8.5, wing);
  } else {
    p.tri(8, 6.5, 1, 12, 5, 7, wing);
    p.tri(14, 6.5, 21, 12, 17, 7, wing);
  }
  p.ellipse(11, 7, 4.2, 3.8, body);
  p.tri(8, 4, 8.5, 0.5, 10.2, 3.4, "#d8f4ff");
  p.tri(11.8, 3.4, 13.5, 0.5, 14, 4, "#d8f4ff");
  p.set(10, 6, "#ffffff");
  p.set(13, 6, "#ffffff");
  p.set(10.5, 6.5, OUT);
  p.set(13.5, 6.5, OUT);
  p.set(12, 9, "#ffffff");
  p.outline("#14304a");
  return p;
}

export function buildRunner(frame: number, angry: boolean): Pix {
  const p = new Pix(18, 16);
  const body = angry ? "#ff5fa8" : "#b86bff";
  const facet = angry ? "#ffc0e0" : "#e6c4ff";
  const step = frame % 4;
  const legA = [0, 2, 0, -2][step];
  p.rect(6 + legA, 12, 2, 3, "#5a2a8a");
  p.rect(10 - legA, 12, 2, 3, "#5a2a8a");
  // 수정 몸통 (마름모)
  p.tri(9, 0.5, 16, 7, 9, 13, body);
  p.tri(9, 0.5, 2, 7, 9, 13, body);
  p.tri(9, 0.5, 2, 7, 9, 7, facet);
  p.set(12, 6, "#ffffff");
  p.set(14, 6, "#ffffff");
  p.set(12.5, 6.5, OUT);
  p.set(14.5, 6.5, OUT);
  // 속도선
  p.set(1, 9, facet);
  p.set(0, 11, facet);
  p.outline("#2a1440");
  return p;
}

/** 보스 몸 (32×38). 시곗바늘은 렌더러가 덧그린다 */
export function buildGuardian(frame: number, glow: boolean): Pix {
  const p = new Pix(32, 38);
  const brass = "#c8963c";
  const brassHi = "#f0c766";
  const steel = "#8a97a8";
  const step = frame % 2;
  // 다리
  p.rect(9 + step, 30, 5, 6, steel);
  p.rect(18 - step, 30, 5, 6, steel);
  p.rect(8 + step, 35, 7, 2, "#4a5566");
  p.rect(17 - step, 35, 7, 2, "#4a5566");
  // 팔 (예고 중에는 톱니를 든 팔을 든다)
  p.rect(2, glow ? 9 : 14, 4, 10, brass);
  p.rect(26, 14, 4, 10, brass);
  p.ellipse(4, glow ? 8 : 24, 2.5, 2.5, steel);
  p.ellipse(28, 24, 2.5, 2.5, steel);
  // 몸통 + 시계판
  p.rect(5, 12, 22, 19, brass);
  p.rect(6, 12, 20, 2, brassHi);
  p.ellipse(16, 21.5, 7, 7, "#fdf6e3");
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.set(16 + Math.cos(a) * 5.6 - 0.5, 21.5 + Math.sin(a) * 5.6 - 0.5, i % 3 === 0 ? "#3a2a1a" : "#b8a88a");
  }
  // 머리 (투구)
  p.rect(9, 2, 14, 10, steel);
  p.rect(10, 1, 12, 1, steel);
  p.rect(10, 2, 12, 1, "#c4ceda");
  p.rect(11, 5, 10, 3, "#1b2140");
  const eye = glow ? "#ff3a3a" : "#ffe14a";
  p.rect(13, 6, 2, 1, eye);
  p.rect(18, 6, 2, 1, eye);
  // 머리 위 태엽
  p.rect(15, 0, 2, 2, brassHi);
  p.outline("#2a1a10");
  return p;
}

// ── 눈 ──

/** 눈덩이 (20×20). crack 0~2, eyes: 안의 적 눈이 살짝 보인다 */
export function buildBall(crack: number, eyes: boolean): Pix {
  const p = new Pix(20, 20);
  p.ellipse(10, 10, 8.6, 8.6, "#ffffff");
  // 아래·오른쪽 그늘, 위 하이라이트
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      if (p.get(x, y) !== "#ffffff") continue;
      const d = (x - 6) * 0.6 + (y - 6) * 0.8;
      if (d > 9) p.set(x, y, "#bcd8f2");
      else if (d > 6) p.set(x, y, "#dcebf9");
    }
  }
  p.rect(6, 5, 2, 1, "#ffffff");
  p.set(5, 6, "#ffffff");
  if (eyes) {
    p.rect(10, 8, 1, 2, OUT);
    p.rect(13, 8, 1, 2, OUT);
  }
  const crackC = "#5d86b5";
  if (crack >= 1) {
    p.line(9, 2, 11, 6, crackC);
    p.line(11, 6, 9, 9, crackC);
  }
  if (crack >= 2) {
    p.line(15, 12, 12, 14, crackC);
    p.line(12, 14, 13, 17, crackC);
    p.line(4, 11, 7, 13, crackC);
  }
  p.outline("#3a5f8f");
  return p;
}

/** 부분 눈 덮임 (적 그림 위에 겹친다). level 1 = 아래 1/3, 2 = 2/3 */
export function buildSnowCover(w: number, h: number, level: number, seed: number): Pix {
  const p = new Pix(w, h);
  const top = level === 1 ? h * 0.62 : h * 0.3;
  for (let x = 0; x < w; x++) {
    const bump = Math.sin(x * 1.7 + seed) * 1.2 + Math.sin(x * 0.6 + seed * 2) * 0.8;
    for (let y = Math.max(0, Math.floor(top + bump)); y < h; y++) p.set(x, y, y < top + bump + 1.5 ? "#ffffff" : "#e4f0fb");
  }
  p.set(Math.floor(w * 0.3), Math.floor(top) + 2, "#bcd8f2");
  p.set(Math.floor(w * 0.7), Math.floor(top) + 3, "#bcd8f2");
  return p;
}

export function buildShot(giant: boolean): Pix {
  const s = giant ? 11 : 7;
  const p = new Pix(s, s);
  const c = Math.floor(s / 2);
  p.line(c, 0, c, s - 1, "#ffffff");
  p.line(0, c, s - 1, c, "#ffffff");
  p.line(1, 1, s - 2, s - 2, "#d6ecff");
  p.line(1, s - 2, s - 2, 1, "#d6ecff");
  p.set(c, c, "#9fd2ff");
  return p;
}

// ── 아이템 (14×14) ──

export function buildItem(kind: string): Pix {
  const p = new Pix(14, 14);
  switch (kind) {
    case "boots":
      p.rect(4, 2, 5, 7, "#e04a4a");
      p.rect(4, 8, 8, 4, "#e04a4a");
      p.rect(4, 2, 5, 2, "#ffffff");
      p.rect(9, 11, 3, 1, "#8a2020");
      p.tri(1, 5, 4, 4, 4, 8, "#ffe27a");
      break;
    case "rapid":
      p.ellipse(7, 7, 6, 6, "#3a7bff");
      p.tri(3, 4, 7, 7, 3, 10, "#ffffff");
      p.tri(7, 4, 11, 7, 7, 10, "#ffffff");
      break;
    case "giant":
      p.ellipse(7, 7, 6, 6, "#1f4f8f");
      p.line(7, 2, 7, 12, "#ffffff");
      p.line(2, 7, 12, 7, "#ffffff");
      p.line(3, 3, 11, 11, "#bfe4ff");
      p.line(3, 11, 11, 3, "#bfe4ff");
      break;
    case "shield":
      p.tri(7, 0.5, 9.5, 5.5, 4.5, 5.5, "#ffd84a");
      p.tri(0.5, 5, 13.5, 5, 7, 9.5, "#ffd84a");
      p.tri(7, 8, 2, 13.5, 4.5, 6, "#ffd84a");
      p.tri(7, 8, 12, 13.5, 9.5, 6, "#ffd84a");
      p.set(6, 5, "#ffffff");
      break;
    case "life": {
      p.ellipse(7, 8, 5, 4.2, "#f6f9ff");
      p.tri(2.5, 6, 3.5, 1, 6, 4.5, "#f6f9ff");
      p.tri(8, 4.5, 10.5, 1, 11.5, 6, "#f6f9ff");
      p.set(5, 8, OUT);
      p.set(9, 8, OUT);
      p.set(7, 10, "#2b2233");
      p.rect(3, 12, 8, 1, "#2f6fe0");
      break;
    }
    case "candy":
      p.tri(7, 0.5, 9, 5, 5, 5, "#ff7ac8");
      p.tri(0.5, 5, 13.5, 5, 7, 9, "#ff7ac8");
      p.tri(7, 7.5, 2.5, 13, 4.8, 6, "#ff7ac8");
      p.tri(7, 7.5, 11.5, 13, 9.2, 6, "#ff7ac8");
      p.set(6, 4, "#ffffff");
      p.set(5, 5, "#ffd1ec");
      break;
    case "gem":
      p.tri(2, 5, 12, 5, 7, 13, "#36d8ff");
      p.rect(4, 2, 6, 3, "#8ff0ff");
      p.tri(2, 5, 4, 2, 4, 5, "#8ff0ff");
      p.tri(12, 5, 10, 2, 10, 5, "#8ff0ff");
      p.set(5, 3, "#ffffff");
      break;
  }
  p.outline(OUT);
  return p;
}
