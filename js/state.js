// Shared constants and the plain configuration object that the control panel
// edits. Deliberately free of simulation machinery so the main thread and the
// physics worker can both import it cheaply.

export const TYPES = [
  { name: 'Green',  hex: '#3ef07a', color: [0.24, 0.94, 0.48] },
  { name: 'Yellow', hex: '#ffd83d', color: [1.00, 0.85, 0.24] },
  { name: 'Red',    hex: '#ff4d5e', color: [1.00, 0.30, 0.37] },
  { name: 'Blue',   hex: '#4d9bff', color: [0.30, 0.61, 1.00] },
  { name: 'White',  hex: '#eef1ff', color: [0.93, 0.95, 1.00] },
];

export const NT = TYPES.length;
export const MAX_PARTICLES = 20000;
export const WORLD = 1000; // square world; wraps on all four edges

export const DEFAULT_PARAMS = {
  force: 260,     // global force scale
  cutR: 90,       // attraction cutoff radius
  coreR: 24,      // repulsion core radius
  dt: 0.85,
  damping: 0.90,
  maxV: 26,
  steps: 1,
};

// Every one of the 50 scaling factors, drawn flat across the full 0..1 range.
// An earlier version biased this — sparse entries plus a self-repulsion floor —
// on the assumption that contrast between pairs was what produced structure.
// Measured over 24 runs the plain version is simply better: denser clustering,
// livelier motion, and no runs that freeze or collapse to a single lump.
export function randomizeMatrix(attract, repel) {
  for (let i = 0; i < NT * NT; i++) {
    attract[i] = Math.random();
    repel[i] = Math.random();
  }
}

export function createState() {
  const state = {
    count: 2000,
    params: { ...DEFAULT_PARAMS },
    attract: new Float32Array(NT * NT),
    repel: new Float32Array(NT * NT),
    mass: new Float32Array(NT).fill(1),
  };
  randomizeMatrix(state.attract, state.repel);
  return state;
}
