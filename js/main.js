import { createState, randomizeForces } from './state.js';
import { applyPreset } from './presets.js';
import { createHost } from './host.js';
import { Renderer } from './render.js';
import { buildUI, saveSettings, loadSettings } from './ui.js';

const state = createState();
const view = { radius: 2.6, fade: 0.55 };
loadSettings(state, view);

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
  ui.refreshAll();
  host.sync();
  scheduleSave();
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

btnPause.addEventListener('click', () => setPaused(!paused));
for (const b of document.querySelectorAll('.js-randomize')) {
  b.addEventListener('click', randomize);
}
document.getElementById('btnReset').addEventListener('click', () => host.reset());
document.getElementById('btnZero').addEventListener('click', clearMatrix);
document.getElementById('panelToggle').addEventListener('click', () => {
  document.body.classList.toggle('panel-open');
});

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); setPaused(!paused); }
  else if (k === 'r') randomize();
  else if (k === 'c') host.reset();
});

// ---------------- main loop ----------------

const statFps = document.getElementById('statFps');
const statN = document.getElementById('statN');
const statPairs = document.getElementById('statPairs');
const statMs = document.getElementById('statMs');

let frames = 0;
let lastStatAt = performance.now();

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
    renderer.draw(f.data, f.n, view);
    host.endFrame();
    frames++;
  }

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
