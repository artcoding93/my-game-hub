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
  /** Cache Components 환경에서는 렌더링 중 new Date()를 쓸 수 없으므로 고정값을 쓴다. */
  copyrightYear: 2026,
} as const;

/**
 * 운영자·정책 정보.
 * null인 항목은 페이지에 "확인 필요" 표시로 노출된다(<TodoMark>).
 * AdSense 신청 전에 모두 실제 값으로 채워야 한다.
 */
export const operatorConfig: {
  name: string | null;
  email: string | null;
  privacyOfficer: string | null;
  privacyEffectiveDate: string | null;
  termsEffectiveDate: string | null;
} = {
  // TODO: 운영자 이름(개인) 또는 상호명
  name: null,
  // TODO: 공개해도 되는 문의용 이메일 주소
  email: null,
  // TODO: 개인정보 보호책임자 성명(개인 운영이면 운영자 본인)
  privacyOfficer: null,
  // TODO: 개인정보처리방침 시행일 (YYYY-MM-DD)
  privacyEffectiveDate: null,
  // TODO: 이용약관 시행일 (YYYY-MM-DD)
  termsEffectiveDate: null,
};

export const navLinks = [
  { href: "/#games", label: "게임" },
  { href: "/about", label: "소개" },
  { href: "/contact", label: "문의" },
] as const;

export const policyLinks = [
  { href: "/about", label: "사이트 소개" },
  { href: "/contact", label: "문의하기" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/terms", label: "이용약관" },
] as const;

/**
 * 광고 설정. 실제 AdSense 스크립트는 아직 연결하지 않는다.
 * `NEXT_PUBLIC_ADSENSE_CLIENT`(ca-pub-...)가 설정되기 전까지 AdSlot은
 * 개발 환경에서만 자리 표시용 박스를 렌더링한다.
 */
export const adsConfig = {
  client: process.env.NEXT_PUBLIC_ADSENSE_CLIENT,
  enabled: Boolean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT),
} as const;
