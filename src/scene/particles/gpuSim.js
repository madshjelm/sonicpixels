// GPGPU particle simulator: positions live in a ping-pong pair of float
// render targets; one fragment pass per frame advances the exponential chase
// toward the current target texture. Interruptible by construction — a new
// morph just re-captures origins and restarts the stagger clock.

import * as THREE from 'three';
import { simVertex, simFragment, copyFragment } from './shaders.js';

export class GpuSimulator {
  // targetTexture is owned by the Particles facade and shared with the
  // render material (it carries the per-particle state scalar in w).
  constructor(renderer, size, floatMode, targetTexture) {
    this.renderer = renderer;
    this.size = size;
    this.count = size * size;

    const type = floatMode === 'float' ? THREE.FloatType : THREE.HalfFloatType;
    const rtOpts = {
      type,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(size, size, rtOpts);
    this.rtB = new THREE.WebGLRenderTarget(size, size, rtOpts);
    this.rtOrigin = new THREE.WebGLRenderTarget(size, size, rtOpts);
    this.current = this.rtA;
    this.previous = this.rtB;
    this.targetTexture = targetTexture;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.simMaterial = new THREE.ShaderMaterial({
      vertexShader: simVertex,
      fragmentShader: simFragment,
      uniforms: {
        uPos: { value: null },
        uOrigin: { value: this.rtOrigin.texture },
        uTarget: { value: this.targetTexture },
        uTime: { value: 0 },
        uDt: { value: 0.016 },
        uMorphStart: { value: -10 },
        uMorphDur: { value: 2.4 },
        uSweepDir: { value: new THREE.Vector2(1, 0) },
        uSwirlAmp: { value: 0.35 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.copyMaterial = new THREE.ShaderMaterial({
      vertexShader: simVertex,
      fragmentShader: copyFragment,
      uniforms: { uTex: { value: null } },
      depthTest: false,
      depthWrite: false,
    });

    // fullscreen triangle
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.mesh = new THREE.Mesh(geo, this.simMaterial);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.time = 0;
  }

  get positionTexture() { return this.current.texture; }

  seed(positions) {
    const seedTex = new THREE.DataTexture(positions, this.size, this.size, THREE.RGBAFormat, THREE.FloatType);
    seedTex.minFilter = THREE.NearestFilter;
    seedTex.magFilter = THREE.NearestFilter;
    seedTex.needsUpdate = true;
    this.blit(seedTex, this.rtA);
    this.blit(seedTex, this.rtB);
    this.blit(seedTex, this.rtOrigin);
    seedTex.dispose();
  }

  blit(texture, target) {
    const prev = this.renderer.getRenderTarget();
    this.mesh.material = this.copyMaterial;
    this.copyMaterial.uniforms.uTex.value = texture;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);
    this.mesh.material = this.simMaterial;
  }

  setTargets() { /* target texture is shared and updated by the facade */ }

  beginMorph(sweepDir, duration) {
    // capture present positions as the new origins (stagger reference)
    this.blit(this.current.texture, this.rtOrigin);
    const u = this.simMaterial.uniforms;
    u.uMorphStart.value = this.time;
    u.uMorphDur.value = Math.max(0.2, duration);
    u.uSweepDir.value.set(sweepDir, 0).normalize();
    if (sweepDir === 0) u.uSweepDir.value.set(0, 1);
  }

  update(dt, energy, swirlScale = 1) {
    this.time += dt;
    const u = this.simMaterial.uniforms;
    u.uTime.value = this.time;
    u.uDt.value = Math.min(dt, 0.05);
    u.uPos.value = this.current.texture;
    u.uSwirlAmp.value = 0.35 * (1 + 0.5 * energy) * swirlScale;

    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.previous);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prev);

    const tmp = this.current;
    this.current = this.previous;
    this.previous = tmp;
  }

  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.rtOrigin.dispose();
  }
}
