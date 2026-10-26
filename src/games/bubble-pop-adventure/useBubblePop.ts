import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { readStoredNumber, writeStoredNumber } from "@/lib/storage";
import { BubbleAudio } from "./audio/BubbleAudio";
import { CHECKPOINT_AFTER, SCREEN_H, SCREEN_W, STORAGE_KEYS } from "./config";
import { BubbleController } from "./controller";
import { KEY_TO_ACTION } from "./input";
import { createGame } from "./logic/game";
import { BubbleRenderer } from "./render/renderer";

/** 입력 칸이나 링크에 포커스가 있으면 게임 키를 가로채지 않는다 */
function isPageControlTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("a[href]") !== null)
  );
}

function newSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
}

export type Screen = "title" | "howto" | "game";

/**
 * 컨트롤러·렌더러·사운드 생성, 그리기 루프, 키보드 입력, 저장(최고 점수·체크포인트·설정), 탭 전환 시 자동 일시정지.
 * ssr: false로만 로드되므로 초기화 시점에 window·localStorage를 써도 안전하다.
 */
export function useBubblePop(rootRef: RefObject<HTMLElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>, font: string) {
  const [controller] = useState(() => new BubbleController());
  const [audio] = useState(() => new BubbleAudio(readStoredNumber(STORAGE_KEYS.sfx, 0) === 1, readStoredNumber(STORAGE_KEYS.music, 0) === 1));
  const [soundOn, setSoundOn] = useState(audio.sfxEnabled);
  const [musicOn, setMusicOn] = useState(audio.musicEnabled);
  const [shakeOn, setShakeOn] = useState(() => readStoredNumber(STORAGE_KEYS.shake, 1) === 1);
  const [best, setBest] = useState(() => readStoredNumber(STORAGE_KEYS.best, 0));
  const [checkpoint, setCheckpoint] = useState(() => readStoredNumber(STORAGE_KEYS.checkpoint, 0) === 1);
  const [screen, setScreen] = useState<Screen>("title");
  const hud = useSyncExternalStore(controller.subscribe, controller.getHud, controller.getHud);

  const settingsRef = useRef({ shakeOn, best });
  useEffect(() => {
    settingsRef.current = { shakeOn, best };
  }, [shakeOn, best]);

  // 그리기 루프 (타이틀에서는 1번 스테이지를 배경으로 보여 준다)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    const renderer = new BubbleRenderer();
    const backdrop = createGame({ seed: 1 });
    backdrop.phase = "play";
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const events = controller.update(dt);
      const s = controller.state;
      if (s) {
        audio.handle(events, s);
        renderer.handleEvents(events, s);
        for (const e of events) {
          if (e.type === "stageClear" && e.checkpoint) {
            writeStoredNumber(STORAGE_KEYS.checkpoint, 1);
            setCheckpoint(true);
          }
          if (e.type === "gameOver" || e.type === "victory" || e.type === "stageClear") {
            if (s.score > settingsRef.current.best) {
              writeStoredNumber(STORAGE_KEYS.best, s.score);
              setBest(s.score);
            }
          }
        }
        renderer.render(ctx, s, controller.paused ? 0 : dt, { shake: settingsRef.current.shakeOn, font, best: settingsRef.current.best });
      } else {
        backdrop.time += dt;
        renderer.render(ctx, backdrop, dt, { shake: false, font, best: settingsRef.current.best });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [controller, audio, canvasRef, font]);

  useEffect(() => () => audio.dispose(), [audio]);

  // 개발 서버에서만 브라우저 테스트·디버깅용으로 노출한다 (프로덕션 빌드에서는 제거됨)
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as unknown as { __BUBBLE_POP__?: unknown };
    w.__BUBBLE_POP__ = { controller, audio };
    return () => {
      delete w.__BUBBLE_POP__;
    };
  }, [controller, audio]);

  const startGame = useCallback(
    (fromCheckpoint: boolean) => {
      audio.unlock();
      audio.play([{ cue: "start" }]);
      controller.start({ seed: newSeed(), startStage: fromCheckpoint ? CHECKPOINT_AFTER + 1 : 0 });
      // 시작 이벤트(stageStart)는 createGame 안에서 생기므로 음악을 여기서 바로 시작한다
      if (controller.state) audio.startMusic(controller.state, 0.6);
      setScreen("game");
    },
    [audio, controller],
  );

  const toTitle = useCallback(() => {
    controller.quit();
    audio.stopMusic(0.3);
    setScreen("title");
  }, [audio, controller]);

  const togglePause = useCallback(() => {
    if (!controller.state) return;
    const next = !controller.paused;
    controller.setPaused(next);
    audio.setPaused(next);
    audio.play([{ cue: next ? "pause" : "resume" }]);
  }, [audio, controller]);

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
    const s = controller.state;
    if (next && s && (s.phase === "play" || s.phase === "intro")) {
      audio.startMusic(s, 0.1);
      if (controller.paused) audio.setPaused(true);
    }
  }, [audio, controller]);

  const toggleShake = useCallback(() => {
    setShakeOn((v) => {
      writeStoredNumber(STORAGE_KEYS.shake, v ? 0 : 1);
      return !v;
    });
  }, []);

  // 키보드: 게임 화면이 보이는 동안만 가로챈다 (아래 설명을 읽을 때는 페이지 스크롤 가능)
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
      if (event.ctrlKey || event.metaKey || event.altKey || isPageControlTarget(event.target) || !visibleRef.current) return;
      if (screen !== "game" || !controller.state) return;
      const action = KEY_TO_ACTION[event.code];
      if (action) {
        event.preventDefault();
        audio.unlock();
        if (!controller.paused && !event.repeat) input.press(event.code, action);
        return;
      }
      if ((event.code === "KeyP" || event.code === "Escape") && !event.repeat) {
        event.preventDefault();
        togglePause();
        return;
      }
      // ↓는 게임 동작이 없지만 게임 중 페이지가 스크롤되지 않도록 막는다 (←→↑·Space는 위에서 이미 막음)
      if (event.code === "ArrowDown") event.preventDefault();
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (KEY_TO_ACTION[event.code]) input.release(event.code);
    }
    function pauseNow() {
      input.clear();
      const s = controller.state;
      if (s && !controller.paused && s.phase !== "gameover" && s.phase !== "victory") {
        controller.setPaused(true);
        audio.setPaused(true);
      }
    }
    function handleVisibility() {
      if (document.hidden) pauseNow();
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", pauseNow);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", pauseNow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [controller, audio, screen, togglePause]);

  return {
    controller,
    audio,
    hud,
    screen,
    setScreen,
    best,
    checkpoint,
    soundOn,
    musicOn,
    shakeOn,
    startGame,
    toTitle,
    togglePause,
    toggleSound,
    toggleMusic,
    toggleShake,
  };
}

export type BubbleApi = ReturnType<typeof useBubblePop>;
