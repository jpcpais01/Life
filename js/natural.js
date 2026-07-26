// Structured randomizers.
//
// The plain shuffle draws all 200 numbers independently, which means no pair
// has any relationship to any other: the matrix carries no idea. Real
// interaction tables are never like that. They are generated — a handful of
// intrinsic properties per species, and a rule that turns any two of those
// properties into an interaction. That is why real matter and real ecosystems
// have recognisable structure at all.
//
// Each generator below gives every colour two or three hidden traits, derives
// all 200 entries from a rule over those traits, and jitters the result. So a
// shuffle is random in its traits but coherent in its consequences.
//
// Every rule builds repulsion as attraction *plus a gap*, so R > A holds by
// construction and no pair can collapse to a point. The gap is where each
// model puts its own idea of "how close is too close".

import { MAX_TYPES } from './state.js';

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const jitter = (amount) => (Math.random() * 2 - 1) * amount;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round2 = (v) => Math.round(v * 100) / 100;

// Attraction is capped below 1 so the gap always has somewhere to go.
const A_MAX = 0.82;

function write(attract, repel, a, r, i, j) {
  const A = clamp(a, 0, A_MAX);
  let R = clamp(r, 0, 1);
  if (R <= A) R = Math.min(1, A + 0.08);
  attract[i * MAX_TYPES + j] = round2(A);
  repel[i * MAX_TYPES + j] = round2(R);
}

// ---------------------------------------------------------------- chemistry

function chemistry(attract, repel, mass) {
  // Charge, core radius and electronegativity — the three properties that
  // decide almost everything about how two atoms behave together.
  const charge = [], size = [], pull = [];
  for (let t = 0; t < MAX_TYPES; t++) {
    // Bimodal, because an ion carries a definite charge rather than a value
    // near zero. Drawing uniformly over [-1,1] fills the table with
    // near-neutral colours that barely bond with anything.
    charge.push((Math.random() < 0.5 ? -1 : 1) * rand(0.45, 1));
    size.push(rand(0.25, 1));
    pull.push(rand(0, 1));
    // In two dimensions mass goes as area, so as the square of the radius.
    mass[t] = round2(clamp(0.4 + 2.2 * size[t] * size[t], 0.1, 3));
  }

  for (let i = 0; i < MAX_TYPES; i++) {
    for (let j = 0; j < MAX_TYPES; j++) {
      // Opposite charges bond, like charges do not.
      const bond = -charge[i] * charge[j];
      // Electronegativity difference is the asymmetry: the greedier of the two
      // pulls harder than it is pulled. Without it the matrix is symmetric,
      // every force is reciprocal, and the world sets solid.
      const greed = Math.max(0, pull[j] - pull[i]);
      // Dispersion: every pair attracts a little regardless of charge, more so
      // between large polarisable colours. Without it like-charged colours have
      // no cohesion whatever and simply spread into a gas.
      const dispersion = 0.16 * size[i] * size[j];
      const a = 0.05 + 0.58 * Math.max(0, bond) + 0.34 * greed + dispersion + jitter(0.05);
      // Bond length comes from the cores, exactly as it does in real matter:
      // two large atoms sit further apart than two small ones.
      const gap = 0.08 + 0.30 * ((size[i] + size[j]) / 2) + jitter(0.04);
      write(attract, repel, a, a + gap, i, j);
    }
  }
}

// ----------------------------------------------------------------- food web

function foodWeb(attract, repel, mass) {
  // The niche model of Williams and Martinez: each species sits at a point on
  // a one-dimensional niche axis and eats everything inside a feeding window
  // centred below itself. Three numbers per species reproduce the structure of
  // real food webs surprisingly well, and they give this world its hierarchy.
  const niche = [], range = [], centre = [];
  for (let t = 0; t < MAX_TYPES; t++) {
    const n = rand(0, 1);
    const r = n * rand(0.15, 0.6);
    niche.push(n);
    range.push(r);
    // The window sits below the species' own niche, so nothing eats itself and
    // predation always runs downhill.
    centre.push(rand(r / 2, Math.max(r / 2, n)));
    mass[t] = round2(clamp(0.4 + 2.2 * n, 0.1, 3));
  }
  const eats = (i, j) => Math.abs(niche[j] - centre[i]) < range[i] / 2;

  for (let i = 0; i < MAX_TYPES; i++) {
    for (let j = 0; j < MAX_TYPES; j++) {
      let a, gap;
      if (i === j) {
        // Schooling: safety in numbers, at a comfortable spacing.
        a = 0.45 + rand(0, 0.2) + jitter(0.04);
        gap = 0.12 + rand(0, 0.15);
      } else if (eats(i, j)) {
        a = 0.55 + rand(0, 0.3) + jitter(0.04);
        gap = 0.08 + jitter(0.03);           // close pursuit
      } else if (eats(j, i)) {
        a = 0.0 + jitter(0.03);
        gap = 0.55 + rand(0, 0.3);           // flee, hard
      } else {
        a = 0.02 + rand(0, 0.08);            // indifferent
        gap = 0.12 + rand(0, 0.12);
      }
      write(attract, repel, a, a + gap, i, j);
    }
  }
}

// ------------------------------------------------------------------- tissue

function tissue(attract, repel, mass) {
  // Steinberg's differential adhesion hypothesis: cells do not need to know
  // where to go. Give each type a single stickiness value, let adhesion
  // between two of them follow the geometric mean, and a mixture sorts itself
  // into layers with the stickiest at the core, exactly as embryonic tissue
  // does. One number per colour produces the whole arrangement.
  const adhesion = [], motility = [];
  // How much weaker adhesion is between unlike colours than within one. This
  // is the whole mechanism: sorting is driven by the interfacial cost of
  // mixing, so with no discount there is nothing to drive it.
  const immiscible = rand(0.3, 0.6);
  for (let t = 0; t < MAX_TYPES; t++) {
    adhesion.push(rand(0.15, 1));
    motility.push(rand(0, 1));
    mass[t] = round2(clamp(0.6 + 1.2 * adhesion[t], 0.1, 3));
  }

  for (let i = 0; i < MAX_TYPES; i++) {
    for (let j = 0; j < MAX_TYPES; j++) {
      // Geometric mean, so a sticky cell and a slippery one bond about as well
      // as two middling ones — that makes the sorting a smooth ordering rather
      // than a set of cliques.
      //
      // Unlike colours are then discounted. The geometric mean on its own is
      // exactly the neutral case, since sqrt(ai*aj) IS the mean of the two
      // homotypic values: measured over 300 shuffles it left 76% of pairs with
      // no interfacial cost at all, and nothing sorted.
      const bond = Math.sqrt(adhesion[i] * adhesion[j]) * (i === j ? 1 : 1 - immiscible);
      // Motile types crawl up the adhesion gradient. This is the asymmetry —
      // pure adhesion is reciprocal and would settle into a still picture.
      const crawl = 0.22 * motility[i] * Math.max(0, adhesion[j] - adhesion[i]);
      const a = 0.72 * bond + crawl + jitter(0.05);
      // Mismatched cells keep further apart, which sharpens the boundaries
      // between layers instead of letting them blur.
      const gap = 0.10 + 0.32 * Math.abs(adhesion[i] - adhesion[j]) + jitter(0.04);
      write(attract, repel, a, a + gap, i, j);
    }
  }
}

export const NATURAL = [
  {
    key: 'chemistry',
    name: 'Chemistry',
    note: 'Charges bond, cores set the spacing',
    build: chemistry,
  },
  {
    key: 'foodweb',
    name: 'Food web',
    note: 'A niche axis: everything eats downhill',
    build: foodWeb,
  },
  {
    key: 'tissue',
    name: 'Tissue',
    note: 'Stickiness alone sorts the layers',
    build: tissue,
  },
];
