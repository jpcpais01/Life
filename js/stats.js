// Live measurements of what the world is doing, sampled alongside the physics.
//
// These are the same four numbers used to tune the presets, so watching them
// settle tells you what the simulation is actually doing rather than what it
// looks like it is doing. Everything reuses preallocated buffers — a sample
// costs one pass over the particles plus a few thousand multiplies, against
// the ~100k pair evaluations of a single step, so it is effectively free.

import { NT, WORLD } from './state.js';

const G = 24;               // density grid resolution
const CELLS = G * G;

export class StatsProbe {
  constructor() {
    this.total = new Float64Array(CELLS);
    this.byType = [];
    for (let t = 0; t < NT; t++) this.byType.push(new Float64Array(CELLS));
  }

  sample(sim) {
    const n = sim.count;
    if (n === 0) return null;

    const total = this.total, byType = this.byType;
    total.fill(0);
    for (let t = 0; t < NT; t++) byType[t].fill(0);

    const inv = G / WORLD;
    const pos = sim.pos, type = sim.type, vel = sim.vel;
    let speed = 0;

    for (let i = 0; i < n; i++) {
      let cx = (pos[i * 2] * inv) | 0;
      let cy = (pos[i * 2 + 1] * inv) | 0;
      if (cx < 0) cx = 0; else if (cx >= G) cx = G - 1;
      if (cy < 0) cy = 0; else if (cy >= G) cy = G - 1;
      const c = cy * G + cx;
      total[c]++;
      byType[type[i]][c]++;
      speed += Math.hypot(vel[i * 2], vel[i * 2 + 1]);
    }

    // Clumpiness: spread of local density, divided by the spread a purely
    // random scatter would show. 1.0 means "indistinguishable from noise".
    const mean = n / CELLS;
    let variance = 0;
    for (let c = 0; c < CELLS; c++) {
      const d = total[c] - mean;
      variance += d * d;
    }
    const cv = Math.sqrt(variance / CELLS) / mean;
    const clumpiness = cv * Math.sqrt(mean); // divide by the Poisson CV, 1/sqrt(mean)

    // Segregation: how differently the colours are laid out. Two types spread
    // identically give cosine 1 and contribute nothing; types occupying
    // separate territory give cosine 0.
    let similarity = 0, pairs = 0;
    for (let a = 0; a < NT; a++) {
      for (let b = a + 1; b < NT; b++) {
        similarity += cosine(byType[a], byType[b]);
        pairs++;
      }
    }

    return {
      clumpiness,
      segregation: pairs ? 1 - similarity / pairs : 0,
      speed: speed / n,
      // Interacting partners per particle: each pair is counted once by the
      // force loop but felt by both particles.
      neighbours: (2 * sim.pairs) / n,
    };
  }
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na * nb);
  return denom > 0 ? dot / denom : 0;
}
