import { createState, randomizeForces, DEFAULT_PARAMS, DEFAULT_COUNT, DEFAULT_VIEW, WORLD, MAX_PARTICLES } from './state.js';
import { applyPreset, PRESETS } from './presets.js';
import { createHost } from './host.js';
import { Renderer } from './render.js';
import { buildUI, saveSettings, loadSettings } from './ui.js';

const state = createState();
// zoom/cx/cy are the loupe, and deliberately transient — they are not saved,
// so a page reload never comes back mysteriously magnified.
const view = { ...DEFAULT_VIEW, zoom: 1, cx: WORLD / 2, cy: WORLD / 2 };
if (!loadSettings(state, view)) {
  applyPreset(state, PRESETS[0]);
  state.preset = 0;
}

const canvas = document.getElementById('view');
const stage = document.getElementById('stage');
const stagebar = document.getElementById('stagebar');
const renderer = new Renderer(canvas);
const host = createHost(state);
document.getElementById('engine').textContent =
  `renderer: ${renderer.mode === 'webgl' ? 'webgl2' : 'canvas2d'} · physics: ${host.mode === 'worker' ? 'worker thread' : 'main thread'}`;

let saveTimer = 0;
const scheduleSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSettings(state, view), 400);
};

const ui = buildUI(state, view, () => {
  host.sync();
  scheduleSave();
}, (preset, index) => {
  applyPreset(state, preset);
  state.preset = index;
  ui.clearSignals();
  ui.refreshAll();
  host.sync();
  scheduleSave();
}, () => {
  // A natural shuffle writes the whole matrix, so it is a custom configuration
  // like any hand edit — the picker has to say so. Its own note is a separate
  // line and stays put, since that is what says which rule was used.
  state.preset = null;
  ui.markCustom();
  ui.clearSignals();
  ui.refreshAll();
  host.sync();
  saveSettings(state, view);
});
ui.showPreset(state.preset);

// ---------------- layout: the world is always a square ----------------

function layout() {
  // Measured from the stage, never from the canvas — sizing the canvas off a
  // box the canvas can influence would feed back into itself.
  const cs = getComputedStyle(stage);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const gap = parseFloat(cs.rowGap) || 0;
  const w = stage.clientWidth - padX;
  const h = stage.clientHeight - padY - stagebar.offsetHeight - gap;
  const size = Math.max(120, Math.floor(Math.min(w, h)));
  // Cap DPR at 2: beyond that the extra pixels cost more than they show.
  renderer.resize(size, Math.min(window.devicePixelRatio || 1, 2));
}
new ResizeObserver(layout).observe(stage);
layout();

// ---------------- loupe ----------------
//
// Press and hold anywhere on the world for a magnified view of that spot,
// tracking while dragging and released on lift.

const LOUPE_ZOOM = 4;

// The canvas stays a plain map of the world whatever the magnification: screen
// fraction maps straight to world position. Deriving the centre through the
// live transform instead would feed the view back into its own input, and the
// point under the finger would run away from it.
function aimLoupe(e) {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const fx = (e.clientX - r.left) / r.width;
  const fy = (e.clientY - r.top) / r.height;
  view.cx = Math.min(WORLD, Math.max(0, fx * WORLD));
  view.cy = Math.min(WORLD, Math.max(0, fy * WORLD));
  viewMoved = true;
}

function releaseLoupe() {
  if (view.zoom === 1) return;
  view.zoom = 1;
  view.cx = WORLD / 2;
  view.cy = WORLD / 2;
  viewMoved = true;
  renderer.clear();
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  // Capture, so a drag that wanders off the canvas keeps tracking and the
  // release still arrives rather than leaving the view stuck zoomed.
  try { canvas.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
  view.zoom = LOUPE_ZOOM;
  renderer.clear();
  aimLoupe(e);
});
canvas.addEventListener('pointermove', (e) => {
  if (view.zoom > 1) aimLoupe(e);
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(ev, releaseLoupe);
}
// A pointer lost to a background tab or an alert never sends pointerup.
addEventListener('blur', releaseLoupe);

// ---------------- controls ----------------

let paused = false;
const btnPause = document.getElementById('btnPause');
function setPaused(v) {
  paused = v;
  btnPause.textContent = paused ? 'Play' : 'Pause';
  host.setPaused(paused);
}

function randomize() {
  randomizeForces(state.attract, state.repel, state.mass);
  state.preset = null;
  ui.clearSignals();
  ui.markCustom();
  ui.refreshAll();
  host.sync();
  saveSettings(state, view);
}

function clearMatrix() {
  state.attract.fill(0);
  state.repel.fill(0);
  state.preset = null;
  ui.markCustom();
  ui.refreshAll();
  host.sync();
  saveSettings(state, view);
}

// World settings only — the interaction matrix and masses are left alone,
// since presets do not carry world settings either.
function resetWorld() {
  Object.assign(state.params, DEFAULT_PARAMS);
  view.radius = DEFAULT_VIEW.radius;
  view.fade = DEFAULT_VIEW.fade;
  state.count = DEFAULT_COUNT;
  ui.refreshAll();
  host.sync();
  saveSettings(state, view);
}

document.getElementById('btnResetWorld').addEventListener('click', resetWorld);
btnPause.addEventListener('click', () => setPaused(!paused));
for (const b of document.querySelectorAll('.js-randomize')) {
  b.addEventListener('click', randomize);
}
document.getElementById('btnReset').addEventListener('click', () => { host.reset(); ui.clearSignals(); });
document.getElementById('btnZero').addEventListener('click', clearMatrix);
document.getElementById('panelToggle').addEventListener('click', () => {
  document.body.classList.toggle('panel-open');
});

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); setPaused(!paused); }
  else if (k === 'r') randomize();
  else if (k === 'c') { host.reset(); ui.clearSignals(); }
});

// ---------------- main loop ----------------

const statFps = document.getElementById('statFps');
const statN = document.getElementById('statN');
const statPairs = document.getElementById('statPairs');
const statMs = document.getElementById('statMs');

let frames = 0;
let lastStatAt = performance.now();

// A copy of the last frame drawn, so the loupe can redraw from it when no new
// frame is arriving — which is exactly the case while paused, and a frozen
// world is the one you most want to inspect closely. One memcpy per frame,
// tens of microseconds against a step measured in milliseconds.
const lastFrame = new Float32Array(MAX_PARTICLES * 4);
let lastCount = 0;
let viewMoved = false;

function compact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(0) + 'k';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

function frame() {
  requestAnimationFrame(frame);

  const f = host.beginFrame();
  if (f) {
    lastFrame.set(f.data);
    lastCount = f.n;
    renderer.draw(f.data, f.n, view);
    host.endFrame();
    if (f.signals) ui.pushSignals(f.signals);
    frames++;
  } else if (viewMoved && lastCount) {
    renderer.draw(lastFrame.subarray(0, lastCount * 4), lastCount, view);
  }
  viewMoved = false;

  const now = performance.now();
  if (now - lastStatAt >= 500) {
    const s = host.stats;
    statFps.textContent = Math.round((frames * 1000) / (now - lastStatAt));
    statN.textContent = compact(s.n);
    statPairs.textContent = compact(s.pairs);
    statMs.textContent = s.ms.toFixed(1);
    frames = 0;
    lastStatAt = now;
  }
}

requestAnimationFrame(frame);
