# Sonic Pixels

**[sonicpixels.dk](https://sonicpixels.dk)** — a one‑page, audio‑reactive 3D portfolio for Mads‑Bjørn Hjelmar.

The whole site is a single continuous WebGL scene: a universe of glowing square "pixels" driven in real time by the music that is playing. Four states — **AUDIO · VISUAL · BUILDS · CONTACT** — are navigated with a radio‑style *tuner* at the bottom of the screen. The scene never reloads or scrolls; the particle field morphs in place between states. Sound generates the visuals — that is the whole idea.

- **No backend, no CMS, no WordPress.** Static site, deploys to GitHub Pages.
- **All content lives in one file** (`public/content.json`) and one folder (`public/media/`). Adding a track or a project is a JSON edit and a file drop — never a code change.
- Works from 4K desktops down to mid‑range phones, with reduced‑motion and no‑WebGL fallbacks.

---

## Table of contents

1. [Run it locally](#run-it-locally)
2. [Editing content — the only file you touch](#editing-content)
3. [Adding your own media](#adding-your-own-media)
4. [Deploy to GitHub Pages](#deploy-to-github-pages)
5. [Point sonicpixels.dk at it (Nordicway DNS)](#custom-domain)
6. [Replacing your old WordPress site](#replacing-wordpress)
7. [Regenerating the placeholder media](#regenerating-media)
8. [Performance, quality tiers & debug flags](#performance)
9. [Accessibility & fallbacks](#accessibility)
10. [How it's built](#architecture)
11. [Testing](#testing)

---

<a name="run-it-locally"></a>
## 1. Run it locally

Requires **Node 20+** (built and tested on Node 22).

```bash
npm install
npm run dev      # http://localhost:5173
```

Build a production bundle and preview it:

```bash
npm run build    # outputs to dist/
npm run preview
```

---

<a name="editing-content"></a>
## 2. Editing content — the only file you touch

Everything on the site is read from **`public/content.json`**. Open it, change the text, save. That's it. Below is the full schema with every field.

```jsonc
{
  "version": 1,

  "meta": {
    "title":   "SONIC PIXELS",            // the wordmark on the landing screen
    "artist":  "Mads-Bjørn Hjelmar",      // also drawn as the CONTACT constellation
    "tagline": "music · visuals · builds" // small line under the title (fallback page)
  },

  // AUDIO — the player. Music plays across ALL four states.
  "tracks": [
    { "id": "low-orbit", "title": "Low Orbit", "file": "media/audio/low-orbit.mp3" }
    // add as many as you like — the player and the spectrum just grow.
  ],

  // VISUAL — the floating gallery. "image" or "video".
  "visuals": [
    {
      "id":    "phosphor-lattice",
      "type":  "image",                                  // "image" | "video"
      "file":  "media/visuals/phosphor-lattice.png",     // the full piece (opens in the lightbox)
      "thumb": "media/visuals/phosphor-lattice.thumb.png", // small image used to build the particle mosaic
      "title": "Phosphor Lattice",
      "description": "Shown in the lightbox. Explain the piece here."
    },
    {
      "id":     "sweep",
      "type":   "video",
      "file":   "media/visuals/sweep.mp4",
      "thumb":  "media/visuals/sweep.thumb.png",          // required for video (a poster frame)
      "poster": "media/visuals/sweep.thumb.png",          // shown before the video plays
      "title":  "Sweep",
      "description": "Video plays inside the in-scene lightbox."
    }
  ],

  // BUILDS — the circuit board of projects.
  "builds": [
    {
      "id":    "sonic-pixels",
      "title": "Sonic Pixels",
      "description": "What it is, in a sentence or two.",
      "tags":  ["webgl2", "glsl", "web-audio"],
      "url":   "https://github.com/madshjelm/sonicpixels"  // optional; omit for no link
    }
  ],

  // CONTACT — the quiet closing screen.
  "contact": {
    "name":  "Mads-Bjørn Hjelmar",          // drawn as the particle constellation
    "email": "hello@sonicpixels.dk",         // shown as a mailto link
    "blurb": "Copenhagen. Available for scores, installations and odd machines.",
    "links": [
      { "label": "GitHub",    "url": "https://github.com/madshjelm" },
      { "label": "Instagram", "url": "https://instagram.com/sonicpixels" }
    ]
  }
}
```

**Rules that keep it from breaking:**

- **All `file` / `thumb` / `poster` paths are relative** (no leading `/`). They are resolved against `public/`. This is what lets the same build work at `sonicpixels.dk` *and* at a `github.io/<repo>` preview URL.
- A malformed entry is **skipped with a console warning**, never a crash — so a typo in one track won't take the site down.
- `id` should be unique but is optional (auto‑generated if missing).
- The placeholder email is `hello@sonicpixels.dk`. **Change it to your real address before launch.**

---

<a name="adding-your-own-media"></a>
## 3. Adding your own media

1. Drop the file into the right folder under **`public/media/`**:
   - audio → `public/media/audio/`
   - images & video → `public/media/visuals/`
2. For **images**, also export a small thumbnail (≈256 px on the long edge) next to it — that's what the particle mosaic is built from. (If you omit `thumb` for an image, the full file is downscaled in the browser instead; providing a real thumb is faster.)
   For **video**, export one poster frame as a `.png` and point both `thumb` and `poster` at it.
3. Add an entry to the matching array in `content.json`.

No build step, no code. Reload and it's there.

**Recommended formats / sizes** (for smooth playback on phones):
- Audio: MP3 or M4A, ~128–192 kbps. The browser *streams* these (it does not preload the whole file).
- Images: JPG/PNG/WebP, long edge ≤ 2048 px for the full piece.
- Video: **MP4 (H.264 + AAC)**, 720p or 1080p, a few Mbit/s. H.264 plays everywhere including iOS.

---

<a name="deploy-to-github-pages"></a>
## 4. Deploy to GitHub Pages

This repo ships a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds the site and publishes it. You enable it once.

1. Push this repository to GitHub (branch `main`).
2. On GitHub: **Settings → Pages → Build and deployment → Source → "GitHub Actions"**.
3. That's it. Every push to `main` now builds and deploys automatically. Watch progress under the **Actions** tab; the first run prints the live URL.

The workflow runs `npm ci`, verifies the media files, runs `npm run build`, and uploads `dist/`. No secrets or extra configuration required.

> The build uses `base: './'` (see `vite.config.js`), so it works whether it's served from the domain root or a project sub‑path.

---

<a name="custom-domain"></a>
## 5. Point sonicpixels.dk at it (Nordicway DNS)

The file **`public/CNAME`** already contains `sonicpixels.dk`, so the custom domain survives every deploy. You just need DNS.

**A. Tell GitHub the domain**
- **Settings → Pages → Custom domain →** enter `sonicpixels.dk` → Save.

**B. Add DNS records at Nordicway** (their control panel → DNS for `sonicpixels.dk`):

| Type  | Host / Name | Value |
|-------|-------------|-------|
| A     | `@`         | `185.199.108.153` |
| A     | `@`         | `185.199.109.153` |
| A     | `@`         | `185.199.110.153` |
| A     | `@`         | `185.199.111.153` |
| CNAME | `www`       | `madshjelm.github.io.` |

(Those four A records are GitHub Pages' fixed IPs. The `www` CNAME must point at `<your-github-username>.github.io` — shown here as `madshjelm`; change if your account differs.)

Optional IPv6 (AAAA on `@`): `2606:50c0:8000::153`, `…8001::153`, `…8002::153`, `…8003::153`.

**C. Wait & secure**
- DNS can take from minutes up to ~24h to propagate.
- Once GitHub validates the domain, tick **Settings → Pages → Enforce HTTPS**. A free certificate is issued automatically.

If you delete a record at Nordicway, don't remove the existing `@`/`www` ones that Nordicway needs for mail — only adjust the web records above.

---

<a name="replacing-wordpress"></a>
## 6. Replacing your old WordPress site

To swap the live site over with the least downtime:

1. **Deploy here first** and confirm it works on the temporary GitHub URL (`https://madshjelm.github.io/sonicpixels/`).
2. In Nordicway, **change the DNS A/CNAME records** for `sonicpixels.dk` to the GitHub values above. This is the moment the domain starts pointing at the new site.
3. Wait for propagation, then verify `https://sonicpixels.dk` shows Sonic Pixels and HTTPS is green.
4. Only then **delete the old WordPress install** in Nordicway (database + files). Keep a backup for a week just in case.

There is nothing from WordPress to migrate — all content lives in `content.json`, which you've already filled in.

---

<a name="regenerating-media"></a>
## 7. Regenerating the placeholder media

The repo ships with generated placeholders so the reactive visuals work out of the box: 3 synthesized tracks (each designed to exercise bass / mids / highs differently), 4 generative images and 2 short videos. You normally never run this — but it's fully reproducible:

```bash
npm run gen:media     # writes public/media/** and verifies it
npm run verify:media  # integrity check only (also runs in CI)
```

It uses pure JavaScript / WASM (no ffmpeg): `@breezystack/lamejs` for MP3, `pngjs` for the images, `h264-mp4-encoder` for the MP4s. When you add real content you can simply delete the placeholder files and remove their entries from `content.json`.

---

<a name="performance"></a>
## 8. Performance, quality tiers & debug flags

The site detects device capability at startup (WebGL2 + float‑texture support, GPU renderer string, memory, screen) and picks a **quality tier**, then a runtime governor watches frame time and degrades gracefully if needed (drops chromatic aberration, then bloom resolution, then pixel ratio, then particle count) — and promotes back when there's headroom.

| Tier | Particles | Used on |
|------|-----------|---------|
| T3   | ~200k     | discrete‑GPU desktops |
| T2   | ~102k     | typical laptops / strong phones |
| T1   | ~43k      | mid‑range phones |
| T0   | ~12k      | weak GPUs / no float textures (CPU sim) |

**URL parameters** (handy for testing):
- `?quality=t0|t1|t2|t3` — force a tier.
- `?cpusim` — force the CPU simulation path.
- `?nogl` — simulate no‑WebGL (renders the static fallback).
- `?test=1` — expose `window.__sonic` with live state for inspection/automation.

---

<a name="accessibility"></a>
## 9. Accessibility & fallbacks

- **Keyboard:** the tuner is a real ARIA slider — Tab to it, then ←/→/Home/End. Arrow keys also work anywhere. Every control is focusable; the lightbox traps focus and closes on Esc.
- **Reduced motion:** `prefers-reduced-motion` switches to a calm, low‑motion variant (gentle breathing, shorter transitions, no chromatic aberration).
- **No WebGL:** if WebGL is unavailable, a handsome static document renders with *all* content — every track (with audio players), image, video, build and the contact details.
- **No JavaScript:** a `<noscript>` message explains the site needs JS.
- Touch targets on the tuner and controls are ≥ 44 px.

---

<a name="architecture"></a>
## 10. How it's built

**Vanilla Three.js + Vite** (not React Three Fiber). The site is one imperative render loop with hand‑rolled DOM UI; a component framework would add weight and indirection for no benefit here.

The particle motion is a **GPGPU simulation**: positions live in floating‑point textures and chase per‑state target positions with an exponential approach. That makes transitions smooth *and* interruptible by construction — retuning mid‑morph just changes what the particles are chasing. Idle breathing, audio displacement and hover pulses are added on top in the vertex shader, so the audio waveform stays razor‑sharp while the big morph eases underneath. A CPU fallback runs the identical math at a lower particle count for devices without float‑texture rendering.

Audio is analysed with the Web Audio `AnalyserNode` (FFT + waveform), split into **bass / mids / highs** plus a smoothed energy value and a beat detector, and uploaded to the GPU each frame.

```
src/
  main.js                  boot, capability detection, the single rAF loop
  palette.js               the six named colours (also written to CSS)
  content.js               loads & validates content.json
  quality.js               tier detection + runtime fps governor
  audio/                   engine (streaming + crossfade) · analysis (bands/beat)
  scene/                   stage (renderer/camera) · postfx (bloom/CA/CRT)
    particles/             simulator (GPU & CPU) · shaders · per-state targets
  states/                  machine + the four states' enter/exit/update hooks
  ui/                      tuner · player · lightbox
  fallback/static.js       the no-WebGL document
public/
  content.json             ← the file you edit
  media/                   ← the files you drop in
  CNAME                    custom domain
```

**Palette** (in `src/palette.js`): `void #070A12`, `signal #8A7BFF`, `phosphor #5DF2D6`, `pulse #FF5E8A`, `solar #FFB454`, `ghost #B4BDD8`. Type: **VT323** (display/tuner) + **Space Grotesk** (body), self‑hosted.

---

<a name="testing"></a>
## 11. Testing

End‑to‑end tests (Playwright) cover booting, the audio chain, all four tuner transitions, keyboard navigation, interruptible retuning, the lightbox, reduced motion, the mobile viewport and the no‑WebGL fallback.

```bash
npm test
```

(The first run downloads a headless browser. The suite starts its own dev server.)
