/**
 * The single source of truth: versioned wallpaper parameters.
 * Everything that defines a render lives here — safe to serialize,
 * share via URL, store in history, and re-render identically.
 */

import { rngFromSeed, newSeed } from './rng';
import { generatePalette, hexToRgb, rgbToHex } from './palette';
import type { Rng } from './rng';

export type Style = 'silk' | 'mesh' | 'aurora';
export type ThemeMode = 'dark' | 'light' | 'custom';

/** Structure values can be locked by the user; null = derive from seed. */
export interface Structure {
  layers: number | null; // 3..8
  scale: number | null; // 0.5..2, pattern frequency multiplier
  warp: number | null; // 0..2, domain warp strength
  streaks: number | null; // 0..1.5, bright filament intensity
  intensity: number | null; // 0.5..1.5, color brightness multiplier
}

export interface WallpaperParams {
  version: 1;
  seed: string;
  style: Style;
  palette: {
    colors: string[]; // 2..6 hex colors
    locked: boolean[]; // per-slot lock, respected by palette reroll
  };
  background: {
    theme: ThemeMode;
    color: string; // used when theme === 'custom'
  };
  colorShare: number; // 0..1 — how much of the frame is colored vs background
  blur: number; // 0..1 — pattern softness
  grain: {
    strength: number; // 0..1
    size: number; // px, 1..8
  };
  vignette: number; // 0..1
  structure: Structure;
  animation: {
    loopSeconds: number; // 4..60, reserved for iteration 2
  };
}

export const MAX_COLORS = 6;
export const MIN_COLORS = 2;

export function defaultParams(): WallpaperParams {
  const p: WallpaperParams = {
    version: 1,
    seed: newSeed(),
    style: 'silk',
    palette: { colors: [], locked: [] },
    background: { theme: 'dark', color: '#101014' },
    colorShare: 0.45,
    blur: 0.3,
    grain: { strength: 0.18, size: 1.6 },
    vignette: 0.25,
    structure: { layers: null, scale: null, warp: null, streaks: null, intensity: null },
    animation: { loopSeconds: 12 },
  };
  rerollPalette(p, 'dark');
  return p;
}

/** Regenerate palette colors from the seed (unlocked slots only). */
export function rerollPalette(p: WallpaperParams, theme: 'dark' | 'light'): void {
  const count = p.palette.colors.length || 4;
  const rng = rngFromSeed(`palette:${p.seed}:${count}:${theme}`);
  const fresh = generatePalette(rng, count, theme);
  const locked = p.palette.locked.slice(0, count);
  while (locked.length < count) locked.push(false);
  const old = p.palette.colors;
  p.palette.colors = fresh.map((c, i) =>
    locked[i] && old[i] !== undefined ? old[i] : c,
  );
  p.palette.locked = locked;
}

export function backgroundHex(p: WallpaperParams): string {
  switch (p.background.theme) {
    case 'dark':
      return '#000000';
    case 'light':
      return '#ffffff';
    case 'custom':
      return p.background.color;
  }
}

export function isLightBackground(p: WallpaperParams): boolean {
  const { r, g, b } = hexToRgb(backgroundHex(p));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

// ---------- seed-derived structure ----------

export interface ResolvedStructure {
  layers: number;
  scale: number;
  warp: number;
  streaks: number;
  intensity: number;
  /** pure-seed extras (not user-editable) */
  rot: number;
  shift: [number, number];
  blobs: { x: number; y: number; r: number }[];
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function resolveStructure(p: WallpaperParams): ResolvedStructure {
  const r = rngFromSeed(`struct:${p.seed}`);
  const derived = {
    layers: r.int(3, 7),
    scale: round3(r.range(0.75, 1.35)),
    warp: round3(r.range(0.55, 1.45)),
    streaks: round3(r.range(0.35, 1.0)),
    intensity: round3(r.range(0.85, 1.15)),
    rot: r.range(0, Math.PI),
    shift: [round3(r.range(0, 512)), round3(r.range(0, 512))] as [number, number],
  };
  const o = p.structure;
  const layers = o.layers ?? derived.layers;
  // mesh blob layout: spread circles in the frame
  const rb = rngFromSeed(`blobs:${p.seed}`);
  const blobs: ResolvedStructure['blobs'] = [];
  for (let i = 0; i < 8; i++) {
    blobs.push({
      x: round3(rb.range(-0.62, 0.62)),
      y: round3(rb.range(-0.45, 0.45)),
      r: round3(rb.range(0.3, 0.65)),
    });
  }
  return {
    layers,
    scale: o.scale ?? derived.scale,
    warp: o.warp ?? derived.warp,
    streaks: o.streaks ?? derived.streaks,
    intensity: o.intensity ?? derived.intensity,
    rot: derived.rot,
    shift: derived.shift,
    blobs,
  };
}

/** New seed: re-derives structure overrides to null and suggests a fresh palette. */
export function rerollSeed(p: WallpaperParams): void {
  p.seed = newSeed();
  const keys = ['layers', 'scale', 'warp', 'streaks', 'intensity'] as const;
  for (const k of keys) p.structure[k] = null;
  rerollPalette(p, isLightBackground(p) ? 'light' : 'dark');
}

// ---------- serialization safety ----------

const clamp = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : dflt;
  return Math.min(hi, Math.max(lo, n));
};

const hexColor = (v: unknown, dflt: string): string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : dflt;

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], dflt: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : dflt;
}

/** Parse untrusted data (URL, imported JSON, IndexedDB) into valid params. */
export function sanitizeParams(raw: unknown): WallpaperParams {
  const d = defaultParams();
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;

  const out: WallpaperParams = {
    version: 1,
    seed:
      typeof r.seed === 'string' && r.seed.length > 0 && r.seed.length <= 64
        ? r.seed
        : d.seed,
    style: pickEnum(r.style, ['silk', 'mesh', 'aurora'] as const, 'silk'),
    palette: d.palette,
    background: d.background,
    colorShare: clamp(r.colorShare, 0, 1, d.colorShare),
    blur: clamp(r.blur, 0, 1, d.blur),
    grain: d.grain,
    vignette: clamp(r.vignette, 0, 1, d.vignette),
    structure: d.structure,
    animation: d.animation,
  };

  // palette
  const pal = r.palette as Record<string, unknown> | undefined;
  const colors = Array.isArray(pal?.colors)
    ? pal!.colors.filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
    : [];
  const trimmed = colors.slice(0, MAX_COLORS).map((c) => c.toLowerCase());
  if (trimmed.length >= MIN_COLORS) {
    out.palette.colors = trimmed;
    const locked = Array.isArray(pal?.locked) ? pal!.locked : [];
    out.palette.locked = trimmed.map((_, i) => locked[i] === true);
  }

  // background
  const bg = r.background as Record<string, unknown> | undefined;
  if (bg) {
    out.background.theme = pickEnum(
      bg.theme,
      ['dark', 'light', 'custom'] as const,
      'dark',
    );
    out.background.color = hexColor(bg.color, d.background.color);
  }

  // grain
  const gr = r.grain as Record<string, unknown> | undefined;
  if (gr) {
    out.grain = {
      strength: clamp(gr.strength, 0, 1, d.grain.strength),
      size: clamp(gr.size, 1, 8, d.grain.size),
    };
  }

  // structure overrides
  const st = r.structure as Record<string, unknown> | undefined;
  if (st && typeof st === 'object') {
    const num = (v: unknown, lo: number, hi: number): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi, lo) : null;
    out.structure = {
      layers: num(st.layers, 3, 8),
      scale: num(st.scale, 0.5, 2),
      warp: num(st.warp, 0, 2),
      streaks: num(st.streaks, 0, 1.5),
      intensity: num(st.intensity, 0.5, 1.5),
    };
  }

  // animation
  const an = r.animation as Record<string, unknown> | undefined;
  if (an) out.animation.loopSeconds = clamp(an.loopSeconds, 4, 60, d.animation.loopSeconds);

  return out;
}

export function cloneParams(p: WallpaperParams): WallpaperParams {
  return JSON.parse(JSON.stringify(p)) as WallpaperParams;
}

export { newSeed, rgbToHex };
export type { Rng };
