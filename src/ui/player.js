// Minimal player UI for the AUDIO state: track list, transport, title, time.

export class Player {
  constructor(engine, tracks) {
    this.engine = engine;
    this.tracks = tracks;
    this.titleEl = document.getElementById('player-title');
    this.timeEl = document.getElementById('player-time');
    this.listEl = document.getElementById('player-list');
    this.toggleBtn = document.getElementById('player-toggle');
    this._lastTime = '';

    document.getElementById('player-prev').addEventListener('click', () => engine.prev());
    document.getElementById('player-next').addEventListener('click', () => engine.next());
    this.toggleBtn.addEventListener('click', () => {
      engine.toggle();
      this.syncToggle();
    });

    this.listEl.innerHTML = '';
    this.itemNodes = tracks.map((track, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'player-track';
      const idx = document.createElement('span');
      idx.className = 'player-track-index';
      idx.textContent = String(i + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.textContent = track.title;
      btn.append(idx, name);
      btn.addEventListener('click', () => engine.select(i));
      li.appendChild(btn);
      this.listEl.appendChild(li);
      return btn;
    });

    engine.onTrackChange = (track, index) => {
      this.titleEl.textContent = track.title;
      this.itemNodes.forEach((n, i) => n.setAttribute('aria-current', i === index ? 'true' : 'false'));
      this.syncToggle();
    };
  }

  syncToggle() {
    const playing = this.engine.playing;
    this.toggleBtn.textContent = playing ? '⏸' : '▶';
    this.toggleBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  refresh() { this.syncToggle(); }

  update(dt, audio) {
    const deck = this.engine.currentDeck;
    if (deck) {
      const t = deck.currentTime;
      const stamp = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      if (stamp !== this._lastTime) {
        this._lastTime = stamp;
        this.timeEl.textContent = stamp;
      }
    }
    const root = document.documentElement.style;
    root.setProperty('--eq1', audio.bass.toFixed(3));
    root.setProperty('--eq2', audio.mids.toFixed(3));
    root.setProperty('--eq3', audio.highs.toFixed(3));
  }
}
