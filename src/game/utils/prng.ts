/**
 * Seeded pseudo-random number generator — mulberry32 algorithm.
 * Deterministic, fast, good distribution. Same seed always produces same sequence.
 *
 * Industry standard pattern for procedural generation: derive a child seed from
 * a global seed + a domain-specific integer (e.g. star index) using bit mixing,
 * then create a local PRNG from that child seed.
 */

/** Creates a seeded PRNG. Returns a function that produces numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) >>> 0;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix a galaxy seed with a domain integer to get a stable child seed. */
export function childSeed(globalSeed: number, domainKey: number): number {
  // FNV-1a-inspired integer mixing
  let h = (globalSeed ^ 0x811c9dc5) >>> 0;
  h = Math.imul(h ^ domainKey, 0x01000193) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return h;
}

/** Pick a random integer in [min, max] inclusive. */
export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Pick a random float in [min, max). */
export function randFloat(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Pick a random element from an array. */
export function randPick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Weighted pick: items is [{value, weight}]. Returns selected value. */
export function randWeighted<T>(rng: () => number, items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}
