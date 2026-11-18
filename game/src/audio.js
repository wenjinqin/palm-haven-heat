// audio.js — every sound in Palm Haven Heat is synthesized with the
// Web Audio API: no audio files, nothing to load. A tiny synth engine
// covers the engine hum, police sirens, gunfire, impacts, pickups and
// UI, plus a laid-back synthwave loop for the title and free roam.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.engineNodes = null;
    this.sirenNodes = null;
  }

  // Browsers only let audio start after a user gesture; the title
  // screen's first click calls this.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.03);
    }
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, dest = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(dest || this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.3, freq = 1200, q = 0.8) {
    if (!this.ctx) return;
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
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.sfxGain);
    src.start(t);
  }

  gunshot() {
    this.noise(0.16, 0.5, 900, 0.4);
    this.tone(140, 0.1, 'square', 0.18, 55);
  }

  dryFire() {
    this.tone(1900, 0.03, 'square', 0.06);
  }

  thud(strength = 1) {
    this.noise(0.12, 0.25 * strength, 300, 0.6);
    this.tone(80, 0.14, 'sine', 0.3 * strength, 40);
  }

  scrape() {
    this.noise(0.2, 0.12, 2600, 2.5);
  }

  cash() {
    this.tone(880, 0.09, 'triangle', 0.22);
    setTimeout(() => this.tone(1318, 0.14, 'triangle', 0.22), 55);
  }

  pickup() {
    this.tone(660, 0.08, 'sine', 0.2, 990);
  }

  missionGood() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.22), i * 90));
  }

  missionBad() {
    const notes = [392, 330, 262];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.2), i * 120));
  }

  phoneBuzz() {
    this.tone(1046, 0.07, 'square', 0.08);
    setTimeout(() => this.tone(1046, 0.07, 'square', 0.08), 110);
  }

  doorSlam() {
    this.noise(0.07, 0.2, 500, 1);
    this.tone(120, 0.08, 'sine', 0.2, 60);
  }

  // Continuous engine loop whose pitch follows the car's speed.
  engineStart() {
    if (!this.ctx || this.engineNodes) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const sub = this.ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 28;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(this.sfxGain);
    osc.start();
    sub.start();
    this.engineNodes = { osc, sub, filter, gain };
  }

  engineUpdate(speedRatio, throttle) {
    if (!this.engineNodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 50 + speedRatio * 165 + throttle * 22;
    this.engineNodes.osc.frequency.setTargetAtTime(rpm, t, 0.06);
    this.engineNodes.sub.frequency.setTargetAtTime(rpm / 2, t, 0.06);
    this.engineNodes.filter.frequency.setTargetAtTime(320 + speedRatio * 900, t, 0.08);
    this.engineNodes.gain.gain.setTargetAtTime(0.05 + speedRatio * 0.075, t, 0.09);
  }

  engineStop() {
    if (!this.engineNodes || !this.ctx) return;
    const nodes = this.engineNodes;
    this.engineNodes = null;
    nodes.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => {
      try { nodes.osc.stop(); nodes.sub.stop(); } catch (e) { /* already stopped */ }
    }, 220);
  }

  // Two-tone police siren, started when the heat is on.
  sirenStart() {
    if (!this.ctx || this.sirenNodes) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    osc.connect(gain).connect(this.sfxGain);
    osc.start();
    const lfo = this.ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.55;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start();
    this.sirenNodes = { osc, lfo, gain };
  }

  sirenUpdate(distance) {
    if (!this.sirenNodes || !this.ctx) return;
    const vol = Math.max(0, 0.14 - distance * 0.0011);
    this.sirenNodes.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.15);
  }

  sirenStop() {
    if (!this.sirenNodes || !this.ctx) return;
    const nodes = this.sirenNodes;
    this.sirenNodes = null;
    nodes.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => {
      try { nodes.osc.stop(); nodes.lfo.stop(); } catch (e) { /* already stopped */ }
    }, 220);
  }

  // A slow synthwave chord loop: warm pads and a soft bass pulse.
  musicStart() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [
      [220.0, 261.6, 329.6], // Am
      [174.6, 220.0, 261.6], // F
      [196.0, 246.9, 293.7], // G
      [164.8, 196.0, 246.9], // Em
    ];
    const bass = [55, 43.65, 49, 41.2];
    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      const idx = this.musicStep % 4;
      const t = this.ctx.currentTime;
      for (const f of chords[idx]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
        osc.connect(g).connect(this.musicGain);
        osc.start(t);
        osc.stop(t + 3.7);
      }
      this.tone(bass[idx] * 2, 1.6, 'sine', 0.16, null, this.musicGain);
      this.musicStep++;
    }, 3600);
  }

  musicStop() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
