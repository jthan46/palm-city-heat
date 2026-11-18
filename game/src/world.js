// Palm City Heat — the city of Palm City: its tile grid, districts, buildings, props and
// points of interest, plus the spatial queries every other system uses (what is under a
// point, and how a circle is pushed out of the solid world). Pure data and geometry: no
// drawing, no browser.

import {
  BEACH_X, COMMERCIAL_Y, DOWNTOWN, PARK, ROAD_PERIOD, ROAD_TILES, TILE,
  WATER_X, WORLD_H, WORLD_TILES_X, WORLD_TILES_Y, WORLD_W,
} from './config.js';

export const TILE_ROAD = 'road';
export const TILE_SIDEWALK = 'sidewalk';
export const TILE_BLOCK = 'block';
export const TILE_GRASS = 'grass';
export const TILE_SAND = 'sand';
export const TILE_WATER = 'water';

export function tileOf(x, y) {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}

function isRoadTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= WORLD_TILES_X || ty >= WORLD_TILES_Y) return false;
  if (tx >= BEACH_X) return false; // the coast road ends where the sand begins
  return tx % ROAD_PERIOD < ROAD_TILES || ty % ROAD_PERIOD < ROAD_TILES;
}

function inRect(tx, ty, r) { return tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1; }

/** What kind of ground covers tile (tx, ty). Roads cut through every district. */
export function tileKind(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= WORLD_TILES_X || ty >= WORLD_TILES_Y) return TILE_WATER;
  if (isRoadTile(tx, ty)) return TILE_ROAD;
  if (tx >= WATER_X) return TILE_WATER;
  if (tx >= BEACH_X) return TILE_SAND;
  if (inRect(tx, ty, PARK)) return TILE_GRASS;
  const nearRoad = isRoadTile(tx + 1, ty) || isRoadTile(tx - 1, ty) || isRoadTile(tx, ty + 1) || isRoadTile(tx, ty - 1);
  return nearRoad ? TILE_SIDEWALK : TILE_BLOCK;
}

export function kindAt(x, y) {
  const { tx, ty } = tileOf(x, y);
  return tileKind(tx, ty);
}

export function isRoadAt(x, y) { return kindAt(x, y) === TILE_ROAD; }
export function isWaterAt(x, y) { return kindAt(x, y) === TILE_WATER; }

/** Pixel centre of a tile. */
export function tileCenter(tx, ty) { return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }; }

/** The district a block belongs to, by the block's centre tile. */
export function districtAt(tx, ty) {
  if (tx >= BEACH_X) return 'beach';
  if (inRect(tx, ty, PARK)) return 'park';
  if (inRect(tx, ty, DOWNTOWN)) return 'downtown';
  if (ty >= COMMERCIAL_Y) return 'commercial';
  if (tx < 22 || ty < 14) return 'suburbs';
  return 'midtown';
}

const ROOFS = {
  downtown: ['#8d99ae', '#7d8597', '#a3b18a', '#bc6c25', '#606c38', '#9d8189'],
  midtown: ['#b08968', '#a98467', '#8d99ae', '#7f5539', '#a3b18a'],
  commercial: ['#dda15e', '#bc6c25', '#e07a5f', '#81b29a', '#f2cc8f'],
  suburbs: ['#c08552', '#a26769', '#7d8597', '#669bbc', '#93a267'],
  park: ['#79a85b'],
  beach: ['#e9d8a6'],
};

/**
 * Builds the whole city from the RNG: building rectangles with heights and roof colours,
 * parking-lot blocks, trees, streetlights and the named points of interest the story uses.
 */
export function buildWorld(rng) {
  const buildings = [];
  const lots = [];
  const trees = [];
  const lights = [];

  for (let by = 0; by * ROAD_PERIOD < WORLD_TILES_Y; by += 1) {
    for (let bx = 0; bx * ROAD_PERIOD < WORLD_TILES_X; bx += 1) {
      const tx0 = bx * ROAD_PERIOD + ROAD_TILES;
      const ty0 = by * ROAD_PERIOD + ROAD_TILES;
      const size = ROAD_PERIOD - ROAD_TILES; // 8 tiles of block interior
      if (tx0 >= BEACH_X) continue;
      const cx = tx0 + size / 2;
      const cy = ty0 + size / 2;
      const district = districtAt(cx, cy);
      if (district === 'park') continue;
      const x0 = tx0 * TILE + TILE;       // keep the sidewalk ring clear
      const y0 = ty0 * TILE + TILE;
      const inner = (size - 2) * TILE;    // buildable square inside the ring
      const roll = rng.float();
      if (roll < 0.16) {                  // an open parking lot block
        lots.push({ x: tx0 * TILE, y: ty0 * TILE, w: size * TILE, h: size * TILE, district });
        continue;
      }
      const place = (fx, fy, w, h, tall) => {
        buildings.push({
          x: x0 + fx, y: y0 + fy, w, h,
          height: tall, district,
          color: rng.pick(ROOFS[district] || ROOFS.midtown),
          trim: rng.pick(['#f4f1de', '#e07a5f', '#81b29a', '#3d405b']),
        });
      };
      if (district === 'downtown') {
        const w = rng.range(190, 258);
        const h = rng.range(190, 258);
        place((inner - w) / 2, (inner - h) / 2, w, h, rng.range(90, 170));
      } else if (district === 'suburbs') {
        const hw = rng.range(88, 118);
        const hh = rng.range(80, 108);
        place(6, 6, hw, hh, rng.range(14, 24));
        place(inner - hw - 6, 6, hw, hh, rng.range(14, 24));
        place(6, inner - hh - 6, hw, hh, rng.range(14, 24));
        place(inner - hw - 6, inner - hh - 6, hw, hh, rng.range(14, 24));
      } else if (district === 'commercial') {
        const w = rng.range(120, 150);
        place(4, 4, w, rng.range(90, 120), rng.range(20, 32));
        place(inner - w - 4, 4, w, rng.range(90, 120), rng.range(20, 32));
        place(inner / 2 - 60, inner - 124, 120, 110, rng.range(20, 30));
      } else {
        const w = rng.range(130, 170);
        const h = rng.range(120, 160);
        place(4, 4, w, h, rng.range(30, 60));
        place(inner - w - 4, inner - h - 4, w, h, rng.range(30, 60));
      }
      if (rng.chance(0.5)) trees.push({ x: x0 - TILE / 2 + rng.range(-4, 4), y: y0 - TILE / 2, r: rng.range(10, 15), palm: district === 'commercial' });
    }
  }

  // Palmetto Park: lawns, palms and a pond-side scatter of trees.
  for (let i = 0; i < 46; i += 1) {
    const tx = rng.int(PARK.x0, PARK.x1);
    const ty = rng.int(PARK.y0, PARK.y1);
    if (tileKind(tx, ty) !== TILE_GRASS) continue;
    const c = tileCenter(tx, ty);
    trees.push({ x: c.x + rng.range(-14, 14), y: c.y + rng.range(-14, 14), r: rng.range(11, 18), palm: rng.chance(0.4) });
  }
  // Beach palms along the sand.
  for (let ty = 2; ty < WORLD_TILES_Y - 1; ty += 3) {
    const c = tileCenter(BEACH_X + 1, ty);
    if (rng.chance(0.7)) trees.push({ x: c.x + rng.range(-8, 8), y: c.y, r: rng.range(10, 14), palm: true });
  }
  // Streetlights on intersection corners.
  for (let by = 0; by * ROAD_PERIOD < WORLD_TILES_Y; by += 1) {
    for (let bx = 0; bx * ROAD_PERIOD < WORLD_TILES_X; bx += 1) {
      const x = bx * ROAD_PERIOD * TILE;
      const y = by * ROAD_PERIOD * TILE;
      if (x > 0 && y > 0 && x < BEACH_X * TILE) lights.push({ x: x - 6, y: y - 6 });
    }
  }

  // Every POI stands on a road or sidewalk tile, never inside a building footprint.
  const pois = {
    contact: { x: 2472, y: 1080, name: "Marisol's Boardwalk Bar" },
    hospital: { x: 1680, y: 1464, name: 'Palm City General' },
    station: { x: 1200, y: 984, name: 'Palm City PD — Central' },
    safehouse: { x: 2472, y: 300, name: 'Safehouse' },
    chopshop: { x: 264, y: 1900, name: "Rudy's Chop Shop" },
    gunshop: { x: 2160, y: 1944, name: 'Sunset Arms' },
    hotel: { x: 2208, y: 504, name: 'Hotel Brisa' },
    warehouse: { x: 72, y: 2064, name: 'Portside Warehouse' },
    diner: { x: 2160, y: 1900, name: 'Diner Solano' },
  };
  return { buildings, lots, trees, lights, pois, w: WORLD_W, h: WORLD_H };
}

/** Pushes a circle (x, y, r) out of every building and the waterline; returns the fixed point. */
export function collideCircle(world, x, y, r, blockWater = true) {
  let px = x;
  let py = y;
  px = Math.max(r, Math.min(world.w - r, px));
  py = Math.max(r, Math.min(world.h - r, py));
  if (blockWater) {
    const waterLine = WATER_X * TILE;
    if (px + r > waterLine) px = waterLine - r;
  }
  for (let i = 0; i < world.buildings.length; i += 1) {
    const b = world.buildings[i];
    if (px + r < b.x || px - r > b.x + b.w || py + r < b.y || py - r > b.y + b.h) continue;
    const cx = Math.max(b.x, Math.min(b.x + b.w, px));
    const cy = Math.max(b.y, Math.min(b.y + b.h, py));
    let dx = px - cx;
    let dy = py - cy;
    let d2 = dx * dx + dy * dy;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      if (d < r) { px = cx + (dx / d) * r; py = cy + (dy / d) * r; }
    } else {
      // Centre inside the rect: leave by the nearest face.
      const left = px - b.x; const right = b.x + b.w - px;
      const top = py - b.y; const bottom = b.y + b.h - py;
      const m = Math.min(left, right, top, bottom);
      if (m === left) px = b.x - r; else if (m === right) px = b.x + b.w + r;
      else if (m === top) py = b.y - r; else py = b.y + b.h + r;
      dx = 0; dy = 0; d2 = 0;
    }
  }
  return { x: px, y: py };
}

/** True when a circle at (x, y) would overlap a building or deep water. */
export function circleBlocked(world, x, y, r) {
  if (isWaterAt(x, y)) return true;
  for (let i = 0; i < world.buildings.length; i += 1) {
    const b = world.buildings[i];
    const cx = Math.max(b.x, Math.min(b.x + b.w, x));
    const cy = Math.max(b.y, Math.min(b.y + b.h, y));
    const dx = x - cx; const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/** A random point on a road, at least `minDist` from (x, y) when given. */
export function randomRoadPoint(rng, x = -1, y = -1, minDist = 0) {
  for (let tries = 0; tries < 40; tries += 1) {
    const tx = rng.int(0, BEACH_X - 1);
    const ty = rng.int(0, WORLD_TILES_Y - 1);
    if (!isRoadTile(tx, ty)) continue;
    const c = tileCenter(tx, ty);
    if (minDist > 0 && Math.hypot(c.x - x, c.y - y) < minDist) continue;
    return c;
  }
  return tileCenter(1, 1);
}

/** A random sidewalk tile centre — where pedestrians like to walk. */
export function randomSidewalkPoint(rng) {
  for (let tries = 0; tries < 40; tries += 1) {
    const tx = rng.int(1, BEACH_X - 2);
    const ty = rng.int(1, WORLD_TILES_Y - 2);
    if (tileKind(tx, ty) !== TILE_SIDEWALK) continue;
    return tileCenter(tx, ty);
  }
  return tileCenter(3, 3);
}
