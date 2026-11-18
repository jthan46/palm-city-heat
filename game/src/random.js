// Palm City Heat — deterministic randomness. The whole simulation draws from one mulberry32
// stream so a seed plus an input script always replays to the same world.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  /** Float in [0, 1). */
  float() { return this.next(); }
  /** Float in [min, max). */
  range(min, max) { return min + this.next() * (max - min); }
  /** Integer in [min, max], both ends included. */
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  /** True with probability p. */
  chance(p) { return this.next() < p; }
  /** One element of a non-empty array. */
  pick(list) { return list[Math.floor(this.next() * list.length)]; }
}

/** Small string hash (FNV-1a) used by the headless tests to compare simulation states. */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
