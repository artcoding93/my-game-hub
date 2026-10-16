import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/ContentPage";
import { TodoMark } from "@/components/TodoMark";
import { INDEXABLE, operatorConfig, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: `${siteConfig.name}가 처리하는 개인정보의 항목, 목적, 보관 기간과 이용자의 권리를 안내합니다.`,
  alternates: { canonical: "/privacy" },
  robots: INDEXABLE,
};

/*
 * 이 방침은 "현재 실제로 사용하는 것"만 반영한다.
 *   - 호스팅: Vercel (서버 접속 기록)
 *   - 문의: 이메일
 *   - 브라우저 localStorage: 게임별 최고 점수
 *       Snake Classic (my-game-hub:snake-classic:high-score), Gold Escape (my-game-hub:gold-escape:high-score)
 *   - 방문 통계: Vercel Web Analytics (쿠키 없음, src/app/layout.tsx의 <Analytics />)
 *   - 쿠키·광고: 사용하지 않음
 *
 * TODO(AdSense 연결 시 반드시 개정):
 *   - Google 및 제3자 광고 사업자의 쿠키 사용, 맞춤 광고 해제 방법(https://adssettings.google.com) 안내
 *   - Google의 파트너 사이트 데이터 사용 안내(https://policies.google.com/technologies/partner-sites) 링크
 *   - EEA·영국·스위스 이용자 동의(CMP) 처리 여부
 *   - 위 "쿠키" 항목과 "처리 위탁 및 국외 이전" 표에 Google 추가
 * 새로운 분석 도구(Google Analytics 등)를 도입할 때도 같은 방식으로 개정한다.
 */
export default function PrivacyPage() {
  return (
    <ContentPage
      title="개인정보처리방침"
      subtitle={
        <>
          시행일: <TodoMark label="시행일" value={operatorConfig.privacyEffectiveDate} />
        </>
      }
    >
      <p>
        {siteConfig.name}(이하 “사이트”)는 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」 등
        관련 법령을 지킵니다. 사이트는 회원가입 기능이 없으며, 게임을 이용하기 위해 이름·연락처 등
        개인정보를 입력받지 않습니다.
      </p>

      <h2>1. 처리하는 정보와 목적</h2>
      <div className="overflow-x-auto">
      <table className="min-w-[32rem]">
        <thead>
          <tr>
            <th>구분</th>
            <th>항목</th>
            <th>목적</th>
            <th>보관 기간</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>사이트 접속 시 자동 생성</td>
            <td>IP 주소, 브라우저·기기 정보(User-Agent), 요청한 페이지 주소, 접속 일시</td>
            <td>사이트 제공, 오류 확인, 비정상 접근 차단 등 보안 유지</td>
            <td>
              {/* TODO: Vercel 요금제별 로그 보존 기간 확인 후 기재 */}
              호스팅 사업자(Vercel)의 로그 보존 정책에 따름 (
              <TodoMark label="Vercel 요금제의 로그 보존 기간" />)
            </td>
          </tr>
          <tr>
            <td>방문 통계 (Vercel Web Analytics)</td>
            <td>
              방문한 페이지 주소, 이전 페이지(리퍼러), 브라우저·운영체제·기기 종류, 접속 국가, 방문 일시
            </td>
            <td>페이지별 방문자 수 등 사이트 이용 현황 파악 및 서비스 개선</td>
            <td>
              {/* TODO: Vercel 요금제별 Web Analytics 데이터 보존 기간 확인 후 기재 */}
              Vercel의 데이터 보존 정책에 따름 (
              <TodoMark label="Vercel Web Analytics 데이터 보존 기간" />)
            </td>
          </tr>
          <tr>
            <td>이메일 문의 시</td>
            <td>이메일 주소, 문의 내용 및 이용자가 직접 적은 정보</td>
            <td>문의 확인 및 답변</td>
            <td>
              {/* TODO: 문의 기록 보관 기간 결정 (예: 답변 완료 후 1년) */}
              <TodoMark label="문의 기록 보관 기간" />
            </td>
          </tr>
        </tbody>
      </table>
      </div>
      <p>
        사이트 운영자는 위 접속 기록과 방문 통계를 이용해 특정 개인을 식별하거나 다른 정보와 결합하지
        않습니다. 방문 통계는 쿠키를 사용하지 않으며, Vercel은 같은 날의 방문을 구분하기 위해 IP 주소 등으로
        만든 임시 식별값을 쓰고 이 값은 하루가 지나면 폐기됩니다. 운영자는 개인별 기록이 아닌 집계된 통계만
        확인할 수 있습니다.
      </p>

      <h2>2. 이용자 브라우저에 저장되는 정보</h2>
      <p>
        일부 게임은 이용자의 편의를 위해 브라우저의 로컬 저장소(localStorage)를 사용합니다. 이 정보는
        이용자의 기기에만 저장되며 사이트 서버로 전송되지 않습니다.
      </p>
      <ul>
        <li>Snake Classic: 최고 점수(숫자)</li>
        <li>Gold Escape: 최고 점수(숫자)</li>
      </ul>
      <p>
        브라우저 설정에서 이 사이트의 데이터를 삭제하면 저장된 기록도 함께 삭제됩니다. 시크릿(비공개)
        모드에서는 창을 닫을 때 자동으로 삭제됩니다.
      </p>

      <h2>3. 쿠키</h2>
      <p>
        사이트는 현재 쿠키를 사용하지 않으며, 광고를 사용하지 않습니다. 방문 통계(Vercel Web Analytics)도
        쿠키 없이 동작합니다. 앞으로 광고나 쿠키를 쓰는 분석 도구를 도입하는 경우, 시행 전에 이 방침을
        개정해 사용하는 서비스와 쿠키, 거부 방법을 안내하겠습니다. 방문 통계 수집을 원하지 않으면 브라우저의
        추적 방지 기능이나 콘텐츠 차단 확장 프로그램을 사용할 수 있습니다.
      </p>

      <h2>4. 제3자 제공</h2>
      <p>
        사이트는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 특별한 규정이 있거나 수사기관이
        법령에 정한 절차에 따라 요청하는 경우는 예외로 합니다.
      </p>

      <h2>5. 처리 위탁 및 국외 이전</h2>
      <p>사이트는 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 맡기고 있습니다.</p>
      <div className="overflow-x-auto">
      <table className="min-w-[32rem]">
        <thead>
          <tr>
            <th>수탁자</th>
            <th>업무</th>
            <th>이전 국가</th>
            <th>이전 항목</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Vercel Inc.</td>
            <td>웹사이트 호스팅 및 콘텐츠 전송, 방문 통계 집계</td>
            <td>
              {/* TODO: Vercel 프로젝트의 Function Region 및 CDN 처리 국가 확인 */}
              미국 등 (<TodoMark label="Vercel 배포 리전" />)
            </td>
            <td>1번 표의 접속 기록 및 방문 통계</td>
          </tr>
          <tr>
            <td>
              {/* TODO: 문의 메일을 받는 서비스 확인 (예: Google Gmail → Google LLC, 미국) */}
              <TodoMark label="문의 이메일 서비스 제공자" />
            </td>
            <td>문의 이메일 수신 및 보관</td>
            <td>
              <TodoMark label="이전 국가" />
            </td>
            <td>이메일 주소, 문의 내용</td>
          </tr>
        </tbody>
      </table>
      </div>
      <p>
        국외 이전은 이용자가 사이트에 접속하거나 이메일을 보낼 때 네트워크를 통해 이루어집니다. 국외 이전을
        원하지 않는 경우 사이트 이용이나 이메일 문의를 하지 않을 수 있으나, 이 경우 서비스 이용이 제한됩니다.
      </p>

      <h2>6. 파기</h2>
      <p>
        보관 기간이 지나거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자 파일은 복구할 수 없는
        방법으로 삭제합니다.
      </p>

      <h2>7. 이용자의 권리</h2>
      <p>
        이용자는 언제든지 자신의 개인정보 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다. 아래 개인정보
        보호책임자에게 이메일로 요청하면 지체 없이 처리하겠습니다. 브라우저에 저장된 게임 기록은 2번 항목의
        방법으로 직접 삭제할 수 있습니다.
      </p>

      <h2>8. 안전성 확보 조치</h2>
      <p>
        사이트는 모든 통신을 HTTPS로 암호화하며, 문의 기록에 접근할 수 있는 사람을 운영자로 제한합니다.
      </p>

      <h2>9. 만 14세 미만 아동</h2>
      <p>
        사이트는 회원가입이 없고 아동의 개인정보를 따로 수집하지 않습니다. 만 14세 미만 아동이 이메일로 문의하는
        경우 법정대리인의 동의가 필요할 수 있습니다.
      </p>

      <h2>10. 개인정보 보호책임자</h2>
      <ul>
        <li>
          성명: <TodoMark label="개인정보 보호책임자 성명" value={operatorConfig.privacyOfficer} />
        </li>
        <li>
          이메일:{" "}
          <TodoMark
            label="문의용 이메일 주소"
            value={
              operatorConfig.email && <a href={`mailto:${operatorConfig.email}`}>{operatorConfig.email}</a>
            }
          />
        </li>
      </ul>
      <p>
        기타 개인정보 침해에 대한 신고나 상담이 필요하면 아래 기관에 문의할 수 있습니다.
      </p>
      <ul>
        <li>개인정보침해신고센터: privacy.kisa.or.kr / 국번 없이 118</li>
        <li>개인정보분쟁조정위원회: www.kopico.go.kr / 1833-6972</li>
        <li>대검찰청: www.spo.go.kr / 국번 없이 1301</li>
        <li>경찰청: ecrm.police.go.kr / 국번 없이 182</li>
      </ul>

      <h2>11. 방침의 변경</h2>
      <p>
        이 방침을 바꾸는 경우 시행 7일 전부터 이 페이지를 통해 알립니다. 문의는{" "}
        <Link href="/contact">문의하기</Link> 페이지를 이용해 주세요.
      </p>
    </ContentPage>
  );
}
