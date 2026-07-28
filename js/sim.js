// Life — particle simulation core.
//
// All state lives in flat typed arrays, interleaved as [x0,y0, x1,y1, ...] so
// the hot loop streams one cache line at a time. Every step the particles are
// counting-sorted into a uniform spatial grid and *physically reordered*, so
// cell members end up contiguous in memory; that reordering is where most of
// the speed comes from.
//
// Forces are inverse-square (a = m/d²) with two independent per-pair terms:
// an attraction acting out to `cutR`, and a repulsion acting inside `coreR`.
// Both are scaled 0..1 by the interaction matrices, and both are non-reciprocal
// (green may chase yellow while yellow flees green) — which is what makes the
// behaviour interesting.

import { MAX_TYPES, DEFAULT_TYPES, MAX_PARTICLES, WORLD, DEFAULT_PARAMS, randomizeForces } from './state.js';

// Softening length² — keeps a = m/d² finite as d -> 0.
const SOFT = 16;
// Distance floor used when normalising the direction vector.
const DMIN = 1;

// Cells are half the interaction radius across, so the neighbourhood is 5x5.
// That tests ~30% fewer out-of-range candidates than radius-sized cells
// (25/4π vs 9/π wasted area) and measures ~15% faster at high counts. Finer
// grids were measured too: cutR/3 and cutR/4 waste less area but lose more to
// per-cell bookkeeping than they save, so half stays the best of the sweep.
const CELLS_PER_R = 2;

// The forward half of that 5x5 neighbourhood is twelve cells: dx 1..2 on the
// cell's own row, then dx -2..2 on each of the two rows above. Together with
// the cell's own interior every unordered pair is visited exactly once.
//
// Those twelve are never enumerated one at a time, though. A row of the grid is
// contiguous in memory (c = cy*cols + cx) and the sort puts cell members in
// index order, so each stencil ROW is one unbroken span of particles. Walking
// the three spans instead of twelve cells turns twelve inner loops of ~12
// iterations into three of ~25-60, which is where the speed comes from: the
// per-loop setup finally amortises. A span splits in two only when the row
// wraps around the left or right edge, which needs cols >= 5.
const ROWS = 3;
const MAX_RUNS = ROWS * 2;

// Interaction coefficients are indexed by a pair of types every single pair
// evaluation, so the table is padded to a power-of-two stride (index by shift,
// not multiply) and the attract/repel entries are interleaved so a pair's two
// numbers share one cache line.
const CO_SHIFT = 5;
const CO_STRIDE = 1 << CO_SHIFT;
if (MAX_TYPES > CO_STRIDE) throw new Error('CO_SHIFT too small for the palette');

export class Simulation {
  constructor() {
    const n = MAX_PARTICLES;

    // Double-buffered state, swapped after each spatial sort.
    this.pos = new Float32Array(n * 2);
    this.vel = new Float32Array(n * 2);
    this.type = new Uint8Array(n);
    // How many original particles a particle now stands for. Multiplies the
    // colour's mass, so a merged particle pulls as hard as its parts did.
    this.pmass = new Float32Array(n).fill(1);
    this._pos = new Float32Array(n * 2);
    this._vel = new Float32Array(n * 2);
    this._type = new Uint8Array(n);
    this._pmass = new Float32Array(n);

    // Merge bookkeeping, per particle:
    //   -1  free
    //   -2  has absorbed at least one this step (still a valid target)
    //   >=0 absorbed by that index, and gone at the end of the step
    // So a target needs absorb < 0 and a source needs exactly -1: one particle
    // may absorb many in a step, but never both absorbs and is absorbed, which
    // keeps chains out of a single pass.
    this.absorb = new Int32Array(n);
    // Mass a particle has taken on *this step*. The cap has to count it, or a
    // particle sitting just under the limit could absorb several at once.
    this.growth = new Float32Array(n);
    this.merges = 0;

    this.cellOf = new Int32Array(n);
    this.cols = 0;
    this.cellStart = new Int32Array(1);
    this.cursor = new Int32Array(1);

    this.count = 10000;
    this.types = DEFAULT_TYPES; // active colours; the matrix is always 10x10

    // Row = the particle that feels the force, column = the one exerting it.
    this.attract = new Float32Array(MAX_TYPES * MAX_TYPES);
    this.repel = new Float32Array(MAX_TYPES * MAX_TYPES);
    this.mass = new Float32Array(MAX_TYPES).fill(1);

    // Per-step coefficients: matrix * mass * force * dt, folded once. Laid out
    // as [attract, repel] pairs on a padded stride — see CO_SHIFT.
    this.coef = new Float32Array(CO_STRIDE * CO_STRIDE * 2);

    // Scratch for the row spans of one cell's neighbourhood.
    this._runS = new Int32Array(MAX_RUNS);
    this._runE = new Int32Array(MAX_RUNS);
    this._runX = new Float64Array(MAX_RUNS);
    this._runY = new Float64Array(MAX_RUNS);

    this.params = { ...DEFAULT_PARAMS };
    this.pairs = 0;

    randomizeForces(this.attract, this.repel, this.mass);
    this.reset();
  }

  // Seed every slot, not just `count`, so changing the particle count never
  // allocates or leaves uninitialised particles behind.
  reset() {
    const pos = this.pos, vel = this.vel, type = this.type, pmass = this.pmass;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      pos[i * 2] = Math.random() * WORLD;
      pos[i * 2 + 1] = Math.random() * WORLD;
      vel[i * 2] = 0;
      vel[i * 2 + 1] = 0;
      type[i] = i % this.types;
      pmass[i] = 1;
    }
    this.merges = 0;
  }

  // Growing re-seeds the newly exposed slots: after merging, everything past
  // the live count holds absorbed particles that must not come back to life.
  setCount(n) {
    if (n > this.count) {
      const pos = this.pos, vel = this.vel, type = this.type, pmass = this.pmass;
      for (let i = this.count; i < n; i++) {
        pos[i * 2] = Math.random() * WORLD;
        pos[i * 2 + 1] = Math.random() * WORLD;
        vel[i * 2] = 0;
        vel[i * 2 + 1] = 0;
        type[i] = i % this.types;
        pmass[i] = 1;
      }
    }
    this.count = n;
  }

  // Recolour in place. Reassigning rather than respawning lets the world morph
  // into the new palette instead of restarting, and round-robin keeps the
  // colours evenly represented however the array happens to be permuted.
  setTypes(n) {
    if (n === this.types) return;
    this.types = n;
    const type = this.type;
    for (let i = 0; i < MAX_PARTICLES; i++) type[i] = i % n;
  }

  _ensureGrid(cols) {
    if (cols === this.cols) return;
    this.cols = cols;
    this.cellStart = new Int32Array(cols * cols + 1);
    this.cursor = new Int32Array(cols * cols + 1);
  }

  step() {
    const n = this.count;
    if (n === 0) return;

    // At least 5 columns so the half stencil stays correct with wrap-around.
    const cols = Math.max(5, Math.min(256, Math.floor(CELLS_PER_R * WORLD / this.params.cutR)));
    this._ensureGrid(cols);
    const invCell = cols / WORLD;
    const cells = cols * cols;

    const pos = this.pos, vel = this.vel, type = this.type;
    const cellOf = this.cellOf, cellStart = this.cellStart, cursor = this.cursor;

    // --- counting sort into cells ---
    cellStart.fill(0);
    for (let i = 0; i < n; i++) {
      let cx = (pos[i * 2] * invCell) | 0;
      let cy = (pos[i * 2 + 1] * invCell) | 0;
      if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
      if (cy < 0) cy = 0; else if (cy >= cols) cy = cols - 1;
      const c = cy * cols + cx;
      cellOf[i] = c;
      cellStart[c + 1]++;
    }
    for (let c = 0; c < cells; c++) cellStart[c + 1] += cellStart[c];
    cursor.set(cellStart);

    // Gather into the shadow buffers, then swap: the live arrays are now
    // ordered by cell, and stay roughly ordered for the next step too.
    const gpos = this._pos, gvel = this._vel, gtype = this._type, gpmass = this._pmass;
    const pmass = this.pmass;
    for (let i = 0; i < n; i++) {
      const d = cursor[cellOf[i]]++;
      gpos[d * 2] = pos[i * 2];
      gpos[d * 2 + 1] = pos[i * 2 + 1];
      gvel[d * 2] = vel[i * 2];
      gvel[d * 2 + 1] = vel[i * 2 + 1];
      gtype[d] = type[i];
      gpmass[d] = pmass[i];
    }
    this.pos = gpos; this.vel = gvel; this.type = gtype; this.pmass = gpmass;
    this._pos = pos; this._vel = vel; this._type = type; this._pmass = pmass;

    this._forces(cols, cells);
    if (this.params.merge) this._coalesce();
    this._integrate();
  }

  _forces(cols, cells) {
    const p = this.params;
    const pos = this.pos, vel = this.vel, type = this.type, pmass = this.pmass;
    const cellStart = this.cellStart;
    const coef = this.coef;
    const runS = this._runS, runE = this._runE, runX = this._runX, runY = this._runY;

    const k = p.force * p.dt;
    for (let a = 0; a < MAX_TYPES; a++) {
      for (let b = 0; b < MAX_TYPES; b++) {
        const src = a * MAX_TYPES + b;
        const dst = ((a << CO_SHIFT) + b) << 1;
        coef[dst] = k * this.attract[src] * this.mass[b];
        coef[dst + 1] = k * this.repel[src] * this.mass[b];
      }
    }

    const cutR = p.cutR;
    const coreR = Math.min(p.coreR, cutR);
    const cut2 = cutR * cutR;
    const invCut = 1 / cutR, invCore = 1 / coreR;
    const half = WORLD * 0.5;
    let pairs = 0;

    // Merging piggybacks on the force loop: it already has the squared
    // distance for every nearby pair, so detection costs one comparison
    // rather than a second sweep over the world.
    const merging = p.merge ? 1 : 0;
    const merge2 = merging ? p.mergeDist * p.mergeDist : -1;
    // Cap on how heavy a particle may get. The test is on the particles going
    // in, as specified — so a pair just under the cap can land above it, and
    // then neither may merge again. A cap of 1 means nothing ever merges,
    // since every particle starts at 1.
    const cap = p.mergeCap;
    const absorb = this.absorb, growth = this.growth;
    if (merging) {
      absorb.fill(-1, 0, this.count);
      growth.fill(0, 0, this.count);
    }
    let merges = 0;

    for (let c = 0; c < cells; c++) {
      const s = cellStart[c], e = cellStart[c + 1];
      if (s === e) continue;
      const cx = c % cols, cy = (c / cols) | 0;

      // --- resolve the neighbourhood into spans, once for the whole cell ---
      //
      // Each of the three stencil rows is one range of columns, which is one
      // contiguous range of particles. A row that runs off the left or right
      // edge becomes two spans carrying opposite wrap offsets.
      let nr = 0;
      for (let dy = 0; dy < ROWS; dy++) {
        // The cell's own row only reaches forward; the rows above reach both
        // ways, since their backward half was never visited from there.
        const lo = dy === 0 ? cx + 1 : cx - 2;
        const hi = cx + 2;
        let ny = cy + dy, wy = 0;
        if (ny >= cols) { ny -= cols; wy = WORLD; }
        const base = ny * cols;

        // cols >= 5 guarantees at most one of these two splits applies.
        let a0 = lo, b0 = hi, w0 = 0, a1 = 0, b1 = -1, w1 = 0;
        if (lo < 0) { a0 = lo + cols; b0 = cols - 1; w0 = -WORLD; b1 = hi; }
        else if (hi >= cols) { b0 = cols - 1; b1 = hi - cols; w1 = WORLD; }

        // a0 > b0 happens when the forward-only row starts past the edge; the
        // span is then empty and cellStart reports it as such.
        let ns = cellStart[base + a0], ne = cellStart[base + b0 + 1];
        if (ns !== ne) { runS[nr] = ns; runE[nr] = ne; runX[nr] = w0; runY[nr] = wy; nr++; }
        if (b1 >= a1) {
          ns = cellStart[base + a1]; ne = cellStart[base + b1 + 1];
          if (ns !== ne) { runS[nr] = ns; runE[nr] = ne; runX[nr] = w1; runY[nr] = wy; nr++; }
        }
      }

      // --- one pass per particle, covering its whole neighbourhood ---
      //
      // The particle's own row, type and running force stay live across every
      // span, so they are loaded once instead of once per neighbour cell, and
      // the force lands in `vel` in a single write at the end.
      for (let i = s; i < e; i++) {
        const i2 = i * 2;
        const x0 = pos[i2], y0 = pos[i2 + 1];
        const ti = type[i], row = ti << CO_SHIFT;
        const mi = pmass[i];
        let axi = 0, ayi = 0;

        // pairs inside this cell
        for (let j = i + 1; j < e; j++) {
          const j2 = j * 2;
          let dx = pos[j2] - x0;
          let dy = pos[j2 + 1] - y0;
          if (dx > half) dx -= WORLD; else if (dx < -half) dx += WORLD;
          if (dy > half) dy -= WORLD; else if (dy < -half) dy += WORLD;
          const d2 = dx * dx + dy * dy;
          if (d2 >= cut2) continue;
          pairs++;
          const d = Math.sqrt(d2);
          const den = 1 / ((d2 + SOFT) * (d > DMIN ? d : DMIN));
          const ta = 1 - d * invCut;
          // Outside the core this goes negative, so clamping is the same test
          // as `d < coreR` without the branch.
          const u = 1 - d * invCore, tr = u > 0 ? u : 0;
          const tj = type[j];
          const ai = (row + tj) << 1, aj = ((tj << CO_SHIFT) + ti) << 1;
          // The force a particle exerts scales with how many originals it
          // stands for, so each direction is weighted by the *other* one.
          const si = (coef[ai] * ta - coef[ai + 1] * tr) * den * pmass[j];
          const sj = (coef[aj] * ta - coef[aj + 1] * tr) * den * mi;
          axi += dx * si; ayi += dy * si;
          vel[j2] -= dx * sj; vel[j2 + 1] -= dy * sj;

          if (merging && ti === tj && d2 < merge2
              && absorb[j] === -1 && absorb[i] < 0
              && mi + growth[i] < cap && pmass[j] < cap) {
            absorb[j] = i;
            absorb[i] = -2;
            growth[i] += pmass[j];
            merges++;
          }
        }

        // pairs across the neighbourhood spans
        for (let o = 0; o < nr; o++) {
          // Shift this cell's particle by the wrap offset instead of the
          // neighbour's, so the inner loop needs no wrap test at all.
          const xi = x0 - runX[o], yi = y0 - runY[o];
          const ne = runE[o];
          for (let j = runS[o]; j < ne; j++) {
            const j2 = j * 2;
            const dx = pos[j2] - xi;
            const dy = pos[j2 + 1] - yi;
            const d2 = dx * dx + dy * dy;
            if (d2 >= cut2) continue;
            pairs++;
            const d = Math.sqrt(d2);
            const den = 1 / ((d2 + SOFT) * (d > DMIN ? d : DMIN));
            const ta = 1 - d * invCut;
            const u = 1 - d * invCore, tr = u > 0 ? u : 0;
            const tj = type[j];
            const ai = (row + tj) << 1, aj = ((tj << CO_SHIFT) + ti) << 1;
            const si = (coef[ai] * ta - coef[ai + 1] * tr) * den * pmass[j];
            const sj = (coef[aj] * ta - coef[aj + 1] * tr) * den * mi;
            axi += dx * si; ayi += dy * si;
            vel[j2] -= dx * sj; vel[j2 + 1] -= dy * sj;

            if (merging && ti === tj && d2 < merge2
                && absorb[j] === -1 && absorb[i] < 0
                && mi + growth[i] < cap && pmass[j] < cap) {
              absorb[j] = i;
              absorb[i] = -2;
              growth[i] += pmass[j];
              merges++;
            }
          }
        }
        vel[i2] += axi; vel[i2 + 1] += ayi;
      }
    }
    this.pairs = pairs;
    this.merges = merges;
  }

  // Fold absorbed particles into their target and close the gaps. Momentum is
  // conserved rather than the target simply keeping its own velocity, so a
  // merge never injects energy into the world.
  _coalesce() {
    if (this.merges === 0) return;
    const n = this.count;
    const absorb = this.absorb, pos = this.pos, vel = this.vel;
    const type = this.type, pmass = this.pmass;

    for (let k = 0; k < n; k++) {
      const a = absorb[k];
      if (a < 0) continue;
      const mk = pmass[k], ma = pmass[a];
      const total = ma + mk;
      vel[a * 2] = (vel[a * 2] * ma + vel[k * 2] * mk) / total;
      vel[a * 2 + 1] = (vel[a * 2 + 1] * ma + vel[k * 2 + 1] * mk) / total;
      pmass[a] = total;
    }

    // Stable compaction, so the cell ordering survives apart from the gaps.
    let w = 0;
    for (let k = 0; k < n; k++) {
      if (absorb[k] >= 0) continue;
      if (w !== k) {
        pos[w * 2] = pos[k * 2];
        pos[w * 2 + 1] = pos[k * 2 + 1];
        vel[w * 2] = vel[k * 2];
        vel[w * 2 + 1] = vel[k * 2 + 1];
        type[w] = type[k];
        pmass[w] = pmass[k];
      }
      w++;
    }
    this.count = w;
  }

  _integrate() {
    const p = this.params;
    const n = this.count;
    const pos = this.pos, vel = this.vel;
    const damp = p.damping, dt = p.dt;
    const maxV = p.maxV, maxV2 = maxV * maxV;

    for (let i = 0; i < n; i++) {
      const i2 = i * 2;
      let ux = vel[i2] * damp;
      let uy = vel[i2 + 1] * damp;
      const s2 = ux * ux + uy * uy;
      if (s2 > maxV2) {
        const f = maxV / Math.sqrt(s2);
        ux *= f; uy *= f;
      }
      vel[i2] = ux; vel[i2 + 1] = uy;

      let x = pos[i2] + ux * dt;
      let y = pos[i2 + 1] + uy * dt;
      // Torus wrap. A single add/subtract covers every realistic case; the
      // modulo is the safety net for a pathological time step.
      if (x < 0) { x += WORLD; if (x < 0) x -= Math.floor(x / WORLD) * WORLD; }
      else if (x >= WORLD) { x -= WORLD; if (x >= WORLD) x -= Math.floor(x / WORLD) * WORLD; }
      if (y < 0) { y += WORLD; if (y < 0) y -= Math.floor(y / WORLD) * WORLD; }
      else if (y >= WORLD) { y -= WORLD; if (y >= WORLD) y -= Math.floor(y / WORLD) * WORLD; }
      pos[i2] = x; pos[i2 + 1] = y;
    }
  }

  // Pack [x, y, type, mass] quads for the renderer. Mass rides along so a
  // merged particle can be drawn at the size its parts occupied.
  writeRenderBuffer(out) {
    const n = this.count;
    const pos = this.pos, type = this.type, pmass = this.pmass;
    for (let i = 0, k = 0; i < n; i++, k += 4) {
      out[k] = pos[i * 2];
      out[k + 1] = pos[i * 2 + 1];
      out[k + 2] = type[i];
      out[k + 3] = pmass[i];
    }
    return n;
  }
}
