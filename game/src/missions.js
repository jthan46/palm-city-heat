// Palm City Heat — the story: Marisol Vega's jobs for a courier who owes her, told as a
// chain of four missions plus endless courier work after. A small state machine — idle at
// the bar, dialogue on offer, stages while active — with map markers, timers, fail states
// and cash payouts. Drawing the dialogue and markers is render.js's job; this module owns
// the plot and the rules.

import { setStars, clearWanted } from './police.js';
import { spawnGoldCoupe } from './vehicles.js';
import { floatText } from './combat.js';
import { randomRoadPoint } from './world.js';

export const CONTACT = 'Marisol Vega';
export const PLAYER_NAME = 'Cleo Marchetti';

const STORY = [
  {
    title: 'Hot Package',
    pay: 300,
    intro: [
      'Marisol: Cleo. You owe me for the van, so you work. Simple maths.',
      'Marisol: A package is sitting in a downtown alley, and Diner Solano wants it before the ice melts.',
      'Marisol: Pick it up, drive it south, do not open it. Especially do not open it.',
    ],
    outro: ['Marisol: Delivered, unopened, and only slightly illegal. We are getting somewhere.'],
    stages: [
      { kind: 'goto', x: 1680, y: 984, label: 'Pick up the package downtown' },
      { kind: 'goto', x: 2160, y: 1900, label: 'Deliver to Diner Solano', time: 150 },
    ],
  },
  {
    title: 'Borrowed Wheels',
    pay: 500,
    intro: [
      'Marisol: A guest at Hotel Brisa leaves tomorrow. His gold coupe, sadly, leaves tonight.',
      "Marisol: Take it to Rudy's Chop Shop in the suburbs. Rudy asks no questions. Neither do I.",
      'Marisol: If the car dies, the deal dies. Drive it like you borrowed it. Because you did.',
    ],
    outro: ['Marisol: Rudy is thrilled. The guest will be... philosophical. Good work.'],
    stages: [
      { kind: 'goto', x: 2208, y: 504, label: 'Reach Hotel Brisa' },
      { kind: 'steal', label: 'Steal the gold coupe' },
      { kind: 'deliverCar', x: 264, y: 1900, label: "Deliver the coupe to Rudy's" },
    ],
  },
  {
    title: 'Heat Run',
    pay: 700,
    intro: [
      'Marisol: Portside Warehouse. A stash that needs to not be there when the auditors come.',
      'Marisol: The moment you grab it, every patrol in Palm City will know your face.',
      'Marisol: So run. The beach safehouse, north end. Do not stop to sightsee.',
    ],
    outro: ['Marisol: Three stars and you still made it home. The city is learning your name.'],
    stages: [
      { kind: 'goto', x: 72, y: 2064, label: 'Grab the stash at Portside Warehouse', armHeat: true },
      { kind: 'goto', x: 2472, y: 300, label: 'Escape to the beach safehouse', clearHeat: true },
    ],
  },
  {
    title: 'Palm City Run',
    pay: 1000,
    intro: [
      'Marisol: Last job, then your debt is ash. Three drops, one evening, whole city.',
      'Marisol: Old Town, Downtown, South Beach. The clock is not your friend.',
      'Marisol: Finish it, Cleo, and Palm City owes YOU for a change.',
    ],
    outro: ['Marisol: Debt paid in full. Stay for courier work any time — the bar is always open.'],
    stages: [
      { kind: 'goto', x: 264, y: 504, label: 'Checkpoint: Old Town', time: 240 },
      { kind: 'goto', x: 1680, y: 1464, label: 'Checkpoint: Downtown' },
      { kind: 'goto', x: 2472, y: 1900, label: 'Checkpoint: South Beach' },
    ],
  },
];

export function createMissionState() {
  return {
    index: 0,            // next story mission; >= STORY.length means courier mode
    phase: 'idle',       // 'idle' | 'offer' | 'active'
    stageIdx: 0,
    timer: null,         // seconds left on the current stage, or null
    dialogue: null,      // { lines, idx, onDone } while talking
    targetCarId: null,
    courier: null,       // generated job while in courier mode
    title: '',
    pay: 0,
  };
}

function currentDef(state) {
  const m = state.mission;
  if (m.index < STORY.length) return STORY[m.index];
  return m.courier;
}

function currentStage(state) {
  const def = currentDef(state);
  if (!def || state.mission.phase !== 'active') return null;
  return def.stages[state.mission.stageIdx] || null;
}

/** Where the gold marker belongs right now, or null when there is nothing to point at. */
export function currentMarker(state) {
  const m = state.mission;
  const contact = state.world.pois.contact;
  if (m.phase === 'idle' || m.phase === 'offer') return { x: contact.x, y: contact.y };
  const stage = currentStage(state);
  if (!stage) return null;
  if (stage.kind === 'steal') {
    const car = state.cars.find((c) => c.id === m.targetCarId);
    return car ? { x: car.x, y: car.y } : null;
  }
  return { x: stage.x, y: stage.y };
}

/** The one-line objective the HUD shows. */
export function currentObjective(state) {
  const m = state.mission;
  if (m.dialogue) return 'Talking to Marisol…';
  if (m.phase === 'offer') return `Talk to ${CONTACT}`;
  if (m.phase === 'active') {
    const stage = currentStage(state);
    if (!stage) return '';
    const marker = currentMarker(state);
    const dist = marker ? Math.round(Math.hypot(marker.x - state.player.x, marker.y - state.player.y) / 10) : 0;
    return `${m.title}: ${stage.label} · ${dist}m`;
  }
  return m.index < STORY.length ? `See ${CONTACT} at the boardwalk bar` : `See ${CONTACT} for courier work`;
}

/** Opens the offer dialogue when the player talks to Marisol. */
export function talkToContact(state) {
  const m = state.mission;
  if (m.phase !== 'idle') return;
  if (m.index >= STORY.length && !m.courier) makeCourier(state);
  const def = currentDef(state);
  m.phase = 'offer';
  m.dialogue = { lines: def.intro.slice(), idx: 0, onDone: 'accept' };
  state.events.push({ type: 'dialogue', x: state.player.x, y: state.player.y });
}

/** Advances an open dialogue; at the end, an offer becomes the active mission. */
export function advanceDialogue(state) {
  const m = state.mission;
  if (!m.dialogue) return;
  m.dialogue.idx += 1;
  state.events.push({ type: 'dialogue', x: state.player.x, y: state.player.y });
  if (m.dialogue.idx < m.dialogue.lines.length) return;
  const onDone = m.dialogue.onDone;
  m.dialogue = null;
  if (onDone === 'accept') acceptMission(state);
}

function acceptMission(state) {
  const m = state.mission;
  const def = currentDef(state);
  m.phase = 'active';
  m.stageIdx = 0;
  m.title = def.title;
  m.pay = def.pay;
  m.timer = def.stages[0].time || null;
  if (def === STORY[1]) {
    const car = spawnGoldCoupe(state);
    m.targetCarId = car.id;
  }
}

function makeCourier(state) {
  const m = state.mission;
  const target = randomRoadPoint(state.rng, state.world.pois.contact.x, state.world.pois.contact.y, 750);
  const dist = Math.hypot(target.x - state.world.pois.contact.x, target.y - state.world.pois.contact.y);
  m.courier = {
    title: 'Courier Run',
    pay: 120 + Math.round(dist / 12),
    intro: ['Marisol: Another envelope, another friend across town. The clock, as ever, is rude.'],
    outro: ['Marisol: Quick hands. The envelope thanks you.'],
    stages: [{ kind: 'goto', x: target.x, y: target.y, label: 'Make the delivery', time: Math.round(dist / 9) + 25 }],
  };
}

function failMission(state, reason) {
  const m = state.mission;
  m.phase = 'idle';
  m.stageIdx = 0;
  m.timer = null;
  m.targetCarId = null;
  if (m.index >= STORY.length) m.courier = null;
  m.dialogue = { lines: [`Marisol: ${reason}`], idx: 0, onDone: 'close' };
  state.events.push({ type: 'missionfail', x: state.player.x, y: state.player.y });
}

/** Called when the run ends badly mid-mission: the job is blown. */
export function onPlayerDown(state) {
  if (state.mission.phase === 'active') {
    failMission(state, 'You went down with my cargo in play. We start that one over.');
  }
}

function completeMission(state) {
  const m = state.mission;
  const def = currentDef(state);
  state.player.cash += def.pay;
  floatText(state, state.player.x, state.player.y - 24, `+$${def.pay}`, '#9be15d');
  state.events.push({ type: 'missioncomplete', x: state.player.x, y: state.player.y, pay: def.pay });
  m.dialogue = { lines: def.outro.slice(), idx: 0, onDone: 'close' };
  m.phase = 'idle';
  m.stageIdx = 0;
  m.timer = null;
  m.targetCarId = null;
  if (m.index < STORY.length) m.index += 1;
  else m.courier = null;
}

function advanceStage(state) {
  const m = state.mission;
  const def = currentDef(state);
  const stage = def.stages[m.stageIdx];
  if (stage.armHeat) setStars(state, 3);
  if (stage.clearHeat) clearWanted(state);
  state.events.push({ type: 'stage', x: state.player.x, y: state.player.y });
  m.stageIdx += 1;
  if (m.stageIdx >= def.stages.length) {
    completeMission(state);
    return;
  }
  const next = def.stages[m.stageIdx];
  m.timer = next.time || (def.stages[0].time && m.stageIdx > 0 ? m.timer : null);
  // A timer set on stage 0 of a timed run carries across its later stages.
  if (def.stages[0].time && m.stageIdx > 0 && next.time == null) m.timer = m.timer ?? def.stages[0].time;
}

/** Stage checks and timers, run once per simulation step. */
export function updateMissions(state, dt) {
  const m = state.mission;
  if (m.phase !== 'active') return;
  const stage = currentStage(state);
  if (!stage) return;
  if (m.timer != null) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(state, 'Out of time. The job rots, and so does my patience. Again — faster.');
      return;
    }
  }
  const p = state.player;
  if (stage.kind === 'goto') {
    if (Math.hypot(p.x - stage.x, p.y - stage.y) < 54) advanceStage(state);
  } else if (stage.kind === 'steal') {
    if (p.car && p.car.id === m.targetCarId) advanceStage(state);
  } else if (stage.kind === 'deliverCar') {
    const car = state.cars.find((c) => c.id === m.targetCarId);
    if (!car || car.hp <= 0) {
      failMission(state, 'The coupe is scrap. Rudy pays for cars, not for modern art.');
      return;
    }
    if (p.car && p.car.id === m.targetCarId && Math.hypot(p.x - stage.x, p.y - stage.y) < 64) advanceStage(state);
  }
}
