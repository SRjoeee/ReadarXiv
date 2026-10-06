// experiments/pdf-bilingual/spikes/layer-gate/measure.mjs
// The fidelity measures of one page against the original (Plan 8b, Task 12; the parity report's §1 and §6), ported from
// the parity harness (scratchpad parity/harness/analysis.js, 2026-10-06) with its thresholds unchanged, split in two:
// - modelPage: what needs no pixels — the units left as the original and why, the frames' fill, foot, pitch and size
//   against the original's, the page text drawn wider than its placeholder, the crops whose source holds another line's
//   text, and the drawn text area in cells (the model tier's denominator);
// - pixelPage: what needs the planes — O (the original, rendered), C (the copy: erased and cropped, before the text) and
//   T (the translation's text alone) at `k` device pixels a PDF unit — the coverage of the original's text area, overlap,
//   stray text, residue, erase bites, crops shown twice, math that vanished, graphics erased or overdrawn.
// Every result is a number or a list of numbers and unit ids: nothing of the paper's text leaves here.
//
// Inputs, in PDF units (y up) unless named px:
//   units: every translated unit with a frame on the page: { id, kind, drawn, why, orig: [{ x0, x1, baseline, top, bottom,
//     size }] (its lines in the original: the frozen reference's where it has them), lines: [{ baseline, size, x0, x1 }]
//     (as laid, on this page), erase: [[x0, y0, x1, y1]], crops: [{ k, src: [x0, y0, x1, y1], dst: [..] }],
//     pageText: [{ w, segW }], phs: [{ kind, status }] };
//   ref: every unit of the frozen reference on the page, translated or not: { id, kind, orig };
//   kept: rectangles a drawing must keep (displays' segments, labels); items: the page's text items { x0, y0, x1, y1, str,
//   math } (str is read here and never returned).

const lum = (a, i) => a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114
/** a value to d decimals, as the parity harness's toFixed */
const rd = (v, d) => +v.toFixed(d)
const INK = 160, TRACE = 232
/** the kinds whose frames are body text (the scorer's BODY_KINDS, layer/page.mjs EVEN_KINDS) */
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
const linesIn = (u, fr) => u.lines.filter(l => l.baseline <= fr.top + 2 && l.baseline >= fr.bottom - 6 * fr.size && l.x0 < fr.x1 - 2 && l.x1 > fr.x0 + 2)

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
    for (const fr of frameGroups(u.orig)) {
      const mine = linesIn(u, fr).sort((a, b) => b.baseline - a.baseline)
      if (!mine.length) { fills.push({ kind: u.kind, n: fr.n, fill: 0 }); continue }
      const f = mine[0].size, dLast = mine.at(-1).baseline
      const top = fr.first + 0.75 * fr.size, bottom = fr.last - 0.25 * fr.size
      fills.push({ kind: u.kind, n: fr.n, fill: rd((top - (dLast - 0.25 * f)) / (top - bottom), 3) })
      const oTop = fr.first + 0.75 * fr.size, oBottom = fr.last - 0.22 * fr.size
      const dTop = mine[0].baseline + 0.75 * f, dBottom = dLast - 0.22 * f
      const gaps = mine.slice(1).map((l, i) => mine[i].baseline - l.baseline).filter(g => g > 0.1).sort((a, b) => a - b)
      const dPitch = gaps.length ? gaps[gaps.length >> 1] : null
      // rounded as the parity harness rounded them (its floor was taken so): a frame 0.996 lines short is one line short
      geo.push({
        id: u.id, kind: u.kind, n: fr.n,
        dTop: rd(dTop - oTop, 2), blank: rd((dBottom - oBottom) / fr.pitch, 2),
        dRight: rd(Math.max(...mine.map(l => l.x1)) - fr.x1, 2),
        pitch: dPitch && fr.n > 1 ? rd(dPitch / fr.pitch, 3) : null,
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
  // crops whose source box holds a text item of a line above or below it
  let cropForeign = 0
  for (const u of drawn) for (const c of u.crops) {
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
  return { units: counts, fills, geo, wrongPageText, droppedPh, cropForeign, modelCells }
}

/** 4-connected components of a mask, counted by size: { n } each (the pixels' list is not kept) */
function components(m, W, H, min) {
  const seen = new Uint8Array(W * H), stack = []
  let regions = 0
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || seen[s]) continue
    let n = 0
    stack.push(s); seen[s] = 1
    while (stack.length) {
      const i = stack.pop(), x = i % W
      n++
      if (x > 0 && m[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1) }
      if (x < W - 1 && m[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1) }
      if (i >= W && m[i - W] && !seen[i - W]) { seen[i - W] = 1; stack.push(i - W) }
      if (i + W < W * H && m[i + W] && !seen[i + W]) { seen[i + W] = 1; stack.push(i + W) }
    }
    if (n >= min) regions++
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
  const overlap = components(ov, W, H, 6)
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
  const residue = components(res, W, H, 3)

  // crops shown twice: the source still showing in the copy where a crop of it is drawn
  let doubled = 0
  for (const u of drawn) for (const c of u.crops) {
    const [x0, y0, x1, y1] = boxPx(c.src)
    let o = 0, s = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (cropM[i]) continue; if (inkO(i)) { o++; if (inkC(i)) s++ } }
    if (o >= 8 && s / o >= 0.6) doubled++
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

  // the coverage of the original's text area: each reference unit's frames as a grid of one pitch by one em; a cell where
  // the original has ink carries the translation (its text, or a crop drawn there), still the original's text (English),
  // or nothing. A cell over a kept display, a label or a formula line is neutral. Text and table cells are counted apart
  const coverage = { text: { cells: 0, translated: 0, english: 0, blank: 0 }, cells: { cells: 0, translated: 0, english: 0, blank: 0 } }
  let neutral = 0
  for (const r of ref) {
    if (r.kind === 'author' || r.kind === 'figure') continue
    const tally = r.kind === 'cell' ? coverage.cells : coverage.text
    for (const cell of cellsOf(r.orig)) {
      const [a, b, c, d] = boxPx(cell)
      let o = 0, t = 0, e = 0, keptInk = 0
      for (let y = b; y < d; y++) for (let x = a; x < c; x++) {
        const i = y * W + x
        if (inkO(i)) { o++; if (keptM[i] || formulaM[i]) keptInk++ }
        if (inkT(i) || (cropM[i] && inkC(i))) t++
        else if (inkO(i) && inkC(i) && !keptM[i] && !formulaM[i]) e++
      }
      if (o < 3) continue
      if (keptInk > 0.5 * o) { neutral++; continue }
      tally.cells++
      if (t >= 3) tally.translated++
      else if (e >= 0.3 * o) tally.english++
      else tally.blank++
    }
  }

  // erase bites: the original's ink erased outside every drawn unit's own lines (its glyphs' bands) and under no crop:
  // ink of a line, a formula or a figure no drawn unit owns, destroyed
  const ownM = mask(), eraseRaw = mask()
  for (const u of drawn) {
    for (const l of u.orig) paint(ownM, [l.x0 - 1, l.baseline - 0.3 * l.size, l.x1 + 1, l.baseline + 0.88 * l.size])
    for (const e of u.erase) paint(eraseRaw, e, 0)
  }
  const bite = mask()
  let bitePx = 0
  for (let i = 0; i < W * H; i++) if (eraseRaw[i] && !ownM[i] && !cropM[i] && inkO(i) && !traceC(i)) { bite[i] = 1; bitePx++ }
  const bites = components(bite, W, H, 4)

  // graphics: the original's ink that is no text (outside every text item and every reference line), erased or written over
  const textM = mask()
  for (const it of items) paint(textM, [it.x0, it.y0, it.x1, it.y1], 1)
  for (const r of ref) for (const l of r.orig) paint(textM, [l.x0, l.bottom, l.x1, l.top], 1)
  const graphics = { px: 0, erased: 0, overdrawn: 0 }
  for (let i = 0; i < W * H; i++) {
    if (textM[i] || !inkO(i)) continue
    graphics.px++
    if (!traceC(i)) graphics.erased++
    if (inkT(i)) graphics.overdrawn++
  }

  return { coverage, neutral, overlap, overlapOrig, overlapPx, stray, residue, residuePx, doubled, vanished, bites, bitePx, graphics }
}
