import { useEffect, useState, useSyncExternalStore } from "react";
import { readStoredNumber, writeStoredNumber } from "@/lib/storage";
import { GoldEscapeController, HIGH_SCORE_KEY } from "./controller";
import { KEY_TO_DIRECTION } from "./input";

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * 컨트롤러 생성, 키보드 입력, 최고 점수 저장, 탭 전환 시 자동 일시정지를 담당한다.
 * (이 훅을 쓰는 컴포넌트는 ssr: false로만 로드되므로 초기화 시점에 window를 써도 안전하다.)
 */
export function useGoldEscape() {
  const [controller] = useState(() => new GoldEscapeController(readStoredNumber(HIGH_SCORE_KEY)));
  const hud = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getHud(),
    () => controller.getHud(),
  );

  // 최고 점수 저장 (새로고침 후에도 유지)
  useEffect(() => {
    writeStoredNumber(HIGH_SCORE_KEY, hud.highScore);
  }, [hud.highScore]);

  useEffect(() => {
    const { input } = controller;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;

      const direction = KEY_TO_DIRECTION[event.code];
      if (direction) {
        event.preventDefault();
        input.press(direction);
        return;
      }

      const actions: Record<string, () => void> = {
        KeyZ: () => input.dig(-1),
        KeyX: () => input.dig(1),
        KeyP: () => controller.togglePause(),
        Escape: () => controller.pause(),
        Enter: () => controller.primaryAction(),
        Space: () => controller.primaryAction(),
        KeyR: () => controller.selfDestruct(),
      };
      const action = actions[event.code];
      if (!action) return;
      // 포커스된 버튼의 기본 클릭과 중복 실행되지 않도록 막는다.
      event.preventDefault();
      if (!event.repeat) action();
    }

    function handleKeyUp(event: KeyboardEvent) {
      const direction = KEY_TO_DIRECTION[event.code];
      if (direction) input.release(direction);
    }

    function handleBlur() {
      input.clear();
    }

    function handleVisibilityChange() {
      if (document.hidden) controller.pause();
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [controller]);

  return { controller, hud };
}
