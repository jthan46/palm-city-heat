// Palm City Heat — tuning constants, palette and shared knobs.
// Everything the other modules need to agree on lives here: the fixed-step
// simulation rate, the city grid geometry, the golden-hour palette and the
// wanted/heat economy. No game logic in this file.

export const STEP = 1 / 60; // fixed simulation step, seconds

// Logical view size. The canvas is scaled by CSS to fill the window, but the
// world is always rendered through a 960x540 camera window.
export const VIEW_W = 960;
export const VIEW_H = 540;

// City grid: blocks of BLOCK px separated by roads of ROAD px. A beach and a
// water strip are appended on the east edge inside buildWorld().
export const GRID = {
  cols: 7,
  rows: 5,
  block: 264,
  road: 96,
};
export const PITCH = GRID.block + GRID.road; // 360

// Player / world physics.
export const PLAYER = {
  radius: 9,
  walkSpeed: 132,
  runSpeed: 216,
  maxHealth: 100,
  enterCarRange: 40,
  meleeRange: 30,
  meleeDamage: 34,
};

// Wanted heat: crimes add heat points, stars are read off the thresholds.
// Index 0 is "clean"; thresholds[i] is the heat needed for i+1 stars.
export const HEAT_THRESHOLDS = [15, 40, 70, 105, 145];
export const HEAT_DECAY_PER_SEC = 3.0; // only while unobserved
export const HEAT_DECAY_DELAY = 6; // seconds after the last witnessed crime
export const CRIME_HEAT = {
  theft: 14,
  carjack: 20,
  hitAndRun: 22,
  collision: 6,
  gunshot: 16,
  melee: 10,
  missionAlarm: 55,
};

// How many police cars the city fields per wanted level (index = stars).
export const POLICE_PER_STAR = [0, 2, 3, 4, 5, 6];
export const BUST_TIME = 2.4; // seconds of close, slow contact to get busted

// Game clock: starts at 17:30 (golden hour), one real second = one game minute.
export const CLOCK_START_MINUTES = 17 * 60 + 30;

// Golden-hour palette: warm asphalt, peach sidewalks, teal-gold water.
export const PALETTE = {
  sky: '#2b1a2e', // page background behind the canvas
  asphalt: '#4a4048',
  asphaltDark: '#413842',
  laneMark: '#e8c87a',
  crosswalk: '#d8cfc0',
  sidewalk: '#9c7f6d',
  sidewalkEdge: '#7d6455',
  grass: '#5d7d43',
  grassDark: '#52713c',
  sand: '#e0bd85',
  sandDark: '#d0ab72',
  water: '#2e6f79',
  waterDeep: '#256069',
  waterFoam: '#bfe3dd',
  roofShadow: 'rgba(43, 20, 32, 0.35)',
  sunGlow: 'rgba(255, 166, 88, 0.10)',
  hudPanel: 'rgba(20, 12, 24, 0.62)',
  hudText: '#ffe9c9',
  hudAccent: '#ffb347',
  danger: '#ff5a4e',
  marker: '#ffd23e',
  policeBlip: '#5aa2ff',
};

export const DISTRICT_ROOFS = {
  downtown: ['#8a5a68', '#75506b', '#96626f', '#6d4a63', '#845664'],
  commercial: ['#b0764f', '#a56643', '#bb815a', '#9c5f42'],
  suburbs: ['#c9a06b', '#bd9261', '#d2ab77', '#c79e68'],
  park: [],
  beach: [],
};

// Save-game storage key.
export const SAVE_KEY = 'palm-city-heat-save-v1';
