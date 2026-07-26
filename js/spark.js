// Small sparkline. A ring buffer over a canvas, redrawn only when a new sample
// lands (~10/s) rather than every animation frame.

const HISTORY = 200; // ~20 s at the 10 Hz sample rate

// Trend window, in samples — 12 at 10 Hz is a 1.2 s look-back. The change is
// read as the mean of the newest half minus the mean of the older half rather
// than as first-versus-last: a plain endpoint difference over a noisy signal
// is itself noisy, and would flicker sign on a trace that is clearly climbing.
export const DELTA_WINDOW = 12;
const DELTA_HALF = DELTA_WINDOW / 2;

// Exported and pure so the arithmetic can be tested without a DOM: `window` is
// the last DELTA_WINDOW samples, oldest first.
export function meanDelta(window) {
  if (window.length < DELTA_WINDOW) return null;
  let recent = 0, prior = 0;
  for (let k = 0; k < DELTA_HALF; k++) {
    recent += window[window.length - 1 - k];
    prior += window[window.length - 1 - DELTA_HALF - k];
  }
  return (recent - prior) / DELTA_HALF;
}

export class Sparkline {
  constructor({ label, color, fixedMax = 0, baseline = 0, format, formatDelta }) {
    this.color = color;
    this.fixedMax = fixedMax;
    this.baseline = baseline;
    this.format = format || ((v) => v.toFixed(2));
    this.formatDelta = formatDelta || ((v) => (v < 0 ? '-' : '+') + Math.abs(v).toFixed(2));

    this.data = new Float32Array(HISTORY);
    this.window = new Float64Array(DELTA_WINDOW); // scratch, reused each sample
    this.head = 0;
    this.filled = 0;
    this.scale = fixedMax || 1;

    this.el = document.createElement('div');
    this.el.className = 'spark';

    const top = document.createElement('div');
    top.className = 'top';
    const name = document.createElement('b');
    name.textContent = label;
    this.value = document.createElement('i');
    this.value.style.color = color;
    this.value.textContent = '–';
    this.delta = document.createElement('em');
    this.delta.className = 'delta';
    this.delta.textContent = '–';
    const readout = document.createElement('span');
    readout.className = 'readout';
    readout.append(this.value, this.delta);
    top.append(name, readout);

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.el.append(top, this.canvas);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.draw();
    }
  }

  clear() {
    this.data.fill(0);
    this.head = 0;
    this.filled = 0;
    this.scale = this.fixedMax || 1;
    this.value.textContent = '–';
    this.delta.textContent = '–';
    this.delta.className = 'delta';
    this.draw();
  }

  push(v) {
    if (!Number.isFinite(v)) return;
    this.data[this.head] = v;
    this.head = (this.head + 1) % HISTORY;
    if (this.filled < HISTORY) this.filled++;
    this.value.textContent = this.format(v);

    const change = this.trend();
    if (change === null) {
      this.delta.textContent = '–';
      this.delta.className = 'delta';
    } else {
      this.delta.textContent = this.formatDelta(change);
      // A hair either side of zero is noise, not a trend.
      const flat = Math.abs(change) < 1e-3;
      this.delta.className = 'delta' + (flat ? '' : change > 0 ? ' up' : ' down');
    }
    this.draw();
  }

  // Mean of the newest half of the window minus the mean of the older half,
  // or null until there are enough samples to say anything.
  trend() {
    if (this.filled < DELTA_WINDOW) return null;
    for (let k = 0; k < DELTA_WINDOW; k++) {
      this.window[DELTA_WINDOW - 1 - k] = this.at(this.filled - 1 - k);
    }
    return meanDelta(this.window);
  }

  // Oldest-to-newest index walk over the ring.
  at(i) {
    const start = this.filled < HISTORY ? 0 : this.head;
    return this.data[(start + i) % HISTORY];
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);

    if (this.filled < 2) return;

    let peak = this.fixedMax;
    if (!peak) {
      peak = 0;
      for (let i = 0; i < this.filled; i++) peak = Math.max(peak, this.at(i));
      peak = Math.max(peak, this.baseline * 1.3, 1e-6);
      // Ease toward the new scale so the trace does not jump on every sample.
      this.scale += (peak * 1.15 - this.scale) * 0.25;
    } else {
      this.scale = peak;
    }
    const top = this.scale || 1;
    // Newest sample pinned to the right edge, history trailing off to the left.
    // Scaling x by `filled` instead would stretch the whole trace on every
    // sample while the buffer fills.
    const step = w / (HISTORY - 1);
    const x = (i) => w - (this.filled - 1 - i) * step;
    const y = (v) => h - Math.min(1, Math.max(0, v / top)) * (h - 2) - 1;

    // Reference line — for clumpiness this is 1.0, "same as a random scatter".
    if (this.baseline > 0 && this.baseline < top) {
      ctx.strokeStyle = 'rgba(140,152,180,0.35)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y(this.baseline));
      ctx.lineTo(w, y(this.baseline));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(x(0), y(this.at(0)));
    for (let i = 1; i < this.filled; i++) ctx.lineTo(x(i), y(this.at(i)));

    // Fill under the trace, then stroke over it.
    ctx.save();
    ctx.lineTo(x(this.filled - 1), h);
    ctx.lineTo(x(0), h);
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(x(0), y(this.at(0)));
    for (let i = 1; i < this.filled; i++) ctx.lineTo(x(i), y(this.at(i)));
    ctx.strokeStyle = this.color;
    ctx.lineWidth = Math.max(1, this.canvas.width / this.canvas.clientWidth);
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}
