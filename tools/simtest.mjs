// Palm City Heat — headless verification.
// Boots the real simulation in Node with DOM stubs and asserts the five
// things the entry stands on: determinism, driving, crime & police,
// mission 1 end-to-end, and save/load. Run: node tools/simtest.mjs

// ---- DOM stubs (before importing the game) ----------------------------------
const gradientStub = { addColorStop() {} };
function stubContext(canvas) {
  return new Proxy({}, {
    get(_t, key) {
      if (key === 'canvas') return canvas;
      if (key === 'measureText') return () => ({ width: 42 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradientStub;
      return () => {};
    },
    set() { return true; },
  });
}
function stubCanvas() {
  const canvas = {
    width: 0, height: 0,
    getContext: () => stubContext(canvas),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    addEventListener() {},
  };
  return canvas;
}
globalThis.window = {
  innerWidth: 960, innerHeight: 540, devicePixelRatio: 1,
  addEventListener() {}, location: { search: '' },
};
globalThis.document = { getElementById: () => null, addEventListener() {} };

const { createGame, createPed } = await import('../game/src/main.js');
const { createRenderer } = await import('../game/src/render.js');
const { stageShot } = await import('../game/src/shots.js');
const { WORLD } = await import('../game/src/config.js');

// ---- helpers ------------------------------------------------------------------
let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name} ${detail}`); }
}
function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
function blank(over = {}) {
  return {
    up: false, down: false, left: false, right: false, run: false,
    interact: false, attack: false, attackPressed: false, pausePressed: false,
    confirmPressed: false, continuePressed: false, mutePressed: false,
    mouseX: 0, mouseY: 0, mouseDown: false, aimAngle: null, ...over,
  };
}
function moveInput(state, tx, ty, run = true) {
  const p = state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  return blank({
    left: dx < -7, right: dx > 7, up: dy < -7, down: dy > 7, run,
  });
}
// Road-following navigator: intersections are open ground, so hop between
// them, then make the short sidewalk hop to the target.
function makeNavigator(state) {
  let queue = [];
  let currentTarget = null;
  function nearestIntersection(x, y) {
    let best = null;
    let bd = Infinity;
    for (const vx of WORLD.vRoads) for (const hy of WORLD.hRoads) {
      const d = (vx - x) ** 2 + (hy - y) ** 2;
      if (d < bd) { bd = d; best = { x: vx, y: hy }; }
    }
    return best;
  }
  return function navigate(tx, ty) {
    const p = state.player;
    if (!currentTarget || currentTarget.x !== tx || currentTarget.y !== ty) {
      currentTarget = { x: tx, y: ty };
      const start = nearestIntersection(p.x, p.y);
      const goal = nearestIntersection(tx, ty);
      queue = [start, { x: goal.x, y: start.y }, goal, { x: tx, y: ty }];
    }
    while (queue.length && Math.hypot(queue[0].x - p.x, queue[0].y - p.y) < 26) queue.shift();
    const wp = queue[0] || { x: tx, y: ty };
    return moveInput(state, wp.x, wp.y, true);
  };
}
// A patrol driver: loop the downtown block (1900,1700)→(3500,1700)→
// (3500,2400)→(1900,2400), steering at each intersection in turn and
// braking for whatever is in front instead of trading paint with it.
function makeDriver() {
  const loop = [
    { x: 3500, y: 1700 }, { x: 3500, y: 2400 },
    { x: 1900, y: 2400 }, { x: 1900, y: 1700 },
  ];
  let wi = 0;
  return function driveInput(state) {
    const p = state.player;
    const car = state.vehicles.find((v) => v.id === p.inCar);
    if (!car) return blank();
    let wp = loop[wi % loop.length];
    if (Math.hypot(wp.x - car.x, wp.y - car.y) < 48) { wi++; wp = loop[wi % loop.length]; }
    const want = Math.atan2(wp.y - car.y, wp.x - car.x);
    let d = (want - car.angle) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    const fx = car.x + Math.cos(car.angle) * 58;
    const fy = car.y + Math.sin(car.angle) * 58;
    const blocked = state.vehicles.some((o) => o !== car && !o.dead && (o.x - fx) ** 2 + (o.y - fy) ** 2 < 24 * 24)
      || state.peds.some((pd) => pd.mode !== 'dead' && pd.mode !== 'down' && (pd.x - fx) ** 2 + (pd.y - fy) ** 2 < 24 * 24);
    const turning = Math.abs(d) > 0.45 && car.speed > 2.6; // slow for corners, like a driver
    return blank({ up: !blocked && !turning, down: (blocked && car.speed > 1.5) || turning, left: d < -0.09, right: d > 0.09 });
  };
}
function anyStep(game, input) {
  if (game.state.screen === 'busted' || game.state.screen === 'wasted') return blank({ confirmPressed: true });
  if (game.state.screen === 'paused') return blank({ pausePressed: true });
  return input;
}

// ---- 1. determinism -------------------------------------------------------------
console.log('1. determinism (two 3,600-step scripted runs)');
function scriptedRun() {
  const g = createGame({ seed: 4242, storage: memStorage() });
  g.startNewGame();
  const targets = [g.city.locations.warehouse, g.city.locations.diner, g.city.locations.contact, g.city.locations.gunshop];
  const nav = makeNavigator(g.state);
  for (let i = 0; i < 3600; i++) {
    const t = targets[Math.floor(i / 900) % targets.length];
    let input = nav(t.x, t.y);
    if (i % 450 === 0) input = blank({ attackPressed: true, aimAngle: 0.7 });
    g.step(anyStep(g, input));
  }
  return g.stateHash();
}
const h1 = scriptedRun();
const h2 = scriptedRun();
check('identical state hash', h1 === h2, `${h1} vs ${h2}`);
console.log(`     hash: ${h1}`);

// ---- 2. autopilot: walk, steal a car, drive 60 s ----------------------------------
console.log('2. autopilot drives for 60 sim-seconds');
{
  const g = createGame({ seed: 77, storage: memStorage() });
  g.startNewGame();
  const s = g.state;
  // Pick a parked car with a clear run ahead of it (not boxed in by the next
  // car in the rank) — the test is about driving, not parallel-parking luck.
  const parked = s.vehicles.find((v) => {
    if (v.driver !== 'none' || v.wrecked) return false;
    const fx = v.x + Math.cos(v.angle) * 130;
    const fy = v.y + Math.sin(v.angle) * 130;
    return !s.vehicles.some((o) => o !== v && (o.x - fx) ** 2 + (o.y - fy) ** 2 < 46 * 46);
  });
  s.player.x = parked.x + 20;
  s.player.y = parked.y + 6;
  g.step(blank({ interact: true }));
  check('entered a parked car', s.player.inCar === parked.id, `inCar=${s.player.inCar}`);
  s.heat = 0; // this test is about driving, not the getaway: forgive the theft
  // Start the drive on Palm Avenue, rolling east into the patrol loop.
  parked.x = 2050;
  parked.y = 1720;
  parked.angle = 0;
  s.player.x = parked.x;
  s.player.y = parked.y;
  const drive = makeDriver();
  const nav = makeNavigator(s);
  let travelled = 0;
  let inCarSteps = 0;
  let lx = s.player.x;
  let ly = s.player.y;
  for (let i = 0; i < 3600; i++) {
    // If the run was interrupted (an arrest leaves you on foot at the
    // station), walk back to the car and get in again, like a player would.
    let input;
    if (!s.player.inCar && s.screen === 'play') {
      const near = Math.hypot(s.player.x - parked.x, s.player.y - parked.y) < 40;
      input = near ? blank({ interact: true }) : nav(parked.x, parked.y);
    } else {
      input = drive(s);
    }
    g.step(anyStep(g, input));
    travelled += Math.hypot(s.player.x - lx, s.player.y - ly);
    lx = s.player.x;
    ly = s.player.y;
    if (s.player.inCar) inCarSteps++;
  }
  check('drove the full minute', inCarSteps > 3200, `inCarSteps=${inCarSteps}`);
  check('covered real distance', travelled > 2500, `travelled=${Math.round(travelled)}px`);
}

// ---- 3. witnessed crime → wanted → police ------------------------------------------
console.log('3. witnessed crime raises wanted and brings police');
{
  const g = createGame({ seed: 99, storage: memStorage() });
  g.startNewGame();
  const s = g.state;
  s.player.ammo = 0; // fists only: this is a mugging, not a shooting
  const px = s.player.x;
  const py = s.player.y;
  createPed(s, px + 24, py, {}); // the victim, in melee range
  createPed(s, px + 70, py + 10, {}); // the witness
  g.step(blank({ attackPressed: true, aimAngle: 0 }));
  check('heat registered', s.heat >= 16, `heat=${s.heat}`);
  let copAt = -1;
  for (let i = 0; i < 400 && copAt < 0; i++) {
    g.step(blank());
    if (s.vehicles.some((v) => v.kind === 'cop' && v.driver === 'cop')) copAt = i;
  }
  check('wanted >= 1 star', s.wanted >= 1, `wanted=${s.wanted}`);
  check('police spawned', copAt >= 0, `after ${copAt} steps`);
}

// ---- 4. mission 1 end-to-end ---------------------------------------------------------
console.log('4. mission 1 completes via scripted movement');
{
  const g = createGame({ seed: 111, storage: memStorage() });
  g.startNewGame();
  const s = g.state;
  const L = g.city.locations;
  const nav = makeNavigator(s);
  const cash0 = s.player.cash;
  let steps = 0;
  // Talk to Vivi: walk to her doorstep, then press E.
  while (!s.mission.dialogue && !s.mission.active && steps < 3000) {
    const near = Math.hypot(s.player.x - L.contact.x, s.player.y - L.contact.y) < 62;
    g.step(anyStep(g, near ? blank({ interact: true }) : nav(L.contact.x, L.contact.y)));
    steps++;
  }
  check('dialogue opened', !!s.mission.dialogue);
  let guard = 0;
  while (s.mission.dialogue && guard++ < 12) g.step(blank({ interact: true }));
  check('mission activated', !!s.mission.active && s.mission.active.def.id === 'm1', JSON.stringify(s.mission.active && s.mission.active.def.id));
  // Pickup, then delivery — each leg gets its own generous budget.
  steps = 0;
  while (s.mission.active && steps < 16000) {
    const phase = s.mission.active.phaseIndex;
    const target = phase === 0 ? L.warehouse : L.diner;
    g.step(anyStep(g, nav(target.x, target.y)));
    steps++;
  }
  check('mission 1 finished', s.mission.storyIndex === 1, `storyIndex=${s.mission.storyIndex} steps=${steps}`);
  check('paid $450', s.player.cash >= cash0 + 450, `cash ${cash0} -> ${s.player.cash}`);
  console.log(`     completed in ${steps} steps`);
}

// ---- 5. save / reset / load -------------------------------------------------------------
console.log('5. save → fresh game → load restores progress');
{
  const storage = memStorage();
  const g = createGame({ seed: 13, storage });
  g.startNewGame();
  const s = g.state;
  s.player.cash = 777;
  s.player.ammo = 9;
  s.mission.storyIndex = 2;
  s.player.x = s.city.locations.diner.x + 10;
  s.player.y = s.city.locations.diner.y + 4;
  const sx = s.player.x;
  const sy = s.player.y;
  g.save();
  const g2 = createGame({ seed: 555, storage }); // different seed: the save must carry it
  const okLoad = g2.load();
  check('load succeeded', okLoad === true);
  check('cash restored', g2.state.player.cash === 777, `cash=${g2.state.player.cash}`);
  check('story progress restored', g2.state.mission.storyIndex === 2, `storyIndex=${g2.state.mission.storyIndex}`);
  check('position restored', Math.abs(g2.state.player.x - sx) < 4 && Math.abs(g2.state.player.y - sy) < 4,
    `(${g2.state.player.x},${g2.state.player.y}) vs (${sx},${sy})`);
}

// ---- 6. render smoke + shot scenes -------------------------------------------------------
console.log('6. renderer paints every screen; shot scenes stage');
{
  const g = createGame({ seed: 2024, storage: memStorage() });
  const renderer = createRenderer(stubCanvas());
  g.state.view = renderer.view;
  g.startNewGame();
  for (let i = 0; i < 120; i++) g.step(blank());
  let threw = '';
  try {
    renderer.draw(g.state); // play
    g.state.screen = 'paused';
    renderer.draw(g.state);
    g.state.screen = 'busted';
    g.state.endText = 'test';
    renderer.draw(g.state);
    g.state.screen = 'wasted';
    renderer.draw(g.state);
    g.state.screen = 'title';
    renderer.draw(g.state);
  } catch (e) { threw = e.message; }
  check('all screens paint without errors', threw === '', threw);

  for (const name of ['start', 'drive', 'chase']) {
    const gg = createGame({ seed: 1, storage: memStorage() });
    gg.state.view = renderer.view;
    let err = '';
    try {
      stageShot(gg, name);
      renderer.draw(gg.state);
    } catch (e) { err = e.message; }
    check(`shot=${name} stages and paints`, err === '', err);
    if (name === 'chase') {
      check('chase scene has police and 3 stars',
        gg.state.vehicles.some((v) => v.kind === 'cop') && gg.state.wanted === 3,
        `cops=${gg.state.vehicles.filter((v) => v.kind === 'cop').length} wanted=${gg.state.wanted}`);
    }
    if (name === 'drive') {
      check('drive scene is behind the wheel', gg.state.player.inCar !== null);
    }
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
