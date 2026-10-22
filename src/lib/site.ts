import type { Metadata } from "next";

/**
 * 공식 도메인 (www 포함, 끝에 / 없음).
 * canonical·Open Graph·JSON-LD·sitemap·robots가 모두 이 값을 쓴다.
 * 환경 변수로 바꾸지 않는다: 프리뷰·로컬 빌드에서도 검색엔진에 알리는 주소는 항상 공식 도메인이어야 한다.
 */
export const SITE_URL = "https://www.artcoding-game.app";

/**
 * 공개 페이지(홈·게임·정보 페이지) metadata에 넣는 색인 허용 설정 → <meta name="robots" content="index, follow">.
 * 루트 layout에 두지 않는다: 404 페이지까지 상속되면 Next.js가 넣는 noindex와 충돌하기 때문이다.
 */
export const INDEXABLE = { index: true, follow: true } as const;

/**
 * 페이지별 Open Graph·Twitter Card 메타데이터.
 * 페이지에서 openGraph를 지정하면 루트 layout의 openGraph를 통째로 덮어쓰므로, 사이트 이름·언어·URL을 항상 함께 넣는다.
 * images가 없으면 Twitter Card는 summary로 둔다.
 */
export function socialMetadata({
  title,
  description,
  path,
  images,
}: {
  title: string;
  description: string;
  path: `/${string}`;
  images?: { url: string; alt: string }[];
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      url: path,
      title,
      description,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      ...(images ? { images: images.map((image) => image.url) } : {}),
    },
  };
}

/** 공식 도메인 기준 절대 URL. absoluteUrl("/") → "https://www.artcoding-game.app/" */
export function absoluteUrl(path: `/${string}`): string {
  return `${SITE_URL}${path}`;
}

/** 사이트 전역 설정. 브랜드 표기는 name(공식)·alternateName(보조)만 쓴다. */
export const siteConfig = {
  name: "ArtCoding Game",
  alternateName: "ArtCoding",
  /** 메인 페이지 제목에 붙는 한 줄 소개 */
  tagline: "무료 온라인 레트로 아케이드 게임",
  description: "설치 없이 PC와 모바일 브라우저에서 바로 즐기는 무료 레트로 아케이드 게임 모음.",
  url: SITE_URL,
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
  name: "artcoding",
  // TODO: 공개해도 되는 문의용 이메일 주소
  email: "artcoding93@gmail.com",
  // TODO: 개인정보 보호책임자 성명(개인 운영이면 운영자 본인)
  privacyOfficer: "김도헌",
  // TODO: 개인정보처리방침 시행일 (YYYY-MM-DD)
  privacyEffectiveDate: "2026-10-25",
  // TODO: 이용약관 시행일 (YYYY-MM-DD)
  termsEffectiveDate: "2026-10-25",
};

export const navLinks = [
  { href: "/#games", label: "게임" },
  { href: "/about", label: "소개" },
  { href: "/contact", label: "문의" },
] as const;

/** 푸터 링크. 모든 페이지(모바일 포함)에서 홈·게임 목록·정보·정책 페이지로 이동할 수 있게 한다. */
export const footerLinks = [
  { href: "/", label: "홈" },
  { href: "/#games", label: "전체 게임" },
  { href: "/about", label: "사이트 소개" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/terms", label: "이용약관" },
  { href: "/contact", label: "문의하기" },
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
