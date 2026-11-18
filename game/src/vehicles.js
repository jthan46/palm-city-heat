// Palm City Heat — vehicles: the car factory, the traffic drivers who follow the road
// lattice from lane to lane, the arcade driving physics every car shares, and car-against-
// world / car-against-car collision. Who wants to go where (traffic, police, the player)
// is decided elsewhere; this module turns a car's controls into motion.

import {
  CAR_COLORS, CAR_MODELS, GOLD_COLOR, PARKED_PER_LOT, POLICE_COLOR, POLICE_MODEL,
  ROAD_PERIOD, TAXI_COLOR, TILE, TRAFFIC_COUNT,
} from './config.js';
import { collideCircle, isRoadAt, kindAt, randomRoadPoint, TILE_SAND } from './world.js';

let nextCarId = 1;

export function createCar(rng, { x, y, angle = 0, model = null, color = null, driver = 'parked', police = false }) {
  const m = police ? POLICE_MODEL : (model || rng.pick(CAR_MODELS));
  const c = police ? POLICE_COLOR : (color || (m.name === 'taxi' ? TAXI_COLOR : rng.pick(CAR_COLORS)));
  return {
    id: nextCarId += 1,
    x, y, angle, speed: 0,
    len: m.len, wid: m.wid, top: m.top, accel: m.accel, modelName: m.name,
    color: c, police,
    driver, // 'traffic' | 'parked' | 'police' | 'player'
    hp: 100,
    ctrl: { throttle: 0, steer: 0 },
    ai: { dx: Math.round(Math.cos(angle)), dy: Math.round(Math.sin(angle)), cruise: rng.range(118, 168), intersection: '' },
    stuckTime: 0, reverseTime: 0, smoke: 0,
  };
}

export function carRadius(car) { return car.len * 0.42; }

/** Fills the city with moving traffic and parked cars before the game starts. */
export function spawnVehicles(state) {
  const rng = state.rng;
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const p = randomRoadPoint(rng, state.player.x, state.player.y, 260);
    const vertical = rng.chance(0.5);
    const dir = rng.chance(0.5) ? 1 : -1;
    const angle = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = createCar(rng, { x: p.x, y: p.y, angle, driver: 'traffic' });
    car.ai.dx = vertical ? 0 : dir;
    car.ai.dy = vertical ? dir : 0;
    snapToLane(car);
    state.cars.push(car);
  }
  for (const lot of state.world.lots) {
    const n = Math.min(PARKED_PER_LOT, state.rng.int(2, 5));
    for (let i = 0; i < n; i += 1) {
      const x = lot.x + 44 + (i % 3) * 74 + rng.range(-6, 6);
      const y = lot.y + 52 + Math.floor(i / 3) * 92 + rng.range(-6, 6);
      state.cars.push(createCar(rng, { x, y, angle: rng.chance(0.5) ? Math.PI / 2 : 0, driver: 'parked' }));
    }
  }
}

/** Pulls a car sideways onto the right-hand lane centre of the road it sits on. */
export function snapToLane(car) {
  const band = TILE * ROAD_PERIOD;
  if (car.ai.dx !== 0) {
    const centre = Math.floor(car.y / band) * band + TILE;
    car.y = centre + (car.ai.dx > 0 ? TILE / 2 : -TILE / 2);
  } else if (car.ai.dy !== 0) {
    const centre = Math.floor(car.x / band) * band + TILE;
    car.x = centre + (car.ai.dy > 0 ? -TILE / 2 : TILE / 2);
  }
}

function wrapAngle(a) {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

/** The point a traffic car steers for: ahead of it, pulled onto its lane centre. */
function seekPoint(car) {
  const band = TILE * ROAD_PERIOD;
  let tx = car.x + car.ai.dx * 150;
  let ty = car.y + car.ai.dy * 150;
  if (car.ai.dx !== 0) {
    const centre = Math.floor(car.y / band) * band + TILE;
    ty = centre + (car.ai.dx > 0 ? TILE / 2 : -TILE / 2);
  } else {
    const centre = Math.floor(car.x / band) * band + TILE;
    tx = centre + (car.ai.dy > 0 ? -TILE / 2 : TILE / 2);
  }
  return { x: tx, y: ty };
}

function roadContinues(tx, ty, dx, dy) {
  const px = tx + dx * 3;
  const py = ty + dy * 3;
  if (px < 0 || py < 0 || px >= 64 || py >= 48) return false;
  return isRoadAt(px * TILE + TILE / 2, py * TILE + TILE / 2);
}

/** At each new intersection a traffic car picks a way on: mostly straight, never into the sea. */
function decideAtIntersection(state, car) {
  const tx = Math.floor(car.x / TILE);
  const ty = Math.floor(car.y / TILE);
  const key = `${Math.floor(tx / ROAD_PERIOD)},${Math.floor(ty / ROAD_PERIOD)}`;
  if (car.ai.intersection === key) return;
  car.ai.intersection = key;
  const { dx, dy } = car.ai;
  const options = [];
  if (roadContinues(tx, ty, dx, dy)) options.push({ dx, dy, w: 0.55 });
  if (roadContinues(tx, ty, -dy, dx)) options.push({ dx: -dy, dy: dx, w: 0.22 });
  if (roadContinues(tx, ty, dy, -dx)) options.push({ dx: dy, dy: -dx, w: 0.22 });
  if (options.length === 0) { car.ai.dx = -dx; car.ai.dy = -dy; return; }
  let roll = state.rng.float();
  for (const o of options) {
    roll -= o.w;
    if (roll <= 0) { car.ai.dx = o.dx; car.ai.dy = o.dy; return; }
  }
  const last = options[options.length - 1];
  car.ai.dx = last.dx; car.ai.dy = last.dy;
}

/** Sets a traffic car's controls for this step: follow the lane, mind the car ahead. */
export function updateTrafficCar(state, car, dt) {
  const tx = Math.floor(car.x / TILE);
  const ty = Math.floor(car.y / TILE);
  if (tx % ROAD_PERIOD < 2 && ty % ROAD_PERIOD < 2) decideAtIntersection(state, car);
  const target = seekPoint(car);
  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = wrapAngle(desired - car.angle);
  car.ctrl.steer = Math.max(-1, Math.min(1, diff * 1.7));
  let throttle = 1;
  if (Math.abs(diff) > 0.55) throttle = 0.45;
  // Brake for anything solid in the path ahead.
  const fx = car.x + Math.cos(car.angle) * (car.len / 2 + 30);
  const fy = car.y + Math.sin(car.angle) * (car.len / 2 + 30);
  const blockedBy = (e, r) => Math.hypot(e.x - fx, e.y - fy) < r + 26;
  for (const other of state.cars) {
    if (other !== car && blockedBy(other, carRadius(other))) { throttle = -0.7; break; }
  }
  if (throttle > 0 && state.player.car !== car && blockedBy(state.player, 14)) throttle = -0.7;
  if (throttle > 0) {
    for (const ped of state.peds) {
      if (!ped.down && blockedBy(ped, 8)) { throttle = -0.7; break; }
    }
  }
  car.ctrl.throttle = throttle;
  void dt;
}

/**
 * Advances one car by dt under its controls: engine, steering, drag, then the world pushes
 * it out of buildings and water. Returns the impact speed if it hit something solid.
 */
export function integrateCar(state, car, dt) {
  const ctrl = car.ctrl;
  const wrecked = car.hp <= 0;
  let top = car.top;
  if (kindAt(car.x, car.y) === TILE_SAND) top *= 0.55;
  let target = 0;
  if (!wrecked) {
    if (ctrl.throttle > 0) target = ctrl.throttle * top;
    else if (ctrl.throttle < 0) target = ctrl.throttle * 95;
  }
  const rate = ctrl.throttle !== 0 && !wrecked ? car.accel : 300;
  if (car.speed < target) car.speed = Math.min(target, car.speed + rate * dt);
  else car.speed = Math.max(target, car.speed - rate * dt);
  car.speed *= (1 - 0.35 * dt);
  const turn = ctrl.steer * 2.35 * Math.min(1, Math.abs(car.speed) / 105) * (car.speed < 0 ? -1 : 1);
  car.angle += turn * dt;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fixed = collideCircle(state.world, nx, ny, carRadius(car));
  let impact = 0;
  const moved = Math.hypot(fixed.x - nx, fixed.y - ny);
  if (moved > 1.5) {
    impact = Math.abs(car.speed);
    if (impact > 130) {
      car.hp -= (impact - 130) / 5.5;
      state.events.push({ type: 'crash', x: car.x, y: car.y, car, impact });
    }
    car.speed *= 0.32;
  }
  car.x = fixed.x;
  car.y = fixed.y;
  if (car.hp < 55) {
    car.smoke += dt * (car.hp < 25 ? 9 : 4);
    if (car.smoke > 1) {
      car.smoke = 0;
      state.particles.push({
        x: car.x + state.rng.range(-6, 6), y: car.y + state.rng.range(-6, 6),
        vx: state.rng.range(-6, 6), vy: state.rng.range(-26, -14),
        life: state.rng.range(0.5, 1), maxLife: 1, size: state.rng.range(3, 6),
        color: car.hp < 25 ? '#3a3a3a' : '#9a9a9a',
      });
    }
  }
  return impact;
}

/** Pairwise car-against-car shoves, with damage and crash events on hard hits. */
export function collideCars(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = carRadius(a) + carRadius(b);
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      const rel = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.25;
      a.x -= ux * push; a.y -= uy * push;
      b.x += ux * push; b.y += uy * push;
      if (rel > 95) {
        const dmg = (rel - 95) / 6;
        a.hp -= dmg; b.hp -= dmg;
        state.events.push({ type: 'carcrash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, a, b, impact: rel });
        a.speed *= 0.55; b.speed *= 0.55;
      } else {
        a.speed *= 0.85; b.speed *= 0.85;
      }
    }
  }
}

/** The gold coupe the second story mission sends the player to steal. */
export function spawnGoldCoupe(state) {
  const p = state.world.pois.hotel;
  const car = createCar(state.rng, {
    x: p.x, y: p.y - 66, angle: 0,
    model: CAR_MODELS[2], color: GOLD_COLOR, driver: 'parked',
  });
  car.isMissionCar = true;
  state.cars.push(car);
  return car;
}
