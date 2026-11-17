// Palm City Heat — entry point and simulation core.
// createState() builds a fresh deterministic world; stepGame() advances it by
// one fixed 1/60s step (player, traffic, police, peds, combat, missions);
// boot() wires all of that to the browser: canvas, keyboard/mouse, the RAF
// loop with a fixed-step accumulator, synthesized audio and localStorage
// saves. The headless test imports createState/stepGame directly.

import { STEP, VIEW_W, VIEW_H, PLAYER, CLOCK_START_MINUTES, SAVE_KEY } from './config.js';
import { RNG } from './random.js';
import { buildWorld, collideCircle, districtAt } from './world.js';
import { spawnTraffic, spawnParked, stepTrafficCar, stepDrivenCar, stepCoastCar, resolveCarCollisions, carRadius, carProximity } from './vehicles.js';
import { spawnPeds, stepPeds, scarePed, knockDown } from './peds.js';
import { starsForHeat, reportCrime, stepPolice } from './police.js';
import { playerMelee, playerShoot, stepBullets, stepParticles, stepPickups, dropPickup } from './combat.js';
import { buildStory, startMission, failMission, updateMissions, advanceDialogue } from './missions.js';
import { Input } from './input.js';
import { SoundFX } from './audio.js';
import { render } from './render.js';
import { parseShot, stageShot } from './shots.js';

export function createState(seed = 20261117, storage = null) {
  const rng = new RNG(seed);
  const world = buildWorld(rng);
  const state = {
    seed,
    rng,
    world,
    story: buildStory(world),
    storage,
    time: 0,
    clockMin: CLOCK_START_MINUTES,
    day: 1,
    screen: 'title',
    player: {
      x: world.spawn.x, y: world.spawn.y, angle: -Math.PI / 2,
      hp: PLAYER.maxHealth, cash: 120, ammo: 12,
      inCar: null, footSpeed: 0, swingT: 0, muzzleT: 0, lastHurtT: -99,
    },
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    pickups: [],
    floaters: [],
    noise: [],
    sounds: [],
    heat: 0,
    stars: 0,
    lastCrimeT: -99,
    lastCrimePos: null,
    bust: 0,
    busted: false,
    policeSpawnT: 0,
    mission: null,
    storyIdx: 0,
    dialogue: null,
    marker: null,
    markerOverride: null,
    objective: '',
    objectiveOverride: null,
    hint: '',
    district: 'street',
    camera: { x: 0, y: 0 },
    message: '',
    messageT: 0,
    stats: { crimesWitnessed: 0 },
    saveExists: false,
    shotMode: null,
    // Bound helpers the other modules call through the state object.
    reportCrime: (kind, x, y) => reportCrime(state, kind, x, y),
    scareAt: (ped, x, y) => scarePed(ped, x, y, state.rng),
    scareCar: (car) => { car.cruise = 1; },
    saveGame: () => saveGame(state),
  };
  state.cars = [...spawnTraffic(world, rng, 26, world.spawn), ...spawnParked(world, rng, 30)];
  state.peds = spawnPeds(world, rng, 30);
  // A few starter pickups so the systems are visible early.
  dropPickup(state, 'ammo', world.spawn.x + 60, world.spawn.y + 10, 12);
  dropPickup(state, 'health', world.locations.hospital.x + 26, world.locations.hospital.y + 8, 40);
  state.saveExists = !!loadSave(state);
  snapCamera(state, state.player.x, state.player.y);
  return state;
}

// --- saves ------------------------------------------------------------------

export function saveGame(state) {
  if (!state.storage) return;
  try {
    state.storage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.player.cash,
      storyIdx: state.storyIdx,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      ammo: state.player.ammo,
    }));
    state.saveExists = true;
  } catch { /* storage unavailable: play on without saving */ }
}

export function loadSave(state) {
  if (!state.storage) return null;
  try {
    const raw = state.storage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function startRun(state, useSave) {
  const p = state.player;
  const save = useSave ? loadSave(state) : null;
  // Clear the law and any half-finished job.
  state.cars = state.cars.filter((c) => c.driver !== 'police');
  state.heat = 0;
  state.bust = 0;
  state.busted = false;
  state.mission = null;
  state.dialogue = null;
  if (p.inCar) {
    p.inCar.driver = null;
    p.inCar.parked = true;
    p.inCar = null;
  }
  if (save) {
    p.cash = save.cash | 0;
    state.storyIdx = Math.min(save.storyIdx | 0, state.story.length);
    p.x = save.x;
    p.y = save.y;
    p.ammo = save.ammo | 0;
  } else {
    p.cash = 120;
    state.storyIdx = 0;
    p.x = state.world.spawn.x;
    p.y = state.world.spawn.y;
    p.ammo = 12;
    if (state.storage) {
      try { state.storage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      state.saveExists = false;
    }
  }
  p.hp = PLAYER.maxHealth;
  state.screen = 'play';
  snapCamera(state, p.x, p.y);
}

// --- camera -----------------------------------------------------------------

function snapCamera(state, x, y) {
  state.camera.x = clamp(x - VIEW_W / 2, 0, Math.max(0, state.world.W - VIEW_W));
  state.camera.y = clamp(y - VIEW_H / 2, 0, Math.max(0, state.world.H - VIEW_H));
}

function followCamera(state, dt) {
  const p = state.player;
  const tx = clamp(p.x - VIEW_W / 2, 0, Math.max(0, state.world.W - VIEW_W));
  const ty = clamp(p.y - VIEW_H / 2, 0, Math.max(0, state.world.H - VIEW_H));
  const k = Math.min(1, dt * 7);
  state.camera.x += (tx - state.camera.x) * k;
  state.camera.y += (ty - state.camera.y) * k;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// --- main step ----------------------------------------------------------------

export function stepGame(state, input, dt) {
  state.time += dt;
  if (state.messageT > 0) {
    state.messageT -= dt;
    if (state.messageT <= 0) state.message = '';
  }
  for (const n of state.noise) n.ttl -= dt;
  state.noise = state.noise.filter((n) => n.ttl > 0);

  if (state.screen === 'title') {
    stepAmbient(state, dt);
    // A slow drift over downtown behind the title.
    const cx = state.world.roadVX[3] + Math.sin(state.time * 0.07) * 190;
    const cy = state.world.roadHY[2] + Math.cos(state.time * 0.05) * 120;
    snapCamera(state, cx, cy);
    if (input.consume('Enter')) startRun(state, state.saveExists);
    if (input.consume('KeyN')) startRun(state, false);
    return;
  }

  if (state.screen === 'pause') {
    if (input.consume('Escape') || input.consume('KeyP')) state.screen = 'play';
    return;
  }

  if (state.screen === 'busted' || state.screen === 'wasted') {
    stepAmbient(state, dt);
    if (input.consume('Enter')) respawn(state, state.screen);
    return;
  }

  // screen === 'play'
  if (input.consume('Escape') || input.consume('KeyP')) {
    state.screen = 'pause';
    saveGame(state);
    return;
  }

  const p = state.player;
  p.swingT = Math.max(0, p.swingT - dt);
  p.muzzleT = Math.max(0, p.muzzleT - dt);

  if (state.dialogue) {
    if (input.consume('KeyE') || input.consume('Enter') || input.consumeClick()) advanceDialogue(state);
    stepAmbient(state, dt);
    updateMissions(state, dt);
    followCamera(state, dt);
    return;
  }

  stepPlayer(state, input, dt);

  // Traffic (brakes for people in the road).
  const blockers = state.peds.filter((d) => d.state !== 'down');
  if (!p.inCar) blockers.push(p);
  for (const car of state.cars) {
    if (car.driver === 'traffic' && !car.dead) stepTrafficCar(state.world, car, dt, state.cars, state.rng, blockers);
    else if (!car.driver && !car.parked && !car.dead) stepCoastCar(state.world, car, dt);
    if (car.health <= 0 && !car.dead) wreckCar(state, car);
  }

  stepPolice(state, dt);

  // Pedestrians react to a fast car and to loud noises.
  const dangers = state.noise.map((n) => ({ x: n.x, y: n.y, r: n.r }));
  if (p.inCar && Math.abs(p.inCar.speed) > 62) dangers.push({ x: p.x, y: p.y, r: 105 });
  stepPeds(state.world, state.peds, dt, state.rng, dangers);

  resolveVehicleContacts(state, dt);

  stepBullets(state, dt);
  stepParticles(state, dt);
  stepPickups(state, dt);

  updateMissions(state, dt);
  if (state.markerOverride) state.marker = state.markerOverride;
  if (state.objectiveOverride) state.objective = state.objectiveOverride;

  // Consequences.
  if (state.busted) {
    state.screen = 'busted';
    state.sounds.push('fail');
    if (state.mission) failMission(state, 'The PCPD got you. Dante does not pay for jail time.');
    return;
  }
  if (p.hp <= 0) {
    state.screen = 'wasted';
    state.sounds.push('fail');
    if (state.mission) failMission(state, 'You woke up in hospital. The job did not survive either.');
    return;
  }
  if (state.time - p.lastHurtT > 8 && p.hp < PLAYER.maxHealth) {
    p.hp = Math.min(PLAYER.maxHealth, p.hp + 1.4 * dt);
  }
  // Palm City General patches up anyone who lingers at its door.
  const hosp = state.world.locations.hospital;
  if (!p.inCar && Math.hypot(p.x - hosp.x, p.y - hosp.y) < 52 && p.hp < PLAYER.maxHealth) {
    p.hp = Math.min(PLAYER.maxHealth, p.hp + 7 * dt);
  }

  // Game clock: one real second is one Palm City minute.
  state.clockMin += dt;
  if (state.clockMin >= 1440) {
    state.clockMin -= 1440;
    state.day += 1;
  }

  state.district = districtAt(state.world, p.x, p.y);
  updateHint(state);
  followCamera(state, dt);
}

// Traffic and parked cars keep living their lives behind menus.
function stepAmbient(state, dt) {
  const blockers = state.peds.filter((d) => d.state !== 'down');
  for (const car of state.cars) {
    if (car.driver === 'traffic' && !car.dead) stepTrafficCar(state.world, car, dt, state.cars, state.rng, blockers);
    else if (!car.driver && !car.parked && !car.dead) stepCoastCar(state.world, car, dt);
  }
  stepPeds(state.world, state.peds, dt, state.rng, []);
  stepParticles(state, dt);
}

function wreckCar(state, car) {
  car.dead = true;
  car.speed = 0;
  if (state.player.inCar === car) {
    state.player.inCar = null;
    car.driver = null;
    state.player.hp -= 12;
    state.player.lastHurtT = state.time;
    state.player.x = car.x + 26;
    state.player.y = car.y + 8;
    state.message = 'Your ride is wrecked!';
    state.messageT = 2.2;
    state.sounds.push('crash');
  }
}

function respawn(state, from) {
  const p = state.player;
  if (p.inCar) {
    p.inCar.driver = null;
    p.inCar.parked = true;
    p.inCar = null;
  }
  const loc = from === 'busted' ? state.world.locations.station : state.world.locations.hospital;
  const fine = from === 'busted' ? 100 : 150;
  p.cash = Math.max(0, p.cash - fine);
  p.x = loc.x + 30;
  p.y = loc.y + 46;
  p.hp = PLAYER.maxHealth;
  state.heat = 0;
  state.bust = 0;
  state.busted = false;
  state.cars = state.cars.filter((c) => c.driver !== 'police');
  state.screen = 'play';
  state.message = from === 'busted' ? `Released. Fine: $${fine}` : `Patched up. Bill: $${fine}`;
  state.messageT = 2.6;
  snapCamera(state, p.x, p.y);
}

// --- player -------------------------------------------------------------------

function stepPlayer(state, input, dt) {
  const p = state.player;
  const world = state.world;

  if (p.inCar) {
    const car = p.inCar;
    const ctl = {
      throttle: (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0),
      steer: (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0),
    };
    stepDrivenCar(world, car, ctl, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.footSpeed = Math.abs(car.speed);
    if (car.impact) {
      const impact = car.impact;
      car.impact = 0;
      state.sounds.push('crash');
      if (impact > 130) {
        p.hp -= (impact - 120) * 0.07;
        p.lastHurtT = state.time;
      }
      state.reportCrime('collision', car.x, car.y);
      state.noise.push({ x: car.x, y: car.y, r: 130, ttl: 0.4 });
    }
    if (input.consume('KeyE') || input.consume('KeyF')) {
      // Step out on the left side of the car. A car still rolling is left to
      // coast to a stop on its own; a stopped one counts as parked.
      p.inCar = null;
      car.driver = null;
      car.parked = Math.abs(car.speed) < 2;
      if (car.parked) car.speed = 0;
      const side = car.angle + Math.PI / 2;
      const res = collideCircle(world, car.x + Math.cos(side) * 24, car.y + Math.sin(side) * 24, PLAYER.radius);
      p.x = res.x;
      p.y = res.y;
    }
    return;
  }

  // On foot.
  const mx = input.moveX();
  const my = input.moveY();
  const moving = mx !== 0 || my !== 0;
  const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  if (moving) {
    const len = Math.hypot(mx, my);
    const vx = (mx / len) * speed;
    const vy = (my / len) * speed;
    p.x += vx * dt;
    p.y += vy * dt;
    p.angle = Math.atan2(vy, vx);
    p.footSpeed = speed;
  } else {
    p.footSpeed = 0;
    // Idle: face the mouse (aim).
    const mw = mouseWorld(state, input);
    if (mw) p.angle = Math.atan2(mw.y - p.y, mw.x - p.x);
  }
  const res = collideCircle(world, p.x, p.y, PLAYER.radius);
  p.x = res.x;
  p.y = res.y;

  // Combat: click shoots toward the mouse; with an empty pistol (or J) it's fists.
  if (input.consume('KeyJ')) {
    playerMelee(state);
  } else if (input.mouse.down || input.mouse.clicked) {
    const mw = mouseWorld(state, input);
    const aim = mw ? Math.atan2(mw.y - p.y, mw.x - p.x) : p.angle;
    p.angle = aim;
    if (p.ammo > 0) {
      if (input.consumeClick() || !p.shotHeld) playerShoot(state, aim);
    } else if (input.consumeClick()) {
      playerMelee(state);
    }
    p.shotHeld = true;
  } else {
    p.shotHeld = false;
  }
  input.mouse.clicked = false;

  // Interact: mission contact first (when standing at the motel), then cars.
  if (input.consume('KeyE') || input.consume('KeyF')) {
    const motel = world.locations.motel;
    if (!state.mission && Math.hypot(p.x - motel.x, p.y - motel.y) < 56) {
      startMission(state);
      return;
    }
    const car = nearestEnterableCar(state);
    if (car) enterCar(state, car);
  }
}

function mouseWorld(state, input) {
  if (!input.mouse || (input.mouse.x === 0 && input.mouse.y === 0)) return null;
  return { x: state.camera.x + input.mouse.x, y: state.camera.y + input.mouse.y };
}

function nearestEnterableCar(state) {
  const p = state.player;
  let best = null, bd = PLAYER.enterCarRange;
  for (const car of state.cars) {
    if (car.dead || car.driver === 'player') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function enterCar(state, car) {
  const p = state.player;
  if (car.driver === 'traffic') {
    // Carjack: the driver bails and runs.
    const ped = spawnPeds(state.world, state.rng, 1)[0];
    ped.x = car.x + 20;
    ped.y = car.y + 6;
    state.peds.push(ped);
    scarePed(ped, p.x, p.y, state.rng);
    state.reportCrime('carjack', car.x, car.y);
    state.sounds.push('door');
  } else if (car.driver === 'police') {
    state.reportCrime('carjack', car.x, car.y);
    state.sounds.push('door');
  } else {
    state.reportCrime('theft', car.x, car.y);
    state.sounds.push('door');
  }
  car.driver = 'player';
  car.parked = false;
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
}

function updateHint(state) {
  const p = state.player;
  if (p.inCar) {
    state.hint = 'WASD drive · E exit car';
    return;
  }
  const motel = state.world.locations.motel;
  if (!state.mission && Math.hypot(p.x - motel.x, p.y - motel.y) < 56) {
    state.hint = 'E — talk to Dante';
    return;
  }
  if (nearestEnterableCar(state)) {
    state.hint = 'E — enter car';
    return;
  }
  state.hint = '';
}

// --- vehicle contact resolution ----------------------------------------------

function resolveVehicleContacts(state, dt) {
  void dt;
  const crashes = resolveCarCollisions(state.cars);
  for (const ev of crashes) {
    const involvesPlayer = state.player.inCar && (ev.a === state.player.inCar || ev.b === state.player.inCar);
    if (involvesPlayer) {
      state.sounds.push('crash');
      state.reportCrime('collision', ev.x, ev.y);
      state.noise.push({ x: ev.x, y: ev.y, r: 120, ttl: 0.35 });
      if (ev.impact > 120) {
        state.player.hp -= (ev.impact - 110) * 0.06;
        state.player.lastHurtT = state.time;
      }
    }
  }

  // Cars vs pedestrians, and cars vs the player on foot. Contact uses the
  // two-circle body model, so a car passing in the next lane is harmless.
  for (const car of state.cars) {
    if (car.dead || Math.abs(car.speed) < 4) continue;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (carProximity(car, ped.x, ped.y) >= 7) continue;
      if (Math.abs(car.speed) > 58) {
        knockDown(ped);
        state.sounds.push('thud');
        if (state.rng.chance(0.6)) dropPickup(state, 'cash', ped.x, ped.y, 5 + Math.floor(state.rng.next() * 18));
        if (car.driver === 'player') state.reportCrime('hitAndRun', ped.x, ped.y);
      } else {
        // Nudge the ped out of the way and send them running.
        const a = Math.atan2(ped.y - car.y, ped.x - car.x);
        ped.x = car.x + Math.cos(a) * (carRadius(car) + 10);
        ped.y = car.y + Math.sin(a) * (carRadius(car) + 10);
        scarePed(ped, car.x, car.y, state.rng);
      }
    }
    const p = state.player;
    if (!p.inCar && car.driver !== 'player') {
      if (carProximity(car, p.x, p.y) < PLAYER.radius) {
        const a = Math.atan2(p.y - car.y, p.x - car.x);
        p.x = car.x + Math.cos(a) * (carRadius(car) + PLAYER.radius + 1);
        p.y = car.y + Math.sin(a) * (carRadius(car) + PLAYER.radius + 1);
        // Damage only when the car is actually bearing down on the player —
        // never for brushing past, and never twice in the same impact.
        const toward = (Math.cos(car.angle) * Math.cos(a) + Math.sin(car.angle) * Math.sin(a)) * car.speed;
        if (toward > 78 && state.time - p.lastHurtT > 0.7) {
          p.hp -= 16;
          p.lastHurtT = state.time;
          state.sounds.push('thud');
        }
      }
    }
  }
}

// --- browser boot ---------------------------------------------------------------

export function boot(win) {
  const doc = win.document;
  const canvas = doc.getElementById('game');
  const ctx = canvas.getContext('2d');
  const status = doc.getElementById('status');

  let storage = null;
  try { storage = win.localStorage; } catch { storage = null; }

  const shot = parseShot(win);
  const state = createState(shot ? shot.seed * 1000 + 77 : 20261117, storage);
  const input = new Input(win);
  const sfx = new SoundFX(win);

  // Canvas backing store tracks the window; the world renders in logical
  // 960x540 units, letterboxed.
  let viewScale = 1, viewOX = 0, viewOY = 0;
  function resize() {
    const w = win.innerWidth || VIEW_W;
    const h = win.innerHeight || VIEW_H;
    const dpr = Math.min(2, win.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    viewScale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    viewOX = (canvas.width - VIEW_W * viewScale) / 2;
    viewOY = (canvas.height - VIEW_H * viewScale) / 2;
  }
  resize();
  if (typeof win.addEventListener === 'function') win.addEventListener('resize', resize);

  // Mouse: listeners keep CSS-pixel coords in mouseCss; each frame they are
  // converted into logical view coordinates on the Input object.
  const mouseCss = { x: 0, y: 0 };
  if (typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouseCss.x = e.clientX - r.left;
      mouseCss.y = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        input.mouse.down = true;
        input.mouse.clicked = true;
      }
    });
    win.addEventListener('mouseup', (e) => {
      if (e.button === 0) input.mouse.down = false;
    });
  }

  if (shot) stageShot(state, shot.name);

  let last = 0;
  let acc = 0;
  let announced = '';
  function frame(ts) {
    if (!last) last = ts;
    acc += Math.min(0.25, (ts - last) / 1000);
    last = ts;
    // Mouse: CSS px -> logical view px (accounting for letterboxing).
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0) {
      input.mouse.x = clamp((mouseCss.x * (canvas.width / rect.width) - viewOX) / viewScale, 0, VIEW_W);
      input.mouse.y = clamp((mouseCss.y * (canvas.height / rect.height) - viewOY) / viewScale, 0, VIEW_H);
    }
    while (acc >= STEP) {
      stepGame(state, input, STEP);
      acc -= STEP;
    }
    if (input.consume('KeyM')) {
      const muted = sfx.toggleMute();
      state.message = muted ? 'Sound off' : 'Sound on';
      state.messageT = 1.4;
    }
    drainSounds(state, sfx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#160b18';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(viewScale, 0, 0, viewScale, viewOX, viewOY);
    render(ctx, state);
    if (shot && !win.__shotReady) win.__shotReady = true;
    if (status && state.objective !== announced) {
      announced = state.objective;
      status.textContent = announced;
    }
    win.requestAnimationFrame(frame);
  }
  win.requestAnimationFrame(frame);

  const unlock = () => sfx.unlock();
  win.addEventListener('keydown', unlock);
  win.addEventListener('mousedown', unlock);
  return { state, input, sfx };
}

function drainSounds(state, sfx) {
  for (const s of state.sounds) {
    if (s === 'shot') sfx.shot();
    else if (s === 'melee') sfx.melee();
    else if (s === 'pickup') sfx.pickup();
    else if (s === 'cash') sfx.cash();
    else if (s === 'crash') sfx.crash();
    else if (s === 'fail') sfx.fail();
    else if (s === 'success') sfx.success();
    else if (s === 'dialogue') sfx.dialogue();
    else if (s === 'thud') sfx.melee();
    else if (s === 'door') sfx.pickup();
    else if (s === 'alarm') sfx.fail();
    else if (s === 'empty') sfx.dialogue();
  }
  state.sounds.length = 0;
  const p = state.player;
  const driving = state.screen === 'play' && p.inCar;
  sfx.engine(driving ? Math.abs(p.inCar.speed) / 230 : 0, !!driving);
  const policeNear = state.stars > 0 && state.cars.some((c) => c.driver === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 430);
  sfx.siren(policeNear, STEP);
  // Screech on hard steering at speed.
  if (driving && Math.abs(p.inCar.speed) > 120 && state.rng.chance(0.02)) sfx.screech();
}

// Auto-boot in a real browser; skipped under Node (no document).
if (typeof document !== 'undefined' && document.getElementById && document.getElementById('game')) {
  boot(window);
}
