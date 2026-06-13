// Target builders: given the particle budget, viewport (in scene units at
// z=0) and content, produce target positions (xyz + role/param in w) and
// per-particle colors. Pure functions of their inputs.
//
// Position w convention: floor(w) = role, fract(w) = 0..1 parameter.

import { PALETTE, hexToRgb255 } from '../../../palette.js';
import { sampleText } from './text.js';
import { buildAudioTargets } from './audio.js';
import { buildVisualTargets } from './visual.js';
import { buildBuildsTargets } from './builds.js';
import { buildContactTargets } from './contact.js';

const RGB = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, hexToRgb255(v)]));

export function paletteRGB(name) { return RGB[name]; }

// Write one particle's color with slight brightness variation so fields of
// a single hue never look flat.
export function setColor(colors, i, rgb, brightness = 1, vary = 0.18) {
  const b = brightness * (1 - vary / 2 + Math.random() * vary);
  colors[i * 4] = Math.min(255, rgb[0] * b);
  colors[i * 4 + 1] = Math.min(255, rgb[1] * b);
  colors[i * 4 + 2] = Math.min(255, rgb[2] * b);
  colors[i * 4 + 3] = 255;
}

// Ambient dust used by every state to fill leftover budget. Distributed on a
// thick shell (not a filled ball) and biased to the back, so it frames the
// scene as a sparse starfield instead of piling into a bright central haze.
export function fillDust(positions, colors, from, to, { radius = 1.9, zBias = -0.5, color = RGB.ghost, brightness = 0.12 } = {}) {
  for (let i = from; i < to; i++) {
    const r = radius * (0.78 + 0.22 * Math.random()); // shell, thin
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 4] = r * Math.sin(phi) * Math.cos(theta) * 1.15;
    positions[i * 4 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.85;
    positions[i * 4 + 2] = -Math.abs(r * Math.cos(phi)) * 0.7 + zBias; // always behind
    positions[i * 4 + 3] = Math.random() * 0.999; // role 0 = dust
    setColor(colors, i, color, brightness, 0.6);
  }
}

function buildLandingTargets(ctx) {
  const { count, view } = ctx;
  const positions = new Float32Array(count * 4);
  const colors = new Uint8Array(count * 4);

  const textCount = Math.floor(count * 0.85);
  const { points, aspect } = sampleText(['SONIC PIXELS'], textCount);
  const width = Math.min(view.w * 0.86, 2.6);
  const height = width / aspect;

  for (let i = 0; i < textCount; i++) {
    const p = points[i % points.length];
    positions[i * 4] = p.x * width;
    positions[i * 4 + 1] = p.y * height + 0.06;
    positions[i * 4 + 2] = (Math.random() - 0.5) * 0.05;
    positions[i * 4 + 3] = Math.min(0.999, p.u);
    // wordmark: ghost core with violet/mint glints
    const roll = Math.random();
    const c = roll < 0.55 ? RGB.ghost : roll < 0.85 ? RGB.signal : RGB.phosphor;
    setColor(colors, i, c, 0.95);
  }
  fillDust(positions, colors, textCount, count, { brightness: 0.22 });
  return { positions, colors, meta: {} };
}

const BUILDERS = {
  landing: buildLandingTargets,
  audio: buildAudioTargets,
  visual: buildVisualTargets,
  builds: buildBuildsTargets,
  contact: buildContactTargets,
};

// ctx: { count, view: {w,h}, content, mosaic: [gx,gy] }
export function buildTargets(state, ctx) {
  return BUILDERS[state](ctx);
}
