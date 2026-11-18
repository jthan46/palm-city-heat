// Palm City Heat — the screenshot scenes behind ?shot=start|drive|chase. Each one builds a
// real game from the seed and plays its rules forward with scripted input, so the frame is
// a moment the game itself produced: the title over a living city, a drive through
// downtown traffic on the first job, and a three-star chase with the law closing in.
// main.js paints the staged state once and sets window.__shotReady.

import { setStars } from './police.js';
import { talkToContact, advanceDialogue } from './missions.js';

function runSteps(state, stepGame, steps, script) {
  for (let i = 0; i < steps; i += 1) {
    if (script) script(state, i);
    stepGame(state, 1 / 60);
  }
}

/** Puts the player behind the wheel of the nearest car, the way the interact key would. */
function putInCar(state, car) {
  car.driver = 'player';
  car.ctrl.throttle = 0;
  car.ctrl.steer = 0;
  state.player.car = car;
  state.player.x = car.x;
  state.player.y = car.y;
}

/** Accepts Marisol's first job through the real dialogue flow. */
function acceptFirstMission(state, stepGame) {
  const p = state.player;
  p.x = state.world.pois.contact.x - 20;
  p.y = state.world.pois.contact.y;
  talkToContact(state);
  while (state.mission.dialogue) {
    state.input.queue.push('interact');
    stepGame(state, 1 / 60);
  }
}

function stageStart(state, stepGame) {
  // The title screen, hanging over downtown while the evening traffic rolls under it.
  state.player.x = 1560;
  state.player.y = 1120;
  runSteps(state, stepGame, 300);
  state.screen = 'title';
  return state;
}

function stageDrive(state, stepGame) {
  acceptFirstMission(state, stepGame);
  // A clear run east along the downtown avenue, traffic flowing around the player.
  const p = state.player;
  p.x = 1010;
  p.y = 984 + 24;
  let car = state.cars.find((c) => c.driver === 'parked');
  car = car || state.cars[0];
  car.x = p.x; car.y = p.y; car.angle = 0; car.speed = 0;
  car.ai.dx = 1; car.ai.dy = 0;
  putInCar(state, car);
  state.cars = state.cars.filter((c) => c === car
    || Math.hypot(c.x - car.x, c.y - car.y) > 430
    || c.x < car.x - 60);
  runSteps(state, stepGame, 210, (s) => { s.input.up = true; });
  state.input.up = false;
  return state;
}

function stageChase(state, stepGame) {
  acceptFirstMission(state, stepGame);
  const p = state.player;
  p.x = 1490;
  p.y = 1464 + 24;
  let car = state.cars.find((c) => c.modelName === 'coupe') || state.cars[0];
  car.x = p.x; car.y = p.y; car.angle = 0; car.speed = 120;
  car.ai.dx = 1; car.ai.dy = 0;
  putInCar(state, car);
  setStars(state, 3);
  runSteps(state, stepGame, 200, (s) => { s.input.up = true; });
  state.input.up = false;
  // Make sure the frame actually shows the law: park two interceptors in the rear view.
  const cops = state.cars.filter((c) => c.police);
  cops.forEach((cop, i) => {
    cop.x = state.player.x - 130 - i * 95;
    cop.y = state.player.y + (i === 0 ? -26 : 30);
    cop.angle = 0;
    cop.speed = 150;
  });
  setStars(state, 3);
  return state;
}

/**
 * Builds the named scene ('start', 'drive' or 'chase'; anything else is 'start') from the
 * seed and returns the frozen state for main.js to paint.
 */
export function stageShot(name, seed, { createGame, stepGame }) {
  const state = createGame(seed);
  state.screen = 'playing';
  if (name === 'drive') return stageDrive(state, stepGame);
  if (name === 'chase') return stageChase(state, stepGame);
  return stageStart(state, stepGame);
}
