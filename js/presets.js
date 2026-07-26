// Hand-built starting points.
//
// Two properties of the force law drive every one of these:
//
//   1. Two types settle at the distance where attraction and repulsion cancel,
//      A·(1 − d/cutR) = R·(1 − d/coreR). So R must exceed A for any pair that
//      meets, or they fall together into a single point; and the size of R − A
//      sets how far apart they sit. Every pair below obeys R > A.
//   2. Mass scales attraction and repulsion equally, so it drops out of that
//      equation entirely. A heavy type does not sit further away — it pulls the
//      whole neighbourhood around harder.
//
// Asymmetry is the other lever: A[i][j] ≠ A[j][i] means i chases j while j
// flees, which is what produces motion that never settles.
//
// Rows and columns are ordered green, yellow, red, blue, white. The row is the
// particle feeling the force, the column the one exerting it.

// Lay a compact NxN block into the fixed MAX_TYPES stride. Entries outside the
// block keep whatever the randomizer seeded, so raising the type count above a
// preset's own reveals colours that already interact.
const flat = (rows) => {
  const out = new Float32Array(MAX_TYPES * MAX_TYPES);
  rows.forEach((row, i) => row.forEach((v, j) => { out[i * MAX_TYPES + j] = v; }));
  out.size = rows.length;
  return out;
};

import { MAX_TYPES } from './state.js';

export const PRESETS = [
  {
    name: 'Cells',
    note: 'Blue cores wrapped in white membranes',
    // White is pulled tightly onto blue but pushes hard against other whites,
    // so whites cannot all fit inside a core and pool on its surface instead.
    attract: flat([
      [0.35, 0.15, 0.10, 0.05, 0.00],
      [0.15, 0.35, 0.10, 0.05, 0.00],
      [0.10, 0.10, 0.40, 0.05, 0.00],
      [0.05, 0.05, 0.05, 0.55, 0.05],
      [0.10, 0.10, 0.10, 0.85, 0.10],
    ]),
    repel: flat([
      [0.65, 0.45, 0.40, 0.30, 0.35],
      [0.45, 0.65, 0.40, 0.30, 0.35],
      [0.40, 0.40, 0.70, 0.30, 0.35],
      [0.30, 0.30, 0.30, 0.75, 0.30],
      [0.45, 0.45, 0.45, 1.00, 0.90],
    ]),
    mass: [1.00, 1.00, 1.00, 1.80, 0.70],
  },

  {
    name: 'Predator chain',
    note: 'Each colour hunts the next and flees the last',
    // A closed 5-cycle: green eats yellow eats red eats blue eats white eats
    // green. Nobody is ever safe, so the packs never stop moving.
    //
    // Self-cohesion has to be strong (0.65 against 0.80) or the constant
    // fleeing shakes the packs apart into an even gas — the flee term is
    // deliberately milder than the chase term for the same reason.
    attract: flat([
      [0.65, 0.90, 0.05, 0.05, 0.00],
      [0.00, 0.65, 0.90, 0.05, 0.05],
      [0.05, 0.00, 0.65, 0.90, 0.05],
      [0.05, 0.05, 0.00, 0.65, 0.90],
      [0.90, 0.05, 0.05, 0.00, 0.65],
    ]),
    repel: flat([
      [0.80, 1.00, 0.15, 0.15, 0.70],
      [0.70, 0.80, 1.00, 0.15, 0.15],
      [0.15, 0.70, 0.80, 1.00, 0.15],
      [0.15, 0.15, 0.70, 0.80, 1.00],
      [1.00, 0.15, 0.15, 0.70, 0.80],
    ]),
    mass: [1.00, 1.00, 1.00, 1.00, 1.00],
  },

  {
    name: 'Crystal',
    note: 'A shared lattice with colour domains',
    // Uniform repulsion with stronger like-attraction: everything locks to a
    // regular spacing, but each colour prefers its own, so grains form.
    attract: flat([
      [0.60, 0.35, 0.35, 0.35, 0.35],
      [0.35, 0.60, 0.35, 0.35, 0.35],
      [0.35, 0.35, 0.60, 0.35, 0.35],
      [0.35, 0.35, 0.35, 0.60, 0.35],
      [0.35, 0.35, 0.35, 0.35, 0.60],
    ]),
    repel: flat([
      [0.90, 0.90, 0.90, 0.90, 0.90],
      [0.90, 0.90, 0.90, 0.90, 0.90],
      [0.90, 0.90, 0.90, 0.90, 0.90],
      [0.90, 0.90, 0.90, 0.90, 0.90],
      [0.90, 0.90, 0.90, 0.90, 0.90],
    ]),
    mass: [1.00, 1.00, 1.00, 1.00, 1.00],
  },

  {
    name: 'Symbiosis',
    note: 'Two bonded couples and one loner',
    // Green+yellow and red+blue bind tightly to their partner and to nothing
    // else. White wants no company at all and fills the gaps between them.
    attract: flat([
      [0.30, 0.75, 0.00, 0.00, 0.00],
      [0.75, 0.30, 0.00, 0.00, 0.00],
      [0.00, 0.00, 0.30, 0.75, 0.00],
      [0.00, 0.00, 0.75, 0.30, 0.00],
      [0.00, 0.00, 0.00, 0.00, 0.05],
    ]),
    repel: flat([
      [0.60, 0.90, 0.50, 0.50, 0.40],
      [0.90, 0.60, 0.50, 0.50, 0.40],
      [0.50, 0.50, 0.60, 0.90, 0.40],
      [0.50, 0.50, 0.90, 0.60, 0.40],
      [0.45, 0.45, 0.45, 0.45, 0.75],
    ]),
    mass: [1.00, 1.00, 1.00, 1.00, 0.80],
  },

  {
    name: 'Nucleus',
    note: 'A heavy white core in concentric shells',
    // Each colour is drawn to white with a slightly different attraction and
    // repulsion, which places its equilibrium at a different radius: green
    // settles ~2 units out, yellow ~3, red ~5, blue ~7. Mutual repulsion
    // between the outer colours keeps the shells from mixing.
    attract: flat([
      [0.10, 0.00, 0.00, 0.00, 0.90],
      [0.00, 0.10, 0.00, 0.00, 0.80],
      [0.00, 0.00, 0.10, 0.00, 0.70],
      [0.00, 0.00, 0.00, 0.10, 0.60],
      [0.02, 0.02, 0.02, 0.02, 0.60],
    ]),
    repel: flat([
      [0.60, 0.55, 0.55, 0.55, 0.95],
      [0.55, 0.60, 0.55, 0.55, 0.90],
      [0.55, 0.55, 0.60, 0.55, 0.85],
      [0.55, 0.55, 0.55, 0.60, 0.80],
      [0.35, 0.35, 0.35, 0.35, 0.65],
    ]),
    mass: [0.70, 0.80, 0.90, 1.00, 2.40],
  },

  {
    name: 'Foam',
    note: 'Immiscible domains that never stop sliding',
    // Like attracts like, so the colours separate the way oil and water do.
    //
    // Pure mutual repulsion, though, reaches equilibrium and stops dead. So the
    // cross terms run in a loop instead: each colour is weakly drawn toward its
    // successor and strongly pushed from its predecessor. The loop is closed,
    // which leaves an unbalanced force on every boundary forever — the domains
    // stay separate but circulate past one another instead of setting.
    attract: flat([
      [0.55, 0.25, 0.00, 0.00, 0.00],
      [0.00, 0.55, 0.25, 0.00, 0.00],
      [0.00, 0.00, 0.55, 0.25, 0.00],
      [0.00, 0.00, 0.00, 0.55, 0.25],
      [0.25, 0.00, 0.00, 0.00, 0.55],
    ]),
    repel: flat([
      [0.80, 0.60, 0.55, 0.55, 0.75],
      [0.75, 0.80, 0.60, 0.55, 0.55],
      [0.55, 0.75, 0.80, 0.60, 0.55],
      [0.55, 0.55, 0.75, 0.80, 0.60],
      [0.60, 0.55, 0.55, 0.75, 0.80],
    ]),
    mass: [1.00, 1.00, 1.00, 1.00, 1.00],
  },

  {
    name: 'Hunters',
    note: 'Red chases everything, everything flees red',
    // The prey colours flock loosely together; red is heavy, so its approach
    // scatters a flock from further away than its own numbers suggest.
    attract: flat([
      [0.60, 0.50, 0.00, 0.50, 0.50],
      [0.50, 0.60, 0.00, 0.50, 0.50],
      [0.85, 0.85, 0.15, 0.85, 0.85],
      [0.50, 0.50, 0.00, 0.60, 0.50],
      [0.50, 0.50, 0.00, 0.50, 0.60],
    ]),
    repel: flat([
      [0.80, 0.78, 0.90, 0.78, 0.78],
      [0.78, 0.80, 0.90, 0.78, 0.78],
      [0.95, 0.95, 0.85, 0.95, 0.95],
      [0.78, 0.78, 0.90, 0.80, 0.78],
      [0.78, 0.78, 0.90, 0.78, 0.80],
    ]),
    mass: [1.00, 1.00, 1.60, 1.00, 1.00],
  },

  {
    name: 'Worms',
    note: 'Green filaments crawling after yellow',
    // Green packs very tightly with itself and latches onto yellow, which
    // flees. A tight cohesive body pulled from one end travels as a filament.
    attract: flat([
      [0.60, 0.95, 0.05, 0.05, 0.05],
      [0.00, 0.50, 0.05, 0.05, 0.05],
      [0.20, 0.10, 0.35, 0.10, 0.10],
      [0.20, 0.10, 0.10, 0.35, 0.10],
      [0.20, 0.10, 0.10, 0.10, 0.35],
    ]),
    repel: flat([
      [0.70, 1.00, 0.40, 0.40, 0.40],
      [0.75, 0.80, 0.40, 0.40, 0.40],
      [0.55, 0.45, 0.65, 0.45, 0.45],
      [0.55, 0.45, 0.45, 0.65, 0.45],
      [0.55, 0.45, 0.45, 0.45, 0.65],
    ]),
    mass: [1.20, 0.90, 1.00, 1.00, 1.00],
  },

  {
    name: 'Rotors',
    note: 'Bound triples that spin, on a still backdrop',
    // Green, yellow and red chase in a 3-cycle but are bound too tightly to
    // escape one another, so the chase turns into rotation. Blue and white
    // form a passive lattice for the rotors to stir.
    attract: flat([
      [0.40, 0.75, 0.10, 0.05, 0.05],
      [0.10, 0.40, 0.75, 0.05, 0.05],
      [0.75, 0.10, 0.40, 0.05, 0.05],
      [0.05, 0.05, 0.05, 0.45, 0.30],
      [0.05, 0.05, 0.05, 0.30, 0.45],
    ]),
    repel: flat([
      [0.70, 1.00, 0.55, 0.45, 0.45],
      [0.55, 0.70, 1.00, 0.45, 0.45],
      [1.00, 0.55, 0.70, 0.45, 0.45],
      [0.45, 0.45, 0.45, 0.85, 0.70],
      [0.45, 0.45, 0.45, 0.70, 0.85],
    ]),
    mass: [1.00, 1.00, 1.00, 1.30, 1.30],
  },

  {
    name: 'Ecosystem',
    note: 'Every mechanism at once, nothing settles',
    // Deliberately unbalanced: green herds yellow, red hunts green, yellow
    // shelters with blue, blue courts white, white drifts back toward red.
    // Every loop is asymmetric, so no arrangement is ever stable.
    attract: flat([
      [0.50, 0.70, 0.00, 0.15, 0.10],
      [0.05, 0.35, 0.10, 0.60, 0.10],
      [0.80, 0.20, 0.30, 0.10, 0.15],
      [0.10, 0.15, 0.05, 0.55, 0.50],
      [0.10, 0.10, 0.45, 0.20, 0.10],
    ]),
    repel: flat([
      [0.75, 0.95, 0.80, 0.45, 0.40],
      [0.60, 0.70, 0.45, 0.90, 0.40],
      [1.00, 0.50, 0.80, 0.40, 0.45],
      [0.40, 0.45, 0.35, 0.80, 0.85],
      [0.45, 0.40, 0.90, 0.50, 0.85],
    ]),
    mass: [1.00, 0.80, 1.50, 1.20, 0.60],
  },
];

export function applyPreset(state, preset) {
  const size = preset.types || preset.attract.size || MAX_TYPES;
  // Only overwrite the preset's own block; the rest of the matrix is left as
  // it was so raising the type count afterwards still finds live values.
  for (let a = 0; a < size; a++) {
    for (let b = 0; b < size; b++) {
      const i = a * MAX_TYPES + b;
      state.attract[i] = preset.attract[i];
      state.repel[i] = preset.repel[i];
    }
    state.mass[a] = preset.mass[a];
  }
  state.types = size;
}
