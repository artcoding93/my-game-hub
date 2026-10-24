import { useCallback, useEffect, useReducer, useRef, useState, type PointerEvent } from "react";
import { readStoredNumber, writeStoredNumber } from "@/lib/storage";
import { HIGH_SCORE_STORAGE_KEY, MUSIC_STORAGE_KEY, SOUND_STORAGE_KEY, TICK_MS } from "./constants";
import { createInitialState, snakeReducer } from "./logic";
import { tempoForTick } from "./music";
import { SnakeSound } from "./sound";
import { getSoundEvents } from "./soundEvents";
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

// 이 컴포넌트는 ssr: false로만 로드되므로 초기화 시점에 window를 써도 안전하다.
function initState() {
  return createInitialState(readStoredNumber(HIGH_SCORE_STORAGE_KEY), Math.random());
}

/** 입력 칸이나 링크에 포커스가 있으면 게임 키를 가로채지 않는다(Enter로 헤더·푸터 링크를 열 수 있게). */
function isPageControlTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
      target.closest("a[href]") !== null)
  );
}

/**
 * Snake 게임의 상태와 부수 효과(게임 루프, 입력, 저장)를 관리한다.
 * 게임 규칙 자체는 logic.ts의 순수 reducer가 담당한다.
 */
export function useSnakeGame() {
  const [state, dispatch] = useReducer(snakeReducer, undefined, initState);
  const [sound] = useState(() => {
    const engine = new SnakeSound(readStoredNumber(SOUND_STORAGE_KEY, 0) === 1, readStoredNumber(MUSIC_STORAGE_KEY, 0) === 1);
    // 현재 Snake는 속도가 일정하므로 BGM도 기본 템포(115 BPM)를 유지한다. 이동 간격이 바뀌면 이 값을 갱신하면 된다.
    engine.music.setTempo(tempoForTick(TICK_MS));
    return engine;
  });
  const [soundOn, setSoundOn] = useState(sound.enabled);
  const [musicOn, setMusicOn] = useState(sound.music.enabled);
  const prevState = useRef(state);
  const restarted = useRef(false);

  const start = useCallback(() => dispatch({ type: "start", random: Math.random() }), []);
  const restart = useCallback(() => {
    restarted.current = true;
    dispatch({ type: "restart", random: Math.random() });
  }, []);
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

  // 효과음: 상태가 바뀔 때마다 이전 상태와 비교해 재생할 소리를 고른다(게임 규칙과 분리).
  useEffect(() => {
    const events = getSoundEvents(prevState.current, state, restarted.current);
    prevState.current = state;
    if (restarted.current) {
      // 재시작 시 이전 판의 효과음(게임 오버 멜로디 등)이 이어지지 않게 모두 멈춘다.
      restarted.current = false;
      sound.stopAll();
    }
    sound.play(events);
    // BGM: 시작·재시작은 처음부터, 일시정지/재개는 이어서, 게임 오버는 페이드아웃. 먹이 획득 등에는 반응하지 않는다.
    sound.music.handleEvents(events);
  }, [sound, state]);

  // 오디오는 사용자 입력 이후에만 활성화한다(자동재생 정책). 컴포넌트가 사라지면 AudioContext를 닫는다.
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    window.addEventListener("touchend", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchend", unlock, true);
      sound.dispose();
    };
  }, [sound]);

  const toggleSound = useCallback(() => {
    const next = !sound.enabled;
    sound.setEnabled(next);
    setSoundOn(next);
    writeStoredNumber(SOUND_STORAGE_KEY, next ? 1 : 0);
  }, [sound]);

  const toggleMusic = useCallback(() => {
    const next = !sound.music.enabled;
    sound.setMusicEnabled(next);
    setMusicOn(next);
    writeStoredNumber(MUSIC_STORAGE_KEY, next ? 1 : 0);
  }, [sound]);

  // 개발 서버에서만 브라우저 테스트·디버깅용으로 노출한다(프로덕션 빌드에서는 제거됨).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const debug = window as unknown as { __SNAKE__?: unknown };
    debug.__SNAKE__ = { getState: () => stateRef.current, sound };
    return () => {
      delete debug.__SNAKE__;
    };
  }, [sound]);

  // 최고 점수 저장
  useEffect(() => {
    writeStoredNumber(HIGH_SCORE_STORAGE_KEY, state.highScore);
  }, [state.highScore]);

  // 키보드 입력
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isPageControlTarget(event.target)) return;

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

  // 모바일 방향 전환은 화면 아래 방향 버튼(SnakeGame의 DirectionPad)이 맡는다. 보드 터치는 시작·재시작·재개만 한다
  // (플레이 중 보드를 실수로 눌러 일시정지되지 않도록). 마우스 클릭은 기존처럼 무시한다.
  const onBoardPointerUp = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType === "mouse" || state.status === "playing") return;
      primaryAction(state.status);
    },
    [primaryAction, state.status],
  );

  return {
    state,
    start,
    restart,
    togglePause,
    soundOn,
    toggleSound,
    musicOn,
    toggleMusic,
    turn,
    onBoardPointerUp,
  };
}
