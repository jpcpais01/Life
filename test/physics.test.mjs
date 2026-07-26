// Verifies the spatially-hashed force loop against a brute-force reference.
// The interesting failure modes are silent ones: a stencil that misses pairs
// (forces too weak) or visits one twice (forces doubled), so this compares
// per-particle accelerations exactly rather than eyeballing the result.
//
//   node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../js/sim.js';
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
