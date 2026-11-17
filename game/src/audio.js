// Palm City Heat — synthesized sound, no audio files.
// Everything is WebAudio oscillators and filtered noise: a two-stroke engine
// hum tied to car speed, a two-tone siren, tyre screech, gunshot crack,
// pickup chime, melee thud and UI blips. The context is created lazily on the
// first user gesture (browser autoplay policy). In headless environments the
// whole module quietly no-ops.

export class SoundFX {
  constructor(win) {
    this.win = win || null;
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
  }

  // Call from a click/keypress handler. Safe to call repeatedly.
  unlock() {
    if (this.ctx || !this.win) return;
    const AC = this.win.AudioContext || this.win.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  tone(freq, dur, type = 'square', vol = 0.2, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.3, freq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  shot() {
    this.noise(0.14, 0.5, 900);
    this.tone(160, 0.1, 'sawtooth', 0.25, 60);
  }

  melee() {
    this.noise(0.08, 0.3, 400);
    this.tone(90, 0.08, 'sine', 0.3, 50);
  }

  pickup() {
    this.tone(660, 0.09, 'square', 0.16);
    setTimeout(() => this.tone(990, 0.12, 'square', 0.16), 60);
  }

  cash() {
    this.tone(880, 0.07, 'triangle', 0.2);
    setTimeout(() => this.tone(1320, 0.1, 'triangle', 0.2), 55);
  }

  crash() {
    this.noise(0.22, 0.45, 500);
  }

  screech() {
    this.noise(0.18, 0.12, 2600);
  }

  dialogue() {
    this.tone(520, 0.05, 'square', 0.08);
  }

  fail() {
    this.tone(220, 0.35, 'sawtooth', 0.2, 110);
  }

  success() {
    this.tone(523, 0.1, 'triangle', 0.2);
    setTimeout(() => this.tone(784, 0.16, 'triangle', 0.2), 90);
  }

  // Continuous engine loop while the player drives; speed 0..1.
  engine(speed, active) {
    if (!this.ctx) return;
    if (active && !this.muted) {
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineGain.gain.value = 0.0;
        this.engineOsc.connect(this.engineGain).connect(this.master);
        this.engineOsc.start();
      }
      this.engineOsc.frequency.value = 55 + speed * 130;
      this.engineGain.gain.value = 0.05 + speed * 0.05;
    } else if (this.engineOsc) {
      this.engineGain.gain.value = 0;
    }
  }

  // Two-tone siren while police are near and the player is wanted.
  siren(active, dt) {
    if (!this.ctx) return;
    if (active && !this.muted) {
      if (!this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenGain = this.ctx.createGain();
        this.sirenOsc.type = 'triangle';
        this.sirenGain.gain.value = 0.035;
        this.sirenOsc.connect(this.sirenGain).connect(this.master);
        this.sirenOsc.start();
      }
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.42) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.value = this.sirenHigh ? 880 : 660;
      }
    } else if (this.sirenOsc) {
      this.sirenGain.gain.value = 0;
    }
  }
}
