import { Pix } from "./pixels";

/*
 * 픽셀 아트 정의 (모두 이 게임을 위한 오리지널 디자인, 16×16). 외부 이미지·기존 게임 스프라이트 없음.
 *   로봇: 둥근 머리에 하늘색 바이저, 주황 안테나 등, 노란 몸통과 무한궤도를 단 소형 정비 로봇
 *   상자: 나무 상자(판자 + X자 보강)와 금속 상자(리벳 + 주황 띠)
 *   바닥·벽·목표 표시등·컨베이어·얼음·순간이동 장치
 */

export const PALETTE = {
  void: "#0b0f1c",
  floor: "#2b3245",
  floorLo: "#242a3b",
  floorHi: "#353d53",
  seam: "#1d2232",
  wall: "#4a5368",
  wallHi: "#6b768e",
  wallLo: "#323a4d",
  wallTop: "#7c879f",
  hazard: "#e8a33a",
  lampOff: "#c97a1e",
  lampGlow: "#ffbe55",
  lampOn: "#4ce07a",
  lampOnGlow: "#a8ffbf",
  ice: "#9fd3f0",
  iceHi: "#e3f6ff",
  iceLo: "#77b4d8",
  belt: "#30333d",
  beltHi: "#4b4f5c",
  beltArrow: "#f0b44a",
  roller: "#8a92a3",
};

/** 순간이동 장치 짝별 색 (색 + 기호 점 개수로 구분해 색맹에도 알아보기 쉽게) */
export const PAD_COLORS = ["#4fd6ff", "#ff6fd2", "#b6f05a", "#ffd34f"];

const OUT = "#10131d";

// ── 바닥·벽 ──

export function buildFloor(variant: number): Pix {
  const p = new Pix(16, 16);
  p.rect(0, 0, 16, 16, PALETTE.floor);
  p.rect(0, 0, 16, 1, PALETTE.floorHi);
  p.rect(0, 15, 16, 1, PALETTE.seam);
  p.rect(15, 0, 1, 16, PALETTE.seam);
  if (variant % 3 === 0) p.rect(3, 4, 2, 1, PALETTE.floorLo);
  if (variant % 4 === 1) p.rect(10, 9, 3, 1, PALETTE.floorLo);
  if (variant % 5 === 2) {
    p.set(2, 13, PALETTE.floorHi);
    p.set(13, 2, PALETTE.floorHi);
  }
  return p;
}

/** 벽: 아래가 바닥이면 앞면(밝은 윗면 + 어두운 앞면)을 보여 주어 입체감 */
export function buildWall(front: boolean, variant: number): Pix {
  const p = new Pix(16, 16);
  p.rect(0, 0, 16, 16, PALETTE.wall);
  p.rect(0, 0, 16, 2, PALETTE.wallTop);
  p.rect(0, 2, 1, 14, PALETTE.wallHi);
  p.rect(15, 2, 1, 14, PALETTE.wallLo);
  // 패널 이음매와 리벳
  p.rect(0, 8, 16, 1, PALETTE.wallLo);
  for (const [x, y] of [
    [3, 4],
    [12, 4],
    [3, 12],
    [12, 12],
  ])
    p.set(x, y, PALETTE.wallHi);
  if (front) {
    p.rect(0, 13, 16, 3, PALETTE.wallLo);
    if (variant % 4 === 0) for (let x = 0; x < 16; x += 4) p.rect(x, 14, 2, 1, PALETTE.hazard);
  }
  return p;
}

// ── 목표 표시등 ──

export function buildLamp(on: boolean, bright: boolean): Pix {
  const p = new Pix(16, 16);
  const ring = on ? PALETTE.lampOn : PALETTE.lampOff;
  const glow = on ? PALETTE.lampOnGlow : PALETTE.lampGlow;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (d <= 5.6 && d > 4.2) p.set(x, y, ring);
      else if (d <= 2.6) p.set(x, y, bright ? glow : ring);
    }
  // 모서리 표시 (바닥 위에 그린 배송 위치 표시)
  for (const [x, y] of [
    [1, 1],
    [14, 1],
    [1, 14],
    [14, 14],
  ]) {
    p.set(x, y, ring);
    p.set(x + (x < 8 ? 1 : -1), y, ring);
    p.set(x, y + (y < 8 ? 1 : -1), ring);
  }
  return p;
}

// ── 특수 타일 ──

export function buildIce(variant: number): Pix {
  const p = new Pix(16, 16);
  p.rect(0, 0, 16, 16, PALETTE.ice);
  p.rect(0, 15, 16, 1, PALETTE.iceLo);
  p.rect(15, 0, 1, 16, PALETTE.iceLo);
  // 반짝이는 대각선
  const o = variant % 3;
  p.line(2 + o, 6, 6 + o, 2, PALETTE.iceHi);
  p.line(8, 13 - o, 12, 9 - o, PALETTE.iceHi);
  if (variant % 2) p.line(10, 4, 11, 3, PALETTE.iceHi);
  return p;
}

/** 컨베이어 (오른쪽 방향 기준). phase 0~3: 화살표가 흘러가는 애니메이션 */
export function buildBelt(phase: number): Pix {
  const p = new Pix(16, 16);
  p.rect(0, 0, 16, 16, PALETTE.belt);
  p.rect(0, 0, 16, 2, PALETTE.roller);
  p.rect(0, 14, 16, 2, PALETTE.roller);
  for (let x = 0; x < 16; x += 4) {
    p.set(x + phase, 0, PALETTE.beltHi);
    p.set(x + phase, 15, PALETTE.beltHi);
  }
  // 화살표 두 개가 흐른다
  for (const base of [phase * 2, phase * 2 + 8]) {
    const x = base % 16;
    for (let k = 0; k < 4; k++) {
      p.set((x + k) % 16, 4 + k, PALETTE.beltArrow);
      p.set((x + k) % 16, 11 - k, PALETTE.beltArrow);
    }
  }
  return p;
}

export function buildPad(pair: number, spin: number): Pix {
  const p = new Pix(16, 16);
  const c = PAD_COLORS[(pair - 1) % PAD_COLORS.length];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (d <= 7.4 && d > 5.6) p.set(x, y, "#1a2133");
      if (d <= 6.8 && d > 5.6) {
        const a = Math.atan2(y + 0.5 - 8, x + 0.5 - 8) + spin;
        if (Math.floor(((a + Math.PI * 4) / (Math.PI * 2)) * 6) % 2 === 0) p.set(x, y, c);
      } else if (d <= 4.6) p.set(x, y, "#121827");
    }
  // 짝 번호를 점 개수로 (1~4)
  const dots = [[[8, 8]], [[6, 8], [10, 8]], [[8, 6], [6, 10], [10, 10]], [[6, 6], [10, 6], [6, 10], [10, 10]]][(pair - 1) % 4];
  for (const [x, y] of dots) p.rect(x - 1, y - 1, 2, 2, c);
  return p;
}

// ── 상자 ──

export function buildCrate(metal: boolean, lit: boolean): Pix {
  const p = new Pix(16, 16);
  if (metal) {
    p.rect(1, 1, 14, 14, "#8d97aa");
    p.rect(1, 1, 14, 2, "#b9c2d3");
    p.rect(1, 13, 14, 2, "#5d6679");
    p.rect(1, 7, 14, 2, lit ? PALETTE.lampOn : "#e0892a");
    for (const [x, y] of [
      [3, 4],
      [12, 4],
      [3, 11],
      [12, 11],
    ])
      p.set(x, y, "#e7ecf5");
  } else {
    p.rect(1, 1, 14, 14, "#b9783e");
    p.rect(1, 1, 14, 1, "#e0a364");
    p.rect(1, 5, 14, 1, "#8a5428");
    p.rect(1, 10, 14, 1, "#8a5428");
    p.rect(1, 14, 14, 1, "#6e4220");
    p.line(2, 2, 13, 13, "#d89656");
    p.line(13, 2, 2, 13, "#d89656");
    p.rect(1, 1, 1, 14, "#8a5428");
    p.rect(14, 1, 1, 14, "#8a5428");
  }
  if (lit) {
    // 목표 위: 녹색 표시등이 켜진다
    p.rect(6, 6, 4, 4, PALETTE.lampOn);
    p.rect(7, 7, 2, 2, PALETTE.lampOnGlow);
  }
  p.outline(OUT);
  return p;
}

// ── 로봇 ──

export type RobotFacing = "down" | "up" | "side";
export type RobotPose = "idle" | "walk" | "push";

/** 정비 로봇. side는 오른쪽을 보는 그림(왼쪽은 좌우 반전) */
export function buildRobot(facing: RobotFacing, pose: RobotPose, frame: number): Pix {
  const p = new Pix(16, 16);
  const body = "#f2c94c";
  const bodyLo = "#c99a2b";
  const head = "#dfe6f2";
  const headLo = "#a9b4c8";
  const visor = "#45d6ff";
  const tread = "#3a3f4d";
  const lean = pose === "push" ? 1 : 0;
  const bob = pose === "walk" && frame % 2 ? 1 : 0;
  // 무한궤도
  const ty = 12;
  if (facing === "side") {
    p.rect(3, ty, 10, 3, tread);
    for (let x = 3 + (frame % 2); x < 13; x += 2) p.set(x, ty + 1, "#6b7180");
  } else {
    p.rect(2, ty, 4, 3, tread);
    p.rect(10, ty, 4, 3, tread);
    p.set(3, ty + 1 + (frame % 2), "#6b7180");
    p.set(12, ty + 1 + ((frame + 1) % 2), "#6b7180");
  }
  // 몸통
  const bx = facing === "side" ? 4 + lean : 4;
  p.rect(bx, 8 - bob, 8, 5, body);
  p.rect(bx, 11 - bob, 8, 2, bodyLo);
  if (facing === "down") p.rect(7, 9 - bob, 2, 2, "#e0892a");
  // 팔: 밀 때는 앞으로 뻗는다
  if (pose === "push") {
    if (facing === "side") p.rect(12 + lean, 9 - bob, 3, 2, headLo);
    else if (facing === "down") {
      p.rect(3, 12, 2, 2, headLo);
      p.rect(11, 12, 2, 2, headLo);
    } else {
      p.rect(3, 6, 2, 2, headLo);
      p.rect(11, 6, 2, 2, headLo);
    }
  } else {
    p.rect(facing === "side" ? bx + 2 : 2, 9 - bob, 2, 3, headLo);
    if (facing !== "side") p.rect(12, 9 - bob, 2, 3, headLo);
  }
  // 머리
  const hx = facing === "side" ? 4 + lean * 2 : 3;
  p.rect(hx, 2 - bob, 10, 6, head);
  p.rect(hx + 1, 1 - bob, 8, 1, head);
  p.rect(hx, 7 - bob, 10, 1, headLo);
  // 바이저 (눈)
  if (facing === "down") {
    p.rect(5, 3 - bob, 6, 3, "#1b2c3d");
    p.rect(6, 4 - bob, 1, 1, visor);
    p.rect(9, 4 - bob, 1, 1, visor);
  } else if (facing === "side") {
    p.rect(hx + 5, 3 - bob, 5, 3, "#1b2c3d");
    p.rect(hx + 8, 4 - bob, 1, 1, visor);
  } else {
    p.rect(5, 4 - bob, 6, 1, headLo);
  }
  // 안테나와 주황 등
  const ax = facing === "side" ? hx + 3 : 8;
  p.rect(ax, 0, 1, 1 - bob + 1, headLo);
  p.set(ax, 0, "#ff9a3a");
  p.outline(OUT);
  return p;
}
