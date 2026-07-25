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

Two consequences of the force law shape all of them. Since a pair settles where
`A(1 − d/cutR) = R(1 − d/coreR)`, **repulsion must exceed attraction** for any
pair that meets — otherwise they fall into a single point — and the size of
`R − A` sets how far apart they sit. And **mass cancels out of that equation**,
so a heavy type does not sit further away; it pulls the whole neighbourhood
around harder.

The rest is asymmetry. `A[i][j] ≠ A[j][i]` means i chases j while j flees, and
that is the only thing keeping any of these in motion — Foam sets solid within
seconds if its cross-repulsion is made symmetric.

Editing any force or mass switches the picker to *Custom*; nothing is lost.

## Controls

The left panel edits the live simulation — nothing restarts.

**World** — particle count, global force scale, the two radii, damping, time
step, sub-steps per frame, particle size, and trail persistence.

**Interactions** — the 5 × 5 matrix. Each cell holds two sliders: green for
attraction, red for repulsion. The **row** is the particle that feels the force,
the **column** is the particle exerting it.

**Mass** — per-type mass, which scales how hard that type pushes and pulls
everything else.

`Space` pauses, `R` randomizes all 50 interaction factors and the five masses,
`C` respawns the particles. Settings persist in local storage.

Masses are shuffled log-uniformly around 1, so halving and doubling are equally
likely and a shuffle does not quietly change the overall force level — a flat
0.1–3 draw would average 1.55 and make every shuffle 55% hotter than the
defaults expect.

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
js/ui.js        control panel construction and persistence
js/main.js      wiring and the frame loop
test/           physics tests
tools/bench.mjs step-time benchmark
```
