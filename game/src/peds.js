// Palm City Heat — pedestrians.
// Palm City's citizens stroll the sidewalk ring around their home block,
// cross to neighbouring blocks at corners, and run screaming from danger:
// speeding cars, gunfire, swinging fists. A ped knocked down stays down and
// (if anyone saw it) brings the heat.

import { GRID } from './config.js';
import { collideCircle } from './world.js';

const SHIRTS = ['#e8e3d8', '#c94f43', '#4a7fb5', '#e0a83c', '#7fb069', '#b565a7', '#e07b39', '#5bc0be'];
const PANTS = ['#3a3f4a', '#5d4a36', '#2e4a5a', '#6b6f76'];

export function spawnPeds(world, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const block = world.blocks[Math.floor(rng.next() * world.blocks.length)];
    const corner = Math.floor(rng.next() * 4);
    const pos = ringPoint(block, corner);
    peds.push({
      kind: 'ped',
      x: pos.x, y: pos.y,
      angle: rng.angle(),
      speed: 0,
      walkSpeed: 52 + rng.next() * 26,
      state: 'walk', // 'walk' | 'flee' | 'down'
      block, corner,
      tx: pos.x, ty: pos.y,
      fleeX: 0, fleeY: 0, fleeT: 0,
      downT: 0,
      shirt: SHIRTS[Math.floor(rng.next() * SHIRTS.length)],
      pants: PANTS[Math.floor(rng.next() * PANTS.length)],
      skin: ['#f2c79b', '#c68863', '#8a5a3b', '#6e4530'][Math.floor(rng.next() * 4)],
    });
  }
  return peds;
}

// Points on the sidewalk ring just outside a block's corners.
export function ringPoint(block, corner) {
  const o = 11;
  const B = GRID.block;
  switch (corner & 3) {
    case 0: return { x: block.x - o, y: block.y - o };
    case 1: return { x: block.x + B + o, y: block.y - o };
    case 2: return { x: block.x + B + o, y: block.y + B + o };
    default: return { x: block.x - o, y: block.y + B + o };
  }
}

function pickNextTarget(world, ped, rng) {
  // Mostly walk to the next corner of the home block; sometimes cross the
  // street to the block beyond that corner and adopt it.
  if (rng.chance(0.22)) {
    const here = ringPoint(ped.block, ped.corner);
    let best = null, bd = Infinity;
    for (const b of world.blocks) {
      if (b === ped.block) continue;
      for (let c = 0; c < 4; c++) {
        const p = ringPoint(b, c);
        const d = (p.x - here.x) ** 2 + (p.y - here.y) ** 2;
        if (d < bd) { bd = d; best = { block: b, corner: c, x: p.x, y: p.y }; }
      }
    }
    if (best) {
      ped.block = best.block;
      ped.corner = best.corner;
      ped.tx = best.x;
      ped.ty = best.y;
      return;
    }
  }
  ped.corner = (ped.corner + (rng.chance(0.5) ? 1 : 3)) % 4;
  const p = ringPoint(ped.block, ped.corner);
  ped.tx = p.x;
  ped.ty = p.y;
}

export function scarePed(ped, fromX, fromY, rng) {
  if (ped.state === 'down') return;
  ped.state = 'flee';
  ped.fleeT = 1.6 + rng.next() * 1.4;
  const a = Math.atan2(ped.y - fromY, ped.x - fromX) + rng.range(-0.5, 0.5);
  ped.fleeX = Math.cos(a);
  ped.fleeY = Math.sin(a);
}

// dangers: array of {x, y, r} — anything inside r makes nearby peds run.
export function stepPeds(world, peds, dt, rng, dangers) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.downT += dt;
      continue;
    }
    for (const d of dangers) {
      const dx = ped.x - d.x, dy = ped.y - d.y;
      if (dx * dx + dy * dy < d.r * d.r) {
        if (ped.state !== 'flee') scarePed(ped, d.x, d.y, rng);
        break;
      }
    }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      ped.speed = 168;
      ped.angle = Math.atan2(ped.fleeY, ped.fleeX);
      if (ped.fleeT <= 0) {
        ped.state = 'walk';
        const p = ringPoint(ped.block, ped.corner);
        ped.tx = p.x; ped.ty = p.y;
      }
    } else {
      const dx = ped.tx - ped.x, dy = ped.ty - ped.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) {
        pickNextTarget(world, ped, rng);
      } else {
        ped.angle = Math.atan2(dy, dx);
      }
      ped.speed = ped.walkSpeed;
    }
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    const res = collideCircle(world, ped.x, ped.y, 6);
    ped.x = res.x;
    ped.y = res.y;
    if (res.hit && ped.state === 'flee') {
      // Ran into a wall: slide sideways by flipping flee direction a little.
      ped.fleeX = -ped.fleeY;
      ped.fleeY = Math.cos(ped.angle);
    }
  }
}

export function knockDown(ped) {
  ped.state = 'down';
  ped.speed = 0;
  ped.downT = 0;
}
