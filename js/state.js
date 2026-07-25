// Shared constants and the plain configuration object that the control panel
// edits. Deliberately free of simulation machinery so the main thread and the
// physics worker can both import it cheaply.

import { PRESETS, applyPreset } from './presets.js';

export const TYPES = [
  { name: 'Green',  hex: '#3ef07a', color: [0.24, 0.94, 0.48] },
  { name: 'Yellow', hex: '#ffd83d', color: [1.00, 0.85, 0.24] },
  { name: 'Red',    hex: '#ff4d5e', color: [1.00, 0.30, 0.37] },
  { name: 'Blue',   hex: '#4d9bff', color: [0.30, 0.61, 1.00] },
  { name: 'White',  hex: '#eef1ff', color: [0.93, 0.95, 1.00] },
];

export const NT = TYPES.length;
export const MAX_PARTICLES = 20000;
export const WORLD = 1000; // square world; wraps on all four edges

// Defaults are chosen from the shape of the force law rather than by taste.
//
// With 1/d² falloff plus a linear taper, attraction at d = 50 is already ~30x
// weaker than at d = 20, so a 90-unit reach was buying almost no force for
// quadratically more work. 70 keeps everything that matters and costs 40% less.
// The repulsion core sits at ~1/3 of it, which puts typical settling distances
// in the 5-15 range — close enough to read as touching, far enough to see
// individual particles inside a cluster.
//
// Damping and force trade off: terminal speed is a·damping/(1−damping), so 0.92
// glides about 28% further per unit of force than 0.90 did. Force is trimmed to
// match, which buys longer, more fluid drift at the same overall pace.
//
// Damping and time step were then checked as a 3x3 grid against all ten presets
// plus random matrices. Neither neighbouring value survives every case, which is
// why these are the defaults:
//
//   dt 0.70  crisper structure (+12% clustering) but Crystal sets solid —
//            its churn falls from 0.19 to 0.05 and it stops moving entirely
//   dt 1.00  nothing freezes, but structure drops everywhere: Ecosystem loses
//            a third of its clustering and Worms a fifth
//
// So 0.85 is not the best on average — it is the one that costs no case its
// behaviour. Raising steps/frame to 2 and dropping dt to 0.7 buys the finer
// integration back at full pace, for double the CPU.
export const DEFAULT_PARAMS = {
  force: 240,     // global force scale
  cutR: 70,       // attraction cutoff radius
  coreR: 22,      // repulsion core radius
  dt: 0.85,
  damping: 0.92,
  maxV: 26,
  steps: 1,
};

// Every one of the 50 scaling factors, drawn flat across the full 0..1 range.
// An earlier version biased this — sparse entries plus a self-repulsion floor —
// on the assumption that contrast between pairs was what produced structure.
// Measured over 24 runs the plain version is simply better: denser clustering,
// livelier motion, and no runs that freeze or collapse to a single lump.
//
// Masses are drawn log-uniformly around 1, so halving and doubling are equally
// likely and the overall force level stays where the defaults expect it. A flat
// 0.1..3 draw would average 1.55 and quietly make every shuffle 55% hotter.
export function randomizeForces(attract, repel, mass) {
  for (let i = 0; i < NT * NT; i++) {
    attract[i] = Math.round(Math.random() * 100) / 100;
    repel[i] = Math.round(Math.random() * 100) / 100;
  }
  const lo = Math.log(0.5), hi = Math.log(2);
  for (let t = 0; t < NT; t++) {
    mass[t] = Math.round(Math.exp(lo + Math.random() * (hi - lo)) * 20) / 20;
  }
}

// Rendering defaults live here too, so one Reset restores the whole panel.
export const DEFAULT_COUNT = 3000;
export const DEFAULT_VIEW = { radius: 2.6, fade: 0.55 };

export function createState() {
  const state = {
    count: DEFAULT_COUNT,
    params: { ...DEFAULT_PARAMS },
    attract: new Float32Array(NT * NT),
    repel: new Float32Array(NT * NT),
    mass: new Float32Array(NT).fill(1),
    preset: 0, // index into PRESETS, or null once hand-edited
  };
  applyPreset(state, PRESETS[0]);
  return state;
}
