import type { SnakeSoundEvent } from "./soundEvents";

/*
 * Snake Classic 배경음악(BGM). 오디오 파일 없이 Web Audio API로 실시간 합성한다.
 * 이 게임을 위해 새로 쓴 16마디 칩튠 루프이며 다른 곡을 옮기거나 샘플링하지 않았다.
 *
 * - 정확한 타이밍: 타이머(setInterval)는 "깨우는" 역할만 하고, 음표 시각은 AudioContext.currentTime 기준으로
 *   LOOKAHEAD초 앞까지 미리 예약한다(look-ahead scheduling).
 * - 재생 단위(run): 재생을 시작할 때마다 전용 GainNode를 만들고, 멈출 때 그 노드를 페이드아웃한 뒤
 *   남은 음표와 함께 연결을 끊는다. 재시작·일시정지·끄기가 겹쳐도 BGM이 두 개 이상 울리지 않는다.
 * - 누수 방지: 끝난 음표는 onended에서 연결을 끊고 목록에서 뺀다.
 * - SSR 안전: AudioContext는 SnakeSound가 사용자 입력 이후 만들어 attach()로 넘겨준다.
 */

/** BGM 음량 = 효과음 전체 음량 × 이 비율 (효과음 대비 약 30%) */
export const MUSIC_TO_SFX_RATIO = 0.3;
export const BASE_BPM = 115;
export const MAX_BPM = 155;

const LOOKAHEAD = 0.12;
const TIMER_MS = 25;
const STEPS_PER_BAR = 16; // 16분음표 단위
const FADE_IN = 0.3;

type Voice = { source: AudioScheduledSourceNode; gain: GainNode; filter?: AudioNode };
type Part = "lead" | "bass" | "arp" | "hat" | "snare";
interface ScoreNote {
  part: Part;
  freq: number;
  /** 길이(16분음표 수) */
  steps: number;
}

// ── 악보 ──
// 16마디 = A(1~4) · A'(5~8) · B(9~12) · C(13~16). C의 마지막 G 마디가 첫 마디 C로 이어진다.
// 멜로디는 8분음표 8칸/마디: 음 이름, "-" = 앞 음 이어서, "." = 쉼표
const MELODY = [
  "E5 G5 . E5 D5 C5 D5 .",
  "E5 A5 . G5 E5 D5 C5 .",
  "C5 D5 E5 . F5 E5 D5 C5",
  "D5 - G4 . B4 D5 G5 .",
  "E5 G5 . E5 D5 C5 D5 E5",
  "A5 . G5 E5 G5 . E5 D5",
  "C5 D5 F5 . E5 D5 C5 A4",
  "B4 - D5 - G5 . . .",
  "A5 . A5 G5 F5 . A5 .",
  "G5 . G5 F5 D5 . B4 D5",
  "E5 G5 B5 . G5 E5 D5 B4",
  "C5 E5 A5 . G5 E5 C5 E5",
  "F5 . E5 F5 A5 . G5 .",
  "D5 . B4 D5 G5 . F5 D5",
  "E5 G5 C6 . G5 E5 C5 D5",
  "D5 . B4 . G4 . B4 D5",
];

const CHORDS = ["C", "Am", "F", "G", "C", "Am", "F", "G", "F", "G", "Em", "Am", "F", "G", "C", "G"] as const;
type Chord = (typeof CHORDS)[number];
const CHORD_NOTES: Record<Chord, { root: string; fifth: string; arp: string[] }> = {
  C: { root: "C3", fifth: "G3", arp: ["C5", "E5", "G5", "E5"] },
  Am: { root: "A2", fifth: "E3", arp: ["A4", "C5", "E5", "C5"] },
  F: { root: "F2", fifth: "C3", arp: ["F4", "A4", "C5", "A4"] },
  G: { root: "G2", fifth: "D3", arp: ["G4", "B4", "D5", "B4"] },
  Em: { root: "E2", fifth: "B2", arp: ["E4", "G4", "B4", "G4"] },
};

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToFreq(name: string): number {
  const match = /^([A-G])(#?)(\d)$/.exec(name);
  if (!match) throw new Error(`Invalid note: ${name}`);
  const midi = 12 * (Number(match[3]) + 1) + SEMITONE[match[1]] + (match[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

/** 악보를 16분음표 칸마다 울릴 음 목록으로 펼친다. */
function buildScore(): ScoreNote[][] {
  const score: ScoreNote[][] = Array.from({ length: MELODY.length * STEPS_PER_BAR }, () => []);
  MELODY.forEach((bar, barIndex) => {
    const base = barIndex * STEPS_PER_BAR;
    const tokens = bar.split(" ");
    if (tokens.length !== 8) throw new Error(`Melody bar ${barIndex + 1} must have 8 slots`);
    tokens.forEach((token, i) => {
      if (token === "-" || token === ".") return;
      let length = 2;
      for (let j = i + 1; j < tokens.length && tokens[j] === "-"; j++) length += 2;
      score[base + i * 2].push({ part: "lead", freq: noteToFreq(token), steps: length });
    });

    // 베이스: 8분음표로 근음 ↔ 한 옥타브 위를 오가며 마지막에 5음
    const chord = CHORD_NOTES[CHORDS[barIndex]];
    const root = noteToFreq(chord.root);
    const pattern = [root, root * 2, root, root * 2, root, root * 2, root, noteToFreq(chord.fifth)];
    pattern.forEach((freq, i) => score[base + i * 2].push({ part: "bass", freq, steps: 1.5 }));

    // 아르페지오: 후반부(B·C)의 3~4박에서만 작게 깔아 긴장감을 더한다.
    if (barIndex >= 8) {
      for (let s = 8; s < 16; s++) score[base + s].push({ part: "arp", freq: noteToFreq(chord.arp[s % 4]), steps: 0.8 });
    }

    // 퍼커션: 8분 뒷박 하이햇, 2·4박 스네어
    for (let s = 2; s < 16; s += 4) score[base + s].push({ part: "hat", freq: 0, steps: 0.3 });
    score[base + 4].push({ part: "snare", freq: 0, steps: 0.7 });
    score[base + 12].push({ part: "snare", freq: 0, steps: 0.7 });
  });
  return score;
}

const SCORE = buildScore();
export const LOOP_STEPS = SCORE.length;

/** 파트별 상대 음량 (효과음과 같은 파형 기준값에 맞춰 MUSIC_TO_SFX_RATIO만큼 작게 들린다) */
const PART_VOLUME: Record<Part, number> = { lead: 0.2, bass: 0.42, arp: 0.07, hat: 0.05, snare: 0.1 };
const PART_WAVE: Partial<Record<Part, OscillatorType>> = { lead: "square", bass: "triangle", arp: "square" };

/** Snake 이동 간격(ms) → BPM. 기본 120ms = 115 BPM, 빨라질수록 비례해서 올라가며 155 BPM에서 멈춘다. */
export function tempoForTick(tickMs: number, baseTickMs = 120): number {
  return Math.min(Math.max(BASE_BPM * (baseTickMs / tickMs), BASE_BPM), MAX_BPM);
}

function releaseVoice(voice: Voice) {
  voice.source.onended = null;
  voice.source.disconnect();
  voice.filter?.disconnect();
  voice.gain.disconnect();
}

export class SnakeMusic {
  enabled: boolean;
  private ctx: AudioContext | null = null;
  private input: AudioNode | null = null;
  private chain: AudioNode[] = [];
  private duckGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  /** 게임이 음악을 원하는 상태(playing)인지. 켜짐(enabled)과 함께 true일 때만 실제로 재생한다. */
  private active = false;
  private run: { gain: GainNode; voices: Set<Voice>; timer: ReturnType<typeof setInterval> } | null = null;
  private step = 0;
  private nextTime = 0;
  private queue: { step: number; time: number }[] = [];
  private bpm = BASE_BPM;
  private targetBpm = BASE_BPM;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  /** SnakeSound가 AudioContext를 만든 뒤 호출한다. */
  attach(ctx: AudioContext, sfxVolume: number) {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    // 과한 저음·날카로운 고음을 깎는 필터 → BGM 전용 음량 → 덕킹 → 출력
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 70;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 3800;
    const volume = ctx.createGain();
    volume.gain.value = sfxVolume * MUSIC_TO_SFX_RATIO;
    const duck = ctx.createGain();
    highpass.connect(lowpass).connect(volume).connect(duck).connect(ctx.destination);
    this.input = highpass;
    this.duckGain = duck;
    this.chain = [highpass, lowpass, volume, duck];
    this.update(0.05);
  }

  // ── 게임·설정에서 부르는 동작 ──

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.update(0.3);
  }

  /** 게임 이벤트에 맞춰 재생 상태를 바꾼다. 먹이 획득 등 나머지 이벤트에는 반응하지 않는다(음악이 끊기지 않음). */
  handleEvents(events: SnakeSoundEvent[]) {
    for (const event of events) {
      if (event === "start") this.start();
      else if (event === "pause") this.setActive(false, 0.12);
      else if (event === "resume") this.setActive(true);
      else if (event === "gameOver" || event === "win") this.stop(0.4);
    }
  }

  /** 처음부터 재생 (게임 시작·재시작). 이전 재생은 곧바로 정리한다. */
  start() {
    if (this.run) this.halt(0.05);
    this.step = 0;
    this.queue = [];
    this.bpm = this.targetBpm;
    this.setActive(true);
  }

  /** 페이드아웃하며 멈추고 처음 위치로 되돌린다 (게임 오버). */
  stop(fade = 0.4) {
    this.active = false;
    if (this.run) this.halt(fade);
    this.step = 0;
    this.queue = [];
  }

  /** 템포 목표값. 실제 템포는 한 박마다 최대 1 BPM씩 따라가 갑자기 바뀌지 않는다. */
  setTempo(bpm: number) {
    this.targetBpm = Math.min(Math.max(bpm, BASE_BPM), MAX_BPM);
  }

  /** 효과음이 잘 들리도록 BGM을 잠깐 낮춘다. */
  duck() {
    const { ctx, duckGain } = this;
    if (!ctx || !duckGain || !this.run) return;
    const now = ctx.currentTime;
    duckGain.gain.cancelScheduledValues(now);
    duckGain.gain.setTargetAtTime(0.45, now, 0.015);
    duckGain.gain.setTargetAtTime(1, now + 0.18, 0.08);
  }

  dispose() {
    if (this.run) this.halt(0.02);
    for (const node of this.chain) node.disconnect();
    this.chain = [];
    this.input = null;
    this.duckGain = null;
    this.ctx = null;
    this.noiseBuffer = null;
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

  // ── 내부 ──

  private setActive(active: boolean, fade = 0.3) {
    this.active = active;
    this.update(fade);
  }

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
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE_IN);
    gain.connect(input);
    this.nextTime = now + 0.05;
    this.queue = [];
    this.run = { gain, voices: new Set(), timer: setInterval(() => this.tick(), TIMER_MS) };
    this.tick();
  }

  /** 페이드아웃 후 이번 재생의 노드를 모두 정리한다. 아직 울리지 않은 음표 위치부터 나중에 이어서 재생한다. */
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
    for (const voice of run.voices) {
      try {
        voice.source.stop(now + fade + 0.02);
      } catch {
        // 이미 멈춘 노드
      }
    }
    setTimeout(() => {
      for (const voice of run.voices) releaseVoice(voice);
      run.voices.clear();
      run.gain.disconnect();
    }, (fade + 0.1) * 1000);
  }

  private stepDuration() {
    return 60 / this.bpm / 4;
  }

  private tick() {
    const { ctx, run } = this;
    if (!ctx || !run) return;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.scheduleStep(this.step, this.nextTime, run);
      this.queue.push({ step: this.step, time: this.nextTime });
      if (this.step % 4 === 0 && this.bpm !== this.targetBpm) {
        this.bpm += Math.min(Math.max(this.targetBpm - this.bpm, -1), 1);
      }
      this.nextTime += this.stepDuration();
      this.step = (this.step + 1) % LOOP_STEPS;
    }
    // 이미 지나간 예약 기록은 버린다.
    while (this.queue.length > 0 && this.queue[0].time < ctx.currentTime - 0.5) this.queue.shift();
  }

  private scheduleStep(step: number, time: number, run: NonNullable<SnakeMusic["run"]>) {
    const unit = this.stepDuration();
    for (const note of SCORE[step]) {
      const length = note.steps * unit * 0.9;
      const wave = PART_WAVE[note.part];
      if (wave) this.tone(run, wave, note.freq, time, length, PART_VOLUME[note.part]);
      else this.noise(run, time, length, PART_VOLUME[note.part], note.part === "hat" ? 7000 : 1800);
    }
  }

  private envelope(gain: GainNode, start: number, length: number, volume: number) {
    // 부드러운 Attack(8ms)과 Release. 0에서 시작해 0 근처로 끝나 반복해도 클릭 노이즈가 없다.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.setValueAtTime(volume, start + Math.max(0.009, length * 0.5));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  }

  private tone(run: NonNullable<SnakeMusic["run"]>, type: OscillatorType, freq: number, start: number, length: number, volume: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    const gain = ctx.createGain();
    this.envelope(gain, start, length, volume);
    osc.connect(gain).connect(run.gain);
    this.track(run, { source: osc, gain }, start, start + length + 0.01);
  }

  private noise(run: NonNullable<SnakeMusic["run"]>, start: number, length: number, volume: number, cutoff: number) {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = cutoff > 4000 ? "highpass" : "bandpass";
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    this.envelope(gain, start, length, volume);
    source.connect(filter).connect(gain).connect(run.gain);
    this.track(run, { source, gain, filter }, start, start + length + 0.01);
  }

  private track(run: NonNullable<SnakeMusic["run"]>, voice: Voice, start: number, stop: number) {
    run.voices.add(voice);
    voice.source.onended = () => {
      if (run.voices.delete(voice)) releaseVoice(voice);
    };
    voice.source.start(start);
    voice.source.stop(stop);
  }
}
