// world.js — Palm City itself: the road grid, districts, buildings, beach,
// park, props and points of interest, generated deterministically from a seed.
// One job: describe the static city and answer spatial questions about it
// (collision, road/sidewalk/water tests, spawn points) for every other system.

import { AVENUES, STREETS, ROAD_HALF, WORLD_W, WORLD_H, BUILDING_STYLES, PALETTE } from './config.js';

export const BEACH_X = 4215; // east of the coastal avenue: promenade and sand
export const WATER_X = 4520; // open water beyond the sand

// Block (col,row) spans between avenue col..col+1 and street row..row+1.
export function blockRect(col, row) {
  return {
    x0: AVENUES[col] + ROAD_HALF,
    y0: STREETS[row] + ROAD_HALF,
    x1: AVENUES[col + 1] - ROAD_HALF,
    y1: STREETS[row + 1] - ROAD_HALF,
  };
}

function districtOf(col, row) {
  if (col === 1 && row === 3) return 'park';
  if (col === 5) return 'beach';
  if (col === 0) return 'suburb';
  if (row === 1) return 'commercial';
  if ((col === 2 || col === 3) && row !== 3) return 'downtown';
  return 'midtown';
}

const STYLE_BY_DISTRICT = {
  downtown: 'tower',
  midtown: 'office',
  commercial: 'shop',
  suburb: 'house',
  beach: 'hut',
};

// Named places the story and the HUD care about. The x/y is each place's
// front door: a walkable point on the sidewalk just outside its building
// (col/row/lot ties the name to the building drawn behind the door).
export const POIS = [
  { id: 'motel', name: 'Sunset Palms Motel', x: 518, y: 395, col: 0, row: 0, lot: 0 },
  { id: 'tower', name: 'Coral Tower', x: 1798, y: 395, col: 2, row: 0, lot: 0 },
  { id: 'market', name: 'Mercado Sol', x: 1798, y: 1033, col: 2, row: 1, lot: 0 },
  { id: 'office', name: 'Harbor Tower', x: 2438, y: 1033, col: 3, row: 1, lot: 0 },
  { id: 'hotel', name: 'Hotel Brisa', x: 3718, y: 1033, col: 5, row: 1, lot: 0 },
  { id: 'hospital', name: 'Palmetto General', x: 1798, y: 1673, col: 2, row: 2, lot: 0 },
  { id: 'pd', name: 'Palm City PD', x: 2438, y: 1673, col: 3, row: 2, lot: 0 },
  { id: 'cafe', name: 'Café Brisa', x: 3718, y: 1673, col: 5, row: 2, lot: 0 },
  { id: 'house', name: 'Maple Street House', x: 518, y: 1673, col: 0, row: 2, lot: 0 },
  { id: 'garage', name: 'Andrade Auto', x: 518, y: 2313, col: 0, row: 3, lot: 0 },
  { id: 'pavilion', name: 'Palmetto Park Pavilion', x: 1280, y: 2560, col: 1, row: 3, lot: -1 },
];

export function poiById(world, id) {
  return world.pois.find((p) => p.id === id);
}

export function buildWorld(rng) {
  const world = {
    buildings: [], // {x,y,w,h,style,floors,color,name|null,district}
    trees: [], // {x,y,kind:'shade'|'palm'}
    lamps: [], // {x,y}
    props: [], // {x,y,kind}
    lots: [], // paved parking/plaza rects {x,y,w,h}
    parkedSpots: [], // {x,y,angle}
    blocks: [], // {col,row,rect,district}
    pois: POIS.map((p) => ({ ...p })),
    pond: null,
  };

  // Streetlights at intersection corners.
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      for (const sx of [-1, 1]) {
        for (const sy2 of [-1, 1]) {
          world.lamps.push({ x: ax + sx * (ROAD_HALF + 6), y: sy + sy2 * (ROAD_HALF + 6) });
        }
      }
    }
  }

  for (let col = 0; col < 6; col++) {
    for (let row = 0; row < 4; row++) {
      const rect = blockRect(col, row);
      const district = districtOf(col, row);
      world.blocks.push({ col, row, rect, district });
      if (district === 'park') {
        buildPark(world, rng, rect);
      } else {
        buildBlock(world, rng, rect, district, col, row);
      }
    }
  }

  // Beach: palms along the promenade, umbrellas and huts on the sand.
  for (let y = 140; y < WORLD_H - 100; y += 150) {
    world.trees.push({ x: BEACH_X + 26 + rng.range(-8, 8), y: y + rng.range(-20, 20), kind: 'palm' });
    if (rng.chance(0.6)) world.props.push({ x: rng.range(WATER_X - 190, WATER_X - 60), y: y + rng.range(-30, 30), kind: 'umbrella' });
  }

  return world;
}

function buildPark(world, rng, rect) {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  world.pond = { x: cx + 110, y: cy - 90, r: 62 };
  world.props.push({ x: cx, y: cy, kind: 'pavilion' });
  for (let i = 0; i < 26; i++) {
    const x = rng.range(rect.x0 + 30, rect.x1 - 30);
    const y = rng.range(rect.y0 + 30, rect.y1 - 30);
    if (Math.hypot(x - world.pond.x, y - world.pond.y) < 90) continue;
    if (Math.hypot(x - cx, y - cy) < 60) continue;
    world.trees.push({ x, y, kind: 'shade' });
  }
  for (let i = 0; i < 6; i++) {
    world.props.push({ x: rng.range(rect.x0 + 40, rect.x1 - 40), y: rng.range(rect.y0 + 40, rect.y1 - 40), kind: 'bench' });
  }
}

function buildBlock(world, rng, rect, district, col, row) {
  const style = STYLE_BY_DISTRICT[district];
  const spec = BUILDING_STYLES[style];
  const inset = 36; // sidewalk + setback from the block edge
  const alley = 26;
  const lotW = (rect.x1 - rect.x0 - inset * 2 - alley) / 2;
  const lotH = (rect.y1 - rect.y0 - inset * 2 - alley) / 2;
  for (let lot = 0; lot < 4; lot++) {
    const lx = rect.x0 + inset + (lot % 2) * (lotW + alley);
    const ly = rect.y0 + inset + Math.floor(lot / 2) * (lotH + alley);
    const poi = POIS.find((p) => p.col === col && p.row === row && p.lot === lot);
    // The Hotel Brisa south-east lot is its parking lot (the golden coupe waits there).
    const isHotelLot = col === 5 && row === 1 && lot === 3;
    if (!poi && (isHotelLot || rng.chance(0.14))) {
      world.lots.push({ x: lx, y: ly, w: lotW, h: lotH });
      const spots = Math.floor(lotW / 46);
      for (let s = 0; s < spots; s++) {
        world.parkedSpots.push({ x: lx + 26 + s * 46, y: ly + 30, angle: Math.PI / 2 });
        if (rng.chance(0.7)) {
          world.parkedSpots.push({ x: lx + 26 + s * 46, y: ly + lotH - 30, angle: -Math.PI / 2 });
        }
      }
      continue;
    }
    const shrink = rng.range(0, 14);
    const building = {
      x: lx + shrink / 2,
      y: ly + shrink / 2,
      w: lotW - shrink,
      h: lotH - shrink,
      style,
      floors: rng.int(spec.minH, spec.maxH),
      color: rng.pick(spec.colors),
      roof: rng.pick(['ac', 'tank', 'garden', 'plain']),
      name: poi ? poi.name : null,
      district,
    };
    world.buildings.push(building);
    // Shade trees on the sidewalk in leafy districts.
    if ((district === 'suburb' || district === 'midtown') && rng.chance(0.8)) {
      world.trees.push({ x: rect.x0 + 16, y: ly + lotH / 2, kind: 'shade' });
    }
    if (district === 'beach') {
      world.trees.push({ x: lx - 14, y: ly + lotH / 2, kind: 'palm' });
    }
  }
  // Parked cars along the block's south curb — on the sidewalk band inside
  // the block edge, clear of the traffic lanes on the road beyond it.
  const curbY = rect.y1 - 16;
  for (let x = rect.x0 + 40; x < rect.x1 - 30; x += 64) {
    if (rng.chance(0.55)) world.parkedSpots.push({ x, y: curbY, angle: 0 });
  }
}

// --- spatial queries -------------------------------------------------------

export function isWater(x, y) {
  return x >= WATER_X;
}

export function isSand(x, y) {
  return x >= BEACH_X && x < WATER_X;
}

export function isRoad(x, y) {
  if (x >= BEACH_X) return false;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_HALF) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_HALF) return true;
  return false;
}

export function buildingAt(world, x, y, pad = 0) {
  for (const b of world.buildings) {
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
  }
  if (world.pond && Math.hypot(x - world.pond.x, y - world.pond.y) < world.pond.r + pad) {
    return { pond: true };
  }
  return null;
}

// Move a circle by (dx,dy), sliding along buildings, water and the world edge.
// Returns the new position; sets result.hit when a wall stopped an axis.
export function moveCircle(world, x, y, r, dx, dy) {
  let nx = x + dx;
  let ny = y;
  let hit = false;
  if (circleBlocked(world, nx, ny, r)) {
    hit = true;
    nx = x;
  }
  ny = y + dy;
  if (circleBlocked(world, nx, ny, r)) {
    hit = true;
    ny = y;
  }
  return { x: nx, y: ny, hit };
}

export function circleBlocked(world, x, y, r) {
  if (x < r || y < r || x > WORLD_W - r || y > WORLD_H - r) return true;
  if (x + r >= WATER_X) return true; // nobody drives or walks into the sea
  return buildingAt(world, x, y, r - 2) !== null;
}

// Nearest point on the road network to (x,y): snap to the closer grid axis.
export function nearestRoadPoint(x, y) {
  let bestAx = AVENUES[0];
  for (const ax of AVENUES) if (Math.abs(ax - x) < Math.abs(bestAx - x)) bestAx = ax;
  let bestSy = STREETS[0];
  for (const sy of STREETS) if (Math.abs(sy - y) < Math.abs(bestSy - y)) bestSy = sy;
  if (Math.abs(bestAx - x) < Math.abs(bestSy - y)) return { x: bestAx, y };
  return { x, y: bestSy };
}

// A random road point at roughly `dist` from (x,y), for spawning traffic/police.
export function roadPointNear(rng, x, y, dist) {
  for (let tries = 0; tries < 12; tries++) {
    const onAvenue = rng.chance(0.5);
    if (onAvenue) {
      const ax = rng.pick(AVENUES);
      const yy = clamp(y + rng.range(-dist, dist), 80, WORLD_H - 80);
      if (Math.hypot(ax - x, yy - y) > dist * 0.55) return { x: ax, y: yy };
    } else {
      const sy = rng.pick(STREETS);
      const xx = clamp(x + rng.range(-dist, dist), 80, BEACH_X - 60);
      if (Math.hypot(xx - x, sy - y) > dist * 0.55) return { x: xx, y: sy };
    }
  }
  return { x: AVENUES[2], y: STREETS[2] };
}

// Sidewalk walking: peds pace the perimeter of a block, inset from its edge.
export function blockPerimeterPoint(block, t) {
  const inset = 16;
  const x0 = block.rect.x0 + inset;
  const y0 = block.rect.y0 + inset;
  const x1 = block.rect.x1 - inset;
  const y1 = block.rect.y1 - inset;
  const w = x1 - x0;
  const h = y1 - y0;
  const per = 2 * (w + h);
  let d = ((t % per) + per) % per;
  if (d < w) return { x: x0 + d, y: y0 };
  d -= w;
  if (d < h) return { x: x1, y: y0 + d };
  d -= h;
  if (d < w) return { x: x1 - d, y: y1 };
  d -= w;
  return { x: x0, y: y1 - d };
}

export function blockPerimeterLength(block) {
  const w = block.rect.x1 - block.rect.x0 - 32;
  const h = block.rect.y1 - block.rect.y0 - 32;
  return 2 * (w + h);
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function dist(x0, y0, x1, y1) {
  return Math.hypot(x1 - x0, y1 - y0);
}

export { PALETTE };
