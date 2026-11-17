// config.js — Palm City Heat: every shared tuning constant and the golden-hour palette.
// One job: numbers and colours the rest of the game reads, so balance lives in one place.

export const STEP = 1 / 60; // fixed simulation step, seconds

export const WORLD_W = 4800;
export const WORLD_H = 3200;

// Road grid: avenue centres run west→east, street centres north→south.
export const AVENUES = [320, 960, 1600, 2240, 2880, 3520, 4160];
export const STREETS = [320, 960, 1600, 2240, 2880];
export const ROAD_HALF = 55; // half the road width in px
export const LANE = 27; // lane offset from a road centre line

export const PLAYER = {
  radius: 11,
  walkSpeed: 132,
  runSpeed: 218,
  maxHp: 100,
  meleeRange: 30,
  meleeDamage: 34,
};

export const WANTED = {
  maxHeat: 125,
  heatPerStar: 25,
  decayDelay: 5, // seconds unseen before heat drains
  decayRate: 4.2, // heat per second while hidden
  pedSight: 280,
  policeSight: 430,
  crimes: {
    carTheft: 25, // exactly one star
    meleeHit: 25,
    pedDown: 50, // two stars
    shotFired: 12,
    hardCrash: 12,
    hitAndRun: 40,
    trafficKill: 50,
  },
};

// Police strength per wanted star (index 0 = no stars).
export const POLICE_BY_STAR = [0, 1, 2, 3, 5, 7];
export const POLICE_SPEED = [0, 292, 302, 314, 330, 348];

export const TRAFFIC_TARGET = 24; // moving cars kept around the player
export const PED_TARGET = 26; // pedestrians kept around the player
export const SPAWN_RADIUS = 1150;
export const DESPAWN_RADIUS = 1550;

export const SAVE_KEY = 'palm-city-heat-save-v1';

// Golden-hour palette: warm asphalt, coral roofs, teal water, long shadows.
export const PALETTE = {
  grass: '#5d8a4a',
  grassDark: '#527c40',
  parkGrass: '#69a354',
  sand: '#e8c98a',
  water: '#2e7f8f',
  waterDeep: '#256b7a',
  road: '#4a4048',
  roadEdge: '#5b4f57',
  laneMark: '#e8d9a0',
  sidewalk: '#b8a894',
  sidewalkEdge: '#a08e78',
  plaza: '#c4ae8e',
  shadow: 'rgba(46, 26, 40, 0.35)',
  skyGlow: 'rgba(255, 166, 88, 0.10)',
  hudPanel: 'rgba(24, 16, 28, 0.72)',
  hudText: '#ffe9c9',
  accent: '#ffb347',
  danger: '#ff5a4e',
  good: '#7fe08a',
  starOn: '#ffd94d',
  starOff: 'rgba(255,255,255,0.25)',
};

export const BUILDING_STYLES = {
  tower: { colors: ['#8a6f8e', '#7a6a94', '#96757f', '#6f7d99'], minH: 5, maxH: 9 },
  office: { colors: ['#a08b74', '#8f8272', '#b09a80', '#7d7468'], minH: 2, maxH: 5 },
  shop: { colors: ['#d98a5f', '#c96f5a', '#e0a05c', '#b85c48', '#e8b04b'], minH: 1, maxH: 2 },
  house: { colors: ['#e6cfa3', '#dfb98c', '#eccfb0', '#d9a97e', '#f0dcc0'], minH: 1, maxH: 1 },
  hut: { colors: ['#f2e2b8', '#eac9a0', '#f6ead0', '#e3b98d'], minH: 1, maxH: 1 },
};

export const CAR_COLORS = [
  '#d94f3d', '#3d7bd9', '#e8b93b', '#4fae62', '#e8e4da', '#30303a',
  '#8a4fd9', '#d97fb0', '#3fb8ae', '#c96a2e', '#7a8899', '#f2f2f2',
];

export const GAME_TITLE = 'Palm City Heat';
export const GAME_SUBTITLE = 'An original open-world crime game in a golden-hour city.';
