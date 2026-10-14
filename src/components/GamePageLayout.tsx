import type { ReactNode } from "react";
import { AdSlot } from "./AdSlot";

/**
 * 개별 게임 페이지 공통 레이아웃. URL(params)에 의존하지 않으므로
 * Partial Prefetching의 App Shell에 포함되어 즉시 표시된다.
 *
 * children은 다음 순서로 렌더링해야 한다: 제목 → 게임 플레이 영역 → 본문(소개·조작·규칙)
 *
 * 모바일:   children → 광고
 * 데스크톱: [children / 광고] | [sidebar 광고(sticky)]
 *
 * 광고 배치 원칙 (AdSense 오클릭 유도 금지 정책):
 * - 게임 화면·조작 버튼의 위·아래에 광고를 바로 붙이지 않는다.
 *   세로 방향으로는 항상 본문이 광고와 게임 사이에 온다.
 * - 데스크톱 사이드바 광고는 게임 열과 최소 48px(lg:gap-12) 이상 떨어뜨린다.
 * - 터치 기기에서는 사이드바를 쓰지 않는다(lg 미만에서 숨김).
 */
export function GamePageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12 lg:py-10">
      <div className="flex min-w-0 flex-col gap-10">
        {children}

        <AdSlot placement="game-bottom" variant="banner" className="mt-4" />
      </div>

      {/* 데스크톱 전용 사이드바 광고 */}
      <div className="hidden lg:block">
        <div className="sticky top-20">
          <AdSlot placement="game-sidebar" variant="sidebar" />
        </div>
      </div>
    </div>
  );
}
