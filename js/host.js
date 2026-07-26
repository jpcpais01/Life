// Simulation host. Runs the physics in a worker when the browser allows it,
// and falls back to the main thread otherwise. Both paths expose the same
// tiny surface to the rest of the app.

import { Simulation } from './sim.js';
import { MAX_PARTICLES } from './state.js';
import { StatsProbe } from './stats.js';

const SAMPLE_MS = 100;

const FLOATS = MAX_PARTICLES * 4; // [x, y, type, mass] per particle

class WorkerHost {
  constructor(state, worker) {
    this.state = state;
    this.worker = worker;
    this.mode = 'worker';
    this.stats = { n: 0, pairs: 0, ms: 0 };

    this.pending = null;   // newest frame not yet drawn
    this.frame = null;     // frame currently being drawn
    this.toReturn = [];    // buffers owed back to the worker
    this.paused = false;

    worker.onmessage = (e) => {
      const m = e.data;
      if (m.t !== 'frame') return;
      // A frame we never drew is stale the moment a newer one lands.
      if (this.pending) this.toReturn.push(this.pending.buf);
      // Keep the newest non-null sample: dropping a stale frame must not drop
      // its measurement with it.
      this.signals = m.signals || this.signals;
      this.pending = { buf: m.buf, n: m.n, pairs: m.pairs, ms: m.ms };
    };

    this.sync();
    // Two buffers in flight: the worker can compute the next frame while the
    // main thread is still uploading the current one.
    for (let i = 0; i < 2; i++) {
      const buf = new ArrayBuffer(FLOATS * 4);
      worker.postMessage({ t: 'buf', buf }, [buf]);
    }
  }

  sync() {
    const s = this.state;
    this.worker.postMessage({
      t: 'state',
      count: s.count,
      types: s.types,
      params: { ...s.params },
      attract: s.attract.slice(),
      repel: s.repel.slice(),
      mass: s.mass.slice(),
    });
  }

  reset() { this.worker.postMessage({ t: 'reset' }); }

  setPaused(v) {
    this.paused = v;
    this.worker.postMessage({ t: 'pause', v });
  }

  // Returns a frame to draw, or null when nothing new has arrived.
  beginFrame() {
    if (!this.pending) return null;
    const f = this.pending;
    this.pending = null;
    this.stats.n = f.n;
    this.stats.pairs = f.pairs;
    this.stats.ms += (f.ms - this.stats.ms) * 0.15;
    this.frame = f;
    const signals = this.signals;
    this.signals = null;
    return { data: new Float32Array(f.buf, 0, f.n * 4), n: f.n, signals };
  }

  endFrame() {
    if (this.frame) {
      this.toReturn.push(this.frame.buf);
      this.frame = null;
    }
    // Hand back at most one buffer per displayed frame; that alone paces the
    // worker to the refresh rate instead of letting it free-run.
    const buf = this.toReturn.shift();
    if (buf) this.worker.postMessage({ t: 'buf', buf }, [buf]);
  }
}

class LocalHost {
  constructor(state) {
    this.state = state;
    this.mode = 'local';
    this.sim = new Simulation();
    this.probe = new StatsProbe();
    this.lastSample = 0;
    this.targetCount = -1;
    this.buffer = new Float32Array(FLOATS);
    this.paused = false;
    this.stats = { n: 0, pairs: 0, ms: 0 };
    this.sync();
  }

  sync() {
    const s = this.state, sim = this.sim;
    if (s.count !== this.targetCount) {
      this.targetCount = s.count;
      sim.setCount(s.count);
    }
    sim.setTypes(s.types);
    Object.assign(sim.params, s.params);
    sim.attract.set(s.attract);
    sim.repel.set(s.repel);
    sim.mass.set(s.mass);
  }

  reset() {
    if (this.targetCount > 0) this.sim.setCount(this.targetCount);
    this.sim.reset();
    this.stale = true;
  }
  setPaused(v) { this.paused = v; this.stale = true; }

  beginFrame() {
    const sim = this.sim;
    // While paused nothing moves, so re-drawing would only burn the trails away.
    if (this.paused && !this.stale) return null;
    this.stale = false;
    if (!this.paused) {
      const t0 = performance.now();
      const steps = sim.params.steps;
      for (let s = 0; s < steps; s++) sim.step();
      this.stats.ms += ((performance.now() - t0) / steps - this.stats.ms) * 0.15;
    }
    const n = sim.writeRenderBuffer(this.buffer);
    this.stats.n = n;
    this.stats.pairs = sim.pairs;

    let signals = null;
    const now = performance.now();
    if (now - this.lastSample >= SAMPLE_MS) {
      this.lastSample = now;
      signals = this.probe.sample(sim);
    }
    return { data: this.buffer, n, signals };
  }

  endFrame() {}
}

export function createHost(state) {
  try {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onerror = (e) => console.warn('physics worker error:', e.message);
    return new WorkerHost(state, worker);
  } catch (err) {
    console.warn('Worker unavailable, running physics on the main thread:', err);
    return new LocalHost(state);
  }
}
