import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/ContentPage";
import { TodoMark } from "@/components/TodoMark";
import { CATEGORY_LABELS, getAllGames, getGamePath } from "@/lib/games";
import { INDEXABLE, operatorConfig, siteConfig, socialMetadata } from "@/lib/site";

const DESCRIPTION = `${siteConfig.name}은 설치 없이 PC와 모바일 브라우저에서 바로 즐기는 무료 레트로 웹 게임 사이트입니다. 사이트의 목적과 제공하는 게임 장르, 직접 만든 게임을 제공하는 운영 방향을 소개합니다.`;

export const metadata: Metadata = {
  title: "사이트 소개",
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  robots: INDEXABLE,
  ...socialMetadata({ title: `사이트 소개 | ${siteConfig.name}`, description: DESCRIPTION, path: "/about" }),
};

export default function AboutPage() {
  const games = getAllGames().filter((game) => game.status === "available");

  return (
    <ContentPage title="사이트 소개">
      <p>
        {siteConfig.name}({siteConfig.alternateName})은 설치나 회원가입 없이 웹 브라우저에서 바로 즐길 수 있는 2D
        미니게임을 직접 만들어 제공하는 사이트입니다. 1980년대 아케이드와 8비트 PC 게임의 감성을 바탕으로, 짧은
        시간에도 규칙을 익히고 몰입할 수 있는 게임을 만듭니다.
      </p>

      <h2>사이트의 목적</h2>
      <p>
        잠깐 쉬는 시간에도 부담 없이 즐길 수 있는 게임을 PC와 모바일 어디서나 같은 방식으로 플레이할 수 있게 하는
        것이 목표입니다. 링크를 열면 바로 시작할 수 있도록 별도의 프로그램 설치, 계정 생성, 결제를 요구하지
        않습니다. 각 게임 페이지에는 게임 소개와 조작 방법, 규칙, 점수 방식, 공략 팁을 글로 함께 정리해 처음
        방문한 이용자도 쉽게 시작할 수 있게 했습니다.
      </p>

      <h2>제공하는 게임 장르</h2>
      <p>현재 다음 게임을 무료로 제공하고 있습니다.</p>
      <ul>
        {games.map((game) => (
          <li key={game.slug}>
            <Link href={getGamePath(game.slug)}>{game.title}</Link> ({CATEGORY_LABELS[game.category]}) —{" "}
            {game.summary}
          </li>
        ))}
      </ul>
      <p>
        고전 아케이드, 퍼즐 플랫폼, 고정 화면 슈팅, 방 단위 탐험 어드벤처, 낙하형 블록 퍼즐처럼 서로 다른 장르를
        다루며, 새로운 게임은 준비되는 대로 계속 추가할 예정입니다.
      </p>

      <h2>브라우저에서 무료로 플레이</h2>
      <ul>
        <li>모든 게임은 무료이며 회원가입이나 앱 설치 없이 각 게임 페이지에서 바로 시작합니다.</li>
        <li>
          PC에서는 키보드로, 스마트폰과 태블릿에서는 화면의 터치 버튼이나 스와이프로 플레이합니다. Chrome, Edge,
          Safari, Firefox 등 최신 브라우저를 권장합니다.
        </li>
        <li>
          최고 점수와 사운드 설정 같은 게임 기록은 서버에 보내지 않고 이용자의 브라우저에만 저장합니다. 자세한
          내용은 <Link href="/privacy">개인정보처리방침</Link>을 확인해 주세요.
        </li>
      </ul>

      <h2>운영 방향</h2>
      <ul>
        <li>
          독창적인 웹 게임을 직접 개발해 제공합니다. 고전 게임은 장르와 기본 규칙만 참고하며, 기존 상용 게임의
          이름·캐릭터·그래픽·음악을 가져오지 않습니다.
        </li>
        <li>
          게임 그래픽은 직접 디자인한 픽셀아트와 도형으로 그리고, 효과음과 배경음악은 외부 음원 파일 없이
          브라우저에서 실시간으로 합성합니다.
        </li>
        <li>
          장르를 그대로 옮기기보다 각 게임에 고유한 규칙을 더합니다. 예를 들어 Winter Blocks는 착지한 블록 위에
          혹이 생기는 규칙과 겨울 방해 요소를, Gold Escape는 벽돌을 파서 경비원을 가두는 퍼즐을 중심으로 설계했습니다.
        </li>
        <li>키보드와 터치 조작을 모두 지원하고, 다양한 화면 크기에서 플레이할 수 있도록 다듬습니다.</li>
        <li>
          사이트 운영을 위해 앞으로 광고가 게재될 수 있습니다. 광고는 게임 화면과 조작 버튼에서 떨어진 위치에만 두어
          게임 조작을 방해하거나 실수로 누르게 하지 않도록 배치합니다.
        </li>
      </ul>

      <h2>운영자</h2>
      <p>
        {siteConfig.name}은 <TodoMark label="운영자 이름 또는 상호" value={operatorConfig.name} />이(가)
        운영합니다. 오류 제보나 게임 제안은 <Link href="/contact">문의하기</Link> 페이지를 이용해 주세요.
      </p>
    </ContentPage>
  );
}
