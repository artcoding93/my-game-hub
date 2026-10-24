import { closeAudioContext, resumeAudioContext, suspendAudioContext } from "@/lib/audio/unlock";
import { createAudioContext } from "@/lib/audio/synth";
import { StarVanguardMusic, type MusicAction } from "./music";
import type { GameEvent, GameState } from "./types";

/** 효과음 전체 음량. BGM은 이 값의 27%로 재생한다. */
const SFX_VOLUME = 0.22;
export const MUSIC_RATIO = 0.27;
/** 이 효과음이 날 때 BGM을 잠깐 낮춘다. 레이저 발사는 너무 잦아 제외한다. */
const DUCK_ON: ReadonlySet<GameEvent["type"]> = new Set(["playerHit", "shieldBlocked", "powerUpCollected", "gameOver"]);

/**
 * 레트로 효과음. 오디오 파일 없이 Web Audio API로 그때그때 합성한다(외부 음원·샘플 미사용).
 * 브라우저 자동재생 정책 때문에 AudioContext는 사용자 입력(클릭·키 입력) 안에서 unlock()으로 처음 만든다.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastShotAt = 0;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  /** 효과음 켜짐 여부 */
  enabled: boolean;
  /** 배경음악(music.ts). 같은 AudioContext를 쓰지만 음량·켜짐은 효과음과 따로 관리한다. */
  readonly music: StarVanguardMusic;

  constructor(enabled: boolean, musicEnabled = false) {
    this.enabled = enabled;
    this.music = new StarVanguardMusic(musicEnabled);
  }

  /** 사용자 입력 핸들러 안에서 호출해야 한다. 효과음·BGM이 모두 꺼져 있으면 아무것도 만들지 않는다. */
  unlock() {
    if ((!this.enabled && !this.music.enabled) || typeof window === "undefined") return;
    if (!this.ctx) {
      // 공용 생성기: 무음 1샘플 재생(iOS) + 이후 입력·탭 복귀 때 자동으로 다시 깨우도록 등록 (lib/audio/unlock.ts)
      this.ctx = createAudioContext();
      if (!this.ctx) return;
      this.master = this.ctx.createGain();
      this.master.gain.value = SFX_VOLUME;
      this.master.connect(this.ctx.destination);
      this.music.attach(this.ctx, SFX_VOLUME * MUSIC_RATIO);
    }
    // iOS Safari는 전화·백그라운드 전환 뒤 "interrupted" 상태로 남을 수 있으므로 suspended 외에도 다시 깨운다(실패는 조용히 무시).
    resumeAudioContext(this.ctx);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) this.unlock();
    else this.suspendIfSilent();
  }

  /** 배경음악 켜기/끄기. 끄면 BGM만 페이드아웃하고 효과음에는 영향이 없다. */
  setMusicEnabled(enabled: boolean) {
    this.music.setEnabled(enabled);
    if (enabled) this.unlock();
    else this.suspendIfSilent();
  }

  /** 게임 이벤트·조작에 맞춰 BGM을 전환한다(효과음 재생과 별개). */
  handleMusic(events: GameEvent[], state: GameState, action?: MusicAction) {
    this.music.handle(events, state, action);
  }

  /** 효과음·BGM이 모두 꺼졌을 때만 AudioContext를 잠재운다(BGM 페이드아웃이 끝난 뒤). */
  private suspendIfSilent() {
    if (this.enabled || this.music.enabled) return;
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      if (!this.enabled && !this.music.enabled && this.ctx) suspendAudioContext(this.ctx);
    }, 350);
  }

  dispose() {
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.music.dispose();
    if (this.ctx) closeAudioContext(this.ctx);
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  play(events: GameEvent[]) {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    if (events.some((event) => DUCK_ON.has(event.type) || (event.type === "enemyKilled" && event.kind === "core"))) {
      this.music.duck();
    }
    for (const event of events) {
      switch (event.type) {
        case "playerShot": {
          // 연사 중에는 효과음이 겹쳐 시끄럽지 않도록 간격을 둔다.
          const now = this.ctx.currentTime;
          if (now - this.lastShotAt < 0.07) break;
          this.lastShotAt = now;
          this.tone({ from: 1400, to: 520, duration: 0.07, type: "square", volume: 0.12 });
          break;
        }
        case "enemyHit":
          this.tone({ from: 320, to: 180, duration: 0.05, type: "square", volume: 0.18 });
          break;
        case "enemyKilled":
          if (event.kind === "core") {
            this.noise({ duration: 1.1, volume: 0.6, filter: 900 });
            this.tone({ from: 220, to: 30, duration: 1, type: "sawtooth", volume: 0.3 });
          } else {
            this.noise({ duration: 0.28, volume: 0.35, filter: event.kind === "sentinel" ? 1200 : 2400 });
            this.tone({ from: 480, to: 70, duration: 0.18, type: "triangle", volume: 0.25 });
          }
          break;
        case "enemyDived":
          this.tone({ from: 1100, to: 420, duration: 0.35, type: "triangle", volume: 0.06 });
          break;
        case "playerHit":
          this.noise({ duration: 0.7, volume: 0.55, filter: 1400 });
          this.tone({ from: 700, to: 50, duration: 0.7, type: "sawtooth", volume: 0.3 });
          break;
        case "shieldBlocked":
          this.tone({ from: 600, to: 1500, duration: 0.18, type: "triangle", volume: 0.3 });
          break;
        case "powerUpSpawned":
          this.tone({ from: 880, to: 990, duration: 0.08, type: "sine", volume: 0.15 });
          break;
        case "powerUpCollected":
          this.arpeggio([523, 659, 784, 1047], 0.06, "square", 0.14);
          break;
        case "waveStarted":
          if (event.boss) {
            // 보스 등장 경보: 두 음을 번갈아 울린다.
            for (let i = 0; i < 4; i++) {
              this.tone({ from: 220, to: 220, duration: 0.16, type: "sawtooth", volume: 0.18, delay: i * 0.36 });
              this.tone({ from: 330, to: 330, duration: 0.16, type: "sawtooth", volume: 0.18, delay: i * 0.36 + 0.18 });
            }
          } else {
            this.arpeggio([392, 523], 0.09, "triangle", 0.2);
          }
          break;
        case "waveCleared":
          this.arpeggio([523, 659, 784, 1047, 1319], 0.08, "triangle", 0.22);
          break;
        case "gameOver":
          this.arpeggio([392, 330, 262, 196], 0.18, "triangle", 0.25);
          break;
        default:
          break;
      }
    }
  }

  private tone(opts: { from: number; to: number; duration: number; type: OscillatorType; volume: number; delay?: number }) {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const start = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(opts.to, 1), start + opts.duration);
    gain.gain.setValueAtTime(opts.volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + opts.duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + opts.duration + 0.02);
  }

  private arpeggio(notes: number[], step: number, type: OscillatorType, volume: number) {
    notes.forEach((note, i) => this.tone({ from: note, to: note, duration: step * 1.4, type, volume, delay: i * step }));
  }

  private noise(opts: { duration: number; volume: number; filter: number }) {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    if (!this.noiseBuffer) {
      // 무작위 잡음 버퍼는 한 번만 만들어 재사용한다.
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    const start = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(opts.filter, start);
    filter.frequency.exponentialRampToValueAtTime(80, start + opts.duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + opts.duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
    source.stop(start + opts.duration);
  }
}
