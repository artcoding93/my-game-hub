import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { readStoredNumber, readStoredString, writeStoredNumber, writeStoredString } from "@/lib/storage";
import { KartAudio } from "./audio/KartAudio";
import type { CameraMode } from "./camera";
import { STORAGE_KEYS } from "./config";
import { TurboKartController } from "./controller";
import { KEY_TO_HOLD, KEY_TO_TAP } from "./input";
import { PLAYER } from "./logic/game";
import { newRecords, parseRecords, recordRace, serializeRecords, type Records } from "./records";
import type { Difficulty, RaceResult, TrackId } from "./types";

/** 입력 칸이나 링크에 포커스가 있으면 게임 키를 가로채지 않는다(Enter로 헤더·푸터 링크를 열 수 있게). */
function isPageControlTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("a[href]") !== null)
  );
}

function newSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
}

export type Screen = "title" | "howto" | "track" | "difficulty" | "race";

export interface RaceSummary {
  rank: number;
  time: number;
  newBest: boolean;
  results: RaceResult[];
}

/**
 * 컨트롤러·사운드 생성, 메뉴 흐름, 기록 저장, 키보드 입력, 탭 전환·창 이탈 시 자동 일시정지를 담당한다.
 * (ssr: false로만 로드되므로 초기화 시점에 window·localStorage를 써도 안전하다.)
 */
export function useTurboKart(rootRef: RefObject<HTMLElement | null>) {
  const [controller] = useState(() => new TurboKartController());
  // 효과음·배경음악 기본 꺼짐. 설정은 게임별 키에 저장한다.
  const [audio] = useState(() => new KartAudio(readStoredNumber(STORAGE_KEYS.sfx, 0) === 1, readStoredNumber(STORAGE_KEYS.music, 0) === 1));
  const [soundOn, setSoundOn] = useState(audio.sfxEnabled);
  const [musicOn, setMusicOn] = useState(audio.musicEnabled);
  // 카메라: 기본은 회전(카트 전방이 화면 위). 고정 탑다운을 고를 수 있다.
  const [cameraMode, setCameraMode] = useState<CameraMode>(() => (readStoredNumber(STORAGE_KEYS.camera, 1) === 0 ? "topdown" : "chase"));
  // 저장 데이터가 없거나 손상되어도 새 기록으로 정상 시작한다
  const [records, setRecords] = useState<Records>(() => parseRecords(readStoredString(STORAGE_KEYS.records)) ?? newRecords());
  const recordsRef = useRef(records);
  const [screen, setScreen] = useState<Screen>("title");
  const [track, setTrack] = useState<TrackId>("greenValley");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [summary, setSummary] = useState<RaceSummary | null>(null);
  const hud = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getHud(),
    () => controller.getHud(),
  );

  useEffect(() => {
    const off = controller.onEvents((events) => {
      audio.handle(events, PLAYER);
      const over = events.find((e) => e.type === "raceOver");
      const race = controller.race;
      if (!over || over.type !== "raceOver" || !race) return;
      const { state } = race;
      const result = recordRace(recordsRef.current, state.raceId, state.track, state.difficulty, over.playerRank, over.playerTime);
      if (result.records !== recordsRef.current) {
        recordsRef.current = result.records;
        setRecords(result.records);
        writeStoredString(STORAGE_KEYS.records, serializeRecords(result.records));
      }
      setSummary({ rank: over.playerRank, time: over.playerTime, newBest: result.newBest, results: state.results ?? [] });
    });
    return () => {
      off();
      audio.dispose();
    };
  }, [controller, audio]);

  // 개발 서버에서만 브라우저 테스트·디버깅용으로 노출한다(프로덕션 빌드에서는 제거됨).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const debug = window as unknown as { __TURBO_KART__?: unknown };
    debug.__TURBO_KART__ = { controller, audio };
    return () => {
      delete debug.__TURBO_KART__;
    };
  }, [controller, audio]);

  const toggleSound = useCallback(() => {
    const next = !audio.sfxEnabled;
    audio.setSfxEnabled(next);
    setSoundOn(next);
    writeStoredNumber(STORAGE_KEYS.sfx, next ? 1 : 0);
    if (next) audio.click();
  }, [audio]);

  const toggleMusic = useCallback(() => {
    const next = !audio.musicEnabled;
    audio.setMusicEnabled(next);
    setMusicOn(next);
    writeStoredNumber(STORAGE_KEYS.music, next ? 1 : 0);
    if (next) {
      const race = controller.race;
      if (race && race.state.phase !== "finished") {
        audio.startRaceMusic(race.state.track);
        if (race.state.paused) audio.setPaused(true);
      } else audio.cueMusic(track);
    }
  }, [audio, controller, track]);

  const toggleCamera = useCallback(() => {
    setCameraMode((mode) => {
      const next = mode === "chase" ? "topdown" : "chase";
      writeStoredNumber(STORAGE_KEYS.camera, next === "chase" ? 1 : 0);
      return next;
    });
    audio.click();
  }, [audio]);

  const go = useCallback(
    (next: Screen) => {
      audio.unlock();
      audio.click();
      setScreen(next);
    },
    [audio],
  );

  const chooseTrack = useCallback(
    (id: TrackId) => {
      setTrack(id);
      audio.unlock();
      audio.cueMusic(id);
    },
    [audio],
  );

  const startRace = useCallback(() => {
    audio.unlock();
    setSummary(null);
    controller.startRace({ track, difficulty, seed: newSeed() });
    audio.startRaceMusic(track);
    setScreen("race");
  }, [audio, controller, difficulty, track]);

  const quitToMenu = useCallback(
    (next: Screen = "title") => {
      controller.quit();
      setSummary(null);
      audio.setPaused(true);
      audio.cueMusic(track);
      go(next);
    },
    [audio, controller, go, track],
  );

  const togglePause = useCallback(() => {
    audio.unlock();
    controller.togglePause();
    audio.setPaused(controller.race?.state.paused ?? false);
  }, [audio, controller]);

  // 키보드: 레이스 화면이 보이는 동안만 게임 키를 가로챈다(아래 설명을 읽을 때는 페이지 스크롤 가능)
  const visibleRef = useRef(true);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => (visibleRef.current = entry.isIntersecting), { threshold: 0.35 });
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    const { input } = controller;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isPageControlTarget(event.target)) return;
      const race = controller.race;
      if (screen !== "race" || !race || !visibleRef.current) return;
      const hold = KEY_TO_HOLD[event.code];
      if (hold) {
        event.preventDefault();
        audio.unlock();
        if (!race.state.paused) {
          if (hold === "brake" && !input.isHeld("brake")) {
            const me = race.state.karts[PLAYER];
            audio.brake(Math.hypot(me.vx, me.vy));
          }
          input.press(event.code, hold);
        }
        return;
      }
      const tap = KEY_TO_TAP[event.code];
      if (tap) {
        event.preventDefault();
        if (!event.repeat && !race.state.paused) input.tap(tap);
        return;
      }
      if (event.code === "KeyP" || event.code === "Escape") {
        event.preventDefault();
        if (!event.repeat && race.state.phase !== "finished") togglePause();
        return;
      }
      if (event.code === "Enter" && race.state.paused) {
        event.preventDefault();
        togglePause();
      }
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (KEY_TO_HOLD[event.code]) input.release(event.code);
    }
    function pauseNow() {
      input.clear();
      const race = controller.race;
      if (race && !race.state.paused && race.state.phase !== "finished") {
        controller.pause();
        audio.setPaused(true);
      }
    }
    function handleVisibilityChange() {
      if (document.hidden) pauseNow();
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", pauseNow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", pauseNow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [controller, audio, screen, togglePause]);

  return {
    controller,
    audio,
    hud,
    records,
    screen,
    track,
    difficulty,
    summary,
    soundOn,
    musicOn,
    toggleSound,
    toggleMusic,
    cameraMode,
    toggleCamera,
    go,
    chooseTrack,
    setDifficulty,
    startRace,
    quitToMenu,
    togglePause,
  };
}

export type KartGameApi = ReturnType<typeof useTurboKart>;
