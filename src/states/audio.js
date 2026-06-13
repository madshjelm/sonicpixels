// AUDIO state: the oscilloscope. Scene work happens in the shaders; this
// module owns the DOM player.

export function createAudioState({ engine, player }) {
  return {
    name: 'audio',
    index: 0,
    label: 'AUDIO',
    enter() { player.refresh(); },
    exit() {},
    update(dt, audio) { player.update(dt, audio); },
  };
}
