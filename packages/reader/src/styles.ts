// The reader's own sheet: the page stack's slots, the composed page's overlay, its text layer and links, the highlight's bands
// and the translating marks. Carried from today's engine sheet (src/pdf-reader/engine/view/engine.css at baf2083e0, each rule's
// reason there), scoped to a reader's root (`.axt-reader`, its marks on the root: `[data-axt-dim]`, `[data-axt-scaling]`) instead
// of <html>, so that two readers on one page each style their own. PDF.js's viewer sheet is linked beside it (kit.ts `sheet`).
export const READER_CSS = `
.axt-reader { --axt-green: oklch(0.693 0.17 162.48); --axt-sk: oklch(0.945 0.004 255); --axt-sk-paper: #fff; }
.axt-reader[data-axt-dim] { --axt-sk: oklch(0.275 0.004 255); --axt-sk-paper: rgb(29 29 29); }
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
.axt-reader[data-axt-dim] {
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
.axt-reader[data-axt-dim] .axt-hl-layer { mix-blend-mode: screen; }
/* the composed page's overlay over the page view: its frame the page's size at its scale (--axt-frame-w, -h), never the floored box.
   Its text at the weight the page's canvas draws its own (docs/PDF-READER.md §11.8): the browser's own smoothing, and
   geometricPrecision unless the reader's first laid page said auto (text-rendering.ts, written on the root by the composer;
   Chromium on macOS draws geometricPrecision without the smoothing: 80 % of the ink); in the layer's ink, #141414, where a run
   names no fill of its own (today's layer, layer-proto/run.mjs SVG_RULES; typeset's display.ts the same ink for a named colour) */
.axt-reader .axt-over { position: absolute; inset: 0; }
.axt-reader .axt-over > svg { position: absolute; left: 0; top: 0; width: var(--axt-frame-w, 100%); height: var(--axt-frame-h, 100%); overflow: visible; font-synthesis: none; text-rendering: geometricPrecision; -webkit-font-smoothing: auto; -webkit-user-select: none; user-select: none; pointer-events: none; }
.axt-reader[data-axt-layer-text="auto"] .axt-over > svg { text-rendering: auto; }
.axt-reader .axt-over > svg text { white-space: pre; fill: #141414; }
/* the elements' and labels' crops, cut from the page's crop render: darkened into the page, so that paint order cannot change a pixel */
/* a turned page (/Rotate, the maintainer's B-408): the overlay's drawing (its SVG, its crops, its links) and the highlight's
   layer made in the page's own frame and turned with the page about the frame's corner, as PDF.js turns its own layers
   (pdf_viewer.css [data-main-rotation]) */
.axt-reader [data-axt-turn] { transform-origin: 0 0; }
.axt-reader [data-axt-turn="90"] { transform: rotate(90deg) translateY(-100%); }
.axt-reader [data-axt-turn="180"] { transform: rotate(180deg) translate(-100%, -100%); }
.axt-reader [data-axt-turn="270"] { transform: rotate(270deg) translateX(-100%); }
.axt-reader .axt-hl-layer[data-axt-turn] { inset: auto; left: 0; top: 0; width: var(--axt-frame-w); height: var(--axt-frame-h); }
.axt-reader .axt-over > canvas.axt-crops { position: absolute; left: 0; top: 0; width: var(--axt-frame-w, 100%); height: var(--axt-frame-h, 100%); mix-blend-mode: darken; pointer-events: none; }
.axt-reader .axt-over > .textLayer { contain: strict; }
.axt-reader .axt-over > .textLayer[data-axt-frame] { width: var(--axt-frame-w, 100%) !important; height: var(--axt-frame-h, 100%) !important; }
/* while a zoom's or a pinch's steps scale the pages by CSS (the stack marked scaling until TEXT_BACK_MS after they are drawn again),
   the laid pages' text layers are out of style and layout: each span's size is a calc of --total-scale-factor, which every step
   changes. They are sized once, as the steps end; a selection in them stays, and shows again with them */
.axt-reader [data-axt-scaling] .axt-over > .textLayer { display: none; }
.axt-reader[data-axt-dim] .axt-over > svg, .axt-reader[data-axt-dim] .axt-over > canvas.axt-crops { filter: invert(88.8%) hue-rotate(180deg); }
/* the links over a laid page: one anchor a link, each box a span of its own, sizes a share of the page's frame */
.axt-reader .axt-links { position: absolute; left: 0; top: 0; width: var(--axt-frame-w, 100%); height: var(--axt-frame-h, 100%); z-index: 1; pointer-events: none; }
.axt-reader .axt-link { position: absolute; display: block; pointer-events: none; outline: none; }
.axt-reader .axt-link > .axt-link-box { position: absolute; box-sizing: border-box; pointer-events: auto; cursor: pointer; }
.axt-reader .axt-link[data-axt-border="solid"] > .axt-link-box { border: var(--axt-link-border) solid var(--axt-link-colour); }
.axt-reader .axt-link[data-axt-border="dashed"] > .axt-link-box { border: var(--axt-link-border) dashed var(--axt-link-colour); }
.axt-reader .axt-link[data-axt-border="underline"] > .axt-link-box { border-bottom: var(--axt-link-border) solid var(--axt-link-colour); }
@media (hover: hover) { .axt-reader .axt-link:hover > .axt-link-box { background-color: rgb(255 255 0 / 0.2); } }
.axt-reader .axt-link { --axt-ring: oklch(0.235 0.012 255); --axt-ring-halo: oklch(1 0 0); }
.axt-reader[data-axt-dim] .axt-link { --axt-ring: oklch(0.935 0.005 255); --axt-ring-halo: oklch(0.255 0.006 255); }
.axt-reader .axt-link:focus-visible > .axt-link-box { outline: 2px solid var(--axt-ring); outline-offset: 1px; box-shadow: 0 0 0 1px var(--axt-ring-halo), 0 0 0 4px var(--axt-ring-halo); }
@media (forced-colors: active) {
  .axt-reader .axt-link > .axt-link-box { outline: 1.5px solid LinkText; }
  .axt-reader .axt-link:focus-visible > .axt-link-box { outline: 2px solid Highlight; box-shadow: none; }
}
`

/** the reader's sheets in its root: PDF.js's viewer sheet (`sheet`) and its own; removed with the root's content */
export function addSheets(root: HTMLElement, sheet: string): void {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = sheet
  const style = document.createElement('style')
  style.textContent = READER_CSS
  root.prepend(link, style)
}
