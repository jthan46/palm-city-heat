// Palm City Heat — screenshot scenes.
// One job: stage the three ?shot= scenes (start, drive, chase) by playing
// the real simulation forward with a small scripted driver, so a screenshot
// is the game itself, honestly framed, and the same seed gives the same frame.

import { WORLD } from './config.js';
import { blankInput } from './input.js';

// A simple road driver: hold the throttle, steer toward a point ahead that
// sits in the middle of the road the car is on.
function driverInput(state) {
  const input = blankInput();
  const p = state.player;
  const car = state.vehicles.find((v) => v.id === p.inCar);
  if (!car) return input;
  // Aim at the far end of whichever road axis the car is closest to aligned with.
  const headingEastWest = Math.abs(Math.cos(car.angle)) > Math.abs(Math.sin(car.angle));
  let tx;
  let ty;
  if (headingEastWest) {
    const roadY = WORLD.hRoads.reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a));
    tx = car.x + Math.cos(car.angle) * 500;
    ty = roadY + Math.sign(Math.cos(car.angle)) * 20; // the right-hand lane
  } else {
    const roadX = WORLD.vRoads.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a));
    tx = roadX - Math.sign(Math.sin(car.angle)) * 20;
    ty = car.y + Math.sin(car.angle) * 500;
  }
  const want = Math.atan2(ty - car.y, tx - car.x);
  let d = (want - car.angle) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  input.up = true;
  if (d < -0.06) input.left = true;
  if (d > 0.06) input.right = true;
  return input;
}

function nearestParkedCar(state, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const v of state.vehicles) {
    if (v.driver !== 'none' || v.wrecked) continue;
    const d = (v.x - x) ** 2 + (v.y - y) ** 2;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

function putPlayerInCar(game, car) {
  const state = game.state;
  state.player.x = car.x;
  state.player.y = car.y;
  car.driver = 'player';
  state.player.inCar = car.id;
}

export function stageShot(game, name) {
  const state = game.state;
  const idle = blankInput();

  if (name === 'drive' || name === 'chase') {
    game.startNewGame();
    // Start the scene downtown, in a car, already rolling east on Palm Avenue.
    const car = nearestParkedCar(state, 2350, 1700) || state.vehicles.find((v) => v.driver === 'none');
    putPlayerInCar(game, car);
    car.x = 2050;
    car.y = 1700 + 20; // eastbound lane of Palm Avenue
    car.angle = 0;
    car.speed = 3.4;
    state.player.x = car.x;
    state.player.y = car.y;
    if (name === 'chase') {
      // Mid-job, mid-escape: three stars and the law right behind.
      state.player.cash = 820;
      state.heat = 66; // exactly three stars
      state.lastCrimeAt = state.tick;
      for (let i = 0; i < 320; i++) game.step(driverInput(state));
      // Make sure the frame has uniforms in it even if spawns were shy.
      if (!state.vehicles.some((v) => v.kind === 'cop')) {
        state.lastCopSpawn = -9999;
        for (let i = 0; i < 240; i++) game.step(driverInput(state));
      }
    } else {
      state.player.cash = 470;
      for (let i = 0; i < 260; i++) game.step(driverInput(state));
    }
    // The scene is a moment mid-chase, never the arrest that might follow it.
    if (state.screen !== 'play') {
      state.screen = 'play';
      state.bust = 0;
      state.player.hp = Math.max(state.player.hp, 60);
    }
    // Pin the frame's story: the drive is clean, the chase is exactly 3 stars,
    // whatever small crimes the scripted driver committed on the way.
    if (name === 'chase') {
      state.heat = 66;
      state.wanted = 3;
    } else {
      state.heat = 0;
      state.wanted = 0;
      state.bust = 0;
    }
    return;
  }

  // 'start' (and anything unknown): the title over a living city.
  state.screen = 'title';
  for (let i = 0; i < 200; i++) game.step(idle);
}
