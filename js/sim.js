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

import { NT, MAX_PARTICLES, WORLD, DEFAULT_PARAMS, randomizeMatrix } from './state.js';

// Softening length² — keeps a = m/d² finite as d -> 0.
const SOFT = 16;
// Distance floor used when normalising the direction vector.
const DMIN = 1;

// Cells are half the interaction radius across, so the neighbourhood is 5x5.
// That tests ~30% fewer out-of-range candidates than radius-sized cells
// (25/4π vs 9/π wasted area) and measures ~15% faster at high counts.
const CELLS_PER_R = 2;
// Forward half of the 5x5 neighbourhood: together with the cell's own
// interior, every unordered pair is visited exactly once (needs cols >= 5).
const OFF_X = new Int32Array([1, 2, -2, -1, 0, 1, 2, -2, -1, 0, 1, 2]);
const OFF_Y = new Int32Array([0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
const NOFF = OFF_X.length;

export class Simulation {
  constructor() {
    const n = MAX_PARTICLES;

    // Double-buffered state, swapped after each spatial sort.
    this.pos = new Float32Array(n * 2);
    this.vel = new Float32Array(n * 2);
    this.type = new Uint8Array(n);
    this._pos = new Float32Array(n * 2);
    this._vel = new Float32Array(n * 2);
    this._type = new Uint8Array(n);

    this.cellOf = new Int32Array(n);
    this.cols = 0;
    this.cellStart = new Int32Array(1);
    this.cursor = new Int32Array(1);

    this.count = 2000;

    // Row = the particle that feels the force, column = the one exerting it.
    this.attract = new Float32Array(NT * NT);
    this.repel = new Float32Array(NT * NT);
    this.mass = new Float32Array(NT).fill(1);

    // Per-step coefficients: matrix * mass * force * dt, folded once.
    this.coefA = new Float32Array(NT * NT);
    this.coefR = new Float32Array(NT * NT);

    this.params = { ...DEFAULT_PARAMS };
    this.pairs = 0;

    randomizeMatrix(this.attract, this.repel);
    this.reset();
  }

  // Seed every slot, not just `count`, so changing the particle count never
  // allocates or leaves uninitialised particles behind.
  reset() {
    const pos = this.pos, vel = this.vel, type = this.type;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      pos[i * 2] = Math.random() * WORLD;
      pos[i * 2 + 1] = Math.random() * WORLD;
      vel[i * 2] = 0;
      vel[i * 2 + 1] = 0;
      type[i] = i % NT;
    }
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
    const gpos = this._pos, gvel = this._vel, gtype = this._type;
    for (let i = 0; i < n; i++) {
      const d = cursor[cellOf[i]]++;
      gpos[d * 2] = pos[i * 2];
      gpos[d * 2 + 1] = pos[i * 2 + 1];
      gvel[d * 2] = vel[i * 2];
      gvel[d * 2 + 1] = vel[i * 2 + 1];
      gtype[d] = type[i];
    }
    this.pos = gpos; this.vel = gvel; this.type = gtype;
    this._pos = pos; this._vel = vel; this._type = type;

    this._forces(cols, cells);
    this._integrate();
  }

  _forces(cols, cells) {
    const p = this.params;
    const pos = this.pos, vel = this.vel, type = this.type;
    const cellStart = this.cellStart;
    const coefA = this.coefA, coefR = this.coefR;

    const k = p.force * p.dt;
    for (let a = 0; a < NT; a++) {
      for (let b = 0; b < NT; b++) {
        const i = a * NT + b;
        coefA[i] = k * this.attract[i] * this.mass[b];
        coefR[i] = k * this.repel[i] * this.mass[b];
      }
    }

    const cutR = p.cutR;
    const coreR = Math.min(p.coreR, cutR);
    const cut2 = cutR * cutR;
    const invCut = 1 / cutR, invCore = 1 / coreR;
    const half = WORLD * 0.5;
    let pairs = 0;

    for (let c = 0; c < cells; c++) {
      const s = cellStart[c], e = cellStart[c + 1];
      if (s === e) continue;
      const cx = c % cols, cy = (c / cols) | 0;

      // --- pairs within this cell ---
      for (let i = s; i < e; i++) {
        const i2 = i * 2;
        const xi = pos[i2], yi = pos[i2 + 1];
        const ti = type[i], row = ti * NT;
        let axi = 0, ayi = 0;
        for (let j = i + 1; j < e; j++) {
          const j2 = j * 2;
          let dx = pos[j2] - xi;
          let dy = pos[j2 + 1] - yi;
          if (dx > half) dx -= WORLD; else if (dx < -half) dx += WORLD;
          if (dy > half) dy -= WORLD; else if (dy < -half) dy += WORLD;
          const d2 = dx * dx + dy * dy;
          if (d2 >= cut2) continue;
          pairs++;
          const d = Math.sqrt(d2);
          const den = 1 / ((d2 + SOFT) * (d < DMIN ? DMIN : d));
          const ta = 1 - d * invCut;
          const tr = d < coreR ? 1 - d * invCore : 0;
          const tj = type[j];
          const ai = row + tj, aj = tj * NT + ti;
          const si = (coefA[ai] * ta - coefR[ai] * tr) * den;
          const sj = (coefA[aj] * ta - coefR[aj] * tr) * den;
          axi += dx * si; ayi += dy * si;
          vel[j2] -= dx * sj; vel[j2 + 1] -= dy * sj;
        }
        vel[i2] += axi; vel[i2 + 1] += ayi;
      }

      // --- pairs with the forward neighbour cells ---
      for (let o = 0; o < NOFF; o++) {
        let nx = cx + OFF_X[o], ny = cy + OFF_Y[o];
        let wx = 0, wy = 0;
        if (nx < 0) { nx += cols; wx = -WORLD; } else if (nx >= cols) { nx -= cols; wx = WORLD; }
        if (ny < 0) { ny += cols; wy = -WORLD; } else if (ny >= cols) { ny -= cols; wy = WORLD; }
        const nc = ny * cols + nx;
        const ns = cellStart[nc], ne = cellStart[nc + 1];
        if (ns === ne) continue;

        for (let i = s; i < e; i++) {
          const i2 = i * 2;
          // Shift this cell's particle by the wrap offset instead of the
          // neighbour's, so the inner loop needs no wrap test at all.
          const xi = pos[i2] - wx, yi = pos[i2 + 1] - wy;
          const ti = type[i], row = ti * NT;
          let axi = 0, ayi = 0;
          for (let j = ns; j < ne; j++) {
            const j2 = j * 2;
            const dx = pos[j2] - xi;
            const dy = pos[j2 + 1] - yi;
            const d2 = dx * dx + dy * dy;
            if (d2 >= cut2) continue;
            pairs++;
            const d = Math.sqrt(d2);
            const den = 1 / ((d2 + SOFT) * (d < DMIN ? DMIN : d));
            const ta = 1 - d * invCut;
            const tr = d < coreR ? 1 - d * invCore : 0;
            const tj = type[j];
            const ai = row + tj, aj = tj * NT + ti;
            const si = (coefA[ai] * ta - coefR[ai] * tr) * den;
            const sj = (coefA[aj] * ta - coefR[aj] * tr) * den;
            axi += dx * si; ayi += dy * si;
            vel[j2] -= dx * sj; vel[j2 + 1] -= dy * sj;
          }
          vel[i2] += axi; vel[i2 + 1] += ayi;
        }
      }
    }
    this.pairs = pairs;
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

  // Pack [x, y, type] triples for the renderer.
  writeRenderBuffer(out) {
    const n = this.count;
    const pos = this.pos, type = this.type;
    for (let i = 0, k = 0; i < n; i++, k += 3) {
      out[k] = pos[i * 2];
      out[k + 1] = pos[i * 2 + 1];
      out[k + 2] = type[i];
    }
    return n;
  }
}
