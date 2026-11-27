// The reader's own sheet: the page stack's slots, the composed page's overlay, its text layer and links, the highlight's bands
// and the translating marks. Scoped to a reader's root (`.axt-reader`, the element openReader is given), not <html>, so that
// two readers on one page each style their own. A mark is read where its writer puts it (docs/PDF-READER.md §4.3): the reader's
// own marks of its root (`data-axt-pdf-mode`, `data-axt-narrow`, `data-axt-swapped`: panes.ts; `data-axt-layer-text`: the
// composer) on the root, the marks it writes inside (`data-axt-scaling` on a stack, `data-axt-turn`, …) under it, and the
// appearance's, which the reader does not write, on the root or on any element above it (DIMMED): the chrome writes it on
// <html> (chrome/appearance.ts) whichever element a host made the root (both hosts: <body>), a host with no chrome may write
// it on the root itself. PDF.js's viewer sheet is linked beside it (kit.ts `sheet`).

import { LAND_FULL, LAND_MS } from './compose/landing.ts'

/** a reader whose pages are dimmed: `data-axt-dim` on its root or on any element above it, as the tokens read `data-theme` */
const DIMMED = ':is(.axt-reader[data-axt-dim], [data-axt-dim] .axt-reader)'
/** the band at half its strength: a hovered or held link's tint, on both panes (link previews' §3.7, L13) */
const HALF = 'color-mix(in oklab, var(--axt-hl-color, var(--axt-green)) calc(var(--axt-hl-mix, 22%) / 2), transparent)'

/** the previews (preview/previews.ts; link previews' §3, the approved prototype's style.css): one surface for the preview, the
 *  kept panel and the sheet (the chrome's tokens where the host's chrome gives them, the prototype's values else); a crop on the
 *  page's own paper, dimmed as the page is; the card's text in the reading ink, its two ends fading by position (--axt-ft, --axt-fb
 *  0 to 1, set by the card's script); two tempos, what follows the pointer quick (120 ms in, 80 out), what comes once the
 *  capsules' (240 in, 160 out); reduced motion, opacity alone; forced colours, the system's Canvas and CanvasText */
const PREVIEW_CSS = `
.axt-reader {
  --axt-pv-surface: var(--surface, color-mix(in oklab, #fff 96%, transparent));
  --axt-pv-blur: var(--surface-blur, blur(16px) saturate(1.5));
  --axt-pv-shadow: var(--shadow, 0 0 0 0.5px oklch(0.235 0.012 255 / 0.11), 0 1px 2px oklch(0 0 0 / 0.05), 0 6px 24px -4px oklch(0 0 0 / 0.1));
  --axt-pv-lift: var(--shadow-lift, 0 0 0 0.5px oklch(0.235 0.012 255 / 0.2), 0 2px 4px oklch(0 0 0 / 0.06), 0 16px 40px -6px oklch(0 0 0 / 0.2));
  --axt-pv-ink: var(--ink, oklch(0.235 0.012 255));
  --axt-pv-ink-2: var(--ink-2, oklch(0.505 0.014 255));
  --axt-pv-ink-3: var(--ink-3, oklch(0.62 0.012 255));
  --axt-pv-read: var(--ink-read, oklch(0.39 0.012 255));
  --axt-pv-fill: var(--fill, oklch(0.935 0.006 255));
  --axt-pv-focus: var(--focus, oklch(0.235 0.012 255));
  --axt-pv-paper: #fff;
  --axt-pv-ease: cubic-bezier(0.2, 0, 0, 1);
  --axt-fade: 20px;
}

.axt-reader .axt-pv-layer { position: fixed; inset: 0; z-index: 30; pointer-events: none; }
.axt-reader .axt-pv-layer > * { pointer-events: auto; }
.axt-reader .axt-pv, .axt-reader .axt-sheet { background: var(--axt-pv-surface); -webkit-backdrop-filter: var(--axt-pv-blur); backdrop-filter: var(--axt-pv-blur); box-shadow: var(--axt-pv-shadow); color: var(--axt-pv-ink); font: 13px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.axt-reader .axt-pv { position: fixed; box-sizing: border-box; border-radius: 12px; animation: axt-pv-in 120ms ease-out; }
.axt-reader .axt-pv[data-axt-quiet] { animation: none; }
.axt-reader .axt-pv[data-axt-out] { animation: axt-pv-out 80ms ease-out forwards; pointer-events: none; }
/* the bridge: the pointer travels from the line into the preview */
.axt-reader .axt-pv::before { content: ""; position: absolute; inset-inline: 0; height: 10px; }
.axt-reader .axt-pv[data-axt-at="below"]::before { top: -10px; }
.axt-reader .axt-pv[data-axt-at="above"]::before { bottom: -10px; }
@keyframes axt-pv-in { from { opacity: 0; translate: 0 4px; } }
@keyframes axt-pv-out { to { opacity: 0; } }
/* the citation's card (the compact one the owner chose): 416 px, never wider than the pane less 24 px; its text the abstract's type, seven lines in view */
.axt-reader .axt-pv[data-axt-kind="card"] { width: min(416px, calc(100vw - 24px)); padding: 11px 14px 12px; cursor: auto; }
.axt-reader .axt-pv-head[hidden] { display: none; }
.axt-reader .axt-pv-textf { border-radius: 4px; }
.axt-reader .axt-pv-textf[data-axt-ring] { outline: 2px solid var(--axt-pv-focus); outline-offset: 3px; }
.axt-reader .axt-pv-text { --axt-ft: 0; --axt-fb: 0; max-height: calc(7 * 1.5 * 12.5px); overflow-y: auto; overscroll-behavior: contain; outline: none; scrollbar-width: thin;
  -webkit-mask-image: linear-gradient(to bottom, rgb(0 0 0 / calc(1 - var(--axt-ft))), #000 var(--axt-fade), #000 calc(100% - var(--axt-fade)), rgb(0 0 0 / calc(1 - var(--axt-fb))));
  mask-image: linear-gradient(to bottom, rgb(0 0 0 / calc(1 - var(--axt-ft))), #000 var(--axt-fade), #000 calc(100% - var(--axt-fade)), rgb(0 0 0 / calc(1 - var(--axt-fb)))); }
.axt-reader .axt-pv-ref { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--axt-pv-read); text-wrap: pretty; hyphens: none; -webkit-user-select: text; user-select: text; cursor: text; }
.axt-reader .axt-pv-search { display: inline-block; margin-top: 7px; font-size: 12px; line-height: 1.35; color: var(--axt-pv-ink-2); text-decoration: none; cursor: pointer; }
.axt-reader .axt-pv-ne { display: inline-block; width: 0.5em; height: 0.5em; margin-inline-start: 0.28em; vertical-align: 0.02em; overflow: visible; fill: none; stroke: var(--axt-pv-ink-3); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
@media (hover: hover) { .axt-reader .axt-pv-search:hover { text-decoration: underline; text-decoration-thickness: from-font; text-underline-offset: 0.16em; text-decoration-color: color-mix(in oklab, currentColor 45%, transparent); } }
/* a crop: the page's own cut, on the page's own paper, dimmed as the page is; a click keeps it */
.axt-reader .axt-pv[data-axt-kind="crop"] { background: var(--axt-pv-paper); -webkit-backdrop-filter: none; backdrop-filter: none; }
.axt-reader .axt-pv-keep { display: block; margin: 0; padding: 10px; border: 0; border-radius: inherit; background: none; font: inherit; color: inherit; cursor: pointer; }
.axt-reader .axt-pv-keep:focus-visible { outline: 2px solid var(--axt-pv-focus); outline-offset: -2px; }
.axt-reader .axt-pv-crop { display: flex; flex-direction: column; background: #fff; }
.axt-reader .axt-pv-seg { position: relative; display: block; overflow: hidden; flex: none; }
.axt-reader .axt-pv-seg > canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.axt-reader .axt-pv-crop[data-axt-fade] { -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - var(--axt-fade)), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - var(--axt-fade)), transparent); }
${DIMMED} .axt-pv-crop { filter: invert(88.8%) hue-rotate(180deg); }
${DIMMED} .axt-pv[data-axt-kind="crop"], ${DIMMED} .axt-pv-paper { background: rgb(29 29 29); }
/* a right page's drawing copied (composer.ts region): its page view's pixels, its crops darkened in, its translation's SVG */
.axt-reader .axt-pv-region { position: relative; overflow: hidden; background: #fff; }
.axt-reader .axt-pv-region > canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.axt-reader .axt-pv-region > canvas.axt-pv-crops { mix-blend-mode: darken; }
.axt-reader .axt-pv-region > svg { position: absolute; overflow: visible; font-synthesis: none; text-rendering: geometricPrecision; pointer-events: none; }
.axt-reader .axt-pv-region > svg text { white-space: pre; fill: #000; }
/* kept: the same cut on the same surface, felt once by a settle from lifted; moved by a drag (grab, grabbing) or the arrows */
.axt-reader .axt-pv.axt-pv-kept { padding: 10px; cursor: grab; touch-action: none; -webkit-user-select: none; user-select: none; outline: none; animation: axt-pv-settle 240ms var(--axt-pv-ease); transition: box-shadow 160ms ease-out; }
.axt-reader .axt-pv.axt-pv-kept[data-axt-drag] { cursor: grabbing; box-shadow: var(--axt-pv-lift); transition-duration: 120ms; }
.axt-reader .axt-pv.axt-pv-kept[data-axt-out] { animation: axt-pv-out 160ms ease-out forwards; }
.axt-reader .axt-pv.axt-pv-kept:focus-visible { outline: 2px solid var(--axt-pv-focus); outline-offset: 2px; }
.axt-reader .axt-pv.axt-pv-kept::before { content: none; }
@keyframes axt-pv-settle { from { box-shadow: var(--axt-pv-lift); } }
/* its one control: round, on the surface, shown on hover and on the keyboard's focus (never on the focus a drag leaves) */
.axt-reader .axt-pv-x { position: absolute; top: 6px; inset-inline-end: 6px; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin: 0; padding: 0; border: 0; border-radius: 999px; background: var(--axt-pv-surface); box-shadow: var(--axt-pv-shadow); color: var(--axt-pv-ink-2); opacity: 0; transition: opacity 120ms ease-out, color 120ms ease-out; cursor: pointer; }
.axt-reader .axt-pv-x::before { content: ""; position: absolute; inset: -8px; }
.axt-reader .axt-pv-x svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; }
.axt-reader .axt-pv-kept:hover .axt-pv-x, .axt-reader .axt-pv-kept:focus-visible .axt-pv-x, .axt-reader .axt-pv-x:focus-visible { opacity: 1; }
@media (hover: hover) { .axt-reader .axt-pv-x:hover { color: var(--axt-pv-ink); } }
/* narrow, or no hover: the sheet from the bottom, a native modal dialog over an 8 % dim (30 % dark) */
.axt-reader .axt-sheet { position: fixed; inset: auto 0 0 0; box-sizing: border-box; width: 100%; max-width: none; max-height: 80%; margin: 0; display: flex; flex-direction: column; border: 0; border-radius: 28px 28px 0 0; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); animation: axt-sheet-in 240ms var(--axt-pv-ease); }
.axt-reader .axt-sheet:not([open]) { display: none; }
.axt-reader .axt-sheet[data-axt-out] { animation: axt-sheet-out 160ms ease-out forwards; }
.axt-reader .axt-sheet::backdrop { background: oklch(0 0 0 / 0.08); animation: axt-fade-in 240ms var(--axt-pv-ease); }
${DIMMED} .axt-sheet::backdrop, :root[data-theme="dark"] .axt-reader .axt-sheet::backdrop { background: oklch(0 0 0 / 0.3); }
.axt-reader .axt-sheet-body { display: flex; flex-direction: column; min-height: 0; overflow: auto; }
.axt-reader .axt-sheet .axt-pv-card { display: flex; flex-direction: column; min-height: 0; padding: 4px 4px 0; }
.axt-reader .axt-sheet .axt-pv-textf { display: flex; flex-direction: column; min-height: 0; }
.axt-reader .axt-sheet .axt-pv-text { max-height: none; min-height: 0; }
.axt-reader .axt-sheet .axt-pv-card > :not(.axt-pv-textf) { flex: none; }
.axt-reader .axt-pv-paper { display: flex; justify-content: center; background: #fff; border-radius: 12px; padding: 12px; }
.axt-reader .axt-sheet-acts { display: flex; gap: 8px; margin-top: 16px; flex: none; }
.axt-reader .axt-sheet-go { flex: 1; height: 46px; margin: 0; border: 0; border-radius: 12px; background: var(--axt-pv-fill); color: var(--axt-pv-ink); font: 500 15px/1 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; transition: scale 150ms ease-out; cursor: pointer; }
.axt-reader .axt-sheet-go[data-axt-primary] { background: var(--axt-pv-ink); color: var(--raised, #fff); }
.axt-reader .axt-sheet-go:active { scale: 0.96; }
.axt-reader .axt-sheet-go:focus-visible { outline: 2px solid var(--axt-pv-focus); outline-offset: 2px; }
@keyframes axt-sheet-in { from { translate: 0 100%; } }
@keyframes axt-sheet-out { to { translate: 0 100%; } }
@keyframes axt-fade-in { from { opacity: 0; } }
/* links' hit areas on a narrow screen widened (7 px above and below, 3 px at the sides) [start: checked against 24 px] */
.axt-reader[data-axt-narrow] .axt-link > .axt-link-box::before { content: ""; position: absolute; inset: -7px -3px; }
@media (prefers-reduced-motion: reduce) {
  @keyframes axt-pv-in { from { opacity: 0; } }
  @keyframes axt-sheet-in { from { opacity: 0; } }
  @keyframes axt-sheet-out { to { opacity: 0; } }
  .axt-reader .axt-sheet-go:active { scale: 1; }
}
@media (forced-colors: active) {
  .axt-reader .axt-pv, .axt-reader .axt-sheet { background: Canvas; color: CanvasText; border: 1px solid CanvasText; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
  .axt-reader .axt-pv-x, .axt-reader .axt-pv-ne { color: CanvasText; stroke: CanvasText; }
  .axt-reader .axt-pv-text { -webkit-mask-image: none; mask-image: none; }
}
`

export const READER_CSS = `
.axt-reader { --axt-green: oklch(0.693 0.17 162.48); --axt-sk: oklch(0.945 0.004 255); --axt-sk-paper: #fff; }
${DIMMED} { --axt-sk: oklch(0.275 0.004 255); --axt-sk-paper: rgb(29 29 29); }
.axt-reader { position: relative; }
.axt-reader .axt-pane { position: absolute; top: 0; bottom: 0; overflow: auto; overflow-anchor: none; }
.axt-reader .axt-pane.left { left: 0; width: 50%; }
.axt-reader .axt-pane.right { left: 50%; width: 50%; }
.axt-reader[data-axt-pdf-mode="original"] .axt-pane.left { width: 100%; }
.axt-reader[data-axt-pdf-mode="original"] .axt-pane.right { display: none; }
.axt-reader[data-axt-pdf-mode="translation"] .axt-pane.left { width: 0; visibility: hidden; }
.axt-reader[data-axt-pdf-mode="translation"] .axt-pane.right { left: 0; width: 100%; }
/* side by side swapped: the translation left, the original right (reader.css order: 2) */
.axt-reader[data-axt-pdf-mode="bilingual"][data-axt-swapped] .axt-pane.left { left: 50%; }
.axt-reader[data-axt-pdf-mode="bilingual"][data-axt-swapped] .axt-pane.right { left: 0; }
/* a narrow window shows the translation alone for now (reader.css: the left pane out of the display) */
.axt-reader[data-axt-pdf-mode="bilingual"][data-axt-narrow] .axt-pane.left { width: 0; visibility: hidden; }
.axt-reader[data-axt-pdf-mode="bilingual"][data-axt-narrow] .axt-pane.right { left: 0; width: 100%; }
/* a slot is a page box of the stack (.page: PDF.js's sheet gives it the page's colour, margins and border, as the left's pages
   have them); its size is PDF.js's rule over the stack's --scale-factor; what it shows sits in its holder, which fills it */
.axt-reader .pdfViewer .page.axt-slot { container-type: inline-size; }
.axt-reader .axt-slot-view { position: absolute; inset: 0; }
/* a drawing kept off the view while its slot is far (stack.ts keep): out of the layout tree, as today's reader held it out of the
   document. A face added to the document re-lays every text node that is laid out ("Fonts changed"), and a reader keeping a
   whole paper's drawings laid out paid it over 41-49k objects a time, 134 ms at the end of a 30-page paper
   (verification/reader-perf.md §1). display: none and not content-visibility: hidden: the same relayouts measured, but none
   keeps the drawing's layout objects (Blink's heap 147 MiB less after a scroll of that paper), and every browser the reader
   serves has it (content-visibility only from Safari 18; the website serves Safari 17.4). The holder is absolute in a slot of
   its own size, so the pane's height and the sync's places never see it go; what changed while it was out (a zoom, a face) is
   laid out as it comes back, one pane's height before it shows. Not found by the browser's find while far, as today's. */
.axt-reader .pdfViewer .page.axt-slot[data-axt-kept] > .axt-slot-view { display: none; }
.axt-reader .pdfViewer .page.axt-slot .axt-slot-view > .page { position: absolute !important; inset: 0; margin: 0 !important; border: 0 !important; box-shadow: none !important; }
/* the left's drawing of the page, while the slot waits for its layer (stack.ts copyLeft): placed as PDF.js places its own canvas in
   its page box, the slot's box being the left page box's; dimmed by the host sheet's rule for a page's canvas, as the left's is */
.axt-reader .axt-slot-view > .axt-slot-copy { position: absolute; top: 0; left: 0; margin: 0; display: block; width: 100%; height: 100%; }
/* a page of text in grey, while there is no original to draw (round 4's skeleton, places.mjs): sized in the page's own width
   (cqw), so that a page drawn at any zoom keeps its proportions; light, and dimmed in the dark */
.axt-reader .axt-sk { position: absolute; inset: 9.5% 15.5% 9%; display: flex; flex-direction: column; overflow: hidden; }
.axt-reader .axt-sk i { display: block; flex: none; background: var(--axt-sk); border-radius: 0.3cqw; }
.axt-reader .axt-sk .axt-sk-lines { position: relative; block-size: calc(var(--axt-sk-n) * 2.05cqw - 0.9cqw); border-radius: 0; background: repeating-linear-gradient(to bottom, var(--axt-sk) 0 1.15cqw, transparent 1.15cqw 2.05cqw); }
.axt-reader .axt-sk .axt-sk-lines::after { content: ""; position: absolute; inset-inline-end: 0; inset-block-end: 0; inline-size: var(--axt-sk-rest, 36%); block-size: 1.15cqw; background: var(--axt-sk-paper); }
.axt-reader .axt-sk .axt-sk-gap { block-size: 2.2cqw; background: none; }
.axt-reader .axt-sk .axt-sk-head { block-size: 1.7cqw; margin-block: 1.4cqw 2.2cqw; }
.axt-reader .axt-sk .axt-sk-figure { block-size: 34cqw; margin-block: 1cqw 3cqw; border-radius: 0.6cqw; background: none; box-shadow: inset 0 0 0 0.25cqw var(--axt-sk); }
.axt-reader .axt-sk .axt-sk-title { inline-size: 56%; block-size: 3.2cqw; margin: 4cqw auto 6cqw; }
.axt-reader .axt-sk .axt-sk-label { inline-size: 13%; block-size: 1.7cqw; margin: 2cqw auto 2.6cqw; }
.axt-reader .axt-sk-authors { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.6cqw 4cqw; margin-block: 0 3cqw; margin-inline: 4%; }
.axt-reader .axt-sk-authors i { block-size: 1.2cqw; }
.axt-reader .axt-sk-authors i:nth-child(3n) { inline-size: 70%; justify-self: center; }
.axt-reader .axt-sk-abstract { margin-inline: 9%; }
/* translating (marks.ts; engine.css at baf2083e0, the owner's "Glint" of 2026-11-01): over a near page whose slot shows the
   original's page, one mark a paragraph not laid yet, above the page and under nothing the reader acts on. One diagonal light
   crossing the whole page, a picture three pages wide (300cqw) in the page's frame, each mark clipping its own slice of it, moved
   across the page by a transform (the compositor runs the pass); every mark's pass starts when its page's indicator did. The
   light is the paper's own colour at 78 % (80 % dimmed), over no ground, laid with no blend. Every value of the look a custom
   property; still (a veil of the paper, 10 %, 14 % dimmed) where the reader asks for less motion or the browser sizes no
   container */
.axt-reader {
  --axt-tr-ground: transparent;
  --axt-tr-light: color-mix(in oklab, var(--axt-sk-paper) 78%, transparent);
  --axt-tr-light-a: color-mix(in oklab, var(--axt-tr-light) 35%, var(--axt-tr-ground));
  --axt-tr-light-b: var(--axt-tr-light-a);
  --axt-tr-edge: 40%;
  --axt-tr-shoulder: 43.5%;
  --axt-tr-angle: 100deg;
  --axt-tr-blend: normal;
  --axt-tr-filter: none;
  --axt-tr-pad-x: 4;
  --axt-tr-pad-y: 2;
  --axt-tr-radius: 4;
  --axt-tr-still: color-mix(in oklab, var(--axt-sk-paper) 10%, transparent);
  --axt-tr-run: 3.4s;
  --axt-tr-easing: cubic-bezier(0.65, 0, 0.35, 1);
  --axt-tr-delay: 0.3s;
  --axt-tr-fade: 0.4s;
}
${DIMMED} {
  --axt-tr-light: color-mix(in oklab, var(--axt-sk-paper) 80%, transparent);
  --axt-tr-still: color-mix(in oklab, var(--axt-sk-paper) 14%, transparent);
}
.axt-reader .axt-translating { position: absolute; inset: 0; pointer-events: none; z-index: 1; container-type: size; }
.axt-reader .axt-translating .axt-translating-mark { position: absolute; display: block; overflow: hidden; left: calc(var(--axt-tr-x) - var(--axt-tr-px)); top: calc(var(--axt-tr-y) - var(--axt-tr-py)); width: calc(var(--axt-tr-w) + 2 * var(--axt-tr-px)); height: calc(var(--axt-tr-h) + 2 * var(--axt-tr-py)); border-radius: calc(var(--axt-tr-radius) * var(--axt-tr-u, 0.1cqw)); mix-blend-mode: var(--axt-tr-blend); filter: var(--axt-tr-filter); background: var(--axt-tr-ground); animation: axt-tr-in var(--axt-tr-fade) ease var(--axt-tr-delay) both; }
.axt-reader .axt-translating .axt-translating-mark::before { content: ""; position: absolute; top: 0; height: 100%; left: calc(var(--axt-tr-px) - var(--axt-tr-x)); width: 100cqw; background-image: var(--axt-tr-image, linear-gradient(var(--axt-tr-angle), transparent 0 var(--axt-tr-edge), var(--axt-tr-light-a) var(--axt-tr-shoulder), var(--axt-tr-light) 50%, var(--axt-tr-light-b) calc(100% - var(--axt-tr-shoulder)), transparent calc(100% - var(--axt-tr-edge)) 100%)); background-size: var(--axt-tr-size, 300cqw 100cqh); background-repeat: no-repeat; background-position: -100cqw calc(var(--axt-tr-py) - var(--axt-tr-y)); animation: axt-tr-pass var(--axt-tr-run) var(--axt-tr-easing) infinite; }
@keyframes axt-tr-pass { 0% { transform: translateX(-100%); } 80%, 100% { transform: translateX(100%); } }
@keyframes axt-tr-in { from { opacity: 0; } to { opacity: 1; } }
.axt-reader .axt-translating-still .axt-translating-mark { animation: none; background: var(--axt-tr-still, var(--axt-tr-ground)); }
.axt-reader .axt-translating-still .axt-translating-mark::before { content: none; }
@media (prefers-reduced-motion: reduce) {
  .axt-reader .axt-translating .axt-translating-mark { animation: axt-tr-in 0s linear var(--axt-tr-delay) both; background: var(--axt-tr-still, var(--axt-tr-ground)); }
  .axt-reader .axt-translating .axt-translating-mark::before { content: none; }
}
/* the highlight's layer: over the text layer, never catching the pointer, the bands multiplied into the page by the layer (an
   isolated group: a band's own blend would grey the letters, engine.css "The wash") */
.axt-reader .axt-hl-layer { position: absolute; inset: 0; pointer-events: none; z-index: 3; mix-blend-mode: multiply; }
.axt-reader .axt-hl { position: absolute; border-radius: 3px; background: color-mix(in oklab, var(--axt-hl-color, var(--axt-green)) var(--axt-hl-mix, 22%), transparent); }
/* a sentence over rows of different reach: one outline, its path filled with the band's wash (highlight.ts shapePath) */
.axt-reader .axt-hl-shape { background: none; border-radius: 0; overflow: visible; }
.axt-reader .axt-hl-shape > path { fill: color-mix(in oklab, var(--axt-hl-color, var(--axt-green)) var(--axt-hl-mix, 22%), transparent); }
/* over a dimmed page the band is screened, as it is multiplied over a white one (by its layer: a band's own blend mode mixes
   inside the layer alone) */
${DIMMED} .axt-hl-layer { mix-blend-mode: screen; }
/* "you landed here" (link previews' §3.7): a jump's arrival and its way back, the band itself, full for its first 18 % and then
   fading, opacity alone (nothing moves, so reduced motion has the same); a box of a page rounded as a mark (4 px) */
.axt-reader .axt-land { animation: axt-land ${LAND_MS}ms cubic-bezier(0.2, 0, 0, 1) forwards; }
.axt-reader .axt-land-box { border-radius: 4px; }
@keyframes axt-land { 0%, ${Math.round(LAND_FULL * 100)}% { opacity: 1; } 100% { opacity: 0; } }
/* the composed page's overlay over the page view: its frame the page's size at its scale (--axt-frame-w, -h), never the floored box.
   Its text at the weight the page's canvas draws its own (docs/PDF-READER.md §11.8): the browser's own smoothing, and
   geometricPrecision unless the reader's fixed probe said auto (text-rendering.ts, decided once a reader before its first
   overlay and written on the root by the composer; Chromium on macOS draws geometricPrecision without the smoothing: 80 % of
   the ink); in the layer's ink, the PDF's own black, where a run names no fill of its own (the owner's ruling of 2026-11-08:
   today's layer, layer-proto/run.mjs SVG_RULES, drew #141414). A CJK run comes with its own fill, #141414, today's ink (the
   owner's exception of 2026-11-08: typeset's display.ts CJK_INK, by the class of its characters), painted as its attribute */
.axt-reader .axt-over { position: absolute; inset: 0; }
.axt-reader .axt-over > svg { position: absolute; left: 0; top: 0; width: var(--axt-frame-w, 100%); height: var(--axt-frame-h, 100%); overflow: visible; font-synthesis: none; text-rendering: geometricPrecision; -webkit-font-smoothing: auto; -webkit-user-select: none; user-select: none; pointer-events: none; }
.axt-reader[data-axt-layer-text="auto"] .axt-over > svg { text-rendering: auto; }
.axt-reader .axt-over > svg text { white-space: pre; fill: #000; }
/* the elements' and labels' crops, cut from the page's crop render: darkened into the page (lightened into a dimmed one, below),
   so that paint order cannot change a pixel;
   in the page view's own frame and box (the frame floored to its rounding, as PDF.js floors the page box; a turned page's
   turned, never by CSS), so that its pixels are the page view's and the device's (paint.ts cropGrid) */
/* a turned page (/Rotate, the maintainer's B-408): the overlay's drawing (its SVG, its crops, its links) and the highlight's
   layer made in the page's own frame and turned with the page about the frame's corner, as PDF.js turns its own layers
   (pdf_viewer.css [data-main-rotation]) */
.axt-reader [data-axt-turn] { transform-origin: 0 0; }
.axt-reader [data-axt-turn="90"] { transform: rotate(90deg) translateY(-100%); }
.axt-reader [data-axt-turn="180"] { transform: rotate(180deg) translate(-100%, -100%); }
.axt-reader [data-axt-turn="270"] { transform: rotate(270deg) translateX(-100%); }
.axt-reader .axt-hl-layer[data-axt-turn] { inset: auto; left: 0; top: 0; width: var(--axt-frame-w); height: var(--axt-frame-h); }
.axt-reader .axt-over > canvas.axt-crops { position: absolute; left: 0; top: 0; width: var(--axt-crops-w, 100%); height: var(--axt-crops-h, 100%); mix-blend-mode: darken; pointer-events: none; }
.axt-reader .axt-over > canvas.axt-crops-detail { position: absolute; mix-blend-mode: darken; pointer-events: none; }
.axt-reader .axt-over > .textLayer { contain: strict; }
.axt-reader .axt-over > .textLayer[data-axt-frame] { width: var(--axt-frame-w, 100%) !important; height: var(--axt-frame-h, 100%) !important; }
/* every text layer off screen skipped by style and layout (docs/PDF-READER.md §11.11, "Off screen, skipped"): PDF.js's on the
   left's pages and on the right's original pages, and the laid pages'. Late in a paper's first scroll the text layers are 94 %
   of what is laid out, most of it on left pages far from the view that PDF.js's viewer keeps drawn, and each change of the
   document's fonts laid every one of them out again. A text layer paints nothing (its glyphs transparent) and its box is its
   own (PDF.js's inset: 0 and overflow: clip; a laid page's contain: strict, sized by the frame), so one skipped draws nothing
   less and moves no box: no intrinsic size is needed. The browser lays one out again as it comes near the view, and as its
   find, a selection or the focus reaches it; a browser without content-visibility lays them all, as before */
.axt-reader .textLayer { content-visibility: auto; }
/* while a zoom's or a pinch's steps scale the pages by CSS (the stack marked scaling until TEXT_BACK_MS after they are drawn again),
   the laid pages' text layers are out of style and layout: each span's size is a calc of --total-scale-factor, which every step
   changes. They are sized once, as the steps end; a selection in them stays, and shows again with them */
.axt-reader [data-axt-scaling] .axt-over > .textLayer { display: none; }
/* the pages dimmed: the overlay's drawing, its text and its crops, takes the filter the host gives the page's canvas
   (chrome/reader.css), so that every run comes out as the canvas's ink does, whatever fill it names (the layer's black, a CJK
   run's CJK_INK, a colour of its own), as no rule on a text's fill would reach a run that names its own. The crops' blend is
   mirrored with it, as the highlight's is: the filter turns a crop's paper into the dimmed page's ground (rgb(29 29 29), the
   page canvas's white through the same filter) and its ink light, so darken, which keeps a crop's ink over a white page,
   would keep the ground over it (the website's staging, 2026-11-12: every inline formula of a translated paragraph a blank
   gap); lighten keeps the ink and lays the crop's paper on its equal */
${DIMMED} .axt-over > svg, ${DIMMED} .axt-over > canvas.axt-crops, ${DIMMED} .axt-over > canvas.axt-crops-detail { filter: invert(88.8%) hue-rotate(180deg); }
${DIMMED} .axt-over > canvas.axt-crops, ${DIMMED} .axt-over > canvas.axt-crops-detail { mix-blend-mode: lighten; }
/* the links over a laid page: one anchor a link, each box a span of its own, sizes a share of the page's frame */
.axt-reader .axt-links { position: absolute; left: 0; top: 0; width: var(--axt-frame-w, 100%); height: var(--axt-frame-h, 100%); z-index: 1; pointer-events: none; }
.axt-reader .axt-link { position: absolute; display: block; pointer-events: none; outline: none; }
.axt-reader .axt-link > .axt-link-box { position: absolute; box-sizing: border-box; pointer-events: auto; cursor: pointer; }
.axt-reader .axt-link[data-axt-border="solid"] > .axt-link-box { border: var(--axt-link-border) solid var(--axt-link-colour); }
.axt-reader .axt-link[data-axt-border="dashed"] > .axt-link-box { border: var(--axt-link-border) dashed var(--axt-link-colour); }
.axt-reader .axt-link[data-axt-border="underline"] > .axt-link-box { border-bottom: var(--axt-link-border) solid var(--axt-link-colour); }
/* a hovered or held link (a preview's) takes the band at half, on both panes: the laid links' and PDF.js's own on the left and on a
   right page not laid, whose yellow wash (pdf_viewer.css: an anchor at 0.2 opacity, a bordered link's 0.2 yellow) gives way,
   each rule more specific than PDF.js's; multiplied into the page, screened into a dimmed one, as the band is */
.axt-reader .axt-link > .axt-link-box::after { content: ""; position: absolute; inset: -1.5px -2px; border-radius: 4px; background: transparent; mix-blend-mode: multiply; pointer-events: none; }
${DIMMED} .axt-link > .axt-link-box::after { mix-blend-mode: screen; }
@media (hover: hover) {
  .axt-reader .axt-link:hover > .axt-link-box::after { background: ${HALF}; }
  .axt-reader .annotationLayer :is(.linkAnnotation, .buttonWidgetAnnotation.pushButton):not(.hasBorder) > a:hover { opacity: 1; background-color: ${HALF}; mix-blend-mode: multiply; }
  .axt-reader .annotationLayer .linkAnnotation.hasBorder:hover { background-color: ${HALF}; mix-blend-mode: multiply; }
  ${DIMMED} .annotationLayer :is(.linkAnnotation, .buttonWidgetAnnotation.pushButton):not(.hasBorder) > a:hover, ${DIMMED} .annotationLayer .linkAnnotation.hasBorder:hover { mix-blend-mode: screen; }
}
.axt-reader .axt-link[data-axt-held] > .axt-link-box::after { background: ${HALF}; }
.axt-reader .annotationLayer .linkAnnotation > a[data-axt-held] { opacity: 1; background-color: ${HALF}; mix-blend-mode: multiply; }
${DIMMED} .annotationLayer .linkAnnotation > a[data-axt-held] { mix-blend-mode: screen; }
.axt-reader .axt-link { --axt-ring: oklch(0.235 0.012 255); --axt-ring-halo: oklch(1 0 0); }
${DIMMED} .axt-link { --axt-ring: oklch(0.935 0.005 255); --axt-ring-halo: oklch(0.255 0.006 255); }
.axt-reader .axt-link:focus-visible > .axt-link-box { outline: 2px solid var(--axt-ring); outline-offset: 1px; box-shadow: 0 0 0 1px var(--axt-ring-halo), 0 0 0 4px var(--axt-ring-halo); }
@media (forced-colors: active) {
  .axt-reader .axt-link > .axt-link-box { outline: 1.5px solid LinkText; }
  .axt-reader .axt-link:focus-visible > .axt-link-box { outline: 2px solid Highlight; box-shadow: none; }
}
${PREVIEW_CSS}`

/** the reader's sheets in its root: PDF.js's viewer sheet (`sheet`) and its own; removed with the root's content */
export function addSheets(root: HTMLElement, sheet: string): void {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = sheet
  const style = document.createElement('style')
  style.textContent = READER_CSS
  root.prepend(link, style)
}
