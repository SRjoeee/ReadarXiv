// src/pdf-reader/engine/layer-proto/run.mjs
// Ported from the private prototype (readarxiv-web, exp/instant-layer at 9e56fca, web/prototypes/instant-layer/main.js),
// 2026-10-06, as the instant layer's v0: the parts of the prototype's page that drive a paper's pages. Our own code, so
// no licence applies; the provenance is kept so that every number the prototype was approved on traces back to it.
//
// What a page of v0 is, as main.js made it at the approved URL's defaults (v=2, batch=8, delay=0, scale=1.25, ph=auto,
// restoring on, no page-even): each page of the original drawn by PDF.js on a canvas (`left`), a copy of it (`right`) on
// which each unit's lines are erased and its crops of math drawn (layer2.mjs unitOps and drawOps, with what the erasing
// covers and no painted unit accounts for put back), and an SVG over the copy holding each unit's translation as text
// (svgOfUnit). The units are the made output's: their rectangles on the original (the geometry's left side, schema 1:
// the anchors' lines) and their translations (the units file).
// (The erasing is gone since REMOVAL 8: a unit's ink is hidden by its optional-content groups on our wrapped page, hide.mjs and
// visibility.mjs, docs/PDF-READER.md §11.8; the crops and the SVG are as they were.)
//
// What changed from main.js, and why:
// - main.js streamed the units a batch at a time while its pages were still being drawn, each unit laid and painted
//   once all its pages were; the order in which units were laid (which taught the paper's citations and macros to the
//   next, a map of the paper's) and painted (what the restore counts as accounted) was the race between the two. Here the
//   order is the one main.js's promises give when every page after the first is drawn after the last batch has been
//   released (layGroups): the order the parity run of 2026-10-06 recorded on 8 of the 10 outputs it measured, and a
//   deterministic one. It is the units' rank, and a page is drawn as if its units were laid in it: what a unit and a page
//   read is their own (the 1b design, §2.1): a unit learns its own citations and macros, its lines grow by its pages'
//   growth steps in their rank there, a crop is cut from any page of the paper that was read, and a page is painted in
//   its own order, whatever order the units of other pages were laid in. So a page asked is laid with what it reads
//   alone (its closure, Need(p): need.mjs closureOf, the 1b-D design), not every page before it (layFor), and a page no
//   unit will paint again may be let go (release): the prototype held every page's canvases, which a paper of 147 pages
//   does not fit.
// - main.js showed its copy, a canvas at 1.25 CSS px a unit, scaled: at any other zoom everything not set as SVG text (a
//   table, a figure, a kept line, a formula's crop) was that canvas's pixels, a low-resolution screenshot. Here the
//   drawing is kept as data (each page's operations, unitOps'), and a view draws the page at its own resolution
//   (drawCopy): PDF.js's own rendering at the view's device pixels, the operations scaled to it, its crops and restores
//   cut from that rendering; v0's own canvases at its own resolution are the analysis's (the ink maps) and the gate's
//   (`copy`), never what a view shows.
// - main.js was given every unit at once. Here the units may also arrive as a live run translates them (expect, take,
//   end), and each page is laid exactly as one open over all of them lays it, once every unit it reads has come; units
//   are laid back to back in slices of SLICE_MS, a yield between two slices, so that no long task holds a page's units
//   and laying them spends no more turns of the event loop than that needs.
// - The page's DOM (its rows, the banner, the status line), the timings and long tasks, the scorer's extras (score=1)
//   and the compiled final drawn beside (compare) are the host's or the measurement's, and are left out. The checker's
//   audit of every erase and crop (main.js check=1) is kept with `records`, the gate's and the lab's: it is what a gate
//   measures the drawing by, and the reader keeps none (the 1b design §3).
// - The prototype's host is the caller's: the PDF.js document (opened with PDF_OPTIONS, the prototype's), where the
//   faces and the hyphenation patterns are served (fontUrl, hyphUrl).
// - The faces are the role table's (faces: 'roles', the default since the maintainer's ruling of 2026-10-06; fonts.mjs
//   setRoleFaces), and only they: files we serve, in slices (`faceSources`) or whole (`faceUrl`), never a face the
//   reader's device holds. Each page's characters are measured in their fonts' faces only once the slices that hold them
//   are loaded, and so is each unit's, from the faces its tokens are set in; a unit with a character in no served slice
//   of those faces (and their fallbacks) is left the original's (`served`), as is one whose slice failed to load (`face`).
//   The paper's family is read from its first page's fonts as the engine reads a layout file's (font-roles.mjs
//   familyOfFonts). faces: 'prototype' draws in the prototype's own system faces and Latin Modern, as the approved
//   prototype did (its floor's numbers).
import { cellSpans } from './cells.mjs'
import { checkAll } from './check.mjs'
import { familyOfFonts } from '../rules/font-roles.mjs'
import { bodyFaceId, classifyFont, faceOf, fontString, loadWebFaces, OPEN_FAMILY, roleFaceSet, runsOfTokens, styleKey, setRoleFaces } from './fonts.mjs'
import { loadHyphenation } from './hyph.mjs'
import { blocksOf, median, norm, wordsOf } from './layer1.mjs'
import * as L2 from './layer2.mjs'
import { unitHiding } from './hide.mjs'
import { cropSourceOff, labelGroup, nameGroup, textGroup, visibilityOf } from './visibility.mjs'
import * as LK from './links.mjs'
import * as TL from './textlayer.mjs'
import { locatedWhole, shortSkipsOf, texParts, texRects } from './tex.mjs'
import { shown as shownPiece, trPiecesOf } from '../layer/pieces.mjs'
import { fitFigure, sameAsSource } from './figure-fit.mjs'
import { levelRun } from './figure-rows.mjs'
import { FIGURE_KIND } from '../rules/content-classes.mjs'
import { NAME_KIND, nameOccurrenceId } from './units.mjs'
import { addSegWords, addUnitWords, copyWords, freezeWords, newWords, pieceOffsets, plainOfPieces, tokenBand, wordIndexer } from './words.mjs'
import { closureOf, rowLeadOf } from './need.mjs'
import { markWork, newWork, work, WORK_KEYS } from './work.mjs'
import { drawInputsOf } from './draw.mjs'
import { isMemoryError } from '../pipeline/memory.mjs'
import { itemFills } from '../layout/fills.mjs'
import { GLYPHS_PAGE, pageInk } from '../layout/ink.mjs'
import { listWithin } from '../layout/oplist.mjs'
import { BUILTIN_RULES, resolveRules, RULES_SCHEMA } from '../rules/layout.mjs'
import { classesOn, unitShown } from '../rules/content-classes.mjs'

/** the prototype's getDocument options beside the host's asset URLs (main.js ASSETS): its canvases on the GPU, the whole
 *  file read at once; and each font's own ToUnicode map exported with it (fontExtraProperties: what the text layer reads a
 *  glyph by, pageChars2's `nu`; on 2307.16209 in Node, 101 fonts, 1.5 MB of heap and no measurable time). A document
 *  opened without it is refused as the run reads a page's fonts (layer2.mjs fontMappedOf), never read as one whose fonts
 *  have no map */
export const PDF_OPTIONS = { cMapPacked: true, enableHWA: true, disableStream: true, fontExtraProperties: true }
/**
 * Why the layer left a unit the original's (each `skipped` record's `code`, beside its `why`), a closed set, for a reader to
 * tell and a sweep to count, never to draw by. The file not holding it whole (tex.mjs locatedWhole): `unlocated` (the file
 * holds no row of it: the maker's own reason beside it, `unlaid`, the file's UNLAID code, null where the file says none),
 * `pieces` (its row's pieces not the unit's), `noRow` (a visible piece the file has no row for), `lost` (a visible piece the
 * file holds no ink of: LOST); `offPages` (none of its lines on the pages shown); `author` (the front matter's names, kept
 * by design until the reader's toggles: no run gives it now); `refused` (its row not of this unit: another kind, another group, a k past its source's); `group` (a table
 * cell of a group not drawn whole); the drawing's: `unfit` (no step fits it), `unproven` (a piece's ink not proven),
 * `served` and `face` (a character no served slice holds, a slice that did not load), `error` (its lay threw), `page` (on a
 * page that failed); the door's `rowUnfit` (its translated row names no unit or piece of the paper's: reader.mjs, a row
 * dropped before the run sees it); `unhidden` (the file could not wrap its ink in its groups: `hiding.unhidden`'s reason, or
 * no group of it in the document, docs/route/ocg-erasure.md §6); and `hidden` (its class one the reader's toggles hide, openProto
 * `classes`: rules/content-classes.mjs)
 */
export const SKIP_CODES = Object.freeze(['unlocated', 'pieces', 'noRow', 'lost', 'offPages', 'author', 'refused', 'group', 'unfit', 'unproven', 'served', 'face', 'error', 'page', 'rowUnfit', 'unhidden', 'hidden'])
/** `code` where it is one of SKIP_CODES; a TypeError for any other, a defect of the caller's: no record carries a code outside the set */
export function skipCode(code) {
  if (!SKIP_CODES.includes(code)) throw new TypeError(`not a code of SKIP_CODES: ${typeof code === 'string' ? JSON.stringify(code.slice(0, 40)) : typeof code}`)
  return code
}
/** locatedWhole's why (tex.mjs) as the skip's code */
const JUDGED = Object.freeze({ unlocated: 'unlocated', pieces: 'pieces', 'no row': 'noRow', lost: 'lost' })

/** what an ink read of a page drawn from its draw geometry (openProto `drawOf`) throws while the page's pixels are not read:
 *  `page`, and `why`, the step that reads them. Its catcher reads them and does its step again; no step reads such a page as one
 *  with no ink */
export class NeedPixels extends Error {
  constructor(page, why) { super(`page ${page}'s pixels are not read yet (${why})`); this.name = 'NeedPixels'; this.page = page; this.why = why }
}

/**
 * A page's fonts as the run reads them, over caches as long-lived as the readers (a run's: its whole life): each font's class
 * (fonts.mjs classifyFont of its name and PDF.js's fallback family) and the characters its own map gives its glyphs (layer2.mjs
 * fontMappedOf's set; null: none to read), each kept by its key the first time it is read. `live(page, styles)`: the page's fonts
 * as PDF.js's commonObjs holds them, by loaded name, with its text content's styles; a font the document exported with no map
 * refuses the document (fontMappedOf's throw, `refusesDocument`). `draw(draw)`: a draw's (draw.mjs, checked), its text content
 * and Link annotations in PDF.js's shapes (drawInputsOf: `tc`, `raw`), its fonts by their content keys, a namespace of their own
 * (never a loaded name); a key read before with another row refuses the draw (a RangeError, nothing of it kept: the caller reads
 * the page live). Each gives `fontOf(name)` and `mapOf(name)`, pageChars2's readers
 */
export function fontReaders() {
  const fontClass = new Map(), fontMapped = new Map(), rowOfKey = new Map()
  const fontObj = (page, name) => { try { return page.commonObjs.get(name) } catch { return null } }
  return {
    live(page, styles) {
      return {
        fontOf: name => {
          let c = fontClass.get(name)
          if (!c) {
            c = classifyFont(fontObj(page, name)?.name ?? '', styles?.[name]?.fontFamily)
            fontClass.set(name, c)
          }
          return c
        },
        // (the characters each font's own map gives its glyphs, layer2.mjs mappedOf: null where it has none to read; a font
        // exported with no map, the document not opened with PDF_OPTIONS, throws: fontMappedOf)
        mapOf: name => {
          if (!fontMapped.has(name)) {
            // (the document's own fault, not the page's: every page of it would fail alike, so the run ends, as a host's bug must show)
            try { fontMapped.set(name, L2.fontMappedOf(fontObj(page, name))) } catch (e) { throw Object.assign(e, { refusesDocument: true }) }
          }
          return fontMapped.get(name)
        },
      }
    },
    draw(draw) {
      const x = drawInputsOf(draw)
      // (each key an item reads, with its row's text: a key seen before with another row is no font of the caches')
      const used = new Map()
      draw.items.forEach((it, k) => { const key = x.items[k].fontName; if (key !== null && !used.has(key)) used.set(key, JSON.stringify(draw.fonts[it[8]])) })
      for (const [key, text] of used) if (rowOfKey.has(key) && rowOfKey.get(key) !== text) throw new RangeError(`draw: the font key ${key} names another font than before`)
      for (const [key, text] of used) rowOfKey.set(key, text)
      return {
        tc: { items: x.items, styles: x.styles }, raw: x.annots, fills: x.fills,
        fontOf: key => {
          let c = fontClass.get(key)
          if (!c) {
            c = classifyFont(x.fonts.get(key)?.name ?? '', x.styles[key]?.fontFamily)
            fontClass.set(key, c)
          }
          return c
        },
        mapOf: key => {
          if (!fontMapped.has(key)) fontMapped.set(key, x.fonts.get(key)?.mapped ?? null)
          return fontMapped.get(key)
        },
      }
    },
  }
}

/** a page's characters (layer2.mjs pageChars2) and its Link annotations with the glyph points inside each (links.mjs annotsOf;
 *  null where they could not be read), from its text content, its fonts' readers (fontReaders'), its annotations and its items'
 *  fills (the draw's, or liveFillsOf's): the calls the run makes of a page's reading, live or from its draw (drawPageOn), for a
 *  gate that compares the two */
export function pageReadOf(tc, fontOf, mapOf, raw, fills = null) {
  const chars = L2.pageChars2(tc, fontOf, mapOf, fills)
  return { chars, read: raw === null ? null : LK.annotsOf(raw, LK.pointsOf(tc.items), LK.charPoints(chars)) }
}
/** the operator list PDF.js drew a page by, where its drawing is whole (the view's drawnList, view/layer-side.mjs): the page read
 *  live is drawn first, so that its ink is read off the same list with no second parse; null else */
const renderedList = page => {
  for (const st of page?._intentStates?.values?.() ?? []) if (st.displayReadyCapability && st.operatorList?.lastChunk) return st.operatorList
  return null
}
/** what a bounded operator list read of the live fills warns as, once a run */
const LIVE_LIST = { who: 'the reader\'s live fills' }
/** the longest the live fills' glyph walk runs on the main thread, ms: past it the page tells none (its fallback colours), never a
 *  part of them. The heavy-tier speed run on 31f36701 measured the whole walk at 5.0 ms a page p50, 13.8 ms at most */
export const LIVE_FILLS_MS = 16
/**
 * The fills of a page read live, as its draw tells them (layout/fills.mjs itemFills over pipeline/draw-data.mjs's glyphs): its ink
 * read off the list PDF.js drew it by (`list`, held from the page's early pixel read, or renderedList), else off its own operator
 * list waited for DRAW_WAIT_MS at most (a page whose drawing kept none: no second parse in the reader's flows), with PDF.js's
 * `OPS`; null (none told) for no OPS, a page whose ink is not whole (past a cap, past the walk's backstop, turned) or a list that
 * cannot be read in time. Asked only of a page with no usable draw, once its pixels are drawn
 */
export async function liveFillsOf(OPS, page, items, counted = null, list = null) {
  if (!Number.isInteger(OPS?.showText)) return null
  try {
    const ops = list ?? renderedList(page) ?? (await listWithin(page, LIVE_LIST, DRAW_WAIT_MS))
    if (!ops) return null
    // (the glyphs alone: no box, path, image or outline of the page's, which the fills do not read)
    const ink = pageInk(OPS, ops, page.commonObjs, { rotate: page.rotate ?? 0, glyphsMax: GLYPHS_PAGE, glyphsOnly: true, msMax: LIVE_FILLS_MS })
    // (its work: the list's operations walked, the glyphs read, the items told)
    if (counted) counted.fills += (ops.fnArray?.length ?? 0) + ink.glyphs.length + items.length
    return ink.capped || ink.timedOut || ink.rotated ? null : itemFills(items, ink.glyphs)
  } catch (e) {
    if (isMemoryError(e)) throw e
    return null
  }
}
/** the longest a page's drawing waits for its draw (openProto `drawOf`) once the page is covered and its drawing begins, ms: a
 *  draw that has not come by then (a left part's fetch that does not settle; one that fails is null at once) is no draw, the page
 *  read live. It decides what the reading costs, never what is drawn: a page reads alike either way */
export const DRAW_WAIT_MS = 2000
/** a page's characters by baseline, for its units' edges (openProto edgesOf): its non-blank characters sorted by baseline,
 *  their baselines, and its largest size, so that a read of the characters within a band of baselines halves to it and
 *  visits that band alone, where a scan of the page for every unit made the edges cost units x characters (the speed check
 *  of 2026-10-17: 3 ms a laid page) */
function rowsOf(chars) {
  const cs = chars.filter(c => /\S/.test(c.ch)).sort((a, b) => a.yb - b.yb)
  let size = 0
  for (const c of cs) if (c.size > size) size = c.size
  return { cs, yb: Float64Array.from(cs, c => c.yb), size }
}
const NO_ROWS = rowsOf([])
/** the first index of an ascending list at or over y (its length where none is) */
const firstAtOrOver = (a, y) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < y) lo = m + 1; else hi = m } return lo }
/** the page's body units that the even pass sets alike (a unit on two pages keeps its own fit) */
const EVEN_KINDS = new Set(['para', 'abstract', 'list', 'item'])
/** the SVG's own rules (the prototype's index.html): its text set as laid, in the layer's ink, in the faces it was
 *  measured in and no style made up of a face that has none (a bold or an oblique the family lacks stays regular) */
const SVG_RULES = ['.tl{position:absolute;left:0;top:0;overflow:visible;font-synthesis:none}', '.tl text{white-space:pre;fill:#141414}']
const r1 = x => Math.round(x * 100) / 100
/** a run's `still` that never stops it */
const ALWAYS = () => true
/** the pages whose rendering state (operator list, decoded images) the document keeps for the renders after them: every read of a
 *  page, by any run over the document, one parse of it while it is warm (visibility.mjs) */
export { WARM_PAGES } from './visibility.mjs'
const yieldNow = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(ok => setTimeout(ok, 0)))
/** the most of its own work v0 runs in one task, ms: units are laid back to back while their work since the last yield is
 *  under it, then it gives way, so that no task of the engine's approaches a long task (50 ms, the web's budget) but by one
 *  unit's own lay, and laying in turn spends no more turns than it needs (a frame waited for before every unit made the in-order
 *  page steps 2.9 times as long, 123.8 s against 43.1 s over the 30 outputs, 2026-10-16; a yield before every unit chained
 *  continuations into frames of 50 to 94 ms, the lp brief's item 3) */
export const SLICE_MS = 8
/** a slicer over a clock (`now`, ms): `due()`, whether the work since its last yield has reached `budget`; `give()`, a yield
 *  (`give`: scheduler.yield, else a macrotask), its clock started again after it */
export function slicer({ now = () => performance.now(), budget = SLICE_MS, give = yieldNow } = {}) {
  let since = now()
  return { due: () => now() - since >= budget, async give() { await give(); since = now() } }
}

/**
 * The order main.js lays its units in when every page after the first is drawn after its last batch is released: the
 * units in batches of `batch` in reading order (`placed`, sorted by stream); a unit waits on each of its pages in turn,
 * and a page already drawn (the first) costs a turn of the microtask queue. Returns the ids by the page whose drawing
 * lays them, in that order: [page, ids] for page 1 (the batches' own turns) and each later page.
 */
export function layGroups(placed, batch = 8) {
  const groups = [], waiting = new Map(), micro = []
  let drawn = 1, cur = []
  const step = (p, at) => {
    if (at >= p.pages.length) { cur.push(p.id); return }
    const pg = p.pages[at]
    if (pg <= drawn) micro.push([p, at + 1])
    else { if (!waiting.has(pg)) waiting.set(pg, []); waiting.get(pg).push([p, at + 1]) }
  }
  const drain = () => { while (micro.length) step(...micro.shift()) }
  for (let b = 0; b < placed.length; b += batch) {
    for (const p of placed.slice(b, b + batch)) step(p, 0)
    drain()
  }
  groups.push([1, cur])
  const last = Math.max(1, ...placed.flatMap(p => p.pages))
  for (let pg = 2; pg <= last; pg++) {
    drawn = pg
    cur = []
    micro.push(...(waiting.get(pg) ?? []))
    waiting.delete(pg)
    drain()
    groups.push([pg, cur])
  }
  return groups
}
/** layGroups' ids in their order */
export const layOrder = (placed, batch = 8) => layGroups(placed, batch).flatMap(([, ids]) => ids)

/**
 * A unit's layout made final: a CJK cell's lines moved into their bands between the rules over and under them
 * (layer2.mjs cellBands, clearLines) at the size it is drawn at. Every step that lays a unit anew (its fit, the page's
 * even pass, adaptiveFill's) ends here, before the unit is recorded or painted, or before anything is read of a layout it may
 * take (`layout`, the unit's own by default: adaptiveFill's tries, fillPage).
 */
export function settleLayout(p, layout = p.layout) {
  if (p.clear) L2.clearLines(layout.lines ?? [], p.clear.bands, p.s * (layout.scale ?? 1))
}

/**
 * A page's fill target, a pure function of the page: the units that begin on it (`units`, each fitted: `fillLead`,
 * `fitLines`, kind, `refused`) and those running on to it from a page before (`continuing`), and the band. `own` is the
 * median fill leading of the units that begin on it and tell one (a unit of one line has no leading to tell, and tells only
 * where no unit has more; the body kinds first, of all kinds where it has no body unit); `anchor` is the median fill leading
 * of every body unit drawn on it, a unit running on from the page before included; the target is `own` held within `band` of
 * `anchor`. Nothing is read from another page, a pass or the laying order (S3, 1b-C, the 1b design §2.2): a page's rhythm
 * is the same however the paper is opened. Null where no unit begun on the page tells a fill leading; `target` null where
 * only a continuation tells one. `body`: the page's body units told its own.
 */
/**
 * What a page's fill pass hands fillPage (fillPass): the units begun on the page, a unit laid in runs as its runs (`units`, each
 * filled as a unit of the page's); and the units its target reads (`voters`, `continuing`), each unit once, as one, at its fit
 * as one (`whole`): a unit's runs do not each vote, so that its neighbours keep the rhythm they had before it was laid in runs,
 * and a run drawn on a page before is no unit of the next page's anchor
 */
export function fillUnitsOf(begun, continuing) {
  return { units: begun.flatMap(p => p.runs ?? [p]), voters: begun, continuing }
}

export function pageTarget(units, continuing, band) {
  const r3 = x => Math.round(x * 1000) / 1000
  const tells = p => typeof p.fillLead === 'number'
  const withLead = units.filter(p => !p.refused && tells(p))
  const telling = withLead.filter(p => p.fitLines >= 2)
  const body = telling.filter(p => EVEN_KINDS.has(p.unit.kind))
  // (a unit running on from a page before is read at its fit's (`fit`, kept where the even pass lays a unit anew on its first
  // page: set at fit, so that it does not depend on whether that page's pass has run))
  const anchorOf = [...units, ...continuing.map(p => { const f = p.fit ?? p; return { unit: p.unit, refused: p.refused, fillLead: f.fillLead, fitLines: f.fitLines } })]
  const anchorLeads = anchorOf.filter(p => EVEN_KINDS.has(p.unit.kind) && !p.refused && tells(p) && p.fitLines >= 2).map(p => p.fillLead)
  const anchor = anchorLeads.length ? r3(median(anchorLeads)) : null
  const leads = (body.length ? body : telling.length ? telling : withLead).map(p => p.fillLead)
  if (!leads.length) return anchor === null ? null : { target: null, own: null, anchor, body: false }
  const own = median(leads)
  const target = r3(anchor === null ? own : Math.min(anchor + band, Math.max(anchor - band, own)))
  return { target, own: r3(own), anchor, body: body.length > 0 }
}

/**
 * adaptiveFill (P.adaptiveFill: { band, track, size }; D since 2026-10-07, generalised by D6's F6b on 2026-10-08, page-local
 * since 1b-C; null for B): the units that begin on a page (`units`, each laid already: tokens, blocks, s, P, layout), each
 * spread over its original's frame, the page's lines kept to one rhythm. A unit is filled at the state its fit set it at, its
 * leading apart: its fill leading is the loosest, from its fitted leading up to P.fillLead em of the size it is drawn
 * at (null: the original's own pitch), at which that state still sets it whole, so that its text reaches its frame's
 * foot. The page's target is pageTarget's: the median of its body units' fill leadings held within `band` of the median of
 * every body unit drawn on it (`continuing`: the units begun on a page before and running on to it), however the paper is
 * opened. Each unit takes its fill leading, but never more than `band` over the
 * target, so that neighbouring paragraphs keep one line spacing. A CJK unit the band or its fill leading's top stops
 * short of its fill then takes tracking, up to `track` em; and where every body unit of the page is still short with
 * all of it, the page's body units take one size, the largest up to `size` x the original's at which every one of them
 * is still set whole: one size a page where it grows, never a unit's own (D grew each unit apart, and a page mixed 1.0
 * and 1.1); a unit the fit had to shrink keeps its own largest fitting size. A unit its fitted state does not set again
 * (the text run past a display) keeps its own fit. Each unit filled is laid anew in place (p.P, p.layout, its extents
 * kept), then `onFilled(p, target)`. Returns pageTarget's answer: the page's target, its own (before it is held), the anchor
 * and whether its body units told it; `target` null where only a continuation tells, and null where nothing tells.
 */
export function fillPage(units, P, onFilled = () => {}, { continuing = [], voters = null } = {}) {
  const { band, track, size } = P.adaptiveFill
  const r3 = x => Math.round(x * 1000) / 1000
  // (a unit whose last row the next unit's first continues on a shared line, laid from where its fit ended there (`share`,
  // layer2.mjs shareOf), is filled only where that stays so: no leading, tracking or size that sets its text there further
  // right, sets text there where its fit left the row free, or moves its line there off the baseline the next unit's first
  // line was set on (the fit's, `at`). Its fill leading is still its fit's, which the page's target
  // reads (fillLeadsOf); the page's one size is chosen as before, and a unit it would move there keeps its own. Each try is
  // settled (settleLayout: a cell's lines in their bands) before anything is read of it, as the fit's share was: the row is
  // kept as it is drawn)
  const free = (p, st) => { const l = L2.layoutAt(p.tokens, p.blocks, p.s, p.P, st); if (l.clipped || (p.parent && !L2.keepsPages(p.layout.lines, l.lines))) return null; settleLayout(p, l); return l }
  const at = (p, st) => { const l = free(p, st); return l && L2.keepsShare(p.share, l.lines) ? l : null }
  // (a unit's fill leading is its fit's (fillLeadsOf), set as it is laid: computed here only for a unit given without it)
  for (const p of units) if (p.fillLead === undefined) fillLeadsOf(p, P)
  // (`voters`: the units the page's target reads, where they are not the units filled: a unit laid in runs is filled a run at
  // a time and read once, as one (fillPass))
  const told = pageTarget(voters ?? units, continuing, band)
  if (!told || told.target === null) return told
  const { target } = told
  // (each unit's leading as the pass lays it, its fill leading under the band over the target; and the next paragraph's: the
  // unit begun on the page whose first line is the next line of its column, P.halfLead's `below` under its last baseline. The
  // gap between two paragraphs is held to the leading of both and the original's skip there, the lower one's first line kept
  // on its baseline, so the upper one ends that much over it (layer2.mjs footFloorAt, `next`). Read from the units begun on the page alone,
  // whose leadings are fixed before any is laid: no laying order is read)
  const leadOf = p => Math.min(p.fillLead, r3(target + band))
  const spanOf = b => [Math.min(...b.rects.map(r => r[1])), Math.max(...b.rects.map(r => r[3]))]
  const nextOf = p => {
    const e = p.P?.halfLead, bl = p.blocks?.at(-1)
    if (!e?.foot || !Number.isFinite(e.below) || !bl) return null
    const y = bl.B.at(-1) - e.below, [x0, x1] = spanOf(bl)
    let best = null, most = 0
    for (const q of units) {
      const b0 = q.blocks?.[0]
      // (a unit of one line has no leading to show: a heading's or a one-line paragraph's fill leading is its fill's top)
      if (q === p || typeof q.fillLead !== 'number' || !(q.fitLines >= 2) || !b0 || b0.page !== bl.page || Math.abs(b0.B[0] - y) > 0.3 * (b0.sizes[0] ?? p.s)) continue
      const [a0, a1] = spanOf(b0), over = Math.min(x1, a1) - Math.max(x0, a0)
      if (over > most && over > 0.5 * Math.min(x1 - x0, a1 - a0)) { most = over; best = q }
    }
    return best ? leadOf(best) : null
  }
  const filled = []
  for (const p of units) {
    if (p.fillLead === null) continue
    // (laid with its last line no lower than a leading over the next line of its column, its own or the next paragraph's,
    // the larger, layer2.mjs footFloorAt; its tracking and the page's size with it, so that neither takes back the room its
    // leading gave)
    const lead = leadOf(p), next = nextOf(p)
    let st = { ...p.layout.state, box: true, lead, ...(next > lead + 1e-9 ? { next } : {}) }
    let l = at(p, st), closer = false
    if (!l && st.next) {
      // (its leading leaves the gap under it tighter than the next paragraph's lines: the loosest closer one that sets it,
      // down to the original's pitch; the floor is the next one's leading's, the same at every closer leading)
      const K = Math.ceil((lead - 1) / 0.01 - 1e-9), L = k => (k >= K ? 1 : r3(lead - k * 0.01))
      const floor = L2.footFloorOf(p.blocks, st, p.P, p.s)
      const found = K > 0 ? closerLead(K, k => at(p, { ...st, lead: L(k) }), floor === null ? null : guessCloser(p, K, L, () => floor)) : null
      if (found) {
        st = { ...st, lead: L(found.k) }
        l = found.l
        closer = true
      }
    }
    if (!l) continue
    // short of its fill at the band's edge or at its fill leading's top: tracking, the most that still sets it, then the
    // page's size (not one the next paragraph's gap set closer: it is spread to its floor)
    const short = !closer && (p.fillLead > target + band + 1e-9 || p.fillLead >= p.fillTop - 1e-9)
    let full = !short, tracked = 0
    const untracked = { st, l }
    if (short && P.cjk) {
      // (the most tracking that still sets it: halving, as a wider tracking holds no more on a line)
      const K = Math.round(track / 0.01), st2 = k => ({ ...st, track: r3(st.track + k * 0.01) })
      let ok = 0, no = K + 1, lk = null
      while (no - ok > 1) { const k = (ok + no) >> 1, l2 = at(p, st2(k)); if (l2) { ok = k; lk = l2 } else no = k }
      if (ok) { st = st2(ok); l = lk }
      full = ok < K
      tracked = ok
    }
    filled.push({ p, st, l, full, tracked, untracked })
  }
  // (the runs of a unit split by its displays (`parent`, run.mjs layoutRuns) keep one tracking, as their fit does
  // (layer2.mjs layoutRuns): each the least any of its unit's runs on the page takes, a run the pass does not track taking
  // none; its leading still its own)
  const least = new Map()
  for (const q of units) if (q.parent) least.set(q.parent, Math.min(least.get(q.parent) ?? Infinity, filled.find(f => f.p === q)?.tracked ?? 0))
  for (const f of filled) {
    const k = f.p.parent ? least.get(f.p.parent) : f.tracked
    if (k >= f.tracked) continue
    const l = k ? at(f.p, { ...f.untracked.st, track: r3(f.untracked.st.track + k * 0.01) }) : null
    f.st = l ? { ...f.untracked.st, track: r3(f.untracked.st.track + k * 0.01) } : f.untracked.st
    f.l = l ?? f.untracked.l
  }
  // the page's one size where it grows: every body unit's, where none is full yet; the largest at which every one is still
  // set whole, by halving (a larger size sets no more), a unit that fails ending the try. A unit the fit had to shrink
  // keeps its own largest fitting size: setting the page's other body units at it (PR #335's reviews) left the alphabets'
  // and Japanese's units short of their frames, the alphabets unable to spread past the original's pitch (paraGap 1.255
  // -> 1.708, as before D6; full size 0.25 -> 0; Japanese 1.011 -> 1.289), the coordinator's ruling of 2026-10-09
  const grown = filled.filter(f => EVEN_KINDS.has(f.p.unit.kind))
  if (size > 1 && grown.length && grown.every(f => !f.full)) {
    const scaleOf = k => r3(1 + k * P.step)
    // (a unit of one line keeps its own size in the scripts that spread to fillLeadRel: it has no frame to spread over, so a
    // larger size only carries its ink past the original's line, over a rule or a neighbour's text that the size step cannot
    // see, which the grid's last step above exposes (it makes more pages grow): 2610.21924's note of one line under a table's
    // rule, whose formulas touched it at x1.1. The other scripts' page fill is as it was until it is measured on theirs)
    // (a run reads its unit's line count: a unit's runs grow together, or none of them)
    const steps = f => !(P.fillLeadRel && (f.p.parent ?? f.p).fitLines < 2)
    const all = k => { const ls = []; for (const f of grown) { if (!steps(f)) { ls.push(null); continue } const l = free(f.p, { ...f.st, scale: scaleOf(k), knob: 'grow' }); if (!l) return null; ls.push(l) } return ls }
    let ok = 0, no = Math.round((size - 1) / P.step) + 1, best = null
    while (no - ok > 1) { const k = (ok + no) >> 1, ls = all(k); if (ls) { ok = k; best = ls } else no = k }
    if (ok) grown.forEach((f, i) => { if (!best[i] || !L2.keepsShare(f.p.share, best[i].lines)) return; f.st = { ...f.st, scale: scaleOf(ok), knob: 'grow' }; f.l = best[i] })
  }
  for (const { p, st, l } of filled) {
    const keep = p.layout.extents
    p.P = { ...p.P, leadBase: st.lead }
    // (its fit's knob kept, a step past its states among them (widen, below-floor), but the page's size grown)
    if (st.knob !== 'grow') l.knob = p.layout.knob
    p.layout = l
    p.layout.extents = keep
    // (laid anew, and settled as it was tried (`free`): its clearance at its new size, before it is recorded or painted; the
    // pass put a cleared CJK cell's first line back on the original's baseline, over its rule, 2026-10-07)
    onFilled(p, target)
  }
  return told
}

/**
 * A unit's fill leading (fillPage's) and its top, read from its fit alone: `fillTop`, the loosest leading P.fillLead allows
 * it at the size it is set at, × its original's pitch (1: the original's own pitch, P.fillLead null; the looser of that and
 * P.fillLeadRel × the original's pitch scaled by the fit's size, where the script has one); `fillLead`, the
 * loosest leading from its fitted one up to the top at which its fitted state still sets it whole as the page fill lays it
 * (its last line no lower than a leading over the next line of its column, layer2.mjs footFloorAt: its last baseline on its
 * frame's last but where that would leave the gap under it tighter than its lines); where its fitted one does not, the
 * loosest closer one, down to the original's pitch (null where that state does not set it again). Set on the unit as it is laid (afterLay), so that the fill leading a page's pass reads of a unit
 * running on to it from a page before no longer depends on whether that page's pass has run (the 1b design, §2.1 C1). Not
 * yet the rest of the pass's reads: its line count, read live (after its first page's fill), and the targets the page is
 * held to (`held`, through every page passed before) are S3's, 1b-C's
 */
function fillLeadsOf(p, P) {
  const r3 = x => Math.round(x * 1000) / 1000
  const at = (q, st) => { const l = L2.layoutAt(q.tokens, q.blocks, q.s, q.P, st); return l.clipped || (q.parent && !L2.keepsPages(q.layout.lines, l.lines)) ? null : l }
  if (P.fillLead === null) p.fillTop = 1
  else {
    const pitches = p.blocks.map(b => b.pitch0).filter(v => v > 0).sort((a, b) => a - b)
    const p0 = pitches.length ? pitches[pitches.length >> 1] : 1.2 * p.s
    const emTop = r3((P.fillLead * p.s * p.layout.state.scale) / p0)
    // (fillLeadRel: a loose original's pitch can be as wide as the em top or wider, which would pin its translation to the
    // original's own pitch and end its paragraph early; the top is then fillLeadRel × the original's pitch scaled by the fit's
    // size, where that is the looser. Never tighter than the em top, so a single-spaced original is unchanged)
    p.fillTop = P.fillLeadRel ? Math.max(emTop, r3(P.fillLeadRel * p.layout.state.scale)) : emTop
  }
  // (a looser leading holds no more lines than a closer one: the loosest that sets the unit is found by halving, a few
  // layouts a unit where trying each hundredth from the top took up to forty. Monotone in practice, not by construction:
  // the greedy breaking's kinsoku and hanging marks could make a looser value set a unit a closer one does not; the linear
  // search from the top is the reference, and the halving drew the same on every fixture. So for the tracking and size)
  p.fitLines = p.layout.lines.length
  const st = p.layout.state
  // (as the page fill lays it, its last line no lower than a leading over the next line of its column: layer2.mjs footFloorAt.
  // A state that sets it so sets it without the floor too, which only takes slots off its last frame's foot: the fitted state
  // is laid again only where that one does not set it)
  const lo = st.lead, bx = { ...st, box: true }
  if (at(p, bx)) {
    const hi = p.fillTop, L = k => Math.min(hi, r3(lo + k * 0.01))
    // (the grid's last step is the top itself, which `short` (fillPage) reads. Rounding the step count down left it untried
    // where the fraction was under a half, and the unit then took neither tracking nor the page's size; fillLeadRel's scripts
    // count it up, the others' fill as it was until it is measured on theirs)
    const steps = (hi - lo) / 0.01
    let ok = 0, no = (P.fillLeadRel ? Math.ceil(steps - 1e-9) : Math.round(steps)) + 1
    while (no - ok > 1) { const k = (ok + no) >> 1; if (at(p, { ...bx, lead: L(k) })) ok = k; else no = k }
    p.fillLead = ok ? L(ok) : lo
    return
  }
  if (!at(p, st)) { p.fillLead = null; return }
  // (its fitted leading leaves the gap under it tighter than its lines, the fit having set its last line to its frame's foot:
  // the loosest closer one that does not, down to the original's pitch, which asks nothing. Where even that does not set it,
  // its fitted one. The floor moves with the leading here, its own)
  const floor = Math.max(1, P.leadFloor ?? 1), K = Math.ceil((lo - floor) / 0.01 - 1e-9), L = k => (k >= K ? floor : r3(lo - k * 0.01))
  const found = K > 0 ? closerLead(K, k => at(p, { ...bx, lead: L(k) }), guessCloser(p, K, L, lead => L2.footFloorOf(p.blocks, { ...bx, lead }, p.P, p.s))) : null
  p.fillLead = found ? L(found.k) : lo
}

/**
 * The loosest leading of a closer search's grid at which a unit sets (fillLeadsOf, fillPage): L(k) for k from 1 to K, closer
 * as k grows, L(K) the original's pitch, the leading before them (k 0) known not to. `sets(k)`, the layout at L(k) or null.
 * By halving from the grid's ends, as a looser leading holds no more lines than a closer one (monotone in practice, as the
 * fill's other searches take it); first, where a guess is given (guessCloser), the guess confirmed by two layouts, it set
 * and the step looser not, which the halving would have found by the same order: each search of the kind took six layouts
 * or seven a unit, which the speed check of 2026-10-17 found (the page fill under the gap rule 0.7 % more fit states).
 * Returns { k, l } (the layout at L(k), the one the search laid there) or null where L(K) does not set it either
 */
function closerLead(K, sets, guess) {
  if (guess !== null && guess >= 1 && guess <= K) {
    const l = sets(guess)
    if (l && (guess === 1 || !sets(guess - 1))) return { k: guess, l }
  }
  let best = sets(K)
  if (!best) return null
  let no = 0, ok = K
  while (ok - no > 1) { const k = (ok + no) >> 1, l = sets(k); if (l) { ok = k; best = l } else no = k }
  return { k: ok, l: best }
}

/**
 * Where on a closer search's grid (closerLead's L(k)) a unit of one frame first ends no lower than its floor (`floorAt(L)`,
 * footFloorAt's at that leading, null where none is asked): its n lines from the frame's first baseline B0, L p0 apart (no
 * first line moves), its last at B0 - (n - 1) L p0, which a slot holds 0.05 under its floor; arithmetic, no layout. Null for a
 * unit of more frames or of one line, where its lines' places are not that simple: the halving decides
 */
function guessCloser(p, K, L, floorAt) {
  if (p.blocks?.length !== 1 || !(p.layout?.lines.length >= 2)) return null
  const b = p.blocks[0], n = p.layout.lines.length, p0 = b.pitch0 ?? 1.2 * p.s
  for (let k = 1; k <= K; k++) {
    const f = floorAt(L(k))
    if (f === null || b.B[0] - (n - 1) * L(k) * p0 >= f - 0.05) return k
  }
  return null
}

/**
 * The ink of a page that stays visible where a unit's lines would move to (E3 for the leftover packed, packPage): the
 * page's ink map (layer2.mjs inkMapOf, of the original page as PDF.js draws it: text, rules, images and vector paths
 * alike), less the glyphs the drawing takes away (`accounted`: the boxes of the characters the page's painted units
 * account for, hidden with them, each grown by a map cell, as the map holds a cell any of whose pixels is inked). Boxes are
 * [x0, y0, x1, y1] in PDF units; `toDev` and `toPdf` map between them and the map's canvas. Returns
 * foot(x0, x1, y0, y1): the PDF y of the lowest staying ink's foot in that box, or null where it holds none.
 */
export function stayingInk({ map, toDev, toPdf, accounted = [] }) {
  const { w, h, factor: f } = map
  const cells = (x0, y0, x1, y1, pad) => {
    const [ax, ay] = toDev(x0, y1), [bx, by] = toDev(x1, y0)
    return [Math.max(0, Math.floor(Math.min(ax, bx) / f) - pad), Math.max(0, Math.floor(Math.min(ay, by) / f) - pad), Math.min(w - 1, Math.floor(Math.max(ax, bx) / f) + pad), Math.min(h - 1, Math.floor(Math.max(ay, by) / f) + pad)]
  }
  const stay = map.ink.slice()
  const fill = (b, pad, v) => { const [c0, r0, c1, r1] = cells(b[0], b[1], b[2], b[3], pad); for (let r = r0; r <= r1; r++) stay.fill(v, r * w + c0, r * w + c1 + 1) }
  for (const b of accounted) fill(b, 1, 0)
  return (x0, x1, y0, y1) => {
    if (!(y1 > y0) || !(x1 > x0)) return null
    const [c0, r0, c1, r1] = cells(x0, y0, x1, y1, 0)
    for (let r = r1; r >= r0; r--) for (let c = c0; c <= c1; c++) if (stay[r * w + c]) return toPdf((c + 0.5) * f, (r + 1) * f)[1]
    return null
  }
}

/**
 * The leftover packed (P.leftover 'pack', D6's F6c, the maintainer's experiment of 2026-10-08; 'foot' keeps it at each
 * unit's foot): a page's body units (`units`, laid and filled: blocks, layout, s) moved up so that each paragraph keeps
 * the original's gap to the one above it, and what its fill leaves over gathers at the end of the run of paragraphs, before
 * the next fixed thing. A unit moves where it is a body unit of one block, on this page alone, below another body unit of
 * the page in its column with nothing between them: no other unit's line (`rects`, every unit's rectangles on the page:
 * [id, [page, x0, y0, x1, y1]]), no character of the page (`chars`: a display, a label), and no more than three of the
 * upper's pitches of the original's (a figure's room); and its first line its own (no other unit's line on it, no
 * character before its start: a run-in heading stays with its text). A heading, a display, a float, a unit drawn on two
 * pages or one left the original's is fixed: a run ends at it. Its first line is then set as far under the upper's last drawn line as
 * the original's are apart, never lower than it was, its lines moved together; the units are taken from the top, so that
 * a run's moves add up. The cost: a paragraph's top leaves its original's line.
 * And it moves over no ink that stays (E3, by construction): `stays(x0, x1, y0, y1)`, the foot (PDF y) of the lowest ink in
 * a box that the drawing leaves visible, or null (stayingInk: the page's ink but the glyphs its painted units take away,
 * and the add-on's dirty boxes). A unit whose own lines' band holds such ink does not move; one that would rise into it
 * stops short of its foot by `gap` of its pitch (P.borrowGap: the room a unit's borrowed lines keep above ink below
 * them). Null: no ink is read (the tests of the rest).
 * Returns the moves by unit id (PDF units up), the units that moved in the order they were taken.
 */
export function packPage(pg, units, rects, chars, stays = null, gap = 0) {
  const lastOf = p => { let i = -1; p.blocks.forEach((b, j) => { if (b.page === pg) i = j }); return i }
  const linesOf = (p, bi) => p.layout.lines.filter(l => l.page === pg && l.block === bi)
  const body = units.filter(p => EVEN_KINDS.has(p.unit.kind) && !p.refused && p.layout)
  const movable = body.filter(p => p.pages.length === 1 && p.pages[0] === pg && p.blocks.length === 1 && p.blocks[0].page === pg && linesOf(p, 0).length)
    .sort((a, b) => b.blocks[0].B[0] - a.blocks[0].B[0])
  const moves = new Map()
  for (const q of movable) {
    const b = q.blocks[0], top = b.B[0] + 0.75 * (b.sizes[0] ?? q.s)
    let upper = null
    for (const p of body) {
      if (p === q) continue
      const ai = lastOf(p)
      if (ai < 0 || !linesOf(p, ai).length) continue
      const a = p.blocks[ai]
      const span = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
      if (span < 0.5 * Math.min(a.x1 - a.x0, b.x1 - b.x0) || !(a.B.at(-1) > b.B[0])) continue
      // (the nearest above it: the lowest last line over its first)
      if (!upper || a.B.at(-1) < upper.a.B.at(-1)) upper = { p, a, ai }
    }
    if (!upper) continue
    const { p, a, ai } = upper
    const foot = a.B.at(-1) - 0.22 * (a.sizes.at(-1) ?? p.s), g0 = foot - top
    if (!(g0 > 0) || g0 > 3 * (a.pitch0 ?? 1.2 * p.s)) continue
    const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1)
    const across = (l, r) => Math.min(x1, r) - Math.max(x0, l) > 1
    if (rects.some(([id, r]) => id !== p.id && id !== q.id && r[0] === pg && across(r[1], r[3]) && r[4] > top + 0.1 && r[2] < foot - 0.1)) continue
    if (chars.some(c => /\S/.test(c.ch) && across(c.x0, c.x1) && c.yb + 0.28 * c.size > top && c.yb + 0.28 * c.size < foot)) continue
    // (nor one whose first line it shares with what stays: a run-in heading, a label, the tail of a unit before it)
    const start = b.x0 + (b.indent ?? 0) - 1
    if (rects.some(([id, r]) => id !== q.id && r[0] === pg && r[2] < b.B[0] && r[4] > b.B[0] && r[3] > b.x0 && r[1] < b.x1)) continue
    if (chars.some(c => /\S/.test(c.ch) && Math.abs(c.yb - b.B[0]) < 0.3 * c.size && c.x1 > b.x0 && c.x1 < start)) continue
    // (by baselines: the upper's last drawn line as it now stands, a unit above it that moved having moved it, above its
    // original's last by what its fill left; the lower's first as far from it as the original's are. A size smaller than the
    // original's is not made up for: its glyphs' smaller ascent is no blank line, and its lines stay on the original's pitch)
    const own = linesOf(q, 0), up = linesOf(p, ai)
    let d = Math.round(((Math.min(...up.map(l => l.baseline)) - a.B.at(-1)) - (Math.max(...own.map(l => l.baseline)) - b.B[0])) * 1000) / 1000
    if (d <= 0) continue
    // (over no ink that stays: its glyphs' band as drawn, a CJK em over the baseline to a descender under it, must hold
    // none, and the band it rises into is held clear of the lowest by the clearance)
    if (stays) {
      const f = q.layout.f, clearance = gap * (b.pitch0 ?? 1.2 * q.s)
      const top = Math.max(...own.map(l => l.baseline)) + 0.88 * f, low = Math.min(...own.map(l => l.baseline)) - 0.25 * f
      if (stays(b.x0, b.x1, low, top) !== null) continue
      const ink = stays(b.x0, b.x1, top, top + d + clearance)
      if (ink !== null) d = Math.round((ink - clearance - top) * 1000) / 1000
      if (d <= 0) continue
    }
    for (const l of q.layout.lines) l.baseline += d
    moves.set(q.id, d)
  }
  return moves
}

/**
 * v0 over a paper's first `pages` pages. `doc`: the original opened by PDF.js (with PDF_OPTIONS); `geometry`: the made
 * output's geometry (schema 1); `units`: its units file's units (each { kind, src, pieces, state }); `target`: the
 * language; `expect`: the ids of the units the run will report that are still to come (take, end), `units` then sparse
 * (a hole a unit not yet arrived), each page laid once every unit it reads has come; null (today's call): every unit is
 * in `units`. `groups`: each unit's table group, known at open (the paper's bundle, groups.mjs groupOf), so that a
 * group is read once its own cells' rows are in; null: once every row is. Options as main.js's query: `scale` (CSS px a
 * PDF unit), `dpr`, `batch`, `phMode` ('auto' or 'source'),
 * `order` (ids whose order a page's units are laid in, in place of layGroups': a recorded run's). `faces`:
 * 'roles' (the role table's) or 'prototype' (the prototype's own).
 * `faceSources(id)`: a promise of the slices the host serves of a role table face, each { url, ranges } (its file on the
 * host's origin and its code points as [start, end] pairs), null where the face is not served, rejected where the host
 * could not say; a face is asked the first time a unit needs it and awaited before the unit is laid. Each slice is one
 * FontFace; a unit whose text has a character in no served slice of its runs' faces and their fallbacks is left the
 * original's, skipped with the why `served`, and one whose slice does not load, `face`. Absent: each face is its whole file at
 * `faceUrl(file)`, covering the face's COVERAGE. The target's body face's first slice is fetched at the open.
 * `faceUrl(file)`, `fontUrl(file)`, `hyphUrl(lang)`: where the host serves the role table's faces (by file name), the
 * prototype's Latin Modern (by name) and TeX's patterns. Nothing is drawn until `until(p)` is awaited.
 * `tex` (the layout file, tex.mjs; required): the layout file (`index`, layout/file.mjs indexLayout's, a file of no unit
 * where the maker refused to make one or the bundle dropped it), the units file's pieces by unit (`pieces`), and how its
 * geometry is taken (`extents`: 'v0' or 'tex', the lines' erase extents as v0 reads them from the characters or the
 * file's; `symbols`: 'strict' or 'text', locatedWhole's). The layer draws a unit only from the file: each unit the file
 * locates whole takes its lines, label and placeholders from it (the units only the file holds too, but table cells);
 * every other unit, one the file does not hold or one with a visible piece it has no position for, is the original's, and
 * so is a unit whose ink the file cannot draw (`unproven`, tex.mjs cropsOf).
 * `copy`: whether each page's copy is kept at v0's own resolution (`right`), the plane the checker and the gate measure;
 * a view draws the page at its own (drawCopy) and needs none. Without it the original (`left`) is read once, for the page's
 * ink, and its canvas let go as the page is drawn (`left` is null): nothing else reads it, and the checker, which does, is
 * refused.
 * `doc` is our wrapped page (docs/route/ocg-erasure.md §2: each unit's ink in its own optional-content groups, all shown by
 * default): a unit is drawn by hiding its groups on the pages it is drawn on (hide.mjs, visibility.mjs), its crops cut from the page
 * with every unit's text hidden, what its reading keeps pasted from a render that shows it. `hiding` (the file's word on what it
 * could not wrap): `unhidden(id)`, why a unit's ink cannot be hidden (marks, across, spell, page, bounds) or null, and
 * `rules(page)`, the table rules near the page's cells (x0, y0, x1, y1 stride 4: layer2.mjs cellBands); a unit it says is unhidden,
 * or whose text group the document does not hold, is the original's. Absent: every unit the document holds a group for is drawn.
 * `labels`: { captions }, which of the two floats, figures and tables, the final names in the target's language (the
 * record's `captions`, live.mjs captionsOf): a float's label is drawn in the target's name for it, which the layout rules
 * give (`rules`), where the final's is (layer2.mjs labelInTarget), else kept as the original's ink; and each babel name
 * the layout file locates (a generated heading: Abstract, References, Contents, …) in the target's word for it, unless the
 * target has none: the captions do not decide for a name TeX identified (layer2.mjs nameInTarget; paintNames). A table's group
 * (each record unit's `group`) is drawn whole or not at all.
 * `rules`: the layout rule set (rules/layout.mjs RuleSet) every choice made for the target is read from, resolved once at
 * the open and fixed for the run: the fit's parameters (leading, tracking, floor, adaptive fill and the rest), how a line
 * breaks, the hyphenation patterns and their minimums, the CJK family, the names of a float. Absent: BUILTIN_RULES. A
 * host passes the set it loaded (readRules); there is no per-field override.
 * `parts` (BUNDLE 4's door, the door design §0 to §3): the paper comes in parts (grow, endParts), opened with no view and no left
 * unit (`geometry` its kinds alone), each unit's group (`groups`), the layout file's index following the parts
 * (facade.mjs): a page is drawn once a part covers it, a unit placed once its
 * part is in (and its row taken or the rows ended), and every page drawn as the open over the whole paper draws it. A page no
 * part covers once the parts end, or whose drawing throws, fails (`failed`) and is stepped over. `onRetired(doc)`: a document
 * the run read and no longer reads (dispose), told once. `onStep(page)`: a page's step ended (its units laid, or it
 * failed). `onWait(what)`: the run waits, for a `part` or for `rows` (an instrument: the readiness its host tells is held by it).
 * `free` (the reader's; the 1b design §3): what the run reads to lay a page let go once nothing will read it again. A page's
 * analysis state (its characters, its ink map, its items and what its painted units account for and keep, its units laid)
 * goes once the page is done (doneAt), no unit still to be laid reads it (`reads`: the pages of its lines and of its
 * placeholders' segments, a crop's page) and none on it is still to be painted on another page; a unit's reading, tokens, layout, blocks, its share of its pages' characters, its
 * lead and the file's lines once it is painted on all its pages (or left the original's) and every page it is on has passed.
 * What stays of a page is its record: its markup, its drawing's operations, its words and links, its fill numbers; of a
 * unit, its place and its row. Default false: every state kept, as the lab reads it. `records` (default true; the reader's
 * false): each laid unit's record (`stats`) and the
 * drawing's audit (`audit`), the gate's measures, which nothing that draws reads; without them only their count (`drawn`).
 * With both, what the run lets go is kept on the gate's shelf (`full`, `chars`, the checker): the run draws as one that
 * frees, and the gate measures it whole.
 * `drawOf(page)` (E-C, the door's for BUNDLE 5's parts): a promise of the page's draw geometry (layer-proto/draw.mjs, checked:
 * its text items, fonts and Link annotations, as the server read them of arXiv's PDF), or null; asked once a page, for every page of
 * a closure as it is taken. A page with a draw is read from it: its viewport alone of PDF.js's (getPage), no text content,
 * annotation or pixel read; one with none (null, an ask that threw, a draw whose font key names another font than before) is read
 * live, as without drawOf. Its pixels (its ink map) are read where a step reads them, and only there: the page asked, at once; a
 * unit's lay that reads a page's ink (borrowing below its lines, widening over the paper beside them: laid again once the pixels
 * are in, NeedPixels), a crop's growth, a name put back; and a paint, which waits for the page's own closure (a unit running on to
 * a page beside the one asked is painted there once that page is laid, in its own order). Every page is drawn as without drawOf.
 * Used where every ink read can wait so: no copy kept (`copy` false), a page pass, no even pass, no leftover packed; else ignored
 * (`drawStats` null). Absent: every page read live, today's path. `drawsComing` (the door's, its head's `draw: 1`: the parts may carry
 * draws): the page asked is read for its pixels at its ask, once a part covers it, before its draw (or page 1's) is in, whether it
 * is then read from its draw or live; without it, once its draw is in, a page with none read in the closure's order, page 1 first.
 * `OPS` (PDF.js's operator codes, the host's): a page read live reads its characters' fills off the list PDF.js drew it by
 * (liveFillsOf), as its draw tells them; without it such a page tells none.
 */
/** whether a table cell's box is other cells' too (cells.mjs cellSpans), of the unit openProto holds: the source
 *  unit's, which rows.mjs unitOf carries (`spans`, a translated row keeping no piece of its \\multirow), else the unit's own */
export const unitSpans = u => (typeof u?.spans === 'boolean' ? u.spans : cellSpans(u))
export { cellSpans }

export async function openProto({ doc, geometry, units: given, expect = null, groups: tableGroups = null, target: to, pages = 999, scale = 1.25, dpr = 1, batch = 8, phMode = 'auto', order: orderIn = null, faces = 'roles', faceSources = null, faceUrl = file => `/fonts/${encodeURIComponent(file)}`, fontUrl, hyphUrl = lang => `/hyph/${lang}.json`, tex, copy = true, hiding = null, labels = null, rules = BUILTIN_RULES, parts: partsMode = false, onRetired = null, onStep = null, onWait = null, free = false, records = true, drawOf = null, drawsComing = false, OPS = null, classes = null }) {
  if (classes !== null && typeof classes !== 'object') throw new TypeError(`classes: the reader's toggles or null, not ${kindOf(classes)}`)
  // (the reader's toggles, the door's option, which the door gives resolved: a unit whose class they do not show is the original's.
  // A direct open given none takes the reader's defaults, the author block's names and a bibliography's entries left the
  // original's: TOGGLE_DEFAULTS)
  const on = classesOn(classes), classShown = u => unitShown(u, on)
  if (expect !== null && (!Array.isArray(expect) || !expect.every(id => Number.isSafeInteger(id) && id >= 0))) throw new TypeError(`expect: ids of units or null, not ${kindOf(expect)}`)
  if (drawOf !== null && typeof drawOf !== 'function') throw new TypeError(`drawOf: a function or null, not ${kindOf(drawOf)}`)
  if (tableGroups !== null && !(tableGroups instanceof Map)) throw new TypeError(`groups: a Map of ids to groups or null, not ${kindOf(tableGroups)}`)
  if (faceSources !== null && typeof faceSources !== 'function') throw new TypeError(`faceSources: a function or null, not ${kindOf(faceSources)}`)
  if (tex === null || typeof tex !== 'object' || !tex.index) throw new TypeError(`tex: the layout file's index and the units' pieces (the layer draws only from the file), not ${kindOf(tex)}`)
  if (partsMode && !tableGroups) throw new TypeError('parts: the open is given each unit\'s table group (the door\'s choice)')
  // (parts: the views and the left come with the parts, grow; the views given are none)
  if (partsMode) geometry = { ...geometry, left: { pages: [], units: [] } }
  // every choice made for the target, in one call: the layout rules' (rules/layout.mjs resolveRules), the built-in set's or
  // the host's: the fit's parameters, the hyphenation patterns, the CJK family, the float labels' names
  const R = resolveRules(rules, to)
  const P = R.params
  /** the paper's \lineskip and \lineskiplimit, TeX's (the layout file's): where a laid line comes nearer the one before it
   *  than the limit, its crops being taller or deeper than its room, it opens as TeX opens one (layer2.mjs breakLines);
   *  null where the file has none: no line opens */
  const LINESKIP = tex.index.file.lineskip ?? null
  /** whether a page's units are set together once all are laid (the even pass, the page fill, the leftover packed) */
  const PASSES = !!(P.even || P.adaptiveFill || P.leftover === 'pack')
  /** whether a page may be laid with its closure alone, whatever was laid before it (the 1b-D design §1.4): every pass reads
   *  only its own units' fits and fit-time numbers of a unit running on to it, and a page is painted in its own order at its
   *  passes. Not where the even pass or the leftover's packing reads a unit running on to the page as laid on the page
   *  before (1b-design C1), nor where no pass runs and each unit is painted as it is laid (no adaptive fill): those lay in
   *  the stream's order, the prefix needsOf reads. No built-in rule set is so */
  const ORDER_FREE = PASSES && !P.even && P.leftover !== 'pack'
  /** whether pages are read from their draws (drawOf): where every ink read can wait for a page's pixels, no copy kept (the
   *  checker's, which reads every page's), a page pass (each unit painted as it is laid reads its pages' ink at once), no even pass
   *  (it lays a page's units anew, and a fit may then measure the room below a block, its page's ink, outside the lay that waits
   *  for pixels) and no leftover packed (the pass reads its page's ink as it moves units). The other passes read no ink: the page
   *  fill lays at a fit's own state (layoutAt), and a paint waits for its page's pixels (paintOn) */
  const DATA = drawOf !== null && !copy && PASSES && !P.even && P.leftover !== 'pack'
  // iteration 2's hyphenation, fetched at once (local, small)
  const hyphP = Promise.all(R.patterns.map(async l => L2.setHyphenData(l, await loadHyphenation(l, hyphUrl(l)))))
  // the target's likely faces loaded meanwhile (Times-like until the paper's own designs are known), and Latin Modern at
  // once: the page's characters are measured in their own designs
  const roles = faces === 'roles'
  // (the role table's faces: the paper's family is known from its first page; until then its Latin faces, which no
  // family changes)
  setRoleFaces(roles ? to : null, OPEN_FAMILY, R.cjkFaces)
  const warmP = roles ? null : L2.warmFaces(to, P.cjk, { serif: 'times' }, yieldNow)
  const lmP = roles ? null : loadWebFaces(['cm', 'cmss', 'cmtt'], fontUrl)
  // the role table's faces as the host serves them, each asked when a page or a unit first needs it and loaded for the
  // text it is measured and drawn with; the target's body face's first slice is fetched now, to overlap the host's other
  // fetches
  const FS = roles ? roleFaceSet({ faceSources, faceUrl }) : null
  FS?.warm(bodyFaceId())
  const N = Math.min(doc.numPages, pages)
  // the document's groups, read once (visibility.mjs): a unit is drawn only where its own groups can hide its ink (decide)
  const VIS = visibilityOf(doc)
  await VIS.ready
  /** why unit `id`'s ink cannot be hidden, or null: the file's own reason (`hiding.unhidden`: marks, across, spell, page,
   *  bounds), or its text group missing from the document */
  const unhiddenOf = id => hiding?.unhidden?.(id) ?? (VIS.has(textGroup(id)) ? null : 'no group')
  /** whether unit `id`'s label may be drawn anew: its label group in the document, and the file not keeping it as the original's
   *  (`labelKept`, design §6: a label its marks cannot delimit stays the original's ink, the body drawn) */
  const relabels = id => !hiding?.labelKept?.(id) && VIS.has(labelGroup(id))
  /** unit `p`'s label as a theorem-like head in the target's name (layer2.mjs headLabelInTarget), its characters the page's in
   *  the layout file's label box (its first: a head's one), or null. The page's, not the unit's own part of it: the box is TeX's,
   *  and the part's split may leave a head's first letters to the unit before (2610.18513v1 p18 u150, "finition5.1(") */
  const headOf = p => {
    const lb = p.tex?.lu?.labels
    if (!lb || lb.length < 7) return null
    const [, pg, x0, , x1, top, bottom] = lb
    const chars = (chars2[pg - 1] ?? []).filter(c => /\S/.test(c.ch) && (c.x0 + c.x1) / 2 >= x0 - 0.5 && (c.x0 + c.x1) / 2 <= x1 + 0.5 && c.yb >= bottom - 0.5 && c.yb <= top + 0.5).map(c => ({ ...c, page: pg }))
    if (!chars.length) return null
    const head = L2.headLabelInTarget(chars, to, ownNames)
    return head ? { ...head, chars } : null
  }
  /** page j's table rules near its cells (the file's: layer2.mjs cellBands), or undefined */
  const rulesOf = j => hiding?.rules?.(j)
  // (parts: the last page a part covers, and whether the parts have ended; every page at once otherwise. A page that failed:
  // its drawing threw, or no part covers it once the parts have ended)
  let through = partsMode ? 0 : N, partsEnded = !partsMode
  const failedPages = new Set()

  // (parts: a page has a row once a part tells its view)
  const rows = partsMode ? new Array(N).fill(null) : []
  /** page i's row, at its view's size: its canvases and its record (the 1b design §1): the markup of its SVG, the strings its
   *  names and units are set in as each is painted (svgOf makes the element of them anew at each ask: the run holds no element
   *  of a page), its drawing as data, every painted unit's operations in turn, kept when the page's canvases are let go; its
   *  words (the page's word table, built as each unit is painted in `wordsOpen` and frozen into `words` once the page is final:
   *  words.mjs) and links (links.mjs: frozen into `links` once the page is final, null before; `linksOpen` holds the moved
   *  records the units' matches make as they are made, each over the unit's drawing on this page: linkUnit), its fill numbers
   *  (adaptiveFill's pass), its text items kept compact (`items`, textlayer.mjs itemsOf: read as the page is drawn) and what each
   *  drawn thing adds to its text layer (`text`: the operations it appended and its segments, textRecord) */
  const makeRow = i => {
    const view = geometry.left.pages[i - 1] ?? [0, 0, 612, 792]
    const w = (view[2] - view[0]) * scale, h = (view[3] - view[1]) * scale
    const left = document.createElement('canvas'), right = copy ? document.createElement('canvas') : null
    // (no pixels until the page is drawn, drawPageOn sizes them: a page never drawn holds its row alone, not a canvas's default
    // 300 x 150, which a jump past a paper's pages kept on every page it did not draw)
    for (const c of [left, right]) if (c) { c.width = 0; c.height = 0; c.style.width = `${w}px`; c.style.height = `${h}px` }
    rows[i - 1] = { page: i, left, right, w, h, base: false, ops: [], off: new Set(), markup: [], words: null, wordsOpen: null, links: null, linksOpen: null, fill: null, items: null, text: null }
  }
  if (!partsMode) for (let i = 1; i <= N; i++) makeRow(i)
  const sheet = document.head.appendChild(document.createElement('style'))
  for (const rule of SVG_RULES) sheet.sheet.insertRule(rule, sheet.sheet.cssRules.length)

  // (each font's class and map, run-long, by its loaded name or its draw's content key)
  const FR = fontReaders()
  const chars2 = [], inks = [], views = [], pageBottom = []
  /** each page's characters by baseline (rowsOf), made as its characters are read and let go with them */
  const rowsByPage = []
  // ---- the pages read from their draws (DATA): each page's draw asked once (`drawAsks`, held until the page is drawn), the pages
  // read from data (`fromData`), each page's pixels read once (`pixelTasks`, `pixelsIn`), the pages whose paint waits for theirs
  const drawAsks = new Map(), askedDraw = new Uint8Array(N + 1), fromData = new Uint8Array(N + 1), pixelsIn = new Uint8Array(N + 1)
  const pixelTasks = new Map(), paintLater = new Set()
  /** the operator list a page's early pixel read drew it by ({ doc, list }), held until its drawing decides how it is read: a page
   *  whose draw is then refused or late reads its fills off it (liveFillsOf), not off a second parse; let go with its pixels */
  const heldLists = new Map()
  /** the pages read from data and live, the draws refused and those that came too late (DRAW_WAIT_MS), each page's pixels by the
   *  step that asked first, the times a step needed a page's pixels it had not (by step), the lays done again, and the draws'
   *  reading, ms */
  const drawStats = { data: [], live: [], refused: [], late: [], pixels: {}, need: {}, retries: 0, ms: 0 }
  const needed = why => { drawStats.need[why] = (drawStats.need[why] ?? 0) + 1 }

  // the geometry's units with v0's own copy of their line rectangles: v0 grows and moves a unit's lines as it lays it,
  // and every other unit reads them as grown (its others), so the copy is shared by all of v0's reading; the geometry
  // given stays as it was (a second run over it draws as the first: the text removal's plan run and its drawing)
  const GU = geometry.left.units.map(([id, stream, rects]) => [id, stream, rects.map(r => r.slice())])
  const placed = [], skipped = []
  const inGeometry = new Set(GU.map(u => u[0]))
  // the units as they have come (take), by id: none for one not yet arrived, or never to come; and the ids still
  // awaited (expect's, but those given at once)
  const U = new Map()
  // (the paper's structural names, units of kind `name` (bundleUnitsOf, the geometry's kinds): no page's ink, never laid nor
  // awaited; each translated one the target's word for its English (layer2.mjs nameOfRow), which a head and a generated
  // reference read where no package names it, given at the open or taken with the rows: §19.14)
  const ownNames = new Map()
  const takeName = u => { const w = L2.nameOfRow(u); if (w) ownNames.set(w[0], w[1]) }
  given.forEach((u, id) => { if (u?.kind === NAME_KIND) takeName(u); else U.set(id, u) })
  const awaited = new Set((expect ?? []).filter(id => geometry.kinds?.[id] !== NAME_KIND))
  const pending = new Set([...awaited].filter(id => U.get(id) === undefined))
  // each unit's table group as the paper's own bundle gives it (groups.mjs groupOf), where the host knows it: a group is
  // then read once its own cells' rows are in, not every row
  const membersOf = new Map()
  if (tableGroups) for (const [id, g] of tableGroups) (membersOf.get(g) ?? membersOf.set(g, []).get(g)).push(id)
  /** whether the layout file locates a unit whole (tex.mjs locatedWhole): its lu and kOf, else why not. A unit of a part with no
   *  layout (`layout: null`, or a refusal's record) is in no file, and so is not located */
  const judge = (id, u) => {
    const lu = tex.index.unit(id)
    const w = locatedWhole(lu, u, tex.pieces.get(id), { symbols: tex.symbols ?? 'text' })
    return w.ok ? { lu, kOf: w.kOf } : { why: w.why }
  }
  /** a unit the file locates whole, placed by its lines in the file (texRects: the rectangles its exact baselines are by); null
   *  where none of them is on the pages shown */
  const placeByFile = (id, stream, u, w) => {
    const lines = texRects(w.lu)
    const rects = lines.rects, onPages = rects.filter(r => r[0] <= N)
    if (!onPages.length) return null
    // (cut: the unit goes on past the pages shown. It is laid over all its lines, those past the pages shown too, and
    // drawn on the pages shown: laid over the lines shown alone, all of its translation was set into them, shrunk to the
    // floor and the rest clipped, though the reader shows its next page as any other (1810.04805's unit 164 on page 12 of
    // 12 shown, 200 characters clipped in each alphabet). Its pages are the pages shown: it is laid when they are drawn)
    return { id, stream, rects, unit: u, blocks: blocksOf(onPages, geometry.left.pages), pages: [...new Set(onPages.map(r => r[0]))], cut: onPages.length < rects.length, tex: { ...w, lines } }
  }
  const translated = u => !!u?.pieces && (u.state === 'whole' || u.state === 'partial')
  /** the file's own reason for a unit it does not lay (file.mjs UNLAID, its `unlaid`), or null: read from the file the index
   *  holds now (under parts, the parts told so far) */
  let unlaidFile = null, unlaidBy = null
  const makerWhy = id => {
    const f = tex.index.file
    if (f !== unlaidFile) { unlaidFile = f; unlaidBy = new Map(f.unlaid ?? []) }
    return unlaidBy.get(id) ?? null
  }
  /** a unit left the original's for want of the file's place (`code` of SKIP_CODES): `unlocated` with the maker's reason */
  const unanchoredOf = (id, u, code) => ({ id, kind: u.kind, why: 'unanchored', code: skipCode(code), ...(code === 'unlocated' ? { unlaid: makerWhy(id) } : {}), chars: trCharsOf(u) })
  // every unit the layer may place, in the order layGroups takes them (the text's stream): the geometry's, and the units the
  // file locates whole that the geometry does not hold, at their place in the stream after the unit before them, table cells
  // among them (a cell's lines are TeX's, and the text removal takes its glyphs alone, never its table's rules). The
  // geometry's rectangles are the left's: a unit's place on the original, and the page's text area and columns the fitting
  // reads; the unit is drawn by the file's lines. `cands` in the order the layer reports its sources in, K in the stream's
  const cands = GU.map(([id, stream, rects]) => ({ id, stream, rects }))
  const streamOf = new Map(GU.map(([id, stream]) => [id, stream]))
  for (const id of tex.index.file.units.map(r => r[0])) {
    if (inGeometry.has(id)) continue
    let before = -1
    for (const [gid, s] of streamOf) if (gid < id && s > before) before = s
    cands.push({ id, stream: before + 0.5, rects: null })
  }
  const K = [], candOf = new Map()
  /** each unit whose last row another unit's first row continues on a shared line (K's `follows`), that unit's id */
  const followers = new Map()
  // the pages each of a unit's sources would draw it on (which source is its row's to decide) and every page their
  // lines are on: what laying a page waits for (needsOf)
  const shownOf = rects => [...new Set(rects.filter(r => r[0] <= N).map(r => r[0]))]
  /** units of the stream added to K after its last (their order the stream's): each with the pages its sources draw it on,
   *  and its rectangles, where the left holds it, counted in its pages' text area, columns and every unit's rectangles */
  const addUnits = entries => {
    for (const c of entries) {
      const lu = tex.index.unit(c.id)
      const from = [c.rects, lu ? texRects(lu).rects : null].filter(Boolean)
      c.lists = from.map(shownOf).filter(l => l.length)
      c.reach = new Set(from.flatMap(rs => rs.map(r => r[0])))
      // (and what Need reads of it besides (need.mjs NeedEntry): its placeholders' pages, its table group; its place in K, and
      // whether it is decided yet)
      c.reads = segPagesOf(c)
      c.group = tableGroups?.get(c.id) ?? null
      // (and the unit before it in K whose last row its first row continues on one of TeX's lines, a shared line (need.mjs
      // rowLeadOf, chosen among the entries before it in K, `candOf` so far: what every part told by now holds, the same however
      // the door's parts come): its lay reads that unit's (layout2's start), which Need lays with it, `follows`; that unit's lay
      // reads that it has one, `followers`. Only where a page is laid by its closure alone (ORDER_FREE): there the unit before it
      // is laid first and no pass lays it anew or moves it after (the page fill keeps its share, fillPage). Rules that lay in
      // order (the even pass and the leftover's packing, which lay a unit anew or move it once the unit after it has been laid
      // from it, or no pass, whose closures may leave the unit before it to a later one) share no line: the next unit's first
      // line stays where TeX set it, the same however the paper is opened)
      c.lead = ORDER_FREE ? rowLeadOf(tex.index, c.id, aid => candOf.has(aid)) : null
      c.follows = c.lead ? c.lead.id : null
      if (c.follows !== null) followers.set(c.follows, c.id)
      c.k = K.length
      c.decided = false
      for (const q of new Set(c.lists.flat())) undecided[q]++
      holdReads(c)
      K.push(c)
      candOf.set(c.id, c)
      if (!c.rects) continue
      // the lowest unit line of each page: no unit borrows below it (the page's text area)
      for (const r of c.rects) pageBottom[r[0]] = Math.min(pageBottom[r[0]] ?? Infinity, r[2] + 0.24 * (r[4] - r[2]))
      if (geometry.kinds[c.id] === 'para') for (const r of c.rects) (cols[r[0]] ??= []).push([r[1], r[3]])
      addRects(c.id, c.rects)
    }
  }

  // ---- what the run holds (`free`, the 1b design §3). A page's analysis state is read by the units laid on it, by its pass
  // and its paints, and by a unit still to be laid whose lines or placeholders' segments are on it (a crop's ink and
  // characters): so it is let go once the page is ready (every unit on it painted there), no unit still to be laid reads it
  // (its count, `reads`) and no unit on it is still to be painted on another of its pages (awaitsPaint). A page drawn for
  // another page's closure and not ready itself (a side page) keeps it until its own closure is laid: no page is drawn
  // twice (PDF.js's later drawing of a page may differ from its first). A unit's own state is read by its growth (growOn, on
  // each of its pages before it is laid), its paint and the passes of the pages it is on (a unit running on to a page is read
  // there by its pass): so it goes once it is painted on all its pages, or is left the original's, and each of its pages has
  // passed
  /** each page's readers still to be laid: the units of K placed or still to be decided whose lay reads it (counted always:
   *  only `free` lets a page's state go) */
  const reads = new Int32Array(N + 1)
  /** each page's entries of K still to be decided (those whose sources may draw a unit on it) */
  const undecided = new Int32Array(N + 1)
  /** the pages whose state moved since the closure in hand last looked (drawn, an entry on it decided, a unit on it laid, its
   *  pass run, a part of it painted): each told once it is ready (onStep) */
  const touched = new Set()
  /** the pages drawn and not let go yet (each of them is looked at by a sweep, every other page never again) */
  const unswept = new Set()
  /** what the run lets go kept for the gate's measures (`records` with `free`): each page's characters, each unit as laid */
  const shelf = free && records ? { chars: [], units: new Map() } : null
  /** the pages of a unit's placeholders' segments in the layout file, of those shown (a crop cut from a page it may have no
   *  line on): what its lay reads besides its lines' pages (Need's `reads`) */
  const segPagesOf = c => {
    const out = new Set()
    for (const row of tex.index.unit(c.id)?.ph?.values() ?? []) for (let o = 0; o + 5 < row.segs.length; o += 6) if (row.segs[o] >= 1 && row.segs[o] <= N) out.add(row.segs[o])
    return [...out]
  }
  /** the pages a unit's lay reads, of those shown (its sources' lines' and its placeholders' segments'), held for it until its
   *  lay is over */
  const holdReads = c => { c.holds = [...new Set([...[...c.reach].filter(q => q >= 1 && q <= N), ...c.reads])]; for (const q of c.holds) reads[q]++ }
  /** a unit's lay is over (laid, or decided not placed): the pages it read held for it no longer */
  const dropReads = c => { if (!c?.holds) return; for (const q of c.holds) reads[q]--; c.holds = null }
  /** a page's word table frozen into its record once the page is final (every unit on it painted there): the columns cut to
   *  the tokens, the open table dropped. The units left the original's are every unit with lines on the page (any of its
   *  sources' pages) that has no span on it: skipped, unfit, withheld with its table group, refused, or untranslated (a row lost,
   *  none, kept or never come), all shown as the original's. A page that has none painted keeps an empty table */
  const freezeWordsOf = q => {
    const r = rows[q - 1]
    if (!r || r.words) return
    const painted = new Set((r.wordsOpen?.spans ?? []).map(s => s[0]))
    const original = []
    for (const c of K) if (!painted.has(c.id) && c.lists.some(l => l.includes(q))) original.push(c.id)
    r.words = freezeWords(r.wordsOpen, original)
    r.wordsOpen = null
  }
  /** the annotations of each page (links.mjs annotsOf; null where the read failed), read once as the page is drawn and held
   *  until the page is final; the ones a unit's match took, by page; the counts (LayerStats.links) and, with `records`, each
   *  record's source annotations (the gate's attribution) */
  const annots = [], consumed = [], linkSrc = []
  const linkStats = { total: 0, inPlace: 0, moved: 0, dropped: { unmatched: 0, ambiguous: 0, unplaced: 0 }, unsupported: 0, unread: 0 }
  /** a page's links frozen into its record once the page is final (every unit on it painted there, so the operations are final
   *  and every match has run): an annotation no unit took whose glyph points the operations left unerased stays in place, any
   *  other is dropped and counted. Pure of the order the pages were asked in: it reads this page's annotations, operations and
   *  units alone. A page whose annotations could not be read has none */
  /** the units with lines on page q as a link's owner is chosen among them, in the order it is read in (links.mjs ownersOf: the
   *  first whose rectangles hold more than half of its points): the units placed with lines on q in their growth rank there, by the rectangles their
   *  growth left, then every other unit of the original's side (K: left the original's or never placed, by the left side's) */
  const linkUnitsOn = q => {
    const out = new Map()
    for (const u of rankedOnPage(q)) out.set(u.id, { id: u.id, stream: u.stream, rects: u.rects, grown: u.grownRects })
    for (const c of K) if (!out.has(c.id) && c.rects?.some(r => r[0] === q)) out.set(c.id, { id: c.id, stream: c.stream, rects: c.rects })
    return [...out.values()]
  }
  /** the units placed with lines on page q, in their growth rank there (the order a link's owner is read in, links.mjs ownersOf) */
  const rankedOnPage = q => (onPage.get(q) ?? []).slice().sort((a, b) => (rankOf.get(a.id) ?? Infinity) - (rankOf.get(b.id) ?? Infinity))
  const freezeLinksOf = q => {
    const r = rows[q - 1]
    if (!r || r.links) return
    const t0 = performance.now()
    const done = LK.freezeLinks({
      list: annots[q - 1] ?? null, q, ops: r.ops, devOf: pxOf(q), consumed: consumed[q], why: whyOf[q],
      units: linkUnitsOn(q), moved: r.linksOpen ?? [], sources: records,
    })
    r.links = done.records
    r.linksOpen = null
    if (records) linkSrc[q - 1] = done.sources
    linkStats.inPlace += done.inPlace
    linkStats.moved += done.moved
    for (const k of ['unmatched', 'ambiguous', 'unplaced']) linkStats.dropped[k] += done.dropped[k]
    timesOf(q).links += performance.now() - t0
  }
  /** why each annotation its owner's match did not take was left (links.mjs matchUnit, placeUnit: `ambiguous`, `unplaced`), by
   *  page, which the freeze counts it dropped by where its ink is erased */
  const whyOf = []
  /** the modes of a rendering drawn as text in the page's face (tokensOf2), which a link is placed over by its characters */
  const TEXT_MODES = new Set(['orig-text', 'source', 'cite-map', 'symbol'])
  /**
   * Unit p's links, matched and placed once, at its first paint (the 3a design §3.3, §3.4: links.mjs matchUnit, placeUnit): its
   * layout is final on all its pages then, and what it was laid with alive (it lets go after its last paint). Its candidates are
   * the annotations of its pages it owns (links.mjs ownedIn: the first unit of the page's growth rank whose rectangles hold more
   * than half of the annotation's points; every unit before it there has grown, so that is final now), each annotation one
   * owner's; its targets every placeholder, nested mark and link pair of its translation, with the page characters its
   * rendering took, its segments in TeX's file, and how it is drawn. The records go to the pages their boxes are on (`linksOpen`), each annotation
   * placed to `consumed` and each one left to `whyOf`: a page is frozen only once every unit on it is painted there, so every
   * owner's match has run by then, whatever page was asked first. Reads the unit, its pages' annotations and the units ranked
   * before it there alone; changes no drawing
   */
  const linkUnit = p => {
    if (p.linked || !p.layout || !p.prep) return
    p.linked = true
    const t0 = performance.now()
    const cands = []
    // (the work units its matching spends, links.mjs's budgets, counted for the work counters: a page's share less what is left)
    let tests = 0
    for (const q of p.pages) {
      const list = annots[q - 1]
      if (!list) continue
      // (the units placed with lines on q, in their growth rank there; those before p have grown, as p has. Each unit of the page
      // a share of the page's work: a page is bounded by one budget, whatever order its units are matched in)
      const ranked = rankedOnPage(q)
      const at = ranked.indexOf(p)
      if (at < 0) continue
      // (an annotation whose owner the share left unread: `unplaced`, where no owner's match gives it another reason)
      const skipped = new Set()
      const share = { left: LK.WORK_MAX / ranked.length }
      for (const a of LK.ownedIn(list, p, ranked.slice(0, at), q, share, skipped)) cands.push({ q, a })
      tests += LK.WORK_MAX / ranked.length - share.left
      if (skipped.size) { const w = (whyOf[q] ??= new Map()); for (const i of skipped) if (!w.has(i)) w.set(i, 'unplaced') }
    }
    const budget = { left: LK.WORK_MAX / Math.max(1, rankedOnPage(p.pages[0]).length) }
    const budget0 = budget.left
    if (!cands.length) { workOf(p.pages[0]).linkTests += Math.round(tests); return }
    const L = p.layout
    const drawnText = new Set(), drawnCrop = new Set(), drawnPair = new Set()
    for (const line of L.lines) for (const it of line.items) {
      const t = it.t
      if (t.crop) { if (hasSource(t.crop.page)) drawnCrop.add(t.crop.k) }
      else if (typeof t.s === 'string' && !t.space) {
        if (t.k !== undefined && t.ph !== undefined) drawnText.add(t.k)
        if (t.st?.link !== undefined) drawnPair.add(t.st.link)
      }
    }
    const { lu, kOf } = p.tex
    const targets = []
    // (each piece's index in the unit's source, by which a tier pairs pieces with annotations: the layout file's k, else the row's;
    // never its place in the translation, which may set two of them the other way)
    const ordOf = k => (kOf && kOf[k] >= 0 ? kOf[k] : Number.isInteger(p.unit.pieces[k]?.k) && p.unit.pieces[k].k >= 0 ? p.unit.pieces[k].k : null)
    p.unit.pieces.forEach((piece, k) => {
      const kind = LK.linkKindOf(piece)
      if (piece.t === 'open') {
        if (kind && L2.LINK_OPEN.test(piece.src) && piece.id !== undefined) targets.push({ ord: ordOf(k), pair: piece.id, ...kind, single: true, gap: null, segs: null, draw: drawnPair.has(piece.id) ? 'pair' : null })
        return
      }
      if (piece.t !== 'ph' && piece.t !== 'nested') return
      const r = p.prep.get(k)
      const gap = r?.gap ? new Set(r.gap.chars.filter(c => !c.sep && !c.space).map(L2.charKey)) : null
      const row = lu && kOf && kOf[k] >= 0 ? lu.ph.get(kOf[k]) : null
      const segs = []
      for (let o = 0; row && o + 5 < row.segs.length; o += 6) segs.push([row.segs[o], row.segs[o + 1], row.segs[o + 2], row.segs[o + 3], row.segs[o + 4], row.segs[o + 5]])
      if (!gap && !segs.length && !kind) return
      const draw = r && TEXT_MODES.has(r.mode) && drawnText.has(k) ? 'text' : r?.mode === 'crop' && drawnCrop.has(k) ? 'crop' : null
      targets.push({ ord: ordOf(k), k, ...(kind ?? { kind: null }), single: LK.singleTarget(piece, kind), gap, segs: segs.length ? segs : null, draw })
    })
    const m = LK.matchUnit({ cands, targets, budget })
    const lines = L.lines.map(line => ({ line, runs: L2.lineRuns(line, L) }))
    const placed = LK.placeUnit({ groups: m.groups, lines, edge: (line, run, at) => L2.runEdge(run, at, line, L), band: (t, line) => tokenBand(t, line.seg ?? L, line.baseline), scale: L.scale, budget })
    // (each page's records in the unit's drawing order there, after those of the units before it)
    const byPage = new Map()
    for (const r of placed.records) if (rows[r.page - 1]) (byPage.get(r.page) ?? byPage.set(r.page, []).get(r.page)).push(r)
    for (const [pg, list] of byPage) {
      list.sort((a, b) => a.li - b.li || a.x - b.x)
      const row = rows[pg - 1]
      list.forEach((r, seq) => {
        ;(row.linksOpen ??= []).push({ rec: r.rec, stream: p.stream, id: p.id, seq, sources: r.sources })
        for (const [q, i] of r.sources.annots) (consumed[q] ??= new Set()).add(i)
      })
    }
    for (const t of [...m.tried, ...placed.tried]) (whyOf[t.q] ??= new Map()).set(t.i, t.why)
    workOf(p.pages[0]).linkTests += Math.round(tests + budget0 - budget.left)
    timesOf(p.pages[0]).links += performance.now() - t0
  }
  /** a page's analysis state let go (its canvases, a copy's, are the gate's: release) */
  const letGoPage = q => {
    freezeWordsOf(q)
    freezeLinksOf(q)
    annots[q - 1] = consumed[q] = whyOf[q] = undefined
    unswept.delete(q)
    chars2[q - 1] = rowsByPage[q] = undefined
    inks[q] = laid[q] = undefined
    // (a reading of its pixels still under way is no longer the page's: its result is dropped as it comes, pixelsOf)
    pixelTasks.delete(q)
    heldLists.delete(q)
  }
  /** whether a unit on page q is still to be painted on one of its pages (its first page's part there not painted yet,
   *  paintOn): its paint elsewhere may cut a crop from q, on v0's own copy (release), and its own state stays until then */
  const awaitsPaint = q => PASSES && (laid[q] ?? []).some(u => !u.refused && u.pages.some(r => !partPainted(u, r)))
  /** every ready page no unit still to be laid reads, and none on it still to be painted elsewhere, let go: after each
   *  closure laid, and once the rows end. Only the pages drawn and not let go are looked at (a page let go is never again): a
   *  few a closure, those in hand and those held for a unit still to come, not every page drawn at every step */
  const sweep = () => {
    if (!free) return
    for (const q of unswept) if (!reads[q] && readyOf(q) && !awaitsPaint(q)) letGoPage(q)
  }
  /** what a unit holds for its lay, its passes and its paint alone (and the file's lines it is laid by: `tex.lines`) */
  const HEAVY = ['prep', 'tokens', 'layout', 'blocks', 'local', 'lead', 'P', 'clear', 'wordOf', 'pieceAt', 'runs', 'whole']
  /** a unit nothing reads again: painted on every page it is on, or left the original's (refused, or withheld with its
   *  group), its table group settled, and each of its pages passed (with a page pass: a pass reads the units running on to
   *  its page) */
  const settledUnit = u => {
    const g = u.unit.group && groupCells.has(u.unit.group) ? u.unit.group : null
    return (u.refused || u.withheld || u.painted === u.pages.length) && (!g || !!groupLaid.get(g)?.done) && (!PASSES || u.pages.every(q => passed[q]))
  }
  /** a unit's own state let go: what stays is its place (id, stream, rects, pages), its row and its fill numbers */
  const letGoUnit = p => {
    if (!free || p.letGo) return
    // (not before its growth has run on every page of its lines that can grow: a unit ranked after it there grows it, whatever
    // it is (L1), and reads what it holds; a page that failed grows nothing. So the run that lets go grows as the one that keeps)
    if (p.linePages && !p.linePages.every(g => p.grew.has(g) || failedPages.has(g))) return
    p.letGo = true
    if (shelf) shelf.units.set(p.id, { ...p, tex: { ...p.tex } })
    for (const k of HEAVY) p[k] = undefined
    p.tex.lines = undefined
    leadsOf.delete(p.id)
  }

  /** whether a translated row holds what v0 reads of a unit, of the types it reads them as: its kind and source, and
   *  pieces, each a text with its string or a placeholder, an open, a close or a nested footnote with its source's */
  const shapely = u => typeof u.kind === 'string' && typeof u.src === 'string' && Array.isArray(u.pieces) && u.pieces.every(q => q !== null && typeof q === 'object' && (q.t === 'text' ? typeof q.s === 'string' : q.t === 'ph' || q.t === 'open' ? typeof q.src === 'string' : (q.t === 'close' || q.t === 'nested') && (q.src === undefined || typeof q.src === 'string')))
  /** why a translated row is no unit of this paper's, though it parses (the web's rows: parseAnswersDelta), or null: not a
   *  unit's shape; its kind not the one the layout file or the geometry gives its id; its table group not the one the
   *  open was given (`groups`); a piece's k not one of its source's pieces (the layout file's count). Its unit is left
   *  the original's, the rest of the paper drawn as ever; a cell's group is the original's with it (a translated cell
   *  that cannot be drawn: readGroup) */
  const refusalOf = (id, u) => {
    if (!shapely(u)) return "row: not a unit's shape"
    const lu = tex.index.unit(id), kind = geometry.kinds?.[id]
    if ((lu && u.kind !== lu.kind) || (kind !== undefined && u.kind !== kind)) return 'row: another kind'
    if (tableGroups && (u.group ?? null) !== (tableGroups.get(id) ?? null)) return 'row: another group'
    if (lu && u.pieces.some(q => q.t !== 'text' && q.k !== undefined && !(Number.isInteger(q.k) && q.k >= 0 && q.k < lu.pieces))) return "row: a k not its source's"
    return null
  }
  const refusedOf = (id, u, why) => ({ id, kind: u.kind, why, code: 'refused', chars: shapely(u) ? trCharsOf(u) : 0 })
  /**
   * What the layer makes of a unit once its row is in, before its table's group is read: placed (with the pages it is drawn
   * on), or not, and why it is left the original's (`skip`); the file's why it does not locate the unit whole (`missed`).
   * The layer draws a unit only from the file: one the file does not locate whole (not held, or a visible piece with no
   * position) is the original's, wherever the left holds it
   */
  const decide = (c, u) => {
    if (!translated(u)) return { p: null }
    const no = refusalOf(c.id, u)
    if (no) return { p: null, skip: refusedOf(c.id, u, no) }
    // (a unit whose class the reader's toggles hide: its row made, its ink the page's — rules/content-classes.mjs; the door
    // takes no row of one, so one comes here only where a host gives the open its units or rows itself)
    if (!classShown(u)) return { p: null, skip: c.rects ? { id: c.id, kind: u.kind, why: 'hidden', code: 'hidden', chars: trCharsOf(u), pages: [...new Set(c.rects.map(r => r[0]))] } : unanchoredOf(c.id, u, 'hidden') }
    // (a unit the left holds wholly past the pages shown is none of the run's)
    if (c.rects?.every(r => r[0] > N)) return { p: null }
    const w = judge(c.id, u)
    if (!w.lu) return { p: null, skip: unanchoredOf(c.id, u, JUDGED[w.why]), missed: `unanchored, ${w.why}` }
    // (a unit whose ink the file cannot hide is the original's, design §6)
    const no2 = unhiddenOf(c.id)
    if (no2) return { p: null, skip: { id: c.id, kind: u.kind, why: `unhidden: ${no2}`, code: 'unhidden', chars: trCharsOf(u), pages: [...new Set(texRects(w.lu).rects.map(r => r[0]))] } }
    const p = placeByFile(c.id, c.stream, u, w)
    return { p, skip: p ? null : unanchoredOf(c.id, u, 'offPages') }
  }
  // (each decision kept with the row it was made of: a row taken again before it is fixed is decided again)
  const decisions = new Map()
  const decisionOf = c => {
    const u = U.get(c.id)
    let e = decisions.get(c.id)
    if (!e || e.row !== u) decisions.set(c.id, (e = { row: u, d: decide(c, u) }))
    return e.d
  }
  // a table's consistency group drawn whole or not at all (the table-groups brief, 2026-10-07): the record translates
  // or keeps each group whole (its cells' `group`, cache.mjs unitsOf), and a translated cell that cannot be drawn here —
  // no lines for it, none on the pages shown, a row refused (refusalOf) — keeps every cell of its group the original's.
  // But a cell whose ink the file cannot hide (`unhidden`) is the original's alone, the rest of its group drawn (the
  // coordinator's ruling of 2026-10-24: a table with one English cell beats an English table), unless it spans columns.
  // A group's cells may be anywhere in the paper: it is read once its own cells' rows are in where the open is given each
  // unit's group (`groups`), else once every row is (or end()), every row fixed then; the rows it reads are fixed from
  // then on. Given each unit's group, a group's cells are the units given it whose rows are translated, whatever group
  // a row names, and one given it and expected whose row never came (end()) keeps the group the original's as well: it
  // was to be translated with the rest (ruling P28); one not expected (kept as a name: rows.mjs toTranslate) never has a
  // row, and is the original's in a group drawn
  const groupCells = new Map(), split = new Set(), read = new Set()
  let frozenAll = false
  /** group g read from the rows of `ids` (its own cells: the units the open gave it, else the rows naming it) */
  const readGroup = (g, ids) => {
    read.add(g)
    for (const id of ids) fixed.add(id)
    // (a cell whose ink the file cannot hide is the original's alone, the rest of its group drawn: coverage first, the
    // coordinator's ruling of 2026-10-24 — but one spanning columns or rows (\\multicolumn, \\multirow), whose box is the
    // others' too, keeps the group whole; and so does one that fails the spell check, whose range may hold a sibling's ink)
    const kept = id => { const d = candOf.has(id) ? decisionOf(candOf.get(id)) : null; return !!d && !d.p && d.skip?.code === 'unhidden' && d.skip.why !== 'unhidden: spell' && !unitSpans(U.get(id)) }
    const cells = ids.filter(id => translated(U.get(id)) && !kept(id))
    if (!cells.length) return
    groupCells.set(g, cells)
    if ((tableGroups && ids.some(id => awaited.has(id) && U.get(id) === undefined)) || cells.some(id => !(candOf.has(id) && decisionOf(candOf.get(id)).p))) split.add(g)
  }
  /** every group not read yet read, by the open's groups; under parts until they end, only a group a part has told a member
   *  of (a part tells a group's units whole: the cut's closure, chain check 7), the rest as the parts tell them */
  const readGroups = () => { for (const [g, ids] of membersOf) if (!read.has(g) && (partsEnded || ids.some(id => candOf.has(id)))) readGroup(g, ids) }
  const freezeAll = () => {
    if (frozenAll) return
    frozenAll = true
    if (tableGroups) { readGroups(); return }
    const unread = new Map()
    U.forEach((u, id) => { if (u?.group && translated(u) && !read.has(u.group)) (unread.get(u.group) ?? unread.set(u.group, []).get(u.group)).push(id) })
    for (const [g, ids] of unread) readGroup(g, ids)
  }
  const expected = Array.from({ length: N + 1 }, () => 0)
  // (the units laid and drawn: their records with `records`, their count always)
  const stats = []
  let drawnUnits = 0
  // (a record that could not be made, by unit: the gate reports them, a record never stands in for one)
  const recordErrors = []
  // (the drawing's audit, the gate's: none kept without `records`)
  const audit = records ? [] : null
  let designs = { serif: 'times', sans: 'helvetica', mono: 'courier' }

  const pxOf = i => {
    const vw = views[i - 1]
    return (x, y) => { const [vx, vy] = vw.convertToViewportPoint(x, y); return [vx * dpr, vy * dpr] }
  }
  const cssOf = i => {
    const vw = views[i - 1]
    return (x, y) => vw.convertToViewportPoint(x, y)
  }
  // each page's ink map, read once as the page is drawn (drawPage) and kept for the run: it is all the engine takes from the
  // original's pixels, so that with no copy the canvas is let go right after (a lazy read would need it for as long). A page read
  // from its draw has none until its pixels are read (pixelsOf): an ink read of it throws NeedPixels (`why`, the step), never the
  // undefined of a page with no ink
  const inkOf = (pg, why = 'ink') => {
    if (fromData[pg] && !pixelsIn[pg]) throw new NeedPixels(pg, why)
    return inks[pg]
  }
  /** what the run hid and showed again: units drawn, the boxes pasted from render B and from render C (`pastedKeep`) */
  const hidStats = { units: 0, fromB: 0, pastedKeep: 0, crops: 0 }
  /** whether a crop may be cut from page j (S1): a page of the paper whose drawing was read and did not fail, a fact of the
   *  page itself, never whether the host has let it go (its row's `base`): a view cuts it from the page as PDF.js draws it
   *  then (drawCopy), and v0's own copy keeps the page's canvases while a unit on it is still to be painted (release) */
  const hasSource = j => j >= 1 && j <= N && !failedPages.has(j) && views[j - 1] !== undefined
  /** a drawn thing's part of its page's text layer (textlayer.mjs): the range of the page's operations it appended (whose erasures
   *  are its own) and its drawn lines as segments, kept with the page's record. A page's are final once it is (textOf) */
  const textRecord = (r, from, key, unit, segs) => {
    const T = (r.text ??= { owners: [], drawn: [] })
    if (r.ops.length > from) T.owners.push([from, r.ops.length, key])
    T.drawn.push(unit === undefined ? { key, segs } : { key, unit, segs })
  }
  const paint = (p, pg) => withWork(pg, () => paintUnit(p, pg))
  const paintUnit = (p, pg) => {
    // (its links matched and placed at its first paint, its layout final on every page: links.mjs; the drawing reads none of it)
    if (!p.linked) linkUnit(p)
    const tOps = performance.now()
    const r = rows[pg - 1]
    // its groups hidden on the page (hide.mjs): its text, its placeholders where one is moved, its label where it is drawn anew,
    // the name it leads; what its reading keeps shown again from B or C; its crops cut from B through their segments
    const nm = p.lead?.nm.page === pg ? p.lead.nm : null
    const h = unitHiding({ page: pg, id: p.id, lu: p.tex.lu, kOf: p.tex.kOf, lines: p.tex.lines, prep: p.prep, nm, has: VIS.has })
    for (const g of h.off) r.off.add(g)
    const ops = L2.hideOps(p.layout, pg, { px: pxOf(pg), k: scale * dpr, hasSource, pxOf, hidden: h.hidden, fromB: h.fromB, fromC: h.fromC, clips: h.clips, audit, id: p.id })
    hidStats.units++
    hidStats.fromB += h.fromB.length
    hidStats.pastedKeep += h.fromC.length
    const opsFrom = r.ops.length
    for (const o of ops) { r.ops.push(o); if (o.op === 'crop') hidStats.crops++ }
    const tCompose = performance.now()
    const tSvg = performance.now()
    r.markup.push(L2.svgOfUnit(p.layout, pg, cssOf(pg), scale, p.id))
    const tWords = performance.now()
    // (the page's word table, beside the markup: the unit's words in its text's order, its kept lines where the text passes them,
    // each token's place in its translation; a page whose table is frozen is final)
    if (!r.words) addUnitWords(r.wordsOpen ??= newWords(), p.layout, pg, p.id, (at, end) => (p.wordOf ??= wordIndexer(plainOfPieces(p.unit.pieces)))(at, end), L2.keptLines(p.rects, p.prep, pg, p.blocks), crop => hasSource(crop.page), p.pieceAt ??= pieceOffsets(p.unit.pieces))
    // (and its text layer's: the operations it appended, and its drawn lines as segments, read by textOf once the page is final)
    textRecord(r, opsFrom, `u${p.id}`, p.id, TL.segsOfUnit(p.layout, pg, crop => hasSource(crop.page)))
    workOf(pg).ops += ops.length
    const T = timesOf(pg)
    T.ops += tCompose - tOps
    T.compose += tSvg - tCompose
    T.svg += tWords - tSvg
    T.words += performance.now() - tWords
    // (painted on one more of its pages: on its last, and with its pages passed, it lets go of what it was laid with)
    p.painted = (p.painted ?? 0) + 1
    if (settledUnit(p)) letGoUnit(p)
  }

  // ---- babel's names (D1a): each generated heading the layout file locates on a page (layout/file.mjs `names`: Abstract,
  // References, Contents, …), set in the target's word for it wherever TeX identified the heading and the target has a
  // word (layer2.mjs nameInTarget), painted as its page is drawn and before the page's units, so that a unit's put-back
  // never returns a name's characters: its ink erased as a label's is (its characters accounted, what else its box covers
  // put back; over the text-removed page, its box filled with paper or the removed page swapped in where kept ink lies
  // under it, clear of every unit's rectangles), its word set at the original's size, weight and slant, its left edge kept
  // or, centred, its centre, shrunk into the room on its line (its TeX column's text edges, the file's, and its neighbours'
  // characters) to the script's last floor at most (P.floorMin), else left the original's (`unfit`). A name that leads a
  // unit (RUN_IN: IEEEtran's "Abstract—…") is that unit's lead: set as the start of its first line whatever its width, the
  // original's joint and glue after it and the translation after both (layout2), and left the original's with its unit.
  // `names`: each name of the pages laid, drawn or why not
  const names = []
  /** a run's style from its characters (layer2.mjs styleOfChars: the first not a formula's, its colour too); its design the paper's */
  const styleOfChars = cs => L2.styleOfChars(cs, designs.serif)
  /** each unit's lead, by the unit: the name RUN_IN before its first line, its record, its word, style and characters */
  const leadsOf = new Map()
  const paintNames = async pg => {
    if (!tex || !labels) return
    for (const nm of tex.index.names(pg)) {
      const rec = { occurrence: nm.occurrence, key: nm.key, page: pg, drawn: false, why: null, chars: [], box: { x0: nm.x0, x1: nm.x1, baseline: nm.baseline, top: nm.top, bottom: nm.bottom, size: nm.size } }
      names.push(rec)
      const mine = (chars2[pg - 1] ?? []).filter(c => /\S/.test(c.ch) && (c.x0 + c.x1) / 2 >= nm.x0 - 0.5 && (c.x0 + c.x1) / 2 <= nm.x1 + 0.5 && Math.abs(c.yb - nm.baseline) < 0.3 * nm.size)
      if (!mine.length) { rec.why = 'unread'; continue }
      // its size and its faked small capitals, read off its characters as a unit's are (layer2.mjs nameStyleOf): set in faked small
      // capitals, it is drawn in small capitals as such a unit is, its word in its own case (the layer drawing its small capitals,
      // a CJK target's at CJK_CAPS_SIZE of the size), never as a case change's capitals
      const own = L2.nameStyleOf(mine, nm)
      const text = L2.nameInTarget(own.small ? { ...nm, capitals: false } : nm, mine.map(c => c.ch).join(''), R.labels, to)
      if (text === null) { rec.why = !R.labels?.[nm.key] ? 'no word' : 'same'; continue }
      // its style: its characters' (a class's bold or italic heading, small capitals), its design the paper's
      const st = own.small ? { ...styleOfChars(mine), caps: true } : styleOfChars(mine)
      const at = own.small && P.cjk ? own.size * L2.CJK_CAPS_SIZE : own.size
      // (leading a unit: that unit's, once it is laid)
      if (nm.unit >= 0) {
        Object.assign(rec, { why: 'inline: its unit not drawn', text, unit: nm.unit })
        leadsOf.set(nm.unit, { nm, rec, text, st, chars: mine.map(c => ({ ...c, page: pg })) })
        continue
      }
      // (its runs by script, each in its face, as a unit's words are drawn: its CJK characters in the target's CJK face, the rest
      // in the Latin one, the served CJK faces holding no Latin letter or digit; its small capitals, where a face has none of its
      // own, drawn by the layer: layer2.mjs nameScriptRuns, nameRuns)
      const drawn = L2.nameScriptRuns(text, cls => faceOf(st, cls, to), to, P.cjkQuotes)
      if (FS) {
        const tFonts = performance.now()
        const no = await FS.check(drawn.runs.map(q => ({ face: q.face, text: q.s })))
        fontWait += performance.now() - tFonts
        if (disposed) return
        if (no) { rec.why = no.why; continue }
      }
      // its room on its line: its TeX column's text edges (the file's), or the next characters of the line either side
      // (a quarter of an em clear), never narrower than its own box
      const mineSet = new Set(mine)
      let left = nm.cx0, right = nm.cx1
      for (const c of chars2[pg - 1] ?? []) {
        if (mineSet.has(c) || !/\S/.test(c.ch) || Math.abs(c.yb - nm.baseline) >= 0.4 * nm.size) continue
        if (c.x1 <= nm.x0 + 0.1) left = Math.max(left, c.x1 + 0.25 * nm.size)
        else if (c.x0 >= nm.x1 - 0.1) right = Math.min(right, c.x0 - 0.25 * nm.size)
      }
      left = Math.min(left, nm.x0); right = Math.max(right, nm.x1)
      const w = L2.runsWidth(drawn) * at, mid = (nm.x0 + nm.x1) / 2
      const room = nm.centred ? 2 * Math.min(mid - left, right - mid) : right - nm.x0
      const k = w > room ? room / w : 1
      if (k < P.floorMin - 1e-9) { Object.assign(rec, { why: 'unfit', text, w: r1(w), room: r1(room) }); continue }
      const size = at * k, x = nm.centred ? mid - (w * k) / 2 : nm.x0
      // its ink hidden by its own group (`n<occ>`): a name whose group the document does not hold stays the original's
      if (!VIS.has(nameGroup(nm.occurrence))) { Object.assign(rec, { why: 'unhidden', text }); continue }
      const r = rows[pg - 1], px = pxOf(pg)
      r.off.add(nameGroup(nm.occurrence))
      const [ax, ay] = px(nm.x0, nm.top), [bx, by] = px(nm.x1, nm.bottom)
      const hid = [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)]
      const opsFrom = r.ops.length
      r.ops.push({ op: 'hidden', rects: [hid] })
      audit?.push({ what: 'erase', unit: -1, name: nm.occurrence, page: pg, box: [hid[0], hid[1], hid[0] + hid[2], hid[1] + hid[3]] })
      r.markup.push(L2.svgOfName({ occurrence: nm.occurrence, text, x, baseline: nm.baseline, size, face: drawn.face, runs: drawn.runs, color: st.color ?? null }, cssOf(pg), scale))
      const seg = TL.nameSeg(text, x, w * k, nm.baseline, size)
      textRecord(r, opsFrom, `n${nm.occurrence}`, undefined, [seg])
      // (its words in the page's word table under its occurrence's hover id, which no bundle id reaches (units.mjs
      // nameOccurrenceId): the hover lights it as a heading, and the left its original by its box, view/shapes.mjs createShapes)
      const nid = nameOccurrenceId(nm.occurrence)
      if (nid !== null && !r.words) addSegWords(r.wordsOpen ??= newWords(), nid, [seg])
      Object.assign(rec, { drawn: true, text, size: r1(size), x: r1(x), w: r1(w * k), chars: mine.map(c => ({ ...c, page: pg })) })
    }
  }

  // ---- the figures' text (the content class `figures`, docs/route/orphan-text.md stage 5): each figure unit its page's parts
  // carry (hiding.figures: BUNDLE 10's figure rows, figure-rows.mjs), drawn in its translation where the reader shows figures
  // translated (hiding.figuresShown), its ink hidden by its own group (`f<k>`), its words in its run's box by the fit rule
  // (figure-fit.mjs: on its baseline, turned as it was, its anchor kept, at its size or shrunk to the rules' last floor), in a face
  // of its font's family and weight, in its fill; else left the original's, why told (`no row`, `untranslated`, `same` as its
  // source, `unhidden` where the document holds no group of it, a face's refusal, `unfit`). A page whose figures are shown waits
  // for their rows as for its units' (figuresWait). `figures`: each figure unit of the pages laid, drawn or why not
  const figureRecs = []
  /** each page's figures: 1 while painted (an await of their faces under way), 2 once painted; a page is ready at 2 alone */
  const figuresDone = new Uint8Array(N + 1)
  const figuresOn = pg => (hiding?.figuresShown ? hiding.figures?.(pg) ?? [] : [])
  const figuresWait = pg => !ended && figuresOn(pg).some(f => pending.has(f.id))
  const paintFigures = async pg => {
    if (figuresDone[pg]) return
    figuresDone[pg] = 1
    for (const f of figuresOn(pg)) {
      const rec = { id: f.id, group: f.group, page: pg, drawn: false, why: null }
      figureRecs.push(rec)
      const u = U.get(f.id)
      if (!translated(u)) { rec.why = !u ? 'no row' : u.state === 'kept' ? 'kept' : 'untranslated'; continue }
      const text = u.pieces.map(p => (p.t === 'text' ? shownPiece(p) : ' ')).join('').replace(/\s+/g, ' ').trim()
      if (!text || sameAsSource(text, u.src ?? '')) { Object.assign(rec, { why: 'same', text }); continue }
      if (!VIS.has(f.group)) { Object.assign(rec, { why: 'unhidden', text }); continue }
      // its face: its font's family, weight and slant, the paper's design of that family
      const cf = classifyFont(f.font)
      const fam = cf.fam === 'math' ? 'serif' : cf.fam
      const st = { fam, bold: cf.bold, italic: cf.italic, caps: false, design: designs[fam] ?? designs.serif }
      const drawn = L2.nameRuns(text, faceOf(st, /[\u2e80-\u9fff\uac00-\ud7af\u3040-\u30ff\uf900-\ufaff]/.test(text) ? 'cjk' : 'latin', to), to)
      if (FS) {
        const tFonts = performance.now()
        const no = await FS.check([{ face: drawn.face, text: drawn.text }])
        fontWait += performance.now() - tFonts
        if (disposed) return
        if (no) { Object.assign(rec, { why: no.why, text }); continue }
      }
      const fit = fitFigure(f, L2.runsWidth(drawn), P.floorMin)
      if (!fit) { Object.assign(rec, { why: 'unfit', text }); continue }
      const r = rows[pg - 1], px = pxOf(pg)
      r.off.add(f.group)
      // (the original's box on the page, its band across it: where its ink was hidden, for the links' and the text layer's question)
      const nx = -f.uy, ny = f.ux, lo = f.descent * f.size, hi = f.ascent * f.size
      const corners = [[0, lo], [f.length, lo], [0, hi], [f.length, hi]].map(([s, t]) => px(f.x + f.ux * s + nx * t, f.y + f.uy * s + ny * t))
      const xs = corners.map(c => c[0]), ys = corners.map(c => c[1])
      const hid = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
      const opsFrom = r.ops.length
      r.ops.push({ op: 'hidden', rects: [hid] })
      audit?.push({ what: 'erase', unit: f.id, figure: f.group, page: pg, box: [hid[0], hid[1], hid[0] + hid[2], hid[1] + hid[3]] })
      const x = f.x + f.ux * fit.offset, y = f.y + f.uy * fit.offset, angle = (Math.atan2(f.uy, f.ux) * 180) / Math.PI
      r.markup.push(L2.svgOfFigure({ group: f.group, text: drawn.text, x, y, angle, size: fit.size, face: drawn.face, color: f.fill > 0 ? L2.hexOf(f.fill) : null }, cssOf(pg), scale))
      // (a level one's words in the page's text layer, as a name's, under its unit's id: the hover lights it and its original, which
      // the pass anchored on the left by its band, ink-pass.mjs figureAnchors; a turned one's are not selectable: figure-rows.mjs
      // levelRun)
      if (levelRun(f.ux, f.uy)) {
        const seg = TL.nameSeg(drawn.text, x, fit.width, y, fit.size)
        textRecord(r, opsFrom, f.group, f.id, [seg])
        if (!r.words) addSegWords(r.wordsOpen ??= newWords(), f.id, [seg])
      }
      Object.assign(rec, { drawn: true, text, size: r1(fit.size), x: r1(x), y: r1(y), w: r1(fit.width) })
    }
    figuresDone[pg] = 2
  }

  // the columns of each page, as its paragraphs' lines span them (each unit's lines as it is added, addUnits)
  const cols = []
  // a table cell's centring, which TeX's probe does not tell (a cell's marks carry none) and the page's column does not
  // either: a cell of several lines by its own (blocks2's rule, `undefined`: their middles agree and their widths do not, a
  // makecell's or a shortstack's); one of a single line by its table's column on its page, the file's lines of the cells of
  // its column: centred where their middles agree and their widths do not (a c column's), not where their middles do not
  // agree (an l or p column's, whose cells share their start: 2609.26457's unit 126), and where the column cannot tell (a
  // cell alone in it, a header's whose group names no column, widths alike) `null`: the layout file's flag, as for any
  // unit. Its column's cells: the open's table groups where it is given them (the door's, every group whole from the open),
  // else the units' own places or groups (a whole open's, every unit given)
  const columnKey = (id, u) => {
    const c = u?.cell
    if (c) return `${c.table}:c${c.col}${c.span > 1 ? `+${c.span}` : ''}`
    const g = u?.group ?? null
    return typeof g === 'string' && !g.endsWith(':h') ? g : null
  }
  const columnOfCell = p => {
    if (tableGroups) { const g = tableGroups.get(p.id); return typeof g === 'string' && !g.endsWith(':h') ? membersOf.get(g) ?? [] : [] }
    const key = columnKey(p.id, p.unit), ids = []
    if (key !== null) for (const [id, u] of U) if (columnKey(id, u) === key) ids.push(id)
    return ids
  }
  const cellCentred = p => {
    const r0 = p.rects[0]
    if (!r0) return null
    if (new Set(p.rects.filter(r => r[0] === r0[0]).map(r => Math.round(r[2]))).size > 1) return undefined
    const spans = []
    for (const id of columnOfCell(p)) {
      const L = tex.index.unit(id)?.lines
      for (let j = 0; L && j + 7 < L.length; j += 8) if (L[j] === r0[0]) spans.push([L[j + 1], L[j + 2]])
    }
    if (spans.length < 2) return null
    // (every middle within 2 of every other: a column whose cells share a start or an end has its middles half its widths'
    // spread apart, and a spread of widths more than 4 puts them more than 2 apart)
    const mids = spans.map(([a, z]) => (a + z) / 2).sort((a, b) => a - b), widths = spans.map(([a, z]) => z - a)
    if (mids.at(-1) - mids[0] > 2) return false
    return Math.max(...widths) - Math.min(...widths) > 4 ? true : null
  }
  // every unit's rectangles by page, for growing a unit's lines over what no other unit holds (with the file's lines of
  // the units the file holds that the geometry does not, as each is placed)
  const rectsByPage = new Map()
  const addRects = (id, rects) => {
    for (const r of rects) {
      if (!rectsByPage.has(r[0])) rectsByPage.set(r[0], [])
      rectsByPage.get(r[0]).push([id, r])
    }
  }
  const textArea = pg => { const rs = (rectsByPage.get(pg) ?? []).map(([, r]) => r); return [Math.min(...rs.map(r => r[1])), Math.max(...rs.map(r => r[3]))] }
  /** the text area of page pg as unit p reads it: as the page's growth step left it once p's own lines there grew (growOn),
   *  the units ranked before it on the page grown and those after it not yet, whenever p is laid */
  const areaOf = (p, pg) => p.area?.get(pg) ?? textArea(pg)
  const columnOf = (b, p, size) => {
    const mid = (b.x0 + b.x1) / 2
    // (its page's paragraph lines over its middle; on a page that has too few (a page of figures, whose captions' own ink was
    // their measure: 2610.16663's supplement), those of the nearest page before it that has them, as the layout maker takes a
    // page's column edges (make.mjs earlierEdges, rule 3): never a later page's, so that a page lays the same whichever pages
    // were laid before it)
    const over = q => (cols[q] ?? []).filter(([a, z]) => a <= mid && z >= mid)
    let own = over(b.page)
    for (let q = b.page - 1; own.length < 3 && q >= 1; q--) { const o = over(q); if (o.length >= 3) own = o }
    if (own.length < 3) return areaOf(p, b.page)
    // (its right edge the furthest of its lines reach, but a line TeX set overfull: one past the furthest end two lines share
    // by less than an em is no edge; a single line widened to it ran 3.4 pt into the margin, 2608.16117's page 11)
    const ends = own.map(c => c[1]).sort((x, y) => y - x)
    let right = ends[0]
    for (let i = 0; i + 1 < ends.length; i++) if (ends[i] - ends[i + 1] <= 0.2) { if (ends[0] - ends[i] < size) right = ends[i]; break }
    return [Math.min(...own.map(c => c[0])), right]
  }
  // a single line may run on to its column's edge or the next glyph on its baseline (a heading is as wide as its
  // column, not as its English words); a centred one as far to either side
  const widen = (b, p) => {
    if (b.rects.length !== 1) return
    const r = b.rects[0], yb = b.B[0], size = b.sizes[0]
    const [cx0, cx1] = columnOf(b, p, size)
    const line = (chars2[b.page - 1] ?? []).filter(c => Math.abs(c.yb - yb) < 0.4 * size && /\S/.test(c.ch))
    const right = Math.min(cx1, ...line.filter(c => c.x0 > r[3] + 6).map(c => c.x0 - 0.5 * size))
    const left = Math.max(cx0, ...line.filter(c => c.x1 < r[1] - 1).map(c => c.x1 + 0.5 * size))
    if (b.centred) {
      const mid = (r[1] + r[3]) / 2, half = Math.min(right - mid, mid - left)
      if (half > (r[3] - r[1]) / 2) { b.x0 = mid - half; b.x1 = mid + half }
    } else if (right > b.x1) b.x1 = right
  }
  /** whether something of the page stands on a shared row (need.mjs rowLeadOf: `row`, the last row of the unit before) between
   *  that unit's end there and `x`, where the next unit's text begins: a character of the page, which stays where it is (a
   *  label kept as the original's, a name), so that the next unit is not laid from that unit's end (layout2's `start`) */
  const keptBetween = (row, x) => (chars2[row.page - 1] ?? []).some(c => /\S/.test(c.ch) && (c.x0 + c.x1) / 2 > row.x1 + 0.1 && (c.x0 + c.x1) / 2 < x - 0.1 && Math.abs(c.yb - row.baseline) < 0.4 * row.size)
  /** a unit's shared row (`followers`: the next unit's first row continues its last) where something stays between the two
   *  (keptBetween), read before the next unit is laid: up to where the file begins that unit's first line, or ends its label
   *  on the row where the file holds one (the label stays the original's, and its text begins after it); else null */
  const keptAfter = p => {
    const fid = followers.get(p.id), row = fid === undefined ? null : candOf.get(fid)?.lead
    const fu = row ? tex.index.unit(fid) : null
    if (!fu?.lines.length) return null
    let x = fu.lines[1]
    const lb = fu.labels
    if (lb.length >= 7 && lb[1] === row.page && Math.abs(lb[3] - row.baseline) < 0.4 * row.size) x = Math.max(x, lb[4] + 0.2)
    return keptBetween(row, x) ? row : null
  }
  /** the unit's edges (P.halfLead; layer2.mjs footFloorAt): whether its first and last lines share their baseline with ink
   *  that stays where it is, a label kept as the original's or a character of the page beside the line's own in its column (a
   *  run-in heading, another unit that ends or begins on it, a mark set before it: `head`, `foot` false), which would stand
   *  off the line moved (the page fill moves no first line; a last line it may raise, footFloorAt); and the original's room
   *  from its last baseline down to the next line of its column (`below`: the median baseline of the highest characters
   *  under it, a superscript's aside; Infinity where none is), which the page fill keeps its last line a leading over. None
   *  for a table cell, whose lines keep their own rules (cellBands). Read from the page's characters, within the span of its
   *  frame's own lines (not columnOf's, which is an earlier page's paragraph lines or the page's text area where v0's geometry
   *  holds no paragraph there, and took the other column's line on the same baseline for one beside it: 1512.03385 page 12) */
  const edgesOf = (p, prep) => {
    if (p.unit.kind === 'cell' || !p.blocks.length) return null
    const spanOf = b => [Math.min(...b.rects.map(q => q[1])), Math.max(...b.rects.map(q => q[3]))]
    const rows = b => rowsByPage[b.page] ?? (chars2[b.page - 1] ? (rowsByPage[b.page] = rowsOf(chars2[b.page - 1])) : NO_ROWS)
    const alone = (b, r, yb, size) => {
      const [cx0, cx1] = spanOf(b), R = rows(b), t = 0.4 * size
      // (the characters within the band of its baseline alone, by halving the page's baselines: never the whole page)
      for (let i = firstAtOrOver(R.yb, yb - t - 1e-6); i < R.cs.length && R.yb[i] <= yb + t + 1e-6; i++) {
        work.edges++
        const c = R.cs[i]
        if (Math.abs(c.yb - yb) < 0.4 * size && c.x1 > cx0 && c.x0 < cx1 && (c.x1 < r[1] - 0.5 || c.x0 > r[3] + 0.5)) return false
      }
      return true
    }
    // (the next line under its last: its column's characters under it by more than three quarters of its pitch, the line's own
    // scripts and stacked formulas aside; of the highest of them, those within half an em, their median baseline: from the
    // page's baselines downward, the first of its column the highest, then down half the page's largest em)
    const below = b => {
      const [cx0, cx1] = spanOf(b), yb = b.B.at(-1), p0 = b.pitch0 ?? 1.2 * (b.sizes.at(-1) ?? 10), R = rows(b), T = yb - 0.75 * p0
      const under = c => c.yb < T && c.x1 > cx0 && c.x0 < cx1
      let i = firstAtOrOver(R.yb, T) - 1
      for (; i >= 0; i--) { work.edges++; if (under(R.cs[i])) break }
      if (i < 0) return Infinity
      const top = R.cs[i].yb, line = []
      for (let j = i; j >= 0 && R.yb[j] > top - 0.5 * R.size - 1e-6; j--) {
        work.edges++
        const c = R.cs[j]
        if (under(c) && c.yb > top - 0.5 * c.size) line.push(c.yb)
      }
      line.sort((x, y) => x - y)
      return yb - line[(line.length - 1) >> 1]
    }
    const b0 = p.blocks[0], bl = p.blocks.at(-1)
    return { head: !(prep.label && !prep.label.drawn) && alone(b0, b0.rects[0], b0.B[0], b0.sizes[0]), foot: alone(bl, bl.rects.at(-1), bl.B.at(-1), bl.sizes.at(-1)), below: below(bl) }
  }
  /** a CJK table cell's bands between the rules near its lines (layer2.mjs cellBands: the manifest's rules), or null; a
   *  script no taller than Latin is not held, nor a paragraph, whose lines stand by a rule only by chance */
  const clearanceOf = (p, s) => (P.cjk && p.unit.kind === 'cell' ? L2.cellBands(p.blocks, rulesOf, s, P) : null)
  // the free space below a block, down to the first ink in its column or the page's lowest unit line
  const freeFor = (b, s) => {
    const map = inkOf(b.page, 'freeFor')
    if (!map || pageBottom[b.page] === undefined) return 0
    const last = b.B.at(-1)
    const yStart = last - 0.3 * s, yLimit = pageBottom[b.page] - 0.3 * s
    if (yLimit >= yStart) return 0
    const dist = L2.freeBelow(map, pxOf(b.page), scale * dpr, b.x0 + 1, b.x1 - 1, yStart, yLimit)
    const pitch = b.pitch0 ?? 1.2 * s
    const lowest = dist >= yStart - yLimit - 0.01 ? pageBottom[b.page] : yStart - dist + P.borrowGap * pitch + 0.3 * s
    return Math.max(0, last - lowest)
  }

  // ---- no clipping (step 3): v0's fit drew what fitted at its last state and dropped the rest (2,314 characters on the
  // gate's 29 outputs). A unit that does not fit there is given more room where the page has it, and else stays the
  // original's, whole: nothing of it is drawn in part.
  /**
   * How far a single line's slot may run on to one side (`dir` -1 or 1) of `from`, on its band of the original page (its
   * core, the x-height, for ink), over paper only: up to the first ink that is not the unit's own (`own`, its lines' erase extents: erased with it), read on
   * the page's ink map, never past `limit`. Before another line's text (a neighbouring cell, whose translation may run on
   * towards it too) to half the paper between them; before any other ink (a rule, a figure) to a quarter of an em clear of
   * it. Returns the edge.
   */
  const paperTo = (b, dir, from, limit, own) => {
    const map = inkOf(b.page, 'paperTo')
    if (!map) return from
    const px = pxOf(b.page), f = map.factor, z = b.sizes[0], B = b.B[0]
    const top = B + 0.8 * z, bottom = B - 0.25 * z
    // (the ink looked for is on the line's core, its x-height: a table's rule above or below the line, which the map
    // holds (inkMapOf, averaged), runs along it and stands beside nothing; a column rule or a neighbour's text crosses it)
    const [, r0] = px(from, B + 0.55 * z), [, r1] = px(from, B + 0.1 * z)
    const ra = Math.max(0, Math.floor(Math.min(r0, r1) / f)), rb = Math.min(map.h - 1, Math.floor(Math.max(r0, r1) / f))
    const step = f / (scale * dpr)
    // (its own ink, a map cell around: the map holds a cell any of whose pixels is inked, so a glyph's ink reaches up to a
    // cell past its outline's box, which the file's rectangles are)
    const ownAt = x => own.some(e => x >= e[0] - 0.3 - step && x <= e[2] + 0.3 + step && e[1] < top && e[3] > bottom)
    let x = from
    for (; dir > 0 ? x < limit : x > limit; x += dir * step) {
      const [cx] = px(x + dir * step / 2, B)
      const c = Math.floor(cx / f)
      if (c < 0 || c >= map.w) break
      if (ownAt(x + dir * step / 2)) continue
      let inked = false
      for (let r = ra; r <= rb && !inked; r++) if (map.ink[r * map.w + c]) inked = true
      if (!inked) continue
      // the ink a character of the page stands on is text, any other ink a rule's or a figure's
      const text = (chars2[b.page - 1] ?? []).some(ch => /\S/.test(ch.ch) && ch.x1 >= x - step && ch.x0 <= x + 2 * step && ch.yb - 0.25 * ch.size < top && ch.yb + 0.8 * ch.size > bottom)
      return text ? from + (x - from) / 2 : x - dir * 0.25 * z
    }
    return dir > 0 ? Math.min(x, limit) : Math.max(x, limit)
  }
  /** what a unit's drawing takes away on page j, where its own ink may be run over: the layout file's rectangles of the ink its
   *  groups hide (its lines' erase rectangles, its inline placeholders' segments). A rule beside its text that an erase extent
   *  reaches (a table's column rule) is no unit's and stays, and a slot run over it is drawn over it */
  const ownInk = (p, j) => {
    const lu = p.tex.lu, out = []
    for (let l = 0; l < lu.erase.length; l++) { const e = lu.erase[l]; if (!e || lu.lines[8 * l] !== j) continue; for (let o = 0; o + 3 < e.length; o += 4) out.push([e[o], e[o + 1], e[o + 2], e[o + 3]]) }
    for (const row of lu.ph.values()) { if (row.kind === 'display') continue; for (let o = 0; o + 5 < row.segs.length; o += 6) if (row.segs[o] === j) out.push([row.segs[o + 1], row.segs[o + 5], row.segs[o + 3], row.segs[o + 4]]) }
    return out
  }
  /** a unit's single-line blocks widened over the paper beside them (paperTo), within the page's text area; a centred one
   *  as far to either side. Returns the widened blocks, or null where none grew */
  const widenOverPaper = p => {
    let grew = false
    const out = p.blocks.map(b => {
      if (b.rects.length !== 1 || b.page > N) return b
      const own = ownInk(p, b.page)
      const [ax, az] = areaOf(p, b.page)
      const right = paperTo(b, 1, b.x1, az, own), left = paperTo(b, -1, b.x0, ax, own)
      let x0 = b.x0, x1 = b.x1
      if (b.centred) { const half = Math.min(right - b.x1, b.x0 - left); if (half > 0.1) { x0 -= half; x1 += half } }
      else if (right > b.x1 + 0.1) x1 = right
      if (x1 - x0 <= b.x1 - b.x0 + 0.1) return b
      grew = true
      return { ...b, x0, x1, widened: true }
    })
    return grew ? out : null
  }
  /**
   * The fit's further steps for a unit its states leave clipped (P.further, in order): 'widen', its single lines widened
   * over the paper beside them (widenOverPaper), the fit run again in them; 'flow', the text run past a display where the
   * slots after it are too few (layoutUnit2's P.flowPast: out of the translation's order, but all of it shown, as v0's
   * own last pass already ran text on past a display); 'shrink', the size's steps on below the fit's floor, to
   * P.floorMin. Returns the first layout that sets every token, with the blocks it was laid in (widened: with their
   * bands between the rules, `clear`, and the parameters they hold it to, `P`), or null.
   */
  const fitFurther = (p, tokens, s) => {
    for (const step of P.further ?? []) {
      if (step === 'widen') {
        const wide = widenOverPaper(p)
        if (!wide) continue
        // (its bands again, over its widened lines: a rule over the part a line is widened onto holds it too)
        const clear = clearanceOf({ ...p, blocks: wide }, s)
        const { capScale: _, ...rest } = p.P
        const PW = clear && clear.cap < 1 ? { ...rest, capScale: clear.cap } : rest
        const l = L2.layoutUnit2(tokens, wide, s, PW)
        if (!l.clipped) return { layout: { ...l, knob: 'widen' }, blocks: wide, P: PW, clear }
      } else if (step === 'shrink' && P.floorMin < P.floor - 1e-9) {
        const l = L2.layoutUnit2(tokens, p.blocks, s, { ...p.P, floor: P.floorMin })
        if (!l.clipped) return { layout: { ...l, knob: 'below-floor' }, blocks: p.blocks }
      } else if (step === 'flow') {
        const l = L2.layoutUnit2(tokens, p.blocks, s, { ...p.P, flowPast: true })
        if (!l.clipped) return { layout: { ...l, knob: 'flow' }, blocks: p.blocks }
      }
    }
    return null
  }

  /**
   * The CJK runs' tracking a fit starts from (step 3): the em a syllable's advance loses to its face's size correction
   * (the role table's Source Han Serif K is drawn at 0.959 of the size, its Hangul a twenty-fifth shorter a syllable than
   * the faces the prototype was approved in), given back, so that a line of the translation is as long as at the
   * original's size; 0 where the face is drawn at its size (Chinese, Japanese, the prototype's own faces).
   */
  const cjkAdvance = () => {
    if (!P.cjk) return 0
    const c = faceOf({ fam: 'serif', bold: false, italic: false, caps: false, design: designs.serif }, 'cjk', to).size ?? 1
    return c < 1 ? Math.round((1 - c) * 1000) / 1000 : 0
  }
  /** a laid unit's lines as its record holds them: page, baseline, target baseline, exact, mode, overflow, x0, x1, block (a
   *  line's flow segment: no rhythm is read across two, the gate's pageDrift) */
  const recLinesOf = p => p.layout.lines.map(l => {
    const b = p.blocks[l.block]
    return [l.page, r1(l.baseline), l.target !== null ? r1(b.B[l.target]) : null, l.target !== null ? b.exact[l.target] : false, l.mode, r1(Math.max(0, l.used - l.cap - (l.items.at(-1)?.t.punct === 'close' ? 0.5 * p.layout.f : 0))), r1(l.x0), r1(l.x0 + l.used), l.block]
  })
  // (the time the font waits of the unit in hand took, so that its timings are its own work's: lap())
  let fontWait = 0
  const lap = () => performance.now() - fontWait
  /** a unit whose first line a name leads, left the original's after all: the name with it */
  const unlead = p => {
    if (!p.lead) return
    const { rec } = p.lead
    delete rec.size; delete rec.x
    Object.assign(rec, { drawn: false, why: `inline: ${p.why ?? 'its unit unfit'}`, chars: [] })
    p.lead = null
  }
  // ---- each page's growth step (S4, the 1b design §2.1): a unit's lines on a page dropped where another unit's rectangle
  // mostly covers them and grown over what stands beside them, a page at a time, the page's units in their lay rank there
  // (`rankOf`, layGroups' order), each reading that page alone (its characters, the other units' rectangles on it as the
  // units ranked before it left them) and writing its own lines there alone. A unit is laid once its growth on each of its
  // pages has run, after that of every unit ranked before it on the page; laid in order, those have grown already, so each
  // unit grows as it is laid, as before. So the rectangles a unit is laid over, and what the units after it read of them,
  // are its pages' own: never a function of which units of other pages were laid before it
  /** the placed units with lines on each page (any page of their lines, those past the pages shown too), as placed */
  const onPage = new Map()
  /** each page's units in their rank, sorted again where more are placed, and how many of them (a prefix of the rank) have
   *  grown there */
  const rankedOf = new Map(), grownTo = new Map()
  /** each placed unit's place in the lay order (plan) */
  let rankOf = new Map()
  /** a list kept in the units' rank (each item a unit or its record: its `id`), an item put at its place: the units of a page
   *  are laid in any order, and a page's pass, a group's paint and the records read them in their rank (L3). Two units laid
   *  keep their order as more are placed: where they share a page they are peers of a closure that ranks them there, and
   *  else their lay pages differ */
  const byRank = (list, x) => {
    const r = rankOf.get(x.id) ?? Infinity
    let lo = 0, hi = list.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if ((rankOf.get(list[mid].id) ?? Infinity) <= r) lo = mid + 1; else hi = mid }
    list.splice(lo, 0, x)
  }
  const rankedOn = g => {
    const list = onPage.get(g) ?? []
    let line = rankedOf.get(g)
    if (!line || line.length !== list.length) {
      rankedOf.set(g, (line = list.slice().sort((a, b) => (rankOf.get(a.id) ?? Infinity) - (rankOf.get(b.id) ?? Infinity))))
      // (a unit placed after the page's growth began ranks after every unit grown there: it is laid later, so those grown
      // stay a prefix)
      const at = line.findIndex(q => !q.grew.has(g))
      grownTo.set(g, at < 0 ? line.length : at)
    }
    return line
  }
  /** a unit placed: its pages' growth to come (its lines' pages, the units on each) */
  const toGrow = p => {
    p.linePages = [...new Set(p.rects.map(r => r[0]))]
    // (its first page as placed: where its first line is read, L4)
    p.firstPage = p.rects[0]?.[0]
    Object.assign(p, { local: [], grown: 0, area: new Map(), grew: new Set() })
    for (const g of p.linePages) (onPage.get(g) ?? onPage.set(g, []).get(g)).push(p)
  }
  /** unit p's lines on page g dropped and grown, reading that page alone; the page's text area as they leave it kept for p */
  const growOn = (p, g) => {
    const others = []
    others[g] = (rectsByPage.get(g) ?? []).filter(([id]) => id !== p.id).map(([, r]) => r)
    // (the file's lines are the unit's own, whole, and its first line starts at the unit's own mark: none of the
    // anchors' repairs of which lines are the unit's or where it starts; but a line's extent across is its words', as the
    // anchors' is (the maker's rows are the text layer's word tokens'), and is grown as v0 grows them, over a formula's
    // tail and a justified line's last glyphs: 1512.03385 page 10's "(mAP @" and "IoU =", whose "@" and "=" were put back
    // under the translation). What growth does and does not stop at: a line grows sideways character by character and stops
    // at one inside another unit's rectangle (`foreign`, extendRects and extendRects2's loops), but it is also taken to the
    // end of a text item that ends less than 8 pt past it, or to the end of the word it ends in, whatever stands there
    // (extendRects2 checks no `foreign` for that). Its pages stay as they were counted: a page it holds no lines on is
    // painted with nothing
    const rs = p.rects.filter(r => r[0] === g), shown = p.pages.includes(g)
    // iteration 3: the unit's own part of the page (its rectangles' box, 20 pt above and below, 60 pt to either side), one
    // pass over the page, for every search below (each scanned the whole page, rectangle by rectangle)
    let win = null
    if (shown) {
      win = [Math.min(...rs.map(r => r[1])) - 60, Math.max(...rs.map(r => r[3])) + 60, Math.min(...rs.map(r => r[2])) - 20, Math.max(...rs.map(r => r[4])) + 20]
      const [x0, x1, y0, y1] = win
      p.local[g - 1] = (chars2[g - 1] ?? []).filter(c => c.x1 >= x0 && c.x0 <= x1 && c.yb >= y0 && c.yb <= y1)
    }
    // (the words its source begins with before its first line over the page's whole width on its lines' bands, step 3:
    // they may stand further from it than the unit's own part of its page reaches, 60 pt, 1706.03762's "Work performed
    // while at Google" before "Research.")
    const bands = []
    if (shown) {
      const y0 = Math.min(...rs.map(r => r[2])) - 20, y1 = Math.max(...rs.map(r => r[4])) + 20
      bands[g - 1] = (chars2[g - 1] ?? []).filter(c => c.yb >= y0 && c.yb <= y1)
    }
    // (the unit's first line, which grows to the left over math alone and before which its source's first words are looked for:
    // the first of its lines on its first page as placed, read when that page grows; none on any other page, a first page
    // whose lines were all another's included (L4). Its lines as they stand would make a page's growth read whether the
    // unit's earlier page had grown yet, which a page laid by its closure need not have)
    const first = p.rects[0]?.[0] === p.firstPage ? p.rects[0] : null
    const grown = L2.extendRects2(rs, p.local, others, p.unit.src, wordsOf, norm, geometry.left.pages, bands, first)
    p.grown += grown
    // (and the unit's part of the page again where its lines grew past it: what they grew over is the unit's to read and
    // to account for, or its characters there were put back under the translation)
    if (grown && shown) {
      const [x0, x1, y0, y1] = win
      const gx0 = Math.min(x0, ...rs.map(r => r[1])), gx1 = Math.max(x1, ...rs.map(r => r[3]))
      if (gx0 < x0 || gx1 > x1) p.local[g - 1] = (chars2[g - 1] ?? []).filter(c => c.x1 >= gx0 && c.x0 <= gx1 && c.yb >= y0 && c.yb <= y1)
    }
    p.area.set(g, textArea(g))
    // (its rectangles on the page as its growth leaves them, which a link's owner is read by: its lay may move its first line's
    // edge to its label after a unit ranked after it here is matched, links.mjs ownersOf)
    ;(p.grownRects ??= new Map()).set(g, p.rects.filter(r => r[0] === g).map(r => r.slice()))
  }
  /** p's growth on each of its pages, after that of every unit ranked before it there, the rank taken a unit at a time from
   *  where the page's growth stands; one that throws for another unit than p is that unit's, thrown as it is laid. Every
   *  unit placed on the page grows, whatever its other pages are: one left the original's for a page of it that failed
   *  (refused 'page', never laid) or whose own growth threw on another page grows here too (the 1b-D design's L1). Laid in
   *  order, such a unit was left before p was laid and did not grow; laid out of order, its other page may not have been
   *  reached yet, so that what p grows over would depend on which pages were laid first: the page's growth reads that page
   *  alone. That moves a drawing only beside a failed page (none on the 30 outputs). A unit grown on the page already is
   *  never grown again: every unit with lines on a page is placed before the page's first growth (its units are rank peers
   *  of every closure that grows there), so the grown are a prefix of the rank (rankedOn), and growing one again would move
   *  its lines twice, or read what a unit let go of (`free`) */
  const growTo = p => {
    for (const g of p.linePages) {
      if (p.grew.has(g)) continue
      const line = rankedOn(g)
      let i = grownTo.get(g) ?? 0
      while (i < line.length) {
        const q = line[i++]
        if (q.grew.has(g)) continue
        q.grew.add(g)
        try { growOn(q, g) } catch (e) { if (q === p || isMemoryError(e)) { grownTo.set(g, i); throw e } q.stepError ??= e }
        // (one whose lay was over, its growth now run on every page of its lines, lets go)
        if (q !== p && settledUnit(q)) letGoUnit(q)
        if (q === p) break
      }
      grownTo.set(g, i)
    }
  }
  const layout2 = p => (DATA ? layData(p) : layOnce(p))
  /**
   * A unit laid where pages are read from their draws: its growth first (layOnce's own is then a no-op), the pixels of its pages
   * that are on their way awaited (the page asked reads its own at its ask: a unit on it reads them), then laid. A lay that reads
   * the ink of a page whose pixels are not read (NeedPixels: freeFor, paperTo, deep in the fit) is laid again once they are, from
   * its rectangles as its growth left them; whatever else a lay writes it writes before it reads, or alike each time (its lead's
   * record), so the second lay is the one a unit with every page's pixels would have had
   */
  const layData = async p => {
    growTo(p)
    const rects = p.rects.slice()
    for (const q of p.pages) {
      if (!pixelTasks.has(q) || pixelsIn[q]) continue
      await pixelTasks.get(q)
      if (disposed) return
    }
    for (;;) {
      try { return await layOnce(p) } catch (e) {
        if (!(e instanceof NeedPixels)) throw e
        needed(e.why)
        drawStats.retries++
        // (the work of the lay given up, charged to its page as its lay's is: arrive)
        const mark = workMarks.get(p)
        if (mark) { workMarks.delete(p); chargeWork(p.pages[0], mark) }
        p.rects = rects.slice()
        await pixelsOf(e.page, e.why)
        if (disposed) return
      }
    }
  }
  const layOnce = async p => {
    const t0 = lap()
    // the unit's lines dropped where they are another unit's, grown over words the anchors left out beside them, and its
    // first line's edge snapped back to its first word's start: its pages' growth steps (growOn)
    growTo(p)
    if (p.stepError) throw p.stepError
    // (none of its lines left: every one another unit's once theirs grew, though not as placed (growOn); the unit is the
    // original's, where the whole unit's rule kept them all)
    if (!p.rects.length) { p.refused = true; p.why = 'unfit'; unlead(p); return }
    const local = p.local
    // the unit read with the file's parts: its lines, label and placeholders (and each placeholder's fill and each colour
    // piece's run's: what they are drawn in)
    const parts = texParts(p.tex.lu, p.tex.kOf, { lines: p.tex.lines, extents: tex.extents ?? 'v0', shown: N, lineskip: LINESKIP })
    // (the citations and macros its renderings teach are the unit's own, learnt as it is read: a later placeholder of the
    // unit reads its earlier ones, never another unit's, S2. The paper's, learnt in lay order, made a unit's reading a
    // function of every unit laid before it; no unit of the 30 outputs is read otherwise without it, 2026-10-15)
    const prep = L2.prepareUnit(p.unit, p.rects, local, phMode === 'source' ? null : new Map(), null, parts)
    if (prep.unproven !== undefined) { p.refused = true; p.why = 'unproven'; unlead(p); return }
    // (the names cleveref and \autoref generate in its references, and a citation's note's, in the target's: layer2.mjs
    // renameRefs, PDF-READER §19.11)
    if (labels) L2.renameRefs(prep, to, R.labels, ownNames)
    // a float's label in the target's name where the final names it so (labelInTarget): its ink erased and accounted as
    // the unit's text, and set as the line's start, in its own style, before the translation
    const relabel = labels && relabels(p.id) ? L2.labelInTarget(prep.label, R.labels, labels.captions, to) : null
    // or a theorem-like head's (its unit's body or its note), in translator's name for the target, its number and punctuation
    // the original's (headLabelInTarget, PDF-READER §19.11): read from the page's characters in the file's label box, each
    // part in its own style
    const head = !relabel && labels && relabels(p.id) && (p.unit.kind === 'theorem' || p.unit.kind === 'heading') ? headOf(p) : null
    if (head) prep.label = { ...(prep.label ?? {}), x1: Math.max(...head.chars.map(c => c.x1)), text: head.chars.map(c => c.ch).join(''), chars: head.chars, drawn: head.text, parts: head.parts, open: head.open }
    if (relabel || head) {
      if (relabel) prep.label = { ...prep.label, drawn: relabel }
      for (const c of prep.label.chars) prep.cat?.set(L2.charKey(c), 'acc')
      // (a file's first line starts at the unit's own mark, after the label the class set before it: the line the label
      // is now part of starts where the label does)
      const r0 = p.rects[0], lx0 = Math.min(...prep.label.chars.map(c => c.x0))
      if (r0 && Number.isFinite(lx0) && lx0 < r0[1] - 0.5 && prep.label.chars.every(c => c.page === r0[0])) p.rects[0] = [r0[0], lx0, r0[2], r0[3], r0[4]]
    }
    // its lead (paintNames: a name RUN_IN before its first line): the name's word in its own style, then the original's
    // joint as TeX set it (the characters between the name and the unit's text: the file's label of the unit, whichever
    // geometry v0 lays it by) and its glue, the translation after both; the line starting where the name does, their
    // characters the unit's text. The same lead a float's label in the target's name is
    const ld = leadsOf.get(p.id)
    // (a name and its joint drawn anew only where their groups hide them: the name's, and the unit's label for a joint; else the
    // lead stays the original's ink, its unit drawn after it)
    const jointOf = ld => {
      const nameKeys = new Set(ld.chars.map(L2.charKey)), lb = tex.index.unit(p.id)?.labels ?? [], pg = ld.nm.page
      const joint = []
      for (let o = 0; o + 6 < lb.length; o += 7) {
        if (lb[o + 1] !== pg) continue
        const x0 = lb[o + 2], x1 = lb[o + 4], top = lb[o + 5], bottom = lb[o + 6]
        for (const c of chars2[pg - 1] ?? []) if (/\S/.test(c.ch) && (c.x0 + c.x1) / 2 >= x0 - 0.5 && (c.x0 + c.x1) / 2 <= x1 + 0.5 && c.yb >= bottom - 0.5 && c.yb <= top + 0.5 && !nameKeys.has(L2.charKey({ ...c, page: pg }))) joint.push({ ...c, page: pg })
      }
      return joint.sort((a, b) => a.x0 - b.x0)
    }
    const joint = ld && p.rects[0]?.[0] === ld.nm.page && VIS.has(nameGroup(ld.nm.occurrence)) && !hiding?.labelKept?.(p.id) ? jointOf(ld) : null
    if (joint && (!joint.length || relabels(p.id))) {
      const jText = joint.map(c => c.ch).join('')
      // (the glue in em of the unit's own size, its first line's in the file: tokensOf2 sets it at the size the unit is drawn)
      const size0 = tex.index.unit(p.id)?.lines[6] ?? ld.nm.size
      prep.lead = { parts: [{ text: ld.text, st: ld.st }, ...(jText ? [{ text: jText, st: styleOfChars(joint) }] : [])], gap: ld.nm.glue / size0 }
      prep.label = { x1: Math.max(ld.nm.x1, ...joint.map(c => c.x1)), text: ld.chars.map(c => c.ch).join('') + jText, chars: [...ld.chars, ...joint], drawn: ld.text + jText }
      for (const c of prep.label.chars) prep.cat?.set(L2.charKey(c), 'acc')
      const r0 = p.rects[0]
      if (ld.nm.x0 < r0[1]) p.rects[0] = [r0[0], ld.nm.x0, r0[2], r0[3], r0[4]]
      p.lead = ld
      Object.assign(ld.rec, { drawn: true, why: null, size: r1(ld.nm.size), x: r1(ld.nm.x0), chars: ld.chars })
    }
    // iteration 3: each crop over the ink it touches (its page's ink map); a formula's parts (a formula TeX broke over lines,
    // layer2.mjs cropPartsOf), each cut from its segments, never grow (cropGrows), nor does a crop of a segment
    for (const r of prep.values()) {
      if (r?.mode !== 'crop') continue
      // (cut from a page read from its draw, and grown over its ink: its pixels read now; a crop of a layout file's segment is not)
      if (fromData[r.page] && !pixelsIn[r.page] && L2.cropGrows(r)) {
        needed('crop')
        await pixelsOf(r.page, 'crop')
        if (disposed) return
      }
      L2.growCrop(r, L2.cropGrows(r) ? inkOf(r.page, 'crop') : inks[r.page], pxOf(r.page), scale * dpr, local[r.page - 1] ?? chars2[r.page - 1])
    }
    const t1 = lap()
    const orig = prep.orig
    // (the original's size, its faked small capitals aside; a CJK target's small capitals at CJK_CAPS_SIZE of it: layer2.mjs unitSizeOf)
    const s = L2.unitSizeOf(prep, P, p.unit) ?? median(p.rects.map(r => r[4] - r[2])) / 0.894
    const base = orig && orig.st.fam !== 'math' ? { ...orig.st } : { fam: 'serif', bold: p.unit.kind === 'heading', italic: false, caps: false, design: designs.serif }
    const keep = prep.keep?.length ? new Set(prep.keep) : null
    // (centred as the layout file has the unit, UNIT_FLAG.CENTRED: TeX's own alignment where the marked original tells it, else
    // the maker's reading of arXiv's lines, make.mjs)
    const lu = p.tex.lu
    // a centred unit whose first line starts with a label kept as the original's (IEEEtran's "I." before its centred section
    // heading): centred with the line, label and text one, as TeX centred them, its ink copied as the line's start (a crop, as
    // a numbered heading's below), the line from the label on (`carried`). Left where it was, the shorter text centred alone
    // stood an em or more away from it
    const byCell = p.unit.kind === 'cell' ? cellCentred(p) : null
    const centredFlag = byCell !== null ? byCell : lu.centred
    const carried = centredFlag === true && relabels(p.id) && !!prep.label?.chars?.length && !prep.label.drawn && !!p.rects[0] && prep.label.chars.every(c => c.page === p.rects[0][0])
    if (carried) { const r0 = p.rects[0], lx0 = Math.min(...prep.label.chars.map(c => c.x0)); if (lx0 < r0[1]) p.rects[0] = [r0[0], lx0, r0[2], r0[3], r0[4]] }
    p.blocks = L2.blocks2(p.rects, geometry.left.pages, keep, prep.lineInfo, prep.regionOf, prep.referenced, LINESKIP, prep.breakAt, prep.joinAt, centredFlag)
    if (p.unit.kind !== 'cell') for (const b of p.blocks) widen(b, p)
    // (a unit whose last row another unit's first continues on a shared line, where something of the page stands between the
    // two that stays (a label kept as the original's: inparaenum's "(2)" between two items, 2610.21098 page 2): the next unit's
    // first line stays where TeX set it (layout2's `start` is not taken, keptBetween), so this unit's text on the row ends
    // where TeX ended it (`stop`, slotsAt), as it does where nothing comes after it. Run past it to the block's edge, its
    // last line was drawn over that label and over the next unit's first words)
    const kept = keptAfter(p)
    if (kept) for (const b of p.blocks) if (b.page === kept.page && b.B.some(y => Math.abs(y - kept.baseline) < 0.05)) b.stop = { y: kept.baseline, band: kept.size, x1: kept.x1 }
    // (the unit's displays TeX set with its short skip under a line of its own that ends 2 em before them, each the block's of
    // that line: the line laid there ends as far before them, layer2.mjs slotsAt)
    L2.shortSkipsTo(p.blocks, shortSkipsOf(lu), prep.lineInfo)
    // a label the first line starts with stays the original's: the line starts after it. A file's first line starts at
    // the unit's own mark, and so where the original's text does: after a label the file sets apart, at the line's own
    // start; after one it holds (a footnote's mark), where its first word is, never before the label's end (v0's quarter
    // of an em after it set a footnote's text 1.7 pt right of the original's)
    if (prep.label && !prep.label.drawn && p.blocks[0]) {
      const b = p.blocks[0]
      if (prep.label.x1 > p.rects[0][1] + 0.1) b.indent = Math.max(b.indent, (prep.firstX0 !== undefined && prep.firstX0 > prep.label.x1 ? prep.firstX0 : prep.label.x1 + 0.25 * s) - b.x0)
    }
    // a section heading (not the paper's title or front matter) of several lines in one block: set in fewer lines, it stands on
    // the original's last ones (layer2.mjs laidOut, P.lastLines). Where its class set its number before its first line, kept
    // as the original's ink there, the number goes with it, its ink copied as the line's start (`numbered`, once it is laid)
    const heading = p.unit.kind === 'heading' && !p.unit.title && !p.unit.front
    const numbered = heading && !carried && !prep.lead && relabels(p.id) && p.blocks.length === 1 && L2.originalLines(p.blocks[0]) > 1 && !!prep.label?.chars?.length && !prep.label.drawn && prep.label.chars.every(c => c.page === p.blocks[0].page)
    // a first row TeX set on the line another unit's last row ends (a shared line, need.mjs rowLeadOf: a run-in heading's text,
    // a paragraph's part after the float that split it) starts where that unit's translation ends on the row, the original's
    // separation after it (`start`, slotsAt), or at the row's own start where that unit set no text there (shareOf): not where
    // the original's did, after the English words' end (1810.04805's "Model Architecture" in Chinese ended 60 pt before its text
    // began, 10.9 pt in the original). The first line shortens where that unit's translation ends further on, and gives way to
    // the next row where none of it is left (slotsAt's sliver). That unit is laid before it (layIn), and its page's fill keeps
    // where it ended (fillPage). The first line stays where TeX set it where that unit is the original's (not placed, refused, or
    // its row kept), or anything of the page stands between the two on the row (a label or a name kept as the original's).
    // Where that unit's text on the row stands off TeX's baseline (its leading spread its lines over its rows: shareOf's `at`),
    // the first line stands on that unit's baseline (`startY`, slotsAt), so that the row is one line and not two a few points
    // apart (2608.16117 p39: unit 115's last line 7.2 pt over the row, unit 119 set from its end); on TeX's, it stays there
    const row = candOf.get(p.id)?.lead
    if (row && p.blocks[0] && !p.blocks[0].centred && p.blocks[0].page === row.page && Math.abs(p.blocks[0].B[0] - row.baseline) < 0.05) {
      const b = p.blocks[0], a = byId.get(row.id), share = a && !a.refused ? a.share ?? null : null, x = b.x0 + b.indent
      if (share && !share.kept && !keptBetween(row, x)) {
        b.start = share.end !== null ? share.end + Math.max(0, x - row.x1) : row.x0
        if (share.end !== null && Math.abs(share.at - b.B[0]) >= 0.05) b.startY = share.at
        // (painted on the row's page after that unit, whose erasing of the row covers where it starts: paintLed)
        p.ledBy = row.id
      }
    }
    if (P.borrow && p.unit.kind !== 'cell') for (const b of p.blocks) b.freeOf = () => freeFor(b, s)
    const t2 = lap()
    // (the label's own style: a class's bold or italic label)
    const lead = prep.lead ?? (prep.label?.parts ? { parts: prep.label.parts, ...(prep.label.open ? { gap: 0 } : {}) } : prep.label?.drawn ? { parts: [{ text: prep.label.drawn, st: (st => (st && st.fam !== 'math' ? { bold: !!st.bold, italic: !!st.italic, ...L2.colourOfStyle(st) } : {}))(prep.label.chars[0]?.st) }] } : null)
    // the faces the unit's runs are set in, served and loaded before a width is taken in any of them (one taken before its
    // slice is there would stay in the cache): the tokens read once with no measure, their faces and texts checked; a
    // unit with a character no served slice holds, or a slice that does not load, stays the original's
    if (FS) {
      const tFonts = performance.now()
      const no = await FS.check(runsOfTokens(L2.tokensOf2(p.unit, prep, to, base, designs, P, lead, () => 0)))
      fontWait += performance.now() - tFonts
      // (let go while its faces loaded: nothing more of it, not even its measures, in roles a newer layer may have set)
      if (disposed) return
      if (no) { p.refused = true; p.why = no.why; p.missing = no.missing; unlead(p); return }
    }
    // (from here to the unit's end nothing is awaited: its work is charged to its first page in `arrive`)
    workMarks.set(p, markWork())
    let tokens = L2.tokensOf2(p.unit, prep, to, base, designs, P, lead, undefined, true)
    if (carried && p.blocks[0]?.centred) {
      const cs = prep.label.chars, b0 = p.blocks[0], start = prep.firstX0 !== undefined && prep.firstX0 > prep.label.x1 ? prep.firstX0 : prep.label.x1 + 0.25 * s
      const x0 = Math.min(...cs.map(c => c.x0)) - 0.4, x1 = Math.max(Math.max(...cs.map(c => c.x1)) + 0.4, start - 0.4)
      const crop = { mode: 'crop', page: b0.page, crop: [x0, Math.min(...cs.map(c => c.yb - 0.26 * c.size)), x1, Math.max(...cs.map(c => c.yb + 0.8 * c.size))], baseline: median(cs.map(c => c.yb)), text: prep.label.text }
      tokens = Object.assign([{ crop, cw: x1 - x0, glue: false, w100: 0 }, ...tokens], { base: tokens.base })
      b0.indent = 0
      prep.label = { ...prep.label, drawn: prep.label.text }
      for (const c of cs) prep.cat?.set(L2.charKey(c), 'acc')
    }
    // (each later page's text where its source sets it: the translation cut at the source's page breaks, E3c, laid where that
    // costs the unit nothing of its fit: layoutCut, below)
    const cuts = prep.pageStarts?.size ? L2.pageCutsOf(tokens, p.unit, prep.pageStarts, P) : []
    const t3 = lap()
    // (the unit's leading relative to the original's own pitch, step 3: leadOf)
    p.tokens = tokens
    p.prep = prep
    p.s = s
    p.P = { ...P, leadBase: L2.leadOf(p.blocks, s, P), trackStart: P.trackStart ?? cjkAdvance(), lineskip: LINESKIP, halfLead: edgesOf(p, prep), lastLines: heading && !numbered }
    // (no larger than its lines' room between the rules over and under them leaves its script's em box: clearanceOf)
    p.clear = clearanceOf(p, s)
    if (p.clear && p.clear.cap < 1) p.P.capScale = p.clear.cap
    // (fillBySize, P.fillSize, off by default: where the leading rule gave up a step (0.05) or more of the script's
    // leading on a loose original, the paragraph is filled by its text's size instead, up to P.fillSize × the
    // original's; a solid-set original keeps the script's leading, and its units are never grown)
    if (P.fillSize > 1 && p.P.leadBase <= P.leadBase - 0.05 + 1e-9) p.P.growTo = P.fillSize
    // (adaptiveFill: every unit is laid at its leading relative to the original's own pitch, the script's own on a solid-set
    // original, and filled by its page's pass, fillPass. D filled a loose original's units alone (S3-12, against a band of
    // leading page by page moving the pages' pitches apart); D6's F6b fills every original's, its page's target held within
    // the band of its own page's anchor (1b-C))
    if (P.adaptiveFill) {
      p.fillable = true
      p.P.leadBase = L2.leadOf(p.blocks, s, { ...P, leadRel: true })
      p.P.growTo = 0
    }
    // (laid as without its cuts, the fit's states searched once, and again with them at that state where that layout sets a
    // later page's text on an earlier page, kept where it fits: its further steps and passes then lay the tokens it holds)
    ;({ layout: p.layout, tokens: p.tokens } = L2.layoutCut(tokens, cuts, p.blocks, s, p.P))
    // a numbered heading set in fewer lines than the original's: laid again on the original's last lines with its number as
    // its first line's start, the number's own ink copied there (a crop: its face, its colour, the space its class set after
    // it, as the original's) and erased where it was. Where that does not fit, or moves it nowhere, as it was
    if (numbered && !p.layout.clipped && p.layout.lines.length < L2.originalLines(p.blocks[0])) {
      const cs = prep.label.chars, b0 = p.blocks[0], start = b0.x0 + b0.indent
      const x0 = Math.min(...cs.map(c => c.x0)) - 0.4, x1 = Math.max(Math.max(...cs.map(c => c.x1)) + 0.4, start - 0.4)
      const crop = { mode: 'crop', page: b0.page, crop: [x0, Math.min(...cs.map(c => c.yb - 0.26 * c.size)), x1, Math.max(...cs.map(c => c.yb + 0.8 * c.size))], baseline: median(cs.map(c => c.yb)), text: prep.label.text }
      const blocks = [{ ...b0, start: x0 + 0.4 }], nTokens = [{ crop, cw: x1 - x0, glue: false, w100: 0 }, ...tokens], PL = { ...p.P, lastLines: true }
      const laid = L2.layoutUnit2(nTokens, blocks, s, PL)
      if (!laid.clipped && laid.lines.at(-1).baseline < p.layout.lines.at(-1).baseline - 0.05) {
        p.blocks = blocks; p.tokens = nTokens; p.P = PL; p.layout = laid
        prep.label = { ...prep.label, drawn: prep.label.text }
        for (const c of cs) prep.cat?.set(L2.charKey(c), 'acc')
      }
    }
    // (step 3: never drawn in part: given more room where the page has it, else left the original's, whole)
    if (p.layout.clipped) {
      const further = fitFurther(p, tokens, s)
      if (further) { p.layout = further.layout; p.blocks = further.blocks; if (further.P) { p.P = further.P; p.clear = further.clear } }
      else { p.refused = true; unlead(p); return }
    } else if (p.unit.kind !== 'cell') {
      // (a unit split by its displays into runs: each run its own text block, at the first state at which its own text fits its
      // own slots, so that a cramped run alone shrinks (layer2.mjs layoutRuns); its page's fill fills each run apart (fillPass).
      // A unit of one run, or one its runs do not set alone, as before; a table's cell is one block of its table's)
      const laidRuns = L2.layoutRuns(p.tokens, p.blocks, s, p.P, p.layout.lines)
      if (laidRuns) {
        // (the unit's fit as one kept (`whole`): its page's target reads the unit once, at the fill leading it had as one, as it
        // did before units were laid in runs, so that a neighbour's rhythm is the same (fillPass))
        p.whole = p.layout
        p.layout = laidRuns.layout
        p.runs = laidRuns.runs.map((r, i) => ({ id: p.id, unit: p.unit, parent: p, run: i, refused: false, fillable: !!p.fillable, tokens: r.tokens, blocks: r.blocks, bi0: r.bi0, s, P: r.P, layout: r.layout, clear: null, share: null }))
      }
    }
    settleLayout(p)
    // (a unit whose last row another unit's first continues on a shared line: where its translation ends on that row, which
    // that unit is laid from, and which its page's fill keeps; its last run's, where it is laid in runs)
    // (`kept`: something stays between the two on the row, keptAfter, and this unit's text there ended where TeX's did: the next
    // unit's first line stays where TeX set it, whatever its own reading of the row)
    if (followers.has(p.id)) { const r = candOf.get(followers.get(p.id))?.lead; p.share = r ? L2.shareOf(p.layout, p.blocks, r) : null; if (p.share && kept) p.share.kept = true; if (p.runs) p.runs.at(-1).share = p.share }
    const t4 = lap()
    p.layout.extents = new Map([...prep.extents].map(([r, e]) => [r.join(), e]))
    if (p.blocks[0] && (prep.label || prep.firstX0 !== undefined)) {
      const r0 = p.blocks[0].rects[0], ext = p.layout.extents.get(r0.join()) ?? r0.slice(1)
      // (an extent of several boxes, the file's: its first)
      const multi = Array.isArray(ext[0]), e = multi ? ext[0] : ext
      if (e) {
        let x0 = prep.firstX0 !== undefined ? Math.min(e[0], prep.firstX0 - 0.2) : e[0]
        // (a label set in the target's name is the line's: erased from its first glyph)
        if (prep.label?.drawn) x0 = Math.min(x0, ...prep.label.chars.map(c => c.x0 - 0.2))
        else if (prep.label) x0 = Math.max(x0, prep.label.x1 + 0.6)
        p.layout.extents.set(r0.join(), multi ? [[x0, e[1], e[2], e[3]], ...ext.slice(1)] : [x0, e[1], e[2], e[3]])
      }
    }
    // (laid to be drawn: counted, and recorded with `records`. The record is the gate's and reads the laid unit alone, so that
    // what it does never changes a drawing: one that throws is a record of the error, the unit drawn as without records)
    drawnUnits++
    p.counted = true
    if (!records) return
    try {
      const lines = recLinesOf(p)
      const drawnTok = new Set(p.layout.lines.flatMap(l => l.items.map(it => it.t)))
      const tr = tokens.filter(t => t.s && !t.ph && !t.sup)
      record(p, { grown: p.grown, s, f: p.layout.f, fitScale: p.layout.scale, knob: p.layout.knob, clipped: p.layout.clipped, opened: p.layout.opened, unopened: p.layout.unopened, lostChars: p.layout.lostChars, chars: p.layout.chars, lead: p.layout.state.lead, track: p.layout.state.track || p.layout.state.trackLatin, compress: p.layout.state.compress, borrow: p.layout.state.borrow, free: r1(Math.max(0, ...p.blocks.map(b => b.free))), tried: p.layout.tried, lines, orig, drawnRuns: L2.drawnRuns(tokens), drawnBase: styleKey(tokens.base), trChars: tr.reduce((a, t) => a + [...t.s].length, 0), trDrawn: p.layout.lines.reduce((a, l) => a + l.items.reduce((b, it) => b + (it.t.s && !it.t.ph && !it.t.sup ? [...it.t.s].length - (it.t.hyphenated ? 1 : 0) : 0), 0), 0), modes: modesOf(prep), unused: drawnTok.size, ms: [r1(t1 - t0), r1(t2 - t1), r1(t3 - t2), r1(t4 - t3)], tokens: tokens.length })
    } catch (e) {
      if (isMemoryError(e)) throw e
      // (no record of it, nor one on the unit for a pass to update, which would read what failed again: the error alone)
      p.rec = undefined
      recordErrors.push({ id: p.id, error: String(e?.message ?? e) })
    }
  }
  function record(p, x) {
    const match = x.orig !== undefined ? L2.styleMatch(x.orig, x.drawnRuns, x.drawnBase) : undefined
    // the record is the unit's at once: the page's even pass may run in the same task and update it
    p.rec = { id: p.id, kind: p.unit.kind, v: 2, pages: p.pages, cut: p.cut, ...x, sizeRatio: x.s ? r1(x.f / x.s) : undefined, s: x.s ? r1(x.s) : undefined, f: x.f ? r1(x.f) : undefined, orig: x.orig ? { key: x.orig.key, size: r1(x.orig.size), runs: x.orig.runs.length } : x.orig, match, drawnRuns: undefined, drawnBase: x.drawnBase }
    // (in the units' rank, the order they are laid in when the pages are laid in turn: whatever order they were laid in)
    byRank(stats, p.rec)
  }

  // even=1: a page's body units laid out first, then all set at the smallest size any of them needs, then painted; a
  // unit on two pages is set by its first page's pass and counts as fixed on the next; even=2 sets the leading alike as
  // well (the smallest any body unit of the page took)
  const laid = Array.from({ length: N + 1 }, () => [])
  const evenPass = pg => {
    const body = laid[pg].filter(p => EVEN_KINDS.has(p.unit.kind) && !p.refused)
    const target = Math.min(1, ...body.map(p => p.layout.scale))
    const leadTo = P.even >= 2 ? Math.min(P.leadBase, ...body.map(p => p.layout.state.lead)) : P.leadBase
    for (const p of body) {
      if (p.pages[0] !== pg) continue
      if (p.layout.scale <= target + 1e-9 && p.layout.state.lead <= leadTo + 1e-9) continue
      const keep = { extents: p.layout.extents, rec: p.rec }
      const PU = p.P ?? P
      p.layout = L2.layoutUnit2(p.tokens, p.blocks, p.s, { ...PU, maxScale: target, leadBase: Math.min(PU.leadBase, leadTo) })
      // (the even pass sets the page's body units at one size: a unit's runs are one again)
      p.runs = null
      p.layout.extents = keep.extents
      settleLayout(p)
      if (p.rec) Object.assign(p.rec, { f: r1(p.layout.f), sizeRatio: r1(p.layout.f / p.s), fitScale: p.layout.scale, knob: p.layout.knob, opened: p.layout.opened, unopened: p.layout.unopened, lead: p.layout.state.lead, lines: recLinesOf(p) })
    }
  }
  // adaptiveFill's pass over a page's units that begin on it (fillPage), each filled unit's record updated from the layout
  // it is drawn with (the lines TeX's rule opened among them: a looser leading may open none the fit's did). A page's target
  // is a function of its own units alone (pageTarget): no page reads another's, whatever the order the passes run in
  const fillPass = pg => {
    const begun = laid[pg].filter(p => p.fillable && !p.refused && p.pages[0] === pg)
    // (after the even pass, which laid them anew: their fill leadings are the pass's, as they were)
    if (P.even) for (const p of begun) fillLeadsOf(p, P)
    const recorded = (p, target, fillLead) => {
      const l = p.layout
      if (p.rec) Object.assign(p.rec, { f: r1(l.f), sizeRatio: r1(l.f / p.s), fitScale: l.scale, knob: l.knob === 'none' ? 'fill' : l.knob, opened: l.opened, unopened: l.unopened, lead: l.state.lead, track: l.state.track, lines: recLinesOf(p), fill: { target, lead: fillLead } })
    }
    // (a unit laid in runs is filled a run at a time, each run a unit of the page's fill, read by its target once, as one: a block
    // between two displays is a text block of its own), then laid as one again
    const filledRuns = new Map()
    // (a unit's runs are filled on the page the unit begins on, together: one pass, so that they keep one tracking (fillPage).
    // Filling each on the page it begins on was measured and declined (2026-10-24, 7 Chinese papers: link colours lost 2 -> 9,
    // paragraph ends letter-spaced 4 -> 14), left to its own change)
    const { units: filling, ...told } = fillUnitsOf(begun, laid[pg].filter(p => p.fillable && !p.refused && p.pages[0] !== pg))
    const r = fillPage(filling, P, (q, target) => {
      if (q.parent) { filledRuns.set(q.parent, target); return }
      recorded(q, target, q.fillLead)
    }, told)
    for (const [p, target] of filledRuns) {
      const keep = p.layout.extents
      p.layout = L2.joinRuns(p.runs)
      p.layout.extents = keep
      settleLayout(p)
      // (its fill leading as its page's target read it, the unit's as one; each run's beside it)
      recorded(p, target, p.fillLead)
      if (p.rec) p.rec.fill.runs = p.runs.map(q => q.fillLead)
    }
    // (the page's fill numbers, kept with its record)
    rows[pg - 1].fill = r && { own: r.own, anchor: r.anchor, target: r.target, body: r.body }
  }
  // the leftover packed (packPage) over a page's units laid, each moved unit's record updated
  const packPass = pg => {
    // (the ink that stays, by the page's ink map: no move is made on a page whose map is not read)
    const map = inkOf(pg, 'pack'), dev = pxOf(pg), vw = views[pg - 1]
    const accounted = []
    // (a table's cell may be withheld with its group after this pass: its glyphs are not taken as gone)
    for (const p of laid[pg]) {
      if (p.refused || p.unit.kind === 'cell' || !p.prep?.cat) continue
      for (const c of p.prep.uc ?? []) if (c.page === pg && !c.sep && !c.space && p.prep.cat.get(L2.charKey(c)) === 'acc') accounted.push([c.x0, c.yb - 0.25 * c.size, c.x1, c.yb + 0.88 * c.size])
      for (const c of p.lead?.chars ?? []) if (c.page === pg) accounted.push([c.x0, c.yb - 0.25 * c.size, c.x1, c.yb + 0.88 * c.size])
    }
    const stays = map ? stayingInk({ map, toDev: dev, toPdf: (x, y) => vw.convertToPdfPoint(x / dpr, y / dpr), accounted }) : () => -Infinity
    const moved = packPage(pg, laid[pg], rectsByPage.get(pg) ?? [], chars2[pg - 1] ?? [], stays, P.borrowGap)
    for (const [id, d] of moved) { const p = byId.get(id); if (p?.rec) Object.assign(p.rec, { lines: recLinesOf(p), pack: r1(d) }) }
    return moved
  }
  const ms = new Map()
  // A table group's cells laid, then painted all together or not at all (the table-groups brief): a cell is painted
  // only once every cell of its group is laid, and none is where one could be set only clipped (its fit past its floor)
  // — a cell that cannot be drawn whole cannot be drawn —, or where the group's cells lie on more than one page (the
  // first page's would be painted before the last's are laid). A group not painted is the original's, its records gone
  const groupLaid = new Map()
  const withhold = (p, why) => {
    const at = placed.indexOf(p)
    if (at >= 0) placed.splice(at, 1)
    const r = stats.indexOf(p.rec)
    if (r >= 0) stats.splice(r, 1)
    if (p.counted) { p.counted = false; drawnUnits-- }
    p.withheld = true
    skipped.push({ id: p.id, kind: p.unit.kind, why: `group: ${why}`, code: 'group', chars: trCharsOf(p.unit), pages: p.pages })
  }
  /** group g decided once every cell of it is laid: withheld, or to be painted whole (true) */
  const settleGroup = g => {
    const laidCells = groupLaid.get(g)
    if (!laidCells || laidCells.done || laidCells.list.length < groupCells.get(g).length) return false
    laidCells.done = true
    const pages = new Set(laidCells.list.flatMap(p => p.pages))
    // (and over the text-removed PDF, a cell on a page the remover refused: it could only be erased)
    const why = pages.size > 1 ? 'on two pages' : laidCells.list.some(p => p.refused || p.layout.clipped) ? 'a cell unfit' : null
    if (why) {
      for (const p of laidCells.list) withhold(p, why)
      // (withheld, never to be painted: a cell whose pages have all passed lets go now, the others as their pages pass)
      for (const p of laidCells.list) if (settledUnit(p)) letGoUnit(p)
      return false
    }
    return true
  }
  /** a group's cells painted on the page q (each on all its pages, the whole group, where q is null) */
  const paintGroup = (g, q = null) => { for (const p of groupLaid.get(g).list) for (const pg of p.pages) if (q === null || pg === q) paint(p, pg) }
  // ---- each page painted by itself (1b-B, the 1b design §2.3 C1): a page's pass decides the layouts of the units that begin
  // on it, and paints nothing; a page is painted in one order, whatever order the passes ran in: its names (at its drawing),
  // then, for each first page f of the units on it, f's pass's units in their order (a unit moved by the leftover's packing
  // last) and the table groups settled at f. The first pages are taken in the order their passes run laid in order: by
  // when the last unit on each is laid (its lay rank), and where one unit's laying completes two, in its pages' order
  // (passKey). That is a function of the units' ranks alone, and it is the order a page was painted in before: a page's
  // paint is order-dependent (what the restore counts as accounted, the removal's guard), so it keeps that one, also where
  // a unit's pages skip one (a paragraph on pages 1 and 3 ranks its part of page 3 after that of one from page 2 laid
  // before it). Each part is painted once its pass and every part before it have run: laid in order each paints as its
  // pass runs, so a page is painted part by part exactly when and as before; laid in any order, the same. A page's paint
  // writes only that page's state (its accounted characters, kept ink, the removal's guard, its ops and its SVG)
  /** each page's painters' first pages and placed units (on its pages shown), each pass's painters and its groups settled,
   *  the passes run, and each page's parts painted */
  const firstsOn = [], unitsOn = [], passOrder = [], settledAt = [], passed = new Uint8Array(N + 1), paintedOn = []
  /** when page f's pass runs, laid in order: the lay rank of the last unit on it, then f's place in that unit's pages */
  const passKey = f => {
    let last = null, at = -1
    for (const u of unitsOn[f] ?? []) { const r = rankOf.get(u.id) ?? Infinity; if (r > at) { at = r; last = u } }
    return [at, last ? last.pages.indexOf(f) : 0]
  }
  const partsOf = q => [...(firstsOn[q] ?? [])].map(f => [f, passKey(f)]).sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1] || a[0] - b[0]).map(([f]) => f)
  /** page q's parts painted, in their order, as far as their passes have run */
  const paintOn = q => {
    touched.add(q)
    // (a page read from its draw whose pixels are not read yet is painted once they are, by its own closure (layIn), which reads
    // them: a page's paint reads that page alone, in its own order whenever it runs, so a page beside the one asked is not read
    // for its pixels to paint a unit running on to it)
    if (fromData[q] && !pixelsIn[q]) { paintLater.add(q); return }
    const done = (paintedOn[q] ??= new Set())
    for (const f of partsOf(q)) {
      if (done.has(f)) continue
      if (!passed[f]) break
      done.add(f)
      for (const u of passOrder[f]) if (u.pages.includes(q)) paintLed(u, q)
      for (const g of settledAt[f]) paintGroup(g, q)
    }
  }
  /** each page's units painted there by their parts (ids), and those waiting there for the unit before them on a shared line,
   *  by that unit's id */
  const paintedIds = [], awaitLead = []
  /**
   * Unit u's part of page q painted, after the unit before it on a shared line (`ledBy`, layout2: its first line laid from
   * where that unit's translation ends on the row, inside the rectangle that unit's erasing of the row covers), so that the
   * erasing never takes what u drew there (its crops) however the page's parts fall: they paint in their passes' order, and a
   * unit from an earlier page (one whose page holds a unit that skips a page ranks late) may paint after the unit it leads. u
   * waits for it while it is still to be painted there by its own part (laid, and no table cell, which paints with its group),
   * and is painted right after it; then whatever waited for u
   */
  const paintLed = (u, q) => {
    const painted = (paintedIds[q] ??= new Set())
    const a = u.ledBy === undefined ? null : byId.get(u.ledBy)
    if (a && !painted.has(a.id) && a.pages.includes(q) && !a.refused && (!a.unit.group || !groupCells.has(a.unit.group))) {
      const waiting = (awaitLead[q] ??= new Map())
      ;(waiting.get(a.id) ?? waiting.set(a.id, []).get(a.id)).push(u)
      ;(u.waitsOn ??= new Set()).add(q)
      return
    }
    u.waitsOn?.delete(q)
    paint(u, q)
    painted.add(u.id)
    const next = awaitLead[q]?.get(u.id)
    if (!next) return
    awaitLead[q].delete(u.id)
    for (const w of next) paintLed(w, q)
  }
  /** whether unit u's part of page q (its first page's) is painted, u with it (not waiting there for the unit before it on a
   *  shared line: paintLed) */
  const partPainted = (u, q) => !!paintedOn[q]?.has(u.pages[0]) && !u.waitsOn?.has(q)
  /** page pg's pass: the even pass, the page fill and the leftover packed over the units that begin on it, its groups
   *  settled, then each page its units are on painted as far as it can be */
  const passPage = pg => withWork(pg, () => passPageOf(pg))
  const passPageOf = pg => {
    if (P.even) evenPass(pg)
    if (P.adaptiveFill) fillPass(pg)
    // (the leftover packed: the units moved are painted after the others, from the top, so that no erasing of the
    // unit above takes what they draw over its foot)
    const moved = P.leftover === 'pack' ? packPass(pg) : null
    const order = moved?.size ? [...laid[pg].filter(u => !moved.has(u.id)), ...laid[pg].filter(u => moved.has(u.id)).sort((a, b) => b.blocks[0].B[0] - a.blocks[0].B[0])] : laid[pg]
    passOrder[pg] = order.filter(u => !u.refused && u.pages[0] === pg && (!u.unit.group || !groupCells.has(u.unit.group)))
    settledAt[pg] = [...new Set(laid[pg].map(u => u.unit.group).filter(x => x && groupCells.has(x)))].filter(settleGroup)
    passed[pg] = 1
    touched.add(pg)
    for (const q of new Set([pg, ...laid[pg].filter(u => u.pages[0] === pg).flatMap(u => u.pages)])) paintOn(q)
    // (the page passed: a unit on it every page of which has passed, painted on each (its paint lets it go) or left the
    // original's, lets go of what it was laid with)
    for (const u of laid[pg]) if (settledUnit(u)) letGoUnit(u)
  }
  const arrive = async p => {
    fontWait = 0
    const t0 = performance.now()
    // (a unit that throws while it is laid is the original's, why `error`: its page completes, never blank for one unit; a
    // memory error is no unit's, and goes on)
    try { await layout2(p) } catch (e) {
      if (isMemoryError(e)) throw e
      p.refused = true
      p.why = 'error'
      unlead(p)
    }
    // (let go while it was laid: neither recorded, nor painted, nor counted)
    const mark = workMarks.get(p)
    if (mark) { workMarks.delete(p); if (!disposed) chargeWork(p.pages[0], mark) }
    if (disposed) return
    // (the faces it waited for apart from its laying: no task of v0's)
    timesOf(p.pages[0]).lay += performance.now() - t0 - fontWait
    timesOf(p.pages[0]).fonts += fontWait
    afterLay(p)
    ms.set(p.id, performance.now() - t0 - fontWait)
  }
  /** a unit left the original's without being laid (`why`: `page`, on a page that failed), counted as one laid and left */
  const refuseUnit = (p, why) => {
    p.refused = true
    p.why = why
    afterLay(p)
  }
  /** a unit laid (or left the original's) counted, recorded and painted: its page passes, its table group, its paint */
  const afterLay = p => {
    // (its lay is over: the pages it read are held for it no longer; its paint reads its own pages', held until each is done)
    dropReads(candOf.get(p.id))
    // (a unit no step fits is the original's: neither erased nor drawn, nor checked; nor one whose characters no served
    // slice holds (`served`) or whose slice did not load (`face`))
    if (p.refused) skipped.push({ id: p.id, kind: p.unit.kind, why: p.why ?? 'unfit', code: skipCode(p.why ?? 'unfit'), ...(p.missing ? { missing: p.missing } : {}), chars: trCharsOf(p.unit), pages: p.pages })
    const g = p.unit.group && groupCells.has(p.unit.group) ? p.unit.group : null
    // (each list a page's or a group's units laid, in their rank whatever order they were laid in (L3): a pass paints in it)
    if (g) byRank((groupLaid.get(g) ?? groupLaid.set(g, { list: [], done: false }).get(g)).list, p)
    for (const pg of p.pages) touched.add(pg)
    if (PASSES) {
      // (its fill leading is its fit's, fixed now (fillLeadsOf). With the even pass, which lays the units of a page anew before
      // the fill, the fill leading of a unit on its own first page is the pass's, as it was (fillPass), and `fit` keeps the
      // fit's, which is all a page it runs on to reads of it: no page's target then reads another page's even pass)
      if (P.adaptiveFill && p.fillable && !p.refused) {
        // (a unit laid in runs: each run's own, the page fill's units)
        for (const q of p.runs ?? [p]) fillLeadsOf(q, P)
        // (and the unit's own, read from its fit as one: its one vote in its pages' targets, and its line count, which the page's
        // size step reads for each of its runs)
        if (p.runs) { const joined = p.layout; p.layout = p.whole; fillLeadsOf(p, P); p.layout = joined }
        if (P.even) p.fit = { fillLead: p.fillLead, fitLines: p.fitLines }
      }
      // (a page's pass sets the units that begin on it, which are then painted on each of their pages, each page in its
      // own order (paintOn): a unit is never painted from two layouts; a table's cells with their group, once it is laid
      // whole)
      for (const pg of p.pages) {
        byRank(laid[pg], p)
        // (every entry that may draw a unit on the page decided: a unit is laid only after its pages' entries are, its
        // closure's rows)
        if (laid[pg].length === expected[pg] && !undecided[pg]) passPage(pg)
      }
      return
    }
    // (no page pass: each unit painted as it is laid, a page ready once every unit on it is)
    for (const pg of p.pages) byRank(laid[pg], p)
    if (g) {
      if (settleGroup(g)) paintGroup(g)
      // (a cell withheld with its group, or painted on its pages, lets go once its group is settled)
      for (const c of groupLaid.get(g).list) if (settledUnit(c)) letGoUnit(c)
    } else {
      if (!p.refused) for (const pg of p.pages) paint(p, pg)
      letGoUnit(p)
    }
  }

  // a page drawn: its characters read, its copy made and its ink mapped; the paper's designs from the first
  // each page's costs, ms (the gate's --perf): its original drawn (render), its text read (text), the removal's reading of
  // its ink and its plan (ink), its removed page drawn for v0's copy (rp); its units laid (lay: a unit's on its first
  // page, less the faces it waited for, fonts) and painted, their operations made (ops: the erase and its put-back, or
  // the swap's rectangles), drawn on the copy (compose) and set as SVG (svg)
  const pageTimes = []
  const timesOf = pg => (pageTimes[pg] ??= { render: 0, text: 0, ink: 0, rp: 0, lay: 0, fonts: 0, ops: 0, compose: 0, svg: 0, words: 0, links: 0, fills: 0 })
  // the deterministic work a page cost (work.mjs: integer counts, no clock), by page, as pageTimes is. Charged over stretches of
  // synchronous code, so that a page's counts are the same whatever the order pages were asked in and however the tasks
  // interleaved; `inWork` keeps a stretch inside another from being charged twice. Nothing the drawing reads
  const pageWork = []
  const workOf = pg => (pageWork[pg] ??= newWork())
  // (each unit's mark from where its lay stops awaiting to its end, kept beside the unit, not on it: a property set on every
  // unit object put each into dictionary mode, 800 bytes a unit for the run's length where the units are kept, the speed
  // check's heap growth a laid page, 2026-10-17)
  const workMarks = new Map()
  let inWork = false
  const chargeWork = (pg, m) => { const w = workOf(pg); for (const k of WORK_KEYS) w[k] += work[k] - m[k] }
  const withWork = (pg, f) => {
    if (inWork) return f()
    inWork = true
    const m = markWork()
    try { return f() } finally { inWork = false; chargeWork(pg, m) }
  }
  // the document read, our wrapped page (one a run: its groups hide what a unit owns, docs/route/ocg-erasure.md §4); each read of
  // a page holds it (using), and it is told to the host (onRetired) at dispose once no read holds it: once, never destroyed here
  const D = doc
  // (`retired` weakly: it only says the document was told already)
  const uses = new Map(), retiring = new Set(), retired = new WeakSet()
  const tellRetired = d => { if (retired.has(d)) return; retired.add(d); onRetired?.(d) }
  const retire = d => { if (!d || retired.has(d)) return; if (uses.get(d)) retiring.add(d); else tellRetired(d) }
  const using = async (docs, f) => {
    const held = [...new Set(docs.filter(Boolean))]
    for (const d of held) uses.set(d, (uses.get(d) ?? 0) + 1)
    try { return await f() } finally {
      for (const d of held) {
        const n = uses.get(d) - 1
        if (n) uses.set(d, n)
        else { uses.delete(d); if (retiring.delete(d)) tellRetired(d) }
      }
    }
  }
  const drawPage = i => using([D], () => drawPageOn(i, D))
  /** page q's draw asked of the host, once (drawOf): its answer kept until the page is drawn; null where it has none or the ask
   *  threw (the page is read live) */
  const drawAsk = q => {
    if (askedDraw[q]) return drawAsks.get(q) ?? null
    askedDraw[q] = 1
    let a
    try { a = Promise.resolve(drawOf(q)).then(d => d ?? null, () => null) } catch { a = Promise.resolve(null) }
    drawAsks.set(q, a)
    return a
  }
  /** a page's draw read into its inputs (fontReaders' draw), timed; null where it is refused (a font key read before with another
   *  row), the page then read live */
  const readDraw = (q, draw) => {
    const t0 = performance.now()
    try { return FR.draw(draw) } catch (e) {
      if (isMemoryError(e)) throw e
      drawStats.refused.push(q)
      return null
    } finally { drawStats.ms += performance.now() - t0 }
  }
  /** page q's pixels, once (a page read from its draw): PDF.js's drawing of it from the newest document on a canvas of the size its
   *  live reading draws it at, its ink map read and the canvas let go; `why` the step that asked first (drawStats). A drawing that
   *  throws fails the page, as its live reading's would, and every wait for it rejects */
  const pixelsOf = (q, why) => {
    let t = pixelTasks.get(q)
    if (t) return t
    drawStats.pixels[q] = why
    const d = D
    t = using([d], async () => {
      const t0 = performance.now()
      const page = await d.getPage(q)
      // (a run let go renders nothing more: its renders would hold the document's queue for the run over it after, and push its
      // pages out of the warm ones; one let go while its render waits its turn is not drawn either, VIS.render's `live`)
      if (disposed) return
      const viewport = page.getViewport({ scale })
      const c = document.createElement('canvas')
      c.width = Math.floor(viewport.width * dpr)
      c.height = Math.floor(viewport.height * dpr)
      let list = null
      // (the page kept warm by the document after it: the copy of the page asked renders from the same parse)
      try {
        await VIS.render(page, { canvas: c, canvasContext: c.getContext('2d'), viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }, [], live)
      } catch (e) { if (disposed && e?.name === 'AbortError') { c.width = 0; c.height = 0; return } throw e }
      // (the list it was drawn by: the page's fills, should its draw be refused or late)
      if (Number.isInteger(OPS?.showText)) list = renderedList(page)
      // (kept only while it is still the page's reading: not where the page was let go (letGoPage) or the ask it was read for
      // given up before the page was drawn (dropPixels), whose result would be held for good)
      if (!disposed && pixelTasks.get(q) === t) {
        // (held only for a page that may yet be read live: not one read from its draw, whose pixels may come after that read)
        if (list && !drawnPages[q] && !fromData[q]) heldLists.set(q, { doc: d, list })
        inks[q] = L2.inkMapOf(c)
        workOf(q).inkSteps += inks[q].w * inks[q].h
        pixelsIn[q] = 1
      }
      c.width = 0
      c.height = 0
      timesOf(q).render += performance.now() - t0
    })
    t.catch(e => {
      if (isMemoryError(e) || pixelTasks.get(q) !== t) return
      failedPages.add(q)
      if (rows[q - 1]) rows[q - 1].base = false
      touched.add(q)
    })
    pixelTasks.set(q, t)
    return t
  }
  const drawPageOn = async (i, d) => {
    const tPage = performance.now()
    // (its draw, where pages are read from theirs: asked at its closure's taking, or now)
    const asked = DATA ? drawAsk(i) : null
    const page = await d.getPage(i)
    const tGot = performance.now()
    const r = rows[i - 1]
    let x = null
    if (asked) {
      let timer, late = false
      const draw = await Promise.race([asked, new Promise(ok => { timer = setTimeout(() => { late = true; ok(null) }, DRAW_WAIT_MS) })])
      clearTimeout(timer)
      drawAsks.delete(i)
      if (late) drawStats.late.push(i)
      if (draw) x = readDraw(i, draw)
    }
    const viewport = page.getViewport({ scale })
    views[i - 1] = viewport
    if (!x) {
      r.left.width = Math.floor(viewport.width * dpr)
      r.left.height = Math.floor(viewport.height * dpr)
      if (r.right) { r.right.width = r.left.width; r.right.height = r.left.height }
    }
    r.view = page.view
    let tc, annP, fonts, tRendered, fills = null
    if (x) {
      // (from its draw: no text content, annotation or pixel read of PDF.js's; its pixels are read where a step reads its ink)
      fromData[i] = 1
      drawStats.data.push(i)
      tc = x.tc
      annP = x.raw
      fonts = x
      fills = x.fills
      heldLists.delete(i)
      tRendered = performance.now()
    } else {
      if (DATA) drawStats.live.push(i)
      // (its render's time from here where its draw was waited for, which is no render's; the page's own start otherwise)
      const tLive = asked ? performance.now() : tPage
      const textP = page.getTextContent()
      // (held warm until its fills are read off the list it was drawn by: the renders of other pages meanwhile let it go no sooner)
      const unpin = VIS.pin(page)
      try {
        // (read for its pixels already, its draw then refused or late: its ink is that reading's, the same pixels at the same size,
        // their render charged there, pixelsOf)
        const prefetched = pixelTasks.has(i)
        if (prefetched) await pixelTasks.get(i)
        // (a live reading under way when the run is let go ends as it began: its page's canvases go once it ends)
        else await VIS.render(page, { canvas: r.left, canvasContext: r.left.getContext('2d'), viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
        tRendered = performance.now()
        // (the page's links, asked once the render is done so that the worker does not parse them ahead of it: one more round trip)
        annP = LK.readAnnots(page)
        // (and its getPage, which an ordinary live reading's time holds too; never the wait for its draw)
        if (!prefetched) timesOf(i).render += tRendered - tLive + (asked ? tGot - tPage : 0)
        tc = await textP
        fonts = FR.live(page, tc.styles)
        // (its characters' fills as its draw would tell them: its ink off the list PDF.js drew it by, here or in its early pixel read)
        const tFills = performance.now(), held = heldLists.get(i)
        heldLists.delete(i)
        fills = await liveFillsOf(OPS, page, tc.items, workOf(i), held?.doc === d ? held.list : null)
        timesOf(i).fills += performance.now() - tFills
      } finally { unpin() }
    }
    if (i === 1 && lmP) await lmP
    const fontOf = fonts.fontOf
    // the slices of the role table's faces that hold the page's characters, before they are measured in them (layer2.mjs
    // wDesign measures a character in its font's design, as upright or slanted as the font is)
    if (FS) {
      const byFace = new Map()
      for (const it of tc.items) {
        const st = it.str ? fontOf(it.fontName) : null
        if (!st?.known) continue
        const face = faceOf({ ...st, fam: st.fam === 'math' ? 'serif' : st.fam }, 'latin', 'en'), key = fontString(face, 100)
        const e = byFace.get(key) ?? byFace.set(key, { face, text: '' }).get(key)
        e.text += it.str
      }
      await Promise.all([...byFace.values()].map(e => FS.ready(e.face, e.text)))
    }
    chars2[i - 1] = L2.pageChars2(tc, fontOf, fonts.mapOf, fills)
    // (its text items kept compact with its record, for its text layer: textOf)
    r.items = TL.itemsOf(tc)
    // (and its characters by baseline, which every unit's edges read, made once the page is: edgesOf)
    rowsByPage[i] = rowsOf(chars2[i - 1])
    workOf(i).edges += chars2[i - 1].length
    timesOf(i).text += performance.now() - tRendered
    // (the Link annotations with the glyph points inside each: the engine's own reading of what PDF.js calls overlaid text)
    const raw = await annP
    if (raw === null) { annots[i - 1] = null; linkStats.unread++ } else {
      const read = LK.annotsOf(raw, LK.pointsOf(tc.items), LK.charPoints(chars2[i - 1]))
      annots[i - 1] = read.list
      linkStats.total += read.total
      linkStats.unsupported += read.unsupported
    }
    // (the request's latency from its dispatch to its answer, and the parse)
    timesOf(i).links += performance.now() - tRendered
    // (its pixels and characters read: its rendering state is the document's, kept warm for the page's copy or let go among the
    // oldest, visibility.mjs)
    if (shelf) shelf.chars[i - 1] = chars2[i - 1]
    r.base = true
    // (let go while the page was drawn: its canvases are gone, so there is no ink to read, and the roles and faces every run
    // shares are a newer layer's to set)
    if (disposed) return
    // the page's ink, read now whatever the rules are: units that borrow below, widen over paper and grow a crop read it, on
    // their own page and, for a crop, on the page it is cut from (a page read from its draw: once a step reads it, pixelsOf)
    if (!x && !pixelsIn[i]) {
      inks[i] = L2.inkMapOf(r.left)
      workOf(i).inkSteps += inks[i].w * inks[i].h
    }
    // with no copy, nothing else reads the original's canvas: the drawing is made as data (ops), a view draws it over the
    // page it renders itself (drawCopy), and the checker, which reads this canvas, needs a copy. So it goes now, not when the
    // host is done with the page: a host that jumps to page p holds the canvases of all p pages until then, 12.5 MB each.
    // `base` stays: the page is drawn, and a crop may still be cut from it
    if (!copy) {
      r.left.width = 0
      r.left.height = 0
      r.left = null
    }
    if (i === 1) {
      // the paper's designs from its first page: the serif with most characters, and its sans and mono, of page 1's own
      // characters (L3: page 1 is drawn first, and no other page's drawing is read)
      const tally = new Map()
      for (const c of chars2[0]) if (c.st.fam !== 'math') { const key = `${c.st.fam}:${c.st.design}`; tally.set(key, (tally.get(key) ?? 0) + 1) }
      const pick = fam => [...tally].filter(([k]) => k.startsWith(`${fam}:`)).sort((a, b) => b[1] - a[1])[0]?.[0].split(':')[1]
      const serif = pick('serif') ?? 'times'
      designs = { serif, sans: pick('sans') ?? (serif === 'cm' ? 'cmss' : 'helvetica'), mono: pick('mono') ?? (serif === 'cm' ? 'cmtt' : 'courier') }
      if (roles) {
        // the paper's family from the first page's fonts, weighted by their characters; then the target's likely faces,
        // each measured once
        const weight = new Map()
        for (const c of chars2[0]) if (c.st?.name) weight.set(c.st.name, (weight.get(c.st.name) ?? 0) + 1)
        setRoleFaces(to, familyOfFonts([...weight.keys()], [...weight.values()]), R.cjkFaces)
        await hyphP
        if (disposed) return
        await L2.warmFaces(to, P.cjk, designs, yieldNow, (face, text) => FS.ready(face, text))
      } else {
        await loadWebFaces([designs.serif, designs.sans, designs.mono], fontUrl)
        await hyphP
        await warmP
      }
    }
  }

  // ---- the units as they arrive (take, end). A page is laid as one open over every unit lays it: its units in their rank
  // (layGroups' order: each a batch's place in the stream, which counts the units placed before it), each one's growth on a
  // page after that of every unit ranked before it there, each page's pass once every unit placed on it is laid, its paint
  // in its own order. So a page is laid once every page its closure reads is drawn and every entry of K it reads (its
  // `rows`) is in and decided (need.mjs closureOf, the 1b-D design §1.2), and the laying of no other page changes it. An
  // entry is decided by itself (consume), in any order, a unit placed taking its place in the stream's order: an order fixed
  // before the rows are read would not be the one open's (a unit not translated, an author, a cell whose group is withheld,
  // the file's lines in place of the geometry's decide which units are placed, and so the batches). A unit's row is fixed
  // once it is decided (a row taken for it later is late), and every row once a table's group is read
  // (the geometry's units and the file's alone, in the stream's order: v0's sort is stable, so equal streams keep the
  // order the layer reports its sources in)
  addUnits(cands.slice().sort((a, b) => a.stream - b.stream))
  /** K as laying the pages in order reads it (closureOf's prefix: the rules that lay in order, ORDER_FREE false). Under parts,
   *  until they end, an entry past K stands for every part not told: framed on the page after the last covered, so that each
   *  lay, done and complete index of K's length or more names a page that waits for a part, and each one below it is the
   *  whole paper's (the door design §0.3) */
  const inOrderK = () => (partsEnded || through >= N ? K : [...K, { lists: [[through + 1]], reach: [through + 1], rects: true }])
  let KS = inOrderK()
  /** each page's closure over K so far (closureOf), until a part adds to K or the parts end; where the rules lay in order,
   *  closureOf's prefix */
  let closures = new Map()
  const closure = p => {
    let C = closures.get(p)
    if (!C) closures.set(p, (C = ORDER_FREE ? closureOf(K, N, p) : closureOf(KS, N, p, { orderFree: false, passes: PASSES })))
    return C
  }
  /** K grew, or the parts ended: every closure taken again */
  const regrown = () => { KS = inOrderK(); closures = new Map() }
  /** the units placed, in the stream's order, as layGroups reads them (`placed` is the same less each table group withheld
   *  as its cells are laid), and by id */
  const laidOut = [], byId = new Map()
  const fixed = new Set(), late = new Set(), deferred = []
  let ended = false
  /** whether the unit's row decides what it is: in, and a table cell's group readable (every row in) where it is placed */
  const settleable = c => {
    if (!c.lists.length || frozenAll) return true
    if (pending.has(c.id)) return false
    const u = U.get(c.id)
    if (!u?.group || !translated(u) || !pending.size || read.has(u.group)) return true
    // (a cell placed waits for its group: its own cells' rows where the open was given them, else every row)
    if (tableGroups && (membersOf.get(u.group) ?? []).every(id => !pending.has(id))) return true
    return !decisionOf(c).p
  }
  /** a unit put in a list of the stream's order (K's), at its place: entries are decided in any order */
  const inStream = (list, p) => {
    let lo = 0, hi = list.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].k < p.k) lo = mid + 1; else hi = mid }
    list.splice(lo, 0, p)
  }
  /** an entry of K decided, its row in (settleable): its unit placed, or not and why */
  const consume = c => {
    if (c.decided) return
    c.decided = true
    for (const q of new Set(c.lists.flat())) { undecided[q]--; touched.add(q) }
    // (drawn on no page shown: it places nothing, and why it is left is read at the end)
    if (!c.lists.length) { deferred.push(c); dropReads(c); return }
    fixed.add(c.id)
    const u = U.get(c.id), d = decisionOf(c)
    if (d.skip) skipped.push(d.skip)
    let p = d.p
    if (p && u.group) {
      if (!tableGroups) freezeAll()
      else if (!read.has(u.group)) readGroup(u.group, membersOf.get(u.group) ?? [])
      if (split.has(u.group)) { skipped.push({ id: p.id, kind: u.kind, why: 'group: a cell not drawn', code: 'group', chars: trCharsOf(u), pages: p.pages }); p = null }
    }
    if (!p) { dropReads(c); return }
    p.k = c.k
    inStream(laidOut, p)
    inStream(placed, p)
    byId.set(p.id, p)
    planned = false
    for (const pg of p.pages) expected[pg]++
    if (!c.rects) addRects(p.id, p.rects)
    toGrow(p)
    for (const pg of p.pages) { (firstsOn[pg] ??= new Set()).add(p.pages[0]); (unitsOn[pg] ??= []).push(p) }
  }
  // each placed unit's rank (layGroups' order, a recorded order, where given, within each page's group) and the page whose
  // drawing lays it in order (its group's): over the units placed so far, planned again once more are
  const rank = orderIn ? new Map(orderIn.map((id, i) => [id, i])) : null
  const groupPage = new Map()
  let planned = true
  const plan = () => {
    planned = true
    doneCache = null
    const groups = layGroups(laidOut, batch).map(([pg, ids]) => [pg, rank ? ids.slice().sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity)) : ids])
    // (each unit's place in the lay order, the pages' growth steps' rank: a unit placed later takes its place among them,
    // and the order of those placed before stays)
    rankOf = new Map(groups.flatMap(([, ids]) => ids).map((id, i) => [id, i]))
    groupPage.clear()
    for (const [pg, ids] of groups) for (const id of ids) groupPage.set(id, pg)
  }
  /** laid in order (ORDER_FREE false), the page after whose units each page is done: the last whose drawing lays a unit with
   *  lines on it, and with a page pass, the last that finishes the first page of each unit on it, whose pass sets that unit
   *  (once a plan: it changes only as more units are placed) */
  let doneCache = null
  const doneAtAll = () => {
    if (doneCache) return doneCache
    const d = (doneCache = Array.from({ length: N + 1 }, (_, pg) => pg))
    for (const p of laidOut) for (const pg of p.pages) d[pg] = Math.max(d[pg], groupPage.get(p.id) ?? pg)
    if (PASSES) for (let pg = 1; pg <= N; pg++) for (const p of laidOut) if (p.pages.includes(pg)) d[pg] = Math.max(d[pg], d[p.pages[0]])
    return d
  }
  // (a wait: for a take, a part, end() or a poke; one waiter, the closure in hand's)
  let wake = null
  /** whether the run was let go (dispose): nothing is drawn or laid after it */
  let disposed = false
  /** whether a render of the run's still has a reader: none once it is let go (VIS.render's `live`) */
  const live = () => !disposed
  const changed = () => { const w = wake; wake = null; w?.() }
  /** the one wait, until a take, a part, end() or a poke changes something: the waiter set before the instrument hears of it,
   *  so that what the instrument does at once is not lost */
  const waitFor = what => { const woken = new Promise(ok => { wake = ok }); onWait?.(what); return woken }
  /** every unit placed with what is in, and why each one left is left (once the parts have ended): the units no page shows,
   *  and those v0 neither holds nor the file alone locates */
  const settleAll = () => {
    pending.clear()
    freezeAll()
    for (const c of K) consume(c)
    if (partsEnded) account()
    plan()
  }
  /** why each unit left is left that only the end of the rows and the parts can tell: the units no page shows, and those v0
   *  neither holds nor the file alone locates (a unit not told yet is not unanchored) */
  const account = () => {
    for (const c of deferred.splice(0)) { fixed.add(c.id); const d = decisionOf(c); if (d.skip) skipped.push(d.skip) }
    // (a figure's ink unit is no unit the left or the file places: its page's figures tell it, paintFigures)
    U.forEach((u, id) => { if (!translated(u) || candOf.has(id) || u.kind === FIGURE_KIND) return; const no = refusalOf(id, u); skipped.push(no ? refusedOf(id, u, no) : unanchoredOf(id, u, 'unlocated')) })
  }
  /** whether laying page p waits for nothing more to come, neither a part nor a row (the 1b-D design §2.1): the parts cover
   *  its closure's bound, or have ended, and every entry it decides is in K and decided or settleable */
  const inputsOf = p => {
    const C = closure(p)
    if (!partsEnded && through < C.bound) return false
    for (const i of C.rows) { if (i >= K.length) return false; const c = K[i]; if (!c.decided && !settleable(c)) return false }
    if ([p, ...C.draw].some(figuresWait)) return false
    return true
  }
  /** the ids of the units whose rows laying page p still waits for, taken neither nor ended (its closure's over K so far: a
   *  part may add more): its entries' and their table groups' cells' (a cell is decided with its group's rows), every row
   *  awaited where the open was given no group */
  const rowsFor = p => {
    if (!pending.size) return []
    const out = new Set()
    for (const i of closure(p).rows) {
      const c = K[i]
      if (!c || c.decided || settleable(c)) continue
      // (its own row; else it is a cell whose group waits: its group's cells' rows, every row where the open was given no group)
      if (pending.has(c.id)) { out.add(c.id); continue }
      if (!tableGroups) { for (const id of pending) out.add(id); break }
      for (const id of membersOf.get(c.group) ?? []) if (pending.has(id)) out.add(id)
    }
    // (its pages' figures', where they are shown)
    for (const q of new Set([p, ...closure(p).draw])) for (const f of figuresOn(q)) if (pending.has(f.id)) out.add(f.id)
    return [...out].sort((a, b) => a - b)
  }
  const toldComplete = new Uint8Array(N + 1)
  // (today's call, every unit given: placed at once, as the one open places them)
  if (!pending.size) settleAll()
  const order = [], pageMs = []
  let busy = Promise.resolve()
  /** the run's slices of work between two yields (SLICE_MS) */
  const slices = slicer()
  /** one closure laid at a time, each after the one before has ended (an until, a layFor) */
  const serial = f => { const r = busy.then(f, f); busy = r.then(() => {}, () => {}); return r }
  /** each page drawn (its drawing read, its names painted) and ready (readyOf, final), at most once */
  const drawnPages = new Uint8Array(N + 1), readyAt = new Uint8Array(N + 1), toldStep = new Uint8Array(N + 1)
  /** whether page q is ready: drawn, every entry of K that may draw a unit on it decided, every unit placed on it laid and,
   *  with a page pass, its pass run and each of its parts painted (every first page's of a unit on it). Final: a page ready
   *  never changes within the run */
  const readyOf = q => {
    if (!(q >= 1 && q <= N)) return false
    if (readyAt[q]) return true
    if (!drawnPages[q] || failedPages.has(q) || undecided[q] || laid[q].length !== expected[q]) return false
    // (its figures painted, where it has figures shown)
    if (figuresDone[q] !== 2 && figuresOn(q).length) return false
    if (PASSES && expected[q]) {
      if (!passed[q]) return false
      for (const f of firstsOn[q] ?? []) if (!paintedOn[q]?.has(f)) return false
    }
    readyAt[q] = 1
    return true
  }
  /** each page touched since the last look that is now ready or failed, told once (onStep), a ready one with the time the
   *  closure in hand took since the page before it was ready (`ms()`: the closure's work so far, less what it waited for): each
   *  ms counted for one page, so that the pages' times add up to the closures' (pageMs) */
  const report = ms => {
    for (const q of touched) {
      if (q < 1 || q > N || toldStep[q] || !(failedPages.has(q) || readyOf(q))) continue
      toldStep[q] = 1
      if (readyAt[q]) { const t = ms(); pageMs[q] = t - (ms.last ?? 0); ms.last = t }
      onStep?.(q)
    }
    touched.clear()
  }
  /**
   * Page q drawn and its names painted (layer2.mjs nameInTarget: before its units), once a part covers it; a wait `still` may
   * end (false then, nothing drawn). A page no part will cover, or whose drawing or names throw, is stepped over, failed:
   * nothing of it drawn, and every unit on it, on any of its pages, left the original's, why `page`; but the run ends, never a
   * page stepped over, on a memory error, a document opened without PDF_OPTIONS (#352's refusal) and page 1, whose drawing
   * sets the paper's designs, family, patterns and faces that every later page is laid in. No page is drawn twice
   */
  const drawOne = async (q, still, wait) => {
    while (!disposed && through < q && !partsEnded) { if (!still()) return false; await wait('part') }
    if (disposed) return false
    if (drawnPages[q] || failedPages.has(q)) return true
    touched.add(q)
    if (q > through) { failedPages.add(q); return true }
    try {
      await drawPage(q)
      if (!disposed) await paintNames(q)
    } catch (e) {
      if (isMemoryError(e) || e?.refusesDocument || q === 1) throw e
      failedPages.add(q)
      // (none of it a source to cut a crop from)
      if (rows[q - 1]) rows[q - 1].base = false
      return true
    }
    if (disposed) return false
    drawnPages[q] = 1
    unswept.add(q)
    return true
  }
  /** where pages are read from their draws: a closure's draws asked at once, every page of its `draw` not drawn yet (their left
   *  parts come in parallel, not one round trip a page), and the page asked read for its pixels beside the other pages' readings
   *  (its units are laid and painted over them): at once where the paper's parts carry draws (`drawsComing`), once a part covers it;
   *  else as soon as its draw is in, a page whose draw is none read live in the closure's order, page 1 first. A page read live
   *  whose pixels were read already takes its ink from them (drawPageOn) */
  const prefetch = (p, C) => {
    for (const q of [p, 1, ...C.draw]) if (!drawnPages[q] && !failedPages.has(q)) drawAsk(q)
    if (pixelTasks.has(p)) return
    if (fromData[p] || (drawsComing && p <= through && !failedPages.has(p) && !drawnPages[p])) { pixelsOf(p, 'asked'); return }
    // (not for a page whose drawing has taken its ask by then, drawPageOn: one read from its draw has its pixels asked there, and
    // one read live, its draw late or refused, draws itself)
    if (!drawnPages[p]) drawAsks.get(p)?.then(d => { if (d && !disposed && !pixelTasks.has(p) && !drawnPages[p] && drawAsks.has(p)) pixelsOf(p, 'asked') })
  }
  /**
   * Page p's closure laid (the 1b-D design §2.1): page 1 drawn first; then, the closure taken again after every wait (a part
   * may grow it), its pages drawn in order, its rows decided in the stream's order as each is in, and once the parts cover it
   * and its rows are in, its units laid in their rank, back to back in slices (`slices`, SLICE_MS) (each unit's pages, and its
   * placeholders', drawn before it is: in order too, L2). A unit on a page that failed is left the original's, why `page`, and
   * the closure goes on, p's own failure too. Each page told as it is ready or failed (onStep). It ends once p is ready or failed, or `still` (read at every
   * wait, between pages and between units) is false: what is done stays done, each step having run on complete inputs, and
   * the next closure takes it up from there
   */
  /** page p's pixels, read for it before it was drawn, let go (its ask given up: layIn), read again if it is asked again */
  const dropPixels = q => {
    if (drawnPages[q] || !pixelTasks.has(q)) return
    pixelTasks.delete(q)
    heldLists.delete(q)
    pixelsIn[q] = 0
    inks[q] = undefined
  }
  /** layWithin; where pages are read from their draws, a page asked and given up before it was drawn lets go of its pixels, so
   *  that a reader passing pages whose rows are still to come holds none of theirs */
  const layIn = (p, still) => (DATA ? layWatched(p, still) : layWithin(p, still))
  const layWatched = async (p, still) => {
    try { await layWithin(p, still) } finally { if (!disposed) dropPixels(p) }
  }
  const layWithin = async (p, still) => {
    if (disposed || readyOf(p)) return
    const t0 = performance.now()
    let waited = 0
    const wait = async what => { const t = performance.now(); await waitFor(what); waited += performance.now() - t }
    const ms = () => performance.now() - t0 - waited
    if (partsEnded && p > through) { failedPages.add(p); touched.add(p); report(ms); return }
    for (;;) {
      if (disposed || !still()) return
      // (the closure's draws asked before page 1 is drawn: its own draw among them, one round trip for all)
      if (DATA) prefetch(p, closure(p))
      if (!(await drawOne(1, still, wait))) return
      report(ms)
      const C = closure(p)
      if (DATA) prefetch(p, C)
      // its pages, in order; a part told meanwhile may grow the closure: taken again
      let again = false
      for (const q of C.draw) {
        // (a page not drawn yet waits while a newer target overtakes: a page's drawing is no unit, but no shorter)
        if (!drawnPages[q] && !failedPages.has(q) && !still()) return
        if (!(await drawOne(q, still, wait))) return
        report(ms)
        if (closures.get(p) !== C) { again = true; break }
      }
      if (again) continue
      // (a page that failed, p too, is stepped over: its units are left the original's as they would be laid, so that what
      // was left and why is told whatever page was asked; a host's drive turns away from a failed page at once, `still`)
      if (disposed) return
      // its rows, each decided once it is in; then every part it reads
      let missing = null
      for (const i of C.rows) {
        if (i >= K.length) { missing = 'part'; break }
        const c = K[i]
        if (c.decided) continue
        if (!settleable(c)) { missing = 'rows'; break }
        consume(c)
      }
      if (!missing && !partsEnded && through < C.bound) missing = 'part'
      // (and its pages' figures' rows, where the reader shows figures translated)
      if (!missing && [p, ...C.draw].some(figuresWait)) missing = 'rows'
      if (missing) { report(ms); if (!still()) return; await wait(missing); continue }
      // its pages' figures painted (paintFigures), once each, before its units: their groups and its units' are apart
      for (const q of new Set([p, ...C.draw])) {
        if (!drawnPages[q] || failedPages.has(q) || figuresDone[q]) continue
        await paintFigures(q)
        if (disposed) return
      }
      if (!planned) plan()
      report(ms)
      // its units, in their rank (laid in order, the units its pages' drawings lay: those whose group page is p's doneAt at most)
      const done = ORDER_FREE ? null : doneAtAll()[p]
      const units = []
      for (const i of C.lay) { const u = byId.get(K[i].id); if (u && !u.taken && (ORDER_FREE || groupPage.get(u.id) <= done)) units.push(u) }
      units.sort((a, b) => rankOf.get(a.id) - rankOf.get(b.id))
      // (a unit whose first row continues another's on a shared line reads that one's lay (layout2's start): that one is laid
      // first, ahead of its rank where it ranks after it (a paragraph from the page before, 2608.16117's unit 57, whose last row
      // its unit 59 continues on page 19), Need laying it with it (`follows`); every other unit in its rank. Its growth is its
      // pages' rank's, whichever is laid first, and its lay reads nothing of the units after it. Only where ORDER_FREE: rules
      // that lay in order share no line, addUnits)
      const order2 = [], left = new Set(units)
      const put = u => { if (!left.delete(u)) return; const a = byId.get(candOf.get(u.id)?.follows); if (a) put(a); order2.push(u) }
      for (const u of units) put(u)
      for (const u of order2) {
        if (disposed || !still()) return
        if (!planned) plan()
        for (const q of candOf.get(u.id).holds ?? []) {
          if (!drawnPages[q] && !failedPages.has(q) && !still()) return
          if (!(await drawOne(q, still, wait))) return
        }
        if (disposed) return
        if (u.pages.some(q => failedPages.has(q))) { u.taken = true; refuseUnit(u, 'page'); report(ms); continue }
        // (the slice's work done: a yield; let go during it, as a host's dispose usually is, or overtaken by a newer target, that
        // unit is not laid: it stays for its page's closure to lay)
        if (slices.due()) { await slices.give(); if (disposed || !still()) return }
        u.taken = true
        order.push(u.id)
        await arrive(u)
        if (disposed) return
        report(ms)
      }
      // (its paint, where it waited for its pixels (a page read from its draw: paintOn): read, then painted in its own order)
      if (paintLater.has(p) && !failedPages.has(p)) {
        needed('paint')
        try { await pixelsOf(p, 'paint') } catch (e) { if (isMemoryError(e)) throw e }
        if (disposed) return
        paintLater.delete(p)
        if (!failedPages.has(p)) paintOn(p)
      }
      sweep()
      report(ms)
      if (readyOf(p) || failedPages.has(p) || disposed) return
      // (laid in order, a page may be done after a page its first closure did not reach: on to it)
      if (!ORDER_FREE && units.length) continue
      throw new Error(`v0: page ${p} is not ready once its closure is laid`)
    }
  }
  const colsOf = pg => {
    // the page's columns: its paragraphs' lines' left and right edges, clustered
    const list = (cols[pg] ?? []).slice().sort((a, b) => a[0] - b[0])
    const out = []
    for (const [a, z] of list) {
      const c = out.find(c => a < c[1] - 20 && z > c[0] + 20)
      if (c) { c[0] = Math.min(c[0], a); c[1] = Math.max(c[1], z) }
      else out.push([a, z])
    }
    return out
  }
  const cellRects = pg => GU.filter(([id]) => geometry.kinds[id] === 'cell').flatMap(([, , rs]) => rs.filter(r => r[0] === pg))
  const toPdf = (pg, x, y) => views[pg - 1].convertToPdfPoint(x / dpr, y / dpr)
  /** the groups a plane of page pg hides (§4.1): A the units drawn there (its row's `off`), B every unit's text and label (a crop's
   *  source: every placeholder shown), C none (every group shown: the ink a reading keeps) */
  const offOf = (pg, plane) => (plane === 'A' ? [...(rows[pg - 1]?.off ?? [])] : plane === 'B' ? cropSourceOff : [])
  /** page pg's plane drawn by PDF.js at k device pixels a PDF unit, on `canvas` where given (sized by its caller) else on a new one
   *  of the page's size; `annotationMode` PDF.js's, where the host sets it. The page's rendering state (its operator list and
   *  the images it decoded) is the document's, warm for the renders after it (visibility.mjs WARM_PAGES): the planes of one copy,
   *  the copies again after a zoom and a later run's copies over the same document are one parse of the page, not one each */
  // (`box`: [x, y, w, h] device pixels of the page at k, the part rendered on a canvas of that size alone: a plane's sources, opsSources)
  const renderAt = (pg, k, plane, canvas = null, annotationMode = undefined, box = null) => using([D], async () => {
    // (a run let go renders nothing more: the document's queue and its warm pages are the next run's)
    if (disposed) throw Object.assign(new Error('the run is let go'), { name: 'AbortError' })
    const page = await D.getPage(pg)
    const viewport = page.getViewport({ scale: k })
    const c = canvas ?? document.createElement('canvas')
    if (!canvas) { c.width = box ? box[2] : Math.ceil(viewport.width); c.height = box ? box[3] : Math.ceil(viewport.height) }
    const params = { canvas: c, canvasContext: c.getContext('2d'), viewport, ...(box ? { transform: [1, 0, 0, 1, -box[0], -box[1]] } : {}), ...(annotationMode === undefined ? {} : { annotationMode }) }
    await VIS.render(page, params, offOf(pg, plane), live)
    return c
  })
  const needsCopy = () => {
    if (!copy) throw new Error("v0's checker reads its copy at its own resolution: open with copy: true")
    if (!records) throw new Error("v0's checker reads the drawing's audit and what the run lets go: open with records: true")
  }
  /** every page's canvases let go, drawn or not, and the removed pages' (dispose) */
  const letGo = () => {
    for (const r of rows) {
      // (a page whose view no part has told yet has no row)
      if (!r) continue
      for (const c of [r.left, r.right]) if (c) { c.width = 0; c.height = 0 }
      r.base = false
      r.released = true
    }
  }

  return {
    N, P, rows, placed, skipped, stats, audit: audit ?? [], order, ms, pageMs, pageTimes, pageWork, views,
    /** the records that could not be made (with `records`): each unit's id and the error; the unit drawn as without records */
    recordErrors,
    /** each page's characters: the run's, or with `free` and `records` the gate's shelf (every page's, let go or not) */
    chars: shelf ? shelf.chars : chars2,
    /** the units laid and drawn, recorded or not (`stats` holds their records with `records`) */
    get drawn() { return drawnUnits },
    /** babel's names of the pages laid (D1a): each { occurrence, key, page, drawn, why, chars, box (the original's), and
     *  where drawn its text, size, x and width } */
    names,
    /** the figures' text of the pages laid (the content class `figures`): each figure unit { id, group, page, drawn, why, and where
     *  drawn its text, size, x, y and width } */
    figures: figureRecs,
    /**
     * Page `pg`'s SVG, a new element each call (the 1b design §1, I2 and I3): class, size and spacing as the page's own, its
     * markup the strings its names and units were set in, in their order. No layout, face, ink or PDF.js call (I4): a parse of
     * the page's markup alone, 0.3 to 8.6 ms (420 to 12,000 elements, retention-audit §3)
     */
    svgOf(pg) {
      const r = rows[pg - 1]
      if (!r) throw new RangeError(`svgOf: page ${pg} has no row`)
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('class', 'tl')
      svg.setAttribute('width', String(r.w))
      svg.setAttribute('height', String(r.h))
      svg.setAttribute('xml:space', 'preserve')
      svg.innerHTML = r.markup.join('')
      return svg
    },
    /**
     * Page `pg`'s word table (words.mjs; the 1b design §4): the drawn tokens in drawing order with each unit's span and each token's
     * word in its translation, and the units left the original's. A new record on every ask, none of its arrays the run's (the
     * caller may transfer or free them). Only a page that is final (ready) has one: it is frozen at the first ask if it is not
     * already; a RangeError for another, never a table that would change
     */
    /** how many groups page pg's copy hides (render A's off): 0 where the layer draws nothing of its own there, its copy our base page
     *  as it is */
    hides: pg => rows[pg - 1]?.off?.size ?? 0,
    wordsOf(pg) {
      const r = rows[pg - 1]
      if (!r) throw new RangeError(`wordsOf: page ${pg} has no row`)
      if (!readyOf(pg)) throw new RangeError(`wordsOf: page ${pg} is not final`)
      freezeWordsOf(pg)
      return copyWords(r.words)
    },
    /**
     * Page `pg`'s links (links.mjs; the 3a design): the records of the page's Link annotations a reader can carry, sorted and
     * ranked, a new copy on every ask (none of its objects the run's). Only a page that is final (ready) has them: frozen at the
     * first ask if they are not already; a RangeError for another. A page whose annotations could not be read answers []
     */
    linksOf(pg) {
      const r = rows[pg - 1]
      if (!r) throw new RangeError(`linksOf: page ${pg} has no row`)
      if (!readyOf(pg)) throw new RangeError(`linksOf: page ${pg} is not final`)
      freezeLinksOf(pg)
      return LK.copyLinks(r.links)
    },
    /**
     * Page `pg`'s text layer (textlayer.mjs; docs/PDF-READER.md §11.11): the composed page's text items the drawing keeps, those
     * it moves with a crop, and each drawn line of the translation, in reading order, plain data made anew on every ask (none of
     * its objects the run's). Only a page that is final (ready) has one; a RangeError for another. Read from the page's record
     * alone (its text items, its operations and its drawn things' segments): no layout, ink or PDF.js call
     */
    textOf(pg) {
      const r = rows[pg - 1]
      if (!r) throw new RangeError(`textOf: page ${pg} has no row`)
      if (!readyOf(pg)) throw new RangeError(`textOf: page ${pg} is not final`)
      return TL.textLayerOf({ n: pg, items: r.items ?? TL.NO_ITEMS, view: r.view ?? [0, 0, r.w / scale, r.h / scale] }, { ops: r.ops, devOf: pxOf(pg), owners: r.text?.owners ?? [] }, r.text?.drawn ?? [], { sourceOf: j => rows[j - 1]?.items ?? null })
    },
    /** the counts of the links read and frozen so far (LayerStats.links), a copy */
    get linkStats() { return { ...linkStats, dropped: { ...linkStats.dropped } } },
    /**
     * With `records`, the gate's: each of page `pg`'s records' source annotations and the tier that made it, in the records'
     * order ({ annots: [[page, i], ...], tier }), the attribution the gate checks against the original's annotations (never
     * trusted). A RangeError for a page that is not final
     */
    ...(records ? {
      linkSources(pg) {
        const r = rows[pg - 1]
        if (!r) throw new RangeError(`linkSources: page ${pg} has no row`)
        if (!readyOf(pg)) throw new RangeError(`linkSources: page ${pg} is not final`)
        freezeLinksOf(pg)
        return (linkSrc[pg - 1] ?? []).map(s => ({ annots: s.annots.map(a => a.slice()), tier: s.tier }))
      },
    } : {}),
    /**
     * What the run holds (the 1b design §3). With no page: whether it lets go (`free`), keeps the units' records and the
     * audit (`records`), and keeps on the gate's shelf what it lets go (`shelf`). With a page: the analysis state it holds of
     * the page (`chars`, `ink`, `laid`, and `canvas`, a copy's), the units on it
     * still holding their own state, and the units still to be laid that read it (`reads`)
     */
    held(pg) {
      if (pg === undefined) return { free, records, shelf: !!shelf }
      const r = rows[pg - 1]
      const state = Object.entries({ chars: chars2[pg - 1], ink: inks[pg], laid: laid[pg], canvas: r?.left ?? r?.right, pixels: pixelTasks.get(pg), draw: drawAsks.get(pg) }).filter(([, v]) => v).map(([k]) => k)
      const units = [...byId.values()].filter(u => u.pages.includes(pg) && (HEAVY.some(k => u[k] !== undefined) || !!u.tex.lines)).map(u => u.id)
      return { state, units, reads: reads[pg] ?? 0 }
    },
    /** a placed unit as it was laid: the shelf's where the run let it go (`free` and `records`), else the unit itself */
    full: p => shelf?.units.get(p.id) ?? p,
    /** the layout rule set the run was opened with (rules/layout.mjs): its schema and version */
    rules: { schema: RULES_SCHEMA, version: R.version },
    get designs() { return designs },
    /** the units the layer placed, in the order of the geometry's units then the file's alone, and why the others are the
     *  original's (the file does not locate them whole: its why) */
    get sources() {
      const out = { tex: [], why: {} }
      let only = 0
      for (const c of cands) {
        const d = fixed.has(c.id) ? decisions.get(c.id)?.d : null
        if (!d) continue
        if (d.missed) out.why[d.missed] = (out.why[d.missed] ?? 0) + 1
        if (!c.rects && d.p) only++
        if (byId.has(c.id)) out.tex.push(c.id)
      }
      if (only) out.texOnly = only
      return out
    },
    /** page `pg` once it is ready (the lab's and the gate's: a page is done once it is ready), Infinity before */
    doneAt: pg => (readyOf(pg) ? pg : Infinity),
    /** every page up to `p` ready (or failed): each page's closure laid in turn, from page 1 (the gate's in-order run, closure
     *  by closure). `still`, read at each wait and between pages and units, false ends it there */
    until(p, still = ALWAYS) {
      return serial(async () => { for (let q = 1; q <= Math.min(p, N) && !disposed && still(); q++) await layIn(q, still) })
    },
    /** page `p`'s closure laid (layIn), and so every page it makes ready; `still` as until's */
    layFor(p, still = ALWAYS) { return serial(() => layIn(p, still)) },
    /** page `p`'s closure over K so far (need.mjs Closure): final once the parts cover its bound or have ended */
    closure: p => closure(p),
    /** whether page `p` is ready: drawn and laid, final within the run (its record is what stays of it) */
    ready: p => readyOf(p),
    /** the ids of the units whose rows laying page `p` still waits for (its closure's over K so far), in id order */
    rowsFor: p => rowsFor(p),
    /** the unit ids of K's entries (a closure's `lay` or `rows`, K indices), in their order */
    idsOf: entries => entries.map(i => K[i]?.id),
    /**
     * Parts (`parts`: the open given no view and no left unit): the next part, read by readPart against the chain, its layout
     * merged into the layout file's index by the host before (facade.mjs). The views of the pages it tells first and their rows;
     * its manifest's entries; its units added to the stream after the last told, in (slot, id) order (a left unit at its
     * stream, its rectangles copied; a file-only one at `after` + 0.5, never worked out again); those of a part with no layout,
     * or a refusal's record, are in no file and so the original's. The pages it covers can be drawn; with the rows ended its
     * units are placed at once. Sync, and nothing checked again: the host's readPart and the door have
     */
    grow(part) {
      const [a, b] = part.pages
      for (let q = a; q <= part.reach; q++) {
        if (geometry.left.pages[q - 1] === undefined) geometry.left.pages[q - 1] = part.views.slice(4 * (q - a), 4 * (q - a + 1))
        if (!rows[q - 1]) makeRow(q)
      }
      const entries = part.left.map(([id, stream, rects]) => ({ id, stream, rects: rects.map(r => r.slice()) }))
      for (const [id, after] of part.fileOnly) entries.push({ id, stream: after + 0.5, rects: null })
      entries.sort((x, y) => x.stream - y.stream || x.id - y.id)
      for (const c of entries) { cands.push(c); if (c.rects) GU.push([c.id, c.stream, c.rects]) }
      addUnits(entries)
      through = b
      regrown()
      // (the rows ended: what they decide is fixed, the groups the part tells read, its units placed)
      if (ended) {
        readGroups()
        for (const c of K) consume(c)
        plan()
      }
      changed()
    },
    /** no more parts: every page past the last covered fails as it is reached; the units' accounting, once the rows end too */
    endParts() {
      if (partsEnded) return
      partsEnded = true
      regrown()
      if (ended) { readGroups(); account(); plan() }
      changed()
    },
    /** the last page a part covers (every page, a whole open) */
    get through() { return through },
    get partsEnded() { return partsEnded },
    /** the last page up to which every page is ready or failed (a prefix: the lab's and the tests' measure of until) */
    get drawnTo() { let d = 0; while (d < N && (readyOf(d + 1) || failedPages.has(d + 1))) d++; return d },
    /** whether laying page `p` waits for nothing more to come, neither a part nor a row (inputsOf) */
    inputs: p => inputsOf(p),
    /** whether page p failed: its drawing threw, or no part covers it and the parts have ended */
    failed: p => failedPages.has(p) || (partsEnded && p > through),
    /** a wait under way looks again at what it waits for (its `still` among it) */
    poke: () => changed(),
    /**
     * Units as they arrive (rows: id → its row, the units record's): each awaited unit's row, which wins over one taken
     * before it until the unit is placed; a translated row's pieces' k read into the file's pieces (trPiecesOf: the
     * units file's TrPiece). A row that can no longer change the drawing is late (late()); one no unit of this paper's
     * is left the original's (refusalOf). Returns the pages newly complete: those not reported complete before.
     */
    take(rows) {
      const list = [...rows]
      for (const [id, row] of list) if (!Number.isSafeInteger(id) || id < 0 || row === null || typeof row !== 'object') throw new TypeError(`take: a row is [id, unit], not [${kindOf(id)}, ${kindOf(row)}]`)
      for (const [id, row] of list) {
        // (a structural name's row: the target's word for it, never laid; one taken after a page is drawn changes no drawing)
        if (row.kind === NAME_KIND) { takeName(row); continue }
        if (ended || frozenAll || fixed.has(id) || !awaited.has(id)) { late.add(id); continue }
        U.set(id, row)
        pending.delete(id)
        // (the file's pieces, as the units file holds them: a translated unit's alone)
        if (tex) { const tr = translated(row) ? trPiecesOf(row.pieces, q => q.k) : null; if (tr) tex.pieces.set(id, tr); else tex.pieces.delete(id) }
      }
      changed()
      // (a page is complete once laying it waits for nothing more: its closure covered and its rows in, told once; pages
      // come out of the stream's order, each by its own closure)
      const complete = []
      for (let pg = 1; pg <= N; pg++) if (!toldComplete[pg] && inputsOf(pg)) { toldComplete[pg] = 1; complete.push(pg) }
      return { complete }
    },
    /** no more units: every unit placed with what is in, every page complete */
    end() {
      if (ended) return
      ended = true
      settleAll()
      // (the units decided now that no page shows, or that are not placed, read no page)
      sweep()
      changed()
    },
    /** whether laying page `pg` waits for nothing more to come (inputsOf: its closure's parts and rows, or end()) */
    complete: pg => inputsOf(pg),
    /** the ids of every row taken that could no longer change the drawing, and changed nothing: its unit placed already
     *  (its page may not be laid yet), its rows fixed by a table group read, taken after end(), or never expected. Not a
     *  page to draw again: no laid page ever changes */
    late: () => [...late],
    /**
     * Page `pg`'s copy at a view's own resolution, `k` device pixels a PDF unit (its CSS px a unit × its device pixel ratio × its
     * zoom), once its units are painted (until): onto `ctx`, a canvas of the page at k from its top-left corner, render A (the page
     * with the groups of the units drawn on it hidden: offOf), then the page's drawing (its units' operations in the order v0
     * painted them) scaled to k: its crops cut from render B of their page, what its readings keep pasted from render B or C of
     * this page. Every render is the composed document's at k, through its one configuration (visibility.mjs), so that the copy is
     * as sharp as the original at every zoom. `signal`: an abort stops the copy before its next render (a page that left the view).
     * `annotationMode`: PDF.js's, for every render of the copy (the host's: a delta's replaced page draws
     * none of the original's annotations)
     */
    async drawCopy(pg, ctx, k, { annotationMode, signal = null } = {}) {
      const r = rows[pg - 1]
      // every plane the drawing cuts from: B of a crop's page, B and C of this page for its pastes
      // (each plane rendered on the box its operations cut from alone, not the whole page: L2.opsSources)
      const z = k / (scale * dpr), boxes = L2.opsSources(r.ops, z)
      const others = new Map()
      const need = (j, plane) => { const key = `${plane}${j}`; if (!others.has(key)) others.set(key, [j, plane]) }
      for (const o of r.ops) { if (o.op === 'crop' || o.op === 'paste') need(o.page, o.plane) }
      await renderAt(pg, k, 'A', ctx.canvas, annotationMode)
      // (let go while it reads: nothing drawn after)
      const rendered = []
      try {
        for (const [key, [j, plane]] of others) {
          if (disposed || signal?.aborted) return
          const box = boxes.get(key)
          const c = await renderAt(j, k, plane, null, annotationMode, box)
          rendered.push(c)
          others.set(key, box ? { canvas: c, x: box[0], y: box[1] } : c)
        }
        if (disposed || signal?.aborted) return
        L2.drawOps(ctx, r.ops, z, (j, plane) => others.get(`${plane}${j}`) ?? null)
      } finally { for (const c of rendered) { c.width = 0; c.height = 0 } }
    },
    /** a done page's canvases let go (its record stays), once no unit on it is still to be painted on any of its pages: no
     *  unit paints it, nor cuts from it on v0's own copy, again. The gate's and the lab's, which read a copy's planes once a
     *  page is laid: with no copy the run keeps no canvas of a page, and lets go of its analysis state by itself (`free`) */
    release(pg) {
      const r = rows[pg - 1]
      if (!r || !readyOf(pg)) return
      // (nor while a unit on it is still to be painted on one of its pages: a crop may be cut from it there, on v0's own copy)
      // (a page let go, `free`, has none: sweep lets it go only then)
      if (awaitsPaint(pg)) return
      for (const c of [r.left, r.right]) if (c) { c.width = 0; c.height = 0 }
      r.base = false
      r.released = true
    },
    /** the run let go: its sheet removed, every page's canvases released (a page under way when it is called, once it ends),
     *  nothing drawn or laid after; an until under way resolves. Its pages' records stay with whoever holds them */
    dispose() {
      // (the pages kept warm are the document's, for the next run over it: let go among the oldest, or with the document)
      if (disposed) return
      disposed = true
      sheet.remove()
      letGo()
      changed()
      busy.then(letGo, letGo)
      // (the draws asked and not drawn yet, let go: I6)
      drawAsks.clear()
      paintLater.clear()
      heldLists.clear()
      // (the documents it reads, told to the host once no read holds them)
      retire(D)
    },
    /** the deterministic work counters (work.mjs) summed over the pages: the same for the same input, whatever the machine's speed */
    workTotal() {
      const t = newWork()
      for (const w of pageWork) if (w) for (const k of WORK_KEYS) t[k] += w[k]
      return t
    },
    /** what the run hid and showed again (hide.mjs): units drawn, boxes pasted from render B, boxes pasted from render C
     *  (`pastedKeep`, design G6), crops */
    hidingStats: () => ({ ...hidStats }),
    /** where pages are read from their draws (drawOf): the pages read from data and live, the draws refused, each page whose pixels
     *  were read and the step that asked first, the times a step needed a page's pixels it had not (by step), the lays done again
     *  and the draws' reading in ms; a copy. Null where no page is (no drawOf, or rules that read every page's ink at once) */
    get drawStats() { return DATA ? { ...drawStats, data: drawStats.data.slice(), live: drawStats.live.slice(), refused: drawStats.refused.slice(), late: drawStats.late.slice(), pixels: { ...drawStats.pixels }, need: { ...drawStats.need }, lists: heldLists.size } : null },
    /** a done page's copy at v0's own resolution (`right`, with `copy`): drawn as a view draws it (drawCopy), once a check reads it */
    async copyCanvas(pg) {
      needsCopy()
      const r = rows[pg - 1]
      if (!r?.right || !readyOf(pg)) return null
      if (!r.copied) { r.right.width = r.left?.width ?? r.right.width; r.right.height = r.left?.height ?? r.right.height; await this.drawCopy(pg, r.right.getContext('2d'), scale * dpr); r.copied = true }
      return r.right
    },
    /** the prototype's completeness checker on one done page (main.js check=1's, its pixels of that page alone, its
     *  placeholders of the units with lines on it) */
    async checkPage(pg) {
      needsCopy()
      await this.copyCanvas(pg)
      const here = placed.filter(p => p.pages.includes(pg) && !p.refused).map(p => shelf?.units.get(p.id) ?? p)
      const only = rows.map((r, i) => (i === pg - 1 ? r : { ...r, base: false }))
      return checkAll({ N, placed: here, rows: only, pxOf, toPdf, chars2: shelf ? shelf.chars : chars2, audit, cols: colsOf, cellRects, named: names.filter(n => n.drawn && n.page === pg) })
    },
    /** the prototype's completeness checker over every page still held (main.js check=1's window.__result.check) */
    async check() {
      needsCopy()
      for (let pg = 1; pg <= N; pg++) if (readyOf(pg) && rows[pg - 1]?.base) await this.copyCanvas(pg)
      return checkAll({ N, placed: placed.filter(p => !p.refused).map(p => shelf?.units.get(p.id) ?? p), rows, pxOf, toPdf, chars2: shelf ? shelf.chars : chars2, audit, cols: colsOf, cellRects, named: names.filter(n => n.drawn) })
    },
  }
}

function modesOf(resolved) {
  const modes = {}
  for (const r of resolved.values()) modes[r.mode] = (modes[r.mode] ?? 0) + 1
  return modes
}
/** what a value is, for a refusal: its type, never its text */
const kindOf = v => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v)
function trCharsOf(u) {
  return u.pieces.reduce((a, p) => a + (p.t === 'text' ? [...p.s.replace(/\s+/g, '')].length : 0), 0)
}
