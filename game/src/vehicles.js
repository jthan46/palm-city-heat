// Palm City Heat — cars: types, traffic AI, parked cars, driving physics.
// Traffic cars navigate the intersection grid lane by lane (right-hand
// traffic); the player's car and police cars use free arcade physics. All
// movement is fixed-step and driven by the shared RNG, so traffic is part of
// the deterministic simulation.

import { GRID } from './config.js';
import { collideCircle } from './world.js';

export const CAR_TYPES = {
  sedan: { w: 46, h: 22, maxSpeed: 168, accel: 140, colors: ['#c94f43', '#4a7fb5', '#7a8288', '#e3e0d8', '#5d8a5a', '#845ec2'] },
  hatch: { w: 40, h: 21, maxSpeed: 152, accel: 135, colors: ['#e07b39', '#4fb5a6', '#b5b0a6', '#7f6fb0'] },
  taxi: { w: 46, h: 22, maxSpeed: 162, accel: 138, colors: ['#f2b63c'] },
  sports: { w: 48, h: 21, maxSpeed: 238, accel: 215, colors: ['#d92662', '#f2e13c', '#2ec4b6', '#ff7b2f'] },
  van: { w: 55, h: 25, maxSpeed: 134, accel: 110, colors: ['#d8d3c8', '#6b7f8c', '#94765d'] },
  police: { w: 47, h: 22, maxSpeed: 222, accel: 196, colors: ['#20242e'] },
};

const TRAFFIC_TYPES = ['sedan', 'sedan', 'hatch', 'hatch', 'taxi', 'sports', 'van'];
let nextCarId = 1;

export function carRadius(car) {
  return CAR_TYPES[car.type].w * 0.42;
}

// Building/water collision for a whole car: resolve two probe circles at
// the axles (radius from the car's width across). Modelling the rectangle
// this way lets cars turn around building corners instead of snagging on
// them the way one big centre circle does. Applies the largest single
// correction so a probe never stays buried. Returns true on any contact.
export function collideCarBody(world, car) {
  const spec = CAR_TYPES[car.type];
  const probeR = spec.h * 0.55;
  const off = spec.w * 0.24;
  const cx = Math.cos(car.angle), cy = Math.sin(car.angle);
  let bestDx = 0, bestDy = 0, bestMag = 0, hit = false;
  for (const s of [1, -1]) {
    const px = car.x + cx * off * s, py = car.y + cy * off * s;
    const res = collideCircle(world, px, py, probeR);
    if (!res.hit) continue;
    hit = true;
    const dx = res.x - px, dy = res.y - py;
    const mag = dx * dx + dy * dy;
    if (mag > bestMag) { bestMag = mag; bestDx = dx; bestDy = dy; }
  }
  car.x += bestDx;
  car.y += bestDy;
  return hit;
}

// A car body is two circles (front and rear axle), radius from its width
// across — much closer to the real rectangle than one fat circle, so traffic
// can pass parked cars in the next lane without phantom collisions.
export function carCircles(car) {
  const spec = CAR_TYPES[car.type];
  const r = spec.h * 0.48;
  const off = spec.w * 0.24;
  const cx = Math.cos(car.angle), cy = Math.sin(car.angle);
  return [
    { x: car.x + cx * off, y: car.y + cy * off, r },
    { x: car.x - cx * off, y: car.y - cy * off, r },
  ];
}

// Distance from a point to the car's nearest body circle (negative = inside).
export function carProximity(car, x, y) {
  let best = Infinity;
  for (const c of carCircles(car)) {
    best = Math.min(best, Math.hypot(x - c.x, y - c.y) - c.r);
  }
  return best;
}

function makeCar(rng, type, x, y, angle) {
  const spec = CAR_TYPES[type];
  return {
    id: nextCarId++,
    kind: 'car',
    type,
    x, y, angle,
    speed: 0,
    w: spec.w, h: spec.h,
    color: spec.colors[Math.floor(rng.next() * spec.colors.length)],
    health: 100,
    driver: null, // null | 'traffic' | 'player' | 'police'
    parked: false,
    ix: 0, iy: 0, // traffic: target intersection indices
    cruise: 0.55 + rng.next() * 0.3, // fraction of maxSpeed traffic aims for
    dead: false,
  };
}

export function spawnTraffic(world, rng, count, avoid = null) {
  const cars = [];
  for (let n = 0; n < count; n++) {
    for (let tries = 0; tries < 12; tries++) {
      const ix = Math.floor(rng.next() * world.roadVX.length);
      const iy = Math.floor(rng.next() * world.roadHY.length);
      const dirs = [];
      if (ix > 0) dirs.push([-1, 0]);
      if (ix < world.roadVX.length - 1) dirs.push([1, 0]);
      if (iy > 0) dirs.push([0, -1]);
      if (iy < world.roadHY.length - 1) dirs.push([0, 1]);
      const [dx, dy] = dirs[Math.floor(rng.next() * dirs.length)];
      const type = TRAFFIC_TYPES[Math.floor(rng.next() * TRAFFIC_TYPES.length)];
      const x = world.roadVX[ix] + (dy !== 0 ? -dy * 13 : 0) + rng.range(-6, 6);
      const y = world.roadHY[iy] + (dx !== 0 ? dx * 13 : 0) + rng.range(-6, 6);
      if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < 120) continue;
      if (cars.some((c) => Math.hypot(c.x - x, c.y - y) < 60)) continue;
      const car = makeCar(rng, type, x, y, Math.atan2(dy, dx));
      car.driver = 'traffic';
      car.ix = ix + dx;
      car.iy = iy + dy;
      car.speed = CAR_TYPES[type].maxSpeed * car.cruise * 0.6;
      cars.push(car);
      break;
    }
  }
  return cars;
}

export function spawnParked(world, rng, count) {
  const cars = [];
  for (let n = 0; n < count; n++) {
    const block = world.blocks[Math.floor(rng.next() * world.blocks.length)];
    if (block.district === 'park' || block.district === 'beach') continue;
    const side = Math.floor(rng.next() * 4);
    const t = 40 + rng.next() * (GRID.block - 80);
    let x, y, angle;
    if (side === 0) { x = block.x - 13; y = block.y + t; angle = Math.PI / 2; }
    else if (side === 1) { x = block.x + GRID.block + 13; y = block.y + t; angle = -Math.PI / 2; }
    else if (side === 2) { x = block.x + t; y = block.y - 13; angle = 0; }
    else { x = block.x + t; y = block.y + GRID.block + 13; angle = Math.PI; }
    const type = TRAFFIC_TYPES[Math.floor(rng.next() * TRAFFIC_TYPES.length)];
    const car = makeCar(rng, type, x, y, angle);
    car.parked = true;
    cars.push(car);
  }
  return cars;
}

export function makePoliceCar(rng, x, y) {
  const car = makeCar(rng, 'police', x, y, 0);
  car.driver = 'police';
  car.color = '#20242e';
  return car;
}

export function makeMissionCar(rng, type, x, y, angle) {
  const car = makeCar(rng, type, x, y, angle);
  car.parked = true;
  car.missionTarget = true;
  return car;
}

// One fixed step of traffic behaviour for a single car. `blockers` are
// people (the player on foot, pedestrians): traffic brakes for them.
export function stepTrafficCar(world, car, dt, cars, rng, blockers = []) {
  const spec = CAR_TYPES[car.type];
  const gx = world.roadVX[car.ix];
  const gy = world.roadHY[car.iy];
  const distToTarget = Math.hypot(gx - car.x, gy - car.y);

  if (distToTarget < 26) {
    // Arrived: choose the next intersection (mostly straight, sometimes a turn).
    const options = [];
    const cur = currentDir(car);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = car.ix + dx, ny = car.iy + dy;
      if (nx < 0 || ny < 0 || nx >= world.roadVX.length || ny >= world.roadHY.length) continue;
      if (dx === -cur.x && dy === -cur.y && rng.next() > 0.12) continue; // rare U-turn
      options.push([nx, ny, dx === cur.x && dy === cur.y ? 3 : 1]);
    }
    if (options.length) {
      const total = options.reduce((s, o) => s + o[2], 0);
      let roll = rng.next() * total;
      let chosen = options[0];
      for (const o of options) { roll -= o[2]; if (roll <= 0) { chosen = o; break; } }
      car.ix = chosen[0];
      car.iy = chosen[1];
    }
  }

  // Aim at the lane point of the target intersection.
  const aim = laneAim(world, car);
  const desired = Math.atan2(aim.y - car.y, aim.x - car.x);
  car.angle = turnToward(car.angle, desired, 2.6 * dt);

  // Slow down for anything ahead in our lane.
  let want = spec.maxSpeed * car.cruise;
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
    if (ahead > 0 && ahead < 58 && Math.abs(side) < 17) {
      want = Math.min(want, Math.max(0, other.speed - 4));
      if (ahead < 34) want = 0;
    }
  }
  // And stop outright for people in the road.
  for (const b of blockers) {
    const dx = b.x - car.x, dy = b.y - car.y;
    const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
    if (ahead > 0 && ahead < 52 && Math.abs(side) < 15) want = 0;
  }
  // Gridlock breaker: if we have been unable to move for a few seconds,
  // pick a different way out of the intersection.
  if (want > 20 && Math.abs(car.speed) < 5) {
    car.blockedT = (car.blockedT || 0) + dt;
    if (car.blockedT > 4) {
      car.blockedT = 0;
      const options = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = car.ix + dx, ny = car.iy + dy;
        if (nx >= 0 && ny >= 0 && nx < world.roadVX.length && ny < world.roadHY.length) options.push([nx, ny]);
      }
      if (options.length) {
        const [nx, ny] = options[Math.floor(rng.next() * options.length)];
        car.ix = nx;
        car.iy = ny;
      }
    }
  } else {
    car.blockedT = 0;
  }
  car.speed = approach(car.speed, want, spec.accel * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  collideCarBody(world, car);
}

function currentDir(car) {
  return { x: Math.round(Math.cos(car.angle)), y: Math.round(Math.sin(car.angle)) };
}

function laneAim(world, car) {
  // The lane point at the target intersection, offset right of travel.
  const gx = world.roadVX[car.ix];
  const gy = world.roadHY[car.iy];
  const dir = currentDir(car);
  const off = 13;
  return { x: gx + (dir.y !== 0 ? -dir.y * off : 0), y: gy + (dir.x !== 0 ? dir.x * off : 0) };
}

export function turnToward(angle, desired, maxTurn) {
  let diff = desired - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > maxTurn) return angle + maxTurn;
  if (diff < -maxTurn) return angle - maxTurn;
  return desired;
}

export function approach(value, target, maxDelta) {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}

// Arcade driving for the player (and the base of police movement).
// ctl: { throttle: -1..1, steer: -1..1 }
export function stepDrivenCar(world, car, ctl, dt) {
  const spec = CAR_TYPES[car.type];
  const healthFactor = car.health <= 25 ? 0.55 : 1;
  if (ctl.throttle > 0) {
    car.speed += spec.accel * healthFactor * dt;
  } else if (ctl.throttle < 0) {
    car.speed -= (car.speed > 4 ? 260 : 95) * dt;
  }
  // Rolling drag + brakes settle the car.
  car.speed -= car.speed * 0.55 * dt;
  if (!ctl.throttle) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = Math.max(-spec.maxSpeed * 0.32, Math.min(spec.maxSpeed * healthFactor, car.speed));

  const steerAuthority = 0.3 + 0.7 * Math.min(1, Math.abs(car.speed) / 60);
  car.angle += ctl.steer * 2.5 * steerAuthority * dt * (car.speed < 0 ? -1 : 1);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const before = Math.abs(car.speed);
  if (collideCarBody(world, car)) {
    if (before > 90) car.impact = before; // main reads this for damage/sound/crime
    car.speed = -car.speed * 0.22;
  }
}

// Pairwise car-vs-car bumps, using the two-circle body model. Returns a list
// of crash events for main to turn into damage, sound and (when the player
// is involved and it was witnessed) heat.
export function resolveCarCollisions(cars) {
  const events = [];
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.dead) continue;
      if (Math.abs(a.x - b.x) > 90 || Math.abs(a.y - b.y) > 90) continue;
      const aMovable = !a.parked || !!a.driver;
      const bMovable = !b.parked || !!b.driver;
      let worstClosing = 0;
      let touched = false;
      for (const ca of carCircles(a)) {
        for (const cb of carCircles(b)) {
          const dx = cb.x - ca.x, dy = cb.y - ca.y;
          const minDist = ca.r + cb.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minDist * minDist || d2 === 0) continue;
          touched = true;
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          const overlap = minDist - d;
          if (aMovable && bMovable) {
            a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
            b.x += nx * overlap / 2; b.y += ny * overlap / 2;
          } else if (aMovable) {
            a.x -= nx * overlap; a.y -= ny * overlap;
          } else if (bMovable) {
            b.x += nx * overlap; b.y += ny * overlap;
          }
          const closing = Math.abs((a.speed * Math.cos(a.angle) - b.speed * Math.cos(b.angle)) * nx + (a.speed * Math.sin(a.angle) - b.speed * Math.sin(b.angle)) * ny);
          worstClosing = Math.max(worstClosing, closing);
        }
      }
      if (!touched) continue;
      if (worstClosing > 55) {
        const dmg = (worstClosing - 45) * 0.16;
        a.health -= dmg;
        b.health -= dmg;
        events.push({ a, b, impact: worstClosing, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
      // Exchange a little momentum so shunts feel physical.
      const avg = (a.speed + b.speed) / 2;
      if (aMovable) a.speed = avg;
      if (bMovable) b.speed = avg;
    }
  }
  return events;
}

// A driverless car that was left rolling coasts to a stop.
export function stepCoastCar(world, car, dt) {
  if (Math.abs(car.speed) < 1) {
    car.speed = 0;
    car.parked = true;
    return;
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (collideCarBody(world, car)) car.speed = -car.speed * 0.2;
  car.speed = approach(car.speed, 0, 320 * dt);
  if (Math.abs(car.speed) < 2) {
    car.speed = 0;
    car.parked = true;
  }
}
