// VISUAL state: particle-mosaic gallery. DOM hotspots mirror the 3D thumb
// rects (accessibility + reliable touch); thumbnail pixels are baked into
// the live color texture as images lazy-load, one at a time.

import { buildTargets } from '../scene/particles/targets/index.js';
import { bakeThumb, THUMBS_PER_PAGE } from '../scene/particles/targets/visual.js';

export function createVisualState({ particles, stage, content, lightbox }) {
  const hotspotsEl = document.getElementById('visual-hotspots');
  const captionEl = document.getElementById('visual-caption');

  let page = 0;
  let meta = null;
  let bakeQueue = [];
  let baking = false;
  const pages = Math.max(1, Math.ceil(content.visuals.length / THUMBS_PER_PAGE));

  function showCaption(visual) {
    if (!visual) {
      captionEl.classList.remove('visible');
      return;
    }
    captionEl.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = visual.title;
    const p = document.createElement('p');
    p.textContent = visual.description;
    captionEl.append(h, p);
    if (pages > 1) {
      const pager = document.createElement('p');
      pager.textContent = `${page + 1} / ${pages} — swipe pages with ⇧←→`;
      pager.style.opacity = '0.5';
      captionEl.append(pager);
    }
    captionEl.classList.add('visible');
  }

  function positionHotspots() {
    if (!meta) return;
    hotspotsEl.innerHTML = '';
    meta.thumbs.forEach((thumb, i) => {
      const c = stage.project(thumb.center.x, thumb.center.y, 0);
      const e = stage.project(thumb.center.x + thumb.halfW, thumb.center.y + thumb.halfH, 0);
      const btn = document.createElement('button');
      btn.className = 'visual-hotspot';
      btn.style.left = `${c.x}px`;
      btn.style.top = `${c.y}px`;
      btn.style.width = `${Math.max(44, (e.x - c.x) * 2)}px`;
      btn.style.height = `${Math.max(44, (c.y - e.y) * 2)}px`;
      btn.setAttribute('aria-label', `${thumb.visual.title} — open`);
      btn.addEventListener('pointerenter', () => focusThumb(i));
      btn.addEventListener('pointerleave', () => focusThumb(-1));
      btn.addEventListener('focus', () => focusThumb(i));
      btn.addEventListener('blur', () => focusThumb(-1));
      btn.addEventListener('click', () => lightbox.open(thumb.visual, btn));
      hotspotsEl.appendChild(btn);
    });
  }

  function focusThumb(i) {
    particles.setFocusThumb(i);
    showCaption(i >= 0 ? meta?.thumbs[i]?.visual : null);
  }

  function pumpBakeQueue() {
    if (baking || !bakeQueue.length) return;
    baking = true;
    const thumb = bakeQueue.shift();
    const url = thumb.visual.thumb || thumb.visual.poster;
    if (!url) { baking = false; pumpBakeQueue(); return; }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      // skip if the layout was rebuilt while loading
      if (meta?.thumbs.includes(thumb) && !thumb.baked) bakeThumb(thumb, img, particles);
      baking = false;
      pumpBakeQueue();
    };
    img.onerror = () => { baking = false; pumpBakeQueue(); };
    img.src = url;
  }

  return {
    name: 'visual',
    index: 1,
    label: 'VISUAL',
    buildExtra: () => ({ page }),
    enter(builtMeta) {
      meta = builtMeta;
      positionHotspots();
      showCaption(null);
      bakeQueue = [...meta.thumbs];
      pumpBakeQueue();
    },
    exit() {
      focusThumb(-1);
      hotspotsEl.innerHTML = '';
      captionEl.classList.remove('visible');
    },
    update() {},
    onResize() { positionHotspots(); },
    setPage(machine, dir) {
      if (pages <= 1) return;
      page = ((page + dir) % pages + pages) % pages;
      machine.refresh({ page });
    },
  };
}

export { buildTargets };
