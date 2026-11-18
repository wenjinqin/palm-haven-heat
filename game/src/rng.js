// rng.js — deterministic seeded randomness for Palm Haven Heat.
// The whole city is generated from one seed so every player (and every
// screenshot) sees the same Palm Haven. A tiny linear congruential
// generator is plenty for layout work and keeps us dependency-free.

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    // Numerical Recipes LCG constants.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return {
    next,
    range(min, max) {
      return min + (max - min) * next();
    },
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length) % list.length];
    },
    chance(p) {
      return next() < p;
    },
    // Symmetric jitter around zero, handy for placing props.
    spread(amount) {
      return (next() * 2 - 1) * amount;
    },
  };
}

// A stable hash of two grid coordinates, so city blocks can roll their
// own dice without depending on generation order.
export function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
