// Palm City Heat — fighting.
// One job: fists, the pistol, bullets in flight, and the pickups that fall
// out of the world (cash, ammo, health). Palm City settles things personally.

import { GUN, PLAYER } from './config.js';
import { dist2 } from './random.js';
import { pointInBuilding } from './world.js';
import { hurtPed } from './peds.js';
import { damageCar } from './vehicles.js';

export function playerWeapon(state) {
  return state.player.ammo > 0 ? 'pistol' : 'fists';
}

export function stepCombat(state, input) {
  const p = state.player;
  if (p.attackCd > 0) p.attackCd--;
  state.bullets = state.bullets.filter((b) => stepBullet(state, b));
  stepPickups(state);
  if (p.inCar || state.screen !== 'play' || state.mission.dialogue) return;
  if (!input.attack && !input.attackPressed) return;
  if (p.attackCd > 0) return;

  if (playerWeapon(state) === 'pistol') {
    p.attackCd = GUN.cooldown;
    p.ammo--;
    const a = p.aimAngle;
    state.bullets.push({
      id: state.nextId++,
      x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16,
      vx: Math.cos(a) * GUN.bulletSpeed, vy: Math.sin(a) * GUN.bulletSpeed,
      life: GUN.bulletLife,
    });
    p.muzzleT = state.tick;
    state.threat = { x: p.x, y: p.y, t: state.tick }; // gunfire carries
    state.reportCrime('shotFired', p.x, p.y);
    state.audio.gunshot();
    state.shake = Math.max(state.shake, 1.5);
  } else {
    p.attackCd = PLAYER.meleeCooldown;
    state.audio.melee();
    // Fists find the nearest person inside range, biased toward the aim.
    let best = null;
    let bestD = PLAYER.meleeRange * PLAYER.meleeRange;
    for (const ped of state.peds) {
      if (ped.mode === 'dead') continue;
      const d2 = dist2(p.x, p.y, ped.x, ped.y);
      if (d2 < bestD) { bestD = d2; best = ped; }
    }
    if (best) {
      hurtPed(state, best, PLAYER.meleeDamage, p.x, p.y);
      state.reportCrime('melee', p.x, p.y);
      state.audio.hit();
      state.shake = Math.max(state.shake, 2);
    }
  }
}

function stepBullet(state, b) {
  b.x += b.vx;
  b.y += b.vy;
  b.life--;
  if (b.life <= 0) return false;
  if (pointInBuilding(state.city, b.x, b.y)) {
    state.spawnParticles(b.x, b.y, 2, '#ffd23f');
    return false;
  }
  for (const ped of state.peds) {
    if (ped.mode === 'dead') continue;
    if (dist2(b.x, b.y, ped.x, ped.y) < 14 * 14) {
      hurtPed(state, ped, GUN.damage, b.x - b.vx, b.y - b.vy);
      return false;
    }
  }
  for (const v of state.vehicles) {
    if (v.dead || state.player.inCar === v.id) continue;
    if (dist2(b.x, b.y, v.x, v.y) < 21 * 21) {
      damageCar(state, v, 11, b.x, b.y);
      if (v.kind === 'cop') state.reportCrime('shotFired', b.x, b.y);
      return false;
    }
  }
  return true;
}

function stepPickups(state) {
  const p = state.player;
  for (const pk of state.pickups) {
    pk.t++;
    if (dist2(p.x, p.y, pk.x, pk.y) < 26 * 26) {
      pk.taken = true;
      if (pk.kind === 'cash') {
        p.cash += pk.amount;
        state.addFloater(pk.x, pk.y - 16, `+$${pk.amount}`, '#7be495');
        state.audio.cash();
      } else if (pk.kind === 'ammo') {
        p.ammo += pk.amount;
        state.addFloater(pk.x, pk.y - 16, `+${pk.amount} ammo`, '#ffd23f');
        state.audio.pickup();
      } else if (pk.kind === 'health') {
        p.hp = Math.min(PLAYER.hp, p.hp + pk.amount);
        state.addFloater(pk.x, pk.y - 16, `+${pk.amount} HP`, '#7be495');
        state.audio.pickup();
      }
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken);
}

// Standing pickups the city always offers: shells at the gun shop, bandages
// at the hospital, a bite at the diner. They restock over time.
export function seedPickups(state) {
  const L = state.city.locations;
  const spots = [
    { kind: 'ammo', at: L.gunshop, amount: 18 },
    { kind: 'ammo', at: L.gunshop, amount: 18 },
    { kind: 'health', at: L.hospital, amount: 40 },
    { kind: 'health', at: L.diner, amount: 25 },
  ];
  for (const s of spots) {
    if (!s.at) continue;
    state.pickups.push({ id: state.nextId++, kind: s.kind, x: s.at.x + 18, y: s.at.y + 6, amount: s.amount, t: state.rng.int(0, 60), restock: true });
  }
}

export function restockPickups(state) {
  if (state.tick % 1800 !== 0) return; // every 30 s, top the shelves back up
  const L = state.city.locations;
  const kinds = [['ammo', L.gunshop], ['health', L.hospital]];
  for (const [kind, at] of kinds) {
    if (!at) continue;
    const exists = state.pickups.some((pk) => pk.kind === kind && dist2(pk.x, pk.y, at.x, at.y) < 80 * 80);
    if (!exists) state.pickups.push({ id: state.nextId++, kind, x: at.x + 18, y: at.y + 6, amount: kind === 'ammo' ? 18 : 40, t: 0, restock: true });
  }
}
