// VISUAL state: a floating gallery where each thumbnail is a mosaic of
// particles. Real pixel colors are baked in lazily as images load (the
// state module drives that); until then thumbs shimmer in signal violet.
//
// w encoding: role 10+thumbIndex, fract = baked luminance (drives size).

import { paletteRGB, setColor, fillDust } from './index.js';

export const THUMBS_PER_PAGE = 6;

export function buildVisualTargets(ctx) {
  const { count, view, content, mosaic, page = 0 } = ctx;
  const positions = new Float32Array(count * 4);
  const colors = new Uint8Array(count * 4);
  const signal = paletteRGB('signal');

  const visuals = content.visuals.slice(page * THUMBS_PER_PAGE, (page + 1) * THUMBS_PER_PAGE);
  const n = visuals.length;
  const meta = { thumbs: [], page };
  if (n === 0) {
    fillDust(positions, colors, 0, count);
    return { positions, colors, meta };
  }

  const portrait = view.h > view.w;
  const cols = portrait ? 2 : Math.min(3, n);
  const rows = Math.ceil(n / cols);

  const regionW = view.w * (portrait ? 0.86 : 0.78);
  const regionH = view.h * (portrait ? 0.6 : 0.52);
  const gutter = 0.1;
  const cellW = (regionW - gutter * (cols - 1)) / cols;
  const cellH = (regionH - gutter * (rows - 1)) / rows;
  // thumbs are 16:10; letterbox into the cell
  const thumbW = Math.min(cellW, cellH * 1.6);
  const thumbH = thumbW / 1.6;
  const centerY = 0.12;

  const [gx, gy] = mosaic;
  const perThumb = gx * gy;
  const usable = Math.min(count, n * perThumb);

  let i = 0;
  for (let t = 0; t < n; t++) {
    const col = t % cols;
    const row = Math.floor(t / cols);
    const cx = (col - (cols - 1) / 2) * (cellW + gutter);
    const cy = centerY + ((rows - 1) / 2 - row) * (cellH + gutter);

    meta.thumbs.push({
      visual: visuals[t],
      center: { x: cx, y: cy, z: 0 },
      halfW: thumbW / 2,
      halfH: thumbH / 2,
      particleStart: i,
      particleCount: Math.min(perThumb, usable - i),
      gx, gy,
      baked: false,
    });

    for (let p = 0; p < perThumb && i < usable; p++, i++) {
      const px = p % gx;
      const py = Math.floor(p / gx);
      positions[i * 4] = cx + ((px + 0.5) / gx - 0.5) * thumbW;
      positions[i * 4 + 1] = cy + (0.5 - (py + 0.5) / gy) * thumbH;
      positions[i * 4 + 2] = (Math.random() - 0.5) * 0.01;
      positions[i * 4 + 3] = 10 + t + 0.5; // luminance 0.5 until baked
      setColor(colors, i, signal, 0.5, 0.45); // unbaked shimmer
    }
  }

  fillDust(positions, colors, i, count, { zBias: -0.9, brightness: 0.25 });
  return { positions, colors, meta };
}

// Bake a loaded image into a thumb's particle range: colors into the live
// color texture, luminance into the target texture's w fraction.
export function bakeThumb(thumbMeta, img, particles) {
  const { gx, gy, particleStart, particleCount } = thumbMeta;
  const canvas = document.createElement('canvas');
  canvas.width = gx;
  canvas.height = gy;
  const ctx2d = canvas.getContext('2d', { willReadFrequently: true });

  // cover-fit the media into the mosaic grid
  const iw = img.videoWidth || img.naturalWidth || img.width;
  const ih = img.videoHeight || img.naturalHeight || img.height;
  const scale = Math.max(gx / iw, gy / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx2d.drawImage(img, (gx - dw) / 2, (gy - dh) / 2, dw, dh);

  const data = ctx2d.getImageData(0, 0, gx, gy).data;
  const rgba = new Uint8Array(particleCount * 4);
  // Lift: a floor so dark artwork still shows as dim particles, plus gain so
  // mid-tones read against the additive field. Real photos stay natural.
  const FLOOR = 28, GAIN = 1.55;
  for (let p = 0; p < particleCount; p++) {
    rgba[p * 4] = Math.min(255, FLOOR + data[p * 4] * GAIN);
    rgba[p * 4 + 1] = Math.min(255, FLOOR + data[p * 4 + 1] * GAIN);
    rgba[p * 4 + 2] = Math.min(255, FLOOR + data[p * 4 + 2] * GAIN);
    rgba[p * 4 + 3] = 255;
    const lum = (0.2126 * data[p * 4] + 0.7152 * data[p * 4 + 1] + 0.0722 * data[p * 4 + 2]) / 255;
    const j = (particleStart + p) * 4 + 3;
    particles.targetData[j] = Math.floor(particles.targetData[j]) + Math.min(0.999, lum);
  }
  particles.bakeColors(particleStart, particleCount, rgba);
  particles.targetTexture.needsUpdate = true;
  if (particles.simKind === 'cpu') particles.sim.setTargets(particles.targetData);
  thumbMeta.baked = true;
}
