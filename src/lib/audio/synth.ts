/*
 * 게임 공용 8비트 사운드 합성 유틸리티 (Web Audio API).
 * 오디오 파일 없이 OscillatorNode·GainNode·노이즈 버퍼로 소리를 만든다.
 *
 * - SSR 안전: 모듈을 불러오는 시점에는 window·AudioContext를 참조하지 않는다.
 * - 클릭 노이즈 방지: 모든 소리는 0에서 짧게 올라가(Attack) 0 근처로 줄어드는(Decay) 엔벨로프를 쓴다.
 * - 누수 방지: 예약한 소리는 VoiceTracker에 기록하고, 끝나거나 멈추면 연결을 끊는다.
 */

import { trackAudioContext } from "./unlock";

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4", "G#5" 같은 음 이름을 주파수(Hz)로 바꾼다. */
export function noteToFreq(name: string): number {
  const match = /^([A-G])(#?)(\d)$/.exec(name);
  if (!match) throw new Error(`Invalid note: ${name}`);
  const midi = 12 * (Number(match[3]) + 1) + SEMITONE[match[1]] + (match[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * 사용자 입력 핸들러 안에서 AudioContext를 만든다. 지원하지 않거나 서버 환경이면 null.
 * iOS Safari는 사용자 입력 안에서 실제로 소리를 한 번 재생해야 오디오가 풀리므로 무음 1샘플을 재생한다.
 */
export function createAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  const ctx = new AudioCtor();
  const silent = ctx.createBufferSource();
  silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  silent.connect(ctx.destination);
  silent.onended = () => silent.disconnect();
  silent.start();
  // iOS: 이후 사용자 입력·탭 복귀 때 자동으로 다시 깨우도록 등록한다 (unlock.ts)
  trackAudioContext(ctx);
  return ctx;
}

export function makeNoiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** 0 → volume(Attack) → 0 근처(Decay). 소리 길이의 절반까지는 음량을 유지한다. */
export function applyEnvelope(param: AudioParam, start: number, length: number, volume: number, attack = 0.005) {
  param.setValueAtTime(0, start);
  param.linearRampToValueAtTime(volume, start + attack);
  param.setValueAtTime(volume, start + Math.max(attack + 0.001, length * 0.4));
  param.exponentialRampToValueAtTime(0.0001, start + length);
}

export interface Voice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  filter?: AudioNode;
  /** 같은 채널의 소리끼리 서로 끊을 때 쓰는 이름 */
  channel: string;
}

/** 예약된 소리 목록. 끝난 소리는 스스로 빠지고, 필요하면 채널 단위·전체로 즉시 멈출 수 있다. */
export class VoiceTracker {
  private voices = new Set<Voice>();

  get size() {
    return this.voices.size;
  }

  track(voice: Voice, start: number, stop: number) {
    this.voices.add(voice);
    voice.source.onended = () => this.release(voice);
    voice.source.start(start);
    voice.source.stop(stop);
  }

  stopChannel(channel: string, now: number) {
    for (const voice of this.voices) if (voice.channel === channel) this.stop(voice, now);
  }

  stopAll(now: number) {
    for (const voice of this.voices) this.stop(voice, now);
  }

  private stop(voice: Voice, now: number) {
    try {
      // 급히 끊을 때도 10ms 동안 줄여 클릭 노이즈를 막는다.
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + 0.01);
      voice.source.stop(now + 0.015);
    } catch {
      // 이미 멈춘 노드
    }
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    setTimeout(() => disconnectVoice(voice), 50);
  }

  private release(voice: Voice) {
    if (this.voices.delete(voice)) disconnectVoice(voice);
  }
}

function disconnectVoice(voice: Voice) {
  voice.source.onended = null;
  voice.source.disconnect();
  voice.filter?.disconnect();
  voice.gain.disconnect();
}

export interface ToneOptions {
  type: OscillatorType;
  from: number;
  /** 끝 주파수. 생략하면 음높이 고정 */
  to?: number;
  start: number;
  length: number;
  volume: number;
  channel: string;
}

export function scheduleTone(ctx: BaseAudioContext, destination: AudioNode, tracker: VoiceTracker, opts: ToneOptions) {
  const osc = ctx.createOscillator();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.from, opts.start);
  if (opts.to !== undefined && opts.to !== opts.from) {
    osc.frequency.exponentialRampToValueAtTime(opts.to, opts.start + opts.length);
  }
  const gain = ctx.createGain();
  applyEnvelope(gain.gain, opts.start, opts.length, opts.volume);
  osc.connect(gain).connect(destination);
  tracker.track({ source: osc, gain, channel: opts.channel }, opts.start, opts.start + opts.length + 0.02);
}

export interface NoiseOptions {
  buffer: AudioBuffer;
  start: number;
  length: number;
  volume: number;
  filter: BiquadFilterType;
  cutoff: number;
  channel: string;
}

export function scheduleNoise(ctx: BaseAudioContext, destination: AudioNode, tracker: VoiceTracker, opts: NoiseOptions) {
  const source = ctx.createBufferSource();
  source.buffer = opts.buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filter;
  filter.frequency.value = opts.cutoff;
  const gain = ctx.createGain();
  applyEnvelope(gain.gain, opts.start, opts.length, opts.volume, 0.003);
  source.connect(filter).connect(gain).connect(destination);
  tracker.track({ source, gain, filter, channel: opts.channel }, opts.start, opts.start + opts.length + 0.02);
}
