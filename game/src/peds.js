// Palm City Heat — pedestrians: they stroll the sidewalks between errands, scatter from
// gunfire and reckless cars, and fall when a car or a bullet finds them. A fallen ped may
// drop the cash in their pockets.

import { PED_COUNT } from './config.js';
import { carRadius } from './vehicles.js';
import { collideCircle, randomSidewalkPoint } from './world.js';

const SHIRTS = ['#e07a5f', '#81b29a', '#f2cc8f', '#3d405b', '#bc6c25', '#dda15e', '#e4e0d8', '#c94f7c'];

export function createPed(rng, x, y) {
  return {
    x, y, angle: rng.range(0, Math.PI * 2),
    speed: 0, walkSpeed: rng.range(38, 58),
    target: null, state: 'walk', fleeT: 0, threatX: 0, threatY: 0,
    hp: 30, down: false, downT: 0,
    color: rng.pick(SHIRTS), skin: rng.pick(['#f1c27d', '#e0ac69', '#8d5524', '#ffdbac']),
  };
}

export function spawnPeds(state) {
  for (let i = 0; i < PED_COUNT; i += 1) {
    const p = randomSidewalkPoint(state.rng);
    state.peds.push(createPed(state.rng, p.x, p.y));
  }
}

/** A driver scrambling out of a car the player just took, already running. */
export function spawnFleeingPed(state, x, y, fromX, fromY) {
  const ped = createPed(state.rng, x, y);
  ped.state = 'flee';
  ped.fleeT = 3;
  ped.threatX = fromX;
  ped.threatY = fromY;
  state.peds.push(ped);
  return ped;
}

/** Puts a ped on the ground; drops a cash pickup half the time. Returns true if newly down. */
export function downPed(state, ped, cause) {
  if (ped.down) return false;
  ped.down = true;
  ped.downT = 14;
  ped.hp = 0;
  state.events.push({ type: 'peddown', x: ped.x, y: ped.y, ped, cause });
  if (state.rng.chance(0.5)) {
    state.pickups.push({ x: ped.x + state.rng.range(-8, 8), y: ped.y + state.rng.range(-8, 8), kind: 'cash', amount: state.rng.int(5, 30), t: 0 });
  }
  return true;
}

export function updatePeds(state, dt) {
  const player = state.player;
  for (const ped of state.peds) {
    if (ped.down) {
      ped.downT -= dt;
      continue;
    }
    // Threats: a gunshot just heard, a car bearing down, the player waving a gun around.
    let fleeing = ped.state === 'flee' && ped.fleeT > 0;
    if (state.threat && state.time - state.threat.t < 1.6) {
      if (Math.hypot(ped.x - state.threat.x, ped.y - state.threat.y) < 230) {
        ped.state = 'flee'; ped.fleeT = 2.4; ped.threatX = state.threat.x; ped.threatY = state.threat.y; fleeing = true;
      }
    }
    if (!fleeing) {
      for (const car of state.cars) {
        if (Math.abs(car.speed) > 120 && Math.hypot(ped.x - car.x, ped.y - car.y) < 74) {
          ped.state = 'flee'; ped.fleeT = 1.6; ped.threatX = car.x; ped.threatY = car.y; fleeing = true;
          break;
        }
      }
    }
    let tx;
    let ty;
    let speed;
    if (fleeing) {
      ped.fleeT -= dt;
      const dx = ped.x - ped.threatX;
      const dy = ped.y - ped.threatY;
      const d = Math.hypot(dx, dy) || 1;
      tx = ped.x + (dx / d) * 130;
      ty = ped.y + (dy / d) * 130;
      speed = 128;
      if (ped.fleeT <= 0) ped.state = 'walk';
    } else {
      if (!ped.target || Math.hypot(ped.x - ped.target.x, ped.y - ped.target.y) < 14) {
        ped.target = randomSidewalkPoint(state.rng);
      }
      tx = ped.target.x; ty = ped.target.y;
      speed = ped.walkSpeed;
    }
    const dx = tx - ped.x;
    const dy = ty - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      ped.angle = Math.atan2(dy, dx);
      const step = Math.min(dist, speed * dt);
      const nx = ped.x + Math.cos(ped.angle) * step;
      const ny = ped.y + Math.sin(ped.angle) * step;
      const fixed = collideCircle(state.world, nx, ny, 9);
      ped.x = fixed.x; ped.y = fixed.y;
      ped.speed = speed;
    } else {
      ped.speed = 0;
    }
    void player;
  }
  // Cars versus people: a fast car through a crowd is a crime scene.
  for (const ped of state.peds) {
    if (ped.down) continue;
    for (const car of state.cars) {
      if (Math.abs(car.speed) < 42) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < carRadius(car) + 7) {
        downPed(state, ped, 'car');
        state.events.push({ type: 'hitped', x: ped.x, y: ped.y, car, ped });
        break;
      }
    }
  }
  // The fallen are cleared away after a while.
  state.peds = state.peds.filter((p) => !p.down || p.downT > 0);
}
