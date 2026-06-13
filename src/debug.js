// Test/debug hooks, enabled with ?test=1 — Playwright asserts against
// window.__sonic instead of reading pixels.

export function installDebugHooks(app) {
  if (!new URLSearchParams(location.search).has('test')) return;
  window.__sonicApp = app;
  window.__sonic = {
    get state() { return document.body.dataset.state; },
    get tier() { return app.governor.settings.tierName; },
    get settings() { return { ...app.governor.settings }; },
    get fps() { return app.fps; },
    get particleCount() { return app.particles?.count ?? 0; },
    get simKind() { return app.particles?.simKind ?? 'none'; },
    get bands() {
      return { bass: app.analysis.bass, mids: app.analysis.mids, highs: app.analysis.highs, energy: app.analysis.energy };
    },
    get beat() { return app.analysis.beat; },
    get degradeEvents() { return app.governor.events; },
    get reducedMotion() { return app.caps.reducedMotion; },
    get caMode() { return app.governor.settings.ca; },
    get pulseT() { return app.particles?.material.uniforms.uPulseT.value ?? 99; },
    get morphing() { return app.particles?.morphing ?? false; },
    goTo(name) { app.machine.goTo(name); },
  };
}
