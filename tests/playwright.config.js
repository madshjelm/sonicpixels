import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Headless Chromium ships SwiftShader, which gives us a real WebGL2 context
// with float render targets — enough to exercise the GPU sim path. Audio
// autoplay is unblocked so the analysis chain can be asserted.
const webglArgs = [
  '--autoplay-policy=no-user-gesture-required',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader',
];

// This environment pre-bakes a Chromium build whose version may not match the
// one @playwright/test expects, so prefer an explicit full-Chrome binary if
// present. Falls back to Playwright's managed download otherwise.
const CHROME_CANDIDATES = [
  process.env.PW_CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean);
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  webServer: {
    command: 'npm run dev -- --port 5179 --strictPort',
    url: 'http://localhost:5179',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:5179',
    launchOptions: { args: webglArgs, executablePath },
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: webglArgs, executablePath },
      },
    },
  ],
});
