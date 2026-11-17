// vehicles.js — everything about cars: models, spawning, the traffic AI that
// drives the road grid, arcade driving physics, collisions and damage.
// One job: cars as entities — how they look, move, crash and break.

import { AVENUES, STREETS, LANE, CAR_COLORS, WORLD_W, WORLD_H } from './config.js';
import { moveCircle, clamp, dist } from './world.js';

export const MODELS = [
  { name: 'sedan', w: 40, l: 20, topSpeed: 302, accel: 210, colors: CAR_COLORS },
  { name: 'coupe', w: 38, l: 19, topSpeed: 342, accel: 250, colors: CAR_COLORS },
  { name: 'sport', w: 39, l: 19, topSpeed: 398, accel: 300, colors: ['#d92b2b', '#f2b21b', '#22242c', '#e8e4da', '#2b6ad9'] },
  { name: 'van', w: 46, l: 22, topSpeed: 262, accel: 170, colors: ['#e8e4da', '#7a8899', '#4fae62', '#c96a2e'] },
  { name: 'taxi', w: 40, l: 20, topSpeed: 305, accel: 215, colors: ['#f2b21b'] },
  { name: 'truck', w: 50, l: 23, topSpeed: 244, accel: 150, colors: ['#8a4f2e', '#5a6e8a', '#6e5a8a'] },
];

export const POLICE_MODEL = { name: 'interceptor', w: 41, l: 20, topSpeed: 330, accel: 265, colors: ['#1d1f26'] };

// Headings as indices: 0 east, 1 south, 2 west, 3 north.
export const DIRV = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

let nextCarId = 1;

export function makeCar(rng, x, y, kind, modelName = null) {
  const model = modelName
    ? MODELS.find((m) => m.name === modelName) || MODELS[0]
    : kind === 'police'
      ? POLICE_MODEL
      : rng.pick(MODELS);
  return {
    id: nextCarId++,
    kind, // 'traffic' | 'parked' | 'police' | 'mission'
    model,
    color: kind === 'police' ? '#1d1f26' : rng.pick(model.colors),
    x,
    y,
    angle: 0,
    speed: 0,
    hp: 100,
    driver: kind === 'traffic', // a person is behind the wheel
    dir: 0,
    tx: x,
    ty: y,
    cruise: rng.range(120, 185),
    brakeLight: 0,
    honkAt: 0,
    dead: false,
  };
}

// The point where a car crosses intersection (ix, iy) travelling in `dir`,
// offset into its right-hand lane.
export function lanePoint(ix, iy, dir) {
  const ax = AVENUES[ix];
  const sy = STREETS[iy];
  if (dir === 0) return { x: ax, y: sy + LANE };
  if (dir === 2) return { x: ax, y: sy - LANE };
  if (dir === 1) return { x: ax - LANE, y: sy };
  return { x: ax + LANE, y: sy };
}

// Choose a traffic car's next intersection target from its current one.
export function chooseNextTarget(rng, car) {
  // Find the intersection the car is heading to / sitting at.
  let ix = 0;
  let iy = 0;
  let best = Infinity;
  for (let i = 0; i < AVENUES.length; i++) {
    for (let j = 0; j < STREETS.length; j++) {
      const d = Math.hypot(AVENUES[i] - car.x, STREETS[j] - car.y);
      if (d < best) {
        best = d;
        ix = i;
        iy = j;
      }
    }
  }
  const options = [];
  const straight = car.dir;
  const left = (car.dir + 3) % 4;
  const right = (car.dir + 1) % 4;
  const canGo = (dir) => {
    if (dir === 0) return ix < AVENUES.length - 1;
    if (dir === 2) return ix > 0;
    if (dir === 1) return iy < STREETS.length - 1;
    return iy > 0;
  };
  if (canGo(straight)) options.push(straight, straight); // favour going straight
  if (canGo(left)) options.push(left);
  if (canGo(right)) options.push(right);
  if (options.length === 0) options.push((car.dir + 2) % 4); // dead end: U-turn
  car.dir = rng.pick(options);
  const nix = ix + DIRV[car.dir].x;
  const niy = iy + DIRV[car.dir].y;
  const p = lanePoint(nix, niy, car.dir);
  car.tx = p.x;
  car.ty = p.y;
}

export function angleTo(x0, y0, x1, y1) {
  return Math.atan2(y1 - y0, x1 - x0);
}

export function turnToward(angle, target, maxTurn) {
  let diff = target - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxTurn) return target;
  return angle + Math.sign(diff) * maxTurn;
}

// --- traffic ---------------------------------------------------------------

// Is something (car, ped, the player) close ahead of this car?
function obstacleAhead(game, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const check = (ox, oy, radius) => {
    const dx = ox - car.x;
    const dy = oy - car.y;
    const proj = dx * fx + dy * fy;
    if (proj < 4 || proj > 58 + radius) return false;
    const lat = Math.abs(dx * -fy + dy * fx);
    return lat < 17 + radius * 0.4;
  };
  for (const other of game.cars) {
    if (other === car || other.dead) continue;
    if (!check(other.x, other.y, 16)) continue;
    // An oncoming car holding its own lane is not an obstacle: the lanes
    // pass with room to spare, and braking for it deadlocks the street.
    // (Only when it is clearly in that lane — a car still crossing the
    // oncoming lane, lateral under half the lane separation, is traffic
    // in the way and must be braked for.)
    const dot = Math.cos(other.angle) * fx + Math.sin(other.angle) * fy;
    if (dot < -0.5) {
      const lat = Math.abs((other.x - car.x) * -fy + (other.y - car.y) * fx);
      if (lat > 30) continue;
    }
    return true;
  }
  for (const ped of game.peds) {
    if (!ped.dead && check(ped.x, ped.y, 4)) return true;
  }
  const p = game.player;
  if (!p.inCar && check(p.x, p.y, 4)) return true;
  return false;
}

export function updateTrafficCar(game, car, dt) {
  const d = dist(car.x, car.y, car.tx, car.ty);
  if (d < 30) chooseNextTarget(game.rng, car);
  const want = angleTo(car.x, car.y, car.tx, car.ty);
  car.angle = turnToward(car.angle, want, 2.4 * dt);
  const blocked = obstacleAhead(game, car);
  const turnSharp = Math.abs(((want - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  let target = car.cruise;
  if (blocked) target = 0;
  else if (turnSharp > 0.5) target = car.cruise * 0.55;
  car.brakeLight = target < car.speed - 4 ? 1 : 0;
  if (car.speed < target) car.speed = Math.min(target, car.speed + car.model.accel * 0.7 * dt);
  else car.speed = Math.max(target, car.speed - 320 * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const moved = moveCircle(game.world, car.x, car.y, 16, nx - car.x, ny - car.y);
  car.x = moved.x;
  car.y = moved.y;
  if (moved.hit) car.speed *= 0.4;
}

// --- shared driving physics (player and police) ----------------------------

// Advance a driven car one step. throttle/steer in [-1, 1]; handbrake 0/1.
// Returns the impact speed if the car struck a building/wall this step, else 0.
export function stepCarPhysics(game, car, throttle, steer, handbrake, dt) {
  const m = car.model;
  const maxReverse = 110;
  if (throttle > 0) {
    car.speed += m.accel * throttle * dt * (car.speed < 0 ? 2.2 : 1);
  } else if (throttle < 0) {
    if (car.speed > 12) car.speed += 340 * throttle * dt; // braking
    else car.speed = Math.max(-maxReverse, car.speed + m.accel * 0.6 * throttle * dt);
  }
  // Drag and rolling resistance.
  car.speed -= car.speed * 0.35 * dt;
  if (throttle === 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  if (handbrake) car.speed -= car.speed * 2.4 * dt;
  car.speed = clamp(car.speed, -maxReverse, m.topSpeed);
  if (Math.abs(car.speed) < 1.5 && throttle === 0) car.speed = 0;
  // Steering: sharper at low speed, calmer at high speed, multiplied by handbrake.
  const steerAuthority = (1.9 - Math.min(1.15, Math.abs(car.speed) / m.topSpeed)) * (handbrake ? 1.7 : 1);
  if (car.speed !== 0) {
    car.angle += steer * steerAuthority * dt * Math.sign(car.speed);
  }
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  const before = Math.abs(car.speed);
  const moved = moveCircle(game.world, car.x, car.y, 16, dx, dy);
  car.x = moved.x;
  car.y = moved.y;
  if (moved.hit) {
    const impact = before;
    car.speed = -car.speed * 0.22;
    return impact;
  }
  return 0;
}

// --- collisions between cars, and damage -----------------------------------

// Resolve overlaps between all live cars. Returns impact events
// [{a, b, force}] strong enough to matter (damage, sound, crime checks).
export function resolveCarCollisions(game) {
  const events = [];
  const cars = game.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const minD = 34;
      if (d === 0 || d >= minD) continue;
      const push = (minD - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      // Both cars give ground: a moving car shunts a parked one, which is
      // what lets anyone pull out of a tight parking row.
      a.x -= ux * push;
      a.y -= uy * push;
      b.x += ux * push;
      b.y += uy * push;
      const relSpeed = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3 + Math.abs(b.speed) * 0.3;
      const closing = Math.abs(a.speed) + Math.abs(b.speed);
      if (closing > 55) {
        const force = closing;
        a.speed *= 0.55;
        b.speed *= 0.55;
        events.push({ a, b, force });
      } else {
        a.speed *= 0.92;
        b.speed *= 0.92;
      }
      void relSpeed;
    }
  }
  return events;
}

export function damageCar(game, car, amount) {
  if (car.dead) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.dead = true;
    car.speed = 0;
    game.spawnParticles(car.x, car.y, 16, '#3a3a42', 90);
    game.spawnParticles(car.x, car.y, 10, '#ff8a3d', 70);
  }
}

export function carSpeedRatio(car) {
  return Math.abs(car.speed) / car.model.topSpeed;
}

export { WORLD_W, WORLD_H };
