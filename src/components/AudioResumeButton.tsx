"use client";

import { useSyncExternalStore } from "react";
import { isAudioBlocked, resumeAllAudio, subscribeAudioBlocked } from "@/lib/audio/unlock";

/**
 * 게임이 소리를 켜 두었는데 브라우저(주로 iPhone Safari)가 오디오를 계속 막고 있을 때만 화면 아래에 나타나는 버튼.
 * 누르는 순간(사용자 입력 안)에서 모든 게임 오디오를 다시 깨운다. 소리가 정상이면 보이지 않는다.
 */
export function AudioResumeButton() {
  const blocked = useSyncExternalStore(subscribeAudioBlocked, isAudioBlocked, () => false);
  if (!blocked) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={() => resumeAllAudio()}
        className="pointer-events-auto inline-flex min-h-12 touch-manipulation items-center gap-2 rounded-full bg-sky-600 px-5 text-sm font-medium text-white shadow-lg ring-2 ring-white/70 hover:bg-sky-500 active:scale-95"
      >
        <span aria-hidden>🔈</span>
        소리가 멈췄습니다 · 눌러서 다시 켜기
      </button>
    </div>
  );
}
