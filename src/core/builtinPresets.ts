/**
 * Built-in presets: full deterministic parameter sets.
 */

import type { WallpaperParams, Style, ThemeMode } from './params';
import { defaultParams } from './params';

export interface Preset {
  id: string;
  nameKey: string;
  params: WallpaperParams;
}

interface Patch {
  colors: string[];
  theme: Exclude<ThemeMode, 'custom'>;
  colorShare?: number;
  blur?: number;
  grain?: { strength: number; size: number };
  vignette?: number;
  structure?: Partial<WallpaperParams['structure']>;
}

function make(seed: string, style: Style, patch: Patch): WallpaperParams {
  const p = defaultParams();
  p.seed = seed;
  p.style = style;
  p.palette.colors = patch.colors;
  p.palette.locked = patch.colors.map(() => false);
  p.background.theme = patch.theme;
  p.colorShare = patch.colorShare ?? p.colorShare;
  p.blur = patch.blur ?? p.blur;
  if (patch.grain) p.grain = patch.grain;
  p.vignette = patch.vignette ?? p.vignette;
  if (patch.structure) Object.assign(p.structure, patch.structure);
  return p;
}

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'silk-noir',
    nameKey: 'preset.silkNoir',
    params: make('velvet-2731', 'silk', {
      colors: ['#1e3fae', '#4f46e5', '#8b5cf6', '#c4b5fd'],
      theme: 'dark',
      colorShare: 0.55,
      blur: 0.3,
      grain: { strength: 0.15, size: 1.5 },
      vignette: 0.3,
    }),
  },
  {
    id: 'neon-drift',
    nameKey: 'preset.neonDrift',
    params: make('neon-10442', 'silk', {
      colors: ['#2563eb', '#7c3aed', '#d946ef', '#22d3ee'],
      theme: 'dark',
      colorShare: 0.45,
      blur: 0.2,
      grain: { strength: 0.2, size: 1.4 },
      vignette: 0.35,
      structure: { streaks: 1.1, warp: 1.3 },
    }),
  },
  {
    id: 'amber-deep',
    nameKey: 'preset.amberDeep',
    params: make('amber-8267', 'silk', {
      colors: ['#7c2d12', '#ea580c', '#f59e0b', '#fcd34d'],
      theme: 'dark',
      colorShare: 0.5,
      blur: 0.45,
      grain: { strength: 0.16, size: 1.8 },
      vignette: 0.4,
    }),
  },
  {
    id: 'violet-silk',
    nameKey: 'preset.violetSilk',
    params: make('orbit-5520', 'silk', {
      colors: ['#1e1b4b', '#4338ca', '#7c3aed', '#a78bfa', '#e0e7ff'],
      theme: 'dark',
      colorShare: 0.6,
      blur: 0.35,
      grain: { strength: 0.14, size: 1.5 },
      vignette: 0.25,
    }),
  },
  {
    id: 'pastel-dawn',
    nameKey: 'preset.pastelDawn',
    params: make('dawn-3317', 'mesh', {
      colors: ['#93c5fd', '#c4b5fd', '#f9a8d4', '#fecdd3'],
      theme: 'light',
      colorShare: 0.7,
      blur: 0.55,
      grain: { strength: 0.12, size: 1.6 },
      vignette: 0.08,
    }),
  },
  {
    id: 'mist-forest',
    nameKey: 'preset.mistForest',
    params: make('haze-9042', 'mesh', {
      colors: ['#134e4a', '#0f766e', '#2dd4bf', '#99f6e4'],
      theme: 'dark',
      colorShare: 0.4,
      blur: 0.6,
      grain: { strength: 0.15, size: 2 },
      vignette: 0.35,
    }),
  },
  {
    id: 'aurora-borealis',
    nameKey: 'preset.auroraBorealis',
    params: make('aurora-6114', 'aurora', {
      colors: ['#312e81', '#6d28d9', '#10b981', '#6ee7b7'],
      theme: 'dark',
      colorShare: 0.5,
      blur: 0.3,
      grain: { strength: 0.18, size: 1.5 },
      vignette: 0.3,
      structure: { streaks: 1.15 },
    }),
  },
  {
    id: 'daylight-haze',
    nameKey: 'preset.daylightHaze',
    params: make('shore-2288', 'aurora', {
      colors: ['#bfdbfe', '#93c5fd', '#e9d5ff', '#fbcfe8'],
      theme: 'light',
      colorShare: 0.65,
      blur: 0.5,
      grain: { strength: 0.1, size: 1.6 },
      vignette: 0.06,
    }),
  },
];
