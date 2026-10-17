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
import { checkAll } from './check.mjs'
import { familyOfFonts } from '../rules/font-roles.mjs'
import { bodyFaceId, classifyFont, faceOf, fontString, loadWebFaces, OPEN_FAMILY, roleFaceSet, runsOfTokens, styleKey, setRoleFaces } from './fonts.mjs'
import { loadHyphenation } from './hyph.mjs'
import { blocksOf, median, norm, wordsOf } from './layer1.mjs'
import * as L2 from './layer2.mjs'
import { fileSwap, protection } from './removal.mjs'
import { SWAP_PAD, swapRects } from '../layer/swap.mjs'
import * as LK from './links.mjs'
import { kOfPieces, locatedWhole, proofOf, texParts, texRects } from './tex.mjs'
import { trPiecesOf } from '../layer/pieces.mjs'
import { addUnitWords, copyWords, freezeWords, newWords, plainOfPieces, tokenBand, wordIndexer } from './words.mjs'
import { closureOf, rowLeadOf } from './need.mjs'
import { markWork, newWork, work, WORK_KEYS } from './work.mjs'
import { isMemoryError } from '../pipeline/memory.mjs'
import { BUILTIN_RULES, resolveRules, RULES_SCHEMA } from '../rules/layout.mjs'

/** the prototype's getDocument options beside the host's asset URLs (main.js ASSETS): its canvases on the GPU, the whole
 *  file read at once; and each font's own ToUnicode map exported with it (fontExtraProperties: what the text layer reads a
 *  glyph by, pageChars2's `nu`; on 2307.16209 in Node, 101 fonts, 1.5 MB of heap and no measurable time). A document
 *  opened without it is refused as the run reads a page's fonts (layer2.mjs fontMappedOf), never read as one whose fonts
 *  have no map */
export const PDF_OPTIONS = { cMapPacked: true, enableHWA: true, disableStream: true, fontExtraProperties: true }
/** the page's body units that the even pass sets alike (a unit on two pages keeps its own fit) */
const EVEN_KINDS = new Set(['para', 'abstract', 'list', 'item'])
/** the SVG's own rules (the prototype's index.html): its text set as laid, in the layer's ink, in the faces it was
 *  measured in and no style made up of a face that has none (a bold or an oblique the family lacks stays regular) */
const SVG_RULES = ['.tl{position:absolute;left:0;top:0;overflow:visible;font-synthesis:none}', '.tl text{white-space:pre;fill:#141414}']
const r1 = x => Math.round(x * 100) / 100
/** a run's `still` that never stops it */
const ALWAYS = () => true
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
 * even pass, adaptiveFill's) ends here, before the unit is recorded or painted.
 */
export function settleLayout(p) {
  if (p.clear) L2.clearLines(p.layout.lines ?? [], p.clear.bands, p.s * (p.layout.scale ?? 1))
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
export function fillPage(units, P, onFilled = () => {}, { continuing = [] } = {}) {
  const { band, track, size } = P.adaptiveFill
  const r3 = x => Math.round(x * 1000) / 1000
  // (a unit whose last row the next unit's first continues on a shared line, laid from where its fit ended there (`share`,
  // layer2.mjs shareOf), is filled only where that stays so: no leading, tracking or size that sets its text there further
  // right, sets text there where its fit left the row free, or moves its line there off the baseline the next unit's first
  // line was set on (the fit's, `at`). Its fill leading is still its fit's, which the page's target
  // reads (fillLeadsOf); the page's one size is chosen as before, and a unit it would move there keeps its own)
  const free = (p, st) => { const l = L2.layoutAt(p.tokens, p.blocks, p.s, p.P, st); return l.clipped ? null : l }
  const at = (p, st) => { const l = free(p, st); return l && L2.keepsShare(p.share, l.lines) ? l : null }
  // (a unit's fill leading is its fit's (fillLeadsOf), set as it is laid: computed here only for a unit given without it)
  for (const p of units) if (p.fillLead === undefined) fillLeadsOf(p, P)
  const told = pageTarget(units, continuing, band)
  if (!told || told.target === null) return told
  const { target } = told
  const filled = []
  for (const p of units) {
    if (p.fillLead === null) continue
    let st = { ...p.layout.state, lead: Math.min(p.fillLead, r3(target + band)) }
    let l = at(p, st)
    if (!l) continue
    // short of its fill at the band's edge or at its fill leading's top: tracking, the most that still sets it, then the
    // page's size
    const short = p.fillLead > target + band + 1e-9 || p.fillLead >= p.fillTop - 1e-9
    let full = !short
    if (short && P.cjk) {
      // (the most tracking that still sets it: halving, as a wider tracking holds no more on a line)
      const K = Math.round(track / 0.01), st2 = k => ({ ...st, track: r3(st.track + k * 0.01) })
      let ok = 0, no = K + 1, lk = null
      while (no - ok > 1) { const k = (ok + no) >> 1, l2 = at(p, st2(k)); if (l2) { ok = k; lk = l2 } else no = k }
      if (ok) { st = st2(ok); l = lk }
      full = ok < K
    }
    filled.push({ p, st, l, full })
  }
  // the page's one size where it grows: every body unit's, where none is full yet; the largest at which every one is still
  // set whole, by halving (a larger size sets no more), a unit that fails ending the try. A unit the fit had to shrink
  // keeps its own largest fitting size: setting the page's other body units at it (PR #335's reviews) left the alphabets'
  // and Japanese's units short of their frames, the alphabets unable to spread past the original's pitch (paraGap 1.255
  // -> 1.708, as before D6; full size 0.25 -> 0; Japanese 1.011 -> 1.289), the coordinator's ruling of 2026-10-09
  const grown = filled.filter(f => EVEN_KINDS.has(f.p.unit.kind))
  if (size > 1 && grown.length && grown.every(f => !f.full)) {
    const scaleOf = k => r3(1 + k * P.step)
    const all = k => { const ls = []; for (const f of grown) { const l = free(f.p, { ...f.st, scale: scaleOf(k), knob: 'grow' }); if (!l) return null; ls.push(l) } return ls }
    let ok = 0, no = Math.round((size - 1) / P.step) + 1, best = null
    while (no - ok > 1) { const k = (ok + no) >> 1, ls = all(k); if (ls) { ok = k; best = ls } else no = k }
    if (ok) grown.forEach((f, i) => { if (!L2.keepsShare(f.p.share, best[i].lines)) return; f.st = { ...f.st, scale: scaleOf(ok), knob: 'grow' }; f.l = best[i] })
  }
  for (const { p, st, l } of filled) {
    const keep = p.layout.extents
    p.P = { ...p.P, leadBase: st.lead }
    // (its fit's knob kept, a step past its states among them (widen, below-floor), but the page's size grown)
    if (st.knob !== 'grow') l.knob = p.layout.knob
    p.layout = l
    p.layout.extents = keep
    // (laid anew: its clearance at its new size, before it is recorded or painted; the pass put a cleared CJK cell's
    // first line back on the original's baseline, over its rule, 2026-10-07)
    settleLayout(p)
    onFilled(p, target)
  }
  return told
}

/**
 * A unit's fill leading (fillPage's) and its top, read from its fit alone: `fillTop`, the loosest leading P.fillLead allows
 * it at the size it is set at, × its original's pitch (1: the original's own pitch, P.fillLead null); `fillLead`, the
 * loosest leading from its fitted one up to the top at which its fitted state still sets it whole (null where that state
 * does not set it again). Set on the unit as it is laid (afterLay), so that the fill leading a page's pass reads of a unit
 * running on to it from a page before no longer depends on whether that page's pass has run (the 1b design, §2.1 C1). Not
 * yet the rest of the pass's reads: its line count, read live (after its first page's fill), and the targets the page is
 * held to (`held`, through every page passed before) are S3's, 1b-C's
 */
function fillLeadsOf(p, P) {
  const r3 = x => Math.round(x * 1000) / 1000
  const at = (q, st) => { const l = L2.layoutAt(q.tokens, q.blocks, q.s, q.P, st); return l.clipped ? null : l }
  if (P.fillLead === null) p.fillTop = 1
  else {
    const pitches = p.blocks.map(b => b.pitch0).filter(v => v > 0).sort((a, b) => a - b)
    const p0 = pitches.length ? pitches[pitches.length >> 1] : 1.2 * p.s
    p.fillTop = r3((P.fillLead * p.s * p.layout.state.scale) / p0)
  }
  // (a looser leading holds no more lines than a closer one: the loosest that sets the unit is found by halving, a few
  // layouts a unit where trying each hundredth from the top took up to forty. Monotone in practice, not by construction:
  // the greedy breaking's kinsoku and hanging marks could make a looser value set a unit a closer one does not; the linear
  // search from the top is the reference, and the halving drew the same on every fixture. So for the tracking and size)
  p.fitLines = p.layout.lines.length
  const st = p.layout.state
  if (!at(p, st)) { p.fillLead = null; return }
  const lo = st.lead, hi = p.fillTop, L = k => Math.min(hi, r3(lo + k * 0.01))
  let ok = 0, no = Math.round((hi - lo) / 0.01) + 1
  while (no - ok > 1) { const k = (ok + no) >> 1; if (at(p, { ...st, lead: L(k) })) ok = k; else no = k }
  p.fillLead = ok ? L(ok) : lo
}

/**
 * The ink of a page that stays visible where a unit's lines would move to (E3 for the leftover packed, packPage): the
 * page's ink map (layer2.mjs inkMapOf, of the original page as PDF.js draws it: text, rules, images and vector paths
 * alike), less the glyphs the drawing takes away (`accounted`: the boxes of the characters the page's painted units
 * account for, erased with them or removed by the add-on, each grown by a map cell, as the map holds a cell any of whose
 * pixels is inked), and the add-on's `dirty` boxes (kept ink under the units' rectangles, where the removed page is swapped
 * in). Boxes are [x0, y0, x1, y1] in PDF units; `toDev` and `toPdf` map between them and the map's canvas. Returns
 * foot(x0, x1, y0, y1): the PDF y of the lowest staying ink's foot in that box, or null where it holds none.
 */
export function stayingInk({ map, toDev, toPdf, accounted = [], dirty = [] }) {
  const { w, h, factor: f } = map
  const cells = (x0, y0, x1, y1, pad) => {
    const [ax, ay] = toDev(x0, y1), [bx, by] = toDev(x1, y0)
    return [Math.max(0, Math.floor(Math.min(ax, bx) / f) - pad), Math.max(0, Math.floor(Math.min(ay, by) / f) - pad), Math.min(w - 1, Math.floor(Math.max(ax, bx) / f) + pad), Math.min(h - 1, Math.floor(Math.max(ay, by) / f) + pad)]
  }
  const stay = map.ink.slice()
  const fill = (b, pad, v) => { const [c0, r0, c1, r1] = cells(b[0], b[1], b[2], b[3], pad); for (let r = r0; r <= r1; r++) stay.fill(v, r * w + c0, r * w + c1 + 1) }
  for (const b of accounted) fill(b, 1, 0)
  for (const b of dirty) fill(b, 0, 1)
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
 * `restoring`, `order` (ids whose order a page's units are laid in, in place of layGroups': a recorded run's). `faces`:
 * 'roles' (the role table's) or 'prototype' (the prototype's own).
 * `faceSources(id)`: a promise of the slices the host serves of a role table face, each { url, ranges } (its file on the
 * host's origin and its code points as [start, end] pairs), null where the face is not served, rejected where the host
 * could not say; a face is asked the first time a unit needs it and awaited before the unit is laid. Each slice is one
 * FontFace; a unit whose text has a character in no served slice of its runs' faces and their fallbacks is left the
 * original's, skipped with the why `served`, and one whose slice does not load, `face`. Absent: each face is its whole file at
 * `faceUrl(file)`, covering the face's COVERAGE. The target's body face's first slice is fetched at the open.
 * `faceUrl(file)`, `fontUrl(file)`, `hyphUrl(lang)`: where the host serves the role table's faces (by file name), the
 * prototype's Latin Modern (by name) and TeX's patterns. Nothing is drawn until `until(p)` is awaited.
 * `tex` (the hybrid, tex.mjs): the layout file (`index`, layout/file.mjs indexLayout's), the units file's pieces by unit
 * (`pieces`), and how its geometry is taken (`use`: 'ph', each placeholder's ink alone; 'lines', the unit's lines,
 * label too, its blocks v0's rule's over them; `extents`: 'v0' or 'tex', with 'lines'; `texOnly`: with 'lines', the units the file locates whole
 * that v0's geometry does not hold, but table cells; `symbols`: 'strict' or 'text', locatedWhole's). Each unit the file
 * locates whole takes them; every other unit is v0's own, every rendering proven by the file (tex.mjs proofOf). Null: v0
 * alone, and with `proof` (a reader's paper whose layout file the maker refused or the bundle dropped) every unit still
 * under the proof, no file proving anything: only TeX's own nothing, a space and a text symbol draw, and any other
 * placeholder leaves its unit the original's (`unproven`), so no crop or source text is drawn unproven. Without `proof`
 * (the lab's v0 alone), no proof.
 * `copy`: whether each page's copy is kept at v0's own resolution (`right`), the plane the checker and the gate measure;
 * a view draws the page at its own (drawCopy) and needs none. Without it the original (`left`) is read once, for the page's
 * ink, and its canvas let go as the page is drawn (`left` is null): nothing else reads it, and the checker, which does, is
 * refused.
 * `removal` (the text-removed PDF, removal.mjs and layout/remove.mjs): { mode: 'draw', doc, manifest } (and PDF.js's OPS,
 * which no drawing reads: the gate's instrument reads a page's ink with it):
 * `doc` is arXiv's PDF with the paper's add-on appended (its page sets at the manifest's places), one a paper whatever the
 * target, made from the layout file alone; it may be the `doc` v0 is given, the one document a reader opens (arXiv's own
 * pages the manifest's count). On a page the manifest says is removed, a unit the file locates whole is drawn over the
 * file's own rectangles (removal.mjs fileSwap: its lines' erase rectangles, its inline placeholders' segments, a label it
 * draws in the target's name, less what its reading keeps), filled with paper, or the removed page swapped in where the
 * manifest's `dirty` boxes say kept ink lies under them; its crops are cut from the original through their placeholders'
 * segments (layer2.mjs removalOps). No ink is read and no pixel. A unit v0 reads on its own (the file's miss) is drawn
 * the old way, erased and put back, as on a page the add-on did not remove. Null: v0's own drawing.
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
 * unit (`geometry` its kinds alone), each unit's group (`groups`), the hybrid over a layout index that follows the parts
 * (facade.mjs) and the text removal over a manifest of no page: a page is drawn once a part covers it, a unit placed once its
 * part is in (and its row taken or the rows ended), and every page drawn as the open over the whole paper draws it. A page no
 * part covers once the parts end, or whose drawing throws, fails (`failed`) and is stepped over. `onRetired(doc)`: a document
 * the run read and no longer reads (swap, dispose), told once. `onStep(page)`: a page's step ended (its units laid, or it
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
 */
export async function openProto({ doc, geometry, units: given, expect = null, groups: tableGroups = null, target: to, pages = 999, scale = 1.25, dpr = 1, batch = 8, phMode = 'auto', restoring = true, order: orderIn = null, faces = 'roles', faceSources = null, faceUrl = file => `/fonts/${encodeURIComponent(file)}`, fontUrl, hyphUrl = lang => `/hyph/${lang}.json`, tex = null, proof = false, copy = true, removal = null, labels = null, rules = BUILTIN_RULES, parts: partsMode = false, onRetired = null, onStep = null, onWait = null, free = false, records = true }) {
  if (expect !== null && (!Array.isArray(expect) || !expect.every(id => Number.isSafeInteger(id) && id >= 0))) throw new TypeError(`expect: ids of units or null, not ${kindOf(expect)}`)
  if (tableGroups !== null && !(tableGroups instanceof Map)) throw new TypeError(`groups: a Map of ids to groups or null, not ${kindOf(tableGroups)}`)
  if (faceSources !== null && typeof faceSources !== 'function') throw new TypeError(`faceSources: a function or null, not ${kindOf(faceSources)}`)
  if (partsMode && (!tableGroups || !tex || removal?.mode !== 'draw' || !proof)) throw new TypeError('parts: the open is given each unit\'s table group, the hybrid, the text removal and the proof (the door\'s choices)')
  // (parts: the views and the left come with the parts, grow; the views given are none)
  if (partsMode) geometry = { ...geometry, left: { pages: [], units: [] } }
  // every choice made for the target, in one call: the layout rules' (rules/layout.mjs resolveRules), the built-in set's or
  // the host's: the fit's parameters, the hyphenation patterns, the CJK family, the float labels' names
  const R = resolveRules(rules, to)
  const P = R.params
  /** the paper's \lineskip and \lineskiplimit, TeX's (the layout file's): where a laid line comes nearer the one before it
   *  than the limit, its crops being taller or deeper than its room, it opens as TeX opens one (layer2.mjs breakLines);
   *  null where the file has none, or with no file: no line opens */
  const LINESKIP = tex?.index?.file?.lineskip ?? null
  /** whether a page's units are set together once all are laid (the even pass, the page fill, the leftover packed) */
  const PASSES = !!(P.even || P.adaptiveFill || P.leftover === 'pack')
  /** whether a page may be laid with its closure alone, whatever was laid before it (the 1b-D design §1.4): every pass reads
   *  only its own units' fits and fit-time numbers of a unit running on to it, and a page is painted in its own order at its
   *  passes. Not where the even pass or the leftover's packing reads a unit running on to the page as laid on the page
   *  before (1b-design C1), nor where no pass runs and each unit is painted as it is laid (no adaptive fill): those lay in
   *  the stream's order, the prefix needsOf reads. No built-in rule set is so */
  const ORDER_FREE = PASSES && !P.even && P.leftover !== 'pack'
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
  // (arXiv's own pages: `doc` may be the paper with its add-on appended, one document a reader opens, whose sets follow
  // them: the manifest's count)
  const N = Math.min(removal?.manifest?.pages ?? doc.numPages, doc.numPages, pages)
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
   *  (adaptiveFill's pass) */
  const makeRow = i => {
    const view = geometry.left.pages[i - 1] ?? [0, 0, 612, 792]
    const w = (view[2] - view[0]) * scale, h = (view[3] - view[1]) * scale
    const left = document.createElement('canvas'), right = copy ? document.createElement('canvas') : null
    // (no pixels until the page is drawn, drawPageOn sizes them: a page never drawn holds its row alone, not a canvas's default
    // 300 x 150, which a jump past a paper's pages kept on every page it did not draw)
    for (const c of [left, right]) if (c) { c.width = 0; c.height = 0; c.style.width = `${w}px`; c.style.height = `${h}px` }
    rows[i - 1] = { page: i, left, right, w, h, base: false, ops: [], markup: [], words: null, wordsOpen: null, links: null, linksOpen: null, fill: null }
  }
  if (!partsMode) for (let i = 1; i <= N; i++) makeRow(i)
  const sheet = document.head.appendChild(document.createElement('style'))
  for (const rule of SVG_RULES) sheet.sheet.insertRule(rule, sheet.sheet.cssRules.length)

  const fontClass = new Map(), fontMapped = new Map()
  const fontObj = (page, name) => { try { return page.commonObjs.get(name) } catch { return null } }
  const fontOfPage = (page, styles) => name => {
    let c = fontClass.get(name)
    if (!c) {
      c = classifyFont(fontObj(page, name)?.name ?? '', styles?.[name]?.fontFamily)
      fontClass.set(name, c)
    }
    return c
  }
  // (the characters each font's own map gives its glyphs, layer2.mjs mappedOf: null where it has none to read; a font
  // exported with no map, the document not opened with PDF_OPTIONS, throws: fontMappedOf)
  const mappedOfPage = page => name => {
    if (!fontMapped.has(name)) {
      // (the document's own fault, not the page's: every page of it would fail alike, so the run ends, as a host's bug must show)
      try { fontMapped.set(name, L2.fontMappedOf(fontObj(page, name))) } catch (e) { throw Object.assign(e, { refusesDocument: true }) }
    }
    return fontMapped.get(name)
  }
  const chars2 = [], inks = [], views = [], pageBottom = []

  // the geometry's units with v0's own copy of their line rectangles: v0 grows and moves a unit's lines as it lays it,
  // and every other unit reads them as grown (its others), so the copy is shared by all of v0's reading; the geometry
  // given stays as it was (a second run over it draws as the first: the text removal's plan run and its drawing)
  const GU = geometry.left.units.map(([id, stream, rects]) => [id, stream, rects.map(r => r.slice())])
  const placed = [], skipped = []
  const inGeometry = new Set(GU.map(u => u[0]))
  // the units as they have come (take), by id: none for one not yet arrived, or never to come; and the ids still
  // awaited (expect's, but those given at once)
  const U = new Map()
  given.forEach((u, id) => U.set(id, u))
  const awaited = new Set(expect ?? [])
  const pending = new Set([...awaited].filter(id => U.get(id) === undefined))
  // each unit's table group as the paper's own bundle gives it (groups.mjs groupOf), where the host knows it: a group is
  // then read once its own cells' rows are in, not every row
  const membersOf = new Map()
  if (tableGroups) for (const [id, g] of tableGroups) (membersOf.get(g) ?? membersOf.set(g, []).get(g)).push(id)
  // (parts: the units of a part with no layout, `layout: null`, drawn as with no layout file: read by the file in no way)
  const layoutless = new Set()
  /** whether a unit is read with the layout file: the one place a part's `layout: null` is answered */
  const filed = id => !!tex && !layoutless.has(id)
  const judge = (id, u) => {
    if (!filed(id)) return null
    const lu = tex.index.unit(id)
    const w = locatedWhole(lu, u, tex.pieces.get(id), { symbols: tex.symbols ?? 'text', held: tex.use === 'lines' })
    return w.ok ? { lu, kOf: w.kOf } : { why: w.why }
  }
  const placeOf = (id, stream, rects, u, t) => {
    const onPages = rects.filter(r => r[0] <= N)
    if (!onPages.length) return null
    // (cut: the unit goes on past the pages shown. It is laid over all its lines, those past the pages shown too, and
    // drawn on the pages shown: laid over the lines shown alone, all of its translation was set into them, shrunk to the
    // floor and the rest clipped, though the reader shows its next page as any other (1810.04805's unit 164 on page 12 of
    // 12 shown, 200 characters clipped in each alphabet). Its pages are the pages shown: it is laid when they are drawn)
    return { id, stream, rects, unit: u, blocks: blocksOf(onPages, geometry.left.pages), pages: [...new Set(onPages.map(r => r[0]))], cut: onPages.length < rects.length, tex: t }
  }
  /** a unit the file locates whole, placed by its lines in the file (texRects: the rectangles its exact baselines are by) */
  const placeByFile = (id, stream, u, w) => { const lines = texRects(w.lu); return placeOf(id, stream, lines.rects, u, { ...w, lines }) }
  const translated = u => !!u?.pieces && (u.state === 'whole' || u.state === 'partial')
  const unanchoredOf = (id, u) => ({ id, kind: u.kind, why: 'unanchored', chars: trCharsOf(u) })
  // every unit v0 may place, in the order layGroups takes them (the text's stream): the geometry's, and, with texOnly,
  // the units the file locates whole that v0's geometry does not hold, at their place in the stream after the unit
  // before them, table cells among them (a cell's lines are TeX's, and the text removal takes its glyphs alone, never
  // its table's rules). `cands` in the order the hybrid reports its sources in, K in the stream's
  const cands = GU.map(([id, stream, rects]) => ({ id, stream, rects }))
  if (tex?.texOnly && tex.use === 'lines') {
    const streamOf = new Map(GU.map(([id, stream]) => [id, stream]))
    for (const id of tex.index.file.units.map(r => r[0])) {
      if (inGeometry.has(id)) continue
      let before = -1
      for (const [gid, s] of streamOf) if (gid < id && s > before) before = s
      cands.push({ id, stream: before + 0.5, rects: null })
    }
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
      const lu = tex?.use === 'lines' ? tex.index.unit(c.id) : null
      const from = [c.rects, lu ? texRects(lu).rects : null].filter(Boolean)
      c.lists = from.map(shownOf).filter(l => l.length)
      c.reach = new Set(from.flatMap(rs => rs.map(r => r[0])))
      // (and what Need reads of it besides (need.mjs NeedEntry): its placeholders' pages, its table group; its place in K, and
      // whether it is decided yet)
      c.reads = segPagesOf(c)
      c.group = tableGroups?.get(c.id) ?? null
      // (and the unit before it in K whose last row its first row continues on one of TeX's lines, a shared line (need.mjs
      // rowLeadOf): its lay reads that unit's (layout2's start), which Need lays with it, `follows`; that unit's lay reads that it
      // has one, `followers`)
      c.lead = tex?.use === 'lines' ? rowLeadOf(tex.index, c.id) : null
      c.follows = c.lead && candOf.has(c.lead.id) ? c.lead.id : null
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
    for (const row of (tex ? tex.index.unit(c.id)?.ph?.values() : null) ?? []) for (let o = 0; o + 5 < row.segs.length; o += 6) if (row.segs[o] >= 1 && row.segs[o] <= N) out.add(row.segs[o])
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
    const lu = p.tex?.lu ?? (filed(p.id) ? tex.index.unit(p.id) : null)
    const kOf = p.tex?.kOf ?? (lu ? kOfPieces(p.unit, tex.pieces.get(p.id)) : null)
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
    const placed = LK.placeUnit({ groups: m.groups, lines, edge: (line, run, at) => L2.runEdge(run, at, line, L), band: (t, line) => tokenBand(t, L, line.baseline), scale: L.scale, budget })
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
    chars2[q - 1] = undefined
    inks[q] = pageItems[q] = accounted[q] = keptOf[q] = laid[q] = undefined
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
  const HEAVY = ['prep', 'tokens', 'layout', 'blocks', 'local', 'lead', 'P', 'clear', 'wordOf']
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
    if (shelf) shelf.units.set(p.id, { ...p, tex: p.tex && { ...p.tex } })
    for (const k of HEAVY) p[k] = undefined
    if (p.tex) p.tex.lines = undefined
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
    const lu = tex ? tex.index.unit(id) : null, kind = geometry.kinds?.[id]
    if ((lu && u.kind !== lu.kind) || (kind !== undefined && u.kind !== kind)) return 'row: another kind'
    if (tableGroups && (u.group ?? null) !== (tableGroups.get(id) ?? null)) return 'row: another group'
    if (lu && u.pieces.some(q => q.t !== 'text' && q.k !== undefined && !(Number.isInteger(q.k) && q.k >= 0 && q.k < lu.pieces))) return "row: a k not its source's"
    return null
  }
  const refusedOf = (id, u, why) => ({ id, kind: u.kind, why, chars: shapely(u) ? trCharsOf(u) : 0 })
  /**
   * What v0 makes of a unit once its row is in, before its table's group is read: placed (with the pages it is drawn
   * on and which source its geometry is), or not, and why it is left (`skip`); the hybrid's why a unit placed is v0's
   * (`why`), or the file's why it does not locate one only it holds (`missed`)
   */
  const decide = (c, u) => {
    if (!translated(u)) return { p: null }
    const no = refusalOf(c.id, u)
    if (no) return { p: null, skip: refusedOf(c.id, u, no) }
    if (c.rects) {
      if (u.kind === 'author') return { p: null, skip: { id: c.id, kind: u.kind, why: 'author', chars: trCharsOf(u), pages: [...new Set(c.rects.map(r => r[0]))] } }
      const w = judge(c.id, u)
      let p = null
      if (w?.lu && tex.use === 'lines') {
        // the file's lines, frames and label in place of the anchors' rectangles (v0's where the file's lie past the
        // pages shown and the anchors' do not)
        p = placeByFile(c.id, c.stream, u, w)
        if (!p && (p = placeOf(c.id, c.stream, c.rects, u, null))) w.why = 'pages'
      } else p = placeOf(c.id, c.stream, c.rects, u, w?.lu ? w : null)
      return { p, why: p && w && !p.tex ? w.why : null }
    }
    // (the file's alone: a unit it does not locate whole is left unanchored, as v0's geometry does not hold it)
    if (u.kind === 'author') return { p: null, skip: unanchoredOf(c.id, u) }
    const w = judge(c.id, u)
    if (!w.lu) return { p: null, skip: unanchoredOf(c.id, u), missed: `unanchored, ${w.why}` }
    const p = placeByFile(c.id, c.stream, u, w)
    return { p, skip: p ? null : unanchoredOf(c.id, u) }
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
    const cells = ids.filter(id => translated(U.get(id)))
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
  // original's pixels, so that with no copy the canvas is let go right after (a lazy read would need it for as long)
  const inkOf = pg => inks[pg]
  // each page's characters that a painted unit accounts for (its text, its placeholders drawn elsewhere), and its items
  const accounted = [], keptOf = [], pageItems = []
  const restoreOf = (p, pg) => {
    if (!restoring || !p.prep?.cat) return null
    if (!accounted[pg]) accounted[pg] = new Set()
    const acc = accounted[pg]
    // what any unit keeps stays, whatever another unit says of it (a formula's glyph two units' lines both hold)
    if (!keptOf[pg]) keptOf[pg] = { keys: new Set(), hulls: [] }
    const kept = keptOf[pg]
    const px = pxOf(pg)
    const lines = new Map()
    for (const [key, cat] of p.prep.cat) {
      if (!key.startsWith(`${pg}|`)) continue
      if (cat === 'acc') acc.add(key)
      if (cat === 'keep') kept.keys.add(key)
    }
    for (const c of p.prep.uc ?? []) {
      if (c.page !== pg || c.sep || c.space || !/\S/.test(c.ch) || p.prep.cat.get(L2.charKey(c)) !== 'keep') continue
      const k = c.rect.join()
      if (!lines.has(k)) lines.set(k, [])
      lines.get(k).push(c)
    }
    inkOf(pg)
    for (const cs of lines.values()) {
      // grown over its ink as a crop is (a big bracket's or a radical's hanging part)
      const hull = { crop: [Math.min(...cs.map(c => c.x0)) - 0.5, Math.min(...cs.map(c => (c.ybEff ?? c.yb) - 0.35 * c.size)), Math.max(...cs.map(c => c.x1)) + 0.5, Math.max(...cs.map(c => c.yb + 0.9 * c.size))], gap: { chars: cs } }
      L2.growCrop(hull, inks[pg], px, scale * dpr, p.local?.[pg - 1] ?? chars2[pg - 1])
      const [ax, ay] = px(hull.crop[0], hull.crop[3]), [bx, by] = px(hull.crop[2], hull.crop[1])
      kept.hulls.push([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)])
    }
    pageItems[pg] ??= L2.pageItemsOf(chars2[pg - 1] ?? [], pg, pxOf(pg), inks[pg])
    return { items: pageItems[pg].items, cover: pageItems[pg].cover, ink: inks[pg], accounted: acc, kept }
  }
  // ---- the text-removed PDF (one add-on a paper, made from the layout file: removal.mjs pagePlan). Nothing of the page's
  // ink is read here: a unit's swap is the layout file's own rectangles (its lines' erase, its placeholders' segments,
  // its label), filled with paper where the manifest says nothing kept lies under them, else the removed page swapped in
  const RM = removal ? {
    mode: removal.mode, manifest: removal.manifest ?? null, removed: [], others: [],
    stats: { pages: 0, refused: 0, units: 0, tex: 0, v0: 0, fills: 0, swaps: 0, swapPages: 0, extra: 0, byPage: {}, ms: { render: 0, rects: 0 } },
  } : null
  /** whether page j's text is removed in the add-on (draw mode) */
  const removedPage = j => RM?.mode === 'draw' && !!RM.manifest?.page?.[j]?.ok
  /** page j's page in a set of the add-on: where its manifest entry names it (a compact add-on, which holds the pages it
   *  removes alone), else at the set's fixed place */
  const setPage = (name, j) => RM?.manifest?.page?.[j]?.at?.[name] ?? (RM?.manifest?.sets?.[name] ?? 0) + j
  /** the kept ink under the paper's units' rectangles on page j, by the manifest (x0, y0, x1, y1 each): where a fill would
   *  take it, the removed page is swapped in instead */
  const dirtyOf = j => { const d = RM.manifest.page[j]?.dirty ?? []; const out = []; for (let q = 0; q + 3 < d.length; q += 4) out.push([d[q], d[q + 1], d[q + 2], d[q + 3]]); return out }
  /** what a unit's fill on a page keeps clear of (removal.mjs protection): every other unit's rectangles until it is
   *  drawn there, then those it keeps */
  const guard = RM && tex ? protection(tex.index) : null
  /**
   * A unit's drawing over the text-removed PDF on page pg, from the layout file's rectangles (removal.mjs fileSwap): the
   * rectangles (v0's device pixels) the removed page is swapped into where kept ink lies under them, those filled with
   * paper elsewhere, its crops' clips (its placeholders' segments), and the characters its reading accounts for that the
   * file gives it no rectangle for (erased over their boxes)
   */
  const swapOf = (p, pg) => {
    const t = performance.now()
    // (a name set as its first line's start is its own: replaced with it, and kept clear of no more)
    const nm = p.lead?.nm.page === pg ? p.lead.nm : null
    if (nm) guard.accept(`name:${nm.occurrence}`, pg, [])
    const sw = fileSwap({ page: pg, lu: p.tex.lu, kOf: p.tex.kOf, lines: p.tex.lines, prep: p.prep, others: guard.others(pg, p.id), dirty: dirtyOf(pg), also: nm ? [[nm.x0, nm.bottom, nm.x1, nm.top]] : [] })
    // (drawn there from now: what it replaces no longer kept clear of, what it keeps still)
    guard.accept(p.id, pg, sw.kept)
    const px = pxOf(pg)
    const dev = b => { const [ax, ay] = px(b[0], b[3]), [bx, by] = px(b[2], b[1]); return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)] }
    const clips = new Map([...sw.clips].map(([k, c]) => [k, { rects: c.rects.map(dev), own: c.own.map(dev) }]))
    RM.stats.ms.rects += performance.now() - t
    RM.stats.fills += sw.fill.length
    RM.stats.swaps += sw.swap.length
    RM.stats.extra += sw.extra.length
    return { rects: sw.swap.map(dev), erase: [...sw.fill, ...sw.extra].map(dev), clips, lines: sw.lines }
  }
  /** whether a crop may be cut from page j (S1): a page of the paper whose drawing was read and did not fail, a fact of the
   *  page itself, never whether the host has let it go (its row's `base`): a view cuts it from the page as PDF.js draws it
   *  then (drawCopy), and v0's own copy keeps the page's canvases while a unit on it is still to be painted (release) */
  const hasSource = j => j >= 1 && j <= N && !failedPages.has(j) && views[j - 1] !== undefined
  const sourceOn = (j, plane) => {
    const r = rows[j - 1]
    if (!r?.base) return null
    return plane === 'R' ? RM?.removed[j] ?? null : r.left
  }
  const paint = (p, pg) => withWork(pg, () => paintUnit(p, pg))
  const paintUnit = (p, pg) => {
    // (its links matched and placed at its first paint, its layout final on every page: links.mjs; the drawing reads none of it)
    if (!p.linked) linkUnit(p)
    const tOps = performance.now()
    const r = rows[pg - 1]
    // (what the unit accounts for is counted whichever way it is drawn: a unit drawn the old way after it puts back only
    // what no painted unit accounts for)
    const ro = restoreOf(p, pg)
    let ops = null
    // the text-removed PDF, on a page the add-on removed: a unit the layout file locates whole is drawn over the file's own
    // rectangles (filled with paper, or the removed page swapped in where kept ink lies under them), its crops cut from
    // the original through its placeholders' segments; a unit v0 reads on its own (the file's miss) is drawn the old way,
    // erased and put back. No output needs a plan of its own: the add-on is the paper's
    if (RM?.mode === 'draw' && removedPage(pg)) {
      const here = (RM.stats.byPage[pg] ??= { units: 0, tex: 0, v0: 0 })
      RM.stats.units++
      here.units++
      if (p.tex && p.prep) {
        const sw = swapOf(p, pg)
        ops = L2.removalOps(p.layout, pg, { px: pxOf(pg), k: scale * dpr, hasSource, pxOf, rects: sw.rects, erase: sw.erase, clips: sw.clips, lines: sw.lines, removed: removedPage, audit, id: p.id })
        RM.stats.tex++
        here.tex++
      } else { RM.stats.v0++; here.v0++ }
    }
    // else the unit's drawing as data, and on v0's own copy where it is kept: from the pages drawn now, as v0 drew it
    if (!ops) ops = L2.unitOps(p.layout, p.blocks, pg, { px: pxOf(pg), k: scale * dpr, hasSource, pxOf, extents: p.layout.extents, audit, id: p.id, restore: ro })
    for (const o of ops) r.ops.push(o)
    const tCompose = performance.now()
    if (r.right) L2.drawOps(r.right.getContext('2d'), ops, 1, sourceOn, scale * dpr)
    const tSvg = performance.now()
    r.markup.push(L2.svgOfUnit(p.layout, pg, cssOf(pg), scale, p.id))
    const tWords = performance.now()
    // (the page's word table, beside the markup: the unit's words in the order they are drawn; a page whose table is frozen is final)
    if (!r.words) addUnitWords(r.wordsOpen ??= newWords(), p.layout, pg, p.id, (at, end) => (p.wordOf ??= wordIndexer(plainOfPieces(p.unit.pieces)))(at, end), L2.keptLines(p.rects, p.prep, pg), crop => hasSource(crop.page))
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
  /** a run's style from its characters (the first not a formula's): a class's bold or italic heading, small capitals; its
   *  design the paper's */
  const styleOfChars = cs => {
    const s0 = cs.find(c => c.st?.fam !== 'math')?.st ?? cs[0]?.st ?? {}
    return { fam: s0.fam === 'math' || !s0.fam ? 'serif' : s0.fam, bold: !!s0.bold, italic: !!s0.italic, caps: !!s0.caps, design: s0.design ?? designs.serif }
  }
  /** each unit's lead, by the unit: the name RUN_IN before its first line, its record, its word, style and characters */
  const leadsOf = new Map()
  const paintNames = async pg => {
    if (!tex || !labels) return
    for (const nm of tex.index.names(pg)) {
      const rec = { occurrence: nm.occurrence, key: nm.key, page: pg, drawn: false, why: null, chars: [], box: { x0: nm.x0, x1: nm.x1, baseline: nm.baseline, top: nm.top, bottom: nm.bottom, size: nm.size } }
      names.push(rec)
      const mine = (chars2[pg - 1] ?? []).filter(c => /\S/.test(c.ch) && (c.x0 + c.x1) / 2 >= nm.x0 - 0.5 && (c.x0 + c.x1) / 2 <= nm.x1 + 0.5 && Math.abs(c.yb - nm.baseline) < 0.3 * nm.size)
      if (!mine.length) { rec.why = 'unread'; continue }
      const text = L2.nameInTarget(nm, mine.map(c => c.ch).join(''), R.labels, to)
      if (text === null) { rec.why = !R.labels?.[nm.key] ? 'no word' : 'same'; continue }
      // its style: its characters' (a class's bold or italic heading, small capitals), its design the paper's
      const st = styleOfChars(mine)
      // (leading a unit: that unit's, once it is laid)
      if (nm.unit >= 0) {
        Object.assign(rec, { why: 'inline: its unit not drawn', text, unit: nm.unit })
        leadsOf.set(nm.unit, { nm, rec, text, st, chars: mine.map(c => ({ ...c, page: pg })) })
        continue
      }
      const face = faceOf(st, /[\u2e80-\u9fff\uac00-\ud7af\u3040-\u30ff\uf900-\ufaff]/.test(text) ? 'cjk' : 'latin', to)
      if (FS) {
        const tFonts = performance.now()
        const no = await FS.check([{ face, text }])
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
      const w = L2.widthOf(text, face) * nm.size, mid = (nm.x0 + nm.x1) / 2
      const room = nm.centred ? 2 * Math.min(mid - left, right - mid) : right - nm.x0
      const k = w > room ? room / w : 1
      if (k < P.floorMin - 1e-9) { Object.assign(rec, { why: 'unfit', text, w: r1(w), room: r1(room) }); continue }
      const size = nm.size * k, x = nm.centred ? mid - (w * k) / 2 : nm.x0
      // its ink erased: its characters the unit-like text it is, accounted on the page before any unit is painted there
      const keys = mine.map(c => `${pg}|${c.item}|${c.k}`)
      if (!accounted[pg]) accounted[pg] = new Set()
      for (const key of keys) accounted[pg].add(key)
      const r = rows[pg - 1], px = pxOf(pg), box = [nm.x0, nm.bottom, nm.x1, nm.top], ops = []
      const dev = b => { const [ax, ay] = px(b[0], b[3]), [bx, by] = px(b[2], b[1]); return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)] }
      if (RM?.mode === 'draw' && removedPage(pg) && guard) {
        const self = `name:${nm.occurrence}`, dirty = dirtyOf(pg)
        const meets = (q, d) => d[0] < q[2] && d[2] > q[0] && d[1] < q[3] && d[3] > q[1]
        const swap = [], fill = []
        for (const q of swapRects([box], guard.others(pg, self), SWAP_PAD)) (dirty.some(d => meets(q, d)) ? swap : fill).push(q)
        guard.accept(self, pg, [])
        if (swap.length) ops.push({ op: 'swap', page: pg, rects: swap.map(dev) })
        if (fill.length) ops.push({ op: 'paper', rects: fill.map(dev) })
        const [ax, ay, aw, ah] = dev(box)
        audit?.push({ what: 'erase', unit: -1, name: nm.occurrence, page: pg, box: [ax, ay, ax + aw, ay + ah], swap: true })
      } else {
        const [ax, ay, aw, ah] = dev([nm.x0 - 0.3, nm.bottom - 0.5, nm.x1 + 0.3, nm.top + 0.5])
        ops.push({ op: 'erase', box: [ax, ay, aw, ah] })
        audit?.push({ what: 'erase', unit: -1, name: nm.occurrence, page: pg, box: [ax, ay, ax + aw, ay + ah] })
        if (restoring) {
          if (!keptOf[pg]) keptOf[pg] = { keys: new Set(), hulls: [] }
          inkOf(pg)
          pageItems[pg] ??= L2.pageItemsOf(chars2[pg - 1] ?? [], pg, px, inks[pg])
          const back = L2.restoreUnaccounted([[ax, ay, ax + aw, ay + ah]], px, { items: pageItems[pg].items, cover: pageItems[pg].cover, ink: inks[pg], accounted: accounted[pg], kept: keptOf[pg] }, audit, -1, pg)
          if (back) ops.push(back)
        }
      }
      for (const o of ops) r.ops.push(o)
      if (r.right) L2.drawOps(r.right.getContext('2d'), ops, 1, sourceOn, scale * dpr)
      r.markup.push(L2.svgOfName({ occurrence: nm.occurrence, text, x, baseline: nm.baseline, size, face }, cssOf(pg), scale))
      Object.assign(rec, { drawn: true, text, size: r1(size), x: r1(x), w: r1(w * k), chars: mine.map(c => ({ ...c, page: pg })) })
    }
  }

  // the columns of each page, as its paragraphs' lines span them: a line centred in its column (a caption under its
  // figure, a title over the text) is set centred, whatever the page's own middle (each unit's lines as it is added, addUnits)
  const cols = []
  const centredInColumn = b => {
    const rs = b.rects, list = cols[b.page] ?? []
    const mid = (b.x0 + b.x1) / 2
    const own = list.filter(([a, z]) => a <= mid && z >= mid)
    if (own.length < 3) return false
    const cx0 = Math.min(...own.map(c => c[0])), cx1 = Math.max(...own.map(c => c[1])), cmid = (cx0 + cx1) / 2
    const centres = rs.map(r => (r[1] + r[3]) / 2)
    return centres.every(c => Math.abs(c - cmid) < 2.5) && rs.every(r => r[3] - r[1] < 0.92 * (cx1 - cx0)) && rs[0][1] > cx0 + 4
  }
  // every unit's rectangles by page, for growing a unit's lines over what no other unit holds (with the file's lines of
  // the units the hybrid draws that v0's geometry does not hold, as each is placed)
  // (and a copy of each as it was added, before any unit grew one: what decides whether all of a unit's lines are another's)
  const rectsByPage = new Map(), placedByPage = new Map()
  const addRects = (id, rects) => {
    for (const r of rects) {
      if (!rectsByPage.has(r[0])) { rectsByPage.set(r[0], []); placedByPage.set(r[0], []) }
      rectsByPage.get(r[0]).push([id, r])
      placedByPage.get(r[0]).push([id, r.slice()])
    }
  }
  const textArea = pg => { const rs = (rectsByPage.get(pg) ?? []).map(([, r]) => r); return [Math.min(...rs.map(r => r[1])), Math.max(...rs.map(r => r[3]))] }
  /** the text area of page pg as unit p reads it: as the page's growth step left it once p's own lines there grew (growOn),
   *  the units ranked before it on the page grown and those after it not yet, whenever p is laid */
  const areaOf = (p, pg) => p.area?.get(pg) ?? textArea(pg)
  const columnOf = (b, p) => {
    const mid = (b.x0 + b.x1) / 2
    const own = (cols[b.page] ?? []).filter(([a, z]) => a <= mid && z >= mid)
    return own.length >= 3 ? [Math.min(...own.map(c => c[0])), Math.max(...own.map(c => c[1]))] : areaOf(p, b.page)
  }
  // a single line may run on to its column's edge or the next glyph on its baseline (a heading is as wide as its
  // column, not as its English words); a centred one as far to either side
  const widen = (b, p) => {
    if (b.rects.length !== 1) return
    const r = b.rects[0], yb = b.B[0], size = b.sizes[0]
    const [cx0, cx1] = columnOf(b, p)
    const line = (chars2[b.page - 1] ?? []).filter(c => Math.abs(c.yb - yb) < 0.4 * size && /\S/.test(c.ch))
    const right = Math.min(cx1, ...line.filter(c => c.x0 > r[3] + 6).map(c => c.x0 - 0.5 * size))
    const left = Math.max(cx0, ...line.filter(c => c.x1 < r[1] - 1).map(c => c.x1 + 0.5 * size))
    if (b.centred) {
      const mid = (r[1] + r[3]) / 2, half = Math.min(right - mid, mid - left)
      if (half > (r[3] - r[1]) / 2) { b.x0 = mid - half; b.x1 = mid + half }
    } else if (right > b.x1) b.x1 = right
  }
  /** a CJK table cell's bands between the rules near its lines (layer2.mjs cellBands: the manifest's rules), or null; a
   *  script no taller than Latin is not held, nor a paragraph, whose lines stand by a rule only by chance */
  const clearanceOf = (p, s) => (P.cjk && p.unit.kind === 'cell' ? L2.cellBands(p.blocks, pg => RM?.manifest?.page?.[pg]?.rules, s, P) : null)
  // the free space below a block, down to the first ink in its column or the page's lowest unit line
  const freeFor = (b, s) => {
    const map = inkOf(b.page)
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
    const map = inkOf(b.page)
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
  /** what a unit's drawing takes away on page j, where its own ink may be run over: over the text-removed PDF, the layout
   *  file's rectangles a unit it locates whole replaces (its lines' erase rectangles, its inline placeholders'
   *  segments), all that it removes; drawn the old way, its lines' erase extents. A rule beside its text that an erase
   *  extent reaches (a table's column rule) stays on the removed page, and a slot run over it is drawn over it */
  const ownInk = (p, j) => {
    if (p.tex && removedPage(j)) {
      const lu = p.tex.lu, out = []
      for (let l = 0; l < lu.erase.length; l++) { const e = lu.erase[l]; if (!e || lu.lines[8 * l] !== j) continue; for (let o = 0; o + 3 < e.length; o += 4) out.push([e[o], e[o + 1], e[o + 2], e[o + 3]]) }
      for (const row of lu.ph.values()) { if (row.kind === 'display') continue; for (let o = 0; o + 5 < row.segs.length; o += 6) if (row.segs[o] === j) out.push([row.segs[o + 1], row.segs[o + 5], row.segs[o + 3], row.segs[o + 4]]) }
      return out
    }
    return [...(p.prep.extents ?? new Map())].filter(([r]) => r[0] === j).flatMap(([, e]) => (Array.isArray(e[0]) ? e : [e]))
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
    // (its first page as placed, before any of its lines is dropped: where its first line is read, L4)
    p.firstPage = p.rects[0]?.[0]
    Object.assign(p, { local: [], dropped: 0, grown: 0, area: new Map(), grew: new Set() })
    for (const g of p.linePages) (onPage.get(g) ?? onPage.set(g, []).get(g)).push(p)
  }
  const overlap = (a, b) => Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])) * Math.max(0, Math.min(a[4], b[4]) - Math.max(a[2], b[2]))
  const covered = (r, o) => overlap(r, o) > 0.5 * (r[3] - r[1]) * (r[4] - r[2])
  /** unit p's lines on page g dropped and grown, reading that page alone; the page's text area as they leave it kept for p */
  const growOn = (p, g) => {
    const others = []
    others[g] = (rectsByPage.get(g) ?? []).filter(([id]) => id !== p.id).map(([, r]) => r)
    // (the file's lines are the unit's own, whole, and its first line starts at the unit's own mark: none of the
    // anchors' repairs of which lines are the unit's or where it starts; but a line's extent across is its words', as the
    // anchors' is (the maker's rows are the text layer's word tokens'), and is grown as v0 grows them, over a formula's
    // tail and a justified line's last glyphs: 1512.03385 page 10's "(mAP @" and "IoU =", whose "@" and "=" were put back
    // under the translation)
    const fileLines = !!p.tex?.lines
    // a line another unit's rectangle mostly covers is that unit's (the anchors carried a mark to the wrong column:
    // 1512.03385 page 3, a paragraph's last lines laid over the next column's): left out, on each page by the others'
    // rectangles there as they stand, unless every line of the unit is another's, which keeps them all (then nothing says
    // which are its own). That is decided once, by the rectangles as they were placed, before any unit grew one (the rows on
    // the unit's own pages alone, so no page's growth waits on another's), and is the whole unit's as before wherever the
    // others' growth makes none of its lines another's that was not. What growth does and does not stop at: a line grows
    // sideways character by character and stops at one inside another unit's rectangle (`foreign`, extendRects and
    // extendRects2's loops), but it is also taken to the end of a text item that ends less than 8 pt past it, or to the end of
    // the word it ends in, whatever stands there (extendRects2 checks no `foreign` for that), and a block's far-in first line
    // is moved to the block's edge unless another unit's line overlaps it by more than half its height (extendFirstLines).
    // Where growth would still leave a unit no line, the unit is the original's (layout2). Its pages stay as they
    // were counted: a page it no longer holds lines on is painted with nothing
    if (!fileLines) {
      p.keepAll ??= p.rects.every(r => (placedByPage.get(r[0]) ?? []).some(([id, o]) => id !== p.id && covered(r, o)))
      const gone = p.keepAll ? null : new Set(p.rects.filter(r => r[0] === g && others[g].some(o => covered(r, o))))
      if (gone?.size) { p.rects = p.rects.filter(r => !gone.has(r)); p.dropped += gone.size }
    }
    const rs = p.rects.filter(r => r[0] === g), shown = p.pages.includes(g)
    // iteration 3: the unit's own part of the page (its rectangles' box, 20 pt above and below, 60 pt to either side), one
    // pass over the page, for every search below (each scanned the whole page, rectangle by rectangle)
    let win = null
    if (shown) {
      win = [Math.min(...rs.map(r => r[1])) - 60, Math.max(...rs.map(r => r[3])) + 60, Math.min(...rs.map(r => r[2])) - 20, Math.max(...rs.map(r => r[4])) + 20]
      const [x0, x1, y0, y1] = win
      p.local[g - 1] = (chars2[g - 1] ?? []).filter(c => c.x1 >= x0 && c.x0 <= x1 && c.yb >= y0 && c.yb <= y1)
    }
    // iteration 3: a block's far-in first line from its block's edge, and lines over what stands beside them, before the
    // unit is aligned (what they then hold is the unit's)
    if (!fileLines) L2.extendFirstLines(rs, geometry.left.pages, others)
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
    // its first line's edge snapped back to its first word's start, on its first page as placed alone (L4)
    if (!fileLines && g === p.firstPage && p.rects[0]?.[0] === g) p.inkBefore = L2.snapFirstRect2(p.rects, p.local)
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
  const layout2 = async p => {
    const t0 = lap()
    // the unit's lines dropped where they are another unit's, grown over words the anchors left out beside them, and its
    // first line's edge snapped back to its first word's start: its pages' growth steps (growOn)
    growTo(p)
    if (p.stepError) throw p.stepError
    // (none of its lines left: every one another unit's once theirs grew, though not as placed (growOn); the unit is the
    // original's, where the whole unit's rule kept them all)
    if (!p.rects.length) { p.refused = true; p.why = 'unfit'; unlead(p); return }
    const fileLines = !!p.tex?.lines, local = p.local, inkBefore = p.inkBefore
    // the hybrid: a unit the file locates whole read with the file's parts; any other, v0's reading, each rendering proven
    // by the file (proofOf: a crop cut from its placeholder's own ink, page text in its segments), or the unit left the
    // original's where the file proves one not; a unit of a part with no layout as with no file (filed), through the same proof
    const parts = p.tex ? texParts(p.tex.lu, p.tex.kOf, { use: tex.use, lines: p.tex.lines, extents: tex.extents ?? 'v0', shown: N, lineskip: LINESKIP }) : filed(p.id) ? { proof: proofOf(tex.index.unit(p.id), kOfPieces(p.unit, tex.pieces.get(p.id)), N) } : proof ? { proof: proofOf(null, null, N) } : null
    // (the citations and macros its renderings teach are the unit's own, learnt as it is read: a later placeholder of the
    // unit reads its earlier ones, never another unit's, S2. The paper's, learnt in lay order, made a unit's reading a
    // function of every unit laid before it; no unit of the 30 outputs is read otherwise without it, 2026-10-15)
    const prep = L2.prepareUnit(p.unit, p.rects, local, phMode === 'source' ? null : new Map(), null, parts)
    if (prep.unproven !== undefined) { p.refused = true; p.why = 'unproven'; unlead(p); return }
    // a float's label in the target's name where the final names it so (labelInTarget): its ink erased and accounted as
    // the unit's text, and set as the line's start, in its own style, before the translation
    const relabel = labels ? L2.labelInTarget(prep.label, R.labels, labels.captions, to) : null
    if (relabel) {
      prep.label = { ...prep.label, drawn: relabel }
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
    if (ld && p.rects[0]?.[0] === ld.nm.page) {
      const nameKeys = new Set(ld.chars.map(L2.charKey)), lb = tex.index.unit(p.id)?.labels ?? [], pg = ld.nm.page
      const joint = []
      for (let o = 0; o + 6 < lb.length; o += 7) {
        if (lb[o + 1] !== pg) continue
        const x0 = lb[o + 2], x1 = lb[o + 4], top = lb[o + 5], bottom = lb[o + 6]
        for (const c of chars2[pg - 1] ?? []) if (/\S/.test(c.ch) && (c.x0 + c.x1) / 2 >= x0 - 0.5 && (c.x0 + c.x1) / 2 <= x1 + 0.5 && c.yb >= bottom - 0.5 && c.yb <= top + 0.5 && !nameKeys.has(L2.charKey({ ...c, page: pg }))) joint.push({ ...c, page: pg })
      }
      joint.sort((a, b) => a.x0 - b.x0)
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
    // iteration 3: each crop over the ink it touches (its page's ink map)
    for (const r of prep.values()) {
      if (r?.mode !== 'crop') continue
      L2.growCrop(r, inkOf(r.page), pxOf(r.page), scale * dpr, local[r.page - 1] ?? chars2[r.page - 1])
    }
    const t1 = lap()
    const orig = prep.orig
    const s = orig?.size ?? median(p.rects.map(r => r[4] - r[2])) / 0.894
    const base = orig && orig.st.fam !== 'math' ? { ...orig.st } : { fam: 'serif', bold: p.unit.kind === 'heading', italic: false, caps: false, design: designs.serif }
    const keep = prep.keep?.length ? new Set(prep.keep) : null
    p.blocks = L2.blocks2(p.rects, geometry.left.pages, keep, prep.lineInfo, prep.regionOf, prep.referenced, filed(p.id) ? LINESKIP : null, prep.breakAt, prep.joinAt)
    for (const b of p.blocks) if (!b.centred && centredInColumn(b)) b.centred = true
    if (p.unit.kind !== 'cell') for (const b of p.blocks) widen(b, p)
    // a label the first line starts with stays the original's: the line starts after it. A file's first line starts at
    // the unit's own mark, and so where the original's text does: after a label the file sets apart, at the line's own
    // start; after one it holds (a footnote's mark), where its first word is, never before the label's end (v0's quarter
    // of an em after it set a footnote's text 1.7 pt right of the original's)
    if (prep.label && !prep.label.drawn && p.blocks[0]) {
      const b = p.blocks[0]
      if (!fileLines) b.indent = Math.max(b.indent, prep.label.x1 + 0.25 * s - b.x0)
      else if (prep.label.x1 > p.rects[0][1] + 0.1) b.indent = Math.max(b.indent, (prep.firstX0 !== undefined && prep.firstX0 > prep.label.x1 ? prep.firstX0 : prep.label.x1 + 0.25 * s) - b.x0)
    }
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
    const row = fileLines ? candOf.get(p.id)?.lead : null
    if (row && p.blocks[0] && !p.blocks[0].centred && p.blocks[0].page === row.page && Math.abs(p.blocks[0].B[0] - row.baseline) < 0.05) {
      const b = p.blocks[0], a = byId.get(row.id), share = a && !a.refused ? a.share ?? null : null, x = b.x0 + b.indent
      const between = (chars2[b.page - 1] ?? []).some(c => /\S/.test(c.ch) && (c.x0 + c.x1) / 2 > row.x1 + 0.1 && (c.x0 + c.x1) / 2 < x - 0.1 && Math.abs(c.yb - row.baseline) < 0.4 * row.size)
      if (share && !between) {
        b.start = share.end !== null ? share.end + Math.max(0, x - row.x1) : row.x0
        if (share.end !== null && Math.abs(share.at - b.B[0]) >= 0.05) b.startY = share.at
      }
    }
    if (P.borrow && p.unit.kind !== 'cell') for (const b of p.blocks) b.freeOf = () => freeFor(b, s)
    const t2 = lap()
    // (the label's own style: a class's bold or italic label)
    const lead = prep.lead ?? (prep.label?.drawn ? { parts: [{ text: prep.label.drawn, st: (st => (st && st.fam !== 'math' ? { bold: !!st.bold, italic: !!st.italic } : {}))(prep.label.chars[0]?.st) }] } : null)
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
    p.workMark = markWork()
    const tokens = L2.tokensOf2(p.unit, prep, to, base, designs, P, lead, undefined, true)
    const t3 = lap()
    // (the unit's leading relative to the original's own pitch, step 3: leadOf)
    p.tokens = tokens
    p.prep = prep
    p.s = s
    p.P = { ...P, leadBase: L2.leadOf(p.blocks, s, P), trackStart: P.trackStart ?? cjkAdvance(), lineskip: filed(p.id) ? LINESKIP : null }
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
    p.layout = L2.layoutUnit2(tokens, p.blocks, s, p.P)
    // (step 3: never drawn in part: given more room where the page has it, else left the original's, whole)
    if (p.layout.clipped) {
      const further = fitFurther(p, tokens, s)
      if (further) { p.layout = further.layout; p.blocks = further.blocks; if (further.P) { p.P = further.P; p.clear = further.clear } }
      else { p.refused = true; unlead(p); return }
    }
    settleLayout(p)
    // (a unit whose last row another unit's first continues on a shared line: where its translation ends on that row, which
    // that unit is laid from, and which its page's fill keeps)
    if (followers.has(p.id)) { const r = candOf.get(followers.get(p.id))?.lead; p.share = r ? L2.shareOf(p.layout, p.blocks, r) : null }
    const t4 = lap()
    p.layout.extents = new Map([...prep.extents].map(([r, e]) => [r.join(), e]))
    if (p.blocks[0] && (prep.label || prep.firstX0 !== undefined || inkBefore !== undefined)) {
      const r0 = p.blocks[0].rects[0], ext = p.layout.extents.get(r0.join()) ?? r0.slice(1)
      // (an extent of several boxes, the file's: its first)
      const multi = Array.isArray(ext[0]), e = multi ? ext[0] : ext
      if (e) {
        let x0 = prep.firstX0 !== undefined ? Math.min(e[0], prep.firstX0 - 0.2) : e[0]
        // from right after the ink before it (a label), but never more than 2 pt before the line's own first word
        if (inkBefore !== undefined) x0 = Math.min(x0, Math.max(inkBefore + 0.5, (prep.firstX0 ?? e[0]) - 2))
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
      record(p, { ...(tex ? { source: p.tex ? 'tex' : 'v0' } : {}), grown: p.grown, dropped: p.dropped, s, f: p.layout.f, fitScale: p.layout.scale, knob: p.layout.knob, clipped: p.layout.clipped, opened: p.layout.opened, unopened: p.layout.unopened, lostChars: p.layout.lostChars, chars: p.layout.chars, lead: p.layout.state.lead, track: p.layout.state.track || p.layout.state.trackLatin, compress: p.layout.state.compress, borrow: p.layout.state.borrow, free: r1(Math.max(0, ...p.blocks.map(b => b.free))), tried: p.layout.tried, lines, orig, drawnRuns: L2.drawnRuns(tokens), drawnBase: styleKey(tokens.base), trChars: tr.reduce((a, t) => a + [...t.s].length, 0), trDrawn: p.layout.lines.reduce((a, l) => a + l.items.reduce((b, it) => b + (it.t.s && !it.t.ph && !it.t.sup ? [...it.t.s].length - (it.t.hyphenated ? 1 : 0) : 0), 0), 0), modes: modesOf(prep), unused: drawnTok.size, ms: [r1(t1 - t0), r1(t2 - t1), r1(t3 - t2), r1(t4 - t3)], tokens: tokens.length })
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
    const r = fillPage(begun, P, (p, target) => {
      const l = p.layout
      if (p.rec) Object.assign(p.rec, { f: r1(l.f), sizeRatio: r1(l.f / p.s), fitScale: l.scale, knob: l.knob === 'none' ? 'fill' : l.knob, opened: l.opened, unopened: l.unopened, lead: l.state.lead, track: l.state.track, lines: recLinesOf(p), fill: { target, lead: p.fillLead } })
    }, { continuing: laid[pg].filter(p => p.fillable && !p.refused && p.pages[0] !== pg) })
    // (the page's fill numbers, kept with its record)
    rows[pg - 1].fill = r && { own: r.own, anchor: r.anchor, target: r.target, body: r.body }
  }
  // the leftover packed (packPage) over a page's units laid, each moved unit's record updated
  const packPass = pg => {
    // (the ink that stays, by the page's ink map: no move is made on a page whose map is not read)
    const map = inkOf(pg), dev = pxOf(pg), vw = views[pg - 1]
    const accounted = []
    // (a table's cell may be withheld with its group after this pass: its glyphs are not taken as gone)
    for (const p of laid[pg]) {
      if (p.refused || p.unit.kind === 'cell' || !p.prep?.cat) continue
      for (const c of p.prep.uc ?? []) if (c.page === pg && !c.sep && !c.space && p.prep.cat.get(L2.charKey(c)) === 'acc') accounted.push([c.x0, c.yb - 0.25 * c.size, c.x1, c.yb + 0.88 * c.size])
      for (const c of p.lead?.chars ?? []) if (c.page === pg) accounted.push([c.x0, c.yb - 0.25 * c.size, c.x1, c.yb + 0.88 * c.size])
    }
    const stays = map ? stayingInk({ map, toDev: dev, toPdf: (x, y) => vw.convertToPdfPoint(x / dpr, y / dpr), accounted, dirty: removedPage(pg) ? dirtyOf(pg) : [] }) : () => -Infinity
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
    skipped.push({ id: p.id, kind: p.unit.kind, why: `group: ${why}`, chars: trCharsOf(p.unit), pages: p.pages })
  }
  /** group g decided once every cell of it is laid: withheld, or to be painted whole (true) */
  const settleGroup = g => {
    const laidCells = groupLaid.get(g)
    if (!laidCells || laidCells.done || laidCells.list.length < groupCells.get(g).length) return false
    laidCells.done = true
    const pages = new Set(laidCells.list.flatMap(p => p.pages))
    // (and over the text-removed PDF, a cell on a page the remover refused: it could only be erased)
    const why = pages.size > 1 ? 'on two pages' : laidCells.list.some(p => p.refused || p.layout.clipped) ? 'a cell unfit' : RM?.mode === 'draw' && [...pages].some(pg => RM.manifest?.page?.[pg] && !removedPage(pg)) ? 'its page not removed' : null
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
    const done = (paintedOn[q] ??= new Set())
    for (const f of partsOf(q)) {
      if (done.has(f)) continue
      if (!passed[f]) break
      done.add(f)
      for (const u of passOrder[f]) if (u.pages.includes(q)) paint(u, q)
      for (const g of settledAt[f]) paintGroup(g, q)
    }
  }
  /** whether unit u's part of page q (its first page's) is painted */
  const partPainted = (u, q) => !!paintedOn[q]?.has(u.pages[0])
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
    if (p.workMark) { if (!disposed) chargeWork(p.pages[0], p.workMark); p.workMark = null }
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
    if (p.refused) skipped.push({ id: p.id, kind: p.unit.kind, why: p.why ?? 'unfit', ...(p.missing ? { missing: p.missing } : {}), chars: trCharsOf(p.unit), pages: p.pages })
    const g = p.unit.group && groupCells.has(p.unit.group) ? p.unit.group : null
    // (each list a page's or a group's units laid, in their rank whatever order they were laid in (L3): a pass paints in it)
    if (g) byRank((groupLaid.get(g) ?? groupLaid.set(g, { list: [], done: false }).get(g)).list, p)
    for (const pg of p.pages) touched.add(pg)
    if (PASSES) {
      // (its fill leading is its fit's, fixed now (fillLeadsOf). With the even pass, which lays the units of a page anew before
      // the fill, the fill leading of a unit on its own first page is the pass's, as it was (fillPass), and `fit` keeps the
      // fit's, which is all a page it runs on to reads of it: no page's target then reads another page's even pass)
      if (P.adaptiveFill && p.fillable && !p.refused) {
        fillLeadsOf(p, P)
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
  const timesOf = pg => (pageTimes[pg] ??= { render: 0, text: 0, ink: 0, rp: 0, lay: 0, fonts: 0, ops: 0, compose: 0, svg: 0, words: 0, links: 0 })
  // the deterministic work a page cost (work.mjs: integer counts, no clock), by page, as pageTimes is. Charged over stretches of
  // synchronous code, so that a page's counts are the same whatever the order pages were asked in and however the tasks
  // interleaved; `inWork` keeps a stretch inside another from being charged twice. Nothing the drawing reads
  const pageWork = []
  const workOf = pg => (pageWork[pg] ??= newWork())
  let inWork = false
  const chargeWork = (pg, m) => { const w = workOf(pg); for (const k of WORK_KEYS) w[k] += work[k] - m[k] }
  const withWork = (pg, f) => {
    if (inWork) return f()
    inWork = true
    const m = markWork()
    try { return f() } finally { inWork = false; chargeWork(pg, m) }
  }
  // the documents read: the original (`doc`) and the text-removed one (`removal.doc`, often the same). Under parts the newest
  // composed document, swapped at a part with a tail (swap); each read of a page holds its document (using), and one no longer
  // the newest is told to the host (onRetired) once no read holds it, the newest at dispose: each once, none destroyed here
  let D = doc, RD = removal?.doc ?? null
  // (`retired` weakly: it only says a document was told already, and a strong set would keep every document the host has since destroyed, with its pages, for the run's length)
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
  const drawPage = i => { const d = D, rd = RD; return using([d, rd], () => drawPageOn(i, d, rd)) }
  const drawPageOn = async (i, d, rd) => {
    const tPage = performance.now()
    const page = await d.getPage(i)
    const r = rows[i - 1]
    try {
      const viewport = page.getViewport({ scale })
      views[i - 1] = viewport
      r.left.width = Math.floor(viewport.width * dpr)
      r.left.height = Math.floor(viewport.height * dpr)
      if (r.right) { r.right.width = r.left.width; r.right.height = r.left.height }
      r.view = page.view
      const textP = page.getTextContent()
      await page.render({ canvas: r.left, canvasContext: r.left.getContext('2d'), viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise
      const tRendered = performance.now()
      // (the page's links, asked once the render is done so that the worker does not parse them ahead of it: one more round trip,
      // read before the page is cleaned up)
      const annP = LK.readAnnots(page)
      timesOf(i).render += tRendered - tPage
      const tc = await textP
      if (i === 1 && lmP) await lmP
      const fontOf = fontOfPage(page, tc.styles)
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
      chars2[i - 1] = L2.pageChars2(tc, fontOf, mappedOfPage(page))
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
    } finally {
      // (its pixels and characters read, or the read thrown: nothing reads the proxy's rendering state again (lp item 2), a
      // view's copy renders the page anew (renderAt), and PDF.js keeps the state of a render still under way to the end)
      page.cleanup()
    }
    if (shelf) shelf.chars[i - 1] = chars2[i - 1]
    r.right?.getContext('2d').drawImage(r.left, 0, 0)
    r.base = true
    if (RM) {
      if (removedPage(i)) {
        RM.stats.pages++
        // its removed page, where v0 keeps a copy of its own (the gate's) and the manifest has kept ink under a unit's
        // rectangles there: a view draws it at its own resolution, drawCopy, and only where a swap asks for it
        if (copy && RM.manifest.page[i]?.dirty?.length) {
          const t = performance.now()
          const pg = await rd.getPage(setPage('R', i))
          const c = document.createElement('canvas')
          c.width = r.left.width
          c.height = r.left.height
          try { await pg.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: pg.getViewport({ scale }), transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise } finally { pg.cleanup() }
          RM.removed[i] = c
          RM.stats.swapPages++
          RM.stats.ms.render += performance.now() - t
          timesOf(i).rp += performance.now() - t
        }
      } else if (RM.mode === 'draw') RM.stats.refused++
    }
    // (let go while the page was drawn: its canvases are gone, so there is no ink to read, and the roles and faces every run
    // shares are a newer layer's to set)
    if (disposed) return
    // the page's ink, read now whatever the rules are: units that borrow below, widen over paper and grow a crop read it, on
    // their own page and, for a crop, on the page it is cut from
    inks[i] = L2.inkMapOf(r.left)
    workOf(i).inkSteps += inks[i].w * inks[i].h
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
  // order the hybrid reports its sources in)
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
      if (split.has(u.group)) { skipped.push({ id: p.id, kind: u.kind, why: 'group: a cell not drawn', chars: trCharsOf(u), pages: p.pages }); p = null }
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
    U.forEach((u, id) => { if (!translated(u) || candOf.has(id)) return; const no = refusalOf(id, u); skipped.push(no ? refusedOf(id, u, no) : unanchoredOf(id, u)) })
  }
  /** whether laying page p waits for nothing more to come, neither a part nor a row (the 1b-D design §2.1): the parts cover
   *  its closure's bound, or have ended, and every entry it decides is in K and decided or settleable */
  const inputsOf = p => {
    const C = closure(p)
    if (!partsEnded && through < C.bound) return false
    for (const i of C.rows) { if (i >= K.length) return false; const c = K[i]; if (!c.decided && !settleable(c)) return false }
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
  /**
   * Page p's closure laid (the 1b-D design §2.1): page 1 drawn first; then, the closure taken again after every wait (a part
   * may grow it), its pages drawn in order, its rows decided in the stream's order as each is in, and once the parts cover it
   * and its rows are in, its units laid in their rank, back to back in slices (`slices`, SLICE_MS) (each unit's pages, and its
   * placeholders', drawn before it is: in order too, L2). A unit on a page that failed is left the original's, why `page`, and
   * the closure goes on, p's own failure too. Each page told as it is ready or failed (onStep). It ends once p is ready or failed, or `still` (read at every
   * wait, between pages and between units) is false: what is done stays done, each step having run on complete inputs, and
   * the next closure takes it up from there
   */
  const layIn = async (p, still) => {
    if (disposed || readyOf(p)) return
    const t0 = performance.now()
    let waited = 0
    const wait = async what => { const t = performance.now(); await waitFor(what); waited += performance.now() - t }
    const ms = () => performance.now() - t0 - waited
    if (partsEnded && p > through) { failedPages.add(p); touched.add(p); report(ms); return }
    for (;;) {
      if (disposed || !still()) return
      if (!(await drawOne(1, still, wait))) return
      report(ms)
      const C = closure(p)
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
      if (missing) { report(ms); if (!still()) return; await wait(missing); continue }
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
      // pages' rank's, whichever is laid first, and its lay reads nothing of the units after it)
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
  // a page as PDF.js draws it at k device pixels a PDF unit: drawCopy's source of another page's crop
  // (from the newest document: it holds every earlier tail)
  const renderAt = (pg, k, plane = 'O') => { const d = plane === 'O' ? D : RD; return using([d], async () => {
    const page = plane === 'O' ? await d.getPage(pg) : await d.getPage(setPage(plane, pg))
    const viewport = page.getViewport({ scale: k })
    const c = document.createElement('canvas')
    c.width = Math.ceil(viewport.width)
    c.height = Math.ceil(viewport.height)
    // (drawn, the page's rendering state let go: lp item 2)
    try { await page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport }).promise } finally { page.cleanup() }
    return c
  }) }
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
    if (RM) { for (const c of RM.removed) if (c) { c.width = 0; c.height = 0 }; RM.removed = []; RM.others = [] }
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
     * the page (`chars`, `ink`, `items`, `accounted`, `kept`, `laid`, and `canvas` and `removed`, a copy's), the units on it
     * still holding their own state, and the units still to be laid that read it (`reads`)
     */
    held(pg) {
      if (pg === undefined) return { free, records, shelf: !!shelf }
      const r = rows[pg - 1]
      const state = Object.entries({ chars: chars2[pg - 1], ink: inks[pg], items: pageItems[pg], accounted: accounted[pg], kept: keptOf[pg], laid: laid[pg], canvas: r?.left ?? r?.right, removed: RM?.removed[pg] }).filter(([, v]) => v).map(([k]) => k)
      const units = [...byId.values()].filter(u => u.pages.includes(pg) && (HEAVY.some(k => u[k] !== undefined) || !!u.tex?.lines)).map(u => u.id)
      return { state, units, reads: reads[pg] ?? 0 }
    },
    /** a placed unit as it was laid: the shelf's where the run let it go (`free` and `records`), else the unit itself */
    full: p => shelf?.units.get(p.id) ?? p,
    /** the layout rule set the run was opened with (rules/layout.mjs): its schema and version */
    rules: { schema: RULES_SCHEMA, version: R.version },
    get designs() { return designs },
    /** the hybrid's: each placed unit's source, in the order of the geometry's units then the file's alone, and why the
     *  units placed by v0's geometry are (and those only the file holds it does not locate whole) */
    get sources() {
      const out = { tex: [], v0: [], why: {} }
      if (!tex) return out
      let only = 0
      for (const c of cands) {
        const d = fixed.has(c.id) ? decisions.get(c.id)?.d : null
        if (!d) continue
        const why = c.rects ? d.why : d.missed
        if (why) out.why[why] = (out.why[why] ?? 0) + 1
        if (!c.rects && d.p) only++
        if (byId.has(c.id)) (byId.get(c.id).tex ? out.tex : out.v0).push(c.id)
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
     * merged into the hybrid's index by the host before (facade.mjs). The views of the pages it tells first and their rows;
     * its manifest's entries; its units added to the stream after the last told, in (slot, id) order (a left unit at its
     * stream, its rectangles copied; a file-only one at `after` + 0.5, never worked out again); those of a part with no layout
     * read as with no layout file (`filed`). The pages it covers can be drawn; with the rows ended its units are placed at
     * once. Sync, and nothing checked again: the host's readPart and the door have
     */
    grow(part) {
      const [a, b] = part.pages
      for (let q = a; q <= part.reach; q++) {
        if (geometry.left.pages[q - 1] === undefined) geometry.left.pages[q - 1] = part.views.slice(4 * (q - a), 4 * (q - a + 1))
        if (!rows[q - 1]) makeRow(q)
      }
      if (part.addon) Object.assign(RM.manifest.page, part.addon.manifest.page)
      const entries = part.left.map(([id, stream, rects]) => ({ id, stream, rects: rects.map(r => r.slice()) }))
      if (tex.texOnly && tex.use === 'lines') for (const [id, after] of part.fileOnly) entries.push({ id, stream: after + 0.5, rects: null })
      entries.sort((x, y) => x.stream - y.stream || x.id - y.id)
      if (part.layout === null) for (const [id] of part.left) layoutless.add(id)
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
    /** the newest composed document (a part with a tail): read from now on, the one it replaces told to `onRetired` once no
     *  read holds it */
    swap(next) {
      if (next === D) return
      const old = D
      if (RD === D) RD = next
      D = next
      retire(old)
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
     * before it until the unit is placed; a translated row's pieces' k read into the hybrid's pieces (trPiecesOf: the
     * units file's TrPiece). A row that can no longer change the drawing is late (late()); one no unit of this paper's
     * is left the original's (refusalOf). Returns the pages newly complete: those not reported complete before.
     */
    take(rows) {
      const list = [...rows]
      for (const [id, row] of list) if (!Number.isSafeInteger(id) || id < 0 || row === null || typeof row !== 'object') throw new TypeError(`take: a row is [id, unit], not [${kindOf(id)}, ${kindOf(row)}]`)
      for (const [id, row] of list) {
        if (ended || frozenAll || fixed.has(id) || !awaited.has(id)) { late.add(id); continue }
        U.set(id, row)
        pending.delete(id)
        // (the hybrid's pieces, as the units file holds them: a translated unit's alone)
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
     * Page `pg`'s copy at a view's own resolution, `k` device pixels a PDF unit (its CSS px a unit × its device pixel
     * ratio × its zoom), once its units are painted (until): onto `ctx`, a canvas of the page at k, the page as PDF.js
     * drew it at k (`source`, left untouched), then the page's drawing (its units' operations in the order v0 painted
     * them) scaled to k, its restores and crops cut from `source` and, for a crop of another page, from that page drawn
     * by PDF.js at k here. At any k and as often as the zoom changes, a page let go too: nothing of v0's own canvases is
     * drawn, so that a table, a figure, a kept line and a crop are as sharp as the original at every zoom.
     */
    async drawCopy(pg, ctx, source, k) {
      const r = rows[pg - 1]
      // every page and plane the drawing cuts from but this page's own original (`source`): the removed page a swap takes
      // from, and the other pages a crop takes from
      const others = new Map()
      const need = (j, plane) => { const key = `${plane}${j}`; if (!(plane === 'O' && j === pg) && !others.has(key)) others.set(key, [j, plane]) }
      for (const o of r.ops) { if (o.op === 'swap') need(o.page, 'R'); else if (o.op === 'crop') need(o.page, o.plane ?? 'O') }
      // (let go while it reads: no document read after, a retired one among them, and nothing drawn)
      const rendered = []
      for (const [key, [j, plane]] of others) {
        if (disposed) { for (const c of rendered) { c.width = 0; c.height = 0 } return }
        const c = await renderAt(j, k, plane)
        rendered.push(c)
        others.set(key, c)
      }
      if (disposed) { for (const c of rendered) { c.width = 0; c.height = 0 } return }
      ctx.drawImage(source, 0, 0)
      L2.drawOps(ctx, r.ops, k / (scale * dpr), (j, plane = 'O') => (j === pg && plane === 'O' ? source : (others.get(`${plane}${j}`) ?? null)), k)
      for (const c of others.values()) { c.width = 0; c.height = 0 }
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
      for (const c of [r.left, r.right, RM?.removed[pg]]) if (c) { c.width = 0; c.height = 0 }
      if (RM) for (const k of ['removed', 'others']) RM[k][pg] = undefined
      r.base = false
      r.released = true
    },
    /** the run let go: its sheet removed, every page's canvases released (a page under way when it is called, once it ends),
     *  nothing drawn or laid after; an until under way resolves. Its pages' records stay with whoever holds them */
    dispose() {
      if (disposed) return
      disposed = true
      sheet.remove()
      letGo()
      changed()
      busy.then(letGo, letGo)
      // (the documents it reads, told to the host once no read holds them)
      retire(D)
      retire(RD)
    },
    /** the deterministic work counters (work.mjs) summed over the pages: the same for the same input, whatever the machine's speed */
    workTotal() {
      const t = newWork()
      for (const w of pageWork) if (w) for (const k of WORK_KEYS) t[k] += w[k]
      return t
    },
    /** how the removal went: pages removed and refused, units drawn by it (tex) and the old way (v0), the rectangles filled
     *  and swapped, the pages a swap draws the removed page for */
    removalStats: () => RM?.stats ?? null,
    /** a done page's removed page at v0's own resolution (draw mode, until released), for a check */
    removedCanvas: pg => RM?.removed[pg] ?? null,
    /** the prototype's completeness checker on one done page (main.js check=1's, its pixels of that page alone, its
     *  placeholders of the units with lines on it) */
    checkPage(pg) {
      needsCopy()
      const here = placed.filter(p => p.pages.includes(pg) && !p.refused).map(p => shelf?.units.get(p.id) ?? p)
      const only = rows.map((r, i) => (i === pg - 1 ? r : { ...r, base: false }))
      return checkAll({ N, placed: here, rows: only, pxOf, toPdf, chars2: shelf ? shelf.chars : chars2, audit, cols: colsOf, cellRects, named: names.filter(n => n.drawn && n.page === pg) })
    },
    /** the prototype's completeness checker over every page still held (main.js check=1's window.__result.check) */
    check() {
      needsCopy()
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
