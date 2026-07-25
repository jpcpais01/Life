// Control panel construction. Everything writes straight into the live
// simulation/render state — no re-render, no framework, no allocation churn.

import { TYPES, NT, MAX_PARTICLES } from './state.js';
import { PRESETS } from './presets.js';

const STORE_KEY = 'life.settings.v1';

function slider({ label, min, max, step, get, set, fmt }) {
  const row = document.createElement('div');
  row.className = 'row';

  const top = document.createElement('div');
  top.className = 'top';
  const name = document.createElement('b');
  name.textContent = label;
  const val = document.createElement('i');
  top.append(name, val);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = get();

  const show = () => { val.textContent = fmt ? fmt(+input.value) : input.value; };
  input.addEventListener('input', () => { set(+input.value); show(); });
  show();

  row.append(top, input);
  row.refresh = () => { input.value = get(); show(); };
  return row;
}

export function buildUI(state, view, onChange, onPreset) {
  const p = state.params;
  const refresh = [];

  // ---------------- presets ----------------
  const select = document.getElementById('preset');
  const note = document.getElementById('presetNote');
  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = 'Custom';
  select.append(custom);
  PRESETS.forEach((preset, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = preset.name;
    select.append(o);
  });
  select.addEventListener('change', () => {
    const index = +select.value;
    const preset = PRESETS[index];
    if (!preset) return;
    note.textContent = preset.note;
    onPreset(preset, index);
  });

  // Any hand edit means the forces no longer match the named preset.
  const markCustom = () => {
    select.value = 'custom';
    note.textContent = '';
  };
  const showPreset = (index) => {
    if (index == null) return markCustom();
    select.value = String(index);
    note.textContent = PRESETS[index].note;
  };

  // ---------------- world / global ----------------
  const globals = document.getElementById('globals');
  const defs = [
    { label: 'Particles', min: 100, max: MAX_PARTICLES, step: 100,
      get: () => state.count, set: (v) => { state.count = v | 0; } },
    { label: 'Force scale', min: 0, max: 800, step: 5,
      get: () => p.force, set: (v) => { p.force = v; } },
    { label: 'Attraction radius', min: 20, max: 260, step: 1,
      get: () => p.cutR, set: (v) => { p.cutR = v; } },
    { label: 'Repulsion core', min: 2, max: 120, step: 1,
      get: () => p.coreR, set: (v) => { p.coreR = v; } },
    { label: 'Damping', min: 0.5, max: 0.999, step: 0.001,
      get: () => p.damping, set: (v) => { p.damping = v; }, fmt: (v) => v.toFixed(3) },
    { label: 'Time step', min: 0.1, max: 2, step: 0.05,
      get: () => p.dt, set: (v) => { p.dt = v; }, fmt: (v) => v.toFixed(2) },
    { label: 'Steps / frame', min: 1, max: 4, step: 1,
      get: () => p.steps, set: (v) => { p.steps = v | 0; } },
    { label: 'Particle size', min: 0.5, max: 8, step: 0.1,
      get: () => view.radius, set: (v) => { view.radius = v; }, fmt: (v) => v.toFixed(1) },
    { label: 'Trails', min: 0, max: 0.98, step: 0.01,
      get: () => 1 - view.fade, set: (v) => { view.fade = 1 - v; }, fmt: (v) => v.toFixed(2) },
  ];
  // The two radii are the variables that decide whether anything interesting
  // happens at all, and only their *ratio* matters — so show it live.
  const ratio = document.createElement('p');
  ratio.className = 'hint ratio';
  const ratioValue = document.createElement('b');
  const ratioTail = document.createElement('span');
  ratio.append('Attraction reaches ', ratioValue, ratioTail);
  const syncRatio = () => {
    const r = p.cutR / p.coreR;
    ratioValue.textContent = `${r.toFixed(1)}×`;
    // Below ~1.5 the equilibrium sits where both forces are already zero, so
    // nothing binds. Above ~4 each particle averages over so many neighbours
    // that the per-pair matrix washes out and the colours stop separating.
    ratioValue.classList.toggle('out', r < 1.5 || r > 4);
    ratioTail.textContent = r < 1.5
      ? ' the repulsion core — too short to bind, expect a structureless gas.'
      : r > 4
        ? ' the repulsion core — so wide the colours blur together.'
        : ' the repulsion core — the 1.5–4× range where structure forms.';
  };
  syncRatio();

  const globalRefresh = [];
  for (const d of defs) {
    const s = slider({ ...d, set: (v) => { d.set(v); syncRatio(); onChange(); } });
    globals.append(s);
    // Changing either radius moves the ratio, so both rows refresh together.
    if (d.label === 'Repulsion core') globals.append(ratio);
    globalRefresh.push(s.refresh);
    refresh.push(s.refresh);
  }
  refresh.push(syncRatio);

  // ---------------- interaction matrix ----------------
  const matrix = document.getElementById('matrix');
  matrix.append(document.createElement('div')); // corner
  for (const t of TYPES) {
    const h = document.createElement('div');
    h.className = 'colhead';
    h.title = t.name;
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.background = t.hex;
    h.append(dot);
    matrix.append(h);
  }

  for (let a = 0; a < NT; a++) {
    const rh = document.createElement('div');
    rh.title = TYPES[a].name;
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.background = TYPES[a].hex;
    rh.append(dot);
    matrix.append(rh);

    for (let b = 0; b < NT; b++) {
      const idx = a * NT + b;
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.title = `${TYPES[a].name} ← ${TYPES[b].name}`;

      const ia = document.createElement('input');
      ia.type = 'range'; ia.className = 'a';
      ia.min = 0; ia.max = 1; ia.step = 0.01;
      const ir = document.createElement('input');
      ir.type = 'range'; ir.className = 'r';
      ir.min = 0; ir.max = 1; ir.step = 0.01;

      const nums = document.createElement('div');
      nums.className = 'nums';
      const va = document.createElement('span'); va.className = 'va';
      const vr = document.createElement('span'); vr.className = 'vr';
      nums.append(va, vr);

      // ".42" rather than "0.42" — the cells are only ~50px wide.
      const compact = (v) => (v >= 1 ? '1' : v.toFixed(2).slice(1));
      const sync = () => {
        ia.value = state.attract[idx];
        ir.value = state.repel[idx];
        va.textContent = compact(state.attract[idx]);
        vr.textContent = compact(state.repel[idx]);
      };
      ia.addEventListener('input', () => { state.attract[idx] = +ia.value; sync(); markCustom(); onChange(); });
      ir.addEventListener('input', () => { state.repel[idx] = +ir.value; sync(); markCustom(); onChange(); });
      sync();
      refresh.push(sync);

      cell.append(ia, ir, nums);
      matrix.append(cell);
    }
  }

  // ---------------- masses ----------------
  const masses = document.getElementById('masses');
  for (let t = 0; t < NT; t++) {
    const row = document.createElement('div');
    row.className = 'massrow';
    row.title = TYPES[t].name;
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.background = TYPES[t].hex;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = 0.1; input.max = 3; input.step = 0.05;
    const val = document.createElement('i');
    const sync = () => {
      input.value = state.mass[t];
      val.textContent = state.mass[t].toFixed(2);
    };
    input.addEventListener('input', () => { state.mass[t] = +input.value; sync(); markCustom(); onChange(); });
    sync();
    refresh.push(sync);
    row.append(dot, input, val);
    masses.append(row);
  }

  return {
    refreshAll: () => refresh.forEach((f) => f()),
    showPreset,
    markCustom,
  };
}

export function saveSettings(state, view) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      count: state.count,
      params: state.params,
      attract: Array.from(state.attract),
      repel: Array.from(state.repel),
      mass: Array.from(state.mass),
      view: { radius: view.radius, fade: view.fade },
      preset: state.preset,
    }));
  } catch { /* storage unavailable — not worth surfacing */ }
}

export function loadSettings(state, view) {
  let raw;
  try { raw = localStorage.getItem(STORE_KEY); } catch { return false; }
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    if (Number.isFinite(s.count)) state.count = Math.min(MAX_PARTICLES, Math.max(0, s.count | 0));
    if (s.params) Object.assign(state.params, s.params);
    if (Array.isArray(s.attract) && s.attract.length === NT * NT) state.attract.set(s.attract);
    if (Array.isArray(s.repel) && s.repel.length === NT * NT) state.repel.set(s.repel);
    if (Array.isArray(s.mass) && s.mass.length === NT) state.mass.set(s.mass);
    if (s.view) {
      if (Number.isFinite(s.view.radius)) view.radius = s.view.radius;
      if (Number.isFinite(s.view.fade)) view.fade = s.view.fade;
    }
    state.preset = Number.isInteger(s.preset) ? s.preset : null;
    return true;
  } catch {
    return false;
  }
}
