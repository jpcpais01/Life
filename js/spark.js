// Small sparkline. A ring buffer over a canvas, redrawn only when a new sample
// lands (~10/s) rather than every animation frame.

// Storage has to cover the widest trend window. Drawing 1000 samples into
// ~290px would be a smear, though, so the trace shows the most recent
// DISPLAY_SPAN and a wide trend may look further back than the picture does.
export const TREND_MIN = 12;
export const TREND_MAX = 1000;
export const TREND_DEFAULT = 12;
const HISTORY = TREND_MAX;
const DISPLAY_SPAN = 200; // ~20 s at the 10 Hz sample rate

// Pure, so the arithmetic is testable without a DOM. `values` holds the last
// `size` samples, oldest first.
//
// The change is the mean of the newest half minus the mean of the older half
// rather than last-minus-first: these measurements are noisy enough that an
// endpoint difference flips sign while the trace is plainly climbing, and one
// wild sample would swing it by the whole spike instead of a fraction of it.
export function meanDelta(values, size = TREND_DEFAULT) {
  if (values.length < size) return null;
  const half = Math.floor(size / 2);
  if (half < 1) return null;
  let recent = 0, prior = 0;
  for (let k = 0; k < half; k++) {
    recent += values[values.length - 1 - k];
    prior += values[values.length - 1 - half - k];
  }
  return (recent - prior) / half;
}

export class Sparkline {
  constructor({ label, color, fixedMax = 0, baseline = 0, format, formatDelta }) {
    this.color = color;
    this.fixedMax = fixedMax;
    this.baseline = baseline;
    this.format = format || ((v) => v.toFixed(2));
    this.formatDelta = formatDelta || ((v) => (v < 0 ? '-' : '+') + Math.abs(v).toFixed(2));

    this.data = new Float32Array(HISTORY);
    this.window = new Float64Array(HISTORY); // scratch for the trend, reused
    this.windowSize = TREND_DEFAULT;
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

  setWindow(n) {
    this.windowSize = Math.min(HISTORY, Math.max(TREND_MIN, n | 0));
    this.showDelta();
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
    this.showDelta();
    this.draw();
  }

  showDelta() {
    const change = this.trend();
    if (change === null) {
      this.delta.textContent = '–';
      this.delta.className = 'delta';
      return;
    }
    this.delta.textContent = this.formatDelta(change);
    // A hair either side of zero is noise, not a trend.
    const flat = Math.abs(change) < 1e-3;
    this.delta.className = 'delta' + (flat ? '' : change > 0 ? ' up' : ' down');
  }

  trend() {
    const size = this.windowSize;
    if (this.filled < size) return null;
    for (let k = 0; k < size; k++) {
      this.window[size - 1 - k] = this.at(this.filled - 1 - k);
    }
    return meanDelta(this.window.subarray(0, size), size);
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

    const shown = Math.min(this.filled, DISPLAY_SPAN);
    const first = this.filled - shown;

    let peak = this.fixedMax;
    if (!peak) {
      peak = 0;
      for (let i = first; i < this.filled; i++) peak = Math.max(peak, this.at(i));
      peak = Math.max(peak, this.baseline * 1.3, 1e-6);
      // Ease toward the new scale so the trace does not jump on every sample.
      this.scale += (peak * 1.15 - this.scale) * 0.25;
    } else {
      this.scale = peak;
    }
    const top = this.scale || 1;
    // Newest sample pinned to the right edge, history trailing off to the left.
    // Scaling x by the number of samples collected instead would stretch the
    // whole trace sideways on every sample while the buffer fills.
    const step = w / (DISPLAY_SPAN - 1);
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

    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(x(first), y(this.at(first)));
      for (let i = first + 1; i < this.filled; i++) ctx.lineTo(x(i), y(this.at(i)));
    };

    // Fill under the trace, then stroke over it.
    trace();
    ctx.save();
    ctx.lineTo(x(this.filled - 1), h);
    ctx.lineTo(x(first), h);
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.restore();

    trace();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = Math.max(1, this.canvas.width / this.canvas.clientWidth);
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}
