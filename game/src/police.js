// Palm City Heat — the law: a heat-based wanted level that rises when a crime is seen and
// cools when the player breaks line of sight, the interceptors that hunt by wanted level,
// and the bust meter that ends a chase when the player is pinned.

import { BUST_TIME, HEAT, HEAT_DECAY, HEAT_PER_STAR, UNSEEN_GRACE } from './config.js';
import { createCar } from './vehicles.js';
import { randomRoadPoint } from './world.js';

export function createWanted() {
  return { heat: 0, stars: 0, lastSeenAt: -99, bust: 0 };
}

export function starsForHeat(heat) {
  if (heat <= 0) return 0;
  return Math.min(5, 1 + Math.floor(heat / HEAT_PER_STAR));
}

/** Was anyone in a position to see what happened at (x, y)? A bystander or a patrol car. */
export function witnessed(state, x, y) {
  for (const ped of state.peds) {
    if (!ped.down && Math.hypot(ped.x - x, ped.y - y) < 250) return true;
  }
  for (const car of state.cars) {
    if (car.police && Math.hypot(car.x - x, car.y - y) < 340) return true;
  }
  return false;
}

/** Adds heat for a crime, but only when it was witnessed (or `force`d by a mission script). */
export function reportCrime(state, kind, x, y, force = false) {
  if (!force && !witnessed(state, x, y)) return false;
  state.wanted.heat += HEAT[kind] || 40;
  state.wanted.lastSeenAt = state.time;
  state.wanted.stars = starsForHeat(state.wanted.heat);
  return true;
}

/** Directly sets the wanted level, for story beats that guarantee the heat. */
export function setStars(state, stars) {
  state.wanted.heat = stars <= 0 ? 0 : (stars - 1) * HEAT_PER_STAR + 20;
  state.wanted.stars = starsForHeat(state.wanted.heat);
  state.wanted.lastSeenAt = state.time;
}

export function clearWanted(state) {
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  state.wanted.bust = 0;
}

/** Can any patrol currently see the player? Drives decay and despawning. */
function playerObserved(state) {
  const p = state.player;
  for (const car of state.cars) {
    if (car.police && Math.hypot(car.x - p.x, car.y - p.y) < 380) return true;
  }
  return false;
}

export function updateWanted(state, dt) {
  const w = state.wanted;
  if (playerObserved(state)) w.lastSeenAt = state.time;
  if (w.heat > 0 && state.time - w.lastSeenAt > UNSEEN_GRACE) {
    w.heat = Math.max(0, w.heat - HEAT_DECAY * dt);
  }
  w.stars = starsForHeat(w.heat);
  // Keep the patrol strength matched to the wanted level.
  const want = w.stars === 0 ? 0 : Math.min(6, w.stars + 1);
  let have = 0;
  for (const car of state.cars) if (car.police) have += 1;
  if (have < want) {
    const p = randomRoadPoint(state.rng, state.player.x, state.player.y, 640);
    const car = createCar(state.rng, { x: p.x, y: p.y, driver: 'police', police: true });
    car.ai.dx = 1; car.ai.dy = 0;
    state.cars.push(car);
  } else if (w.stars === 0) {
    // No heat: patrols that wander far away give up and leave the world.
    state.cars = state.cars.filter((car) => !car.police
      || Math.hypot(car.x - state.player.x, car.y - state.player.y) < 1200);
  }
}

/** Steers one interceptor at the player; rams when close, backs up when wedged. */
export function updatePoliceCar(state, car, dt) {
  const p = state.player;
  const lead = p.car ? 0.35 : 0.1;
  const tx = p.x + (p.vx || 0) * lead;
  const ty = p.y + (p.vy || 0) * lead;
  if (car.reverseTime > 0) {
    car.reverseTime -= dt;
    car.ctrl.throttle = -0.8;
    car.ctrl.steer = car.x < tx ? 0.7 : -0.7;
    return;
  }
  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.ctrl.steer = Math.max(-1, Math.min(1, diff * 1.9));
  const dist = Math.hypot(tx - car.x, ty - car.y);
  car.ctrl.throttle = dist < 46 && !p.car ? 0.12 : 1;
  if (Math.abs(car.speed) < 9 && dist > 90) {
    car.stuckTime += dt;
    if (car.stuckTime > 0.9) { car.reverseTime = 0.55; car.stuckTime = 0; }
  } else {
    car.stuckTime = 0;
  }
}

/** Fills or drains the bust meter; pushes a 'busted' event when it tops out. */
export function updateBust(state, dt) {
  const w = state.wanted;
  const p = state.player;
  if (w.stars === 0) { w.bust = 0; return; }
  let nearest = Infinity;
  for (const car of state.cars) {
    if (!car.police) continue;
    nearest = Math.min(nearest, Math.hypot(car.x - p.x, car.y - p.y));
  }
  const pinned = nearest < 118 && p.speedMag < 32;
  if (pinned) {
    w.bust += dt / BUST_TIME;
    if (w.bust >= 1) {
      w.bust = 0;
      state.events.push({ type: 'busted', x: p.x, y: p.y });
    }
  } else {
    w.bust = Math.max(0, w.bust - dt * 0.7);
  }
}
