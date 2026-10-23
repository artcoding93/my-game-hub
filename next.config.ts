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
  experimental: {
    // next dev·build의 업그레이드 알림 정책 (기본값과 같음: 보안 권고가 있을 때만 업그레이드를 권장)
    agentUpgrade: "security",
  },
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
