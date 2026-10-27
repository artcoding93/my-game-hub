import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { readStoredNumber, readStoredString, writeStoredNumber, writeStoredString } from "@/lib/storage";
import { CargoAudio, cuesFor } from "./audio/CargoAudio";
import { ANIM, starsFor, STORAGE_KEYS, TILE } from "./config";
import { commandFor, DirectionRepeater, KEY_TO_DIR, type Command } from "./input";
import { hintFor, type Hint } from "./logic/hint";
import { Session } from "./logic/session";
import { CargoRenderer } from "./render/renderer";
import { allCleared, emptyProgress, isUnlocked, parseProgress, recordClear, serializeProgress, type Progress } from "./save";
import { STAGES } from "./stages";
import type { Dir } from "./types";

/** 입력 칸이나 링크에 포커스가 있으면 게임 키를 가로채지 않는다 */
function isPageControlTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("a[href]") !== null)
  );
}

export type Screen = "title" | "select" | "howto" | "game" | "finale";

export interface ClearInfo {
  stageIndex: number;
  moves: number;
  pushes: number;
  stars: 1 | 2 | 3;
  newBest: boolean;
  bestMoves: number;
  bestPushes: number;
  last: boolean;
}

const now = () => performance.now() / 1000;

/**
 * 세션·렌더러·사운드 생성, 그리기 루프, 키보드·D-pad 입력, 진행 저장, 힌트, 클리어 흐름, 탭 전환 시 정리.
 * ssr: false로만 로드되므로 초기화 시점에 window·localStorage를 써도 안전하다.
 */
export function useCargoBot(rootRef: RefObject<HTMLElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>) {
  const [audio] = useState(() => {
    const vol = readStoredNumber(STORAGE_KEYS.volume, 2);
    return new CargoAudio(readStoredNumber(STORAGE_KEYS.sfx, 0) === 1, readStoredNumber(STORAGE_KEYS.music, 0) === 1, (vol === 1 || vol === 3 ? vol : 2) as 1 | 2 | 3);
  });
  const [renderer] = useState(() => new CargoRenderer());
  const [repeater] = useState(() => new DirectionRepeater());
  const [progress, setProgress] = useState<Progress>(() => parseProgress(readStoredString(STORAGE_KEYS.progress)) ?? emptyProgress());
  const [screen, setScreen] = useState<Screen>("title");
  const [session, setSession] = useState<Session | null>(null);
  const [, setTick] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clear, setClear] = useState<ClearInfo | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [warning, setWarning] = useState(false);
  const [soundOn, setSoundOn] = useState(audio.sfxEnabled);
  const [musicOn, setMusicOn] = useState(audio.musicEnabled);
  const [volume, setVolumeState] = useState(audio.volume);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const progressRef = useRef(progress);
  const moveRef = useRef<(dir: Dir) => void>(() => {});
  const stateRef = useRef({ session, menuOpen, clear, screen, hint });
  useEffect(() => {
    stateRef.current = { session, menuOpen, clear, screen, hint };
  }, [session, menuOpen, clear, screen, hint]);

  const saveProgress = useCallback((p: Progress) => {
    progressRef.current = p;
    setProgress(p);
    writeStoredString(STORAGE_KEYS.progress, serializeProgress(p));
  }, []);

  /** 진행 중인 스테이지 상태를 저장한다 (새로고침해도 이어서) */
  const saveResume = useCallback(
    (s: Session) => {
      const p = progressRef.current;
      saveProgress({ ...p, lastStage: s.stageIndex, resume: s.solved || s.current.moves === 0 ? null : { stage: s.stageIndex, snapshot: s.current } });
    },
    [saveProgress],
  );

  // 그리기 루프
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    const frame = () => {
      const { session: s, menuOpen: menu, clear: cl, screen: sc, hint: h } = stateRef.current;
      if (s) {
        const w = s.level.cols * TILE;
        const hgt = s.level.rows * TILE;
        if (canvas.width !== w || canvas.height !== hgt) {
          canvas.width = w;
          canvas.height = hgt;
        }
        renderer.setLevel(s.level);
        // 누르고 있는 방향 반복 (메뉴·클리어 화면에서는 멈춤)
        if (!menu && !cl && sc === "game") {
          const d = repeater.poll(now());
          if (d !== null) moveRef.current(d);
        }
        renderer.render(ctx, s.board, now(), { hint: h?.kind === "push" ? h.push : null, deadlocks: s.deadlocks(), celebrate: sc === "finale" });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, renderer, repeater]);

  useEffect(() => () => audio.dispose(), [audio]);

  // 개발 서버에서만 브라우저 테스트·디버깅용으로 노출한다 (프로덕션 빌드에서는 제거됨)
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as unknown as { __CARGO_BOT__?: unknown };
    w.__CARGO_BOT__ = { getSession: () => stateRef.current.session, audio };
    return () => {
      delete w.__CARGO_BOT__;
    };
  }, [audio]);

  const openStage = useCallback(
    (index: number, fresh = false) => {
      const resume = !fresh && progress.resume?.stage === index ? progress.resume.snapshot : undefined;
      const s = new Session(index, resume);
      renderer.setLevel(s.level);
      renderer.snap();
      repeater.clear();
      setSession(s);
      setClear(null);
      setMenuOpen(false);
      setHint(null);
      setHintLevel(0);
      setWarning(false);
      setScreen("game");
      audio.unlock();
      audio.startFor(index);
      saveProgress({ ...progressRef.current, lastStage: index });
    },
    [audio, progress.resume, renderer, repeater, saveProgress],
  );

  const finishStage = useCallback(
    (s: Session) => {
      const { moves, pushes } = s.current;
      const stars = starsFor(pushes, STAGES[s.stageIndex].par.pushes);
      const { progress: next, newBest } = recordClear(progressRef.current, s.stageIndex, moves, pushes, stars);
      saveProgress(next);
      const rec = next.records[STAGES[s.stageIndex].id];
      // 연출(상자 이동·표시등)이 끝난 뒤 결과 창
      window.setTimeout(
        () => setClear({ stageIndex: s.stageIndex, moves, pushes, stars, newBest, bestMoves: rec.bestMoves, bestPushes: rec.bestPushes, last: s.stageIndex === STAGES.length - 1 }),
        ANIM.lamp * 1000,
      );
    },
    [saveProgress],
  );

  const doMove = useCallback(
    (dir: Dir) => {
      const { session: s, menuOpen: menu, clear: cl, screen: sc } = stateRef.current;
      if (!s || menu || cl || sc !== "game") return;
      const before = s.deadlocks().length;
      const res = s.move(dir);
      if (!res) return;
      renderer.onStep(res, now());
      const solved = s.solved;
      audio.play(cuesFor(res, s.level, solved));
      if (res.moved) {
        setHint(null);
        const dl = s.deadlocks().length;
        if (dl > before) audio.play([{ cue: "warn" }]);
        setWarning(dl > 0);
        if (solved) finishStage(s);
        else saveResume(s);
      }
      refresh();
    },
    [audio, finishStage, refresh, renderer, saveResume],
  );
  useEffect(() => {
    moveRef.current = doMove;
  }, [doMove]);

  const afterHistory = useCallback(
    (s: Session) => {
      renderer.snap();
      setHint(null);
      setWarning(s.deadlocks().length > 0);
      saveResume(s);
      refresh();
    },
    [refresh, renderer, saveResume],
  );

  const undo = useCallback(() => {
    const { session: s, clear: cl } = stateRef.current;
    if (!s || cl || !s.undo()) return;
    audio.play([{ cue: "undo" }]);
    afterHistory(s);
  }, [afterHistory, audio]);

  const redo = useCallback(() => {
    const { session: s, clear: cl } = stateRef.current;
    if (!s || cl || !s.redo()) return;
    audio.play([{ cue: "redo" }]);
    afterHistory(s);
    if (s.solved) finishStage(s);
  }, [afterHistory, audio, finishStage]);

  const restart = useCallback(() => {
    const { session: s } = stateRef.current;
    if (!s) return;
    s.restart();
    setClear(null);
    setMenuOpen(false);
    setHintLevel(0);
    audio.play([{ cue: "restart" }]);
    afterHistory(s);
  }, [afterHistory, audio]);

  const askHint = useCallback(() => {
    const { session: s, clear: cl } = stateRef.current;
    if (!s || cl || s.solved) return;
    audio.play([{ cue: "hint" }]);
    const level = hintLevel;
    setHintLevel(level + 1);
    if (level < STAGES[s.stageIndex].hints.length) {
      setHint(hintFor(s, level));
      return;
    }
    // 탐색은 상태가 많으면 잠시 걸리므로 화면에 "계산 중"을 먼저 보여 준다
    setThinking(true);
    window.setTimeout(() => {
      setHint(hintFor(s, level));
      setThinking(false);
    }, 30);
  }, [audio, hintLevel]);

  const nextStage = useCallback(() => {
    const cl = stateRef.current.clear;
    if (!cl) return;
    if (cl.last) {
      setClear(null);
      setScreen(allCleared(progress) ? "finale" : "select");
      audio.play([{ cue: "gameClear" }]);
      return;
    }
    openStage(cl.stageIndex + 1, true);
  }, [audio, openStage, progress]);

  const toTitle = useCallback(() => {
    setMenuOpen(false);
    setClear(null);
    setScreen("title");
    repeater.clear();
  }, [repeater]);

  const toggleMenu = useCallback(() => {
    if (stateRef.current.screen !== "game" || stateRef.current.clear) return;
    setMenuOpen((open) => {
      audio.pauseMusic(!open);
      return !open;
    });
    repeater.clear();
  }, [audio, repeater]);

  const play = useCallback(() => {
    audio.unlock();
    audio.play([{ cue: "ui" }]);
    // 이어하기: 진행 중이던 스테이지 → 아직 못 깬 첫 스테이지 → (모두 깼으면) 마지막으로 플레이한 스테이지
    const firstOpen = STAGES.findIndex((s) => !progress.records[s.id]);
    const target = progress.resume ? progress.resume.stage : firstOpen >= 0 ? firstOpen : progress.lastStage;
    openStage(isUnlocked(progress, target) ? target : 0);
  }, [audio, openStage, progress]);

  const toggleSound = useCallback(() => {
    const next = !audio.sfxEnabled;
    audio.setSfxEnabled(next);
    setSoundOn(next);
    writeStoredNumber(STORAGE_KEYS.sfx, next ? 1 : 0);
    if (next) audio.play([{ cue: "ui" }]);
  }, [audio]);

  const toggleMusic = useCallback(() => {
    const next = !audio.musicEnabled;
    audio.setMusicEnabled(next);
    setMusicOn(next);
    writeStoredNumber(STORAGE_KEYS.music, next ? 1 : 0);
    const s = stateRef.current.session;
    if (next && s && stateRef.current.screen === "game") audio.startFor(s.stageIndex);
  }, [audio]);

  const cycleVolume = useCallback(() => {
    const next = ((audio.volume % 3) + 1) as 1 | 2 | 3;
    audio.setVolume(next);
    setVolumeState(next);
    writeStoredNumber(STORAGE_KEYS.volume, next);
    audio.play([{ cue: "ui" }]);
  }, [audio]);

  const runCommand = useCallback(
    (cmd: Command) => {
      if (cmd === "undo") undo();
      else if (cmd === "redo") redo();
      else if (cmd === "restart") restart();
      else if (cmd === "menu") toggleMenu();
      else if (cmd === "hint") askHint();
      else if (cmd === "confirm" && stateRef.current.clear) nextStage();
    },
    [askHint, nextStage, redo, restart, toggleMenu, undo],
  );

  // 키보드: 게임 화면이 보이는 동안만 가로챈다 (아래 설명을 읽을 때는 페이지 스크롤 가능)
  const visibleRef = useRef(true);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => (visibleRef.current = entry.isIntersecting), { threshold: 0.3 });
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || isPageControlTarget(e.target) || !visibleRef.current) return;
      if (stateRef.current.screen !== "game") return;
      const dir = KEY_TO_DIR[e.code];
      if (dir !== undefined && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        audio.unlock();
        if (e.repeat) return;
        const d = repeater.press(e.code, dir, now());
        if (d !== null) doMove(d);
        return;
      }
      const cmd = commandFor(e);
      if (!cmd) {
        if (e.code === "Space") e.preventDefault();
        return;
      }
      e.preventDefault();
      // Undo·Redo는 누르고 있으면 운영체제 키 반복으로 빠르게 되감는다
      if (e.repeat && cmd !== "undo" && cmd !== "redo") return;
      audio.unlock();
      runCommand(cmd);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (KEY_TO_DIR[e.code] !== undefined) repeater.release(e.code, now());
    }
    function onHide() {
      repeater.clear();
      if (document.hidden) audio.pauseMusic(true);
      else if (!stateRef.current.menuOpen) audio.pauseMusic(false);
    }
    function onBlur() {
      repeater.clear();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [audio, doMove, repeater, runCommand]);

  /** D-pad: 누른 순간 한 칸, 누르고 있으면 반복 */
  const padPress = useCallback(
    (source: string, dir: Dir) => {
      audio.unlock();
      const d = repeater.press(source, dir, now());
      if (d !== null) doMove(d);
    },
    [audio, doMove, repeater],
  );
  const padRelease = useCallback((source: string) => repeater.release(source, now()), [repeater]);

  return {
    audio,
    screen,
    setScreen,
    session,
    progress,
    menuOpen,
    clear,
    hint,
    thinking,
    warning,
    soundOn,
    musicOn,
    volume,
    play,
    openStage,
    undo,
    redo,
    restart,
    askHint,
    nextStage,
    toTitle,
    toggleMenu,
    toggleSound,
    toggleMusic,
    cycleVolume,
    padPress,
    padRelease,
    saveProgress,
  };
}

export type CargoApi = ReturnType<typeof useCargoBot>;
