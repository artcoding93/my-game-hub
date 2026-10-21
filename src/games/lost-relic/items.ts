import type { ItemId } from "./types";

/*
 * 아이템 정의와 아이콘 픽셀아트(자체 제작). 문자 하나가 픽셀 하나이며 '.'은 투명이다.
 * Phaser 장면(render/)과 React 인벤토리 UI가 같은 그림을 쓴다. 이 파일은 브라우저 API에 의존하지 않는다.
 */

export interface ItemInfo {
  name: string;
  description: string;
  /** 진행에 꼭 필요한 아이템. 맞는 장소가 아니면 절대 소모되지 않는다. */
  essential: boolean;
  icon: readonly string[];
  palette: Record<string, string>;
}

export const ITEMS: Record<ItemId, ItemInfo> = {
  coin: {
    name: "금화",
    description: "유적에 잠들어 있던 옛 금화. 1개당 100점.",
    essential: false,
    icon: [
      "...yyyy...",
      "..yYYYYy..",
      ".yYYooYYy.",
      ".yYoYYoYy.",
      ".yYoYYYYy.",
      ".yYoYYoYy.",
      ".yYYooYYy.",
      "..yYYYYy..",
      "...yyyy...",
      "..........",
    ],
    palette: { y: "#b45309", Y: "#fbbf24", o: "#fef3c7" },
  },
  bronzeKey: {
    name: "청동 열쇠",
    description: "녹이 슨 청동 열쇠. 중앙 홀의 청동 문을 열 수 있을 것 같다.",
    essential: true,
    icon: [
      "..oooo....",
      ".oO..Oo...",
      ".o....o...",
      ".oO..Oo...",
      "..oOOo....",
      "...oo.....",
      "...oo.....",
      "...ooOo...",
      "...oo.....",
      "...ooOo...",
    ],
    palette: { o: "#c2703d", O: "#f0a868" },
  },
  silverKey: {
    name: "은빛 열쇠",
    description: "차갑게 빛나는 은빛 열쇠. 수호자의 방 깊은 곳의 문에 맞는다.",
    essential: true,
    icon: [
      "..ssss....",
      ".sW..Ws...",
      ".s.bb.s...",
      ".sW..Ws...",
      "..sWWs....",
      "...ss.....",
      "...ss.....",
      "...ssWs...",
      "...ss.....",
      "...ssWs...",
    ],
    palette: { s: "#94a3b8", W: "#f1f5f9", b: "#38bdf8" },
  },
  potion: {
    name: "회복 물약",
    description: "붉게 빛나는 약초 물약. 사용하면 체력이 1 회복된다.",
    essential: false,
    icon: [
      "...wwww...",
      "....cc....",
      "....gg....",
      "...gRRg...",
      "..gRRrRg..",
      ".gRRRRrRg.",
      ".gRWRRRRg.",
      ".gRRRRRRg.",
      "..gRRRRg..",
      "...gggg...",
    ],
    palette: { w: "#a16207", c: "#e7e5e4", g: "#a8a29e", R: "#e11d48", r: "#fb7185", W: "#ffe4e6" },
  },
  blastPowder: {
    name: "고대 폭약",
    description: "봉인된 항아리에 담긴 고대 폭약. 금이 간 벽을 무너뜨릴 수 있다.",
    essential: true,
    icon: [
      "......f...",
      ".....f.F..",
      "....ff....",
      "...kkkk...",
      "..kKKKKk..",
      ".kKrrrrKk.",
      ".kKrYYrKk.",
      ".kKrrrrKk.",
      "..kKKKKk..",
      "...kkkk...",
    ],
    palette: { f: "#78350f", F: "#fde047", k: "#44403c", K: "#78716c", r: "#b91c1c", Y: "#fbbf24" },
  },
  relic: {
    name: "고대 유물",
    description: "태양의 눈이라 불리는 고대 유물. 입구로 가져가 탈출하자!",
    essential: true,
    icon: [
      "....GG....",
      "...GYYG...",
      "..GYccYG..",
      ".GYcWWcYG.",
      "GYcWBBWcYG",
      "GYcWBBWcYG",
      ".GYcWWcYG.",
      "..GYccYG..",
      "...GYYG...",
      "....GG....",
    ],
    palette: { G: "#a16207", Y: "#facc15", c: "#22d3ee", W: "#ecfeff", B: "#0e7490" },
  },
};

/** 인벤토리 표시 순서 */
export const ITEM_ORDER: readonly ItemId[] = ["relic", "bronzeKey", "silverKey", "blastPowder", "potion", "coin"];

/** 받침 유무에 따라 조사를 고른다. 예: withJosa("금화", "을", "를") → "금화를" */
export function withJosa(word: string, withBatchim: string, withoutBatchim: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasBatchim ? withBatchim : withoutBatchim);
}
