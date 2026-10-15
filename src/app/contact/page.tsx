import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/ContentPage";
import { TodoMark } from "@/components/TodoMark";
import { INDEXABLE, operatorConfig, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "문의하기",
  description: `${siteConfig.name} 이용 중 발견한 오류, 게임 제안, 제휴 및 개인정보 관련 문의 방법을 안내합니다.`,
  alternates: { canonical: "/contact" },
  robots: INDEXABLE,
};

export default function ContactPage() {
  const { email } = operatorConfig;

  return (
    <ContentPage title="문의하기">
      <p>
        {siteConfig.name} 이용 중 궁금한 점이나 불편한 점이 있다면 아래 이메일로 연락해 주세요.
      </p>

      <h2>이메일</h2>
      <p className="text-lg">
        <TodoMark
          label="문의용 이메일 주소"
          value={email && <a href={`mailto:${email}`}>{email}</a>}
        />
      </p>
      <p>
        {/* TODO: 답변 소요 기간 확정 */}
        답변은 보통 <TodoMark label="답변 소요 기간 (예: 영업일 기준 3일 이내)" />에 드립니다.
      </p>

      <h2>이런 내용을 보내 주세요</h2>
      <ul>
        <li>게임 오류 제보: 게임 이름, 사용 기기와 브라우저, 문제가 생긴 상황</li>
        <li>새 게임 제안이나 개선 의견</li>
        <li>제휴 및 광고 문의</li>
        <li>개인정보 관련 문의 (열람·삭제 요청 등)</li>
      </ul>

      <h2>개인정보 안내</h2>
      <p>
        문의 시 보내 주신 이메일 주소와 문의 내용은 답변을 위해서만 사용합니다. 처리 방법과 보관 기간은{" "}
        <Link href="/privacy">개인정보처리방침</Link>에서 확인할 수 있습니다.
      </p>
    </ContentPage>
  );
}
