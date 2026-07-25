// Physics worker. Owns the simulation and hands finished frames to the main
// thread as transferable buffers — zero copies, and a heavy step never blocks
// rendering or the controls.

import { Simulation } from './sim.js';
import { MAX_PARTICLES } from './state.js';

const sim = new Simulation();
let paused = false;
const pool = []; // ArrayBuffers currently owned by this worker

function pump() {
  while (!paused && pool.length) {
    const buf = pool.pop();
    const view = new Float32Array(buf);
    const t0 = performance.now();
    const steps = sim.params.steps;
    for (let s = 0; s < steps; s++) sim.step();
    const ms = (performance.now() - t0) / steps;
    const n = sim.writeRenderBuffer(view);
    postMessage({ t: 'frame', buf, n, pairs: sim.pairs, ms }, [buf]);
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
      sim.count = m.count;
      Object.assign(sim.params, m.params);
      sim.attract.set(m.attract);
      sim.repel.set(m.repel);
      sim.mass.set(m.mass);
      break;
    case 'reset':
      sim.reset();
      break;
    case 'pause':
      paused = m.v;
      if (!paused) pump();
      break;
  }
};

postMessage({ t: 'ready', max: MAX_PARTICLES });
