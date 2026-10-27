# Contributing to SpectraWall

Thanks for your interest in improving SpectraWall!

## Development

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build      # typecheck + production build
```

Before opening a PR, make sure `npm run typecheck`, `npm test` and `npm run build` all pass.
CI runs the same three steps on Ubuntu and Windows.

## Guidelines

- Keep the zero-runtime-dependency property: don't add runtime npm packages without discussing it first.
- Rendering lives in `src/render/` (GLSL + WebGL2 plumbing), parameters and persistence in `src/core/`, UI in `src/ui/`.
- Any change to the visual output must stay **deterministic**: the same seed + params must produce the same picture. Never use `Math.random()` or `Date.now()` in render paths.
- If you change the parameter shape, update `sanitizeParams` (and bump `version` if old saved data would migrate differently).
- UI strings go through i18n — add keys to **both** `locales/en.ts` and `locales/ru.ts`.
- Keep the exported image identical to the preview: preview and export must only differ in resolution.

## Reporting bugs

Include: OS + browser version, the seed and a share link (Copy link button) or exported JSON, and what you expected vs what happened.
