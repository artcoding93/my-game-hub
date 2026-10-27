import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readStoredNumber, readStoredString, writeStoredNumber, writeStoredString } from "@/lib/storage";
import { CascadeAudio } from "./audio/CascadeAudio";
import { STORAGE_KEYS, type GameMode } from "./config";
import { CascadeController } from "./controller";
import { KEY_TO_MOVE, KEY_TO_PRESS, PAUSE_KEYS, SOFT_DROP_KEYS } from "./input";
import { parseRecords, recordResult, serializeRecords, type Records } from "./records";

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

/** 화면 흔들림 단계: 2 보통 → 1 약하게 → 0 끔 */
export type ShakeLevel = 0 | 1 | 2;
export const SHAKE_FACTOR: Record<ShakeLevel, number> = { 0: 0, 1: 0.4, 2: 1 };

/** 결과 화면에서 바로 다시 시작되지 않도록 Enter를 잠깐 무시하는 시간(ms) */
const RESULT_GUARD_MS = 700;

export interface GameResultView {
  newBest: boolean;
}

/**
 * 컨트롤러·사운드 생성, 키보드 입력, 모드별 기록·사운드·흔들림 설정 저장, 탭 전환 시 자동 일시정지를 담당한다.
 * (이 훅을 쓰는 컴포넌트는 ssr: false로만 로드되므로 초기화 시점에 window를 써도 안전하다.)
 */
export function useCascadeRush() {
  const [controller] = useState(() => new CascadeController(newSeed()));
  // 효과음·배경음악은 기본 꺼짐. 설정은 게임별 키에 저장한다.
  const [audio] = useState(
    () => new CascadeAudio(readStoredNumber(STORAGE_KEYS.sound, 0) === 1, readStoredNumber(STORAGE_KEYS.music, 0) === 1),
  );
  const [soundOn, setSoundOn] = useState(audio.sfxEnabled);
  const [musicOn, setMusicOn] = useState(audio.musicEnabled);
  const [shake, setShake] = useState<ShakeLevel>(() => {
    const v = readStoredNumber(STORAGE_KEYS.shake, 2);
    return v === 0 || v === 1 ? v : 2;
  });
  const [records, setRecords] = useState<Records>(() => parseRecords(readStoredString(STORAGE_KEYS.records)));
  const [result, setResult] = useState<GameResultView | null>(null);
  const [mode, setMode] = useState<GameMode>("rush");
  const recordsRef = useRef(records);
  const overAt = useRef(0);

  const hud = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getHud(),
    () => controller.getHud(),
  );

  // BGM: 화면 단계·속도·긴박한 순간에 맞춘다
  useEffect(() => {
    audio.setScene(hud.phase, hud.speed, (hud.seconds !== null && hud.seconds <= 10) || hud.danger);
  }, [audio, hud.phase, hud.speed, hud.seconds, hud.danger]);

  useEffect(() => {
    const offEvents = controller.onEvents((events) => {
      audio.handle(events);
      if (!events.some((e) => e.type === "gameOver")) return;
      const s = controller.state;
      const saved = recordResult(recordsRef.current, s.mode, { score: s.score, maxChain: s.maxChain, crystals: s.crystals });
      recordsRef.current = saved.records;
      writeStoredString(STORAGE_KEYS.records, serializeRecords(saved.records));
      setRecords(saved.records);
      setResult({ newBest: saved.newBest && s.score > 0 });
      overAt.current = performance.now();
    });
    return () => {
      offEvents();
      audio.dispose();
    };
  }, [controller, audio]);

  // 개발 서버에서만 브라우저 테스트·디버깅용으로 노출한다(프로덕션 빌드에서는 제거됨).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const debug = window as unknown as { __CASCADE_RUSH__?: unknown };
    debug.__CASCADE_RUSH__ = { controller, audio };
    return () => {
      delete debug.__CASCADE_RUSH__;
    };
  }, [controller, audio]);

  const toggleSound = useCallback(() => {
    const next = !audio.sfxEnabled;
    audio.setSfxEnabled(next);
    setSoundOn(next);
    writeStoredNumber(STORAGE_KEYS.sound, next ? 1 : 0);
    if (next) audio.play([{ cue: "ui" }]);
  }, [audio]);

  const toggleMusic = useCallback(() => {
    const next = !audio.musicEnabled;
    audio.setMusicEnabled(next);
    setMusicOn(next);
    writeStoredNumber(STORAGE_KEYS.music, next ? 1 : 0);
  }, [audio]);

  const cycleShake = useCallback(() => {
    setShake((v) => {
      const next = (v === 0 ? 2 : v - 1) as ShakeLevel;
      writeStoredNumber(STORAGE_KEYS.shake, next);
      return next;
    });
  }, []);

  /** 시작·다시 시작 (사용자 입력 안에서 오디오를 깨운다) */
  const start = useCallback(
    (next: GameMode) => {
      audio.unlock();
      setMode(next);
      setResult(null);
      controller.start(next, newSeed());
    },
    [audio, controller],
  );

  const togglePause = useCallback(() => {
    audio.unlock();
    controller.togglePause();
  }, [audio, controller]);

  const toTitle = useCallback(() => {
    audio.unlock();
    setResult(null);
    controller.toTitle();
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
        } else if (event.code === "Space" && phase === "title") start(mode);
        return;
      }
      if (PAUSE_KEYS.has(event.code)) {
        event.preventDefault();
        if (!event.repeat) togglePause();
        return;
      }
      if (event.code === "Enter") {
        event.preventDefault();
        if (event.repeat) return;
        if (phase === "title") start(mode);
        else if (phase === "over" && performance.now() - overAt.current > RESULT_GUARD_MS) start(controller.state.mode);
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
  }, [controller, audio, start, togglePause, mode]);

  return {
    controller,
    hud,
    audio,
    soundOn,
    toggleSound,
    musicOn,
    toggleMusic,
    shake,
    cycleShake,
    records,
    result,
    mode,
    setMode,
    start,
    togglePause,
    toTitle,
  };
}
