import { bossCycle, difficulty, GAME_CONFIG } from "../config";
import type {
  Bullet,
  Enemy,
  GameEvent,
  GamePhase,
  GameState,
  InputSnapshot,
  Player,
  PowerUpKind,
  Vec,
} from "../types";
import { bezier, divePath, easedProgress, returnPath } from "./paths";
import { random, weightedPick } from "./rng";
import { buildWave, isBossWave } from "./waves";

/*
 * Star Vanguard 게임 규칙.
 * 브라우저·Phaser·React에 의존하지 않는다. 렌더러는 GameState를 읽기만 하고,
 * 상태 변경은 아래 export 함수로만 한다. 난수는 GameState.rng(시드)로만 만들므로
 * 같은 시드와 같은 입력이면 항상 같은 결과가 나온다.
 *
 * 점수 지급 원칙: 적은 hp가 0이 되는 순간 한 번만 처리(killEnemy)하고 즉시 목록에서 빠지므로
 * 같은 적에 대한 점수가 두 번 지급되지 않는다.
 */

const { width: W, height: H, player: P, powerUps: PU } = GAME_CONFIG;
const DEG = Math.PI / 180;
const RUNNING: readonly GamePhase[] = ["waveIntro", "playing", "waveClear"];

function createPlayer(): Player {
  return {
    x: W / 2,
    y: P.y,
    alive: true,
    respawnAt: 0,
    invincibleUntil: 0,
    fireCooldown: 0,
    shield: false,
    rapidUntil: 0,
    doubleUntil: 0,
  };
}

export function createGame(highScore = 0, seed = 1): GameState {
  return {
    phase: "ready",
    resumePhase: "playing",
    phaseUntil: 0,
    time: 0,
    score: 0,
    highScore,
    lives: GAME_CONFIG.startingLives,
    wave: 1,
    player: createPlayer(),
    enemies: [],
    playerBullets: [],
    enemyBullets: [],
    powerUps: [],
    pendingDives: [],
    nextDiveAt: 0,
    lastDropAt: 0,
    gameOverAt: null,
    nextId: 1,
    rng: seed | 0,
  };
}

/** 새 게임 시작 (처음 시작·다시 시작 모두). 최고 점수는 유지한다. */
export function startGame(state: GameState, seed?: number): GameEvent[] {
  const fresh = createGame(state.highScore, seed ?? state.rng);
  Object.assign(state, fresh);
  const events: GameEvent[] = [];
  beginWave(state, 1, events);
  return events;
}

export function togglePause(state: GameState) {
  if (state.phase === "paused") state.phase = state.resumePhase;
  else pause(state);
}

export function pause(state: GameState) {
  if (!RUNNING.includes(state.phase)) return;
  state.resumePhase = state.phase;
  state.phase = "paused";
}

export function isBossWaveNumber(wave: number) {
  return isBossWave(wave);
}

/** 웨이브 클리어 시 받는 보너스 (5웨이브마다 생존 보너스 포함) */
export function waveClearBonus(wave: number) {
  const { waveClear, survivalBonus, survivalEvery } = GAME_CONFIG.score;
  return waveClear + (wave % survivalEvery === 0 ? survivalBonus : 0);
}

/** 한 고정 시간 간격만큼 게임을 진행하고, 그동안 일어난 이벤트를 돌려준다. */
export function stepGame(state: GameState, input: InputSnapshot, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (!RUNNING.includes(state.phase)) return events;
  state.time += dt;

  updatePlayer(state, input, dt, events);
  updateEnemies(state, dt);
  updateBullets(state, dt);
  updatePowerUps(state, dt, events);
  handleCollisions(state, events);
  scheduleDives(state, events);
  updatePhase(state, events);
  return events;
}

// ── 웨이브·단계 ──

function beginWave(state: GameState, wave: number, events: GameEvent[]) {
  state.wave = wave;
  state.enemies = buildWave(state, wave);
  state.pendingDives = [];
  state.phase = "waveIntro";
  state.phaseUntil = state.time + GAME_CONFIG.timing.waveIntro;
  events.push({ type: "waveStarted", wave, boss: isBossWave(wave) });
}

function updatePhase(state: GameState, events: GameEvent[]) {
  if (state.gameOverAt !== null) {
    if (state.time >= state.gameOverAt) {
      state.phase = "gameOver";
      state.gameOverAt = null;
      state.highScore = Math.max(state.highScore, state.score);
      events.push({ type: "gameOver", score: state.score });
    }
    return;
  }

  switch (state.phase) {
    case "waveIntro":
      if (state.time >= state.phaseUntil) {
        state.phase = "playing";
        state.nextDiveAt = state.time + 2;
      }
      break;
    case "playing":
      // 급강하 중 화면 밖에 있는 적도 enemies에 남아 있으므로, 목록이 비었을 때만 웨이브가 끝난다.
      if (state.enemies.length === 0) {
        const bonus = waveClearBonus(state.wave);
        addScore(state, bonus);
        state.enemyBullets = [];
        state.pendingDives = [];
        state.phase = "waveClear";
        state.phaseUntil = state.time + GAME_CONFIG.timing.waveClear;
        events.push({ type: "waveCleared", wave: state.wave, bonus });
      }
      break;
    case "waveClear":
      if (state.time >= state.phaseUntil) beginWave(state, state.wave + 1, events);
      break;
    default:
      break;
  }
}

function addScore(state: GameState, points: number) {
  state.score += points;
  if (state.score > state.highScore) state.highScore = state.score;
}

// ── 플레이어 ──

function updatePlayer(state: GameState, input: InputSnapshot, dt: number, events: GameEvent[]) {
  const p = state.player;
  if (!p.alive) {
    if (state.gameOverAt === null && state.lives > 0 && state.time >= p.respawnAt) respawn(state, events);
    return;
  }

  p.x = Math.min(Math.max(p.x + input.move * P.speed * dt, P.margin), W - P.margin);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  if (!input.fire || p.fireCooldown > 0) return;

  const rapid = state.time < p.rapidUntil;
  const double = state.time < p.doubleUntil;
  const offsets = double ? [-P.doubleShotSpread, P.doubleShotSpread] : [0];
  const cap = (rapid ? P.rapidMaxBullets : P.maxBullets) * offsets.length;
  // 탄환 수 상한에 걸리면 쿨다운을 소모하지 않고, 탄이 사라지는 즉시 다시 쏠 수 있다.
  if (state.playerBullets.length + offsets.length > cap) return;

  for (const offset of offsets) {
    state.playerBullets.push({ id: state.nextId++, x: p.x + offset, y: p.y - 8, vx: 0, vy: -P.bulletSpeed });
  }
  p.fireCooldown = rapid ? P.rapidFireInterval : P.fireInterval;
  events.push({ type: "playerShot" });
}

function respawn(state: GameState, events: GameEvent[]) {
  const p = state.player;
  p.alive = true;
  p.x = W / 2;
  p.invincibleUntil = state.time + P.respawnInvincibility;
  p.fireCooldown = 0.3;
  // 다시 나타나는 순간 날아오던 탄에 맞지 않도록 적 탄을 지우고, 급강하도 잠시 쉰다.
  state.enemyBullets = [];
  state.nextDiveAt = Math.max(state.nextDiveAt, state.time + 1.5);
  events.push({ type: "playerRespawned" });
}

/** 플레이어가 공격을 받았을 때. 실제로 피해(또는 방어)가 일어났으면 true. */
function hitPlayer(state: GameState, events: GameEvent[]): boolean {
  const p = state.player;
  if (!p.alive || state.time < p.invincibleUntil) return false;

  if (p.shield) {
    p.shield = false;
    p.invincibleUntil = state.time + P.shieldInvincibility;
    events.push({ type: "shieldBlocked", x: p.x, y: p.y });
    return true;
  }

  p.alive = false;
  p.rapidUntil = 0;
  p.doubleUntil = 0;
  state.lives -= 1;
  state.pendingDives = [];
  events.push({ type: "playerHit", x: p.x, y: p.y });
  if (state.lives <= 0) state.gameOverAt = state.time + P.gameOverDelay;
  else p.respawnAt = state.time + P.respawnDelay;
  return true;
}

// ── 적 ──

/** 편대 자리의 현재 위치 (좌우 흔들림 + 열마다 엇갈린 세로 물결). 보스는 좌우로 순찰한다. */
export function slotPosition(state: GameState, enemy: Enemy): Vec {
  const t = state.time;
  if (enemy.kind === "core") {
    const { patrolAmplitude, patrolSpeed } = GAME_CONFIG.boss;
    return { x: enemy.slot.x + Math.sin(t * patrolSpeed) * patrolAmplitude, y: enemy.slot.y + Math.sin(t * 1.1) * 3 };
  }
  const { swayAmplitude, swaySpeed, rippleAmplitude } = GAME_CONFIG.formation;
  return {
    x: enemy.slot.x + Math.sin(t * swaySpeed) * swayAmplitude,
    y: enemy.slot.y + Math.sin(t * 1.7 + enemy.column * 0.6) * rippleAmplitude,
  };
}

/** 경로를 따라 이동. 끝까지 갔으면 true. */
function advancePath(state: GameState, enemy: Enemy, dt: number): boolean {
  const path = enemy.path;
  if (!path) return true;
  path.elapsed += dt;
  const end = path.to ?? slotPosition(state, enemy);
  const pos = bezier(path.from, path.c1, path.c2, end, easedProgress(path));
  enemy.x = pos.x;
  enemy.y = pos.y;
  return path.elapsed >= path.duration;
}

function updateEnemies(state: GameState, dt: number) {
  const d = difficulty(state.wave);
  const canAttack = state.phase === "playing" && state.player.alive;

  for (const enemy of state.enemies) {
    switch (enemy.mode) {
      case "waiting":
        if (state.time >= enemy.spawnAt) enemy.mode = "entering";
        break;
      case "entering":
      case "returning":
        if (advancePath(state, enemy, dt)) {
          enemy.mode = "formation";
          enemy.path = null;
          if (enemy.kind === "core") enemy.nextFireAt = state.time + 1;
        }
        break;
      case "formation": {
        const pos = slotPosition(state, enemy);
        enemy.x = pos.x;
        enemy.y = pos.y;
        if (!canAttack) break;
        if (enemy.kind === "core") bossFire(state, enemy);
        else if (random(state) < GAME_CONFIG.enemies[enemy.kind].formationFireRate * d.fireRate * dt) {
          enemyFire(state, enemy.x, enemy.y + 6);
        }
        break;
      }
      case "diving": {
        const done = advancePath(state, enemy, dt);
        const progress = enemy.path ? enemy.path.elapsed / enemy.path.duration : 1;
        while (enemy.pendingShots.length > 0 && enemy.pendingShots[0] <= progress) {
          enemy.pendingShots.shift();
          if (canAttack && random(state) < d.diveShotChance) enemyFire(state, enemy.x, enemy.y + 6);
        }
        if (done) {
          // 화면 아래로 빠져나간 적은 위에서 다시 나타나 편대 자리로 돌아간다(웨이브에는 계속 포함).
          enemy.mode = "returning";
          enemy.pendingShots = [];
          enemy.path = returnPath(slotPosition(state, enemy), GAME_CONFIG.returnDuration / d.speed);
          enemy.x = enemy.path.from.x;
          enemy.y = enemy.path.from.y;
        }
        break;
      }
    }
  }
}

/** 일반 적 탄. 플레이어 쪽을 겨냥하되 각도를 제한하고, 화면에 있는 탄 수 상한을 지킨다. */
function enemyFire(state: GameState, x: number, y: number): boolean {
  if (y < 0 || y > GAME_CONFIG.noFireBelowY) return false;
  const d = difficulty(state.wave);
  const normal = state.enemyBullets.reduce((count, bullet) => count + (bullet.fromBoss ? 0 : 1), 0);
  if (normal >= d.bulletCap) return false;

  const p = state.player;
  const maxAngle = GAME_CONFIG.maxAimAngleDeg * DEG;
  const angle = p.alive ? Math.min(Math.max(Math.atan2(p.x - x, p.y - y) * d.aim, -maxAngle), maxAngle) : 0;
  state.enemyBullets.push(makeBullet(state, x, y, angle, d.bulletSpeed));
  return true;
}

function makeBullet(state: GameState, x: number, y: number, angle: number, speed: number, fromBoss = false): Bullet {
  return { id: state.nextId++, x, y, vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed, fromBoss };
}

/**
 * Command Core 공격 패턴 (순서대로 반복)
 * 0: 플레이어를 겨냥한 부채꼴 / 1: 아래쪽 반원 방사 / 2: 양쪽 포문에서 두 줄 연사
 * 탄 사이 간격을 넓게 두고 보스 탄 상한을 지켜 항상 피할 틈이 있게 한다.
 */
function bossFire(state: GameState, boss: Enemy) {
  if (state.time < boss.nextFireAt) return;
  const cfg = GAME_CONFIG.boss;
  const cycle = bossCycle(state.wave);
  const speed = difficulty(state.wave).bulletSpeed * 0.85;
  const x = boss.x;
  const y = boss.y + 12;

  const shots: { x: number; y: number; angle: number; speed: number }[] = [];
  switch (boss.pattern % 3) {
    case 0: {
      const count = Math.min(cfg.fanBullets + cycle - 1, cfg.maxFanBullets);
      const p = state.player;
      const aim = Math.min(Math.max(Math.atan2(p.x - x, p.y - y), -30 * DEG), 30 * DEG);
      for (let i = 0; i < count; i++) shots.push({ x, y, angle: aim + (i - (count - 1) / 2) * cfg.fanSpreadDeg * DEG, speed });
      break;
    }
    case 1:
      for (let i = 0; i < cfg.ringBullets; i++) {
        const angle = (-70 + (140 * i) / (cfg.ringBullets - 1)) * DEG;
        shots.push({ x, y, angle, speed: speed * 0.8 });
      }
      break;
    default:
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) shots.push({ x: x + side * 12, y: y - k * 14, angle: 0, speed: speed * 1.1 });
      }
      break;
  }

  const bossBullets = state.enemyBullets.reduce((count, bullet) => count + (bullet.fromBoss ? 1 : 0), 0);
  if (bossBullets + shots.length > cfg.extraBulletCap + difficulty(state.wave).bulletCap) {
    boss.nextFireAt = state.time + 0.4;
    return;
  }
  for (const shot of shots) state.enemyBullets.push(makeBullet(state, shot.x, shot.y, shot.angle, shot.speed, true));
  boss.pattern += 1;
  boss.nextFireAt = state.time + Math.max(cfg.minFireInterval, cfg.fireInterval - 0.15 * (cycle - 1));
}

/** 일정 간격으로 편대의 일부를 급강하시킨다. 한 그룹은 0.35초 간격으로 순서대로 출발한다. */
function scheduleDives(state: GameState, events: GameEvent[]) {
  if (state.phase !== "playing" || !state.player.alive) return;
  const d = difficulty(state.wave);
  const diving = () => state.enemies.reduce((count, enemy) => count + (enemy.mode === "diving" ? 1 : 0), 0);

  // 예약된 급강하 출발
  state.pendingDives = state.pendingDives.filter((pending) => {
    if (state.time < pending.at) return true;
    const enemy = state.enemies.find((e) => e.id === pending.enemyId);
    if (enemy && enemy.mode === "formation" && diving() < d.maxDivers) beginDive(state, enemy, events);
    return false;
  });

  if (state.time < state.nextDiveAt) return;
  // 진입이 끝나기 전에는 급강하하지 않는다.
  if (state.enemies.some((e) => e.mode === "waiting" || e.mode === "entering")) {
    state.nextDiveAt = state.time + 0.5;
    return;
  }

  const candidates = state.enemies.filter((e) => e.mode === "formation" && e.kind !== "core");
  const room = Math.min(d.diveGroup, d.maxDivers - diving() - state.pendingDives.length, candidates.length);
  if (room > 0) {
    // 무작위로 고른 선두와 가까운 순서대로 묶어 편대가 줄지어 공격하는 느낌을 준다.
    const leader = candidates[Math.floor(random(state) * candidates.length)];
    const group = candidates
      .map((e) => ({ e, dist: Math.abs(e.slot.x - leader.slot.x) + Math.abs(e.slot.y - leader.slot.y) * 0.5 }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, room);
    group.forEach(({ e }, i) => state.pendingDives.push({ enemyId: e.id, at: state.time + i * 0.35 }));
  }
  // 적이 몇 대 남지 않으면 더 자주 공격해 웨이브가 늘어지지 않게 한다.
  const interval = d.diveInterval * (state.enemies.length <= 4 ? 0.6 : 1);
  state.nextDiveAt = state.time + interval;
}

function beginDive(state: GameState, enemy: Enemy, events: GameEvent[]) {
  const stats = GAME_CONFIG.enemies[enemy.kind];
  const d = difficulty(state.wave);
  enemy.mode = "diving";
  enemy.path = divePath(enemy.kind, { x: enemy.x, y: enemy.y }, state.player.x, stats.diveDuration / d.speed);
  enemy.pendingShots = [...stats.diveShots];
  events.push({ type: "enemyDived", id: enemy.id });
}

// ── 탄환·아이템 ──

function updateBullets(state: GameState, dt: number) {
  const move = (bullet: Bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    return bullet.y > -10 && bullet.y < H + 10 && bullet.x > -10 && bullet.x < W + 10;
  };
  state.playerBullets = state.playerBullets.filter(move);
  state.enemyBullets = state.enemyBullets.filter(move);
}

function updatePowerUps(state: GameState, dt: number, events: GameEvent[]) {
  const p = state.player;
  state.powerUps = state.powerUps.filter((item) => {
    item.y += PU.fallSpeed * dt;
    if (p.alive && Math.abs(item.x - p.x) <= PU.halfSize + 6 && Math.abs(item.y - p.y) <= PU.halfSize + 6) {
      applyPowerUp(state, item.kind);
      events.push({ type: "powerUpCollected", kind: item.kind, x: item.x, y: item.y });
      return false;
    }
    return item.y < H + 10;
  });
}

/**
 * 아이템 효과. 같은 아이템을 다시 얻으면 남은 시간이 처음 길이로 초기화된다(누적되지 않음).
 * Rapid Fire와 Double Shot은 함께 적용된다. Shield는 1회분만 보유한다. 목숨은 최대 5개.
 */
function applyPowerUp(state: GameState, kind: PowerUpKind) {
  const p = state.player;
  switch (kind) {
    case "rapid":
      p.rapidUntil = state.time + PU.rapidDuration;
      break;
    case "double":
      p.doubleUntil = state.time + PU.doubleDuration;
      break;
    case "shield":
      p.shield = true;
      break;
    case "life":
      state.lives = Math.min(state.lives + 1, GAME_CONFIG.maxLives);
      break;
  }
}

function maybeDropPowerUp(state: GameState, enemy: Enemy, events: GameEvent[]) {
  const isBoss = enemy.kind === "core";
  if (!isBoss) {
    if (state.time - state.lastDropAt < PU.minInterval || state.powerUps.length > 0) return;
    if (random(state) >= GAME_CONFIG.enemies[enemy.kind].dropChance) return;
  }
  const weights: Partial<Record<PowerUpKind, number>> = { ...PU.weights };
  // 목숨이 가득 차 있으면 Extra Life는 나오지 않는다.
  if (state.lives >= GAME_CONFIG.maxLives) delete weights.life;
  const kind = weightedPick(state, weights);
  state.powerUps.push({ id: state.nextId++, kind, x: Math.min(Math.max(enemy.x, 12), W - 12), y: Math.max(enemy.y, 0) });
  state.lastDropAt = state.time;
  events.push({ type: "powerUpSpawned", kind });
}

// ── 충돌 ──

function isOnScreen(enemy: Enemy) {
  return enemy.mode !== "waiting" && enemy.y > -8 && enemy.y < H + 8 && enemy.x > -8 && enemy.x < W + 8;
}

/** 적의 hp가 0이 되는 순간 한 번만 호출된다. byPlayer가 false면(보스 격파로 인한 연쇄 폭발) 점수가 없다. */
function killEnemy(state: GameState, enemy: Enemy, byPlayer: boolean, events: GameEvent[]) {
  enemy.hp = 0;
  const points = byPlayer ? GAME_CONFIG.enemies[enemy.kind].score : 0;
  if (points > 0) addScore(state, points);
  events.push({ type: "enemyKilled", id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y, points });
  if (byPlayer) maybeDropPowerUp(state, enemy, events);

  // Command Core가 격파되면 남은 호위기도 함께 폭발한다.
  if (enemy.kind === "core") {
    for (const other of state.enemies) if (other.hp > 0) killEnemy(state, other, false, events);
  }
}

function damageEnemy(state: GameState, enemy: Enemy, events: GameEvent[]) {
  if (enemy.hp <= 0) return;
  enemy.hp -= 1;
  enemy.hitAt = state.time;
  if (enemy.hp <= 0) killEnemy(state, enemy, true, events);
  else events.push({ type: "enemyHit", id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y });
}

function handleCollisions(state: GameState, events: GameEvent[]) {
  const p = state.player;

  // 플레이어 탄 ↔ 적
  state.playerBullets = state.playerBullets.filter((bullet) => {
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0 || !isOnScreen(enemy)) continue;
      const stats = GAME_CONFIG.enemies[enemy.kind];
      if (Math.abs(bullet.x - enemy.x) <= stats.halfWidth + 1 && Math.abs(bullet.y - enemy.y) <= stats.halfHeight + 3) {
        damageEnemy(state, enemy, events);
        return false;
      }
    }
    return true;
  });

  // 적 탄 ↔ 플레이어
  if (p.alive) {
    const reach = P.hitRadius + 2;
    state.enemyBullets = state.enemyBullets.filter((bullet) => {
      const dx = bullet.x - p.x;
      const dy = bullet.y - p.y;
      if (dx * dx + dy * dy > reach * reach) return true;
      // 무적 시간 중에는 탄이 그대로 통과한다.
      return !hitPlayer(state, events);
    });
  }

  // 적 비행체 ↔ 플레이어 (몸통 충돌)
  if (p.alive) {
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0 || !isOnScreen(enemy)) continue;
      const stats = GAME_CONFIG.enemies[enemy.kind];
      if (Math.abs(enemy.x - p.x) > stats.halfWidth + 4 || Math.abs(enemy.y - p.y) > stats.halfHeight + 4) continue;
      if (!hitPlayer(state, events)) continue;
      // 부딪힌 적도 파괴된다(보스는 제외).
      if (enemy.kind !== "core") killEnemy(state, enemy, true, events);
      break;
    }
  }

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}
