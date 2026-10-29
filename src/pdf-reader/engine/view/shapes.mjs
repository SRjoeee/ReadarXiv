// The highlight's shapes on the shared reader view's two panes (the view's contract §2.7; docs/PDF-READER.md §17.8). What
// a pane paints and where the pointer lights it are read through one seam, its Shapes — a unit's runs (a table's cell no
// unit holds by its own id), a run's block and a sentence's shape, whether a unit's shapes hold its words by its sentence
// starts, what a point lights and what a click there levels by — in its own pages' coordinates (lighting.mjs reads a pane through it
// alone). The PDF side's are its layout's (pdfShapes, lifted from the web's session/layouts.ts: highlight.mjs and
// floats.mjs as the extension paints them).
//
// On the layer path a side's layout is made page by page (createShapes): the document part from the parts' left
// rectangles as the parts come, a page's part from its left part (format.mjs readLeftPart, the door's leftPageOf) when it
// lands, through leftPageInput. The right's shapes, until the layer's pages bring words of their own, are the left's
// mirrored (mirror): a layout of the right's own over its own copies of the left's tokens and rectangles, so that no run
// object of the left reaches the right — the paint keeps what it drew by the run, and a run shared would move the left's
// element into the right's pane (the contract's trap 1). The right's floats are the left's: where a point finds a table's
// cell or nothing (a figure's picture), and what a sentence keeps out of. No float lights whole (docs/PDF-READER.md §17.1).
//
// Sentences come through the same calls: a unit lights by sentence where both panes have its starts and its shapes hold
// its words (lighting.mjs startsOf, by the panes' starts and their shapes' fits), else whole. The left's starts are its
// units' pairs read as anchors.mjs sentenceStarts reads an anchor's (createShapes starts), once every page the unit is on
// has come; the right has none until its pages bring their words, and every unit lights whole meanwhile — on the one path.
import { sentenceStarts, tokens as wordsOfText } from '../pipeline/anchors.mjs'
import { cellRunsOf, floatHitOf, pageFloats } from './floats.mjs'
import { blockOf, clickOf, DRAWING, hitOf, layoutPage, layoutParts, layoutSpans, layoutStream, pageGeometry, pageLayout, runsOf, sentenceOf, sentencesFit, tokensIn, withSentences } from './highlight.mjs'
import { NAME_FLAG } from '../layout/file.mjs'
import { isNameOccurrence, isTableCell, nameOccurrenceId, tableCellPage } from '../layer-proto/units.mjs'

/** how far past a name's box a token's middle may stand and be the name's, PDF units (pipeline/ink-pass.mjs SLACK) */
const NAME_SLACK = 1

/** how many of a rising list are at most v: the sentence of a word or a place by its sentences' starts there */
function atMost(xs, v) {
  let lo = 0, hi = xs.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] <= v) lo = m + 1; else hi = m }
  return lo
}

/**
 * A unit's sentence starts from its text match's pairs (anchors.mjs sentenceStarts: `anchor` its tokens and `pairs`, a word's
 * place in its text → the page token), knowing each paired token's sentence by its word (highlight.mjs withSentences): a glyph
 * no word is paired with by the order. The left's on the layer (createShapes) and a layout made whole alike (the highlight
 * gate's reference), so that the two agree; null where sentenceStarts finds none
 */
export function startsOfPairs(anchor, text, offsets) {
  const st = sentenceStarts(anchor, text, offsets)
  if (!st) return st
  const pairs = anchor.pairs, words = offsets.map(o => wordsOfText(text.slice(0, o)).length)
  // (each paired token's word, its first where two name it, made on the first token asked; a start's token is the sentence
  // it begins, sentenceStarts', where it is paired with a word of the sentence before it too)
  let wordOf = null
  const begins = new Map(Array.from(st, (k, j) => [k, j + 1]))
  return withSentences(st, k => {
    if (begins.has(k)) return begins.get(k)
    if (!wordOf) {
      wordOf = new Map()
      for (const [w, t] of pairs) { const was = wordOf.get(t); if (was === undefined || w < was) wordOf.set(t, w) }
    }
    const w = wordOf.get(k)
    return w === undefined ? -1 : atMost(words, w)
  })
}

/** a hit of a table's cell no unit holds with the pane's own run of it (floats.mjs floatHitOf gives the side's whose floats
 *  they are: the left's, trap 1); none where the pane has no run of it */
const ownCell = (h, runs) => {
  if (!h || !isTableCell(h.id)) return h
  const run = runs(h.id)[0]
  return run ? { ...h, run } : null
}

/** a PDF side's shapes, of its layout: highlight.mjs and floats.mjs, as the extension paints them */
export function pdfShapes(L) {
  return {
    // (a table's cell no unit holds: its float's run, floats.mjs cellsOf)
    runs: id => (isTableCell(id) ? cellRunsOf(L, id) : runsOf(L, id)),
    block: (run, padX) => blockOf(run, padX),
    sentence: (run, starts, s, padX) => sentenceOf(L, run, starts, s, padX),
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
export function createShapes({ kindOf: unitKind = () => undefined, warn = warnOnce } = {}) {
  // (a babel name's occurrence lit as a heading: its id no bundle id reaches, units.mjs nameOccurrenceId)
  const kindOf = id => (isNameOccurrence(id) ? 'heading' : isTableCell(id) ? 'cell' : unitKind(id))
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
  // babel's names the parts' layouts locate (layout/file.mjs `names`: References, Abstract, …), none a unit of the bundle's: each
  // occurrence told on the left as a unit of its own (its hover id, units.mjs nameOccurrenceId), by the tokens of its page whose
  // middle stands in its box, once both its row and its page's part are in, whichever comes first; the layer draws its words under
  // the same id (run.mjs paintNames). One that leads a unit (RUN_IN) is that unit's, lit with it. `namesOn` the rows waiting for
  // their page: [id, x0, x1, top, bottom] by page; `namesTold` the ids told
  const namesOn = new Map(), namesTold = new Set()
  // a table's cell unit the parts' left does not locate (the producer locates few on arXiv's PDF, a cell's text too short for the
  // anchors: 7 of 2010.11929v2's 165, 2 of 2610.35877v1's 71), whose lines the parts' layouts lay (layout/file.mjs `lines`, arXiv's
  // page's units): told on the left as a unit of its own by the tokens of its page whose middle stands in one of its lines' boxes
  // and that no unit told there holds, as a babel name is, so that it lights cell to cell on both panes (the owner, 2026-10-30) —
  // the right tells what the left tells, and the left's words of it were else a cell of the page's (floats.mjs cellsOf). `cellsOn`
  // the boxes waiting for their page: [id, x0, x1, top, bottom] by page; `cellsTold` the ids told
  const cellsOn = new Map(), cellsTold = new Set()
  const takeCells = parts => {
    const pages = new Set()
    for (const part of parts) for (const [id, rows] of part.layout?.lines ?? []) {
      if (kindOf(id) !== 'cell' || L.told.has(id) || cellsTold.has(id)) continue
      for (let j = 0; j + 7 < rows.length; j += 8) {
        ;(cellsOn.get(rows[j]) ?? cellsOn.set(rows[j], []).get(rows[j])).push([id, rows[j + 1], rows[j + 2], rows[j + 4], rows[j + 5]])
        pages.add(rows[j])
      }
    }
    // (a page in already: told now, its spans after it as a name's)
    for (const p of pages) { const input = state.pages.get(p); if (input) tellCells(input, true) }
  }
  /** page `input`'s cells waiting, told: their part to the layout and the followers; `late` their spans after the page, else into
   *  the page's own input before it is laid (so that the followers' copies of the page hold them) */
  const tellCells = (input, late) => {
    const p = input.page, list = cellsOn.get(p)
    if (!list) return
    cellsOn.delete(p)
    const T = input.table, held = new Set()
    for (const [, ks] of input.spans) for (const k of ks) held.add(k)
    const boxes = new Map()
    for (const [id, x0, x1, top, bottom] of list) if (!cellsTold.has(id) && !L.told.has(id)) (boxes.get(id) ?? boxes.set(id, []).get(id)).push([x0, x1, top, bottom])
    // (quiet: no part of the page's columns, edges or leadings, which stay the located units', highlight.mjs layoutParts)
    const part = { pages: [p], views: [], left: [], quiet: true }, spans = []
    for (const [id, bs] of boxes) {
      const ks = []
      for (let t = 0; t < T.n; t++) {
        const k = input.first + t
        if (held.has(k)) continue
        const mx = (T.l[t] + T.r[t]) / 2, my = (T.top[t] + T.bottom[t]) / 2
        if (bs.some(([x0, x1, top, bottom]) => mx >= x0 - NAME_SLACK && mx <= x1 + NAME_SLACK && my >= bottom - NAME_SLACK && my <= top + NAME_SLACK)) { ks.push(k); held.add(k) }
      }
      if (!ks.length) continue
      cellsTold.add(id)
      part.left.push([id, ks[0], bs.map(([x0, x1, top, bottom]) => [p, x0, bottom, x1, top])])
      spans.push([id, Int32Array.from(ks)])
    }
    if (!part.left.length) return
    layoutParts(L, [part])
    state.parts.push(part)
    for (const f of state.followers) f.addParts([part])
    if (late) {
      layoutSpans(L, p, spans)
      for (const f of state.followers) f.addSpans(p, spans)
    } else input.spans.push(...spans)
  }
  const tellNames = p => {
    const list = namesOn.get(p), input = state.pages.get(p)
    if (!list || !input) return
    namesOn.delete(p)
    const T = input.table, part = { pages: [p], views: [], left: [] }, spans = []
    for (const [id, x0, x1, top, bottom] of list) {
      if (namesTold.has(id)) continue
      const ks = []
      for (let t = 0; t < T.n; t++) {
        const mx = (T.l[t] + T.r[t]) / 2, my = (T.top[t] + T.bottom[t]) / 2
        if (mx >= x0 - NAME_SLACK && mx <= x1 + NAME_SLACK && my >= bottom - NAME_SLACK && my <= top + NAME_SLACK) ks.push(input.first + t)
      }
      if (!ks.length) continue
      namesTold.add(id)
      part.left.push([id, ks[0], [[p, x0, bottom, x1, top]]])
      spans.push([id, Int32Array.from(ks)])
    }
    if (!part.left.length) return
    layoutParts(L, [part])
    layoutSpans(L, p, spans)
    state.parts.push(part)
    for (const f of state.followers) { f.addParts([part]); f.addSpans(p, spans) }
  }
  const takeNames = parts => {
    const pages = new Set()
    for (const part of parts) for (const r of part.layout?.names ?? []) {
      const id = nameOccurrenceId(r[0])
      if (id === null || namesTold.has(id) || (r[10] & NAME_FLAG.RUN_IN) !== 0) continue
      ;(namesOn.get(r[2]) ?? namesOn.set(r[2], []).get(r[2])).push([id, r[3], r[5], r[6], r[7]])
      pages.add(r[2])
    }
    for (const p of pages) tellNames(p)
  }
  // a table's cell no unit holds, what a point lights or a click levels by and a sentence's shape (which keeps from under a
  // float, highlight.mjs reachAt) read their pages' floats, made then
  const atPage = f => (page, x, y, padX, startsOf) => { floatsOn(page); return f(page, x, y, padX, startsOf) }
  const shapes = {
    ...base,
    // (a table's cell no unit holds is its page's float's: made then)
    runs: id => { if (isTableCell(id)) floatsOn(tableCellPage(id)); return base.runs(id) },
    sentence: (run, starts, s, padX) => { floatsOn(run.page); return base.sentence(run, starts, s, padX) },
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
      if (!parts.length) return
      if (layoutParts(L, parts)) {
        state.parts.push(...parts)
        for (const f of state.followers) f.addParts(parts)
      }
      takeNames(parts)
      takeCells(parts)
    },
    /** a page's left part (format.mjs ReadLeftPart): its part of the layout, and the mirrors'; false where it was in
     *  already or is refused — malformed, or its ids reach into another page's (one warning a page) */
    addPage(left) {
      let input
      try {
        if (L.pt[left.page]) return false
        input = leftPageInput(left)
        tellCells(input, false)
        if (!layoutPage(L, input.page, input)) return false
      } catch (e) { refuse(left?.page, e); return false }
      state.pages.set(input.page, input)
      // (a drawing's text no layout holds, nor its pairs: highlight.mjs DRAWING)
      for (const [id, words, tokens] of input.pairs) if (!DRAWING.has(kindOf(id))) (pairsOn.get(id) ?? pairsOn.set(id, new Map()).get(id)).set(input.page, [words, tokens])
      for (const f of state.followers) f.addPage(input)
      tellNames(input.page)
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
     * 80 % of it, sentenceStarts' TEXT_ONLY): what is shipped is read. The starts know each paired token's sentence by its
     * word (startsOfPairs): a glyph no word is paired with (a formula's, a script the text layer gives late) by the order
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
      return pairs && startsOfPairs({ tokens: L.anchors.get(id).tokens, pairs, bounded: true, coverage: 1 }, text, offsets)
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
const copyPart = part => ({ pages: [...part.pages], views: [...part.views], left: part.left.map(([id, stream, rects]) => [id, stream, rects.map(r => [...r])]), ...(part.quiet ? { quiet: true } : {}) })

/**
 * The right's shapes, the left's mirrored (trap 1): { layout, shapes, forget, dispose }. A layout of its own over its own copies
 * of what `source` (createShapes) was told and is told from now on — each part's rectangles and each page's tokens —, so
 * that its runs, blocks and sentence shapes equal the left's from objects of its own; a table's cell no unit holds is the
 * left's run of it copied. What a point lights is the right's own runs, the floats the left's; a sentence keeps from under
 * the left's floats, as the left's sentence does. `dispose` stops following the source
 */
export function mirror(source) {
  const state = told.get(source.shapes)
  if (!state) throw new TypeError('not a side\'s shapes (createShapes)')
  const R = pageLayout(state.kindOf), own = pdfShapes(R)
  const follower = {
    addParts: parts => layoutParts(R, parts.map(copyPart)),
    addPage: input => layoutPage(R, input.page, copyPage(input)),
    addSpans: (p, spans) => layoutSpans(R, p, spans.map(([id, ts]) => [id, ts.slice()])),
  }
  if (state.parts.length) follower.addParts(state.parts)
  for (const input of state.pages.values()) follower.addPage(input)
  state.followers.add(follower)
  // a sentence keeps from under the floats painted on its page (highlight.mjs reachAt), here the left's: the right's
  // layout reads the left's floats, made then, as they are now (their map is let go and made again with the left's)
  const floatsOf = p => { state.floatsOn(p); R.floats = source.layout.floats }
  const atPage = f => (page, x, y, padX, startsOf) => { floatsOf(page); return f(page, x, y, padX, startsOf) }
  // (a table's cell no unit holds, at its place on both panes: the left's run of it copied, the right's own (trap 1), made again
  // where the left's float is made again)
  const cellCopies = new Map()
  const cellRuns = id => {
    floatsOf(tableCellPage(id))
    const src = cellRunsOf(source.layout, id)[0]
    if (!src) return []
    let c = cellCopies.get(id)
    if (c?.src !== src) { c = { src, run: { ...src, rows: src.rows.map(r => ({ ...r })), mids: [...src.mids] } }; cellCopies.set(id, c) }
    return [c.run]
  }
  const shapes = {
    runs: id => (isTableCell(id) ? cellRuns(id) : own.runs(id)),
    block: own.block,
    sentence: (run, starts, s, padX) => { floatsOf(run.page); return own.sentence(run, starts, s, padX) },
    fits: own.fits,
    click: atPage(own.click),
    hit: atPage((page, x, y, padX, startsOf) => ownCell(floatHitOf(source.layout, page, x, y, padX, hitOf(R, page, x, y, padX, startsOf)), cellRuns)),
  }
  return { layout: R, shapes, forget: p => { R.cache.delete(p) }, dispose: () => { state.followers.delete(follower) } }
}

/** a laid page's token ids: page · 2^16 + its index in the page's table (a left part holds at most TOKENS_PAGE tokens, and a
 *  laid page as many as its words and the copies beside them), so that they rise page by page whatever comes first */
const BASE = 2 ** 16
const FIELDS = ['l', 'r', 'y', 'h', 'top', 'bottom']

/**
 * The right's shapes on the layer (the contract §2.7, step 4): on a page whose place shows the original, the left's mirrored
 * (mirror); on a page the layer has laid, a layout of the right's own over the page's words (the door's LaidPage.words: the
 * tokens the layer drew, in the page's PDF units, each unit's spans in paint order), and for each unit the layer shows there
 * as the original's (`words.original`) copies of the left's tokens of it (trap 1: never the left's arrays or runs). A laid
 * page's part is made once its left part is in too (the units shown as the original need it), in the same task.
 *
 * `lay(page, words)` a page laid (once a door: a ready page is final); `laid(page)` whether its part is in; `starts(id, text,
 * offsets, left)` a unit's starts on the right: of a unit all on laid pages, its words' (the token carrying each start's word,
 * `text` its plainTranslated and `offsets` its row's `sentences.tr`), each token's sentence read from the text — a word's by
 * its word, any other's by its place in the translation (`words.at`: a formula's, a display's kept line's) —; of a unit on no
 * laid page, the left's (`left`: the same tokens, mirrored); of one on both, none (it lights whole); `reset()` every page
 * back to the mirror (a door opened again); `mute(page, on)` a page that shows another target's layer, whose drawing neither the
 * laid layout nor the mirror describes: nothing of it lit or hit until it is unmuted (its new target's page laid, or the original's
 * shown), whatever reset() does;
 * `forget(page)` its geometry let go; `dispose()` stops following the source
 */
export function layerShapes(source) {
  const state = told.get(source.shapes)
  if (!state) throw new TypeError('not a side\'s shapes (createShapes)')
  const M = mirror(source)
  let L, words, made, wordAt, placeAt, noPlaces, hidden, namesKept, ours
  /** the pages that show another target's layer (mute): none of their geometry is the drawing's */
  const muted = new Set()
  /** the laid layout, told the parts as copies, each unit's stream just before its first page's tokens until that page lays */
  const tellParts = parts => layoutParts(L, parts.map(part => ({
    pages: [...part.pages], views: [...part.views],
    left: part.left.map(([id, , rects]) => [id, BASE * Math.min(...rects.map(r => r[0])) - 1, rects.map(r => [...r])]),
    ...(part.quiet ? { quiet: true } : {}),
  })))
  function reset() {
    L = pageLayout(state.kindOf)
    words = new Map(); made = new Set(); wordAt = new Map(); placeAt = new Map(); noPlaces = new Set(); hidden = new Set(); namesKept = new Map()
    ours = new Map()
    if (state.parts.length) tellParts(state.parts)
  }
  /** page p's part of the laid layout, where its words and its left part are in */
  function make(p) {
    const w = words.get(p), left = state.pages.get(p)
    if (made.has(p) || !w || !left) return false
    const original = new Set(w.original)
    // (a copy of a unit's left tokens stands where the left has it, which our page may not — a line our compile set on the page
    // beside, the drift the line check draws —: a unit the layout lays somewhere (`rows` holds it, its rows on this page, maybe
    // none) keeps a copy only on its own rows here; one it lays nowhere keeps none on a page whose lines moved (`drift`), and
    // elsewhere none on another unit's row. A line moved has no partner beside it, never a wrong one)
    const rowsOf = new Map(w.rows ?? []), all = w.rows ?? []
    // (and what a table's cell no unit holds is copied by, cellRuns: the words themselves are let go once the page is made)
    ours.set(p, { drift: !!w.drift, rows: all })
    const inRow = (rs, x, y) => { for (let j = 0; j + 3 < rs.length; j += 4) if (x >= rs[j] && x <= rs[j + 2] && y >= rs[j + 1] && y <= rs[j + 3]) return true; return false }
    const T0 = left.table
    const standsFor = (id, k) => {
      const x = (T0.l[k] + T0.r[k]) / 2, y = (T0.top[k] + T0.bottom[k]) / 2
      const own = rowsOf.get(id)
      if (own) return inRow(own, x, y)
      if (w.drift) return false
      for (const [, rs] of all) if (inRow(rs, x, y)) return false
      return true
    }
    const copied = left.spans.filter(([id]) => original.has(id)).map(([id, ts]) => [id, ts.filter(t => standsFor(id, t - left.first))])
    const n0 = w.tokens.n
    let n = n0
    for (const [, ts] of copied) n += ts.length
    const T = { n }
    for (const f of FIELDS) { T[f] = new Float32Array(n); T[f].set(w.tokens[f].subarray(0, n0)) }
    const word = new Int32Array(n).fill(-1), place = new Int32Array(n).fill(-1)
    word.set(w.word.subarray(0, n0))
    if (w.at) place.set(w.at.subarray(0, n0))
    else noPlaces.add(p)
    const base = BASE * p, spans = []
    for (const [id, ranges] of w.spans) {
      const ks = []
      for (let j = 0; j < ranges.length; j += 2) for (let t = ranges[j], end = t + ranges[j + 1]; t < end; t++) ks.push(base + t)
      spans.push([id, Int32Array.from(ks).sort()])
    }
    let at = n0
    for (const [id, ts] of copied) {
      const ks = new Int32Array(ts.length)
      for (let i = 0; i < ts.length; i++, at++) {
        const k = ts[i] - left.first
        for (const f of FIELDS) T[f][at] = left.table[f][k]
        ks[i] = base + at
      }
      spans.push([id, ks])
    }
    if (!layoutPage(L, p, { first: base, table: T, spans })) return false
    // a unit whose first page this is begins at its own first token here
    for (const [id, ks] of spans) if (ks.length && L.pagesOf.get(id)?.[0] === p) layoutStream(L, id, ks[0])
    made.add(p)
    wordAt.set(p, word)
    placeAt.set(p, place)
    // (the words are in the page's table now: let go, the page kept as given)
    words.set(p, null)
    return true
  }
  reset()
  const follower = {
    addParts: parts => tellParts(parts),
    addPage: input => { make(input.page) },
    // (units told after their page came, babel's names: on a page laid already, each begins at its own first token there, the
    // words the layer drew of it, as a unit whose page lays after it is told)
    addSpans: (p, spans) => {
      if (!made.has(p)) return
      for (const [id] of spans) { const ks = L.spans.get(id)?.get(p); if (ks?.length && L.pagesOf.get(id)?.[0] === p) layoutStream(L, id, ks[0]) }
    },
  }
  state.followers.add(follower)

  const laid = p => made.has(p) && !hidden.has(p)
  // (a babel name the layer left the original's on a laid page, in its `original`: its original's place is the left's, the
  // mirror's geometry of it lit and hit there, whenever its row came; units.mjs nameOccurrenceId)
  const keptName = (p, id) => namesKept.get(p)?.has(id) === true
  const laidFor = (p, id) => laid(p) && !keptName(p, id)
  const pagesOf = id => L.pagesOf.get(id) ?? M.layout.pagesOf.get(id) ?? []
  const mode = id => { const ps = pagesOf(id), n = ps.filter(p => laidFor(p, id)).length; return !n ? 'mirror' : n === ps.length ? 'laid' : 'mixed' }
  // a laid page's floats are the left's, as the mirror's are (made then)
  const floatsOf = p => { state.floatsOn(p); L.floats = source.layout.floats }
  // a table's cell no unit holds: the mirror's copy of the left's run, which stands where the left has it — on a laid page, as
  // a unit shown as the original's copy does (make), none where the page's lines moved (`drift`) or another unit's row of ours
  // stands at its middle; its numbers are the original's ink there
  const cellRuns = id => {
    const p = tableCellPage(id)
    if (muted.has(p)) return []
    const rs = M.shapes.runs(id), w = laid(p) ? ours.get(p) : null
    if (!w || !rs.length) return rs
    if (w.drift) return []
    const r = rs[0], x = (r.x0 + r.x1) / 2, y = (r.top + r.bottom) / 2
    for (const [, b] of w.rows ?? []) for (let j = 0; j + 3 < b.length; j += 4) if (x >= b[j] && x <= b[j + 2] && y >= b[j + 1] && y <= b[j + 3]) return []
    return rs
  }
  const shapes = {
    runs: id => (isTableCell(id) ? cellRuns(id) : pagesOf(id).filter(p => !muted.has(p)).flatMap(p => pageGeometry(laidFor(p, id) ? L : M.layout, p).byId.get(id) ?? [])),
    block: (run, padX) => blockOf(run, padX),
    sentence: (run, starts, s, padX) => { if (!laid(run.page)) return M.shapes.sentence(run, starts, s, padX); floatsOf(run.page); return sentenceOf(L, run, starts, s, padX) },
    fits: (id, starts, now) => { const m = mode(id); return m === 'laid' ? sentencesFit(L, id, starts, !now) : m === 'mirror' ? M.shapes.fits(id, starts, now) : false },
    hit: (page, x, y, padX, startsOf) => {
      if (muted.has(page)) return null
      if (!laid(page)) return M.shapes.hit(page, x, y, padX, startsOf)
      floatsOf(page)
      const h = ownCell(floatHitOf(source.layout, page, x, y, padX, hitOf(L, page, x, y, padX, startsOf)), cellRuns)
      if (h || !namesKept.has(page)) return h
      // (nothing of the laid drawing there: a name kept the original's, by the mirror's)
      const m = M.shapes.hit(page, x, y, padX, startsOf)
      return m && keptName(page, m.id) ? m : null
    },
    click: (page, x, y, padX, startsOf) => { if (muted.has(page)) return null; if (!laid(page)) return M.shapes.click(page, x, y, padX, startsOf); floatsOf(page); return clickOf(L, page, x, y, padX, startsOf) },
  }
  return {
    get layout() { return L },
    shapes,
    lay(p, w) {
      if (words.has(p) || !w?.tokens) return false
      words.set(p, w)
      const kept = (w.original ?? []).filter(isNameOccurrence)
      if (kept.length) namesKept.set(p, new Set(kept))
      make(p)
      return true
    },
    laid,
    /** a laid page whose place shows the original again (its copy failed, a stall): the mirror's there until it is shown
     *  again; whether that changed anything */
    hide: p => { if (hidden.has(p)) return false; hidden.add(p); return made.has(p) },
    show: p => hidden.delete(p),
    /** page p shows another target's layer (on) or no longer does: whether that changed anything */
    mute: (p, on) => (on ? (muted.has(p) ? false : (muted.add(p), true)) : muted.delete(p)),
    /** the pages muted, rising */
    muted: () => [...muted].sort((a, b) => a - b),
    starts(id, text, offsets, left) {
      const m = mode(id)
      if (m === 'mirror') return left ?? null
      // (a table with no places, `at`: its formulas and displays would go by the order, which the table need not keep)
      if (m === 'mixed' || !tokensIn(L, id) || pagesOf(id).some(p => noPlaces.has(p))) return null
      if (typeof text !== 'string' || !Array.isArray(offsets) || !offsets.every((o, j) => Number.isInteger(o) && o > (j ? offsets[j - 1] : 0) && o < text.length)) return null
      const ts = L.anchors.get(id)?.tokens ?? [], out = new Int32Array(offsets.length), ws = []
      for (let j = 0, from = 0; j < offsets.length; j++) {
        const w = wordsOfText(text.slice(0, offsets[j])).length
        let k = -1
        for (; from < ts.length && k < 0; from++) { const t = ts[from], p = Math.floor(t / BASE); if (wordAt.get(p)?.[t - BASE * p] === w) k = t }
        if (k < 0 || k <= (j ? out[j - 1] : ts[0])) return null
        out[j] = k
        ws.push(w)
      }
      // (each token's sentence by the text: a word's by its word, any other token's by its place in the translation — a
      // formula's, a display's kept line's —; a copy of the left's, none: the order)
      const offs = offsets.slice()
      return withSentences(out, t => {
        const p = Math.floor(t / BASE), i = t - BASE * p, w = wordAt.get(p)?.[i]
        if (w !== undefined && w >= 0) return atMost(ws, w)
        const a = placeAt.get(p)?.[i]
        return a !== undefined && a >= 0 ? atMost(offs, a) : -1
      })
    },
    reset,
    forget: p => { L.cache.delete(p); M.forget(p) },
    dispose: () => { state.followers.delete(follower); M.dispose() },
  }
}
