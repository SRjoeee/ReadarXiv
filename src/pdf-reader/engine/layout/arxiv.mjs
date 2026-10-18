// arXiv's PDF's text, read once (the prepare's step T, the page stream's design of 2026-10-15 §2.2): each page's view and
// text read one time, while the marked original compiles, and handed on to everything that reads arXiv's text — the left's
// anchors, the layout maker's and the highlight's layout — so that no one reads it again.
//
// Each page is tokenized alone (anchors.mjs tokenizeDocument: its state begins again on every page) and its tokens' ink
// edges are made there (anchors.mjs inkEdges: a token's item and its page's monospaced faces), the only reading that needs
// the PDF.js text items; then each token lets its item go. The tokens are the whole document's, in page order, as
// tokenizeDocument over every page gives them; the edges are those inkEdges over the whole document gives.
// Imports the engine's own pure modules: no PDF.js, no `node:*` one.
import { inkEdges, tokenizeDocument } from '../pipeline/anchors.mjs'
import { drawTextOf } from '../pipeline/draw-data.mjs'
import { isMemoryError } from '../pipeline/memory.mjs'

/**
 * arXiv's text, every page read once: { pages, views, ok, tokens, edges: { l, r }, spans: { x0, x1 } }.
 * - `views[p - 1]`: page p's view as PDF.js gives it (page.view), null where the page could not be had;
 * - `ok[p - 1]`: page p and its text were read (where not, its text is none);
 * - `tokens`: tokenizeDocument's of every page, in page order, each with its text item let go (`item` null);
 * - `edges`: each token's ink across (inkEdges), made while the items were there;
 * - `spans`: each token's item's start and end across (its transform's x, and that plus its width along its baseline's
 *   direction: its width for upright text; NaN with none), which the wire's check of a token reads;
 * - `draw` (with `draw` asked): each page's text as its draw geometry reads it (pipeline/draw-data.mjs drawTextOf; null where the
 *   page's text was not read), which the layout maker takes a page at a time as it reads the page's draw (and lets go): no page's
 *   text is read twice. Else null.
 * `doc` a PDF.js document, which the caller opens and destroys
 */
export async function readArxivText(doc, { draw = false } = {}) {
  const pages = doc.numPages
  const views = [], ok = [], tokens = [], ls = [], rs = [], x0s = [], x1s = [], drawn = draw ? [] : null
  for (let p = 1; p <= pages; p++) {
    let view = null, items = [], styles = {}, read = false
    try {
      const page = await doc.getPage(p)
      view = page.view
      const tc = await page.getTextContent()
      items = Array.isArray(tc?.items) ? tc.items : []
      styles = tc?.styles ?? {}
      read = true
      drawn?.push(drawTextOf(tc))
    } catch (e) {
      // (a memory-class failure is no page unread: the run ends on it, C8.4)
      if (isMemoryError(e)) throw e
    }
    if (drawn && drawn.length < p) drawn.push(null)
    views.push(view ?? null)
    ok.push(read)
    const own = tokenizeDocument([{ page: p, items, styles }])
    const { l, r } = inkEdges(own)
    ls.push(l); rs.push(r)
    const x0 = new Float64Array(own.length), x1 = new Float64Array(own.length)
    own.forEach((w, k) => {
      const it = w.item
      const t = it?.transform, at = t?.[4], along = t ? Math.hypot(t[0], t[1]) : 0
      x0[k] = typeof at === 'number' ? at : Number.NaN
      x1[k] = typeof at === 'number' && typeof it.width === 'number' ? at + it.width * (along ? t[0] / along : 1) : Number.NaN
      // (set, not deleted: the token keeps its shape)
      w.item = null
      tokens.push(w)
    })
    x0s.push(x0); x1s.push(x1)
  }
  return { pages, views, ok, tokens, edges: { l: joined(ls, Float32Array), r: joined(rs, Float32Array) }, spans: { x0: joined(x0s, Float64Array), x1: joined(x1s, Float64Array) }, draw: drawn }
}

/** typed arrays joined into one of their kind */
function joined(parts, Kind) {
  let n = 0
  for (const a of parts) n += a.length
  const out = new Kind(n)
  for (let i = 0, at = 0; i < parts.length; at += parts[i].length, i++) out.set(parts[i], at)
  return out
}
