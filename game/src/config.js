// Palm City Heat — tuning constants and palette.
// One job: every number the rest of the game agrees on lives here.

export const STEP = 1 / 60; // fixed simulation step, seconds

export const WORLD = {
  w: 4800,
  h: 3900,
  roadW: 110, // road band width in px
  vRoads: [300, 1100, 1900, 2700, 3500, 4300], // centre x of vertical roads
  hRoads: [300, 1000, 1700, 2400, 3100], // centre y of horizontal roads
  beachY: 3155, // sand starts here (last road's south edge)
  waterY: 3560, // open water starts here
};

export const PLAYER = {
  radius: 13,
  walk: 2.3, // px per step
  run: 3.6,
  hp: 100,
  meleeRange: 30,
  meleeDamage: 34,
  meleeCooldown: 22, // steps
  enterRange: 48, // how close to a car door to get in
};

export const CAR = {
  radius: 17,
  accel: 0.16,
  brake: 0.3,
  reverseAccel: 0.09,
  maxSpeed: 7.4,
  maxReverse: 2.6,
  turnRate: 0.052, // rad per step at full lock, scaled by speed
  trafficSpeed: 2.6,
  trafficCount: 26,
  parkedCount: 34,
};

export const PED = {
  radius: 11,
  count: 42,
  walk: 0.9,
  flee: 2.4,
  hp: 60,
};

export const COP = {
  maxUnits: 6,
  spawnGap: 200, // steps between reinforcements
  speed: 6.9,
  bustRange: 105,
  bustFill: 1.6, // per step while conditions hold
  bustDrain: 1.1,
};

export const HEAT = {
  // heat points per witnessed crime
  theft: 22,
  carjack: 26,
  hitPed: 30,
  hitCar: 8,
  shotFired: 14,
  melee: 16,
  missionAlarm: 60,
  perStar: 22, // stars = ceil(heat / perStar), capped at 5
  decay: 0.055, // heat per step while unseen
  seenRadius: 340, // a ped or cop inside this can witness a crime
};

export const GUN = {
  damage: 40,
  bulletSpeed: 10,
  bulletLife: 42, // steps
  cooldown: 13,
  startAmmo: 24,
};

export const DAY = {
  startMinutes: 17 * 60 + 42, // 17:42, deep golden hour
  stepsPerMinute: 30,
};

export const SAVE_KEY = 'palm-city-heat-save-v1';

// Golden-hour palette: hot coral light on cream stucco and teal water.
export const PALETTE = {
  asphalt: '#3d3a44',
  asphaltEdge: '#33303b',
  laneMark: '#f7c873',
  sidewalk: '#cbb59a',
  grass: '#7fae5a',
  parkGrass: '#86b95f',
  sand: '#eed9a0',
  water: '#2e8fa3',
  waterDeep: '#22707f',
  shadow: 'rgba(46, 16, 40, 0.35)',
  hudPanel: 'rgba(24, 14, 26, 0.72)',
  hudText: '#ffe9c9',
  accent: '#ff7847',
  accent2: '#ffd23f',
  good: '#7be495',
  bad: '#ff5d5d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
