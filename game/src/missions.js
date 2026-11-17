// Palm City Heat — the story.
// One job: Vivian "Vivi" Solano's four jobs (and the courier work after),
// their dialogue, markers, timers, payouts and fail states. Everything the
// HUD calls "the objective" is decided here.

import { HEAT } from './config.js';
import { dist2 } from './random.js';

const CONTACT = 'contact';

function loc(state, id) {
  return state.city.locations[id];
}

export const STORY = [
  {
    id: 'm1',
    title: 'Hot Package',
    pay: 450,
    intro: [
      ['Vivi', 'You must be the new wheel in Palm City. I am Vivi. I move things that do not like paperwork.'],
      ['Vivi', 'Simple first job: a package is waiting at the Marina Warehouse. Bring it to my friend at the Seabreeze Diner.'],
      ['Vivi', 'And chico — the clock is part of the deal. Do not keep the diner waiting.'],
    ],
    phases: [
      { kind: 'goto', at: 'warehouse', label: 'Pick up the package at the Marina Warehouse', time: 150 },
      { kind: 'goto', at: 'diner', label: 'Deliver the package to the Seabreeze Diner', time: 120 },
    ],
    outro: 'Vivi texts: "Clean work. The city is already talking about you."',
  },
  {
    id: 'm2',
    title: 'Golden Hour Getaway',
    pay: 800,
    intro: [
      ['Vivi', 'A gold coupe is parked at the Aurelia Hotel valet, and its owner owes me more than money.'],
      ['Vivi', 'Take it. Drive it to Sal\'s Chop Shop in the suburbs. Sal pays cash, no questions.'],
      ['Vivi', 'Try not to fold it in half on the way. Sal pays less for origami.'],
    ],
    phases: [
      { kind: 'steal', at: 'aurelia', label: 'Steal the gold coupe at the Aurelia Hotel' },
      { kind: 'deliverCar', at: 'chopshop', label: 'Deliver the coupe to Sal\'s Chop Shop' },
    ],
    outro: 'Sal counts out the cash himself. "Vivi\'s new driver," he says. "Huh."',
  },
  {
    id: 'm3',
    title: 'Heat Wave',
    pay: 1100,
    intro: [
      ['Vivi', 'Club Del Mar holds a stash for me. The pickup is easy. What follows is not.'],
      ['Vivi', 'The club has silent alarms and loud friends. When it goes off, every cop in Palm City will want your autograph.'],
      ['Vivi', 'Lose them, then lie low at the Palm Court Safehouse by the park. Survive it, and we are partners.'],
    ],
    phases: [
      { kind: 'goto', at: 'beachclub', label: 'Pick up the stash at Club Del Mar', alarm: true },
      { kind: 'escape', at: 'safehouse', label: 'Lose the heat, then reach the Palm Court Safehouse' },
    ],
    outro: 'You made it. Vivi pours two drinks over the phone: "Partners, then."',
  },
  {
    id: 'm4',
    title: 'Palm City Run',
    pay: 1600,
    intro: [
      ['Vivi', 'Last job, partner. Three drops, one tank of daylight: Sunset Arms, Palm City General, then the Marina Warehouse.'],
      ['Vivi', 'Every fixer in the county is watching this run. Make us legends or make us bail money.'],
    ],
    phases: [
      { kind: 'goto', at: 'gunshop', label: 'Drop 1 of 3: Sunset Arms', time: 240 },
      { kind: 'goto', at: 'hospital', label: 'Drop 2 of 3: Palm City General' },
      { kind: 'goto', at: 'warehouse', label: 'Drop 3 of 3: Marina Warehouse' },
    ],
    outro: 'Three drops, no dents in the legend. Palm City is yours now — Vivi splits everything 60/40. Her favour.',
  },
];

export function newMissionState() {
  return {
    storyIndex: 0, // next story mission to offer
    active: null, // { def, phaseIndex, timer, carId }
    dialogue: null, // { speaker lines, i, then: 'activate' }
    done: false, // story finished
  };
}

function banner(state, text, sub = '') {
  state.banner = { text, sub, t: state.tick };
}

function startDialogue(state, def) {
  state.mission.dialogue = { lines: def.intro, i: 0, def };
  state.audio.dialogue();
}

export function currentTarget(state) {
  const m = state.mission;
  if (m.dialogue) return null;
  if (!m.active) {
    // Between jobs the marker always leads back to Vivi (story or courier work).
    const c = loc(state, CONTACT);
    return c ? { x: c.x, y: c.y, label: 'Vivi — Marlin Hotel' } : null;
  }
  const phase = m.active.def.phases[m.active.phaseIndex];
  const at = loc(state, phase.at);
  return at ? { x: at.x, y: at.y, label: phase.label } : null;
}

export function objectiveText(state) {
  const m = state.mission;
  if (m.dialogue) return 'Talking to Vivi…';
  if (!m.active) {
    if (m.storyIndex < STORY.length) return `Meet Vivi at the Marlin Hotel — "${STORY[m.storyIndex].title}"`;
    return 'Free roam — see Vivi at the Marlin Hotel for courier work';
  }
  const phase = m.active.def.phases[m.active.phaseIndex];
  let text = phase.label;
  if (m.active.timer != null) {
    const s = Math.max(0, Math.ceil(m.active.timer / 60));
    text += ` — ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  return text;
}

// Pressing E near Vivi starts (or retries) the next job.
export function tryInteract(state) {
  const m = state.mission;
  if (m.active || m.dialogue) return false;
  const c = loc(state, CONTACT);
  if (!c) return false;
  if (dist2(state.player.x, state.player.y, c.x, c.y) > 70 * 70) return false;
  if (state.player.inCar) return false;
  if (m.storyIndex < STORY.length) {
    startDialogue(state, STORY[m.storyIndex]);
  } else {
    startDialogue(state, courierDef(state));
  }
  return true;
}

function courierDef(state) {
  const ids = ['warehouse', 'diner', 'aurelia', 'chopshop', 'gunshop', 'hospital', 'beachclub'];
  const at = state.rng.pick(ids);
  const target = loc(state, at);
  const c = loc(state, CONTACT);
  const d = Math.hypot(target.x - c.x, target.y - c.y);
  return {
    id: 'courier',
    title: 'Courier Run',
    pay: 140 + Math.round(d / 12),
    intro: [['Vivi', `Quick one, partner: a parcel for ${target.name}. The meter is running.`]],
    phases: [{ kind: 'goto', at, label: `Deliver to ${target.name}`, time: Math.ceil(d / 55) + 45 }],
    outro: 'Vivi texts: "Pleasure doing business."',
  };
}

function activateMission(state, def) {
  const m = state.mission;
  m.active = { def, phaseIndex: 0, timer: null, carId: null };
  applyPhase(state);
  banner(state, def.title, def.phases[0].label);
  state.audio.mission();
}

function applyPhase(state) {
  const m = state.mission;
  const phase = m.active.def.phases[m.active.phaseIndex];
  m.active.timer = phase.time ? phase.time * 60 : null;
  if (phase.kind === 'steal') {
    // The gold coupe appears at the Aurelia valet stand, keys in, engine warm.
    const at = loc(state, 'aurelia');
    const car = state.spawnSpecialCar(at.x + 30, at.y + 26);
    m.active.carId = car.id;
  }
  if (phase.alarm) {
    state.heat += HEAT.missionAlarm;
    state.lastCrimeAt = state.tick;
    banner(state, 'The alarm trips!', 'Every cop in Palm City just heard that.');
    state.audio.bust();
  }
}

function completeMission(state) {
  const m = state.mission;
  const def = m.active.def;
  state.player.cash += def.pay;
  state.addFloater(state.player.x, state.player.y - 30, `+$${def.pay}`, '#ffd23f');
  banner(state, `${def.title} — complete`, def.outro);
  state.audio.cash();
  state.audio.mission();
  m.active = null;
  if (def.id !== 'courier') {
    m.storyIndex++;
    if (m.storyIndex >= STORY.length) m.done = true;
  }
}

function failMission(state, why) {
  const m = state.mission;
  banner(state, 'Job blown', why);
  state.audio.wasted();
  m.active = null;
}

export function onEnterVehicle(state, vehicle) {
  const m = state.mission;
  if (!m.active) return;
  const phase = m.active.def.phases[m.active.phaseIndex];
  if (phase.kind === 'steal' && vehicle.id === m.active.carId) {
    state.reportCrime('carjack', vehicle.x, vehicle.y);
    advancePhase(state);
  }
}

function advancePhase(state) {
  const m = state.mission;
  m.active.phaseIndex++;
  if (m.active.phaseIndex >= m.active.def.phases.length) {
    completeMission(state);
    return;
  }
  applyPhase(state);
  const phase = m.active.def.phases[m.active.phaseIndex];
  banner(state, m.active.def.title, phase.label);
}

export function updateMissions(state, input) {
  const m = state.mission;

  // Dialogue: E / click / Enter walks the lines, then the job activates.
  if (m.dialogue) {
    if (input.interact || input.confirmPressed || input.attackPressed) {
      m.dialogue.i++;
      state.audio.dialogue();
      if (m.dialogue.i >= m.dialogue.lines.length) {
        const def = m.dialogue.def;
        m.dialogue = null;
        activateMission(state, def);
      }
    }
    return;
  }
  if (!m.active) return;

  const phase = m.active.def.phases[m.active.phaseIndex];
  if (m.active.timer != null) {
    m.active.timer--;
    if (m.active.timer <= 0) {
      failMission(state, 'Out of time. Vivi hates waiting, and so does the money.');
      return;
    }
  }

  const at = loc(state, phase.at);
  const near = at && dist2(state.player.x, state.player.y, at.x, at.y) < 78 * 78;

  if (phase.kind === 'goto' && near) {
    advancePhase(state);
  } else if (phase.kind === 'deliverCar') {
    const car = state.vehicles.find((v) => v.id === m.active.carId);
    if (!car || car.wrecked) {
      failMission(state, 'The coupe is wrecked. Sal wanted a car, not a confession.');
      return;
    }
    if (near && state.player.inCar === m.active.carId) advancePhase(state);
  } else if (phase.kind === 'escape') {
    if (near) {
      if (state.wanted === 0) advancePhase(state);
      else if (state.tick % 240 === 0) state.addFloater(at.x, at.y - 24, 'Too hot — lose the cops first!', '#ff5d5d');
    }
  }
}
