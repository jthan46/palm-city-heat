// missions.js — the story of Palm City Heat: Kai Mercer, a broke courier at
// the Sunset Palms Motel, takes jobs from fixer Solana "Sol" Reyes to climb
// out of debt. Four story missions, then endless odd jobs.
// One job: mission definitions, the active-mission state machine, stage
// timers, dialogue, payouts and fail states.

import { poiById, dist } from './world.js';
import { makeCar } from './vehicles.js';
import { setHeat } from './police.js';

export const CONTACT = 'Sol Reyes';

// Story missions. startPoi: where the job is picked up. Stages run in order;
// a stage completes when the player reaches (x,y) within r — deliverCar also
// requires arriving in the mission car. timeLimit counts down per stage.
export const STORY = [
  {
    id: 'first-run',
    title: 'First Run',
    startPoi: 'cafe',
    payout: 450,
    intro: [
      'Sol: Kai. You owe the motel, you owe me, and your van is a lawn ornament.',
      'Sol: Simple job. Mercado Sol has a package for me — pick it up, take it to Harbor Tower.',
      'Sol: The clock starts when the package is in your hands. Move.',
    ],
    stages: [
      { kind: 'pickup', poi: 'market', r: 44, label: 'Pick up the package at Mercado Sol' },
      { kind: 'goto', poi: 'office', r: 48, label: 'Deliver to Harbor Tower', timeLimit: 150 },
    ],
    outro: 'Sol: Clean and quick. There may be hope for you yet.',
  },
  {
    id: 'golden-coupe',
    title: 'The Golden Coupe',
    startPoi: 'cafe',
    payout: 800,
    intro: [
      'Sol: A guest at Hotel Brisa skipped out on a very large tab.',
      'Sol: His golden coupe sits in the hotel lot. Take it to Tito at Andrade Auto.',
      'Sol: Tito pays for the car, not for a story. Bring it in one piece.',
    ],
    stages: [
      { kind: 'goto', poi: 'hotel', r: 60, label: 'Go to the Hotel Brisa parking lot' },
      { kind: 'deliverCar', poi: 'garage', r: 58, label: 'Deliver the golden coupe to Andrade Auto' },
    ],
    outro: 'Tito: Ha! She still shines. Sol said you were a driver — she undersold it.',
  },
  {
    id: 'hot-stash',
    title: 'Hot Stash',
    startPoi: 'cafe',
    payout: 1100,
    intro: [
      'Sol: Change of plans. A stash under the park pavilion needs to move. Now.',
      'Sol: The second you touch it, every badge in Palm City will smell it.',
      'Sol: Lose them and get to the Sunset Palms Motel. Do not get caught holding it.',
    ],
    stages: [
      { kind: 'goto', poi: 'pavilion', r: 40, label: 'Grab the stash at the pavilion', armHeat: 75 },
      { kind: 'escape', poi: 'motel', r: 58, label: 'Reach the Sunset Palms Motel safehouse' },
    ],
    outro: 'Sol: You walked out of a three-star welcome party. I am officially impressed.',
  },
  {
    id: 'palm-city-run',
    title: 'The Palm City Run',
    startPoi: 'cafe',
    payout: 1600,
    intro: [
      'Sol: Last one, and it is a big one. Three drops, one evening, whole city.',
      'Sol: Coral Tower, Hotel Brisa, the Maple Street house — then home to the motel.',
      'Sol: Finish this and your debt is a story you tell, not a number you owe.',
    ],
    stages: [
      { kind: 'goto', poi: 'tower', r: 48, label: 'Drop 1: Coral Tower', timeLimit: 110 },
      { kind: 'goto', poi: 'hotel', r: 54, label: 'Drop 2: Hotel Brisa', timeLimit: 130 },
      { kind: 'goto', poi: 'house', r: 48, label: 'Drop 3: Maple Street House', timeLimit: 130 },
      { kind: 'goto', poi: 'motel', r: 54, label: 'Finish at the Sunset Palms Motel', timeLimit: 120 },
    ],
    outro: 'Sol: Debt cleared, courier. Palm City is yours now — the jobs keep coming if you want them.',
  },
];

export function createMissionState() {
  return {
    storyIndex: 0, // next story mission to offer
    active: null, // { def, stageIndex, timeLeft, car }
    dialogue: [], // queued lines [{who, text}]
    dialogueTimer: 0,
    banner: '',
    bannerTimer: 0,
    jobsDone: 0,
    storyDone: false,
    job: null, // current repeatable odd job definition, when offered
  };
}

function stagePoint(game, stage) {
  const poi = poiById(game.world, stage.poi);
  return { x: poi.x, y: poi.y };
}

export function availableMission(game) {
  const ms = game.missions;
  if (ms.active) return null;
  if (ms.storyIndex < STORY.length) return STORY[ms.storyIndex];
  return ms.job;
}

export function availablePoint(game) {
  const def = availableMission(game);
  if (!def) return null;
  const poi = poiById(game.world, def.startPoi);
  return { x: poi.x, y: poi.y, def };
}

export function currentObjective(game) {
  const ms = game.missions;
  if (ms.active) {
    const stage = ms.active.def.stages[ms.active.stageIndex];
    const pt = stagePoint(game, stage);
    const d = Math.round(dist(game.player.x, game.player.y, pt.x, pt.y) / 10);
    let text = stage.label + '  ·  ' + d + 'm';
    if (ms.active.timeLeft !== null) text += '  ·  ' + Math.ceil(ms.active.timeLeft) + 's';
    return text;
  }
  const avail = availablePoint(game);
  if (avail) {
    const d = Math.round(dist(game.player.x, game.player.y, avail.x, avail.y) / 10);
    return 'New job: ' + avail.def.title + '  ·  ' + d + 'm';
  }
  return 'Free roam — Palm City is yours';
}

export function currentMarker(game) {
  const ms = game.missions;
  if (ms.active) {
    const stage = ms.active.def.stages[ms.active.stageIndex];
    if (stage.kind === 'deliverCar' && ms.active.car && !game.player.inCar) {
      return { x: ms.active.car.x, y: ms.active.car.y, color: '#e8b93b' };
    }
    const pt = stagePoint(game, stage);
    return { x: pt.x, y: pt.y, color: '#ffb347' };
  }
  const avail = availablePoint(game);
  if (avail) return { x: avail.x, y: avail.y, color: '#7fe08a' };
  return null;
}

function queueDialogue(ms, lines) {
  for (const line of lines) {
    const split = line.indexOf(':');
    ms.dialogue.push({ who: line.slice(0, split), text: line.slice(split + 1).trim() });
  }
  ms.dialogueTimer = 0;
}

export function startMission(game, def) {
  const ms = game.missions;
  ms.active = { def, stageIndex: 0, timeLeft: null, car: null };
  queueDialogue(ms, def.intro);
  setStage(game, 0);
  game.audio.pickup();
}

function setStage(game, idx) {
  const ms = game.missions;
  const stage = ms.active.def.stages[idx];
  ms.active.stageIndex = idx;
  ms.active.timeLeft = stage.timeLimit || null;
  // The golden coupe appears in the Hotel Brisa lot when its mission starts.
  if (ms.active.def.id === 'golden-coupe' && idx === 0 && !ms.active.car) {
    const car = makeCar(game.rng, 3961, 1401, 'mission', 'sport');
    car.color = '#e8b93b';
    car.angle = Math.PI / 2;
    car.driver = false;
    ms.active.car = car;
    game.cars.push(car);
  }
}

export function completeMission(game) {
  const ms = game.missions;
  const def = ms.active.def;
  game.player.cash += def.payout;
  ms.jobsDone += 1;
  queueDialogue(ms, [def.outro]);
  ms.banner = def.title + ' complete  ·  +$' + def.payout;
  ms.bannerTimer = 4;
  game.audio.missionGood();
  game.addFloater(game.player.x, game.player.y - 24, '+$' + def.payout, '#7fe08a');
  ms.active = null;
  if (def.id === STORY[STORY.length - 1].id) ms.storyDone = true;
  if (STORY.includes(def)) ms.storyIndex += 1;
  if (def.id === 'odd-job') ms.job = makeOddJob(game);
  if (ms.storyIndex >= STORY.length && !ms.job) ms.job = makeOddJob(game);
  game.saveGame();
}

export function failMission(game, reason) {
  const ms = game.missions;
  if (!ms.active) return;
  ms.banner = ms.active.def.title + ' failed — ' + reason;
  ms.bannerTimer = 4;
  game.audio.missionBad();
  if (ms.active.car && ms.active.car.kind === 'mission') {
    ms.active.car.kind = 'parked'; // the coupe stays in the world as a normal car
  }
  ms.active = null;
}

// Repeatable work once the story is done (and it refreshes after each job).
export function makeOddJob(game) {
  const rng = game.rng;
  const places = ['market', 'office', 'hotel', 'tower', 'house', 'garage', 'cafe', 'pavilion'];
  const from = rng.pick(places);
  let to = rng.pick(places);
  if (to === from) to = 'motel';
  const a = poiById(game.world, from);
  const b = poiById(game.world, to);
  const d = dist(a.x, a.y, b.x, b.y);
  return {
    id: 'odd-job',
    title: 'Odd Job',
    startPoi: from,
    payout: Math.round(120 + d / 6),
    intro: ['Sol: Quick run, no questions. Pick up at ' + a.name + ', drop at ' + b.name + '.'],
    stages: [
      { kind: 'pickup', poi: from, r: 46, label: 'Pick up at ' + a.name },
      { kind: 'goto', poi: to, r: 52, label: 'Drop at ' + b.name, timeLimit: Math.round(60 + d / 22) },
    ],
    outro: 'Sol: Paid. Another one is on the board when you want it.',
  };
}

export function updateMissions(game, dt) {
  const ms = game.missions;
  if (ms.bannerTimer > 0) ms.bannerTimer -= dt;
  if (ms.dialogue.length > 0) {
    ms.dialogueTimer += dt;
    if (ms.dialogueTimer > 4.2) {
      ms.dialogue.shift();
      ms.dialogueTimer = 0;
    }
  }
  const p = game.player;
  if (!ms.active) {
    // Standing in the green marker starts the offered job.
    const avail = availablePoint(game);
    if (avail && dist(p.x, p.y, avail.x, avail.y) < 34 && !p.inCar) {
      startMission(game, avail.def);
    } else if (avail && dist(p.x, p.y, avail.x, avail.y) < 40 && p.inCar) {
      // Driving through also works — jobs should never feel gated.
      startMission(game, avail.def);
    }
    return;
  }
  const stage = ms.active.def.stages[ms.active.stageIndex];
  if (ms.active.timeLeft !== null) {
    ms.active.timeLeft -= dt;
    if (ms.active.timeLeft <= 0) {
      failMission(game, 'out of time');
      return;
    }
  }
  if (stage.kind === 'deliverCar') {
    const car = ms.active.car;
    if (!car || car.dead) {
      failMission(game, 'the coupe was wrecked');
      return;
    }
    const pt = stagePoint(game, stage);
    if (p.inCar === car && dist(p.x, p.y, pt.x, pt.y) < stage.r) {
      advanceStage(game);
    }
    return;
  }
  const pt = stagePoint(game, stage);
  if (dist(p.x, p.y, pt.x, pt.y) < stage.r) {
    advanceStage(game);
  }
}

function advanceStage(game) {
  const ms = game.missions;
  const doneStage = ms.active.def.stages[ms.active.stageIndex];
  // Grabbing the stash is the moment the heat arrives.
  if (doneStage.armHeat) setHeat(game, doneStage.armHeat);
  const next = ms.active.stageIndex + 1;
  game.audio.cash();
  if (next >= ms.active.def.stages.length) {
    completeMission(game);
  } else {
    setStage(game, next);
  }
}
