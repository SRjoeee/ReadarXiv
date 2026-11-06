// The reader's own sheet: the page stack's slots, the composed page's overlay, its text layer and links, the highlight's bands
// and the translating marks. Carried from today's engine sheet (src/pdf-reader/engine/view/engine.css at baf2083e0, each rule's
// reason there), scoped to a reader's root (`.axt-reader`, its marks on the root: `[data-axt-dim]`, `[data-axt-scaling]`) instead
// of <html>, so that two readers on one page each style their own. PDF.js's viewer sheet is linked beside it (kit.ts `sheet`).
export const READER_CSS = `
.axt-reader { --axt-green: oklch(0.693 0.17 162.48); --axt-sk: oklch(0.945 0.004 255); --axt-sk-paper: #fff; }
.axt-reader[data-axt-dim] { --axt-sk: oklch(0.275 0.004 255); --axt-sk-paper: rgb(29 29 29); }
.axt-reader .axt-pane { position: absolute; inset: 0; overflow: auto; overflow-anchor: none; }
/* a slot is a page box of the stack (.page: PDF.js's sheet gives it the page's colour, margins and border, as the left's pages
   have them); its size is PDF.js's rule over the stack's --scale-factor; what it shows sits in its holder, which fills it */
.axt-reader .pdfViewer .page.axt-slot { container-type: inline-size; }
.axt-reader .axt-slot-view { position: absolute; inset: 0; }
.axt-reader .pdfViewer .page.axt-slot .axt-slot-view > .page { position: absolute !important; inset: 0; margin: 0 !important; border: 0 !important; box-shadow: none !important; }
/* the highlight's layer: over the text layer, never catching the pointer, the bands multiplied into the page by the layer (an
   isolated group: a band's own blend would grey the letters, engine.css "The wash") */
.axt-reader .axt-hl-layer { position: absolute; inset: 0; pointer-events: none; z-index: 3; mix-blend-mode: multiply; }
.axt-reader .axt-hl { position: absolute; border-radius: 3px; background: color-mix(in oklab, var(--axt-hl-color, var(--axt-green)) var(--axt-hl-mix, 22%), transparent); }
/* the composed page's overlay over the page view: its frame the page's size at its scale (--axt-frame-w, -h), never the floored box */
.axt-reader .axt-over { position: absolute; inset: 0; }
.axt-reader .axt-over > svg { position: absolute; left: 0; top: 0; width: var(--axt-frame-w, 100%); height: var(--axt-frame-h, 100%); overflow: visible; font-synthesis: none; text-rendering: geometricPrecision; -webkit-font-smoothing: auto; -webkit-user-select: none; user-select: none; pointer-events: none; }
.axt-reader[data-axt-layer-text="auto"] .axt-over > svg { text-rendering: auto; }
.axt-reader .axt-over > svg text { white-space: pre; }
/* the elements' and labels' crops, cut from the page's crop render: darkened into the page, so that paint order cannot change a pixel */
.axt-reader .axt-over > canvas.axt-crops { position: absolute; left: 0; top: 0; width: var(--axt-frame-w, 100%); height: var(--axt-frame-h, 100%); mix-blend-mode: darken; pointer-events: none; }
.axt-reader .axt-over > .textLayer { contain: strict; }
.axt-reader .axt-over > .textLayer[data-axt-frame] { width: var(--axt-frame-w, 100%) !important; height: var(--axt-frame-h, 100%) !important; }
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
