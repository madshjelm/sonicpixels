// Per-frame audio analysis: bass/mids/highs bands, smoothed overall energy,
// beat detection, plus a 1024×2 single-channel texture (row 0 = waveform,
// row 1 = log-resampled spectrum) consumed by the particle vertex shader.

import * as THREE from 'three';

const TEX_W = 1024;

// fftSize 2048 @ 44.1kHz → 21.53 Hz per bin
const BASS_LO = 1, BASS_HI = 11;    // ~21–250 Hz
const MID_LO = 12, MID_HI = 92;     // ~250 Hz–2 kHz
const HIGH_LO = 93, HIGH_HI = 371;  // ~2–8 kHz
const BAND_GAIN = [1.0, 1.4, 1.8];  // byte spectrum rolls off toward highs

const ATTACK = 0.03, RELEASE = 0.18; // seconds

export class Analysis {
  constructor() {
    this.freq = new Uint8Array(1024);
    this.wave = new Uint8Array(2048);
    this.texData = new Uint8Array(TEX_W * 2);
    this.texData.fill(128, 0, TEX_W); // silent waveform = centerline

    this.texture = new THREE.DataTexture(this.texData, TEX_W, 2, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;

    this.bass = 0;
    this.mids = 0;
    this.highs = 0;
    this.energy = 0;
    this.beat = 0; // decaying envelope, 1 on detected beat

    this._bassHistory = new Float32Array(60); // ~1s at 60fps
    this._historyPos = 0;
    this._lastBeatAt = -1;
    this._time = 0;

    // Precompute log-spaced spectrum resampling: texel x → fft bin
    this._logBin = new Uint16Array(TEX_W);
    const minBin = 1, maxBin = 371; // 21 Hz – 8 kHz
    for (let x = 0; x < TEX_W; x++) {
      const f = minBin * Math.pow(maxBin / minBin, x / (TEX_W - 1));
      this._logBin[x] = Math.min(maxBin, Math.round(f));
    }
  }

  update(analyser, dt) {
    this._time += dt;
    if (!analyser) return;

    analyser.getByteFrequencyData(this.freq);
    analyser.getByteTimeDomainData(this.wave);

    const rawBass = bandAvg(this.freq, BASS_LO, BASS_HI) * BAND_GAIN[0];
    const rawMids = bandAvg(this.freq, MID_LO, MID_HI) * BAND_GAIN[1];
    const rawHighs = bandAvg(this.freq, HIGH_LO, HIGH_HI) * BAND_GAIN[2];

    this.bass = envelope(this.bass, Math.min(1, rawBass), dt);
    this.mids = envelope(this.mids, Math.min(1, rawMids), dt);
    this.highs = envelope(this.highs, Math.min(1, rawHighs), dt);
    this.energy = 0.5 * this.bass + 0.35 * this.mids + 0.15 * this.highs;

    // Beat: instant bass against its 1s trailing mean, with a refractory gap.
    const hist = this._bassHistory;
    let mean = 0;
    for (let i = 0; i < hist.length; i++) mean += hist[i];
    mean /= hist.length;
    hist[this._historyPos] = rawBass;
    this._historyPos = (this._historyPos + 1) % hist.length;

    if (
      rawBass > Math.max(1.35 * mean, 0.1) &&
      this._time - this._lastBeatAt > 0.22
    ) {
      this.beat = 1;
      this._lastBeatAt = this._time;
    } else {
      this.beat *= Math.exp(-dt / 0.12);
    }

    // Texture row 0: waveform (downsample 2048 → 1024 by skipping)
    const td = this.texData;
    for (let x = 0; x < TEX_W; x++) td[x] = this.wave[x * 2];
    // Texture row 1: log-resampled spectrum
    for (let x = 0; x < TEX_W; x++) td[TEX_W + x] = this.freq[this._logBin[x]];
    this.texture.needsUpdate = true;
  }
}

function bandAvg(freq, lo, hi) {
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += freq[i];
  return sum / ((hi - lo + 1) * 255);
}

function envelope(current, target, dt) {
  const tau = target > current ? ATTACK : RELEASE;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}
