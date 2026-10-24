import {
  AI,
  BALL,
  BONUS,
  BOSS,
  CHAIN_POINTS,
  CHECKPOINT_AFTER,
  ENEMY,
  GRAVITY,
  ITEMS,
  PHASE,
  PLAYER,
  POINTS,
  SHAKE,
  SHOT,
  SNOW,
  WORLD_H,
  WORLD_W,
  type BonusKind,
  type EnemyKind,
  type ItemKind,
} from "../config";
import { STAGES } from "../stages";
import type { Boss, Enemy, GameEvent, GameState, Input, Item, Player } from "../types";
import { createMovingPlatforms, floorAbove, parseLevel, stepMovingPlatforms } from "./level";
import { bodyHitsSolid, groundAhead, moveBody, overlaps, type Body } from "./physics";
import { nextRandom, randomRange } from "./rng";

/*
 * Frosty Roll 규칙 (순수 함수, React·DOM·캔버스 비의존). stepGame이 고정 1/60초마다 상태를 한 단계 진행하고,
 * 그 사이 일어난 일을 이벤트로 돌려준다(사운드·화면 효과는 이벤트를 읽기만 한다).
 *
 * 핵심 흐름: 눈송이 명중 → 눈 누적(0·33·66%) → 눈덩이(100%) → 차기 → 굴러가며 적을 연달아 쓰러뜨림(연쇄)
 *           → 벽에 2번 튕긴 뒤 다음 벽(또는 7초)에서 부서짐. 그대로 둔 눈덩이는 금이 간 뒤 적이 탈출한다.
 * 점수는 상태가 바뀌는 순간(명중·갇힘·쓰러짐·부서짐·획득) 한 번만 더한다.
 */

const WIND_ACCEL = 420;

// ── 생성 ──

export interface GameOptions {
  seed: number;
  startStage?: number;
  easyPush?: boolean;
}

function makePlayer(x: number, y: number): Player {
  return {
    x: x - PLAYER.w / 2,
    y: y - PLAYER.h,
    w: PLAYER.w,
    h: PLAYER.h,
    vx: 0,
    vy: 0,
    grounded: true,
    onPlatform: -1,
    facing: 1,
    lives: PLAYER.lives,
    invulnerable: PLAYER.startInvulnerable,
    hurt: 0,
    shootCooldown: 0,
    kickCooldown: 0,
    shootAnim: 9,
    kickAnim: 9,
    coyote: 0,
    jumpBuffer: 0,
    shield: false,
    speedBoost: 0,
    rapid: 0,
    giant: 0,
    walkTime: 0,
    alive: true,
  };
}

export function makeEnemy(s: GameState, kind: EnemyKind, cx: number, bottom: number, enhanced: boolean, minion = false): Enemy {
  const size = ENEMY[kind];
  return {
    id: s.nextId++,
    kind,
    x: cx - size.w / 2,
    y: bottom - size.h,
    w: size.w,
    h: size.h,
    vx: 0,
    vy: 0,
    grounded: false,
    onPlatform: -1,
    state: "active",
    dir: nextRandom(s) < 0.5 ? -1 : 1,
    snow: 0,
    sinceHit: 0,
    ballTime: 0,
    chain: 0,
    bounces: 0,
    rollTime: 0,
    angry: 0,
    thinkTimer: randomRange(s, 0.4, AI.thinkInterval),
    hopTimer: randomRange(s, AI.hopInterval[0], AI.hopInterval[1]),
    stuckTimer: 0,
    stuckX: cx,
    deadTime: 0,
    phase: randomRange(s, 0, Math.PI * 2),
    enhanced,
    minion,
    crack: 0,
  };
}

function makeBoss(cx: number, bottom: number): Boss {
  return {
    x: cx - BOSS.w / 2,
    y: bottom - BOSS.h,
    w: BOSS.w,
    h: BOSS.h,
    vx: 0,
    vy: 0,
    grounded: true,
    onPlatform: -1,
    hp: BOSS.hp,
    state: "walk",
    dir: -1,
    timer: 0,
    attackTimer: BOSS.attackInterval,
    spawnTimer: BOSS.spawnInterval * 0.6,
    invulnerable: 0,
    spawned: 0,
  };
}

export function createGame(opts: GameOptions): GameState {
  const stageIndex = opts.startStage ?? 0;
  const stage = STAGES[stageIndex];
  const level = parseLevel(stage);
  const s: GameState = {
    phase: "intro",
    phaseTime: 0,
    stageIndex,
    stage,
    level,
    platforms: [],
    player: makePlayer(level.player.x, level.player.y),
    enemies: [],
    boss: null,
    shots: [],
    gears: [],
    items: [],
    popups: [],
    score: 0,
    rng: opts.seed | 0,
    time: 0,
    stageTime: 0,
    nextId: 1,
    itemsThisStage: 0,
    itemCooldown: 0,
    lifeDroppedThisStage: false,
    wind: 0,
    rollSoundTimer: 0,
    shake: { amount: 0, time: 0 },
    easyPush: opts.easyPush ?? false,
    stats: { kills: 0, bestChain: 0 },
    checkpointReached: stageIndex > CHECKPOINT_AFTER,
  };
  loadStage(s, stageIndex, []);
  return s;
}

/** 스테이지를 처음 상태로 연다. 점수·목숨·방패는 이어지고, 시간 효과는 초기화된다 */
export function loadStage(s: GameState, index: number, events: GameEvent[]) {
  const stage = STAGES[index];
  s.stageIndex = index;
  s.stage = stage;
  s.level = parseLevel(stage);
  s.platforms = createMovingPlatforms(stage.movingPlatforms);
  const lives = s.player.lives;
  const shield = s.player.shield;
  s.player = makePlayer(s.level.player.x, s.level.player.y);
  s.player.lives = lives;
  s.player.shield = shield;
  s.enemies = [];
  s.boss = null;
  for (const sp of s.level.spawns) {
    if (sp.kind === "boss") s.boss = makeBoss(sp.x, sp.y);
    else s.enemies.push(makeEnemy(s, sp.kind, sp.x, sp.y, stage.enhanced));
  }
  s.shots = [];
  s.gears = [];
  s.items = [];
  s.popups = [];
  s.itemsThisStage = 0;
  s.itemCooldown = 0;
  s.lifeDroppedThisStage = false;
  s.stageTime = 0;
  s.wind = 0;
  s.phase = "intro";
  s.phaseTime = 0;
  events.push({ type: "stageStart", stage: index });
}

// ── 진행 ──

export function stepGame(s: GameState, input: Input, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  s.time += dt;
  s.phaseTime += dt;
  s.shake.time = Math.max(0, s.shake.time - dt);
  for (const pop of s.popups) {
    pop.life -= dt;
    pop.y -= (pop.big ? 14 : 22) * dt;
  }
  s.popups = s.popups.filter((p) => p.life > 0);

  switch (s.phase) {
    case "intro":
      if (s.phaseTime >= PHASE.intro) {
        s.phase = "play";
        s.phaseTime = 0;
      }
      return events;
    case "clear":
      // 승리 동작 중에도 남은 아이템·연출은 계속 움직인다
      stepItems(s, events, dt, false);
      if (s.phaseTime >= PHASE.clear) {
        if (s.stageIndex >= STAGES.length - 1) {
          s.phase = "victory";
          s.phaseTime = 0;
          events.push({ type: "victory" });
        } else loadStage(s, s.stageIndex + 1, events);
      }
      return events;
    case "dying": {
      const p = s.player;
      p.vy = Math.min(p.vy + GRAVITY * dt, 500);
      p.y += p.vy * dt;
      stepEnemies(s, events, dt);
      if (s.phaseTime >= PHASE.dying) {
        s.phase = "gameover";
        s.phaseTime = 0;
        events.push({ type: "gameOver" });
      }
      return events;
    }
    case "gameover":
    case "victory":
      return events;
    case "play":
      break;
  }

  s.stageTime += dt;
  s.itemCooldown = Math.max(0, s.itemCooldown - dt);
  stepMovingPlatforms(s.platforms, dt);
  if (s.stage.wind) {
    // 바람은 6초마다 방향이 바뀌고 천천히 세졌다 약해진다
    const target = Math.floor(s.stageTime / 6) % 2 === 0 ? 1 : -1;
    s.wind += Math.sign(target - s.wind) * Math.min(Math.abs(target - s.wind), dt * 0.7);
  }

  stepPlayer(s, input, events, dt);
  stepShots(s, events, dt);
  stepEnemies(s, events, dt);
  stepRollingHits(s, events);
  stepBoss(s, events, dt);
  stepGears(s, dt);
  stepItems(s, events, dt, true);
  checkPlayerDamage(s, events);

  const rolling = s.enemies.some((e) => e.state === "rolling");
  s.rollSoundTimer = rolling ? s.rollSoundTimer + dt : 0;

  // 모든 적(굴러가는 눈덩이 포함)이 사라지고 보스가 쓰러지면 스테이지 클리어
  const remaining = s.enemies.some((e) => e.state !== "dead");
  const bossAlive = s.boss !== null && s.boss.state !== "dead";
  if (s.phase === "play" && !remaining && !bossAlive) {
    const timeBonus = Math.max(0, Math.round(POINTS.timeBonusMax - s.stageTime * POINTS.timeBonusPerSecond));
    const bonus = POINTS.stageClear * (s.stageIndex + 1) + timeBonus;
    s.score += bonus;
    const checkpoint = s.stageIndex === CHECKPOINT_AFTER;
    if (checkpoint) s.checkpointReached = true;
    s.phase = "clear";
    s.phaseTime = 0;
    s.shots = [];
    s.gears = [];
    events.push({ type: "stageClear", bonus, checkpoint });
  }
  return events;
}

/** 플레이어 이동만 한 스텝 진행 (지도 도달 가능성 검사용: 적·클리어 판정 없이) */
export function stepPlayerOnly(s: GameState, input: Input, dt: number) {
  stepMovingPlatforms(s.platforms, dt);
  stepPlayer(s, input, [], dt);
}

// ── 플레이어 ──

function approach(v: number, target: number, delta: number) {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

/** 플레이어가 바라보는 쪽 바로 앞(차기 거리 안)에 있는 눈덩이 */
export function ballInFront(s: GameState): Enemy | null {
  const p = s.player;
  let best: Enemy | null = null;
  let bestGap = Infinity;
  for (const e of s.enemies) {
    if (e.state !== "ball") continue;
    const vOverlap = Math.min(p.y + p.h, e.y + e.h) - Math.max(p.y, e.y);
    if (vOverlap < 5) continue;
    const gap = p.facing > 0 ? e.x - (p.x + p.w) : p.x - (e.x + e.w);
    if (gap > BALL.kickReach || gap < -p.w * 0.75) continue;
    if (gap < bestGap) {
      best = e;
      bestGap = gap;
    }
  }
  return best;
}

/** 눈덩이를 dir 방향으로 굴린다 */
export function kickBall(s: GameState, ball: Enemy, dir: 1 | -1, events: GameEvent[]) {
  ball.state = "rolling";
  ball.dir = dir;
  ball.vx = dir * BALL.rollSpeed;
  ball.chain = 0;
  ball.bounces = 0;
  ball.rollTime = 0;
  events.push({ type: "kick", x: ball.x + ball.w / 2, y: ball.y + ball.h / 2 });
}

function stepPlayer(s: GameState, input: Input, events: GameEvent[], dt: number) {
  const p = s.player;
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.kickCooldown = Math.max(0, p.kickCooldown - dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.hurt = Math.max(0, p.hurt - dt);
  p.speedBoost = Math.max(0, p.speedBoost - dt);
  p.rapid = Math.max(0, p.rapid - dt);
  p.giant = Math.max(0, p.giant - dt);
  p.shootAnim += dt;
  p.kickAnim += dt;
  p.jumpBuffer = input.jump ? PLAYER.jumpBuffer : Math.max(0, p.jumpBuffer - dt);
  p.coyote = p.grounded ? PLAYER.coyote : Math.max(0, p.coyote - dt);

  const control = p.hurt <= 0;
  if (control) {
    const speed = p.speedBoost > 0 ? PLAYER.fastSpeed : PLAYER.speed;
    p.vx = approach(p.vx, input.move * speed, PLAYER.accel * (p.grounded ? 1 : 0.7) * dt);
    if (input.move !== 0) p.facing = input.move;
    if (p.jumpBuffer > 0 && p.coyote > 0) {
      p.vy = -PLAYER.jumpVelocity;
      p.jumpBuffer = 0;
      p.coyote = 0;
      p.grounded = false;
      p.onPlatform = -1;
      events.push({ type: "jump" });
    }
    // 점프 키를 일찍 떼면 낮게 뛴다
    if (!input.jumpHeld && p.vy < -140) p.vy += GRAVITY * 1.1 * dt;
  }
  moveBody(s.level, s.platforms, p, dt);
  p.walkTime = p.grounded && Math.abs(p.vx) > 5 ? p.walkTime + dt : 0;

  // 멈춘 눈덩이: 옆에서 밀면 천천히 밀리고, 플레이어는 통과하지 못한다
  for (const b of s.enemies) {
    if (b.state !== "ball" || !overlaps(p, b)) continue;
    const vOverlap = Math.min(p.y + p.h, b.y + b.h) - Math.max(p.y, b.y);
    if (vOverlap < 6) continue;
    const side: 1 | -1 = p.x + p.w / 2 < b.x + b.w / 2 ? 1 : -1;
    if (control && input.move === side) b.vx = side * BALL.pushSpeed;
    const before = p.x;
    p.x = side > 0 ? b.x - p.w - 0.01 : b.x + b.w + 0.01;
    if (bodyHitsSolid(s.level, p)) p.x = before;
  }

  if (!control) return;
  const front = ballInFront(s);
  const wantsKick = input.kick || (s.easyPush && input.fire && front !== null);
  if (wantsKick && front && p.kickCooldown <= 0) {
    kickBall(s, front, p.facing, events);
    p.kickCooldown = BALL.kickCooldown;
    p.kickAnim = 0;
    // 간편 조작: 이번 공격 키는 차기에 썼다
    p.shootCooldown = Math.max(p.shootCooldown, 0.12);
    return;
  }
  const max = p.rapid > 0 ? SHOT.rapidMaxOnScreen : SHOT.maxOnScreen;
  if (input.fire && p.shootCooldown <= 0 && s.shots.length < max) {
    const giant = p.giant > 0;
    const size = giant ? SHOT.w + 4 : SHOT.w;
    s.shots.push({
      x: p.x + p.w / 2 + p.facing * 6 - size / 2,
      y: p.y + 3,
      vx: p.facing * SHOT.speed + p.vx * 0.3,
      vy: -25,
      life: SHOT.life,
      w: size,
      h: size,
      giant,
    });
    p.shootCooldown = p.rapid > 0 ? SHOT.rapidCooldown : SHOT.cooldown;
    p.shootAnim = 0;
    events.push({ type: "shoot" });
  }
}

// ── 눈송이 ──

function stepShots(s: GameState, events: GameEvent[], dt: number) {
  const next = [];
  for (const shot of s.shots) {
    shot.life -= dt;
    shot.vy += SHOT.gravity * dt;
    if (s.stage.wind) shot.vx += s.wind * WIND_ACCEL * dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    if (shot.life <= 0 || bodyHitsSolid(s.level, shot)) continue;
    let hit = false;
    for (const e of s.enemies) {
      if ((e.state !== "active" && e.state !== "ball") || !overlaps(shot, e, -1)) continue;
      hit = true;
      if (e.state === "ball") {
        // 갇힌 눈덩이에 눈을 더 뿌리면 탈출 시간이 늦춰진다
        e.ballTime = Math.max(0, e.ballTime - 1.5);
        if (e.crack > 0 && e.ballTime < escapeTime(e) * BALL.crack1) e.crack = 0;
        events.push({ type: "snowHit", level: 3, x: shot.x, y: shot.y });
      } else snowHit(s, e, shot.giant ? SNOW.giantHit : 1, shot.vx > 0 ? 1 : -1, events);
      break;
    }
    const boss = s.boss;
    if (!hit && boss && boss.state !== "dead" && boss.state !== "dying" && overlaps(shot, boss)) {
      hit = true;
      events.push({ type: "tink", x: shot.x, y: shot.y });
    }
    if (!hit) next.push(shot);
  }
  s.shots = next;
}

export function snowHit(s: GameState, e: Enemy, amount: number, dir: 1 | -1, events: GameEvent[]) {
  e.snow = Math.min(SNOW.hitsToFreeze, e.snow + amount);
  e.sinceHit = 0;
  s.score += POINTS.snowHit;
  events.push({ type: "snowHit", level: e.snow, x: e.x + e.w / 2, y: e.y + e.h / 2 });
  if (e.snow >= SNOW.hitsToFreeze) freeze(s, e, events);
  else if (e.grounded) e.x += dir * 1.5;
}

/** 크기를 바꿀 때 벽에 박히지 않도록 좌우로 조금씩 밀어 빈 자리를 찾는다 */
function settle(s: GameState, b: Body) {
  if (!bodyHitsSolid(s.level, b)) return;
  const x0 = b.x;
  for (let d = 1; d <= 12; d++) {
    for (const dir of [1, -1]) {
      b.x = x0 + dir * d;
      if (!bodyHitsSolid(s.level, b)) return;
    }
  }
  b.x = x0;
}

function resize(s: GameState, e: Enemy, w: number, h: number) {
  const cx = e.x + e.w / 2;
  const bottom = e.y + e.h;
  e.w = w;
  e.h = h;
  e.x = cx - w / 2;
  e.y = bottom - h;
  settle(s, e);
}

export function freeze(s: GameState, e: Enemy, events: GameEvent[]) {
  e.state = "ball";
  e.snow = SNOW.hitsToFreeze;
  e.ballTime = 0;
  e.crack = 0;
  e.vx = 0;
  e.angry = 0;
  resize(s, e, BALL.size, BALL.size);
  s.score += POINTS.freeze;
  events.push({ type: "freeze", x: e.x + e.w / 2, y: e.y + e.h / 2 });
}

function escapeTime(e: Enemy) {
  return e.enhanced ? BALL.enhancedEscape : BALL.escapeTime;
}

// ── 적 ──

function stepEnemies(s: GameState, events: GameEvent[], dt: number) {
  for (const e of s.enemies) {
    switch (e.state) {
      case "active":
        stepActive(s, e, dt);
        break;
      case "ball":
        stepBall(s, e, events, dt);
        break;
      case "rolling":
        stepRolling(s, e, events, dt);
        break;
      case "dead":
        e.deadTime += dt;
        e.vy += GRAVITY * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        break;
    }
  }
  // 쓰러짐 연출이 끝난 적은 목록에서 뺀다
  s.enemies = s.enemies.filter((e) => e.state !== "dead" || (e.deadTime < 1.2 && e.y < WORLD_H + 40));
}

function enemySpeed(s: GameState, e: Enemy) {
  const level = Math.min(e.snow, 2);
  return ENEMY[e.kind].speed * s.stage.speedScale * (e.angry > 0 ? BALL.angryScale : 1) * SNOW.slowFactor[level];
}

function stepActive(s: GameState, e: Enemy, dt: number) {
  const p = s.player;
  e.angry = Math.max(0, e.angry - dt);
  e.thinkTimer -= dt;
  e.hopTimer -= dt;
  // 마지막 명중 후 시간이 지나면 눈이 한 단계씩 녹는다 (강화 적은 더 빨리)
  e.sinceHit += dt * (e.enhanced ? 1.3 : 1);
  if (e.snow > 0 && e.sinceHit >= SNOW.decayDelay) {
    e.snow--;
    e.sinceHit = SNOW.decayDelay - SNOW.decayStep;
  }
  const speed = enemySpeed(s, e);
  const stiff = e.snow >= SNOW.harmlessLevel;
  const pcx = p.x + p.w / 2;
  const ecx = e.x + e.w / 2;
  const playerAbove = p.y + p.h < e.y - 8;
  const playerBelow = p.y > e.y + e.h + 8;

  if (e.kind === "bat") {
    e.phase += dt * 2.2;
    if (stiff) {
      // 몸이 굳으면 천천히 내려앉는다
      e.vx = approach(e.vx, 0, 60 * dt);
      const r = moveBody(s.level, s.platforms, e, dt, { gravity: 260 });
      if (r.wall) e.vx = 0;
    } else {
      const targetY = Math.min(Math.max(p.y - 18 + Math.sin(e.phase) * 14, 24), WORLD_H - 40);
      if (Math.abs(pcx - ecx) > 24) e.dir = pcx > ecx ? 1 : -1;
      e.vx = approach(e.vx, e.dir * speed, 70 * dt);
      e.vy = Math.max(-speed * 0.8, Math.min(speed * 0.8, (targetY - e.y) * 1.2));
      const r = moveBody(s.level, s.platforms, e, dt, { gravity: 0, platforms: false });
      if (r.wall) {
        e.dir = r.wall > 0 ? -1 : 1;
        e.vx = e.dir * speed * 0.5;
      }
      if (r.ceiling || e.grounded) e.vy = 0;
    }
  } else if (e.kind === "hopper") {
    if (e.grounded) {
      e.vx = approach(e.vx, 0, 400 * dt);
      if (e.hopTimer <= 0 && !stiff) {
        e.dir = Math.abs(pcx - ecx) > 8 ? (pcx > ecx ? 1 : -1) : e.dir;
        e.vy = -AI.hopVelocity * (e.snow > 0 ? 0.75 : 1);
        e.vx = e.dir * speed;
        e.grounded = false;
        e.onPlatform = -1;
        e.hopTimer = randomRange(s, AI.hopInterval[0], AI.hopInterval[1]);
      }
    }
    const r = moveBody(s.level, s.platforms, e, dt);
    if (r.wall) {
      e.dir = r.wall > 0 ? -1 : 1;
      e.vx = e.dir * Math.abs(e.vx);
    }
  } else {
    // Imp·Runner: 걷다가 벽·눈덩이에서 돌고, 발판 끝에서는 떨어지거나 돈다. 플레이어가 위에 있으면 가끔 위층으로 뛴다.
    if (e.grounded) {
      if (!groundAhead(s.level, s.platforms, e, e.dir) && e.hopTimer <= 0) {
        const chance = e.kind === "imp" ? AI.impDropChance : playerBelow ? AI.runnerDropChance : 0.05;
        if (nextRandom(s) < chance) e.hopTimer = 0.5;
        else e.dir = e.dir === 1 ? -1 : 1;
      }
      e.vx = e.dir * speed;
      if (e.thinkTimer <= 0) {
        e.thinkTimer = AI.thinkInterval * randomRange(s, 0.7, 1.3);
        const reachable = floorAbove(s.level, ecx, e.y + e.h, 70) !== null;
        if (playerAbove && reachable && !stiff && e.snow === 0 && nextRandom(s) < 0.6) {
          e.vy = -AI.jumpVelocity;
          e.grounded = false;
          e.onPlatform = -1;
        }
      }
    }
    if (!stiff || e.grounded) {
      for (const b of s.enemies) {
        if (b === e || b.state !== "ball" || !overlaps(e, b)) continue;
        if (Math.sign(b.x + b.w / 2 - ecx) === e.dir) e.dir = e.dir === 1 ? -1 : 1;
      }
    }
    const r = moveBody(s.level, s.platforms, e, dt);
    if (r.wall) e.dir = r.wall > 0 ? -1 : 1;
  }

  // 끼임 방지: 오래 제자리면 방향을 바꾸고 뛰어 본다
  e.stuckTimer += dt;
  if (e.stuckTimer >= AI.stuckTime) {
    if (Math.abs(e.x - e.stuckX) < 6 && !stiff) {
      e.dir = e.dir === 1 ? -1 : 1;
      if (e.grounded && e.kind !== "bat") {
        e.vy = -AI.jumpVelocity * 0.8;
        e.grounded = false;
      }
    }
    e.stuckTimer = 0;
    e.stuckX = e.x;
  }
  keepInside(s, e);
}

/** 화면 밖으로 나가거나 벽 속에 들어가면 안쪽으로 되돌린다 (안전장치) */
function keepInside(s: GameState, e: Enemy) {
  e.x = Math.min(Math.max(e.x, 16.5), WORLD_W - 16.5 - e.w);
  if (e.y > WORLD_H) {
    const sp = s.level.spawns.find((x) => x.kind !== "boss");
    e.x = (sp?.x ?? WORLD_W / 2) - e.w / 2;
    e.y = 40;
    e.vy = 0;
  }
  if (bodyHitsSolid(s.level, e)) settle(s, e);
}

function stepBall(s: GameState, e: Enemy, events: GameEvent[], dt: number) {
  e.ballTime += dt;
  moveBody(s.level, s.platforms, e, dt);
  e.vx = 0;
  const limit = escapeTime(e);
  if (e.crack < 1 && e.ballTime >= limit * BALL.crack1) {
    e.crack = 1;
    events.push({ type: "crack", level: 1, x: e.x + e.w / 2, y: e.y + e.h / 2 });
  }
  if (e.crack < 2 && e.ballTime >= limit * BALL.crack2) {
    e.crack = 2;
    events.push({ type: "crack", level: 2, x: e.x + e.w / 2, y: e.y + e.h / 2 });
  }
  if (e.ballTime >= limit) {
    // 탈출: 원래 크기로 돌아와 잠시 빨라진다
    e.state = "active";
    e.snow = 0;
    e.sinceHit = 0;
    e.crack = 0;
    e.angry = BALL.angryTime;
    const size = ENEMY[e.kind];
    resize(s, e, size.w, size.h);
    e.vy = -150;
    e.grounded = false;
    events.push({ type: "escape", x: e.x + e.w / 2, y: e.y + e.h / 2 });
  }
}

function stepRolling(s: GameState, e: Enemy, events: GameEvent[], dt: number) {
  e.rollTime += dt;
  e.vx = e.dir * BALL.rollSpeed;
  const r = moveBody(s.level, s.platforms, e, dt);
  if (r.wall) {
    e.bounces++;
    if (e.bounces > BALL.maxBounces) return shatter(s, e, events);
    e.dir = r.wall > 0 ? -1 : 1;
    events.push({ type: "bounce", x: e.x + e.w / 2, y: e.y + e.h / 2 });
  }
  if (e.rollTime >= BALL.maxRollTime || e.y > WORLD_H) shatter(s, e, events);
}

/** 굴러가는 눈덩이의 충돌: 적·멈춘 눈덩이는 쓰러뜨리고(연쇄), 다른 굴러가는 눈덩이와는 서로 튕기고, 보스는 1번 타격 */
function stepRollingHits(s: GameState, events: GameEvent[]) {
  for (const ball of s.enemies) {
    if (ball.state !== "rolling") continue;
    for (const other of s.enemies) {
      if (other === ball || ball.state !== "rolling") continue;
      if (other.state === "active" || other.state === "ball") {
        if (overlaps(ball, other, 1)) knockOut(s, ball, other, events);
      } else if (other.state === "rolling" && other.id > ball.id && overlaps(ball, other, 2)) {
        // 마주 보고 부딪히면 둘 다 방향을 바꾼다 (겹치지 않게 떼어 놓는다)
        const side: 1 | -1 = ball.x < other.x ? 1 : -1;
        if (ball.dir === side || other.dir === -side) {
          ball.dir = side === 1 ? -1 : 1;
          other.dir = side;
          const overlap = side > 0 ? ball.x + ball.w - other.x : other.x + other.w - ball.x;
          ball.x -= (side * overlap) / 2;
          other.x += (side * overlap) / 2;
          settle(s, ball);
          settle(s, other);
          ball.bounces++;
          other.bounces++;
          events.push({ type: "bounce", x: (ball.x + other.x) / 2 + ball.w / 2, y: ball.y + ball.h / 2 });
        }
      }
    }
    const boss = s.boss;
    if (ball.state === "rolling" && boss && (boss.state === "walk" || boss.state === "telegraph" || boss.state === "hurt") && boss.invulnerable <= 0 && overlaps(ball, boss)) {
      hitBoss(s, ball, events);
    }
  }
}

function addShake(s: GameState, amount: number) {
  if (amount > s.shake.amount || s.shake.time <= 0) s.shake.amount = amount;
  s.shake.time = SHAKE.time;
}

function popup(s: GameState, x: number, y: number, text: string, big = false) {
  // 연쇄 표시는 가장 최근 것 하나만 크게 (글자가 겹치지 않게)
  if (big) s.popups = s.popups.filter((p) => !p.big);
  s.popups.push({ x, y, text, life: big ? 1.1 : 0.8, big });
  if (s.popups.length > 24) s.popups.shift();
}

/** 굴러가는 눈덩이에 맞아 쓰러짐 */
function knockOut(s: GameState, ball: Enemy, target: Enemy, events: GameEvent[]) {
  ball.chain++;
  const points = CHAIN_POINTS[Math.min(ball.chain, CHAIN_POINTS.length) - 1];
  s.score += points;
  s.stats.kills++;
  s.stats.bestChain = Math.max(s.stats.bestChain, ball.chain);
  const x = target.x + target.w / 2;
  const y = target.y;
  if (target.state === "ball") s.score += POINTS.contained;
  target.state = "dead";
  target.deadTime = 0;
  target.vx = ball.dir * 110;
  target.vy = -280;
  popup(s, x, y, String(points));
  if (ball.chain >= 2) {
    popup(s, x, y - 14, `${ball.chain} CHAIN!`, true);
    addShake(s, ball.chain >= 4 ? SHAKE.chain4 : SHAKE.chain2);
  }
  events.push({ type: "kill", chain: ball.chain, points, x, y });
  maybeDropItem(s, x, y, events);
}

function shatter(s: GameState, ball: Enemy, events: GameEvent[]) {
  const x = ball.x + ball.w / 2;
  const y = ball.y + ball.h / 2;
  s.score += POINTS.contained;
  s.stats.kills++;
  popup(s, x, y - 6, String(POINTS.contained));
  ball.state = "dead";
  ball.deadTime = 0;
  ball.vx = 0;
  ball.vy = -200;
  events.push({ type: "shatter", chain: ball.chain, x, y });
  // 큰 연쇄 보상: 3연쇄 별사탕, 4연쇄 이상 보석
  if (ball.chain >= BONUS.gemChain) spawnItem(s, "gem", x, y, events);
  else if (ball.chain >= BONUS.candyChain) spawnItem(s, "candy", x, y, events);
  else maybeDropItem(s, x, y, events);
}

function hitBoss(s: GameState, ball: Enemy, events: GameEvent[]) {
  const boss = s.boss as Boss;
  boss.hp--;
  boss.invulnerable = BOSS.invulnerable;
  s.score += POINTS.bossHit;
  const x = boss.x + boss.w / 2;
  popup(s, x, boss.y - 4, String(POINTS.bossHit));
  addShake(s, SHAKE.boss);
  events.push({ type: "bossHit", hp: boss.hp, x, y: boss.y + boss.h / 2 });
  shatter(s, ball, events);
  if (boss.hp <= 0) {
    boss.state = "dying";
    boss.timer = 0;
    boss.vx = 0;
    s.score += POINTS.bossDefeat;
    popup(s, x, boss.y - 18, String(POINTS.bossDefeat), true);
    events.push({ type: "bossDefeat", x, y: boss.y + boss.h / 2 });
    // 남은 졸개는 함께 쓰러진다 (보스를 이기면 바로 스테이지가 끝나도록)
    for (const e of s.enemies) {
      if (e.state === "dead") continue;
      e.state = "dead";
      e.deadTime = 0;
      e.vx = (e.x < x ? -1 : 1) * 90;
      e.vy = -240;
    }
  } else {
    boss.state = "hurt";
    boss.timer = 0;
    boss.vx = (ball.dir > 0 ? 1 : -1) * 40;
  }
}

// ── 아이템 ──

function pickItemKind(s: GameState): ItemKind {
  const canLife = s.player.lives < PLAYER.maxLives && !s.lifeDroppedThisStage;
  const entries = (Object.entries(ITEMS.weights) as [ItemKind, number][]).filter(([k]) => k !== "life" || canLife);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = nextRandom(s) * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[0][0];
}

function maybeDropItem(s: GameState, x: number, y: number, events: GameEvent[]) {
  const onField = s.items.some((i) => i.kind !== "candy" && i.kind !== "gem");
  if (onField || s.itemsThisStage >= ITEMS.perStage || s.itemCooldown > 0) return;
  if (nextRandom(s) >= ITEMS.dropChance) return;
  const kind = pickItemKind(s);
  if (kind === "life") s.lifeDroppedThisStage = true;
  s.itemsThisStage++;
  s.itemCooldown = ITEMS.cooldown;
  spawnItem(s, kind, x, y, events);
}

export function spawnItem(s: GameState, kind: ItemKind | BonusKind, x: number, y: number, events: GameEvent[]) {
  const size = ITEMS.size;
  const item: Item = {
    id: s.nextId++,
    kind,
    x: Math.min(Math.max(x - size / 2, 17), WORLD_W - 17 - size),
    y: Math.min(y - size, WORLD_H - 32),
    w: size,
    h: size,
    vx: 0,
    vy: -180,
    grounded: false,
    onPlatform: -1,
    life: ITEMS.life,
  };
  settle(s, item);
  s.items.push(item);
  events.push({ type: "itemSpawn", kind });
}

function stepItems(s: GameState, events: GameEvent[], dt: number, collect: boolean) {
  const p = s.player;
  const next: Item[] = [];
  for (const it of s.items) {
    it.life -= dt;
    moveBody(s.level, s.platforms, it, dt);
    it.vx = 0;
    if (collect && p.alive && overlaps(p, it)) {
      applyItem(s, it, events);
      continue;
    }
    if (it.life > 0) next.push(it);
  }
  s.items = next;
}

function applyItem(s: GameState, it: Item, events: GameEvent[]) {
  const p = s.player;
  const x = it.x + it.w / 2;
  const y = it.y;
  switch (it.kind) {
    case "boots":
      p.speedBoost = ITEMS.duration;
      break;
    case "rapid":
      p.rapid = ITEMS.duration;
      break;
    case "giant":
      p.giant = ITEMS.duration;
      break;
    case "shield":
      p.shield = true;
      break;
    case "life":
      p.lives = Math.min(PLAYER.maxLives, p.lives + 1);
      break;
  }
  const points = it.kind === "candy" ? POINTS.candy : it.kind === "gem" ? POINTS.gem : POINTS.itemPickup;
  s.score += points;
  popup(s, x, y, it.kind === "life" ? "1UP" : String(points));
  events.push({ type: "item", kind: it.kind, x, y });
}

// ── 보스 ──

function stepBoss(s: GameState, events: GameEvent[], dt: number) {
  const boss = s.boss;
  if (!boss || boss.state === "dead") return;
  boss.invulnerable = Math.max(0, boss.invulnerable - dt);
  boss.timer += dt;
  const p = s.player;
  switch (boss.state) {
    case "dying":
      boss.vx = 0;
      moveBody(s.level, s.platforms, boss, dt);
      if (boss.timer >= BOSS.dyingTime) boss.state = "dead";
      return;
    case "hurt":
      boss.vx = approach(boss.vx, 0, 80 * dt);
      if (boss.timer >= 0.5) {
        boss.state = "walk";
        boss.timer = 0;
      }
      break;
    case "telegraph":
      boss.vx = 0;
      if (boss.timer >= BOSS.telegraph) {
        // 톱니를 플레이어 쪽으로 던진다: 같은 층이면 바닥을 굴러가고, 위층이면 포물선
        const dir: 1 | -1 = p.x + p.w / 2 > boss.x + boss.w / 2 ? 1 : -1;
        boss.dir = dir;
        const high = p.y + p.h < boss.y;
        const size = BOSS.gearSize;
        s.gears.push({
          x: boss.x + boss.w / 2 - size / 2 + dir * 12,
          y: boss.y + boss.h - size - (high ? 18 : 0),
          w: size,
          h: size,
          vx: dir * BOSS.gearSpeed,
          vy: high ? -300 : 0,
          grounded: false,
          onPlatform: -1,
          life: 6,
          spin: 0,
        });
        events.push({ type: "bossThrow" });
        boss.state = "walk";
        boss.timer = 0;
        boss.attackTimer = BOSS.attackInterval;
      }
      break;
    case "walk":
      boss.vx = boss.dir * BOSS.speed * s.stage.speedScale;
      boss.attackTimer -= dt;
      if (boss.attackTimer <= 0) {
        boss.state = "telegraph";
        boss.timer = 0;
        events.push({ type: "bossTelegraph" });
      }
      break;
  }
  const r = moveBody(s.level, s.platforms, boss, dt);
  if (r.wall) boss.dir = r.wall > 0 ? -1 : 1;

  // 졸개 소환: 눈덩이 재료를 계속 공급한다(보스는 눈덩이로만 쓰러뜨릴 수 있으므로)
  boss.spawnTimer -= dt;
  const minions = s.enemies.filter((e) => e.minion && e.state !== "dead").length;
  if (boss.spawnTimer <= 0) {
    boss.spawnTimer = BOSS.spawnInterval;
    const actives = s.enemies.filter((e) => e.state === "active" || e.state === "ball").length;
    if (minions < BOSS.maxMinions && boss.spawned < BOSS.maxSpawned && actives < 5) {
      const m = makeEnemy(s, "imp", boss.x + boss.w / 2, boss.y + 4, true, true);
      m.vy = -260;
      m.dir = nextRandom(s) < 0.5 ? -1 : 1;
      m.vx = m.dir * 50;
      settle(s, m);
      s.enemies.push(m);
      boss.spawned++;
      events.push({ type: "minion" });
    }
  }
}

function stepGears(s: GameState, dt: number) {
  const next = [];
  for (const g of s.gears) {
    g.life -= dt;
    g.spin += dt * 12 * Math.sign(g.vx);
    const vx = g.vx;
    const r = moveBody(s.level, s.platforms, g, dt);
    g.vx = vx;
    if (r.wall || g.life <= 0 || g.y > WORLD_H) continue;
    next.push(g);
  }
  s.gears = next;
}

// ── 피해 ──

function checkPlayerDamage(s: GameState, events: GameEvent[]) {
  const p = s.player;
  if (!p.alive || p.invulnerable > 0 || s.phase !== "play") return;
  let source: { x: number; w: number } | null = null;
  for (const e of s.enemies) {
    if (e.state === "active" && e.snow < SNOW.harmlessLevel && overlaps(p, e, 2)) source = e;
  }
  const boss = s.boss;
  if (boss && (boss.state === "walk" || boss.state === "telegraph" || boss.state === "hurt") && overlaps(p, boss, 3)) source = boss;
  const gear = s.gears.find((g) => overlaps(p, g, 2));
  if (gear) {
    source = gear;
    s.gears = s.gears.filter((g) => g !== gear);
  }
  if (source) damagePlayer(s, source, events);
}

export function damagePlayer(s: GameState, source: { x: number; w: number }, events: GameEvent[]) {
  const p = s.player;
  const away: 1 | -1 = p.x + p.w / 2 < source.x + source.w / 2 ? -1 : 1;
  if (p.shield) {
    p.shield = false;
    p.invulnerable = 1.2;
    events.push({ type: "shieldBlock" });
    return;
  }
  p.lives--;
  p.hurt = PLAYER.hurtTime;
  p.invulnerable = PLAYER.invulnerable;
  p.vx = away * 110;
  p.vy = -220;
  p.grounded = false;
  events.push({ type: "hurt" });
  if (p.lives <= 0) {
    p.alive = false;
    p.vy = -320;
    s.phase = "dying";
    s.phaseTime = 0;
  }
}
