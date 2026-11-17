// random.js — deterministic seeded randomness (mulberry32) plus small helpers.
// One job: every random choice in the simulation flows through one of these
// generators, so a seed plus an input script always replays identically.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
    this.seed = seed;
  }
  // Float in [0, 1).
  float() {
    return this.next();
  }
  // Float in [min, max).
  range(min, max) {
    return min + this.next() * (max - min);
  }
  // Integer in [min, max] inclusive.
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  // True with probability p.
  chance(p) {
    return this.next() < p;
  }
  // Random element of an array.
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  // Random sign, -1 or 1.
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

// A tiny FNV-1a string hash, used by the headless test to fingerprint sim state.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}
