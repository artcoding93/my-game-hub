/*
 * 모든 게임 공용 오디오 깨우기 (iOS Safari·모바일 브라우저 대응). 게임별 사운드 특성·설정에는 관여하지 않는다.
 *
 * 배경:
 *  - 브라우저는 "사용자 활성화"로 인정하는 입력 안에서만 AudioContext를 재생 상태(running)로 바꿔 준다.
 *    HTML 표준·iOS Safari에서 인정되는 입력은 keydown, mousedown, pointerup, touchend, click이며,
 *    터치의 pointerdown·touchstart는 인정되지 않는다. 그래서 pointerdown에서만 unlock()하면 iPhone에서는 소리가 나지 않을 수 있다.
 *  - iOS는 탭 전환·화면 잠금·전화 뒤 컨텍스트를 "interrupted"/"suspended"로 바꿔 두며, 다음 사용자 입력에서 다시 깨워야 한다.
 *  - iOS의 Web Audio는 기본 설정에서 무음 스위치를 따른다. Safari 16.4+의 Audio Session API(navigator.audioSession)가 있으면
 *    사용자가 소리를 켠 경우에만 "playback"으로 지정한다(지원하지 않는 브라우저·버전에서는 그대로 둔다: 정책을 우회하지 않는다).
 *
 * 동작:
 *  - createAudioContext(synth.ts)로 만든 컨텍스트를 자동으로 등록한다.
 *  - 활성화 입력마다(캡처 단계, 화면 어디를 눌러도) 게임이 원하는데 멈춰 있는 컨텍스트를 resume하고 무음 1샘플을 재생한다.
 *  - 탭 복귀(visibilitychange)·뒤로 가기 캐시 복원(pageshow) 때도 resume을 시도한다(입력이 필요하면 다음 탭에서 깨어난다).
 *  - 게임이 원하는데 0.9초 넘게 깨어나지 않으면 "막힘" 상태를 알린다 → AudioResumeButton이 직접 켜는 버튼을 보여 준다.
 */

interface Entry {
  ctx: AudioContext;
  /** 게임이 재생 상태를 원하는지 (효과음·BGM이 모두 꺼져 일부러 멈춘 경우 false) */
  wanted: boolean;
  /** running이 아닌 상태가 시작된 시각 */
  stalledSince: number | null;
}

const BLOCKED_AFTER_MS = 900;
const ACTIVATION_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;

const entries = new Map<AudioContext, Entry>();
const listeners = new Set<() => void>();
let blocked = false;
let installed = false;
let timer: ReturnType<typeof setInterval> | null = null;

type AudioSessionLike = { type: string };

function audioSession(): AudioSessionLike | null {
  if (typeof navigator === "undefined") return null;
  const session = (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession;
  return session ?? null;
}

function setSessionType(type: "playback" | "auto") {
  const session = audioSession();
  if (!session || session.type === type) return;
  try {
    session.type = type;
  } catch {
    // 지원하지 않는 값이면 브라우저 기본 동작을 따른다
  }
}

function playSilent(ctx: AudioContext) {
  try {
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination);
    source.onended = () => source.disconnect();
    source.start();
  } catch {
    // 닫힌 컨텍스트 등
  }
}

function wake(entry: Entry) {
  const { ctx } = entry;
  const state = ctx.state as string;
  if (state === "closed") {
    entries.delete(ctx);
    return;
  }
  if (state === "running") return;
  ctx.resume().catch(() => {
    // 사용자 입력 밖에서는 거부될 수 있다. 다음 입력에서 다시 시도한다.
  });
  playSilent(ctx);
}

function refresh() {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const hidden = typeof document !== "undefined" && document.hidden;
  let anyWanted = false;
  let stalled = false;
  for (const [ctx, entry] of entries) {
    if ((ctx.state as string) === "closed") {
      entries.delete(ctx);
      continue;
    }
    if (!entry.wanted) {
      entry.stalledSince = null;
      continue;
    }
    anyWanted = true;
    if (ctx.state === "running") entry.stalledSince = null;
    else {
      entry.stalledSince ??= now;
      if (!hidden && now - entry.stalledSince >= BLOCKED_AFTER_MS) stalled = true;
    }
  }
  if (!anyWanted) setSessionType("auto");
  if (stalled !== blocked) {
    blocked = stalled;
    for (const listener of listeners) listener();
  }
  if (entries.size === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}

function ensureTimer() {
  if (!timer && typeof window !== "undefined") timer = setInterval(refresh, 300);
}

function install() {
  // 테스트 환경처럼 이벤트를 받을 수 없는 window·document면 등록하지 않는다
  if (installed || typeof window === "undefined" || typeof window.addEventListener !== "function" || typeof document === "undefined") return;
  installed = true;
  const onGesture = () => resumeAllAudio();
  for (const type of ACTIVATION_EVENTS) window.addEventListener(type, onGesture, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resumeAllAudio();
    refresh();
  });
  // iOS Safari의 뒤로/앞으로 가기 캐시(bfcache)에서 복원될 때
  window.addEventListener("pageshow", () => resumeAllAudio());
}

/** 새 AudioContext를 등록한다 (createAudioContext가 자동으로 호출) */
export function trackAudioContext(ctx: AudioContext) {
  if (!entries.has(ctx)) {
    entries.set(ctx, { ctx, wanted: true, stalledSince: null });
    ctx.addEventListener?.("statechange", refresh);
  }
  install();
  ensureTimer();
  setSessionType("playback");
  refresh();
}

/** 게임이 소리를 내려 할 때 (unlock): 멈춰 있으면 깨운다. 실패해도 예외를 던지지 않는다 */
export function resumeAudioContext(ctx: AudioContext) {
  if (!entries.has(ctx)) trackAudioContext(ctx);
  const entry = entries.get(ctx);
  if (!entry) return;
  entry.wanted = true;
  setSessionType("playback");
  wake(entry);
  refresh();
}

/** 효과음·BGM이 모두 꺼져 일부러 멈출 때 ("막힘"으로 보지 않는다) */
export function suspendAudioContext(ctx: AudioContext) {
  const entry = entries.get(ctx);
  if (entry) entry.wanted = false;
  if (ctx.state === "running") ctx.suspend().catch(() => {});
  refresh();
}

/** 게임 화면을 떠날 때: 등록을 풀고 닫는다 */
export function closeAudioContext(ctx: AudioContext) {
  entries.delete(ctx);
  ctx.removeEventListener?.("statechange", refresh);
  if ((ctx.state as string) !== "closed") ctx.close().catch(() => {});
  refresh();
}

/** 사용자 입력 안에서 호출: 원하는 상태인 모든 컨텍스트를 깨운다 */
export function resumeAllAudio() {
  for (const entry of entries.values()) if (entry.wanted) wake(entry);
  refresh();
}

/** 게임이 소리를 원하는데 브라우저가 계속 막고 있는지 */
export function isAudioBlocked() {
  return blocked;
}

export function subscribeAudioBlocked(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 테스트 전용: 등록 상태 확인 */
export function trackedAudioContextCount() {
  return entries.size;
}
