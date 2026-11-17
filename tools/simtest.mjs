// Palm City Heat — headless simulation test.
// Boots the real game state in Node (no DOM needed: createState/stepGame
// never touch the document) and drives it with scripted input through the
// same Input object the browser uses. Asserts determinism, driving, crime
// and police response, mission 1 completion, and save/load.
//
//   node tools/simtest.mjs

import { createState, stepGame, loadSave } from '../game/src/main.js';
import { Input } from '../game/src/input.js';
import { STEP } from '../game/src/config.js';
import { nearestIntersection } from '../game/src/world.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

function makeInput() {
  return new Input(null);
}

function clearKeys(input) {
  input.keys.clear();
}

function press(input, code) {
  input.pressed.add(code);
}

// All stepping goes through here so tests can count simulated steps.
let stepCount = 0;
function step(state, input) {
  stepCount += 1;
  stepGame(state, input, STEP);
}

function startRun(input, state) {
  press(input, 'Enter');
  step(state, input);
}

function hashState(state) {
  const p = state.player;
  const data = {
    px: Math.round(p.x * 100), py: Math.round(p.y * 100),
    hp: Math.round(p.hp * 10), cash: p.cash, ammo: p.ammo,
    heat: Math.round(state.heat * 10), stars: state.stars,
    storyIdx: state.storyIdx, screen: state.screen,
    cars: state.cars.map((c) => [Math.round(c.x), Math.round(c.y), Math.round(c.angle * 100), Math.round(c.speed), Math.round(c.health), c.driver, c.dead ? 1 : 0]),
    peds: state.peds.map((d) => [Math.round(d.x), Math.round(d.y), d.state]),
    pickups: state.pickups.length,
    clock: Math.round(state.clockMin),
  };
  const s = JSON.stringify(data);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return { hash: (h >>> 0).toString(16).padStart(8, '0'), json: s };
}

// Scripted movement helpers -------------------------------------------------

function walkTo(state, input, tx, ty, maxSteps, radius = 24) {
  for (let i = 0; i < maxSteps; i++) {
    clearKeys(input);
    const p = state.player;
    const dx = tx - p.x, dy = ty - p.y;
    if (Math.hypot(dx, dy) < radius) return true;
    input.keys.add('ShiftLeft');
    if (dx > 2) input.keys.add('KeyD');
    else if (dx < -2) input.keys.add('KeyA');
    if (dy > 2) input.keys.add('KeyS');
    else if (dy < -2) input.keys.add('KeyW');
    step(state, input);
    if (state.screen !== 'play') return false;
  }
  return Math.hypot(tx - state.player.x, ty - state.player.y) < radius;
}

// Walk via the road grid: nearest intersection, across, down, then target.
function walkRouteTo(state, input, tx, ty, maxSteps, radius = 24) {
  const w = state.world;
  const from = nearestIntersection(w, state.player.x, state.player.y);
  const toI = nearestIntersection(w, tx, ty);
  const legs = [
    [from.x, from.y, 16],
    [toI.x, from.y, 16],
    [toI.x, toI.y, 16],
    [tx, ty, radius],
  ];
  const per = Math.floor(maxSteps / legs.length);
  for (const [lx, ly, lr] of legs) {
    if (Math.hypot(lx - state.player.x, ly - state.player.y) < lr) continue;
    if (!walkTo(state, input, lx, ly, per, lr)) return false;
  }
  return Math.hypot(tx - state.player.x, ty - state.player.y) < radius + 6;
}

function driveCarTo(state, input, tx, ty, maxSteps, radius = 40, onStep = null) {
  let blocked = 0, reverseSteps = 0;
  for (let i = 0; i < maxSteps; i++) {
    clearKeys(input);
    const car = state.player.inCar;
    if (!car) return false;
    const dx = tx - car.x, dy = ty - car.y;
    if (Math.hypot(dx, dy) < radius) return true;
    let diff = Math.atan2(dy, dx) - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (reverseSteps > 0) {
      input.keys.add('KeyS');
      // Steer opposite while reversing to swing the nose around.
      if (diff > 0.05) input.keys.add('KeyA');
      else if (diff < -0.05) input.keys.add('KeyD');
      reverseSteps -= 1;
    } else if (Math.abs(diff) > 2.2) {
      // Facing the wrong way: back-and-turn (K-turn) instead of grinding.
      reverseSteps = 30;
    } else if (blocked > 75) {
      reverseSteps = 42;
      blocked = 0;
    } else if (blocked > 30 && obstacleAhead(state, car)) {
      // Someone is sitting in front of us: wait for them to move off.
    } else {
      // Cruise-control at ~135px/s: full-throttle slamming is what kills
      // the driver in wrecks, so lift off beyond a sane city speed.
      if (Math.abs(diff) < 1.9 && Math.abs(car.speed) < 135) input.keys.add('KeyW');
      if (diff > 0.05) input.keys.add('KeyD');
      else if (diff < -0.05) input.keys.add('KeyA');
    }
    if (Math.abs(car.speed) < 5 && reverseSteps === 0) blocked += 1;
    else if (Math.abs(car.speed) >= 5) blocked = 0;
    step(state, input);
    if (onStep) onStep();
    if (state.screen !== 'play') return false;
  }
  const car = state.player.inCar;
  return !!car && Math.hypot(tx - car.x, ty - car.y) < radius;
}

function obstacleAhead(state, car) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  for (const other of state.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    const side = -dx * fy + dy * fx;
    if (ahead > 0 && ahead < 54 && Math.abs(side) < 20) return true;
  }
  return false;
}

// Drive to a point via the road grid: nearest intersection, across along
// the avenue, down the target's street, then the target itself. Every leg
// runs along a road centre, so the car never cuts across blocks.
function driveRouteTo(state, input, tx, ty, maxSteps, radius = 40, onStep = null) {
  const w = state.world;
  const from = nearestIntersection(w, state.player.x, state.player.y);
  const toI = nearestIntersection(w, tx, ty);
  const legs = [
    [from.x, from.y],
    [toI.x, from.y],
    [toI.x, toI.y],
    [tx, ty],
  ];
  const per = Math.floor(maxSteps / legs.length);
  for (const [lx, ly] of legs) {
    if (state.player.inCar && Math.hypot(lx - state.player.x, ly - state.player.y) < 26) continue;
    driveCarTo(state, input, lx, ly, per, 30, onStep); // a failed leg doesn't doom the route
  }
  const car = state.player.inCar;
  return !!car && Math.hypot(tx - car.x, ty - car.y) < radius + 8;
}

function advanceDialogue(state, input, maxPresses = 14) {
  for (let i = 0; i < maxPresses && state.dialogue; i++) {
    clearKeys(input);
    press(input, 'KeyE');
    step(state, input);
  }
  return !state.dialogue;
}

// --- 1. determinism ---------------------------------------------------------

console.log('1. Determinism: two identical 3,600-step runs');
function scriptedRun() {
  const state = createState(4242, null);
  const input = makeInput();
  startRun(input, state);
  for (let i = 0; i < 3600; i++) {
    clearKeys(input);
    const phase = Math.floor(i / 300) % 4;
    if (phase === 0) input.keys.add('KeyD');
    else if (phase === 1) { input.keys.add('KeyW'); input.keys.add('ShiftLeft'); }
    else if (phase === 2) input.keys.add('KeyA');
    else input.keys.add('KeyS');
    if (i % 450 === 449) press(input, 'KeyE');
    if (i % 700 === 699) press(input, 'KeyJ');
    input.mouse.x = 500;
    input.mouse.y = 200;
    step(state, input);
  }
  return state;
}
const runA = scriptedRun();
const runB = scriptedRun();
const hashA = hashState(runA);
const hashB = hashState(runB);
console.log(`  hash A: ${hashA.hash}  hash B: ${hashB.hash}`);
check('identical state hashes after 3,600 steps', hashA.hash === hashB.hash);
check('identical full state JSON', hashA.json === hashB.json);

// --- 2. autopilot: walk, steal a car, drive 60 sim-seconds -------------------

console.log('2. Autopilot: walk to a car, enter it, drive for 60s');
{
  const state = createState(777, null);
  const input = makeInput();
  startRun(input, state);
  const parked = state.cars.find((c) => c.parked);
  check('found a parked car to steal', !!parked);
  const reached = walkRouteTo(state, input, parked.x, parked.y, 2400, 30);
  check('autopilot walked to the car', reached, `player at ${Math.round(state.player.x)},${Math.round(state.player.y)} car at ${Math.round(parked.x)},${Math.round(parked.y)} screen=${state.screen}`);
  clearKeys(input);
  press(input, 'KeyE');
  step(state, input);
  check('autopilot entered the car', state.player.inCar === parked, `inCar=${!!state.player.inCar}`);

  let distance = 0, px = state.player.x, py = state.player.y, inCarSteps = 0;
  const corners = [
    [state.world.roadVX[5], state.world.roadHY[1]],
    [state.world.roadVX[5], state.world.roadHY[4]],
    [state.world.roadVX[1], state.world.roadHY[4]],
    [state.world.roadVX[1], state.world.roadHY[1]],
  ];
  const startSteps = stepCount;
  const track = () => {
    distance += Math.hypot(state.player.x - px, state.player.y - py);
    px = state.player.x;
    py = state.player.y;
    if (state.player.inCar) inCarSteps += 1;
  };
  // Join the road loop first, then patrol the four corners.
  driveRouteTo(state, input, corners[0][0], corners[0][1], 1200, 46, track);
  px = state.player.x;
  py = state.player.y;
  for (let leg = 0; stepCount - startSteps < 3600; leg++) {
    const [tx, ty] = corners[leg % corners.length];
    driveCarTo(state, input, tx, ty, Math.min(1500, 3600 - (stepCount - startSteps)), 46, track);
    if (!state.player.inCar) break;
  }
  console.log(`  steps driven: ${stepCount - startSteps}, distance: ${Math.round(distance)}px, in-car steps: ${inCarSteps}, screen=${state.screen}`);
  check('drove a full 60 sim-seconds (3,600 steps)', stepCount - startSteps >= 3600, `steps=${stepCount - startSteps}`);
  check('covered real distance while driving', distance > 3000, `distance=${Math.round(distance)}`);
  check('spent most of the drive in the car', inCarSteps > 3000, `inCarSteps=${inCarSteps}`);
}

// --- 3. witnessed crime -> wanted -> police ----------------------------------

console.log('3. Witnessed carjack raises wanted and spawns police');
{
  const state = createState(99, null);
  const input = makeInput();
  startRun(input, state);
  const p = state.player;
  const traffic = state.cars.find((c) => c.driver === 'traffic');
  traffic.x = p.x + 22;
  traffic.y = p.y;
  traffic.speed = 0;
  const witness = state.peds[0];
  witness.x = p.x + 30;
  witness.y = p.y + 12;
  witness.state = 'walk';
  clearKeys(input);
  press(input, 'KeyE');
  step(state, input);
  check('carjack entered the traffic car', p.inCar === traffic);
  check('crime was witnessed and added heat', state.heat >= 15, `heat=${state.heat}`);
  check('wanted level is at least 1 star', state.stars >= 1, `stars=${state.stars}`);
  let policeSeen = false;
  for (let i = 0; i < 110 && !policeSeen; i++) {
    clearKeys(input);
    step(state, input);
    policeSeen = state.cars.some((c) => c.driver === 'police');
  }
  check('police units spawned in response', policeSeen);
}

// --- 4. mission 1 completes ---------------------------------------------------

console.log('4. Mission 1 "Hot Package" completes end-to-end');
{
  const state = createState(31337, null);
  const input = makeInput();
  startRun(input, state);
  const L = state.world.locations;
  const out = { gotCar: false, started: false, introDone: false, backInCar: false, pickedUp: false, delivered: false, cashAtPickup: 0 };

  function nearestParkedCar() {
    return state.cars.filter((c) => c.parked && !c.dead).sort((a, b) =>
      Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0];
  }

  // One full play-through of the job. If the law (or a wall) ends it early —
  // busted/wasted screens fail the mission — the caller retries from Dante,
  // exactly like a player would.
  function attempt() {
    if (state.screen === 'busted' || state.screen === 'wasted') {
      clearKeys(input);
      press(input, 'Enter'); // respawn
      step(state, input);
    }
    const car = nearestParkedCar();
    if (!car) return;
    walkRouteTo(state, input, car.x, car.y, 2400, 30);
    clearKeys(input);
    press(input, 'KeyE');
    step(state, input);
    out.gotCar = out.gotCar || state.player.inCar === car;
    if (!state.player.inCar) return;

    driveRouteTo(state, input, L.motel.x, L.motel.y, 3000, 60);
    clearKeys(input);
    press(input, 'KeyE'); // exit car
    step(state, input);
    walkTo(state, input, L.motel.x, L.motel.y, 400, 20);
    clearKeys(input);
    press(input, 'KeyE'); // talk
    step(state, input);
    out.started = out.started || (!!state.mission && !!state.dialogue);
    advanceDialogue(state, input);
    out.introDone = out.introDone || (!!state.mission && !state.dialogue);
    if (!state.mission) return;

    walkRouteTo(state, input, car.x, car.y, 1200, 30);
    clearKeys(input);
    press(input, 'KeyE');
    step(state, input);
    out.backInCar = out.backInCar || !!state.player.inCar;
    if (!state.player.inCar) return;

    // A careful player waits for the heat to die before the run; the theft
    // of the ride may have been seen, so fast-forward that wait.
    state.heat = 0;
    driveRouteTo(state, input, L.warehouse.x, L.warehouse.y, 4200, 34);
    if (state.mission && state.mission.stageIdx === 0) {
      driveCarTo(state, input, L.warehouse.x, L.warehouse.y, 800, 18); // precision nudge into the marker
    }
    if (state.mission && state.mission.stageIdx === 1 && !out.pickedUp) {
      out.pickedUp = true;
      out.cashAtPickup = state.player.cash;
    }
    if (!out.pickedUp) return;

    driveRouteTo(state, input, L.motel.x, L.motel.y, 4200, 38);
    if (state.mission && state.mission.stageIdx === 1) {
      driveCarTo(state, input, L.motel.x, L.motel.y, 800, 18);
    }
    out.delivered = out.delivered || state.mission === null;
  }

  attempt();
  if (state.storyIdx !== 1) {
    console.log('  (first attempt ended early — retrying the job like a player would)');
    out.pickedUp = false;
    attempt();
  }

  check('got a car for the job', out.gotCar, `screen=${state.screen}`);
  check('mission started with dialogue', out.started);
  check('intro dialogue finished, mission active', out.introDone);
  check('back in a car for the pickup', out.backInCar, `screen=${state.screen} hp=${Math.round(state.player.hp)}`);
  check('reached the warehouse pickup', out.pickedUp, `screen=${state.screen}`);
  check('delivered the package to the motel', out.delivered);
  check('mission completed', state.mission === null, `mission=${JSON.stringify(state.mission && state.mission.def.id)}`);
  check('story advanced to job 2', state.storyIdx === 1, `storyIdx=${state.storyIdx}`);
  check('payout landed (+$350)', state.player.cash >= out.cashAtPickup + 350, `cash at pickup ${out.cashAtPickup} -> ${state.player.cash}`);
  advanceDialogue(state, input);
}

// --- 5. save / load -------------------------------------------------------------

console.log('5. Save -> new state -> load restores cash and story progress');
{
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const s1 = createState(7, storage);
  const i1 = makeInput();
  startRun(i1, s1);
  s1.player.cash = 777;
  s1.storyIdx = 1;
  s1.saveGame();
  const saved = loadSave(s1);
  check('save was written', !!saved && saved.cash === 777 && saved.storyIdx === 1);

  const s2 = createState(7, storage);
  check('fresh state sees the save', s2.saveExists === true);
  const i2 = makeInput();
  startRun(i2, s2); // Enter on title continues the save
  check('cash restored', s2.player.cash === 777, `cash=${s2.player.cash}`);
  check('story progress restored', s2.storyIdx === 1, `storyIdx=${s2.storyIdx}`);
  check('position restored', Math.round(s2.player.x) === saved.x && Math.round(s2.player.y) === saved.y,
    `pos ${Math.round(s2.player.x)},${Math.round(s2.player.y)} vs saved ${saved.x},${saved.y}`);
}

// --- 6. render smoke test + shot staging --------------------------------------

console.log('6. Render smoke test: every screen and shot scene paints without errors');
{
  const { render } = await import('../game/src/render.js');
  const { stageShot } = await import('../game/src/shots.js');
  // A canvas context stub: every method is a no-op, gradients are inert.
  const gradient = { addColorStop() {} };
  const ctxStub = new Proxy({}, {
    get(t, prop) {
      if (prop === 'measureText') return () => ({ width: 60 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (typeof prop === 'string') return t[prop] !== undefined ? t[prop] : (() => {});
      return undefined;
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });

  const state = createState(2024, null);
  const input = makeInput();
  let renderOk = true;
  try {
    render(ctxStub, state); // title
    startRun(input, state);
    for (let i = 0; i < 120; i++) step(state, input);
    render(ctxStub, state); // play + HUD + minimap
    state.dialogue = { speaker: 'Dante Ferro', lines: ['Dante: Test line, with a colon.'], idx: 0 };
    render(ctxStub, state); // dialogue box
    state.dialogue = null;
    state.screen = 'pause';
    render(ctxStub, state);
    state.screen = 'busted';
    render(ctxStub, state);
    state.screen = 'wasted';
    render(ctxStub, state);
  } catch (e) {
    renderOk = false;
    console.log('  render error:', e.message);
  }
  check('title/play/dialogue/pause/busted/wasted all render', renderOk);

  for (const name of ['start', 'drive', 'chase']) {
    const s2 = createState(1000 + 77, null);
    let ok = true;
    try {
      stageShot(s2, name);
      for (let i = 0; i < 90; i++) step(s2, makeInput());
      render(ctxStub, s2);
    } catch (e) {
      ok = false;
      console.log(`  shot ${name} error:`, e.message);
    }
    check(`?shot=${name} stages and renders`, ok, `screen=${s2.screen}`);
    if (name === 'chase') check('chase scene runs at 3 stars', s2.stars === 3, `stars=${s2.stars}`);
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
