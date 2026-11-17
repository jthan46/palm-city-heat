// simtest.mjs — headless verification for Palm City Heat.
// Boots the real simulation in Node (no DOM: the Game never touches the
// document outside its guarded browser boot, audio is silent without an
// AudioContext, and the renderer is simply never called) and asserts:
//   1. determinism — identical seed + input script ⇒ identical state hash
//   2. an autopilot can walk, steal a car and drive for 60+ sim-seconds
//   3. a witnessed crime raises the wanted level and police respond
//   4. story mission 1 completes via scripted movement to its markers
//   5. save → fresh game → continue restores cash and story progress
// Run: node tools/simtest.mjs

import { Game } from '../game/src/main.js';
import { AVENUES, STREETS } from '../game/src/config.js';
import { policeCount } from '../game/src/police.js';
import { lanePoint } from '../game/src/vehicles.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log('  ok —', msg);
  } else {
    failures++;
    console.error('  FAIL —', msg);
  }
}

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function makeGame(seed, storage = null) {
  const game = new Game({ seed, storage });
  game.startNewGame();
  return game;
}

// One sim step the way the browser loop does it: step, then consume edges.
function step(game) {
  game.step();
  game.input.consume();
}

function holdKeys(game, codes, steps) {
  for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']) game.input.setKey(c, false);
  for (const c of codes) game.input.setKey(c, true);
  for (let i = 0; i < steps; i++) step(game);
}

// Manhattan waypoints along the road grid from (x0,y0) to (x1,y1).
function gridPath(x0, y0, x1, y1) {
  const near = (arr, v) => arr.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), arr[0]);
  const ax0 = near(AVENUES, x0);
  const sy0 = near(STREETS, y0);
  const ax1 = near(AVENUES, x1);
  const sy1 = near(STREETS, y1);
  const pts = [
    { x: ax0, y: sy0 },
    { x: ax1, y: sy0 },
    { x: ax1, y: sy1 },
    { x: x1, y: y1 },
  ];
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 4);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// What is close ahead of the player's car? 0 = clear, 1 = only parked cars
// (creep around them), 2 = live traffic or a pedestrian (brake and wait),
// 3 = only oncoming cars (they have stopped for us: creep through).
function obstacleAhead(game, range) {
  const car = game.player.inCar;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const scan = (ox, oy, lat) => {
    const dx = ox - car.x;
    const dy = oy - car.y;
    const proj = dx * fx + dy * fy;
    return proj > 0 && proj < range && Math.abs(dx * -fy + dy * fx) < lat;
  };
  let parked = false;
  let oncoming = false;
  for (const other of game.cars) {
    if (other === car || other.dead || !scan(other.x, other.y, 21)) continue;
    if (other.kind === 'parked') {
      parked = true;
      continue;
    }
    const dot = Math.cos(other.angle) * fx + Math.sin(other.angle) * fy;
    if (dot < -0.5) oncoming = true;
    else return 2;
  }
  for (const ped of game.peds) {
    if (!ped.dead && scan(ped.x, ped.y, 15)) return 2;
  }
  if (oncoming) return 3;
  return parked ? 1 : 0;
}

// Steer the player's car toward (tx,ty) for one step using real key input,
// driving like a careful player: capped speed, braking for obstacles.
function driveStep(game, tx, ty) {
  const p = game.player;
  const car = p.inCar;
  const want = Math.atan2(ty - p.y, tx - p.x);
  const diff = angleDiff(want, car.angle);
  const distT = Math.hypot(tx - p.x, ty - p.y);
  let cruise = 168;
  if (distT < 240) cruise = 82;
  if (Math.abs(diff) > 0.55) cruise = Math.min(cruise, 96);
  const blocked = obstacleAhead(game, 88);
  let left = false;
  let right = false;
  let fwd = false;
  let rev = false;
  if (Math.abs(diff) < 1.15) {
    left = diff < -0.07;
    right = diff > 0.07;
    if (blocked === 2) rev = car.speed > 25; // live traffic: brake and wait
    else if (blocked === 3) fwd = car.speed < 55; // oncoming lane: creep through the crossing
    else if (blocked === 1) fwd = car.speed < 62; // parked car: creep around it
    else if (car.speed > cruise + 45) rev = true;
    else fwd = car.speed < cruise;
  } else if (Math.abs(car.speed) > 50) {
    rev = true; // brake first, nose roughly right before flooring it
    left = diff < 0;
    right = diff > 0;
  } else {
    rev = true; // reverse and swing the nose around (steering inverts)
    left = diff > 0;
    right = diff < 0;
  }
  game.input.setKey('KeyA', left);
  game.input.setKey('KeyD', right);
  game.input.setKey('KeyW', fwd);
  game.input.setKey('KeyS', rev);
  step(game);
  game.input.setKey('KeyW', false);
  game.input.setKey('KeyS', false);
}

// A route through every intersection between two points, each waypoint in
// the correct right-hand lane — the same points the game's traffic uses.
function gridRoute(x0, y0, x1, y1) {
  const nearIx = (v) => AVENUES.reduce((bi, a, i) => (Math.abs(a - v) < Math.abs(AVENUES[bi] - v) ? i : bi), 0);
  const nearIy = (v) => STREETS.reduce((bi, a, i) => (Math.abs(a - v) < Math.abs(STREETS[bi] - v) ? i : bi), 0);
  let ix = nearIx(x0);
  let iy = nearIy(y0);
  const gx = nearIx(x1);
  const gy = nearIy(y1);
  const nodes = [[ix, iy]];
  while (ix !== gx) {
    ix += Math.sign(gx - ix);
    nodes.push([ix, iy]);
  }
  while (iy !== gy) {
    iy += Math.sign(gy - iy);
    nodes.push([ix, iy]);
  }
  const pts = [];
  for (let k = 1; k < nodes.length; k++) {
    const [px, py] = nodes[k - 1];
    const [cx, cy] = nodes[k];
    const dir = cx > px ? 0 : cx < px ? 2 : cy > py ? 1 : 3;
    pts.push(lanePoint(cx, cy, dir));
  }
  pts.push({ x: x1, y: y1 });
  return pts;
}

// Drive to a point via the road grid. Returns true on arrival.
function driveTo(game, tx, ty, arriveR, maxSteps) {
  const path = gridRoute(game.player.x, game.player.y, tx, ty);
  let wp = 0;
  let lastX = game.player.x;
  let lastY = game.player.y;
  let stillFor = 0;
  let recoveries = 0;
  let nudge = null;
  for (let i = 0; i < maxSteps; i++) {
    const p = game.player;
    if (Math.hypot(p.x - tx, p.y - ty) < arriveR) return true;
    let target = wp < path.length ? path[wp] : { x: tx, y: ty };
    if (Math.hypot(p.x - target.x, p.y - target.y) < 46 && wp < path.length) wp++;
    // Stuck? First sidestep around the blockage, then back out if that fails.
    if (Math.hypot(p.x - lastX, p.y - lastY) < 3) {
      stillFor++;
    } else {
      stillFor = 0;
      lastX = p.x;
      lastY = p.y;
    }
    if (stillFor > 150 && !nudge) {
      const car = p.inCar;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      nudge = { x: p.x + fx * 80 - fy * 46, y: p.y + fy * 80 + fx * 46, until: i + 110 };
    }
    if (nudge) {
      if (i > nudge.until || Math.hypot(p.x - nudge.x, p.y - nudge.y) < 24) {
        nudge = null;
        stillFor = 0;
      } else {
        target = nudge;
      }
    }
    if (stillFor > 320) {
      // Alternate backing out with powering forward: one of them frees us.
      recoveries++;
      holdKeys(game, recoveries % 2 ? ['KeyS'] : ['KeyW', 'KeyD'], 42);
      stillFor = 0;
      continue;
    }
    driveStep(game, target.x, target.y);
    if (game.screen !== 'playing') return false;
  }
  return Math.hypot(game.player.x - tx, game.player.y - ty) < arriveR;
}

function walkStep(game, tx, ty) {
  const p = game.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  game.input.setKey('KeyA', dx < -6);
  game.input.setKey('KeyD', dx > 6);
  game.input.setKey('KeyW', dy < -6);
  game.input.setKey('KeyS', dy > 6);
  game.input.setKey('ShiftLeft', true);
  step(game);
}

function walkTo(game, tx, ty, arriveR, maxSteps) {
  const path = gridPath(game.player.x, game.player.y, tx, ty);
  let wp = 0;
  for (let i = 0; i < maxSteps; i++) {
    const p = game.player;
    if (Math.hypot(p.x - tx, p.y - ty) < arriveR) return true;
    const target = wp < path.length ? path[wp] : { x: tx, y: ty };
    if (Math.hypot(p.x - target.x, p.y - target.y) < 30 && wp < path.length) wp++;
    walkStep(game, target.x, target.y);
  }
  return Math.hypot(game.player.x - tx, game.player.y - ty) < arriveR;
}

// Walk to the nearest car and get in with the real E-key path.
function enterNearestCar(game) {
  const p = game.player;
  // Like a sensible thief: the closest parked car that is not boxed in.
  let best = null;
  let bestD = Infinity;
  for (const car of game.cars) {
    if (car.dead || car.kind !== 'parked') continue;
    let clearance = Infinity;
    for (const other of game.cars) {
      if (other === car) continue;
      clearance = Math.min(clearance, Math.hypot(other.x - car.x, other.y - car.y));
    }
    if (clearance < 105) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (!best) {
    // Fall back to the plain nearest.
    for (const car of game.cars) {
      if (car.dead || car.kind !== 'parked') continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
  }
  if (!best) return false;
  if (!walkTo(game, best.x, best.y, 26, 3000)) return false;
  game.input.setKey('KeyE', true);
  step(game);
  game.input.setKey('KeyE', false);
  return !!game.player.inCar;
}

// --- test 1: determinism -----------------------------------------------------

function scriptedRun(seed) {
  const game = makeGame(seed);
  // A fixed input script: walk a long square, fire the pistol, swing a fist.
  const legs = [
    ['KeyW'], ['KeyD'], ['KeyS'], ['KeyA'],
    ['KeyW'], ['KeyD'], ['KeyS'], ['KeyA'],
  ];
  for (const leg of legs) {
    holdKeys(game, leg, 210);
    holdKeys(game, [...leg, 'ShiftLeft'], 210);
  }
  game.input.mouseX = game.viewW / 2 + 220;
  game.input.mouseY = game.viewH / 2;
  game.input.mouseClicked = true;
  step(game);
  holdKeys(game, ['KeyJ'], 2);
  for (let i = 0; i < 300; i++) step(game);
  return game;
}

console.log('test 1: determinism over 3600+ scripted steps');
{
  const a = scriptedRun(42);
  const b = scriptedRun(42);
  const c = scriptedRun(99);
  console.log('  hash A:', a.stateHash(), ' hash B:', b.stateHash(), ' hash C (other seed):', c.stateHash());
  assert(a.stateHash() === b.stateHash(), 'same seed + same inputs ⇒ same state hash');
  assert(a.stateHash() !== c.stateHash(), 'different seed ⇒ different state hash');
}

// --- test 2: autopilot drives for a minute -----------------------------------

console.log('test 2: autopilot walk, enter car, drive 60+ seconds');
{
  const game = makeGame(7);
  const entered = enterNearestCar(game);
  assert(entered, 'autopilot walked to a car and got in');
  // A circuit of the grid block nearest the car, in proper lanes like the
  // traffic AI: east, south, west, north around one block, over and over
  // for well over a minute of sim time.
  const nearIx = (v) => AVENUES.reduce((bi, a, i) => (Math.abs(a - v) < Math.abs(AVENUES[bi] - v) ? i : bi), 0);
  const nearIy = (v) => STREETS.reduce((bi, a, i) => (Math.abs(a - v) < Math.abs(STREETS[bi] - v) ? i : bi), 0);
  const ix = Math.min(5, nearIx(game.player.x));
  const iy = Math.min(3, nearIy(game.player.y));
  const circuit = [
    lanePoint(ix + 1, iy, 0),
    lanePoint(ix + 1, iy + 1, 1),
    lanePoint(ix, iy + 1, 2),
    lanePoint(ix, iy, 3),
  ];
  let wp = 0;
  let travelled = 0;
  let lastX = game.player.x;
  let lastY = game.player.y;
  const DRIVE_STEPS = 3900; // 65 sim-seconds
  for (let i = 0; i < DRIVE_STEPS; i++) {
    const target = circuit[wp % circuit.length];
    if (Math.hypot(game.player.x - target.x, game.player.y - target.y) < 48) wp++;
    driveStep(game, target.x, target.y);
    travelled += Math.hypot(game.player.x - lastX, game.player.y - lastY);
    lastX = game.player.x;
    lastY = game.player.y;
    if (game.screen !== 'playing') break;
  }
  assert(game.screen === 'playing', 'game still running after the drive (no crash, no bust)');
  assert(travelled > 4000, 'car actually drove (' + Math.round(travelled) + 'px in 65 sim-seconds)');
  assert(wp >= 5, 'car kept circulating the grid (' + wp + ' waypoints reached)');
  console.log('  circuit drive:', Math.round(travelled) + 'px,', wp, 'waypoints, ended at', Math.round(game.player.x), Math.round(game.player.y));
}

// --- test 3: crime → wanted → police ------------------------------------------

console.log('test 3: witnessed crime raises wanted, police respond');
{
  const game = makeGame(11);
  step(game); // settle the camera on the player
  const p = game.player;
  const { spawnPed } = await import('../game/src/peds.js');
  const victim = spawnPed(game, p.x + 26, p.y, {});
  // Aim at the victim through the real mouse path and click.
  game.input.mouseX = victim.x - (game.camera.x - game.viewW / 2);
  game.input.mouseY = victim.y - (game.camera.y - game.viewH / 2);
  game.input.mouseClicked = true;
  step(game);
  for (let i = 0; i < 12; i++) step(game);
  assert(game.wanted.stars >= 1, 'shooting a pedestrian in the open raised the wanted level (stars=' + game.wanted.stars + ')');
  assert(victim.dead || victim.hp < 30, 'the shot connected (victim hp=' + Math.round(victim.hp) + ')');
  for (let i = 0; i < 90; i++) step(game);
  assert(policeCount(game) >= 1, 'a police interceptor spawned and is hunting (count=' + policeCount(game) + ')');
}

// --- test 4: mission 1 completes ----------------------------------------------

console.log('test 4: story mission 1 completes via scripted movement');
{
  const game = makeGame(5);
  const cashBefore = game.player.cash;
  // On foot and running: the markers only ask for arrival, and a runner
  // crosses the city faster than the delivery clock runs down.
  const started = walkTo(game, 3718, 1673, 30, 9000); // Café Brisa, the green marker
  assert(started && game.missions.active, 'mission started at Café Brisa: ' + (game.missions.active && game.missions.active.def.title));
  const picked = walkTo(game, 1798, 1033, 40, 9000); // Mercado Sol pickup
  assert(picked && game.missions.active && game.missions.active.stageIndex === 1, 'package picked up, delivery stage active');
  const delivered = walkTo(game, 2438, 1033, 44, 8000); // Harbor Tower, against the 150 s clock
  assert(delivered && !game.missions.active && game.missions.storyIndex === 1, 'delivery made, mission complete, story advanced');
  assert(game.player.cash === cashBefore + 450, 'payout landed ($' + cashBefore + ' → $' + game.player.cash + ')');
}

// --- test 5: save / load --------------------------------------------------------

console.log('test 5: save then continue restores progress');
{
  const storage = fakeStorage();
  const a = makeGame(3, storage);
  a.player.cash = 777;
  a.missions.storyIndex = 2;
  a.missions.jobsDone = 2;
  a.saveGame();
  const b = new Game({ seed: 3, storage });
  assert(b.hasSave, 'fresh game sees the save');
  b.startContinue();
  assert(b.player.cash === 777, 'cash restored ($' + b.player.cash + ')');
  assert(b.missions.storyIndex === 2, 'story progress restored (next mission index ' + b.missions.storyIndex + ')');
  assert(b.screen === 'playing', 'continue drops straight into the city');
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : '\n' + failures + ' ASSERTION(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
