# SpectraWall

**Procedural wallpaper generator** — beautiful silky gradient wallpapers at any resolution, from Full HD to 16K, with a custom size option. Free, open source, runs in the browser on Windows, Linux and macOS.

<p align="center">
  <img src="docs/screenshots/silk-noir.png" width="32%" alt="Silk waves style" />
  <img src="docs/screenshots/aurora.png" width="32%" alt="Aurora style" />
  <img src="docs/screenshots/pastel-dawn.png" width="32%" alt="Soft mesh style, light theme" />
</p>

## Features

- **Three generative styles** — Silk waves, Aurora, Soft mesh — all GPU-rendered (WebGL2).
- **Any resolution**: FHD / QHD / 4K / 5K / 8K / **16K** (15360×8640), ultrawide, phone sizes, or any custom W×H up to 16384×16384. Export renders in tiles, so huge images work on any GPU.
- **Deterministic seeds**: every wallpaper is defined by a seed string plus parameters. Same seed → identical picture at any resolution, on any OS.
- **Detailed controls**:
  - palette: up to 6 colors, editable, lockable, or one-click harmonious random palettes (OKLCH color space);
  - dark / light theme or a custom background color;
  - color coverage — how much of the frame is colored vs background;
  - softness, film grain (strength & size), vignette;
  - advanced (seed-derived, overridable): layers, pattern scale, warp, streaks, intensity.
- **History**: every saved generation is stored locally (IndexedDB) with a thumbnail — reopen, duplicate, tweak, re-export at a different resolution. Import/export the whole collection as JSON.
- **Share links**: the full parameter set is compressed into the URL — send a wallpaper to anyone and they'll see exactly your picture.
- **Presets**: 8 curated built-ins, plus your own saved settings.
- **EN / RU interface**.
- Zero runtime dependencies; production build is ~19 KB gzipped. Works offline after the first load.

## Getting started

```bash
npm install
npm run dev        # development server → http://localhost:5173
```

Production build (static files, host anywhere — GitHub Pages, any static server):

```bash
npm run build      # outputs dist/
npm run preview    # serve dist/ locally
```

Requirements: any browser with WebGL2 (Chrome, Edge, Firefox, Safari 16+). Node.js 18+ for development.
Exporting 8K–16K images is best done in a desktop browser with a few GB of free RAM.

## How rendering works

The wallpaper is a single GLSL fragment shader: a seeded, domain-warped noise flow mapped through your palette, with style-specific structure (anisotropic silk sheets, vertical aurora curtains, or gaussian color blobs for the mesh style). All coordinates are aspect-normalized, so composition is resolution-independent; film grain is computed in absolute pixels so the grain in preview matches the 16K export exactly. Dithering is applied to eliminate banding on dark gradients.

Export renders the scene in up-to-4096-px tiles (with a uniform pixel offset — seamless by construction) and streams them through a native `CompressionStream`-based PNG encoder — no canvas size limits, no giant memory spikes.

## Roadmap

- [x] **v0.1 — still images**: 3 styles, seeds, palettes, effects, tiled export to 16K, history, share links, EN/RU.
- [ ] **v0.2 — animated wallpapers**: seamlessly looping animation (the noise field already moves on a closed circle in noise-time), live preview, and video export — MP4 (WebCodecs), WebM fallback, or a ZIP of PNG frames for external encoders.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
