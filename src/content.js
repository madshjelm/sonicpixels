// Loads and validates /public/content.json — the single file the site owner
// edits. Malformed entries are skipped with a warning, never a crash.

const str = (v) => (typeof v === 'string' && v.length > 0 ? v : null);

// Paths must be relative (no leading slash) so the site works both at the
// custom domain root and under /sonicpixels/ on github.io.
function mediaPath(v) {
  const s = str(v);
  if (!s) return null;
  if (s.startsWith('/') || s.includes('://')) {
    console.warn(`[content] path must be relative (got "${s}") — entry skipped`);
    return null;
  }
  return s;
}

function parseTracks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t, i) => {
      const title = str(t?.title) ?? `Track ${i + 1}`;
      const file = mediaPath(t?.file);
      if (!file) { console.warn('[content] track missing file:', t); return null; }
      return { id: str(t?.id) ?? `track-${i}`, title, file };
    })
    .filter(Boolean);
}

function parseVisuals(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v, i) => {
      const type = v?.type === 'video' ? 'video' : 'image';
      const file = mediaPath(v?.file);
      if (!file) { console.warn('[content] visual missing file:', v); return null; }
      return {
        id: str(v?.id) ?? `visual-${i}`,
        type,
        file,
        thumb: mediaPath(v?.thumb) ?? (type === 'image' ? file : null),
        poster: mediaPath(v?.poster) ?? mediaPath(v?.thumb),
        title: str(v?.title) ?? `Untitled ${i + 1}`,
        description: str(v?.description) ?? '',
      };
    })
    .filter(Boolean);
}

function parseBuilds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b, i) => {
      const title = str(b?.title);
      if (!title) { console.warn('[content] build missing title:', b); return null; }
      return {
        id: str(b?.id) ?? `build-${i}`,
        title,
        description: str(b?.description) ?? '',
        tags: Array.isArray(b?.tags) ? b.tags.filter((t) => str(t)) : [],
        url: str(b?.url) ?? null,
      };
    })
    .filter(Boolean);
}

function parseContact(raw) {
  return {
    name: str(raw?.name) ?? 'Sonic Pixels',
    email: str(raw?.email) ?? '',
    blurb: str(raw?.blurb) ?? '',
    links: Array.isArray(raw?.links)
      ? raw.links
          .map((l) => (str(l?.label) && str(l?.url) ? { label: l.label, url: l.url } : null))
          .filter(Boolean)
      : [],
  };
}

export async function loadContent() {
  const res = await fetch('content.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`content.json failed to load (${res.status})`);
  const raw = await res.json();
  return {
    meta: {
      title: str(raw?.meta?.title) ?? 'SONIC PIXELS',
      artist: str(raw?.meta?.artist) ?? '',
      tagline: str(raw?.meta?.tagline) ?? '',
    },
    tracks: parseTracks(raw?.tracks),
    visuals: parseVisuals(raw?.visuals),
    builds: parseBuilds(raw?.builds),
    contact: parseContact(raw?.contact),
  };
}
