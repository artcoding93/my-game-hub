"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { GameSlug } from "@/data/types";

const LOADING_SHAPES = {
  square: "aspect-square max-w-[560px]",
  wide: "aspect-[28/19]",
  tall: "aspect-[3/4] max-w-[30rem]",
  video: "aspect-video max-w-[64rem]",
} as const;

function GameLoading({ shape = "square" }: { shape?: keyof typeof LOADING_SHAPES }) {
  return (
    <div
      className={`mx-auto flex w-full items-center justify-center rounded-xl bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-900 ${LOADING_SHAPES[shape]}`}
    >
      게임을 불러오는 중…
    </div>
  );
}

/**
 * slug → 게임 컴포넌트 매핑.
 * 각 게임은 별도 청크로 분리되어 해당 게임 페이지에서만 로드된다.
 * `Record<GameSlug, ...>` 타입이므로 GAME_SLUGS에 추가된 게임이 여기 없으면 타입 에러가 난다.
 * (Server Component에서 next/dynamic을 쓰면 코드 분할이 되지 않으므로 이 파일은 Client 모듈이어야 한다.)
 */
const gameComponents: Record<GameSlug, ComponentType> = {
  "snake-classic": dynamic(() => import("./snake-classic"), {
    ssr: false,
    loading: () => <GameLoading />,
  }),
  // Phaser 게임(Gold Escape, Star Vanguard, Lost Relic)은 브라우저 전용이므로 SSR을 끄고, 해당 게임 페이지에서만 별도 청크로 불러온다.
  "gold-escape": dynamic(() => import("./gold-escape"), {
    ssr: false,
    loading: () => <GameLoading shape="wide" />,
  }),
  "star-vanguard": dynamic(() => import("./star-vanguard"), {
    ssr: false,
    loading: () => <GameLoading shape="tall" />,
  }),
  "lost-relic": dynamic(() => import("./lost-relic"), {
    ssr: false,
    loading: () => <GameLoading shape="video" />,
  }),
};

export function GameLoader({ slug }: { slug: GameSlug }) {
  const Game = gameComponents[slug];
  return <Game />;
}
