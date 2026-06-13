// CONTACT state: the calmest scene. The artist's name as a constellation,
// the rest a slow starfield dome. A quiet signal pulse sweeps the name
// every few seconds (shader-side, driven by the u param in w).
//
// w encoding: role 1 = name (fract = x position 0..1), role 0 = starfield.

import { paletteRGB, setColor } from './index.js';
import { sampleText } from './text.js';

export function buildContactTargets(ctx) {
  const { count, view, content } = ctx;
  const positions = new Float32Array(count * 4);
  const colors = new Uint8Array(count * 4);
  const phosphor = paletteRGB('phosphor');
  const ghost = paletteRGB('ghost');

  const name = (content.contact.name || 'SONIC PIXELS').toUpperCase();
  const portrait = view.h > view.w;
  // split long names onto two lines in portrait
  let lines = [name];
  if (portrait && name.length > 12) {
    const mid = name.lastIndexOf(' ', Math.ceil(name.length / 2) + 2);
    if (mid > 0) lines = [name.slice(0, mid), name.slice(mid + 1)];
  }

  const nameCount = Math.floor(count * 0.16);
  const { points, aspect } = sampleText(lines, nameCount);
  const width = Math.min(view.w * 0.8, 2.3);
  const height = (width / aspect) * lines.length * (lines.length > 1 ? 0.55 : 1);

  let i = 0;
  for (; i < nameCount; i++) {
    const p = points[i % points.length];
    positions[i * 4] = p.x * width;
    positions[i * 4 + 1] = p.y * height + 0.22;
    positions[i * 4 + 2] = (Math.random() - 0.5) * 0.04;
    positions[i * 4 + 3] = 1 + Math.min(0.999, p.u); // role 1: name
    const c = Math.random() < 0.7 ? ghost : phosphor;
    setColor(colors, i, c, 0.9);
  }

  // starfield dome behind and around — sparse and dim so the name leads
  for (; i < count; i++) {
    const r = 1.3 + Math.random() * 0.95;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 4] = r * Math.sin(phi) * Math.cos(theta) * 1.2;
    positions[i * 4 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.75;
    positions[i * 4 + 2] = -Math.abs(r * Math.cos(phi)) * 0.8 - 0.2;
    positions[i * 4 + 3] = Math.random() * 0.999; // role 0: star
    setColor(colors, i, ghost, 0.16, 0.7);
  }

  return { positions, colors, meta: {} };
}
