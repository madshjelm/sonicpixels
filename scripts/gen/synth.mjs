// Minimal DSP toolkit for the placeholder compositions. Everything renders
// into stereo Float32Arrays at 44.1kHz; voices write directly into the mix.

export const SR = 44100;

export function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export class Mix {
  constructor(seconds) {
    this.n = Math.floor(seconds * SR);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
    this.sendL = new Float32Array(this.n); // echo send
    this.sendR = new Float32Array(this.n);
  }

  // pan: -1..1, send: 0..1 echo amount
  write(i, sample, pan = 0, send = 0) {
    if (i < 0 || i >= this.n) return;
    const l = sample * Math.cos(((pan + 1) / 4) * Math.PI);
    const r = sample * Math.sin(((pan + 1) / 4) * Math.PI);
    this.L[i] += l;
    this.R[i] += r;
    if (send > 0) {
      this.sendL[i] += l * send;
      this.sendR[i] += r * send;
    }
  }

  // ping-pong feedback delay on the send bus, then normalize to -1 dBFS
  finalize({ delayL = 0.34, delayR = 0.51, feedback = 0.42, wet = 0.7 } = {}) {
    const dl = Math.floor(delayL * SR);
    const dr = Math.floor(delayR * SR);
    for (let i = 0; i < this.n; i++) {
      if (i - dl >= 0) this.sendL[i] += this.sendR[i - dl] * feedback;
      if (i - dr >= 0) this.sendR[i] += this.sendL[i - dr] * feedback;
    }
    for (let i = 0; i < this.n; i++) {
      this.L[i] += this.sendL[i] * wet;
      this.R[i] += this.sendR[i] * wet;
    }
    let peak = 0;
    for (let i = 0; i < this.n; i++) {
      peak = Math.max(peak, Math.abs(this.L[i]), Math.abs(this.R[i]));
    }
    const gain = peak > 0 ? 0.891 / peak : 1; // -1 dBFS
    for (let i = 0; i < this.n; i++) {
      this.L[i] *= gain;
      this.R[i] *= gain;
    }
    return this;
  }
}

// deterministic noise so regenerating media is reproducible
export function makeNoise(seed = 0x9e3779b9) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

// ----------------------------------------------------------------- voices

// sine kick with exponential pitch drop
export function kick(mix, t0, { freqHi = 110, freqLo = 44, dur = 0.2, amp = 0.9, pan = 0 } = {}) {
  const start = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const k = t / dur;
    const f = freqLo + (freqHi - freqLo) * Math.exp(-k * 9);
    phase += (2 * Math.PI * f) / SR;
    const env = Math.exp(-k * 6) * (1 - k);
    const s = Math.tanh(Math.sin(phase) * 1.6) * env * amp;
    mix.write(start + i, s, pan, 0);
  }
}

// sustained sub sine with gentle saturation and slow attack/release
export function sub(mix, t0, dur, freq, amp = 0.5, pan = 0) {
  const start = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    phase += (2 * Math.PI * freq) / SR;
    const env = Math.min(t / 0.06, 1, (1 - t) / 0.12);
    const s = Math.tanh(Math.sin(phase) * 1.3) * Math.max(0, env) * amp;
    mix.write(start + i, s, pan, 0);
  }
}

// detuned triangle pad through a one-pole lowpass
export function pad(mix, t0, dur, freqs, amp = 0.2, cutoff = 400, pan = 0, send = 0.25) {
  const start = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  const phases = freqs.flatMap((f) => [
    { f: f * 0.9975, p: Math.random() * 6.28 },
    { f: f * 1.0025, p: Math.random() * 6.28 },
  ]);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    let s = 0;
    for (const v of phases) {
      v.p += (2 * Math.PI * v.f) / SR;
      // triangle from phase
      s += Math.abs(((v.p / Math.PI) % 2) - 1) * 2 - 1;
    }
    s /= phases.length;
    lp += (s - lp) * alpha;
    const env = Math.min(t / 0.18, 1, (1 - t) / 0.22);
    mix.write(start + i, lp * Math.max(0, env) * amp, pan, send);
  }
}

// plucky triangle + 2nd harmonic, exponential decay
export function pluck(mix, t0, freq, { amp = 0.3, decay = 0.12, pan = 0, send = 0.3 } = {}) {
  const start = Math.floor(t0 * SR);
  const len = Math.floor(decay * 5 * SR);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    p1 += (2 * Math.PI * freq) / SR;
    p2 += (2 * Math.PI * freq * 2) / SR;
    const tri = Math.abs(((p1 / Math.PI) % 2) - 1) * 2 - 1;
    const env = Math.exp(-t / decay) * Math.min(i / 30, 1);
    const s = (tri * 0.8 + Math.sin(p2) * 0.3) * env * amp;
    mix.write(start + i, s, pan, send);
  }
}

// FM bell: carrier + modulator at a slightly inharmonic ratio
export function bell(mix, t0, freq, { amp = 0.2, decay = 0.4, ratio = 3.01, index = 2.2, pan = 0, send = 0.45 } = {}) {
  const start = Math.floor(t0 * SR);
  const len = Math.floor(decay * 6 * SR);
  let pc = 0, pm = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.exp(-t / decay) * Math.min(i / 20, 1);
    pm += (2 * Math.PI * freq * ratio) / SR;
    pc += (2 * Math.PI * freq) / SR + Math.sin(pm) * index * env * 0.002;
    mix.write(start + i, Math.sin(pc) * env * amp, pan, send);
  }
}

// high-passed noise burst (hat / tick)
export function hat(mix, t0, noise, { amp = 0.15, dur = 0.05, pan = 0, send = 0.1 } = {}) {
  const start = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const n = noise();
    const hp = n - prev; // crude one-zero highpass
    prev = n * 0.86;
    const env = Math.exp(-t * 7);
    mix.write(start + i, hp * env * amp, pan, send);
  }
}

// airy lowpassed noise swell
export function swell(mix, t0, dur, noise, { amp = 0.12, cutoff = 1800, pan = 0, send = 0.5 } = {}) {
  const start = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    lp += (noise() - lp) * alpha;
    const env = Math.sin(Math.PI * t) ** 2;
    mix.write(start + i, lp * env * amp, pan, send);
  }
}
