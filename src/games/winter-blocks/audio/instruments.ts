/*
 * Winter Blocks 악기 합성 (Web Audio API, 외부 음원·샘플 없음).
 * 각 악기는 여러 오실레이터(배음)·엔벨로프·필터·잡음을 조합해 만든다.
 *
 *   musicBox  오르골: 기음 + 옥타브 + 높은 비정수 배음, 빠른 어택과 긴 감쇠
 *   celesta   첼레스타: 사인·삼각파 기음과 짧게 사라지는 2배음
 *   bell      부드러운 종: 비정수 배음(0.5·1·1.19·1.5·2·2.76)이 서로 다른 속도로 감쇠
 *   sleigh    썰매 종: 고역 대역 잡음을 두 번 흔들어 찰랑이는 소리 + 높은 금속 배음
 *   pad       패드: 살짝 어긋난 톱니파 두 개 + 로우패스, 느린 어택·릴리스
 *   pizz      피치카토 베이스: 삼각파 + 사인 배음, 로우패스, 짧은 감쇠
 *   kick·brush·shaker  잔잔한 타악기
 *
 * 누수 방지: 모든 소리는 Voices에 등록되고, 끝나면 스스로 연결을 끊는다. 재생을 멈추면 남은 소리도 즉시 정리한다.
 */

export type Instrument = "musicBox" | "celesta" | "bell" | "sleigh" | "pad" | "pizz" | "kick" | "brush" | "shaker";

interface Voice {
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  ended: number;
}

/** 예약한 소리 목록. 끝난 소리는 연결을 끊고 빠지며, stopAll로 한꺼번에 멈출 수 있다. */
export class Voices {
  private voices = new Set<Voice>();

  get size() {
    return this.voices.size;
  }

  add(sources: AudioScheduledSourceNode[], nodes: AudioNode[], start: number, stop: number) {
    const voice: Voice = { sources, nodes, ended: 0 };
    this.voices.add(voice);
    for (const source of sources) {
      source.onended = () => {
        voice.ended++;
        if (voice.ended >= voice.sources.length) this.release(voice);
      };
      source.start(start);
      source.stop(stop);
    }
  }

  stopAll(now: number) {
    for (const voice of this.voices) {
      for (const source of voice.sources) {
        source.onended = null;
        try {
          source.stop(now + 0.02);
        } catch {
          // 이미 멈춘 소리
        }
      }
      setTimeout(() => this.disconnect(voice), 60);
    }
    this.voices.clear();
  }

  private release(voice: Voice) {
    if (this.voices.delete(voice)) this.disconnect(voice);
  }

  private disconnect(voice: Voice) {
    for (const source of voice.sources) {
      source.onended = null;
      source.disconnect();
    }
    for (const node of voice.nodes) node.disconnect();
  }
}

export interface PlayContext {
  ctx: BaseAudioContext;
  out: AudioNode;
  voices: Voices;
  noise: AudioBuffer;
}

/** 0에서 짧게 올라가(어택) 지수적으로 줄어드는(감쇠) 엔벨로프. 클릭 잡음을 막는다. */
function decayEnvelope(param: AudioParam, t: number, peak: number, attack: number, decay: number) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** 사인·삼각파 배음 묶음 (각 배음은 따로 감쇠한다) */
function partials(
  p: PlayContext,
  t: number,
  freq: number,
  vel: number,
  list: { ratio: number; amp: number; decay: number; type?: OscillatorType }[],
  attack = 0.003,
) {
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];
  let end = t;
  for (const part of list) {
    const f = freq * part.ratio;
    if (f > 16000) continue;
    const osc = p.ctx.createOscillator();
    osc.type = part.type ?? "sine";
    osc.frequency.setValueAtTime(f, t);
    const gain = p.ctx.createGain();
    decayEnvelope(gain.gain, t, vel * part.amp, attack, part.decay);
    osc.connect(gain).connect(p.out);
    sources.push(osc);
    nodes.push(gain);
    end = Math.max(end, t + attack + part.decay);
  }
  p.voices.add(sources, nodes, t, end + 0.05);
}

function noiseHit(p: PlayContext, t: number, vel: number, type: BiquadFilterType, cutoff: number, length: number, q = 1) {
  const source = p.ctx.createBufferSource();
  source.buffer = p.noise;
  const filter = p.ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = cutoff;
  filter.Q.value = q;
  const gain = p.ctx.createGain();
  decayEnvelope(gain.gain, t, vel, 0.002, length);
  source.connect(filter).connect(gain).connect(p.out);
  p.voices.add([source], [filter, gain], t, t + length + 0.03);
}

/** 악기 하나로 음 하나를 예약한다. length는 박자상 길이(초)로, 감쇠형 악기는 참고만 한다. */
export function playNote(p: PlayContext, instrument: Instrument, t: number, freq: number, length: number, vel: number) {
  switch (instrument) {
    case "musicBox": {
      const ring = Math.min(2.2, 1.0 + 300 / freq);
      partials(p, t, freq, vel, [
        { ratio: 1, amp: 1, decay: ring },
        { ratio: 2.003, amp: 0.32, decay: ring * 0.55 },
        { ratio: 4.17, amp: 0.12, decay: ring * 0.25 },
        { ratio: 6.3, amp: 0.05, decay: 0.12 },
      ], 0.002);
      return;
    }
    case "celesta":
      partials(p, t, freq, vel, [
        { ratio: 1, amp: 0.8, decay: 1.1 },
        { ratio: 1, amp: 0.25, decay: 0.6, type: "triangle" },
        { ratio: 2, amp: 0.35, decay: 0.3 },
        { ratio: 3.01, amp: 0.1, decay: 0.15 },
      ], 0.004);
      return;
    case "bell":
      partials(p, t, freq, vel, [
        { ratio: 0.5, amp: 0.25, decay: 2.6 },
        { ratio: 1, amp: 1, decay: 2.2 },
        { ratio: 1.19, amp: 0.3, decay: 1.4 },
        { ratio: 1.5, amp: 0.22, decay: 1.2 },
        { ratio: 2, amp: 0.35, decay: 1.0 },
        { ratio: 2.76, amp: 0.15, decay: 0.6 },
      ], 0.003);
      return;
    case "sleigh":
      // 방울 여러 개가 거의 동시에 흔들리는 느낌: 15ms 간격의 고역 잡음 두 번 + 금속 배음
      noiseHit(p, t, vel, "bandpass", 7200, 0.09, 1.2);
      noiseHit(p, t + 0.016, vel * 0.7, "highpass", 9000, 0.07);
      partials(p, t, 5300, vel * 0.18, [{ ratio: 1, amp: 1, decay: 0.08 }, { ratio: 1.23, amp: 0.7, decay: 0.06 }], 0.001);
      return;
    case "pad": {
      const sources: AudioScheduledSourceNode[] = [];
      const nodes: AudioNode[] = [];
      const filter = p.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1400;
      filter.Q.value = 0.3;
      const gain = p.ctx.createGain();
      const attack = Math.min(0.5, length * 0.4);
      const release = 0.7;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vel, t + attack);
      gain.gain.setValueAtTime(vel, t + Math.max(attack, length - 0.05));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length + release);
      filter.connect(gain).connect(p.out);
      for (const [type, detune, amp] of [["sawtooth", -7, 0.5], ["sawtooth", 7, 0.5], ["triangle", 0, 0.6]] as const) {
        const osc = p.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(type === "triangle" ? freq / 2 : freq, t);
        osc.detune.value = detune;
        const g = p.ctx.createGain();
        g.gain.value = amp;
        osc.connect(g).connect(filter);
        sources.push(osc);
        nodes.push(g);
      }
      nodes.push(filter, gain);
      p.voices.add(sources, nodes, t, t + length + release + 0.05);
      return;
    }
    case "pizz": {
      const filter = p.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1800, t);
      filter.frequency.exponentialRampToValueAtTime(400, t + 0.25);
      const gain = p.ctx.createGain();
      const decay = Math.min(0.6, Math.max(0.28, length));
      decayEnvelope(gain.gain, t, vel, 0.004, decay);
      filter.connect(gain).connect(p.out);
      const sources: AudioScheduledSourceNode[] = [];
      const nodes: AudioNode[] = [filter, gain];
      for (const [type, ratio, amp] of [["triangle", 1, 1], ["sine", 2, 0.35]] as const) {
        const osc = p.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq * ratio, t);
        const g = p.ctx.createGain();
        g.gain.value = amp;
        osc.connect(g).connect(filter);
        sources.push(osc);
        nodes.push(g);
      }
      p.voices.add(sources, nodes, t, t + decay + 0.06);
      return;
    }
    case "kick": {
      const osc = p.ctx.createOscillator();
      osc.frequency.setValueAtTime(130, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.14);
      const gain = p.ctx.createGain();
      decayEnvelope(gain.gain, t, vel, 0.003, 0.18);
      osc.connect(gain).connect(p.out);
      p.voices.add([osc], [gain], t, t + 0.22);
      return;
    }
    case "brush":
      noiseHit(p, t, vel, "bandpass", 2600, 0.14, 0.7);
      return;
    case "shaker":
      noiseHit(p, t, vel, "highpass", 8000, 0.045);
      return;
  }
}
