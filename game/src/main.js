// main.js — Palm City Heat's conductor: the Game state, the fixed-step
// simulation (player, traffic, police, peds, combat, missions, wanted), the
// camera, saving, and the browser boot + loop that drives it all.
// One job: own the state and advance it one 1/60 s step at a time.

import { STEP, WORLD_W, WORLD_H, PLAYER, TRAFFIC_TARGET, PED_TARGET, SPAWN_RADIUS, DESPAWN_RADIUS, SAVE_KEY } from './config.js';
import { Rng, hashString } from './random.js';
import { Input } from './input.js';
import { SoundFX } from './audio.js';
import { buildWorld, moveCircle, roadPointNear, blockPerimeterPoint, poiById, dist, clamp } from './world.js';
import { AVENUES } from './config.js';
import { makeCar, chooseNextTarget, updateTrafficCar, stepCarPhysics, resolveCarCollisions, damageCar } from './vehicles.js';
import { spawnPed, updatePeds, damagePed, knockDownPed } from './peds.js';
import { createWanted, updateWanted, updatePolice, commitCrime, clearHeat } from './police.js';
import { tryShoot, meleeSwing, updateBullets, updatePickups, placeWorldPickups } from './combat.js';
import { createMissionState, updateMissions, failMission, makeOddJob } from './missions.js';
import { drawGame } from './render.js';
import { stageShot } from './shots.js';

export class Game {
  constructor(opts = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.world = buildWorld(new Rng((opts.seed ?? 1) * 7919 + 13));
    this.input = opts.input || new Input();
    this.audio = opts.audio || new SoundFX();
    this.storage = opts.storage !== undefined ? opts.storage : null;
    this.time = 0;
    this.clockMinutes = 17 * 60 + 5; // golden hour, 17:05
    this.screen = 'menu'; // menu | playing | paused | busted | wasted
    this.screenTimer = 0;
    this.viewW = 1280;
    this.viewH = 720;
    this.camera = { x: 2240, y: 1600 };
    this.cars = [];
    this.peds = [];
    this.bullets = [];
    this.particles = [];
    this.pickups = [];
    this.floaters = [];
    this.wanted = createWanted();
    this.missions = createMissionState();
    this.lastShotAt = -10;
    this.lastShotX = 0;
    this.lastShotY = 0;
    this.spawnTimer = 0;
    this.player = {
      x: 500, y: 393, angle: -Math.PI / 2, hp: PLAYER.maxHp, cash: 120, ammo: 24,
      inCar: null, vx: 0, vy: 0, speedMag: 0, lastShot: -1, lastMelee: -1, hurtAt: -10,
    };
    // Parked cars fill the city's lots and curbs from the world's spots.
    for (const spot of this.world.parkedSpots) {
      if (this.rng.chance(0.72)) {
        const car = makeCar(this.rng, spot.x, spot.y, 'parked');
        car.angle = spot.angle;
        this.cars.push(car);
      }
    }
    placeWorldPickups(this);
    this.hasSave = !!this.readSave();
  }

  // --- persistence ---------------------------------------------------------

  readSave() {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  saveGame() {
    if (!this.storage) return;
    const p = this.player;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify({
        cash: p.cash, hp: p.hp, ammo: p.ammo, x: Math.round(p.x), y: Math.round(p.y),
        storyIndex: this.missions.storyIndex, storyDone: this.missions.storyDone,
        jobsDone: this.missions.jobsDone,
      }));
    } catch {
      /* storage full/blocked: the game goes on */
    }
  }

  startNewGame() {
    const p = this.player;
    p.cash = 120;
    p.hp = PLAYER.maxHp;
    p.ammo = 24;
    p.x = 500;
    p.y = 393;
    p.inCar = null;
    this.missions = createMissionState();
    clearHeat(this);
    this.screen = 'playing';
    this.saveGame();
  }

  startContinue() {
    const s = this.readSave();
    if (!s) return this.startNewGame();
    const p = this.player;
    p.cash = s.cash;
    p.hp = s.hp;
    p.ammo = s.ammo;
    p.x = s.x;
    p.y = s.y;
    p.inCar = null;
    this.missions = createMissionState();
    this.missions.storyIndex = s.storyIndex || 0;
    this.missions.storyDone = !!s.storyDone;
    this.missions.jobsDone = s.jobsDone || 0;
    if (this.missions.storyDone && !this.missions.job) {
      this.missions.job = makeOddJob(this);
    }
    clearHeat(this);
    this.screen = 'playing';
  }

  // --- helpers used across systems -----------------------------------------

  spawnParticles(x, y, n, color, speed) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const v = this.rng.range(speed * 0.3, speed);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: this.rng.range(0.25, 0.7), maxLife: 0.7, color, size: this.rng.range(1.5, 3.5),
      });
    }
  }

  addFloater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, life: 1.4 });
  }

  onPoliceCrash(car, impact) {
    damageCar(this, car, (impact - 120) / 14);
    this.audio.crash(impact > 200);
  }

  mouseWorld() {
    return {
      x: this.camera.x - this.viewW / 2 + this.input.mouseX,
      y: this.camera.y - this.viewH / 2 + this.input.mouseY,
    };
  }

  // --- the step --------------------------------------------------------------

  step() {
    const dt = STEP;
    this.time += dt;
    if (this.screen === 'menu') {
      this.updateAmbient(dt);
      if (this.input.hit('Enter') || this.input.mouseClicked) {
        this.audio.unlock();
        if (this.hasSave && this.input.hit('KeyC')) this.startContinue();
        else this.startNewGame();
      }
      if (this.input.hit('KeyC') && this.hasSave) this.startContinue();
      return;
    }
    if (this.screen === 'paused') {
      if (this.input.hit('Escape') || this.input.hit('KeyP')) this.screen = 'playing';
      return;
    }
    if (this.screen === 'busted' || this.screen === 'wasted') {
      this.screenTimer -= dt;
      this.updateAmbient(dt);
      if (this.screenTimer <= 0) this.respawn();
      return;
    }
    // playing
    if (this.input.hit('Escape') || this.input.hit('KeyP')) {
      this.screen = 'paused';
      this.saveGame();
      return;
    }
    if (this.input.hit('KeyM')) this.audio.toggleMute();
    this.clockMinutes += dt; // one game minute per real second
    this.updatePlayer(dt);
    this.updateSpawning(dt);
    for (const car of this.cars) {
      if (car.kind === 'traffic' && !car.dead && car !== this.player.inCar) updateTrafficCar(this, car, dt);
    }
    updatePolice(this, dt);
    updatePeds(this, dt);
    this.handleCarEvents(dt);
    updateBullets(this, dt);
    updatePickups(this, dt);
    updateMissions(this, dt);
    updateWanted(this, dt);
    this.updateFx(dt);
    if (this.wanted.bust >= 1) return this.beginBusted();
    if (this.player.hp <= 0) return this.beginWasted();
    // Camera follows the player (or their car).
    const p = this.player;
    this.camera.x = clamp(p.x, this.viewW / 2, Math.max(this.viewW / 2, WORLD_W - this.viewW / 2));
    this.camera.y = clamp(p.y, this.viewH / 2, Math.max(this.viewH / 2, WORLD_H - this.viewH / 2));
    if (WORLD_W < this.viewW) this.camera.x = WORLD_W / 2;
    if (WORLD_H < this.viewH) this.camera.y = WORLD_H / 2;
    // Continuous sounds.
    this.audio.setEngine(!!p.inCar, p.inCar ? Math.abs(p.inCar.speed) / p.inCar.model.topSpeed : 0, dt);
    this.audio.setSiren(this.wanted.stars > 0, dt);
  }

  // Traffic and peds keep the world alive behind menus and end screens.
  updateAmbient(dt) {
    for (const car of this.cars) {
      if (car.kind === 'traffic' && !car.dead) updateTrafficCar(this, car, dt);
    }
    updatePeds(this, dt);
    this.updateFx(dt);
  }

  updateFx(dt) {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const f of this.floaters) {
      f.y -= 26 * dt;
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  updatePlayer(dt) {
    const p = this.player;
    const prevX = p.x;
    const prevY = p.y;
    if (p.inCar) {
      const car = p.inCar;
      const axis = this.input.moveAxis();
      const throttle = -axis.y; // W = forward
      const steer = axis.x;
      const handbrake = this.input.down('Space') ? 1 : 0;
      const impact = stepCarPhysics(this, car, throttle, steer, handbrake, dt);
      if (impact > 130) {
        damageCar(this, car, (impact - 120) / 5);
        if (impact > 210) this.hurtPlayer((impact - 200) / 9);
        this.audio.crash(impact > 200);
        this.spawnParticles(car.x, car.y, 8, '#ffca7a', 80);
        if (impact > 235) commitCrime(this, 'hardCrash', car.x, car.y);
      }
      if (handbrake && Math.abs(car.speed) > 190 && this.rng.chance(0.3)) this.audio.screech();
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      if (this.input.hit('KeyE') || this.input.hit('KeyF')) this.exitCar();
    } else {
      const axis = this.input.moveAxis();
      const running = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
      const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
      if (axis.x !== 0 || axis.y !== 0) {
        const len = Math.hypot(axis.x, axis.y);
        const moved = moveCircle(this.world, p.x, p.y, PLAYER.radius, (axis.x / len) * speed * dt, (axis.y / len) * speed * dt);
        p.x = moved.x;
        p.y = moved.y;
        p.angle = Math.atan2(axis.y, axis.x);
      }
      // Aim with the mouse while shooting; face movement otherwise.
      if (this.input.mouseDown) {
        const mw = this.mouseWorld();
        p.angle = Math.atan2(mw.y - p.y, mw.x - p.x);
        tryShoot(this, mw.x, mw.y);
      } else if (this.input.mouseClicked) {
        const mw = this.mouseWorld();
        if (p.ammo > 0) tryShoot(this, mw.x, mw.y);
        else meleeSwing(this);
      }
      if (this.input.hit('KeyJ')) meleeSwing(this);
      if (this.input.hit('KeyE') || this.input.hit('KeyF')) this.tryEnterCar();
    }
    p.vx = (p.x - prevX) / dt;
    p.vy = (p.y - prevY) / dt;
    p.speedMag = Math.hypot(p.vx, p.vy);
    // Slow recovery once the street has been quiet for a while.
    if (this.time - p.hurtAt > 10 && p.hp > 0 && p.hp < PLAYER.maxHp) {
      p.hp = Math.min(PLAYER.maxHp, p.hp + 1.1 * dt);
    }
  }

  hurtPlayer(amount) {
    const p = this.player;
    p.hp -= amount;
    p.hurtAt = this.time;
    this.spawnParticles(p.x, p.y, 6, '#c93b2e', 60);
  }

  tryEnterCar() {
    const p = this.player;
    let best = null;
    let bestD = 40;
    for (const car of this.cars) {
      if (car.dead) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    if (!best) return;
    if (best.driver && best.kind === 'traffic') {
      // Yank the driver out — they run, and the law may hear about it.
      const ped = spawnPed(this, best.x + 14, best.y + 10, { state: 'flee' });
      ped.fleeX = p.x;
      ped.fleeY = p.y;
      ped.fleeTimer = 3;
      best.driver = false;
      commitCrime(this, 'carTheft', best.x, best.y);
    } else if (best.kind === 'parked') {
      commitCrime(this, 'carTheft', best.x, best.y);
    }
    best.kind = 'player';
    p.inCar = best;
    p.x = best.x;
    p.y = best.y;
    this.audio.door();
  }

  exitCar() {
    const p = this.player;
    const car = p.inCar;
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    // Step out on whichever side is free.
    const side = Math.PI / 2;
    for (const s of [1, -1]) {
      const nx = car.x + Math.cos(car.angle + side * s) * 26;
      const ny = car.y + Math.sin(car.angle + side * s) * 26;
      const moved = moveCircle(this.world, nx, ny, PLAYER.radius, 0, 0);
      if (!moved.hit) {
        p.x = nx;
        p.y = ny;
        break;
      }
    }
    p.inCar = null;
    this.audio.door();
  }

  updateSpawning(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.45;
    const p = this.player;
    // Traffic.
    const trafficNear = this.cars.filter((c) => c.kind === 'traffic' && dist(p.x, p.y, c.x, c.y) < SPAWN_RADIUS).length;
    if (trafficNear < TRAFFIC_TARGET) {
      for (let i = 0; i < 2; i++) this.spawnTrafficCar();
    }
    // Peds.
    const pedsNear = this.peds.filter((pd) => !pd.dead && dist(p.x, p.y, pd.x, pd.y) < SPAWN_RADIUS).length;
    if (pedsNear < PED_TARGET) {
      for (let i = 0; i < 3; i++) this.spawnPedNear();
    }
    // Despawn the far away.
    this.cars = this.cars.filter((c) => {
      if (c.kind === 'traffic' && dist(p.x, p.y, c.x, c.y) > DESPAWN_RADIUS) return false;
      return true;
    });
    this.peds = this.peds.filter((pd) => dist(p.x, p.y, pd.x, pd.y) < DESPAWN_RADIUS);
  }

  spawnTrafficCar() {
    const p = this.player;
    const spot = roadPointNear(this.rng, p.x, p.y, this.rng.range(760, 1080));
    const car = makeCar(this.rng, spot.x, spot.y, 'traffic');
    // Decide the heading from which grid line the spot sits on.
    const onAvenue = AVENUES.includes(spot.x);
    car.dir = onAvenue ? this.rng.pick([1, 3]) : this.rng.pick([0, 2]);
    car.angle = Math.atan2([0, 1, 0, -1][car.dir], [1, 0, -1, 0][car.dir]);
    chooseNextTarget(this.rng, car);
    this.cars.push(car);
    return car;
  }

  spawnPedNear() {
    const p = this.player;
    const blocks = this.world.blocks.filter((b) => dist(p.x, p.y, (b.rect.x0 + b.rect.x1) / 2, (b.rect.y0 + b.rect.y1) / 2) < SPAWN_RADIUS);
    if (blocks.length === 0) return null;
    const block = this.rng.pick(blocks);
    const t = this.rng.range(0, 1900);
    const pos = blockPerimeterPoint(block, t);
    const ped = spawnPed(this, pos.x, pos.y, {});
    ped.block = block;
    ped.t = t;
    return ped;
  }

  // Car-on-car and car-on-ped consequences.
  handleCarEvents(dt) {
    void dt;
    const events = resolveCarCollisions(this);
    const p = this.player;
    for (const ev of events) {
      const involvesPlayer = p.inCar && (ev.a === p.inCar || ev.b === p.inCar);
      const other = ev.a === p.inCar ? ev.b : ev.a;
      damageCar(this, ev.a, ev.force / 16);
      damageCar(this, ev.b, ev.force / 16);
      if (involvesPlayer) {
        this.audio.crash(ev.force > 190);
        this.spawnParticles(p.x, p.y, 7, '#ffca7a', 70);
        if (ev.force > 200) {
          this.hurtPlayer((ev.force - 190) / 12);
          // Only the player's own speed makes it their crime — being rammed
          // by traffic (or a police PIT) is not a chargeable offence.
          if (Math.abs(p.inCar.speed) > 130) commitCrime(this, 'hardCrash', p.x, p.y);
        }
        if (other.kind === 'police' && Math.abs(p.inCar.speed) > 130) {
          commitCrime(this, 'hardCrash', p.x, p.y);
        }
      }
    }
    // Cars versus pedestrians.
    for (const car of this.cars) {
      if (car.dead || Math.abs(car.speed) < 26) continue;
      for (const ped of this.peds) {
        if (ped.dead || ped.state === 'down') continue;
        if (dist(car.x, car.y, ped.x, ped.y) < 23) {
          const lethal = Math.abs(car.speed) > 150;
          if (lethal) {
            const killed = damagePed(this, ped, 60, 'car');
            if (car === p.inCar) {
              commitCrime(this, killed ? 'trafficKill' : 'hitAndRun', ped.x, ped.y);
              this.audio.crash(false);
            }
          } else {
            knockDownPed(this, ped);
            // A parking-speed bump scares people; it is not a hit-and-run.
            if (car === p.inCar && Math.abs(car.speed) > 95) commitCrime(this, 'hitAndRun', ped.x, ped.y);
          }
          car.speed *= 0.72;
        }
      }
      // Moving cars versus the player on foot.
      if (!p.inCar && car !== p.inCar && dist(car.x, car.y, p.x, p.y) < 22 && Math.abs(car.speed) > 40) {
        this.hurtPlayer(Math.min(30, Math.abs(car.speed) / 9));
        const push = moveCircle(this.world, p.x, p.y, PLAYER.radius, Math.cos(car.angle) * 14, Math.sin(car.angle) * 14);
        p.x = push.x;
        p.y = push.y;
        car.speed *= 0.8;
      }
    }
  }

  beginBusted() {
    const p = this.player;
    failMission(this, 'you were busted');
    const fine = Math.floor(p.cash * 0.15);
    p.cash -= fine;
    this.addFloater(p.x, p.y - 26, 'BUSTED  -$' + fine, '#ff5a4e');
    this.audio.busted();
    this.screen = 'busted';
    this.screenTimer = 3.2;
  }

  beginWasted() {
    const p = this.player;
    failMission(this, 'you were wasted');
    const fine = Math.floor(p.cash * 0.1);
    p.cash -= fine;
    this.addFloater(p.x, p.y - 26, 'WASTED  -$' + fine, '#ff5a4e');
    this.audio.missionBad();
    this.screen = 'wasted';
    this.screenTimer = 3.2;
  }

  respawn() {
    const p = this.player;
    const poi = poiById(this.world, this.screen === 'busted' ? 'pd' : 'hospital');
    if (p.inCar) {
      p.inCar.kind = 'parked';
      p.inCar = null;
    }
    p.x = poi.x;
    p.y = poi.y + 24;
    p.hp = PLAYER.maxHp;
    clearHeat(this);
    this.cars = this.cars.filter((c) => c.kind !== 'police');
    this.screen = 'playing';
    this.saveGame();
  }

  // A stable fingerprint of the simulation for determinism checks.
  stateHash() {
    const p = this.player;
    let s = [
      Math.round(p.x), Math.round(p.y), Math.round(p.hp), p.cash, Math.round(this.wanted.heat),
      this.wanted.stars, this.missions.storyIndex, Math.round(this.clockMinutes),
      this.cars.length, this.peds.length,
    ].join(',');
    for (const c of this.cars) {
      if (c.kind === 'parked') continue;
      s += '|' + Math.round(c.x) + ',' + Math.round(c.y) + ',' + Math.round(c.speed);
    }
    for (const pd of this.peds) {
      s += '|' + Math.round(pd.x) + ',' + Math.round(pd.y);
    }
    return hashString(s);
  }
}

// --- browser boot ------------------------------------------------------------

function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const status = document.getElementById('status');
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed') || 7) || 7;
  const input = new Input();
  input.attach(window, canvas);
  const audio = new SoundFX();
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });
  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const game = new Game({ seed, input, audio, storage });
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    game.viewW = canvas.width;
    game.viewH = canvas.height;
  };
  window.addEventListener('resize', resize);
  resize();

  const shot = params.get('shot');
  if (shot) stageShot(game, shot);

  let last = performance.now();
  let acc = 0;
  let lastStatus = '';
  const frame = (now) => {
    const dtReal = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += dtReal;
    while (acc >= STEP) {
      game.step();
      acc -= STEP;
    }
    input.consume();
    drawGame(ctx, game);
    const label = game.screen + ':' + (game.missions.active ? game.missions.active.def.title : 'roam');
    if (status && label !== lastStatus) {
      lastStatus = label;
      status.textContent = 'Palm City Heat — ' + game.screen;
    }
    if (shot && !window.__shotReady) {
      // The staged scene has been simulated and painted: the frame is final.
      window.__shotReady = true;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  boot();
}
