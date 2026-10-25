import {
  AI,
  BONUS,
  BOSS,
  BUBBLE,
  CHECKPOINT_AFTER,
  COMBO,
  COMBO_POINTS,
  ENEMY,
  EXTRA_LIFE_EVERY,
  GRAVITY,
  ITEMS,
  PHASE,
  PLAYER,
  POINTS,
  SHAKE,
  WORLD_H,
  WORLD_W,
  type BonusKind,
  type EnemyKind,
  type ItemKind,
} from "../config";
import { STAGES } from "../stages";
import type { Boss, Bubble, Enemy, GameEvent, GameState, Input, Item, Player } from "../types";
import { createMovingPlatforms, floorAbove, parseLevel, stepMovingPlatforms } from "./level";
import { bodyHitsSolid, groundAhead, moveBody, overlaps, type Body } from "./physics";
import { nextRandom, randomRange } from "./rng";

/*
 * Bubble Pop Adventure 규칙 (순수 함수, React·DOM·캔버스 비의존). stepGame이 고정 1/60초마다 상태를 한 단계 진행하고,
 * 그 사이 일어난 일을 이벤트로 돌려준다(사운드·화면 효과는 이벤트를 읽기만 한다).
 *
 * 핵심 흐름: 방울 발사 → 날아가는 동안 닿은 적을 가둠 → 천천히 떠올라 천장의 모이는 지점으로 → 플레이어가 닿으면 터짐
 *           → 닿아 있는 방울이 차례로 함께 터짐(연쇄) → 짧은 시간 안에 이어 없앤 적 수가 콤보.
 *           점프 키를 누른 채 방울을 위에서 밟으면 터지지 않고 튕겨 오른다(일시적인 발판).
 *           그대로 둔 방울은 경고 후 적이 탈출한다(화난 상태로 빨라짐).
 * 점수는 상태가 바뀌는 순간(가둠·터뜨림·쓰러뜨림·획득) 한 번만 더한다.
 */

// ── 생성 ──

export interface GameOptions {
  seed: number;
  startStage?: number;
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
    shootAnim: 9,
    coyote: 0,
    jumpBuffer: 0,
    shield: false,
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
    vdir: nextRandom(s) < 0.5 ? -1 : 1,
    angry: 0,
    thinkTimer: randomRange(s, 0.4, AI.thinkInterval),
    hopTimer: randomRange(s, AI.hopInterval[0], AI.hopInterval[1]),
    stuckTimer: 0,
    stuckX: cx,
    deadTime: 0,
    enhanced,
    minion,
  };
}

function makeBoss(cx: number): Boss {
  return {
    x: cx - BOSS.w / 2,
    y: BOSS.baseY,
    w: BOSS.w,
    h: BOSS.h,
    hp: BOSS.hp,
    state: "float",
    dir: 1,
    timer: 0,
    bob: 0,
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
    bubbles: [],
    boss: null,
    notes: [],
    sparks: [],
    items: [],
    popups: [],
    score: 0,
    nextLifeAt: EXTRA_LIFE_EVERY,
    rng: opts.seed | 0,
    time: 0,
    stageTime: 0,
    nextId: 1,
    itemsThisStage: 0,
    itemCooldown: 0,
    freeze: 0,
    combo: { count: 0, timer: 0 },
    wind: 0,
    shake: { amount: 0, time: 0 },
    stats: { kills: 0, bestCombo: 0 },
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
    if (sp.kind === "boss") s.boss = makeBoss(sp.x);
    else s.enemies.push(makeEnemy(s, sp.kind, sp.x, sp.y, stage.enhanced));
  }
  s.bubbles = [];
  s.notes = [];
  s.sparks = [];
  s.items = [];
  s.popups = [];
  s.itemsThisStage = 0;
  s.itemCooldown = 0;
  s.freeze = 0;
  s.combo = { count: 0, timer: 0 };
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
  s.combo.timer = Math.max(0, s.combo.timer - dt);
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
      // 클리어 후 잠시 동안 남은 보너스를 주울 수 있다 (적은 없으므로 피해 없음)
      stepMovingPlatforms(s.platforms, dt);
      stepPlayer(s, input, events, dt, false);
      stepBubbles(s, events, dt);
      stepEnemies(s, events, dt);
      stepItems(s, events, dt, true);
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
      stepBubbles(s, events, dt);
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
  s.freeze = Math.max(0, s.freeze - dt);
  stepMovingPlatforms(s.platforms, dt);
  if (s.stage.wind) {
    // 바람은 6초마다 방향이 바뀌고 천천히 세졌다 약해진다
    const target = Math.floor(s.stageTime / 6) % 2 === 0 ? 1 : -1;
    s.wind += Math.sign(target - s.wind) * Math.min(Math.abs(target - s.wind), dt * 0.7);
  }

  stepPlayer(s, input, events, dt, true);
  stepBubbles(s, events, dt);
  stepEnemies(s, events, dt);
  stepBoss(s, events, dt);
  stepNotes(s, dt);
  stepSparks(s, events, dt);
  stepItems(s, events, dt, true);
  checkPlayerDamage(s, events);

  // 모든 적(방울에 갇힌 적 포함)이 사라지고 보스가 쓰러지면 스테이지 클리어
  const remaining = s.enemies.some((e) => e.state !== "dead");
  const bossAlive = s.boss !== null && s.boss.state !== "dead";
  if (s.phase === "play" && !remaining && !bossAlive) {
    const timeBonus = Math.max(0, Math.round(POINTS.timeBonusMax - s.stageTime * POINTS.timeBonusPerSecond));
    const bonus = POINTS.stageClear * (s.stageIndex + 1) + timeBonus;
    addScore(s, bonus, events);
    const checkpoint = s.stageIndex === CHECKPOINT_AFTER;
    if (checkpoint) s.checkpointReached = true;
    s.phase = "clear";
    s.phaseTime = 0;
    s.notes = [];
    s.sparks = [];
    // 남은 빈 방울은 차례로 터뜨려 정리한다
    s.bubbles.forEach((b, i) => {
      if (b.popIn < 0) b.popIn = 0.15 + i * 0.08;
    });
    events.push({ type: "stageClear", bonus, checkpoint });
  }
  return events;
}

/** 플레이어 이동만 한 스텝 진행 (지도 도달 가능성 검사용: 적·방울·클리어 판정 없이) */
export function stepPlayerOnly(s: GameState, input: Input, dt: number) {
  stepMovingPlatforms(s.platforms, dt);
  stepPlayer(s, input, [], dt, false);
}

function addScore(s: GameState, points: number, events: GameEvent[]) {
  s.score += points;
  while (s.score >= s.nextLifeAt) {
    s.nextLifeAt += EXTRA_LIFE_EVERY;
    if (s.player.lives < PLAYER.maxLives && s.player.alive) {
      s.player.lives++;
      popup(s, s.player.x + s.player.w / 2, s.player.y - 6, "1UP");
      events.push({ type: "extraLife" });
    }
  }
}

function addShake(s: GameState, amount: number) {
  if (amount > s.shake.amount || s.shake.time <= 0) s.shake.amount = amount;
  s.shake.time = SHAKE.time;
}

function popup(s: GameState, x: number, y: number, text: string, big = false) {
  // 콤보 표시는 가장 최근 것 하나만 크게 (글자가 겹치지 않게)
  if (big) s.popups = s.popups.filter((p) => !p.big);
  s.popups.push({ x, y, text, life: big ? 1.1 : 0.8, big });
  if (s.popups.length > 24) s.popups.shift();
}

function approach(v: number, target: number, delta: number) {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

/** 벽 속에 들어간 몸체를 가까운 빈자리로 옮긴다 (좌우 먼저, 그다음 위아래). 못 찾으면 false */
function settle(s: GameState, b: Pick<Body, "x" | "y" | "w" | "h">, vertical = false): boolean {
  if (!bodyHitsSolid(s.level, b)) return true;
  const x0 = b.x;
  const y0 = b.y;
  for (let d = 1; d <= 14; d++) {
    for (const [dx, dy] of vertical ? [[0, d], [d, 0], [-d, 0], [0, -d]] : [[d, 0], [-d, 0]]) {
      b.x = x0 + dx;
      b.y = y0 + dy;
      if (!bodyHitsSolid(s.level, b)) return true;
    }
  }
  b.x = x0;
  b.y = y0;
  return false;
}

// ── 플레이어 ──

function stepPlayer(s: GameState, input: Input, events: GameEvent[], dt: number, canFire: boolean) {
  const p = s.player;
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.hurt = Math.max(0, p.hurt - dt);
  p.rapid = Math.max(0, p.rapid - dt);
  p.giant = Math.max(0, p.giant - dt);
  p.shootAnim += dt;
  p.jumpBuffer = input.jump ? PLAYER.jumpBuffer : Math.max(0, p.jumpBuffer - dt);
  p.coyote = p.grounded ? PLAYER.coyote : Math.max(0, p.coyote - dt);

  const control = p.hurt <= 0;
  if (control) {
    p.vx = approach(p.vx, input.move * PLAYER.speed, PLAYER.accel * (p.grounded ? 1 : 0.7) * dt);
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
  const prevBottom = p.y + p.h;
  moveBody(s.level, s.platforms, p, dt);
  p.walkTime = p.grounded && Math.abs(p.vx) > 5 ? p.walkTime + dt : 0;

  if (p.alive) touchBubbles(s, input, prevBottom, control, events);

  if (!control || !canFire) return;
  if (input.fire && p.shootCooldown <= 0) fireBubble(s, events);
}

/** 플레이어와 방울: 위에서 점프 키를 누른 채 밟으면 튕겨 오르고, 그 밖에 닿으면 터뜨린다 */
function touchBubbles(s: GameState, input: Input, prevBottom: number, control: boolean, events: GameEvent[]) {
  const p = s.player;
  let bounced = false;
  for (const b of [...s.bubbles]) {
    if (b.popIn >= 0 || !s.bubbles.includes(b)) continue;
    if (b.phase === "shot" && b.age < BUBBLE.grace) continue;
    if (!overlaps(p, b, 1)) continue;
    const fromAbove = p.vy >= 0 && prevBottom <= b.y + BUBBLE.bounceTolerance;
    const wantsBounce = control && (input.jumpHeld || p.jumpBuffer > 0);
    if (fromAbove && wantsBounce) {
      if (bounced) continue;
      bounced = true;
      const y = b.y - p.h - 0.01;
      if (!bodyHitsSolid(s.level, { x: p.x, y, w: p.w, h: p.h })) p.y = y;
      p.vy = -BUBBLE.bounceVelocity;
      p.grounded = false;
      p.onPlatform = -1;
      p.jumpBuffer = 0;
      p.coyote = 0;
      b.vy = BUBBLE.bouncePush;
      events.push({ type: "bubbleBounce", x: b.x + b.w / 2, y: b.y });
    } else popBubble(s, b, events);
  }
}

function fireBubble(s: GameState, events: GameEvent[]) {
  const p = s.player;
  if (s.bubbles.length >= BUBBLE.maxOnScreen) {
    // 가장 오래된 빈 방울을 터뜨려 자리를 만든다 (갇힌 적이 든 방울은 건드리지 않음)
    const oldest = s.bubbles.filter((b) => !b.captive && b.popIn < 0).sort((a, b) => b.age - a.age)[0];
    if (!oldest) return;
    removeBubble(s, oldest);
    events.push({ type: "fizz", x: oldest.x + oldest.w / 2, y: oldest.y + oldest.h / 2 });
  }
  const giant = p.giant > 0;
  const size = giant ? BUBBLE.giantSize : BUBBLE.size;
  const b: Bubble = {
    id: s.nextId++,
    x: p.facing > 0 ? p.x + p.w - 4 : p.x - size + 4,
    y: p.y + p.h / 2 - size / 2 - 1,
    w: size,
    h: size,
    vx: p.facing * BUBBLE.shotSpeed,
    vy: 0,
    phase: "shot",
    dir: p.facing,
    age: 0,
    shotTime: giant ? BUBBLE.giantShotTime : BUBBLE.shotTime,
    giant,
    captive: null,
    captiveTime: 0,
    popIn: -1,
    chain: 0,
  };
  // 벽에 붙어 쏘면 몸 앞이 막혀 있으므로 몸 가운데에서 바로 떠오르게 한다
  if (bodyHitsSolid(s.level, b)) {
    b.x = p.x + p.w / 2 - size / 2;
    b.phase = "float";
    b.vx = 0;
  }
  if (!settle(s, b, true)) return;
  s.bubbles.push(b);
  p.shootCooldown = p.rapid > 0 ? BUBBLE.rapidCooldown : BUBBLE.cooldown;
  p.shootAnim = 0;
  events.push({ type: "shoot", giant });
  tryCapture(s, b, events);
}

// ── 방울 ──

function removeBubble(s: GameState, b: Bubble) {
  s.bubbles = s.bubbles.filter((x) => x !== b);
}

function tryCapture(s: GameState, b: Bubble, events: GameEvent[]) {
  if (b.captive || b.phase !== "shot") return;
  const target = s.enemies.find((e) => e.state === "active" && overlaps(b, e));
  if (target) captureEnemy(s, b, target, events);
}

/** 적을 방울에 가둔다: 방울은 갇힌 적 크기로 커지고 바로 떠오르기 시작한다 */
export function captureEnemy(s: GameState, b: Bubble, e: Enemy, events: GameEvent[]) {
  e.state = "trapped";
  e.vx = 0;
  e.vy = 0;
  e.angry = 0;
  b.captive = e;
  b.captiveTime = 0;
  const size = Math.max(b.w, BUBBLE.captiveSize);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  b.w = size;
  b.h = size;
  b.x = cx - size / 2;
  b.y = cy - size / 2;
  settle(s, b, true);
  b.phase = "float";
  b.vx = 0;
  b.vy = -10;
  followBubble(b);
  addScore(s, POINTS.capture, events);
  events.push({ type: "capture", x: cx, y: cy });
}

function followBubble(b: Bubble) {
  const e = b.captive;
  if (!e) return;
  e.x = b.x + b.w / 2 - e.w / 2;
  e.y = b.y + b.h / 2 - e.h / 2;
}

/** 방울을 터뜨린다. 닿아 있는 방울은 잠시 뒤 차례로 함께 터진다(연쇄). 적이 갇혀 있었다면 쓰러뜨린다 */
export function popBubble(s: GameState, b: Bubble, events: GameEvent[]) {
  if (!s.bubbles.includes(b)) return;
  removeBubble(s, b);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const chain = b.chain || b.id;
  for (const o of s.bubbles) {
    if (o.popIn >= 0) continue;
    const reach = (b.w + o.w) / 2 + BUBBLE.chainGap;
    if (Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy) <= reach) {
      o.popIn = BUBBLE.chainDelay;
      o.chain = chain;
    }
  }
  if (b.captive) defeatCaptive(s, b.captive, cx, cy, events);
  else {
    addScore(s, POINTS.pop, events);
    events.push({ type: "pop", x: cx, y: cy });
  }
}

function defeatCaptive(s: GameState, e: Enemy, x: number, y: number, events: GameEvent[]) {
  s.combo.count = s.combo.timer > 0 ? s.combo.count + 1 : 1;
  s.combo.timer = COMBO.window;
  const combo = s.combo.count;
  const points = COMBO_POINTS[Math.min(combo, COMBO_POINTS.length) - 1];
  addScore(s, points, events);
  s.stats.kills++;
  s.stats.bestCombo = Math.max(s.stats.bestCombo, combo);
  e.state = "dead";
  e.deadTime = 0;
  e.x = x - e.w / 2;
  e.y = y - e.h / 2;
  e.vx = (nextRandom(s) < 0.5 ? -1 : 1) * randomRange(s, 40, 90);
  e.vy = -260;
  popup(s, x, y, String(points));
  if (combo >= 2) {
    popup(s, x, y - 24, `${combo} COMBO!`, true);
    addShake(s, combo >= 4 ? SHAKE.combo4 : SHAKE.combo2);
  }
  events.push({ type: "kill", combo, points, x, y });
  // 쓰러뜨린 자리에 보너스(콤보 3 이상이면 보석)
  spawnItem(s, combo >= BONUS.gemCombo ? "gem" : "candy", x, y, events, BONUS.life);
  maybeDropItem(s, x, y, events);
  const boss = s.boss;
  if (boss && boss.state !== "dying" && boss.state !== "dead") {
    s.sparks.push({ x, y, vx: 0, vy: -BOSS.sparkSpeed, life: BOSS.sparkLife });
    events.push({ type: "spark", x, y });
  }
}

/** 방울을 dx, dy만큼 옮긴다 (벽·바닥만 막힘, 발판은 통과) */
function moveBubble(s: GameState, b: Bubble, dx: number, dy: number) {
  let blockedX = false;
  let blockedY = false;
  if (dx !== 0) {
    if (!bodyHitsSolid(s.level, { x: b.x + dx, y: b.y, w: b.w, h: b.h })) b.x += dx;
    else blockedX = true;
  }
  if (dy !== 0) {
    if (!bodyHitsSolid(s.level, { x: b.x, y: b.y + dy, w: b.w, h: b.h })) b.y += dy;
    else blockedY = true;
  }
  return { blockedX, blockedY };
}

function nearestGather(s: GameState, x: number) {
  let best = s.stage.gather[0];
  for (const g of s.stage.gather) if (Math.abs(g - x) < Math.abs(best - x)) best = g;
  return best;
}

export function escapeTime(e: Enemy) {
  return e.enhanced ? BUBBLE.enhancedEscape : BUBBLE.escapeTime;
}

function stepBubbles(s: GameState, events: GameEvent[], dt: number) {
  for (const b of [...s.bubbles]) {
    if (!s.bubbles.includes(b)) continue;
    if (b.popIn >= 0) {
      b.popIn -= dt;
      if (b.popIn <= 0) popBubble(s, b, events);
      continue;
    }
    b.age += dt;
    if (b.phase === "shot") {
      const r = moveBubble(s, b, b.dir * BUBBLE.shotSpeed * dt, 0);
      tryCapture(s, b, events);
      if (b.phase === "shot" && (r.blockedX || b.age >= b.shotTime)) {
        b.phase = "float";
        b.vx = r.blockedX ? 0 : b.dir * 30;
        b.vy = 0;
      }
    } else {
      const capped = bodyHitsSolid(s.level, { x: b.x, y: b.y - 1.5, w: b.w, h: b.h });
      let tx = s.stage.wind ? s.wind * BUBBLE.windSpeed : 0;
      if (capped) {
        const d = nearestGather(s, b.x + b.w / 2) - (b.x + b.w / 2);
        if (Math.abs(d) > 3) tx += Math.sign(d) * BUBBLE.gatherSpeed;
      }
      b.vx = approach(b.vx, tx, BUBBLE.floatAccel * dt);
      b.vy = approach(b.vy, -BUBBLE.floatSpeed, BUBBLE.floatAccel * dt);
      const r = moveBubble(s, b, b.vx * dt, b.vy * dt);
      if (r.blockedX) b.vx = 0;
      if (r.blockedY) b.vy = 0;
    }

    if (b.captive) {
      followBubble(b);
      const limit = escapeTime(b.captive);
      const before = b.captiveTime;
      if (s.freeze <= 0) b.captiveTime += dt;
      if (before < limit * BUBBLE.warnAt && b.captiveTime >= limit * BUBBLE.warnAt) events.push({ type: "warn", x: b.x + b.w / 2, y: b.y + b.h / 2 });
      if (b.captiveTime >= limit) releaseCaptive(s, b, events);
    } else if (b.age >= BUBBLE.life) {
      removeBubble(s, b);
      events.push({ type: "fizz", x: b.x + b.w / 2, y: b.y + b.h / 2 });
    }
  }
  separateBubbles(s);
}

/** 떠 있는 방울끼리 겹치지 않게 살짝 밀어 낸다 (천장에 송이처럼 모인다) */
function separateBubbles(s: GameState) {
  const list = s.bubbles.filter((b) => b.phase === "float" && b.popIn < 0);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      let dx = b.x + b.w / 2 - (a.x + a.w / 2);
      let dy = b.y + b.h / 2 - (a.y + a.h / 2);
      let dist = Math.hypot(dx, dy);
      const min = (a.w + b.w) / 2;
      if (dist >= min) continue;
      if (dist < 0.01) {
        dx = a.id < b.id ? -1 : 1;
        dy = 0;
        dist = 1;
      }
      const push = ((min - dist) / 2) * 0.5;
      const nx = (dx / dist) * push;
      const ny = (dy / dist) * push;
      moveBubble(s, a, -nx, -ny);
      moveBubble(s, b, nx, ny);
      followBubble(a);
      followBubble(b);
    }
  }
}

function releaseCaptive(s: GameState, b: Bubble, events: GameEvent[]) {
  const e = b.captive as Enemy;
  removeBubble(s, b);
  e.state = "active";
  e.angry = AI.angryTime;
  e.x = b.x + b.w / 2 - e.w / 2;
  e.y = b.y + b.h / 2 - e.h / 2;
  settle(s, e, true);
  e.vx = 0;
  e.vy = e.kind === "whirlwing" ? 0 : -120;
  e.grounded = false;
  e.onPlatform = -1;
  e.stuckTimer = 0;
  e.stuckX = e.x;
  events.push({ type: "escape", x: e.x + e.w / 2, y: e.y + e.h / 2 });
}

// ── 적 ──

function stepEnemies(s: GameState, events: GameEvent[], dt: number) {
  for (const e of s.enemies) {
    if (e.state === "active") {
      if (s.freeze <= 0) stepActive(s, e, dt);
    } else if (e.state === "dead") {
      e.deadTime += dt;
      e.vy += GRAVITY * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.x < 16 || e.x + e.w > WORLD_W - 16) e.vx = -e.vx;
    }
  }
  // 쓰러짐 연출이 끝난 적은 목록에서 뺀다
  s.enemies = s.enemies.filter((e) => e.state !== "dead" || (e.deadTime < 1 && e.y < WORLD_H + 40));
}

function enemySpeed(s: GameState, e: Enemy) {
  return ENEMY[e.kind].speed * s.stage.speedScale * (e.angry > 0 ? AI.angryScale : 1);
}

function stepActive(s: GameState, e: Enemy, dt: number) {
  const p = s.player;
  e.angry = Math.max(0, e.angry - dt);
  e.thinkTimer -= dt;
  e.hopTimer -= dt;
  const speed = enemySpeed(s, e);
  const pcx = p.x + p.w / 2;
  const ecx = e.x + e.w / 2;
  const playerAbove = p.y + p.h < e.y - 8;
  const playerBelow = p.y > e.y + e.h + 8;

  if (e.kind === "whirlwing") {
    // 프로펠러 요정: 대각선으로 날며 벽·천장·바닥에서 튕긴다 (발판은 통과)
    e.vx = e.dir * speed;
    e.vy = e.vdir * speed * AI.flyerRise;
    const r = moveBody(s.level, s.platforms, e, dt, { gravity: 0, platforms: false });
    if (r.wall) e.dir = r.wall > 0 ? -1 : 1;
    if (r.ceiling) e.vdir = 1;
    if (e.grounded) {
      e.vdir = -1;
      e.grounded = false;
    }
  } else if (e.kind === "springlet") {
    if (e.grounded) {
      e.vx = approach(e.vx, 0, 400 * dt);
      if (e.hopTimer <= 0) {
        e.dir = Math.abs(pcx - ecx) > 8 ? (pcx > ecx ? 1 : -1) : e.dir;
        e.vy = -AI.hopVelocity;
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
    // Cogling·Zipwind: 걷다가 벽에서 돌고, 발판 끝에서는 떨어지거나 돈다. 플레이어가 위에 있으면 가끔 위층으로 뛴다.
    if (e.grounded) {
      if (!groundAhead(s.level, s.platforms, e, e.dir) && e.hopTimer <= 0) {
        const chance = e.kind === "cogling" ? AI.walkerDropChance : playerBelow ? AI.runnerDropChance : 0.05;
        if (nextRandom(s) < chance) e.hopTimer = 0.5;
        else e.dir = e.dir === 1 ? -1 : 1;
      }
      e.vx = e.dir * speed;
      if (e.thinkTimer <= 0) {
        e.thinkTimer = AI.thinkInterval * randomRange(s, 0.7, 1.3);
        const reachable = floorAbove(s.level, ecx, e.y + e.h, 70) !== null;
        if (playerAbove && reachable && nextRandom(s) < 0.6) {
          e.vy = -AI.jumpVelocity;
          e.grounded = false;
          e.onPlatform = -1;
        }
      }
    }
    const r = moveBody(s.level, s.platforms, e, dt);
    if (r.wall) e.dir = r.wall > 0 ? -1 : 1;
  }

  // 끼임 방지: 오래 제자리면 방향을 바꾸고 뛰어 본다
  e.stuckTimer += dt;
  if (e.stuckTimer >= AI.stuckTime) {
    if (Math.abs(e.x - e.stuckX) < 6) {
      e.dir = e.dir === 1 ? -1 : 1;
      if (e.kind === "whirlwing") e.vdir = e.vdir === 1 ? -1 : 1;
      else if (e.grounded) {
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
  if (e.y < 16.5) e.y = 16.5;
  if (e.y > WORLD_H) {
    const sp = s.level.spawns.find((x) => x.kind !== "boss");
    e.x = (sp?.x ?? WORLD_W / 2) - e.w / 2;
    e.y = 40;
    e.vy = 0;
  }
  if (bodyHitsSolid(s.level, e)) settle(s, e, true);
}

// ── 아이템 ──

function pickItemKind(s: GameState): ItemKind {
  const entries = Object.entries(ITEMS.weights) as [ItemKind, number][];
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
  s.itemsThisStage++;
  s.itemCooldown = ITEMS.cooldown;
  spawnItem(s, pickItemKind(s), x, y, events, ITEMS.life);
}

export function spawnItem(s: GameState, kind: ItemKind | BonusKind, x: number, y: number, events: GameEvent[], life: number = ITEMS.life) {
  const size = ITEMS.size;
  const item: Item = {
    id: s.nextId++,
    kind,
    x: Math.min(Math.max(x - size / 2, 17), WORLD_W - 17 - size),
    y: Math.min(Math.max(y - size / 2, 17), WORLD_H - 32),
    w: size,
    h: size,
    vx: 0,
    vy: -160,
    grounded: false,
    onPlatform: -1,
    life,
  };
  settle(s, item, true);
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
  let points: number = POINTS.itemPickup;
  switch (it.kind) {
    case "rapid":
      p.rapid = ITEMS.duration;
      break;
    case "giant":
      p.giant = ITEMS.duration;
      break;
    case "shield":
      p.shield = true;
      break;
    case "lucky":
      points = POINTS.lucky;
      break;
    case "freeze":
      s.freeze = ITEMS.freezeTime;
      break;
    case "candy":
      points = POINTS.candy;
      break;
    case "gem":
      points = POINTS.gem;
      break;
  }
  addScore(s, points, events);
  popup(s, x, y, it.kind === "freeze" ? "FREEZE!" : String(points));
  events.push({ type: "item", kind: it.kind, x, y });
}

// ── 보스 ──

function stepBoss(s: GameState, events: GameEvent[], dt: number) {
  const boss = s.boss;
  if (!boss || boss.state === "dead") return;
  boss.invulnerable = Math.max(0, boss.invulnerable - dt);
  boss.timer += dt;
  if (boss.state === "dying") {
    boss.y += 18 * dt;
    if (boss.timer >= BOSS.dyingTime) boss.state = "dead";
    return;
  }
  if (s.freeze > 0) return;
  const p = s.player;
  boss.bob += dt * 1.6;
  boss.y = BOSS.baseY + Math.sin(boss.bob) * BOSS.bob;
  if (boss.state === "hurt" && boss.timer >= 0.4) {
    boss.state = "float";
    boss.timer = 0;
  }
  if (boss.state === "telegraph") {
    if (boss.timer >= BOSS.telegraph) {
      // 플레이어 쪽으로 음표를 부채꼴로 쏜다
      const bx = boss.x + boss.w / 2;
      const by = boss.y + boss.h - 4;
      const aim = Math.atan2(p.y + p.h / 2 - by, p.x + p.w / 2 - bx);
      const half = (BOSS.notes - 1) / 2;
      for (let k = 0; k < BOSS.notes; k++) {
        const a = aim + (k - half) * BOSS.noteSpread;
        s.notes.push({
          x: bx - BOSS.noteSize / 2,
          y: by - BOSS.noteSize / 2,
          w: BOSS.noteSize,
          h: BOSS.noteSize,
          vx: Math.cos(a) * BOSS.noteSpeed,
          vy: Math.sin(a) * BOSS.noteSpeed,
          life: 6,
        });
      }
      events.push({ type: "bossShoot" });
      boss.state = "float";
      boss.timer = 0;
      boss.attackTimer = BOSS.attackInterval;
    }
  } else {
    boss.x += boss.dir * BOSS.speed * s.stage.speedScale * dt;
    const minX = 112;
    const maxX = WORLD_W - 112 - boss.w;
    if (boss.x < minX) {
      boss.x = minX;
      boss.dir = 1;
    } else if (boss.x > maxX) {
      boss.x = maxX;
      boss.dir = -1;
    }
    boss.attackTimer -= dt;
    if (boss.attackTimer <= 0 && boss.state === "float") {
      boss.state = "telegraph";
      boss.timer = 0;
      events.push({ type: "bossTelegraph" });
    }
  }

  // 졸개 소환: 가둘 재료를 계속 공급한다 (여왕은 잡은 적을 터뜨린 별빛 조각으로만 맞는다)
  boss.spawnTimer -= dt;
  if (boss.spawnTimer <= 0) {
    boss.spawnTimer = BOSS.spawnInterval;
    const minions = s.enemies.filter((e) => e.minion && e.state !== "dead").length;
    const alive = s.enemies.filter((e) => e.state !== "dead").length;
    if (minions < BOSS.maxMinions && boss.spawned < BOSS.maxSpawned && alive < 5) {
      const m = makeEnemy(s, "cogling", boss.x + boss.w / 2, boss.y + boss.h + 14, true, true);
      m.vy = -120;
      settle(s, m, true);
      s.enemies.push(m);
      boss.spawned++;
      events.push({ type: "minion" });
    }
  }
}

function stepNotes(s: GameState, dt: number) {
  if (s.freeze > 0) return;
  s.notes = s.notes.filter((n) => {
    n.life -= dt;
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    return n.life > 0 && !bodyHitsSolid(s.level, n);
  });
}

function stepSparks(s: GameState, events: GameEvent[], dt: number) {
  const boss = s.boss;
  if (!boss || boss.state === "dying" || boss.state === "dead") {
    s.sparks = [];
    return;
  }
  const bx = boss.x + boss.w / 2;
  const by = boss.y + boss.h / 2;
  const next = [];
  for (const sp of s.sparks) {
    sp.life -= dt;
    // 여왕 쪽으로 방향을 틀며 날아간다
    const dx = bx - sp.x;
    const dy = by - sp.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, BOSS.sparkTurn * dt);
    sp.vx += ((dx / d) * BOSS.sparkSpeed - sp.vx) * k;
    sp.vy += ((dy / d) * BOSS.sparkSpeed - sp.vy) * k;
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    const inside = sp.x > boss.x && sp.x < boss.x + boss.w && sp.y > boss.y && sp.y < boss.y + boss.h;
    if (inside && boss.invulnerable <= 0) {
      hitBoss(s, events);
      if (boss.hp <= 0) break;
      continue;
    }
    if (sp.life > 0) next.push(sp);
  }
  // 여왕이 쓰러지면 남은 조각은 사라진다
  s.sparks = boss.hp <= 0 ? [] : next;
}

function hitBoss(s: GameState, events: GameEvent[]) {
  const boss = s.boss as Boss;
  boss.hp--;
  boss.invulnerable = BOSS.invulnerable;
  addScore(s, POINTS.bossHit, events);
  const x = boss.x + boss.w / 2;
  popup(s, x, boss.y - 4, String(POINTS.bossHit));
  addShake(s, SHAKE.boss);
  events.push({ type: "bossHit", hp: boss.hp, x, y: boss.y + boss.h / 2 });
  if (boss.hp <= 0) {
    boss.state = "dying";
    boss.timer = 0;
    addScore(s, POINTS.bossDefeat, events);
    popup(s, x, boss.y - 18, String(POINTS.bossDefeat), true);
    events.push({ type: "bossDefeat", x, y: boss.y + boss.h / 2 });
    // 남은 졸개·방울은 함께 사라진다 (여왕을 이기면 바로 스테이지가 끝나도록)
    s.notes = [];
    for (const b of s.bubbles) if (b.captive) b.captive = null;
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
  }
}

// ── 피해 ──

function checkPlayerDamage(s: GameState, events: GameEvent[]) {
  const p = s.player;
  if (!p.alive || p.invulnerable > 0 || s.phase !== "play") return;
  let source: { x: number; w: number } | null = null;
  for (const e of s.enemies) {
    if (e.state === "active" && overlaps(p, e, 2)) source = e;
  }
  const boss = s.boss;
  if (boss && boss.state !== "dying" && boss.state !== "dead" && overlaps(p, boss, 4)) source = boss;
  const note = s.notes.find((n) => overlaps(p, n, 1));
  if (note) {
    source = note;
    s.notes = s.notes.filter((n) => n !== note);
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
