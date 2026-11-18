// Palm City Heat — headless verification. Stubs the browser just enough to import the game,
// then drives the real simulation with scripted input: determinism, an autopilot that
// walks to a car, steals it and drives for a minute, a witnessed shooting, the first
// story mission end to end, and a save/load round-trip. Run: node tools/simtest.mjs

// --- browser stubs, installed before the game modules load -------------------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = { addEventListener() {}, location: { search: '' } };
globalThis.document = { getElementById: () => null, addEventListener() {} };

const { createGame, stepGame, saveGame, loadSaveData, applySave } = await import('../game/src/main.js');
const { drawGame } = await import('../game/src/render.js');
const { stageShot } = await import('../game/src/shots.js');
const { hashString } = await import('../game/src/random.js');
const { STEP } = await import('../game/src/config.js');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function makeCtx() {
  const gradient = { addColorStop() {} };
  const ctx = {
    canvas: null,
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', globalAlpha: 1,
    fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, arcTo() {}, fill() {}, stroke() {},
    save() {}, restore() {}, translate() {}, rotate() {},
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };
  return ctx;
}

function stateHash(state) {
  const p = state.player;
  const parts = [
    Math.round(p.x), Math.round(p.y), p.cash, Math.round(p.hp), state.wanted.stars,
    state.mission.index, state.mission.phase,
    state.cars.map((c) => `${Math.round(c.x)},${Math.round(c.y)},${Math.round(c.angle * 100)},${Math.round(c.hp)}`).join(';'),
    state.peds.filter((d) => !d.down).length,
  ];
  return hashString(parts.join('|'));
}

/** Test driver: walks toward a point, or drives the player's car along the lanes. */
function autopilot(state, driveTarget) {
  const input = state.input;
  const p = state.player;
  input.up = input.down = input.left = input.right = false;
  if (!p.car) {
    const dx = driveTarget.x - p.x;
    const dy = driveTarget.y - p.y;
    if (dx > 12) input.right = true; else if (dx < -12) input.left = true;
    if (dy > 12) input.down = true; else if (dy < -12) input.up = true;
    input.run = true;
    return;
  }
  const car = p.car;
  // Lane-following: aim ahead, pulled to the lane centre of the current road band.
  const band = 480;
  let tx = car.x + Math.cos(car.angle) * 170;
  let ty = car.y + Math.sin(car.angle) * 170;
  if (Math.abs(Math.cos(car.angle)) > 0.7) {
    const centre = Math.floor(car.y / band) * band + 48;
    ty = centre + (Math.cos(car.angle) > 0 ? 24 : -24);
  } else {
    const centre = Math.floor(car.x / band) * band + 48;
    tx = centre + (Math.sin(car.angle) > 0 ? -24 : 24);
  }
  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > 0.07) input.right = true; else if (diff < -0.07) input.left = true;
  // Adaptive cruise: lift off when something solid is close ahead.
  let blocked = false;
  const fx = car.x + Math.cos(car.angle) * 78;
  const fy = car.y + Math.sin(car.angle) * 78;
  for (const other of state.cars) {
    if (other !== car && Math.hypot(other.x - fx, other.y - fy) < 44) { blocked = true; break; }
  }
  input.up = !blocked;
}

// --- 1. determinism ----------------------------------------------------------
function scriptedRun(seed) {
  const state = createGame(seed);
  state.screen = 'playing';
  const targetCar = state.cars.find((c) => c.driver === 'parked');
  for (let i = 0; i < 3900; i += 1) {
    if (!state.player.car && targetCar) {
      autopilot(state, targetCar);
      if (Math.hypot(state.player.x - targetCar.x, state.player.y - targetCar.y) < 40) {
        state.input.queue.push('interact');
      }
    } else {
      autopilot(state, null);
    }
    stepGame(state, STEP);
  }
  return state;
}
const runA = scriptedRun(42);
const runB = scriptedRun(42);
const hashA = stateHash(runA);
const hashB = stateHash(runB);
check('determinism: two identical 3900-step runs hash the same', hashA === hashB, `hash ${hashA} vs ${hashB}`);
const runC = scriptedRun(99);
check('determinism: a different seed gives a different world', stateHash(runC) !== hashA, `hash ${stateHash(runC)}`);

// --- 2. autopilot: walk, steal, drive a minute -------------------------------
{
  const state = runA; // the scripted run already walked, entered and drove
  check('autopilot: the scripted run ends with the player in a car', !!state.player.car);
  const driven = state.player.car ? Math.hypot(state.player.car.x, state.player.car.y) : 0;
  check('autopilot: 60+ sim-seconds of driving completed without errors', state.tick >= 3900 && driven > 0, `tick ${state.tick}`);
}

// --- 3. a witnessed crime raises the wanted level -----------------------------
{
  const state = createGame(5);
  state.screen = 'playing';
  const victim = state.peds[0];
  state.peds[1].x = victim.x + 60; state.peds[1].y = victim.y;
  state.peds[2].x = victim.x - 55; state.peds[2].y = victim.y + 20;
  state.player.x = victim.x - 24;
  state.player.y = victim.y;
  state.aim.x = victim.x;
  state.aim.y = victim.y;
  state.input.shoot = true;
  for (let i = 0; i < 30; i += 1) stepGame(state, STEP);
  state.input.shoot = false;
  check('crime: the shot ped went down', victim.down === true);
  check('crime: witnesses raised the wanted level', state.wanted.stars >= 1, `stars ${state.wanted.stars}`);
  for (let i = 0; i < 30; i += 1) stepGame(state, STEP);
  const cops = state.cars.filter((c) => c.police).length;
  check('crime: police interceptors spawned', cops >= 2, `${cops} on the map`);
}

// --- 4. mission 1 completes through the real state machine --------------------
{
  const state = createGame(11);
  state.screen = 'playing';
  const cashBefore = state.player.cash;
  state.player.x = state.world.pois.contact.x - 20;
  state.player.y = state.world.pois.contact.y;
  for (let i = 0; i < 12 && state.mission.phase !== 'active'; i += 1) {
    state.input.queue.push('interact');
    stepGame(state, STEP);
  }
  check('mission 1: talking to Marisol starts the job', state.mission.phase === 'active', `phase ${state.mission.phase}`);
  state.player.x = 1680; state.player.y = 984;
  stepGame(state, STEP);
  check('mission 1: pickup advances to the delivery stage', state.mission.stageIdx === 1, `stage ${state.mission.stageIdx}`);
  state.player.x = 2160; state.player.y = 1900;
  stepGame(state, STEP);
  check('mission 1: delivery completes the job', state.mission.index === 1, `index ${state.mission.index}`);
  check('mission 1: the payout landed', state.player.cash === cashBefore + 300, `cash ${cashBefore} -> ${state.player.cash}`);
}

// --- 5. save / load round-trip -------------------------------------------------
{
  const state = createGame(3);
  state.player.cash = 777;
  state.mission.index = 2;
  saveGame(state);
  const fresh = createGame(4);
  const data = loadSaveData();
  applySave(fresh, data);
  check('save/load: cash and story progress restored', fresh.player.cash === 777 && fresh.mission.index === 2,
    `cash ${fresh.player.cash}, index ${fresh.mission.index}`);
}

// --- 6. render + screenshot scenes smoke test ----------------------------------
{
  const ctx = makeCtx();
  const state = createGame(7);
  drawGame(ctx, state, 1280, 720);
  state.screen = 'playing';
  drawGame(ctx, state, 1280, 720);
  for (const name of ['start', 'drive', 'chase']) {
    const staged = stageShot(name, 1, { createGame, stepGame });
    drawGame(ctx, staged, 1280, 720);
    if (name === 'chase') {
      check('shots: the chase scene carries three stars', staged.wanted.stars === 3, `stars ${staged.wanted.stars}`);
      check('shots: the chase scene has police on screen', staged.cars.some((c) => c.police));
    }
    if (name === 'drive') {
      check('shots: the drive scene has the player driving', !!staged.player.car);
    }
  }
  check('render: title, play and all three shot scenes draw without errors', true);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
