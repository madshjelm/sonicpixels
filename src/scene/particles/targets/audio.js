// AUDIO state: a living oscilloscope. 55% waveform ribbon (8 strands),
// 25% spectrum halo behind it, 20% ambient dust. The actual motion is
// shader-side (sampling the audio texture); these targets are the rest pose.

import { paletteRGB, setColor, fillDust } from './index.js';

export function buildAudioTargets(ctx) {
  const { count, view } = ctx;
  const positions = new Float32Array(count * 4);
  const colors = new Uint8Array(count * 4);

  const phosphor = paletteRGB('phosphor');
  const signal = paletteRGB('signal');

  const ribbonCount = Math.floor(count * 0.55);
  const haloCount = Math.floor(count * 0.25);

  // --- waveform ribbon: 8 overlapping strands across the view ---
  const halfW = Math.min(view.w * 0.42, 1.5);
  const strands = 8;
  const perStrand = Math.floor(ribbonCount / strands);
  let i = 0;
  for (let s = 0; s < strands; s++) {
    const z = (s / (strands - 1) - 0.5) * 0.14;
    for (let j = 0; j < perStrand && i < ribbonCount; j++, i++) {
      const u = j / perStrand;
      positions[i * 4] = (u * 2 - 1) * halfW;
      positions[i * 4 + 1] = 0.1 + (Math.random() - 0.5) * 0.015;
      positions[i * 4 + 2] = z + (Math.random() - 0.5) * 0.02;
      positions[i * 4 + 3] = 1 + Math.min(0.999, u); // role 1: ribbon
      setColor(colors, i, phosphor, 0.85);
    }
  }
  // strand rounding remainder joins the ribbon middle
  for (; i < ribbonCount; i++) {
    const u = Math.random();
    positions[i * 4] = (u * 2 - 1) * halfW;
    positions[i * 4 + 1] = 0.1;
    positions[i * 4 + 2] = 0;
    positions[i * 4 + 3] = 1 + Math.min(0.999, u);
    setColor(colors, i, phosphor, 0.85);
  }

  // --- spectrum halo: ring of log-frequency bins behind the ribbon ---
  const radius = Math.min(view.w, view.h) * 0.34;
  for (let j = 0; j < haloCount; j++, i++) {
    const u = j / haloCount;
    const angle = u * Math.PI * 2 - Math.PI / 2;
    const r = radius + Math.random() * 0.06;
    positions[i * 4] = Math.cos(angle) * r;
    positions[i * 4 + 1] = Math.sin(angle) * r * 0.92 + 0.1;
    positions[i * 4 + 2] = -0.45;
    positions[i * 4 + 3] = 2 + Math.min(0.999, u); // role 2: halo
    setColor(colors, i, signal, 0.8);
  }

  fillDust(positions, colors, i, count, { brightness: 0.3 });
  return { positions, colors, meta: {} };
}
