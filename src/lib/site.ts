/**
 * 사이트 전역 설정.
 * 배포 시 `NEXT_PUBLIC_SITE_URL`을 실제 도메인으로 설정해야
 * canonical URL, Open Graph, sitemap이 올바르게 생성된다.
 */
export const siteConfig = {
  name: "My Game Hub",
  description: "설치 없이 브라우저에서 바로 즐기는 무료 2D 미니게임 모음.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locale: "ko_KR",
} as const;

/**
 * 광고 설정. 실제 AdSense 스크립트는 아직 연결하지 않는다.
 * `NEXT_PUBLIC_ADSENSE_CLIENT`(ca-pub-...)가 설정되기 전까지 AdSlot은
 * 개발 환경에서만 자리 표시용 박스를 렌더링한다.
 */
export const adsConfig = {
  client: process.env.NEXT_PUBLIC_ADSENSE_CLIENT,
  enabled: Boolean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT),
} as const;
