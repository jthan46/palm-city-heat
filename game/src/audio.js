// audio.js — synthesized sound effects with WebAudio. No audio files exist;
// every sound is an oscillator or filtered noise burst made on the spot.
// One job: engine, screech, siren, gunshot, crash, pickup and UI sounds,
// behind a mute switch, and silent when no AudioContext is available
// (headless tests, or before the player's first click).

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenPhase = 0;
  }

  // Browsers only allow audio after a user gesture; call from click/keydown.
  unlock() {
    if (this.ctx || typeof window === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext;
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

  tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.3, freq = 1200, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  gunshot() {
    this.noise(0.14, 0.5, 2600);
    this.tone(140, 0.1, 'sawtooth', 0.25, 50);
  }

  melee() {
    this.noise(0.07, 0.3, 900);
  }

  crash(hard) {
    this.noise(hard ? 0.3 : 0.15, hard ? 0.5 : 0.3, 700);
    this.tone(90, 0.2, 'triangle', 0.3, 40);
  }

  pickup() {
    this.tone(660, 0.08, 'sine', 0.22);
    this.tone(990, 0.12, 'sine', 0.22, null, 0.07);
  }

  cash() {
    this.tone(880, 0.07, 'triangle', 0.2);
    this.tone(1320, 0.1, 'triangle', 0.2, null, 0.06);
  }

  door() {
    this.tone(220, 0.06, 'square', 0.12, 180);
    this.noise(0.05, 0.12, 500, 0.05);
  }

  missionGood() {
    this.tone(523, 0.12, 'triangle', 0.25);
    this.tone(659, 0.12, 'triangle', 0.25, null, 0.1);
    this.tone(784, 0.2, 'triangle', 0.25, null, 0.2);
  }

  missionBad() {
    this.tone(330, 0.16, 'sawtooth', 0.2, 262);
    this.tone(262, 0.24, 'sawtooth', 0.2, 196, 0.14);
  }

  busted() {
    this.tone(392, 0.2, 'square', 0.2);
    this.tone(311, 0.2, 'square', 0.2, null, 0.18);
    this.tone(233, 0.34, 'square', 0.22, null, 0.36);
  }

  // Continuous engine hum while driving; speed 0..1 shapes the pitch.
  setEngine(on, speedRatio, dt) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc) {
      const target = on ? 55 + speedRatio * 130 : 0;
      this.engineOsc.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.08);
      this.engineGain.gain.setTargetAtTime(on && !this.muted ? 0.06 : 0, this.ctx.currentTime, 0.1);
    }
    if (!on && this.engineOsc && dt > 0.5) {
      // left stopped by the per-frame call pattern; keep the node, gain is 0
    }
  }

  screech() {
    this.tone(1400, 0.18, 'sawtooth', 0.06, 900);
  }

  // Two-tone siren while police are near; call every frame with activity.
  setSiren(active, dt) {
    if (!this.ctx) return;
    if (active && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenGain.gain.value = 0.035;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
    }
    if (this.sirenOsc) {
      this.sirenPhase += dt * 2.4;
      const f = this.sirenPhase % 1 < 0.5 ? 700 : 950;
      this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.03);
      this.sirenGain.gain.setTargetAtTime(active && !this.muted ? 0.035 : 0, this.ctx.currentTime, 0.1);
    }
  }
}
