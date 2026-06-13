// BUILDS state: circuit-board portfolio. DOM cards ride on the projected
// chip centers (stacked list on small screens via CSS); interacting with a
// card fires a pulse through the particle structure from its chip.

import * as THREE from 'three';

export function createBuildsState({ particles, stage, content }) {
  const cardsEl = document.getElementById('builds-cards');
  let meta = null;

  function buildCards() {
    cardsEl.innerHTML = '';
    if (!meta) return;
    meta.chips.forEach((chip) => {
      const card = document.createElement('article');
      card.className = 'build-card';
      card.tabIndex = -1;

      const h = document.createElement('h2');
      const link = document.createElement('a');
      link.textContent = chip.build.title;
      if (chip.build.url) {
        link.href = chip.build.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      h.appendChild(link);

      const p = document.createElement('p');
      p.textContent = chip.build.description;

      const tags = document.createElement('ul');
      tags.className = 'build-tags';
      chip.build.tags.forEach((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        tags.appendChild(li);
      });

      card.append(h, p, tags);
      if (chip.build.url) {
        const out = document.createElement('a');
        out.className = 'build-link';
        out.href = chip.build.url;
        out.target = '_blank';
        out.rel = 'noopener noreferrer';
        out.textContent = 'visit ↗';
        card.append(out);
      }

      const fire = () => particles.pulse(new THREE.Vector3(chip.center.x, chip.center.y, chip.center.z));
      card.addEventListener('pointerenter', fire);
      card.addEventListener('pointerdown', fire, { passive: true });
      link.addEventListener('focus', fire);

      cardsEl.appendChild(card);
      chip.cardEl = card;
    });
    positionCards();
  }

  function positionCards() {
    if (!meta || innerWidth <= 720) return; // stacked layout positions itself
    meta.chips.forEach((chip) => {
      const p = stage.project(chip.center.x, chip.center.y, 0);
      chip.cardEl.style.left = `${p.x}px`;
      chip.cardEl.style.top = `${p.y}px`;
    });
  }

  return {
    name: 'builds',
    index: 2,
    label: 'BUILDS',
    enter(builtMeta) {
      meta = builtMeta;
      buildCards();
    },
    exit() { cardsEl.innerHTML = ''; },
    update() {},
    onResize() { positionCards(); },
  };
}
