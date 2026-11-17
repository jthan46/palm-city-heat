// police.js — the law: the wanted system (heat, stars, witnesses, decay) and
// the Palm City PD pursuit drivers who hunt the player, plus the bust meter.
// One job: crime consequences — being seen, being chased, being caught.

import { WANTED, POLICE_BY_STAR, POLICE_SPEED } from './config.js';
import { roadPointNear, dist } from './world.js';
import { makeCar, stepCarPhysics, POLICE_MODEL } from './vehicles.js';

export function createWanted() {
  return {
    heat: 0,
    stars: 0,
    unseenFor: 0, // seconds since any witness last saw the player
    bust: 0, // 0..1, fills while police pin a slow player
    spawnCooldown: 0,
  };
}

export function starsForHeat(heat) {
  if (heat <= 0) return 0;
  return Math.min(5, Math.ceil(heat / WANTED.heatPerStar));
}

// Is anyone in a position to see a crime at (x, y)?
export function witnessedBy(game, x, y) {
  for (const car of game.cars) {
    if (car.kind === 'police' && !car.dead && dist(x, y, car.x, car.y) < WANTED.policeSight) return true;
  }
  for (const ped of game.peds) {
    if (!ped.dead && ped.state !== 'down' && dist(x, y, ped.x, ped.y) < WANTED.pedSight) return true;
  }
  return false;
}

// Report a crime. Adds heat only when witnessed (or when the police are
// already watching the player). Returns true when it raised the heat.
export function commitCrime(game, kind, x, y) {
  const w = game.wanted;
  const seen = witnessedBy(game, x, y) || (w.stars > 0 && witnessedBy(game, game.player.x, game.player.y));
  if (!seen) return false;
  w.heat = Math.min(WANTED.maxHeat, w.heat + (WANTED.crimes[kind] || 10));
  w.stars = starsForHeat(w.heat);
  w.unseenFor = 0;
  return true;
}

export function setHeat(game, heat) {
  const w = game.wanted;
  w.heat = Math.max(0, Math.min(WANTED.maxHeat, heat));
  w.stars = starsForHeat(w.heat);
  w.unseenFor = 0;
}

export function clearHeat(game) {
  game.wanted.heat = 0;
  game.wanted.stars = 0;
  game.wanted.bust = 0;
  game.wanted.unseenFor = 0;
}

function playerObserved(game) {
  const p = game.player;
  for (const car of game.cars) {
    if (car.kind === 'police' && !car.dead && dist(p.x, p.y, car.x, car.y) < WANTED.policeSight) return true;
  }
  for (const ped of game.peds) {
    if (!ped.dead && ped.state !== 'down' && dist(p.x, p.y, ped.x, ped.y) < 170) return true;
  }
  return false;
}

export function updateWanted(game, dt) {
  const w = game.wanted;
  if (playerObserved(game)) {
    w.unseenFor = 0;
  } else {
    w.unseenFor += dt;
    if (w.unseenFor > WANTED.decayDelay && w.heat > 0) {
      w.heat = Math.max(0, w.heat - WANTED.decayRate * dt);
      w.stars = starsForHeat(w.heat);
    }
  }
  // Bust meter: a bust needs the player pinned — an interceptor right on
  // top of them and the player nearly stopped, held for a few seconds.
  // Pausing in traffic behind a tailing cop is not a bust.
  const p = game.player;
  let nearest = Infinity;
  for (const car of game.cars) {
    if (car.kind === 'police' && !car.dead) {
      nearest = Math.min(nearest, dist(p.x, p.y, car.x, car.y));
    }
  }
  if (w.stars > 0 && nearest < 85 && p.speedMag < 30) {
    w.bust = Math.min(1, w.bust + dt / 3.0);
  } else {
    w.bust = Math.max(0, w.bust - dt * 0.7);
  }
}

// --- pursuit ---------------------------------------------------------------

function spawnPolice(game) {
  const p = game.player;
  const spot = roadPointNear(game.rng, p.x, p.y, game.rng.range(680, 860));
  const car = makeCar(game.rng, spot.x, spot.y, 'police');
  car.model = { ...POLICE_MODEL, topSpeed: POLICE_SPEED[Math.max(1, game.wanted.stars)] };
  car.angle = Math.atan2(p.y - spot.y, p.x - spot.x);
  car.stuckFor = 0;
  game.cars.push(car);
  return car;
}

export function policeCount(game) {
  return game.cars.filter((c) => c.kind === 'police' && !c.dead).length;
}

export function updatePolice(game, dt) {
  const w = game.wanted;
  const p = game.player;
  w.spawnCooldown -= dt;
  const want = POLICE_BY_STAR[w.stars];
  const have = policeCount(game);
  if (w.stars > 0 && have < want && w.spawnCooldown <= 0) {
    spawnPolice(game);
    w.spawnCooldown = 1.1;
  }
  // Despawn far units when the heat is off or they are lost.
  game.cars = game.cars.filter((car) => {
    if (car.kind !== 'police') return true;
    const d = dist(p.x, p.y, car.x, car.y);
    if (w.stars === 0 && d > 700) return false;
    if (d > 2000) return false;
    return true;
  });

  for (const car of game.cars) {
    if (car.kind !== 'police' || car.dead) continue;
    // Aim at where the player is heading, not just where they are.
    const lead = p.inCar ? 0.45 : 0.15;
    const tx = p.x + p.vx * lead;
    const ty = p.y + p.vy * lead;
    const wantAngle = Math.atan2(ty - car.y, tx - car.x);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const d = dist(car.x, car.y, p.x, p.y);
    let throttle = 1;
    let steer = Math.max(-1, Math.min(1, diff * 2.4));
    if (Math.abs(diff) > 2.2 && d < 130) {
      throttle = -0.7; // nose is wrong and close: back up and swing round
      steer = -steer;
    } else if (d < 52 && p.speedMag < 40) {
      throttle = 0.25; // pin the player, don't plough through them
    }
    const impact = stepCarPhysics(game, car, throttle, steer, 0, dt);
    if (impact > 130) game.onPoliceCrash(car, impact);
    // Stuck detection: a wedged unit is quietly replaced by a fresh one.
    if (Math.abs(car.speed) < 8 && d > 90) {
      car.stuckFor = (car.stuckFor || 0) + dt;
      if (car.stuckFor > 3) {
        const spot = roadPointNear(game.rng, p.x, p.y, game.rng.range(640, 820));
        car.x = spot.x;
        car.y = spot.y;
        car.angle = Math.atan2(p.y - spot.y, p.x - spot.x);
        car.speed = 0;
        car.stuckFor = 0;
      }
    } else {
      car.stuckFor = 0;
    }
  }
}

export function anyPoliceNear(game, radius) {
  const p = game.player;
  for (const car of game.cars) {
    if (car.kind === 'police' && !car.dead && dist(p.x, p.y, car.x, car.y) < radius) return true;
  }
  return false;
}
