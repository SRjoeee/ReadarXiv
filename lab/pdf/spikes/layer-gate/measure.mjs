// experiments/pdf-bilingual/spikes/layer-gate/measure.mjs
// The fidelity measures of one page against the original (Plan 8b, Task 12; the parity report's §1 and §6), ported from
// the parity harness (scratchpad parity/harness/analysis.js, 2026-10-06) with its thresholds unchanged, split in two:
// - modelPage: what needs no pixels — the units left as the original and why, the frames' fill, foot, pitch and size
//   against the original's, the page text drawn wider than its placeholder, the crops whose source holds another line's
//   text, and the drawn text area in cells (the model tier's denominator);
// - pixelPage: what needs the planes — O (the original, rendered), C (the copy: erased and cropped, before the text) and
//   T (the translation's text alone) at `k` device pixels a PDF unit — the coverage of the original's text area (its ink
//   in O and C, against the drawing's geometry: T's ink, which a face's stroke weight moves, counts in no cell), overlap,
//   stray text, residue, erase bites, crops shown twice, math that vanished, graphics erased or overdrawn, and a drawn
//   unit's own lines left intact (linesLeft).
// And what TeX's file says against the drawing (the 2608.16117 survey and the p59 finding, 2026-10-15), its ground truth
// the fixture's layout file read here (fileIndexOf), never the engine's own matching of the page's ink: each placeholder
// shown once (contentOf), no text over a display (overDisplayOf), no empty slot between two lines of a unit
// (slotsSkippedOf), no line opened by a mark UAX 14 keeps from a line's start (lineStartsOf), and the strict account of
// an erased glyph (glyphAccounted, which the pixel tier's glyphsLost reads).
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
//   math } (str is read here and never returned); names: the babel names drawn in the target's words (D1a), each { orig,
//   lines, erase } as a unit's, which the pixel measures count as a drawn unit's own text, and the model ones do not.
import { naturalOf, pitchOf, roomOf } from '../../../../src/pdf-reader/engine/layer-proto/break-room.mjs'
import { noStart } from '../../../../src/pdf-reader/engine/layer-proto/no-start.mjs'
/** the kinds no unit of is measured as text left the original's or drawn: a figure's text, and the classes the reader's default
 *  toggles hide (rules/content-classes.mjs TOGGLE_DEFAULTS: the author block, its names and its places since 2026-10-30, a
 *  bibliography's entries), which it never draws */
const UNMEASURED = new Set(['figure', 'author', 'affiliation', 'reference', 'refnames'])

const lum = (a, i) => a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114
/** a value to d decimals, as the parity harness's toFixed */
const rd = (v, d) => +v.toFixed(d)
const INK = 160, TRACE = 232
/** the original's ink of an item or a line left intact on the copy: 6 px of it or more, 0.7 of it still showing (stray's) */
const intact = (o, s) => o >= 6 && s / o >= 0.7
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
 * The model tier's measures of a page: { units, fills, geo, wrongPageText, droppedPh, cropForeign, modelCells }, and with
 * `placement` the crops' places (cropPlacementOf). `translated` holds the ids of the units with a translation, `located`
 * those the engine's layout locates on the page; `cut` the crops cut from this page, whatever page they are drawn on
 * ({ src, plane }: a unit's text runs on past a page's foot, and its crop with it)
 */
export function modelPage({ units, ref, items, translated, cut = [], placement = null }) {
  const drawnIds = new Set(units.filter(u => u.drawn).map(u => u.id))
  const byId = new Map(units.map(u => [u.id, u]))
  // the units left as the original: every translated reference unit on the page (no author, no figure), drawn or not, and
  // why; cells apart
  const counts = { textOn: 0, textDrawn: 0, cellsOn: 0, cellsDrawn: 0, left: {} }
  for (const r of ref) {
    if (!translated.has(r.id) || UNMEASURED.has(r.kind)) continue
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
      // held block, a display between two, against the frame's own pitch, the median of the original's gaps, which a
      // display's room or its stacked lines move little; not its closest, which a fraction's two baselines set)
      const seg = mine.slice(1).map((l, i) => (l.block !== undefined && l.block === mine[i].block ? mine[i].baseline - l.baseline : null)).filter(g => g !== null && g > 0.1).sort((a, b) => a - b)
      // rounded as the parity harness rounded them (its floor was taken so): a frame 0.996 lines short is one line short
      // (`dBody`: as `dRight`, each line's end taken where the marks it ends with that hang begin, hangFromOf: a frame past
      // the right edge by its hanging marks alone, by at most their own width, hangs; past it by more, it runs over)
      geo.push({
        id: u.id, kind: u.kind, n: fr.n,
        dTop: rd(dTop - oTop, 2), blank: rd((dBottom - oBottom) / fr.pitch, 2),
        dRight: rd(Math.max(...mine.map(l => l.x1)) - fr.x1, 2),
        dBody: rd(Math.max(...mine.map(l => (Number.isFinite(l.hangFrom) ? Math.min(l.x1, l.hangFrom) : l.x1))) - fr.x1, 2),
        pitch: dPitch && fr.n > 1 ? rd(dPitch / fr.pitch, 3) : null,
        rhythm: seg.length && fr.n > 1 ? rd(seg[seg.length >> 1] / fr.pitch, 3) : null,
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
  // crops whose source box holds a text item of a line above or below it, on the page it is cut from (a crop cut from the
  // placeholders' page, the text-removed PDF's, holds no line's text whatever its box: its foreign ink is the pixel
  // tier's, cropForeignInk). A crop drawn on the next page was read against that page's items, which are no neighbours of
  // its source (1706.03762 p5's, cut from p4)
  let cropForeign = 0
  for (const c of cut) {
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
  for (const u of drawn) if (u.kind !== 'cell' && !UNMEASURED.has(u.kind)) for (const _ of cellsOf(u.orig)) modelCells++
  return { units: counts, fills, geo, gaps: paraGapsOf(drawn, ref, items), wrongPageText, droppedPh, cropForeign, modelCells, ...(placement ? cropPlacementOf(placement) : {}) }
}

/**
 * Where a page's drawn crops sit (the math placement round, 2026-10-08), from the drawing's geometry:
 * - `cropTextOverlap`: crops whose drawn box meets another drawn line's text box (across the line, from its baseline
 *   down its text's depth and up its height, the drawn glyphs' own ink) or another crop's box, by more than 0.5 pt both
 *   ways;
 * - `cropBaselineOff`: crops whose TeX baseline, carried by their offset from their source box's top, is drawn more than
 *   0.5 pt off their line's baseline (`tex`: the layout file's segment's baseline);
 * - `cropNoTex`: crops with no TeX baseline (no segment), reported.
 * `lines`: { key, x0, x1, baseline, a, d }; `crops`: { unit, line (its line's key), box: [x0, y0, x1, y1] as drawn,
 * srcTop, tex, sc (its drawn scale) }. With the units each count is of (`where`)
 */
/** the audit's entry of a drawn crop (its item's token's `crop`): its placeholder's (`k`) and, where its formula TeX broke over
 *  lines is drawn as one crop a line, its part's (`part`, layer2.mjs cropPartsOf: each part an entry of its own) */
export const cropAuditOf = (audit, crop) => audit.find(x => x.k === crop.k && (x.part ?? 0) === (crop.part ?? 0))

export function cropPlacementOf({ lines, crops }) {
  const where = { cropTextOverlap: [], cropBaselineOff: [], cropNoTex: [] }
  crops.forEach((c, i) => {
    if (lines.some(l => l.key !== c.line && meets(c.box, [l.x0, l.baseline - l.d, l.x1, l.baseline + l.a])) || crops.some((o, j) => j !== i && meets(c.box, o.box))) where.cropTextOverlap.push(c.unit)
    const line = lines.find(l => l.key === c.line)
    if (c.tex === null || !line) where.cropNoTex.push(c.unit)
    else if (Math.abs(c.box[3] - (c.srcTop - c.tex) * c.sc - line.baseline) > 0.5) where.cropBaselineOff.push(c.unit)
  })
  return { cropTextOverlap: where.cropTextOverlap.length, cropBaselineOff: where.cropBaselineOff.length, cropNoTex: where.cropNoTex.length, cropWhere: where }
}

/** two boxes [x0, y0, x1, y1] that meet by more than half a point both ways (a crop over a line's text, a line over a
 *  display) */
const meets = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0.5 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0.5
/** a point [x, y] in a box [x0, y0, x1, y1], its edges included */
const inBox = (pt, b) => pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3]
const centreOf = b => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]

// ---------------------------------------------------------------- TeX's file, the instrument's (the 2608.16117 survey)

/** the layout file's placeholder kinds and its LOST flag (src/pdf-reader/engine/layout/file.mjs PH_KINDS, PH_FLAG) */
const PH_KINDS = ['math', 'display', 'cite', 'ref', 'eqref', 'footnote', 'macro', 'url', 'code', 'other'], PH_LOST = 32, PH_EMPTY = 16
/**
 * TeX's file as the instrument reads it (a layout file, parsed: the rows of layout/file.mjs, read here, never by the
 * engine's reader), by page: `units`, each unit's placeholders with ink on the page ({ k, kind, segs }: each segment its
 * box [x0, y0, x1, y1], TeX's own; an EMPTY placeholder has none, a LOST or TEXT one none the file knows), its lines
 * ({ j, box, baseline, size, held }: `held` a line its source does not write, a display's row), its pitch (`pitch`: the
 * median gap between two of its own text lines next to each other in one column, its lines whose spans overlap, with no
 * held line of the column between, over all its pages, its forced breaks' gaps aside), the line ends a forced break shapes
 * (`breaks`, { y, next, x0, x1, room, tall }: a text line whose ink ends short of its column's measure, the column's
 * rightmost text ink, by more than SHORT of its size, with the unit's next line in the file a text line of that column on
 * the page; `y` between the two baselines, `next` the next line's, `room` TeX's room between them in pitches of the
 * column's own (its gaps but its breaks'): the gap beyond the pitch, or beyond the opening TeX's rule between two lines
 * set (the file's `lineskip`: the short line's depth, the next line's height and \lineskip, where the pitch would set them
 * nearer than \lineskiplimit), `tall` that opening beyond the pitch, as the engine reads them (layer-proto/tex.mjs
 * forcedBreaks, break-room.mjs: the one place); a column with no pitch of its own holds none, the engine keeping the text
 * after it on TeX's line);
 * `breaksAll`, the unit's count of them over all its pages, with those whose next line, a text line, is on another page: a
 * break the engine counts too, whose text after it starts there, no room in the frame it ends; a unit in two columns of
 * one page the engine pairs nothing in), and on its first
 * page the placeholders the file has LOST (`lost`, their k: ink no measure can place); `displays`, every display's
 * segments
 */
export function fileIndexOf(layout) {
  const pages = new Map()
  const pageOf = p => pages.get(p) ?? pages.set(p, { units: new Map(), displays: [] }).get(p)
  const unitOf = (p, id) => { const u = pageOf(p).units; return u.get(id) ?? u.set(id, { phs: [], lines: [], lost: [] }).get(id) }
  const held = new Map((layout.held ?? []).map(([id, rows]) => [id, new Set(rows)]))
  const first = new Map()
  for (const [id, rows] of layout.lines ?? []) {
    for (let j = 0; 8 * j < rows.length; j++) {
      const o = 8 * j, p = rows[o]
      if (!first.has(id)) first.set(id, p)
      unitOf(p, id).lines.push({ j, box: [rows[o + 1], rows[o + 5], rows[o + 2], rows[o + 4]], baseline: rows[o + 3], size: rows[o + 6], held: !!held.get(id)?.has(j) })
    }
  }
  // (each unit's placeholders the file holds a row for that sets ink, LOST or not: its visible pieces, by k, their kind)
  const rows = new Map()
  for (const r of layout.ph ?? []) {
    const [id, k, kind, flags] = r
    if (!(flags & PH_EMPTY)) (rows.get(id) ?? rows.set(id, new Map()).get(id)).set(k, PH_KINDS[kind])
    if (flags & PH_LOST) { if (first.has(id)) unitOf(first.get(id), id).lost.push(k); continue }
    const by = new Map()
    for (let o = 4; o + 5 < r.length; o += 6) (by.get(r[o]) ?? by.set(r[o], []).get(r[o])).push([r[o + 1], r[o + 5], r[o + 3], r[o + 4]])
    for (const [p, segs] of by) {
      unitOf(p, id).phs.push({ k, kind: PH_KINDS[kind], segs })
      if (PH_KINDS[kind] === 'display') pageOf(p).displays.push(...segs)
    }
  }
  // (each unit's pitch: the gaps of its text lines next to each other, page by page and column by column (lines whose
  // spans overlap, chained), no held line of the column between)
  const gaps = new Map(), breaks = new Map()
  const overlaps = (a, b) => Math.min(a.box[2], b.box[2]) > Math.max(a.box[0], b.box[0])
  // (each unit's text lines of the file, by their index: a break's next line may be on another page)
  const textJ = new Map()
  for (const pg of pages.values()) for (const [id, u] of pg.units) for (const l of u.lines) if (!l.held) (textJ.get(id) ?? textJ.set(id, new Set()).get(id)).add(l.j)
  for (const pg of pages.values()) for (const [id, u] of pg.units) {
    const columns = []
    for (const l of u.lines.filter(l => !l.held)) {
      const hit = columns.filter(c => c.some(m => overlaps(m, l)))
      const into = hit[0] ?? []
      if (!hit.length) columns.push(into)
      for (const c of hit.slice(1)) { into.push(...c); columns.splice(columns.indexOf(c), 1) }
      into.push(l)
    }
    const held = u.lines.filter(l => l.held)
    u.breaks = []
    for (const c of columns) {
      // (TeX's line breaks a forced break shapes: a text line its ink ends short of its column's measure, the next line of
      // the unit in the file a text line of the column)
      const measure = Math.max(...c.map(l => l.box[2])), x0 = Math.min(...c.map(l => l.box[0]))
      const shorts = new Map()
      let across = 0
      for (const l of c) {
        const n = c.find(m => m.j === l.j + 1)
        if (!(l.box[2] < measure - SHORT * l.size)) continue
        if (n) shorts.set(l, n)
        else if (textJ.get(id)?.has(l.j + 1) && !u.lines.some(m => m.j === l.j + 1)) across++
      }
      breaks.set(id, (breaks.get(id) ?? 0) + across)
      // (the gaps the pitch is read from, a break's own aside: its room, not the column's pitch, as the engine reads it)
      const own = []
      const text = c.slice().sort((a, b) => b.baseline - a.baseline)
      for (let i = 1; i < text.length; i++) {
        const a = text[i - 1], b = text[i], g = a.baseline - b.baseline
        if (!(g > 0) || held.some(h => h.baseline < a.baseline && h.baseline > b.baseline && (overlaps(h, a) || overlaps(h, b)))) continue
        if (shorts.get(a) === b) continue
        own.push(g)
        ;(gaps.get(id) ?? gaps.set(id, []).get(id)).push(g)
      }
      // (each break by its column's pitch, as the engine reads it by its frame's: break-room.mjs)
      const pitch = pitchOf(own)
      for (const [l, n] of shorts) u.breaks.push({ y: (l.baseline + n.baseline) / 2, next: n.baseline, x0, x1: measure, pitch, d: l.baseline - l.box[1], h: n.box[3] - n.baseline })
    }
    breaks.set(id, (breaks.get(id) ?? 0) + u.breaks.length)
  }
  for (const pg of pages.values()) for (const [id, u] of pg.units) {
    const g = (gaps.get(id) ?? []).sort((a, b) => a - b)
    u.pitch = g.length ? (g[(g.length - 1) >> 1] + g[g.length >> 1]) / 2 : null
    // (each break's room by its column's pitch: its gap less the two lines' distance with no break, the pitch or TeX's
    // rule's for a tall next line, whose opening beyond the pitch is its own room at its place, `tall`. A break in a column
    // with no pitch of its own the engine keeps on TeX's line: its gap is TeX's room at its place, no break's)
    const ls = layout.lineskip ?? null
    u.breaks = u.breaks.filter(k => k.pitch !== null).map(({ d, h, pitch, ...k }) => {
      const natural = naturalOf(pitch, d, h, ls)
      return { ...k, room: roomOf(2 * (k.y - k.next), pitch, natural), tall: Math.round((natural - pitch) * 1000) / 1000 }
    })
    u.breaksAll = breaks.get(id) ?? 0
    u.rows = rows.get(id) ?? new Map()
  }
  return pages
}

/** LaTeX's forced line breaks: `\\` (starred, or with its optional space) and \newline, each TeX's \hfil\break */
const FORCED_BREAK = /^\\\\\*?(?:\[[^\]]*\])?$|^\\newline$/
/** a line ends short of its column's measure by more than this share of its size (a justified line's ink reaches it, to a
 *  glyph's side bearing) */
const SHORT = 0.5
/** a piece's kind as forcedBreaksIn reads it with no file: a text by its characters, any other placeholder visible */
const kindOfPiece = (i, p) => (p.t === 'text' ? (/\S/.test(p.s ?? '') ? 'text' : null) : p.t === 'ph' || p.t === 'nested' ? 'text' : null)
/**
 * The forced breaks of a unit's source (its pieces: { t, s } text, { t: 'ph', src } a placeholder) that end a line of it,
 * as the engine counts them (layer-proto/tex.mjs forcedBreaks): groups of FORCED_BREAK placeholders with nothing visible
 * between them, where the nearest visible piece before the group and after it are both no display (a display breaks the
 * text by itself; a group at an edge of the unit ends none of its lines). `kindOf(i, piece)`: a non-break piece's kind,
 * 'display', 'text' (any other visible piece) or null (nothing visible: white space, a placeholder TeX's file holds no row
 * of ink for, as \label, \vspace or a tie), undefined where it cannot tell, and then the count is -1. By default a text is
 * read by its characters and any other placeholder is visible
 */
export function forcedBreaksIn(pieces, kindOf = kindOfPiece) {
  let n = 0, last = null, open = false, before = null
  for (const [i, p] of (pieces ?? []).entries()) {
    if (p.t === 'ph' && FORCED_BREAK.test(p.src ?? '')) { if (!open) { open = true; before = last } continue }
    const kind = kindOf(i, p)
    if (kind === undefined) return -1
    if (!kind) continue
    if (open && before === 'text' && kind === 'text') n++
    open = false
    last = kind
  }
  return n
}
/** the forced breaks a unit's line ends set aside on a page (fileIndexOf's `breaks`): where its source sets exactly as many
 *  (forcedBreaksIn) as the file has such line ends over its pages, else none, so that a ragged or centred unit's short lines
 *  keep every slot counted */
export const forcedBreakRoom = (own, sourceBreaks) => (own?.breaks?.length && sourceBreaks === own.breaksAll ? own.breaks : [])

/**
 * The display rows of a page in TeX's file: each unit's held lines that no line of its own text on the page shares a
 * band with (the rows a display sets apart, a LOST display's too), as boxes
 */
export function displayRowsOf(page) {
  const out = []
  for (const u of page?.units.values() ?? []) {
    const text = u.lines.filter(l => !l.held)
    for (const l of u.lines) if (l.held && !text.some(t => Math.min(t.box[3], l.box[3]) > Math.max(t.box[1], l.box[1]))) out.push(l.box)
  }
  return out
}

/**
 * The content measure (the 2608.16117 survey, 2026-10-15): each placeholder of a drawn unit whose ink TeX's file finds on
 * the page (`phs`: { unit, k, segs }, its segments TeX's own boxes; never the drawing's own matching of the page's ink) is
 * shown exactly once. A rendering drawn elsewhere shows it only where it is its own (its `unit` and its piece's source
 * index `k` the placeholder's, or a piece of the same source, `src`: two \eqref of one label are one rendering) and is
 * drawn from its ink or source; ink left where it stands shows it whoever kept it. A showing is
 * - its crops of its ink: its crops cut from this page (`crops`: { unit, k, src, box }, `box` its source rectangle) that
 *   hold the centre of one of its segments, one showing however many of its segments they hold between them (a formula TeX
 *   broke over lines is drawn as its crops, one a line: E3b, 2026-10-19), as often as the most that hold one segment's;
 *   a segment that nothing shows (none of its crops, nor its ink in place, nor what shows it whole) loses it, though its
 *   other segments' crops are drawn (a part of a broken formula not drawn);
 * - its rendering drawn from its source (a symbol, a citation as the page wrote it, its source's text: `texts`,
 *   { unit, k, src }, one for each translated piece drawn so: a piece the translation repeats is shown twice), by its own
 *   k alone (with no place to tell them apart, two renderings of one source are each their own);
 * - its rendering drawn as the page's own characters (orig-text: `pageTexts`, { unit, k, src, chars }, the centres of
 *   its characters) whose characters stand in its segments;
 * - its ink left in place, once however often: a kept rendering's characters in its segments (`kept`, as pageTexts),
 *   a segment's centre on a line the drawing keeps as the original's (`keptLines`), or outside everything it erased
 *   (`erased`).
 * Another placeholder's rendering drawn from its ink shows it no time: a rendering handed out one off shows every
 * placeholder it passes as lost. The drawing's putting back of ink it did not account for is no showing either: that
 * ink stands where the original set it, under the translation's text. A placeholder shown no time is lost and one shown
 * twice or more doubled: `contentLost` counts both, `contentWhere` lists each [unit, k, times]
 */
export function contentOf({ phs, crops = [], texts = [], pageTexts = [], kept = [], keptLines = [], erased = [] }) {
  const out = []
  for (const ph of phs) {
    const centres = ph.segs.map(centreOf)
    const own = r => r.unit === ph.unit && (r.k === ph.k || (typeof r.src === 'string' && r.src === ph.src))
    const keptHere = kept.some(r => holds(ph, r.chars))
    const mine = crops.filter(own)
    // (what shows it whole: its source drawn, its characters drawn, a kept rendering's ink in it)
    const whole = texts.filter(r => r.unit === ph.unit && r.k === ph.k).length + pageTexts.filter(r => own(r) && holds(ph, r.chars)).length
    // (each segment's showings: its own crops that hold its centre, its ink in place, and what shows it whole. A segment
    // shown nowhere loses it, as a formula TeX broke over lines one of whose crops is not drawn (check.mjs's rule), else
    // the most of any segment)
    const per = centres.map(pt => mine.filter(c => inBox(pt, c.box)).length + whole + (keptHere || keptLines.some(r => inBox(pt, r)) || !erased.some(e => inBox(pt, e)) ? 1 : 0))
    const n = !per.length ? whole + (keptHere ? 1 : 0) : Math.min(...per) === 0 ? 0 : Math.max(...per)
    if (n !== 1) out.push([ph.unit, ph.k, n])
  }
  return { contentLost: out.length, contentWhere: out }
}

/** whether a rendering's characters (their centres) stand in a placeholder's segments: its ink */
const holds = (ph, chars) => chars.some(pt => ph.segs.some(s => inBox(pt, s)))
/** the segments of the placeholders a kept rendering leaves in place (contentOf's `kept`, whoever kept them): ink the
 *  drawing keeps where it stands */
export const keptSegsOf = ({ phs, kept = [] }) => phs.filter(ph => kept.some(r => holds(ph, r.chars))).flatMap(ph => ph.segs)

/**
 * Each translated piece's source index (the layout file's k) of a unit, read from its units file's pieces (`tr`, TrPiece:
 * [0, …] a text, [1, k] a placeholder, [2, k] an open, [3, k] a close) against the record's (`pieces`), as
 * layer-proto/tex.mjs kOfPieces reads them (the instrument reads them itself): a text piece -1; null where the two do not
 * match piece by piece
 */
export function kOfPiecesOf(pieces, tr) {
  if (!Array.isArray(pieces) || !Array.isArray(tr) || tr.length !== pieces.length) return null
  const out = []
  for (const [i, q] of pieces.entries()) {
    const t = tr[i]
    if (!Array.isArray(t)) return null
    if (q.t === 'text') { if (t[0] !== 0) return null; out.push(-1); continue }
    if ((q.t === 'open' && t[0] !== 2) || (q.t === 'close' && t[0] !== 3)) return null
    out.push(t[0] === 0 ? -1 : t[1])
  }
  return out
}

/**
 * Text laid over a display (the p59 finding, 2026-10-15): each drawn line (its text's own ink across it: cropPlacementOf's
 * lines, with their `unit`) that meets a display's segment in TeX's file or a display's row (displayRowsOf), as
 * cropPlacementOf's boxes meet. Returns { textInDisplay, where: the units }
 */
export function overDisplayOf({ lines, boxes }) {
  const where = []
  for (const l of lines) if (boxes.some(b => meets([l.x0, l.baseline - l.d, l.x1, l.baseline + l.a], b))) where.push(l.unit)
  return { textInDisplay: where.length, where }
}

/**
 * The empty slots between two drawn lines of a unit in one frame of its original (the 2608.16117 survey's M4): the room
 * left between two lines of the frame next to each other beyond their slots' pitch (`pitch`, the drawing's own, the
 * larger of the two) that the original does not leave there itself, in slots (rounded as a frame's blank lines are). Two
 * lines with a held line of the unit between them across the frame's column (`held`, its boxes: a display's rows) are no
 * pair: the room before a display is the frame's blank lines', not a slot skipped. What the original leaves is TeX's: the
 * room between two of the unit's own text lines of the file in the frame's column beyond its pitch (a blank line between
 * paragraphs, a tall line's opening: `tex`, { baseline, x0, x1 }, and `texPitch`), the share of it that lies between the
 * two drawn lines; and a line of the unit's text the drawing keeps as the original's (`keptRows`, their middles, no held
 * line among them), a pitch of TeX's each. A forced break of TeX's in the frame (`breaks`, fileIndexOf's: a line TeX ended
 * short, the next a text line of the column, where the unit's source sets as many forced breaks as the file has such
 * line ends, forcedBreaksIn) leaves its own room (its `room`, fileIndexOf's: its gap beyond the pitch or TeX's rule's
 * opening, in pitches; the empty line of `\\ \\`, none for a lone `\\`): the drawing ends the laid line at the break and leaves that room wherever its translation sets the break
 * (layer-proto/tex.mjs forcedBreaks, the fix of 2026-10-16), not at TeX's place. So the gap is not counted by its place,
 * and each break's room is credited once in its frame, to the pair whose room is nearest it: a drawing that holds
 * the text after a break on TeX's own line, under the room the text before it did not use, skips those slots. `units`:
 * the drawn units, { id, orig, lines: [{ baseline, size, x0, x1, pitch }], tex, held, texPitch, keptRows, breaks }.
 * Returns { slotsSkipped, where: the units, once a slot }
 */
export function slotsSkippedOf(units) {
  const where = []
  for (const u of units) {
    const p0 = u.texPitch ?? 0, frames = frameGroups(u.orig)
    // (each break's short line's baseline and its room, TeX's: fileIndexOf's, else its gap beyond the pitch, in pitches)
    const breaks = (u.breaks ?? []).map(k => ({ ...k, hi: 2 * k.y - k.next, room: k.room ?? (p0 > 0 ? Math.max(0, (2 * (k.y - k.next)) / p0 - 1) : 0), tall: k.tall ?? 0, frame: -1 }))
    for (const k of breaks) k.frame = frames.findIndex(fr => Math.min(k.x1, fr.x1) > Math.max(k.x0, fr.x0) && k.y < fr.first + 0.5 && k.y > fr.last - 0.5)
    linesOfFrames(u, frames).forEach((inFrame, f) => {
      const fr = frames[f]
      const own = breaks.filter(k => k.frame === f)
      const breakAt = (hi, lo) => own.find(k => Math.abs(k.hi - hi) < 0.05 && Math.abs(k.next - lo) < 0.05)
      const tex = (u.tex ?? []).filter(l => Math.min(l.x1, fr.x1) > Math.max(l.x0, fr.x0)).map(l => l.baseline).sort((a, b) => b - a)
      const mine = inFrame.slice().sort((a, b) => b.baseline - a.baseline)
      const left = []
      for (let j = 1; j < mine.length; j++) {
        const a = mine[j - 1].baseline, b = mine[j].baseline, pitch = Math.max(mine[j - 1].pitch ?? 0, mine[j].pitch ?? 0)
        if (!(pitch > 0)) continue
        // (across the frame's column and the two lines: a display's rows stand beside a short line too)
        const x0 = Math.min(fr.x0, mine[j - 1].x0, mine[j].x0), x1 = Math.max(fr.x1, mine[j - 1].x1, mine[j].x1)
        if ((u.held ?? []).some(h => { const y = (h[1] + h[3]) / 2; return y > b && y < a && Math.min(h[2], x1) > Math.max(h[0], x0) })) continue
        // (TeX's own room between them: each gap of its text lines past its pitch, by the share of it they span; of a forced
        // break's, the opening TeX's rule set for a tall next line alone, the break's room credited below)
        let room = 0
        if (p0 > 0) {
          for (let i = 1; i < tex.length; i++) {
            const hi = tex[i - 1], lo = tex[i], span = Math.min(hi, a) - Math.max(lo, b), k = breakAt(hi, lo)
            const past = k ? k.tall : hi - lo - p0
            if (span > 0 && past > 0) room += (past * span) / (hi - lo)
          }
          room += p0 * (u.keptRows ?? []).filter(y => y > b && y < a).length
        }
        const over = rd((a - b - pitch - room) / pitch, 2)
        if (over > 0) left.push(over)
      }
      // (each break's room, once, the largest first: to the pair whose room left is nearest it, the break's own wherever
      // the drawing set it; given to the widest instead, a room of a fraction of a pitch hid a slot skipped elsewhere and
      // was rounded away at its own pair, the review of #383)
      for (const k of own.slice().sort((p, q) => q.room - p.room)) {
        let at = -1
        left.forEach((over, i) => { if (over > 0 && (at < 0 || Math.abs(over - k.room) < Math.abs(left[at] - k.room))) at = i })
        if (at >= 0) left[at] = rd(left[at] - Math.min(left[at], k.room), 2)
      }
      for (const over of left) for (let s = 0; s < Math.floor(over); s++) where.push(u.id)
    })
  }
  return { slotsSkipped: where.length, where }
}

/** whether a character (its first code point) is one UAX 14 does not let a line start with: the engine's own table, one
 *  place (layer-proto/no-start.mjs), the drawing's rule after a display and this measure's alike; the gate serves this
 *  repository's copy whichever engine it measures */
export { noStart }

/**
 * The drawn lines that open with a character UAX 14 does not let a line start with (noStart), unless the original's line
 * it stands on opens with one too (the 2608.16117 survey's M5: a translation's sentence mark set after a display, where
 * TeX's own line opened with the display's next word). `lines`: { unit, first (its first drawn character; null where a
 * crop opens it), orig (the first character of the original's line on its baseline; null where it stands on none) }.
 * Returns { lineStartPunct, where: the units }
 */
export function lineStartsOf(lines) {
  const where = lines.filter(l => noStart(l.first) && !noStart(l.orig)).map(l => l.unit)
  return { lineStartPunct: where.length, where }
}

/** a closing mark that may hang past a line's end: one UAX 14 keeps from a line's start (noStart, the table lineStartPunct
 *  reads: a closing bracket, a comma, an ideographic full stop), or a final quotation mark (Unicode's Pf: the closing
 *  quotes the breaker hangs as CJK's closing marks, layer2.mjs PUNCT_CLOSE) */
const hangs = ch => noStart(ch) || /^\p{Pf}$/u.test(ch)

/**
 * Where a drawn line's hanging marks begin: the advance of the first of the tokens that end it holding nothing but
 * closing marks (`hangs`), which may stand past the right edge by their own width (a CJK closing mark whose blank half
 * the breaker hangs, layer2.mjs breakLines; standard CJK hanging punctuation); null where the line ends with none.
 * `items`: the line's laid items in order ({ t: { s, space, crop }, x, shift }, layer2.mjs placeItems), PDF units
 */
export function hangFromOf(items) {
  let k = items?.length ?? 0
  while (k > 0) {
    const t = items[k - 1]?.t
    if (!t || t.space || t.crop || typeof t.s !== 'string' || t.s === '' || ![...t.s].every(hangs)) break
    k--
  }
  return items && k < items.length && Number.isFinite(items[k].x) ? items[k].x - (items[k].shift ?? 0) : null
}

/**
 * Whether an erased glyph of a drawn unit is accounted for by the strict rule of glyphsLost (the 2608.16117 survey),
 * by TeX's file first: a glyph in one of the unit's placeholders' segments (`inSeg`) is that placeholder's ink, accounted
 * only where the placeholder is drawn from its source (`fromSource`: a symbol, a citation as the page wrote it) or a
 * rendering drawn as the page's own characters took it (`used` 'orig-text', `drawn`; a crop's glyph is accounted by the
 * crop's source, where the crop is drawn); one on a line of the unit's own text (`onLine`, not held) and
 * in no segment is the text TeX set, which the translation replaces, unless the drawing keeps it (`cat` 'keep'). Only
 * where the file has no line for it does the drawing's own reading decide: its category 'acc' (the unit's prepared one),
 * as a source word the alignment matched (in none of its gaps) or a character drawn as the page's own. A leftover of a
 * gap no placeholder took is accounted by none of these (lostInk's accounting takes it where its letters stand anywhere
 * in what the unit draws)
 */
export const glyphAccounted = ({ cat, inSeg, fromSource, onLine, inGap, used, drawn }) => {
  if (inSeg) return !!fromSource || (used === 'orig-text' && !!drawn)
  if (onLine) return cat !== 'keep'
  return cat === 'acc' && (used ? used === 'orig-text' && !!drawn : !inGap)
}

/**
 * The gaps between paragraphs (D6, 2026-10-08): for two drawn body frames one above the other in a column, with nothing
 * between them, the gap drawn from the upper's foot to the lower's top against the original's. A foot is its frame's last
 * baseline less 0.22 of its size, a top its first plus 0.75 (geo's own). Nothing between: no other frame of the page's
 * reference, no text item (a display), and no more than three of the upper's pitches of the original's (a graphic's room).
 * Each gap's `ratio`, drawn ÷ original, and its `extra`, the drawn gap's excess in the upper frame's original pitches.
 * A frame drawn short of its original's last line adds its blank to the gap below it, which no frame measure sees.
 * And whether it is `tight` (paraGapTight, the half-leading round, 2026-10-17): narrower than the lines beside it, which the
 * ratio cannot see, as it holds the drawn gap to the original's whatever the drawn leading (a paragraph spread at 1.4
 * pitches from its frame's first baseline to its last stood a pitch from the next: ratio 1). By baselines: the drawn gap
 * (the upper's last drawn baseline to the lower's first) less the drawn leading (the mean of the two frames' own, each its
 * consecutive drawn lines' lower median gap within a flow segment) short of the original's room past its pitch (its gap
 * less the pitch, the lower median of the two frames' own gaps: a \parskip; capped at a pitch, so that a line borrowed
 * into a wider room is no tight gap) by more than TIGHT of a pitch.
 * Null where neither frame draws two lines (no leading to hold it to), and between two frames of one unit
 */
const TIGHT = 0.05
export function paraGapsOf(drawn, ref, items) {
  const span = (a, b) => [Math.max(a.x0, b.x0), Math.min(a.x1, b.x1)]
  const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length
  const all = []
  for (const r of ref) frameGroups(r.orig).forEach((f, i) => all.push({ key: `${r.id}|${i}`, x0: f.x0, x1: f.x1, top: f.first + 0.75 * f.size, foot: f.last - 0.22 * f.size }))
  const body = []
  for (const u of drawn) {
    if (!BODY.has(u.kind)) continue
    const frames = frameGroups(u.orig), framed = linesOfFrames(u, frames)
    frames.forEach((fr, i) => {
      const mine = framed[i].sort((a, b) => b.baseline - a.baseline)
      if (!mine.length) return
      // (the drawn leading: the lower median gap of its consecutive lines within one flow segment, never across a display it
      // holds, as geo's rhythm reads it: 2307.16209 page 52, two lines 76 apart about a display; and the original's gaps, which
      // a display's rows among its lines widen, pooled with the other frame's for the pitch)
      const gaps = mine.slice(1).map((l, j) => (l.block === mine[j].block ? mine[j].baseline - l.baseline : null)).filter(g => g !== null && g > 0.1).sort((a, b) => a - b)
      const og = fr.lines.slice(1).map((l, j) => fr.lines[j].baseline - l.baseline).filter(g => g > 0.1)
      body.push({ key: `${u.id}|${i}`, id: u.id, x0: fr.x0, x1: fr.x1, pitch: fr.pitch, og, first: fr.first, last: fr.last, top: fr.first + 0.75 * fr.size, foot: fr.last - 0.22 * fr.size, dFirst: mine[0].baseline, dLast: mine.at(-1).baseline, lead: gaps.length ? gaps[(gaps.length - 1) >> 1] : null, dTop: mine[0].baseline + 0.75 * mine[0].size, dFoot: mine.at(-1).baseline - 0.22 * mine.at(-1).size })
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
    let tight = null
    const leads = [a.lead, b.lead].filter(x => x > 0)
    if (a.id !== b.id && leads.length) {
      const og = [...a.og, ...b.og].sort((x, y) => x - y), p = og.length ? og[(og.length - 1) >> 1] : a.pitch
      tight = a.dLast - b.dFirst - mean(leads) < Math.min(a.last - b.first - p, p) - TIGHT * p
    }
    out.push({ ratio: rd(g / g0, 3), extra: rd((g - g0) / a.pitch, 3), tight })
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
 * text is not vanished); `cut`: the crops cut from this page ({ src, unit, clip }: `clip` the boxes of its own ink it is
 * cut through, device pixels [x, y, w, h], where it is), whatever page they are drawn on, which `doubled`, `vanished`
 * and `bites` read here, where their source is; `ownLines`: the drawn units' own text lines in TeX's file ({ unit, box }),
 * which `linesLeft` reads (with `linesLeftWhere`, the units), the segments of placeholders kept in place (`segs`) aside;
 * `graphicsCut`: the crops for the graphics' exemption where they differ from `cut` ([] for none)
 */
export function pixelPage({ k, view, W, H, O, C, T, units, names = [], kept, items, ref, drawnText, cut = [], ownLines = null, segs = null, graphicsCut = null }) {
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

  // (a babel name drawn in the target's word is a drawn unit's text here: its erase, its frame, its line drawn, its own band)
  const drawn = [...units.filter(u => u.drawn), ...names.map(n => ({ ...n, drawn: true, crops: [] }))]
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
    if (intact(o, s)) strayItems.push(it)
  }
  const stray = strayItems.filter(it => !it.math && !formula.has(it) && /\p{L}{2,}/u.test(it.str)).length

  // unerased originals (the 2608.16117 survey, 2026-10-15): a drawn unit's own text line as TeX's file has it (`ownLines`:
  // { unit, box }, not held), its ink (the segments of the placeholders the drawing keeps in place aside, `segs`, as a kept
  // rendering and a label are) left intact where its translation is drawn, as an intact item is read: whatever line rule
  // the drawing kept it by
  const segM = mask()
  for (const b of segs ?? []) paint(segM, b, 0.3)
  const linesLeftWhere = []
  for (const l of ownLines ?? []) {
    const [x0, y0, x1, y1] = boxPx(l.box)
    let o = 0, s = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x
      if (cropM[i] || keptM[i] || segM[i] || inkT(i) || !inkO(i)) continue
      o++
      if (traceC(i)) s++
    }
    if (intact(o, s)) linesLeftWhere.push(l.unit)
  }

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

  // crops shown twice: the source still showing in this page's copy where it is cut from it (read on the page it is cut
  // from: one drawn on the next page was read against that page's ink, 1512.03385's p11)
  let doubled = 0
  for (const c of cut) {
    const [x0, y0, x1, y1] = boxPx(c.src)
    let o = 0, s = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (cropM[i]) continue; if (inkO(i)) { o++; if (inkC(i)) s++ } }
    if (o >= 8 && s / o >= 0.6) { doubled++; if (where.doubled.length < BOXES) where.doubled.push(c.src.map(v => Math.round(v * 10) / 10).concat(c.unit)) }
  }

  // math erased and drawn nowhere: a math-font item mostly inside a drawn unit's erase, gone from the copy, under no
  // crop's source (one cut from this page, wherever it is drawn: 1512.03385's p10, whose formula is drawn on p11) and no
  // kept rectangle, and not drawn as text anywhere on the page
  const srcM = mask()
  for (const c of cut) paint(srcM, c.src, 0.4)
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

  // the coverage of the original's text area: each reference unit's frames as a grid of one pitch by one em. The original's
  // text area is the union of its lines' boxes (each from its first item to its last, 0.25 em below its baseline to 0.75 em
  // above: the box a drawn line has, so a text set on the original's own lines covers all of it). A cell where the original
  // has ink is translated by the share of the original's text area in it that the drawn text covers: area against area, so
  // that whether a line counts does not depend on where it falls against the cell grid (a leading other than the original's
  // moves it by half a row), a line in the gap between two original lines earns nothing, and a line over two adjacent rows
  // is shared between them by the area it covers in each (the credit never exceeds the area drawn nor the area of the
  // original). The rest of the cell is still the original's text (English) where 0.3 of its ink still shows in the copy
  // outside what is drawn; else blank; the three shares add up to the cells. A cell over a kept display, a label or a
  // formula line is neutral. What is drawn is read from the drawing's own geometry, never from its ink: each drawn line's box
  // and each crop's place. A face's stroke weight then moves no cell (a lighter face set on the same lines covers the same
  // cells), nor does a fraction of a pixel in where the text is put; a line set shorter or lower does, by the area it
  // leaves. Text and table cells apart
  const origM = mask()
  for (const r of ref) if (!UNMEASURED.has(r.kind)) for (const l of r.orig) paint(origM, [l.x0, l.baseline - 0.25 * l.size, l.x1, l.baseline + 0.75 * l.size])
  const drawnM = mask()
  for (const u of drawn) {
    for (const l of u.lines) paint(drawnM, [l.x0, l.baseline - 0.25 * l.size, l.x1, l.baseline + 0.75 * l.size])
    for (const c of u.crops) paint(drawnM, c.dst)
  }
  const coverage = { text: { cells: 0, translated: 0, english: 0, blank: 0 }, cells: { cells: 0, translated: 0, english: 0, blank: 0 } }
  let neutral = 0
  for (const r of ref) {
    if (UNMEASURED.has(r.kind)) continue
    const tally = r.kind === 'cell' ? coverage.cells : coverage.text
    for (const cell of cellsOf(r.orig)) {
      const [a, b, c, d] = boxPx(cell)
      let text = 0, covered = 0, o = 0, e = 0, keptInk = 0
      for (let y = b; y < d; y++) for (let x = a; x < c; x++) {
        const i = y * W + x
        if (origM[i]) { text++; if (drawnM[i]) covered++ }
        if (!inkO(i)) continue
        o++
        if (keptM[i] || formulaM[i]) keptInk++
        else if (inkC(i) && !drawnM[i]) e++
      }
      if (o < 3) continue
      if (keptInk > 0.5 * o) { neutral++; continue }
      tally.cells++
      const share = text ? covered / text : 0
      tally.translated += share
      if (e >= 0.3 * o) tally.english += 1 - share
      else tally.blank += 1 - share
    }
  }

  // erase bites: the original's ink erased outside every drawn unit's own lines (its glyphs' bands, and those it draws
  // anew beside them, `own`: a float's label set in the target's name), under no crop drawn here and outside what a crop
  // cut from this page carries (wherever it is drawn: a crop set on its TeX baseline stands off the ink it was cut from, a
  // radical's foot or a fraction's bar hanging under its line, which the crop carries and the page no longer shows where
  // it was, 1706.03762's p4 and p5): ink of a line, a formula or a figure no drawn unit owns, destroyed. What a crop
  // carries is what its drawing takes of its source: through its own ink's boxes where it is cut through them (`clip`,
  // hideOps: nothing outside them), else its source rectangle as it is cut, and no margin
  // beyond it (ink a crop's rectangle holds but does not carry, a neighbour's descender beside its glyphs, is lost)
  const ownM = mask(), eraseRaw = mask(), carriedM = mask()
  for (const u of drawn) {
    for (const l of [...u.orig, ...(u.own ?? [])]) paint(ownM, [l.x0 - 1, l.baseline - 0.3 * l.size, l.x1 + 1, l.baseline + 0.88 * l.size])
    for (const e of u.erase) paint(eraseRaw, e, 0)
  }
  const carry = (m, list) => {
    for (const c of list) {
      if (!c.clip?.length) { paint(m, c.src); continue }
      const [sx0, sy0, sx1, sy1] = boxPx(c.src)
      for (const [x, y, w, h] of c.clip) {
        const x0 = Math.max(sx0, Math.floor(x)), y0 = Math.max(sy0, Math.floor(y)), x1 = Math.min(sx1, Math.ceil(x + w)), y1 = Math.min(sy1, Math.ceil(y + h))
        for (let yy = y0; yy < y1; yy++) if (x1 > x0) m.fill(1, yy * W + x0, yy * W + x1)
      }
    }
  }
  carry(carriedM, cut)
  // (the graphics' exemption reads the crops by their source page, which only the default instrument holds: `graphicsCut`
  // gives the list for it, [] for none; where it is not given, the crops cut from this page are the same list)
  const carriedG = graphicsCut === null ? carriedM : mask()
  if (graphicsCut !== null) carry(carriedG, graphicsCut)
  const bite = mask()
  let bitePx = 0
  for (let i = 0; i < W * H; i++) if (eraseRaw[i] && !ownM[i] && !cropM[i] && !carriedM[i] && inkO(i) && !traceC(i)) { bite[i] = 1; bitePx++ }
  const bites = components(bite, W, H, 4, where.bites)

  // graphics: the original's ink that is no text (outside every text item and every reference line), erased or written over.
  // Ink a crop carries elsewhere (carriedG, as the bites read it: the crops cut from this page whichever page they are drawn on)
  // is not erased: it is drawn in the crop
  const textM = mask()
  for (const it of items) paint(textM, [it.x0, it.y0, it.x1, it.y1], 1)
  for (const r of ref) for (const l of r.orig) paint(textM, [l.x0, l.bottom, l.x1, l.top], 1)
  const graphics = { px: 0, erased: 0, overdrawn: 0, touched: 0 }
  const graphicsM = mask()
  for (let i = 0; i < W * H; i++) {
    if (textM[i] || !inkO(i)) continue
    graphics.px++
    graphicsM[i] = 1
    if (!traceC(i) && !carriedG[i]) graphics.erased++
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
  return { coverage, neutral, overlap, overlapOrig, overlapPx, stray, residue, residuePx, doubled, vanished, bites, bitePx, graphics, regionsAt, ...(ownLines ? { linesLeft: linesLeftWhere.length, linesLeftWhere } : {}) }
}
