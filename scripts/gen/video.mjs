// Two short placeholder MP4s rendered frame-by-frame and encoded with the
// pure-WASM h264-mp4-encoder (no ffmpeg anywhere). Frame 0 becomes the poster.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import HME from 'h264-mp4-encoder';
import { Img, downscale, PAL } from './images.mjs';

const W = 640;
const H = 360;
const FPS = 30;
const SECONDS = 6;

function sweepFrame(f) {
  const img = new Img(W, H);
  const t = f / (FPS * SECONDS);
  // faint backdrop grid
  for (let x = 0; x < W; x += 32) img.line(x, 0, x, H, PAL.signal, 0.06, 1);
  for (let y = 0; y < H; y += 32) img.line(0, y, W, y, PAL.signal, 0.06, 1);
  // the sweeping band with a phosphor trail
  const head = ((t * 1.4) % 1.2 - 0.1) * W;
  for (let dx = -160; dx <= 6; dx++) {
    const x = head + dx;
    const a = dx > 0 ? 0.9 : 0.85 * Math.exp(dx / 48);
    if (a < 0.01) continue;
    img.line(x, 0, x, H, PAL.phosphor, a * 0.5, 1);
  }
  // sparkle weather inside the trail
  for (let i = 0; i < 90; i++) {
    const x = head - Math.random() * 170;
    const y = Math.random() * H;
    img.dot(x, y, 2, Math.random() < 0.8 ? PAL.phosphor : PAL.ghost, Math.random() * 0.8);
  }
  img.scanlines(0.18, 3);
  return img;
}

function pulseGridFrame(f) {
  const img = new Img(W, H);
  const t = f / (FPS * SECONDS);
  const cx = W / 2;
  const cy = H / 2;
  for (let gy = 0; gy < 12; gy++) {
    for (let gx = 0; gx < 21; gx++) {
      const x = (gx + 0.5) * (W / 21);
      const y = (gy + 0.5) * (H / 12);
      const d = Math.hypot(x - cx, y - cy) / Math.hypot(cx, cy);
      const wave = Math.sin(d * 9 - t * Math.PI * 6);
      const v = Math.max(0, wave) ** 2;
      img.dot(x, y, 4 + v * 8, PAL.solar, 0.15 + v * 0.85);
      if (v > 0.85) img.dot(x, y, 16, PAL.solar, 0.12);
    }
  }
  img.scanlines(0.18, 3);
  return img;
}

async function renderClip(name, frameFn, outDir) {
  process.stdout.write(`  encoding ${name}.mp4… `);
  const t0 = Date.now();
  const enc = await HME.createH264MP4Encoder();
  enc.width = W;
  enc.height = H;
  enc.frameRate = FPS;
  enc.kbps = 1200;
  enc.groupOfPictures = FPS;
  enc.initialize();

  for (let f = 0; f < FPS * SECONDS; f++) {
    const img = frameFn(f);
    enc.addFrameRgba(img.data);
    if (f === 0) downscale(img, 256, 144).writePng(join(outDir, `${name}.thumb.png`));
  }
  enc.finalize();
  const data = enc.FS.readFile(enc.outputFilename);
  enc.delete();
  writeFileSync(join(outDir, `${name}.mp4`), Buffer.from(data));
  console.log(`${Date.now() - t0}ms`);
}

export async function generateVideos(outDir) {
  mkdirSync(outDir, { recursive: true });
  await renderClip('sweep', sweepFrame, outDir);
  await renderClip('pulse-grid', pulseGridFrame, outDir);
}
