// Palm City Heat — the city of Palm City: generation and spatial queries.
// A grid of city blocks wrapped by roads, five districts (downtown towers,
// commercial strip, suburbs, parks, and a beach that runs into open water on
// the east edge). Generation is driven entirely by the shared seeded RNG, so
// every run with the same seed builds the identical city. This module also
// owns collision (circles vs buildings/water) and road queries used by the
// traffic and police AI.

import { GRID, PITCH, DISTRICT_ROOFS } from './config.js';

export function districtFor(c, r) {
  if (c === GRID.cols - 1) return 'beach';
  if ((c === 4 && r === 2) || (c === 5 && r === 1) || (c === 0 && r === 0)) return 'park';
  if (c >= 2 && c <= 3 && r >= 1 && r <= 3) return 'downtown';
  if (c === 0 || (c === 5 && r >= 3)) return 'suburbs';
  return 'commercial';
}

function blockOrigin(c, r) {
  return { x: c * PITCH + GRID.road, y: r * PITCH + GRID.road };
}

// A named place on the street corner just outside a block — mission
// markers, respawns. (Street corners are always reachable, never inside a
// building footprint.)
function placeAt(c, r, label, dx = -34, dy = -34) {
  const o = blockOrigin(c, r);
  return { x: o.x + dx, y: o.y + dy, label, col: c, row: r };
}

export function buildWorld(rng) {
  const gridW = GRID.cols * PITCH + GRID.road;
  const gridH = GRID.rows * PITCH + GRID.road;
  const beachW = 150;
  const waterW = 280;
  const world = {
    W: gridW + beachW + waterW,
    H: gridH,
    gridW,
    beachX: gridW,
    waterX: gridW + beachW,
    roadVX: [],
    roadHY: [],
    blocks: [],
    buildings: [],
    trees: [],
    lamps: [],
    ponds: [],
    waterRects: [{ x: gridW + beachW, y: 0, w: waterW, h: gridH }],
    locations: {},
  };

  for (let i = 0; i <= GRID.cols; i++) world.roadVX.push(i * PITCH + GRID.road / 2);
  for (let j = 0; j <= GRID.rows; j++) world.roadHY.push(j * PITCH + GRID.road / 2);

  // Street lamps on intersection corners.
  for (const x of world.roadVX) {
    for (const y of world.roadHY) {
      world.lamps.push({ x: x - GRID.road / 2 + 8, y: y - GRID.road / 2 + 8 });
      world.lamps.push({ x: x + GRID.road / 2 - 8, y: y + GRID.road / 2 - 8 });
    }
  }

  for (let c = 0; c < GRID.cols; c++) {
    for (let r = 0; r < GRID.rows; r++) {
      const district = districtFor(c, r);
      const o = blockOrigin(c, r);
      const block = { c, r, district, x: o.x, y: o.y, w: GRID.block, h: GRID.block };
      block.ground = district === 'park' || district === 'suburbs' ? 'grass' : district === 'beach' ? 'sand' : 'paved';
      world.blocks.push(block);
      fillBlock(world, block, rng);
    }
  }

  world.locations = {
    motel: placeAt(4, 3, 'Neon Palms Motel'),
    warehouse: placeAt(1, 4, 'Harborline Warehouse'),
    garage: placeAt(0, 2, "Rudy's Chop Garage"),
    safehouse: placeAt(5, 4, 'Marina Safehouse'),
    hospital: placeAt(2, 0, 'Palm City General'),
    station: placeAt(3, 3, 'PCPD Central'),
    pier: { x: gridW + 60, y: 4 * PITCH + GRID.road + 120, label: 'The Old Pier', col: 6, row: 4 },
  };
  world.spawn = { x: world.locations.motel.x - 70, y: world.locations.motel.y + 30 };
  return world;
}

function addBuilding(world, block, x, y, w, h, rng, name = null) {
  const roofs = DISTRICT_ROOFS[block.district];
  const color = roofs.length ? roofs[Math.floor(rng.next() * roofs.length)] : '#a56643';
  world.buildings.push({
    x, y, w, h, color,
    district: block.district,
    floors: block.district === 'downtown' ? 8 + Math.floor(rng.next() * 8) : block.district === 'commercial' ? 2 + Math.floor(rng.next() * 3) : 1,
    name,
  });
}

function fillBlock(world, block, rng) {
  const { x, y } = block;
  const B = GRID.block;
  const M = 20; // sidewalk margin: buildings never touch the block edge
  if (block.district === 'downtown') {
    const w = B / 2 - M - 8;
    for (const [dx, dy] of [[M, M], [B / 2 + 8, M], [M, B / 2 + 8], [B / 2 + 8, B / 2 + 8]]) {
      addBuilding(world, block, x + dx, y + dy, w, w, rng);
    }
  } else if (block.district === 'commercial') {
    addBuilding(world, block, x + M, y + M, B - 2 * M, 74, rng);
    addBuilding(world, block, x + M, y + M + 96, 96, B - M - 96 - M, rng);
    addBuilding(world, block, x + M + 118, y + M + 96, B - M - 118 - M, B - M - 96 - M, rng);
    if (rng.chance(0.7)) world.trees.push({ x: x + B - 26, y: y + B - 26, r: 11, kind: 'shade' });
  } else if (block.district === 'suburbs') {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        addBuilding(world, block, x + M + i * 78, y + M + j * 118, 56, 44, rng);
      }
    }
    world.trees.push({ x: x + B - 30, y: y + 40, r: 12, kind: 'shade' });
    world.trees.push({ x: x + 34, y: y + B - 34, r: 12, kind: 'shade' });
  } else if (block.district === 'park') {
    const pond = { x: x + B / 2, y: y + B / 2, r: 42 };
    world.ponds.push(pond);
    for (let i = 0; i < 15; i++) {
      const tx = x + 24 + rng.next() * (B - 48);
      const ty = y + 24 + rng.next() * (B - 48);
      if (Math.hypot(tx - pond.x, ty - pond.y) < pond.r + 22) continue;
      world.trees.push({ x: tx, y: ty, r: 10 + rng.next() * 6, kind: 'shade' });
    }
  } else if (block.district === 'beach') {
    for (let i = 0; i < 5; i++) {
      world.trees.push({ x: x + 30 + rng.next() * (B - 60), y: y + 26 + i * 48 + rng.next() * 18, r: 12, kind: 'palm' });
    }
  }
}

// Resolve a circle against buildings, ponds, water and the world bounds.
// Returns the corrected position and whether anything was hit.
export function collideCircle(world, x, y, r) {
  let hit = false;
  if (x < r) { x = r; hit = true; }
  if (y < r) { y = r; hit = true; }
  if (x > world.W - r) { x = world.W - r; hit = true; }
  if (y > world.H - r) { y = world.H - r; hit = true; }

  for (const b of world.buildings) {
    if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    let dx = x - nx;
    let dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 > r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      y = ny + (dy / d) * r;
    } else {
      // Centre inside the rect: push out along the shallowest side.
      const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bot = b.y + b.h - y;
      const m = Math.min(left, right, top, bot);
      if (m === left) x = b.x - r;
      else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r;
      else y = b.y + b.h + r;
    }
  }

  for (const w of world.waterRects) {
    if (x > w.x - r && x < w.x + w.w + r && y > w.y - r && y < w.y + w.h + r) {
      x = w.x - r;
      hit = true;
    }
  }
  for (const p of world.ponds) {
    const dx = x - p.x, dy = y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < p.r + r && d > 0.001) {
      x = p.x + (dx / d) * (p.r + r);
      y = p.y + (dy / d) * (p.r + r);
      hit = true;
    }
  }
  return { x, y, hit };
}

export function isOnRoad(world, x, y) {
  if (x >= world.waterX) return false;
  const mx = x % PITCH;
  const my = y % PITCH;
  return mx < GRID.road || my < GRID.road;
}

export function districtAt(world, x, y) {
  if (x >= world.waterX) return 'water';
  if (x >= world.beachX) return 'beach';
  const c = Math.min(GRID.cols - 1, Math.floor(x / PITCH));
  const r = Math.min(GRID.rows - 1, Math.floor(y / PITCH));
  if (x % PITCH < GRID.road || y % PITCH < GRID.road) return 'street';
  return districtFor(c, r);
}

// Nearest intersection of the road grid — where police enter the world and
// where traffic cars aim.
export function nearestIntersection(world, x, y) {
  let bx = world.roadVX[0], by = world.roadHY[0], bd = Infinity;
  for (const ix of world.roadVX) {
    for (const iy of world.roadHY) {
      const d = (ix - x) * (ix - x) + (iy - y) * (iy - y);
      if (d < bd) { bd = d; bx = ix; by = iy; }
    }
  }
  return { x: bx, y: by };
}

// Intersections roughly `dist` away from a point (police spawn ring).
export function spawnIntersection(world, x, y, dist, rng) {
  const options = [];
  for (const ix of world.roadVX) {
    for (const iy of world.roadHY) {
      const d = Math.hypot(ix - x, iy - y);
      if (d > dist * 0.75 && d < dist * 1.35) options.push({ x: ix, y: iy });
    }
  }
  if (!options.length) return nearestIntersection(world, x, y);
  return options[Math.floor(rng.next() * options.length)];
}
