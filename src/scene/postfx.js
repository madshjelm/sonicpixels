// Post chain: RenderPass → one EffectPass fusing bloom + chromatic
// aberration + the CRT signature (scanlines, vignette, grain, state tint).
// A single fused fullscreen pass is what keeps this viable on phones.

import { HalfFloatType, Uniform, Vector2, Vector3 } from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  ChromaticAberrationEffect,
  Effect,
  BlendFunction,
} from 'postprocessing';

const crtFragment = /* glsl */ `
uniform float scanIntensity;
uniform float grainAmount;
uniform vec3 tint;
uniform float tintAmount;
uniform float vignetteAmount;

float crtRand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 col = inputColor.rgb;
  // scanlines: ~3 device px period, very quiet
  float scan = 0.5 + 0.5 * sin(uv.y * resolution.y * 2.094);
  col *= 1.0 - scanIntensity * scan;
  col += (crtRand(uv * resolution.xy + fract(time) * 61.7) - 0.5) * grainAmount;
  col = mix(col, col * tint, tintAmount);
  float d = distance(uv, vec2(0.5));
  col *= 1.0 - vignetteAmount * smoothstep(0.35, 0.85, d);
  outputColor = vec4(col, inputColor.a);
}
`;

class CRTEffect extends Effect {
  constructor() {
    super('CRTEffect', crtFragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['scanIntensity', new Uniform(0.06)],
        ['grainAmount', new Uniform(0.012)],
        ['tint', new Uniform(new Vector3(1, 1, 1))],
        ['tintAmount', new Uniform(0)],
        ['vignetteAmount', new Uniform(0.25)],
      ]),
    });
  }
}

// per-state grading targets: multiplicative tint, amount, extra vignette
const STATE_GRADE = {
  landing: { tint: [1, 1, 1], amount: 0, vignette: 0.25 },
  audio: { tint: [0.96, 1.05, 1.01], amount: 0.55, vignette: 0.25 },
  visual: { tint: [1, 1, 1], amount: 0, vignette: 0.22 },
  builds: { tint: [1.06, 1.0, 0.9], amount: 0.45, vignette: 0.25 },
  contact: { tint: [0.94, 0.98, 1.07], amount: 0.5, vignette: 0.33 },
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
    this.bloom = null;
    this.ca = null;
    this.crt = new CRTEffect();
    this.effectPass = null;
    this.enabled = true; // false → straight renderer.render (last-resort floor)

    this.time = 0;
    this.kickAt = -10;
    this.kickDur = 2.4;
    this.bloomBase = 0.85;
    this.caMode = 'on';
    this.grade = { tint: new Vector3(1, 1, 1), amount: 0, vignette: 0.25 };
    this.gradeTarget = STATE_GRADE.landing;
    this.reducedMotion = false;

    this.configure({ bloom: true, bloomLevels: 6, bloomScale: 0.75, ca: 'on' });
  }

  // (Re)build the effect pass for the current quality settings.
  configure(settings) {
    if (this.effectPass) {
      this.composer.removePass(this.effectPass);
      this.effectPass.dispose();
      this.effectPass = null;
    }
    if (this.renderPass) {
      this.composer.removePass(this.renderPass);
    }
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    const effects = [];
    if (settings.bloom) {
      this.bloom = new BloomEffect({
        mipmapBlur: true,
        intensity: this.bloomBase,
        levels: settings.bloomLevels,
        radius: 0.84,
        // only bright cores/overlaps bloom; the dim ambient field stays crisp
        luminanceThreshold: 0.3,
        luminanceSmoothing: 0.3,
      });
      this.bloom.resolution.scale = settings.bloomScale;
      effects.push(this.bloom);
    } else {
      this.bloom = null;
    }

    this.caMode = settings.ca;
    if (settings.ca !== 'off') {
      this.ca = new ChromaticAberrationEffect({
        offset: new Vector2(0, 0),
        radialModulation: true,
        modulationOffset: 0.2,
      });
      effects.push(this.ca);
    } else {
      this.ca = null;
    }

    effects.push(this.crt);
    this.effectPass = new EffectPass(this.camera, ...effects);
    this.composer.addPass(this.effectPass);
  }

  setSize(w, h) { this.composer.setSize(w, h); }

  // called by the state machine when a morph launches
  kickTransition(duration) {
    this.kickAt = this.time;
    this.kickDur = duration;
  }

  setStateGrade(state) {
    this.gradeTarget = STATE_GRADE[state] ?? STATE_GRADE.landing;
  }

  update(dt, audio) {
    this.time += dt;
    const t = this.time - this.kickAt;
    const inFlight = t < this.kickDur + 1.3;

    // chromatic aberration envelope: spike at launch, re-kick at arrival,
    // small beat shimmer while in flight; identity at rest
    if (this.ca) {
      let amp = 0;
      if (!this.reducedMotion && t >= 0) {
        amp = 0.0045 * Math.min(t / 0.12, 1) * Math.exp(-t * 2.6);
        const arrival = this.kickDur * 0.92;
        amp += 0.0016 * Math.exp(-((t - arrival) ** 2) / 0.012);
        if (inFlight) amp += 0.0008 * audio.beat;
      }
      this.ca.offset.set(amp, amp * 0.6);
    }

    if (this.bloom) {
      const flight = inFlight && t >= 0 ? Math.exp(-Math.max(0, t - this.kickDur) * 1.25) : 0;
      this.bloom.intensity = this.bloomBase + 0.25 * flight + 0.1 * audio.beat;
    }

    // CRT flicker for the first 300ms of a retune
    const u = this.crt.uniforms;
    const flicker = !this.reducedMotion && t >= 0 && t < 0.3 ? 1 : 0;
    u.get('scanIntensity').value = 0.06 * (1 + 0.6 * flicker);
    u.get('grainAmount').value = this.reducedMotion ? 0 : 0.012 + 0.015 * flicker;

    // state grading eases over ~1.2s
    const g = this.grade;
    const k = 1 - Math.exp(-dt / 1.2);
    g.tint.x += (this.gradeTarget.tint[0] - g.tint.x) * k;
    g.tint.y += (this.gradeTarget.tint[1] - g.tint.y) * k;
    g.tint.z += (this.gradeTarget.tint[2] - g.tint.z) * k;
    g.amount += (this.gradeTarget.amount - g.amount) * k;
    g.vignette += (this.gradeTarget.vignette - g.vignette) * k;
    u.get('tint').value.copy(g.tint);
    u.get('tintAmount').value = g.amount;
    u.get('vignetteAmount').value = g.vignette;
  }

  render(dt) {
    if (this.enabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
