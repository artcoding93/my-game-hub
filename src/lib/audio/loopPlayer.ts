import { makeNoiseBuffer, scheduleNoise, scheduleTone, VoiceTracker } from "./synth";

/*
 * 게임 공용 BGM 루프 재생기.
 *
 * - look-ahead scheduling: 타이머는 깨우는 역할만 하고, 음표 시각은 AudioContext.currentTime 기준으로
 *   LOOKAHEAD초 앞까지 미리 예약한다. 타이머가 조금 늦어도 박자가 흔들리지 않는다.
 * - 재생 단위(run): 재생을 시작할 때마다 전용 GainNode를 만들고, 멈출 때 페이드아웃한 뒤 남은 음표와 함께
 *   연결을 끊는다. 재시작·일시정지·끄기가 겹쳐도 BGM이 두 개 이상 울리지 않는다.
 * - 긴장 레이어: layer가 "tension"인 파트는 setTension(true)일 때만 예약하고, 별도 GainNode로 서서히 나타나고 사라진다.
 * - 버스: 입력 → 하이패스(과한 저음 제거) → 로우패스(날카로운 고음 제거) → 음량 → 덕킹 → 출력
 */

export interface LoopNote {
  part: string;
  freq: number;
  /** 길이 (16분음표 수) */
  steps: number;
}

export interface PartSpec {
  wave: OscillatorType | "noise";
  volume: number;
  /** 노이즈 파트 필터 */
  filter?: BiquadFilterType;
  cutoff?: number;
  layer?: "base" | "tension";
}

export interface LoopSpec {
  /** 16분음표 칸마다 울릴 음 목록. 길이가 루프 길이다. */
  score: LoopNote[][];
  parts: Record<string, PartSpec>;
  baseBpm: number;
  maxBpm: number;
}

const LOOKAHEAD = 0.12;
const TIMER_MS = 25;
const FADE_IN = 0.3;

interface Run {
  gain: GainNode;
  tensionGain: GainNode;
  voices: VoiceTracker;
  timer: ReturnType<typeof setInterval>;
}

export class LoopPlayer {
  enabled: boolean;
  private readonly spec: LoopSpec;
  private ctx: AudioContext | null = null;
  private input: AudioNode | null = null;
  private bus: AudioNode[] = [];
  private duckGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** 게임이 음악을 원하는 상태인지. enabled와 함께 true일 때만 실제로 재생한다. */
  private active = false;
  private run: Run | null = null;
  private step = 0;
  private nextTime = 0;
  private startDelay = 0;
  private queue: { step: number; time: number }[] = [];
  private bpm: number;
  private targetBpm: number;
  private tension = false;

  constructor(spec: LoopSpec, enabled: boolean) {
    this.spec = spec;
    this.enabled = enabled;
    this.bpm = spec.baseBpm;
    this.targetBpm = spec.baseBpm;
  }

  attach(ctx: AudioContext, volume: number) {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 70;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 3800;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    const duck = ctx.createGain();
    highpass.connect(lowpass).connect(gain).connect(duck).connect(ctx.destination);
    this.input = highpass;
    this.duckGain = duck;
    this.bus = [highpass, lowpass, gain, duck];
    this.update(0.05);
  }

  setEnabled(enabled: boolean, fade = 0.3) {
    this.enabled = enabled;
    this.update(fade);
  }

  /** 처음부터 재생. 이전 재생은 곧바로 정리한다. delay초 뒤에 첫 음이 시작된다. */
  start(delay = 0) {
    if (this.run) this.halt(0.05);
    this.step = 0;
    this.queue = [];
    this.bpm = this.targetBpm;
    this.startDelay = delay;
    this.setActive(true);
  }

  /** 일시정지(false)·재개(true). 위치를 기억해 이어서 재생한다. */
  setActive(active: boolean, fade = 0.12) {
    this.active = active;
    this.update(fade);
  }

  /** 페이드아웃하며 멈추고 처음 위치로 되돌린다. */
  stop(fade = 0.4) {
    this.active = false;
    if (this.run) this.halt(fade);
    this.step = 0;
    this.queue = [];
  }

  /** 목표 템포. 실제 템포는 한 박마다 최대 1 BPM씩 따라가 갑자기 바뀌지 않는다. */
  setTempo(bpm: number, immediate = false) {
    this.targetBpm = Math.min(Math.max(bpm, this.spec.baseBpm), this.spec.maxBpm);
    if (immediate) this.bpm = this.targetBpm;
  }

  setTension(on: boolean) {
    if (this.tension === on) return;
    this.tension = on;
    const { ctx, run } = this;
    if (!ctx || !run) return;
    const now = ctx.currentTime;
    run.tensionGain.gain.cancelScheduledValues(now);
    run.tensionGain.gain.setTargetAtTime(on ? 1 : 0, now, on ? 0.2 : 0.4);
  }

  /** 효과음이 잘 들리도록 BGM을 잠깐 낮춘다. */
  duck(level = 0.45, hold = 0.18) {
    const { ctx, duckGain } = this;
    if (!ctx || !duckGain || !this.run) return;
    const now = ctx.currentTime;
    duckGain.gain.cancelScheduledValues(now);
    duckGain.gain.setTargetAtTime(level, now, 0.015);
    duckGain.gain.setTargetAtTime(1, now + hold, 0.08);
  }

  dispose() {
    if (this.run) this.halt(0.02);
    for (const node of this.bus) node.disconnect();
    this.bus = [];
    this.input = null;
    this.duckGain = null;
    this.ctx = null;
    this.noise = null;
  }

  // 테스트·디버깅용 읽기 전용 정보
  get isPlaying() {
    return this.run !== null;
  }
  get position() {
    return this.step;
  }
  get liveVoices() {
    return this.run?.voices.size ?? 0;
  }
  get currentBpm() {
    return this.bpm;
  }
  get tensionOn() {
    return this.tension;
  }

  // ── 내부 ──

  private update(fade: number) {
    const shouldPlay = this.enabled && this.active && this.ctx !== null;
    if (shouldPlay && !this.run) this.begin();
    else if (!shouldPlay && this.run) this.halt(fade);
  }

  private begin() {
    const { ctx, input } = this;
    if (!ctx || !input) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const fadeStart = now + this.startDelay;
    gain.gain.setValueAtTime(0, now);
    gain.gain.setValueAtTime(0, fadeStart);
    gain.gain.linearRampToValueAtTime(1, fadeStart + FADE_IN);
    gain.connect(input);
    const tensionGain = ctx.createGain();
    tensionGain.gain.value = this.tension ? 1 : 0;
    tensionGain.connect(gain);
    this.nextTime = fadeStart + 0.03;
    this.startDelay = 0;
    this.queue = [];
    this.run = { gain, tensionGain, voices: new VoiceTracker(), timer: setInterval(() => this.tick(), TIMER_MS) };
    this.tick();
  }

  /** 페이드아웃 후 이번 재생의 노드를 정리한다. 아직 울리지 않은 음표 위치부터 나중에 이어서 재생한다. */
  private halt(fade: number) {
    const run = this.run;
    const ctx = this.ctx;
    if (!run) return;
    this.run = null;
    clearInterval(run.timer);
    if (!ctx) return;

    const now = ctx.currentTime;
    const firstUnplayed = this.queue.find((entry) => entry.time > now);
    if (firstUnplayed) this.step = firstUnplayed.step;
    this.queue = [];

    run.gain.gain.cancelScheduledValues(now);
    run.gain.gain.setValueAtTime(run.gain.gain.value, now);
    run.gain.gain.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => {
      run.voices.stopAll(ctx.currentTime);
      setTimeout(() => {
        run.tensionGain.disconnect();
        run.gain.disconnect();
      }, 100);
    }, fade * 1000 + 20);
  }

  private stepDuration() {
    return 60 / this.bpm / 4;
  }

  private tick() {
    const { ctx, run } = this;
    if (!ctx || !run) return;
    const length = this.spec.score.length;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.scheduleStep(run, this.step, this.nextTime);
      this.queue.push({ step: this.step, time: this.nextTime });
      if (this.step % 4 === 0 && this.bpm !== this.targetBpm) {
        this.bpm += Math.min(Math.max(this.targetBpm - this.bpm, -1), 1);
      }
      this.nextTime += this.stepDuration();
      this.step = (this.step + 1) % length;
    }
    while (this.queue.length > 0 && this.queue[0].time < ctx.currentTime - 0.5) this.queue.shift();
  }

  private scheduleStep(run: Run, step: number, time: number) {
    const ctx = this.ctx!;
    const unit = this.stepDuration();
    for (const note of this.spec.score[step]) {
      const part = this.spec.parts[note.part];
      if (!part) continue;
      const tensionPart = part.layer === "tension";
      if (tensionPart && !this.tension) continue;
      const destination = tensionPart ? run.tensionGain : run.gain;
      const length = note.steps * unit * 0.9;
      if (part.wave === "noise") {
        this.noise ??= makeNoiseBuffer(ctx, 0.1);
        scheduleNoise(ctx, destination, run.voices, {
          buffer: this.noise,
          start: time,
          length,
          volume: part.volume,
          filter: part.filter ?? "highpass",
          cutoff: part.cutoff ?? 6000,
          channel: note.part,
        });
      } else {
        scheduleTone(ctx, destination, run.voices, {
          type: part.wave,
          from: note.freq,
          start: time,
          length,
          volume: part.volume,
          channel: note.part,
        });
      }
    }
  }
}

/**
 * 8분음표 문자열 악보를 16분음표 칸 배열로 펼치는 도우미.
 * 마디마다 8칸: 음 이름, "-" = 앞 음 이어서, "." = 쉼표
 */
export function parseEighthNotes(
  bars: readonly string[],
  part: string,
  toFreq: (name: string) => number,
  stepsPerBar = 16,
): LoopNote[][] {
  const score: LoopNote[][] = Array.from({ length: bars.length * stepsPerBar }, () => []);
  bars.forEach((bar, barIndex) => {
    const tokens = bar.split(" ");
    if (tokens.length !== 8) throw new Error(`Bar ${barIndex + 1} of ${part} must have 8 slots`);
    tokens.forEach((token, i) => {
      if (token === "-" || token === ".") return;
      let length = 2;
      for (let j = i + 1; j < tokens.length && tokens[j] === "-"; j++) length += 2;
      score[barIndex * stepsPerBar + i * 2].push({ part, freq: toFreq(token), steps: length });
    });
  });
  return score;
}
