import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { readStoredNumber, writeStoredNumber } from "@/lib/storage";
import { HIGH_SCORE_KEY, MUSIC_KEY, SOUND_KEY, StarVanguardController } from "./controller";
import { KEY_TO_MOVE } from "./input";
import { SoundEngine } from "./sound";

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
 * 컨트롤러·사운드 생성, 키보드 입력, 최고 점수·사운드 설정 저장, 탭 전환 시 자동 일시정지를 담당한다.
 * (이 훅을 쓰는 컴포넌트는 ssr: false로만 로드되므로 초기화 시점에 window를 써도 안전하다.)
 */
export function useStarVanguard() {
  const [controller] = useState(() => new StarVanguardController(readStoredNumber(HIGH_SCORE_KEY)));
  const [sound] = useState(() => new SoundEngine(readStoredNumber(SOUND_KEY, 1) !== 0, readStoredNumber(MUSIC_KEY, 0) === 1));
  const [soundOn, setSoundOn] = useState(sound.enabled);
  const [musicOn, setMusicOn] = useState(sound.music.enabled);
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
    const unsubscribe = controller.onEvents((events) => {
      sound.play(events);
      sound.handleMusic(events, controller.state);
    });
    const unsubscribeAction = controller.onAction((action) => sound.handleMusic([], controller.state, action));
    return () => {
      unsubscribe();
      unsubscribeAction();
      sound.dispose();
    };
  }, [controller, sound]);

  const toggleSound = useCallback(() => {
    const next = !sound.enabled;
    sound.setEnabled(next);
    setSoundOn(next);
    writeStoredNumber(SOUND_KEY, next ? 1 : 0);
  }, [sound]);

  const toggleMusic = useCallback(() => {
    const next = !sound.music.enabled;
    sound.setMusicEnabled(next);
    setMusicOn(next);
    writeStoredNumber(MUSIC_KEY, next ? 1 : 0);
  }, [sound]);

  /** 시작·재개 버튼. 사용자 입력 안에서 오디오를 깨운다(자동재생 정책). */
  const primaryAction = useCallback(() => {
    sound.unlock();
    controller.primaryAction();
  }, [controller, sound]);

  useEffect(() => {
    const { input } = controller;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isPageControlTarget(event.target)) return;

      const move = KEY_TO_MOVE[event.code];
      if (move) {
        event.preventDefault();
        input.press(event.code, move);
        return;
      }

      if (event.code === "Space") {
        // 포커스된 버튼의 클릭과 페이지 스크롤을 막는다.
        event.preventDefault();
        const { phase } = controller.state;
        if (phase === "ready" || phase === "gameOver" || phase === "paused") {
          if (!event.repeat) primaryAction();
        } else {
          sound.unlock();
          input.setFire("Space", true);
        }
        return;
      }

      const actions: Record<string, () => void> = {
        KeyP: () => controller.togglePause(),
        Escape: () => controller.pause(),
        Enter: primaryAction,
        KeyM: toggleSound,
      };
      const action = actions[event.code];
      if (!action) return;
      event.preventDefault();
      if (!event.repeat) action();
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (KEY_TO_MOVE[event.code]) input.release(event.code);
      if (event.code === "Space") input.setFire("Space", false);
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
  }, [controller, sound, primaryAction, toggleSound]);

  return { controller, hud, sound, soundOn, toggleSound, musicOn, toggleMusic, primaryAction };
}
