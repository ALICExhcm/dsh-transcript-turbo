# Performance notes — dsh-transcript-turbo v0.1.0

All measurements taken live on dsh-desktop 0.2.2-rc.5 (Electron 44.7.0,
Chromium 152.0.7977.130, 2560×1440 @155 Hz, Windows) through the CDP remote
debugging port, on the user's real sessions.

## 1. Baseline diagnosis (why the UI felt sluggish)

- 10 s CPU flame graph: JS self-time ≈0.5%, idle 77.7% → **not** a plugin JS loop.
- Idle main-thread busy 26–29% of one core, with `layoutCount` and `styleRecalc`
  pinned at ~155/s (matching the 155 Hz display).
- LayoutInvalidationTracking attribution over 3 s: 465 `Style changed |
  g._spinnerMotion_` + 161×2 `SVG changed | circle._spinnerArc_/_spinnerTrack_`
  → the state-dot spinners (SVG transform + stroke-dash keyframes,
  `dsh-app://app/assets/index-CSAdOBx6.css`) were driving a full style recalc +
  layout every single frame.
- The transcript had no virtualization and no containment: 27 flowItems +
  11 tool rows all `contain:none`, `content-visibility:visible`.

## 2. A/B validation of the shipped rules

8 s idle samples, same session, `Performance.getMetrics` via CDP:

| injected CSS | busy | layout/s | style/s |
|---|---|---|---|
| none | 29% | 156 | 156 |
| content-visibility only | 27% | 156 | 156 |
| spinner+shimmer quieting only | **1%** | **1.0** | 16.8 |
| both (shipped) | **2%** | 1.1 | 15.5 |

Regression checks with both enabled:

- typing (synthesized keys into the real composer): queue 3.0 ms / paint 5.5 ms
  (baseline 2.1 / 5.0 — unchanged);
- scroll (wheel events on the transcript body): p50 6.5 ms, max 13 ms, zero
  frames >16 ms (baseline max 19.2 ms);
- scroll anchoring stable; scrollHeight estimate 9015 → 5632 px with the 160 px
  intrinsic default (shipped default raised to 240 px to halve the drift).

## 3. What was ruled out

- **Incremental layout was never the bottleneck.** A synthetic benchmark
  (300 blocks × 40 spans = 12,300 nodes in a 360×300 scroll container, one span
  mutated + forced layout read every 60 ms to simulate streaming) showed
  style/layout ≈ 0 ms/s in **both** cv-on and cv-off modes — Blink already scopes
  single-block mutations. The formula-heavy benefit of part A is therefore
  preventive: it bounds document-wide style recalc and first-layout cost, which
  is where a formula-heavy transcript actually hurts.
- **No request storm:** session log flat over 10 s; local service connections
  only in TIME_WAIT decay; host process ≈2%.
- **dsh-cost-meter 1.9.31** is past its documented idle-regression fix
  (issue #284, fixed in 1.8.29); its timers are 10 s/60 s. Not a contributor.

## 4. Known remaining cost (out of scope for this plugin)

- dsh-whale-widget's `dshwvRainbow` (background-position keyframes on gradient
  text) alone keeps style recalc at ~155/s and busy at **~17–27%** of one core
  continuously — up to 3 rainbow rows (name strip + decorations) can run at
  once. Isolated A/B: spinner quieting without a whale rule → busy 17%,
  style 156/s; whale rule only → 28% (spinners still running); everything → 1%.
  It is a visible skin of a third-party plugin; **the user decided on
  2026-11-19 to keep the rainbow untouched**, so this bundle deliberately does
  not override it. Idle busy with the plugin on is therefore ~29% whenever a
  rainbow row is visible (vs ~2% without it). Revisit only if the user asks.

## 5. Live A/B on a real formula-heavy session (2026-11-19)

Target selection: all 51 sessions under `C:\Users\f1362\.dsh\sessions\` were
decompressed (`fzstd` on `session.v4.jsonl.zstd`, payload is a byte-array text)
and ranked by math-delimiter count. Winner: 「数学」 (session-9fff11bb, 张宇
考研数学全程班) — 2,954 math delims + 43 `\begin{}` environments, 281 messages.
Runner-up 「控制」 (412 delims) not needed; same mechanism.

Mounted through the real sidebar, plugin style toggled in place
(`#dsh-transcript-turbo-style.disabled`). The app renders formulas as KaTeX
(1,354 elements at mount, 3,361 after a full scroll; the transcript's real
height is 158,655 px ≈ 126 viewports; more blocks mount lazily during scroll
in both modes).

| metric (math session) | plugin ON | plugin OFF |
|---|---|---|
| mount: LoAF sum / worst frame | **747 ms / 535 ms** | 3,502 ms / 1,415 ms |
| mount: wall-clock to stable | 1.6 s | 4.0 s |
| idle busy (whale visible) | 29% | **105%** |
| idle layout+style/s | 1.0 / 18.3 | 45.8 / 45.8 |
| full sweep 0→bottom: frame p50 | **7 ms** | 31 ms |
| full sweep: frames >16 ms | 18 / 1693 | **261 / 261** |
| full sweep: LoAF sum | 1.12 s | 3.96 s |

Key finding — cost amplification: without containment the spinner animations
recalculate style across the whole un-contained tree every frame, so idle
burn scales with transcript complexity (26% mixed → 105% formula session).
With containment the same animations cost ~1–2%; the residual 29% on the math
session is the whale rainbow (below).

Scroll-reveal caveat: with the plugin ON, revealing a batch of freshly
mounted formula blocks still produced single 100–600 ms frames (deferred
layout at reveal). Net sweep totals remain 3.5× better than OFF.

## 6. Formula mount spike composition + CSS/font loading (2026-11-19, v0.2.0)

Question: after containment, what is the remaining mount spike made of, and
can CSS/font loading be accelerated further?

**CSS/font loading: nothing left to win.** Both app stylesheets
(`vendor-DV2921Zo.css` 250 rules, `index-CSAdOBx6.css` 766 rules) load over
the local `dsh-app://` protocol with `duration: 0 ms` in Resource Timing
(startTime ≈ 48 ms). All 20 KaTeX `@font-face` sources are local woff2 files
under `dsh-app://app/assets/fonts/` and are fetched at startup (startTime
≈ 64 ms) — *before any formula exists* — leaving `document.fonts.status ==
"loaded"`. Formula reveal never waits on a font or a stylesheet; there is no
FOUT window and nothing a plugin could preload.

**Mount spike composition (plugin ON, math session, animations paused for a
clean signal, per-second `Performance.getMetrics` deltas over the mount
window):**

| window (s) | task ms | script ms | layout ms | style ms |
|---|---|---|---|---|
| 15.0 | 443.2 | 36.1 | 341.4 | 45.9 |
| 16.1 | 57.8 | 17.4 | 391.6 | 97.2 |
| 17.2 | 429.8 | 17.2 | 389.5 | 150.1 |
| 18.2 | 61.8 | 1.0 | 119.6 | 12.3 |
| **sum** | **992.6** | **71.7** | **1,242.1** | **305.5** |

Interpretation: KaTeX JS parsing — the usual suspect — is only ~6% of the
remaining spike (72 ms). **First layout of the freshly revealed, visible
formula band dominates (~1.24 s)**: KaTeX subtrees are hundreds of spans deep,
and Chromium must shape and lay out every visible one. Layout of a subtree
cannot be reduced by CSS (containment only isolates it, and these blocks are
already contained); it is app/KaTeX-inherent. What containment *did* remove is
everything offscreen — the plugin cut the total mount LoAF 3,502 → ~750–1,080
ms; the residual is the irreducible visible-band cost.

Ruled out (with reasons): font preloading (fonts already local + prefetched at
boot); nested `content-visibility` on message content inside tall flowItems
(risks mid-message pop-in on scroll; no evidence it pays); `will-change` layer
hints on formula spans (thousands of compositor layers = memory blowup);
`text-rendering:optimizeSpeed` (Chromium largely ignores it; measurable
typography damage).

## 7. DOM accumulation within a session visit (2026-11-20)

The app's mount-on-scroll is **monotone inside one session visit**: blocks mount
as you scroll past them and are never unmounted while you stay. One full sweep
of the math session took live DOM 63k → 211k nodes (KaTeX 1,354 → 4,138);
repeated sweeps within a single earlier visit reached **274,555 nodes /
5,308 KaTeX / 597 flowItems**.

At that scale idle burn was **~99–106% of one core with the plugin either ON
or OFF**, but **~4% with all CSS animations paused**: every animation-driven
frame performs document-wide per-frame bookkeeping whose cost grows with
accumulated DOM (the whale rainbow ≈15% of a core at 27k nodes becomes ~90%
at 274k). Containment bounds style/layout/paint of offscreen blocks but
cannot bound this frame-production walk, so at extreme accumulation the
plugin's idle advantage shrinks to ~7%.

Recovery is structural: **switching sessions unmounts the previous
transcript** — entering another session dropped live DOM from 211k to 11,529
nodes — and a page reload does the same. Post-reload: mount LoAF 0, fresh
full sweep p50 7 ms (13/1637 frames >16 ms), idle busy 2%.

Practical guidance: sluggishness after heavy scrolling in one long session
is expected and cheap to fix — switch away and back (or reload) to restore
fresh-mount performance. Re-entering a long session also re-pays its one-shot
mount cost (this project's own very long session: ~12 s wall-clock mount,
worst LoAF frame 223 ms).

Measurement caveat: two sweep results collected mid-degradation
(`frames:2, endTop:0, p50 3236`) were invalidated by a bench-script bug —
`window.__EVAL_ARG` arrives as a *string*, so `Number('25') || 12000`
produced a 25 ms sweep window. `bench-sweep.js` now clamps the argument as
seconds (2–60) and targets the *visible* scrollBody (largest clientHeight)
instead of the first one in DOM order.

## 8. Methodology notes

- Class-name hashes (`an3WzG_`, `V4vHZW_`, `BE0jCW_`, `1i3xo_`, `1rdzk_`) are
  build artifacts; the shipped selectors use only stable fragments
  (`scrollBody`, `_flowItem`, `_root_`+`BE0jCW`, `_spinnerArc_`, `_sweep_`,
  `_highlight_`). Re-validate after app upgrades: if the app renames these
  fragments the rules silently stop matching (fail-safe: no visual change,
  cost returns to baseline).
- Probe scripts used for measurement live outside this bundle
  (卡顿诊断/ directory) and are not shipped. The session-ranking scanner lives
  in `DSH工作区\.tmp\zstdtool\` (fzstd + scan2.cjs); re-run it after app
  upgrades to re-pick a formula-heavy test target.
- Mount measurement (`ab-mount.js`) clicks the real sidebar row, then polls
  `.katex` count every 150 ms until 6 stable polls, capturing
  `long-animation-frame` entries; sweep measurement (`bench-sweep.js`)
  dispatches `WheelEvent(deltaY:900)` at ~11 Hz on the transcript scroller
  until bottom or timeout, capturing rAF deltas + LoAF.

## 9. Far-offscreen hibernation: built, measured, removed (2026-11-20, v0.3.x → v0.4.0)

**Design.** v0.3.0–v0.3.4 implemented "hibernation": blocks leaving a 5000 px
approach margin were frozen at their current layout height (inline
`height:<px> !important`) with children detached from the render tree via
`.dsh-tt-hib>*{display:none}`. Shells preserved transcript geometry; an
IntersectionObserver restored blocks before the viewport could reach them;
a tail guard kept the last 5 blocks live; a MutationObserver re-bound on
session switches. v0.3.2 dropped a height-recording pass after live testing
showed `offsetHeight`-at-freeze is correct under rule A (cv remembers real
heights; never-rendered blocks report the same 240 px estimate already baked
into scrollHeight). v0.3.3 fixed a read/write interleaving bug — freezing
N blocks one-by-one forces N full layouts; the fix (read all heights, then
write) took a full-transcript teleport sweep from 48 jumps / p50 42 ms /
max 12,997 ms to 230 jumps / p50 6 ms / max 626 ms.

**Why it had to be measured carefully.** Two measurement traps were caught
first: (1) synthetic `dispatchEvent(WheelEvent)` cannot scroll this app at
all (`moved:0` over 40 events) — earlier "sweep" numbers were the app's own
anchor-restore re-mounts, not scrolling; sweeps must drive real `scrollTop`
writes (`bench-real-sweep.js`). (2) The whale skin is an intermittent
frame-producer: any idle A/B must first record `runningAnims`. To isolate
the frame-production variable we built a pixel-calibrated whale replica
(`force-whale.js`: fixed 80×14 gradient bar, `background-position-x 0→200%`
2.9 s linear infinite → 155.3 style recalcs/s, fresh-state busy 14% ≈ the
real whale's 15–27%). Two earlier forcers failed usefully:
`background-color` micro-animation doesn't produce frames (Chromium coalesces
it), and animating the root element's background produces a full-document
style storm that drowns the signal (both arms 102%).

**Decisive A/B** (fully-mounted「数学」: 381 blocks / 170k live nodes / 283
blocks hibernated, children verified `computed display:none` on 245/245
sampled):

| metric (6 s idle, replica producing 155 fps) | hibernation ON | hibernation OFF |
|---|---|---|
| main-thread busy | 48% | 47% |
| `RunPaintLifecyclePhase` | 1,489.8 ms | 1,553.1 ms |
| `WebFrameWidgetImpl::UpdateLifecycle` | 1,694 ms | 1,755 ms |
| remaining trace slices | identical | identical |

**Conclusion.** The per-frame paint-lifecycle walk that scales with mounted
DOM (≈0.9 ms/frame fresh 116 blocks → 1.6 ms/frame at 381 → 3.3–3.5 ms/frame
at 460k nodes) is immune to both `content-visibility:auto` (b15: 99% vs 106%
at 274k) and `display:none` children. An earlier hibernate2-test measurement
(65% → 22%) was re-interpreted: the whale was intermittently present and the
"after" window likely coincided with it being idle — overturned by this
clean A/B. The only real levers on that cost are stopping the animation
(rule B already does this for the app's own spinners; the whale is kept by
user decision) or unmounting (session switch / reload — app behavior,
documented in §7). Hibernation was therefore **removed in v0.4.0**; the
bundle is CSS-only again, and the v0.3.3 two-phase read/write lesson is
retained here for any future experiment that touches layout properties of
many nodes at once.
