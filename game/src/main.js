// Palm City Heat — the game itself.
// One job: own the state and the fixed-step simulation — player on foot and
// behind the wheel, every system wired together, screens, save/continue —
// and boot it in the browser. Drawing lives in render.js; the city in
// world.js; each system in its own file.

import { DAY, GUN, HEAT, PLAYER, SAVE_KEY, STEP, WORLD } from './config.js';
import { clamp, dist2, hashString, makeRng } from './random.js';
import { collideCircle, districtAt, generateCity } from './world.js';
import { createVehicle, damageCar, maintainTraffic, spawnParkedCars, spawnTrafficCar, stepPlayerVehicle, stepTraffic } from './vehicles.js';
import { createPed, hurtPed, maintainPeds, spawnFleeingDriver, spawnPeds, stepPed } from './peds.js';
import { maintainPolice, reportCrime, stepBust, stepCop, stepWanted } from './police.js';
import { playerWeapon, restockPickups, seedPickups, stepCombat } from './combat.js';
import { currentTarget, newMissionState, objectiveText, onEnterVehicle, tryInteract, updateMissions } from './missions.js';
import { createAudio } from './audio.js';
import { blankInput, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

export { SCREEN_BUSTED, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_TITLE, SCREEN_WASTED };

const DISTRICT_NAMES = {
  downtown: 'Downtown',
  commercial: 'The Marina Mile',
  suburbs: 'Coral Heights',
  park: 'Palm Court Park',
  beachfront: 'Ocean Drive',
  beach: 'Palm Beach',
};

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

export function createGame({ seed = 1, storage = null, audio = null } = {}) {
  const rng = makeRng(seed);
  const cosmetic = makeRng((seed ^ 0x9e3779b9) >>> 0);
  const city = generateCity(makeRng((seed + 777) >>> 0));
  const store = storage || memoryStorage();
  const sound = audio || createAudio();

  const districtGrid = city.cols.map((c, ci) =>
    city.rows.map((r, ri) => districtAt((c[0] + c[1]) / 2, (r[0] + r[1]) / 2)),
  );

  const contact = city.locations.contact;
  const state = {
    tick: 0,
    rng,
    city,
    audio: sound,
    screen: SCREEN_TITLE,
    player: {
      x: contact.x + 46, y: contact.y + 16,
      angle: -Math.PI / 2, aimAngle: -Math.PI / 2,
      hp: PLAYER.hp, cash: 120, ammo: GUN.startAmmo,
      inCar: null, attackCd: 0, muzzleT: -999,
    },
    playerSpeed: 0,
    playerSeen: false,
    playerCarAngle: 0,
    vehicles: [],
    peds: [],
    bullets: [],
    pickups: [],
    particles: [],
    floaters: [],
    nextId: 1,
    heat: 0,
    wanted: 0,
    bust: 0,
    lastCrimeAt: -99999,
    lastCopSpawn: -99999,
    lastHurtAt: -99999,
    threat: null,
    shake: 0,
    clockMinutes: DAY.startMinutes,
    camera: { x: 0, y: 0 },
    view: { w: 960, h: 540 },
    mission: newMissionState(),
    banner: null,
    dialogueView: null,
    hud: { objective: '', prompt: '', target: null },
    districtName: 'Ocean Drive',
    districtGrid,
    endText: '',
    hasSave: false,
    started: false,
  };

  // ---- cross-system helpers the modules call through state ------------------
  state.reportCrime = (kind, x, y) => reportCrime(state, kind, x, y);
  state.spawnFleeingDriver = (v) => spawnFleeingDriver(state, v);
  state.spawnParticles = (x, y, n, color) => {
    for (let i = 0; i < n; i++) {
      state.particles.push({
        x, y,
        vx: cosmetic.float(-1.6, 1.6), vy: cosmetic.float(-1.6, 1.6),
        life: cosmetic.int(14, 34), maxLife: 34,
        size: cosmetic.float(1.6, 3.6), color,
      });
    }
  };
  state.addFloater = (x, y, text, color) => {
    state.floaters.push({ x, y, text, color, life: 80 });
  };
  state.spawnSpecialCar = (x, y) => createVehicle(state, { x, y, angle: Math.PI / 2, driver: 'none', gold: true, model: 4 });

  // ---- population ------------------------------------------------------------
  spawnParkedCars(state);
  for (let i = 0; i < 16; i++) spawnTrafficCar(state, true);
  spawnPeds(state);
  seedPickups(state);
  state.hasSave = !!safeRead();

  function safeRead() {
    try {
      return store.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  }

  // ---- save / load -------------------------------------------------------------
  function save() {
    try {
      store.setItem(SAVE_KEY, JSON.stringify({
        cash: state.player.cash,
        ammo: state.player.ammo,
        hp: state.player.hp,
        x: Math.round(state.player.x),
        y: Math.round(state.player.y),
        storyIndex: state.mission.storyIndex,
        done: state.mission.done,
        clockMinutes: state.clockMinutes,
      }));
      state.hasSave = true;
    } catch {
      // Storage off (private mode): the run simply lives in memory.
    }
  }

  function load() {
    const raw = safeRead();
    if (!raw) return false;
    try {
      const s = JSON.parse(raw);
      const p = state.player;
      p.cash = s.cash | 0;
      p.ammo = s.ammo | 0;
      p.hp = clamp(s.hp || 100, 10, 100);
      const res = collideCircle(city, s.x || p.x, s.y || p.y, PLAYER.radius);
      p.x = res.x;
      p.y = res.y;
      p.inCar = null;
      state.mission.storyIndex = s.storyIndex | 0;
      state.mission.done = !!s.done;
      state.mission.active = null;
      state.mission.dialogue = null;
      state.clockMinutes = s.clockMinutes || DAY.startMinutes;
      state.heat = 0;
      state.bust = 0;
      return true;
    } catch {
      return false;
    }
  }

  // ---- flow ---------------------------------------------------------------------
  function startNewGame() {
    const p = state.player;
    p.x = contact.x + 46;
    p.y = contact.y + 16;
    p.hp = PLAYER.hp;
    p.cash = 120;
    p.ammo = GUN.startAmmo;
    p.inCar = null;
    state.mission = newMissionState();
    state.heat = 0;
    state.bust = 0;
    state.wanted = 0;
    state.clockMinutes = DAY.startMinutes;
    state.screen = SCREEN_PLAY;
    state.started = true;
    state.banner = { text: 'PALM CITY HEAT', sub: 'Meet Vivi at the Marlin Hotel. Try to stay nobody — for now.', t: state.tick };
  }

  function continueGame() {
    if (load()) {
      state.screen = SCREEN_PLAY;
      state.started = true;
      state.banner = { text: 'Welcome back to Palm City', sub: objectiveText(state), t: state.tick };
    } else {
      startNewGame();
    }
  }

  function respawnAt(locationId, hpAfter) {
    const at = city.locations[locationId];
    const p = state.player;
    if (p.inCar) {
      const car = state.vehicles.find((v) => v.id === p.inCar);
      if (car && car.driver === 'player') car.driver = 'none';
      p.inCar = null;
    }
    const res = collideCircle(city, at.x + 30, at.y + 14, PLAYER.radius);
    p.x = res.x;
    p.y = res.y;
    p.hp = hpAfter;
    state.heat = 0;
    state.bust = 0;
    state.wanted = 0;
  }

  function doBusted() {
    const fine = Math.min(state.player.cash, 150 + state.wanted * 40);
    state.player.cash -= fine;
    state.endText = `The PCPD charges $${fine} in "processing fees". You walk out of Palm City Central into the glare.`;
    state.screen = SCREEN_BUSTED;
    sound.bust();
    respawnAt('station', PLAYER.hp);
  }

  function doWasted() {
    const bill = Math.min(state.player.cash, 120);
    state.player.cash -= bill;
    state.endText = `Palm City General patches you up and bills you $${bill}. The city kept your dignity as a deposit.`;
    state.screen = SCREEN_WASTED;
    sound.wasted();
    respawnAt('hospital', 70);
  }

  // ---- player ---------------------------------------------------------------------
  function nearestVehicle(maxD) {
    let best = null;
    let bestD = maxD * maxD;
    for (const v of state.vehicles) {
      if (v.dead || v.wrecked || v.kind === 'cop') continue;
      const d = dist2(state.player.x, state.player.y, v.x, v.y);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  function enterCar(v) {
    const p = state.player;
    if (v.driver === 'traffic') {
      state.reportCrime('carjack', v.x, v.y);
      spawnFleeingDriver(state, v);
    } else if (v.driver === 'none') {
      state.reportCrime('theft', v.x, v.y);
    }
    v.driver = 'player';
    v.speed = 0;
    p.inCar = v.id;
    p.x = v.x;
    p.y = v.y;
    sound.door();
    onEnterVehicle(state, v);
  }

  function exitCar() {
    const p = state.player;
    const v = state.vehicles.find((c) => c.id === p.inCar);
    if (!v) { p.inCar = null; return; }
    v.driver = 'none';
    const side = v.angle + Math.PI / 2;
    const res = collideCircle(city, v.x + Math.cos(side) * 30, v.y + Math.sin(side) * 30, PLAYER.radius);
    p.x = res.x;
    p.y = res.y;
    p.inCar = null;
    sound.door();
  }

  function stepPlayerOnFoot(input) {
    const p = state.player;
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const d = Math.hypot(dx, dy);
      dx /= d;
      dy /= d;
      p.angle = Math.atan2(dy, dx);
    }
    const speed = input.run ? PLAYER.run : PLAYER.walk;
    const ox = p.x;
    const oy = p.y;
    if (moving) {
      const res = collideCircle(city, p.x + dx * speed, p.y + dy * speed, PLAYER.radius);
      p.x = res.x;
      p.y = res.y;
    }
    state.playerSpeed = Math.hypot(p.x - ox, p.y - oy);

    // Aim: explicit angle (tests) beats the mouse; the mouse beats facing.
    if (typeof input.aimAngle === 'number') p.aimAngle = input.aimAngle;
    else if (input.mouseX || input.mouseY) {
      const wx = state.camera.x + input.mouseX;
      const wy = state.camera.y + input.mouseY;
      p.aimAngle = Math.atan2(wy - p.y, wx - p.x);
    } else if (moving) p.aimAngle = p.angle;

    if (input.interact) {
      if (!tryInteract(state)) {
        const v = nearestVehicle(PLAYER.enterRange);
        if (v) enterCar(v);
      }
    }
    // Standing in the road is how Palm City thins its crowds: traffic hurts.
    for (const v of state.vehicles) {
      if (v.dead || v.wrecked || Math.abs(v.speed) < 2.2) continue;
      if (dist2(p.x, p.y, v.x, v.y) < 25 * 25 && state.tick - state.lastHurtAt > 50) {
        state.lastHurtAt = state.tick;
        p.hp -= 9;
        state.spawnParticles(p.x, p.y, 6, '#e74c3c');
        sound.hit();
        const d = Math.hypot(p.x - v.x, p.y - v.y) || 1;
        const res = collideCircle(city, p.x + ((p.x - v.x) / d) * 22, p.y + ((p.y - v.y) / d) * 22, PLAYER.radius);
        p.x = res.x;
        p.y = res.y;
      }
    }
  }

  function stepPlayerInCar(input) {
    const p = state.player;
    const v = state.vehicles.find((c) => c.id === p.inCar);
    if (!v) { p.inCar = null; return; }
    stepPlayerVehicle(state, v, input);
    p.x = v.x;
    p.y = v.y;
    state.playerSpeed = Math.abs(v.speed);
    state.playerCarAngle = v.angle;
    if (input.interact && Math.abs(v.speed) < 1) exitCar();
    if (v.wrecked) {
      state.addFloater(p.x, p.y - 26, 'Wrecked! Get out and find new wheels.', '#ff5d5d');
      if (input.interact) exitCar();
    }
  }

  // ---- ambient + fx ------------------------------------------------------------------
  function stepAmbient() {
    for (const v of state.vehicles) {
      if (v.dead) continue;
      if (v.driver === 'traffic') stepTraffic(state, v);
      else if (v.driver === 'cop') stepCop(state, v);
    }
    for (const p of state.peds) stepPed(state, p);
    state.vehicles = state.vehicles.filter((v) => !v.dead);
  }

  function stepFx() {
    for (const pt of state.particles) {
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.life--;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const f of state.floaters) {
      f.y -= 0.55;
      f.life--;
    }
    state.floaters = state.floaters.filter((f) => f.life > 0);
    state.shake = Math.max(0, state.shake - 0.35);
  }

  function updateCamera(titlePan) {
    const cam = state.camera;
    const view = state.view;
    let tx;
    let ty;
    if (titlePan) {
      tx = 2350 + Math.sin(state.tick / 900) * 500 - view.w / 2;
      ty = 1350 + Math.cos(state.tick / 1100) * 260 - view.h / 2;
    } else {
      tx = state.player.x - view.w / 2;
      ty = state.player.y - view.h / 2;
    }
    cam.x = clamp(tx, 0, Math.max(0, WORLD.w - view.w));
    cam.y = clamp(ty, 0, Math.max(0, WORLD.h - view.h));
  }

  function updateHud() {
    state.hud.objective = state.screen === SCREEN_PLAY || state.screen === SCREEN_PAUSED ? objectiveText(state) : '';
    state.hud.target = currentTarget(state);
    const p = state.player;
    let prompt = '';
    if (state.mission.dialogue) prompt = '';
    else if (p.inCar) {
      const v = state.vehicles.find((c) => c.id === p.inCar);
      if (v && Math.abs(v.speed) < 1) prompt = 'E — get out';
    } else if (state.screen === SCREEN_PLAY) {
      const c = city.locations.contact;
      if (!state.mission.active && c && dist2(p.x, p.y, c.x, c.y) < 70 * 70) prompt = 'E — talk to Vivi';
      else if (nearestVehicle(PLAYER.enterRange)) prompt = 'E — get in';
    }
    state.hud.prompt = prompt;
    state.districtName = DISTRICT_NAMES[districtAt(p.x, p.y)] || 'Palm City';
    const d = state.mission.dialogue;
    state.dialogueView = d ? { speaker: d.lines[d.i][0], line: d.lines[d.i][1] } : null;
  }

  // ---- the step ------------------------------------------------------------------------
  function step(rawInput) {
    const input = { ...blankInput(), ...rawInput };
    state.tick++;
    if (input.mutePressed) sound.toggleMute();

    if (state.screen === SCREEN_TITLE) {
      stepAmbient();
      stepFx();
      updateCamera(true);
      if (input.continuePressed && state.hasSave) continueGame();
      else if (input.confirmPressed) startNewGame();
      updateHud();
      return;
    }
    if (state.screen === SCREEN_BUSTED || state.screen === SCREEN_WASTED) {
      stepFx();
      updateCamera(false);
      if (input.confirmPressed || input.interact) state.screen = SCREEN_PLAY;
      updateHud();
      return;
    }
    if (state.screen === SCREEN_PAUSED) {
      if (input.pausePressed || input.confirmPressed) state.screen = SCREEN_PLAY;
      updateHud();
      return;
    }
    if (input.pausePressed) {
      state.screen = SCREEN_PAUSED;
      updateHud();
      return;
    }

    // SCREEN_PLAY
    const inDialogue = !!state.mission.dialogue;
    if (!inDialogue) {
      if (state.player.inCar) stepPlayerInCar(input);
      else stepPlayerOnFoot(input);
    } else {
      state.playerSpeed = 0;
    }
    stepCombat(state, input);
    stepAmbient();
    maintainTraffic(state);
    maintainPeds(state);
    stepWanted(state);
    maintainPolice(state);
    if (stepBust(state)) {
      doBusted();
    }
    updateMissions(state, input);
    restockPickups(state);

    // Slow recovery when the city leaves you alone.
    if (state.player.hp > 0 && state.player.hp < PLAYER.hp && state.tick - state.lastHurtAt > 320 && state.wanted === 0) {
      state.player.hp = Math.min(PLAYER.hp, state.player.hp + 0.05);
    }
    if (state.player.hp <= 0) doWasted();

    if (state.tick % DAY.stepsPerMinute === 0) state.clockMinutes = (state.clockMinutes + 1) % (24 * 60);
    if (state.tick % 900 === 0 && state.screen === SCREEN_PLAY) save();

    stepFx();
    updateCamera(false);
    updateHud();
  }

  function stateHash() {
    const p = state.player;
    const parts = [
      state.tick,
      Math.round(p.x * 10), Math.round(p.y * 10),
      p.cash, Math.round(p.hp * 10), p.ammo, p.inCar || 0,
      Math.round(state.heat * 100), state.wanted,
      state.mission.storyIndex, state.mission.active ? state.mission.active.phaseIndex : -1,
      state.clockMinutes,
    ];
    let vs = 0;
    for (const v of state.vehicles) vs += Math.round(v.x) * 3 + Math.round(v.y) * 7 + Math.round(v.speed * 20);
    let ps = 0;
    for (const pd of state.peds) ps += Math.round(pd.x) * 5 + Math.round(pd.y) * 11;
    parts.push(vs, ps, state.vehicles.length, state.peds.length);
    return hashString(parts.join('|'));
  }

  return { state, city, step, save, load, startNewGame, continueGame, stateHash };
}

// ---- browser boot ---------------------------------------------------------------------
const bootCanvas = typeof document !== 'undefined' && document.getElementById ? document.getElementById('game') : null;
if (bootCanvas && typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed = Number.isInteger(seedParam) ? seedParam : 20240;
  const game = createGame({ seed, storage: window.localStorage, audio: createAudio() });
  const renderer = createRenderer(bootCanvas);
  const readInput = createInput(bootCanvas);
  game.state.view = renderer.view;
  const status = document.getElementById('status');

  const shot = params.get('shot');
  if (shot) {
    stageShot(game, shot);
    let painted = 0;
    const paint = () => {
      renderer.draw(game.state);
      painted++;
      if (painted < 3) requestAnimationFrame(paint);
      else window.__shotReady = true;
    };
    requestAnimationFrame(paint);
  } else {
    let accumulator = 0;
    let last = performance.now();
    const frame = (now) => {
      requestAnimationFrame(frame);
      accumulator += Math.min((now - last) / 1000, 0.25);
      last = now;
      let input = readInput();
      game.state.view = renderer.view;
      while (accumulator >= STEP) {
        game.step(input);
        accumulator -= STEP;
        input = { ...input, interact: false, confirmPressed: false, continuePressed: false, pausePressed: false, attackPressed: false, mutePressed: false };
      }
      renderer.draw(game.state);
      if (status) {
        const label = game.state.screen === SCREEN_TITLE ? 'Palm City Heat. Press Enter to start.'
          : game.state.screen === SCREEN_PLAY ? `Playing. Cash $${game.state.player.cash}. ${game.state.hud.objective}`
            : game.state.screen;
        if (status.textContent !== label) status.textContent = label;
      }
    };
    requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.state.screen === SCREEN_PLAY) game.state.screen = SCREEN_PAUSED;
    });
    bootCanvas.addEventListener('pointerdown', () => game.state.audio.unlock());
    window.addEventListener('keydown', () => game.state.audio.unlock(), { once: true });
  }
}

// Re-exported for the headless test and curious tooling.
export { createPed, damageCar, hurtPed, PLAYER, STEP, WORLD };
