// Sonic Pixels — boot, capability ladder, and the single rAF loop.
// Frame order is fixed: analysis → governor → state → sim → render.

import '@fontsource/vt323';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import './styles/base.css';
import './styles/tuner.css';
import './styles/states.css';
import './styles/fallback.css';

import { applyPaletteToCss } from './palette.js';
import { loadContent } from './content.js';
import { detectCapabilities, Governor, TIERS } from './quality.js';
import { AudioEngine } from './audio/engine.js';
import { Analysis } from './audio/analysis.js';
import { Stage } from './scene/stage.js';
import { PostFX } from './scene/postfx.js';
import { Particles } from './scene/particles/index.js';
import { StateMachine } from './states/machine.js';
import { createAudioState } from './states/audio.js';
import { createVisualState } from './states/visual.js';
import { createBuildsState } from './states/builds.js';
import { createContactState } from './states/contact.js';
import { Tuner } from './ui/tuner.js';
import { Player } from './ui/player.js';
import { Lightbox } from './ui/lightbox.js';
import { renderStaticFallback } from './fallback/static.js';
import { installDebugHooks } from './debug.js';

const loaderFill = document.getElementById('loader-fill');
const loaderLabel = document.getElementById('loader-label');
const setProgress = (pct, label) => {
  loaderFill.style.width = `${pct}%`;
  if (label) loaderLabel.textContent = label;
};

async function boot() {
  applyPaletteToCss();
  const caps = detectCapabilities();

  setProgress(15, 'loading signal…');
  let content;
  try {
    content = await loadContent();
  } catch (err) {
    console.error(err);
    loaderLabel.textContent = 'could not load content.json';
    return;
  }

  if (!caps.webgl2) {
    renderStaticFallback(content);
    return;
  }

  setProgress(40, 'loading typeface…');
  await Promise.race([
    Promise.all([document.fonts.load("230px 'VT323'"), document.fonts.load("16px 'Space Grotesk'")]),
    new Promise((r) => setTimeout(r, 3000)),
  ]);

  setProgress(65, 'building the field…');
  await new Promise((r) => requestAnimationFrame(r));

  const app = { caps };
  const reduced = caps.reducedMotion;
  const motion = () => (app.caps.reducedMotion ? 0.25 : 1);

  // --- scene ---
  const stage = new Stage(document.getElementById('stage'));
  const governor = new Governor(caps.tierIndex, {
    onChange(settings) {
      stage.resize(settings);
      postfx.configure(settings);
      postfx.setSize(innerWidth, innerHeight);
      particles.setDrawFraction(settings.drawFraction);
    },
  });
  stage.resize(governor.settings);

  const particles = new Particles(stage.renderer, stage.scene, caps, governor.settings.simSize);
  particles.seedSphere();

  const postfx = new PostFX(stage.renderer, stage.scene, stage.camera);
  postfx.reducedMotion = reduced;
  postfx.configure(governor.settings);
  postfx.setSize(innerWidth, innerHeight);

  // --- audio ---
  const engine = new AudioEngine();
  engine.setTracks(content.tracks);
  const analysis = new Analysis();

  // --- ui + states ---
  const lightbox = new Lightbox({ particles, engine });
  const player = new Player(engine, content.tracks);

  const machine = new StateMachine({
    particles,
    stage,
    postfx,
    content,
    getSettings: () => governor.settings,
    getMotion: motion,
  });

  const landingState = { name: 'landing', label: 'SONIC PIXELS', enter() {}, exit() {}, update() {} };
  const audioState = createAudioState({ engine, player });
  const visualState = createVisualState({ particles, stage, content, lightbox });
  const buildsState = createBuildsState({ particles, stage, content });
  const contactState = createContactState({ content });
  [landingState, audioState, visualState, buildsState, contactState].forEach((s) => machine.register(s));

  const tuner = new Tuner(['AUDIO', 'VISUAL', 'BUILDS', 'CONTACT'], {
    reducedMotion: reduced,
    onSelect: (i) => machine.goTo(machine.order[i]),
  });
  machine.onChange = (state) => {
    if (state.index !== undefined) tuner.setIndex(state.index, { silent: true });
  };

  // --- landing moment ---
  setProgress(100, 'ready');
  document.getElementById('landing').querySelector('.landing-loader').classList.add('done');
  machine.goTo('landing');
  app.reveal = true;

  const playBtn = document.getElementById('press-play');
  playBtn.hidden = false;
  playBtn.addEventListener('click', () => {
    engine.init(); // must be synchronous within the gesture
    engine.select(0, { crossfade: false });
    machine.goTo('audio');
    tuner.show();
    playBtn.hidden = true;
  }, { once: true });

  // --- global keyboard: arrows retune from anywhere sensible ---
  addEventListener('keydown', (e) => {
    if (lightbox.isOpen || tuner.root.hidden) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    if (t === tuner.band) return; // band has its own handler
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      if (e.shiftKey && machine.current === visualState) visualState.setPage(machine, dir);
      else machine.step(dir);
    } else if (e.key === ' ' && machine.current === audioState) {
      e.preventDefault();
      engine.toggle();
      player.syncToggle();
    }
  });

  // --- resize (debounced relayout) ---
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      stage.resize(governor.settings);
      postfx.setSize(innerWidth, innerHeight);
      if (machine.current && machine.current !== landingState) machine.refresh();
      machine.current?.onResize?.();
    }, 200);
  });

  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => {
    app.caps.reducedMotion = e.matches;
    postfx.reducedMotion = e.matches;
    tuner.reducedMotion = e.matches;
  });

  // --- the loop ---
  app.governor = governor;
  app.particles = particles;
  app.analysis = analysis;
  app.machine = machine;
  app.fps = 60;
  installDebugHooks(app);

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(rawDt, 0.05);
    app.fps += (1 / Math.max(rawDt, 1e-4) - app.fps) * 0.05;

    analysis.update(engine.analyser, dt);
    governor.morphing = particles.morphing;
    governor.sample(rawDt);
    governor.update(dt);

    machine.update(dt, analysis);
    stage.update(dt, motion());

    particles.update(dt, analysis, {
      motion: motion(),
      pointScale: stage.pointScale,
      glowComp: governor.settings.bloom ? 0 : 0.7,
      reveal: app.reveal,
    });

    postfx.update(dt, analysis);
    postfx.render(dt);

    tuner.setEnergy(analysis.energy, analysis.beat);
  }
  requestAnimationFrame(frame);
}

boot();
