import type { ReactNode } from "react";

/**
 * 아직 확정되지 않은 정보를 눈에 띄게 표시한다.
 * `value`가 채워지면 그 값을, 비어 있으면 "[운영자 확인 필요: label]" 표시를 렌더링한다.
 * `message`를 주면 괄호 안 문구 전체를 그 값으로 바꾼다(예: "운영자 이메일 입력 필요").
 * 프로덕션에서도 숨기지 않는다: 빠진 정보가 배포 화면에서 바로 보여야 하기 때문이다.
 */
export function TodoMark({ label, value, message }: { label: string; value?: ReactNode; message?: string }) {
  if (value !== undefined && value !== null && value !== "") return <>{value}</>;

  return (
    <mark
      title={label}
      className="rounded bg-amber-100 px-1 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
    >
      [{message ?? `운영자 확인 필요: ${label}`}]
    </mark>
  );
}
