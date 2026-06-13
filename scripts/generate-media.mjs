// Generates every placeholder asset into public/media/ and verifies them.
// Pure JS/WASM — no ffmpeg, no native deps. Idempotent: rerun any time.
//
//   npm run gen:media
//
// Owners normally never run this; it exists so the placeholder media in the
// repo is reproducible and so the pipeline is proven in CI.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateAudio } from './gen/audio.mjs';
import { generateImages } from './gen/images.mjs';
import { generateVideos } from './gen/video.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MEDIA = join(ROOT, '..', 'public', 'media');

console.log('Sonic Pixels — generating placeholder media\n');

console.log('audio:');
generateAudio(join(MEDIA, 'audio'));

console.log('\nimages:');
generateImages(join(MEDIA, 'visuals'));

console.log('\nvideo:');
await generateVideos(join(MEDIA, 'visuals'));

console.log('\nverifying:');
execFileSync('node', [join(ROOT, 'gen', 'verify.mjs')], { stdio: 'inherit' });
