// The trend readout beside each graph. Its whole job is to say which way a
// noisy measurement is going, so the cases that matter are the ones where a
// naive first-versus-last difference gets the sign wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meanDelta, TREND_DEFAULT, TREND_MIN, TREND_MAX } from '../js/spark.js';

const DELTA_WINDOW = TREND_DEFAULT;

const ramp = (from, to) =>
  Array.from({ length: DELTA_WINDOW }, (_, i) => from + ((to - from) * i) / (DELTA_WINDOW - 1));

test('says nothing until the window is full', () => {
  for (let n = 0; n < DELTA_WINDOW; n++) {
    assert.equal(meanDelta(new Array(n).fill(1)), null, `should be null at ${n} samples`);
  }
  assert.notEqual(meanDelta(new Array(DELTA_WINDOW).fill(1)), null);
});

test('a flat trace reports no change', () => {
  assert.equal(meanDelta(new Array(DELTA_WINDOW).fill(3.5)), 0);
});

test('sign and size follow the ramp', () => {
  // Over a 12-sample linear ramp the two half-means are 6 samples apart, so
  // the reported change is 6 sample-steps' worth of the ramp.
  const up = meanDelta(ramp(0, 11));       // one unit per sample
  assert.ok(up > 0, 'a rising trace must report a rise');
  assert.equal(Math.round(up * 1e6) / 1e6, 6);

  const down = meanDelta(ramp(11, 0));
  assert.equal(Math.round(down * 1e6) / 1e6, -6);
});

test('a rising trace with noise still reports rising', () => {
  // This is why the halves are averaged: the last sample happens to dip below
  // the first, so a first-versus-last difference would call this a fall.
  const noisy = ramp(0, 11).map((v, i) => v + (i % 2 ? -2.5 : 2.5));
  noisy[noisy.length - 1] = noisy[0] - 0.5;
  assert.ok(noisy[noisy.length - 1] < noisy[0], 'test premise: last sample is below the first');
  assert.ok(meanDelta(noisy) > 0, 'averaged halves should still see the climb');
});

test('a single spike does not flip the trend', () => {
  const flat = new Array(DELTA_WINDOW).fill(2);
  flat[DELTA_WINDOW - 1] = 8; // one wild sample
  const spiked = meanDelta(flat);
  // It moves, but by a sixth of the spike rather than all of it.
  assert.equal(Math.round(spiked * 1e6) / 1e6, 1);
});

test('a wider window smooths harder', () => {
  // A rising ramp, with and without one wild sample near the end. Comparing
  // the raw readings across window sizes would be meaningless — a wider window
  // also measures the ramp over a longer baseline, so its number is naturally
  // bigger. What matters is how much the spike *shifts* each reading.
  const n = 200;
  const clean = Array.from({ length: n }, (_, i) => i * 0.01);
  const spiked = clean.slice();
  spiked[n - 2] += 20;

  const shift = (size) =>
    meanDelta(spiked.slice(-size), size) - meanDelta(clean.slice(-size), size);

  const narrow = shift(TREND_MIN);
  const wide = shift(n);
  assert.ok(narrow > 3, `a 12-sample window should be thrown by the spike, got ${narrow}`);
  assert.ok(wide < 0.25, `a 200-sample window should barely register it, got ${wide}`);
  assert.ok(narrow > wide * 10, 'the wide window should dilute the spike by an order of magnitude');

  // And the underlying climb survives either way.
  assert.ok(meanDelta(clean.slice(-TREND_MIN), TREND_MIN) > 0);
  assert.ok(meanDelta(clean, n) > 0);
});

test('window size is respected and guarded', () => {
  const values = Array.from({ length: 100 }, (_, i) => i);
  // Not enough samples for the requested window.
  assert.equal(meanDelta(values, 200), null);
  // A ramp of one per sample reports half the window size, whatever it is.
  for (const size of [TREND_MIN, 40, 100]) {
    const got = meanDelta(values.slice(-size), size);
    assert.equal(Math.round(got * 1e6) / 1e6, Math.floor(size / 2));
  }
  assert.ok(TREND_MIN === 12 && TREND_MAX === 1000, 'slider bounds');
});
