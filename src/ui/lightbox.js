// Lightbox: a DOM overlay visually stitched into the scene (the particle
// field recedes and dims while it is open). Native <video> because flawless
// playback on phones is non-negotiable. Music ducks while a video plays.

export class Lightbox {
  constructor({ particles, engine }) {
    this.particles = particles;
    this.engine = engine;
    this.root = document.getElementById('lightbox');
    this.mediaEl = document.getElementById('lightbox-media');
    this.titleEl = document.getElementById('lightbox-title');
    this.descEl = document.getElementById('lightbox-desc');
    this.closeBtn = document.getElementById('lightbox-close');
    this.returnFocus = null;
    this.ducked = false;

    this.closeBtn.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Tab') {
        this.trapFocus(e);
      }
    });
  }

  get isOpen() { return !this.root.hidden; }

  open(visual, returnFocus) {
    this.returnFocus = returnFocus ?? document.activeElement;
    this.titleEl.textContent = visual.title;
    this.descEl.textContent = visual.description;
    this.mediaEl.innerHTML = '';

    if (visual.type === 'video') {
      const video = document.createElement('video');
      video.src = visual.file;
      video.controls = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.preload = 'metadata';
      if (visual.poster) video.poster = visual.poster;
      video.addEventListener('play', () => this.duck(true));
      video.addEventListener('pause', () => this.duck(false));
      video.addEventListener('ended', () => this.duck(false));
      this.mediaEl.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = visual.file;
      img.alt = visual.title;
      img.decoding = 'async';
      this.mediaEl.appendChild(img);
    }

    this.root.hidden = false;
    requestAnimationFrame(() => this.root.classList.add('open'));
    this.particles.setRecede(true);
    this.closeBtn.focus();
  }

  close() {
    this.root.classList.remove('open');
    this.duck(false);
    const video = this.mediaEl.querySelector('video');
    if (video) video.pause();
    setTimeout(() => {
      this.root.hidden = true;
      this.mediaEl.innerHTML = '';
    }, 300);
    this.particles.setRecede(false);
    this.returnFocus?.focus?.();
  }

  duck(on) {
    if (on === this.ducked || !this.engine.master) return;
    this.ducked = on;
    const g = this.engine.master.gain;
    const now = this.engine.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? 0.18 : 1, now + 0.4);
  }

  trapFocus(e) {
    const focusables = this.root.querySelectorAll('button, video, a[href]');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
