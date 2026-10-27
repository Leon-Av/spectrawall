/**
 * Deterministic seeded PRNG.
 * Same seed string => same number sequence on every OS / browser / run.
 * cyrb128 string hash -> sfc32 generator (well-proven tiny PRNG).
 */

export interface Rng {
  /** uniform float in [0, 1) */
  float(): number;
  /** uniform float in [a, b) */
  range(a: number, b: number): number;
  /** uniform integer in [a, b] inclusive */
  int(a: number, b: number): number;
  /** random element of an array */
  pick<T>(arr: readonly T[]): T;
  /** true with probability p (0..1) */
  chance(p: number): boolean;
  /** random sign, true = +1 */
  sign(): number;
}

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ ch, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ ch, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ ch, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ ch, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

export function rngFromSeed(seed: string): Rng {
  const [a, b, c, d] = cyrb128(seed);
  let A = a,
    B = b,
    C = c,
    D = d;
  const next = (): number => {
    A >>>= 0;
    B >>>= 0;
    C >>>= 0;
    D >>>= 0;
    let t = (A + B) | 0;
    A = B ^ (B >>> 9);
    B = (C + (C << 3)) | 0;
    C = (C << 21) | (C >>> 11);
    D = (D + 1) | 0;
    t = (t + D) | 0;
    C = (C + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // warm up — sfc32 needs a few iterations to reach full quality
  for (let i = 0; i < 20; i++) next();

  const rng: Rng = {
    float: next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
  };
  return rng;
}

const SEED_WORDS = [
  'silk', 'wave', 'mist', 'aurora', 'drift', 'glow', 'nebula', 'echo',
  'flux', 'haze', 'velvet', 'prism', 'shore', 'dune', 'orbit', 'bloom',
];

/** Human-readable random seed, e.g. "wave-4821" */
export function newSeed(): string {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const word = SEED_WORDS[buf[0] % SEED_WORDS.length];
  return `${word}-${buf[1] % 100000}`;
}
