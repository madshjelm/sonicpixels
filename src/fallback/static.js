// No-WebGL fallback: a handsome static document with full content access.
// Same palette and typography; native media elements; zero scene machinery.

export function renderStaticFallback(content) {
  document.body.classList.add('fallback-mode');
  const root = document.getElementById('fallback');
  root.hidden = false;
  root.innerHTML = '';

  const header = document.createElement('header');
  const h1 = document.createElement('h1');
  h1.textContent = content.meta.title;
  const tagline = document.createElement('p');
  tagline.className = 'fallback-tagline';
  tagline.textContent = content.meta.tagline;
  const note = document.createElement('p');
  note.className = 'fallback-note';
  note.textContent = 'You are seeing the quiet version — this site is normally a WebGL particle instrument. All the work is below.';
  header.append(h1, tagline, note);
  root.appendChild(header);

  // AUDIO
  const audioSec = section('AUDIO');
  const trackList = document.createElement('ol');
  content.tracks.forEach((t) => {
    const li = document.createElement('li');
    li.className = 'fb-track';
    const title = document.createElement('span');
    title.className = 'fb-track-title';
    title.textContent = t.title;
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = t.file;
    li.append(title, audio);
    trackList.appendChild(li);
  });
  audioSec.appendChild(trackList);
  root.appendChild(audioSec);

  // VISUAL
  const visualSec = section('VISUAL');
  const visualList = document.createElement('ul');
  content.visuals.forEach((v) => {
    const li = document.createElement('li');
    const fig = document.createElement('figure');
    fig.className = 'fb-visual';
    if (v.type === 'video') {
      const video = document.createElement('video');
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.src = v.file;
      if (v.poster) video.poster = v.poster;
      fig.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = v.file;
      img.alt = v.title;
      fig.appendChild(img);
    }
    const cap = document.createElement('figcaption');
    const strong = document.createElement('strong');
    strong.textContent = v.title;
    const span = document.createElement('span');
    span.textContent = v.description;
    cap.append(strong, span);
    fig.appendChild(cap);
    li.appendChild(fig);
    visualList.appendChild(li);
  });
  visualSec.appendChild(visualList);
  root.appendChild(visualSec);

  // BUILDS
  const buildsSec = section('BUILDS');
  const buildsList = document.createElement('ul');
  content.builds.forEach((b) => {
    const li = document.createElement('li');
    li.className = 'fb-build';
    const h3 = document.createElement('h3');
    if (b.url) {
      const a = document.createElement('a');
      a.href = b.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = b.title;
      h3.appendChild(a);
    } else {
      h3.textContent = b.title;
    }
    const p = document.createElement('p');
    p.textContent = b.description;
    const tags = document.createElement('ul');
    tags.className = 'build-tags';
    b.tags.forEach((t) => {
      const tag = document.createElement('li');
      tag.textContent = t;
      tags.appendChild(tag);
    });
    li.append(h3, p, tags);
    buildsList.appendChild(li);
  });
  buildsSec.appendChild(buildsList);
  root.appendChild(buildsSec);

  // CONTACT
  const contactSec = section('CONTACT');
  const wrap = document.createElement('div');
  wrap.className = 'fb-contact';
  const blurb = document.createElement('p');
  blurb.textContent = content.contact.blurb;
  wrap.appendChild(blurb);
  if (content.contact.email) {
    const a = document.createElement('a');
    a.className = 'contact-email';
    a.href = `mailto:${content.contact.email}`;
    a.textContent = content.contact.email;
    wrap.appendChild(a);
  }
  const links = document.createElement('nav');
  links.className = 'contact-links';
  content.contact.links.forEach((l) => {
    const a = document.createElement('a');
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = l.label;
    links.appendChild(a);
  });
  wrap.appendChild(links);
  contactSec.appendChild(wrap);
  root.appendChild(contactSec);
}

function section(title) {
  const sec = document.createElement('section');
  const h2 = document.createElement('h2');
  h2.textContent = title;
  sec.appendChild(h2);
  return sec;
}
