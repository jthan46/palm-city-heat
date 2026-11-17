// Palm City Heat — fists, pistol, bullets, particles and pickups.
// Combat is deliberately light: a short-range melee swing and a mouse-aimed
// pistol with scarce ammo. Every violent act asks the witness system whether
// anyone saw it before it adds heat. Noise (gunshots, crashes) also scares
// pedestrians through the danger list main builds each step.

import { PLAYER, CRIME_HEAT } from './config.js';
import { knockDown } from './peds.js';

export function pointBlocked(world, x, y) {
  for (const b of world.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  for (const w of world.waterRects) {
    if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  }
  return false;
}

export function spawnParticles(state, x, y, n, color, speed = 90, life = 0.45, size = 3) {
  for (let i = 0; i < n; i++) {
    const a = state.rng.angle();
    const s = speed * (0.3 + state.rng.next() * 0.7);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.5 + state.rng.next() * 0.5), maxLife: life,
      color, size,
    });
  }
}

export function addFloater(state, x, y, text, color = '#ffd23e') {
  state.floaters.push({ x, y, text, color, t: 0, life: 1.4 });
}

export function dropPickup(state, kind, x, y, amount = 0) {
  state.pickups.push({ kind, x, y, amount, t: 0 });
}

// --- player attacks -------------------------------------------------------

export function playerMelee(state) {
  const p = state.player;
  p.swingT = 0.22;
  state.sounds.push('melee');
  const fx = p.x + Math.cos(p.angle) * PLAYER.meleeRange;
  const fy = p.y + Math.sin(p.angle) * PLAYER.meleeRange;
  let hitSomething = false;
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - fx, ped.y - fy) < 20) {
      knockDown(ped);
      spawnParticles(state, ped.x, ped.y, 6, '#d8cfc0', 70, 0.35);
      dropPickup(state, 'cash', ped.x, ped.y, 5 + Math.floor(state.rng.next() * 20));
      state.reportCrime('melee', ped.x, ped.y);
      hitSomething = true;
    }
  }
  for (const car of state.cars) {
    if (car.dead) continue;
    if (Math.hypot(car.x - fx, car.y - fy) < 30) {
      car.health -= 6;
      spawnParticles(state, fx, fy, 5, '#ffd23e', 80, 0.3);
      hitSomething = true;
    }
  }
  if (!hitSomething) {
    // Whiffed swing still startles anyone close.
    for (const ped of state.peds) {
      if (ped.state !== 'down' && Math.hypot(ped.x - p.x, ped.y - p.y) < 60) {
        state.scareAt(ped, p.x, p.y);
      }
    }
  }
}

export function playerShoot(state, angle) {
  const p = state.player;
  if (p.ammo <= 0) {
    state.sounds.push('empty');
    return;
  }
  p.ammo -= 1;
  p.muzzleT = 0.06;
  state.sounds.push('shot');
  const bx = p.x + Math.cos(angle) * 16;
  const by = p.y + Math.sin(angle) * 16;
  state.bullets.push({ x: bx, y: by, vx: Math.cos(angle) * 780, vy: Math.sin(angle) * 780, life: 0.85 });
  spawnParticles(state, bx, by, 3, '#ffe9a0', 60, 0.12, 2);
  // Gunfire is loud: peds scatter and anyone in earshot counts as a witness.
  state.noise.push({ x: p.x, y: p.y, r: 175, ttl: 0.4 });
  state.reportCrime('gunshot', p.x, p.y);
}

// --- per-step updates -----------------------------------------------------

export function stepBullets(state, dt) {
  const world = state.world;
  for (const b of state.bullets) {
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0) continue;
    if (pointBlocked(world, b.x, b.y)) {
      spawnParticles(state, b.x, b.y, 4, '#ffd23e', 70, 0.25, 2);
      b.life = 0;
      continue;
    }
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - b.x, ped.y - b.y) < 9) {
        knockDown(ped);
        spawnParticles(state, ped.x, ped.y, 8, '#c94f43', 80, 0.4);
        dropPickup(state, 'cash', ped.x, ped.y, 8 + Math.floor(state.rng.next() * 25));
        state.reportCrime('gunshot', ped.x, ped.y);
        b.life = 0;
        break;
      }
    }
    if (b.life <= 0) continue;
    for (const car of state.cars) {
      if (car.dead || car === state.player.inCar) continue;
      if (Math.hypot(car.x - b.x, car.y - b.y) < 24) {
        car.health -= 16;
        spawnParticles(state, b.x, b.y, 5, '#ffd23e', 90, 0.3, 2);
        if (car.driver === 'traffic') state.scareCar(car);
        b.life = 0;
        break;
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
}

export function stepParticles(state, dt) {
  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const f of state.floaters) {
    f.t += dt;
    f.y -= 26 * dt;
  }
  state.floaters = state.floaters.filter((f) => f.t < f.life);
}

export function stepPickups(state, dt) {
  const p = state.player;
  for (const pk of state.pickups) {
    pk.t += dt;
    const reach = p.inCar ? 30 : 20;
    if (Math.hypot(pk.x - p.x, pk.y - p.y) < reach) {
      pk.taken = true;
      if (pk.kind === 'cash') {
        p.cash += pk.amount;
        addFloater(state, p.x, p.y - 18, `+$${pk.amount}`, '#8be08b');
        state.sounds.push('cash');
      } else if (pk.kind === 'ammo') {
        p.ammo += pk.amount;
        addFloater(state, p.x, p.y - 18, `+${pk.amount} ammo`, '#ffe9a0');
        state.sounds.push('pickup');
      } else if (pk.kind === 'health') {
        p.hp = Math.min(100, p.hp + pk.amount);
        addFloater(state, p.x, p.y - 18, `+${pk.amount} HP`, '#8be08b');
        state.sounds.push('pickup');
      }
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken && pk.t < 90);
}

export { CRIME_HEAT };
