// Audio engine: two streaming decks crossfaded through Web Audio, feeding one
// AnalyserNode. Tracks stream via HTMLAudioElement (no full preload).
//
// iOS Safari has a history of MediaElementSource silently producing zeros.
// A watchdog checks the analyser shortly after play and, if dead, swaps that
// deck to a buffer strategy (fetch + decodeAudioData + AudioBufferSourceNode)
// behind the same interface.

const XFADE = 1.2; // seconds

class ElementDeck {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.el = new Audio();
    this.el.preload = 'metadata';
    this.el.crossOrigin = 'anonymous';
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.source = ctx.createMediaElementSource(this.el);
    this.source.connect(this.gain);
    this.gain.connect(destination);
    this.onended = null;
    this.el.addEventListener('ended', () => this.onended?.());
  }

  async play(url) {
    this.el.src = url;
    await this.el.play();
  }

  pause() { this.el.pause(); }
  resume() { return this.el.play(); }
  stop() { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
  get paused() { return this.el.paused; }
  get currentTime() { return this.el.currentTime || 0; }
  get duration() { return this.el.duration || 0; }
}

class BufferDeck {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(destination);
    this.node = null;
    this.buffer = null;
    this.startedAt = 0;
    this.pausedAt = 0;
    this.playing = false;
    this.onended = null;
  }

  async play(url) {
    const res = await fetch(url);
    this.buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    this.pausedAt = 0;
    this.start(0);
  }

  start(offset) {
    this.stopNode();
    this.node = this.ctx.createBufferSource();
    this.node.buffer = this.buffer;
    this.node.connect(this.gain);
    this.node.onended = () => {
      if (this.playing && this.currentTime >= this.duration - 0.05) this.onended?.();
    };
    this.node.start(0, offset);
    this.startedAt = this.ctx.currentTime - offset;
    this.playing = true;
  }

  stopNode() {
    if (this.node) {
      this.node.onended = null;
      try { this.node.stop(); } catch { /* not started */ }
      this.node.disconnect();
      this.node = null;
    }
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.currentTime;
    this.stopNode();
    this.playing = false;
  }

  resume() {
    if (this.playing || !this.buffer) return;
    this.start(this.pausedAt);
  }

  stop() { this.stopNode(); this.playing = false; this.buffer = null; this.pausedAt = 0; }
  get paused() { return !this.playing; }
  get currentTime() { return this.playing ? this.ctx.currentTime - this.startedAt : this.pausedAt; }
  get duration() { return this.buffer?.duration || 0; }
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.master = null;
    this.decks = [];
    this.active = 0;
    this.tracks = [];
    this.trackIndex = -1;
    this.useBufferDecks = false;
    this.onTrackChange = null;
    this.watchdogTimer = 0;
    this._freqProbe = null;
  }

  // Must be called synchronously inside a user gesture.
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.65;
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this._freqProbe = new Uint8Array(this.analyser.frequencyBinCount);

    this.decks = [this.makeDeck(), this.makeDeck()];
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ctx.state === 'suspended') this.ctx.resume();
    });
  }

  makeDeck() {
    const deck = this.useBufferDecks
      ? new BufferDeck(this.ctx, this.master)
      : new ElementDeck(this.ctx, this.master);
    deck.onended = () => this.next();
    return deck;
  }

  setTracks(tracks) { this.tracks = tracks; }

  get currentTrack() { return this.tracks[this.trackIndex] ?? null; }
  get currentDeck() { return this.decks[this.active]; }
  get playing() { return this.currentDeck ? !this.currentDeck.paused : false; }

  async select(index, { crossfade = true } = {}) {
    if (!this.ctx || !this.tracks.length) return;
    index = ((index % this.tracks.length) + this.tracks.length) % this.tracks.length;
    if (index === this.trackIndex && this.playing) return;

    const now = this.ctx.currentTime;
    const incoming = this.decks[1 - this.active];
    const outgoing = this.decks[this.active];

    this.trackIndex = index;
    this.onTrackChange?.(this.currentTrack, index);

    try {
      await incoming.play(this.tracks[index].file);
    } catch (err) {
      console.warn('[audio] play failed', err);
      return;
    }

    const dur = crossfade ? XFADE : 0.05;
    // equal-power crossfade
    rampEqualPower(incoming.gain.gain, outgoing.gain.gain, now, dur, this.ctx);
    this.active = 1 - this.active;
    setTimeout(() => { if (outgoing !== this.currentDeck) outgoing.stop(); }, dur * 1000 + 80);

    this.armWatchdog();
  }

  // If the analyser sees only zeros while a deck claims to play, the
  // MediaElementSource path is broken (iOS) — rebuild with buffer decks.
  armWatchdog() {
    if (this.useBufferDecks) return;
    clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      if (!this.playing) return;
      this.analyser.getByteFrequencyData(this._freqProbe);
      let alive = false;
      for (let i = 0; i < this._freqProbe.length; i += 16) {
        if (this._freqProbe[i] > 0) { alive = true; break; }
      }
      if (!alive) {
        console.warn('[audio] analyser silent — switching to buffered playback');
        const index = this.trackIndex;
        this.decks.forEach((d) => d.stop());
        this.useBufferDecks = true;
        this.decks = [this.makeDeck(), this.makeDeck()];
        this.active = 0;
        this.trackIndex = -1;
        this.select(index, { crossfade: false });
      }
    }, 700);
  }

  toggle() {
    if (!this.currentDeck) return false;
    if (this.playing) {
      this.currentDeck.pause();
    } else {
      this.ctx.resume();
      this.currentDeck.resume();
    }
    return this.playing;
  }

  next() { this.select(this.trackIndex + 1); }
  prev() { this.select(this.trackIndex - 1); }
}

function rampEqualPower(inParam, outParam, now, dur, ctx) {
  const steps = 16;
  inParam.cancelScheduledValues(now);
  outParam.cancelScheduledValues(now);
  const outStart = outParam.value;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const at = now + t * dur;
    inParam.setValueAtTime(Math.sin((t * Math.PI) / 2), at);
    outParam.setValueAtTime(outStart * Math.cos((t * Math.PI) / 2), at);
  }
}
