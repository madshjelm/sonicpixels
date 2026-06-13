// Text → particle positions: draw text on an offscreen 2D canvas, sample
// filled pixels, jitter inside each sampled cell. Used for the landing
// wordmark and the CONTACT name constellation.

const cache = new Map();

export function sampleText(lines, maxPoints) {
  const key = `${lines.join('\n')}|${maxPoints}`;
  if (cache.has(key)) return cache.get(key);

  const W = 1280;
  const H = 320 * lines.length;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let li = 0; li < lines.length; li++) {
    let px = 230;
    ctx.font = `${px}px 'VT323', 'Courier New', monospace`;
    const w = ctx.measureText(lines[li]).width;
    if (w > W * 0.94) {
      px = Math.floor(px * (W * 0.94) / w);
      ctx.font = `${px}px 'VT323', 'Courier New', monospace`;
    }
    ctx.fillText(lines[li], W / 2, (li + 0.5) * (H / lines.length));
  }

  const data = ctx.getImageData(0, 0, W, H).data;
  const filled = [];
  // coarse pre-scan stride keeps this fast even on a 1280-wide canvas
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (data[(y * W + x) * 4 + 3] > 128) filled.push(x, y);
    }
  }

  const total = filled.length / 2;
  const points = [];
  if (total > 0) {
    const stride = Math.max(1, total / maxPoints);
    for (let f = 0; f < total; f += stride) {
      const i = Math.floor(f) * 2;
      const x = filled[i] + (Math.random() - 0.5) * 2.4;
      const y = filled[i + 1] + (Math.random() - 0.5) * 2.4;
      points.push({
        x: x / W - 0.5,            // -0.5 .. 0.5
        y: 0.5 - y / H,            // -0.5 .. 0.5, up = +
        u: x / W,                  // 0..1 left→right, for sweep effects
      });
    }
  }

  const result = { points, aspect: W / H };
  cache.set(key, result);
  return result;
}

export function clearTextCache() { cache.clear(); }
