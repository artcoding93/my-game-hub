import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * /robots.txt
 * 모든 검색엔진이 홈·게임 페이지·정보 페이지를 크롤링할 수 있도록 전체 허용한다.
 * (게임 화면을 그리는 JS·CSS(/_next/)도 막지 않아야 검색엔진이 페이지를 제대로 렌더링한다.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
