// The page pass (E2b, the prepare-pipeline design §2.2 steps T and 3 to 8): a paper's layer (bundle 4) made from the marked
// original's marks and arXiv's PDF, and told a part at a time to its host: the left (anchorUnits under the unit marks, leftSideOf),
// the layout file (makeLayout, its operator lists read once for the cell rules too), and the cut (layer-proto/cut.mjs partCutter, cutBundle's own), each
// part judged as it is cut by its own reader's reading of it (readPart), a part refused the same pages with no layout. Under the page stream's rules 1, 3 and 4, the default
// (layout/make.mjs DEFAULT_RULES), the frame, the column edges and the far-push columns are each had a page at a time, and the
// pass is a page stream (the marked original read beside arXiv's): each part cut as soon as what it reads is final, the same
// parts as the whole path's under those rules. Under the whole run's rules (WHOLE_RULES, next's before the stream) they read
// the whole document, so every part is cut once the whole is known (one flush at the end); the parts are then cutBundle's of
// the same whole, byte for byte, wherever no verdict refuses one. What a part holds at most, and what the pass holds of
// arXiv's ink (GLYPHS_PAGE glyphs and BOXES_PAGE boxes a page, the boxes past it merged by cell; a page past a cap dark):
// docs/PDF-READER.md
// §19.6.
//
// An original module (no port statement). It imports the engine's own modules alone, by relative path.
import { BundleRefusal } from '../layer-proto/bundle.mjs'
import { PART_PAGES_MAX, partCutter, wholeCutter, wholeFrontier } from '../layer-proto/cut.mjs'
import { chunkTotals, deltaBaseWhy, groupsOfUnits, indexOf, layerDraws, partTarget, readHead, readPart, readUnitsChunk, TOKEN_LIMIT, whyText, writeHead, writeUnitChunks } from '../layer-proto/format.mjs'
import { needBound } from '../layer-proto/need.mjs'
import { figureRow } from '../layer-proto/figure-rows.mjs'
import { bundleUnitsOf, NAME_KIND, UNIT_FLAG_BITS } from '../layer-proto/units.mjs'
import { readArxivText } from '../layout/arxiv.mjs'
import { boxesCheck, finalCheck, markTextBeyond, markTextOf, pageTextAt, prefixDoc, textOfPdf } from '../layout/base.mjs'
import { lineCheckOf } from '../layout/carry.mjs'
import { countOf, DELTA_MAX_BYTES, DELTA_MAX_SHARE, DELTA_WHYS, deltaSection, pagesOf, replacedWhy, wrapWhy } from '../layout/delta-wire.mjs'
import { texLiveOf } from '../layout/guard.mjs'
import { makerOf, rulesOf } from '../layout/make.mjs'
import { markedPages, marksOfHead, readMarked } from '../layout/marks.mjs'
import { FIGURE_KIND } from '../rules/content-classes.mjs'
import { displayEdges, isName, proseOf, unitText } from '../translate/mt.mjs'
import { columnsOfTokens, pageColumns } from '../view/highlight.mjs'
import { anchorUnits, boundsFromMarks, floatMatches, frameOfTokens, pageFrame, pageIndex } from './anchors.mjs'
import { rangedAnchors } from './left-part.mjs'
import { leftSideOf, leftSideStream } from './left-side.mjs'
import { bundleWithInk, figureAnchors, inkAnchors, inkOfHost, inkWithinChunks, layoutWithInk, streamWithInk } from './ink-pass.mjs'
import { isMemoryError } from './memory.mjs'

/** units TeX sets away from where the source has them (anchors.mjs `floating`), as the maker and the web's left take them */
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure', 'affiliation'])
const why = e => String(e?.message ?? e).slice(0, 200)
/** the why each refusal word says where none was given */
const PLAIN_WHY = Object.freeze({ compile: 'the marked compile was refused', texlive: 'the paper needs another TeX Live', engine: 'the host does not run the paper\'s compiler', marks: 'the marked original could not be read', final: 'there is no final pass of the marked original', boxes: 'our pages are not arXiv\'s', wrap: 'our pages could not be wrapped by optional content' })
/**
 * Why a part has no layout, as its record says it (layer-proto/format.mjs LAYOUT_REFUSED: `{ refused, why }`, `why` within
 * WHY_MAX): the paper's refusal — the marked original's (layout/paper.mjs markedOfPaper's 'compile', 'texlive', 'engine',
 * 'marks', and the probe's), the page count's, the maker's ('carry': no unit laid, no page with a unit on it arXiv's page; its throw
 * 'failed', a refusal of its own; 'memory', 'clock' and 'crashed', the host's re-cut after a maker that died) — or the part's own (a verdict's 'read', a part's bound's 'part'). TeX's and the carry's say
 * so; every fault of the engine's own (the probe, the reading, the maker, a part's reader) is `marks`. Null for none
 */
export function layoutRecordOf(r) {
  if (!r?.refused) return null
  // (a why given, as a log's or a host's text may hold, without its control characters: whyText)
  const given = typeof r.why === 'string' ? whyText(r.why) : '', said = (lead, w = given) => whyText(`${lead}${w ? `: ${w}` : ''}`)
  switch (r.refused) {
    case 'compile': case 'texlive': case 'engine': case 'marks': case 'final': case 'boxes': case 'wrap': return { refused: r.refused, why: given || PLAIN_WHY[r.refused] }
    case 'carry': {
      const n = r.stats?.units?.total
      return { refused: 'carry', why: whyText(Number.isInteger(n) ? `0 of the ${n} units on a page that is arXiv's page` : 'no unit on a page that is arXiv\'s page') }
    }
    case 'probe': return { refused: 'marks', why: said('the mark probe gave no log') }
    case 'failed': return { refused: 'marks', why: said('the layout maker failed') }
    case 'read': return { refused: 'marks', why: said('its own reader refused its layout') }
    case 'part': return { refused: 'marks', why: said('its layout passes a part\'s bounds') }
    // (the host's re-cut after a maker that died — of its memory, past its clock, or otherwise: the web's maker death table —,
    // no refusal of the maker's own)
    case 'memory': return { refused: 'marks', why: said('the layout maker ran out of memory, and the parts were cut again without it') }
    case 'clock': return { refused: 'marks', why: said('the layout maker passed its clock, and the parts were cut again without it') }
    case 'crashed': return { refused: 'marks', why: said('the layout maker exited, and the parts were cut again without it') }
    default: return { refused: 'marks', why: said(`the layout maker refused it (${String(r.refused).slice(0, 40)})`) }
  }
}
/**
 * The figure units the wrap drew (layout/wrap.mjs wrapFinal's `figures`, the host's `ours.wrap.figures`; none where it gives none):
 * each an ink unit of kind inkfigures (format.mjs INK_UNITS_FORMAT: no echo) appended to `bundle` after the paper's own units and
 * the other ink units, its one text piece our glyphs' text as the front
 * end holds a source's (its UTF-8 bytes), KEPT where it is only names (mt.mjs isName against `prose`, the paper's running text: a
 * dataset's or a model's name keeps its source, as a table's cell of names does), and its row (layer-proto/figure-rows.mjs
 * figureRow) in a Map by page; none on a page
 * past our `M` pages or that the line check says is not drawn (`undrawable`: its units the original's, so are its figures)
 */
export function figureUnits(given, { bundle, undrawable, M, prose = '' }) {
  const byPage = new Map()
  if (!given || !Array.isArray(given.units)) return byPage
  const skip = new Set(undrawable ?? [])
  for (const u of given.units) {
    if (!u || typeof u !== 'object' || !Number.isInteger(u.page) || u.page < 1 || u.page > M || skip.has(u.page) || typeof u.text !== 'string' || !/\S/u.test(u.text)) continue
    const id = bundle.length
    // (a label that is only names, a dataset's, a model's, keeps its source, as a table's cell of names does: mt.mjs isName)
    bundle.push([FIGURE_KIND, isName(u.text, prose) ? UNIT_FLAG_BITS.KEPT : 0, null, null, null, [[0, latin1Of(u.text)]], null])
    const list = byPage.get(u.page) ?? byPage.set(u.page, []).get(u.page)
    list.push(figureRow(id, u))
  }
  return byPage
}
/** a text as the front end holds a source's: its UTF-8 bytes, one character a byte (mt.mjs utf8 reads it back) */
const latin1Of = t => { let s = ''; for (const b of new TextEncoder().encode(t)) s += String.fromCharCode(b); return s }

/** a value a left part's wire carries: finite, within ±TOKEN_LIMIT */
const fits = v => Number.isFinite(v) && v >= -TOKEN_LIMIT && v <= TOKEN_LIMIT

/**
 * arXiv's tokens the left is anchored on: step T's, less any token a left part's wire cannot carry (a field not finite or past
 * ±TOKEN_LIMIT: a crafted transform's), each kept token's ink edges with it. Where none is dropped (every paper of the corpus),
 * step T's own arrays
 */
function fitted(text) {
  const { tokens, edges, spans } = text
  const keep = []
  for (let k = 0; k < tokens.length; k++) {
    const w = tokens[k]
    const x0 = Number.isFinite(spans.x0[k]) ? spans.x0[k] : w.x, x1 = Number.isFinite(spans.x1[k]) ? spans.x1[k] : x0
    if (fits(x0) && fits(x1) && fits(w.x) && fits(w.x + w.w) && (w.sym == null || fits(w.sym)) && fits(w.y) && fits(w.h) && fits(w.top) && fits(w.bottom)) keep.push(k)
  }
  if (keep.length === tokens.length) return { tokens, edges }
  return { tokens: keep.map(k => tokens[k]), edges: { l: Float64Array.from(keep, k => edges.l[k]), r: Float64Array.from(keep, k => edges.r[k]) } }
}

/**
 * Our base page's checks (design §3.3, the page-and-line check, after the guard): `ours` { doc, bytes, sha256, xref, text?, check? }
 * (or { refused, why } / null: no base of ours), `draft` a PDF.js document of the marked original the marks were read from (its
 * destinations the final pass's must be: base.mjs finalCheck; null where the host checked it, `ours.check`), `arxiv` { doc, text }
 * arXiv's PDF and its text, `tree` the TeX Live year our compile was made on. In turn: the base page's text read (ours.text, else
 * readArxivText with `draw`), its page count arXiv's ('boxes'), no mark of ours printed as text on it ('marks'), the final pass
 * the draft's page ('final'), every page box arXiv's ('boxes': boxesCheck), and the year known ('final'); then the line check
 * (carry.mjs lineCheckOf of the two texts' tokens: each page drawable or not, its words arXiv's page's), which the maker lays each
 * unit by (layout/make.mjs drawable: every page it is on), its share of our lines in place the head's `carried`,
 * information alone. { text, lineCheck, head, doc } (the head's base of ours, BUNDLE 8, and the document the maker reads), or the
 * first failing reason { refused, why }. Our pages fewer than arXiv's (M < N) pass only for a paper of several toplevel sources
 * (`toplevels` > 1, the first compiled alone) whose base is held as a delta over arXiv's PDF (`delta`: the pages past ours are
 * then the original's by construction): its document is ours then arXiv's past M (base.mjs prefixDoc), its boxes compared on
 * our M pages (arXiv's own past them), its check's pages [M, N]; every other paper keeps the equal count. `delta` the pages
 * the delta replaces (or true, every page of ours): the document is ours on those alone and arXiv's on every other (the
 * composed document's pages), and no unit is laid on a page it does not replace (the line check's `undrawable`). What the page pass
 * checks before its head, and the lab's makers with it (the gate pack's base pages). Never throws but a failed allocation
 */
export async function checkOurBase({ ours, draft = null, arxiv, tree = null, draw = true, toplevels = 1, delta = false }) {
  const no = (refused, why, extra = {}) => ({ refused, why: whyText(why), ...extra })
  const own = ours?.doc ?? null
  // (a final pass whose wrap was refused (layout/wrap.mjs wrapFinal: `wrap-<code>`) is no base of ours either: `wrap`)
  if (!own) { const k = ours?.refused === 'wrap' ? 'wrap' : 'final'; return no(k, typeof ours?.why === 'string' && ours.why ? ours.why : PLAIN_WHY[k]) }
  const { doc, text } = arxiv, N = doc.numPages
  const M = own.numPages
  // (a delta: `true`, every page of ours replaced, or the pages it replaces; the composed document is ours on those alone)
  const held = delta === true || Array.isArray(delta), rep = Array.isArray(delta) ? new Set(delta) : null
  const prefix = Number.isInteger(M) && M >= 1 && M < N && toplevels > 1 && held
  const last = prefix ? M : Math.min(M, N)
  const partial = rep !== null && Array.from({ length: last }, (_, i) => i + 1).some(p => !rep.has(p))
  const composed = prefix || partial
  const oursDoc = composed ? prefixDoc(own, doc, last, rep) : own
  const baseText = !composed && ours.text && ours.text.pages === oursDoc.numPages ? ours.text : await readArxivText(oursDoc, { draw })
  if (baseText.pages !== N) return no('boxes', `our base page has ${baseText.pages} pages, arXiv's PDF ${N}`)
  // (the mark text on our pages: the text's, else read here from our page; a hit arXiv's own page holds the same is the paper's
  // text, no mark of ours)
  let shown = baseText.markText ?? markTextOf(await textOfPdf(oursDoc))
  if (shown.pages.length) {
    const ourPages = [], theirPages = []
    for (const p of shown.pages) { ourPages[p - 1] = await pageTextAt(oursDoc, p); theirPages[p - 1] = p <= N ? await pageTextAt(doc, p) : '' }
    shown = markTextBeyond(ourPages, theirPages)
  }
  if (shown.pages.length) return no('marks', `a mark of ours stands as text on page ${shown.pages[0]} of our base page${shown.samples?.[0] ? ` (${shown.samples[0][1]})` : ''}`)
  let fc = null
  try { fc = draft ? await finalCheck(draft, own) : ours.check ? { ok: true } : { ok: false, why: 'it was not checked against the draft' } } catch (e) {
    if (isMemoryError(e)) throw e
    fc = { ok: false, why: `it could not be read: ${why(e)}` }
  }
  if (!fc.ok) return no('final', `the final pass is not the draft's page: ${fc.why}`)
  let bc = null
  try { bc = await boxesCheck(oursDoc, doc) } catch (e) {
    if (isMemoryError(e)) throw e
    bc = { equal: false, why: `a page box could not be read: ${why(e)}` }
  }
  if (!bc.equal) return no('boxes', bc.why)
  if (typeof tree !== 'string' || !/^\d{4}$/.test(tree)) return no('final', 'the TeX Live year our compile was made on is not known')
  // the line check: each page drawable or not, each line in place or not (carry.mjs lineCheckOf over the two texts'
  // tokens), the maker's to lay each unit by; the paper's share information alone; no position is carried
  const checked = lineCheckOf(baseText.tokens, text.tokens), L = checked.lines
  // (under a delta a page it does not replace is the original's in the composed document: no unit is laid on it, one rule — a
  // page laid is a page replaced — so that what the layer draws over is ours)
  const lineCheck = rep === null && !prefix ? checked : laidOnReplaced(checked, p => p <= last && (rep === null || rep.has(p)))
  return { text: baseText, lineCheck, doc: oursDoc, head: { source: 'ours', bytes: ours.bytes, sha256: ours.sha256, xref: ours.xref, pages: N, tree, check: { pages: [prefix ? M : N, N], boxes: 'equal', carried: L.total > 0 ? L.placed / L.total : 0 } } }
}

/** a line check whose pages not replaced by the delta (`replaced(p)` false) are not drawable: no unit laid there */
function laidOnReplaced(check, replaced) {
  const undrawable = new Set(check.undrawable)
  const pages = check.pages.map(e => (replaced(e.page) ? e : (undrawable.add(e.page), { ...e, drawable: false, delta: 'not replaced' })))
  return { ...check, pages, undrawable: [...undrawable].sort((a, b) => a - b) }
}

/**
 * The delta the host gave with our base page (`ours.delta`: layout/delta.mjs deltaOf's { bytes, sha256, replaced, stats },
 * built in the maker child once the maker let its documents go, and proved there), checked before the head names it: its
 * shape and bounds (DELTA_MAX_BYTES, DELTA_MAX_SHARE of our base page's bytes), its digest, its section exact over arXiv's PDF
 * (`orig`: delta-wire.mjs deltaSection, /Prev the original's startxref), its replaced pages within our `M`, exactly the pages
 * whose objects (arXiv's PDF.js document `doc`) its section writes, and the head's reader taking it (format.mjs deltaBaseWhy). { delta: { bytes, sha256, xref, replaced, stats } } or { why } (a DELTA_WHYS code
 * and its reason: the host's refusal it passed, or `delta-shape`). Never throws but a failed allocation: a delta that fails is a
 * whole base, never a refused paper
 */
async function deltaOfOurs(given, { orig, ours, M, N, tree, doc }) {
  const shape = why => ({ why: 'delta-shape', reason: whyText(why) })
  if (given === null || given === undefined) return null
  if (typeof given !== 'object') return shape('not an object')
  if (Object.hasOwn(given, 'refused')) return { why: DELTA_WHYS.includes(given.refused) ? given.refused : 'delta-shape', reason: whyText(given.why ?? '') }
  const { bytes, sha256, replaced, stats } = given
  // (our pages more than arXiv's: no composed document holds them, as deltaOf refuses them)
  if (!Number.isInteger(M) || M > N) return { why: 'delta-pages', reason: `our base page has ${M} pages, arXiv's PDF ${N}` }
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > DELTA_MAX_BYTES) return shape(`not 1 to ${DELTA_MAX_BYTES} bytes`)
  if (bytes.length > DELTA_MAX_SHARE * ours.bytes) return { why: 'delta-bound', reason: `${bytes.length} bytes, past ${DELTA_MAX_SHARE} of our base page's ${ours.bytes}` }
  let digest
  try { digest = await digestOf(bytes) } catch (e) { if (isMemoryError(e)) throw e; return shape('its digest could not be made') }
  if (digest !== sha256) return shape('not the bytes its digest names')
  const sect = deltaSection(bytes, { bytes: orig.bytes, xref: orig.xref })
  if (sect.why) return shape(`its section: ${sect.why}`)
  const base = { source: 'ours', kind: 'delta', bytes: bytes.length, sha256, xref: sect.startxref, pages: N, tree: typeof tree === 'string' ? tree : '0000', check: { pages: [M, N], boxes: 'equal', carried: 0 }, replaced, stats }
  const bad = deltaBaseWhy(base, { bytes: orig.bytes, sha256: orig.sha256, xref: orig.xref }, N)
  if (bad !== null) return shape(bad)
  // (`replaced` bound to the delta's bytes: each replaced page's object, by arXiv's PDF.js document, among its section's entries,
  // and no other page's: a reader's copy of an unreplaced page trusts the list)
  const rows = new Set(sect.rows.map(([n, g]) => `${n} ${g}`)), rep = new Set(pagesOf(replaced))
  for (let p = 1; p <= N; p++) {
    let ref = null
    try { ref = (await doc.getPage(p))?.ref ?? null } catch (e) { if (isMemoryError(e)) throw e }
    if (!Number.isInteger(ref?.num) || !Number.isInteger(ref?.gen)) return shape(`page ${p}'s object is not known`)
    if (rows.has(`${ref.num} ${ref.gen}`) !== rep.has(p)) return shape(`page ${p} is ${rep.has(p) ? 'named and not written' : 'written and not named'} by the delta`)
  }
  return { delta: { bytes, sha256, xref: sect.startxref, replaced: base.replaced, stats: base.stats } }
}
/** SHA-256 of the bytes, lower-case hex (Web Crypto) */
async function digestOf(bytes) {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  let s = ''
  for (let i = 0; i < d.length; i++) s += d[i].toString(16).padStart(2, '0')
  return s
}

/**
 * A paper's layer made and told part by part. `paper` { id, version }; `source` openPaper's paper (its units, ids their
 * indices); `marks` layout/paper.mjs layoutMarksOfPaper's result ({ marks, unitMarks }, or { refused }: no layout, the left by
 * the units' text alone; a refusal's `own`, the unmarked original's verdict, kept in `stats.layout` and in no part); `arxiv` { doc, text? }: a PDF.js document of arXiv's PDF (the caller's to open and destroy) and its
 * text as readArxivText read it (step T: with `{ draw }` as this pass's, so that the draw reads no page's text again), else read
 * here; `OPS` PDF.js's operator codes; `pdfjs` its version; `base` { bytes,
 * sha256, xref } of arXiv's PDF (the head's); `image` the compiler image's name. `frame`: the frame's rule both anchorings are placed
 * under (anchors.mjs pageFrame by default, read under rules.frame 'units'); `columns`: the left's far-push columns' rule
 * (view/highlight.mjs, read under rules.columns 'units'). `rules` (layout/make.mjs RULES, DEFAULT_RULES' each where not given:
 * rules 1, 3 and 4 on, rule 5 off): `frame` 'tokens' both anchorings under the frame of arXiv's text alone
 * (rule 1, anchors.mjs frameOfTokens, made once), `edges` 'earlier' the maker's columns' edges of the pages before a page and
 * its own alone (rule 3), `columns` 'tokens' the left's far push under the columns of arXiv's text alone (rule 4,
 * view/highlight.mjs columnsOfTokens), `floatSearch` 'forward' both anchorings' floats searched from the page of their last
 * body neighbour on (rule 5: `source.inFloat`, the units written inside a float, given); a rule given there is taken over
 * `frame` and `columns`.
 * `verdicts` (default on): each part judged as it is cut, its reader taking it; off, the parts are cutBundle's of the same whole.
 *
 * `marked` { doc, log, options } in place of `marks`: the marked original to be read here (a PDF.js document of it, the
 * caller's to open and destroy, its last pass's log, markedPages' options but the units and the operator codes): read whole
 * first (readMarked, as the prepare's marks stage reads it; its refusal the marks'), or in a page stream a page at a time.
 * A marked original, given either way, of fewer pages than arXiv's PDF gives no layout and no unit marks: the compile's
 * refusal (`stats.layout` { refused: 'compile', why }), the layer that of a paper whose marked compile was refused; but for a
 * paper of several toplevel sources (`source.meta.toplevels`), whose marked original is its first file's alone: its pages are
 * compared with arXiv's first, the carry judging them (`stats.toplevels`). Each part with no layout carries why in its place
 * (layoutRecordOf: the paper's refusal, the maker's, or the part's own; the wire's `layout: { refused, why }`, BUNDLE 6).
 *
 * Under the whole run's rules (WHOLE_RULES) the maker's frame and the columns' edges read the whole document, so every part is
 * cut at the end (stage 1). `oracle` (tests and the lab: what a whole run of the same paper gave, `capture`'s): { frame, columnEdges }, the
 * maker's frame predicate and edges given, the maker made a page at a time (layout/make.mjs stream), arXiv's ink let go as
 * its pages are done, and each part cut as soon as everything it reads is final (`stats.closed`: each part's pages and the
 * arXiv page read when it was cut); the same parts. With `marked`, also { leftFrame, columns }, the left's frame predicate
 * and its pages' columns: the marked original read a page at a time beside the base page (its page p, then the base page p),
 * the left anchored by ranges as the unit marks' pages are read (stage 2's streaming; markedStream). `capture` (an object):
 * the whole run's four rules written there, an oracle's.
 *
 * The production stream: under rules 1, 3 and 4 (`rules` { frame: 'tokens', edges: 'earlier', columns: 'tokens' }) every
 * predicate is had a page at a time with no whole run before it (the frames and the far push's columns of arXiv's text
 * alone, made at step T; the columns' edges of the pages before a page, the maker's own), so the pass is the oracle's
 * stream with those, the marks given (the left anchored whole first) or the marked original read here (a page at a time
 * beside arXiv's): the same parts as the whole path's under the same rules, cut as soon as what they read is final; the default.
 * `whole` (tests and the lab) asks for the whole path, the whole made first, whatever the rules; `capture` runs it too
 *
 * Told in order: `onHead(head, units)` (the head and the units' chunks), then for each part its left parts (`onLeft(written)`,
 * each page's once) and the part (`onPart(written, note)`), each awaited. `note`: { pages, layout: 'kept' | 'none' |
 * { refused, ... }, lines: [carried, total] of its marked pages }. Returns { through, count, stats: { left, layout, rules } }, or { refused: 'anchors', why } before anything is told (arXiv's PDF read for no unit, or not read). A failed
 * allocation is thrown; a throw of the maker's is the layout's (none, `stats.layout`), never the paper's
 *
 * Our compile as the base page (BUNDLE 8, the layer route's step 2, design note §3.3): `ours` { doc, bytes, sha256, xref, text?,
 * check? } the final pass of the marked original (layout/paper.mjs markedOfPaper `base`: a PDF.js document of it, the
 * caller's to open and destroy, opened as arXiv's is for the draw, and its bytes, digest and startxref), `orig` { bytes,
 * sha256, xref } arXiv's PDF (`arxiv`'s; `base` is taken for it where `orig` is not given, BUNDLE 7's name), `tree` the TeX Live year
 * our compile was made on (else its log's, `marked.log`). The layout is made over ours (the maker's document, its text read
 * here or given), the left on arXiv's text, once ours passes the page-and-line check, each in turn, before the head: the guard
 * (a marked original refused or of other pages: its refusal), no mark printed as text on our pages ('marks': arxiv.mjs
 * `markText`), the final pass placing every mark where the draft does ('final': base.mjs finalCheck against `marked.doc`,
 * else `ours.check`, a host's check of it), and every page box arXiv's ('boxes': boxesCheck): checkOurBase, whose line check
 * (carry.mjs lineCheckOf of our text's tokens over arXiv's) the maker lays each unit by, every page it is on arXiv's page,
 * the others left the original's. The head's base is then ours ({ source: 'ours', …, check }, `orig` arXiv's PDF). Where the host gives `ours.delta` (layout/delta.mjs deltaOf's { bytes, sha256, replaced, stats }
 * of our final pass over arXiv's PDF, built and proved in the maker child) and it checks (deltaOfOurs: its shape, bounds, digest
 * and section over `orig`), the head's base is that delta (`kind` 'delta', the composed document arXiv's
 * bytes and the delta's, `stats.delta`); a delta that does not check leaves our whole PDF the base (`stats.delta` { kind:
 * 'full', why }), never the paper refused. Only a delta lets our pages be fewer than arXiv's, for a paper of several toplevel
 * sources (checkOurBase). A paper that fails, that has no base of ours (`ours` null, or { refused, why }: no final pass,
 * 'final'), or none of whose units is on a page that is arXiv's page (no unit laid, the maker's 'carry': in the page stream the head
 * waits for the first unit laid, so that nothing is told before), falls back: its head's base arXiv's PDF ({ source: 'arxiv', …, why
 * }) and every part with no layout, its record the same why. The layout is never made over arXiv's PDF: a host that gives no
 * base of ours (BUNDLE 7's, arXiv's PDF alone as `base`) has every paper fall back ('final')
 */
export async function layerOfPaper({ paper, source, marks = null, marked = null, arxiv, ours = null, orig = null, base: given0 = null, tree: treeGiven = null, OPS, pdfjs, image, onHead = null, onLeft, onPart, verdicts = true, frame: frameGiven = pageFrame, columns: columnsGiven = undefined, rules: rulesGiven = null, oracle = null, capture = null, whole: wholeAsked = false, draw = true }) {
  const rules = rulesOf(rulesGiven)
  // (the page stream without a whole run before it: rules 1, 3 and 4 give every predicate a page at a time, the frames and the
  // far push's columns of arXiv's text alone, the columns' edges of the pages before a page: the default; else, or `whole` asked
  // (tests and the lab), the whole path, the whole made first; with an oracle, the oracle's predicates)
  const streams = !wholeAsked && !capture && (!!oracle || (rules.frame === 'tokens' && rules.edges === 'earlier' && rules.columns === 'tokens'))
  if (typeof onLeft !== 'function' || typeof onPart !== 'function') throw new TypeError('onLeft, onPart: the host\'s sinks')
  if (marks && marked) throw new TypeError('marks or marked: the marked original read, or to be read here, not both')
  const isRef = b => Number.isInteger(b?.bytes) && typeof b?.sha256 === 'string' && Number.isInteger(b?.xref)
  const origRef = orig ?? given0
  if (!isRef(origRef)) throw new TypeError('orig: arXiv\'s PDF\'s bytes, digest and startxref')
  const oursDoc = ours?.doc ?? null
  if (oursDoc && !isRef(ours)) throw new TypeError('ours: our base page\'s document, and its bytes, digest and startxref')
  const { doc } = arxiv
  const N = doc.numPages
  // (arXiv's text, the left's and the line check's: no draw, which is the base page's)
  const text = arxiv.text ?? await readArxivText(doc)
  if (text.pages !== N) throw new TypeError(`arXiv's text is of ${text.pages} pages, its document of ${N}`)
  // a marked original of fewer pages than arXiv's PDF is a compile that did not make the paper arXiv made, however much of it
  // carries: no layout of it and none of its unit marks, the compile's refusal as markedOfPaper's (2610.20713, TL2025's 7 pages
  // of 15 before its hundredth error, 95 % of its lines carried; 2608.03994, 14 of 17, its tables broken by 751 errors TeX went
  // past, 97 % carried). Of 141 compiles of an original counted against arXiv's PDF (2026-10-19: the corpus's 113, the
  // survey's 28 on TL2025 and TL2023) the other 139 have arXiv's count, none more: so fewer by any page is refused, more is
  // the carry's to judge. The count is the open document's (`marked`) or the marks' own (`marks`): nothing more is read for it.
  // A paper of several toplevel sources (00README's or guessed, `meta.toplevels`: 2610.20030's manuscript and supplement) is compiled by
  // arXiv one after the other into one PDF, and by the pipeline from the first alone (its units): its marked original's M
  // pages are compared with arXiv's first M, the carry judging them, the pages past them laid with no unit marks of theirs.
  // That the further files' units are not read at all (their pages left the original's, unlocated, with no unit to place)
  // is a known residual (R1 item 3): their own compiles and units, the pages offset, are later work
  const M = marked ? marked.doc?.numPages : marks && 'marks' in marks ? marks.marks?.pages : null
  const toplevels = source.meta?.toplevels ?? 1
  if (Number.isInteger(M) && M < N && toplevels <= 1) {
    marks = { refused: 'compile', why: `the marked original has ${M} pages, arXiv's PDF ${N}` }
    marked = null
  }
  const several = toplevels > 1 ? { files: toplevels, pages: [Number.isInteger(M) ? M : null, N] } : null
  const units = source.units
  const texts = units.map((u, i) => ({ id: i, ...unitText(u.pieces), ...displayEdges(u) }))
  const floating = id => FLOATING.has(units[id]?.kind ?? '')

  // our base page and its checks (design §3.3), each in turn before anything is told: the first that fails is the paper's
  // fallback, the marks' refusal with its why (no maker, every part with no layout), its head's base arXiv's PDF
  // (and how it is held: a delta over arXiv's PDF where the host gave one that checks, else our whole PDF, `stats.delta` saying
  // which and why)
  let baseDoc = null, baseText = null, lineCheck = null, oursHead = null, deltaStat = null
  // our pages wrapped by optional content (layout/wrap.mjs wrapFinal, in the maker child: `ours.wrap` its stats, unhidden and
  // labelKept, `ours` the wrapped bytes' document, length, digest and startxref): written into the head's base of either kind
  const wrap = ours?.wrap ?? null
  if (wrap !== null) {
    // (`pages` required, the wrapped pages as ranges within our pages, as many as `stats.wrapped` says)
    const M0 = oursDoc?.numPages ?? 0
    const pagesWhy = !Array.isArray(wrap.pages) ? 'pages: missing' : wrap.pages.length === 0 ? (wrap.stats?.wrapped === 0 ? null : 'pages: none, and pages wrapped') : replacedWhy(wrap.pages, M0) !== null ? `pages: not page ranges within our ${M0} pages` : countOf(wrap.pages) !== wrap.stats?.wrapped ? 'pages: not the pages `stats.wrapped` counts' : null
    const why = wrapWhy(wrap.stats, wrap.unhidden, wrap.labelKept) ?? pagesWhy
    if (why !== null) throw new TypeError(`ours.wrap: ${why}`)
  }
  if (!(marks && !('marks' in marks))) {
    const tree = treeGiven ?? (marked ? texLiveOf(marked.log) : null)
    const held = oursDoc ? await deltaOfOurs(ours.delta, { orig: origRef, ours, M: oursDoc.numPages, N, tree, doc }) : null
    const checked = await checkOurBase({ ours, draft: marked?.doc ?? null, arxiv: { doc, text }, tree, draw, toplevels, delta: held?.delta ? pagesOf(held.delta.replaced) : false })
    if ('refused' in checked) { marks = { refused: checked.refused, why: checked.why }; marked = null }
    else {
      ({ text: baseText, lineCheck, head: oursHead, doc: baseDoc } = checked)
      // (a delta must write again every page our wrap wrapped: a unit's group on a page it leaves arXiv's could not be hidden there)
      if (held?.delta && wrap) {
        const rep = new Set(pagesOf(held.delta.replaced)), left = pagesOf(wrap.pages).find(p => !rep.has(p))
        if (left !== undefined) { held.why = 'delta-shape'; held.reason = whyText(`page ${left} is wrapped and the delta does not replace it`); held.delta = null }
      }
      if (held?.delta && held.delta.replaced.at(-1)[1] <= oursHead.check.pages[0]) {
        const d = held.delta
        oursHead = { source: 'ours', kind: 'delta', bytes: d.bytes.length, sha256: d.sha256, xref: d.xref, pages: N, tree: oursHead.tree, check: oursHead.check, replaced: d.replaced, stats: { ...d.stats, ...(wrap ? wrap.stats : {}) }, ...(wrap ? { unhidden: wrap.unhidden, labelKept: wrap.labelKept } : {}), ...(wrap?.ledger ? { ledger: wrap.ledger } : {}) }
        deltaStat = { kind: 'delta', bytes: d.bytes.length, replaced: d.stats.replaced }
      } else {
        if (held) deltaStat = { kind: 'full', why: held.why ?? 'delta-shape', ...(held.reason ? { reason: held.reason } : {}) }
        if (wrap) oursHead = { ...oursHead, stats: wrap.stats, unhidden: wrap.unhidden, labelKept: wrap.labelKept, ...(wrap.ledger ? { ledger: wrap.ledger } : {}) }
      }
    }
  }

  // the left: anchored on arXiv's tokens the wire carries, under the unit marks (none: the units' text alone)
  const unread = text.views.findIndex((v, i) => v == null || !text.ok[i])
  if (unread >= 0) return { refused: 'anchors', why: `arXiv's PDF could not be read for the left: page ${unread + 1}` }
  const left = fitted(text)
  const leftFloats = left.tokens === text.tokens ? floatMatches(text.tokens, texts, floating) : floatMatches(left.tokens, texts, floating)
  // (the maker's, of its own document's tokens: our base page's, else arXiv's)
  const floatMatch = baseText && baseText !== text ? floatMatches(baseText.tokens, texts, floating) : left.tokens === text.tokens ? leftFloats : floatMatches(text.tokens, texts, floating)
  // the bundle's units as the prepare child writes them: the source units', then the paper's structural names' (bundleUnitsOf, kind
  // `name`: no page's ink, never anchored nor laid; PDF-READER §19.14)
  const sourceBundle = bundleUnitsOf(source), names = sourceBundle.length - units.length
  // the ink units the wrap made of text no source unit owns (pipeline/ink-pass.mjs, docs/route/orphan-text.md §8): units after those,
  // where our base page is the base and each of their pages is drawable; none else
  // (and where their chunks fit beside the source units' within a head's bounds: format.mjs writeUnitChunks `before`)
  const ink = oursHead ? await inkWithinChunks(paper, sourceBundle, inkOfHost(ours?.ink, { units: sourceBundle }, lineCheck?.undrawable ?? [])) : null
  // (a copy: the figure units below are appended to it, never to the source units' own list)
  const sourceCount = sourceBundle.length
  const bundle = [...bundleWithInk(sourceBundle, ink)]
  const inkLeft = ink ? inkAnchors(left.tokens, ink) : null
  // (the text inside the vector figures the wrap gave its own groups: ink units of kind inkfigures after the source units' and the
  // other ink units', their rows by page; none over arXiv's base, on a page our base does not draw, or where their chunks would not
  // fit beside the others' within a head's bounds: none of the paper's then, its figures the original's)
  const withoutFigures = bundle.length
  let figures = oursHead ? figureUnits(wrap?.figures, { bundle, undrawable: lineCheck?.undrawable, M: oursDoc?.numPages ?? 0, prose: proseOf(source.units) }) : new Map()
  if (figures.size && !(await afterFit(paper, bundle, sourceCount))) { bundle.length = withoutFigures; figures = new Map() }
  // (each figure unit anchored on the left by arXiv's tokens in its run's band, as an ink unit by its lines: its translation lights
  // its original, PIPELINE 31; ink-pass.mjs figureAnchors)
  const figureLeft = figures.size ? figureAnchors(left.tokens, figures) : null
  const figureIds = [...figures.values()].flatMap(rows => rows.map(r => r[0]))
  // (the units after the source units', ink units and figure units, in chunks of their own from here: format.mjs INK_UNITS_FORMAT)
  const inkFrom = bundle.length > sourceCount ? sourceCount : null
  // the rule set's frame and columns, of arXiv's text alone where it says so (rules 1 and 4: made once, at step T), each side's
  // of its own tokens; else the rules given (pageFrame and pageColumns by default: the whole run's)
  const frameOn = tokens => (rules.frame === 'tokens' ? (F => () => F)(frameOfTokens(tokens)) : frameGiven)
  const arxivFrame = frameOn(text.tokens), leftFrameRule = left.tokens === text.tokens ? arxivFrame : frameOn(left.tokens)
  // (the maker's frame, of its own document's text)
  const frame = baseText && baseText !== text ? frameOn(baseText.tokens) : arxivFrame
  const columns = rules.columns === 'tokens' ? views => columnsOfTokens(left.tokens, views) : columnsGiven
  // (rule 5: the units written inside a float, the source parse's, no body neighbour of a float's)
  if (rules.floatSearch === 'forward' && !Array.isArray(source.inFloat)) throw new TypeError('source.inFloat: the indices of the units written inside a float, for rules.floatSearch \'forward\'')
  const inFloat = rules.floatSearch === 'forward' ? source.inFloat : null, forward = inFloat ? new Set(inFloat) : null
  // (the marked original to be read here: a page at a time beside arXiv's in a stream, else whole first, readMarked as the
  // prepare's marks stage reads it, its refusal or throw the marks' refusal)
  const markedOptions = marked ? { ...marked.options, units, OPS } : null
  // (the predicates a stream takes: the oracle's, a whole run's; else the rules')
  const given = oracle ? { makerFrame: () => oracle.frame, columnEdges: oracle.columnEdges, leftFrame: () => oracle.leftFrame, columns: () => oracle.columns } : { makerFrame: frame, columnEdges: null, leftFrame: leftFrameRule, columns }
  if (marked && streams) {
    if (oracle) for (const k of ['frame', 'columnEdges', 'leftFrame', 'columns']) if (oracle[k] === undefined) throw new TypeError(`oracle.${k}: a whole run's (capture), for the marked original read a page at a time`)
    const r = await markedStream({ draw, paper, units, texts, names, floating, text, baseText, left, leftFloats, floatMatch, bundle, ink, inkLeft, figureLeft, figureIds, inkFrom, figures, marked, markedOptions, doc: baseDoc, N, OPS, pdfjs, bases: { ours: oursHead, orig: origRef }, deltaStat, lineCheck, image, onHead, onLeft, onPart, verdicts, given, rules, inFloat, forward, several })
    if (r) return r
    marks = { refused: 'marks' }
  } else if (marked) {
    try { marks = await readMarked(marked.doc, marked.log, markedOptions) } catch (e) {
      if (isMemoryError(e)) throw e
      marks = { refused: 'marks' }
    }
  }
  const unitMarks = marks && 'marks' in marks ? marks.unitMarks : null
  const leftFrame = capture ? (d, ms) => { capture.leftFrame = leftFrameRule(d, ms); return capture.leftFrame } : leftFrameRule
  const anchors = anchorUnits(left.tokens, texts, { ...(unitMarks ? { bounds: boundsFromMarks(left.tokens, unitMarks) } : {}), floating, floatMatch: leftFloats, frame: leftFrame, forward })
  if (inkLeft) for (const [id, a] of inkLeft) anchors.set(id, a)
  if (figureLeft) for (const [id, a] of figureLeft) anchors.set(id, a)
  const leftColumns = capture ? (v, a, k) => { capture.columns = (columns ?? pageColumns)(v, a, k); return capture.columns } : columns
  const side = leftSideOf({ doc: left.tokens, views: text.views, anchors, edges: left.edges, ...(leftColumns ? { columns: leftColumns } : {}) })
  if (side.units.length === 0) return { refused: 'anchors', why: 'the anchors located no unit on arXiv\'s PDF' }

  // the maker, of the marks and arXiv's PDF (its operator lists read once, for the plans too); its refusal, or its throw, the
  // layout's alone
  let made = null, maker = null
  if (marks && 'marks' in marks) {
    const makerFrame = streams ? given.makerFrame : capture ? (d, ms) => { capture.frame = frame(d, ms); return capture.frame } : frame
    try {
      maker = await makerOf({ units, marks: marks.marks, arxiv: baseDoc, OPS, paper, left: '', pdfjs, text: baseText, lineCheck, floatMatch, frame: makerFrame, cellRules: true, parts: true, draw, rules, inFloat, ...(streams && given.columnEdges ? { columnEdges: given.columnEdges } : {}) })
      if (maker.refused) { made = { refused: maker.refused, stats: maker.stats }; maker = null }
    } catch (e) {
      if (isMemoryError(e)) throw e
      made = { refused: 'failed', why: why(e) }
      maker = null
    }
  } else made = { refused: marks?.refused ?? 'marks', ...(marks?.why ? { why: marks.why } : {}), ...(marks?.own ? { own: marks.own } : {}) }

  const ctx = { paper, N, bases: { ours: oursHead, orig: origRef }, deltaStat, lines: lineCheck?.pageLines ?? null, image, pdfjs, onHead, onLeft, onPart, verdicts, side, bundle, ink, inkFrom, figures, made, maker, several }
  if (maker && streams) {
    // (the maker's throws are the layout's, its own calls' alone: a sink's, the reader's or the cutter's go on as themselves)
    let st = null
    try {
      maker.carrying()
      st = maker.stream()
    } catch (e) {
      if (isMemoryError(e)) throw e
      ctx.made = { refused: 'failed', why: why(e) }
    }
    if (st) return streamed(ctx, { maker, st: streamWithInk(st, ink), lineskip: marks.marks.marking.lineskip ?? null, left: wholeLeft(side), drive: arxivDrive(maker, st, N) })
    return cutWhole(ctx, null)
  }
  // (stage 1: the whole made first)
  let r = null
  if (maker) {
    try {
      for (let p = 1; p <= N; p++) await maker.readPage(p)
      r = await maker.whole()
      if (capture) capture.columnEdges = maker.edges()
      ctx.made = 'file' in r ? { stats: r.stats, ...(r.rulesFailed ? { rulesFailed: r.rulesFailed } : {}) } : { refused: r.refused, stats: r.stats }
    } catch (e) {
      if (isMemoryError(e)) throw e
      ctx.made = { refused: 'failed', why: why(e) }
      r = null
    }
  }
  return cutWhole(ctx, r && 'file' in r ? { ...r, file: layoutWithInk(r.file, ink, ink ? ink.units.map(u => u.id) : []) } : null)
}

/** our lines in place on arXiv's PDF of marked pages a to b of N (to the marked original's end with the paper's last), and
 *  all of them: a part's note, information */
function linesOf(lines, N, a, b) {
  let carried = 0, total = 0
  for (const [p, [c, t]] of lines) if (p >= a && (b === N || p <= b)) { carried += c; total += t }
  return [carried, total]
}

/** each part judged as it is cut (verdicts): its reader reading it after the parts before (`state.chain`) against the head
 *  and chunks told (`state.index`); the reading kept (`state.read`) */
function verdictOf(state) {
  return async ({ written }) => {
    try { state.read = await readPart(written.bytes, { ref: written.ref, index: state.index, chain: state.chain }) } catch (e) {
      if (isMemoryError(e) || !(e instanceof BundleRefusal)) throw e
      return { refused: 'read', why: why(e) }
    }
    return null
  }
}
/** the head and chunks read as a reader reads them: the index the parts are read against */
async function indexOfHead(head, chunks) {
  const told = []
  for (const c of chunks) told.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: told.at(-1) ?? null }))
  return indexOf(await readHead(head.bytes, { ref: head.ref }), told)
}
/** a part told: its reading checked (a part the verdict refused is cut again with no layout: its reader must take that one,
 *  or the cut is wrong), its left parts, then the part */
async function tell(ctx, state, cutter, part, layout, lines) {
  const i = cutter.parts.length - 1, refused = cutter.verdicts[i]
  if (ctx.verdicts) {
    if (state.read?.sha256 !== part.sha256) {
      try { state.read = await readPart(part.bytes, { ref: part.ref, index: state.index, chain: state.chain }) } catch (e) {
        if (isMemoryError(e)) throw e
        throw new Error(`part ${i} (pages ${part.from} to ${part.to}) is refused by its own reader: ${why(e)}`)
      }
    }
    state.chain = state.read.chain
  }
  // (a left part whose draw the writer shed, for its size or with its tokens: the stats' `draw.shed`)
  for (const l of part.leftParts) { if (l.drawShed) ctx.drawShed = (ctx.drawShed ?? 0) + 1; await ctx.onLeft(l) }
  await ctx.onPart(part, { pages: [part.from, part.to], layout: refused ?? (layout ? 'kept' : 'none'), lines: linesOf(lines, ctx.N, part.from, part.to) })
}

/** the head's base and `orig` (format.mjs writeHead): ours, where it passed its
 *  checks and a layout is made over it (`laid`); else arXiv's PDF, why the paper's refusal (layoutRecordOf's code: the fallback,
 *  every part with no layout) */
function headBaseOf(ctx, laid) {
  const { ours, orig } = ctx.bases
  if (laid && ours) return { base: ours, orig: { bytes: orig.bytes, sha256: orig.sha256, ...(ours.kind === 'delta' ? { xref: orig.xref } : {}) } }
  return { base: { source: 'arxiv', bytes: orig.bytes, sha256: orig.sha256, xref: orig.xref, why: layoutRecordOf(ctx.made)?.refused ?? 'marks' }, orig: null }
}

/** how the head's base of ours is held (`stats.delta`: { kind: 'delta', bytes, replaced } or { kind: 'full', why, reason? }),
 *  where the host gave a delta and the base is ours; nothing else */
const deltaOfStats = (ctx, base) => (ctx.deltaStat && base.source === 'ours' ? { delta: ctx.deltaStat } : {})

/** stage 1: the parts of a paper made whole (`r`, the maker's, or null: no layout), cut by cutBundle's own cutter */
async function cutWhole(ctx, r) {
  const { paper, N, image, side, bundle } = ctx
  const layout = r?.file ?? null, cellRules = r?.cellRules ?? null, lines = ctx.lines ?? r?.lines ?? new Map()
  const { base, orig } = headBaseOf(ctx, !!layout)
  const state = { index: null, chain: null, read: null }
  const whole = { paper: { ...paper, pages: N }, base, orig, versions: { image }, units: bundle, left: { pages: side.pages, units: side.units }, layout }
  const { units: chunks, head, cutter, known } = await wholeCutter(whole, { draw: drawsOurs(base, ctx.maker), leftPages: drawsOurs(base, ctx.maker) ? drawn(side.leftPages, ctx.maker) : side.leftPages, base, orig, image, rules: cellRules, figures: ctx.figures, verdict: ctx.verdicts ? verdictOf(state) : null, recordOf: layoutRecordOf, ...(ctx.inkFrom !== null ? { inkFrom: ctx.inkFrom } : {}), ...(layout ? {} : { noLayout: layoutRecordOf(ctx.made) }) })
  if (ctx.verdicts) state.index = await indexOfHead(head, chunks)
  if (ctx.onHead) await ctx.onHead(head, chunks)
  for (;;) {
    state.read = null
    const part = await cutter.next(known)
    if (part === null) break
    await tell(ctx, state, cutter, part, layout, lines)
  }
  return { through: N, count: cutter.parts.length, stats: { left: side.stats, layout: ctx.made, rules: cellRules ? { pages: cellRules.size } : null, ...(ctx.maker ? { draw: { ...ctx.maker.drawStats, shed: ctx.drawShed ?? 0 } } : {}), ...(ctx.several ? { toplevels: ctx.several } : {}), ...deltaOfStats(ctx, base) } }
}

/** whether the left parts carry the maker's draws: they are our base page's, so only under a head whose base is ours (format.mjs
 *  layerDraws); a fallback's head is over arXiv's PDF, whose draws a reader reads itself, as for a bundle of before, and says none */
const drawsOurs = (base, maker) => maker?.draw === true && layerDraws(base)
/** the left's page input with the maker's draw geometry for the page (E-C), taken once as the left part is written; a page with no tokens
 *  has no left part input of its own, and ships its draw all the same (C1.5: a page read and empty has a draw) */
const drawn = (leftPages, maker) => (maker ? async p => {
  const l = await leftPages(p), d = maker.drawJsonOf(p)
  return d !== null ? { ...(l ?? {}), drawText: d } : l
} : leftPages)

/** the left anchored whole before the maker (the marks given): every unit's anchor final */
const wholeLeft = side => {
  const first = new Map(side.units.map(w => { let f = Infinity; for (const r of w[2]) f = Math.min(f, r[0]); return [w[0], f] }))
  return { pages: side.pages, leftPages: side.leftPages, units: () => side.units, firstPage: id => first.get(id) ?? null, stats: side.stats, done: () => true, all: () => true, frontier: () => Infinity, firstTok: () => Infinity, version: () => 0 }
}

/**
 * The page stream's pass: the maker made a page at a time (`st`, its stream; null: no layout, the left alone), the left whole
 * (wholeLeft) or anchored by ranges as the marked original's pages are read (streamingLeft), each part cut as soon as everything
 * it reads is final. What a part reads (layer-proto/cut.mjs partCutter): K's entries up to the frontier of its last page, their
 * table groups whole, its pages' need bounds, and every page those reach, with their indices in K; so a part is cut once
 * (1) every page it, its pages' need bounds and its entries reach (`R`) is let go by the maker and anchored by the left, no unit
 * whose left anchor is final but whose rows are still to be made may have a left rectangle up to R, and none whose rows are
 * made but whose left anchor is not yet final has a row up to R; (2) no unit not yet in K for good (its rows or its left anchor
 * still to come) may get a slot up to the last entry the part takes or any entry on its pages (a left anchor not final: its
 * stream at least the left's first token still to be anchored, or the last stream of a smaller id's and a half), and no
 * layout-only entry there takes its slot after a unit whose left anchor is not final (it may still change); (3) every member
 * of the table groups of those entries is in K for good; and (4) a unit is laid (the head waits for it: a paper none of whose
 * units is laid falls back to arXiv's, told whole at the end, as a paper with no layout is). K, F and the need bounds are then those of the whole paper on what the part
 * reads (cutBundle's). The head is told once a unit is located on the left (else the paper is refused, telling nothing, as
 * the whole run refuses it). `drive({ making, close, read })` reads the pages: the maker's calls in `making` (a throw of its
 * own is the layout's), `close()` after each step, `read(p)` with the base page p read
 */
async function streamed(ctx, { maker, st, lineskip, left, drive }) {
  const { paper, N, image, bundle } = ctx
  const lines = ctx.lines ?? (maker ? maker.pageLines() : new Map())
  const units = await chunksOf(paper, bundle, ctx.inkFrom)
  const { base, orig } = headBaseOf(ctx, !!st)
  const head = await writeHead({ paper: { ...paper, pages: N }, base, orig, image, units, lineskip, draw: drawsOurs(base, maker) })
  const state = { index: ctx.verdicts ? await indexOfHead(head, units) : null, chain: null, read: null }
  const cutter = partCutter({ paper, N, head, views: left.pages, leftPages: drawsOurs(base, maker) ? drawn(left.leftPages, maker) : left.leftPages, rules: st?.cellRules ?? null, figures: ctx.figures, verdict: ctx.verdicts ? verdictOf(state) : null, retain: false, recordOf: layoutRecordOf })
  let headTold = false
  /** the head told, once a unit is located on the left and, where a layout is made, one is laid (`now`: at the end, whatever is
   *  laid): a paper of no unit laid falls back to arXiv's PDF, nothing told before */
  const tellHead = async (now = false) => {
    if (headTold) return true
    if (!left.units().length) return false
    if (!now && st && st.laid() === 0) return false
    if (ctx.onHead) await ctx.onHead(head, units)
    headTold = true
    return true
  }
  await tellHead()
  // each unit's table group
  const n = bundle.length
  const grouped = groupsOfUnits(bundle), members = new Map()
  for (let i = 0; i < n; i++) { const g = grouped.of[i]; if (g >= 0) (members.get(g) ?? members.set(g, []).get(g)).push(i) }
  const closed = []
  let X = 0
  // (a structural name's unit, bundleUnitsOf's: no page's ink, settled from the start and asked of no maker; a figure unit, its rows
  // the parts' figure rows, none of the maker's: settled from the start too, its left anchor final from the start, figureAnchors')
  const isName = i => bundle[i]?.[0] === NAME_KIND
  const settled = i => !st || isName(i) || bundle[i]?.[0] === FIGURE_KIND || st.settled(i)
  /** whether unit i is in K for good: its left anchor final and its rows made (or none) */
  const inK = i => left.done(i) && settled(i)
  const kIds = () => { const out = []; for (let i = 0; i < n; i++) if (inK(i) && !isName(i)) out.push(i); return out }
  /** where the left stands: the least slot in K each unit may get, and the smallest unit whose left anchor is not final */
  let nowAt = -1, nowLeft = null
  const leftNow = () => {
    // (a function of the left alone: made again once the left has changed)
    if (left.version() === nowAt) return nowLeft
    nowAt = left.version()
    const stream = new Map()
    for (const w of left.units()) stream.set(w[0], w[1])
    const slotLow = new Float64Array(n), low = left.firstTok(left.frontier())
    let uMin = n
    for (let i = 0, before = -1; i < n; i++) {
      const s = stream.get(i)
      if (!left.done(i)) { if (uMin === n) uMin = i; slotLow[i] = Math.min(low, before + 0.5) } else slotLow[i] = s === undefined ? before + 0.5 : s
      if (s !== undefined && s > before) before = s
    }
    return (nowLeft = { slotLow, uMin })
  }
  /** the least page unit i's rows name (its lines', its placeholders' segments', its labels'): its rows', made once (a unit's
   *  rows are final once settled; the stub a told unit's rows become keeps their pages) */
  const leastOf = new Map()
  const rowLeast = i => {
    if (leastOf.has(i)) return leastOf.get(i)
    const L = st.layout([i])
    let m = N + 1
    for (const [, v] of L.lines) for (let j = 0; j < v.length; j += 8) m = Math.min(m, v[j])
    for (const r of L.ph) for (let j = 4; j + 5 < r.length; j += 6) m = Math.min(m, r[j])
    for (const r of L.labels) m = Math.min(m, r[2])
    leastOf.set(i, m)
    return m
  }
  /** the pages done: let go by the maker and anchored by the left, before every unit's first left rectangle whose rows are
   *  still to be made, and before every row of a unit whose left anchor is not final */
  const frontier = () => {
    let H = st ? st.released() : N
    if (!left.all()) H = Math.min(H, left.frontier() - 1)
    for (let i = 0; i < n; i++) {
      if (left.done(i) && !settled(i)) { const f = left.firstPage(i) ?? N + 1; if (f - 1 < H) H = f - 1 } else if (!left.done(i) && st && settled(i)) H = Math.min(H, rowLeast(i) - 1)
    }
    return H
  }
  const close = async final => {
    for (;;) {
      const a = cutter.from
      if (a > N) return
      if (!(await tellHead(final))) return
      const H = final ? N : frontier()
      if (!final && Math.min(partTarget(a, N), a + PART_PAGES_MAX - 1) > H) return
      const now = leftNow()
      const layout = st ? st.layout(kIds()) : null
      const whole = { paper: { ...paper, pages: N }, units: bundle, left: { pages: left.pages, units: left.units() }, layout }
      const { K, F } = wholeFrontier(whole, undefined, grouped)
      const NB = needBound(K, N)
      if (!final && !closable(K, F, NB, a, H, now)) return
      state.read = null
      const part = await cutter.next({ K, F, NB, layout, noLayout: st ? null : layoutRecordOf(ctx.made) })
      if (part === null) return
      closed.push([part.from, part.to, X])
      await tell(ctx, state, cutter, part, layout, lines)
      // (what the parts after it read of the units it told is K's alone; its pages' names and cell rules are done; the rules' pages
      // are counted before they go)
      if (st) {
        for (const [pg] of st.cellRules ?? []) if (pg <= part.to) ruled++
        st.tell(K.slice(0, (part.to === N ? K.length - 1 : F[part.to]) + 1).map(e => e.id), part.to)
      }
    }
  }
  /** what part from `a` reads is final (the conditions above), its target as the cutter makes it */
  const closable = (K, F, NB, a, H, now) => {
    let target = Math.min(partTarget(a, N), a + PART_PAGES_MAX - 1)
    const limit = Math.min(N, a + PART_PAGES_MAX - 1)
    for (let q = a, m = 0, turns = 0; turns <= N; turns++) {
      for (; q <= target; q++) m = Math.max(m, NB[q])
      const next = Math.min(m, limit)
      if (next <= target) break
      target = next
    }
    // (the paper's last page: the part takes every entry left, the whole)
    if (target >= N) return false
    const upTo = F[target]
    let R = target
    for (let q = a; q <= target; q++) R = Math.max(R, NB[q])
    for (let k = 0; k <= upTo; k++) R = Math.max(R, K[k].last)
    for (let grew = true; grew;) { grew = false; for (const e of K) if (e.first <= R && e.last > R) { R = e.last; grew = true } }
    if (R > H) return false
    let sigma = upTo >= 0 ? K[upTo].slot : -Infinity
    const groups = new Set()
    K.forEach((e, k) => {
      if (k > upTo && !(e.first <= R)) return
      if (e.slot > sigma) sigma = e.slot
      if (e.group !== null) groups.add(e.group)
    })
    for (let i = 0; i < n; i++) if (!inK(i) && now.slotLow[i] <= sigma) return false
    if (now.uMin < n) for (const e of K) if (e.slot <= sigma && !e.left && e.id > now.uMin) return false
    for (const g of groups) for (const i of members.get(g) ?? []) if (!inK(i)) return false
    return true
  }
  // the maker's calls alone caught: a throw of its own is the layout's, from then on (design §3): the parts not yet told cut
  // with none, the parts told standing; nothing is told twice
  let failed = null
  let ruled = 0
  const making = async f => {
    if (failed || !st) return
    try { await f() } catch (e) {
      if (isMemoryError(e)) throw e
      failed = why(e) || 'failed' // (a throw with no message is a failure all the same)
    }
  }
  await drive({ making, close: () => (failed ? null : close(false)), read: p => { X = p }, failed: () => failed })
  if (st && !failed) await making(async () => { st.finish() })
  // (no unit laid: nothing was told, the head waiting for a unit laid; the paper falls back to
  // arXiv's PDF, cut whole as a paper with no layout is)
  const carry = st && !failed ? st.carryRefusal() : null
  if (carry) {
    if (!left.units().length) return { refused: 'anchors', why: 'the anchors located no unit on arXiv\'s PDF' }
    return cutWhole({ ...ctx, maker: null, made: { refused: carry, stats: maker.stats }, side: { pages: left.pages, units: left.units(), leftPages: left.leftPages, stats: left.stats } }, null)
  }
  if (st && !failed) await close(true)
  else {
    // (K as the units in it for good and the left give it: the prefix told stands, the rest is left entries and units settled;
    // with no layout at all, the left's alone)
    if (!(await tellHead(true))) return { refused: 'anchors', why: 'the anchors located no unit on arXiv\'s PDF' }
    const layout = st && failed ? st.layout(kIds()) : null
    const whole = { paper: { ...paper, pages: N }, units: bundle, left: { pages: left.pages, units: left.units() }, layout }
    const { K, F } = wholeFrontier(whole, undefined, grouped)
    // (why the parts left have none: the maker's failure, or the paper's)
    const noLayout = layoutRecordOf(failed ? { refused: 'failed', why: failed } : ctx.made)
    const known = { K, F, NB: needBound(K, N), layout: null, noLayout }
    for (;;) {
      state.read = null
      const part = await cutter.next(known)
      if (part === null) break
      closed.push([part.from, part.to, X])
      await tell(ctx, state, cutter, part, null, lines)
    }
  }
  if (!headTold) return { refused: 'anchors', why: 'the anchors located no unit on arXiv\'s PDF' }
  const layoutStats = failed ? { refused: 'failed', why: failed, ...(maker ? { stats: maker.stats } : {}) } : st ? { stats: maker.stats, ...(st.rulesFailed() ? { rulesFailed: st.rulesFailed() } : {}) } : ctx.made
  return { through: N, count: cutter.parts.length, stats: { left: left.stats, layout: layoutStats, rules: st?.cellRules ? { pages: ruled + st.cellRules.size } : null, ...(maker ? { draw: { ...maker.drawStats, shed: ctx.drawShed ?? 0 } } : {}), closed, ...(ctx.several ? { toplevels: ctx.several } : {}), ...deltaOfStats(ctx, base) } }
}

/** the bundle's units' chunks: the source units' as the prepare child wrote them (writeUnitChunks of the source units alone, byte for
 *  byte), then the ink units' from their first id (INK_UNITS_FORMAT), so that the host announces those it has and the maker's */
async function chunksOf(paper, bundle, from) {
  if (from === null || from === undefined) return writeUnitChunks({ paper, units: bundle })
  const src = await writeUnitChunks({ paper, units: bundle.slice(0, from) })
  return [...src, ...await writeUnitChunks({ paper, units: bundle.slice(from), start: from, before: chunkTotals(src) })]
}

/** whether the units after the source units' (`from` on: the ink units', the figures') fit beside theirs within the bounds a head's
 *  chunks are read by (format.mjs writeUnitChunks, as ink-pass.mjs inkWithinChunks asks); a refusal of the source units' own is the
 *  pass's, later */
async function afterFit(paper, bundle, from) {
  let src
  try { src = await writeUnitChunks({ paper, units: bundle.slice(0, from) }) } catch (e) { if (e instanceof BundleRefusal) return true; throw e }
  try { await writeUnitChunks({ paper, units: bundle.slice(from), start: from, before: chunkTotals(src) }) } catch (e) { if (e instanceof BundleRefusal) return false; throw e }
  return true
}

/** the drive with the marks given: arXiv's pages in order, each read and its stream told */
const arxivDrive = (maker, st, N) => async ({ making, close, read }) => {
  for (let p = 1; p <= N; p++) {
    await making(async () => { await maker.readPage(p); read(p); st.pageRead(p) })
    await close()
  }
}

/**
 * The left anchored by ranges as the marked original's pages are read (left-part.mjs rangedAnchors, under `frame`, the whole
 * document's frame rule of the left), the side a unit at a time (left-side.mjs leftSideStream, under `columns`): each unit's bounds those of its unit
 * marks (`<id>s`, `<id>e`: boundsFromMarks') once both their pages are read (their words read there); a unit with no pair of
 * them, or every unit where the marks are none (`unitMarks` null), unbounded from the start. `page(p)` the marked page p read;
 * `end()` every page read, or the reading given up (a mark not read has no word: no bounds)
 */
function streamingLeft({ doc, views, edges, texts, names = 0, floating, floatMatch, frame, columns, unitMarks, forward = null, ink = null, inkLeft = null, figureLeft = null, figureIds = [] }) {
  const n = texts.length, byPage = pageIndex(doc)
  // (the paper's structural names after the source units' (`names` of them: bundleUnitsOf), never anchored, done from the start;
  // then the ink units and the figure units: their anchors known from the start, inkAnchors' and figureAnchors')
  const total = (ink ? ink.base + ink.units.length : n + names) + figureIds.length
  const side = leftSideStream({ doc, views, edges, columns })
  const done = new Uint8Array(total)
  let doneCount = 0, pending = 0
  const pairs = new Map()
  const R = rangedAnchors(doc, texts, { floating, floatMatch, frame, boundsKnown: () => pending === 0, forward })
  const lastPage = R.lastPage, clamp = p => Math.min(Math.max(1, p), lastPage)
  const isUnit = id => /^(?:0|[1-9]\d*)$/.test(id) && Number(id) < n
  const paired = new Set()
  if (unitMarks) for (const [name, s] of unitMarks) {
    if (!name.endsWith('s')) continue
    const id = name.slice(0, -1), e = unitMarks.get(`${id}e`)
    if (!e) continue
    const at = Math.max(s.page, e.page)
    ;(pairs.get(at) ?? pairs.set(at, []).get(at)).push([id, s, e])
    pending++
    if (isUnit(id)) { paired.add(Number(id)); if (lastPage) R.own(Number(id), clamp(s.page), clamp(e.page)) }
  }
  for (let u = 0; u < n; u++) if (!paired.has(u)) R.mark(u, null)
  const resolve = list => {
    for (const [id, s, e] of list) {
      pending--
      const b = boundsFromMarks(doc, new Map([[`${id}s`, s], [`${id}e`, e]]), byPage).get(id) ?? null
      if (isUnit(id)) R.mark(Number(id), b)
      else if (b) R.bound(id, b)
    }
  }
  const settle = u => { if (!done[u]) { done[u] = 1; doneCount++ } }
  const run = () => R.run((id, an) => { side.add(id, an); settle(id) }, u => { side.none(u); settle(u) })
  run()
  for (let u = n; u < n + names; u++) settle(u)
  if (ink) for (const u of ink.units) { const an = inkLeft?.get(u.id) ?? null; if (an) side.add(u.id, an); else side.none(u.id); settle(u.id) }
  for (const id of figureIds) { const an = figureLeft?.get(id) ?? null; if (an) side.add(id, an); else side.none(id); settle(id) }
  return {
    pages: side.pages, leftPages: side.leftPages, units: side.units, firstPage: side.firstPage, stats: side.stats,
    done: i => done[i] === 1, all: () => doneCount === total, frontier: () => R.am, firstTok: p => (p <= lastPage ? R.firstTok[p] : doc.length),
    /** a number that changes whenever the units done or the frontier do (both only grow) */
    version: () => doneCount * (lastPage + 2) + R.am,
    page(p) { resolve(pairs.get(p) ?? []); pairs.delete(p); run() },
    end() { for (const list of pairs.values()) resolve(list); pairs.clear(); run() },
  }
}

/**
 * The page stream with the marked original read here a page at a time (`marked` { doc, log, options }: markedPages'): its
 * head first; the maker of the head's marks (marksOfHead) fed each page as it comes (make.mjs stream `marked`), the left
 * anchored by ranges as the unit marks' pages are read (streamingLeft), the marked page p read before the base page p (its
 * marks stand there). `given` holds the four predicates: the maker's frame and
 * columns' edges (null: the maker's own, rule 3), the left's frame and its pages' columns' rule — an oracle's, a whole run's,
 * or the rules'. A head that cannot be read is the marks' refusal (null: the
 * caller's whole path then, as readMarked's refusal is); a page that cannot be read after it is the layout's failure, the left
 * going on with the unit marks read (the whole path refuses the marks then, its left placed without them: not this one's)
 */
async function markedStream(o) {
  const { paper, units, texts, names, floating, text, baseText, left, leftFloats, floatMatch, bundle, ink, inkLeft, figureLeft, figureIds, inkFrom, figures, marked, markedOptions, doc, N, OPS, pdfjs, bases, deltaStat, lineCheck, image, onHead, onLeft, onPart, verdicts, given, rules, inFloat, forward, several } = o
  const events = markedPages(marked.doc, marked.log, markedOptions)
  let head = null
  try { head = (await events.next()).value?.head ?? null } catch (e) { if (isMemoryError(e)) throw e }
  if (!head) return null
  const L = streamingLeft({ doc: left.tokens, views: text.views, edges: left.edges, texts, names, floating, floatMatch: leftFloats, frame: given.leftFrame, columns: given.columns, unitMarks: head.unitMarks, forward, ink, inkLeft, figureLeft, figureIds })
  let maker = null, st = null, made = null
  try {
    maker = await makerOf({ units, marks: marksOfHead(head, markedOptions.engine), arxiv: doc, OPS, paper, left: '', pdfjs, text: baseText ?? text, lineCheck, floatMatch, frame: given.makerFrame, cellRules: true, parts: true, draw: o.draw, rules, inFloat, ...(given.columnEdges ? { columnEdges: given.columnEdges } : {}) })
    if (maker.refused) { made = { refused: maker.refused, stats: maker.stats }; maker = null } else st = streamWithInk(maker.stream({ marked: head }), ink)
  } catch (e) {
    if (isMemoryError(e)) throw e
    made = { refused: 'failed', why: why(e) }
    maker = null
  }
  const M = head.pages
  const ctx = { paper, N, bases, deltaStat, lines: lineCheck?.pageLines ?? null, image, pdfjs, onHead, onLeft, onPart, verdicts, bundle, ink, inkFrom, figures, made, several }
  let broken = null
  const drive = async ({ making, close, read }) => {
    for (let t = 1; t <= Math.max(M, N); t++) {
      // the marked page t (the left's unit marks, the maker's marks and pieces), then the base page t, where its marks stand
      if (t <= M && !broken) {
        let page = null
        try { const x = await events.next(); page = x.value?.page ?? null; if (!page) broken = `the marked original gave no page ${t}` } catch (e) {
          if (isMemoryError(e)) throw e
          broken = why(e) || 'the marked original could not be read'
        }
        if (page) { L.page(t); await making(() => st.markedPage(page)) }
        if (broken) { L.end(); await making(() => { throw new Error(broken) }) }
      }
      if (t <= N && st) await making(async () => { await maker.readPage(t); read(t); st.pageRead(t) })
      await close()
    }
    if (broken) return
    let end = null
    try { const x = await events.next(); end = x.value?.end ?? null; if (!end) broken = 'the marked original gave no end' } catch (e) {
      if (isMemoryError(e)) throw e
      broken = why(e) || 'the marked original could not be read'
    }
    L.end()
    if (end) await making(() => st.markedEnd(end))
    else await making(() => { throw new Error(broken) })
    await close()
  }
  return streamed(ctx, { maker, st, lineskip: head.marking.lineskip ?? null, left: L, drive })
}
