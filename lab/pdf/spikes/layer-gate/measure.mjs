// experiments/pdf-bilingual/spikes/layer-gate/measure.mjs
// The fidelity measures of one page against the original (Plan 8b, Task 12; the parity report's §1 and §6), ported from
// the parity harness (scratchpad parity/harness/analysis.js, 2026-10-06) with its thresholds unchanged, split in two:
// - modelPage: what needs no pixels — the units left as the original and why, the frames' fill, foot, pitch and size
//   against the original's, the page text drawn wider than its placeholder, the crops whose source holds another line's
//   text, and the drawn text area in cells (the model tier's denominator);
// - pixelPage: what needs the planes — O (the original, rendered), C (the copy: erased and cropped, before the text) and
//   T (the translation's text alone) at `k` device pixels a PDF unit — the coverage of the original's text area (its ink
//   in O and C, against the drawing's geometry: T's ink, which a face's stroke weight moves, counts in no cell), overlap,
//   stray text, residue, erase bites, crops shown twice, math that vanished, graphics erased or overdrawn.
// Every result is a number or a list of numbers and unit ids: nothing of the paper's text leaves here.
//
// Inputs, in PDF units (y up) unless named px:
//   units: every translated unit with a frame on the page: { id, kind, drawn, why, orig: [{ x0, x1, baseline, top, bottom,
//     size }] (its lines in the original: the frozen reference's where it has them), lines: [{ baseline, size, x0, x1 }]
//     (as laid, on this page), erase: [[x0, y0, x1, y1]], crops: [{ k, src: [x0, y0, x1, y1], dst: [..] }],
//     pageText: [{ w, segW }], phs: [{ kind, status }], own: the lines it draws beside its own (a label in the target's
//     name), as orig's, for the erase bites alone };
//   ref: every unit of the frozen reference on the page, translated or not: { id, kind, orig };
//   kept: rectangles a drawing must keep (displays' segments, labels); items: the page's text items { x0, y0, x1, y1, str,
//   math } (str is read here and never returned).

const lum = (a, i) => a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114
/** a value to d decimals, as the parity harness's toFixed */
const rd = (v, d) => +v.toFixed(d)
const INK = 160, TRACE = 232
/** the kinds whose frames are body text (the scorer's BODY_KINDS, layer/page.mjs EVEN_KINDS) */
/**
 * What the wire formats' syntax leaves in a translation's text when it is not read back (mt.mjs; the protector's
 * src/core/protector/tokens.ts): on the markers wire a marker (`@a#`, MARKER_RE), its `#` alone (the source's text holds
 * none: TeX's `\#` and a bare `#` are placeholders, so any `#` came from a marker), what a tolerant reading takes for a
 * marker without its `#` (`@a` before no letter, of an id's length), the escaped `@` (`@@`), an entity the reading did
 * not decode (`&amp;`, `&#39;`, escape and decode); on the tags wire a tag (`<x id="1"/>`, `<t id="1">`, `</t>`,
 * TAG_RE's spellings). Returns the matches
 */
const RESIDUE = /&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);|<\s*\/?\s*[xt](?:\s+id\s*=[^>]*)?\s*\/?\s*>|@@|@[a-z]{1,2}#*(?![a-z])|#+/gi
export const markerResidueOf = text => [...String(text).matchAll(RESIDUE)].map(m => m[0])
/** TeX's special characters, each with the source's escapes of it: a placeholder drawn from its source (layer2.mjs
 *  texToText2: 'source', 'symbol', a citation's map) shows one only as its source escapes it (\& is "&", \{ is "{"); any
 *  other is markup the rendering left (a control symbol's backslash, a math shift, a grouping brace, an alignment tab) */
const SPECIALS = [
  ['\\', /\\(?:textbackslash|backslash)(?![A-Za-z])/g],
  ['{', /\\(?:\{|lbrace(?![A-Za-z])|textbraceleft(?![A-Za-z]))/g],
  ['}', /\\(?:\}|rbrace(?![A-Za-z])|textbraceright(?![A-Za-z]))/g],
  ['$', /\\(?:\$|textdollar(?![A-Za-z]))/g],
  ['&', /\\&/g],
  ['#', /\\#/g],
  ['%', /\\%/g],
  ['~', /\\textasciitilde(?![A-Za-z])/g],
]
/** TeX's syntax a placeholder's rendering `text` left of its source `src`: each special character beyond the source's
 *  escapes of it, as often as it is left */
export const markupResidueOf = (text, src) => {
  const out = []
  for (const [c, escaped] of SPECIALS) {
    const left = String(text).split(c).length - 1 - (String(src).match(escaped)?.length ?? 0)
    for (let i = 0; i < left; i++) out.push(c)
  }
  return out
}

export const BODY = new Set(['para', 'abstract', 'theorem'])
/** a math font by its name, as fonts are named in TeX's PDFs */
export const MATH_FONT = /CMMI|CMSY|CMEX|CMBSY|CMMIB|MSAM|MSBM|EUFM|EUSM|RSFS|LMMath|STIX|txsy|txmi|txex|pxsy|pxmi|pxex|rtxmi|rtxsy|MathJax|cmmi|cmsy|cmex|NewCMMath|Asana|Cambria Math/i

/** a unit's original lines in frames: runs of lines on one page and column, in order */
export function frameGroups(orig) {
  const out = []
  for (const l of orig) {
    const cur = out.at(-1)
    const same = cur && Math.abs((l.x0 + l.x1) / 2 - cur.cx) < 0.5 * (cur.x1 - cur.x0 + l.x1 - l.x0) && l.baseline < cur.last + 1 && cur.last - l.baseline < 4 * l.size
    if (same) { cur.lines.push(l); cur.last = l.baseline; cur.bottom = Math.min(cur.bottom, l.bottom); cur.x0 = Math.min(cur.x0, l.x0); cur.x1 = Math.max(cur.x1, l.x1); cur.cx = (cur.x0 + cur.x1) / 2 }
    else out.push({ lines: [l], first: l.baseline, last: l.baseline, top: l.top, bottom: l.bottom, x0: l.x0, x1: l.x1, cx: (l.x0 + l.x1) / 2, size: l.size })
  }
  for (const f of out) {
    f.n = f.lines.length
    const gaps = f.lines.slice(1).map((l, i) => f.lines[i].baseline - l.baseline).filter(g => g > 0).sort((a, b) => a - b)
    f.pitch = gaps.length ? gaps[gaps.length >> 1] : 1.2 * f.size
  }
  return out
}
const framesOf = orig => frameGroups(orig).map(f => [f.x0, f.bottom, f.x1, f.top])
/** a frame's drawn lines: those of the unit within its band and columns */
const inBand = (l, fr) => l.baseline <= fr.top + 2 && l.baseline >= fr.bottom - 6 * fr.size && l.x0 < fr.x1 - 2 && l.x1 > fr.x0 + 2
/** each frame's drawn lines (inBand), and a line in no frame's band but above one in its column, within ten of its
 *  pitches, that frame's nearest (a unit moved up by the leftover packed, D6's F6c, its top off its original's line) */
function linesOfFrames(u, frames) {
  const out = frames.map(fr => u.lines.filter(l => inBand(l, fr)))
  for (const l of u.lines) {
    if (frames.some(fr => inBand(l, fr))) continue
    let at = -1
    frames.forEach((fr, i) => { if (l.x0 < fr.x1 - 2 && l.x1 > fr.x0 + 2 && l.baseline > fr.top && l.baseline - fr.top <= 10 * fr.pitch && (at < 0 || fr.top > frames[at].top)) at = i })
    if (at >= 0) out[at].push(l)
  }
  return out
}

/** the grid the coverage counts in: per frame, cells one pitch high and one em wide over its lines */
function* cellsOf(orig) {
  for (const fr of frameGroups(orig)) {
    const em = fr.size, pitch = Math.max(fr.pitch, 0.9 * em)
    const top = fr.first + 0.78 * em, bottom = fr.last - 0.25 * em
    for (let y1 = top; y1 > bottom + 0.05; y1 -= pitch) {
      const y0 = Math.max(bottom, y1 - pitch)
      for (let x0 = fr.x0; x0 < fr.x1 - 0.05; x0 += em) yield [x0, y0, Math.min(fr.x1, x0 + em), y1]
    }
  }
}

/**
 * The model tier's measures of a page: { units, fills, geo, wrongPageText, droppedPh, cropForeign, modelCells }.
 * `translated` holds the ids of the units with a translation, `located` those the engine's layout locates on the page
 */
export function modelPage({ units, ref, items, translated }) {
  const drawnIds = new Set(units.filter(u => u.drawn).map(u => u.id))
  const byId = new Map(units.map(u => [u.id, u]))
  // the units left as the original: every translated reference unit on the page (no author, no figure), drawn or not, and
  // why; cells apart
  const counts = { textOn: 0, textDrawn: 0, cellsOn: 0, cellsDrawn: 0, left: {} }
  for (const r of ref) {
    if (!translated.has(r.id) || r.kind === 'author' || r.kind === 'figure') continue
    const drawn = drawnIds.has(r.id)
    if (r.kind === 'cell') { counts.cellsOn++; if (drawn) counts.cellsDrawn++; continue }
    counts.textOn++
    if (drawn) { counts.textDrawn++; continue }
    const why = byId.get(r.id)?.why ?? 'unlocated'
    counts.left[why] = (counts.left[why] ?? 0) + 1
  }
  const drawn = units.filter(u => u.drawn)
  // fill: how far down its frame each drawn unit's text reaches; and the frame's top, foot, pitch and size against the
  // original's
  const fills = [], geo = []
  for (const u of drawn) {
    const frames = frameGroups(u.orig), framed = linesOfFrames(u, frames)
    for (const [fi, fr] of frames.entries()) {
      const mine = framed[fi].sort((a, b) => b.baseline - a.baseline)
      if (!mine.length) { fills.push({ kind: u.kind, n: fr.n, fill: 0 }); continue }
      const f = mine[0].size, dLast = mine.at(-1).baseline
      const top = fr.first + 0.75 * fr.size, bottom = fr.last - 0.25 * fr.size
      fills.push({ kind: u.kind, n: fr.n, fill: rd((top - (dLast - 0.25 * f)) / (top - bottom), 3) })
      const oTop = fr.first + 0.75 * fr.size, oBottom = fr.last - 0.22 * fr.size
      const dTop = mine[0].baseline + 0.75 * f, dBottom = dLast - 0.22 * f
      const gaps = mine.slice(1).map((l, i) => mine[i].baseline - l.baseline).filter(g => g > 0.1).sort((a, b) => a - b)
      const dPitch = gaps.length ? gaps[gaps.length >> 1] : null
      // (the rhythm a reader sees, pageDrift's: the drawn gaps between consecutive lines of one flow segment, never across a
      // held block, a display between two, against the original's gaps of no more than half again its closest, which a
      // display's room is not)
      const seg = mine.slice(1).map((l, i) => (l.block !== undefined && l.block === mine[i].block ? mine[i].baseline - l.baseline : null)).filter(g => g !== null && g > 0.1).sort((a, b) => a - b)
      const og = fr.lines.slice(1).map((l, i) => fr.lines[i].baseline - l.baseline).filter(g => g > 0.1)
      const oLine = og.length ? og.filter(g => g <= 1.5 * Math.min(...og)).sort((a, b) => a - b) : []
      // rounded as the parity harness rounded them (its floor was taken so): a frame 0.996 lines short is one line short
      geo.push({
        id: u.id, kind: u.kind, n: fr.n,
        dTop: rd(dTop - oTop, 2), blank: rd((dBottom - oBottom) / fr.pitch, 2),
        dRight: rd(Math.max(...mine.map(l => l.x1)) - fr.x1, 2),
        pitch: dPitch && fr.n > 1 ? rd(dPitch / fr.pitch, 3) : null,
        rhythm: seg.length && oLine.length ? rd(seg[seg.length >> 1] / oLine[oLine.length >> 1], 3) : null,
        onGrid: rd(mine.filter(l => fr.lines.some(o => Math.abs(o.baseline - l.baseline) < 0.5)).length / mine.length, 2),
        scale: rd(f / fr.size, 3),
      })
    }
  }
  // page text drawn 1.3 times or more as wide as its placeholder's segments; a visible math or citation the drawing has
  // no row for
  let wrongPageText = 0, droppedPh = 0
  for (const u of drawn) {
    for (const t of u.pageText ?? []) if (t.segW > 0 && t.w > 1.3 * t.segW) wrongPageText++
    for (const q of u.phs ?? []) if ((q.status === 'norow' || q.status === 'empty') && (q.kind === 'math' || q.kind === 'cite')) droppedPh++
  }
  // crops whose source box holds a text item of a line above or below it (a crop cut from the placeholders' page, the
  // text-removed PDF's, holds no line's text whatever its box: its foreign ink is the pixel tier's, cropForeignInk)
  let cropForeign = 0
  for (const u of drawn) for (const c of u.crops) {
    if (c.plane === 'P') continue
    const [x0, y0, x1, y1] = c.src
    if (items.some(it => {
      const base = it.y0 + 0.22 * (it.y1 - it.y0)
      const w = Math.min(x1, it.x1) - Math.max(x0, it.x0), h = Math.min(y1, it.y1) - Math.max(y0, it.y0)
      return w > 1 && h > 0.8 && (base < y0 - 0.2 || base > y1 + 0.2) && !it.math
    })) cropForeign++
  }
  // the drawn text area in cells: the model tier's denominator for its defect rates
  let modelCells = 0
  for (const u of drawn) if (u.kind !== 'cell' && u.kind !== 'author' && u.kind !== 'figure') for (const _ of cellsOf(u.orig)) modelCells++
  return { units: counts, fills, geo, gaps: paraGapsOf(drawn, ref, items), wrongPageText, droppedPh, cropForeign, modelCells }
}

/**
 * The gaps between paragraphs (D6, 2026-10-08): for two drawn body frames one above the other in a column, with nothing
 * between them, the gap drawn from the upper's foot to the lower's top against the original's. A foot is its frame's last
 * baseline less 0.22 of its size, a top its first plus 0.75 (geo's own). Nothing between: no other frame of the page's
 * reference, no text item (a display), and no more than three of the upper's pitches of the original's (a graphic's room).
 * Each gap's `ratio`, drawn ÷ original, and its `extra`, the drawn gap's excess in the upper frame's original pitches.
 * A frame drawn short of its original's last line adds its blank to the gap below it, which no frame measure sees
 */
export function paraGapsOf(drawn, ref, items) {
  const span = (a, b) => [Math.max(a.x0, b.x0), Math.min(a.x1, b.x1)]
  const all = []
  for (const r of ref) frameGroups(r.orig).forEach((f, i) => all.push({ key: `${r.id}|${i}`, x0: f.x0, x1: f.x1, top: f.first + 0.75 * f.size, foot: f.last - 0.22 * f.size }))
  const body = []
  for (const u of drawn) {
    if (!BODY.has(u.kind)) continue
    const frames = frameGroups(u.orig), framed = linesOfFrames(u, frames)
    frames.forEach((fr, i) => {
      const mine = framed[i].sort((a, b) => b.baseline - a.baseline)
      if (!mine.length) return
      body.push({ key: `${u.id}|${i}`, x0: fr.x0, x1: fr.x1, pitch: fr.pitch, top: fr.first + 0.75 * fr.size, foot: fr.last - 0.22 * fr.size, dTop: mine[0].baseline + 0.75 * mine[0].size, dFoot: mine.at(-1).baseline - 0.22 * mine.at(-1).size })
    })
  }
  const out = []
  for (const a of body) {
    // the nearest drawn body frame below it in its column (overlapping half the narrower's width)
    let b = null
    for (const c of body) {
      if (c === a || c.top >= a.foot) continue
      const [x0, x1] = span(a, c)
      if (x1 - x0 < 0.5 * Math.min(a.x1 - a.x0, c.x1 - c.x0)) continue
      if (!b || c.top > b.top) b = c
    }
    if (!b) continue
    const g0 = a.foot - b.top
    if (!(g0 > 0) || g0 > 3 * a.pitch) continue
    const [x0, x1] = span(a, b)
    const between = all.some(f => f.key !== a.key && f.key !== b.key && Math.min(x1, f.x1) - Math.max(x0, f.x0) > 1 && f.foot < a.foot && f.top > b.top)
      || items.some(it => { const cy = (it.y0 + it.y1) / 2; return Math.min(x1, it.x1) - Math.max(x0, it.x0) > 1 && cy < a.foot && cy > b.top })
    if (between) continue
    const g = a.dFoot - b.dTop
    out.push({ ratio: rd(g / g0, 3), extra: rd((g - g0) / a.pitch, 3) })
  }
  return out
}

/** 4-connected components of a mask, counted by size: their count; with `boxes`, the first BOXES regions' device-pixel
 *  boxes and sizes pushed to it ([x0, y0, x1, y1, px]: where a regression is, for a look) */
const BOXES = 8
function components(m, W, H, min, boxes = null) {
  const seen = new Uint8Array(W * H), stack = []
  let regions = 0
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || seen[s]) continue
    let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1
    stack.push(s); seen[s] = 1
    while (stack.length) {
      const i = stack.pop(), x = i % W
      n++
      if (boxes) { const y = (i - x) / W; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      if (x > 0 && m[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1) }
      if (x < W - 1 && m[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1) }
      if (i >= W && m[i - W] && !seen[i - W]) { seen[i - W] = 1; stack.push(i - W) }
      if (i + W < W * H && m[i + W] && !seen[i + W]) { seen[i + W] = 1; stack.push(i + W) }
    }
    if (n >= min) { regions++; if (boxes && boxes.length < BOXES) boxes.push([x0, y0, x1 + 1, y1 + 1, n]) }
  }
  return regions
}

/**
 * The pixel tier's measures of a page: { coverage: { text, cells } (each { cells, translated, english, blank }), neutral,
 * overlap, overlapOrig, overlapPx, stray, residue, residuePx, doubled, vanished, bites, bitePx, graphics: { px, erased,
 * overdrawn } }. `drawnText`: every drawn run's text on the page, joined without white space (math the drawing sets as
 * text is not vanished)
 */
export function pixelPage({ k, view, W, H, O, C, T, units, kept, items, ref, drawnText }) {
  const toPx = (x, y) => [(x - view[0]) * k, (view[3] - y) * k]
  const boxPx = (b, pad = 0) => {
    const [ax, ay] = toPx(b[0] - pad, b[3] + pad), [bx, by] = toPx(b[2] + pad, b[1] - pad)
    return [Math.max(0, Math.floor(Math.min(ax, bx))), Math.max(0, Math.floor(Math.min(ay, by))), Math.min(W, Math.ceil(Math.max(ax, bx))), Math.min(H, Math.ceil(Math.max(ay, by)))]
  }
  const mask = () => new Uint8Array(W * H)
  const paint = (m, b, pad = 0, v = 1) => { const [x0, y0, x1, y1] = boxPx(b, pad); for (let y = y0; y < y1; y++) m.fill(v, y * W + x0, y * W + x1) }
  const inkO = i => lum(O, 4 * i) < INK, traceO = i => lum(O, 4 * i) < TRACE
  const inkC = i => lum(C, 4 * i) < INK, traceC = i => lum(C, 4 * i) < TRACE
  const inkT = i => lum(T, 4 * i) < INK

  const drawn = units.filter(u => u.drawn)
  const eraseM = mask(), cropM = mask(), keptM = mask(), regionM = mask()
  for (const u of drawn) {
    for (const e of u.erase) paint(eraseM, e, 2)
    for (const c of u.crops) paint(cropM, c.dst, 0.3)
    for (const fb of framesOf(u.orig)) paint(regionM, fb, 1)
  }
  for (const b of kept) paint(keptM, b, 0.6)
  // formula lines: items on one baseline where math-font items or '=' cover more than 0.35 of the width. Neutral for
  // the coverage, and intact there is kept, not stray
  const lineGroups = []
  for (const it of items) {
    const size = it.y1 - it.y0, base = it.y0 + 0.22 * size
    let g = lineGroups.find(g => Math.abs(g.base - base) < 0.35 * Math.max(g.size, size))
    if (!g) lineGroups.push((g = { base, size, items: [] }))
    g.items.push(it)
  }
  const formulaM = mask(), formula = new Set()
  for (const g of lineGroups) {
    const w = g.items.reduce((a, it) => a + (it.x1 - it.x0), 0)
    const mw = g.items.reduce((a, it) => a + (it.math || /=/.test(it.str) ? it.x1 - it.x0 : 0), 0)
    if (w > 0 && mw / w > 0.35) for (const it of g.items) { formula.add(it); paint(formulaM, [it.x0, it.y0, it.x1, it.y1], 0.6) }
  }

  // overlap: the translation's text over ink the copy still shows (unerased original, or a crop)
  const ov = mask()
  let overlapPx = 0
  for (let i = 0; i < W * H; i++) if (inkT(i) && inkC(i)) { ov[i] = 1; overlapPx++ }
  const where = { overlap: [], residue: [], bites: [], doubled: [] }
  const overlap = components(ov, W, H, 6, where.overlap)
  const ovOrig = mask()
  for (let i = 0; i < W * H; i++) if (ov[i] && !cropM[i]) ovOrig[i] = 1
  const overlapOrig = components(ovOrig, W, H, 6)

  // the original's text items inside a drawn unit's frames: intact (stray), partly erased (residue), erased
  const strayItems = []
  for (const it of items) {
    const [px, py] = toPx((it.x0 + it.x1) / 2, it.y0 + 0.4 * (it.y1 - it.y0))
    const ci = Math.round(py) * W + Math.round(px)
    if (ci < 0 || ci >= W * H || !regionM[ci]) continue
    const [x0, y0, x1, y1] = boxPx([it.x0, it.y0, it.x1, it.y1])
    let o = 0, s = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x
      if (cropM[i] || keptM[i] || inkT(i) || !inkO(i)) continue
      o++
      if (traceC(i)) s++
    }
    if (o >= 6 && s / o >= 0.7) strayItems.push(it)
  }
  const stray = strayItems.filter(it => !it.math && !formula.has(it) && /\p{L}{2,}/u.test(it.str)).length

  // residue: the original's ink left visible inside the erase (2 pt around it), not kept, not a crop, not an intact item
  const intactM = mask()
  for (const it of strayItems) paint(intactM, [it.x0, it.y0, it.x1, it.y1], 0.3)
  const res = mask()
  let residuePx = 0
  for (let i = 0; i < W * H; i++) {
    if (!eraseM[i] || cropM[i] || keptM[i] || intactM[i] || inkT(i)) continue
    if (traceO(i) && traceC(i)) { res[i] = 1; residuePx++ }
  }
  const residue = components(res, W, H, 3, where.residue)

  // crops shown twice: the source still showing in the copy where a crop of it is drawn
  let doubled = 0
  for (const u of drawn) for (const c of u.crops) {
    const [x0, y0, x1, y1] = boxPx(c.src)
    let o = 0, s = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (cropM[i]) continue; if (inkO(i)) { o++; if (inkC(i)) s++ } }
    if (o >= 8 && s / o >= 0.6) { doubled++; if (where.doubled.length < BOXES) where.doubled.push(c.src.map(v => Math.round(v * 10) / 10).concat(u.id)) }
  }

  // math erased and drawn nowhere: a math-font item mostly inside a drawn unit's erase, gone from the copy, under no
  // crop's source and no kept rectangle, and not drawn as text anywhere on the page
  const srcM = mask()
  for (const u of drawn) for (const c of u.crops) paint(srcM, c.src, 0.4)
  let vanished = 0
  for (const it of items) {
    if (!it.math) continue
    const [x0, y0, x1, y1] = boxPx([it.x0, it.y0, it.x1, it.y1])
    let o = 0, gone = 0, inErase = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x
      if (!inkO(i)) continue
      o++
      if (eraseM[i]) inErase++
      if (cropM[i]) continue
      if (!traceC(i) && !srcM[i] && !keptM[i]) gone++
    }
    const asText = (drawnText ?? '').includes(it.str.replace(/\s+/g, ''))
    if (o >= 6 && inErase / o > 0.5 && gone / o > 0.5 && !asText) vanished++
  }

  // the coverage of the original's text area: each reference unit's frames as a grid of one pitch by one em. A cell
  // where the original has ink is translated where the drawn text covers half of it or more; still the original's text
  // (English) where 0.3 of that ink still shows in the copy outside what is drawn; else blank. A cell over a kept display,
  // a label or a formula line is neutral. What is drawn is read from the drawing's own geometry, never from its ink: each
  // drawn line's box (from its first item to its last, 0.25 em below its baseline to 0.75 em above) and each crop's
  // place. A face's stroke weight then moves no cell (a lighter face set on the same lines covers the same cells), nor
  // does a fraction of a pixel in where the text is put; a line set shorter or lower does. Text and table cells apart
  const drawnM = mask()
  for (const u of drawn) {
    for (const l of u.lines) paint(drawnM, [l.x0, l.baseline - 0.25 * l.size, l.x1, l.baseline + 0.75 * l.size])
    for (const c of u.crops) paint(drawnM, c.dst)
  }
  const coverage = { text: { cells: 0, translated: 0, english: 0, blank: 0 }, cells: { cells: 0, translated: 0, english: 0, blank: 0 } }
  let neutral = 0
  for (const r of ref) {
    if (r.kind === 'author' || r.kind === 'figure') continue
    const tally = r.kind === 'cell' ? coverage.cells : coverage.text
    for (const cell of cellsOf(r.orig)) {
      const [a, b, c, d] = boxPx(cell)
      let n = 0, covered = 0, o = 0, e = 0, keptInk = 0
      for (let y = b; y < d; y++) for (let x = a; x < c; x++) {
        const i = y * W + x
        n++
        if (drawnM[i]) covered++
        if (!inkO(i)) continue
        o++
        if (keptM[i] || formulaM[i]) keptInk++
        else if (inkC(i) && !drawnM[i]) e++
      }
      if (o < 3) continue
      if (keptInk > 0.5 * o) { neutral++; continue }
      tally.cells++
      if (covered >= 0.5 * n) tally.translated++
      else if (e >= 0.3 * o) tally.english++
      else tally.blank++
    }
  }

  // erase bites: the original's ink erased outside every drawn unit's own lines (its glyphs' bands, and those it draws
  // anew beside them, `own`: a float's label set in the target's name) and under no crop: ink of a line, a formula or a
  // figure no drawn unit owns, destroyed
  const ownM = mask(), eraseRaw = mask()
  for (const u of drawn) {
    for (const l of [...u.orig, ...(u.own ?? [])]) paint(ownM, [l.x0 - 1, l.baseline - 0.3 * l.size, l.x1 + 1, l.baseline + 0.88 * l.size])
    for (const e of u.erase) paint(eraseRaw, e, 0)
  }
  const bite = mask()
  let bitePx = 0
  for (let i = 0; i < W * H; i++) if (eraseRaw[i] && !ownM[i] && !cropM[i] && inkO(i) && !traceC(i)) { bite[i] = 1; bitePx++ }
  const bites = components(bite, W, H, 4, where.bites)

  // graphics: the original's ink that is no text (outside every text item and every reference line), erased or written over
  const textM = mask()
  for (const it of items) paint(textM, [it.x0, it.y0, it.x1, it.y1], 1)
  for (const r of ref) for (const l of r.orig) paint(textM, [l.x0, l.bottom, l.x1, l.top], 1)
  const graphics = { px: 0, erased: 0, overdrawn: 0, touched: 0 }
  const graphicsM = mask()
  for (let i = 0; i < W * H; i++) {
    if (textM[i] || !inkO(i)) continue
    graphics.px++
    graphicsM[i] = 1
    if (!traceC(i)) graphics.erased++
    if (inkT(i)) graphics.overdrawn++
  }
  // the translation's text against them: its ink on a rule's or a figure's, or a pixel from it (a table's rule a CJK
  // cell's taller glyphs reach), as regions
  const touch = mask()
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x
    if (!inkT(i)) continue
    if (graphicsM[i] || graphicsM[i - 1] || graphicsM[i + 1] || graphicsM[i - W] || graphicsM[i + W] || graphicsM[i - W - 1] || graphicsM[i - W + 1] || graphicsM[i + W - 1] || graphicsM[i + W + 1]) touch[i] = 1
  }
  graphics.touched = components(touch, W, H, 3, (where.touched = []))

  // (the regions' boxes in PDF units, for a look)
  const pdfBox = b => [view[0] + b[0] / k, view[3] - b[3] / k, view[0] + b[2] / k, view[3] - b[1] / k].map(v => Math.round(v * 10) / 10).concat(b[4])
  const regionsAt = Object.fromEntries(Object.entries(where).filter(([, l]) => l.length).map(([key, l]) => [key, key === 'doubled' ? l : l.map(pdfBox)]))
  return { coverage, neutral, overlap, overlapOrig, overlapPx, stray, residue, residuePx, doubled, vanished, bites, bitePx, graphics, regionsAt }
}

/** components of a mask (4-connected) of at least `min` pixels: their count and pixels */
function regions(m, W, H, min) {
  const seen = new Uint8Array(W * H), stack = []
  let n = 0, px = 0
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || seen[s]) continue
    let c = 0
    stack.push(s); seen[s] = 1
    while (stack.length) {
      const i = stack.pop(), x = i % W
      c++
      if (x > 0 && m[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1) }
      if (x < W - 1 && m[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1) }
      if (i >= W && m[i - W] && !seen[i - W]) { seen[i - W] = 1; stack.push(i - W) }
      if (i + W < W * H && m[i + W] && !seen[i + W]) { seen[i + W] = 1; stack.push(i + W) }
    }
    if (c >= min) { n++; px += c }
  }
  return { n, px }
}

/** a footprint (the removed glyphs alone, drawn on white `Fw` and on black `Fb`, RGBA at W x H) as a mask a pixel
 *  around: where the original and its removed page may differ */
export function footprintOf(Fw, Fb, W, H) {
  const N = W * H, foot = new Uint8Array(N)
  for (let i = 0, q = 0; i < N; i++, q += 4) {
    const on = Fw[q] < 255 || Fw[q + 1] < 255 || Fw[q + 2] < 255 || Fb[q] > 0 || Fb[q + 1] > 0 || Fb[q + 2] > 0
    if (!on) continue
    const x = i % W, y = (i - x) / W
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) foot[yy * W + xx] = 1 }
  }
  return foot
}

/**
 * The removed glyphs' footprint shared out between them (the gate's instrument, not the drawing's): each footprint pixel
 * (`foot`, footprintOf's) goes to the removed glyph or rule whose box it lies in (`items`: { box: [x0, y0, x1, y1] in
 * device pixels, replaced }, the smaller box first where two meet) or reaches first over footprint pixels (breadth first,
 * 8-connected); what none reaches goes to the box nearest it within that box's height (an i's dot above its outline's
 * box). Returns the pixels whose glyph or rule the drawing replaces: the part of the removed page a page's drawing must
 * show, the rest the original's.
 */
export function replacedFoot(foot, W, H, items) {
  const N = W * H, label = new Int32Array(N).fill(-1)
  const order = items.map((it, i) => [i, (it.box[2] - it.box[0]) * (it.box[3] - it.box[1])]).sort((a, b) => a[1] - b[1])
  let queue = new Int32Array(1024), qn = 0
  const enqueue = i => { if (qn === queue.length) { const q2 = new Int32Array(queue.length * 2); q2.set(queue); queue = q2 } queue[qn++] = i }
  for (const [si] of order) {
    const b = items[si].box
    const x0 = Math.max(0, Math.floor(b[0])), y0 = Math.max(0, Math.floor(b[1])), x1 = Math.min(W, Math.ceil(b[2])), y1 = Math.min(H, Math.ceil(b[3]))
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (foot[i] && label[i] < 0) { label[i] = si; enqueue(i) } }
  }
  for (let h = 0; h < qn; h++) {
    const i = queue[h], x = i % W, y = (i - x) / W, s = label[i]
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
      const j = yy * W + xx
      if (foot[j] && label[j] < 0) { label[j] = s; enqueue(j) }
    }
  }
  const CELL = 32, gw = Math.ceil(W / CELL), grid = new Map()
  items.forEach((it, si) => {
    const b = it.box
    for (let gy = Math.max(0, Math.floor(b[1] / CELL) - 1); gy <= Math.floor(b[3] / CELL) + 1; gy++) for (let gx = Math.max(0, Math.floor(b[0] / CELL) - 1); gx <= Math.min(gw - 1, Math.floor(b[2] / CELL) + 1); gx++) { const k = gy * gw + gx; (grid.get(k) ?? grid.set(k, []).get(k)).push(si) }
  })
  for (let i = 0; i < N; i++) {
    if (!foot[i] || label[i] >= 0) continue
    const x = i % W, y = (i - x) / W
    let best = -1, gap = Infinity
    for (const si of grid.get(Math.floor(y / CELL) * gw + Math.floor(x / CELL)) ?? []) {
      const b = items[si].box, d = Math.hypot(Math.max(0, b[0] - x, x - b[2]), Math.max(0, b[1] - y, y - b[3]))
      if (d <= b[3] - b[1] && d < gap) { gap = d; best = si }
    }
    label[i] = best >= 0 ? best : -2
  }
  const out = new Uint8Array(N)
  for (let i = 0; i < N; i++) if (label[i] >= 0 && items[label[i]].replaced) out[i] = 1
  return out
}

/**
 * The exactness check's pixels of a page: where the original (O) and its removed page (Rm) differ, and how many of those
 * lie outside the removed glyphs' own ink (`foot`, footprintOf's), which must be none; with the regions' boxes in PDF
 * units. On planes drawn by one renderer that draws a page alike every time (PDF.js in Node: the browser's canvas does
 * not, a figure's pixels flickering between two drawings)
 */
export function outsideOf({ k, view, W, H, O, Rm, foot }) {
  const N = W * H, outside = new Uint8Array(N)
  let differing = 0, n = 0
  for (let i = 0, q = 0; i < N; i++, q += 4) {
    if (O[q] === Rm[q] && O[q + 1] === Rm[q + 1] && O[q + 2] === Rm[q + 2]) continue
    differing++
    if (!foot[i]) { n++; outside[i] = 1 }
  }
  const out = { differing, outside: n }
  if (n) {
    const boxes = []
    components(outside, W, H, 1, boxes)
    out.at = boxes.map(b => [view[0] + b[0] / k, view[3] - b[3] / k, view[0] + b[2] / k, view[3] - b[1] / k].map(v => Math.round(v * 10) / 10).concat(b[4]))
  }
  return out
}

/**
 * The text-removed PDF's measures of a page, its removed page (Rm) the truth of what stays (the feasibility spike's,
 * pdf-remove-report.md §3.1), on the planes at `k` device pixels a PDF unit: O the original as the copy was made from it,
 * Rm the removed page (O itself outside the removed glyphs' footprint, where the two are the same: the exactness check's),
 * C the copy (erased or swapped, cropped, before the text), T the text alone. A pixel is free where no crop is laid
 * (`crops`, device-pixel boxes, a pixel around), nothing is kept (`kept`, PDF units, 1.5 px around) and the text is not
 * drawn.
 * - trueResidue: the removed ink (O's ink Rm lacks) still showing in C where free (leftover English), regions of 3 px;
 * - traces: the same at the antialiased edge (O darker than 248, Rm white, C darker than 248), regions of 3 px;
 * - trueBites: Rm's ink (what stays) gone from C, regions of 4 px.
 */
export function removalPage({ k, view, W, H, O, Rm, C, T, crops, kept, excluded = [] }) {
  const N = W * H
  const toPx = (x, y) => [(x - view[0]) * k, (view[3] - y) * k]
  const fill = (m, x0, y0, x1, y1) => { for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) m.fill(1, y * W + Math.max(0, Math.floor(x0)), y * W + Math.min(W, Math.ceil(x1))) }
  const cropM = new Uint8Array(N), keptM = new Uint8Array(N)
  for (const b of crops) fill(cropM, b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1)
  for (const r of kept) { const [ax, ay] = toPx(r[0], r[3]), [bx, by] = toPx(r[2], r[1]); fill(keptM, ax - 1.5, ay - 1.5, bx + 1.5, by + 1.5) }
  // (the areas of the units drawn the old way, device pixels: no truth's)
  const exclM = new Uint8Array(N)
  for (const b of excluded) fill(exclM, b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1)
  const res = new Uint8Array(N), trace = new Uint8Array(N), bite = new Uint8Array(N)
  for (let i = 0, q = 0; i < N; i++, q += 4) {
    const o = lum(O, q), r = lum(Rm, q), c = lum(C, q)
    const free = !cropM[i] && !keptM[i] && !exclM[i] && !(lum(T, q) < TRACE)
    if (free && o < INK && r >= TRACE && c < TRACE) res[i] = 1
    if (free && o < 248 && r >= 254 && c < 248) trace[i] = 1
    if (!exclM[i] && r < INK && c >= TRACE) bite[i] = 1
  }
  const where = { trueResidue: [], traces: [], trueBites: [] }
  const R1 = regions(res, W, H, 3), R2 = regions(trace, W, H, 3), R3 = regions(bite, W, H, 4)
  components(res, W, H, 3, where.trueResidue)
  components(bite, W, H, 4, where.trueBites)
  const pdfBox = b => [view[0] + b[0] / k, view[3] - b[3] / k, view[0] + b[2] / k, view[3] - b[1] / k].map(v => Math.round(v * 10) / 10).concat(b[4])
  return { trueResidue: R1.n, trueResiduePx: R1.px, traces: R2.n, tracesPx: R2.px, trueBites: R3.n, trueBitesPx: R3.px, at: Object.fromEntries(Object.entries(where).filter(([, l]) => l.length).map(([key, l]) => [key, l.map(pdfBox)])) }
}

/** whether a pixel's ink is of a colour (its departure from white in the same proportions): the check's coloured
 *  placeholders' page */
function hueNear(P, q, col) {
  const d0 = 255 - P[q], d1 = 255 - P[q + 1], d2 = 255 - P[q + 2], sd = d0 + d1 + d2
  if (sd < 30) return false
  const e0 = 255 - col[0], e1 = 255 - col[1], e2 = 255 - col[2], se = e0 + e1 + e2
  return Math.abs(d0 / sd - e0 / se) + Math.abs(d1 / sd - e1 / se) + Math.abs(d2 / sd - e2 / se) < 0.25
}

/**
 * The ink a crop carries that is not its placeholder's: inside its source box (device pixels), the ink of the plane it
 * is cut from (`src`: the original's, or the placeholders' page's) that lies a pixel or more from its own ink (`own`: the
 * coloured placeholders' page, where its placeholder's glyphs are `colour`, and its own rules' boxes, device pixels),
 * within the boxes it is drawn through where it has them (`clip`: x0, y0, x1, y1), its own glyphs' boxes (`ownBoxes`)
 * its own too. Returns the foreign pixels.
 */
export function cropForeignPx({ W, H, src, own, colour, box, rules = [], clip = null, ownBoxes = null }) {
  const [x0, y0, x1, y1] = box.map((v, i) => (i < 2 ? Math.max(0, Math.floor(v)) : Math.min(i === 2 ? W : H, Math.ceil(v))))
  const ruled = (x, y) => rules.some(r => x >= r[0] - 1 && x <= r[2] + 1 && y >= r[1] - 1 && y <= r[3] + 1)
  let n = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const q = 4 * (y * W + x)
    if (lum(src, q) >= INK) continue
    // (outside the boxes it is drawn through, a crop carries nothing)
    if (clip && !clip.some(r => x >= r[0] && x < r[2] && y >= r[1] && y < r[3])) continue
    // (its own glyphs' outline boxes, a pixel around, where the crop names them: a placeholder the plan has no colour for)
    let mine = ruled(x, y) || !!ownBoxes?.some(r => x >= r[0] - 1 && x <= r[2] + 1 && y >= r[1] - 1 && y <= r[3] + 1)
    for (let dy = -1; dy <= 1 && !mine; dy++) for (let dx = -1; dx <= 1 && !mine; dx++) {
      const xx = x + dx, yy = y + dy
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && colour && hueNear(own, 4 * (yy * W + xx), colour)) mine = true
    }
    if (!mine) n++
  }
  return n
}
