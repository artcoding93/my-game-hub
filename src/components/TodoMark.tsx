import type { ReactNode } from "react";

/**
 * 아직 확정되지 않은 정보를 눈에 띄게 표시한다.
 * `value`가 채워지면 그 값을, 비어 있으면 "확인 필요" 표시를 렌더링한다.
 * 프로덕션에서도 숨기지 않는다: 빠진 정보가 배포 화면에서 바로 보여야 하기 때문이다.
 */
export function TodoMark({ label, value }: { label: string; value?: ReactNode }) {
  if (value !== undefined && value !== null && value !== "") return <>{value}</>;

  return (
    <mark className="rounded bg-amber-100 px-1 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
      [확인 필요: {label}]
    </mark>
  );
}
