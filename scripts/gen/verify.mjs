// Media integrity gate. Runs after generation and in CI: asserts each file
// exists, is non-trivially sized, and carries the right magic bytes. A fast
// way to catch a broken encoder before it ships.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MEDIA = join(ROOT, 'public', 'media');

const checks = [
  // [relative path, kind, min bytes]
  ['audio/low-orbit.mp3', 'mp3', 80_000],
  ['audio/mid-lattice.mp3', 'mp3', 80_000],
  ['audio/glass-static.mp3', 'mp3', 80_000],
  ['visuals/phosphor-lattice.png', 'png', 5_000],
  ['visuals/phosphor-lattice.thumb.png', 'png', 500],
  ['visuals/carrier-wave.png', 'png', 5_000],
  ['visuals/carrier-wave.thumb.png', 'png', 500],
  ['visuals/dither-bloom.png', 'png', 5_000],
  ['visuals/dither-bloom.thumb.png', 'png', 500],
  ['visuals/pulse-topology.png', 'png', 5_000],
  ['visuals/pulse-topology.thumb.png', 'png', 500],
  ['visuals/sweep.mp4', 'mp4', 20_000],
  ['visuals/sweep.thumb.png', 'png', 300],
  ['visuals/pulse-grid.mp4', 'mp4', 20_000],
  ['visuals/pulse-grid.thumb.png', 'png', 300],
];

function magicOk(buf, kind) {
  switch (kind) {
    case 'png':
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    case 'mp3':
      // ID3 tag or MPEG frame sync (0xFFEx)
      return (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ||
             (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    case 'mp4':
      // 'ftyp' box type at bytes 4..7
      return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
    default:
      return false;
  }
}

let failures = 0;
for (const [rel, kind, minBytes] of checks) {
  const path = join(MEDIA, rel);
  if (!existsSync(path)) {
    console.error(`  ✗ missing: ${rel}`);
    failures++;
    continue;
  }
  const buf = readFileSync(path);
  if (buf.length < minBytes) {
    console.error(`  ✗ too small (${buf.length}B < ${minBytes}B): ${rel}`);
    failures++;
  } else if (!magicOk(buf, kind)) {
    console.error(`  ✗ bad ${kind} header: ${rel}`);
    failures++;
  } else {
    console.log(`  ✓ ${rel} (${(buf.length / 1024).toFixed(0)} KB)`);
  }
}

if (failures > 0) {
  console.error(`\nMedia verification FAILED: ${failures} problem(s).`);
  process.exit(1);
}
console.log(`\nMedia verification passed: ${checks.length} files OK.`);
