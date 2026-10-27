import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import { CascadeAudio, cuesFor } from "./CascadeAudio";
import { BASE_BPM, MAX_BPM, RUSH_LOOP, tempoFor } from "./music";
import { CUE_CHANNEL, popIntensity, popPitch } from "./sfx";

/*
 * 오디오 테스트. 실제 소리를 듣는 테스트가 아니라, 가짜 AudioContext로 "언제 어떤 음을 예약하는지"를 검증한다.
 */

// ── 가짜 Web Audio ──
class FakeParam {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  setTargetAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  connected = 0;
  gain = new FakeParam();
  frequency = new FakeParam();
  detune = new FakeParam();
  Q = new FakeParam();
  delayTime = new FakeParam();
  threshold = new FakeParam();
  ratio = new FakeParam();
  type = "";
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  private ctx: FakeContext;
  kind: string;
  constructor(ctx: FakeContext, kind: string) {
    this.ctx = ctx;
    this.kind = kind;
    ctx.created[kind] = (ctx.created[kind] ?? 0) + 1;
  }
  connect(node: FakeNode) {
    this.connected++;
    return node;
  }
  disconnect() {
    this.connected = 0;
  }
  start(t: number) {
    this.ctx.starts.push({ kind: this.kind, t });
  }
  stop() {}
}

class FakeContext {
  currentTime = 0;
  sampleRate = 8000;
  state = "running";
  destination = {} as FakeNode;
  created: Record<string, number> = {};
  starts: { kind: string; t: number }[] = [];
  createGain = () => new FakeNode(this, "gain");
  createOscillator = () => new FakeNode(this, "osc");
  createBufferSource = () => new FakeNode(this, "source");
  createBiquadFilter = () => new FakeNode(this, "filter");
  createDelay = () => new FakeNode(this, "delay");
  createDynamicsCompressor = () => new FakeNode(this, "compressor");
  createBuffer = (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
  resume = async () => {};
  suspend = async () => {};
  close = async () => {};
}

/** 시간을 dt초씩 흘리며 타이머를 실행한다 */
function advance(ctx: FakeContext, seconds: number, dt = 0.025) {
  for (let t = 0; t < seconds; t += dt) {
    ctx.currentTime += dt;
    mock.timers.tick(dt * 1000);
  }
}

beforeEach(() => mock.timers.enable({ apis: ["setInterval", "setTimeout"] }));
afterEach(() => mock.timers.reset());

function withWindow<T>(fn: (ctx: () => FakeContext) => T): T {
  let made: FakeContext | null = null;
  const g = globalThis as unknown as { window?: unknown };
  g.window = {
    AudioContext: class {
      constructor() {
        made = new FakeContext();
        return made;
      }
    },
  };
  try {
    return fn(() => made!);
  } finally {
    delete g.window;
  }
}

describe("15. 사운드", () => {
  test("게임 이벤트 → 효과음: 이동·회전·착지·즉시 낙하·폭발·카운트다운·종료", () => {
    const cues = cuesFor([
      { type: "move" },
      { type: "rotate" },
      { type: "land", hard: false, cells: 2 },
      { type: "land", hard: true, cells: 2 },
      { type: "pop", chain: 2, crystals: [], groups: 1, points: 80 },
      { type: "countdown", seconds: 9 },
      { type: "gameOver", reason: "time" },
      { type: "gameOver", reason: "topout" },
    ]);
    assert.deepEqual(cues.map((c) => c.cue), ["move", "rotate", "land", "hardDrop", "pop", "countdown", "timeUp", "topout"]);
    assert.equal(cues[4].value, 2);
    for (const c of cues) assert.ok(CUE_CHANNEL[c.cue]);
  });

  test("연쇄 폭발음은 단계마다 높아지고 세진다", () => {
    for (let chain = 1; chain < 10; chain++) {
      assert.ok(popPitch(chain + 1) > popPitch(chain), `${chain}연쇄`);
      assert.ok(popIntensity(chain + 1) >= popIntensity(chain));
    }
    assert.ok(popIntensity(5) <= 1);
  });

  test("축하 효과음은 3연쇄 이상만, 시간 보너스는 따로 울린다", () => {
    assert.deepEqual(cuesFor([{ type: "chainEnd", chain: 2, total: 120, bonus: 0 }]), []);
    assert.deepEqual(cuesFor([{ type: "chainEnd", chain: 3, total: 300, bonus: 3 }, { type: "timeBonus", seconds: 3 }]).map((c) => c.cue), ["chainEnd", "timeBonus"]);
  });

  test("BGM: 16마디(256칸), 모든 음이 유효하고 긴장 레이어가 있다. 속도 단계마다 템포가 오른다", () => {
    assert.equal(RUSH_LOOP.score.length, 256);
    for (const slot of RUSH_LOOP.score) for (const note of slot) assert.ok(RUSH_LOOP.parts[note.part] && Number.isFinite(note.freq) && note.steps > 0);
    assert.ok(Object.values(RUSH_LOOP.parts).some((p) => p.layer === "tension"));
    assert.equal(tempoFor(1), BASE_BPM);
    assert.ok(tempoFor(3) > tempoFor(2) && tempoFor(2) > tempoFor(1));
    assert.equal(tempoFor(99), MAX_BPM);
  });

  test("효과음·BGM 둘 다 꺼져 있으면 AudioContext를 만들지 않는다 (기본값)", () => {
    withWindow(() => {
      const audio = new CascadeAudio(false, false);
      audio.unlock();
      assert.equal(audio.context, null);
    });
  });

  test("효과음 ON/OFF는 BGM과 독립적이다", () => {
    withWindow((ctx) => {
      const audio = new CascadeAudio(true, false);
      audio.unlock();
      const base = ctx().starts.length;
      audio.handle([{ type: "pop", chain: 3, crystals: [], groups: 1, points: 160 }]);
      const withSfx = ctx().starts.length;
      assert.ok(withSfx > base);
      assert.equal(audio.musicPlaying, false);
      audio.setSfxEnabled(false);
      audio.handle([{ type: "pop", chain: 4, crystals: [], groups: 1, points: 320 }]);
      assert.equal(ctx().starts.length, withSfx);
      audio.setSfxEnabled(true);
      audio.handle([{ type: "rotate" }]);
      assert.ok(ctx().starts.length > withSfx);
    });
  });

  test("연쇄가 길수록 더 많은 소리를 겹친다 (1연쇄 < 3연쇄 < 5연쇄)", () => {
    withWindow((ctx) => {
      const audio = new CascadeAudio(true, false);
      audio.unlock();
      const count = (chain: number) => {
        const before = ctx().starts.length;
        audio.handle([{ type: "pop", chain, crystals: [], groups: 1, points: 0 }]);
        return ctx().starts.length - before;
      };
      const [a, b, c] = [count(1), count(3), count(5)];
      assert.ok(a < b && b < c, `${a} ${b} ${c}`);
    });
  });

  test("좌우 이동 효과음은 짧은 간격으로 겹쳐 울리지 않는다", () => {
    withWindow((ctx) => {
      const audio = new CascadeAudio(true, false);
      audio.unlock();
      const base = ctx().starts.length;
      for (let i = 0; i < 10; i++) audio.handle([{ type: "move" }]);
      assert.equal(ctx().starts.length - base, 1);
    });
  });

  test("BGM: READY부터 재생, 일시정지·재개, 10초 이하 긴장 레이어, 결과 화면에서 페이드아웃, OFF면 재생 안 함", () => {
    withWindow((ctx) => {
      const audio = new CascadeAudio(false, true);
      audio.unlock();
      audio.setScene("ready", 1, false);
      advance(ctx(), 0.5);
      assert.equal(audio.musicPlaying, true);
      audio.setScene("playing", 1, true);
      assert.equal(audio.musicTension, true);
      audio.setScene("paused", 1, true);
      assert.equal(audio.musicPlaying, false);
      assert.equal(audio.musicTension, false);
      audio.setScene("playing", 2, false);
      assert.equal(audio.musicPlaying, true);
      audio.setScene("over", 2, false);
      advance(ctx(), 2);
      assert.equal(audio.musicPlaying, false);
      audio.setScene("ready", 1, false);
      audio.setMusicEnabled(false);
      advance(ctx(), 1);
      assert.equal(audio.musicPlaying, false);
      audio.dispose();
      assert.equal(audio.context, null);
    });
  });
});
