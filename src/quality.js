// Device capability detection + runtime fps governor.
//
// Startup picks a tier from GPU/renderer heuristics; at runtime a windowed
// p75 frame-time governor walks a degrade ladder (cheap knobs first) and
// promotes back conservatively. Hard rule: never promote above startup tier.

export const TIERS = [
  // T0 floor / CPU sim
  { name: 'T0', simSize: 110, dprCap: 1.0, pixelBudget: 2.0e6, bloom: false, bloomLevels: 0, bloomScale: 0, ca: 'off', mosaic: [44, 28] },
  // T1 low mobile
  { name: 'T1', simSize: 208, dprCap: 1.5, pixelBudget: 2.8e6, bloom: true, bloomLevels: 4, bloomScale: 0.5, ca: 'off', mosaic: [44, 28] },
  // T2 mid
  { name: 'T2', simSize: 320, dprCap: 1.75, pixelBudget: 4.6e6, bloom: true, bloomLevels: 5, bloomScale: 0.5, ca: 'transitions', mosaic: [64, 40] },
  // T3 desktop high
  { name: 'T3', simSize: 448, dprCap: 2.0, pixelBudget: 8.8e6, bloom: true, bloomLevels: 6, bloomScale: 0.75, ca: 'on', mosaic: [88, 56] },
];

export function detectCapabilities() {
  const params = new URLSearchParams(location.search);
  const forced = params.get('quality'); // ?quality=t0|t1|t2|t3 for testing
  const noGl = params.has('nogl');
  const forceCpu = params.has('cpusim');

  const out = {
    webgl2: false,
    floatRT: false, // can we render to a float/half-float target?
    rendererString: '',
    tierIndex: 0,
    forceCpu,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
  if (noGl) return out;

  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
  if (!gl) return out;
  out.webgl2 = true;

  // Float renderability ladder: full float, else half float.
  if (gl.getExtension('EXT_color_buffer_float')) {
    out.floatRT = 'float';
  } else if (gl.getExtension('EXT_color_buffer_half_float')) {
    out.floatRT = 'half';
  }

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl.getParameter(gl.RENDERER) ?? '');
  out.rendererString = String(renderer);

  const r = out.rendererString.toLowerCase();
  let tier;
  if (/apple|nvidia|geforce|rtx|radeon (rx|pro)|arc/.test(r)) tier = 3;
  else if (/iris|intel|adreno 7|mali-g7|mali-g8|xclipse/.test(r)) tier = 2;
  else if (/adreno|mali|powervr|videocore/.test(r)) tier = 1;
  else tier = 2; // unknown: middle of the road, governor sorts the rest

  if ((navigator.deviceMemory ?? 8) < 4 || (navigator.hardwareConcurrency ?? 8) < 4) {
    tier = Math.max(1, tier - 1);
  }
  // small touch devices never start above T2 (battery + thermals)
  if (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900) {
    tier = Math.min(tier, 2);
  }
  if (!out.floatRT || forceCpu) tier = 0;

  if (forced) {
    const f = { t0: 0, t1: 1, t2: 2, t3: 3 }[forced.toLowerCase()];
    if (f !== undefined) tier = f;
  }
  out.tierIndex = tier;

  const loseCtx = gl.getExtension('WEBGL_lose_context');
  if (loseCtx) loseCtx.loseContext();
  return out;
}

// Degrade ladder steps, cheap → drastic. Each is { apply, revert } on a
// settings object read by the render loop every frame.
const LADDER = ['ca', 'bloomScale', 'dpr1', 'dpr2', 'draw75', 'draw50', 'bloomOff'];

export class Governor {
  constructor(tierIndex, hooks) {
    this.startTier = tierIndex;
    this.tier = TIERS[tierIndex];
    this.hooks = hooks; // { onChange(settings) }
    this.settings = this.baseSettings();
    this.samples = new Float32Array(90);
    this.sampleCount = 0;
    this.windowTime = 0;
    this.hotWindows = 0;
    this.coolWindows = 0;
    this.ladderPos = 0; // how many degrade steps are active
    this.lastDegradeAt = -Infinity;
    this.lastPromoteAt = -Infinity;
    this.time = 0;
    this.morphing = false;
    this.events = [];
  }

  baseSettings() {
    const t = this.tier;
    return {
      tierName: t.name,
      simSize: t.simSize,
      dprCap: t.dprCap,
      pixelBudget: t.pixelBudget,
      bloom: t.bloom,
      bloomLevels: t.bloomLevels,
      bloomScale: t.bloomScale,
      ca: t.ca,
      mosaic: t.mosaic,
      drawFraction: 1,
    };
  }

  sample(frameDelta) {
    // ignore tab-switch spikes
    if (frameDelta > 0.25) return;
    this.samples[this.sampleCount % this.samples.length] = frameDelta;
    this.sampleCount++;
  }

  update(dt) {
    this.time += dt;
    this.windowTime += dt;
    if (this.windowTime < 2 || this.sampleCount < 45) return;
    this.windowTime = 0;

    const n = Math.min(this.sampleCount, this.samples.length);
    const arr = Array.from(this.samples.subarray(0, n)).sort((a, b) => a - b);
    const p75 = arr[Math.floor(n * 0.75)] * 1000; // ms

    const hotThreshold = this.morphing ? 22 : 19;
    if (p75 > hotThreshold) {
      this.hotWindows++;
      this.coolWindows = 0;
    } else if (p75 < 13.5) {
      this.coolWindows++;
      this.hotWindows = 0;
    } else {
      this.hotWindows = 0;
      this.coolWindows = 0;
    }

    if (this.hotWindows >= 2 && this.ladderPos < LADDER.length) {
      this.applyStep(LADDER[this.ladderPos], true);
      this.ladderPos++;
      this.hotWindows = 0;
      this.lastDegradeAt = this.time;
      this.events.push({ t: this.time, type: 'degrade', step: this.ladderPos, p75 });
      this.hooks.onChange(this.settings);
    } else if (
      this.coolWindows >= 5 &&
      this.ladderPos > 0 &&
      this.time - this.lastDegradeAt > 10 &&
      this.time - this.lastPromoteAt > 30
    ) {
      this.ladderPos--;
      this.applyStep(LADDER[this.ladderPos], false);
      this.coolWindows = 0;
      this.lastPromoteAt = this.time;
      this.events.push({ t: this.time, type: 'promote', step: this.ladderPos, p75 });
      this.hooks.onChange(this.settings);
    }
  }

  applyStep(step, degrade) {
    const s = this.settings;
    const t = this.tier;
    switch (step) {
      case 'ca': s.ca = degrade ? 'off' : t.ca; break;
      case 'bloomScale': s.bloomScale = degrade ? Math.min(0.35, t.bloomScale) : t.bloomScale;
        s.bloomLevels = degrade ? Math.max(3, t.bloomLevels - 1) : t.bloomLevels; break;
      case 'dpr1': s.dprCap = degrade ? Math.max(1, t.dprCap - 0.25) : t.dprCap; break;
      case 'dpr2': s.dprCap = degrade ? Math.max(1, t.dprCap - 0.5) : Math.max(1, t.dprCap - 0.25); break;
      case 'draw75': s.drawFraction = degrade ? 0.75 : 1; break;
      case 'draw50': s.drawFraction = degrade ? 0.5 : 0.75; break;
      case 'bloomOff': s.bloom = degrade ? false : t.bloom; break;
    }
  }
}
