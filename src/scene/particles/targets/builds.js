// BUILDS state: particles snap into circuit structures — chip outlines with
// pin grids, joined by Manhattan traces to a central bus spine.
//
// w encoding: role 0 = chip/pin/dust, role 1 = trace with fract = arc param.

import { paletteRGB, setColor, fillDust } from './index.js';

export function buildBuildsTargets(ctx) {
  const { count, view, content } = ctx;
  const positions = new Float32Array(count * 4);
  const colors = new Uint8Array(count * 4);
  const solar = paletteRGB('solar');
  const ghost = paletteRGB('ghost');
  const meta = { chips: [] };

  const builds = content.builds;
  const n = builds.length;
  if (n === 0) {
    fillDust(positions, colors, 0, count);
    return { positions, colors, meta };
  }

  const portrait = view.h > view.w;
  const cols = portrait ? 1 : 2;
  const rows = Math.ceil(n / cols);

  const regionW = view.w * (portrait ? 0.7 : 0.72);
  const regionH = view.h * (portrait ? 0.55 : 0.5);
  const chipW = Math.min((regionW / cols) * 0.66, 0.62);
  const chipH = chipW * 0.62;
  const centerY = portrait ? 0.34 : 0.14;

  const chipBudget = Math.floor((count * 0.62) / n);
  const traceBudget = Math.floor(count * 0.24);

  let i = 0;
  for (let c = 0; c < n; c++) {
    const col = c % cols;
    const row = Math.floor(c / cols);
    const cx = cols === 1 ? 0 : (col - (cols - 1) / 2) * (regionW / cols + 0.12);
    const cy = centerY + ((rows - 1) / 2 - row) * (regionH / rows + (portrait ? 0.02 : 0.1));
    meta.chips.push({ build: builds[c], center: { x: cx, y: cy, z: 0 }, halfW: chipW / 2, halfH: chipH / 2 });

    // perimeter — two nested rectangles of particles
    const perimCount = Math.floor(chipBudget * 0.5);
    for (let p = 0; p < perimCount && i < count; p++, i++) {
      const t = p / perimCount;
      const inset = p % 2 === 0 ? 0 : 0.016;
      const [px, py] = rectPoint(t, chipW / 2 - inset, chipH / 2 - inset);
      positions[i * 4] = cx + px;
      positions[i * 4 + 1] = cy + py;
      positions[i * 4 + 2] = (Math.random() - 0.5) * 0.01;
      positions[i * 4 + 3] = Math.random() * 0.999;
      setColor(colors, i, solar, 0.75);
    }

    // pin grid 8×5 — small clusters per pin
    const pins = 40;
    const pinCount = chipBudget - perimCount;
    for (let p = 0; p < pinCount && i < count; p++, i++) {
      const pin = p % pins;
      const gx = pin % 8;
      const gy = Math.floor(pin / 8);
      positions[i * 4] = cx + ((gx + 0.5) / 8 - 0.5) * chipW * 0.78 + (Math.random() - 0.5) * 0.008;
      positions[i * 4 + 1] = cy + ((gy + 0.5) / 5 - 0.5) * chipH * 0.66 + (Math.random() - 0.5) * 0.008;
      positions[i * 4 + 2] = 0.01;
      positions[i * 4 + 3] = Math.random() * 0.999;
      setColor(colors, i, ghost, 0.5);
    }
  }

  // traces: Manhattan L-paths from each chip's inner edge to a vertical bus
  // spine at x=0, then along the spine toward center
  const perTrace = Math.floor(traceBudget / n);
  for (let c = 0; c < n && i < count; c++) {
    const chip = meta.chips[c].center;
    const sx = chip.x > 0 ? chip.x - chipW / 2 : chip.x + chipW / 2;
    const path = [
      [sx, chip.y],
      [0, chip.y],
      [0, centerY],
    ];
    const segLens = pathLengths(path);
    for (let p = 0; p < perTrace && i < count; p++, i++) {
      const s = p / perTrace;
      const [px, py] = pointAlongPath(path, segLens, s);
      positions[i * 4] = px + (Math.random() - 0.5) * 0.006;
      positions[i * 4 + 1] = py + (Math.random() - 0.5) * 0.006;
      positions[i * 4 + 2] = -0.02;
      positions[i * 4 + 3] = 1 + Math.min(0.999, s); // role 1: trace
      setColor(colors, i, solar, 0.55);
    }
  }

  fillDust(positions, colors, i, count, { zBias: -0.8, brightness: 0.22 });
  return { positions, colors, meta };
}

// point on a rectangle perimeter at parameter t (0..1)
function rectPoint(t, hw, hh) {
  const perim = 4 * (hw + hh);
  let d = t * perim;
  if (d < 2 * hw) return [-hw + d, hh];
  d -= 2 * hw;
  if (d < 2 * hh) return [hw, hh - d];
  d -= 2 * hh;
  if (d < 2 * hw) return [hw - d, -hh];
  d -= 2 * hw;
  return [-hw, -hh + d];
}

function pathLengths(path) {
  const lens = [];
  let total = 0;
  for (let s = 0; s < path.length - 1; s++) {
    const l = Math.hypot(path[s + 1][0] - path[s][0], path[s + 1][1] - path[s][1]);
    lens.push(l);
    total += l;
  }
  return { lens, total };
}

function pointAlongPath(path, { lens, total }, s) {
  let d = s * total;
  for (let seg = 0; seg < lens.length; seg++) {
    if (d <= lens[seg] || seg === lens.length - 1) {
      const t = lens[seg] === 0 ? 0 : d / lens[seg];
      return [
        path[seg][0] + (path[seg + 1][0] - path[seg][0]) * t,
        path[seg][1] + (path[seg + 1][1] - path[seg][1]) * t,
      ];
    }
    d -= lens[seg];
  }
  return path[path.length - 1];
}
