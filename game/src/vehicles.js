// Palm City Heat — cars: traffic, parked cars and the player's ride.
// One job: vehicle spawning, lane-following traffic AI, arcade driving
// physics and collision damage. Police cars are vehicles too, but their
// brains live in police.js.

import { CAR, WORLD } from './config.js';
import { clamp, dist2, turnToward } from './random.js';
import { collideCircle, laneCoord, randomLanePoint, SAND_Y } from './world.js';

export const CAR_COLORS = ['#e74c3c', '#f39c12', '#ecf0f1', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8', '#95a5a6', '#f1c40f'];
export const CAR_MODELS = [
  { name: 'compact', w: 34, h: 18 },
  { name: 'sedan', w: 40, h: 20 },
  { name: 'taxi', w: 40, h: 20 },
  { name: 'van', w: 46, h: 22 },
  { name: 'coupe', w: 42, h: 19 },
];

export function createVehicle(state, opts) {
  const model = opts.model ?? state.rng.int(0, CAR_MODELS.length - 1);
  const v = {
    id: state.nextId++,
    kind: opts.kind || 'car',
    model,
    x: opts.x, y: opts.y,
    angle: opts.angle ?? 0,
    speed: 0,
    hp: 100,
    wrecked: false,
    color: opts.color || (CAR_MODELS[model].name === 'taxi' ? '#f7b731' : state.rng.pick(CAR_COLORS)),
    driver: opts.driver || 'none', // 'traffic' | 'cop' | 'player' | 'none'
    axis: opts.axis || 'v',
    centre: opts.centre ?? 0,
    dir: opts.dir ?? 1,
    targetSpeed: CAR.trafficSpeed,
    gold: !!opts.gold,
  };
  if (v.gold) v.color = '#ffd23f';
  if (v.kind === 'cop') v.color = '#20242e';
  state.vehicles.push(v);
  return v;
}

function farFromPlayer(state, x, y, d = 620) {
  return dist2(x, y, state.player.x, state.player.y) > d * d;
}

export function spawnParkedCars(state) {
  const { rng, city } = state;
  let placed = 0;
  let guard = 0;
  while (placed < CAR.parkedCount && guard++ < 400) {
    let x, y, angle;
    if (rng.chance(0.5)) {
      const cx = rng.pick(WORLD.vRoads);
      const side = rng.sign();
      x = cx + side * (WORLD.roadW / 2 - 8);
      y = rng.float(80, SAND_Y - 80);
      angle = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      if (WORLD.hRoads.some((hy) => Math.abs(y - hy) < WORLD.roadW / 2 + 26)) continue;
    } else {
      const cy = rng.pick(WORLD.hRoads);
      const side = rng.sign();
      y = cy + side * (WORLD.roadW / 2 - 8);
      x = rng.float(80, WORLD.w - 80);
      angle = rng.chance(0.5) ? 0 : Math.PI;
      if (WORLD.vRoads.some((vx) => Math.abs(x - vx) < WORLD.roadW / 2 + 26)) continue;
    }
    if (state.vehicles.some((v) => dist2(x, y, v.x, v.y) < 52 * 52)) continue;
    createVehicle(state, { x, y, angle, driver: 'none' });
    placed++;
  }
  void city;
}

export function spawnTrafficCar(state, anywhere = false) {
  const p = randomLanePoint(state.rng);
  if (!anywhere && !farFromPlayer(state, p.x, p.y)) return null;
  if (state.vehicles.some((v) => dist2(p.x, p.y, v.x, v.y) < 60 * 60)) return null;
  const angle = p.kind === 'v' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
  const v = createVehicle(state, {
    x: p.x, y: p.y, angle, driver: 'traffic',
    axis: p.kind, centre: p.centre, dir: p.dir,
  });
  v.speed = CAR.trafficSpeed * state.rng.float(0.8, 1.1);
  v.targetSpeed = v.speed;
  return v;
}

export function maintainTraffic(state) {
  const moving = state.vehicles.filter((v) => v.driver === 'traffic' && !v.wrecked).length;
  if (moving < CAR.trafficCount && state.tick % 20 === 0) spawnTrafficCar(state);
  // Cull traffic that wandered far away and is out of the story.
  for (const v of state.vehicles) {
    if (v.driver === 'traffic' && farFromPlayer(state, v.x, v.y, 1500)) v.dead = true;
  }
}

// Is something solid in front of this car, close enough to brake for?
function blockedAhead(state, v, look = 62) {
  const fx = v.x + Math.cos(v.angle) * look;
  const fy = v.y + Math.sin(v.angle) * look;
  for (const o of state.vehicles) {
    if (o === v || o.dead) continue;
    if (dist2(fx, fy, o.x, o.y) < 24 * 24) return true;
  }
  if (state.player.inCar) {
    const pv = state.vehicles.find((c) => c.id === state.player.inCar);
    if (pv && pv !== v && dist2(fx, fy, pv.x, pv.y) < 36 * 36) return true;
  } else if (dist2(fx, fy, state.player.x, state.player.y) < 26 * 26) {
    return true;
  }
  for (const p of state.peds) {
    if (!p.dead && dist2(fx, fy, p.x, p.y) < 26 * 26) return true;
  }
  return false;
}

export function stepTraffic(state, v) {
  const rng = state.rng;
  // Decide turns at intersections: when the cross-axis coordinate passes a crossing road.
  const crossRoads = v.axis === 'v' ? WORLD.hRoads : WORLD.vRoads;
  const along = v.axis === 'v' ? v.y : v.x;
  for (const c of crossRoads) {
    const prev = along - v.dir * v.speed;
    if ((prev - c) * (along - c) <= 0 && Math.abs(along - c) < Math.abs(v.speed) + 2 && v.speed !== 0) {
      if (rng.chance(0.38)) {
        const oldAxis = v.axis;
        v.axis = oldAxis === 'v' ? 'h' : 'v';
        v.centre = c;
        v.dir = rng.sign();
        break;
      }
    }
  }

  const want = blockedAhead(state, v) ? 0 : v.targetSpeed;
  v.speed += clamp(want - v.speed, -0.12, 0.05);

  const heading = v.axis === 'v' ? (v.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (v.dir > 0 ? 0 : Math.PI);
  v.angle = turnToward(v.angle, heading, 0.09);

  if (v.axis === 'v') {
    v.y += v.dir * v.speed;
    const laneX = laneCoord('v', v.centre, v.dir);
    v.x += clamp(laneX - v.x, -1.4, 1.4);
  } else {
    v.x += v.dir * v.speed;
    const laneY = laneCoord('h', v.centre, v.dir);
    v.y += clamp(laneY - v.y, -1.4, 1.4);
  }

  // Road ends: turn around at the water/world edge.
  if (v.y > SAND_Y - 30 && v.axis === 'v' && v.dir > 0) { v.axis = 'h'; v.centre = WORLD.hRoads[WORLD.hRoads.length - 1]; v.dir = rng.sign(); }
  if (v.y < 40 && v.axis === 'v' && v.dir < 0) { v.axis = 'h'; v.centre = WORLD.hRoads[0]; v.dir = rng.sign(); }
  if (v.x > WORLD.w - 40 && v.axis === 'h' && v.dir > 0) { v.axis = 'v'; v.centre = WORLD.vRoads[WORLD.vRoads.length - 1]; v.dir = rng.sign(); }
  if (v.x < 40 && v.axis === 'h' && v.dir < 0) { v.axis = 'v'; v.centre = WORLD.vRoads[0]; v.dir = rng.sign(); }
}

// Player driving: arcade physics, then collision resolution with damage.
export function stepPlayerVehicle(state, v, input) {
  if (input.up) v.speed += CAR.accel;
  else if (input.down) {
    if (v.speed > 0.4) v.speed -= CAR.brake;
    else v.speed -= CAR.reverseAccel;
  } else {
    v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 0.045); // engine drag
  }
  v.speed = clamp(v.speed, -CAR.maxReverse, CAR.maxSpeed);
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  if (steer !== 0 && Math.abs(v.speed) > 0.15) {
    v.angle += steer * CAR.turnRate * clamp(Math.abs(v.speed) / 2.4, 0.3, 1) * Math.sign(v.speed);
    if (Math.abs(v.speed) > 4.6 && state.tick % 9 === 0) state.audio.screech();
  }
  const ox = v.x;
  const oy = v.y;
  v.x += Math.cos(v.angle) * v.speed;
  v.y += Math.sin(v.angle) * v.speed;

  const res = collideCircle(state.city, v.x, v.y, CAR.radius);
  if (res.hit) {
    const impact = Math.abs(v.speed);
    v.x = res.x;
    v.y = res.y;
    if (impact > 1.6) {
      damageCar(state, v, impact * 2.2, v.x, v.y);
      state.audio.crash(Math.min(1, impact / 6));
      if (impact > 3.4) state.reportCrime('hitCar', v.x, v.y); // a scrape is not a crime; a crash is
    }
    v.speed = -v.speed * 0.28;
  }

  // Car-to-car: push apart, trade paint.
  for (const o of state.vehicles) {
    if (o === v || o.dead) continue;
    const d2 = dist2(v.x, v.y, o.x, o.y);
    const min = 27;
    if (d2 < min * min && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = (v.x - o.x) / d;
      const ny = (v.y - o.y) / d;
      v.x += nx * push;
      v.y += ny * push;
      if (o.driver !== 'player') { o.x -= nx * push; o.y -= ny * push; }
      const impact = Math.abs(v.speed);
      if (impact > 2.2 && state.tick - (v.lastHitAt || -99) > 30) {
        v.lastHitAt = state.tick;
        damageCar(state, v, impact * 1.6, v.x, v.y);
        damageCar(state, o, impact * 1.9, o.x, o.y);
        state.audio.crash(Math.min(1, impact / 6));
        state.reportCrime('hitCar', v.x, v.y);
        if (o.driver === 'traffic') { o.driver = 'none'; state.spawnFleeingDriver(o); }
      }
      v.speed *= 0.55;
    }
  }
  void ox; void oy;
  if (Math.abs(v.speed) > 0.4 && state.tick % 8 === 0) state.audio.engine(Math.abs(v.speed) / CAR.maxSpeed, state.tick);
}

export function damageCar(state, v, amount, x, y) {
  if (v.wrecked) return;
  v.hp -= amount;
  state.spawnParticles(x, y, 4, '#ffb347');
  if (v.hp <= 0) {
    v.hp = 0;
    v.wrecked = true;
    v.speed = 0;
    if (v.driver === 'traffic') { v.driver = 'none'; state.spawnFleeingDriver(v); }
    state.spawnParticles(x, y, 16, '#666');
  }
}
