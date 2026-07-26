// Shared constants and the plain configuration object that the control panel
// edits. Deliberately free of simulation machinery so the main thread and the
// physics worker can both import it cheaply.

export const TYPES = [
  { name: 'Green',  hex: '#3ef07a', color: [0.24, 0.94, 0.48] },
  { name: 'Yellow', hex: '#ffd83d', color: [1.00, 0.85, 0.24] },
  { name: 'Red',    hex: '#ff4d5e', color: [1.00, 0.30, 0.37] },
  { name: 'Blue',   hex: '#4d9bff', color: [0.30, 0.61, 1.00] },
  { name: 'White',  hex: '#eef1ff', color: [0.93, 0.95, 1.00] },
  { name: 'Cyan',   hex: '#22e0d6', color: [0.13, 0.88, 0.84] },
  { name: 'Orange', hex: '#ff9a3c', color: [1.00, 0.60, 0.24] },
  { name: 'Pink',   hex: '#ff5fbe', color: [1.00, 0.37, 0.75] },
  { name: 'Violet', hex: '#9d7bff', color: [0.62, 0.48, 1.00] },
  { name: 'Steel',  hex: '#8fa6c4', color: [0.56, 0.65, 0.77] },
];

// Matrices are always allocated at the maximum and indexed with a fixed
// MAX_TYPES stride, so changing the active type count never reallocates and
// never disturbs the entries already there. Types beyond the active count
// simply have no particles, so their rows and columns sit inert.
export const MAX_TYPES = TYPES.length;
export const DEFAULT_TYPES = 5;
export const MAX_PARTICLES = 20000;
export const WORLD = 1000; // square world; wraps on all four edges

// Defaults.
//
// The two radii sit at a 2.5x ratio, which is the window where structure forms:
// closer to 1x the settling equation puts the equilibrium exactly where both
// forces have tapered to zero and nothing binds, while past ~4x each particle
// averages over so many neighbours that the per-pair matrix washes out.
//
// The rest is a deliberately fine-grained look: a small time step integrating
// carefully, ten thousand small particles, no trails. It trades pace for
// resolution — the world evolves slowly per step, so raise the time step or
// steps/frame if you want it to move faster.
//
// For reference, damping and time step were once measured as a grid against
// every preset plus random matrices: a step of 0.70 gave ~12% crisper
// structure but set Crystal solid, and 1.00 kept everything moving while
// costing Ecosystem a third of its clustering.
export const DEFAULT_PARAMS = {
  force: 240,     // global force scale
  cutR: 70,       // attraction cutoff radius
  coreR: 28,      // repulsion core radius
  dt: 0.1,
  damping: 0.92,
  maxV: 26,
  steps: 1,
};

export function randomizeForces(attract, repel, mass) {
  for (let i = 0; i < MAX_TYPES * MAX_TYPES; i++) {
    attract[i] = Math.round(Math.random() * 100) / 100;
    repel[i] = Math.round(Math.random() * 100) / 100;
  }
  const lo = Math.log(0.5), hi = Math.log(2);
  for (let t = 0; t < MAX_TYPES; t++) {
    mass[t] = Math.round(Math.exp(lo + Math.random() * (hi - lo)) * 20) / 20;
  }
}

// Rendering defaults live here too, so one Reset restores the whole panel.
export const DEFAULT_COUNT = 10000;
export const DEFAULT_VIEW = { radius: 0.5, fade: 1, trend: 12 }; // fade 1 = no trails

export function createState() {
  const state = {
    count: DEFAULT_COUNT,
    types: DEFAULT_TYPES,
    params: { ...DEFAULT_PARAMS },
    attract: new Float32Array(MAX_TYPES * MAX_TYPES),
    repel: new Float32Array(MAX_TYPES * MAX_TYPES),
    mass: new Float32Array(MAX_TYPES).fill(1),
    preset: null, // index into PRESETS, or null once hand-edited
  };
  // Seed the whole matrix, so raising the type count later reveals colours
  // that already interact rather than inert ones. Callers layer a preset on
  // top — state.js deliberately knows nothing about presets, which would
  // otherwise be an import cycle.
  randomizeForces(state.attract, state.repel, state.mass);
  return state;
}
