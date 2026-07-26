# Life

A particle simulation where structure is not programmed in — it falls out of the
forces. Five kinds of particle, each pair wired with an attraction and a
repulsion, and a square world that wraps at every edge. Cells, membranes,
chasing packs and orbiting clusters all appear from nothing but `a = m/d²`.

No build step, no dependencies. Open `index.html` from any static server.

```
npm start        # python3 -m http.server 8000
npm test         # physics checked against a brute-force reference
npm run bench    # step-time at 1k … 20k particles
```

## The model

Every ordered pair of types `(i, j)` has two independent scaling factors in
`0 … 1`: how strongly **i is attracted to j**, and how strongly **i is repelled
by j**. The acceleration particle `i` feels from particle `j` is

```
a = force · mass[j] · ( attract[i][j] · tA(d)  −  repel[i][j] · tR(d) ) / (d² + ε)
```

* the attraction acts out to the **attraction radius**, tapering linearly to zero
* the repulsion acts only inside the **repulsion core**, tapering the same way
* `ε` softens the singularity so a head-on approach stays finite
* mass belongs to the particle *exerting* the force, exactly like gravity — a
  heavy particle pulls harder but is no harder to move

Nothing here is symmetric. Green can chase yellow while yellow flees green, and
that asymmetry is what makes the system interesting rather than a set of
inert blobs. Velocity is damped every step, so the world dissipates energy and
settles into structure instead of boiling.

The world is a torus: leave the right edge and you arrive at the left, and forces
reach across the seam too, so there is no edge for particles to pile against.

## Presets

Ten starting points, each built around one mechanism rather than found by
search:

| | |
|---|---|
| **Cells** | blue cores wrapped in white membranes |
| **Predator chain** | a closed 5-cycle where each colour hunts the next |
| **Crystal** | one shared lattice, split into colour domains |
| **Symbiosis** | two bonded couples and a loner — the one that settles |
| **Nucleus** | a heavy white core in concentric coloured shells |
| **Foam** | immiscible domains circulating past one another |
| **Hunters** | red chases everything, everything flees red |
| **Worms** | green filaments crawling after yellow |
| **Rotors** | bound triples whose chase becomes rotation |
| **Ecosystem** | every mechanism at once, nothing settles |

And five more that use all ten colours. At this size a hand-written 10 x 10
table hides the idea rather than expressing it, so these are generated from a
rule — the rule *is* the design:

| | |
|---|---|
| **Onion** | ten concentric shells around a heavy core |
| **Spectrum** | the palette sorts itself into drifting rainbow bands |
| **Two tribes** | five against five, with a traitor on each side |
| **Food chain** | a ten-rung ladder from prey to apex |
| **Vortex** | bound chase around the palette becomes rotation |

*Onion* gives every colour the same repulsion toward the core but steadily
weaker attraction, which places each one's equilibrium at a different radius.
*Spectrum* makes the interaction depend only on how far apart two colours sit
in the palette, so a one-dimensional ordering embeds itself into two-dimensional
space. *Food chain* is a ladder rather than a loop, so the base has nothing to
hunt and the apex nothing to fear — an asymmetry a closed cycle cannot produce.
*Vortex* pairs attraction along a chain with repulsion across it, which is a
couple rather than a straight pull, so its assemblies turn instead of
travelling.

Two consequences of the force law shape all of them. Since a pair settles where
`A(1 − d/cutR) = R(1 − d/coreR)`, **repulsion must exceed attraction** for any
pair that meets — otherwise they fall into a single point — and the size of
`R − A` sets how far apart they sit. And **mass cancels out of that equation**,
so a heavy type does not sit further away; it pulls the whole neighbourhood
around harder.

The rest is asymmetry. `A[i][j] ≠ A[j][i]` means i chases j while j flees, and
that is the only thing keeping any of these in motion — Foam sets solid within
seconds if its cross-repulsion is made symmetric.

Editing any force, mass or the colour count switches the picker to *Custom*;
nothing is lost. **Save configuration** names the current matrix, masses and
colour count and adds it to the picker under *Saved*, stored in local storage;
selecting one restores all three and *Delete* removes it.

A saved configuration snapshots the entire 10 x 10 matrix, not just the colours
that were active, and restoring it writes all of it back — a built-in only
defines its own block and deliberately leaves the rest alone, but "load what I
saved" has to mean exactly that.

## Controls

The left panel edits the live simulation — nothing restarts.

**World** — particle count, global force scale, the two radii, damping, time
step, sub-steps per frame, particle size, and trail persistence.

Only the *ratio* of the two radii matters, and it is shown live beneath them.
Set the two ranges equal and the settling equation collapses to `d = coreR` —
the one distance where both forces are already zero — so nothing binds and the
world measures as a random scatter. Widen it past ~4x and each particle averages
over hundreds of neighbours, contributions from opposite sides cancel, and the
per-pair matrix washes out into a single pull toward the local centre of mass:
clusters get bigger but the colours stop separating. Measured over random
matrices, segregation falls from 0.68 at 2x to 0.18 at 8x. The 2-3x window is
also, not coincidentally, where molecular dynamics truncates a Lennard-Jones
potential.

**Reset** next
to the heading restores all nine to their defaults; it leaves the interaction
matrix and masses untouched, so you can put the world back without losing the
forces you were exploring.

**Interactions** — how many colours are in play (1 to 10) and the matrix that
couples them. Each cell holds two sliders: green for attraction, red for
repulsion. The **row** is the particle that feels the force, the **column** is
the particle exerting it. At high colour counts the matrix scrolls sideways
rather than shrinking the sliders to nothing.

The matrix is always stored at the full 10 × 10 and indexed with a fixed
stride, so colours above the active count keep their values rather than being
destroyed — turning the count back up restores exactly what was there, and
turning it up past a preset's own size reveals colours that already interact
instead of inert ones. A colour with no particles cannot influence the world,
which is checked by a test that runs two identical worlds differing only in
the entries for unused colours and asserts they stay in lockstep.

The colour count belongs to the configuration rather than the world: presets
and saved configurations carry it, and **Reset** in the World section leaves it
alone.

**Mass** — per-type mass, which scales how hard that type pushes and pulls
everything else.

`Space` pauses, `R` randomizes all 50 interaction factors and the five masses,
`C` respawns the particles. Settings persist in local storage.

Masses are shuffled log-uniformly around 1, so halving and doubling are equally
likely and a shuffle does not quietly change the overall force level — a flat
0.1–3 draw would average 1.55 and make every shuffle 55% hotter than the
defaults expect.

The defaults are picked for the worst case, not the average one. Damping and
time step were checked as a grid against all ten presets plus random matrices:
a finer step (0.70) gives ~12% crisper structure but sets Crystal solid, and a
coarser one (1.00) keeps everything moving but costs Ecosystem a third of its
clustering. 0.85 is the value that takes nothing away from any of them. If you
want the finer integration without the slowdown, set time step to 0.7 and
steps/frame to 2 — same pace, crisper structure, double the CPU.

**Signals** — four live traces of what the world is actually doing, sampled at
10 Hz alongside the physics. Each shows its current value and, beside it, the
change over a trend window you set with a slider — 12 to 1000 samples, or 1.2
to 100 seconds — so you can see whether something is still settling or has
stopped moving.

That change is the mean of the newest half of the window minus the mean of the
older half, rather than a first-versus-last difference, which on a noisy trace
flickers sign even while the trace is plainly climbing. Widening the window
smooths harder: a lone spike shifts a 12-sample reading by a sixth of itself
and a 200-sample reading by a two-hundredth. It does not stretch the picture —
the traces always show the last ~20 seconds — so a wide window reports over
more history than you can see. And note that a wider window naturally reports a
*larger* number, since it measures across a longer span; only its relative
steadiness improves.

The measures are: clustering (with a dashed line at 1.0, the value a
purely random scatter would give), how separated the colours are, interacting
partners per particle, and mean speed. They restart on a respawn, a shuffle or
a preset change, so you can watch a configuration settle from scratch. A sample
costs one pass over the particles against ~100k pair evaluations per step, so
it does not show up in the frame time.

The four readouts at the top are the honest cost of what you have set up: frame
rate, particle count, **interactions per step** (pairs actually within range),
and milliseconds per physics step. Interactions grow with the *square* of the
attraction radius, so that slider costs far more than the particle count does —
if things slow down, shrink the radius before you shrink the crowd.

## How it stays fast

* **Physics runs in a worker.** Frames come back as transferable buffers, so
  there are no copies and a heavy step never freezes the page — the panel stays
  responsive at any particle count. Falls back to the main thread if workers are
  unavailable.
* **Spatial hash grid, rebuilt every step with a counting sort.** Cells are half
  the attraction radius across; a forward-half 5 × 5 stencil visits each pair
  exactly once, which both halves the work and tests ~30% fewer out-of-range
  candidates than radius-sized cells.
* **Particles are physically reordered into grid order** each step, so the inner
  loop walks contiguous memory instead of chasing indices.
* **Flat interleaved typed arrays throughout**, double-buffered and allocated
  once at maximum capacity. Steady state allocates nothing, so the collector
  never interrupts the animation.
* **One sqrt and one divide per interaction.** Mass, time step and force scale
  are folded into the matrices once per step rather than per pair.
* **WebGL2 point sprites**, one buffer upload and one draw call per frame,
  with a canvas2d fallback.

Roughly 4M particle interactions per second per core on a modest machine; a
mid-range laptop handles several thousand particles at 60 fps comfortably.

## Layout

```
index.html      markup and the control panel skeleton
style.css
js/state.js     types, constants, the config object the panel edits
js/presets.js   the ten built-in force/mass combinations
js/sim.js       the simulation — grid, force loop, integration
js/worker.js    worker entry point
js/host.js      worker/main-thread hosting and frame handoff
js/render.js    WebGL2 renderer with canvas2d fallback
js/stats.js     live clustering/segregation measurements
js/spark.js     the sparkline widget
js/ui.js        control panel construction and persistence
js/main.js      wiring and the frame loop
test/           physics tests
tools/bench.mjs step-time benchmark
```
