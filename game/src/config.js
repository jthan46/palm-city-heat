// Palm City Heat — shared tuning constants. Every module reads its numbers from here so the
// whole game can be rebalanced in one place.

export const TILE = 48;                 // pixel size of one city tile
export const WORLD_TILES_X = 64;        // city width in tiles
export const WORLD_TILES_Y = 48;        // city height in tiles
export const WORLD_W = WORLD_TILES_X * TILE;
export const WORLD_H = WORLD_TILES_Y * TILE;

export const STEP = 1 / 60;             // fixed simulation step, seconds
export const ROAD_PERIOD = 10;          // a road band every 10 tiles
export const ROAD_TILES = 2;            // road bands are 2 tiles wide
export const BEACH_X = 55;              // first sand tile column
export const WATER_X = 58;              // first water tile column

export const PARK = { x0: 12, y0: 6, x1: 21, y1: 13 };        // tile rect of Palmetto Park
export const DOWNTOWN = { x0: 22, y0: 14, x1: 44, y1: 33 };  // tile rect of the tower district
export const COMMERCIAL_Y = 35;         // tile rows at or below this are the shop strip

export const PLAYER_RADIUS = 11;
export const WALK_SPEED = 96;
export const RUN_SPEED = 168;
export const PLAYER_MAX_HP = 100;

export const CAR_MODELS = [
  { name: 'compact', len: 34, wid: 17, top: 252, accel: 240 },
  { name: 'sedan', len: 40, wid: 18, top: 272, accel: 225 },
  { name: 'coupe', len: 38, wid: 18, top: 318, accel: 285 },
  { name: 'van', len: 46, wid: 20, top: 228, accel: 195 },
  { name: 'pickup', len: 44, wid: 20, top: 244, accel: 210 },
  { name: 'taxi', len: 40, wid: 18, top: 264, accel: 230 },
];
export const POLICE_MODEL = { name: 'interceptor', len: 42, wid: 19, top: 330, accel: 300 };
export const CAR_COLORS = ['#d94f30', '#3f7fbf', '#e8b93c', '#57a773', '#b8bcc4', '#7048a0', '#e4e0d8', '#2f6f6a', '#c94f7c', '#46506b'];
export const TAXI_COLOR = '#f2b21b';
export const POLICE_COLOR = '#1d2733';
export const GOLD_COLOR = '#e9c33c';

export const TRAFFIC_COUNT = 24;
export const PARKED_PER_LOT = 4;
export const PED_COUNT = 42;

export const HEAT = { theft: 55, assault: 50, shot: 35, hitPed: 85, hitCar: 18, hitPolice: 110, missionCrime: 65 };
export const HEAT_PER_STAR = 110;       // heat points per wanted star
export const HEAT_DECAY = 7;            // heat lost per second while unobserved
export const UNSEEN_GRACE = 4;          // seconds unobserved before decay starts
export const BUST_TIME = 2.6;           // seconds pinned before the bust meter fills

export const START_CLOCK_MIN = 17 * 60; // 17:00, golden hour
export const CLOCK_RATE = 1;            // game minutes per real second

export const SAVE_KEY = 'palm-city-heat-save-v1';

export const COLORS = {
  road: '#4a4048',
  roadEdge: '#66586a',
  lane: '#e8d9a0',
  sidewalk: '#b9a89a',
  block: '#a08b74',
  sand: '#eed9a0',
  water: '#2e7f9e',
  waterDeep: '#256a86',
  grass: '#79a85b',
  plaza: '#c2b096',
};
