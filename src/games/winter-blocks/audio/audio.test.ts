import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import type { GameEvent } from "../types";
import { cueForAction, cuesForEvents } from "./cues";
import { Sequencer } from "./sequencer";
import { parseMelody, SONGS, TRACK_IDS } from "./songs";
import { WinterAudio } from "./WinterAudio";

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

function startsBetween(ctx: FakeContext, from: number, to: number) {
  return ctx.starts.filter((s) => s.t >= from && s.t < to).length;
}

beforeEach(() => mock.timers.enable({ apis: ["setInterval", "setTimeout"] }));
afterEach(() => mock.timers.reset());

describe("BGM 곡 구성", () => {
  test("세 곡: 템포 95·115·90, 16마디, 마디마다 16칸", () => {
    assert.deepEqual(TRACK_IDS.map((id) => SONGS[id].bpm), [95, 115, 90]);
    for (const id of TRACK_IDS) {
      assert.equal(SONGS[id].bars, 16);
      assert.equal(SONGS[id].score.length, 16 * 16);
    }
  });

  test("단순한 사각파가 아니라 곡마다 여러 겨울 악기를 쓴다", () => {
    const used = (id: (typeof TRACK_IDS)[number]) => new Set(SONGS[id].score.flat().map((n) => n.instrument));
    assert.deepEqual([...used("snowyNight")].sort(), ["bell", "celesta", "musicBox", "pad", "pizz", "shaker"].sort());
    assert.ok(used("winterFestival").has("sleigh") && used("winterFestival").has("pizz") && used("winterFestival").has("bell"));
    assert.ok(used("crystalDreams").has("celesta") && used("crystalDreams").has("musicBox") && used("crystalDreams").has("pad"));
  });

  test("세 곡의 멜로디는 서로 다르고, 모든 마디에 멜로디·베이스가 있다", () => {
    const melody = (id: (typeof TRACK_IDS)[number]) =>
      SONGS[id].score.map((slot) => slot.find((n) => n.instrument === "musicBox" || (id === "winterFestival" && n.instrument === "celesta" && n.vel > 0.2))?.freq ?? 0).join();
    assert.equal(new Set(TRACK_IDS.map(melody)).size, 3);
    for (const id of TRACK_IDS) {
      for (let bar = 0; bar < 16; bar++) {
        const notes = SONGS[id].score.slice(bar * 16, bar * 16 + 16).flat();
        assert.ok(notes.some((n) => n.instrument === "pizz"), `${id} bar ${bar + 1} bass`);
      }
    }
  });

  test("악보 형식 오류는 바로 드러난다", () => {
    assert.throws(() => parseMelody(["C5 - -"], "musicBox", 0.3));
  });
});

describe("재생기 (look-ahead, 무한 반복, 일시정지·재개, 전환)", () => {
  test("재생하면 미리 음을 예약하고, 곡 끝에서 처음으로 이어진다", () => {
    const ctx = new FakeContext();
    const seq = new Sequencer(true);
    seq.attach(ctx as unknown as AudioContext, ctx.createGain() as unknown as GainNode);
    seq.play(SONGS.winterFestival, 0);
    const loopSeconds = (16 * 16 * 60) / 115 / 4;
    advance(ctx, loopSeconds + 3);
    assert.ok(seq.isPlaying);
    // 한 바퀴를 넘겨도 계속 예약된다(무한 반복)
    assert.ok(startsBetween(ctx, loopSeconds + 0.5, loopSeconds + 2.5) > 10);
    assert.ok(seq.currentStep < 16 * 4, "wrapped to the beginning");
  });

  test("일시정지하면 예약을 멈추고, 재개하면 멈춘 위치에서 이어 간다", () => {
    const ctx = new FakeContext();
    const seq = new Sequencer(true);
    seq.attach(ctx as unknown as AudioContext, ctx.createGain() as unknown as GainNode);
    seq.play(SONGS.snowyNight, 0);
    advance(ctx, 5);
    seq.setActive(false);
    const pausedAt = seq.currentStep;
    assert.equal(seq.isPlaying, false);
    const before = ctx.starts.length;
    advance(ctx, 3);
    assert.equal(ctx.starts.length, before, "nothing scheduled while paused");
    seq.setActive(true);
    assert.ok(Math.abs(seq.currentStep - pausedAt) <= 1, `resume at ${seq.currentStep}, paused at ${pausedAt}`);
    assert.ok(pausedAt > 20);
  });

  test("곡을 바꾸면 이전 곡은 멈추고 새 곡을 처음부터 재생한다", () => {
    const ctx = new FakeContext();
    const seq = new Sequencer(true);
    seq.attach(ctx as unknown as AudioContext, ctx.createGain() as unknown as GainNode);
    seq.play(SONGS.snowyNight, 0);
    advance(ctx, 4);
    seq.select(SONGS.crystalDreams);
    assert.equal(seq.currentSong, "crystalDreams");
    assert.ok(seq.currentStep < 8);
    seq.select(SONGS.crystalDreams);
    assert.equal(seq.currentSong, "crystalDreams", "same song: no restart");
  });

  test("끄거나 멈추면 재생이 끝나고 남은 소리가 정리된다", () => {
    const ctx = new FakeContext();
    const seq = new Sequencer(true);
    seq.attach(ctx as unknown as AudioContext, ctx.createGain() as unknown as GainNode);
    seq.play(SONGS.snowyNight, 0);
    advance(ctx, 3);
    assert.ok(seq.liveVoices > 0);
    seq.stop(1);
    advance(ctx, 2);
    assert.equal(seq.isPlaying, false);
    const count = ctx.starts.length;
    advance(ctx, 2);
    assert.equal(ctx.starts.length, count);
    // 꺼진 상태에서는 play해도 소리를 내지 않는다
    seq.setEnabled(false);
    seq.play(SONGS.snowyNight, 0);
    advance(ctx, 1);
    assert.equal(seq.isPlaying, false);
    seq.setEnabled(true);
    assert.equal(seq.isPlaying, true, "turning BGM on plays the selected song");
  });
});

describe("효과음·오디오 관리자", () => {
  test("이벤트마다 효과음이 정해져 있다", () => {
    const cases: [GameEvent, string][] = [
      [{ type: "move" }, "move"],
      [{ type: "rotate" }, "rotate"],
      [{ type: "lock", cells: [] }, "lock"],
      [{ type: "bump", cells: [] }, "bump"],
      [{ type: "lineClear", rows: [1], count: 1, combo: 0, points: 100 }, "lineClear"],
      [{ type: "lineClear", rows: [1, 2], count: 2, combo: 0, points: 300 }, "multiLineClear"],
      [{ type: "levelUp", level: 2 }, "levelUp"],
      [{ type: "iceCrack", rows: [1] }, "iceCrack"],
      [{ type: "wind", dir: 1, moved: true }, "wind"],
      [{ type: "snowfall", cell: { x: 0, y: 0 } }, "snowfall"],
      [{ type: "hardDrop", distance: 3 }, "hardDrop"],
      [{ type: "gameOver" }, "gameOver"],
    ];
    for (const [event, cue] of cases) assert.deepEqual(cuesForEvents([event]).map((c) => c.cue), [cue], event.type);
    assert.equal(cueForAction("pause"), "pause");
    assert.equal(cueForAction("resume"), "resume");
    // 하드 드롭 때는 고정음을 겹치지 않는다
    assert.deepEqual(cuesForEvents([{ type: "hardDrop", distance: 2 }, { type: "lock", cells: [] }]).map((c) => c.cue), ["hardDrop"]);
  });

  function withWindow<T>(fn: (ctx: () => FakeContext) => T): T {
    let made: FakeContext | null = null;
    const g = globalThis as unknown as { window?: unknown; document?: unknown };
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

  test("효과음·BGM 둘 다 꺼져 있으면 AudioContext를 만들지 않는다 (기본값)", () => {
    withWindow((ctx) => {
      const audio = new WinterAudio(false, false, "snowyNight");
      audio.unlock();
      assert.equal(audio.context, null);
      void ctx;
    });
  });

  test("효과음 ON/OFF는 BGM과 독립적이다", () => {
    withWindow((ctx) => {
      const audio = new WinterAudio(true, false, "snowyNight");
      audio.unlock();
      const base = ctx().starts.length;
      audio.handle([{ type: "rotate" }]);
      const withSfx = ctx().starts.length;
      assert.ok(withSfx > base);
      assert.equal(audio.music.isPlaying, false);
      audio.setSfxEnabled(false);
      audio.handle([{ type: "lineClear", rows: [1], count: 1, combo: 0, points: 100 }]);
      assert.equal(ctx().starts.length, withSfx);
    });
  });

  test("좌우 이동 효과음은 짧은 간격으로 겹쳐 울리지 않는다", () => {
    withWindow((ctx) => {
      const audio = new WinterAudio(true, false, "snowyNight");
      audio.unlock();
      const base = ctx().starts.length; // iOS 잠금 해제용 무음 1샘플
      for (let i = 0; i < 10; i++) audio.handle([{ type: "move" }]);
      assert.equal(ctx().starts.length - base, 1);
    });
  });

  test("BGM: 시작하면 선택곡 재생, 일시정지·재개, 게임 오버 때 페이드아웃 후 정지", () => {
    withWindow((ctx) => {
      const audio = new WinterAudio(false, true, "winterFestival");
      audio.unlock();
      audio.handle([], "start");
      advance(ctx(), 1);
      assert.equal(audio.music.currentSong, "winterFestival");
      audio.handle([], "pause");
      assert.equal(audio.music.isPlaying, false);
      audio.handle([], "resume");
      assert.equal(audio.music.isPlaying, true);
      audio.setTrack("crystalDreams");
      assert.equal(audio.music.currentSong, "crystalDreams");
      audio.handle([{ type: "gameOver" }]);
      advance(ctx(), 3);
      assert.equal(audio.music.isPlaying, false);
      audio.dispose();
      assert.equal(audio.context, null);
    });
  });
});
