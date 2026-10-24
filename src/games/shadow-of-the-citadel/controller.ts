import { Animator, type AnimKey } from "./animation/animator";
import { Camera } from "./camera";
import { FIXED_DT, MAX_STEPS_PER_FRAME, TILE } from "./config";
import { InputState } from "./input";
import { TEST_SPOTS, type TestSpot } from "./level";
import { createPlayer, describeMode, resetPlayer, stepPlayer, type Player, type PlayerEvent } from "./logic/player";
import { createWorld, type World } from "./logic/world";

/** 디버그 패널 표시값 (초당 10번 갱신) */
export interface DebugInfo {
  state: string;
  anim: AnimKey;
  vx: number;
  vy: number;
  grounded: boolean;
  ledge: boolean;
  fps: number;
  climb: number;
}

export interface HudState {
  paused: boolean;
  timeScale: number;
  spot: string;
}

/**
 * 물리(logic/)·애니메이션·카메라를 묶는 연결 지점. DOM에 의존하지 않는다.
 * 물리는 고정 1/120초 스텝으로 진행하고, 화면은 마지막 두 스텝 사이를 보간해 그린다.
 * 디버그 재생 속도(timeScale)는 물리와 애니메이션에 똑같이 적용되어 둘이 어긋나지 않는다.
 */
export class ShadowController {
  readonly world: World = createWorld();
  readonly player: Player;
  readonly animator = new Animator();
  readonly camera: Camera;
  readonly input = new InputState();
  /** 보간된 발 위치 */
  x = 0;
  y = 0;
  /** 시간 배율이 적용된 누적 시간 */
  time = 0;
  private accumulator = 0;
  private prevX = 0;
  private prevY = 0;
  private hud: HudState;
  private debug: DebugInfo;
  private hudListeners = new Set<() => void>();
  private debugListeners = new Set<() => void>();
  private debugTimer = 0;
  private fps = 60;
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor() {
    const spot = TEST_SPOTS[0];
    this.player = createPlayer(spot);
    this.camera = new Camera(this.world.cols * TILE, this.world.rows * TILE);
    this.animator.reset(this.player);
    this.camera.snap(this.player);
    this.x = this.prevX = this.player.x;
    this.y = this.prevY = this.player.y;
    this.hud = { paused: false, timeScale: 1, spot: spot.key };
    this.debug = this.computeDebug();
  }

  /** 한 화면 프레임 진행. realDt = 실제 경과 시간(초). 이번 프레임의 물리 이벤트를 돌려준다 */
  update(realDt: number): { events: PlayerEvent[]; dt: number } {
    this.countFps(realDt);
    if (this.hud.paused) return { events: [], dt: 0 };
    const dt = Math.min(realDt, 0.1) * this.hud.timeScale;
    const p = this.player;
    const events: PlayerEvent[] = [];
    this.accumulator = Math.min(this.accumulator + dt, FIXED_DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= FIXED_DT) {
      this.prevX = p.x;
      this.prevY = p.y;
      const teleports = p.teleports;
      stepPlayer(p, this.input.take(), this.world, FIXED_DT, events);
      if (p.teleports !== teleports) {
        this.prevX = p.x;
        this.prevY = p.y;
      }
      this.accumulator -= FIXED_DT;
    }
    const alpha = this.accumulator / FIXED_DT;
    this.x = this.prevX + (p.x - this.prevX) * alpha;
    this.y = this.prevY + (p.y - this.prevY) * alpha;
    this.time += dt;

    this.animator.handle(events, p);
    this.animator.update(dt, p);
    if (events.some((e) => e.type === "respawn")) this.camera.snap(p);
    else this.camera.update(dt, p, this.x, this.y);

    this.debugTimer += realDt;
    if (this.debugTimer >= 0.1) {
      this.debugTimer = 0;
      this.debug = this.computeDebug();
      for (const l of this.debugListeners) l();
    }
    return { events, dt };
  }

  /** 테스트 위치로 즉시 이동 (지정하지 않으면 현재 테스트 위치) */
  reset(spot?: TestSpot) {
    resetPlayer(this.player, spot ?? this.player.spot);
    this.x = this.prevX = this.player.x;
    this.y = this.prevY = this.player.y;
    this.accumulator = 0;
    this.input.clear();
    this.animator.reset(this.player);
    this.camera.snap(this.player);
    this.setHud({ spot: this.player.spot.key });
  }

  setPaused(paused: boolean) {
    if (paused === this.hud.paused) return;
    this.input.clear();
    this.accumulator = 0;
    this.setHud({ paused });
  }

  setTimeScale(timeScale: number) {
    this.setHud({ timeScale });
  }

  getHud = () => this.hud;
  getDebug = () => this.debug;

  subscribeHud = (listener: () => void) => {
    this.hudListeners.add(listener);
    return () => this.hudListeners.delete(listener);
  };

  subscribeDebug = (listener: () => void) => {
    this.debugListeners.add(listener);
    return () => this.debugListeners.delete(listener);
  };

  private setHud(patch: Partial<HudState>) {
    this.hud = { ...this.hud, ...patch };
    for (const l of this.hudListeners) l();
  }

  private countFps(realDt: number) {
    this.fpsFrames++;
    this.fpsTime += realDt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  }

  private computeDebug(): DebugInfo {
    const p = this.player;
    return {
      state: describeMode(p),
      anim: this.animator.key,
      vx: p.vx,
      vy: p.vy,
      grounded: p.grounded && p.mode !== "air",
      ledge: p.probe !== null,
      fps: this.fps,
      climb: p.mode === "climb" ? p.climbT : 0,
    };
  }
}
