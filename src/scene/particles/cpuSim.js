// CPU fallback simulator for WebGL2 devices that cannot render to float
// targets. Same math as sim.frag over a Float32Array at a reduced particle
// count, uploaded as a DataTexture each frame (float *sampling* is fine
// everywhere in WebGL2 — only float *rendering* is restricted).

import * as THREE from 'three';

export class CpuSimulator {
  constructor(_renderer, size) {
    this.size = size;
    this.count = size * size;

    this.positions = new Float32Array(this.count * 4);
    this.origins = new Float32Array(this.count * 4);
    this.targets = new Float32Array(this.count * 4);
    this.delays = new Float32Array(this.count);
    this.hashes = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.hashes[i] = Math.random();

    this.texture = new THREE.DataTexture(this.positions, size, size, THREE.RGBAFormat, THREE.FloatType);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;

    this.time = 0;
    this.morphStart = -10;
    this.morphDur = 2.4;
    this.swirlAmp = 0.35;
  }

  get positionTexture() { return this.texture; }
  get targetTexture() { return null; }

  seed(positions) {
    this.positions.set(positions);
    this.origins.set(positions);
    this.texture.needsUpdate = true;
  }

  setTargets(positions) {
    this.targets.set(positions);
  }

  beginMorph(sweepDir, duration) {
    this.origins.set(this.positions);
    this.morphStart = this.time;
    this.morphDur = Math.max(0.2, duration);
    const sx = sweepDir === 0 ? 0 : Math.sign(sweepDir);
    for (let i = 0; i < this.count; i++) {
      const ox = this.origins[i * 4];
      const oy = this.origins[i * 4 + 1];
      const along = sx === 0 ? oy : ox * sx;
      const sweep = Math.min(1, Math.max(0, along / 3 + 0.5));
      this.delays[i] = 0.9 * sweep + 0.35 * this.hashes[i];
    }
  }

  update(dt, energy, swirlScale = 1) {
    this.time += dt;
    const clampedDt = Math.min(dt, 0.05);
    const amp = 0.35 * (1 + 0.5 * energy) * swirlScale;
    const p = this.positions, t = this.targets;
    const time = this.time, ms = this.morphStart, md = this.morphDur;

    for (let i = 0; i < this.count; i++) {
      const j = i * 4;
      let localT = (time - ms - this.delays[i]) / md;
      localT = localT < 0 ? 0 : localT > 1 ? 1 : localT;

      if (localT > 0) {
        const s = Math.min(1, localT / 0.35);
        const k = 2 + 4.5 * (s * s * (3 - 2 * s));
        const chase = 1 - Math.exp(-k * clampedDt);
        p[j] += (t[j] - p[j]) * chase;
        p[j + 1] += (t[j + 1] - p[j + 1]) * chase;
        p[j + 2] += (t[j + 2] - p[j + 2]) * chase;
      }

      const bell = 4 * localT * (1 - localT);
      if (bell > 0.01) {
        const x = p[j] * 1.6, y = p[j + 1] * 1.6, z = p[j + 2] * 1.6 + time * 0.18;
        const f = amp * bell * clampedDt * 0.45;
        p[j] += (Math.sin(y * 1.7 + z * 1.3) + 0.5 * Math.sin(y * 0.8 - z * 2.1)) * f;
        p[j + 1] += (Math.sin(z * 1.9 + x * 1.1) + 0.5 * Math.sin(z * 0.7 - x * 1.7)) * f;
        p[j + 2] += (Math.sin(x * 1.5 + y * 2.3) + 0.5 * Math.sin(x * 0.9 - y * 0.6)) * f;
      }

      p[j + 3] = localT;
    }
    this.texture.needsUpdate = true;
  }

  dispose() { this.texture.dispose(); }
}
