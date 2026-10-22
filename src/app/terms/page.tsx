import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/ContentPage";
import { TodoMark } from "@/components/TodoMark";
import { INDEXABLE, operatorConfig, siteConfig, socialMetadata } from "@/lib/site";

const DESCRIPTION = `${siteConfig.name} 무료 게임 서비스의 이용 조건, 서비스 변경·중단, 저작권, 이용자 준수사항과 책임의 제한을 안내합니다.`;

export const metadata: Metadata = {
  title: "이용약관",
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  robots: INDEXABLE,
  ...socialMetadata({ title: `이용약관 | ${siteConfig.name}`, description: DESCRIPTION, path: "/terms" }),
};

/*
 * 이용약관 초안. 운영자 이름·시행일·관할 법원은 operatorConfig와 <TodoMark>로 표시되며,
 * 게시 전에 실제 운영 정책과 법률 검토를 거쳐 확정해야 한다.
 */
export default function TermsPage() {
  return (
    <ContentPage
      title="이용약관"
      subtitle={
        <>
          시행일: <TodoMark label="시행일" value={operatorConfig.termsEffectiveDate} />
        </>
      }
    >
      <h2>제1조 (목적)</h2>
      <p>
        이 약관은 <TodoMark label="운영자 이름 또는 상호" value={operatorConfig.name} />(이하 “운영자”)가
        제공하는 {siteConfig.name}(이하 “사이트”)의 이용 조건과 절차, 이용자와 운영자의 권리·의무를 정하는 것을
        목적으로 합니다.
      </p>

      <h2>제2조 (약관의 효력과 변경)</h2>
      <ol>
        <li>이 약관은 사이트에 게시함으로써 효력이 생기며, 사이트를 이용하면 이 약관에 동의한 것으로 봅니다.</li>
        <li>
          운영자는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 시행 7일 전부터 사이트에
          알립니다.
        </li>
      </ol>

      <h2>제3조 (서비스의 내용)</h2>
      <ol>
        <li>
          사이트는 웹 브라우저에서 플레이할 수 있는 2D 미니게임(Snake Classic, Gold Escape, Star Vanguard, Lost Relic,
          Winter Blocks 등)과 각 게임의 소개·조작 방법·규칙 등 관련 정보를 제공합니다.
        </li>
        <li>게임 기록(최고 점수, 진행 상태, 사운드 설정)은 이용자의 브라우저에만 저장되며, 사이트는 이를 보관하거나 복구하지 않습니다.</li>
      </ol>

      <h2>제4조 (무료 이용)</h2>
      <ol>
        <li>사이트의 모든 게임은 회원가입, 앱 설치, 결제 없이 무료로 이용할 수 있습니다.</li>
        <li>사이트는 유료 아이템이나 결제 기능을 제공하지 않습니다.</li>
        <li>
          사이트에는 서비스 운영을 위한 광고가 게재될 수 있습니다. 광고는 게임 화면과 조작 영역 밖에 배치합니다.
        </li>
      </ol>

      <h2>제5조 (서비스의 변경 및 중단)</h2>
      <ol>
        <li>운영자는 운영상·기술상 필요에 따라 게임을 추가하거나 내용을 변경할 수 있습니다.</li>
        <li>
          운영자는 시스템 점검, 호스팅 장애, 운영 사정 등의 이유로 서비스의 전부 또는 일부를 일시 중단하거나
          종료할 수 있습니다. 가능한 경우 사이트를 통해 미리 알립니다.
        </li>
        <li>게임이 변경·중단되는 과정에서 브라우저에 저장된 게임 기록은 유지되지 않을 수 있습니다.</li>
      </ol>

      <h2>제6조 (이용자의 준수사항)</h2>
      <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
      <ul>
        <li>사이트의 정상적인 운영을 방해하는 행위 (과도한 자동 요청, 해킹 시도, 악성 코드 유포 등)</li>
        <li>사이트의 게임, 그래픽, 글 등 콘텐츠를 운영자의 허락 없이 복제·배포하거나 상업적으로 이용하는 행위</li>
        <li>사이트나 운영자를 사칭하거나 사이트의 콘텐츠를 자신의 것처럼 게시하는 행위</li>
        <li>광고를 의도적으로 반복 클릭하거나 다른 사람에게 클릭을 유도하는 행위</li>
        <li>기타 관련 법령에 위반되는 행위</li>
      </ul>

      <h2>제7조 (저작권 및 지식재산권)</h2>
      <ol>
        <li>
          사이트에서 제공하는 게임 프로그램, 그래픽, 효과음·배경음악, 글 등 콘텐츠의 저작권은 운영자 또는 정당한
          권리자에게 있습니다.
        </li>
        <li>
          스네이크, 퍼즐 플랫폼, 고정 화면 슈팅, 낙하형 블록 퍼즐 등 고전 게임 장르와 일반적인 규칙은 누구나 이용할
          수 있는 아이디어이며, 사이트의 게임은 이를 바탕으로 그래픽과 사운드를 직접 만들어 구현한 것입니다. 사이트는
          다른 게임의 이름, 캐릭터, 그래픽, 음악을 사용하지 않습니다.
        </li>
        <li>
          사이트는 오픈소스 소프트웨어(Next.js, React, Phaser 등 MIT 라이선스)와 오픈 폰트(Geist, Press Start 2P 등 SIL
          Open Font License)를 각 라이선스 조건에 따라 사용합니다.
        </li>
        <li>
          사이트의 콘텐츠가 자신의 권리를 침해한다고 생각하는 경우 <Link href="/contact">문의하기</Link>의 연락처로
          알려 주시면 확인 후 필요한 조치를 하겠습니다.
        </li>
      </ol>

      <h2>제8조 (책임의 제한)</h2>
      <ol>
        <li>
          사이트는 무료로 제공되며, 운영자는 천재지변, 호스팅 장애 등 운영자가 통제할 수 없는 사유로 서비스를
          제공할 수 없는 경우 책임을 지지 않습니다.
        </li>
        <li>운영자는 이용자의 기기나 브라우저 환경으로 생긴 문제, 브라우저에 저장된 기록의 손실에 대해 책임을 지지 않습니다.</li>
        <li>사이트에 게재된 광고나 외부 링크를 통해 이용자와 제3자 사이에 생긴 거래·분쟁에 대해 운영자는 책임을 지지 않습니다.</li>
        <li>다만 운영자의 고의 또는 중대한 과실로 손해가 생긴 경우에는 관련 법령에 따릅니다.</li>
      </ol>

      <h2>제9조 (개인정보 보호)</h2>
      <p>
        운영자는 관련 법령에 따라 이용자의 개인정보를 보호하며, 자세한 내용은{" "}
        <Link href="/privacy">개인정보처리방침</Link>에 따릅니다.
      </p>

      <h2>제10조 (준거법 및 관할)</h2>
      <p>
        이 약관은 대한민국 법률에 따라 해석되며, 사이트 이용과 관련한 분쟁은{" "}
        {/* TODO: 관할 법원 확인 (일반적으로 민사소송법상 관할 법원) */}
        <TodoMark label="관할 법원 (예: 민사소송법상 관할 법원)" />을 관할 법원으로 합니다.
      </p>

      <h2>제11조 (문의 방법)</h2>
      <p>
        약관이나 서비스에 관한 문의는 이메일(
        <TodoMark
          label="문의용 이메일 주소"
          message="운영자 이메일 입력 필요"
          value={
            operatorConfig.email && <a href={`mailto:${operatorConfig.email}`}>{operatorConfig.email}</a>
          }
        />
        )로 보내 주세요. 자세한 안내는 <Link href="/contact">문의하기</Link> 페이지에 있습니다.
      </p>
    </ContentPage>
  );
}
