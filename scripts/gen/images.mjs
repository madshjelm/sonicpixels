// Four placeholder artworks, drawn into raw RGBA buffers and written with
// pngjs — strictly in the site palette so the gallery looks art-directed.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pkg from 'pngjs';

const { PNG } = pkg;

export const PAL = {
  void: [7, 10, 18],
  signal: [138, 123, 255],
  phosphor: [93, 242, 214],
  pulse: [255, 94, 138],
  solar: [255, 180, 84],
  ghost: [180, 189, 216],
};

export class Img {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
    this.fill(PAL.void);
  }

  fill([r, g, b]) {
    for (let i = 0; i < this.w * this.h; i++) {
      this.data[i * 4] = r;
      this.data[i * 4 + 1] = g;
      this.data[i * 4 + 2] = b;
      this.data[i * 4 + 3] = 255;
    }
  }

  add(x, y, [r, g, b], a = 1) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = Math.min(255, this.data[i] + r * a);
    this.data[i + 1] = Math.min(255, this.data[i + 1] + g * a);
    this.data[i + 2] = Math.min(255, this.data[i + 2] + b * a);
  }

  dot(x, y, size, color, a = 1) {
    const half = size / 2;
    for (let dy = -half; dy < half; dy++) {
      for (let dx = -half; dx < half; dx++) {
        this.add(x + dx, y + dy, color, a);
      }
    }
  }

  line(x0, y0, x1, y1, color, a = 1, thickness = 1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.dot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thickness, color, a);
    }
  }

  scanlines(strength = 0.16, period = 4) {
    for (let y = 0; y < this.h; y++) {
      if (y % period !== 0) continue;
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        this.data[i] *= 1 - strength;
        this.data[i + 1] *= 1 - strength;
        this.data[i + 2] *= 1 - strength;
      }
    }
  }

  writePng(path) {
    const png = new PNG({ width: this.w, height: this.h });
    png.data = Buffer.from(this.data);
    writeFileSync(path, PNG.sync.write(png));
  }
}

// box-filter downscale (also used for video posters)
export function downscale(img, outW, outH) {
  const out = new Img(outW, outH);
  const fx = img.w / outW;
  const fy = img.h / outH;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = Math.floor(y * fy); sy < (y + 1) * fy && sy < img.h; sy++) {
        for (let sx = Math.floor(x * fx); sx < (x + 1) * fx && sx < img.w; sx++) {
          const i = (sy * img.w + sx) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          n++;
        }
      }
      const i = (y * out.w + x) * 4;
      out.data[i] = r / n;
      out.data[i + 1] = g / n;
      out.data[i + 2] = b / n;
      out.data[i + 3] = 255;
    }
  }
  return out;
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// ----------------------------------------------------------------- pieces

function phosphorLattice(S) {
  const img = new Img(S, S);
  const horizon = S * 0.42;
  // glow above the horizon
  for (let y = 0; y < horizon; y++) {
    const a = (1 - y / horizon) ** 2 * 0.25;
    for (let x = 0; x < S; x++) img.add(x, y, PAL.signal, a * 0.3);
  }
  // perspective floor lines
  for (let i = 0; i < 22; i++) {
    const t = i / 21;
    const y = horizon + (S - horizon) * t * t;
    img.line(0, y, S, y, PAL.phosphor, 0.5 + t * 0.4, 1 + t * 2);
  }
  for (let i = -14; i <= 14; i++) {
    const xTop = S / 2 + i * S * 0.035;
    const xBot = S / 2 + i * S * 0.16;
    img.line(xTop, horizon, xBot, S, PAL.phosphor, 0.35, 1.5);
  }
  // intersection stars
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * S;
    const y = Math.random() * horizon;
    img.dot(x, y, 2 + Math.random() * 3, Math.random() < 0.7 ? PAL.ghost : PAL.signal, 0.8);
  }
  img.scanlines();
  return img;
}

function carrierWave(S) {
  const img = new Img(S, S);
  const traces = 16;
  for (let tr = 0; tr < traces; tr++) {
    const yBase = S * (0.12 + (0.76 * tr) / (traces - 1));
    const t = tr / (traces - 1);
    const color = mixColor(PAL.signal, PAL.phosphor, Math.abs(t - 0.5) * 1.4);
    const amp = S * 0.05 * Math.sin(Math.PI * t) + S * 0.012;
    const freq = 2 + tr * 0.7;
    let prevY = yBase;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const y = yBase + Math.sin(u * Math.PI * freq + tr * 1.3) * amp * Math.sin(u * Math.PI);
      img.line(x, prevY, x, y, color, 0.9, 2.5);
      prevY = y;
    }
  }
  img.scanlines();
  return img;
}

function ditherBloom(S) {
  const img = new Img(S, S);
  const cx = S / 2;
  const cy = S * 0.52;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - cx, y - cy) / (S * 0.52);
      const v = Math.max(0, 1 - d) ** 1.6;
      const threshold = (BAYER4[y % 4][x % 4] + 0.5) / 16;
      // posterized dither bands: pulse core → signal mid → void
      if (v > 0.65 && v - 0.65 > threshold * 0.35) img.add(x, y, PAL.pulse, 0.9);
      else if (v > 0.3 && v - 0.3 > threshold * 0.35) img.add(x, y, PAL.signal, 0.75);
      else if (v > 0.08 && v - 0.08 > threshold * 0.22) img.add(x, y, PAL.signal, 0.2);
    }
  }
  img.scanlines(0.1);
  return img;
}

function pulseTopology(S) {
  const img = new Img(S, S);
  const c1 = [S * 0.36, S * 0.4];
  const c2 = [S * 0.66, S * 0.62];
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const d1 = Math.hypot(x - c1[0], y - c1[1]) / S;
      const d2 = Math.hypot(x - c2[0], y - c2[1]) / S;
      const field = Math.sin(d1 * 42) + Math.sin(d2 * 36);
      const f = Math.abs(field % 0.5);
      if (f < 0.045) {
        const hot = Math.min(d1, d2) < 0.12;
        img.add(x, y, hot ? PAL.solar : PAL.ghost, hot ? 0.95 : 0.4);
      }
    }
  }
  img.dot(c1[0], c1[1], 9, PAL.solar, 1);
  img.dot(c2[0], c2[1], 7, PAL.pulse, 1);
  img.scanlines(0.12);
  return img;
}

function mixColor(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function generateImages(outDir) {
  mkdirSync(outDir, { recursive: true });
  const S = 1024;
  const pieces = [
    ['phosphor-lattice', phosphorLattice],
    ['carrier-wave', carrierWave],
    ['dither-bloom', ditherBloom],
    ['pulse-topology', pulseTopology],
  ];
  for (const [name, make] of pieces) {
    process.stdout.write(`  drawing ${name}.png… `);
    const t = Date.now();
    const img = make(S);
    img.writePng(join(outDir, `${name}.png`));
    downscale(img, 256, 256).writePng(join(outDir, `${name}.thumb.png`));
    console.log(`${Date.now() - t}ms`);
  }
}
