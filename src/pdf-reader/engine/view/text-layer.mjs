// The text layer of a laid page over the right pane's place (docs/PDF-READER.md §11.11): the engine's text layer data
// (layer-proto/textlayer.mjs, the door's textOf: the composed page's text the drawing keeps, the text a crop moves, each drawn
// line of the translation, in reading order, in the page's PDF units) made into PDF.js's own text layer, built by PDF.js's own
// builder (pdf_viewer's TextLayerBuilder over a text content of the items), so that a selection, a copy and a search on the right
// behave as on the left's pages: one transparent span an item, scaled across to its box, in reading order, with PDF.js's handling of a
// drag (its end-of-content and selecting classes) and of a copy (its normalisation). Each item is given to PDF.js as an upright
// run at its baseline in one generic face, its width the item's: PDF.js measures the face and scales each span to it. Translated
// spans carry the target's language. Nothing is drawn: the layer is the page's selectable copy of its text, the SVG's text being
// hidden from selection and from assistive technology (engine.css, layer-side.mjs).
//
// What an item holds is text from the PDF or from a translation, which may hold control and bidirectional characters: it is set
// as a text node by PDF.js (textContent), never parsed as markup. An item the view cannot place (no text, a size or a position
// that is not a finite number) is left out, and at most ITEMS_MAX are taken.

/** the items a page's layer takes at most (the engine's TEXT_ITEMS_MAX) */
export const ITEMS_MAX = 2000
/** the characters of an item at most */
export const STR_MAX = 4096
/** the face PDF.js measures and draws the layer's spans in (transparent): a generic one, which every system has */
const FAMILY = 'sans-serif'
const FONT = 'axt-text'
const FROM = new Set(['kept', 'moved', 'translated'])
const finite = v => typeof v === 'number' && Number.isFinite(v)

/** the items of a page's text layer data the view can place, checked and copied (no object the data's), in their order */
export function textItems(data) {
  const out = []
  for (const it of Array.isArray(data?.items) ? data.items : []) {
    if (out.length >= ITEMS_MAX) break
    if (!it || typeof it !== 'object' || typeof it.str !== 'string' || !it.str || !FROM.has(it.from)) continue
    if (![it.x, it.base, it.w, it.fontSize].every(finite) || !(it.fontSize > 0) || !(it.w >= 0)) continue
    out.push({ str: it.str.slice(0, STR_MAX), x: it.x, base: it.base, w: it.w, fontSize: it.fontSize, dir: it.dir === 'rtl' ? 'rtl' : 'ltr', from: it.from, eol: it.eol === true })
  }
  return out
}

/** the items as a PDF.js text content: each an upright run at its baseline (transform [s, 0, 0, s, x, base]), its width the
 *  item's, in one generic face; a line's end where a copy breaks after it. A single character but a space is given twice the
 *  scale across: PDF.js scales a span of one character to its width only where its transform's scales differ by half again
 *  (text_layer.js #appendText), and its height is read from the transform's second column alone */
export function textContentOf(items, lang = null) {
  return {
    items: items.map(it => ({ str: it.str, dir: it.dir, transform: [it.str.length === 1 && it.str !== ' ' ? 2 * it.fontSize : it.fontSize, 0, 0, it.fontSize, it.x, it.base], width: it.w, height: it.fontSize, fontName: FONT, hasEOL: it.eol })),
    styles: { [FONT]: { fontFamily: FAMILY, ascent: 0.8, descent: -0.2, vertical: false } },
    lang,
  }
}

/**
 * The page's text layer, built: { div, cancel } (the layer's element, `div.textLayer.axt-text`, and its release: PDF.js's builder
 * keeps each layer it renders in a registry of its selection listener until it is cancelled), or null where nothing can be placed
 * or no builder is given. `o.viewport`: the place's (PDF.js's PageViewport); `o.Builder`: PDF.js's TextLayerBuilder (the host's
 * pdf_viewer); `o.lang`: the target's language, on each translated span
 */
export async function textLayer(data, o) {
  const items = textItems(data), vp = o?.viewport, Builder = o?.Builder
  if (!items.length || !vp?.width || !vp.height || typeof Builder !== 'function') return null
  const content = textContentOf(items, o.lang ?? null)
  let divs = null
  // (the builder's text mapping is its highlighter's: the spans, one an item, in order)
  const highlighter = { setTextMapping(d) { divs = d }, enable() {}, disable() {} }
  const pdfPage = { streamTextContent: () => new ReadableStream({ start(c) { c.enqueue(content); c.close() } }) }
  const builder = new Builder({ pdfPage, highlighter })
  try { await builder.render({ viewport: vp }) } catch (e) { builder.cancel(); throw e }
  const div = builder.div
  div.classList.add('axt-text')
  // (no Tab stop of its own, as PDF.js gives a page's layer: the right pane's Tab order stays the links', and a click in the text
  // takes no focus into a page the side would then keep for it)
  div.removeAttribute('tabindex')
  // (an upright page in the copy's frame, the SVG's: never the place's box, which PDF.js floors to whole CSS px; a page turned
  // a quarter keeps PDF.js's own, which its rotation rule turns)
  if (!((vp.rotation ?? 0) % 180)) div.dataset.axtFrame = ''
  if (o.lang && divs) items.forEach((it, i) => { if (it.from === 'translated' && divs[i]) divs[i].lang = o.lang })
  return { div, cancel: () => builder.cancel() }
}
