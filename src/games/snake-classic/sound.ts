import { closeAudioContext, resumeAudioContext, suspendAudioContext } from "@/lib/audio/unlock";
import { createAudioContext } from "@/lib/audio/synth";
import { SnakeMusic } from "./music";
import type { SnakeSoundEvent } from "./soundEvents";

/*
 * Snake Classic 8비트 효과음.
 * 오디오 파일 없이 Web Audio API(OscillatorNode·GainNode·짧은 노이즈 버퍼)로 직접 합성한다.
 * 멜로디는 이 게임을 위해 만든 짧은 음계 진행이다.
 *
 * - 브라우저 자동재생 정책: AudioContext는 사용자 입력 핸들러 안의 unlock()에서 처음 만든다.
 * - SSR 안전: 모듈을 불러오는 시점에는 window·AudioContext를 참조하지 않는다.
 * - 겹침 방지: 효과음마다 채널이 있고, 같은 채널에서 새 소리가 나면 이전 소리를 멈춘다
 *   (먹이를 연달아 먹어도 소리가 쌓여 커지지 않는다).
 * - 누수 방지: 재생이 끝난 노드는 onended에서 연결을 끊고 목록에서 뺀다.
 */

type Channel = "score" | "ui" | "end";

interface Voice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  channel: Channel;
}

/** 음 이름 → 주파수(Hz) */
const NOTE = {
  G3: 196.0,
  C4: 261.63,
  E4: 329.63,
  G4: 392.0,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  C6: 1046.5,
  E6: 1318.51,
  G6: 1567.98,
} as const;

/** 전체 음량. 파형별 음량은 아래 각 효과음에서 상대값으로 맞춘다. */
const MASTER_VOLUME = 0.18;
const SQUARE = 0.22;
const TRIANGLE = 0.5;
const NOISE = 0.18;
const ATTACK = 0.005;

const CHANNEL_OF: Record<SnakeSoundEvent, Channel> = {
  start: "ui",
  pause: "ui",
  resume: "ui",
  eat: "score",
  highScore: "score",
  win: "score",
  collision: "end",
  gameOver: "end",
};

export class SnakeSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private voices = new Set<Voice>();
  /** 효과음 켜짐 여부 */
  enabled: boolean;
  /** 배경음악. 같은 AudioContext를 쓰지만 음량·켜짐은 효과음과 따로 관리한다(music.ts). */
  readonly music: SnakeMusic;

  constructor(enabled: boolean, musicEnabled = false) {
    this.enabled = enabled;
    this.music = new SnakeMusic(musicEnabled);
  }

  /** 사용자 입력(클릭·키·터치) 핸들러 안에서 호출한다. 효과음·배경음악이 모두 꺼져 있으면 아무것도 만들지 않는다. */
  unlock() {
    if (!(this.enabled || this.music.enabled) || typeof window === "undefined") return;
    if (!this.ctx) {
      // 공용 생성기: 무음 1샘플 재생(iOS) + 이후 입력·탭 복귀 때 자동으로 다시 깨우도록 등록 (lib/audio/unlock.ts)
      this.ctx = createAudioContext();
      if (!this.ctx) return;
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
      this.music.attach(this.ctx, MASTER_VOLUME);
    }
    resumeAudioContext(this.ctx);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) {
      this.unlock();
    } else {
      // 끄는 즉시 재생 중인 소리도 멈춘다.
      this.stopAll();
      this.suspendIfSilent();
    }
  }

  /** 배경음악 켜기/끄기. 끄면 BGM만 페이드아웃하고 효과음에는 영향이 없다. */
  setMusicEnabled(enabled: boolean) {
    this.music.setEnabled(enabled);
    if (enabled) this.unlock();
    else this.suspendIfSilent();
  }

  /** 효과음·배경음악이 모두 꺼졌을 때만 AudioContext를 잠재운다(BGM 페이드아웃이 끝난 뒤). */
  private suspendIfSilent() {
    if (this.enabled || this.music.enabled) return;
    setTimeout(() => {
      if (!this.enabled && !this.music.enabled && this.ctx) suspendAudioContext(this.ctx);
    }, 350);
  }

  /** 재생 중이거나 예약된 모든 효과음을 멈춘다(재시작·끄기 시). */
  stopAll() {
    for (const voice of this.voices) this.stopVoice(voice);
  }

  /** 컴포넌트가 사라질 때 AudioContext까지 닫는다. */
  dispose() {
    this.music.dispose();
    this.stopAll();
    this.master?.disconnect();
    if (this.ctx) closeAudioContext(this.ctx);
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  play(events: SnakeSoundEvent[]) {
    if (!this.enabled || !this.ctx || events.length === 0) return;
    // 먹이·기록 효과음이 또렷하게 들리도록 BGM을 잠깐 낮춘다.
    if (events.some((event) => event === "eat" || event === "highScore" || event === "win")) this.music.duck();
    // 같은 채널의 이전 소리를 먼저 멈춘 뒤, 이번 효과음들을 순서대로 이어서 예약한다(충돌음 → 게임 오버).
    for (const channel of new Set(events.map((event) => CHANNEL_OF[event]))) this.stopChannel(channel);
    let offset = 0;
    for (const event of events) offset += this.schedule(event, offset);
  }

  /** 효과음을 offset초 뒤에 예약하고, 그 효과음의 길이(다음 효과음이 이어질 시점)를 돌려준다. */
  private schedule(event: SnakeSoundEvent, offset: number): number {
    const channel = CHANNEL_OF[event];
    const note = (freq: number, at: number, length: number, type: OscillatorType = "square", to?: number) =>
      this.tone({ channel, type, from: freq, to: to ?? freq, at: offset + at, length, volume: type === "square" ? SQUARE : TRIANGLE });

    switch (event) {
      case "start":
        // C5 → E5 → G5 상승 (약 0.6초)
        note(NOTE.C5, 0, 0.14);
        note(NOTE.E5, 0.16, 0.14);
        note(NOTE.G5, 0.32, 0.26);
        return 0.6;
      case "eat":
        // 음높이가 빠르게 올라가는 "뿅" (약 0.15초)
        note(620, 0, 0.13, "square", 1240);
        return 0.15;
      case "highScore":
      case "win":
        // 짧은 상승 팡파르 (약 0.7초): 고음 아르페지오 + 부드러운 삼각파 받침
        note(NOTE.G5, 0, 0.09);
        note(NOTE.C6, 0.1, 0.09);
        note(NOTE.E6, 0.2, 0.09);
        note(NOTE.G6, 0.3, 0.38);
        note(NOTE.C5, 0.3, 0.38, "triangle");
        return 0.7;
      case "collision":
        // 낮게 떨어지는 삼각파 + 짧은 노이즈 (약 0.35초)
        note(440, 0, 0.33, "triangle", 70);
        this.noise({ channel, at: offset, length: 0.12 });
        return 0.4;
      case "gameOver":
        // G4 → E4 → C4 → G3 하강 (약 1초)
        note(NOTE.G4, 0, 0.2, "triangle");
        note(NOTE.E4, 0.24, 0.2, "triangle");
        note(NOTE.C4, 0.48, 0.2, "triangle");
        note(NOTE.G3, 0.72, 0.3, "triangle");
        return 1.05;
      case "pause":
        note(330, 0, 0.1);
        return 0.1;
      case "resume":
        note(494, 0, 0.1);
        return 0.1;
    }
  }

  private envelope(gain: GainNode, start: number, length: number, volume: number) {
    // 짧은 Attack → 지수 Decay. 0에서 시작해 0 근처로 끝나므로 클릭 노이즈가 없다.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  }

  private tone(opts: { channel: Channel; type: OscillatorType; from: number; to: number; at: number; length: number; volume: number }) {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const start = ctx.currentTime + opts.at;
    const osc = ctx.createOscillator();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.from, start);
    if (opts.to !== opts.from) osc.frequency.exponentialRampToValueAtTime(opts.to, start + opts.length);
    const gain = ctx.createGain();
    this.envelope(gain, start, opts.length, opts.volume);
    osc.connect(gain).connect(master);
    this.track({ source: osc, gain, channel: opts.channel }, start, start + opts.length + 0.02);
  }

  private noise(opts: { channel: Channel; at: number; length: number }) {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    if (!this.noiseBuffer) {
      // 0.2초 분량의 노이즈 버퍼를 한 번만 만들어 재사용한다.
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    const start = ctx.currentTime + opts.at;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const gain = ctx.createGain();
    this.envelope(gain, start, opts.length, NOISE);
    source.connect(gain).connect(master);
    this.track({ source, gain, channel: opts.channel }, start, start + opts.length + 0.02);
  }

  private track(voice: Voice, start: number, stop: number) {
    this.voices.add(voice);
    voice.source.onended = () => this.release(voice);
    voice.source.start(start);
    voice.source.stop(stop);
  }

  private stopChannel(channel: Channel) {
    for (const voice of this.voices) if (voice.channel === channel) this.stopVoice(voice);
  }

  private stopVoice(voice: Voice) {
    const now = this.ctx?.currentTime ?? 0;
    try {
      // 급히 끊을 때도 짧게 줄여 클릭 노이즈를 막는다.
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + 0.01);
      voice.source.stop(now + 0.015);
    } catch {
      // 아직 시작 전이거나 이미 멈춘 노드
    }
    this.release(voice);
  }

  private release(voice: Voice) {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    // 멈춤 램프가 끝난 뒤 연결을 끊는다.
    setTimeout(() => {
      voice.source.disconnect();
      voice.gain.disconnect();
    }, 50);
  }
}
