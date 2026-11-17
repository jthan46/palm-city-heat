// peds.js — the people of Palm City: residents who pace the sidewalks block
// by block, cross at corners, and run when the city turns dangerous.
// One job: pedestrian entities — spawning, walking, fleeing, falling.

import { blockPerimeterPoint, blockPerimeterLength, moveCircle, clamp } from './world.js';

const SHIRTS = ['#e86a5a', '#5a8ae8', '#f2d13d', '#7fe08a', '#e8e4da', '#b07fe0', '#3fb8ae', '#f28ab0'];
const SKIN = ['#f2c9a0', '#d9a06b', '#a06a3b', '#7a4a26', '#ffe0bd'];

export function blockAt(world, col, row) {
  if (col < 0 || col > 5 || row < 0 || row > 3) return null;
  return world.blocks[col * 4 + row];
}

// The perimeter parameter t closest to a point beside this block.
export function nearestPerimeterT(block, x, y) {
  const inset = 16;
  const x0 = block.rect.x0 + inset;
  const y0 = block.rect.y0 + inset;
  const x1 = block.rect.x1 - inset;
  const y1 = block.rect.y1 - inset;
  const w = x1 - x0;
  const h = y1 - y0;
  const edges = [
    { d: Math.abs(y - y0), t: clamp(x - x0, 0, w) },
    { d: Math.abs(x - x1), t: w + clamp(y - y0, 0, h) },
    { d: Math.abs(y - y1), t: w + h + clamp(x1 - x, 0, w) },
    { d: Math.abs(x - x0), t: 2 * w + h + clamp(y1 - y, 0, h) },
  ];
  edges.sort((a, b) => a.d - b.d);
  return edges[0].t;
}

export function nearestBlock(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const b of world.blocks) {
    const cx = clamp(x, b.rect.x0, b.rect.x1);
    const cy = clamp(y, b.rect.y0, b.rect.y1);
    const d = Math.hypot(x - cx, y - cy);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function spawnPed(game, x, y, opts = {}) {
  const rng = game.rng;
  const block = nearestBlock(game.world, x, y);
  const ped = {
    x,
    y,
    block,
    t: block ? nearestPerimeterT(block, x, y) : 0,
    dir: rng.sign(),
    speed: rng.range(38, 62),
    state: opts.state || 'walk', // walk | cross | flee | down
    hp: 30,
    dead: false,
    downTimer: 0,
    fleeTimer: 0,
    fleeX: 0,
    fleeY: 0,
    crossX: 0,
    crossY: 0,
    crossBlock: null,
    shirt: rng.pick(SHIRTS),
    skin: rng.pick(SKIN),
    phase: rng.range(0, Math.PI * 2),
    panic: 0,
  };
  game.peds.push(ped);
  return ped;
}

// A threat at (x,y): nearby peds run from it.
export function scarePeds(game, x, y, radius) {
  for (const ped of game.peds) {
    if (ped.dead || ped.state === 'down') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.state = 'flee';
      ped.fleeTimer = game.rng.range(1.6, 3.2);
      ped.fleeX = x;
      ped.fleeY = y;
      ped.panic = 1;
    }
  }
}

function startCrossing(game, ped) {
  const block = ped.block;
  if (!block) return;
  const per = blockPerimeterLength(block);
  const w = block.rect.x1 - block.rect.x0 - 32;
  const h = block.rect.y1 - block.rect.y0 - 32;
  const t = ((ped.t % per) + per) % per;
  let target = null;
  let nextBlock = null;
  if (t < w) {
    nextBlock = blockAt(game.world, block.col, block.row - 1); // north edge → block above
  } else if (t < w + h) {
    nextBlock = blockAt(game.world, block.col + 1, block.row); // east edge
  } else if (t < 2 * w + h) {
    nextBlock = blockAt(game.world, block.col, block.row + 1); // south edge
  } else {
    nextBlock = blockAt(game.world, block.col - 1, block.row); // west edge
  }
  if (!nextBlock) return;
  // Aim for the far sidewalk of the neighbouring block at the same lateral spot.
  const inset = 16;
  if (nextBlock.col === block.col && nextBlock.row === block.row - 1) {
    target = { x: ped.x, y: nextBlock.rect.y1 - inset };
  } else if (nextBlock.col === block.col && nextBlock.row === block.row + 1) {
    target = { x: ped.x, y: nextBlock.rect.y0 + inset };
  } else if (nextBlock.row === block.row && nextBlock.col === block.col + 1) {
    target = { x: nextBlock.rect.x0 + inset, y: ped.y };
  } else {
    target = { x: nextBlock.rect.x1 - inset, y: ped.y };
  }
  ped.state = 'cross';
  ped.crossX = target.x;
  ped.crossY = target.y;
  ped.crossBlock = nextBlock;
}

export function updatePeds(game, dt) {
  const rng = game.rng;
  const player = game.player;
  for (const ped of game.peds) {
    if (ped.dead) continue;
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0 && ped.hp > 0) ped.state = 'flee';
      continue;
    }
    // Danger sense: fast cars and fresh gunfire send people running.
    if (ped.state !== 'flee') {
      let threat = null;
      for (const car of game.cars) {
        if (car.dead) continue;
        if (Math.abs(car.speed) > 190 && Math.hypot(car.x - ped.x, car.y - ped.y) < 95) {
          threat = car;
          break;
        }
      }
      if (!threat && game.lastShotAt && game.time - game.lastShotAt < 0.4) {
        if (Math.hypot(game.lastShotX - ped.x, game.lastShotY - ped.y) < 240) {
          threat = { x: game.lastShotX, y: game.lastShotY };
        }
      }
      if (threat) {
        ped.state = 'flee';
        ped.fleeTimer = rng.range(1.4, 2.6);
        ped.fleeX = threat.x;
        ped.fleeY = threat.y;
      }
    }

    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const dx = ped.x - ped.fleeX;
      const dy = ped.y - ped.fleeY;
      const d = Math.hypot(dx, dy) || 1;
      const run = 148;
      const moved = moveCircle(game.world, ped.x, ped.y, 9, (dx / d) * run * dt, (dy / d) * run * dt);
      ped.x = moved.x;
      ped.y = moved.y;
      ped.phase += dt * 11;
      if (ped.fleeTimer <= 0) {
        ped.state = 'walk';
        ped.block = nearestBlock(game.world, ped.x, ped.y);
        if (ped.block) ped.t = nearestPerimeterT(ped.block, ped.x, ped.y);
      }
      continue;
    }

    if (ped.state === 'cross') {
      const dx = ped.crossX - ped.x;
      const dy = ped.crossY - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 6) {
        ped.block = ped.crossBlock;
        ped.t = nearestPerimeterT(ped.block, ped.x, ped.y);
        ped.state = 'walk';
      } else {
        ped.x += (dx / d) * ped.speed * 1.25 * dt;
        ped.y += (dy / d) * ped.speed * 1.25 * dt;
        ped.phase += dt * 8;
      }
      continue;
    }

    // walk: pace the block perimeter; sometimes cross at a corner.
    if (!ped.block) {
      ped.block = nearestBlock(game.world, ped.x, ped.y);
      if (!ped.block) continue;
      ped.t = nearestPerimeterT(ped.block, ped.x, ped.y);
    }
    ped.t += ped.dir * ped.speed * dt;
    const pos = blockPerimeterPoint(ped.block, ped.t);
    ped.x = pos.x;
    ped.y = pos.y;
    ped.phase += dt * 6;
    if (rng.chance(0.0016)) ped.dir *= -1;
    if (rng.chance(0.0011)) startCrossing(game, ped);
  }
  void player;
}

// Hurt a pedestrian. Returns true if this blow finished them.
export function damagePed(game, ped, amount, cause) {
  if (ped.dead) return false;
  ped.hp -= amount;
  if (ped.hp <= 0) {
    ped.dead = true;
    ped.state = 'down';
    game.spawnParticles(ped.x, ped.y, 8, '#c93b2e', 60);
    if (cause === 'car' || cause === 'shot' || cause === 'melee') {
      if (game.rng.chance(0.55)) {
        game.pickups.push({ x: ped.x, y: ped.y, kind: 'cash', amount: game.rng.int(10, 45), bob: 0 });
      }
    }
    return true;
  }
  ped.state = 'flee';
  ped.fleeTimer = 2.2;
  ped.fleeX = game.player.x;
  ped.fleeY = game.player.y;
  return false;
}

export function knockDownPed(game, ped) {
  if (ped.dead) return;
  ped.state = 'down';
  ped.downTimer = 2.6;
  ped.hp = Math.min(ped.hp, 12);
}
