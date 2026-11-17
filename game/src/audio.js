// Palm City Heat — synthesized sound.
// One job: every sound effect, made from raw oscillators and noise — no audio
// files. Without an AudioContext (headless test, muted browser) it is silent.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineNodes = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (muted || !ensure()) return;
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
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
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

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
    gunshot() { noise(0.14, 0.5, 3000); tone(160, 0.1, 'square', 0.25, 60); },
    melee() { noise(0.07, 0.3, 700); },
    hit() { noise(0.1, 0.35, 500); tone(90, 0.12, 'sine', 0.3, 50); },
    crash(intensity = 1) { noise(0.22 * intensity, 0.4, 900); tone(70, 0.2, 'sawtooth', 0.2, 40); },
    pickup() { tone(660, 0.08, 'sine', 0.22); tone(990, 0.12, 'sine', 0.22, null, 0.07); },
    cash() { tone(880, 0.07, 'triangle', 0.25); tone(1320, 0.1, 'triangle', 0.2, null, 0.05); },
    door() { tone(220, 0.06, 'square', 0.15, 180); noise(0.05, 0.12, 1500, 0.03); },
    bust() { tone(392, 0.16, 'square', 0.25); tone(311, 0.16, 'square', 0.25, null, 0.16); tone(233, 0.3, 'square', 0.25, null, 0.32); },
    wasted() { tone(330, 0.5, 'sawtooth', 0.2, 55); },
    mission() { tone(523, 0.1, 'triangle', 0.25); tone(659, 0.1, 'triangle', 0.25, null, 0.09); tone(784, 0.16, 'triangle', 0.25, null, 0.18); },
    dialogue() { tone(740, 0.05, 'sine', 0.12); },
    // Looping-ish one-shots the game re-triggers while conditions hold.
    siren(step) {
      // Two-tone wail, one note every 26 steps while a chase is live.
      if (step % 26 === 0) tone(700 + (Math.floor(step / 26) % 2) * 250, 0.24, 'sine', 0.07);
    },
    screech() { tone(1400, 0.18, 'sawtooth', 0.08, 700); },
    engine(speedRatio, step) {
      if (muted || !ensure()) return;
      if (step % 6 !== 0) return;
      tone(55 + speedRatio * 90, 0.09, 'sawtooth', 0.05 + speedRatio * 0.05);
    },
  };
}
