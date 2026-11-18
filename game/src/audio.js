// Palm City Heat — sound, all synthesized with WebAudio: no audio files, nothing to load.
// A lazy AudioContext wakes on the first key or click; every function here is a safe no-op
// before that (and in the headless tests, where there is no audio at all).

let ctx = null;
let master = null;
let muted = false;
let engineNodes = null;
let sirenNodes = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!AC) return;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function toggleMute() {
  muted = !muted;
  if (master && ctx) master.gain.setValueAtTime(muted ? 0 : 0.5, ctx.currentTime);
  return muted;
}

export function isMuted() { return muted; }

function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, vol = 0.25, freq = 1200, delay = 0) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
}

/** One-shot effects, named by the event that caused them. */
export function sfx(name, opt = 0) {
  if (!ctx) return;
  switch (name) {
    case 'gunshot': noise(0.14, 0.5, 2600); tone(150, 0.1, 'square', 0.18, 55); break;
    case 'melee': noise(0.07, 0.22, 700); break;
    case 'crash': noise(0.28, 0.4, 420); tone(70, 0.25, 'sine', 0.3, 38); break;
    case 'carcrash': noise(0.2, 0.34, 650); tone(96, 0.18, 'triangle', 0.22, 50); break;
    case 'pickup': tone(660, 0.09, 'sine', 0.2); tone(990, 0.12, 'sine', 0.18, null, 0.07); break;
    case 'cash': tone(880, 0.07, 'square', 0.1); tone(1320, 0.1, 'square', 0.09, null, 0.06); break;
    case 'mission': [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', 0.2, null, i * 0.1)); break;
    case 'fail': tone(330, 0.22, 'sawtooth', 0.14, 196); tone(196, 0.3, 'sawtooth', 0.12, 130, 0.16); break;
    case 'busted': [392, 392, 311].forEach((f, i) => tone(f, 0.2, 'square', 0.13, null, i * 0.17)); break;
    case 'wasted': tone(220, 0.7, 'sawtooth', 0.16, 55); break;
    case 'enter': tone(196, 0.08, 'sine', 0.16, 147); break;
    case 'exit': tone(147, 0.08, 'sine', 0.14, 196); break;
    case 'screech': noise(0.22, 0.1 + Math.min(0.16, opt), 3400); break;
    case 'dialogue': tone(520, 0.06, 'sine', 0.1); break;
    default: break;
  }
}

/** The engine loop follows the player's car; silent on foot. */
export function setEngine(on, speedNorm = 0) {
  if (!ctx || !master) return;
  if (on && !engineNodes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    osc.connect(filter).connect(gain).connect(master);
    osc.start();
    engineNodes = { osc, gain };
  }
  if (engineNodes) {
    const t = ctx.currentTime;
    engineNodes.osc.frequency.setTargetAtTime(50 + speedNorm * 130, t, 0.08);
    engineNodes.gain.gain.setTargetAtTime(on ? 0.05 + speedNorm * 0.05 : 0, t, 0.1);
  }
}

/** The two-tone siren swells as the nearest interceptor closes in. */
export function setSiren(on, closeness = 0) {
  if (!ctx || !master) return;
  if (on && !sirenNodes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 830;
    lfo.frequency.value = 0.7;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.value = 0;
    osc.connect(gain).connect(master);
    osc.start();
    lfo.start();
    sirenNodes = { osc, gain, lfo };
  }
  if (sirenNodes) {
    sirenNodes.gain.gain.setTargetAtTime(on ? 0.012 + closeness * 0.05 : 0, ctx.currentTime, 0.15);
  }
}
