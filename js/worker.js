// Physics worker. Owns the simulation and hands finished frames to the main
// thread as transferable buffers — zero copies, and a heavy step never blocks
// rendering or the controls.

import { Simulation } from './sim.js';
import { MAX_PARTICLES } from './state.js';
import { StatsProbe } from './stats.js';

const sim = new Simulation();
const probe = new StatsProbe();
let paused = false;
let targetCount = -1;
const pool = []; // ArrayBuffers currently owned by this worker

// Sample on a wall clock rather than every nth frame, so the graphs advance at
// the same rate whether the sim is running at 60 steps/s or 6.
const SAMPLE_MS = 100;
let lastSample = 0;

function pump() {
  while (!paused && pool.length) {
    const buf = pool.pop();
    const view = new Float32Array(buf);
    const t0 = performance.now();
    const steps = sim.params.steps;
    for (let s = 0; s < steps; s++) sim.step();
    const ms = (performance.now() - t0) / steps;
    const n = sim.writeRenderBuffer(view);

    let signals = null;
    const now = performance.now();
    if (now - lastSample >= SAMPLE_MS) {
      lastSample = now;
      signals = probe.sample(sim);
    }
    postMessage({ t: 'frame', buf, n, pairs: sim.pairs, ms, signals, merged: sim.mergedTotal }, [buf]);
  }
}

self.onmessage = (e) => {
  const m = e.data;
  switch (m.t) {
    case 'buf':
      pool.push(m.buf);
      pump();
      break;
    case 'state':
      // Merging lowers the live count, so the slider is a target rather than
      // a running total: only push it through when the user actually moves it.
      if (m.count !== targetCount) {
        targetCount = m.count;
        sim.setCount(m.count);
      }
      sim.setTypes(m.types);
      Object.assign(sim.params, m.params);
      sim.attract.set(m.attract);
      sim.repel.set(m.repel);
      sim.mass.set(m.mass);
      break;
    case 'reset':
      sim.setCount(targetCount < 0 ? sim.count : targetCount);
      sim.reset();
      break;
    case 'pause':
      paused = m.v;
      if (!paused) pump();
      break;
  }
};

postMessage({ t: 'ready', max: MAX_PARTICLES });
