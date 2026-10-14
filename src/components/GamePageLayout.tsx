import type { ReactNode } from "react";
import { AdSlot } from "./AdSlot";

interface GamePageLayoutProps {
  /** 게임 제목·설명 등 상단 헤더 */
  header: ReactNode;
  /** 게임 캔버스와 조작 UI. 이 영역 안에는 광고를 넣지 않는다. */
  game: ReactNode;
  /** 조작법·게임 소개 등 부가 정보 */
  details: ReactNode;
}

/**
 * 개별 게임 페이지 공통 레이아웃.
 *
 * 모바일:   header → game → (간격) → 광고(rectangle) → details → 광고(banner)
 * 데스크톱: [header / game / details] | [sidebar 광고(sticky)]
 *
 * 게임 조작 영역과 광고 영역 사이에는 항상 충분한 간격을 둬서 오클릭을 방지한다.
 */
export function GamePageLayout({ header, game, details }: GamePageLayoutProps) {
  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:py-10">
      <div className="flex min-w-0 flex-col gap-6">
        {header}

        <section aria-label="게임 플레이 영역" className="w-full">
          {game}
        </section>

        {/* 모바일 전용: 게임 영역과 분리된 본문 중간 광고 */}
        <AdSlot placement="game-inline" variant="rectangle" className="mt-4 lg:hidden" />

        {details}

        <AdSlot placement="game-bottom" variant="banner" />
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
