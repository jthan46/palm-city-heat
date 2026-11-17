// Palm City Heat — story missions.
// Dante Ferro, fixer at the Neon Palms Motel, hands out a four-job chain:
// a timed package run, a stolen golden coupe to deliver, a hot stash to
// escape with, and a three-drop courier grand tour. Between jobs the player
// free-roams; after the chain, Dante always has repeatable courier work.
// Missions are small stage machines (goto / enterCar / hide) with dialogue,
// map markers, HUD objectives, timers and fail states.

import { HEAT_THRESHOLDS } from './config.js';
import { makeMissionCar } from './vehicles.js';
import { addFloater } from './combat.js';

export const CONTACT = {
  name: 'Dante Ferro',
  role: 'Fixer — Neon Palms Motel',
  lines: {
    idle: 'Dante is leaning on the motel rail, watching the traffic melt in the heat.',
  },
};

export function buildStory(world) {
  const L = world.locations;
  return [
    {
      id: 'hot-package',
      title: 'Hot Package',
      payout: 350,
      intro: [
        'Dante: Kid. You look hungry, and I like hungry.',
        'Dante: A package is sitting at the Harborline Warehouse, south-west docks. It gets hotter every minute it sits there.',
        'Dante: Pick it up, bring it back to me at the motel. Clock starts when you touch it. Do not let the PCPD slow you down.',
        'You: Consider it done.',
      ],
      outro: ['Dante: Warm, not burned. I like your style. $350, as agreed.'],
      stages: [
        { kind: 'goto', at: L.warehouse, radius: 40, label: 'Pick up the package at the Harborline Warehouse' },
        { kind: 'goto', at: L.motel, radius: 44, timer: 100, label: 'Deliver the package to Dante — hurry!', arriveText: 'Package delivered' },
      ],
    },
    {
      id: 'golden-hour',
      title: 'Golden Hour',
      payout: 600,
      intro: [
        'Dante: A collector downtown left his golden coupe parked by the towers, keys in, pride out.',
        'Dante: Take it. Drive it to Rudy\u2019s Chop Garage in the suburbs. And kid — bring it back in one piece, the paint is the paycheck.',
        'You: One golden coupe, minimal scratches.',
      ],
      outro: ['Dante: Rudy says the coupe purrs. $600. You are becoming reliable — dangerous habit.'],
      stages: [
        { kind: 'goto', at: { x: world.roadVX[3], y: world.roadHY[2], label: 'Downtown towers' }, radius: 90, label: 'Find the golden coupe downtown' },
        { kind: 'enterCar', label: 'Steal the golden coupe' },
        { kind: 'goto', at: L.garage, radius: 46, needCar: 'gold', label: 'Deliver the coupe to Rudy\u2019s Chop Garage' },
      ],
      onStart(state) {
        const spot = { x: world.roadVX[3] + 34, y: world.roadHY[2] + 16 };
        const car = makeMissionCar(state.rng, 'sports', spot.x, spot.y, 0);
        car.color = '#f2c13c';
        car.gold = true;
        state.cars.push(car);
        state.mission.goldCar = car;
      },
    },
    {
      id: 'heat-escape',
      title: 'Heat Escape',
      payout: 800,
      intro: [
        'Dante: Last favour for an old friend. A stash is taped under the Old Pier, east beach.',
        'Dante: Fair warning — the pier is watched. The second you grab it, every badge in Palm City will smell it.',
        'Dante: Shake them, then get yourself to the Marina Safehouse and lie low until the stars go out. Then we talk money.',
        'You: Grab, run, vanish. Got it.',
      ],
      outro: ['Dante: Ghost work. $800, and my respect — one of those is worth more.'],
      stages: [
        {
          kind: 'goto', at: L.pier, radius: 42, label: 'Grab the stash under the Old Pier',
          onArrive(state) {
            state.heat = Math.max(state.heat, HEAT_THRESHOLDS[2] + 2);
            state.lastCrimeT = state.time;
            addFloater(state, state.player.x, state.player.y - 24, 'The stash was HOT!', '#ff5a4e');
            state.sounds.push('alarm');
          },
        },
        { kind: 'goto', at: L.safehouse, radius: 52, label: 'Escape to the Marina Safehouse' },
        { kind: 'hide', at: L.safehouse, radius: 60, label: 'Lie low at the safehouse until the heat dies' },
      ],
    },
    {
      id: 'grand-tour',
      title: 'Grand Tour',
      payout: 1200,
      intro: [
        'Dante: The big one. Three drops, one tank of daylight left: the warehouse, the front of PCPD Central — yes, really — and the Old Pier.',
        'Dante: One clock for all three. You make it, you are not my runner anymore. You are my partner.',
        'You: Then let\u2019s go be partners.',
      ],
      outro: ['Dante: Three drops, clean clock. Partner. $1,200 — and Palm City is yours now.'],
      sharedTimer: 200,
      stages: [
        { kind: 'goto', at: L.warehouse, radius: 42, label: 'Drop 1 of 3: Harborline Warehouse' },
        { kind: 'goto', at: L.station, radius: 46, label: 'Drop 2 of 3: PCPD Central front steps' },
        { kind: 'goto', at: L.pier, radius: 44, label: 'Drop 3 of 3: the Old Pier' },
      ],
    },
  ];
}

function makeRepeatable(state) {
  const L = state.world.locations;
  const options = [L.warehouse, L.garage, L.pier, L.hospital, L.station];
  const at = options[Math.floor(state.rng.next() * options.length)];
  const dist = Math.hypot(at.x - L.motel.x, at.y - L.motel.y);
  return {
    id: 'courier',
    title: 'Courier Run',
    payout: 250,
    repeatable: true,
    intro: [`Dante: Quick one, partner. A parcel for ${at.label}. Clock is ticking, road is yours.`],
    outro: ['Dante: Fast and clean. $250.'],
    stages: [
      { kind: 'goto', at, radius: 44, timer: Math.round(dist / 9) + 45, label: `Deliver to ${at.label}` },
    ],
  };
}

export function nextMissionDef(state) {
  if (state.storyIdx < state.story.length) return state.story[state.storyIdx];
  return makeRepeatable(state);
}

export function startMission(state) {
  const def = nextMissionDef(state);
  state.mission = {
    def,
    stageIdx: 0,
    timer: def.sharedTimer ?? def.stages[0].timer ?? null,
    goldCar: null,
  };
  if (def.onStart) def.onStart(state);
  setDialogue(state, 'Dante Ferro', def.intro);
  state.sounds.push('dialogue');
}

export function failMission(state, reason) {
  if (!state.mission) return;
  const gold = state.mission.goldCar;
  if (gold && !state.player.inCar?.gold) gold.missionTarget = false;
  state.mission = null;
  setDialogue(state, 'Dante Ferro', [`Dante: ${reason}`, 'Dante: Come back to the motel when you are ready to try again.']);
  state.sounds.push('fail');
}

export function completeMission(state) {
  const def = state.mission.def;
  state.player.cash += def.payout;
  addFloater(state, state.player.x, state.player.y - 26, `+$${def.payout}`, '#8be08b');
  if (!def.repeatable) state.storyIdx += 1;
  if (state.mission.goldCar) {
    const gold = state.mission.goldCar;
    gold.missionTarget = false;
    if (state.player.inCar === gold) {
      // Delivered: Rudy takes the keys.
      state.player.inCar = null;
      gold.driver = null;
      gold.parked = true;
      gold.dead = true;
      state.player.x = gold.x + 30;
      state.player.y = gold.y + 10;
    }
  }
  state.mission = null;
  setDialogue(state, 'Dante Ferro', def.outro);
  state.sounds.push('success');
  state.saveGame();
}

export function setDialogue(state, speaker, lines) {
  state.dialogue = { speaker, lines, idx: 0 };
}

export function advanceDialogue(state) {
  if (!state.dialogue) return;
  state.dialogue.idx += 1;
  state.sounds.push('dialogue');
  if (state.dialogue.idx >= state.dialogue.lines.length) state.dialogue = null;
}

// Per-step mission progression. Sets state.marker and state.objective.
export function updateMissions(state, dt) {
  const L = state.world.locations;
  const m = state.mission;

  if (!m) {
    state.marker = { x: L.motel.x, y: L.motel.y, label: 'Dante — Neon Palms Motel', color: '#ffd23e' };
    state.objective = state.storyIdx < state.story.length
      ? `Meet Dante at the Neon Palms Motel — next job: "${state.story[state.storyIdx].title}"`
      : 'Story complete. Dante at the Neon Palms Motel always has courier work.';
    return;
  }

  const stage = m.def.stages[m.stageIdx];
  if (!stage) return;

  // Timers pause while dialogue is open.
  if (!state.dialogue) {
    if (m.timer !== null && m.timer !== undefined) {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission(state, 'Too slow. The window closed and the deal went cold.');
        return;
      }
    }
  }

  // The golden coupe must survive its delivery run.
  if (m.goldCar && m.stageIdx >= 1 && m.goldCar.health <= 0) {
    failMission(state, 'The coupe is scrap. Rudy pays for shine, not for parts.');
    return;
  }

  const p = state.player;
  if (stage.kind === 'goto') {
    state.marker = { x: stage.at.x, y: stage.at.y, label: stage.at.label, color: '#ffd23e' };
    state.objective = stage.label;
    if (m.timer !== null && m.timer !== undefined) state.objective += ` — ${Math.ceil(m.timer)}s`;
    const at = stage.at;
    const near = Math.hypot(p.x - at.x, p.y - at.y) < stage.radius;
    const carOk = !stage.needCar || (p.inCar && p.inCar.gold);
    if (near && carOk) {
      if (stage.onArrive) stage.onArrive(state);
      if (stage.arriveText) addFloater(state, p.x, p.y - 22, stage.arriveText, '#8be08b');
      advanceStage(state);
    }
  } else if (stage.kind === 'enterCar') {
    const car = m.goldCar;
    if (car) {
      state.marker = { x: car.x, y: car.y, label: 'Golden coupe', color: '#ffd23e' };
      state.objective = stage.label;
      if (p.inCar === car) advanceStage(state);
    }
  } else if (stage.kind === 'hide') {
    state.marker = { x: stage.at.x, y: stage.at.y, label: stage.at.label, color: '#8be08b' };
    const inside = Math.hypot(p.x - stage.at.x, p.y - stage.at.y) < stage.radius;
    state.objective = inside
      ? (state.stars > 0 ? `Lie low… ${state.stars} star${state.stars > 1 ? 's' : ''} still burning` : 'Heat is gone.')
      : stage.label;
    if (inside && state.stars === 0) advanceStage(state);
  }
}

function advanceStage(state) {
  const m = state.mission;
  m.stageIdx += 1;
  const next = m.def.stages[m.stageIdx];
  if (!next) {
    completeMission(state);
    return;
  }
  // A stage can carry its own timer; a shared timer just keeps running.
  if (next.timer !== undefined && m.def.sharedTimer === undefined) m.timer = next.timer;
  else if (m.def.sharedTimer === undefined && m.timer !== null && next.timer === undefined) m.timer = null;
  state.sounds.push('pickup');
}
