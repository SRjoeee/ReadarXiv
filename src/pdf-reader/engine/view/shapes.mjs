// The highlight's shapes on the shared reader view's two panes (the view's contract §2.7; docs/PDF-READER.md §17.8). What
// a pane paints and where the pointer lights it are read through one seam, its Shapes — a unit's runs, a run's block and
// a sentence's shape, the float a unit lights whole, whether a unit's shapes hold its words by its sentence starts, what
// a point lights and what a click there levels by — in its own pages' coordinates (lighting.mjs reads a pane through it
// alone). The PDF side's are its layout's (pdfShapes, lifted from the web's session/layouts.ts: highlight.mjs and
// floats.mjs as the extension paints them).
//
// On the layer path a side's layout is made page by page (createShapes): the document part from the parts' left
// rectangles as the parts come, a page's part from its left part (format.mjs readLeftPart, the door's leftPageOf) when it
// lands, through leftPageInput. The right's shapes, until the layer's pages bring words of their own, are the left's
// mirrored (mirror): a layout of the right's own over its own copies of the left's tokens and rectangles, so that no run
// object of the left reaches the right — the paint keeps what it drew by the run, and a run shared would move the left's
// element into the right's pane (the contract's trap 1). A float passes through: the right's floats are the left's.
//
// Sentences come through the same calls: a unit lights by sentence where both panes have its starts and its shapes hold
// its words (lighting.mjs startsOf, by the panes' starts and their shapes' fits), else whole. The left's starts are its
// units' pairs read as anchors.mjs sentenceStarts reads an anchor's (createShapes starts), once every page the unit is on
// has come; the right has none until its pages bring their words, and every unit lights whole meanwhile — on the one path.
import { sentenceStarts } from '../pipeline/anchors.mjs'
import { floatHitOf, floatOf, floatShapes, pageFloats } from './floats.mjs'
import { blockOf, clickOf, hitOf, layoutPage, layoutParts, pageLayout, runsOf, sentenceOf, sentencesFit, tokensIn } from './highlight.mjs'

/** a PDF side's shapes, of its layout: highlight.mjs and floats.mjs, as the extension paints them */
export function pdfShapes(L) {
  return {
    runs: id => runsOf(L, id),
    block: (run, padX) => blockOf(run, padX),
    sentence: (run, starts, s, padX) => sentenceOf(L, run, starts, s, padX),
    float: id => floatOf(L, id),
    floatShapes: (f, padX) => floatShapes(L, f, padX),
    fits: (id, starts, now) => sentencesFit(L, id, starts, !now),
    hit: (page, x, y, padX, startsOf) => floatHitOf(L, page, x, y, padX, hitOf(L, page, x, y, padX, startsOf)),
    click: (page, x, y, padX, startsOf) => clickOf(L, page, x, y, padX, startsOf),
  }
}

/**
 * A left part as a page's part of a layout: its page, its tokens' first id (the side's stream) and table as read (kept,
 * never copied nor written), each unit's spans as its tokens, rising, and each unit's pairs as the words of its text
 * (anchors.mjs tokens) beside the tokens they were matched to — page-local ranges and runs made the side's ids
 */
export function leftPageInput(left) {
  const { page, first, table } = left
  const spans = left.spans.map(([id, ranges]) => {
    let n = 0
    for (let j = 1; j < ranges.length; j += 2) n += ranges[j]
    const tokens = new Int32Array(n)
    for (let j = 0, k = 0; j < ranges.length; j += 2) for (let t = first + ranges[j], end = t + ranges[j + 1]; t < end; t++) tokens[k++] = t
    return [id, tokens]
  })
  const pairs = left.pairs.map(([id, runs]) => {
    let n = 0
    for (let j = 2; j < runs.length; j += 3) n += runs[j]
    const words = new Int32Array(n), tokens = new Int32Array(n)
    for (let j = 0, k = 0; j < runs.length; j += 3) for (let c = 0; c < runs[j + 2]; c++, k++) { words[k] = runs[j] + c; tokens[k] = first + runs[j + 1] + c }
    return [id, words, tokens]
  })
  return { page, first, table, spans, pairs }
}

const warnOnce = (what, e) => console.warn(`[highlight] ${what}:`, e?.message ?? e)
/** what each side made by createShapes was told, in order, for a mirror made of it later, and the mirrors that follow it */
const told = new WeakMap()

/**
 * A side's shapes made page by page from the layer's wire: { layout, shapes, addParts, addPage, refuse, has, forget,
 * starts, floats }. `kindOf(id)` a unit's kind (the index's); `warn(what, error)` where a left part or a page's floats are
 * refused, once each a page. After `addParts` or `addPage` the pane's shapes are set again (lighting.mjs setShapes): what
 * a page's runs are made of may have moved, and the paint keeps what it drew by the run
 */
export function createShapes({ kindOf = () => undefined, warn = warnOnce } = {}) {
  const L = pageLayout(kindOf), base = pdfShapes(L)
  /** each unit's pairs, page by page ([words, tokens]); their map made once the unit's tokens are all in */
  const pairsOn = new Map(), pairsOf = new Map()
  /** a page's floats' inputs (its figures and paths, floats.mjs) while the page is in the view's window, its drawing's
   *  to give: its floats made of them on its first use after they come or the document part moves — never in a part's
   *  task, which would make every such page's geometry again at once —, let go with the page (forget) */
  const floatsIn = new Map()
  const warned = new Set()
  const once = (what, e) => { if (warned.has(what)) return; warned.add(what); warn(what, e) }
  /** a page's floats made where its inputs are kept and its floats are not; inputs that throw are let go, one warning */
  function floatsOn(p) {
    const at = floatsIn.get(p)
    if (!at || L.floats?.has(p) || !L.pt[p] || !L.page[p]) return
    try { pageFloats(L, p, at.regions, at.paths) } catch (e) { floatsIn.delete(p); L.floats?.delete(p); once(`the floats of page ${p}`, e) }
  }
  const refuse = (page, e) => once(`the left part of page ${page}`, e)
  // the float a unit lights, what a point lights or a click levels by and a sentence's shape (which keeps from under a
  // float, highlight.mjs reachAt) read their pages' floats, made then
  const atPage = f => (page, x, y, padX, startsOf) => { floatsOn(page); return f(page, x, y, padX, startsOf) }
  const shapes = {
    ...base,
    sentence: (run, starts, s, padX) => { floatsOn(run.page); return base.sentence(run, starts, s, padX) },
    float: id => { for (const p of L.pagesOf.get(id) ?? []) floatsOn(p); return base.float(id) },
    hit: atPage(base.hit),
    click: atPage(base.click),
  }
  const state = { kindOf, parts: [], pages: new Map(), followers: new Set(), floatsOn }
  told.set(shapes, state)
  return {
    layout: L,
    shapes,
    /** parts told (format.mjs ReadPart: pages, views, left): the document part as they come, in page order; the mirrors
     *  told them too. No page's geometry nor floats made here: each on its next use. A part telling nothing new changes
     *  nothing, and is not passed on */
    addParts(parts) {
      if (!parts.length || !layoutParts(L, parts)) return
      state.parts.push(...parts)
      for (const f of state.followers) f.addParts(parts)
    },
    /** a page's left part (format.mjs ReadLeftPart): its part of the layout, and the mirrors'; false where it was in
     *  already or is refused — malformed, or its ids reach into another page's (one warning a page) */
    addPage(left) {
      let input
      try {
        if (L.pt[left.page]) return false
        input = leftPageInput(left)
        if (!layoutPage(L, input.page, input)) return false
      } catch (e) { refuse(left?.page, e); return false }
      state.pages.set(input.page, input)
      for (const [id, words, tokens] of input.pairs) (pairsOn.get(id) ?? pairsOn.set(id, new Map()).get(id)).set(input.page, [words, tokens])
      for (const f of state.followers) f.addPage(input)
      return true
    },
    /** a page's left part refused (the door's leftPageOf rejected): no shapes there, one warning a page; one that comes
     *  later is taken */
    refuse,
    /** whether a page's part is in */
    has: p => !!L.pt[p],
    /** a page out of the view's window (NEAR and the last pages wanted): its geometry, its floats and their inputs let
     *  go — the geometry made again from its part on its next use, the floats when its drawing gives their inputs again;
     *  its part and the units' sentences elsewhere kept */
    forget: p => { L.cache.delete(p); L.floats?.delete(p); floatsIn.delete(p) },
    /**
     * A unit's sentence starts on the left, by its text and its sentences' offsets in it (`text` the unit's plain source,
     * `offsets` the row's `sentences.src`): anchors.mjs sentenceStarts over its tokens and its pairs, once every page
     * the unit is on has come; null before, without pairs, or where a start is not found (the unit lights whole). The
     * pairs are the producer's to ship where the reader reads them (a unit located by its marks, or by its text over
     * 80 % of it, sentenceStarts' TEXT_ONLY): what is shipped is read
     */
    starts(id, text, offsets) {
      if (!L.told.has(id) || !tokensIn(L, id)) return null
      let pairs = pairsOf.get(id)
      if (pairs === undefined) {
        const on = pairsOn.get(id)
        pairs = null
        if (on) {
          pairs = new Map()
          for (const p of [...on.keys()].sort((a, b) => a - b)) { const [ws, ts] = on.get(p); for (let i = 0; i < ws.length; i++) pairs.set(ws[i], ts[i]) }
        }
        pairsOf.set(id, pairs)
      }
      return pairs && sentenceStarts({ tokens: L.anchors.get(id).tokens, pairs, bounded: true, coverage: 1 }, text, offsets)
    },
    /** a page's floats (floats.mjs pageFloats) from what its drawing gave: its figures' regions and its paths; made now
     *  where its part is in, else on its first use after it comes, and again on its first use after the document part
     *  moves; inputs that throw are let go with one warning, the page then without floats */
    floats(page, regions = [], paths = {}) {
      floatsIn.set(page, { regions, paths })
      L.floats?.delete(page)
      floatsOn(page)
    },
  }
}

/** a part's and a page's inputs copied: the mirror's own arrays */
const copyPage = input => ({
  ...input,
  table: { n: input.table.n, l: input.table.l.slice(), r: input.table.r.slice(), y: input.table.y.slice(), h: input.table.h.slice(), top: input.table.top.slice(), bottom: input.table.bottom.slice() },
  spans: input.spans.map(([id, tokens]) => [id, tokens.slice()]),
})
const copyPart = part => ({ pages: [...part.pages], views: [...part.views], left: part.left.map(([id, stream, rects]) => [id, stream, rects.map(r => [...r])]) })

/**
 * The right's shapes, the left's mirrored (trap 1): { layout, shapes, forget, dispose }. A layout of its own over its own copies
 * of what `source` (createShapes) was told and is told from now on — each part's rectangles and each page's tokens —, so
 * that its runs, blocks and sentence shapes equal the left's from objects of its own. A float, and its shapes, pass
 * through (the right's floats are the left's: lighting a float on the right lights the left's); what a point lights is
 * the right's own runs, the floats the left's; a sentence keeps from under the left's floats, as the left's sentence
 * does. `dispose` stops following the source
 */
export function mirror(source) {
  const state = told.get(source.shapes)
  if (!state) throw new TypeError('not a side\'s shapes (createShapes)')
  const R = pageLayout(state.kindOf), own = pdfShapes(R), from = source.shapes
  const follower = {
    addParts: parts => layoutParts(R, parts.map(copyPart)),
    addPage: input => layoutPage(R, input.page, copyPage(input)),
  }
  if (state.parts.length) follower.addParts(state.parts)
  for (const input of state.pages.values()) follower.addPage(input)
  state.followers.add(follower)
  // a sentence keeps from under the floats painted on its page (highlight.mjs reachAt), here the left's: the right's
  // layout reads the left's floats, made then, as they are now (their map is let go and made again with the left's)
  const floatsOf = p => { state.floatsOn(p); R.floats = source.layout.floats }
  const atPage = f => (page, x, y, padX, startsOf) => { floatsOf(page); return f(page, x, y, padX, startsOf) }
  const shapes = {
    runs: own.runs,
    block: own.block,
    sentence: (run, starts, s, padX) => { floatsOf(run.page); return own.sentence(run, starts, s, padX) },
    fits: own.fits,
    click: atPage(own.click),
    float: from.float,
    floatShapes: from.floatShapes,
    hit: atPage((page, x, y, padX, startsOf) => floatHitOf(source.layout, page, x, y, padX, hitOf(R, page, x, y, padX, startsOf))),
  }
  return { layout: R, shapes, forget: p => { R.cache.delete(p) }, dispose: () => { state.followers.delete(follower) } }
}
