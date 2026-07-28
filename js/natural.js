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

// ------------------------------------------------------------- frustration

function frustration(attract, repel, mass) {
  // Magnetic exchange. Each colour carries a spin direction, and coupling
  // follows the angle between two of them — aligned spins bond, opposed ones
  // keep apart.
  //
  // Two things make this worth having. Angles cannot all be satisfied at once
  // once there are more than two colours, which is frustration, and a
  // frustrated system never finds a ground state to settle into. And real
  // exchange has an antisymmetric part as well as a symmetric one: the
  // Dzyaloshinskii-Moriya term, which is what twists magnetic materials into
  // spirals and skyrmions. It is antisymmetric by definition, so it hands this
  // model the non-reciprocity it needs for free rather than as an add-on.
  const angle = [], strength = [], twist = [];
  for (let t = 0; t < MAX_TYPES; t++) {
    angle.push(rand(0, Math.PI * 2));
    strength.push(rand(0.4, 1));
    twist.push(rand(0, 1));
    mass[t] = round2(clamp(0.6 + 0.9 * strength[t], 0.1, 3));
  }

  for (let i = 0; i < MAX_TYPES; i++) {
    for (let j = 0; j < MAX_TYPES; j++) {
      const delta = angle[j] - angle[i];
      const aligned = Math.max(0, Math.cos(delta));          // symmetric exchange
      // sin is odd, so this term is equal and opposite between i,j and j,i.
      const chiral = Math.max(0, twist[i] * Math.sin(delta));
      const a = 0.08 + 0.50 * aligned * ((strength[i] + strength[j]) / 2)
                + 0.30 * chiral + jitter(0.05);
      const gap = 0.10 + 0.32 * (1 - aligned) + jitter(0.04);
      write(attract, repel, a, a + gap, i, j);
    }
  }
}

// ------------------------------------------------------------- lock and key

function lockAndKey(attract, repel, mass) {
  // Receptor-ligand binding, the way real cells actually recognise each other.
  // Every colour carries a set of surface ligands and a set of receptors, and
  // binds another only where its receptors meet that colour's ligands.
  //
  // This is asymmetric by its nature rather than by decoration: what i's
  // receptors find on j has nothing to do with what j's receptors find on i.
  // Matching is raised to a power so binding is specific — most pairs ignore
  // each other entirely and a few bind hard, which is how real affinity works
  // and gives a sparse matrix rather than a smoothly graded one.
  const SITES = 6;
  const ligand = [], receptor = [];
  for (let t = 0; t < MAX_TYPES; t++) {
    let decorated = 0;
    const l = [], r = [];
    for (let s = 0; s < SITES; s++) {
      const hasL = Math.random() < 0.4;
      l.push(hasL ? 1 : 0);
      r.push(Math.random() < 0.4 ? 1 : 0);
      if (hasL) decorated++;
    }
    ligand.push(l);
    receptor.push(r);
    mass[t] = round2(clamp(0.6 + 1.4 * (decorated / SITES), 0.1, 3));
  }

  const affinity = (i, j) => {
    let hits = 0;
    for (let s = 0; s < SITES; s++) hits += receptor[i][s] * ligand[j][s];
    return hits / SITES;
  };

  for (let i = 0; i < MAX_TYPES; i++) {
    for (let j = 0; j < MAX_TYPES; j++) {
      const bound = Math.pow(affinity(i, j), 1.5);
      // A colour always recognises its own kind to some degree, or a colour
      // whose receptors miss its own ligands would have no cohesion at all.
      const a = (i === j ? 0.35 : 0.05) + 0.75 * bound + jitter(0.04);
      const gap = 0.10 + 0.30 * (1 - Math.min(1, affinity(i, j) * 2)) + jitter(0.04);
      write(attract, repel, a, a + gap, i, j);
    }
  }
}

// ----------------------------------------------------------- morphogenesis

function morphogenesis(attract, repel, mass) {
  // Turing's mechanism, the one behind spots and stripes on animals: a
  // short-range activator that promotes both itself and a longer-range
  // inhibitor which suppresses it. Neither substance carries the pattern —
  // the pattern is what the loop settles into, at a spacing set by the two
  // ranges.
  //
  // Colours are paired into activator/inhibitor systems, each with its own
  // wavelength, and the systems compete for the same ground.
  const partner = [], isActivator = [], wavelength = [];
  for (let t = 0; t < MAX_TYPES; t++) {
    isActivator.push(t % 2 === 0);
    partner.push(t % 2 === 0 ? (t + 1) % MAX_TYPES : t - 1);
    wavelength.push(rand(0.35, 0.75));
    mass[t] = round2(clamp(t % 2 === 0 ? rand(0.9, 1.6) : rand(0.5, 0.9), 0.1, 3));
  }

  for (let i = 0; i < MAX_TYPES; i++) {
    for (let j = 0; j < MAX_TYPES; j++) {
      let a, gap;
      const sameSystem = partner[i] === j || i === j;
      if (i === j) {
        // An activator drives itself; an inhibitor merely spreads.
        a = isActivator[i] ? 0.62 + rand(0, 0.14) : 0.12 + rand(0, 0.12);
        gap = isActivator[i] ? 0.12 + jitter(0.03) : 0.22 + rand(0, 0.12);
      } else if (sameSystem && isActivator[j]) {
        a = 0.58 + rand(0, 0.2);        // inhibitor is produced where activator is
        gap = 0.10 + jitter(0.03);
      } else if (sameSystem) {
        a = 0.0 + jitter(0.02);         // and pushes the activator away, far
        gap = 0.40 + 0.45 * wavelength[i];
      } else {
        a = 0.03 + rand(0, 0.08);       // rival systems mostly keep clear
        gap = 0.18 + rand(0, 0.16);
      }
      write(attract, repel, a, a + gap, i, j);
    }
  }
}

// -------------------------------------------------------------- phyllotaxis

function fibonacci(attract, repel, mass) {
  // Phyllotaxis, the reason Fibonacci numbers turn up in plants at all. Each
  // new primordium on a growing tip appears one golden angle round from the
  // last, at a radius growing as the square root of its index — Vogel's model
  // of a sunflower head. The visible spiral counts come out as consecutive
  // Fibonacci numbers as a *consequence*, because the golden angle is the most
  // irrational number there is and so no two elements ever line up.
  //
  // That is the useful property here. Laying ten colours on a regular ring
  // gives only 5 distinct separations among the 45 pairs — the symmetry makes
  // most pairs interchangeable. The golden angle gives all 45, the closest two
  // differing by 0.0026, so no two colours stand in the same relation to the
  // rest. (The table itself stores 0.01 steps, so some of that fineness is
  // rounded away; the arrangement is what carries the property.) Interaction
  // then follows how close two colours land in the head.
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));   // 137.507 degrees
  const x = [], y = [], radius = [];
  for (let t = 0; t < MAX_TYPES; t++) {
    const r = Math.sqrt(t + 0.5);
    const theta = (t + 0.5) * GOLDEN;
    radius.push(r);
    x.push(r * Math.cos(theta));
    y.push(r * Math.sin(theta));
  }
  const maxR = Math.sqrt(MAX_TYPES);
  for (let t = 0; t < MAX_TYPES; t++) {
    // Outer florets are the older ones, and bigger for it.
    mass[t] = round2(clamp(0.5 + 1.8 * (radius[t] / maxR), 0.1, 3));
  }

  // How far round the head a colour still notices its neighbours.
  const reach = rand(0.45, 0.95);

  for (let i = 0; i < MAX_TYPES; i++) {
    for (let j = 0; j < MAX_TYPES; j++) {
      if (i === j) {
        write(attract, repel, 0.42 + jitter(0.06), 0.42 + 0.20 + jitter(0.05), i, j);
        continue;
      }
      const d = Math.hypot(x[i] - x[j], y[i] - y[j]) / maxR;
      const near = Math.max(0, 1 - d / reach);
      // Growth runs outward from the tip, so each floret is drawn back toward
      // the ones nearer the centre. That gives the table its asymmetry.
      const inward = 0.26 * Math.max(0, (radius[i] - radius[j]) / maxR);
      const a = 0.05 + 0.62 * near + inward + jitter(0.05);
      const gap = 0.10 + 0.34 * Math.min(1, d) + jitter(0.04);
      write(attract, repel, a, a + gap, i, j);
    }
  }
}

// ------------------------------------------------------------------ kinship

function kinship(attract, repel, mass) {
  // Hamilton's rule: help others in proportion to how closely related they
  // are. Give the palette a phylogeny — a lineage of binary splits — and let
  // relatedness fall off with the depth at which two colours diverged.
  //
  // The resulting table is ultrametric rather than flat, which none of the
  // other rules produce: colours form families, families form clans, and the
  // structure that appears is nested rather than merely sorted.
  // Enough splits that the palette has more lineages than colours, or two
  // colours would share one and be related to each other as closely as to
  // themselves.
  const DEPTH = Math.max(4, Math.ceil(Math.log2(MAX_TYPES)) + 1);
  const lineage = [], generosity = [];
  for (let t = 0; t < MAX_TYPES; t++) {
    const bits = [];
    let ones = 0;
    for (let d = 0; d < DEPTH; d++) {
      const b = Math.random() < 0.5 ? 1 : 0;
      bits.push(b);
      ones += b;
    }
    lineage.push(bits);
    generosity.push(rand(0, 1));
    // Kin resemble one another, so mass follows the lineage rather than chance.
    mass[t] = round2(clamp(0.6 + 1.4 * (ones / DEPTH), 0.1, 3));
  }

  const related = (i, j) => {
    let shared = 0;
    while (shared < DEPTH && lineage[i][shared] === lineage[j][shared]) shared++;
    return shared / DEPTH;
  };

  for (let i = 0; i < MAX_TYPES; i++) {
    for (let j = 0; j < MAX_TYPES; j++) {
      const r = i === j ? 1 : related(i, j);
      // A generous colour gives more to its kin than it gets back, which is
      // the asymmetry — and is exactly the situation Hamilton's rule describes.
      const a = 0.05 + 0.66 * Math.pow(r, 1.2) + 0.20 * generosity[i] * r + jitter(0.05);
      const gap = 0.10 + 0.34 * (1 - r) + jitter(0.04);
      write(attract, repel, a, a + gap, i, j);
    }
  }
}

// ------------------------------------------------------------------- neural

function neural(attract, repel, mass) {
  // Dale's law: a neuron is excitatory or inhibitory to everything it touches,
  // never both. That is a constraint on a whole column of the table — the sign
  // of a colour's effect belongs to the colour doing the acting, not to the
  // pair — and no other rule here has one.
  //
  // Cortex runs about four excitatory cells to one inhibitory, with the few
  // inhibitory ones acting more strongly. That ratio is what keeps a network
  // from either falling silent or running away, and it does the same here.
  const excitatory = [], gain = [];
  for (let t = 0; t < MAX_TYPES; t++) {
    const exc = Math.random() < 0.75;
    excitatory.push(exc);
    gain.push(exc ? rand(0.6, 1) : rand(1.4, 2.4));
    mass[t] = round2(clamp(exc ? rand(0.6, 1.2) : rand(1.4, 2.4), 0.1, 3));
  }
  // Sparse wiring, and drawn independently per direction — what i receives
  // from j has nothing to do with what j receives from i.
  const density = rand(0.4, 0.85);
  const weight = () => (Math.random() < density ? rand(0.3, 1) : 0);

  for (let i = 0; i < MAX_TYPES; i++) {
    for (let j = 0; j < MAX_TYPES; j++) {
      if (i === j) {
        write(attract, repel, 0.44 + jitter(0.06), 0.44 + 0.18 + jitter(0.05), i, j);
        continue;
      }
      const w = weight();
      let a, gap;
      if (excitatory[j]) {
        a = 0.05 + 0.70 * w * Math.min(1, gain[j]) + jitter(0.04);
        gap = 0.10 + 0.14 * (1 - w);
      } else {
        // Inhibition is a push, and the strong few reach further than the many.
        a = 0.02 + jitter(0.02);
        gap = 0.16 + 0.34 * w * gain[j] + jitter(0.04);
      }
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
  {
    key: 'frustration',
    name: 'Frustration',
    note: 'Spins that cannot all agree, and never stop trying',
    build: frustration,
  },
  {
    key: 'lockkey',
    name: 'Lock & key',
    note: 'Receptors meet ligands: few pairs bind, and hard',
    build: lockAndKey,
  },
  {
    key: 'morphogenesis',
    name: 'Morphogen',
    note: 'Activator and inhibitor: Turing spots',
    build: morphogenesis,
  },
  {
    key: 'fibonacci',
    name: 'Fibonacci',
    note: 'Golden-angle packing, as in a sunflower head',
    build: fibonacci,
  },
  {
    key: 'kinship',
    name: 'Kinship',
    note: 'Help your relatives: families inside clans',
    build: kinship,
  },
  {
    key: 'neural',
    name: 'Neural',
    note: "Dale's law: a colour only excites, or only inhibits",
    build: neural,
  },
];
