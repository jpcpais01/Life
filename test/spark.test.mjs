// The trend readout beside each graph. Its whole job is to say which way a
// noisy measurement is going, so the cases that matter are the ones where a
// naive first-versus-last difference gets the sign wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meanDelta, DELTA_WINDOW } from '../js/spark.js';

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
