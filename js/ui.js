// Control panel construction. Everything writes straight into the live
// simulation/render state — no re-render, no framework, no allocation churn.

import { TYPES, MAX_TYPES, MAX_PARTICLES } from './state.js';
import { PRESETS } from './presets.js';
import { Sparkline } from './spark.js';

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
  // Option values: 'custom', a built-in index, or 'saved:<id>'.
  const select = document.getElementById('preset');
  const note = document.getElementById('presetNote');
  const btnSave = document.getElementById('btnSavePreset');
  const btnDelete = document.getElementById('btnDeletePreset');
  const saveForm = document.getElementById('saveForm');
  const nameInput = document.getElementById('presetName');

  let saved = loadUserPresets();

  const rebuildOptions = () => {
    const keep = select.value;
    select.replaceChildren();
    const custom = document.createElement('option');
    custom.value = 'custom';
    custom.textContent = 'Custom';
    select.append(custom);

    const builtIn = document.createElement('optgroup');
    builtIn.label = 'Built in';
    PRESETS.forEach((preset, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = preset.name;
      builtIn.append(o);
    });
    select.append(builtIn);

    if (saved.length) {
      const group = document.createElement('optgroup');
      group.label = 'Saved';
      for (const preset of saved) {
        const o = document.createElement('option');
        o.value = `saved:${preset.id}`;
        o.textContent = preset.name;
        group.append(o);
      }
      select.append(group);
    }
    // Only restore the previous selection if that option still exists.
    select.value = keep;
    if (!select.value) select.value = 'custom';
  };

  const presetFor = (key) => {
    if (key == null || key === 'custom') return null;
    if (typeof key === 'string' && key.startsWith('saved:')) {
      const id = key.slice(6);
      const found = saved.find((s) => String(s.id) === id);
      return found ? inflate(found) : null;
    }
    return PRESETS[+key] || null;
  };

  const showPreset = (key) => {
    const preset = presetFor(key);
    if (!preset) {
      select.value = 'custom';
      note.textContent = '';
    } else {
      select.value = String(key);
      note.textContent = preset.note || '';
    }
    btnDelete.hidden = !(typeof select.value === 'string' && select.value.startsWith('saved:'));
  };

  // Any hand edit means the forces no longer match the named preset.
  const markCustom = () => {
    select.value = 'custom';
    note.textContent = '';
    btnDelete.hidden = true;
  };

  rebuildOptions();

  select.addEventListener('change', () => {
    const key = select.value;
    const preset = presetFor(key);
    if (!preset) return markCustom();
    note.textContent = preset.note || '';
    btnDelete.hidden = !key.startsWith('saved:');
    onPreset(preset, key);
  });

  const closeForm = () => {
    saveForm.hidden = true;
    nameInput.value = '';
  };
  btnSave.addEventListener('click', () => {
    saveForm.hidden = !saveForm.hidden;
    if (!saveForm.hidden) {
      nameInput.value = `Configuration ${saved.length + 1}`;
      nameInput.focus();
      nameInput.select();
    }
  });
  document.getElementById('btnSaveCancel').addEventListener('click', closeForm);

  const commitSave = () => {
    const name = nameInput.value.trim().slice(0, 40) || `Configuration ${saved.length + 1}`;
    const entry = {
      id: Date.now().toString(36),
      name,
      types: state.types,
      // Snapshot the whole matrix, not just the active block, so reloading it
      // at a higher colour count still finds live values.
      attract: Array.from(state.attract),
      repel: Array.from(state.repel),
      mass: Array.from(state.mass),
    };
    saved.push(entry);
    storeUserPresets(saved);
    rebuildOptions();
    select.value = `saved:${entry.id}`;
    note.textContent = `${entry.types} colours, saved just now`;
    btnDelete.hidden = false;
    state.preset = `saved:${entry.id}`;
    closeForm();
    onChange();
  };
  document.getElementById('btnSaveConfirm').addEventListener('click', commitSave);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitSave(); }
    if (e.key === 'Escape') { e.preventDefault(); closeForm(); }
  });

  btnDelete.addEventListener('click', () => {
    const key = select.value;
    if (!key.startsWith('saved:')) return;
    const id = key.slice(6);
    saved = saved.filter((s) => String(s.id) !== id);
    storeUserPresets(saved);
    rebuildOptions();
    markCustom();
    state.preset = null;
    onChange();
  });

  // ---------------- signal graphs ----------------
  const signals = document.getElementById('signals');
  const sparks = {
    clumpiness: new Sparkline({
      label: 'Clumpiness',
      color: '#3ef07a',
      // 1.0 is a purely random scatter; the dashed line marks it, so anything
      // riding on the line means no structure has formed.
      baseline: 1,
      format: (v) => v.toFixed(2) + '×',
    }),
    segregation: new Sparkline({
      label: 'Segregation',
      color: '#ffd83d',
      fixedMax: 1,
      format: (v) => v.toFixed(2),
    }),
    neighbours: new Sparkline({
      label: 'Neighbours',
      color: '#7f9cff',
      format: (v) => v.toFixed(0),
    }),
    speed: new Sparkline({
      label: 'Mean speed',
      color: '#ff8fa3',
      format: (v) => v.toFixed(2),
    }),
  };
  for (const s of Object.values(sparks)) signals.append(s.el);
  const resizeSparks = () => { for (const s of Object.values(sparks)) s.resize(); };
  resizeSparks();
  new ResizeObserver(resizeSparks).observe(signals);

  const pushSignals = (sample) => {
    for (const key of Object.keys(sparks)) sparks[key].push(sample[key]);
  };
  const clearSignals = () => {
    for (const s of Object.values(sparks)) s.clear();
  };
  document.getElementById('btnClearSignals').addEventListener('click', clearSignals);

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
  const colourSlider = slider({
    label: 'Colours', min: 1, max: MAX_TYPES, step: 1,
    get: () => state.types,
    set: (v) => {
      state.types = v | 0;
      syncTypes();
      // The colour count is part of the configuration, so changing it means
      // the forces no longer match the named preset.
      markCustom();
      state.preset = null;
      onChange();
    },
  });
  document.getElementById('colourRow').append(colourSlider);
  refresh.push(colourSlider.refresh);

  const matrix = document.getElementById('matrix');
  const colHeads = [], rowHeads = [], cells = [], massRows = [];
  matrix.append(document.createElement('div')); // corner
  for (const t of TYPES) {
    const h = document.createElement('div');
    h.className = 'colhead';
    h.title = t.name;
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.background = t.hex;
    h.append(dot);
    colHeads.push(h);
    matrix.append(h);
  }

  for (let a = 0; a < MAX_TYPES; a++) {
    const rh = document.createElement('div');
    rh.title = TYPES[a].name;
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.background = TYPES[a].hex;
    rh.append(dot);
    rowHeads.push(rh);
    matrix.append(rh);
    const cellRow = [];
    cells.push(cellRow);

    for (let b = 0; b < MAX_TYPES; b++) {
      const idx = a * MAX_TYPES + b;
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
      cellRow.push(cell);
      matrix.append(cell);
    }
  }

  // Colours beyond the active count keep their matrix entries but have no
  // particles, so their rows and columns are hidden rather than destroyed —
  // turning the count back up restores exactly what was there.
  function syncTypes() {
    const n = state.types;
    matrix.style.setProperty('--cols', n);
    for (let b = 0; b < MAX_TYPES; b++) colHeads[b].hidden = b >= n;
    for (let a = 0; a < MAX_TYPES; a++) {
      rowHeads[a].hidden = a >= n;
      for (let b = 0; b < MAX_TYPES; b++) cells[a][b].hidden = a >= n || b >= n;
      if (massRows[a]) massRows[a].hidden = a >= n;
    }
  }

  // ---------------- masses ----------------
  const masses = document.getElementById('masses');
  for (let t = 0; t < MAX_TYPES; t++) {
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
    massRows.push(row);
    masses.append(row);
  }

  syncTypes();

  return {
    refreshAll: () => { refresh.forEach((f) => f()); syncTypes(); },
    showPreset,
    markCustom,
    pushSignals,
    clearSignals,
  };
}

export function saveSettings(state, view) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      count: state.count,
      types: state.types,
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
    if (Number.isFinite(s.types)) state.types = Math.min(MAX_TYPES, Math.max(1, s.types | 0));
    if (s.params) Object.assign(state.params, s.params);
    // Settings saved before the palette grew hold a smaller matrix; copy what
    // fits and leave the freshly seeded remainder alone.
    copyBlock(s.attract, state.attract);
    copyBlock(s.repel, state.repel);
    if (Array.isArray(s.mass)) s.mass.slice(0, MAX_TYPES).forEach((v, i) => { state.mass[i] = v; });
    if (s.view) {
      if (Number.isFinite(s.view.radius)) view.radius = s.view.radius;
      if (Number.isFinite(s.view.fade)) view.fade = s.view.fade;
    }
    state.preset = (Number.isInteger(s.preset) || typeof s.preset === 'string') ? s.preset : null;
    return true;
  } catch {
    return false;
  }
}


// A square matrix saved at one size, copied into the top-left of another.
function copyBlock(src, dst) {
  if (!Array.isArray(src)) return;
  const from = Math.round(Math.sqrt(src.length));
  if (from * from !== src.length || from > MAX_TYPES) return;
  for (let a = 0; a < from; a++) {
    for (let b = 0; b < from; b++) dst[a * MAX_TYPES + b] = src[a * from + b];
  }
}

const USER_KEY = 'life.presets.v1';

function loadUserPresets() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(validUserPreset) : [];
  } catch {
    return [];
  }
}

function storeUserPresets(list) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(list));
  } catch { /* quota or private mode — the in-memory list still works */ }
}

function validUserPreset(p) {
  return p && typeof p.name === 'string'
    && Array.isArray(p.attract) && p.attract.length === MAX_TYPES * MAX_TYPES
    && Array.isArray(p.repel) && p.repel.length === MAX_TYPES * MAX_TYPES
    && Array.isArray(p.mass) && p.mass.length === MAX_TYPES;
}

// Saved presets are stored as plain arrays; applyPreset wants typed ones.
function inflate(p) {
  return {
    name: p.name,
    note: `Saved configuration · ${p.types} colours`,
    types: p.types || MAX_TYPES,
    attract: Float32Array.from(p.attract),
    repel: Float32Array.from(p.repel),
    mass: Float32Array.from(p.mass),
  };
}
