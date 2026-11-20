# dsh-transcript-turbo

Render acceleration for long, formula-heavy conversations in the DeepSeek Harness web UI.
Offscreen message blocks stop participating in style recalculation, layout and painting,
and idle loading animations stop repainting every frame. Everything is one injected
stylesheet — no timers, no listeners, no React — and disabling the plugin removes it
completely.

> **中文**：让超长、含大量公式的对话保持流畅。视口外的消息块不再参与样式重算与布局，
> 空闲状态的加载动画不再逐帧重绘。实测空闲主线程 26–105% → 1–2%，打字与滚动无回归。
> 三个开关在「插件 → 转录加速」详情页，改了即时生效。只注入纯 CSS，停用即完全移除，
> 不改动其他插件的外观。

## What it does

1. **Transcript containment.** Message blocks (`_flowItem`) and tool rows (`BE0jCW_root`)
   inside the transcript scroll container get `content-visibility:auto` with a remembered
   intrinsic size. Blocks scrolled away from the viewport stop participating in style
   recalculation, layout, and paint. Cost scales with the visible viewport instead of
   transcript length — the difference grows with message count, long code blocks, and
   dense KaTeX formula sets.
2. **Spinner quieting.** The app's status-dot spinners animate an SVG `transform` and
   `stroke-dash` every frame. On a 155 Hz display that forces ~155 style recalcs + layouts
   per second *while completely idle*. The plugin freezes those animations; the
   "working…" signal stays visible at a fraction of the cost.
3. **Shimmer freezing.** Tool-row shimmer sweeps (`translate` keyframes) keep running at
   frame rate even when scrolled offscreen. They become a static highlight.
4. **Self-check.** Three seconds after load the module verifies its own rules actually
   matched (`cv:auto` on a real flow item) and reports one console line — `info` when
   healthy, `warn` when an app update has renamed the classes the selectors rely on.
   The same status object is kept on `window.__dshTranscriptTurbo` for inspection.
5. **Configuration switches.** The bundle's detail page in Plugin Manager carries three
   switches — transcript containment, spinner quieting, shimmer freezing
   (`containment` / `spinnerQuiet` / `shimmerFreeze`). Flip one and it applies
   immediately; nothing needs restarting.

## Measured (dsh-desktop 0.2.2-rc.5, Chromium 152, 2560×1440@155 Hz)

A. **Idle, mixed transcript (300+ messages, no formulas):**

| metric (idle) | before | after |
|---|---|---|
| main-thread busy | 26–29% of one core | **1–2%** |
| layout count | 155/s | **~1/s** |
| style recalcs | 155/s | **~19/s** |

No regression: typing queue ~3 ms / paint ~5.5 ms; scroll p50 6.5 ms, no frame > 16 ms.

B. **Live A/B on a real formula-heavy session** (3,361 rendered KaTeX elements,
full-transcript height 158,655 px ≈ 126 viewports, plugin toggled on and off in place):

| metric | plugin ON | plugin OFF |
|---|---|---|
| idle main-thread busy | 29% (one third-party widget's animation, see limits) | **105% (saturates one core)** |
| idle layout / style recalcs | 1 / 18 per s | 45.8 / 45.8 per s |
| mount long-frame sum | **747 ms** | 3,502 ms (worst single frame 1,415 ms) |
| full-scroll frame p50 | **7 ms** | 31 ms — 261/261 frames over 16 ms |
| full-scroll long-frame sum | 1.1 s | 4.0 s |

Compounding effect observed: without containment, the app's own spinner animations
recalculate style over the entire un-contained tree, so their cost scales with transcript
complexity — 26% on the mixed transcript, 105% on the formula one. Containment collapses
both to ~1–2%, on top of whatever other plugins animate. Full methodology in
`docs/performance-notes.md`.

## Honest limits

- **Other plugins' animations are not covered.** A third-party widget in this setup
  animates `background-position` every frame and measured at a constant **~27% of one
  core** whenever its animated row is on screen. This bundle deliberately never touches
  another plugin's visuals, so idle cost stays ~29% instead of ~2% while such an
  animation is visible; every other metric in the tables above is unaffected.
- Chrome forces layout on find-in-page and printing when needed; scrolling materializes
  block sizes progressively, so the scrollbar estimate converges from ~240 px/block to real
  heights. On first open of a 158 k-px session the scrollbar starts at ~18% of its final
  length and grows while you scroll — cosmetic, self-correcting.
- The app mounts older blocks progressively while you scroll regardless of this plugin
  (observed 1,354 → 3,361 KaTeX during a full sweep with the plugin ON and OFF alike);
  first-reveal of a freshly mounted formula batch can still produce a single 100–600 ms
  frame in both modes.
- **Formula/CSS loading is already optimal — measured, not guessed:** both app
  stylesheets and all 20 KaTeX fonts are local `dsh-app://` assets fetched at
  startup (0 ms, fonts loaded at t≈64 ms before any formula exists), so there is nothing
  to preload or accelerate. The residual mount spike is **layout, not KaTeX JS**
  (measured 1,242 ms layout vs 72 ms script across the mount window with the plugin ON) —
  the irreducible cost of first-laying-out visible formula spans, which CSS cannot shrink
  further; containment already removed everything offscreen (mount LoAF 3,502 → ~750 ms).
- **Extreme DOM accumulation outruns any CSS:** the app never unmounts
  blocks you scrolled past *within one session visit*; one heavy visit was measured at
  274,555 live DOM nodes, where animation-driven frame bookkeeping alone burns ~90–100% of
  a core with the plugin ON or OFF (frozen animations: 4%). **Switching sessions unmounts
  the previous transcript** (274k → 11.5k nodes measured) and a reload does the same, so
  the fix for a sluggish long-session browse is to switch away and back — fresh state
  re-measured at idle 2%, scroll p50 7 ms.
- **Far-offscreen hibernation was tried and removed — it doesn't work:** freezing
  far-past blocks into height-preserving `display:none` shells
  (245 of 381 blocks verified hidden) changed idle busy 48% vs 47% against a frame-rate
  forcing animation, and the paint-lifecycle trace was identical (1,490 vs 1,553 ms per
  6 s). The per-frame walk that scales with mounted DOM is immune to both
  `content-visibility` and `display:none`; only stopping animations (the spinner-quieting
  switch does this for the app's own spinners) or unmounting (switch/reload) reduces it. Data:
  `docs/performance-notes.md` §9.

## Install

Point Plugin Manager's Add-plugin at the local directory `dsh-transcript-turbo/`, or
install from GitHub:

```
dsh plugin --profile desktop add github:ALICExhcm/dsh-transcript-turbo
```

Requires dsh `>=0.2.1-rc.5`. After installing, open the bundle's detail page in
Plugin Manager for the three configuration switches — they take effect immediately.
