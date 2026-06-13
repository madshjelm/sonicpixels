// The Sonic Pixels palette. Six named values, used everywhere — shaders,
// canvas sampling, CSS. This module is the single source of truth; it writes
// the CSS custom properties at boot so styles can never drift from the scene.

export const PALETTE = {
  void: '#070A12', //   background — near-black with a blue-violet undertone
  signal: '#8A7BFF', // primary particle glow — violet LED
  phosphor: '#5DF2D6', // oscilloscope mint — waveform, wordmark, links
  pulse: '#FF5E8A', //  hot coral — beats, hover pulses, needle tip
  solar: '#FFB454', //  amber — tuner dial, BUILDS traces
  ghost: '#B4BDD8', //  text, dim UI, starfield
};

export function hexToRgb01(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function hexToRgb255(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function applyPaletteToCss() {
  const root = document.documentElement.style;
  for (const [name, hex] of Object.entries(PALETTE)) {
    root.setProperty(`--${name}`, hex);
  }
}
