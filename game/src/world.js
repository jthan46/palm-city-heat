// Palm City Heat — the city itself.
// One job: generate Palm City (districts, buildings, roads, props, named
// places) from a seed, and answer spatial questions — collision, water,
// road lanes, walkable points — for every other system.

import { WORLD, PALETTE } from './config.js';
import { clamp, dist2 } from './random.js';

export const LANE_OFF = 20; // lane centre offset from road centre (parked cars hug the kerb outside it)
export const SAND_Y = WORLD.hRoads[WORLD.hRoads.length - 1] + WORLD.roadW / 2; // beach begins

const BUILDING_STYLES = {
  downtown: ['#e8b4a0', '#d99a86', '#f0c297', '#c97e6f', '#e5a583'],
  commercial: ['#f2d5a0', '#eec27f', '#f7e3b0', '#e8b06a'],
  suburbs: ['#f5e6c8', '#eed9b8', '#f9efdb', '#e6cfa5'],
  beachfront: ['#f7ead2', '#ffe3ae', '#f3d9c8', '#ffeec9'],
  park: [],
};

// Named places the story and HUD point at. Block is [column, row] in the block grid.
const LOCATION_SPECS = [
  { id: 'contact', name: 'Marlin Hotel', kind: 'hotel', block: [2, 4], label: 'Vivi is here' },
  { id: 'warehouse', name: 'Marina Warehouse', kind: 'warehouse', block: [6, 4] },
  { id: 'diner', name: 'Seabreeze Diner', kind: 'diner', block: [0, 4] },
  { id: 'aurelia', name: 'Aurelia Hotel', kind: 'hotel', block: [6, 1] },
  { id: 'chopshop', name: "Sal's Chop Shop", kind: 'garage', block: [0, 0] },
  { id: 'safehouse', name: 'Palm Court Safehouse', kind: 'house', block: [5, 2] },
  { id: 'hospital', name: 'Palm City General', kind: 'hospital', block: [1, 2] },
  { id: 'station', name: 'Palm City PD', kind: 'station', block: [3, 2] },
  { id: 'gunshop', name: 'Sunset Arms', kind: 'shop', block: [5, 3] },
  { id: 'beachclub', name: 'Club Del Mar', kind: 'club', block: [4, 4] },
];

// Block column/row spans between road bands, world edges included.
function blockSpans(roads, limit) {
  const spans = [];
  let prev = 0;
  for (const c of roads) {
    spans.push([prev, c - WORLD.roadW / 2]);
    prev = c + WORLD.roadW / 2;
  }
  spans.push([prev, limit]);
  return spans;
}

export function districtAt(x, y) {
  if (y >= SAND_Y) return 'beach';
  if (x > 3445 && y < 1755) return 'park';
  const cols = blockSpans(WORLD.vRoads, WORLD.w);
  const rows = blockSpans(WORLD.hRoads, WORLD.h);
  let ci = cols.findIndex(([a, b]) => x >= a && x <= b);
  let ri = rows.findIndex(([a, b]) => y >= a && y <= b);
  if (ci === -1) ci = 3;
  if (ri === -1) ri = 2;
  if (ri === 4) return 'beachfront';
  if (ci >= 5 && ri <= 1) return 'park';
  if (ci >= 5) return 'commercial';
  if (ci >= 2 && ci <= 4 && ri >= 1 && ri <= 3) return 'downtown';
  return 'suburbs';
}

function addBuilding(city, rng, spec) {
  const b = {
    x: spec.x, y: spec.y, w: spec.w, h: spec.h,
    hgt: spec.hgt, kind: spec.kind || 'block',
    color: spec.color, roof: spec.roof || '#8a5a4a',
    district: spec.district, name: spec.name || null,
  };
  city.buildings.push(b);
  return b;
}

function fillBlock(city, rng, bx, by, bw, bh, district, location) {
  const inset = 30;
  const ix = bx + inset;
  const iy = by + inset;
  const iw = bw - inset * 2;
  const ih = bh - inset * 2;
  if (iw < 60 || ih < 60) return;
  const colors = BUILDING_STYLES[district] || BUILDING_STYLES.suburbs;
  const mk = (x, y, w, h, hgt, kind) => addBuilding(city, rng, {
    x, y, w, h, hgt, kind, district,
    color: rng.pick(colors),
    roof: district === 'downtown' ? '#6e4a3f' : '#9c6a4e',
    name: null,
  });

  if (location) {
    // The named place takes the middle of the block; one filler beside it.
    const lw = Math.min(iw * 0.62, 300);
    const lh = Math.min(ih * 0.6, 240);
    const b = addBuilding(city, rng, {
      x: ix + (iw - lw) / 2, y: iy + (ih - lh) / 2, w: lw, h: lh,
      hgt: location.kind === 'hotel' ? 64 : 30, kind: location.kind,
      color: '#ffe9bd', roof: '#7a4a3a', district, name: location.name,
    });
    city.locations[location.id] = {
      id: location.id, name: location.name, kind: location.kind,
      x: b.x + b.w / 2, y: b.y + b.h + 20, // the doorstep, on the sidewalk
      bx: b.x + b.w / 2, by: b.y + b.h / 2,
    };
    if (iw > 420) mk(ix, iy + ih * 0.2, iw * 0.2, ih * 0.5, 20, 'block');
    return;
  }

  if (district === 'downtown') {
    const gw = iw / 2;
    const gh = ih / 2;
    for (let cx = 0; cx < 2; cx++) for (let cy = 0; cy < 2; cy++) {
      if (rng.chance(0.12)) continue;
      mk(ix + cx * gw + 14, iy + cy * gh + 14, gw - 28, gh - 28, rng.int(70, 135), 'tower');
    }
  } else if (district === 'commercial') {
    const n = 3;
    const gw = iw / n;
    for (let cx = 0; cx < n; cx++) mk(ix + cx * gw + 12, iy + 16, gw - 24, ih - 32, rng.int(24, 46), 'shop');
  } else if (district === 'beachfront') {
    const n = 2;
    const gw = iw / n;
    for (let cx = 0; cx < n; cx++) mk(ix + cx * gw + 16, iy + 20, gw - 32, ih - 40, rng.int(20, 36), 'motel');
  } else {
    // suburbs: small houses with gaps between them
    const n = 3;
    const gw = iw / n;
    const gh = ih / 2;
    for (let cx = 0; cx < n; cx++) for (let cy = 0; cy < 2; cy++) {
      if (rng.chance(0.15)) continue;
      mk(ix + cx * gw + 22, iy + cy * gh + 20, gw - 52, gh - 44, rng.int(11, 19), 'house');
    }
  }
}

export function generateCity(rng) {
  const city = {
    buildings: [],
    props: [],
    locations: {},
    cols: blockSpans(WORLD.vRoads, WORLD.w),
    rows: blockSpans(WORLD.hRoads, WORLD.h),
  };
  const locByBlock = new Map();
  for (const spec of LOCATION_SPECS) locByBlock.set(spec.block.join(','), spec);

  for (let ci = 0; ci < city.cols.length; ci++) {
    for (let ri = 0; ri < city.rows.length; ri++) {
      const [bx, bx2] = city.cols[ci];
      const [by, by2] = city.rows[ri];
      const bw = bx2 - bx;
      const bh = by2 - by;
      if (by >= SAND_Y) continue; // the beach itself: no blocks
      const district = districtAt(bx + bw / 2, by + bh / 2);
      if (district === 'park') {
        // park blocks: lawns, a pond, paths and trees — no buildings
        city.props.push({ kind: 'pond', x: bx + bw * 0.3, y: by + bh * 0.3, r: 52 });
        for (let t = 0; t < 14; t++) {
          city.props.push({ kind: 'tree', x: bx + rng.float(30, bw - 30), y: by + rng.float(30, bh - 30), r: rng.int(13, 20) });
        }
        continue;
      }
      fillBlock(city, rng, bx, by, bw, bh, district, locByBlock.get(ci + ',' + ri) || null);
    }
  }

  // Props: palms along the beach and Ocean-side sidewalks, lamps on corners, trees in suburbs.
  for (let x = 90; x < WORLD.w; x += rng.int(120, 200)) {
    city.props.push({ kind: 'palm', x, y: SAND_Y + rng.float(24, 90), r: 15 });
  }
  for (const vx of WORLD.vRoads) for (const hy of WORLD.hRoads) {
    city.props.push({ kind: 'lamp', x: vx - WORLD.roadW / 2 - 10, y: hy - WORLD.roadW / 2 - 10, r: 5 });
    city.props.push({ kind: 'lamp', x: vx + WORLD.roadW / 2 + 10, y: hy + WORLD.roadW / 2 + 10, r: 5 });
  }
  for (let i = 0; i < 90; i++) {
    const x = rng.float(40, WORLD.w - 40);
    const y = rng.float(40, SAND_Y - 40);
    const d = districtAt(x, y);
    if (d === 'suburbs' || d === 'beachfront') city.props.push({ kind: rng.chance(0.5) ? 'palm' : 'tree', x, y, r: rng.int(11, 17) });
  }
  return city;
}

// ---- spatial queries -------------------------------------------------------

export function isWater(x, y) {
  return y >= WORLD.waterY;
}

// Push a circle out of every building it overlaps and out of the water/world edge.
// Returns {x, y, hit} — hit is true when any resolution moved the circle.
export function collideCircle(city, x, y, r) {
  let hit = false;
  if (x < r) { x = r; hit = true; }
  if (y < r) { y = r; hit = true; }
  if (x > WORLD.w - r) { x = WORLD.w - r; hit = true; }
  if (y > WORLD.h - r) { y = WORLD.h - r; hit = true; }
  if (y > WORLD.waterY - r && x >= 0) { y = WORLD.waterY - r; hit = true; }
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const d2 = dist2(x, y, nx, ny);
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nx + ((x - nx) / d) * r;
      y = ny + ((y - ny) / d) * r;
    } else {
      // centre inside the rect: push out along the smallest penetration axis
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x - r;
      else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r;
      else y = b.y + b.h + r;
    }
  }
  return { x, y, hit };
}

export function pointInBuilding(city, x, y, pad = 0) {
  for (const b of city.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  }
  return null;
}

export function isOnRoad(x, y) {
  if (y >= SAND_Y) return false;
  for (const vx of WORLD.vRoads) if (Math.abs(x - vx) <= WORLD.roadW / 2) return true;
  for (const hy of WORLD.hRoads) if (Math.abs(y - hy) <= WORLD.roadW / 2) return true;
  return false;
}

// Lane centre coordinate for a car travelling on a road.
// kind 'v': road centre x, dir +1 heads south, -1 north (right-hand traffic).
export function laneCoord(kind, centre, dir) {
  if (kind === 'v') return centre + (dir > 0 ? -LANE_OFF : LANE_OFF);
  return centre + (dir > 0 ? LANE_OFF : -LANE_OFF);
}

// A point on a sidewalk near (x, y): snap to the nearest block-border walk line.
export function randomWalkPoint(rng, x, y, range = 520) {
  const off = WORLD.roadW / 2 + 17;
  const lines = [];
  for (const vx of WORLD.vRoads) { lines.push({ axis: 'x', at: vx - off }); lines.push({ axis: 'x', at: vx + off }); }
  for (const hy of WORLD.hRoads) { lines.push({ axis: 'y', at: hy - off }); lines.push({ axis: 'y', at: hy + off }); }
  const near = lines.filter((l) => Math.abs((l.axis === 'x' ? x : y) - l.at) < range + 200);
  const l = rng.pick(near.length ? near : lines);
  if (l.axis === 'x') return { x: l.at, y: clamp(y + rng.float(-range, range), 30, SAND_Y - 20) };
  return { x: clamp(x + rng.float(-range, range), 30, WORLD.w - 30), y: l.at };
}

// A random point on a road lane, used for traffic spawns away from the player.
export function randomLanePoint(rng) {
  if (rng.chance(0.5)) {
    const cx = rng.pick(WORLD.vRoads);
    const dir = rng.sign();
    return { x: laneCoord('v', cx, dir), y: rng.float(60, SAND_Y - 60), kind: 'v', centre: cx, dir };
  }
  const cy = rng.pick(WORLD.hRoads);
  const dir = rng.sign();
  return { x: rng.float(60, WORLD.w - 60), y: laneCoord('h', cy, dir), kind: 'h', centre: cy, dir };
}

export { PALETTE };
