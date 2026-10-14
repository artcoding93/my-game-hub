import { adsConfig } from "@/lib/site";

export type AdVariant = "banner" | "rectangle" | "sidebar";

interface AdSlotProps {
  /** 광고 위치 식별자. 추후 AdSense data-ad-slot 값과 매핑한다. */
  placement: string;
  variant?: AdVariant;
  className?: string;
}

/**
 * 변형별로 최소 높이를 미리 확보해 광고 로드 시 레이아웃 이동(CLS)을 막는다.
 * - banner: 본문 상/하단 가로형 (모바일 320x100, 데스크톱 728x90)
 * - rectangle: 본문 중간 사각형 (300x250)
 * - sidebar: 데스크톱 사이드바 세로형 (300x600)
 */
const VARIANT_CLASSES: Record<AdVariant, string> = {
  banner: "min-h-[100px] md:min-h-[90px] w-full",
  rectangle: "min-h-[250px] w-full max-w-[336px] mx-auto",
  sidebar: "min-h-[600px] w-full max-w-[300px]",
};

/**
 * 광고 자리 표시 컴포넌트.
 * 실제 광고 스크립트는 아직 연결하지 않았다. 연결 시 이 컴포넌트 내부만 교체하면 된다.
 *
 * 배치 규칙: 게임 조작 영역(캔버스, 조작 버튼) 안이나 바로 옆에 두지 않는다.
 * 오클릭 유도는 AdSense 정책 위반이므로 `GamePageLayout`이 정한 위치에만 둔다.
 */
export function AdSlot({ placement, variant = "banner", className = "" }: AdSlotProps) {
  const isDev = process.env.NODE_ENV === "development";

  // 광고가 활성화되지 않은 프로덕션에서는 빈 공간을 남기지 않는다.
  if (!adsConfig.enabled && !isDev) return null;

  return (
    <aside
      aria-label="광고"
      data-ad-placement={placement}
      className={`flex items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-100/60 text-xs text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-500 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {/* TODO: AdSense 연결 시 <ins class="adsbygoogle"> 렌더링으로 교체 */}
      <span>
        광고 영역 · {placement} ({variant})
      </span>
    </aside>
  );
}
