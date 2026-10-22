import type { MetadataRoute } from "next";
import { getSitemapEntries } from "@/lib/seo";

/**
 * /sitemap.xml
 * 항목은 src/lib/seo.ts의 getSitemapEntries()가 만든다.
 * - 게임: src/data/games.ts에서 공개(available) 상태인 게임만 자동으로 포함된다(coming-soon은 404라 제외).
 * - 모든 URL은 공식 도메인(https://www.artcoding-game.app) 기준이며 각 페이지의 canonical과 같다.
 * - 새 게임을 추가하면 홈·소개 페이지의 lastmod도 그 게임의 날짜로 바뀐다.
 * 빌드 후 `npm run test:seo:build`로 실제 생성된 sitemap.xml·HTML을 검증할 수 있다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return getSitemapEntries();
}
