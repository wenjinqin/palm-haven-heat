// All sound is synthesized with WebAudio — an engine that follows your
// speed, a two-tone siren that swells as a cruiser closes in, gunshots,
// punches, coin chimes, and a slow synthwave loop for the drive. No audio
// files exist in this game; the city sounds like code because it is.
export const audio = {
  ctx: null,
  started: false,
  engine: null,
  siren: null,
  musicStep: 0,
  musicTimer: null,
};

function noiseBuffer(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function startAudio() {
  if (audio.started) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  audio.ctx = ctx;
  audio.master = ctx.createGain();
  audio.master.gain.value = 0.55;
  audio.master.connect(ctx.destination);
  audio.noise = noiseBuffer(ctx);

  // Engine: a saw + square pair through a lowpass, pitch follows speed.
  const engGain = ctx.createGain();
  engGain.gain.value = 0;
  const engFilter = ctx.createBiquadFilter();
  engFilter.type = 'lowpass';
  engFilter.frequency.value = 420;
  const oscA = ctx.createOscillator();
  oscA.type = 'sawtooth';
  oscA.frequency.value = 55;
  const oscB = ctx.createOscillator();
  oscB.type = 'square';
  oscB.frequency.value = 28;
  oscA.connect(engFilter);
  oscB.connect(engFilter);
  engFilter.connect(engGain);
  engGain.connect(audio.master);
  oscA.start();
  oscB.start();
  audio.engine = { oscA, oscB, gain: engGain, filter: engFilter };

  // Siren: one square wave whose pitch the frame loop flips.
  const sirGain = ctx.createGain();
  sirGain.gain.value = 0;
  const sirOsc = ctx.createOscillator();
  sirOsc.type = 'triangle';
  sirOsc.frequency.value = 750;
  sirOsc.connect(sirGain);
  sirGain.connect(audio.master);
  sirOsc.start();
  audio.siren = { osc: sirOsc, gain: sirGain };

  audio.started = true;
  startMusic(ctx);
}

/** ratio 0..1 of top speed; active only while driving. */
export function setEngine(ratio, active) {
  if (!audio.started) return;
  const e = audio.engine;
  const t = audio.ctx.currentTime;
  const target = active ? 0.05 + ratio * 0.05 : 0;
  e.gain.gain.setTargetAtTime(target, t, 0.09);
  e.oscA.frequency.setTargetAtTime(52 + ratio * 165, t, 0.06);
  e.oscB.frequency.setTargetAtTime(26 + ratio * 82, t, 0.06);
  e.filter.frequency.setTargetAtTime(320 + ratio * 900, t, 0.1);
}

/** level 0..1 by the nearest cruiser's distance; 0 silences it. */
export function setSiren(level, time) {  if (!audio.started) return;
  const s = audio.siren;
  const t = audio.ctx.currentTime;
  s.gain.gain.setTargetAtTime(level * 0.045, t, 0.15);
  if (level > 0) s.osc.frequency.value = Math.sin(time * 7.5) > 0 ? 920 : 690;
}

function burst(dur, filterFreq, gainVal, type = 'lowpass') {
  if (!audio.started) return;
  const ctx = audio.ctx;
  const src = ctx.createBufferSource();
  src.buffer = audio.noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainVal, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(f);
  f.connect(g);
  g.connect(audio.master);
  src.start();
  src.stop(ctx.currentTime + dur);
}

function blip(freq, dur, gainVal, type = 'sine', when = 0) {
  if (!audio.started) return;
  const ctx = audio.ctx;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  const t0 = ctx.currentTime + when;
  g.gain.setValueAtTime(gainVal, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  g.connect(audio.master);
  o.start(t0);
  o.stop(t0 + dur);
}

export function setMuted(m) {
  if (audio.master) audio.master.gain.value = m ? 0 : 0.55;
}

export const sfx = {
  shot() { burst(0.16, 2600, 0.5, 'highpass'); burst(0.1, 500, 0.4); },
  punch() { burst(0.09, 300, 0.35); },
  hit() { burst(0.07, 700, 0.25); },
  crash() { burst(0.3, 900, 0.4); blip(90, 0.25, 0.2, 'sawtooth'); },
  pickup() { blip(880, 0.09, 0.16); blip(1318, 0.14, 0.16, 'sine', 0.07); },
  cash() { blip(1568, 0.08, 0.14); blip(2093, 0.16, 0.14, 'sine', 0.06); },
  click() { blip(660, 0.05, 0.1, 'square'); },
  door() { burst(0.06, 800, 0.2); blip(180, 0.08, 0.12, 'square', 0.03); },
  spray() { burst(0.7, 3000, 0.12, 'highpass'); },
  mission() { blip(523, 0.12, 0.15, 'triangle'); blip(659, 0.12, 0.15, 'triangle', 0.1); blip(784, 0.22, 0.15, 'triangle', 0.2); },
  fail() { blip(220, 0.2, 0.16, 'sawtooth'); blip(165, 0.3, 0.16, 'sawtooth', 0.14); },
  checkpoint() { blip(1046, 0.1, 0.15); blip(1568, 0.18, 0.15, 'sine', 0.07); },
};

// A minor synthwave loop: bass eighths under a slow square-wave arp.
// Am — F — C — G, 100 BPM, scheduled a step at a time.
const BASS = [55, 0, 55, 0, 55, 0, 65.4, 0, 43.65, 0, 43.65, 0, 43.65, 0, 49, 0, 65.4, 0, 65.4, 0, 65.4, 0, 73.4, 0, 49, 0, 49, 0, 55, 0, 61.7, 0];
const ARP = [220, 261.6, 329.6, 440, 349.2, 440, 523.2, 349.2, 261.6, 329.6, 392, 523.2, 196, 246.9, 329.6, 392];
function startMusic(ctx) {
  const stepDur = 60 / 100 / 2; // eighth notes at 100 BPM
  audio.musicTimer = setInterval(() => {
    if (ctx.state !== 'running') return;
    const step = audio.musicStep++;
    const bassNote = BASS[step % BASS.length];
    if (bassNote) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = bassNote;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.055, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + stepDur * 0.95);
      o.connect(f); f.connect(g); g.connect(audio.master);
      o.start();
      o.stop(ctx.currentTime + stepDur);
    }
    if (step % 2 === 0) {
      const arpNote = ARP[(step / 2) % ARP.length | 0];
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = arpNote;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.016, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + stepDur * 1.8);
      o.connect(g); g.connect(audio.master);
      o.start();
      o.stop(ctx.currentTime + stepDur * 2);
    }
  }, stepDur * 1000);
}
