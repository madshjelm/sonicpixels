// Three placeholder compositions, all in A minor so crossfades stay musical.
// Each showcases a different band so the reactive visuals demo immediately:
//   Low Orbit    — bass pins, highs near-silent (beat detector showcase)
//   Mid Lattice  — mids dance (arpeggio showcase)
//   Glass Static — highs dominate (spectrum halo showcase)

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import lame from '@breezystack/lamejs';
import { SR, Mix, makeNoise, midiToFreq as f, kick, sub, pad, pluck, bell, hat, swell } from './synth.mjs';

const { Mp3Encoder } = lame;

function encodeMp3(mix, path) {
  const enc = new Mp3Encoder(2, SR, 160);
  const block = 1152;
  const left = new Int16Array(block);
  const right = new Int16Array(block);
  const chunks = [];
  for (let i = 0; i < mix.n; i += block) {
    const len = Math.min(block, mix.n - i);
    for (let j = 0; j < len; j++) {
      left[j] = Math.max(-32768, Math.min(32767, mix.L[i + j] * 32767));
      right[j] = Math.max(-32768, Math.min(32767, mix.R[i + j] * 32767));
    }
    const out = enc.encodeBuffer(left.subarray(0, len), right.subarray(0, len));
    if (out.length) chunks.push(Buffer.from(out));
  }
  const flush = enc.flush();
  if (flush.length) chunks.push(Buffer.from(flush));
  writeFileSync(path, Buffer.concat(chunks));
}

// ----------------------------------------------------------------- track 1
function lowOrbit() {
  const BPM = 92;
  const beat = 60 / BPM;
  const bars = 32;
  const mix = new Mix(bars * 4 * beat + 2);
  const noise = makeNoise(101);

  // bass progression: two bars each of A1, A1, F1, G1
  const roots = [33, 33, 29, 31]; // midi A1 A1 F1 G1

  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat;
    const root = roots[Math.floor(bar / 2) % 4];

    for (let b = 0; b < 4; b++) {
      kick(mix, t0 + b * beat, { amp: 0.95, dur: 0.22 });
      // quiet offbeat tick is the only high-frequency content
      hat(mix, t0 + (b + 0.5) * beat, noise, { amp: 0.05, dur: 0.025, pan: 0.3 });
    }
    sub(mix, t0 + 0.02, 4 * beat - 0.05, f(root), 0.55);

    // dark pad enters at bar 9, drops bars 25–28, returns for the close
    const padOn = bar >= 8 && !(bar >= 24 && bar < 28);
    if (padOn && bar % 2 === 0) {
      const chord = [f(root + 24), f(root + 27), f(root + 31)];
      pad(mix, t0, 8 * beat, chord, 0.16, 420, -0.1, 0.3);
    }
    // sparse deep blip every 4 bars
    if (bar % 4 === 3) pluck(mix, t0 + 2 * beat, f(root + 12), { amp: 0.14, decay: 0.5, pan: -0.4, send: 0.5 });
  }
  return mix.finalize({ wet: 0.5 });
}

// ----------------------------------------------------------------- track 2
function midLattice() {
  const BPM = 120;
  const beat = 60 / BPM;
  const bars = 38;
  const mix = new Mix(bars * 4 * beat + 2);
  const noise = makeNoise(202);

  // Am F C G, two bars each; chord tones as midi
  const chords = [
    [57, 60, 64], // A3 C4 E4
    [53, 57, 60], // F3 A3 C4
    [60, 64, 67], // C4 E4 G4
    [55, 59, 62], // G3 B3 D4
  ];

  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat;
    const chord = chords[Math.floor(bar / 2) % 4];
    const root = chord[0] - 12;

    // build: 8ths → 16ths → breath → 16ths
    const sixteenths = bar >= 8 && !(bar >= 30 && bar < 34);
    const div = sixteenths ? 16 : 8;
    for (let s = 0; s < div; s++) {
      const note = chord[s % 3] + (s % 4 === 3 ? 12 : 0);
      const vel = 0.3 * (s % 4 === 0 ? 1 : 0.75);
      pluck(mix, t0 + (s * 4 * beat) / div, f(note), {
        amp: vel,
        decay: 0.11,
        pan: ((s % 3) - 1) * 0.35,
        send: 0.28,
      });
    }
    // counter-melody in 8ths an octave up, from bar 17
    if (bar >= 16) {
      for (let s = 0; s < 8; s++) {
        if (s % 2 === 0) continue;
        const note = chord[(s + 2) % 3] + 24;
        pluck(mix, t0 + (s * 4 * beat) / 8, f(note), { amp: 0.13, decay: 0.16, pan: 0.45, send: 0.5 });
      }
    }
    // soft kick keeps the beat detector alive; light bass
    kick(mix, t0, { amp: 0.5, dur: 0.16 });
    kick(mix, t0 + 2 * beat, { amp: 0.42, dur: 0.14 });
    for (let b = 0; b < 4; b++) {
      sub(mix, t0 + b * beat + 0.01, beat * 0.55, f(root), 0.3);
      hat(mix, t0 + (b + 0.5) * beat, noise, { amp: 0.09, dur: 0.04, pan: -0.2 });
    }
  }
  return mix.finalize();
}

// ----------------------------------------------------------------- track 3
function glassStatic() {
  const BPM = 132;
  const beat = 60 / BPM;
  const bars = 40;
  const mix = new Mix(bars * 4 * beat + 2.5);
  const noise = makeNoise(303);

  // syncopated 16th bell pattern; carriers 1.7–4.2 kHz (A minor pentatonic, high)
  const pattern = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0];
  const notes = [93, 96, 100, 103, 105]; // A6 C7 E7 G7 A7

  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat;
    const intro = bar < 4;
    const breath = bar >= 32 && bar < 36;

    for (let s = 0; s < 16; s++) {
      const t = t0 + (s * 4 * beat) / 16;
      if (!breath && pattern[(s + bar) % 16]) {
        const note = notes[(bar * 3 + s) % notes.length];
        bell(mix, t, f(note), { amp: intro ? 0.12 : 0.18, decay: 0.42, pan: ((s % 5) - 2) * 0.22 });
      }
      // alternating short/long hats — the highs engine
      if (!intro) hat(mix, t, noise, { amp: s % 4 === 2 ? 0.17 : 0.1, dur: s % 2 ? 0.09 : 0.04, pan: (s % 2) * 0.5 - 0.25 });
    }
    // airy swell every 4 bars
    if (bar % 4 === 0 && !intro) swell(mix, t0 - 0.6, 1.6, noise, { amp: 0.1 });
    // light kick, no sub at all
    if (!breath) {
      kick(mix, t0, { amp: 0.36, freqHi: 96, freqLo: 58, dur: 0.12 });
      kick(mix, t0 + 2 * beat, { amp: 0.3, freqHi: 96, freqLo: 58, dur: 0.1 });
    }
  }
  return mix.finalize({ delayL: 0.27, delayR: 0.4, feedback: 0.5, wet: 0.8 });
}

export function generateAudio(outDir) {
  mkdirSync(outDir, { recursive: true });
  const tracks = [
    ['low-orbit.mp3', lowOrbit],
    ['mid-lattice.mp3', midLattice],
    ['glass-static.mp3', glassStatic],
  ];
  for (const [name, make] of tracks) {
    process.stdout.write(`  synthesizing ${name}… `);
    const t = Date.now();
    encodeMp3(make(), join(outDir, name));
    console.log(`${Date.now() - t}ms`);
  }
}
