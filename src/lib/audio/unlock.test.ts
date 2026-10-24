import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  closeAudioContext,
  isAudioBlocked,
  resumeAllAudio,
  resumeAudioContext,
  subscribeAudioBlocked,
  suspendAudioContext,
  trackAudioContext,
  trackedAudioContextCount,
} from "./unlock";

/** iOS처럼 사용자 입력 전에는 resume이 거부되는 가짜 AudioContext */
class FakeContext {
  state: string = "suspended";
  allowResume = false;
  resumeCalls = 0;
  silentPlays = 0;
  sampleRate = 44100;
  destination = {};
  resume() {
    this.resumeCalls++;
    if (this.allowResume) {
      this.state = "running";
      return Promise.resolve();
    }
    return Promise.reject(new Error("NotAllowedError"));
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return {
      buffer: null,
      onended: null,
      connect: () => {},
      disconnect: () => {},
      start: () => {
        this.silentPlays++;
      },
    };
  }
  addEventListener() {}
  removeEventListener() {}
}

const asCtx = (f: FakeContext) => f as unknown as AudioContext;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("공용 오디오 깨우기", () => {
  test("등록한 컨텍스트는 사용자 입력 때 resume + 무음 1샘플을 재생하고, 거부되어도 예외가 나지 않는다", async () => {
    const f = new FakeContext();
    trackAudioContext(asCtx(f));
    resumeAllAudio();
    assert.ok(f.resumeCalls >= 1);
    assert.ok(f.silentPlays >= 1);
    await wait(10); // 거부된 Promise가 처리되지 않은 오류로 남지 않는다
    f.allowResume = true;
    resumeAllAudio();
    assert.equal(f.state, "running");
    closeAudioContext(asCtx(f));
  });

  test("게임이 소리를 원하는데 0.9초 넘게 막혀 있으면 '막힘'을 알리고, 깨어나면 해제한다", async () => {
    const f = new FakeContext();
    let notified = 0;
    const off = subscribeAudioBlocked(() => notified++);
    resumeAudioContext(asCtx(f));
    assert.equal(isAudioBlocked(), false);
    await wait(950);
    resumeAllAudio();
    assert.equal(isAudioBlocked(), true);
    f.allowResume = true;
    resumeAllAudio();
    assert.equal(isAudioBlocked(), false);
    assert.ok(notified >= 2);
    off();
    closeAudioContext(asCtx(f));
  });

  test("효과음·BGM을 모두 꺼서 일부러 멈춘 컨텍스트는 '막힘'으로 보지 않고, 닫으면 등록이 풀린다", async () => {
    const f = new FakeContext();
    f.allowResume = true;
    resumeAudioContext(asCtx(f));
    suspendAudioContext(asCtx(f));
    assert.equal(f.state, "suspended");
    await wait(950);
    resumeAllAudio();
    assert.equal(isAudioBlocked(), false);
    assert.equal(f.state, "suspended", "일부러 멈춘 컨텍스트는 입력이 있어도 깨우지 않는다");
    const before = trackedAudioContextCount();
    closeAudioContext(asCtx(f));
    assert.equal(trackedAudioContextCount(), before - 1);
  });

  test("Audio Session API가 있으면 소리를 켤 때 playback, 원하는 소리가 없으면 auto로 되돌린다", () => {
    const session = { type: "auto" };
    Object.defineProperty(globalThis.navigator, "audioSession", { value: session, configurable: true });
    const f = new FakeContext();
    f.allowResume = true;
    resumeAudioContext(asCtx(f));
    assert.equal(session.type, "playback");
    suspendAudioContext(asCtx(f));
    assert.equal(session.type, "auto");
    closeAudioContext(asCtx(f));
    delete (globalThis.navigator as unknown as { audioSession?: unknown }).audioSession;
  });
});
