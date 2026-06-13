// The tuner: a synth frequency band that is also the nav. Click a label,
// click anywhere on the band (snaps to the nearest stop), drag the needle,
// flick/swipe horizontally, or use arrow keys. The needle micro-jitters
// with the music so the instrument never feels static.

const STOPS = [12.5, 37.5, 62.5, 87.5]; // % across the band
const FREQS = ['88.0', '94.5', '101.1', '107.7']; // dial dressing
const SCRAMBLE = '▖▗▘▝▚▞█▓▒░<>/\\|=+*';

export class Tuner {
  constructor(labels, { onSelect, reducedMotion }) {
    this.root = document.getElementById('tuner');
    this.band = document.getElementById('tuner-band');
    this.needle = document.getElementById('tuner-needle');
    this.labelsEl = document.getElementById('tuner-labels');
    this.onSelect = onSelect;
    this.reducedMotion = reducedMotion;
    this.index = 0;
    this.labelNodes = [];

    labels.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.className = 'tuner-label';
      btn.textContent = label;
      btn.style.left = `${STOPS[i]}%`;
      btn.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      btn.addEventListener('click', () => this.select(i));
      this.labelsEl.appendChild(btn);
      this.labelNodes.push(btn);

      const tick = document.createElement('span');
      tick.className = 'tuner-stop-tick';
      tick.style.left = `${STOPS[i]}%`;
      this.band.appendChild(tick);

      const freq = document.createElement('span');
      freq.className = 'tuner-freq';
      freq.textContent = FREQS[i];
      freq.style.left = `${STOPS[i]}%`;
      this.band.appendChild(freq);
    });

    this.setNeedle(STOPS[0]);
    this.bindPointer();
    this.bindKeys();
  }

  show() {
    this.root.hidden = false;
    this.root.classList.add('tuner-entering');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this.root.classList.remove('tuner-entering'))
    );
  }

  setNeedle(percent) {
    this.needle.style.left = `${percent}%`;
  }

  setEnergy(energy, beat) {
    if (this.reducedMotion) return;
    const jitter = (Math.random() - 0.5) * 2 * (0.6 + energy * 2.2) + beat * (Math.random() - 0.5) * 4;
    this.root.style.setProperty('--needle-jitter', jitter.toFixed(2));
  }

  // External sync (e.g. keyboard handled by the machine).
  setIndex(i, { silent = false } = {}) {
    i = Math.max(0, Math.min(STOPS.length - 1, i));
    if (i === this.index && !silent) return;
    this.index = i;
    this.setNeedle(STOPS[i]);
    this.band.setAttribute('aria-valuenow', String(i));
    this.band.setAttribute('aria-valuetext', this.labelNodes[i].textContent);
    this.labelNodes.forEach((n, j) => n.setAttribute('aria-current', j === i ? 'true' : 'false'));
    if (!this.reducedMotion) this.scramble(this.labelNodes[i]);
  }

  select(i) {
    if (i === this.index) return;
    this.setIndex(i);
    this.onSelect(i);
  }

  scramble(node) {
    const original = node.dataset.label ?? node.textContent;
    node.dataset.label = original;
    const start = performance.now();
    const tick = (now) => {
      const t = (now - start) / 250;
      if (t >= 1) { node.textContent = original; return; }
      node.textContent = original
        .split('')
        .map((ch, i) => (i / original.length < t ? ch : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]))
        .join('');
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  nearestStop(clientX) {
    const rect = this.band.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    let best = 0;
    let bestDist = Infinity;
    STOPS.forEach((s, i) => {
      const d = Math.abs(s - pct);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  bindPointer() {
    let dragging = false;
    let startX = 0;
    let startTime = 0;
    let moved = false;

    this.band.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startTime = performance.now();
      this.band.setPointerCapture(e.pointerId);
      this.root.classList.add('dragging');
    });

    this.band.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (Math.abs(e.clientX - startX) > 6) moved = true;
      const rect = this.band.getBoundingClientRect();
      const pct = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100));
      this.setNeedle(pct);
    });

    const release = (e) => {
      if (!dragging) return;
      dragging = false;
      this.root.classList.remove('dragging');
      const dx = e.clientX - startX;
      const dt = performance.now() - startTime;
      if (moved && Math.abs(dx) > 30 && dt < 300) {
        // flick: step one station in the swipe direction
        const i = Math.max(0, Math.min(STOPS.length - 1, this.index + Math.sign(dx)));
        this.setNeedle(STOPS[this.index]); // settle before commit
        this.select(i);
      } else {
        // click or slow drag: snap to nearest stop
        const i = this.nearestStop(e.clientX);
        if (i === this.index) this.setNeedle(STOPS[i]);
        else this.select(i);
      }
    };
    this.band.addEventListener('pointerup', release);
    this.band.addEventListener('pointercancel', () => {
      dragging = false;
      this.root.classList.remove('dragging');
      this.setNeedle(STOPS[this.index]);
    });
  }

  bindKeys() {
    this.band.addEventListener('keydown', (e) => {
      const map = { ArrowLeft: -1, ArrowRight: 1 };
      if (e.key in map) {
        e.preventDefault();
        this.select(Math.max(0, Math.min(STOPS.length - 1, this.index + map[e.key])));
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.select(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.select(STOPS.length - 1);
      }
    });
  }
}
