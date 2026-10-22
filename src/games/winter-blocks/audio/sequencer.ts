import { makeNoiseBuffer } from "@/lib/audio/synth";
import { playNote, Voices } from "./instruments";
import type { Song } from "./songs";

/*
 * 곡 재생기 (look-ahead scheduling).
 * - 타이머는 깨우는 역할만 하고, 음표 시각은 AudioContext.currentTime 기준으로 LOOKAHEAD초 앞까지 미리 예약한다.
 * - 재생 단위(run)마다 전용 GainNode를 만들고, 멈추거나 곡을 바꿀 때 페이드아웃한 뒤 남은 소리와 함께 연결을 끊는다.
 *   그래서 곡 전환·일시정지·끄기가 겹쳐도 같은 곡이 두 번 울리지 않고 노드가 쌓이지 않는다.
 * - 일시정지하면 아직 울리지 않은 칸의 위치를 기억했다가 그 위치부터 이어서 재생한다.
 */

const LOOKAHEAD = 0.15;
const TIMER_MS = 25;

interface Run {
  song: Song;
  gain: GainNode;
  voices: Voices;
  timer: ReturnType<typeof setInterval>;
  step: number;
  nextTime: number;
  queue: { step: number; time: number }[];
}

export class Sequencer {
  enabled: boolean;
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private run: Run | null = null;
  /** 게임이 원하는 곡과 재생 여부 */
  private song: Song | null = null;
  private playing = false;
  private position = 0;
  private startDelay = 0;
  private fadeIn = 0.6;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  attach(ctx: AudioContext, bus: GainNode) {
    this.ctx = ctx;
    this.bus = bus;
    this.update(0.05);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.update(0.5);
  }

  /** 곡을 처음부터 재생한다(이미 같은 곡을 재생 중이어도 처음부터). */
  play(song: Song, delay = 0.1) {
    const wasRunning = this.run !== null;
    if (wasRunning) this.halt(0.6);
    this.song = song;
    this.position = 0;
    this.playing = true;
    // 이전 재생이 줄어드는 동안 잠깐 기다렸다가 새로 시작한다(겹쳐 울리지 않게).
    this.startDelay = wasRunning ? Math.max(delay, 0.45) : delay;
    this.update(0.6);
  }

  /** 곡 선택 변경: 재생 중이면 이전 곡을 페이드아웃하고 새 곡을 처음부터 페이드인한다. */
  select(song: Song) {
    if (this.song?.id === song.id) return;
    const wasRunning = this.run !== null;
    this.song = song;
    this.position = 0;
    if (wasRunning) {
      this.halt(0.8);
      this.startDelay = 0.5;
    }
    this.update(0.8);
  }

  /** 일시정지(false)·재개(true). 위치를 기억해 이어서 재생한다. */
  setActive(active: boolean) {
    this.playing = active;
    this.startDelay = 0;
    this.update(0.15);
  }

  /** 페이드아웃하며 멈추고 처음 위치로 되돌린다. */
  stop(fade = 1.2) {
    this.playing = false;
    if (this.run) this.halt(fade);
    this.position = 0;
  }

  dispose() {
    if (this.run) this.halt(0.02);
    this.ctx = null;
    this.bus = null;
    this.noise = null;
  }

  // 테스트·디버깅용
  get isPlaying() {
    return this.run !== null;
  }
  get currentSong() {
    return this.run?.song.id ?? null;
  }
  get currentStep() {
    return this.run?.step ?? this.position;
  }
  get liveVoices() {
    return this.run?.voices.size ?? 0;
  }

  private update(fade: number) {
    const should = this.enabled && this.playing && this.song !== null && this.ctx !== null;
    if (should && !this.run) this.begin();
    else if (!should && this.run) this.halt(fade);
  }

  private begin() {
    const { ctx, bus, song } = this;
    if (!ctx || !bus || !song) return;
    this.noise ??= makeNoiseBuffer(ctx, 0.5);
    const now = ctx.currentTime;
    const start = now + this.startDelay;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(1, start + this.fadeIn);
    gain.connect(bus);
    this.startDelay = 0;
    this.run = {
      song,
      gain,
      voices: new Voices(),
      timer: setInterval(() => this.tick(), TIMER_MS),
      step: this.position % song.score.length,
      nextTime: start + 0.03,
      queue: [],
    };
    this.tick();
  }

  private halt(fade: number) {
    const run = this.run;
    const ctx = this.ctx;
    if (!run) return;
    this.run = null;
    clearInterval(run.timer);
    if (!ctx) return;
    const now = ctx.currentTime;
    // 아직 울리지 않은 첫 칸부터 나중에 이어서 재생한다.
    const next = run.queue.find((entry) => entry.time > now);
    if (run.song === this.song) this.position = next ? next.step : run.step;
    run.gain.gain.cancelScheduledValues(now);
    run.gain.gain.setValueAtTime(run.gain.gain.value, now);
    run.gain.gain.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => {
      run.voices.stopAll(ctx.currentTime);
      setTimeout(() => run.gain.disconnect(), 120);
    }, fade * 1000 + 30);
  }

  private tick() {
    const { ctx, run, noise } = this;
    if (!ctx || !run || !noise) return;
    const { song } = run;
    const stepLength = 60 / song.bpm / 4;
    while (run.nextTime < ctx.currentTime + LOOKAHEAD) {
      for (const note of song.score[run.step]) {
        playNote({ ctx, out: run.gain, voices: run.voices, noise }, note.instrument, run.nextTime, note.freq, note.steps * stepLength, note.vel);
      }
      run.queue.push({ step: run.step, time: run.nextTime });
      run.nextTime += stepLength;
      // 마지막 칸 다음은 첫 칸: 같은 박자 간격으로 이어져 이음매 없이 반복된다.
      run.step = (run.step + 1) % song.score.length;
    }
    while (run.queue.length > 0 && run.queue[0].time < ctx.currentTime - 0.5) run.queue.shift();
  }
}
