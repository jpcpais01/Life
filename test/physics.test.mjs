// Verifies the spatially-hashed force loop against a brute-force reference.
// The interesting failure modes are silent ones: a stencil that misses pairs
// (forces too weak) or visits one twice (forces doubled), so this compares
// per-particle accelerations exactly rather than eyeballing the result.
//
//   node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../js/sim.js';
import { PRESETS, applyPreset } from '../js/presets.js';
import { NATURAL } from '../js/natural.js';
import { MAX_TYPES, DEFAULT_TYPES, WORLD, randomizeForces } from '../js/state.js';

const SOFT = 16;
const DMIN = 1;

// O(n²) reference over every ordered pair, using the same force law.
function bruteForce(sim) {
  const n = sim.count, p = sim.params;
  const ax = new Float64Array(n), ay = new Float64Array(n);
  const k = p.force * p.dt;
  const half = WORLD / 2;
  const cut = p.cutR, core = Math.min(p.coreR, cut);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let dx = sim.pos[j * 2] - sim.pos[i * 2];
      let dy = sim.pos[j * 2 + 1] - sim.pos[i * 2 + 1];
      if (dx > half) dx -= WORLD; else if (dx < -half) dx += WORLD;
      if (dy > half) dy -= WORLD; else if (dy < -half) dy += WORLD;
      const d2 = dx * dx + dy * dy;
      if (d2 >= cut * cut) continue;
      const d = Math.sqrt(d2);
      const den = 1 / ((d2 + SOFT) * (d < DMIN ? DMIN : d));
      const ta = 1 - d / cut;
      const tr = d < core ? 1 - d / core : 0;
      const idx = sim.type[i] * MAX_TYPES + sim.type[j];
      const m = sim.mass[sim.type[j]];
      const s = (k * sim.attract[idx] * ta - k * sim.repel[idx] * tr) * m * den;
      ax[i] += dx * s;
      ay[i] += dy * s;
    }
  }
  return { ax, ay };
}

// One step with integration disabled: `vel` ends up holding exactly the
// accelerations the grid produced, for the same positions the reference sees.
function gridAccelerations(sim) {
  let ref = null;
  const forces = sim._forces.bind(sim);
  sim._forces = (cols, cells) => { ref = bruteForce(sim); forces(cols, cells); };
  sim._integrate = () => {};
  sim.step();
  return { ref, vel: sim.vel };
}

function makeSim(count, tweak = {}, types = DEFAULT_TYPES) {
  const sim = new Simulation();
  sim.count = count;
  sim.setTypes(types);
  sim.reset();
  randomizeForces(sim.attract, sim.repel, sim.mass);
  Object.assign(sim.params, tweak);
  return sim;
}

function assertMatches(sim, tolerance = 2e-4) {
  const { ref, vel } = gridAccelerations(sim);
  let worst = 0, scale = 0;
  for (let i = 0; i < sim.count; i++) {
    worst = Math.max(worst, Math.abs(ref.ax[i] - vel[i * 2]), Math.abs(ref.ay[i] - vel[i * 2 + 1]));
    scale = Math.max(scale, Math.abs(ref.ax[i]), Math.abs(ref.ay[i]));
  }
  assert.ok(scale > 0, 'reference produced no forces at all — test is vacuous');
  assert.ok(
    worst <= tolerance * Math.max(1, scale),
    `grid acceleration differs from brute force by ${worst} (max |a| = ${scale})`,
  );
  return { worst, scale };
}

test('grid forces match brute force at the default radius', () => {
  assertMatches(makeSim(1200));
});

test('grid forces match with a small radius (many cells)', () => {
  assertMatches(makeSim(1500, { cutR: 22, coreR: 6 }));
});

test('grid forces match with a large radius (few cells)', () => {
  assertMatches(makeSim(900, { cutR: 240, coreR: 60 }));
});

test('grid forces match when the repulsion core exceeds the cutoff', () => {
  assertMatches(makeSim(800, { cutR: 60, coreR: 120 }));
});

test('grid forces match brute force at every colour count', () => {
  // The matrix is indexed with a fixed MAX_TYPES stride while only the active
  // block has particles — an off-by-one there would read the wrong pair's
  // coefficients and stay invisible on screen.
  for (const types of [1, 2, 3, 7, MAX_TYPES]) {
    assertMatches(makeSim(900, {}, types));
  }
});

test('changing colour count keeps every particle and uses only live ids', () => {
  const sim = makeSim(2000);
  for (const types of [1, 10, 4, 7, 2]) {
    sim.setTypes(types);
    for (let i = 0; i < 15; i++) sim.step();
    const seen = new Set();
    for (let i = 0; i < sim.count; i++) seen.add(sim.type[i]);
    assert.equal(seen.size, types, `expected exactly ${types} colours in use`);
    for (const id of seen) {
      assert.ok(id >= 0 && id < types, `particle carries out-of-range colour ${id}`);
    }
  }
});

test('inactive colours cannot influence the world', () => {
  // Two runs from identical state, differing only in the matrix entries for
  // colours that have no particles. They must stay in lockstep.
  const a = makeSim(800, {}, 3);
  const b = makeSim(800, {}, 3);
  b.pos.set(a.pos);
  b.vel.set(a.vel);
  b.type.set(a.type);
  b.attract.set(a.attract);
  b.repel.set(a.repel);
  b.mass.set(a.mass);
  for (let t = 3; t < MAX_TYPES; t++) {
    for (let u = 0; u < MAX_TYPES; u++) {
      b.attract[t * MAX_TYPES + u] = Math.random();
      b.repel[t * MAX_TYPES + u] = Math.random();
      b.attract[u * MAX_TYPES + t] = Math.random();
      b.repel[u * MAX_TYPES + t] = Math.random();
    }
    b.mass[t] = 0.1 + Math.random() * 3;
  }
  for (let i = 0; i < 40; i++) { a.step(); b.step(); }
  for (let i = 0; i < a.count * 2; i++) {
    assert.equal(b.pos[i], a.pos[i], 'an unused colour changed the simulation');
  }
});

test('forces act across the wrapping seam', () => {
  const sim = makeSim(2);
  sim.attract.fill(0);
  sim.repel.fill(0);
  sim.mass.fill(1);
  sim.attract[0] = 1; // green feels green
  sim.type[0] = 0;
  sim.type[1] = 0;
  // Two particles either side of the left/right edge, 4 units apart.
  sim.pos[0] = 2; sim.pos[1] = 500;
  sim.pos[2] = WORLD - 2; sim.pos[3] = 500;

  const { vel } = gridAccelerations(sim);
  // Each is pulled towards the other *through* the seam, not across the world.
  assert.ok(vel[0] < 0, 'particle at x=2 should be pulled towards the left edge');
  assert.ok(vel[2] > 0, 'particle at x=998 should be pulled towards the right edge');
  assert.equal(Math.sign(vel[0]), -Math.sign(vel[2]));
});

test('particles stay inside the world and never go non-finite', () => {
  const sim = makeSim(3000, { force: 800, dt: 2, damping: 0.999 });
  for (let i = 0; i < 400; i++) sim.step();
  for (let i = 0; i < sim.count; i++) {
    const x = sim.pos[i * 2], y = sim.pos[i * 2 + 1];
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `particle ${i} went non-finite`);
    assert.ok(x >= 0 && x < WORLD && y >= 0 && y < WORLD, `particle ${i} escaped: ${x}, ${y}`);
  }
});

test('every particle is kept exactly once by the spatial sort', () => {
  const sim = makeSim(2000);
  const before = new Int32Array(MAX_TYPES);
  for (let i = 0; i < sim.count; i++) before[sim.type[i]]++;
  for (let i = 0; i < 30; i++) sim.step();
  const after = new Int32Array(MAX_TYPES);
  for (let i = 0; i < sim.count; i++) after[sim.type[i]]++;
  assert.deepEqual(Array.from(after), Array.from(before));
});

test('no preset contains a pair that collapses to a point', () => {
  // A pair with repulsion <= attraction has no equilibrium: the two fall
  // together until only the softening term holds them apart. Cheap to check,
  // and easy to introduce by hand or by a generating rule.
  for (const preset of PRESETS) {
    const n = preset.types || preset.attract.size;
    assert.ok(n >= 1 && n <= MAX_TYPES, `${preset.name} has a bad colour count`);
    assert.equal(preset.mass.length, n, `${preset.name} mass count does not match its colours`);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const i = a * MAX_TYPES + b;
        assert.ok(
          preset.repel[i] > preset.attract[i],
          `${preset.name}: ${a},${b} has repulsion ${preset.repel[i]} <= attraction ${preset.attract[i]}`,
        );
      }
    }
  }
});

test('presets leave the matrix outside their own block alone', () => {
  // Applying a 5-colour preset must not wipe colours 6-10, or turning the
  // count up afterwards would reveal inert colours.
  const state = {
    types: 10,
    attract: new Float32Array(MAX_TYPES * MAX_TYPES).fill(0.42),
    repel: new Float32Array(MAX_TYPES * MAX_TYPES).fill(0.77),
    mass: new Float32Array(MAX_TYPES).fill(1.5),
  };
  const five = PRESETS.find((p) => (p.types || p.attract.size) === 5);
  applyPreset(state, five);
  assert.equal(state.types, 5);
  // Float32 round-trip, so compare against the stored representation.
  assert.equal(state.attract[9 * MAX_TYPES + 9], Math.fround(0.42), 'an unused colour was overwritten');
  assert.equal(state.repel[7 * MAX_TYPES + 3], Math.fround(0.77), 'an unused colour was overwritten');
  assert.equal(state.mass[8], Math.fround(1.5), 'an unused mass was overwritten');
});

test('a saved configuration restores every colour, not just the active ones', () => {
  // Saved configurations snapshot all 10x10 and carry their own colour count,
  // so loading one must reproduce it exactly — including colours that were
  // inactive when it was saved.
  const snapshot = {
    types: 4,
    full: true,
    attract: Float32Array.from({ length: MAX_TYPES * MAX_TYPES }, (_, i) => (i % 13) / 13),
    repel: Float32Array.from({ length: MAX_TYPES * MAX_TYPES }, (_, i) => 0.5 + (i % 7) / 20),
    mass: Float32Array.from({ length: MAX_TYPES }, (_, i) => 0.5 + i * 0.1),
  };
  const state = {
    types: 9,
    attract: new Float32Array(MAX_TYPES * MAX_TYPES).fill(0.11),
    repel: new Float32Array(MAX_TYPES * MAX_TYPES).fill(0.99),
    mass: new Float32Array(MAX_TYPES).fill(2),
  };
  applyPreset(state, snapshot);
  assert.equal(state.types, 4, 'the saved colour count was not restored');
  for (let i = 0; i < MAX_TYPES * MAX_TYPES; i++) {
    assert.equal(state.attract[i], snapshot.attract[i], `attraction ${i} not restored`);
    assert.equal(state.repel[i], snapshot.repel[i], `repulsion ${i} not restored`);
  }
  for (let t = 0; t < MAX_TYPES; t++) {
    assert.equal(state.mass[t], snapshot.mass[t], `mass ${t} not restored`);
  }
});

test('merging conserves mass and respects its cap', () => {
  // Merging must move mass around, never create or destroy it: the sum of
  // per-particle masses is the particle count the world started with.
  for (const cap of [1, 2, 3, 5, 10]) {
    const sim = makeSim(2000, { merge: 1, mergeDist: 3, mergeCap: cap });
    for (let i = 0; i < 400; i++) sim.step();

    let total = 0, heaviest = 0;
    for (let i = 0; i < sim.count; i++) {
      total += sim.pmass[i];
      heaviest = Math.max(heaviest, sim.pmass[i]);
      assert.ok(sim.pmass[i] >= 1, 'a particle lost mass');
    }
    assert.ok(Math.abs(total - 2000) < 1e-3, `mass not conserved at cap ${cap}: ${total}`);
    assert.ok(sim.count <= 2000, 'merging cannot create particles');

    if (cap === 1) {
      assert.equal(sim.count, 2000, 'a cap of 1 must prevent every merge');
      assert.equal(heaviest, 1);
    } else {
      // The cap tests the particles going in, so a pair each just under it can
      // land above — but never further than one partner past the limit.
      assert.ok(heaviest < cap * 2, `cap ${cap} overshot to ${heaviest}`);
    }
  }
});

test('merging is inert while switched off', () => {
  const a = makeSim(800, { merge: 0, mergeDist: 5 });
  const b = makeSim(800, { merge: 0, mergeDist: 5 });
  b.pos.set(a.pos); b.vel.set(a.vel); b.type.set(a.type);
  b.attract.set(a.attract); b.repel.set(a.repel); b.mass.set(a.mass);
  for (let i = 0; i < 60; i++) { a.step(); b.step(); }
  assert.equal(a.count, 800, 'nothing should merge with the toggle off');
  for (let i = 0; i < a.count * 2; i++) assert.equal(b.pos[i], a.pos[i]);
});

test('a merged particle pulls as hard as its parts did', () => {
  // Two particles of mass 1 sitting on top of each other should attract a
  // distant third exactly as one particle of mass 2 does.
  const build = (merged) => {
    const sim = makeSim(3, { merge: 0 });
    sim.attract.fill(0);
    sim.repel.fill(0);
    sim.mass.fill(1);
    sim.attract[0] = 1;              // green feels green
    sim.setTypes(1);
    for (let i = 0; i < 3; i++) { sim.type[i] = 0; sim.vel[i * 2] = 0; sim.vel[i * 2 + 1] = 0; }
    sim.pos[0] = 500; sim.pos[1] = 500;          // the observer
    sim.pos[2] = 530; sim.pos[3] = 500;          // the mass
    sim.pos[4] = 530; sim.pos[5] = 500;
    sim.pmass[0] = 1;
    if (merged) { sim.count = 2; sim.pmass[1] = 2; }
    else { sim.count = 3; sim.pmass[1] = 1; sim.pmass[2] = 1; }
    return sim;
  };
  const pull = (sim) => {
    sim._integrate = () => {};
    sim.step();
    // Find the observer again — the sort permutes the array.
    for (let i = 0; i < sim.count; i++) {
      if (Math.abs(sim.pos[i * 2] - 500) < 1e-3) return sim.vel[i * 2];
    }
    throw new Error('observer not found');
  };
  const apart = pull(build(false));
  const merged = pull(build(true));
  assert.ok(apart > 0, 'the observer should be pulled toward the mass');
  assert.ok(Math.abs(merged - apart) < 1e-6,
    `merged pull ${merged} should match two separate particles ${apart}`);
});

test('the render buffer carries each particle mass', () => {
  // The renderer sizes points from this, so a merged particle that shipped its
  // mass as 1 would silently draw at the wrong size.
  const sim = makeSim(4);
  sim.pmass[0] = 9;
  sim.pmass[1] = 1;
  const out = new Float32Array(4 * 4);
  const n = sim.writeRenderBuffer(out);
  assert.equal(n, 4);
  const masses = [];
  for (let i = 0; i < n; i++) {
    assert.ok(out[i * 4 + 2] >= 0 && out[i * 4 + 2] < MAX_TYPES, 'colour out of range');
    masses.push(out[i * 4 + 3]);
  }
  assert.ok(masses.includes(9), 'a heavy particle did not reach the renderer');
  // Radius goes as the square root, so mass 9 draws three times as wide.
  assert.equal(Math.sqrt(9), 3);
});

test('every natural shuffle is collapse-free and non-reciprocal', () => {
  for (const gen of NATURAL) {
    for (let run = 0; run < 40; run++) {
      const attract = new Float32Array(MAX_TYPES * MAX_TYPES);
      const repel = new Float32Array(MAX_TYPES * MAX_TYPES);
      const mass = new Float32Array(MAX_TYPES);
      gen.build(attract, repel, mass);

      let asymmetric = 0;
      for (let a = 0; a < MAX_TYPES; a++) {
        for (let b = 0; b < MAX_TYPES; b++) {
          const ij = a * MAX_TYPES + b, ji = b * MAX_TYPES + a;
          // Repulsion above attraction on every pair, or that pair falls into
          // a point. Each rule builds R as A plus a gap to guarantee it.
          assert.ok(repel[ij] > attract[ij],
            `${gen.name}: ${a},${b} has R ${repel[ij]} <= A ${attract[ij]}`);
          assert.ok(attract[ij] >= 0 && attract[ij] <= 1, 'attraction out of range');
          assert.ok(repel[ij] >= 0 && repel[ij] <= 1, 'repulsion out of range');
          if (a !== b && Math.abs(attract[ij] - attract[ji]) > 0.01) asymmetric++;
        }
      }
      // A perfectly reciprocal matrix reaches equilibrium and stops dead, so
      // each rule carries a directional term. It must actually bite.
      assert.ok(asymmetric > 0, `${gen.name}: produced a fully reciprocal matrix`);

      for (let t = 0; t < MAX_TYPES; t++) {
        assert.ok(mass[t] >= 0.1 && mass[t] <= 3, `${gen.name}: mass ${mass[t]} out of slider range`);
      }
    }
  }
});

test('the tissue rule produces an interfacial cost, or it cannot sort', () => {
  // Steinberg's sorting is driven entirely by unlike cells adhering less well
  // than like ones. Without that cost a mixture has no reason to separate.
  // This regressed once already: sqrt(ai*aj) is exactly the mean of ai and aj,
  // so the plain geometric mean left 76% of pairs neutral and nothing sorted.
  const tissue = NATURAL.find((n) => n.key === 'tissue');
  let sorting = 0, total = 0;
  for (let run = 0; run < 60; run++) {
    const attract = new Float32Array(MAX_TYPES * MAX_TYPES);
    const repel = new Float32Array(MAX_TYPES * MAX_TYPES);
    const mass = new Float32Array(MAX_TYPES);
    tissue.build(attract, repel, mass);
    for (let i = 0; i < MAX_TYPES; i++) {
      for (let j = i + 1; j < MAX_TYPES; j++) {
        const hetero = (attract[i * MAX_TYPES + j] + attract[j * MAX_TYPES + i]) / 2;
        const homo = (attract[i * MAX_TYPES + i] + attract[j * MAX_TYPES + j]) / 2;
        if (hetero < homo - 0.04) sorting++;
        total++;
      }
    }
  }
  const share = sorting / total;
  assert.ok(share > 0.85, `only ${(share * 100).toFixed(0)}% of pairs carry an interfacial cost`);
});

test("the neural rule obeys Dale's law", () => {
  // A neuron excites everything it touches or inhibits everything it touches,
  // never both. That is a constraint on a whole column — the sign belongs to
  // the colour doing the acting — and it is the one thing that makes this rule
  // different from the others, so it is worth pinning.
  const neural = NATURAL.find((n) => n.key === 'neural');
  let clean = 0, total = 0;
  for (let run = 0; run < 30; run++) {
    const attract = new Float32Array(MAX_TYPES * MAX_TYPES);
    const repel = new Float32Array(MAX_TYPES * MAX_TYPES);
    const mass = new Float32Array(MAX_TYPES);
    neural.build(attract, repel, mass);
    for (let j = 0; j < MAX_TYPES; j++) {
      let attracts = 0, pushes = 0;
      for (let i = 0; i < MAX_TYPES; i++) {
        if (i === j) continue;
        const ij = i * MAX_TYPES + j;
        if (attract[ij] > 0.15) attracts++;
        else if (repel[ij] - attract[ij] > 0.25) pushes++;
      }
      if (attracts === 0 || pushes === 0) clean++;
      total++;
    }
  }
  assert.equal(clean, total, `${total - clean} columns mixed excitation with inhibition`);
});

test('the golden angle leaves no two colours in the same relation', () => {
  // Phyllotaxis is here for its non-degeneracy: ten points on a regular ring
  // give only 5 distinct separations among 45 pairs, because the symmetry
  // makes most pairs interchangeable. The golden angle gives all 45.
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const spread = (angleOf, radiusOf) => {
    const pts = [];
    for (let t = 0; t < MAX_TYPES; t++) {
      const r = radiusOf(t);
      const th = angleOf(t);
      pts.push([r * Math.cos(th), r * Math.sin(th)]);
    }
    const seen = new Set();
    for (let i = 0; i < MAX_TYPES; i++) {
      for (let j = i + 1; j < MAX_TYPES; j++) {
        seen.add(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]).toFixed(6));
      }
    }
    return seen.size;
  };
  const pairs = (MAX_TYPES * (MAX_TYPES - 1)) / 2;
  const sqrtR = (t) => Math.sqrt(t + 0.5);
  assert.equal(spread((t) => (t + 0.5) * GOLDEN, sqrtR), pairs,
    'the golden angle should leave no ties');

  // The control has to hold the radius constant. A rational angle on a growing
  // radius is a spiral, not a ring, and the differing radii break the ties on
  // their own — so that comparison would prove nothing about the angle.
  assert.ok(spread((t) => (2 * Math.PI * t) / MAX_TYPES, () => 1) < pairs / 4,
    'a regular ring should be badly degenerate, or the test proves nothing');
});

test('natural shuffles fill the whole matrix, not just the active colours', () => {
  // Same contract as the plain shuffle: raising the colour count afterwards
  // must reveal colours that already interact.
  for (const gen of NATURAL) {
    const attract = new Float32Array(MAX_TYPES * MAX_TYPES);
    const repel = new Float32Array(MAX_TYPES * MAX_TYPES);
    const mass = new Float32Array(MAX_TYPES);
    gen.build(attract, repel, mass);
    for (let i = 0; i < MAX_TYPES * MAX_TYPES; i++) {
      assert.ok(repel[i] > 0, `${gen.name}: entry ${i} left unset`);
    }
    for (let t = 0; t < MAX_TYPES; t++) assert.ok(mass[t] > 0, `${gen.name}: mass ${t} unset`);
  }
});

test('a zeroed matrix leaves particles motionless', () => {
  const sim = makeSim(500);
  sim.attract.fill(0);
  sim.repel.fill(0);
  const snapshot = sim.pos.slice(0, sim.count * 2);
  for (let i = 0; i < 20; i++) sim.step();
  // Order is permuted by the sort, so compare the multiset of coordinates.
  const key = (a) => Array.from(a).map((v) => v.toFixed(4)).sort().join(',');
  assert.equal(key(sim.pos.slice(0, sim.count * 2)), key(snapshot));
});
