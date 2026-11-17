// combat.js — fists and the pistol: bullets, melee swings, muzzle flash,
// hit sparks, and the cash/ammo/health pickups that drop in the street.
// One job: violence and its loot — everything that hurts or heals.

import { PLAYER } from './config.js';
import { buildingAt, dist } from './world.js';
import { damagePed, scarePeds } from './peds.js';
import { damageCar } from './vehicles.js';
import { commitCrime } from './police.js';

export const FIRE_COOLDOWN = 0.21;
export const BULLET_SPEED = 880;

// Try to fire the player's pistol toward a world point. Returns true if a
// round actually left the barrel.
export function tryShoot(game, tx, ty) {
  const p = game.player;
  if (p.inCar || p.ammo <= 0 || game.time - (p.lastShot || -1) < FIRE_COOLDOWN) return false;
  p.lastShot = game.time;
  p.ammo -= 1;
  const angle = Math.atan2(ty - p.y, tx - p.x);
  p.angle = angle;
  game.bullets.push({
    x: p.x + Math.cos(angle) * 14,
    y: p.y + Math.sin(angle) * 14,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    life: 0.55,
  });
  game.spawnParticles(p.x + Math.cos(angle) * 18, p.y + Math.sin(angle) * 18, 3, '#ffd94d', 60);
  game.lastShotAt = game.time;
  game.lastShotX = p.x;
  game.lastShotY = p.y;
  game.audio.gunshot();
  commitCrime(game, 'shotFired', p.x, p.y);
  scarePeds(game, p.x, p.y, 250);
  return true;
}

// A melee swing in the direction the player faces.
export function meleeSwing(game) {
  const p = game.player;
  if (p.inCar || game.time - (p.lastMelee || -1) < 0.34) return;
  p.lastMelee = game.time;
  game.audio.melee();
  const fx = Math.cos(p.angle);
  const fy = Math.sin(p.angle);
  for (const ped of game.peds) {
    if (ped.dead) continue;
    const dx = ped.x - p.x;
    const dy = ped.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < PLAYER.meleeRange + 8 && dx * fx + dy * fy > 0) {
      const killed = damagePed(game, ped, PLAYER.meleeDamage, 'melee');
      commitCrime(game, killed ? 'pedDown' : 'meleeHit', ped.x, ped.y);
      game.spawnParticles(ped.x, ped.y, 5, '#e8e4da', 50);
    }
  }
  for (const car of game.cars) {
    if (car.dead) continue;
    if (dist(p.x, p.y, car.x, car.y) < PLAYER.meleeRange + 16) {
      damageCar(game, car, 4);
      game.spawnParticles(car.x, car.y, 3, '#ffd94d', 40);
    }
  }
}

export function updateBullets(game, dt) {
  const keep = [];
  for (const b of game.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (buildingAt(game.world, b.x, b.y, 0)) {
      game.spawnParticles(b.x, b.y, 3, '#ffca7a', 45);
      continue;
    }
    let consumed = false;
    for (const ped of game.peds) {
      if (ped.dead) continue;
      if (Math.hypot(ped.x - b.x, ped.y - b.y) < 11) {
        const killed = damagePed(game, ped, 34, 'shot');
        commitCrime(game, killed ? 'pedDown' : 'meleeHit', ped.x, ped.y);
        consumed = true;
        break;
      }
    }
    if (consumed) continue;
    for (const car of game.cars) {
      if (car.dead) continue;
      if (Math.hypot(car.x - b.x, car.y - b.y) < 21) {
        damageCar(game, car, 9);
        game.spawnParticles(b.x, b.y, 4, '#ffd94d', 55);
        consumed = true;
        break;
      }
    }
    if (!consumed) keep.push(b);
  }
  game.bullets = keep;
}

// Static pickups placed around the city's useful corners.
export function placeWorldPickups(game) {
  const spots = [
    { poi: 'garage', kind: 'ammo', amount: 18 },
    { poi: 'hotel', kind: 'ammo', amount: 12 },
    { poi: 'hospital', kind: 'health', amount: 45 },
    { poi: 'motel', kind: 'health', amount: 30 },
    { poi: 'pavilion', kind: 'ammo', amount: 12 },
  ];
  for (const s of spots) {
    const poi = game.world.pois.find((p) => p.id === s.poi);
    if (poi) {
      game.pickups.push({
        x: poi.x + 26, y: poi.y + 30, homeX: poi.x + 26, homeY: poi.y + 30,
        kind: s.kind, amount: s.amount, bob: 0, permanent: true,
      });
    }
  }
}

export function updatePickups(game, dt) {
  const p = game.player;
  for (const pk of game.pickups) {
    pk.bob += dt * 3;
    if (p.inCar) continue;
    if (dist(p.x, p.y, pk.x, pk.y) < 21) {
      if (pk.kind === 'cash') {
        p.cash += pk.amount;
        game.addFloater(pk.x, pk.y - 14, '+$' + pk.amount, '#7fe08a');
        game.audio.cash();
        pk.taken = true;
      } else if (pk.kind === 'ammo') {
        p.ammo += pk.amount;
        game.addFloater(pk.x, pk.y - 14, '+' + pk.amount + ' AMMO', '#ffd94d');
        game.audio.pickup();
        pk.taken = true;
      } else if (pk.kind === 'health' && p.hp < 100) {
        p.hp = Math.min(100, p.hp + pk.amount);
        game.addFloater(pk.x, pk.y - 14, '+' + pk.amount + ' HP', '#7fe08a');
        game.audio.pickup();
        pk.taken = true;
      }
      if (pk.taken && pk.permanent) {
        // Useful corners restock after a while.
        pk.respawnAt = game.time + 45;
        pk.x = -9999;
      }
    }
  }
  for (const pk of game.pickups) {
    if (pk.permanent && pk.respawnAt && game.time >= pk.respawnAt) {
      pk.respawnAt = 0;
      pk.taken = false;
      pk.x = pk.homeX;
      pk.y = pk.homeY;
    }
  }
  game.pickups = game.pickups.filter((pk) => !pk.taken || pk.permanent);
}
