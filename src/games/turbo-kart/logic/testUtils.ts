import { RACE } from "../config";
import type { DriveInput, Kart, RaceEvent } from "../types";
import { createRace, type Race } from "./game";
import { driveKart, moveKart, NO_INPUT, type DriveEnv } from "./physics";
import { buildTrack, pointAt } from "./track";

/* 테스트 전용 도우미 (게임 화면에서는 쓰지 않는다) */

export const DT = RACE.fixedDt;

export function input(partial: Partial<DriveInput>): DriveInput {
  return { ...NO_INPUT, ...partial };
}

/** Green Valley 출발 직선(장애물 없음)에 카트 하나를 세운 시험장 */
export function testKart(s = 150, lateral = 0): { kart: Kart; env: DriveEnv; race: Race } {
  const race = createRace({ track: "greenValley", difficulty: "easy", seed: 1 });
  const track = buildTrack("greenValley");
  const kart = race.state.karts[3];
  const p = pointAt(track, s, lateral);
  Object.assign(kart, { x: p.x, y: p.y, heading: Math.atan2(p.ty, p.tx), vx: 0, vy: 0, s, sample: Math.round(s / 8) });
  const env: DriveEnv = { track, difficulty: "easy", obstacles: [], movers: [] };
  return { kart, env, race };
}

/** 물리만 진행 (레이스 규칙 없이) */
export function drive(kart: Kart, env: DriveEnv, inp: DriveInput, seconds: number): RaceEvent[] {
  const events: RaceEvent[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    driveKart(kart, inp, env, DT, events);
    for (let k = 0; k < RACE.substeps; k++) moveKart(kart, env, DT / RACE.substeps, events);
  }
  return events;
}

export const speed = (k: Kart) => Math.hypot(k.vx, k.vy);
