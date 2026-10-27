/**
 * Color utilities: sRGB hex <-> OKLCH conversions and seeded palette generation.
 * Palettes are generated in OKLCH (perceptually uniform) so random palettes
 * always look harmonious, then gamut-clipped by reducing chroma.
 */

import type { Rng } from './rng';

export interface RGB {
  r: number; // 0..1
  g: number;
  b: number;
}

export interface OKLCH {
  l: number; // 0..1 perceptual lightness
  c: number; // chroma, ~0..0.33
  h: number; // hue, degrees 0..360
}

// ---------- hex <-> rgb ----------

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

// ---------- sRGB <-> linear ----------

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function linearToSrgbRgb({ r, g, b }: RGB): RGB {
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) };
}

// ---------- linear sRGB <-> OKLab ----------

function linearToOklch(rgb: RGB): OKLCH {
  const r = srgbToLinear(rgb.r),
    g = srgbToLinear(rgb.g),
    b = srgbToLinear(rgb.b);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

export function hexToOklch(hex: string): OKLCH {
  return linearToOklch(hexToRgb(hex));
}

export function oklchToHex(color: OKLCH): string {
  return rgbToHex(gamutClip(color));
}

/** Reduce chroma until the color fits into sRGB; returns gamma-encoded sRGB. */
function gamutClip({ l, c, h }: OKLCH): RGB {
  let lo = 0,
    hi = c;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const rgb = oklchToLinearRaw({ l, c: mid, h });
    if (inGamut(rgb)) lo = mid;
    else hi = mid;
  }
  return linearToSrgbRgb(oklchToLinearRaw({ l, c: lo, h }));
}

function oklchToLinearRaw({ l, c, h }: OKLCH): RGB {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = l - 0.0894841775 * A - 1.291485548 * B;
  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;
  return {
    r: 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    g: -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    b: -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  };
}

function inGamut({ r, g, b }: RGB): boolean {
  const e = 0.0005;
  return (
    r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e
  );
}

// ---------- seeded palette generation ----------

type Harmony = 'analogous' | 'complementary' | 'triadic' | 'split' | 'tetradic';

const HARMONIES: Harmony[] = [
  'analogous',
  'analogous',
  'complementary',
  'triadic',
  'split',
  'tetradic',
];

function harmonyOffsets(harmony: Harmony, i: number, r: Rng): number {
  switch (harmony) {
    case 'analogous':
      return i * r.range(22, 40) * r.sign();
    case 'complementary':
      return i < 2 ? i * r.range(15, 35) * r.sign() : 180 + (i - 2) * r.range(15, 35) * r.sign();
    case 'triadic':
      return (i % 3) * r.range(110, 130) + Math.floor(i / 3) * r.range(15, 30) * r.sign();
    case 'split':
      return i === 0 ? 0 : 150 + (i - 1) * r.range(25, 40) * (i % 2 === 1 ? 1 : -1);
    case 'tetradic':
      return (i % 4) * r.range(80, 100) + Math.floor(i / 4) * r.range(12, 25) * r.sign();
  }
}

/**
 * Generate a harmonious palette. Colors on a dark background need higher
 * lightness to glow; on a light background mid-tones with more chroma work best.
 */
export function generatePalette(rng: Rng, count: number, theme: 'dark' | 'light'): string[] {
  const harmony = rng.pick(HARMONIES);
  const baseHue = rng.float() * 360;
  // lightness ramp patterns
  const patterns = ['ascend', 'descend', 'arc', 'u'] as const;
  const pattern = rng.pick(patterns);
  const lMin = theme === 'dark' ? rng.range(0.5, 0.62) : rng.range(0.5, 0.6);
  const lMax = theme === 'dark' ? rng.range(0.82, 0.93) : rng.range(0.68, 0.8);
  const cBase = theme === 'dark' ? rng.range(0.13, 0.22) : rng.range(0.13, 0.2);

  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    let l: number;
    switch (pattern) {
      case 'ascend': l = lMin + (lMax - lMin) * t; break;
      case 'descend': l = lMax - (lMax - lMin) * t; break;
      case 'arc': l = lMin + (lMax - lMin) * Math.sin(t * Math.PI); break;
      case 'u': l = lMax - (lMax - lMin) * Math.abs(2 * t - 1); break;
    }
    const hue = (baseHue + harmonyOffsets(harmony, i, rng) + 360 * 10) % 360;
    // one "accent" slot gets extra chroma
    const accent = i === rng.int(0, count - 1);
    const c = gamutClipChroma(l, hue, cBase * rng.range(0.85, 1.25) + (accent ? 0.06 : 0));
    colors.push(oklchToHex({ l, c: Math.min(c, 0.3), h: hue }));
  }
  return colors;
}

/** Largest chroma that fits sRGB for the given l/h, capped. */
function gamutClipChroma(l: number, h: number, want: number): number {
  let lo = 0,
    hi = 0.4;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinearRaw({ l, c: mid, h }))) lo = mid;
    else hi = mid;
  }
  return Math.min(want, lo);
}
