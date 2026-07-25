// Physics throughput at a few particle counts. Numbers are per simulation
// step, single-threaded — in the app this runs in a worker, so the budget for
// 60 fps is roughly 16 ms.
//
//   npm run bench

import { Simulation } from '../js/sim.js';
import { randomizeMatrix } from '../js/state.js';

const COUNTS = [1000, 2500, 5000, 10000, 20000];
const WARMUP = 50;
const ITERS = 40;

console.log('count      ms/step   steps/s   interactions/step   ns/interaction');
for (const n of COUNTS) {
  const sim = new Simulation();
  sim.count = n;
  sim.reset();
  randomizeMatrix(sim.attract, sim.repel);

  // Warm up: let JIT settle and let the particles form real structure, since
  // clustering is what makes the neighbour lists long.
  for (let i = 0; i < WARMUP; i++) sim.step();

  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) sim.step();
  const ms = (performance.now() - t0) / ITERS;

  console.log(
    String(n).padStart(5),
    ms.toFixed(2).padStart(10),
    (1000 / ms).toFixed(0).padStart(9),
    (sim.pairs / 1e6).toFixed(2).padStart(16) + 'M',
    ((ms * 1e6) / sim.pairs).toFixed(1).padStart(15),
  );
}
