import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { TIME_SCALES, VIEW } from "./config";
import { ShadowController } from "./controller";
import { KEY_TO_HOLD } from "./input";
import { TEST_SPOTS } from "./level";
import { prepareCanvas, ShadowRenderer, type DebugFlags } from "./render/renderer";

/** 입력 칸·링크에 포커스가 있으면 게임 키를 가로채지 않는다 */
function isPageControlTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("a[href]") !== null)
  );
}

/**
 * 컨트롤러·렌더러 생성, requestAnimationFrame 루프, 키보드 입력, 탭 전환·창 이탈 시 자동 일시정지, 디버그 설정.
 * 브라우저 저장소는 쓰지 않는다(프로토타입). ssr: false로만 로드된다.
 */
export function useShadowGame(rootRef: RefObject<HTMLElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>) {
  const [controller] = useState(() => new ShadowController());
  const [debugOpen, setDebugOpen] = useState(true);
  const [flags, setFlags] = useState<DebugFlags>({ hitbox: false, ledges: false, skeleton: false });
  const flagsRef = useRef(flags);
  useEffect(() => {
    flagsRef.current = flags;
  }, [flags]);

  const hud = useSyncExternalStore(controller.subscribeHud, controller.getHud, controller.getHud);
  const debug = useSyncExternalStore(controller.subscribeDebug, controller.getDebug, controller.getDebug);

  // 그리기 루프
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new ShadowRenderer(controller.world, VIEW.width / VIEW.zoom, VIEW.height / VIEW.zoom);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const realDt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { events, dt } = controller.update(realDt);
      renderer.handleEvents(events, controller.player);
      const ctx = prepareCanvas(canvas, VIEW.width, VIEW.height);
      if (ctx) {
        renderer.render(ctx, {
          player: controller.player,
          x: controller.x,
          y: controller.y,
          anim: controller.animator,
          camera: controller.camera,
          time: controller.time,
          dt,
          debug: flagsRef.current,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [controller, canvasRef]);

  // 개발 서버에서만 브라우저 테스트용으로 노출 (프로덕션 빌드에서 제거)
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as unknown as { __SHADOW_CITADEL__?: unknown };
    w.__SHADOW_CITADEL__ = { controller };
    return () => {
      delete w.__SHADOW_CITADEL__;
    };
  }, [controller]);

  const togglePause = useCallback(() => controller.setPaused(!controller.getHud().paused), [controller]);
  const reset = useCallback((key?: string) => controller.reset(TEST_SPOTS.find((s) => s.key === key)), [controller]);
  const toggleFlag = useCallback((key: keyof DebugFlags) => setFlags((f) => ({ ...f, [key]: !f[key] })), []);
  const cycleTimeScale = useCallback(() => {
    const scales: readonly number[] = TIME_SCALES;
    const i = scales.indexOf(controller.getHud().timeScale);
    controller.setTimeScale(scales[(i + 1) % scales.length]);
  }, [controller]);

  // 게임 화면이 보이는 동안만 게임 키를 가로챈다 (아래 설명을 읽을 때는 페이지 스크롤 가능)
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
      const hold = KEY_TO_HOLD[event.code];
      if (hold) {
        event.preventDefault();
        if (!controller.getHud().paused && !event.repeat) input.press(event.code, hold);
        return;
      }
      if (event.repeat) return;
      const spot = TEST_SPOTS.find((s) => `Digit${s.key}` === event.code);
      const handled = (() => {
        if (event.code === "KeyP" || event.code === "Escape") togglePause();
        else if (event.code === "KeyR") reset();
        else if (spot) reset(spot.key);
        else if (event.code === "Backquote") setDebugOpen((v) => !v);
        else if (event.code === "KeyH") toggleFlag("hitbox");
        else if (event.code === "KeyL") toggleFlag("ledges");
        else if (event.code === "KeyK") toggleFlag("skeleton");
        else if (event.code === "KeyT") cycleTimeScale();
        else return false;
        return true;
      })();
      if (handled) event.preventDefault();
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (KEY_TO_HOLD[event.code]) input.release(event.code);
    }
    function pauseNow() {
      input.clear();
      controller.setPaused(true);
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
  }, [controller, togglePause, reset, toggleFlag, cycleTimeScale]);

  return { controller, hud, debug, debugOpen, setDebugOpen, flags, toggleFlag, togglePause, reset, cycleTimeScale };
}

export type ShadowGameApi = ReturnType<typeof useShadowGame>;
