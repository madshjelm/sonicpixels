import { defineConfig } from 'vite';

// base './' makes every asset URL relative, so the same build works at
// https://sonicpixels.dk/ and at https://<user>.github.io/sonicpixels/.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
  },
});
