// Palm City Heat — pedestrians.
// One job: the people of Palm City — wandering the sidewalks, fleeing
// danger, and (too often) meeting traffic.

import { PED, WORLD } from './config.js';
import { clamp, dist2 } from './random.js';
import { collideCircle, randomWalkPoint, SAND_Y } from './world.js';

const SHIRTS = ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#f368e0', '#ff9f43', '#c8d6e5', '#54a0ff', '#5f27cd', '#ff9ff3'];

export function createPed(state, x, y, opts = {}) {
  const p = {
    id: state.nextId++,
    x, y,
    angle: state.rng.float(0, Math.PI * 2),
    hp: PED.hp,
    color: opts.color || state.rng.pick(SHIRTS),
    mode: opts.mode || 'wander', // 'wander' | 'flee' | 'down' | 'dead'
    tx: x, ty: y,
    panic: opts.panic || 0,
    downFor: 0,
    deadFor: 0,
    retarget: state.rng.int(0, 240),
  };
  state.peds.push(p);
  return p;
}

export function spawnPeds(state) {
  while (state.peds.filter((p) => p.mode !== 'dead').length < PED.count) {
    const x = state.rng.float(80, WORLD.w - 80);
    const y = state.rng.float(80, SAND_Y - 60);
    const pt = randomWalkPoint(state.rng, x, y, 60);
    createPed(state, pt.x, pt.y);
  }
}

// A driver bailing out of a car the player just took, or a wreck: they run.
export function spawnFleeingDriver(state, vehicle) {
  const p = createPed(state, vehicle.x + 14, vehicle.y + 10, { mode: 'flee', panic: 200 });
  p.tx = vehicle.x - 300;
  p.ty = vehicle.y - 200;
  return p;
}

function movePed(state, p, vx, vy) {
  const res = collideCircle(state.city, p.x + vx, p.y + vy, PED.radius);
  p.x = res.x;
  p.y = res.y;
}

export function stepPed(state, p) {
  const player = state.player;
  if (p.mode === 'dead') { p.deadFor++; return; }
  if (p.mode === 'down') {
    p.downFor++;
    if (p.downFor > 260 && p.hp > 0) { p.mode = 'flee'; p.panic = 160; }
    return;
  }

  // Panic: gunfire, crimes and near-miss cars set state.threat.
  const threat = state.threat;
  if (threat && state.tick - threat.t < 200 && dist2(p.x, p.y, threat.x, threat.y) < 280 * 280) {
    p.mode = 'flee';
    p.panic = Math.max(p.panic, 90);
    p.tx = threat.x;
    p.ty = threat.y;
  }
  // A car bearing down on them is its own reason to run.
  for (const v of state.vehicles) {
    if (v.dead || v.wrecked) continue;
    if (Math.abs(v.speed) > 2.4 && dist2(p.x, p.y, v.x, v.y) < 90 * 90) {
      p.mode = 'flee';
      p.panic = Math.max(p.panic, 50);
      p.tx = v.x;
      p.ty = v.y;
    }
  }

  let speed = PED.walk;
  let dx = 0;
  let dy = 0;
  if (p.mode === 'flee') {
    speed = PED.flee;
    dx = p.x - p.tx;
    dy = p.y - p.ty;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    p.panic--;
    if (p.panic <= 0) { p.mode = 'wander'; p.retarget = 0; }
  } else {
    if (--p.retarget <= 0 || dist2(p.x, p.y, p.tx, p.ty) < 18 * 18) {
      const t = randomWalkPoint(state.rng, p.x, p.y);
      p.tx = t.x;
      p.ty = t.y;
      p.retarget = state.rng.int(300, 900);
    }
    dx = p.tx - p.x;
    dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) { dx /= d; dy /= d; } else { dx = 0; dy = 0; }
  }
  if (dx || dy) p.angle = Math.atan2(dy, dx);
  movePed(state, p, dx * speed, dy * speed);

  // Traffic accidents: any fast car can knock a pedestrian down.
  for (const v of state.vehicles) {
    if (v.dead || v.wrecked) continue;
    if (Math.abs(v.speed) < 1.2) continue;
    if (dist2(p.x, p.y, v.x, v.y) < 26 * 26) {
      const byPlayer = state.player.inCar === v.id;
      hurtPed(state, p, Math.abs(v.speed) * 9, v.x, v.y);
      if (byPlayer) {
        state.reportCrime('hitPed', p.x, p.y);
        state.audio.hit();
      }
      break;
    }
  }
  void player;
}

export function hurtPed(state, p, damage, fromX, fromY) {
  if (p.mode === 'dead') return;
  p.hp -= damage;
  state.spawnParticles(p.x, p.y, 5, '#e74c3c');
  if (p.hp <= 0) {
    p.mode = 'dead';
    p.deadFor = 0;
    // What falls out of pockets: a little cash, sometimes more.
    if (state.rng.chance(0.75)) {
      state.pickups.push({ id: state.nextId++, kind: 'cash', x: p.x + state.rng.float(-14, 14), y: p.y + state.rng.float(-14, 14), amount: state.rng.int(5, 40), t: 0 });
    }
  } else {
    p.mode = 'down';
    p.downFor = 0;
    const d = Math.hypot(p.x - fromX, p.y - fromY) || 1;
    movePed(state, p, ((p.x - fromX) / d) * 16, ((p.y - fromY) / d) * 16);
  }
}

export function maintainPeds(state) {
  if (state.tick % 90 !== 0) return;
  const alive = state.peds.filter((p) => p.mode !== 'dead' || p.deadFor < 1200);
  state.peds = alive;
  const active = alive.filter((p) => p.mode !== 'dead').length;
  if (active < PED.count) {
    // New arrivals stroll in from the map edge of the nearest sidewalk, far away.
    for (let tries = 0; tries < 6; tries++) {
      const x = state.rng.float(80, WORLD.w - 80);
      const y = state.rng.float(80, SAND_Y - 60);
      if (dist2(x, y, state.player.x, state.player.y) < 700 * 700) continue;
      const pt = randomWalkPoint(state.rng, x, y, 60);
      createPed(state, pt.x, pt.y);
      break;
    }
  }
  void clamp;
}
