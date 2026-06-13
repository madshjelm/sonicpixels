// State machine + morph orchestration. goTo() is interruptible: the sim
// re-captures origins from wherever particles currently are, so a retune
// mid-flight redirects the swarm without a jump.

import { buildTargets } from '../scene/particles/targets/index.js';

export class StateMachine {
  constructor({ particles, stage, postfx, content, getSettings, getMotion }) {
    this.particles = particles;
    this.stage = stage;
    this.postfx = postfx;
    this.content = content;
    this.getSettings = getSettings;
    this.getMotion = getMotion;

    this.states = new Map();
    this.order = []; // tuner order
    this.current = null;
    this.onChange = null; // (state) => void, used by the tuner
  }

  register(state) {
    this.states.set(state.name, state);
    if (state.index !== undefined) this.order[state.index] = state.name;
  }

  buildCtx(extra = {}) {
    const settings = this.getSettings();
    return {
      count: this.particles.count,
      view: this.stage.view,
      content: this.content,
      mosaic: settings.mosaic,
      ...extra,
    };
  }

  goTo(name, { instant = false } = {}) {
    const next = this.states.get(name);
    if (!next || this.current === next) return;

    const fromIndex = this.current?.index ?? -1;
    const toIndex = next.index ?? 0;
    const sweepDir = toIndex >= fromIndex ? 1 : -1;

    const reduced = this.getMotion() < 0.5;
    const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 720;
    const duration = instant ? 0.6 : reduced ? 1.2 : mobile ? 1.8 : 2.4;

    this.current?.exit?.();

    const built = next.build ? next.build(this.buildCtx(next.buildExtra?.() ?? {})) : buildTargets(name, this.buildCtx());
    this.particles.morphTo(name, built.positions, built.colors, { sweepDir, duration });
    this.postfx.kickTransition(duration);
    this.postfx.setStateGrade(name);

    document.body.dataset.state = name;
    this.current = next;
    next.enter?.(built.meta);
    this.onChange?.(next);

    const live = document.getElementById('sr-live');
    if (live && next.label) live.textContent = `${next.label} section`;
  }

  // Same-state relayout (resize, gallery page change): a quick local morph.
  refresh(extra = {}) {
    if (!this.current) return;
    const s = this.current;
    const built = s.build
      ? s.build(this.buildCtx({ ...(s.buildExtra?.() ?? {}), ...extra }))
      : buildTargets(s.name, this.buildCtx(extra));
    this.particles.morphTo(s.name, built.positions, built.colors, { sweepDir: 0, duration: 1.0 });
    s.enter?.(built.meta, { refresh: true });
  }

  step(dir) {
    if (!this.current || this.current.index === undefined) return;
    const i = Math.min(this.order.length - 1, Math.max(0, this.current.index + dir));
    if (this.order[i] && this.order[i] !== this.current.name) this.goTo(this.order[i]);
  }

  update(dt, audio) {
    this.current?.update?.(dt, audio);
  }
}
