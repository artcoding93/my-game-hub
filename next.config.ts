import type { NextConfig } from "next";
import { games } from "./src/data/games";
import { SITE_URL } from "./src/lib/site";

/**
 * Vercel 프로덕션 기본 도메인. 공식 도메인과 같은 페이지를 보여 주므로 공식 도메인으로 308 리디렉션한다.
 * 정확히 이 호스트만 맞춘다(has.value는 ^…$ 정규식): 프리뷰(my-game-hub-<hash>-….vercel.app)·localhost·공식 도메인은 영향 없음.
 */
const VERCEL_PRODUCTION_HOST = "my-game-hub-lemon.vercel.app";
const vercelHost = [{ type: "host" as const, value: VERCEL_PRODUCTION_HOST.replaceAll(".", "\\.") }];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  redirects() {
    const aliases = games.flatMap((game) =>
      (game.aliases ?? []).map((alias) => ({ alias, slug: game.slug })),
    );
    return [
      // Vercel 기본 도메인 → 공식 도메인 (경로·쿼리 유지). alias는 한 번에 최종 주소로 보낸다.
      ...aliases.map(({ alias, slug }) => ({
        source: `/games/${alias}`,
        has: vercelHost,
        destination: `${SITE_URL}/games/${slug}`,
        permanent: true,
      })),
      {
        source: "/:path*",
        has: vercelHost,
        destination: `${SITE_URL}/:path*`,
        permanent: true,
      },
      // 게임의 예전·짧은 주소(aliases)를 공식 게임 주소로 영구 리디렉션한다. 예: /games/snake → /games/snake-classic
      ...aliases.map(({ alias, slug }) => ({
        source: `/games/${alias}`,
        destination: `/games/${slug}`,
        permanent: true,
      })),
    ];
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
