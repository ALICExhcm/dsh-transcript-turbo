// dsh-transcript-turbo — client module.
//
// v0.5.1: removed the opt-in whale-rainbow rule and switch at the owner's
// request — the widget's look stays exactly as its own plugin ships it.
//
// v0.5.0: every rule group is a live preference, editable from Plugin
// Manager (the bundle page and the row's Configure control both render the
// same form; toggles write through the revisioned volatile-config channel
// and re-render the stylesheet in place, no restart). Defaults match v0.4.0
// behavior, and the full-default CSS is injected before the config mirror
// answers, so a slow or missing settings service can only ever delay
// personalization, never the acceleration.
//
// v0.4.0 notes retained: the v0.3.x far-offscreen hibernation (freeze
// blocks past a 5000px margin into height-preserving display:none shells)
// was REMOVED after a clean live A/B showed it does not reduce the one cost
// it targeted: the per-frame paint-lifecycle walk, which scales with
// mounted DOM but is identical with 245 blocks hibernated vs all-live
// (RunPaintLifecyclePhase 1,490 vs 1,553 ms per 6 s at 155 fps — noise),
// and idle busy 48% vs 47%. content-visibility already provides what
// display:none duplicates here, and the walk itself is immune to both.
// Full data: docs/performance-notes.md §9.
//
// v0.2.0 notes retained: one-shot self-check at 3 s (retry at 12 s) turning
// selector rot after app upgrades into a visible console line plus a
// window.__dshTranscriptTurbo probe.
//
// Rules validated live against dsh-desktop 0.2.2-rc.5 (Electron 44 /
// Chromium 152). Class-name hashes are unstable across builds, so every
// selector uses stable fragments: "scrollBody", "_flowItem", "_spinnerArc_",
// "_sweep_", and the BE0jCW tool-row prefix (the only hash-dependent
// fragment; if it dies only the 64px tool-row rule is lost).
window.__ModuleLoader__.load({
  id: 'dsh-transcript-turbo',
  factory(require) {
    const VERSION = '0.5.1';
    const NS = 'dsh-transcript-turbo';          // locale namespace
    const ROW_NS = 'transcript-turbo';           // settings/config form namespace (row id)
    const PKG = 'dsh-transcript-turbo';          // bundle package name
    const SLOT_BUNDLE_KEY = PKG;                 // plugins.bundle.config is keyed by package name
    const SLOT_ROW_KEY = PKG + '#' + ROW_NS;     // plugins.row.config is keyed by <package>#<row id>
    const FIELDS = ['containment', 'spinnerQuiet', 'shimmerFreeze'];
    const DEFAULTS = { containment: true, spinnerQuiet: true, shimmerFreeze: true };

    // ---- CSS rule groups (see docs/performance-notes.md for measurements) ----
    /* A. Long-transcript containment: offscreen message blocks and tool rows
       skip style / layout / paint entirely. First-open cost and every
       document-wide style recalc then scale with the visible viewport
       instead of transcript length. contain-intrinsic-size:auto remembers
       each block's real height once rendered, so the scrollbar estimate
       converges as you scroll. */
    const CSS_A = 'div[class*="scrollBody"] div[class*="_flowItem"]{content-visibility:auto;contain-intrinsic-size:auto 240px}\n'
      + 'div[class*="scrollBody"] div[class*="_root_"][class*="BE0jCW"]{content-visibility:auto;contain-intrinsic-size:auto 64px}';

    /* B. Idle spinner quieting: the app's state-dot spinners animate an SVG
       transform + stroke-dash every frame, which forces ~155 style recalcs
       and layouts per second even while completely idle (measured 26-29% of
       one core without containment, up to 105% on a formula-heavy
       transcript). The sweep/track/motion rules freeze the SVG; the wrapper
       rule swaps in a compositor-only opacity pulse, so the "working..."
       signal stays visible. */
    const CSS_B = '@keyframes dsh-tt-pulse{0%,100%{opacity:1}50%{opacity:.35}}\n'
      + 'svg:has([class*="_spinnerArc_"]) [class*="_spinnerArc_"], svg:has([class*="_spinnerArc_"]) [class*="_spinnerTrack_"], svg:has([class*="_spinnerArc_"]) [class*="_spinnerMotion_"]{animation:none !important}\n'
      + 'svg:has([class*="_spinnerArc_"]){animation:dsh-tt-pulse 1.6s ease-in-out infinite;will-change:opacity}';

    /* C. Running-row shimmer: translate animations on tool rows keep running
       at frame rate even when scrolled offscreen. Freeze them; the row keeps
       its static highlight. */
    const CSS_C = 'span[class*="_sweep_"], span[class*="_highlight_"]{animation:none !important;transform:none !important}';

    // Minimal chrome for the Plugin Manager form (own class prefix).
    const CSS_FORM = '.dsh-tt-form{display:flex;flex-direction:column;gap:14px;max-width:600px;margin:8px 0 4px}\n'
      + '.dsh-tt-formIntro{margin:0;font-size:12.5px;opacity:.75}\n'
      + '.dsh-tt-row{display:flex;flex-direction:column;gap:4px}\n'
      + '.dsh-tt-rowHead{display:flex;align-items:center;justify-content:space-between;gap:16px}\n'
      + '.dsh-tt-rowLabel{font-size:13px;font-weight:500}\n'
      + '.dsh-tt-rowHint{margin:0;font-size:12px;opacity:.65;max-width:480px}';

    function buildCss(p) {
      const parts = [CSS_FORM];
      if (p.containment) parts.push(CSS_A);
      if (p.spinnerQuiet) parts.push(CSS_B);
      if (p.shimmerFreeze) parts.push(CSS_C);
      return parts.join('\n\n');
    }

    // ---- Plugin Manager form strings (registered under NS at apply time) ----
    const FORM_LOCALE = {
      en: {
        summary: 'Render-acceleration toggles: offscreen containment, idle spinner quieting, shimmer freeze. Applies instantly.',
        formDescription: 'Toggles apply instantly (volatile config — no restart needed).',
        containmentLabel: 'Offscreen containment',
        containmentHint: 'Offscreen message blocks skip style/layout/paint (content-visibility). The main win on long transcripts.',
        spinnerQuietLabel: 'Quiet idle spinners',
        spinnerQuietHint: 'Replace the per-frame SVG state-dot animation with a compositor-only opacity pulse. Idle CPU ~26% -> ~1%.',
        shimmerFreezeLabel: 'Freeze running-row shimmer',
        shimmerFreezeHint: 'Stop translate animations on tool rows; they run at frame rate even when offscreen.',
      },
      zh: {
        summary: '渲染加速开关：视口外包含、空闲动画降噪、微光冻结。即时生效。',
        formDescription: '开关即时生效（volatile 配置，无需重启）。',
        containmentLabel: '视口外包含',
        containmentHint: '滚到附近才让消息块参与样式/布局/绘制（content-visibility）。长转录的主要收益来源。',
        spinnerQuietLabel: '空闲状态动画降噪',
        spinnerQuietHint: '把逐帧改写 SVG 的状态点动画换成合成器呼吸闪烁。空闲 CPU 约 26% → 约 1%。',
        shimmerFreezeLabel: '冻结工具行微光',
        shimmerFreezeHint: '停掉工具行的平移动画（滚出视口后仍会以帧率运行）。',
      },
    };

    function prefsFromSnapshot(snap) {
      const value = (snap && snap.value) || {};
      return {
        containment: value.containment !== false,
        spinnerQuiet: value.spinnerQuiet !== false,
        shimmerFreeze: value.shimmerFreeze !== false,
      };
    }

    function selfCheck(style, prefs) {
      const body = document.querySelector('div[class*="scrollBody"]');
      const items = body ? body.querySelectorAll('div[class*="_flowItem"]').length : 0;
      const probe = body ? body.querySelector('div[class*="_flowItem"]') : null;
      const cv = probe ? getComputedStyle(probe).contentVisibility : 'no-transcript';
      const cis = probe ? getComputedStyle(probe).containIntrinsicSize : '';
      const spinnerWrappers = document.querySelectorAll('svg:has([class*="_spinnerArc_"])').length;
      const styleActive = style.isConnected && !style.disabled;
      const ok = styleActive && !!body;
      const status = {
        version: VERSION, checkedAt: new Date().toISOString(),
        transcript: !!body, flowItems: items, contentVisibility: cv,
        containIntrinsicSize: cis, spinnerWrappers, styleActive, prefs,
      };
      try { window.__dshTranscriptTurbo = status; } catch (e) { /* sealed window */ }
      const line = '[dsh-transcript-turbo ' + VERSION + '] ' + (ok ? 'ok —' : 'CHECK FAILED —')
        + ' flowItems:' + items + ' cv:' + cv + ' spinnerWrappers:' + spinnerWrappers;
      if (ok) console.info(line, status);
      else console.warn(line, status);
      return status;
    }

    // The Plugin Manager form: one Switch row per preference, write-through.
    // t comes from the register option "inject: () => ({ t })" (the pattern
    // dshmarket uses); ownerProps.view decides summary vs page.
    function makeFormPage(react, Switch, scope, boundT) {
      return function TurboPage(ownerProps) {
        const props = ownerProps || {};
        const t = (props.injected && typeof props.injected.t === 'function') ? props.injected.t
          : (typeof props.t === 'function' ? props.t : boundT);
        const view = props.view;
        const el = react.createElement.bind(react);
        if (view === 'summary') return t('summary');
        function TurboForm() {
          const [snap, setSnap] = react.useState(() => scope.getSnapshot());
          react.useEffect(() => scope.subscribe(() => setSnap(scope.getSnapshot())), []);
          const prefs = prefsFromSnapshot(snap);
          const busy = snap.status !== 'ready' || !snap.writable;
          const rows = FIELDS.map((f) => el('div', { className: 'dsh-tt-row', key: f },
            el('div', { className: 'dsh-tt-rowHead' },
              el('span', { className: 'dsh-tt-rowLabel' }, t(f + 'Label')),
              el(Switch, {
                checked: prefs[f] === true,
                label: t(f + 'Label'),
                disabled: busy,
                onChange: () => {
                  const next = !(prefs[f] === true);
                  try {
                    const written = scope.set(f, next);
                    if (written && typeof written.then === 'function') {
                      written.then((saved) => { if (!saved) console.warn('[dsh-transcript-turbo] config write not accepted:', f, next); });
                    }
                  } catch (e) { console.warn('[dsh-transcript-turbo] config write error', e); }
                },
              })),
            el('p', { className: 'dsh-tt-rowHint' }, t(f + 'Hint'))));
          return el('div', { className: 'dsh-tt-form' },
            el('p', { className: 'dsh-tt-formIntro' }, t('formDescription')),
            rows);
        }
        return el(TurboForm);
      };
    }

    return {
      // Required services: slots (Plugin Manager registration), locale (form
      // copy), configForms (revisioned mirror of this bundle's config).
      // Without these declared the loader runs apply before the services
      // exist and the form never registers (the v0.5.0-beta lesson).
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        const effect = ctx && typeof ctx.effect === 'function' ? ctx.effect : (fn) => fn();
        return effect(() => {
          const cleanups = [];

          // Locale dictionaries for the form.
          let boundT = (key) => key;
          try {
            if (ctx && ctx.locale && typeof ctx.locale.register === 'function') {
              if (typeof ctx.locale.bind === 'function') boundT = ctx.locale.bind(NS);
              const offLocale = ctx.effect(() => ctx.locale.register(NS, FORM_LOCALE), 'dsh-transcript-turbo: locale');
              cleanups.push(() => { try { offLocale(); } catch (e) {} });
            }
          } catch (e) { /* locale optional */ }

          // Stylesheet: full defaults immediately, personalized when the
          // config mirror answers. A missing settings service degrades to
          // v0.4.0 behavior (everything on).
          const style = document.createElement('style');
          style.id = 'dsh-transcript-turbo-style';
          style.textContent = buildCss(DEFAULTS);
          document.head.appendChild(style);

          let offMirror = null;
          let scope = null;
          try {
            if (ctx && ctx.configForms && typeof ctx.configForms.get === 'function') {
              scope = ctx.configForms.get(ROW_NS);
              const sync = () => {
                const snap = scope.getSnapshot();
                if (snap.status !== 'ready') return;
                const prefs = prefsFromSnapshot(snap);
                style.textContent = buildCss(prefs);
                try { if (window.__dshTranscriptTurbo) window.__dshTranscriptTurbo.prefs = prefs; } catch (e) {}
              };
              offMirror = scope.subscribe(sync);
              sync();
            }
          } catch (e) { console.warn('[dsh-transcript-turbo] config mirror unavailable', e); }

          // Plugin Manager registration. Two slots, both fed by the same form:
          //   plugins.bundle.config — keyed by package name, rendered on the
          //                            bundle's own detail page;
          //   plugins.row.config   — keyed <package>#<row id>, gives the row
          //                            a Configure control on the row page.
          try {
            if (ctx && ctx.slots && typeof ctx.slots.inject === 'function') {
              let react = null, Switch = null;
              try {
                react = require('react');
                Switch = require('@deepseek-ai/dsh-client-ui-primitives').Switch;
              } catch (e) { react = null; }
              if (react && Switch && scope) {
                const Page = makeFormPage(react, Switch, scope, boundT);
                const registerBundle = () => ctx.slots.register(
                  { name: 'plugins.bundle.config', key: SLOT_BUNDLE_KEY, locale: NS, inject: () => ({ t: boundT }) },
                  Page);
                const registerRow = () => ctx.slots.register(
                  { name: 'plugins.row.config', key: SLOT_ROW_KEY, locale: NS, inject: () => ({ t: boundT }) },
                  Page);
                const offBundle = ctx.effect(() => ctx.slots.inject('plugins.bundle.config', registerBundle), 'dsh-transcript-turbo: bundle config slot');
                const offRow = ctx.effect(() => ctx.slots.inject('plugins.row.config', registerRow), 'dsh-transcript-turbo: row config slot');
                cleanups.push(() => { try { offBundle(); } catch (e) {} }, () => { try { offRow(); } catch (e) {} });
              } else if (!scope) {
                // Config mirror missing: still register nothing — a form with
                // no backing store would show dead switches.
              }
            }
          } catch (e) { console.warn('[dsh-transcript-turbo] plugin manager slots unavailable', e); }

          // One-shot self-check; retry once if the transcript has not mounted yet.
          let timer2 = 0;
          const timer1 = setTimeout(() => {
            try {
              const prefs = (scope && scope.getSnapshot().status === 'ready')
                ? prefsFromSnapshot(scope.getSnapshot()) : DEFAULTS;
              const r = selfCheck(style, prefs);
              if (!r.transcript) timer2 = setTimeout(() => { try { selfCheck(style, prefs); } catch (e) {} }, 9000);
            } catch (e) { console.warn('[dsh-transcript-turbo] self-check error', e); }
          }, 3000);

          return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
            if (offMirror) { try { offMirror(); } catch (e) {} }
            for (const c of cleanups) { try { c(); } catch (e) {} }
            style.remove();
          };
        });
      },
    };
  },
});
