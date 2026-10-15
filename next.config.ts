import type { NextConfig } from "next";
import { games } from "./src/data/games";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // 게임의 예전·짧은 주소(aliases)를 공식 게임 주소로 영구 리디렉션한다. 예: /games/snake → /games/snake-classic
  redirects() {
    return games.flatMap((game) =>
      (game.aliases ?? []).map((alias) => ({
        source: `/games/${alias}`,
        destination: `/games/${game.slug}`,
        permanent: true,
      })),
    );
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
