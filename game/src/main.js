// Palm City Heat — the game itself: state creation, the fixed-step simulation that every
// system plugs into, the screen flow (title, playing, paused, busted, wasted), saving to
// localStorage, and the browser boot. The simulation is plain data and functions — feed
// it scripted input objects and it replays deterministically, which is how the headless
// tests drive it.

import {
  CLOCK_RATE, PLAYER_MAX_HP, PLAYER_RADIUS, RUN_SPEED, SAVE_KEY, START_CLOCK_MIN,
  STEP, WALK_SPEED,
} from './config.js';
import { RNG } from './random.js';
import { buildWorld, collideCircle } from './world.js';
import { createInput, attachInput } from './input.js';
import {
  carRadius, collideCars, integrateCar, spawnVehicles, updateTrafficCar,
} from './vehicles.js';
import { spawnFleeingPed, spawnPeds, updatePeds } from './peds.js';
import {
  clearWanted, createWanted, reportCrime, updateBust, updatePoliceCar, updateWanted,
} from './police.js';
import { tryMelee, tryShoot, updateCombat } from './combat.js';
import {
  advanceDialogue, createMissionState, currentObjective, onPlayerDown, talkToContact,
  updateMissions,
} from './missions.js';
import { drawGame, updateCamera } from './render.js';
import { initAudio, setEngine, setSiren, sfx, toggleMute } from './audio.js';
import { stageShot } from './shots.js';

export function createGame(seed = 1) {
  const rng = new RNG(seed);
  const world = buildWorld(rng);
  const state = {
    seed, rng, world,
    time: 0, tick: 0, clockMin: START_CLOCK_MIN,
    screen: 'title',
    camera: { x: 0, y: 0 },
    player: {
      x: world.pois.contact.x - 48, y: world.pois.contact.y,
      angle: 0, vx: 0, vy: 0, speedMag: 0,
      hp: PLAYER_MAX_HP, cash: 120, ammo: 24,
      car: null, lastShotAt: -9, lastMeleeAt: -9, hurtT: 0, knockT: 0,
    },
    cars: [], peds: [], bullets: [], pickups: [], particles: [], texts: [],
    events: [], threat: null, pickupTimer: 4,
    wanted: createWanted(),
    mission: createMissionState(),
    input: createInput(),
    aim: { x: 0, y: 0 },
    prompt: '', hasSave: false, lastFine: 0,
  };
  spawnVehicles(state);
  spawnPeds(state);
  return state;
}

// ---------------------------------------------------------------- saving

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadSaveData() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveGame(state) {
  const store = storage();
  if (!store) return;
  const p = state.player;
  try {
    store.setItem(SAVE_KEY, JSON.stringify({
      cash: p.cash, hp: p.hp, ammo: p.ammo,
      missionIndex: state.mission.index, x: p.x, y: p.y,
    }));
    state.hasSave = true;
  } catch { /* a full or blocked store is not worth crashing over */ }
}

export function applySave(state, data) {
  const p = state.player;
  p.cash = data.cash | 0;
  p.hp = Math.max(20, Math.min(PLAYER_MAX_HP, data.hp || 100));
  p.ammo = data.ammo | 0;
  p.x = data.x; p.y = data.y;
  p.car = null;
  state.mission = createMissionState();
  state.mission.index = Math.max(0, data.missionIndex | 0);
  clearWanted(state);
}

// ---------------------------------------------------------------- run flow

function newGame(state) {
  const p = state.player;
  p.cash = 120;
  p.hp = PLAYER_MAX_HP;
  p.ammo = 24;
  p.car = null;
  p.x = state.world.pois.contact.x - 48;
  p.y = state.world.pois.contact.y;
  state.mission = createMissionState();
  clearWanted(state);
  state.screen = 'playing';
}

function fineFor(state) {
  return Math.min(state.player.cash, 100 + Math.floor(state.player.cash * 0.1));
}

function goDown(state, kind) {
  const p = state.player;
  state.lastFine = fineFor(state);
  p.cash -= state.lastFine;
  if (p.car) { p.car.driver = 'parked'; p.car = null; }
  onPlayerDown(state);
  state.screen = kind;
  sfx(kind);
}

function respawn(state) {
  const p = state.player;
  const poi = state.screen === 'wasted' ? state.world.pois.hospital : state.world.pois.station;
  p.x = poi.x;
  p.y = poi.y;
  p.hp = PLAYER_MAX_HP;
  p.vx = 0; p.vy = 0;
  clearWanted(state);
  state.cars = state.cars.filter((car) => !car.police);
  state.screen = 'playing';
}

// ---------------------------------------------------------------- player

function nearestCar(state, maxDist) {
  const p = state.player;
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(state, car) {
  const p = state.player;
  if (car.hp <= 0) { state.prompt = 'That one is wrecked.'; return; }
  if (car.driver === 'traffic') {
    spawnFleeingPed(state, car.x, car.y, p.x, p.y);
    reportCrime(state, 'theft', car.x, car.y);
  } else if (car.police) {
    reportCrime(state, 'theft', car.x, car.y, true);
  }
  car.driver = 'player';
  car.ctrl.throttle = 0;
  car.ctrl.steer = 0;
  p.car = car;
  p.x = car.x; p.y = car.y;
  sfx('enter');
}

function exitCar(state) {
  const p = state.player;
  const car = p.car;
  car.driver = 'parked';
  car.ctrl.throttle = 0;
  car.ctrl.steer = 0;
  p.car = null;
  const side = car.angle + Math.PI / 2;
  const spot = collideCircle(state.world, car.x + Math.cos(side) * (car.wid / 2 + 16), car.y + Math.sin(side) * (car.wid / 2 + 16), PLAYER_RADIUS);
  p.x = spot.x; p.y = spot.y;
  sfx('exit');
}

function updatePlayer(state, dt) {
  const p = state.player;
  const input = state.input;
  const talking = !!state.mission.dialogue;
  if (input.take('interact')) {
    if (talking) { advanceDialogue(state); return; }
    if (p.car) {
      if (Math.abs(p.car.speed) < 42) exitCar(state);
    } else {
      const contact = state.world.pois.contact;
      if (state.mission.phase === 'idle' && Math.hypot(p.x - contact.x, p.y - contact.y) < 66) {
        talkToContact(state);
      } else {
        const car = nearestCar(state, 48);
        if (car) enterCar(state, car);
      }
    }
  }
  if (talking) { p.speedMag = 0; return; }

  if (p.car) {
    const car = p.car;
    car.ctrl.throttle = input.up ? 1 : input.down ? -1 : 0;
    car.ctrl.steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (input.space) {
      car.speed *= (1 - 2.6 * dt);
      if (Math.abs(car.speed) > 130 && state.rng.chance(0.06)) sfx('screech', Math.abs(car.speed) / 3000);
    }
    p.x = car.x; p.y = car.y;
    p.vx = Math.cos(car.angle) * car.speed;
    p.vy = Math.sin(car.angle) * car.speed;
    p.speedMag = Math.abs(car.speed);
    return;
  }

  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const moving = mx !== 0 || my !== 0;
  if (moving) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    if (!input.shoot) p.angle = Math.atan2(my, mx);
  }
  const speed = input.run ? RUN_SPEED : WALK_SPEED;
  const nx = p.x + mx * speed * dt;
  const ny = p.y + my * speed * dt;
  const fixed = collideCircle(state.world, nx, ny, PLAYER_RADIUS);
  p.vx = moving ? (fixed.x - p.x) / dt : 0;
  p.vy = moving ? (fixed.y - p.y) / dt : 0;
  p.x = fixed.x; p.y = fixed.y;
  p.speedMag = moving ? speed : 0;
  if (input.shoot) {
    p.angle = Math.atan2(state.aim.y - p.y, state.aim.x - p.x);
    tryShoot(state);
  }
  if (input.take('melee')) tryMelee(state);
}

function updatePrompt(state) {
  const p = state.player;
  if (state.screen !== 'playing' || state.mission.dialogue) { state.prompt = ''; return; }
  if (p.car) {
    state.prompt = Math.abs(p.car.speed) < 42 ? 'E — get out' : '';
    return;
  }
  const contact = state.world.pois.contact;
  if (state.mission.phase === 'idle' && Math.hypot(p.x - contact.x, p.y - contact.y) < 66) {
    state.prompt = 'E — talk to Marisol';
    return;
  }
  const car = nearestCar(state, 48);
  state.prompt = car ? (car.hp <= 0 ? 'Wrecked' : 'E — steal the car') : '';
}

// ---------------------------------------------------------------- events

function processEvents(state) {
  const p = state.player;
  for (const e of state.events) {
    const near = Math.hypot(e.x - p.x, e.y - p.y) < 560;
    if (e.type === 'gunshot') sfx('gunshot');
    else if (e.type === 'melee') sfx('melee');
    else if (e.type === 'crash' && near) sfx('crash');
    else if (e.type === 'carcrash') {
      if (near) sfx('carcrash');
      if ((e.a === p.car || e.b === p.car) && e.impact > 150) {
        p.hp -= (e.impact - 150) / 9;
        p.hurtT = 0.5;
      }
      if (e.a === p.car || e.b === p.car) {
        const other = e.a === p.car ? e.b : e.a;
        if (other.police) reportCrime(state, 'hitPolice', e.x, e.y);
        else reportCrime(state, 'hitCar', e.x, e.y);
      }
    } else if (e.type === 'hitped') {
      if (e.car === p.car) reportCrime(state, 'hitPed', e.x, e.y);
    } else if (e.type === 'pickup') {
      sfx(e.kind === 'cash' ? 'cash' : 'pickup');
    } else if (e.type === 'missioncomplete') {
      sfx('mission');
      saveGame(state);
    } else if (e.type === 'missionfail') {
      sfx('fail');
    } else if (e.type === 'dialogue') {
      sfx('dialogue');
    } else if (e.type === 'stage') {
      sfx('pickup');
    } else if (e.type === 'busted') {
      goDown(state, 'busted');
    }
  }
  state.events.length = 0;
}

// ---------------------------------------------------------------- the step

export function stepGame(state, dt) {
  state.tick += 1;
  state.time += dt;
  state.clockMin += CLOCK_RATE * dt;
  const input = state.input;
  if (input.take('mute')) toggleMute();

  if (state.screen === 'title') {
    if (input.take('confirm')) { newGame(state); }
    else if (input.take('continue')) {
      const data = loadSaveData();
      if (data) { applySave(state, data); state.screen = 'playing'; }
    }
    // The city idles behind the title: traffic rolls, people stroll.
    for (const car of state.cars) if (car.driver === 'traffic') updateTrafficCar(state, car, dt);
    for (const car of state.cars) integrateCar(state, car, dt);
    collideCars(state);
    updatePeds(state, dt);
    updateCombat(state, dt);
    state.events.length = 0;
    input.clear();
    return;
  }
  if (state.screen === 'paused') {
    if (input.take('pause') || input.take('confirm')) state.screen = 'playing';
    input.clear();
    return;
  }
  if (state.screen === 'busted' || state.screen === 'wasted') {
    if (input.take('confirm') || input.take('interact')) respawn(state);
    input.clear();
    return;
  }

  // screen === 'playing'
  if (input.take('pause')) {
    state.screen = 'paused';
    saveGame(state);
    input.clear();
    return;
  }
  const p = state.player;
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.knockT = Math.max(0, p.knockT - dt);

  updatePlayer(state, dt);
  for (const car of state.cars) if (car.driver === 'traffic') updateTrafficCar(state, car, dt);
  updateWanted(state, dt);
  for (const car of state.cars) if (car.police) updatePoliceCar(state, car, dt);
  for (const car of state.cars) integrateCar(state, car, dt);
  collideCars(state);
  updatePeds(state, dt);
  updateCombat(state, dt);
  updateMissions(state, dt);
  updateBust(state, dt);

  // The player's own body versus traffic: getting clipped hurts.
  if (!p.car && p.knockT <= 0) {
    for (const car of state.cars) {
      if (Math.abs(car.speed) > 62 && Math.hypot(car.x - p.x, car.y - p.y) < carRadius(car) + 10) {
        p.hp -= 16;
        p.hurtT = 0.6;
        p.knockT = 1.1;
        const away = Math.atan2(p.y - car.y, p.x - car.x);
        const spot = collideCircle(state.world, p.x + Math.cos(away) * 26, p.y + Math.sin(away) * 26, PLAYER_RADIUS);
        p.x = spot.x; p.y = spot.y;
        break;
      }
    }
  }
  // A wrecked car throws its driver out.
  if (p.car && p.car.hp <= 0) {
    const car = p.car;
    exitCar(state);
    car.driver = 'parked';
    p.hp -= 12;
    p.hurtT = 0.6;
  }

  processEvents(state);
  if (state.screen === 'playing' && p.hp <= 0) goDown(state, 'wasted');
  updatePrompt(state);
  void currentObjective;
  input.clear();
}

// ---------------------------------------------------------------- boot

function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(window.location.search);
  const seed = Number.parseInt(params.get('seed') || '7', 10) || 7;
  const shotName = params.get('shot');
  let state;
  if (shotName) {
    state = stageShot(shotName, seed, { createGame, stepGame });
  } else {
    state = createGame(seed);
    state.hasSave = !!loadSaveData();
    attachInput(state.input, canvas, initAudio);
  }
  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  let last = performance.now();
  let acc = 0;
  let painted = false;
  const frame = (now) => {
    const dtReal = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dtReal;
    let steps = 0;
    while (!shotName && acc >= STEP && steps < 5) {
      stepGame(state, STEP);
      acc -= STEP;
      steps += 1;
    }
    if (steps === 5) acc = 0;
    if (state.screen === 'title' && !shotName) {
      const cx = 1560 + Math.sin(state.time * 0.05) * 320;
      const cy = 1080 + Math.cos(state.time * 0.037) * 240;
      state.camera.x = Math.max(0, Math.min(state.world.w - canvas.width, cx - canvas.width / 2));
      state.camera.y = Math.max(0, Math.min(state.world.h - canvas.height, cy - canvas.height / 2));
    } else {
      updateCamera(state, canvas.width, canvas.height);
    }
    state.aim.x = state.camera.x + state.input.mouseX;
    state.aim.y = state.camera.y + state.input.mouseY;
    drawGame(ctx, state, canvas.width, canvas.height);
    if (state.player.car) setEngine(true, Math.abs(state.player.car.speed) / state.player.car.top);
    else setEngine(false, 0);
    let closeness = 0;
    if (state.wanted.stars > 0) {
      let nearest = Infinity;
      for (const car of state.cars) {
        if (car.police) nearest = Math.min(nearest, Math.hypot(car.x - state.player.x, car.y - state.player.y));
      }
      closeness = Math.max(0, 1 - nearest / 700);
    }
    setSiren(state.wanted.stars > 0, closeness);
    if (shotName && !painted) {
      painted = true;
      window.__shotReady = true;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.getElementById('game')) {
  boot();
}
