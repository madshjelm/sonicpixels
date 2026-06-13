// Particles facade: owns the simulator (GPU or CPU), the shared target
// texture (positions + state scalar), the A/B color textures, and the
// THREE.Points mesh. The state machine talks only to this class.

import * as THREE from 'three';
import { GpuSimulator } from './gpuSim.js';
import { CpuSimulator } from './cpuSim.js';
import { pointsVertex, pointsFragment } from './shaders.js';

export const STATE_IDS = { landing: 0, audio: 1, visual: 2, builds: 3, contact: 4 };

export class Particles {
  constructor(renderer, scene, caps, simSize) {
    this.size = simSize;
    this.count = simSize * simSize;
    this.simKind = caps.floatRT && !caps.forceCpu ? 'gpu' : 'cpu';

    // shared target texture: xyz target position, w = role + param
    this.targetData = new Float32Array(this.count * 4);
    this.targetTexture = new THREE.DataTexture(
      this.targetData, simSize, simSize, THREE.RGBAFormat, THREE.FloatType
    );
    this.targetTexture.minFilter = THREE.NearestFilter;
    this.targetTexture.magFilter = THREE.NearestFilter;
    this.targetTexture.needsUpdate = true;

    this.sim = this.simKind === 'gpu'
      ? new GpuSimulator(renderer, simSize, caps.floatRT, this.targetTexture)
      : new CpuSimulator(renderer, simSize);

    // color targets: A = outgoing state, B = incoming; mixed by morph localT
    this.colorDataA = new Uint8Array(this.count * 4).fill(255);
    this.colorDataB = new Uint8Array(this.count * 4).fill(255);
    this.colorA = makeColorTexture(this.colorDataA, simSize);
    this.colorB = makeColorTexture(this.colorDataB, simSize);

    // geometry: position.xy = ref uv, position.z = seed
    const refs = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      refs[i * 3] = ((i % simSize) + 0.5) / simSize;
      refs[i * 3 + 1] = (Math.floor(i / simSize) + 0.5) / simSize;
      refs[i * 3 + 2] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(refs, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);

    this.material = new THREE.ShaderMaterial({
      vertexShader: pointsVertex,
      fragmentShader: pointsFragment,
      uniforms: {
        uPosTex: { value: null },
        uTargetTex: { value: this.targetTexture },
        uColorA: { value: this.colorA },
        uColorB: { value: this.colorB },
        uAudioTex: { value: null },
        uTime: { value: 0 },
        uBands: { value: new THREE.Vector3() },
        uEnergy: { value: 0 },
        uBeat: { value: 0 },
        uPointScale: { value: 6 },
        uStateTo: { value: STATE_IDS.landing },
        uFocusRecede: { value: 0 },
        uFocusThumb: { value: -1 },
        uPulseOrigin: { value: new THREE.Vector3(99, 99, 99) },
        uPulseT: { value: 99 },
        uMotion: { value: 1 },
        uReveal: { value: 0 },
        uGlowComp: { value: 0 },
        // additive light per particle must fall as the count rises or dense
        // structures saturate to white. ~1/sqrt(count), tuned at 12k≈1.0.
        uBrightness: { value: Math.min(1, 112 / simSize) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.targetFocusRecede = 0;
    this.morphEndsAt = 0;
    this.time = 0;
  }

  seedSphere(radius = 1.4) {
    const arr = new Float32Array(this.count * 4);
    for (let i = 0; i < this.count; i++) {
      const r = radius * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 4] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 4 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 4 + 2] = r * Math.cos(phi);
      arr[i * 4 + 3] = 0;
    }
    this.sim.seed(arr);
    this.targetData.set(arr);
    this.targetTexture.needsUpdate = true;
    if (this.sim.setTargets) this.sim.setTargets(this.targetData);
  }

  // Begin a morph to a new state layout. colors: Uint8Array(count*4) or null.
  morphTo(stateName, positions, colors, { sweepDir = 1, duration = 2.4 } = {}) {
    // rotate colors: what particles show now becomes side A
    this.colorDataA.set(this.colorDataB);
    this.colorA.needsUpdate = true;
    if (colors) {
      this.colorDataB.set(colors);
      this.colorB.needsUpdate = true;
    }

    this.targetData.set(positions);
    this.targetTexture.needsUpdate = true;
    if (this.simKind === 'cpu') this.sim.setTargets(this.targetData);

    this.sim.beginMorph(sweepDir, duration);
    this.material.uniforms.uStateTo.value = STATE_IDS[stateName] ?? 0;
    this.morphEndsAt = this.time + duration + 1.3; // + stagger tail
  }

  // Update target positions without restarting choreography (resize relayout).
  retarget(positions) {
    this.targetData.set(positions);
    this.targetTexture.needsUpdate = true;
    if (this.simKind === 'cpu') this.sim.setTargets(this.targetData);
  }

  get morphing() { return this.time < this.morphEndsAt; }

  // Live-bake colors for a particle range (lazy thumbnail loading).
  bakeColors(start, count, rgba) {
    this.colorDataB.set(rgba.subarray(0, count * 4), start * 4);
    this.colorB.needsUpdate = true;
  }

  setDrawFraction(f) {
    this.points.geometry.setDrawRange(0, Math.floor(this.count * f));
  }

  pulse(origin) {
    this.material.uniforms.uPulseOrigin.value.copy(origin);
    this.material.uniforms.uPulseT.value = 0;
  }

  update(dt, audio, opts) {
    this.time += dt;
    const u = this.material.uniforms;
    u.uTime.value = this.time;
    u.uAudioTex.value = audio.texture;
    u.uBands.value.set(audio.bass, audio.mids, audio.highs);
    u.uEnergy.value = audio.energy;
    u.uBeat.value = audio.beat;
    u.uMotion.value = opts.motion;
    u.uPointScale.value = opts.pointScale;
    u.uGlowComp.value = opts.glowComp;
    u.uReveal.value = Math.min(1, u.uReveal.value + dt * (opts.reveal ? 0.8 : 0));
    if (u.uPulseT.value < 99) u.uPulseT.value += dt;
    // lightbox recede eases both ways
    u.uFocusRecede.value += (this.targetFocusRecede - u.uFocusRecede.value) * (1 - Math.exp(-dt * 6));

    this.sim.update(dt, audio.energy, opts.motion);
    u.uPosTex.value = this.sim.positionTexture;
  }

  setFocusThumb(i) { this.material.uniforms.uFocusThumb.value = i; }
  setRecede(on) { this.targetFocusRecede = on ? 1 : 0; }
}

function makeColorTexture(data, size) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
