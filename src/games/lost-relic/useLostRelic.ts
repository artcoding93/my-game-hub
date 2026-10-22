import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { readStoredNumber, readStoredString, removeStored, writeStoredNumber, writeStoredString } from "@/lib/storage";
import { LostRelicAudio } from "./audio/LostRelicAudio";
import { GAME_CONFIG } from "./config";
import { LostRelicController, type Persistence } from "./controller";
import { KEY_TO_MOVE, KEY_TO_VERTICAL } from "./input";
import { teleport } from "./logic/simulation";
import { parseSaveData } from "./save";
import type { RoomId } from "./types";

/** 입력 칸이나 링크에 포커스가 있으면 게임 키를 가로채지 않는다(Enter로 헤더·푸터 링크를 열 수 있게). */
function isPageControlTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
      target.closest("a[href]") !== null)
  );
}

const persistence: Persistence = {
  writeSave: (data) => writeStoredString(GAME_CONFIG.saveStorageKey, JSON.stringify(data)),
  clearSave: () => removeStored(GAME_CONFIG.saveStorageKey),
  writeRecords: (bestScore, bestTime) => {
    writeStoredNumber(GAME_CONFIG.bestScoreStorageKey, bestScore);
    writeStoredNumber(GAME_CONFIG.bestTimeStorageKey, bestTime);
  },
};

/** 저장 데이터를 읽는다. 손상된 데이터는 지우고 null을 돌려준다. */
function loadSave() {
  const raw = readStoredString(GAME_CONFIG.saveStorageKey);
  const data = parseSaveData(raw);
  if (raw !== null && !data) removeStored(GAME_CONFIG.saveStorageKey);
  return { data, corrupted: raw !== null && !data };
}

/**
 * 컨트롤러·사운드 생성, 키보드 입력, 진행 저장·기록·사운드 설정 저장, 탭 전환 시 자동 일시정지를 담당한다.
 * (이 훅을 쓰는 컴포넌트는 ssr: false로만 로드되므로 초기화 시점에 window를 써도 안전하다.)
 */
export function useLostRelic() {
  const [initial] = useState(loadSave);
  const [controller] = useState(
    () =>
      new LostRelicController(persistence, {
        bestScore: readStoredNumber(GAME_CONFIG.bestScoreStorageKey),
        bestTime: readStoredNumber(GAME_CONFIG.bestTimeStorageKey),
        hasSave: initial.data !== null,
      }),
  );
  // 효과음·배경음악은 기본 꺼짐. 켜면 게임별 키에 1로 저장한다.
  const [audio] = useState(
    () =>
      new LostRelicAudio(
        readStoredNumber(GAME_CONFIG.sfxStorageKey, 0) === 1,
        readStoredNumber(GAME_CONFIG.musicStorageKey, 0) === 1,
      ),
  );
  const [soundOn, setSoundOn] = useState(audio.sfxEnabled);
  const [musicOn, setMusicOn] = useState(audio.musicEnabled);
  const hud = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getHud(),
    () => controller.getHud(),
  );

  // 개발 서버에서만 브라우저 테스트·디버깅용으로 컨트롤러를 노출한다(프로덕션 빌드에서는 제거됨).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const debug = window as unknown as { __LOST_RELIC__?: unknown };
    debug.__LOST_RELIC__ = {
      controller,
      audio,
      get state() {
        return controller.state;
      },
      teleport: (room: RoomId, col: number, row: number) =>
        teleport(controller.state, room, { x: col * GAME_CONFIG.tile + GAME_CONFIG.tile / 2, y: (row + 1) * GAME_CONFIG.tile }),
    };
    return () => {
      delete debug.__LOST_RELIC__;
    };
  }, [controller, audio]);

  useEffect(() => {
    const unsubscribe = controller.onEvents((events) => audio.handle(events, controller.state.room));
    const unsubscribeAction = controller.onAction((action) => audio.handle([], controller.state.room, action));
    return () => {
      unsubscribe();
      unsubscribeAction();
      audio.dispose();
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

  /** 시작 버튼들. 사용자 입력 안에서 오디오를 깨운다(자동재생 정책). */
  const startNew = useCallback(() => {
    audio.unlock();
    controller.newGame();
  }, [audio, controller]);

  const continueSaved = useCallback(() => {
    audio.unlock();
    const { data } = loadSave();
    if (data) controller.continueGame(data);
    else controller.newGame();
  }, [audio, controller]);

  const resume = useCallback(() => {
    audio.unlock();
    if (controller.state.phase === "paused") controller.togglePause();
  }, [audio, controller]);

  useEffect(() => {
    const { input } = controller;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isPageControlTarget(event.target)) return;
      const { phase } = controller.state;
      const move = KEY_TO_MOVE[event.code];
      const vertical = KEY_TO_VERTICAL[event.code];

      if (phase === "inventory") {
        const actions: Record<string, () => void> = {
          ArrowLeft: () => controller.cycle(-1),
          ArrowUp: () => controller.cycle(-1),
          KeyA: () => controller.cycle(-1),
          KeyW: () => controller.cycle(-1),
          ArrowRight: () => controller.cycle(1),
          ArrowDown: () => controller.cycle(1),
          KeyD: () => controller.cycle(1),
          KeyS: () => controller.cycle(1),
          KeyQ: () => controller.cycle(1),
          KeyF: () => controller.applySelected(),
          Enter: () => controller.applySelected(),
          KeyI: () => controller.toggleInventory(),
          Escape: () => controller.toggleInventory(),
          KeyP: () => controller.pause(),
        };
        const known = event.code in actions;
        if (event.code === "Space" || known) event.preventDefault();
        if (known && !event.repeat) actions[event.code]();
        return;
      }

      if (move || vertical) {
        event.preventDefault();
        if (move) input.pressMove(event.code, move);
        if (vertical) input.pressVertical(event.code, vertical);
        return;
      }
      if (event.code === "Space") {
        // 포커스된 버튼의 클릭과 페이지 스크롤을 막는다.
        event.preventDefault();
        if (phase === "playing") {
          audio.unlock();
          input.setJump("Space", true);
        }
        return;
      }

      const playing = phase === "playing";
      const actions: Record<string, () => void> = {
        KeyE: () => playing && input.trigger("interact"),
        KeyF: () => playing && input.trigger("use"),
        KeyQ: () => playing && input.trigger("cycle"),
        KeyI: () => playing && controller.toggleInventory(),
        KeyP: () => controller.togglePause(),
        Escape: () => (phase === "paused" ? resume() : controller.pause()),
        Enter: () => {
          if (phase === "paused") resume();
          else if (phase === "gameOver" || phase === "cleared") startNew();
          else if (phase === "title") {
            if (controller.getHud().hasSave) continueSaved();
            else startNew();
          }
        },
      };
      if (!(event.code in actions)) return;
      event.preventDefault();
      if (!event.repeat) actions[event.code]();
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (KEY_TO_MOVE[event.code] || KEY_TO_VERTICAL[event.code]) input.release(event.code);
      if (event.code === "Space") input.setJump("Space", false);
    }

    function handleBlur() {
      input.clear();
    }

    function handleVisibilityChange() {
      if (document.hidden) controller.pause();
    }

    function handlePageHide() {
      controller.save();
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [controller, audio, resume, startNew, continueSaved]);

  return {
    controller,
    hud,
    audio,
    soundOn,
    toggleSound,
    musicOn,
    toggleMusic,
    startNew,
    continueSaved,
    resume,
    saveCorrupted: initial.corrupted,
  };
}
