import { describe, it, expect } from 'vitest';
import { rngFromSeed } from '../src/core/rng';
import {
  defaultParams,
  sanitizeParams,
  rerollSeed,
  resolveStructure,
  backgroundHex,
} from '../src/core/params';
import { generatePalette, hexToRgb, rgbToHex, hexToOklch, oklchToHex } from '../src/core/palette';
import { encodeParams, decodeParams } from '../src/ui/share';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = rngFromSeed('wave-42');
    const b = rngFromSeed('wave-42');
    const seqA = Array.from({ length: 50 }, () => a.float());
    const seqB = Array.from({ length: 50 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds', () => {
    const a = rngFromSeed('a').float();
    const b = rngFromSeed('b').float();
    expect(a).not.toBe(b);
  });

  it('respects ranges', () => {
    const r = rngFromSeed('ranges');
    for (let i = 0; i < 200; i++) {
      const v = r.range(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(7);
      const n = r.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});

describe('params', () => {
  it('defaults are valid and palette is populated', () => {
    const p = defaultParams();
    expect(p.palette.colors.length).toBeGreaterThanOrEqual(2);
    expect(p.palette.locked.length).toBe(p.palette.colors.length);
    for (const c of p.palette.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('sanitize clamps and repairs garbage', () => {
    const p = sanitizeParams({
      seed: 123,
      style: 'nope',
      colorShare: 42,
      blur: -5,
      palette: { colors: ['zzz', '#FF00FF', '#00ff00'], locked: [true, 'x', false, true] },
      background: { theme: 'martian', color: 'red' },
      grain: { strength: 9, size: 0 },
    });
    expect(typeof p.seed).toBe('string');
    expect(p.style).toBe('silk');
    expect(p.colorShare).toBe(1);
    expect(p.blur).toBe(0);
    expect(p.palette.colors).toEqual(['#ff00ff', '#00ff00']);
    expect(p.palette.locked).toEqual([true, false]);
    expect(p.background.theme).toBe('dark');
    expect(p.background.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(p.grain.strength).toBe(1);
    expect(p.grain.size).toBe(1);
  });

  it('rerollSeed keeps locks and resets structure overrides', () => {
    const p = defaultParams();
    p.palette.locked[0] = true;
    const before = p.palette.colors[0];
    p.structure.layers = 6;
    rerollSeed(p);
    expect(p.palette.colors[0]).toBe(before);
    expect(p.structure.layers).toBeNull();
  });

  it('resolveStructure is seed-deterministic and respects overrides', () => {
    const p = defaultParams();
    p.seed = 'fixed-seed';
    const a = resolveStructure(p);
    const b = resolveStructure(p);
    expect(a).toEqual(b);
    p.structure.warp = 1.234;
    expect(resolveStructure(p).warp).toBe(1.234);
    expect(resolveStructure(p).layers).toBe(a.layers);
  });

  it('background hex follows theme', () => {
    const p = defaultParams();
    p.background.theme = 'dark';
    expect(backgroundHex(p)).toBe('#000000');
    p.background.theme = 'light';
    expect(backgroundHex(p)).toBe('#ffffff');
    p.background.theme = 'custom';
    p.background.color = '#123456';
    expect(backgroundHex(p)).toBe('#123456');
  });
});

describe('palette', () => {
  it('hex roundtrip', () => {
    expect(rgbToHex(hexToRgb('#Ab12Cd'))).toBe('#ab12cd');
  });

  it('oklch roundtrip stays within tolerance', () => {
    for (const hex of ['#ff0000', '#00ff88', '#4f46e5', '#ffffff', '#123456']) {
      const back = oklchToHex(hexToOklch(hex));
      const a = hexToRgb(hex);
      const b = hexToRgb(back);
      expect(Math.abs(a.r - b.r)).toBeLessThan(0.01);
      expect(Math.abs(a.g - b.g)).toBeLessThan(0.01);
      expect(Math.abs(a.b - b.b)).toBeLessThan(0.01);
    }
  });

  it('generatePalette returns valid distinct hex colors', () => {
    const rng = rngFromSeed('palette-test');
    for (let i = 0; i < 30; i++) {
      const colors = generatePalette(rng, 2 + (i % 5), i % 2 === 0 ? 'dark' : 'light');
      expect(colors.length).toBe(2 + (i % 5));
      for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      expect(new Set(colors).size).toBeGreaterThan(1);
    }
  });
});

describe('share serialization', () => {
  it('roundtrips params through the compact encoding', async () => {
    const p = defaultParams();
    p.seed = 'roundtrip-1';
    p.style = 'aurora';
    p.colorShare = 0.42;
    const encoded = await encodeParams(p);
    expect(encoded.length).toBeGreaterThan(4);
    const decoded = await decodeParams(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.seed).toBe('roundtrip-1');
    expect(decoded!.style).toBe('aurora');
    expect(decoded!.colorShare).toBeCloseTo(0.42, 6);
    expect(decoded!.palette.colors).toEqual(p.palette.colors);
  });

  it('decode returns null on garbage', async () => {
    expect(await decodeParams('z!!!not-base64!!!')).toBeNull();
  });
});
