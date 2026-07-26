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
// Rows and columns follow the palette order: green, yellow, red, blue, white,
// cyan, orange, pink, violet, steel. The row is the particle feeling the force,
// the column the one exerting it.
//
// With the default radii (70 and 28) a pair settles at
//   d* = (R - A) / (R/28 - A/70)
// so R - A is the spacing dial: 0.10 apart sits at ~5 units, 0.30 at ~14, 0.60
// at ~22. The five-colour presets are written out cell by cell; the ten-colour
// ones are generated from a rule, because 200 hand-typed numbers hide the idea
// rather than express it.

// Lay a compact NxN block into the fixed MAX_TYPES stride. Entries outside the
// block keep whatever the randomizer seeded, so raising the type count above a
// preset's own reveals colours that already interact.
import { MAX_TYPES } from './state.js';

const flat = (rows) => {
  const out = new Float32Array(MAX_TYPES * MAX_TYPES);
  rows.forEach((row, i) => row.forEach((v, j) => { out[i * MAX_TYPES + j] = v; }));
  out.size = rows.length;
  return out;
};

// Build a preset from a rule: pair(a, b) returns [attraction, repulsion] for
// the force colour `a` feels from colour `b`. Repulsion is nudged above
// attraction if a rule ever fails to, since a pair with R <= A has no
// equilibrium and falls into a single point.
function fromRule(size, pair, mass) {
  const attract = new Float32Array(MAX_TYPES * MAX_TYPES);
  const repel = new Float32Array(MAX_TYPES * MAX_TYPES);
  for (let a = 0; a < size; a++) {
    for (let b = 0; b < size; b++) {
      let [A, R] = pair(a, b);
      A = Math.min(1, Math.max(0, A));
      R = Math.min(1, Math.max(0, R));
      if (R <= A) R = Math.min(1, A + 0.12);
      attract[a * MAX_TYPES + b] = Math.round(A * 100) / 100;
      repel[a * MAX_TYPES + b] = Math.round(R * 100) / 100;
    }
  }
  return {
    types: size,
    attract,
    repel,
    mass: Array.from({ length: size }, (_, t) => mass(t)),
  };
}

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

  // --------------------------------------------------------- ten-colour sets

  {
    name: 'Onion',
    note: 'Ten concentric shells around a heavy core',
    // Steel is a heavy core. Every other colour is drawn to it with the same
    // repulsion but steadily weaker attraction, which puts each one's
    // equilibrium at a different radius -- roughly 2, 5, 7, 9, 10, 12, 14, 15
    // and 17 units out. Mutual repulsion between the shells stops them mixing,
    // so the palette stacks up as visible rings.
    ...fromRule(10, (a, b) => {
      const CORE = 9;
      if (a === CORE && b === CORE) return [0.65, 0.72];  // dense core
      if (a === CORE) return [0.02, 0.30];                // core ignores its shells
      if (b === CORE) return [0.90 - 0.05 * a, 0.95];     // shell a's orbit radius
      if (a === b) return [0.05, 0.55];                   // shells spread out along themselves
      return [0.00, 0.50];                                // and stay out of each other
    }, (t) => (t === 9 ? 3.0 : 1.0)),
  },

  {
    name: 'Spectrum',
    note: 'The palette sorts itself into drifting rainbow bands',
    // Interaction depends only on how far apart two colours sit in the palette,
    // measured around a ring. Neighbours in the ring attract and opposites
    // repel, so a one-dimensional ordering embeds itself into two-dimensional
    // space and the colours arrange into bands in spectral order.
    //
    // That rule is symmetric, and symmetric rules settle. The +1 direction
    // therefore gets a stronger pull than the -1 direction, which leaves a
    // circulation around the ring and keeps the bands migrating.
    ...fromRule(10, (a, b) => {
      const step = (b - a + 10) % 10;
      const apart = Math.min(step, 10 - step);
      const A = [0.55, 0.50, 0.25, 0.05, 0.00, 0.00][apart];
      const R = [0.80, 0.85, 0.75, 0.60, 0.70, 0.85][apart];
      if (step === 1) return [A + 0.12, R];
      if (step === 9) return [A - 0.10, R];
      return [A, R];
    }, () => 1.0),
  },

  {
    name: 'Two tribes',
    note: 'Five against five, with a traitor on each side',
    // Colours 0-4 and 5-9 cohere internally and repel across the divide, so
    // each claims territory and they meet along a front. Left symmetric that
    // front would settle, so one colour on each side is drawn to a specific
    // enemy that does not return the interest -- those two chase across the
    // border and keep dragging the front open.
    ...fromRule(10, (a, b) => {
      const sameTribe = (a < 5) === (b < 5);
      if (a === 4 && b === 5) return [0.55, 0.90];  // traitor, one way only
      if (a === 9 && b === 0) return [0.55, 0.90];
      if (!sameTribe) return [0.00, 0.65];
      if (a === b) return [0.55, 0.80];
      return [0.45, 0.80];
    }, (t) => (t < 5 ? 0.9 : 1.3)),
  },

  {
    name: 'Food chain',
    note: 'A ten-rung ladder from prey to apex',
    // A ladder rather than a loop: each rank hunts the one below and flees the
    // one above, and mass climbs with rank. The ends behave differently from
    // the middle -- the base has nothing to hunt and the apex nothing to fear
    // -- which is exactly what a closed cycle cannot give you. Heavy top ranks
    // scatter the light ones from far off, so the column never stops shifting.
    ...fromRule(10, (a, b) => {
      if (b === a - 1) return [0.85, 0.95];   // hunt the rank below
      if (b === a + 1) return [0.00, 0.80];   // flee the rank above
      if (a === b) return [0.55, 0.78];       // travel in packs
      return [0.03, 0.20];
    }, (t) => Math.round((0.6 + t * 0.18) * 20) / 20),
  },

  {
    name: 'Vortex',
    note: 'Bound chase around the palette becomes rotation',
    // Each colour is bound tightly to the next around a ten-step loop, and
    // pushed away by the colour two steps ahead. Attraction along the chain
    // with repulsion across it is a couple rather than a straight pull, so the
    // assemblies turn instead of travelling. Alternating masses stop the
    // couples balancing out.
    ...fromRule(10, (a, b) => {
      const step = (b - a + 10) % 10;
      if (step === 1) return [0.75, 1.00];    // bound to the next
      if (step === 2) return [0.00, 0.70];    // shoved by the one after that
      if (step === 9) return [0.15, 0.55];    // faint pull back down the chain
      if (a === b) return [0.45, 0.75];
      return [0.02, 0.35];
    }, (t) => (t % 2 ? 1.4 : 0.8)),
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
