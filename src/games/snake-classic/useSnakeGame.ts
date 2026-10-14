import { useCallback, useEffect, useReducer, useRef, type TouchEvent } from "react";
import { readStoredNumber, writeStoredNumber } from "@/lib/storage";
import { HIGH_SCORE_STORAGE_KEY, TICK_MS } from "./constants";
import { createInitialState, snakeReducer } from "./logic";
import type { Direction, SnakeStatus } from "./types";

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
};

/** 이 거리(px) 미만의 터치 이동은 스와이프가 아니라 탭으로 본다. */
const SWIPE_THRESHOLD = 24;

// 이 컴포넌트는 ssr: false로만 로드되므로 초기화 시점에 window를 써도 안전하다.
function initState() {
  return createInitialState(readStoredNumber(HIGH_SCORE_STORAGE_KEY), Math.random());
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * Snake 게임의 상태와 부수 효과(게임 루프, 입력, 저장)를 관리한다.
 * 게임 규칙 자체는 logic.ts의 순수 reducer가 담당한다.
 */
export function useSnakeGame() {
  const [state, dispatch] = useReducer(snakeReducer, undefined, initState);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback(() => dispatch({ type: "start", random: Math.random() }), []);
  const restart = useCallback(() => dispatch({ type: "restart", random: Math.random() }), []);
  const togglePause = useCallback(() => dispatch({ type: "togglePause" }), []);
  const turn = useCallback((direction: Direction) => dispatch({ type: "turn", direction }), []);

  /** Space·Enter·화면 탭: 상태에 따라 시작 / 일시정지 토글 / 재시작 */
  const primaryAction = useCallback(
    (status: SnakeStatus) => {
      if (status === "ready") start();
      else if (status === "playing" || status === "paused") togglePause();
      else restart();
    },
    [restart, start, togglePause],
  );

  // 게임 루프: playing 상태에서만 일정 간격으로 한 칸씩 전진
  useEffect(() => {
    if (state.status !== "playing") return;
    const id = window.setInterval(() => dispatch({ type: "tick", random: Math.random() }), TICK_MS);
    return () => window.clearInterval(id);
  }, [state.status]);

  // 최고 점수 저장
  useEffect(() => {
    writeStoredNumber(HIGH_SCORE_STORAGE_KEY, state.highScore);
  }, [state.highScore]);

  // 키보드 입력
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;

      const direction = KEY_TO_DIRECTION[event.code];
      if (direction) {
        // 게임이 끝난 뒤에는 방향키로 페이지를 스크롤할 수 있게 둔다.
        if (state.status === "over" || state.status === "won") return;
        event.preventDefault();
        turn(direction);
        return;
      }

      if (event.code === "Space" || event.code === "Enter" || event.code === "KeyP") {
        // 포커스된 버튼의 기본 클릭과 중복 실행되지 않도록 막는다.
        event.preventDefault();
        if (event.repeat) return;
        if (event.code === "KeyP") togglePause();
        else primaryAction(state.status);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [primaryAction, state.status, togglePause, turn]);

  // 다른 탭으로 이동하면 자동 일시정지
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) dispatch({ type: "pause" });
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // 터치: 스와이프로 방향 전환, 탭으로 primaryAction
  const onTouchStart = useCallback((event: TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (event: TouchEvent) => {
      const startPoint = touchStart.current;
      touchStart.current = null;
      if (!startPoint) return;

      const touch = event.changedTouches[0];
      const dx = touch.clientX - startPoint.x;
      const dy = touch.clientY - startPoint.y;

      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) {
        primaryAction(state.status);
      } else if (Math.abs(dx) > Math.abs(dy)) {
        turn(dx > 0 ? "right" : "left");
      } else {
        turn(dy > 0 ? "down" : "up");
      }
    },
    [primaryAction, state.status, turn],
  );

  return {
    state,
    start,
    restart,
    togglePause,
    touchHandlers: { onTouchStart, onTouchEnd },
  };
}
