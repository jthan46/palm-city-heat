// Palm City Heat — deterministic randomness.
// One job: a seeded PRNG (mulberry32) plus small helpers, so a run replays
// exactly from its seed — the simulation never touches Math.random.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// An RNG with the conveniences the game wants, all drawn from one stream.
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    float: (min = 0, max = 1) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)), // inclusive
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

// FNV-1a string hash — determinism evidence for the headless test.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

// Shortest-arc angle interpolation.
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Turn `a` toward `b` by at most `maxStep` radians.
export function turnToward(a, b, maxStep) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) d = maxStep;
  if (d < -maxStep) d = -maxStep;
  return a + d;
}
