// All GLSL for the particle system, as template strings (keeps the bundler
// config zero and the chunks composable).
//
// Position texture layout: xyz = simulated position, w = per-particle morph
// progress "localT" (0 before its stagger wave arrives, 1 when locked on).
// Target texture layout:   xyz = target position, w = state scalar where
// integer part = role and fractional part = a 0..1 parameter; each state's
// target builder and shader branch agree on the meaning.

// Cheap trig swirl field — not true divergence-free curl, but visually
// equivalent for transition turbulence at a fraction of the cost.
export const swirlChunk = /* glsl */ `
vec3 swirlField(vec3 p) {
  return vec3(
    sin(p.y * 1.7 + p.z * 1.3) + 0.5 * sin(p.y * 0.8 - p.z * 2.1),
    sin(p.z * 1.9 + p.x * 1.1) + 0.5 * sin(p.z * 0.7 - p.x * 1.7),
    sin(p.x * 1.5 + p.y * 2.3) + 0.5 * sin(p.x * 0.9 - p.y * 0.6)
  ) * 0.45;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

// ---------------------------------------------------------------- sim pass
export const simVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const simFragment = /* glsl */ `
precision highp float;

uniform sampler2D uPos;
uniform sampler2D uOrigin;
uniform sampler2D uTarget;
uniform float uTime;
uniform float uDt;
uniform float uMorphStart;
uniform float uMorphDur;
uniform vec2 uSweepDir;
uniform float uSwirlAmp;

varying vec2 vUv;

${swirlChunk}

void main() {
  vec3 pos = texture2D(uPos, vUv).xyz;
  vec3 origin = texture2D(uOrigin, vUv).xyz;
  vec3 target = texture2D(uTarget, vUv).xyz;

  // Choreography: particles depart in a wave along the tuner travel
  // direction, with hashed jitter so the wavefront feels organic.
  float h = hash12(vUv * 1024.0);
  float sweep = clamp(dot(origin.xy, uSweepDir) / 3.0 + 0.5, 0.0, 1.0);
  float delay = 0.9 * sweep + 0.35 * h;
  float localT = clamp((uTime - uMorphStart - delay) / uMorphDur, 0.0, 1.0);

  // Exponential chase: launch soft (k=2), lock on hard (k=6.5).
  // 1-exp(-k*dt) keeps it frame-rate independent and interruption-safe.
  float k = mix(2.0, 6.5, smoothstep(0.0, 0.35, localT));
  float chase = localT > 0.0 ? (1.0 - exp(-k * uDt)) : 0.0;
  pos += (target - pos) * chase;

  // Mid-flight turbulence, zero at both endpoints.
  float bell = 4.0 * localT * (1.0 - localT);
  pos += swirlField(pos * 1.6 + vec3(0.0, 0.0, uTime * 0.18)) * (uSwirlAmp * bell * uDt);

  gl_FragColor = vec4(pos, localT);
}
`;

export const copyFragment = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTex, vUv); }
`;

// -------------------------------------------------------------- points pass
export const pointsVertex = /* glsl */ `
precision highp float;

// position attribute: xy = ref uv into the sim/target/color textures,
//                     z  = per-particle random seed
uniform sampler2D uPosTex;
uniform sampler2D uTargetTex;
uniform sampler2D uColorA;
uniform sampler2D uColorB;
uniform sampler2D uAudioTex;
uniform float uTime;
uniform vec3 uBands;        // bass, mids, highs (0..1 smoothed)
uniform float uEnergy;
uniform float uBeat;        // decaying beat envelope
uniform float uPointScale;  // px·worldZ — see stage.js
uniform float uStateTo;     // incoming/current state id
uniform float uFocusRecede; // 1 while the lightbox is open
uniform float uFocusThumb;  // focused thumbnail index or -1
uniform vec3 uPulseOrigin;
uniform float uPulseT;      // seconds since last BUILDS pulse (large = idle)
uniform float uMotion;      // 1 normal, ~0.25 reduced motion
uniform float uReveal;      // landing fade-in 0..1
uniform float uBrightness;  // per-particle light, scaled down as count rises

varying vec3 vColor;

const float ST_LANDING = 0.0;
const float ST_AUDIO   = 1.0;
const float ST_VISUAL  = 2.0;
const float ST_BUILDS  = 3.0;
const float ST_CONTACT = 4.0;

float wave(float u) { return texture2D(uAudioTex, vec2(u, 0.25)).r; }
float spec(float u) { return texture2D(uAudioTex, vec2(u, 0.75)).r; }

void main() {
  vec2 ref = position.xy;
  float seed = position.z;

  vec4 p4 = texture2D(uPosTex, ref);
  vec3 pos = p4.xyz;
  float localT = p4.w;
  vec4 t4 = texture2D(uTargetTex, ref);
  float role = floor(t4.w);
  float param = fract(t4.w);

  float mixT = smoothstep(0.0, 1.0, localT);
  float intensity = 1.0;
  float sizeMul = 1.0;
  vec3 d = vec3(0.0);

  // universal idle breathing — a slow radial inhale/exhale
  float calm = uStateTo == ST_CONTACT ? 0.35 : 1.0;
  float breathe = sin(uTime * 0.45 + seed * 6.2831);
  d += normalize(pos + 1e-4) * breathe * 0.014 * calm * uMotion;

  // ---- state behaviors (incoming state, weighted by morph progress) ----
  if (uStateTo == ST_AUDIO) {
    if (role == 1.0) {
      // living waveform ribbon
      float w = wave(param) - 0.5;
      d.y += w * (0.55 + 1.1 * uEnergy) * 1.5 * mix(0.4, 1.0, uMotion);
      intensity += abs(w) * 2.4 + uBands.y * 0.3;
    } else if (role == 2.0) {
      // spectrum halo — radial push per log-frequency bin
      float s = pow(spec(param), 1.4);
      vec2 dir = normalize(t4.xy + vec2(0.0, 1e-4));
      d.xy += dir * s * 0.5 * mix(0.5, 1.0, uMotion);
      intensity += s * 1.8;
    } else {
      d.y += uBands.z * 0.05 * sin(uTime * 3.0 + seed * 40.0) * uMotion;
      intensity *= 0.55;
    }
  } else if (uStateTo == ST_VISUAL) {
    float thumb = role - 10.0;
    if (thumb >= 0.0) {
      float isFocused = (uFocusThumb >= 0.0 && abs(thumb - uFocusThumb) < 0.5) ? 1.0 : 0.0;
      float wobble = 1.0 - isFocused;
      d.y += sin(uTime * (0.5 + thumb * 0.11) + thumb * 2.4) * 0.014 * wobble * uMotion;
      d.x += sin(uTime * 0.32 + thumb * 1.7) * 0.008 * wobble * uMotion;
      // mosaics are one particle per pixel and must read against the additive
      // field, so lift them well above ambient; param (baked luminance) adds
      // size so brighter pixels sharpen the image.
      sizeMul *= 1.15 + param * 0.9;
      intensity *= 2.3;
      if (uFocusThumb >= 0.0) intensity *= mix(0.6, 1.25, isFocused);
    } else {
      intensity *= 0.4; // dust behind the gallery
    }
  } else if (uStateTo == ST_BUILDS) {
    if (role == 1.0) {
      // current flowing along circuit traces
      intensity += 0.25 * (0.5 + 0.5 * sin(param * 44.0 - uTime * 2.4));
    }
    // hover pulse racing outward from a chip
    float pd = distance(t4.xyz, uPulseOrigin);
    float front = pd - 1.5 * uPulseT;
    float pulse = exp(-front * front / 0.018) * exp(-uPulseT * 1.1);
    intensity += pulse * 2.6;
    d += normalize(t4.xyz - uPulseOrigin + 1e-4) * pulse * 0.05 * uMotion;
  } else if (uStateTo == ST_CONTACT) {
    if (role >= 1.0) {
      // a quiet signal sweeps the name every 6 seconds
      float sweepPos = fract(uTime / 6.0) * 3.2 - 0.4;
      float ds = param - sweepPos;
      intensity += exp(-ds * ds / 0.005) * 1.3;
    } else {
      intensity = 0.4 + 0.18 * sin(uTime * 0.7 + seed * 80.0);
    }
  } else {
    // landing wordmark shimmer
    d += vec3(sin(uTime * 2.0 + seed * 50.0), cos(uTime * 1.6 + seed * 31.0), 0.0) * 0.004 * uMotion;
  }

  pos += d * mixT;

  // beat pop on a sparse subset, sparing by design
  float popMask = step(0.72, seed);
  sizeMul *= 1.0 + uBeat * popMask * 0.35 * uMotion;
  intensity += uBeat * popMask * 0.5 * uMotion;

  // lightbox open: scene recedes and dims behind the frame
  pos.z -= uFocusRecede * 0.55;
  intensity *= 1.0 - 0.45 * uFocusRecede;

  vec3 colA = texture2D(uColorA, ref).rgb;
  vec3 colB = texture2D(uColorB, ref).rgb;
  vColor = mix(colA, colB, mixT) * intensity * uReveal * uBrightness;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = uPointScale * sizeMul * (0.75 + 0.5 * seed);
  gl_PointSize = clamp(size / -mv.z, 1.0, 14.0);
}
`;

export const pointsFragment = /* glsl */ `
precision mediump float;

uniform float uGlowComp; // boosted when bloom is off (T0) so glow survives

varying vec3 vColor;

void main() {
  // a literal pixel: square point, soft chebyshev edge so it doesn't shimmer
  vec2 q = abs(gl_PointCoord - 0.5) * 2.0;
  float dist = max(q.x, q.y);
  float alpha = 1.0 - smoothstep(0.7, 1.0, dist);
  vec3 col = vColor * (1.0 + uGlowComp);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;
