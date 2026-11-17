// Palm City Heat — the law.
// One job: heat and wanted stars, witnesses, police spawns, pursuit
// driving and the bust meter. Palm City PD does not forgive, but it does
// eventually get bored.

import { COP, HEAT, WORLD } from './config.js';
import { clamp, dist2, turnToward } from './random.js';
import { collideCircle, laneCoord } from './world.js';
import { createVehicle, damageCar } from './vehicles.js';

// A crime happened at (x, y). It only heats the player up if someone saw it:
// a pedestrian on their feet or a cop within earshot. Either way, people
// nearby scatter.
export function reportCrime(state, kind, x, y) {
  let witnessed = false;
  let near = false;
  for (const p of state.peds) {
    if (p.mode === 'dead' || p.mode === 'down') continue;
    const d2 = dist2(x, y, p.x, p.y);
    if (d2 < HEAT.seenRadius * HEAT.seenRadius) witnessed = true;
    if (d2 < 200 * 200) near = true;
  }
  for (const v of state.vehicles) {
    if (v.kind === 'cop' && !v.wrecked && dist2(x, y, v.x, v.y) < HEAT.seenRadius * HEAT.seenRadius) witnessed = true;
  }
  if (near || witnessed) state.threat = { x, y, t: state.tick };
  if (!witnessed) return false;
  state.heat += HEAT[kind] || 10;
  state.lastCrimeAt = state.tick;
  return true;
}

export function wantedStars(state) {
  if (state.heat <= 0) return 0;
  return Math.min(5, Math.ceil(state.heat / HEAT.perStar));
}

function playerIsSeen(state) {
  const p = state.player;
  for (const v of state.vehicles) {
    if (v.kind === 'cop' && !v.wrecked && dist2(p.x, p.y, v.x, v.y) < 470 * 470) return true;
  }
  return false;
}

export function stepWanted(state) {
  state.wanted = wantedStars(state);
  const seen = playerIsSeen(state);
  state.playerSeen = seen;
  if (!seen && state.tick - state.lastCrimeAt > 200) {
    state.heat = Math.max(0, state.heat - HEAT.decay);
  }
  if (state.wanted === 0) state.bust = 0;
}

function spawnCop(state) {
  const rng = state.rng;
  const p = state.player;
  for (let tries = 0; tries < 10; tries++) {
    const vertical = rng.chance(0.5);
    let x, y, axis, centre, dir;
    if (vertical) {
      centre = rng.pick(WORLD.vRoads);
      dir = rng.sign();
      x = laneCoord('v', centre, dir);
      y = clamp(p.y + rng.sign() * rng.float(480, 720), 60, WORLD.h - 200);
      axis = 'v';
    } else {
      centre = rng.pick(WORLD.hRoads);
      dir = rng.sign();
      y = laneCoord('h', centre, dir);
      x = clamp(p.x + rng.sign() * rng.float(480, 720), 60, WORLD.w - 60);
      axis = 'h';
    }
    if (dist2(x, y, p.x, p.y) < 420 * 420) continue;
    const v = createVehicle(state, { x, y, kind: 'cop', driver: 'cop', axis, centre, dir, model: 1 });
    v.speed = 3;
    return v;
  }
  return null;
}

export function maintainPolice(state) {
  const cops = state.vehicles.filter((v) => v.kind === 'cop' && v.driver === 'cop' && !v.wrecked);
  const desired = state.wanted === 0 ? 0 : Math.min(COP.maxUnits, state.wanted + 1);
  if (state.wanted === 0) {
    // Heat's off: the law peels away and becomes ordinary traffic.
    for (const v of cops) {
      v.kind = 'car';
      v.driver = 'traffic';
      v.color = '#95a5a6';
      const nearestV = WORLD.vRoads.reduce((a, b) => (Math.abs(b - v.x) < Math.abs(a - v.x) ? b : a));
      v.axis = 'v';
      v.centre = nearestV;
      v.dir = v.y < state.player.y ? 1 : -1;
    }
    return;
  }
  if (cops.length < desired && state.tick - state.lastCopSpawn > COP.spawnGap) {
    if (spawnCop(state)) state.lastCopSpawn = state.tick;
  }
}

export function stepCop(state, v) {
  const p = state.player;
  const target = p.inCar ? state.vehicles.find((c) => c.id === p.inCar) : p;
  const tx = target ? target.x : p.x;
  const ty = target ? target.y : p.y;
  // Aim a little ahead of a moving target — they cut corners like they mean it.
  const lead = clamp(Math.hypot(tx - v.x, ty - v.y) / 60, 0, 14);
  const aimX = tx + (target && target.speed ? Math.cos(target.angle) * target.speed * lead : 0);
  const aimY = ty + (target && target.speed ? Math.sin(target.angle) * target.speed * lead : 0);
  const desired = Math.atan2(aimY - v.y, aimX - v.x);
  v.angle = turnToward(v.angle, desired, 0.055);
  const d = Math.hypot(tx - v.x, ty - v.y);
  const targetSpeed = d > 130 ? COP.speed : d > 55 ? COP.speed * 0.55 : COP.speed * 0.25;
  v.speed += clamp(targetSpeed - v.speed, -0.2, 0.1);
  v.x += Math.cos(v.angle) * v.speed;
  v.y += Math.sin(v.angle) * v.speed;
  const res = collideCircle(state.city, v.x, v.y, 17);
  if (res.hit) {
    v.x = res.x;
    v.y = res.y;
    if (Math.abs(v.speed) > 2.4) damageCar(state, v, 3, v.x, v.y);
    v.speed *= 0.4;
    v.angle += 0.4; // scrape along and come back for another go
  }
  // Ramming the player's car trades damage both ways.
  if (p.inCar) {
    const pv = state.vehicles.find((c) => c.id === p.inCar);
    if (pv && dist2(v.x, v.y, pv.x, pv.y) < 38 * 38 && state.tick - (v.lastHitAt || -99) > 40) {
      v.lastHitAt = state.tick;
      const impact = Math.abs(v.speed) + Math.abs(pv.speed);
      if (impact > 2.5) {
        damageCar(state, pv, impact * 1.6, pv.x, pv.y);
        damageCar(state, v, impact * 1.2, v.x, v.y);
        state.audio.crash(Math.min(1, impact / 8));
        state.shake = Math.min(10, impact);
      }
      v.speed *= 0.45;
    }
  }
  if (state.tick % 30 === 0) state.audio.siren(state.tick);
}

// The bust meter: close cops + a slow player = hands up.
export function stepBust(state) {
  if (state.wanted === 0) { state.bust = 0; return false; }
  const p = state.player;
  let near = false;
  for (const v of state.vehicles) {
    if (v.kind === 'cop' && v.driver === 'cop' && !v.wrecked && dist2(p.x, p.y, v.x, v.y) < COP.bustRange * COP.bustRange) near = true;
  }
  const slow = p.inCar
    ? Math.abs((state.vehicles.find((c) => c.id === p.inCar) || { speed: 0 }).speed) < 0.9
    : state.playerSpeed < 0.4;
  if (near && slow) state.bust = Math.min(100, state.bust + COP.bustFill);
  else state.bust = Math.max(0, state.bust - COP.bustDrain);
  return state.bust >= 100;
}
