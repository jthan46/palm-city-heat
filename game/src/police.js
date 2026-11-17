// Palm City Heat — the PCPD: wanted heat, witnesses, pursuit and busts.
// Crimes only count when witnessed: a pedestrian within earshot, or any
// police unit with line of sight range. Heat decays while nobody is watching.
// Police spawn on the ring around the player, steer for the player's
// predicted position, ram, and run the bust meter whenever the player is
// close and slow — on foot or in a car.

import { HEAT_THRESHOLDS, HEAT_DECAY_PER_SEC, HEAT_DECAY_DELAY, CRIME_HEAT, POLICE_PER_STAR, BUST_TIME } from './config.js';
import { spawnIntersection } from './world.js';
import { makePoliceCar, turnToward, approach, collideCarBody, CAR_TYPES } from './vehicles.js';

export function starsForHeat(heat) {
  let stars = 0;
  for (const t of HEAT_THRESHOLDS) if (heat >= t) stars++;
  return stars;
}

// Returns true when the crime was witnessed (and therefore added heat).
export function reportCrime(state, kind, x, y) {
  const witnessed =
    state.cars.some((c) => c.driver === 'police' && !c.dead && Math.hypot(c.x - x, c.y - y) < 320) ||
    state.peds.some((p) => p.state !== 'down' && Math.hypot(p.x - x, p.y - y) < 130);
  if (!witnessed) return false;
  state.heat = Math.min(200, state.heat + (CRIME_HEAT[kind] || 8));
  state.lastCrimeT = state.time;
  state.lastCrimePos = { x, y };
  state.stats.crimesWitnessed += 1;
  return true;
}

export function stepPolice(state, dt) {
  const world = state.world;
  const player = state.player;
  const stars = starsForHeat(state.heat);
  state.stars = stars;

  const police = state.cars.filter((c) => c.driver === 'police' && !c.dead);
  const observed = police.some((c) => Math.hypot(c.x - player.x, c.y - player.y) < 200);

  // Heat decay: only once the last crime is stale and no unit is watching.
  if (state.time - state.lastCrimeT > HEAT_DECAY_DELAY && !observed && state.heat > 0) {
    state.heat = Math.max(0, state.heat - HEAT_DECAY_PER_SEC * dt);
  }

  // Field the right number of units.
  const wanted = POLICE_PER_STAR[stars];
  state.policeSpawnT -= dt;
  if (police.length < wanted && state.policeSpawnT <= 0) {
    state.policeSpawnT = 1.1;
    const spot = spawnIntersection(world, player.x, player.y, 560, state.rng);
    if (!state.cars.some((c) => Math.hypot(c.x - spot.x, c.y - spot.y) < 70)) {
      const car = makePoliceCar(state.rng, spot.x, spot.y);
      car.angle = Math.atan2(player.y - spot.y, player.x - spot.x);
      state.cars.push(car);
      police.push(car);
    }
  } else if (police.length > wanted) {
    // Extras peel off and despawn once far away.
    for (const car of police.slice(wanted)) {
      if (Math.hypot(car.x - player.x, car.y - player.y) > 700) {
        car.dead = true;
        car.driver = null;
      }
    }
  }

  // Drive every unit.
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  const pvx = player.inCar ? Math.cos(player.inCar.angle) * player.inCar.speed : 0;
  const pvy = player.inCar ? Math.sin(player.inCar.angle) * player.inCar.speed : 0;
  for (const car of police) {
    if (car.dead) continue;
    stepPoliceCar(state, car, px + pvx * 0.45, py + pvy * 0.45, dt, stars);
  }

  // Bust meter: a unit close in while the player is barely moving.
  const playerSpeed = player.inCar ? Math.abs(player.inCar.speed) : player.footSpeed;
  const closeUnit = police.some((c) => !c.dead && Math.hypot(c.x - px, c.y - py) < 64);
  if (stars > 0 && closeUnit && playerSpeed < 26) {
    state.bust += dt / BUST_TIME;
    if (state.bust >= 1 && !state.busted) {
      state.busted = true;
    }
  } else {
    state.bust = Math.max(0, state.bust - dt * 0.7);
  }
}

function stepPoliceCar(state, car, tx, ty, dt, stars) {
  const spec = CAR_TYPES.police;
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy);
  const desired = Math.atan2(dy, dx);
  car.angle = turnToward(car.angle, desired, 2.5 * dt);

  let want = spec.maxSpeed * (stars >= 4 ? 1 : 0.88);
  if (dist < 90) want = Math.min(want, 60 + dist); // don't overshoot a stopped player
  if (dist < 30) want = 12;

  // Unstick: if we want to move but can't, reverse briefly.
  if (Math.abs(car.speed) < 6 && want > 20) {
    car.stuckT = (car.stuckT || 0) + dt;
    if (car.stuckT > 0.9) car.reverseT = 0.55;
  } else {
    car.stuckT = 0;
  }
  if (car.reverseT > 0) {
    car.reverseT -= dt;
    car.speed = approach(car.speed, -70, spec.accel * dt);
  } else {
    car.speed = approach(car.speed, want, spec.accel * dt);
  }

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const hitWall = collideCarBody(state.world, car);
  if (hitWall && Math.abs(car.speed) > 100) car.impact = Math.abs(car.speed);
  if (hitWall) car.speed *= 0.55;
}
