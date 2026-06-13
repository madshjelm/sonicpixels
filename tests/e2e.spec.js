import { test, expect } from '@playwright/test';

// Assertions target window.__sonic (?test=1) and the DOM, never canvas
// pixels — those are non-deterministic across GPUs.

const collectErrors = (page) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

async function boot(page, query = '') {
  const errors = collectErrors(page);
  await page.goto(`/?test=1${query}`);
  await page.waitForFunction(() => window.__sonic && window.__sonic.state, null, { timeout: 15000 });
  return errors;
}

test('boots into the landing scene without console errors', async ({ page }) => {
  const errors = await boot(page);
  expect(await page.evaluate(() => window.__sonic.state)).toBe('landing');
  await expect(page.locator('#press-play')).toBeVisible();
  expect(await page.evaluate(() => window.__sonic.particleCount)).toBeGreaterThan(10000);
  expect(errors, errors.join('\n')).toHaveLength(0);
});

test('reports a usable sim path and quality tier', async ({ page }) => {
  await boot(page);
  const simKind = await page.evaluate(() => window.__sonic.simKind);
  expect(['gpu', 'cpu']).toContain(simKind);
  const tier = await page.evaluate(() => window.__sonic.tier);
  expect(tier).toMatch(/^T[0-3]$/);
});

test('press play starts audio and the analysis chain produces signal', async ({ page }) => {
  await boot(page);
  await page.locator('#press-play').click();
  await page.waitForFunction(() => window.__sonic.state === 'audio');
  // bands should become non-zero within a couple of seconds of playback
  await page.waitForFunction(() => window.__sonic.bands.bass > 0 || window.__sonic.bands.mids > 0, null, { timeout: 6000 });
  const bands = await page.evaluate(() => window.__sonic.bands);
  expect(bands.bass + bands.mids + bands.highs).toBeGreaterThan(0);
  await expect(page.locator('#tuner')).toBeVisible();
});

test('tuner navigates all four states by clicking labels', async ({ page }) => {
  await boot(page);
  await page.locator('#press-play').click();
  await page.waitForFunction(() => window.__sonic.state === 'audio');

  for (const [label, state, valuenow] of [
    ['VISUAL', 'visual', '1'],
    ['BUILDS', 'builds', '2'],
    ['CONTACT', 'contact', '3'],
    ['AUDIO', 'audio', '0'],
  ]) {
    await page.locator('.tuner-label', { hasText: label }).click();
    await page.waitForFunction((s) => window.__sonic.state === s, state);
    expect(await page.locator('#tuner-band').getAttribute('aria-valuenow')).toBe(valuenow);
  }
});

test('keyboard arrows move the tuner', async ({ page }) => {
  await boot(page);
  await page.locator('#press-play').click();
  await page.waitForFunction(() => window.__sonic.state === 'audio');

  await page.locator('#tuner-band').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__sonic.state === 'visual');
  await page.keyboard.press('End');
  await page.waitForFunction(() => window.__sonic.state === 'contact');
  await page.keyboard.press('Home');
  await page.waitForFunction(() => window.__sonic.state === 'audio');
});

test('rapid retuning is interruptible and lands on the final state', async ({ page }) => {
  await boot(page);
  await page.locator('#press-play').click();
  await page.waitForFunction(() => window.__sonic.state === 'audio');

  const errors = collectErrors(page);
  await page.evaluate(() => {
    window.__sonic.goTo('builds');
    window.__sonic.goTo('contact');
    window.__sonic.goTo('visual');
  });
  await page.waitForFunction(() => window.__sonic.state === 'visual');
  expect(errors, errors.join('\n')).toHaveLength(0);
});

test('visual lightbox opens, traps focus and closes on Escape', async ({ page }) => {
  await boot(page);
  await page.locator('#press-play').click();
  await page.locator('.tuner-label', { hasText: 'VISUAL' }).click();
  await page.waitForFunction(() => window.__sonic.state === 'visual');

  const hotspot = page.locator('.visual-hotspot').first();
  await hotspot.waitFor({ state: 'visible' });
  await hotspot.click();

  const lightbox = page.locator('#lightbox');
  await expect(lightbox).toBeVisible();
  await expect(page.locator('#lightbox-title')).not.toBeEmpty();

  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
});

test('builds state renders cards with outbound links', async ({ page }) => {
  await boot(page);
  await page.locator('#press-play').click();
  await page.locator('.tuner-label', { hasText: 'BUILDS' }).click();
  await page.waitForFunction(() => window.__sonic.state === 'builds');
  const cards = page.locator('.build-card');
  expect(await cards.count()).toBeGreaterThan(0);
  expect(await page.locator('.build-card a[href]').count()).toBeGreaterThan(0);
});

test('contact state shows email and links', async ({ page }) => {
  await boot(page);
  await page.locator('#press-play').click();
  await page.locator('.tuner-label', { hasText: 'CONTACT' }).click();
  await page.waitForFunction(() => window.__sonic.state === 'contact');
  await expect(page.locator('#contact-email')).toBeVisible();
  expect(await page.locator('#contact-links a').count()).toBeGreaterThan(0);
});

test('reduced motion is reflected in the debug flag', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  expect(await page.evaluate(() => window.__sonic.reducedMotion)).toBe(true);
});

test('no WebGL: static fallback renders all content', async ({ page }) => {
  // force every WebGL context request to fail, before any app code runs
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
      return orig.call(this, type, ...rest);
    };
  });
  await page.goto('/?test=1');
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('body.fallback-mode')).toBeVisible();
  // every section's content is present
  expect(await page.locator('#fallback audio').count()).toBe(3);
  expect(await page.locator('#fallback .fb-visual').count()).toBe(6);
  expect(await page.locator('#fallback .fb-build').count()).toBe(4);
  await expect(page.locator('#fallback .fb-contact .contact-email')).toBeVisible();
});

test('mobile viewport: tuner is reachable and touch targets are generous', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.locator('#press-play').click();
  await page.waitForFunction(() => window.__sonic.state === 'audio');
  const box = await page.locator('.tuner-label', { hasText: 'VISUAL' }).boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(34);
});
