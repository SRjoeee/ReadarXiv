// experiments/pdf-bilingual/spikes/layer-gate/proto.mjs
// The layer gate's page for an engine with no layout file (--engine-kind=proto): the instant layer's v0, the approved
// prototype ported into the engine (src/pdf-reader/engine/layer-proto/run.mjs), measured on the same pages, fixtures
// and measures as the engine's layer (page.mjs). v0 reads what the prototype read: arXiv's PDF through PDF.js, the made
// output's geometry (its units' line rectangles on the original, the anchors': the prototype's own data, served by the
// gate as each fixture's geometry.json) and a units file (the fixture's record.json, the same translation the engine's
// units.json carries; or the prototype's own staging output, units-p7.json, which its floor was measured on). It draws
// as the prototype drew, in its faces (the role table's since 2026-10-06, or the prototype's own, --proto-faces): its
// own canvases at 1.25 CSS px a unit and the page's device pixel ratio (2 here, the floor's 2.5 device px a unit), the
// copy erased, restored and cropped, the text as SVG.
//
// The planes and the model are taken as the parity harness took them from the prototype (scratchpad parity/
// run-proto.mjs, 2026-10-06), so that v0's measures compare with the prototype's floor: O is v0's own drawing of the
// original, C its copy, T an element screenshot of its SVG on white; each unit's laid lines are its record's (as
// main.js recorded them, rounded), its erase and crops are the drawing's audit; the kept renderings are the layout
// file's displays and labels on the page (the instrument's, as the parity harness read them); a translated unit v0 does
// not draw is left 'unanchored' (or the reason v0 gives). The completeness checks are the prototype's own checker's
// (layer- proto/check.mjs), page by page; the clipped characters are each unit's own count, on its first page. Lost ink
// is the gate's lostInk on v0's own planes at 2.5 device px a unit (regions of more than 6 px, the 2x floor of 4 px
// scaled by area), against what v0 accounts for: its units' characters it draws in translation or elsewhere (the
// checker's 'acc' and the crops' sources), grown over the ink connected to them within their lines' bands, never into a
// kept character, a kept rendering or a line of a unit v0 does not draw; glyphsLost is the same against the strict
// account (measure.mjs glyphAccounted), each glyph's place read against TeX's file. The content and line measures
// (measure.mjs contentOf, overDisplayOf, slotsSkippedOf, lineStartsOf, pixelPage's linesLeft) read TeX's file, the
// fixture's layout file (its rows read by the instrument itself, fileIndexOf), whether or not the hybrid is given it.
import * as pdfjs from 'pdfjs-dist'
import { lostInk } from '/engine/layer/check.mjs'
import { contentOf, cropForeignPx, displayRowsOf, fileIndexOf, footprintOf, forcedBreakRoom, forcedBreaksIn, glyphAccounted, keptSegsOf, kOfPiecesOf, lineStartsOf, markerResidueOf, markupResidueOf, MATH_FONT, modelPage, noStart, overDisplayOf, pixelPage, removalPage, replacedFoot, slotsSkippedOf } from '/gate/measure.mjs'

import { annotationsOf, drawnCharsOf, erasedOf, glyphPointsOf, glyphsOfLink, linksPage, pairsOf, referenceOf, textUnder } from '/gate/links.mjs'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.mjs'
/** device pixels a PDF unit: v0's canvases at 1.25 CSS px and dpr 2 (the floor's), and the lost-ink check's 2x floor */
const K = 2.5, INK_SCALE = 2, INK_MIN = 4
const LOST_MIN = Math.floor(INK_MIN * (K / INK_SCALE) ** 2)
/** the layout maker's first version whose file the measures against TeX's file read (layout/file.mjs LAYOUT 3: glyph boxes
 *  by their own ink, the lines a unit's source does not write held); an earlier one's segments are a glyph's font box */
const FILE_LAYOUT_MIN = 3
/** the layout file's placeholder kinds (layout/file.mjs), for its displays */
const PHK = ['math', 'display', 'cite', 'ref', 'eqref', 'footnote', 'macro', 'url', 'code', 'other']

let S = {}
const bytes = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()) }
const json = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json() }
const charKey = c => `${c.page}|${c.item}|${c.k}`

/** the page's text items, with whether each is set in a math font (the fonts loaded: the page is drawn); `tc`: its text content */
function itemsOf(page, tc) {
  const items = []
  for (const it of tc.items) {
    if (!it.str || !/\S/.test(it.str) || !it.transform) continue
    const [a, b, , d, e, f] = it.transform
    if (Math.abs(b) > 0.01 || d < 0) continue
    const size = Math.hypot(a, b) || it.height
    let font = ''
    try { font = page.commonObjs.get(it.fontName)?.name ?? '' } catch {}
    items.push({ x0: e, y0: f - 0.22 * size, x1: e + it.width, y1: f + 0.78 * size, str: it.str, math: MATH_FONT.test(font) })
  }
  return items
}

/** the kept renderings of a page as the parity harness read them from the layout file: every display's segments, every
 *  label ([x0, y0, x1, y1]) but those of the units in `relabelled`, whose label is drawn in the target's name and so is
 *  their text (the table-groups brief: v0's labelInTarget) */
function keptOf(layout, p, relabelled = new Set()) {
  const out = []
  for (const r of layout.ph) if (PHK[r[2]] === 'display') for (let s = 4; s + 5 < r.length; s += 6) if (r[s] === p) out.push([r[s + 1], r[s + 5], r[s + 3], r[s + 4]])
  for (const l of layout.labels) if (l[2] === p && !relabelled.has(l[0])) out.push([l[3], l[7], l[5], l[6]])
  return out
}
/** a placed unit as it was laid: one the run let go of (`free`) is kept so on the gate's shelf (run.mjs full); an engine
 *  before the shelf keeps every unit whole */
const laidOf = q => (q && S.run.full ? S.run.full(q) : q)
/** the run's placed units by id, each as it was laid */
function laidById(run) {
  const m = new Map(run.placed.map(p => [p.id, p]))
  return { get: id => laidOf(m.get(id)), set: (id, q) => m.set(id, q) }
}
/** the units drawn whose float label v0 draws in the target's name */
const relabelledOf = recs => new Set(recs.filter(r => S.byId.get(r.id)?.prep?.label?.drawn).map(r => r.id))

/**
 * What the consistency measures read of a fixture (the table-groups brief, 2026-10-07): its table groups, each the
 * record's translated cells of one `group` (cache.mjs unitsOf; spikes/table-groups.mjs writes the fixtures so), and a
 * group drawn partly where some of its cells are drawn and some are not, at the first page one is drawn on; and whether
 * a drawn unit's float label stands in the source language where the final names it in the target's — the record's
 * `captions` (live.mjs captionsOf: `target` for figures or tables) and the target's names (`names`, the layout rules' labels,
 * the gate's own) differing from the label's own word, and the unit drawing no label of its own (`prep.label.drawn`)
 */
function consistencyOf(record, S, names) {
  const members = new Map()
  for (const [id, u] of (record.units ?? []).entries()) if (u?.group && u.pieces && (u.state === 'whole' || u.state === 'partial') && S.translated.has(id)) (members.get(u.group) ?? members.set(u.group, []).get(u.group)).push(id)
  // (drawn: laid and recorded, run.stats — a unit placed may still be let go with its group, run.mjs settleGroup)
  const splitOn = p => {
    const drawn = new Map(S.run.stats.map(r => [r.id, r]))
    const out = []
    for (const ids of members.values()) {
      const here = ids.filter(id => drawn.has(id))
      if (here.length && here.length < ids.length && Math.min(...here.map(id => drawn.get(id).pages[0])) === p) out.push({ ids })
    }
    return out
  }
  const captions = record.captions ?? null
  const labelSource = id => {
    const label = S.byId.get(id)?.prep?.label
    const m = label && /^(Figure|Fig\.|FIGURE|FIG\.|Table|TABLE)\s*[0-9IVXL]/.exec(label.text ?? '')
    if (!m || !names || !captions) return false
    const kind = /^t/i.test(m[1]) ? 'table' : 'figure'
    if (captions[kind] !== 'target' || names[kind].toLowerCase() === m[1].toLowerCase()) return false
    return !label.drawn
  }
  return { splitOn, labelSource }
}

const PDF_ASSETS = { cMapUrl: '/pdfjs/cmaps/', standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' }

/** the first code points of the Unicode blocks (fontTools 4.62.1, unicodedata Blocks, up to U+31350), for --slices */
const BLOCK_STARTS = '0 80 100 180 250 2b0 300 370 400 500 530 590 600 700 750 780 7c0 800 840 860 870 8a0 900 980 a00 a80 b00 b80 c00 c80 d00 d80 e00 e80 f00 1000 10a0 1100 1200 1380 13a0 1400 1680 16a0 1700 1720 1740 1760 1780 1800 18b0 1900 1950 1980 19e0 1a00 1a20 1ab0 1b00 1b80 1bc0 1c00 1c50 1c80 1c90 1cc0 1cd0 1d00 1d80 1dc0 1e00 1f00 2000 2070 20a0 20d0 2100 2150 2190 2200 2300 2400 2440 2460 2500 2580 25a0 2600 2700 27c0 27f0 2800 2900 2980 2a00 2b00 2c00 2c60 2c80 2d00 2d30 2d80 2de0 2e00 2e80 2f00 2fe0 2ff0 3000 3040 30a0 3100 3130 3190 31a0 31c0 31f0 3200 3300 3400 4dc0 4e00 a000 a490 a4d0 a500 a640 a6a0 a700 a720 a800 a830 a840 a880 a8e0 a900 a930 a960 a980 a9e0 aa00 aa60 aa80 aae0 ab00 ab30 ab70 abc0 ac00 d7b0 d800 db80 dc00 e000 f900 fb00 fb50 fe00 fe10 fe20 fe30 fe50 fe70 ff00 fff0 10000 10080 10100 10140 10190 101d0 10200 10280 102a0 102e0 10300 10330 10350 10380 103a0 103e0 10400 10450 10480 104b0 10500 10530 10570 105c0 10600 10780 107c0 10800 10840 10860 10880 108b0 108e0 10900 10920 10940 10960 10980 109a0 10a00 10a60 10a80 10aa0 10ac0 10b00 10b40 10b60 10b80 10bb0 10c00 10c50 10c80 10d00 10d40 10d90 10e60 10e80 10ec0 10f00 10f30 10f70 10fb0 10fe0 11000 11080 110d0 11100 11150 11180 111e0 11200 11250 11280 112b0 11300 11380 11400 11480 114e0 11580 11600 11660 11680 116d0 11700 11750 11800 11850 118a0 11900 11960 119a0 11a00 11a50 11ab0 11ac0 11b00 11b60 11b80 11bc0 11c00 11c70 11cc0 11d00 11d60 11db0 11df0 11ee0 11f00 11f60 11fb0 11fc0 12000 12400 12480 12550 12f90 13000 13430 13460 14400 14680 16100 16140 16800 16a40 16a70 16ad0 16b00 16b90 16d40 16d80 16e40 16ea0 16ee0 16f00 16fa0 16fe0 17000 18800 18b00 18d00 18d80 18e00 1aff0 1b000 1b100 1b130 1b170 1b300 1bc00 1bca0 1bcb0 1cc00 1cec0 1cf00 1cfd0 1d000 1d100 1d200 1d250 1d2c0 1d2e0 1d300 1d360 1d380 1d400 1d800 1dab0 1df00 1e000 1e030 1e090 1e100 1e150 1e290 1e2c0 1e300 1e4d0 1e500 1e5d0 1e600 1e6c0 1e700 1e7e0 1e800 1e8e0 1e900 1e960 1ec70 1ecc0 1ed00 1ed50 1ee00 1ef00 1f000 1f030 1f0a0 1f100 1f200 1f300 1f600 1f650 1f680 1f700 1f780 1f800 1f900 1fa00 1fa70 1fb00 1fc00 20000 2a6e0 2a700 2b740 2b820 2ceb0 2ebf0 2ee60 2f800 2fa20 30000 31350'.split(' ').map(h => Number.parseInt(h, 16))
/** CJK Unified Ideographs, which --slices cuts in 8 of equal size */
const CJK_FROM = 0x4e00, CJK_STEP = 0xa40
/** --slices=alphabet: the blocks one slice holds, whose letters, accents, quotes and spaces are kerned with each other (a
 *  canvas shapes a run of two faces of a family as two runs, so that no pair across them is kerned): Basic Latin, Latin-1
 *  Supplement, Latin Extended-A, Cyrillic and General Punctuation. On the 29 outputs each is needed (Latin-1: de, es, fr;
 *  Extended-A: fr's "œ"; Cyrillic: ru; General Punctuation: the curly apostrophe of fr and ko) and together they are enough */
const ALPHABET = new Set([0x0, 0x80, 0x100, 0x400, 0x2000])
/**
 * --slices: a face's coverage cut into slices of the one file, as a host's slice plan cuts it for the engine to load
 * (faceSources): the CJK Unified Ideographs in 8, every other Unicode block of the coverage its own (`blocks`); with
 * `alphabet`, ALPHABET's blocks together in one. Every slice is the whole file at a URL of its own (the query tells them
 * apart; the server ignores it), so that the browser draws what the slice's unicode-range allows of it, as a cut file would
 * be drawn. Ascending ranges within a slice, slices by their place
 */
function sliceTable(F, coverage, rule) {
  const by = new Map()
  for (let i = 0; i + 1 < coverage.length; i += 2) {
    for (let a = coverage[i]; a <= coverage[i + 1];) {
      let b = BLOCK_STARTS.length - 1
      while (BLOCK_STARTS[b] > a) b--
      let z = Math.min(coverage[i + 1], (BLOCK_STARTS[b + 1] ?? 0x110000) - 1)
      let key = rule === 'alphabet' && ALPHABET.has(BLOCK_STARTS[b]) ? -1 : b * 8
      if (BLOCK_STARTS[b] === CJK_FROM) {
        const k = Math.min(7, Math.floor((a - CJK_FROM) / CJK_STEP))
        key += k
        if (k < 7) z = Math.min(z, CJK_FROM + (k + 1) * CJK_STEP - 1)
      }
      if (!by.has(key)) by.set(key, [])
      by.get(key).push(a, z)
      a = z + 1
    }
  }
  return [...by].sort((x, y) => x[0] - y[0]).map(([, ranges], n) => ({ url: `/fonts/${encodeURIComponent(F.file)}?slice=${n}`, ranges }))
}

/** the web's deltas of a live run's rows (the plan's delta rule): a part closed once its rows' JSON reaches 384 KiB or
 *  96,000 values (layout/json.mjs countValues), 32 parts at most, the 32nd taking the rest */
const DELTA_BYTES = 384 * 1024, DELTA_VALUES = 96_000, DELTA_PARTS = 32
async function deltaParts(rows) {
  const { countValues } = await import('/engine/layout/json.mjs')
  const enc = new TextEncoder(), parts = []
  let cur = [], bytes = 2, values = 1
  for (const r of rows) {
    const text = JSON.stringify(r)
    bytes += enc.encode(text).length + (cur.length ? 1 : 0)
    values += countValues(text)
    cur.push(r)
    if (parts.length < DELTA_PARTS - 1 && (bytes >= DELTA_BYTES || values >= DELTA_VALUES)) { parts.push(cur); cur = []; bytes = 2; values = 1 }
  }
  if (cur.length) parts.push(cur)
  return parts
}
/** a record's row as a live run gives it (E6's): each non-text piece with its k, the units file's TrPiece's at the same
 *  index (trPiecesOf gives one a piece), a piece TrPiece writes as text (a break, a space) the least k no other piece of
 *  the unit takes (one of its source's pieces, as a live run's: past the largest, 605 of the fixtures' 1,810 such pieces
 *  lay past their unit's pieces in the layout file); a row the units file holds no translation of as the record has it */
function withK(u, tr) {
  if (!u.pieces || !tr) return u
  const taken = new Set(tr.filter(t => t[0] !== 0).map(t => t[1]))
  let next = 0
  const fresh = () => { while (taken.has(next)) next++; taken.add(next); return next }
  return { ...u, pieces: u.pieces.map((q, i) => (q.t === 'text' ? q : { ...q, k: tr[i][0] !== 0 ? tr[i][1] : fresh() })) }
}

/** a page of a document drawn by the CPU at the gate's resolution on `bg` (the exactness check's and the truth's planes,
 *  so that a figure's antialiasing is the same in each) */
async function cpuPlane(doc, n, bg = '#ffffff') {
  const pg = await doc.getPage(n), dpr = devicePixelRatio, vp = pg.getViewport({ scale: K / dpr })
  const c = document.createElement('canvas')
  c.width = Math.floor(vp.width * dpr)
  c.height = Math.floor(vp.height * dpr)
  const x = c.getContext('2d', { willReadFrequently: true })
  x.fillStyle = bg
  x.fillRect(0, 0, c.width, c.height)
  await pg.render({ canvas: c, canvasContext: x, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined, background: bg }).promise
  const d = x.getImageData(0, 0, c.width, c.height).data
  c.width = 0
  c.height = 0
  return d
}

/** a page of a document as v0 draws its own canvases (the GPU's, at the gate's resolution): the removed page as the copy
 *  would take it */
async function gpuPlane(doc, n, W, H) {
  const pg = await doc.getPage(n), dpr = devicePixelRatio
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  await pg.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: pg.getViewport({ scale: K / dpr }), transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise
  const d = c.getContext('2d').getImageData(0, 0, W, H).data
  c.width = 0
  c.height = 0
  return d
}

/**
 * The text-removed PDF's measures of the page prepared last (removalPage's, and each crop's foreign ink). The truth's
 * removed page is the original as the copy was made from it outside the removed glyphs' footprint (where the two are the
 * same, which the driver's exactness check sees to in Node: the browser's canvas draws a figure a little differently
 * each time), and the removed page inside it (the footprint page drawn on white and on black). Each crop laid on the page:
 * its source plane, and the coloured placeholders' page of its source page with its own rules' boxes
 */
/**
 * The truth's account of a page drawn over the paper's add-on (the gate's instrument; the engine reads no ink): what its
 * drawing must have replaced, glyph by glyph, by the gate's own reading of the page's ink (each glyph its outline's box,
 * the check's outline table) and the engine's own rule of what a drawn unit replaces (removal.mjs unitRemoval, over the
 * layout file's ownership): `items`, every glyph and rule the add-on removed, device pixels, and whether a unit drawn
 * by the add-on replaces it; `erase`, what such a unit replaces that the add-on kept (paper white in the truth); and the
 * areas of the units drawn the old way (v0's own readings), which the truth leaves out (their erase is the gate's own
 * measures')
 */
async function truthOf(p, page) {
  const R = await import('/engine/layer-proto/removal.mjs'), I = await import('/engine/layout/ink.mjs')
  const { run } = S, index = S.texIndex
  if (!index) return null
  S.outlines ??= I.readOutlines(S.rm.manifest.outlines)
  const ink = await R.inkOfPage(pdfjs.OPS, page, S.outlines)
  const own = R.fileOwnership(index, p, ink), plan = R.pagePlan(index, p, ink, own)
  const charMap = R.glyphsOfChars(run.chars[p - 1] ?? [], ink, p), unmapped = R.unmappedOf(ink, charMap)
  const at = new Map(), byPath = new Map()
  ink.glyphs.forEach((g, i) => { if (g.n >= 0) at.set(`${g.n}.${g.k}`, i) })
  ink.paths.forEach((m, b) => { if (m >= 0) byPath.set(m, b) })
  const removed = new Set(), removedP = new Set()
  for (const u of plan.units) { for (let q = 0; q + 1 < u.glyphs.length; q += 2) removed.add(at.get(`${u.glyphs[q]}.${u.glyphs[q + 1]}`)); for (const m of u.paths) removedP.add(byPath.get(m)) }
  const fileDrawn = new Set(run.placed.filter(q => q.tex).map(q => q.id)), claimed = new Map()
  const drawnHere = new Set(run.stats.filter(r => r.pages.includes(p)).map(r => r.id))
  const done = new Set(), doneP = new Set(), extraG = []
  // (a babel name's glyphs, D1a: removed, and replaced where the run drew the name in the target's word)
  const namesDrawn = new Set((run.names ?? []).filter(n => n.page === p && n.drawn).map(n => n.occurrence))
  for (const nm of plan.names ?? []) for (let q = 0; q + 1 < nm.glyphs.length; q += 2) { const g = at.get(`${nm.glyphs[q]}.${nm.glyphs[q + 1]}`); removed.add(g); if (namesDrawn.has(nm.occurrence)) done.add(g) }
  for (const q of run.placed.map(laidOf)) {
    if (!q.tex || !q.prep || q.refused || !drawnHere.has(q.id) || !q.pages.includes(p)) continue
    const rm = R.unitRemoval({ id: q.id, page: p, prep: q.prep, tex: { lu: q.tex.lu, kOf: q.tex.kOf }, own, charMap, unmapped, ink, claimed, fileDrawn })
    for (const g of rm.glyphs) { done.add(g); if (!removed.has(g)) extraG.push(g) }
    for (const b of rm.paths) doneP.add(b)
  }
  const pageView = (await S.doc.getPage(p)).view
  const dev = b => [(b[0] - pageView[0]) * K, (pageView[3] - b[3]) * K, (b[2] - pageView[0]) * K, (pageView[3] - b[1]) * K]
  const box = g => { const x = ink.glyphs[g]; return x.ix1 > x.ix0 && x.top > x.bottom ? [x.ix0, x.bottom, x.ix1, x.top] : null }
  const items = []
  for (const g of removed) { const b = box(g); if (b) items.push({ box: dev(b), replaced: done.has(g) }) }
  for (const b of removedP) items.push({ box: dev(ink.boxes.slice(4 * b, 4 * b + 4)), replaced: doneP.has(b) })
  const erase = extraG.map(box).filter(Boolean).map(b => dev([b[0] - 0.6, b[1] - 0.6, b[2] + 0.6, b[3] + 0.6]))
  return { items, erase }
}

async function removalMeasures(cur, T) {
  const { p, W, H, view, O, C, units, kept } = cur
  const { cdoc, rdoc, manifest, plan, mode } = S.rm
  const set = s => manifest.sets[s]
  const ok = !!manifest.page[p]?.ok
  let Rm = O
  if (ok) {
    const own = mode === 'draw' ? S.run.removedCanvas(p) : null
    const R = own ? own.getContext('2d').getImageData(0, 0, W, H).data : await gpuPlane(rdoc, set('R') + p, W, H)
    const foot = footprintOf(await cpuPlane(cdoc, set('F') + p), await cpuPlane(cdoc, set('F') + p, '#000000'), W, H)
    // the add-on is the paper's: of what it removed, the truth takes out what this page's drawing replaces (each
    // footprint pixel its glyph's, replacedFoot), and leaves the rest the original's (a line a reading keeps, a unit not
    // drawn); what a unit replaces that the add-on kept is erased, paper white
    const truth = mode === 'draw' ? await truthOf(p, await S.doc.getPage(p)) : null
    const take = truth ? replacedFoot(foot, W, H, truth.items) : foot
    Rm = new Uint8ClampedArray(O)
    for (let i = 0, q = 0; i < W * H; i++, q += 4) if (take[i]) { Rm[q] = R[q]; Rm[q + 1] = R[q + 1]; Rm[q + 2] = R[q + 2] }
    for (const e of truth?.erase ?? []) for (let y = Math.max(0, Math.floor(e[1])); y < Math.min(H, Math.ceil(e[3])); y++) for (let x = Math.max(0, Math.floor(e[0])); x < Math.min(W, Math.ceil(e[2])); x++) { const q = 4 * (y * W + x); Rm[q] = Rm[q + 1] = Rm[q + 2] = 255 }
  }
  const drawn = units.filter(u => u.drawn)
  // (the units drawn the old way, v0's own readings: their erase is the gate's erase measures', not the truth's)
  const oldWay = drawn.filter(u => !S.byId.get(u.id)?.tex).flatMap(u => (S.audit.get(`${u.id}|${p}`) ?? []).filter(a => a.what === 'erase' && !a.swap).map(a => a.box))
  // (and a babel name drawn the old way, erased and put back: D1a)
  for (const a of S.run.audit) if (a.what === 'erase' && a.name !== undefined && a.page === p && !a.swap) oldWay.push(a.box)
  const out = removalPage({ k: K, view, W, H, O, Rm, C, T, crops: drawn.flatMap(u => u.crops.map(c => c.devDst)), kept, excluded: oldWay })
  // each crop's foreign ink, from the plane it was cut from
  const planes = new Map()
  const plane = async (key, make) => { if (!planes.has(key)) planes.set(key, await make()); return planes.get(key) }
  const R = await import('/engine/layer-proto/removal.mjs')
  let crops = 0, foreign = 0, foreignPx = 0
  for (const u of drawn) for (const c of u.crops) {
    const q = c.srcPage
    if (!manifest.page[q]?.ok) continue
    // (the plan names a crop by its placeholder's source index, the file's k; v0's audit by the piece's)
    const fk = (await fileKOf(u.id))?.[c.k] ?? c.k
    const ci = (plan.pages[q]?.crops ?? []).findIndex(x => x.id === u.id && x.k === fk)
    const colour = manifest.colours?.[`${q}.${ci}`] ?? null
    const own = await plane(`C${q}`, () => cpuPlane(cdoc, set('C') + q))
    const src = c.plane === 'P' ? await plane(`P${q}`, () => cpuPlane(cdoc, set('P') + q)) : await plane(`O${q}`, () => cpuPlane(cdoc, q))
    const qv = (await cdoc.getPage(q)).view
    const toPx = (x, y) => [(x - qv[0]) * K, (qv[3] - y) * K]
    const dev = b => { const [ax, ay] = toPx(b[0], b[3]), [bx, by] = toPx(b[2], b[1]); return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)] }
    const ink = await plane(`ink${q}`, async () => R.inkOfPage(pdfjs.OPS, await cdoc.getPage(q)))
    const at = ci >= 0 ? R.indicesOf(ink, plan.pages[q].crops[ci]) : null
    const rules = (at?.paths ?? []).map(b => dev(ink.boxes.slice(4 * b, 4 * b + 4)))
    // (a crop drawn through its own ink's boxes carries nothing outside them: v0's device pixels, at the gate's)
    const xyxy = l => (l ? l.map(e => [e[0], e[1], e[0] + e[2], e[1] + e[3]]) : null)
    const n = cropForeignPx({ W, H, src, own, colour, box: dev(c.src), rules, clip: xyxy(c.clip), ownBoxes: xyxy(c.own) })
    crops++
    foreignPx += n
    if (n >= 6) {
      foreign++
      // (where: the unit, its piece, which way it was drawn, the pixels)
      ;((out.at ??= {}).crops ??= []).push([u.id, c.k, S.byId.get(u.id)?.tex ? 'tex' : 'v0', c.clip ? 'clip' : 'box', n])
    }
  }
  return { ...out, ok, crops, cropForeignInk: foreign, cropForeignInkPx: foreignPx }
}

/** each translated piece's source index (the layout file's k) of a unit drawn: the hybrid's own where the file locates
 *  the unit whole, else read from the units file's pieces (tex.mjs kOfPieces), as the drawing cut its crops from the
 *  file's segments; null where none is known. A v0 unit's piece index is not its k (2307.16209's unit 75: piece 2 is k 1) */
async function fileKOf(id) {
  const q = S.byId.get(id)
  if (q?.tex?.kOf) return q.tex.kOf
  if (!q || !S.texIndex?.unit(id)) return null
  const T = await import('/engine/layer-proto/tex.mjs')
  return T.kOfPieces(q.unit, S.texPieces?.get(id))
}
/** a drawn run's ink over (a) and under (d) its baseline at 100 px in its face, as the browser draws it (the gate's own
 *  reading, by the face the drawing names: an engine's measure is not the instrument's) */
const inkCtx = new OffscreenCanvas(8, 8).getContext('2d'), inkSeen = new Map()
const inkOf = (s, font) => {
  const key = `${font}|${s}`
  let v = inkSeen.get(key)
  if (!v) { inkCtx.font = font; const m = inkCtx.measureText(s); v = { a: m.actualBoundingBoxAscent || 0, d: m.actualBoundingBoxDescent || 0 }; inkSeen.set(key, v) }
  return v
}
/**
 * Each drawn line of the units drawn on page p: its text's extent over and under its baseline (its runs' ink as drawn,
 * inkOf, a superscript at 0.62 of the size raised 0.36 em as the SVG sets it) across the line as placed, its slots' pitch
 * (the drawing's), and its first drawn character (null where a crop opens it): { key, unit, x0, x1, baseline, a, d, pitch,
 * first }
 */
async function drawnLinesOf(p, recs) {
  const F = await import('/engine/layer-proto/fonts.mjs')
  const out = []
  for (const r of recs) {
    const q = S.byId.get(r.id)
    if (!q?.layout) continue
    const f = q.layout.f
    q.layout.lines.forEach((l, i) => {
      if (l.page !== p) return
      let a = 0, d = 0
      for (const it of l.items) {
        const t = it.t
        if (t.crop || !t.s || t.space || !t.face) continue
        const m = inkOf(t.s, F.fontString(t.face, 100)), k = t.sup ? 0.62 : 1, up = t.sup ? 0.36 * f : 0
        a = Math.max(a, up + (m.a * k * f) / 100)
        d = Math.max(d, (m.d * k * f) / 100 - up)
      }
      const open = l.items.find(it => it.t.crop || (it.t.s && !it.t.space && /\S/.test(it.t.s)))
      const first = !open || open.t.crop ? null : [...open.t.s.trimStart()][0] ?? null
      out.push({ key: `${r.id}|${i}`, unit: r.id, x0: l.x0, x1: l.x0 + (l.used ?? l.x1 - l.x0), baseline: l.baseline, a, d, pitch: l.pitch ?? null, first })
    })
  }
  return out
}
/** each translated piece's source index (the layout file's k) of a unit, for the content measure: measure.mjs
 *  kOfPiecesOf over its record's pieces and its units file's, whichever layout file the run was given */
const contentKOf = id => kOfPiecesOf(S.byId.get(id)?.unit?.pieces, S.trPieces.get(id))
/** a translated piece's source (its TeX), by which two placeholders of one source are one rendering */
const srcOf = (id, i) => S.byId.get(id)?.unit?.pieces?.[i]?.src ?? null
/**
 * What the content measure (measure.mjs contentOf) reads of page p, from the drawing and TeX's file (the fixture's layout
 * file, S.file): the placeholders with ink on the page of the units drawn on it, the crops cut from it, the placeholders
 * drawn from their source, the characters of those drawn as the page's own characters (orig-text) and of those left as
 * the original's (kept), each rendering by its unit and its placeholder's k, the lines the drawing keeps, and everything
 * it erased on the page. A unit whose pieces cannot be read against its source's, or that the file does not hold on the
 * page, is left out and its placeholders counted (`unknown`), with those the file has LOST
 */
function contentInputsOf(p, recs, boxPdf) {
  const page = S.file.get(p)
  const phs = [], texts = [], pageTexts = [], kept = [], keptLines = []
  let unknown = 0
  const centres = r => (r.gap?.chars ?? []).filter(c => c.page === p && !c.sep && !c.space && /\S/.test(c.ch)).map(c => [(c.x0 + c.x1) / 2, c.yb + 0.3 * c.size])
  for (const r of recs) {
    const q = S.byId.get(r.id), own = page?.units.get(r.id)
    if (!q?.prep || !q.layout) continue
    // (a unit TeX's file does not hold on the page: its placeholders, on its first page drawn, none of them placed)
    if (!own) { if (r.pages[0] === p) unknown += [...q.prep.values()].filter(x => x?.k !== undefined && x.cls !== 'space' && x.cls !== 'zero').length; continue }
    unknown += own.lost.length
    const kOf = contentKOf(r.id)
    if (!kOf) { unknown += own.phs.length; continue }
    // (each placeholder with its source: the translation's piece of its k)
    for (const ph of own.phs) phs.push({ unit: r.id, ...ph, src: srcOf(r.id, kOf.indexOf(ph.k)) })
    const items = q.layout.lines.flatMap(l => l.items).map(it => it.t)
    const fromSource = new Set()
    for (const t of items) if (t.ph && t.ph !== 'orig-text' && !t.crop && !t.label && t.k !== undefined && !fromSource.has(t.k)) { fromSource.add(t.k); texts.push({ unit: r.id, k: kOf[t.k] ?? null, src: srcOf(r.id, t.k) }) }
    for (const res of q.prep.values()) {
      if (!res?.gap) continue
      const shown = { unit: r.id, k: kOf[res.k] ?? null, src: srcOf(r.id, res.k), chars: centres(res) }
      if (res.mode === 'kept') kept.push(shown)
      else if (res.mode === 'orig-text' && items.some(t => t.ph === 'orig-text' && t.k === res.k)) pageTexts.push(shown)
    }
    for (const key of q.prep.keep ?? []) {
      const [pg, box] = key.split('|')
      if (Number(pg) === p) keptLines.push(box.split(',').map(Number))
    }
  }
  const crops = S.run.audit.filter(a => a.what === 'crop' && a.srcPage === p).map(a => ({ unit: a.unit, k: contentKOf(a.unit)?.[a.k] ?? null, src: srcOf(a.unit, a.k), box: a.src }))
  const erased = S.run.audit.filter(a => a.what === 'erase' && a.page === p).map(a => boxPdf(a.box))
  return { inputs: { phs, crops, texts, pageTexts, kept, keptLines, erased }, unknown }
}
/**
 * Where page p's drawn crops sit, as measure.mjs cropPlacementOf reads them: each drawn line of the units drawn on it
 * (drawnLinesOf), and each crop on it, its box as drawn (the audit's) and its TeX
 * baseline, the baseline of the layout file's segment of its placeholder's row on the page it is cut from that its source
 * box meets; none where the file has none (cropNoTex). Null with no hybrid (v0 alone: no TeX baseline to hold a crop to)
 */
async function placementOf(p, recs, boxPdf, drawnLines) {
  if (!S.texIndex) return null
  const lines = drawnLines.map(({ key, x0, x1, baseline, a, d }) => ({ key, x0, x1, baseline, a, d })), crops = []
  for (const r of recs) {
    const q = S.byId.get(r.id)
    if (!q?.layout) continue
    const lu = S.texIndex.unit(r.id), kOf = await fileKOf(r.id)
    const audit = (S.audit.get(`${r.id}|${p}`) ?? []).filter(a => a.what === 'crop')
    q.layout.lines.forEach((l, i) => {
      if (l.page !== p) return
      const key = `${r.id}|${i}`
      for (const it of l.items) {
        const c = it.t.crop
        if (!c) continue
        const a = audit.find(x => x.k === c.k)
        if (!a) continue
        const box = boxPdf(a.dst), sc = (box[3] - box[1]) / (a.src[3] - a.src[1])
        const row = lu && kOf ? lu.ph.get(kOf[c.k]) : null, S6 = row?.segs ?? []
        let tex = null
        for (let s = 0; s + 5 < S6.length && tex === null; s += 6) if (S6[s] === a.srcPage && Math.min(S6[s + 3], a.src[2]) > Math.max(S6[s + 1], a.src[0]) && Math.min(S6[s + 4], a.src[3]) > Math.max(S6[s + 5], a.src[1])) tex = S6[s + 2]
        crops.push({ unit: r.id, line: key, box, srcTop: a.src[3], tex, sc })
      }
    })
  }
  return { lines, crops }
}

/**
 * What TeX's file says against page p's drawing (the 2608.16117 survey and the p59 finding, 2026-10-15; measure.mjs): each
 * placeholder shown once, no text over a display, no slot left empty between two lines of a unit beyond TeX's own room,
 * no line opened by a mark UAX 14 keeps from a line's start. Returns the model's values, their `where`, and what the
 * pixel tier reads beside them (the placeholders drawn from their source, the segments kept in place)
 */
function againstFileOf(p, recs, units, drawnLines, items, refOf, boxPdf) {
  const fpage = S.file.get(p)
  const content = contentInputsOf(p, recs, boxPdf)
  const shown = contentOf(content.inputs)
  const over = overDisplayOf({ lines: drawnLines, boxes: [...(fpage?.displays ?? []), ...displayRowsOf(fpage)] })
  // (each drawn unit's own text lines in the file, its pitch, and the lines the drawing keeps of it as the original's)
  // (v0's kept lines include a display's held rows, which the pair's own test sets apart: its text's lines alone)
  const keptRowsOf = (id, held) => (S.byId.get(id)?.prep?.keep ?? []).map(key => key.split('|')).filter(([pg]) => Number(pg) === p).map(([, b]) => { const r = b.split(',').map(Number); return (r[1] + r[3]) / 2 }).filter(y => !held.some(h => y >= h[1] && y <= h[3]))
  // (and TeX's forced breaks in its lines, where its source sets exactly as many: forcedBreaksIn over the record's pieces,
  // each piece's kind TeX's file's: a placeholder visible where the file holds a row of ink for it, one the units file
  // writes as text by that text)
  const pieceKindsOf = (id, own) => {
    const kOf = contentKOf(id), tr = S.trPieces.get(id)
    if (!kOf) return () => undefined
    return (i, q) => (q.t === 'text' ? (/\S/.test(q.s ?? '') ? 'text' : null) : q.t !== 'ph' && q.t !== 'nested' ? null : kOf[i] < 0 ? (/\S/.test(String(tr?.[i]?.[1] ?? '')) ? 'text' : null) : own.rows?.get(kOf[i]) === 'display' ? 'display' : own.rows?.has(kOf[i]) ? 'text' : null)
  }
  const slots = slotsSkippedOf(units.filter(u => u.drawn).map(u => {
    const own = fpage?.units.get(u.id), held = (own?.lines ?? []).filter(l => l.held).map(l => l.box)
    const breaks = own?.breaks?.length ? forcedBreakRoom(own, forcedBreaksIn(S.byId.get(u.id)?.unit?.pieces, pieceKindsOf(u.id, own))) : []
    return { id: u.id, orig: u.orig, tex: (own?.lines ?? []).filter(l => !l.held).map(l => ({ baseline: l.baseline, x0: l.box[0], x1: l.box[2] })), held, texPitch: own?.pitch ?? null, keptRows: keptRowsOf(u.id, held), breaks, lines: drawnLines.filter(l => l.unit === u.id).map(l => ({ baseline: l.baseline, size: S.byId.get(u.id)?.layout?.f ?? 0, x0: l.x0, x1: l.x1, pitch: l.pitch })) }
  }))
  // (the original's line a drawn line stands on: the unit's own reference line on its baseline, within half a point; its
  // first character, the page's first item on that line from its left edge on)
  const origFirst = l => {
    const o = (refOf.get(l.unit)?.orig ?? []).find(o => Math.abs(o.baseline - l.baseline) < 0.5 && Math.min(o.x1, l.x1) > Math.max(o.x0, l.x0))
    if (!o) return null
    const on = items.filter(it => { const s = it.y1 - it.y0; return Math.abs(it.y0 + 0.22 * s - o.baseline) < 0.35 * Math.max(s, o.size) && it.x1 > o.x0 && it.x0 < o.x1 }).sort((a, b) => a.x0 - b.x0)
    return [...(on[0]?.str.trimStart() ?? '')][0] ?? null
  }
  const starts = lineStartsOf(drawnLines.map(l => ({ unit: l.unit, first: l.first, orig: noStart(l.first) ? origFirst(l) : null })))
  const where = {}
  if (shown.contentWhere.length) where.contentLost = shown.contentWhere.map(([u, k, n]) => `${u}:${k}:${n}`)
  for (const [key, ids] of [['textInDisplay', over.where], ['slotsSkipped', slots.where], ['lineStartPunct', starts.where]]) if (ids.length) where[key] = [...new Set(ids)]
  return {
    values: { contentLost: shown.contentLost, contentUnknown: content.unknown, textInDisplay: over.textInDisplay, slotsSkipped: slots.slotsSkipped, lineStartPunct: starts.lineStartPunct },
    where, texts: new Set(content.inputs.texts.map(t => `${t.unit}|${t.k}`)), keptSegs: keptSegsOf(content.inputs),
  }
}

/** the boxes [x0, y0, x1, y1] of a flat list */
const boxesOf = flat => Array.from({ length: flat.length / 4 }, (_, i) => flat.slice(4 * i, 4 * i + 4))

/**
 * The drawn characters of page p's SVG, as PDF points (links.mjs drawnCharsOf): the SVG laid out in an offscreen box once the
 * fonts are in. Read only for a page that has a moved link record: the engine of 3a-0 has none
 */
async function drawnPointsOf(p, page) {
  await document.fonts.ready
  const svg = S.run.svgOf(p)
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-99999px;top:0;pointer-events:none'
  host.append(svg)
  document.body.append(host)
  try {
    // (the inverse of the viewport the SVG was made through: rotation, crop box and user unit included)
    const vp = page.getViewport({ scale: K / devicePixelRatio })
    return drawnCharsOf(svg, (x, y) => { const [px, py] = vp.convertToPdfPoint(x, y); return { x: px, y: py } })
  } finally { host.remove() }
}

/**
 * The link measures of page p (links.mjs; 3a-0): the original's links from PDF.js's annotations of arXiv's file (the document
 * the instrument opened), the glyph points of the page's text items, the area the drawing's operations left erased, and the
 * records the engine answers (`run.linksOf`, with its attribution `run.linkSources`: an engine before 3a has neither, and then
 * no record is kept, `linksKept` is 0 of the original's). Returns the model's values and their `where`
 */
async function linksOfPage(p, page, tc) {
  const { run, doc } = S
  const L = S.links
  const parsedOf = async q => {
    if (!L.parsed.has(q)) L.parsed.set(q, annotationsOf(await (q === p ? page : await doc.getPage(q)).getAnnotations()))
    return L.parsed.get(q)
  }
  const own = await parsedOf(p)
  const records = run.linksOf ? run.linksOf(p) : []
  const sources = records.length && run.linkSources ? run.linkSources(p) : null
  for (const src of sources ?? []) for (const [q] of src?.annots ?? []) await parsedOf(q)
  const view = page.getViewport({ scale: K })
  const glyphs = glyphPointsOf(tc.items)
  const moved = records.some(r => r.moved)
  const chars = moved ? await drawnPointsOf(p, page) : []
  // (the reference of a translated link reads TeX's file and the glyph points of the page its annotation is on: a placeholder's
  // segment, the unit whose line the point is on, the unit's translated pairs. The pages the records' sources are on, read here)
  const glyphsOf = new Map([[p, glyphs]])
  if (moved) for (const src of sources ?? []) for (const [q] of src?.annots ?? []) if (!glyphsOf.has(q)) glyphsOf.set(q, glyphPointsOf((await (await doc.getPage(q)).getTextContent()).items))
  const within = (x, y, b) => x >= Math.min(b[0], b[2]) && x <= Math.max(b[0], b[2]) && y >= Math.min(b[1], b[3]) && y <= Math.max(b[1], b[3])
  const ctxOf = q => {
    const fp = S.file?.get(q), all = L.parsed.get(q).links.filter(a => a.ok)
    return {
      all, points: a => glyphsOfLink(a, glyphsOf.get(q) ?? []),
      segment: (x, y) => !!fp && [...fp.units.values()].some(u => u.phs.some(ph => ph.segs.some(b => within(x, y, b)))),
      owner: (x, y) => { if (fp) for (const [id, u] of fp.units) if (u.lines.some(l => within(x, y, l.box))) return id; return null },
      pairsOf: id => pairsOf(S.byId.get(id)?.unit?.pieces),
    }
  }
  const m = linksPage({
    page: p, parsed: q => L.parsed.get(q), counted: q => q <= S.pages, glyphs, erased: erasedOf(run.rows[p - 1]?.ops, (x, y) => view.convertToViewportPoint(x, y)), records, sources, claims: L.claims,
    drawn: rec => textUnder(chars, boxesOf(rec.boxes)), reference: (rec, annots) => (annots.every(a => a.page === annots[0].page) ? referenceOf(annots, ctxOf(annots[0].page)) : null),
  })
  const { where, ...values } = m
  return { values, where: Object.fromEntries(Object.entries(where).filter(([, ids]) => ids.length)) }
}

window.gate = {
  /**
   * A fixture opened: v0, the made output's geometry, the units file asked for and arXiv's PDF. With `removal` (the
   * text-removed PDF: 'draw', v0 drawing by it; 'measure', v0's own drawing measured against it) and `addon` (the paper's,
   * the driver's: arXiv's PDF with it at `url`, its manifest, the plan it was made from), v0 is opened over it, and a
   * second reading of the add-on drawn by the CPU is kept for the exactness check's and the truth's planes
   */
  async open({ name, target, ref, units: which, pages, place, dump, order, faces, tex, removal, addon = null, names = null, rules = null, perf = false, parts: cut = null, slices = null }) {
    let V
    try { V = await import('/engine/layer-proto/run.mjs') } catch (e) { return { ready: false, why: `layer-proto/run.mjs: ${String(e?.message ?? e).slice(0, 200)}` } }
    const base = `/fixtures/${name}/`
    let geometry, unitsFile, layout, fixtureUnits, data, texFile
    try {
      // (layout: the instrument's, the fixture's own, whichever layout file the hybrid is given; texFile: the layout file the
      // fixture's drawing is given, TeX's file as its maker made it, which the content and line measures read)
      ;[geometry, unitsFile, layout, fixtureUnits, data, texFile] = await Promise.all([json(`${base}geometry.json`), json(`${base}${which === 'p7' ? 'units-p7.json' : 'record.json'}`), json(`${base}kept-layout.json`), json(`${base}units.json`), bytes(`${base}arxiv.pdf`), json(`${base}layout.json`)])
    } catch (e) { return { ready: false, why: String(e?.message ?? e).slice(0, 200) } }
    // (--perf, drawing by the add-on: as a reader opens it, one document, arXiv's pages and the add-on's appended to
    // them, its fonts parsed once; neither the check's second reading nor the plan, which no reader has)
    const one = perf && removal === 'draw' && addon
    const combined = removal && addon ? await bytes(addon.url) : null
    const doc = await pdfjs.getDocument({ data: one ? combined : data, ...PDF_ASSETS, ...V.PDF_OPTIONS }).promise
    // the hybrid (--proto-tex): the layout file given (the engine's own maker's, or the fixture's) read by the engine's
    // own reader, and the units file's pieces by unit, beside v0's own inputs
    let texIn = null
    if (tex) {
      const F = await import('/engine/layout/file.mjs')
      texIn = { ...tex, index: F.indexLayout(F.parseLayout(await bytes(`${base}layout.json`))), pieces: new Map(fixtureUnits.units.map(u => [u.id, u.pieces])) }
    }
    // (--parts: v0 opened with no unit, the record's rows taken as a live run's deltas give them, by the delta rule or n
    // a part, the hybrid's pieces read from their k by take; each unit's table group given at open, as the paper's
    // bundle gives the reader's host)
    let parts = null, tableGroups = null
    if (cut) {
      const tr = new Map(fixtureUnits.units.map(u => [u.id, u.pieces])), rowsK = []
      unitsFile.units.forEach((u, id) => { if (u) rowsK.push([id, withK(u, tr.get(id))]) })
      tableGroups = new Map(rowsK.filter(([, u]) => u.group).map(([id, u]) => [id, u.group]))
      parts = cut === 'delta' ? await deltaParts(rowsK) : Array.from({ length: Math.ceil(rowsK.length / cut) }, (_, i) => rowsK.slice(cut * i, cut * i + cut))
      if (texIn) texIn.pieces = new Map()
    }
    const texIndex = texIn?.index ?? null
    // (--slices: the role table's faces served in slices of one file each, sliceTable's cut, for the engine to ask of)
    let faceSources = null
    if (slices) {
      const [{ FACES }, { COVERAGE }] = await Promise.all([import('/engine/font-roles.mjs'), import('/engine/font-coverage.mjs')])
      faceSources = async id => sliceTable(FACES[id], COVERAGE[id], slices)
    }
    // the layout rule set v0 is given (--rules, else the engine's built-in): read by the engine's own reader, as a host reads it
    const ruleSet = rules ? (await (await import('/engine/rules/layout.mjs')).readRules(await bytes(rules))).set : null
    // (--perf: no copy of v0's own, as a reader opens it: the page's drawing is drawCopy's, at a view's resolution. And the run lets
    // go of what it has laid as the reader's does, the 1b design §3, so that a page or a unit let go too early moves a measure:
    // what it lets go is kept for the measures on the gate's shelf, `records`, read through laidOf)
    const opts = { doc, geometry, units: parts ? [] : unitsFile.units, ...(parts ? { expect: parts.flat().map(([id]) => id), groups: tableGroups } : {}), target, pages, scale: K / devicePixelRatio, dpr: devicePixelRatio, ...(ruleSet ? { rules: ruleSet } : {}), order: order ?? null, ...(faces ? { faces } : {}), ...(faceSources ? { faceSources } : {}), ...(texIn ? { tex: texIn } : {}), labels: { captions: unitsFile.captions ?? null }, faceUrl: f => `/fonts/${encodeURIComponent(f)}`, fontUrl: f => `/proto-fonts/${f}.otf`, hyphUrl: l => `/hyph/${l}.json`, ...(perf ? { copy: false } : {}), free: true, records: true }
    let rm = null
    if (one) {
      rm = { mode: removal, manifest: addon.manifest, plan: { pages: {} }, rdoc: doc, cdoc: null }
      opts.removal = { OPS: pdfjs.OPS, mode: 'draw', doc, manifest: addon.manifest }
    } else if (removal && addon) {
      const rdoc = await pdfjs.getDocument({ data: combined.slice(), ...PDF_ASSETS, ...V.PDF_OPTIONS }).promise
      const cdoc = await pdfjs.getDocument({ data: combined.slice(), ...PDF_ASSETS, ...V.PDF_OPTIONS, enableHWA: false }).promise
      rm = { mode: removal, manifest: addon.manifest, plan: addon.plan, rdoc, cdoc }
      if (removal === 'draw') opts.removal = { OPS: pdfjs.OPS, mode: 'draw', doc: rdoc, manifest: addon.manifest }
    }
    // (v0 leaves its inputs as they were: checked when the fixture is done, summary's inputsChanged)
    const inputs = () => JSON.stringify([geometry, unitsFile.units, parts])
    const before = inputs()
    const run = await V.openProto(opts)
    // (TeX's file as the instrument reads it, the fixture's layout file's rows by page, and the units file's pieces by unit:
    // the content and line measures'. Not the kept layout: the fixtures' own were made by the layout maker's first
    // version, whose segments are a glyph's font box, not its ink, and which holds no `held` lines; nor any layout file of
    // a maker before FILE_LAYOUT_MIN, the fixture's own included where the run is given those, --layouts=fixed or v0
    // alone, or a folder of them: then the measures against TeX's file are not taken)
    S = { V, run, doc, geometry, layout, file: Number(texFile?.layout) >= FILE_LAYOUT_MIN ? fileIndexOf(texFile) : null, trPieces: new Map(fixtureUnits.units.map(u => [u.id, u.pieces])), ref, name, target, texPieces: texIn?.pieces ?? null, audit: new Map(), audited: 0, translated: new Set(fixtureUnits.units.map(u => u.id)), skipped: new Map(run.skipped.map(s => [s.id, s.why])), byId: laidById(run), links: { parsed: new Map(), claims: new Map() }, pages, checks: [], place: place ?? null, dump: dump ? [] : null, rm, inputs: { before, of: inputs }, perf, texIndex }
    S.consistency = consistencyOf(unitsFile, S, names)
    if (parts) {
      // one part a macrotask from the open on, beside the driver's pages (until), then end()
      S.parts = { count: parts.length, pieces: texIn?.pieces ?? null, want: new Map(fixtureUnits.units.map(u => [u.id, u.pieces])), whys: [] }
      S.parts.fed = (async () => {
        for (const part of parts) { await new Promise(ok => setTimeout(ok, 0)); run.take(new Map(part)) }
        await new Promise(ok => setTimeout(ok, 0))
        run.end()
      })()
    }
    return { ready: true, pages: one ? run.N : doc.numPages, units: unitsFile.units.length, located: geometry.left.units.length, family: null, even: run.P.even ?? null, ...(parts ? { parts: parts.length } : {}) }
  },

  /** how the run drew by the add-on (draw): pages removed and refused, units swapped and drawn the old way */
  removalStats() { const st = S.run?.removalStats?.(); if (!st) return null; const { byPage, ...rest } = st; void byPage; return rest },

  /** a page laid and its model measured; with `pixel`, its planes taken and its SVG set for the driver's screenshot */
  async page(p, { pixel }) {
    const { run, doc } = S
    // the pages done before this one are let go: no unit paints them again
    for (let q = 1; q < p; q++) if (!run.rows[q - 1]?.released) run.release(q)
    const t0 = performance.now()
    await run.until(p)
    const ms = performance.now() - t0
    // (--parts: what the open read of the run at once, as far as the units have come: those placed, and why each unit
    // placed nowhere is left, never a laid unit's)
    if (S.parts) {
      for (const q of run.placed) S.byId.set(q.id, q)
      const laid = new Set(run.order)
      for (const x of run.skipped) if (!laid.has(x.id)) S.skipped.set(x.id, x.why)
    }
    // the audit by unit and page, as the drawing adds to it
    for (; S.audited < run.audit.length; S.audited++) { const a = run.audit[S.audited], k = `${a.unit}|${a.page}`; if (!S.audit.has(k)) S.audit.set(k, []); S.audit.get(k).push(a) }
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const items = itemsOf(page, tc)
    const view = page.view
    const toPdf = (x, y) => [view[0] + x / K, view[3] - y / K]
    const boxPdf = b => { const [ax, ay] = toPdf(b[0], b[3]), [bx, by] = toPdf(b[2], b[1]); return [ax, ay, bx, by] }
    const refHere = S.ref[p] ?? []
    const refOf = new Map(refHere.map(r => [r.id, r]))
    const recs = run.stats.filter(r => r.pages.includes(p))
    const units = recs.map(r => {
      const lines = (r.lines ?? []).filter(l => l[0] === p).map(l => ({ baseline: l[1], size: r.f, x0: l[6], x1: l[7], block: l[8] })).filter(l => Number.isFinite(l.x0) && Number.isFinite(l.x1))
      const mine = S.audit.get(`${r.id}|${p}`) ?? []
      const erase = mine.filter(a => a.what === 'erase').map(a => boxPdf(a.box))
      const crops = mine.filter(a => a.what === 'crop').map(a => ({ k: a.k, src: a.src, dst: boxPdf(a.dst), plane: a.plane ?? 'O', srcPage: a.srcPage, devDst: a.dst, clip: a.clip ?? null, own: a.own ?? null }))
      // (a label drawn in the target's name is the unit's own line too: its glyphs' band, which the erasing may take)
      const label = S.byId.get(r.id)?.prep?.label, mark = label?.drawn ? label.chars.filter(c => c.page === p) : []
      const own = mark.length ? [{ baseline: Math.max(...mark.map(c => c.yb)), size: Math.max(...mark.map(c => c.size)), x0: Math.min(...mark.map(c => c.x0)), x1: Math.max(...mark.map(c => c.x1)) }] : []
      return { id: r.id, kind: r.kind, drawn: true, why: null, orig: refOf.get(r.id)?.orig ?? [], own, lines, erase, crops, phs: [], pageText: [] }
    })
    const drawnIds = new Set(recs.map(r => r.id))
    for (const r of refHere) if (S.translated.has(r.id) && !drawnIds.has(r.id)) units.push({ id: r.id, kind: r.kind, drawn: false, why: S.skipped.get(r.id) ?? 'unanchored', orig: r.orig, lines: [], erase: [], crops: [] })
    if (S.parts) for (const u of units) if (!u.drawn) S.parts.whys.push([p, u.id, u.why])
    // the crops cut from this page, whatever page they are drawn on (a unit's text runs on past its page's foot), which the
    // measures of their source read here, each with the boxes of its own ink it is cut through where it is (removalOps'
    // `clip`); and where the crops drawn on this page sit (the math placement round)
    const cut = run.audit.filter(a => a.what === 'crop' && a.srcPage === p).map(a => ({ src: a.src, unit: a.unit, plane: a.plane ?? 'O', clip: a.clip ?? null }))
    const drawnLines = await drawnLinesOf(p, recs)
    const model = modelPage({ units, ref: refHere, items, translated: S.translated, cut, placement: await placementOf(p, recs, boxPdf, drawnLines) })
    // what TeX's file says of the page's content and its lines (againstFileOf), where the run reads one
    const kept = keptOf(S.layout, p, relabelledOf(recs))
    const against = S.file ? againstFileOf(p, recs, units, drawnLines, items, refOf, boxPdf) : null
    if (against) Object.assign(model, against.values)
    // the links (3a-0): the original's, and what the layer does with them
    const links = await linksOfPage(p, page, tc)
    Object.assign(model, links.values)
    // the prototype's own checker on the page: what it finds there, by the unit it is in (none for --perf: v0 is opened
    // with no copy of its own, as a reader opens it, and the checker reads that copy)
    const ck = S.perf ? { a: { regions: 0 }, b: { list: { missing: [], duplicated: [], brackets: [] } }, c: { list: [] }, d: { found: 0, ok: 0 } } : run.checkPage(p)
    const on = e => e.page === p
    // the wire's syntax left in the text drawn from the translation (markerResidueOf: each drawn unit's text tokens on the
    // page, not a placeholder's rendering nor a label), and TeX's in what a placeholder drawn from its source shows
    // (markupResidueOf: each placeholder's tokens against its source; a placeholder drawn as the page's own characters,
    // orig-text, shows the original's)
    const residue = []
    for (const r of recs) {
      const q = S.byId.get(r.id)
      const items = (q?.layout?.lines ?? []).filter(l => l.page === p).flatMap(l => l.items).filter(it => it.t?.s && !it.t.label && !it.t.crop)
      const found = markerResidueOf(items.filter(it => !it.t.ph).map(it => it.t.s).join(' '))
      const byK = new Map()
      for (const it of items) if (it.t.ph && it.t.ph !== 'orig-text') byK.set(it.t.k, `${byK.get(it.t.k) ?? ''}${it.t.s}`)
      for (const [k, text] of byK) found.push(...markupResidueOf(text, q?.unit?.pieces?.[k]?.src ?? ''))
      if (found.length) residue.push({ unit: r.id, found })
    }
    const check = {
      markerResidue: residue.reduce((a, x) => a + x.found.length, 0),
      missing: ck.b.list.missing.filter(on).map(e => e.k), twice: ck.b.list.duplicated.filter(on).map(e => e.k), brackets: ck.b.list.brackets.filter(on).map(e => e.k),
      duplicated: ck.c.list.filter(x => x.by === 'layer' && on(x)).map(x => x.unit),
      numbers: { total: ck.d.found, shown: ck.d.ok },
      clipped: recs.filter(r => r.pages[0] === p).reduce((a, r) => a + (r.lostChars ?? 0), 0),
    }
    S.checks.push({ p, lost: ck.a.regions, missing: check.missing.length, twice: check.twice.length, brackets: check.brackets.length })
    const where = {}
    for (const [key, list] of [['missing', ck.b.list.missing], ['twice', ck.b.list.duplicated], ['brackets', ck.b.list.brackets], ['duplicated', ck.c.list.filter(x => x.by === 'layer')]]) {
      const ids = [...new Set(list.filter(on).map(e => e.unit))]
      if (ids.length) where[key] = ids
    }
    if (residue.length) where.markerResidue = residue.map(x => `${x.unit}:${x.found.join(' ')}`)
    // (the units of the crops off their place, measure.mjs cropPlacementOf)
    for (const [key, ids] of Object.entries(model.cropWhere ?? {})) if (ids.length) where[key] = [...new Set(ids)]
    // (and of the content and line measures: a placeholder as unit:k:times shown)
    Object.assign(where, against?.where ?? {})
    Object.assign(where, links.where)
    const clippedIds = recs.filter(r => r.pages[0] === p && r.lostChars).map(r => r.id)
    if (clippedIds.length) where.clipped = clippedIds
    // the style: each unit's base as drawn against the original's (styleMatch's base), on its first page
    const first = recs.filter(r => r.pages[0] === p && r.match?.total)
    // the consistency measures (the table-groups brief): a table group drawn partly, on the page of its first cell drawn;
    // a float's label left in the source language where the final names it in the target's, on its unit's first page
    const split = S.consistency.splitOn(p), labels = recs.filter(r => r.pages[0] === p && S.consistency.labelSource(r.id))
    if (split.length) where.groupsSplit = split.map(x => x.ids[0])
    if (labels.length) where.labelsSource = labels.map(r => r.id)
    // generated text left (D1a): the reference's babel names on the page that no name the run drew stands on (by its box:
    // the reference is the engine's made layout's, a run of another engine draws by its own, or none)
    const drawnNames = (run.names ?? []).filter(n => n.page === p && n.drawn)
    const namesLeft = refHere.filter(r => r.kind === 'name' && !drawnNames.some(n => r.orig.some(o => Math.abs(n.box.x0 - o.x0) < 1 && Math.abs(n.box.baseline - o.baseline) < 1)))
    if (namesLeft.length) where.generatedLeft = namesLeft.map(r => r.id)
    const out = { page: p, ms, model, check, where, consistency: { groupsSplit: split.length, labelsSource: labels.length }, generated: { name: namesLeft.length }, style: [first.filter(r => r.match.base).length, first.length], drawn: recs.length, evened: false }
    // the text-removed PDF: whether this page is removed, and its units drawn by it or the old way (their removal not the
    // plan's)
    if (S.rm) {
      const st = S.run.removalStats?.()?.byPage?.[p]
      out.removal = { ok: !!S.rm.manifest.page[p]?.ok, refused: S.rm.manifest.page[p]?.ok ? 0 : (S.rm.plan.pages[p]?.units?.length ? 1 : 0), units: st?.units ?? 0, swapped: (st?.tex ?? 0) + (st?.v0 ?? 0), tex: st?.tex ?? 0, v0: st?.v0 ?? 0, extra: st?.extra ?? 0, mismatched: 0 }
    }
    if (!pixel) return out
    const row = run.rows[p - 1]
    // (the page's SVG made of its kept markup, run.mjs svgOf; an engine before it kept the element on its row)
    const svg = run.svgOf ? run.svgOf(p) : row.svg
    const W = row.left.width, H = row.left.height
    const O = row.left.getContext('2d').getImageData(0, 0, W, H).data, C = row.right.getContext('2d').getImageData(0, 0, W, H).data
    const box = document.getElementById('text')
    box.replaceChildren(svg)
    box.style.width = `${row.w}px`
    box.style.height = `${row.h}px`
    // the place the prototype's own page gave the page's text, to the fraction of a pixel (--proto-place: what its floor
    // was measured at), else the gate's
    const at = S.place?.[p]
    box.style.left = at ? `${at[0] - Math.floor(at[0])}px` : '0px'
    box.style.top = at ? `${at[1] - Math.floor(at[1])}px` : '0px'
    await document.fonts.ready
    const drawnText = (svg.textContent ?? '').replace(/\s+/g, '')
    if (S.dump) {
      // what the live prototype's page is compared by (--dump): the copy's pixels, the SVG's markup and the drawing's
      // operations, digested
      let h = 0x811c9dc5
      for (let i = 0; i < C.length; i++) { h ^= C[i]; h = Math.imul(h, 0x01000193) >>> 0 }
      const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('')
      const svgDigest = await digest(svg.innerHTML), ops = await digest(JSON.stringify(row.ops))
      // (and what the checker found on the page, with its reasons)
      const why = list => list.filter(on).map(e => ({ unit: e.unit, k: e.k, mode: e.mode, why: e.why }))
      S.dump.push({ p, W, H, copy: h.toString(16), svg: svgDigest, ops, check: { missing: why(ck.b.list.missing), duplicated: why(ck.b.list.duplicated), brackets: why(ck.b.list.brackets) } })
    }
    // the names drawn, as the pixel measures read them: the original's line, the line drawn, the box erased (D1a); one set
    // as a unit's line start (`unit`) is that unit's line, its characters and band alone its own
    const named = drawnNames.filter(n => n.unit === undefined).map(n => ({ orig: [n.box], lines: [{ baseline: n.box.baseline, size: n.size, x0: n.x, x1: n.x + n.w }], erase: [[n.box.x0 - 0.3, n.box.bottom - 0.5, n.box.x1 + 0.3, n.box.top + 0.5]], chars: n.chars }))
    const namedInk = drawnNames.map(n => ({ orig: [n.box], chars: n.chars }))
    S.cur = { p, page, W, H, view, O, C, units, named, namedInk, kept, items, drawnText, recs, cut, textsDrawn: against?.texts ?? null, keptSegs: against?.keptSegs ?? null }
    return out
  },

  /** the pixel tier's measures of the page prepared last, its T plane the driver's screenshot (PNG, base64) */
  async analyse(b64) {
    const { p, W, H, view, O, C, units, named, namedInk, kept, items, drawnText, recs, cut, textsDrawn, keptSegs } = S.cur
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const tc = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true })
    tc.fillStyle = '#ffffff'
    tc.fillRect(0, 0, W, H)
    tc.drawImage(bmp, 0, 0, W, H)
    const T = tc.getImageData(0, 0, W, H).data
    S.cur.T = T
    const ref = S.ref[p] ?? []
    // (each drawn unit's own text lines as TeX's file has them, not held: what linesLeft reads, its placeholders kept in place aside)
    const ownLines = S.file ? recs.flatMap(r => (S.file.get(p)?.units.get(r.id)?.lines ?? []).filter(l => !l.held).map(l => ({ unit: r.id, box: l.box }))) : null
    const m = pixelPage({ k: K, view, W, H, O, C, T, units, names: named, kept, items, ref, drawnText, cut, ownLines, segs: keptSegs })
    // lost ink against what v0 accounts for
    const toPx = (x, y) => [(x - view[0]) * K, (view[3] - y) * K]
    const fill = (mask, x0, y0, x1, y1) => {
      const [ax, ay] = toPx(x0, y1), [bx, by] = toPx(x1, y0)
      for (let y = Math.max(0, Math.floor(Math.min(ay, by))); y < Math.min(H, Math.ceil(Math.max(ay, by))); y++) mask.fill(1, y * W + Math.max(0, Math.floor(Math.min(ax, bx))), y * W + Math.min(W, Math.ceil(Math.max(ax, bx))))
    }
    // and against what the strict rule accounts for (glyphsLost, the 2608.16117 survey: measure.mjs glyphAccounted), each
    // glyph's place read against TeX's file (its placeholders' segments and the unit's lines, the fixture's layout file's)
    const N = W * H, accounted = new Uint8Array(N), strict = new Uint8Array(N), band = new Uint8Array(N), barred = new Uint8Array(N)
    const both = (x0, y0, x1, y1) => { fill(accounted, x0, y0, x1, y1); fill(strict, x0, y0, x1, y1) }
    const fpage = S.file?.get(p)
    for (const r of recs) {
      const u = S.byId.get(r.id), prep = u?.prep
      if (!prep) continue
      const phs = fpage?.units.get(r.id)?.phs ?? [], own = (fpage?.units.get(r.id)?.lines ?? []).filter(l => !l.held).map(l => l.box)
      const within = (pt, boxes) => boxes.some(b => pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3])
      const inGap = new Set(), usedBy = new Map()
      for (const g of prep.gaps ?? []) for (const c of g.chars) if (!c.sep && !c.space) inGap.add(charKey(c))
      for (const res of prep.values()) if (res?.gap) for (const c of res.gap.chars) if (!c.sep && !c.space) usedBy.set(charKey(c), res)
      const laid = new Set((u.layout?.lines ?? []).flatMap(l => l.items).filter(it => it.t.ph === 'orig-text').map(it => it.t.k))
      for (const c of prep.uc ?? []) {
        if (c.page !== p || c.sep || c.space || !/\S/.test(c.ch)) continue
        const key = charKey(c), cat = prep.cat?.get(key)
        if (cat === 'acc') fill(accounted, c.x0, c.yb - 0.3 * c.size, c.x1, c.yb + 0.85 * c.size)
        else if (cat === 'keep') fill(barred, c.x0 - 0.3, c.yb - 0.3 * c.size - 0.3, c.x1 + 0.3, c.yb + 0.85 * c.size + 0.3)
        const res = usedBy.get(key), at = [(c.x0 + c.x1) / 2, c.yb + 0.3 * c.size]
        const ph = phs.find(x => within(at, x.segs))
        if (S.file && glyphAccounted({ cat, inSeg: !!ph, fromSource: !!ph && textsDrawn.has(`${r.id}|${ph.k}`), onLine: within(at, own), inGap: inGap.has(key), used: res?.mode ?? null, drawn: !!res && laid.has(res.k) })) fill(strict, c.x0, c.yb - 0.3 * c.size, c.x1, c.yb + 0.85 * c.size)
      }
      // (a label drawn in the target's name: its characters the unit's text, wherever they stand)
      if (prep.label?.drawn) for (const c of prep.label.chars) if (c.page === p) both(c.x0, c.yb - 0.3 * c.size, c.x1, c.yb + 0.85 * c.size)
      for (const rect of u.rects) {
        if (rect[0] !== p) continue
        const info = prep.lineInfo?.get(`${rect[0]}|${rect.slice(1).join()}`)
        const base = info?.baseline ?? rect[2] + 0.24 * (rect[4] - rect[2]), size = info?.size ?? (rect[4] - rect[2]) / 0.894
        fill(band, rect[1] - 0.5, base - 0.35 * size, rect[3] + 0.5, base + 0.95 * size)
      }
    }
    // (a crop's source: the legacy account its rectangle; the strict one what the crop carries, as the bites read it: the
    // boxes of its own ink it is cut through where it has them (device pixels), else the rectangle it shows whole)
    for (const a of S.run.audit) {
      if (a.what !== 'crop' || a.srcPage !== p) continue
      fill(accounted, a.src[0] - 0.3, a.src[1] - 0.3, a.src[2] + 0.3, a.src[3] + 0.3)
      if (!S.file) continue
      if (!a.clip?.length) { fill(strict, a.src[0] - 0.3, a.src[1] - 0.3, a.src[2] + 0.3, a.src[3] + 0.3); continue }
      for (const [x, y, w, h] of a.clip) for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(H, Math.ceil(y + h)); yy++) { const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(W, Math.ceil(x + w)); if (x1 > x0) strict.fill(1, yy * W + x0, yy * W + x1) }
    }
    // (a babel name drawn in the target's word: its characters its own text, its line's band its own, D1a)
    for (const n of namedInk) {
      for (const c of n.chars) both(c.x0, c.yb - 0.3 * c.size, c.x1, c.yb + 0.85 * c.size)
      for (const o of n.orig) fill(band, o.x0 - 0.5, o.baseline - 0.35 * o.size, o.x1 + 0.5, o.baseline + 0.95 * o.size)
    }
    for (const k of kept) fill(barred, k[0] - 0.3, k[1] - 0.3, k[2] + 0.3, k[3] + 0.3)
    const drawn = new Set(recs.map(r => r.id))
    for (const [id, , rects] of S.geometry.left.units) if (!drawn.has(id)) for (const r of rects) if (r[0] === p) fill(barred, r[1], r[2], r[3], r[4])
    const trace = i => 0.299 * O[4 * i] + 0.587 * O[4 * i + 1] + 0.114 * O[4 * i + 2] < 232
    // (each account grown over the ink connected to it within its lines' bands, never into a barred pixel)
    const grow = mask => {
      const stack = []
      for (let i = 0; i < N; i++) if (mask[i] === 1 && !barred[i] && trace(i)) { mask[i] = 2; stack.push(i) }
      while (stack.length) {
        const i = stack.pop(), x = i % W, y = (i - x) / W
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
          const j = yy * W + xx
          if (mask[j] === 2 || !band[j] || barred[j] || !trace(j)) continue
          mask[j] = 2
          stack.push(j)
        }
      }
    }
    grow(accounted)
    const lost = lostInk({ w: W, h: H, orig: O, copy: C, accounted, min: LOST_MIN, page: p })
    if (S.file) grow(strict)
    const glyphs = S.file ? lostInk({ w: W, h: H, orig: O, copy: C, accounted: strict, min: LOST_MIN, page: p }) : []
    S.lost = { lost, W, H, orig: O, copy: C, accounted }
    const [vx0, , , vy1] = view
    const boxesOf = list => list.slice(0, 8).map(l => [vx0 + l.box[0] / K, vy1 - l.box[3] / K, vx0 + l.box[2] / K, vy1 - l.box[1] / K].map(v => Math.round(v * 10) / 10))
    m.lostInk = { regions: lost.length, px: lost.reduce((a, l) => a + l.px, 0), boxes: boxesOf(lost) }
    if (S.file) m.glyphsLost = { regions: glyphs.length, px: glyphs.reduce((a, l) => a + l.px, 0), boxes: boxesOf(glyphs) }
    if (S.rm) m.removal = await removalMeasures(S.cur, T)
    return m
  },

  /** the progress image of the page prepared last (page.mjs's panel: four panels in a 2 x 2 grid, this run's the copy and
   *  its text over each other) */
  async panel({ pw, gap, labels, proto, previous }) {
    const { W, H, O, C, T } = S.cur
    const ph = Math.round((pw * H) / W), top = 30, cell = top + ph, w = 2 * pw + gap, h = 2 * cell + gap
    const full = new OffscreenCanvas(W, H), fctx = full.getContext('2d')
    const scaled = data => {
      fctx.putImageData(new ImageData(data, W, H), 0, 0)
      const c = new OffscreenCanvas(pw, ph), x = c.getContext('2d')
      x.imageSmoothingQuality = 'high'
      x.drawImage(full, 0, 0, pw, ph)
      return c
    }
    const engine = new Uint8ClampedArray(C.length)
    for (let i = 0; i < C.length; i++) engine[i] = Math.min(C[i], T[i])
    const image = async url => { if (!url) return null; try { return await createImageBitmap(await (await fetch(url)).blob()) } catch { return null } }
    const panels = [scaled(new Uint8ClampedArray(O)), await image(proto), scaled(engine), await image(previous)]
    const out = new OffscreenCanvas(w, h), ctx = out.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.font = '18px -apple-system, "Helvetica Neue", Arial, sans-serif'
    ctx.textBaseline = 'middle'
    panels.forEach((pnl, i) => {
      const x = (i % 2) * (pw + gap), y = Math.floor(i / 2) * (cell + gap)
      ctx.fillStyle = '#333333'
      ctx.fillText(labels[i], x + 2, y + top / 2, pw - 4)
      if (pnl) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(pnl, x, y + top, pw, ph) }
      else { ctx.fillStyle = '#f2f2f2'; ctx.fillRect(x, y + top, pw, ph) }
      ctx.strokeStyle = '#d0d0d0'
      ctx.strokeRect(x + 0.5, y + top + 0.5, pw - 1, ph - 1)
    })
    const b64 = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = ''; for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000)); return btoa(s) }
    return { w, h, rgba: b64(out), engine: { w: pw, h: ph, rgba: b64(panels[2]) } }
  },

  /** the lost-ink regions of the page analysed last, for a look (--debug-lost): page.mjs's */
  lostLook(max = 6, pad = 24) {
    const { lost, W, H, orig, copy, accounted } = S.lost
    return lost.slice(0, max).map(l => {
      const x0 = Math.max(0, l.box[0] - pad), y0 = Math.max(0, l.box[1] - pad), x1 = Math.min(W, l.box[2] + pad), y1 = Math.min(H, l.box[3] + pad)
      const w = x1 - x0, h = y1 - y0, out = new Uint8ClampedArray(w * (2 * h + 2) * 4).fill(255)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = 4 * ((y0 + y) * W + x0 + x), a = accounted[(y0 + y) * W + x0 + x], inBox = x0 + x >= l.box[0] && x0 + x < l.box[2] && y0 + y >= l.box[1] && y0 + y < l.box[3]
        for (let c = 0; c < 3; c++) {
          out[4 * (y * w + x) + c] = orig[i + c]
          out[4 * ((y + h + 2) * w + x) + c] = Math.min(copy[i + c], a && c !== 2 ? 200 : 255, inBox && c !== 0 ? 120 : 255)
        }
      }
      return { w, h: 2 * h + 2, rgba: btoa(String.fromCharCode.apply(null, out)), box: l.box, px: l.px }
    })
  },

  /** what --dump writes: the lay order, the records (no timings), the audit, and each page's digests */
  dump() {
    const { run } = S
    // (each laid unit's resolutions, for a look at what a source made of it)
    const units = run.placed.map(laidOf).filter(p => p.prep).map(p => ({ id: p.id, source: p.tex ? 'tex' : 'v0', rects: p.rects, label: p.prep.label?.text, labelChars: p.prep.label?.chars.map(c => [c.ch, Math.round(c.x0 * 100) / 100, Math.round(c.x1 * 100) / 100, Math.round(c.yb * 100) / 100, Math.round(c.size * 100) / 100]), keep: p.prep.keep, res: [...p.prep.values()].map(r => ({ k: r.k, mode: r.mode, src: r.src?.slice(0, 60), text: r.text, crop: r.crop, baseline: r.baseline, gap: r.gap?.text, chars: r.gap?.chars.filter(c => !c.sep && !c.space).map(c => [c.ch, Math.round(c.x0 * 100) / 100, Math.round(c.yb * 100) / 100, Math.round(c.size * 100) / 100]) })) }))
    // (the babel names, drawn or why not, without their characters: D1a)
    const names = (run.names ?? []).map(({ chars, ...n }) => n)
    return { order: run.order, stats: run.stats.map(({ ms, ...r }) => r), skipped: run.skipped, audit: run.audit, pages: (S.dump ?? []).map(({ check, ...d }) => d), checks: (S.dump ?? []).map(d => ({ p: d.p, ...d.check })), units, names }
  },

  /** the fixture's laid units, counted: v0 lays every unit it places (past its floor it clips), by its fit's knob */
  /**
   * A done page's costs (--perf): its first drawing (v0's page step, `pageMs`: its original drawn, its units laid and
   * painted, and over the text-removed PDF its ink read; `times`, the engine's own split where it gives one; then its
   * drawing at the gate's resolution, drawCopy, which draws the removed page there itself: `copy`), its drawing again at a zoom (`zoomK`, twice the gate's device pixels a unit: the original drawn there
   * by PDF.js, then the page's drawing at that resolution, drawCopy, which draws the removed and placeholders' pages there
   * itself), and the canvases its drawing holds (bytes: v0's own at the gate's resolution, its copy, the removed pages)
   */
  async perf(p) {
    const { run, doc } = S
    const page = await doc.getPage(p)
    // the page's drawing at the gate's own resolution, over the page as PDF.js draws it there, as a reader draws its view
    // (v0 keeps no copy, and lets its original go once the page's ink is read: only the drawing is timed, not the render)
    const vp1 = page.getViewport({ scale: K })
    const first = document.createElement('canvas'), source = document.createElement('canvas')
    for (const c of [first, source]) { c.width = Math.floor(vp1.width); c.height = Math.floor(vp1.height) }
    await page.render({ canvas: source, canvasContext: source.getContext('2d'), viewport: vp1 }).promise
    let t = performance.now()
    await run.drawCopy(p, first.getContext('2d'), source, K)
    const copyMs = performance.now() - t
    for (const c of [first, source]) { c.width = 0; c.height = 0 }
    const zoomK = 2 * K
    const vp = page.getViewport({ scale: zoomK })
    const src = document.createElement('canvas'), dst = document.createElement('canvas')
    for (const c of [src, dst]) { c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height) }
    t = performance.now()
    await page.render({ canvas: src, canvasContext: src.getContext('2d'), viewport: vp }).promise
    const zoomRender = performance.now() - t
    t = performance.now()
    await run.drawCopy(p, dst.getContext('2d'), src, zoomK)
    const zoomCopy = performance.now() - t
    for (const c of [src, dst]) { c.width = 0; c.height = 0 }
    let canvasBytes = 0
    const add = c => { if (c) canvasBytes += 4 * c.width * c.height }
    for (const r of run.rows) { add(r.left); add(r.right) }
    for (let q = 1; q <= run.rows.length; q++) add(run.removedCanvas?.(q))
    const r1 = v => Math.round(v * 10) / 10
    const times = run.pageTimes?.[p] ? Object.fromEntries(Object.entries(run.pageTimes[p]).map(([k, v]) => [k, r1(v)])) : null
    return { firstDraw: r1((run.pageMs[p] ?? 0) + copyMs), step: r1(run.pageMs[p] ?? 0), copy: r1(copyMs), times, zoomRender: r1(zoomRender), zoomCopy: r1(zoomCopy), canvasBytes, heap: performance.memory?.usedJSHeapSize ?? null }
  },

  async summary() {
    const { run } = S
    // (--parts: every part taken and end(); then the hybrid's pieces take read from the rows' k against the units file's,
    // the rows that came late, and each unit left whose why was read before its row was)
    let parts = null
    if (S.parts) {
      await S.parts.fed
      const got = S.parts.pieces, want = S.parts.want
      const pieces = got ? [...new Set([...got.keys(), ...want.keys()])].filter(id => JSON.stringify(got.get(id)) !== JSON.stringify(want.get(id))) : []
      const laid = new Set(run.order), final = new Map(run.skipped.filter(x => !laid.has(x.id)).map(x => [x.id, x.why]))
      const whys = S.parts.whys.filter(([, id, why]) => (final.get(id) ?? 'unanchored') !== why)
      parts = { count: S.parts.count, late: run.late(), pieces, whys }
    }
    const knob = {}, scales = []
    for (const r of run.stats) { knob[r.knob] = (knob[r.knob] ?? 0) + 1; scales.push(r.fitScale) }
    scales.sort((a, b) => a - b)
    const why = {}
    for (const s of run.skipped) why[s.why] = (why[s.why] ?? 0) + 1
    const ms = [...run.ms.values()]
    const checker = { lost: 0, missing: 0, twice: 0, brackets: 0 }
    for (const c of S.checks) for (const k of Object.keys(checker)) checker[k] += c[k]
    // (the units drawn: laid and recorded; a unit placed may still be left the original's, run.mjs's refusals)
    const drawnIds = new Set(run.stats.map(r => r.id))
    return {
      laid: run.stats.length, fit: run.stats.length, unfit: 0, why, knob, located: S.geometry.left.units.length,
      // the lines TeX's rule opened, and those it would have where the paper has no values for it (layer2.mjs Layout)
      linesOpened: run.stats.reduce((a, r) => a + (r.opened ?? 0), 0), linesUnopened: run.stats.reduce((a, r) => a + (r.unopened ?? 0), 0),
      fullSize: scales.length ? scales.filter(s => s >= 1 - 1e-9).length / scales.length : null,
      medianScale: scales.length ? scales[Math.floor(scales.length / 2)] : null,
      page1Ms: run.pageMs[1] ?? null, slowestUnitMs: ms.length ? Math.max(...ms) : null,
      faces: Object.values(run.designs), failedFaces: [], errors: 0, order: run.order.length, ownChecker: checker,
      // the hybrid: the units each source's geometry draws, and why the others are v0's
      ...(run.sources?.tex.length || run.sources?.v0.length ? { sources: { tex: run.sources.tex.length, v0: run.sources.v0.length, v0Drawn: run.sources.v0.filter(id => drawnIds.has(id)).length, texOnly: run.sources.texOnly ?? 0, why: run.sources.why, texIds: run.sources.tex } } : {}),
      // whether v0 left its inputs (the geometry and the units) as they were given
      inputsChanged: S.inputs.of() !== S.inputs.before,
      ...(parts ? { parts } : {}),
      // (the units whose record could not be made: drawn, and measured by nothing, so a failure of the gate's)
      ...(run.recordErrors?.length ? { recordErrors: run.recordErrors.length } : {}),
    }
  },
}
window.gateReady = true
