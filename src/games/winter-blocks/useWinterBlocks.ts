import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { readStoredNumber, writeStoredNumber } from "@/lib/storage";
import { WinterAudio } from "./audio/WinterAudio";
import { TRACK_IDS, type TrackId } from "./audio/songs";
import { GAME_CONFIG } from "./config";
import { WinterBlocksController } from "./controller";
import { KEY_TO_MOVE, KEY_TO_PRESS, SOFT_DROP_KEYS } from "./input";

/** 입력 칸이나 링크에 포커스가 있으면 게임 키를 가로채지 않는다(Enter로 헤더·푸터 링크를 열 수 있게). */
function isPageControlTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
      target.closest("a[href]") !== null)
  );
}

/** 게임마다 다른 시드. 클라이언트에서 시작할 때만 정한다. */
function newSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
}

/**
 * 컨트롤러·사운드 생성, 키보드 입력, 최고 점수·사운드 설정 저장, 탭 전환 시 자동 일시정지를 담당한다.
 * (이 훅을 쓰는 컴포넌트는 ssr: false로만 로드되므로 초기화 시점에 window를 써도 안전하다.)
 */
export function useWinterBlocks() {
  const [controller] = useState(() => new WinterBlocksController(readStoredNumber(GAME_CONFIG.bestScoreStorageKey), newSeed()));
  // 효과음·배경음악은 기본 꺼짐, 기본 곡은 Snowy Night. 설정은 게임별 키에 저장한다.
  const [audio] = useState(
    () =>
      new WinterAudio(
        readStoredNumber(GAME_CONFIG.sfxStorageKey, 0) === 1,
        readStoredNumber(GAME_CONFIG.musicStorageKey, 0) === 1,
        TRACK_IDS[readStoredNumber(GAME_CONFIG.trackStorageKey, 0)] ?? "snowyNight",
      ),
  );
  const [soundOn, setSoundOn] = useState(audio.sfxEnabled);
  const [musicOn, setMusicOn] = useState(audio.musicEnabled);
  const [track, setTrackState] = useState<TrackId>(audio.track);
  const hud = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getHud(),
    () => controller.getHud(),
  );

  useEffect(() => {
    writeStoredNumber(GAME_CONFIG.bestScoreStorageKey, hud.highScore);
  }, [hud.highScore]);

  useEffect(() => {
    // 시작 화면에서도 BGM을 켜면 선택한 곡이 들린다.
    audio.handle([], "title");
    const offEvents = controller.onEvents((events) => audio.handle(events));
    const offAction = controller.onAction((action) => audio.handle([], action));
    return () => {
      offEvents();
      offAction();
      audio.dispose();
    };
  }, [controller, audio]);

  // 개발 서버에서만 브라우저 테스트·디버깅용으로 노출한다(프로덕션 빌드에서는 제거됨).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const debug = window as unknown as { __WINTER_BLOCKS__?: unknown };
    debug.__WINTER_BLOCKS__ = { controller, audio };
    return () => {
      delete debug.__WINTER_BLOCKS__;
    };
  }, [controller, audio]);

  const toggleSound = useCallback(() => {
    const next = !audio.sfxEnabled;
    audio.setSfxEnabled(next);
    setSoundOn(next);
    writeStoredNumber(GAME_CONFIG.sfxStorageKey, next ? 1 : 0);
  }, [audio]);

  const toggleMusic = useCallback(() => {
    const next = !audio.musicEnabled;
    audio.setMusicEnabled(next);
    setMusicOn(next);
    writeStoredNumber(GAME_CONFIG.musicStorageKey, next ? 1 : 0);
  }, [audio]);

  const selectTrack = useCallback(
    (id: TrackId) => {
      audio.unlock();
      audio.setTrack(id);
      setTrackState(id);
      writeStoredNumber(GAME_CONFIG.trackStorageKey, TRACK_IDS.indexOf(id));
    },
    [audio],
  );

  /** 시작·다시 시작 (사용자 입력 안에서 오디오를 깨운다) */
  const start = useCallback(() => {
    audio.unlock();
    controller.start(newSeed());
  }, [audio, controller]);

  const togglePause = useCallback(() => {
    audio.unlock();
    controller.togglePause();
  }, [audio, controller]);

  useEffect(() => {
    const { input } = controller;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isPageControlTarget(event.target)) return;
      const { phase } = controller.state;
      const move = KEY_TO_MOVE[event.code];
      if (move) {
        event.preventDefault();
        input.pressMove(event.code, move);
        return;
      }
      if (SOFT_DROP_KEYS.has(event.code)) {
        event.preventDefault();
        input.setSoftDrop(event.code, true);
        return;
      }
      if (event.code in KEY_TO_PRESS) {
        // Space·방향키의 페이지 스크롤과 포커스된 버튼 클릭을 막는다.
        event.preventDefault();
        if (event.repeat) return;
        if (phase === "playing") {
          audio.unlock();
          input.trigger(KEY_TO_PRESS[event.code]);
        } else if (event.code === "Space" && (phase === "title" || phase === "gameOver")) start();
        return;
      }
      if (event.code === "KeyP" || event.code === "Escape") {
        event.preventDefault();
        if (!event.repeat) togglePause();
        return;
      }
      if (event.code === "Enter") {
        event.preventDefault();
        if (event.repeat) return;
        if (phase === "title" || phase === "gameOver") start();
        else if (phase === "paused") togglePause();
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (KEY_TO_MOVE[event.code] || SOFT_DROP_KEYS.has(event.code)) input.release(event.code);
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
  }, [controller, audio, start, togglePause]);

  return { controller, hud, audio, soundOn, toggleSound, musicOn, toggleMusic, track, selectTrack, start, togglePause };
}
