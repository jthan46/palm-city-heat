// Palm City Heat — fighting and loot: the pistol and the fist, the bullets they send out,
// the pickups the city and the fallen provide, and the particles and floating text that
// make hits readable.

import { circleBlocked } from './world.js';
import { carRadius } from './vehicles.js';
import { downPed } from './peds.js';
import { reportCrime } from './police.js';

export function spawnPickup(state, kind, x, y, amount = 0) {
  state.pickups.push({ x, y, kind, amount, t: state.rng.range(0, 6) });
}

export function burst(state, x, y, color, n, speed = 90) {
  for (let i = 0; i < n; i += 1) {
    const a = state.rng.range(0, Math.PI * 2);
    const v = state.rng.range(speed * 0.3, speed);
    state.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: state.rng.range(0.2, 0.5), maxLife: 0.5,
      size: state.rng.range(1.5, 3.2), color,
    });
  }
}

export function floatText(state, x, y, str, color = '#ffe9a0') {
  state.texts.push({ x, y, str, color, life: 1.1 });
}

/** Fires the pistol toward the aim point, if there is a round to spare. */
export function tryShoot(state) {
  const p = state.player;
  if (p.car || p.ammo <= 0 || state.time - p.lastShotAt < 0.22) return false;
  p.lastShotAt = state.time;
  p.ammo -= 1;
  const a = Math.atan2(state.aim.y - p.y, state.aim.x - p.x);
  p.angle = a;
  state.bullets.push({
    x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16,
    vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, life: 0.55,
  });
  burst(state, p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20, '#ffd23c', 3, 60);
  state.threat = { x: p.x, y: p.y, t: state.time };
  state.events.push({ type: 'gunshot', x: p.x, y: p.y });
  reportCrime(state, 'shot', p.x, p.y);
  return true;
}

/** A swing of the fist: whoever is close and in front goes down. */
export function tryMelee(state) {
  const p = state.player;
  if (p.car || state.time - p.lastMeleeAt < 0.38) return false;
  p.lastMeleeAt = state.time;
  state.events.push({ type: 'melee', x: p.x, y: p.y });
  for (const ped of state.peds) {
    if (ped.down) continue;
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d > 36) continue;
    const a = Math.atan2(ped.y - p.y, ped.x - p.x);
    let diff = Math.abs(a - p.angle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff < 1.15) {
      downPed(state, ped, 'melee');
      reportCrime(state, 'assault', ped.x, ped.y);
      burst(state, ped.x, ped.y, '#e07a5f', 5, 70);
    }
  }
  return true;
}

function bulletHitsBuilding(state, x, y) {
  return circleBlocked(state.world, x, y, 2);
}

export function updateCombat(state, dt) {
  // Bullets.
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (bulletHitsBuilding(state, b.x, b.y)) {
      b.life = 0;
      burst(state, b.x, b.y, '#d9d3c3', 3, 55);
      continue;
    }
    let consumed = false;
    for (const ped of state.peds) {
      if (ped.down) continue;
      if (Math.hypot(ped.x - b.x, ped.y - b.y) < 11) {
        downPed(state, ped, 'shot');
        reportCrime(state, 'assault', ped.x, ped.y);
        burst(state, ped.x, ped.y, '#c94f4f', 6, 80);
        consumed = true;
        break;
      }
    }
    if (consumed) { b.life = 0; continue; }
    for (const car of state.cars) {
      if (Math.hypot(car.x - b.x, car.y - b.y) < carRadius(car) + 3) {
        car.hp -= 7;
        burst(state, b.x, b.y, '#ffd23c', 4, 70);
        if (car.police) reportCrime(state, 'hitPolice', car.x, car.y);
        b.life = 0;
        break;
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);

  // Standing pickups the city restocks: shells at the gun shop, bandages at the hospital.
  state.pickupTimer -= dt;
  if (state.pickupTimer <= 0) {
    state.pickupTimer = 20;
    const g = state.world.pois.gunshop;
    const h = state.world.pois.hospital;
    if (!state.pickups.some((pk) => pk.kind === 'ammo')) spawnPickup(state, 'ammo', g.x + 18, g.y - 8, 12);
    if (!state.pickups.some((pk) => pk.kind === 'health')) spawnPickup(state, 'health', h.x + 18, h.y - 8, 40);
  }

  // Pickups are collected by walking or driving over them.
  const p = state.player;
  for (const pk of state.pickups) {
    pk.t += dt;
    if (Math.hypot(pk.x - p.x, pk.y - p.y) > 30) continue;
    pk.taken = true;
    if (pk.kind === 'cash') {
      p.cash += pk.amount;
      floatText(state, p.x, p.y - 18, `+$${pk.amount}`, '#9be15d');
      state.events.push({ type: 'pickup', kind: 'cash', x: p.x, y: p.y });
    } else if (pk.kind === 'ammo') {
      p.ammo += pk.amount;
      floatText(state, p.x, p.y - 18, `+${pk.amount} shells`, '#ffd23c');
      state.events.push({ type: 'pickup', kind: 'ammo', x: p.x, y: p.y });
    } else if (pk.kind === 'health') {
      p.hp = Math.min(100, p.hp + pk.amount);
      floatText(state, p.x, p.y - 18, `+${pk.amount} HP`, '#7bdff2');
      state.events.push({ type: 'pickup', kind: 'health', x: p.x, y: p.y });
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken);

  // Particles and floating text drift and fade.
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= (1 - 2.4 * dt);
    pt.vy *= (1 - 2.4 * dt);
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  for (const t of state.texts) {
    t.y -= 26 * dt;
    t.life -= dt;
  }
  state.texts = state.texts.filter((t) => t.life > 0);
}
