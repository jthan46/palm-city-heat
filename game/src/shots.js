// shots.js — the screenshot scenes behind ?shot=start|drive|chase&seed=N.
// One job: stage a real, deterministic moment of the game for the maker's
// screenshots — the title over the living city, a drive through downtown
// traffic, and a three-star chase with a mission marker on the HUD.
// Each scene builds the moment from the game's own rules and steps it
// forward, so what is photographed is what a player would actually see.

import { makeCar, chooseNextTarget, lanePoint, POLICE_MODEL } from './vehicles.js';
import { spawnPed } from './peds.js';
import { startMission, STORY } from './missions.js';
import { setHeat } from './police.js';
import { POLICE_SPEED } from './config.js';

function trafficAt(game, ix, iy, dir, speed = 0) {
  const p = lanePoint(ix, iy, dir);
  const car = makeCar(game.rng, p.x, p.y, 'traffic');
  car.dir = dir;
  car.angle = Math.atan2([0, 1, 0, -1][dir], [1, 0, -1, 0][dir]);
  car.speed = speed;
  chooseNextTarget(game.rng, car);
  game.cars.push(car);
  return car;
}

function pedsAround(game, x, y, n) {
  for (let i = 0; i < n; i++) {
    const ped = spawnPed(game, x + game.rng.range(-260, 260), y + game.rng.range(-260, 260), {});
    void ped;
  }
}

function stepMany(game, n, holdKey = null) {
  if (holdKey) game.input.setKey(holdKey, true);
  for (let i = 0; i < n; i++) game.step();
  if (holdKey) game.input.setKey(holdKey, false);
  game.input.consume();
}

// The title screen over a living downtown: traffic flowing, people out.
function stageStart(game) {
  game.screen = 'menu';
  game.camera.x = 2240;
  game.camera.y = 1600;
  trafficAt(game, 3, 2, 0, 120);
  trafficAt(game, 3, 2, 1, 100);
  trafficAt(game, 4, 2, 2, 130);
  trafficAt(game, 3, 3, 3, 90);
  trafficAt(game, 2, 2, 0, 110);
  trafficAt(game, 4, 3, 1, 105);
  pedsAround(game, 2240, 1600, 10);
  stepMany(game, 80);
  game.camera.x = 2240;
  game.camera.y = 1600;
}

// Kai at the wheel downtown, traffic around, a job marker on the HUD.
function stageDrive(game) {
  game.screen = 'playing';
  const car = makeCar(game.rng, 1980, 1627, 'player', 'coupe');
  car.angle = 0;
  car.speed = 165;
  car.driver = false;
  game.cars.push(car);
  game.player.inCar = car;
  game.player.x = car.x;
  game.player.y = car.y;
  game.player.cash = 465;
  startMission(game, STORY[0]);
  trafficAt(game, 3, 2, 0, 140);
  trafficAt(game, 4, 2, 0, 125);
  trafficAt(game, 3, 2, 2, 150);
  trafficAt(game, 3, 1, 1, 110);
  trafficAt(game, 3, 3, 3, 100);
  pedsAround(game, 2240, 1600, 8);
  stepMany(game, 46, 'KeyW');
}

// Three stars, interceptors on the tail, the stash run on the HUD.
function stageChase(game) {
  game.screen = 'playing';
  const car = makeCar(game.rng, 2853, 1960, 'player', 'sport');
  car.angle = Math.PI / 2;
  car.speed = 215;
  car.driver = false;
  game.cars.push(car);
  game.player.inCar = car;
  game.player.x = car.x;
  game.player.y = car.y;
  game.player.cash = 830;
  startMission(game, STORY[2]);
  for (const [px, py] of [[2853, 1800], [2915, 1735]]) {
    const cop = makeCar(game.rng, px, py, 'police');
    cop.model = { ...POLICE_MODEL, topSpeed: POLICE_SPEED[3] };
    cop.angle = Math.PI / 2;
    cop.speed = 190;
    cop.stuckFor = 0;
    game.cars.push(cop);
  }
  trafficAt(game, 4, 3, 2, 120);
  trafficAt(game, 3, 3, 0, 105);
  pedsAround(game, 2880, 2240, 6);
  stepMany(game, 30, 'KeyW');
  // Heat goes on last, so the staged moment is exactly three stars — the
  // drive itself would otherwise earn a fourth from witnessed shunts.
  setHeat(game, 75);
}

export function stageShot(game, name) {
  if (name === 'start') stageStart(game);
  else if (name === 'drive') stageDrive(game);
  else if (name === 'chase') stageChase(game);
}
