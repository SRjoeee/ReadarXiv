// src/pdf-reader/engine/layer-proto/textlayer.mjs
// The text layer of a laid page (docs/PDF-READER.md §11.11; the route note docs/route/text-layer.md): what a reader selects,
// copies and finds on a page the layer draws, as plain data. A pure leaf: no DOM, no clock, no PDF.js object but the plain data
// it is given, and of the engine's modules the word table's token band alone (words.mjs).
//
// A laid page is a copy of the composed page with the layer's drawing on it (erasures, crops, the translation as SVG text). Its
// text layer is the union of three kinds of item, one span each in the host's layer, transparent over what is drawn:
// - kept: the composed page's own text items (PDF.js's text content of our compile's page) that the drawing leaves where they
//   stand: heading numbers, labels, untranslated units, references, page numbers, anything not erased;
// - moved: the items under a crop's source (a formula the layer draws as a crop of the page), relocated by the crop's map from
//   its source to where it is drawn, so that the formula's text lies under its drawn ink; where no item lies under the source,
//   the crop's own plain text over its drawn box;
// - translated: the translated text of each drawn unit and babel name, one item a drawn line (split where a crop or a change of
//   script falls in the line), at the line's drawn box.
// Ownership is the links' rule (links.mjs erasedOf): an original item is ERASED iff the page's operations leave the paper erased
// at its box's centre (device pixels, through devOf). Erased and under the source of a crop of the same page: moved; erased
// otherwise: dropped (the translation takes its place); not erased: kept. One rule for the ink, the links and the text.
//
// Reading order. The composed page's text content is in its content stream's order, which for a TeX page is its reading order
// (columns, floats and footnotes where the output routine shipped them). Each drawn thing (a unit, a name) owns the erased items
// its operations erased (the last operation that erased an item is the drawing's whose range of operations holds it), and its
// lines go, as one block in their own order, where the first item it erased was: so a heading number (kept) comes before its
// translated heading and a reference after the paragraph above it. A kept item that the stream sets between two items one drawn
// thing erased (a displayed formula the unit keeps, a float set inside a paragraph's run) goes inside that thing's block, before
// the first of its lines after it (geometrically: on its line and to its right, or below it in its column). A drawn thing that
// erased nothing goes before the first entry after it, geometrically. Moved items sit at their crop's place in their line.
//
// Bounds: at most TEXT_WORK_MAX point-against-operation tests a page (a grid over the operations' rectangles keeps a normal page
// far below it); past it the remaining items are KEPT (a selectable duplicate is invisible, a lost text is not). At most
// TEXT_ITEMS_MAX items: the page's items that abut on one baseline at one size are one item (a run PDF.js reads in pieces), and
// past the bound neighbouring items of one line are merged.
import { tokenBand } from './words.mjs'

/** the items a page's layer holds at most (one span each in the host's layer) */
export const TEXT_ITEMS_MAX = 2000
/** the point-against-rectangle tests a page's ownership may spend */
export const TEXT_WORK_MAX = 2e6
/** a font's ascent where PDF.js tells none (PDF.js's own default) */
const ASCENT = 0.8
/** flags of a compact item */
const EOL = 1, RTL = 2
/** the fields of a compact item: x, baseline, width, size, ascent, flags */
const F = 6
/** the least kern after a word that copies as a space, em (layer2.mjs lineRuns' COPY_SPACE_EM) */
const COPY_SPACE_EM = 0.25
/** the grid's cell over the operations, device pixels */
const CELL = 64

const finite = v => typeof v === 'number' && Number.isFinite(v)
const BLANK_END = /\s$/u, BLANK_START = /^\s/u
const CJK = /[\u2e80-\u9fff\uac00-\ud7af\u3040-\u30ff\uf900-\ufaff]/u

/**
 * A page's text content (PDF.js's, or a draw's: drawInputsOf) kept compact for its text layer: each item that is upright text
 * of a direction a reader selects across (its transform without rotation, skew or mirror; `dir` not 'ttb'), as x, baseline,
 * width and size in PDF units, the font's ascent where PDF.js tells it (a style's `ascent`; ASCENT else), whether a line ends
 * after it (PDF.js's `hasEOL`, on the item or on the empty item that follows it) and whether it runs right to left; strings
 * apart. Rotated text (an axis label) is left out: the left pane's own layer holds it
 */
export function itemsOf(tc) {
  const items = tc?.items ?? [], styles = tc?.styles ?? {}
  const str = [], num = []
  for (const it of items) {
    if (typeof it?.str !== 'string') continue
    if (!it.str) { if (it.hasEOL && str.length) num[(str.length - 1) * F + 5] |= EOL; continue }
    const t = it.transform
    if (!t || t.length < 6 || it.dir === 'ttb') continue
    const [a, b, c, d, e, f] = t
    if (!finite(a) || !finite(d) || !finite(e) || !finite(f) || !finite(it.width)) continue
    // (upright: no rotation or skew, not mirrored)
    if (!(a > 0) || !(d > 0) || Math.abs(b ?? 0) > 1e-6 * a || Math.abs(c ?? 0) > 1e-6 * d) continue
    const size = finite(it.height) && it.height > 0 ? it.height : Math.hypot(c ?? 0, d)
    if (!(size > 0) || !(it.width >= 0)) continue
    const asc = styles[it.fontName]?.ascent
    str.push(it.str)
    num.push(e, f, it.width, size, finite(asc) && asc > 0.3 && asc < 1.2 ? asc : ASCENT, (it.hasEOL ? EOL : 0) | (it.dir === 'rtl' ? RTL : 0))
  }
  return { n: str.length, str, num: Float32Array.from(num) }
}
/** a page with no text */
export const NO_ITEMS = Object.freeze({ n: 0, str: Object.freeze([]), num: new Float32Array(0) })

/**
 * The drawn lines of a unit's layout on page `page` as text-layer segments, in reading order: each line split where a crop
 * stands (a crop is a segment of its own: its source page and rectangle there, its drawn box here, its plain text) and where the
 * script changes (a Latin word in a CJK line: each its own measure). A text segment is { str, x, y, w, h, base, size, lx0, lx1 }: its
 * text as a copy reads it (a space where the line has one, a kern of a space's width or more, and after a line's last Latin word
 * unless it is hyphenated: layer2.mjs lineRuns' rules), its box from its first token's left to its last token's right edge and
 * across its tokens' bands (words.mjs tokenBand), the line's baseline and the size drawn, and the line's slot across (its x0, x1:
 * the reading order places a kept item below a line by it). `drawnCrop(crop)`: whether a crop is
 * drawn (its source page is): one that is not has no segment
 */
export function segsOfUnit(L, page, drawnCrop = () => true) {
  const out = []
  for (const line of L?.lines ?? []) {
    if (line.page !== page) continue
    const items = line.items
    let seg = null
    const flush = () => { if (seg && /\S/u.test(seg.str)) out.push(done(seg)); seg = null }
    items.forEach((it, n) => {
      const t = it.t
      if (t.crop) {
        flush()
        if (!drawnCrop(t.crop)) return
        const c = t.crop.crop, b = t.crop.baseline, sc = L.scale
        out.push({ crop: { page: t.crop.page, src: [c[0], c[1], c[2], c[3]], dst: [it.x, line.baseline + (c[1] - b) * sc, it.x + it.w, line.baseline + (c[3] - b) * sc], text: typeof t.crop.text === 'string' ? t.crop.text : '' }, space: false })
        return
      }
      if (t.space) {
        if (seg) seg.str += ' '
        else if (out.at(-1)?.crop) out.at(-1).space = true
        return
      }
      if (typeof t.s !== 'string' || !t.s) return
      if (seg && seg.cls !== t.cls) flush()
      const band = tokenBand(t, L, line.baseline)
      if (!seg) seg = { str: '', x0: it.x, x1: it.x + it.w, top: band.top, bottom: band.bottom, base: line.baseline, size: 0, cls: t.cls, lx0: line.x0, lx1: line.x1 }
      seg.str += t.s
      seg.x1 = Math.max(seg.x1, it.x + it.w)
      seg.top = Math.max(seg.top, band.top)
      seg.bottom = Math.min(seg.bottom, band.bottom)
      if (!t.sup) seg.size = Math.max(seg.size, band.h)
      if (n === items.length - 1 && t.cls === 'latin' && !t.hyphenated) seg.str += ' '
      else if (n < items.length - 1 && t.cls !== 'cjk' && (it.kern ?? 0) >= COPY_SPACE_EM * L.f) seg.str += ' '
    })
    flush()
  }
  return out
}
const done = s => ({ str: s.str, x: s.x0, y: s.bottom, w: Math.max(0, s.x1 - s.x0), h: Math.max(0, s.top - s.bottom), base: s.base, size: s.size || s.top - s.bottom, lx0: s.lx0, lx1: s.lx1 })

/** a babel name drawn in the target's word (run.mjs paintNames) as a segment: its text from `x` over its drawn width `w`, on its
 *  baseline at `size`, its band a Times-like face's or a CJK face's em box (words.mjs tokenBand's) */
export function nameSeg(text, x, w, base, size) {
  const cjk = CJK.test(text), top = base + (cjk ? 0.88 : 0.75) * size, bottom = base + (cjk ? -0.12 : -0.22) * size
  return { str: text, x, y: bottom, w, h: top - bottom, base, size }
}

/** the erased state of points against a page's operations (links.mjs erasedOf, in order) with the operation that last erased
 *  each, through a grid over the operations' rectangles: `test(x, y)` answers that operation's index, or -1 where the point is
 *  not erased; `budget` ({ left }) is charged a test a candidate operation, and past it `test` answers null */
function eraserOf(ops) {
  const cells = new Map()
  const key = (cx, cy) => cx * 65536 + cy
  const add = (k, b) => {
    if (!(b[2] > 0) || !(b[3] > 0)) return
    const x0 = Math.max(0, Math.floor(b[0] / CELL)), x1 = Math.min(65535, Math.floor((b[0] + b[2]) / CELL)), y0 = Math.max(0, Math.floor(b[1] / CELL)), y1 = Math.min(65535, Math.floor((b[1] + b[3]) / CELL))
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const list = cells.get(key(cx, cy))
      if (!list) cells.set(key(cx, cy), [k]); else if (list.at(-1) !== k) list.push(k)
    }
  }
  ;(ops ?? []).forEach((o, k) => {
    if (o.op === 'erase') add(k, o.box)
    else if (o.op === 'paper' || o.op === 'swap') for (const b of o.rects ?? []) add(k, b)
    else if (o.op === 'restore') for (const b of o.boxes ?? []) add(k, b)
  })
  const within = (x, y, b) => x >= b[0] && x < b[0] + b[2] && y >= b[1] && y < b[1] + b[3]
  return (x, y, budget) => {
    if (!finite(x) || !finite(y) || x < 0 || y < 0) return -1
    const list = cells.get(key(Math.floor(x / CELL), Math.floor(y / CELL)))
    if (!list) return -1
    budget.left -= list.length
    if (budget.left < 0) return null
    let by = -1
    for (const k of list) {
      const o = ops[k]
      if (o.op === 'erase') { if (within(x, y, o.box)) by = k }
      else if (o.op === 'paper' || o.op === 'swap') { if (o.rects.some(b => within(x, y, b))) by = k }
      else if (o.op === 'restore') { if (o.boxes.some(b => within(x, y, b)) && o.clip.some(b => within(x, y, b))) by = -1 }
    }
    return by
  }
}

/** compact item i as an output item from `from` (PDF units: its box from its baseline, size and ascent) */
function itemOut(P, i, from, unit) {
  const o = i * F, x = P.num[o], base = P.num[o + 1], w = P.num[o + 2], size = P.num[o + 3], asc = P.num[o + 4], flags = P.num[o + 5]
  const out = { str: P.str[i], x, y: base - (1 - asc) * size, w, h: size, base, dir: flags & RTL ? 'rtl' : 'ltr', fontSize: size, from }
  if (unit !== undefined) out.unit = unit
  if (flags & EOL) out.eol = true
  return out
}
/** an item's centre, PDF units */
const centreOf = (P, i) => { const o = i * F; return [P.num[o] + P.num[o + 2] / 2, P.num[o + 1] + (P.num[o + 4] - 0.5) * P.num[o + 3]] }
const inBox = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]
/** an item relocated by a crop's map from its source rectangle to its drawn box */
function relocated(it, crop) {
  const [s0, s1, s2, s3] = crop.src, [d0, d1, d2, d3] = crop.dst
  const sx = s2 > s0 ? (d2 - d0) / (s2 - s0) : 1, sy = s3 > s1 ? (d3 - d1) / (s3 - s1) : 1
  return { ...it, x: d0 + (it.x - s0) * sx, y: d1 + (it.y - s1) * sy, w: it.w * sx, h: it.h * sy, base: d1 + (it.base - s1) * sy, fontSize: it.fontSize * sy }
}
/** whether two items stand on one line: their bands overlap by half the smaller */
const sameLine = (a, b) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) >= 0.5 * Math.min(a.h, b.h)
/** the extent across of a translated line's item: its line's slot (a short last line still spans its column); any other item's
 *  own box */
const extents = new WeakMap()
const across = it => extents.get(it) ?? [it.x, it.x + it.w]
/** whether `b` comes after `a` in reading order, by geometry alone: on its line and not to its left, or below it in its column
 *  (their extents across overlap) */
function after(a, b) {
  if (sameLine(a, b)) return b.x >= a.x - 0.25 * Math.min(a.h, b.h)
  const [a0, a1] = across(a), [b0, b1] = across(b)
  return b.y + b.h / 2 < a.y + a.h / 2 && b0 < a1 && a0 < b1
}

/**
 * The text layer of a laid page, plain data: { items, page: { w, h }, stats }. `page`: { n: its number, items: itemsOf's compact
 * items of the composed page, view: its [x0, y0, x1, y1] }; `plan`: { ops: the page's drawing operations (device pixels), devOf(x, y): a PDF
 * point to their device pixels, owners: [from, to, key] the range of the operations each drawn thing (a unit, a name) appended,
 * rising }; `drawn`: each drawn thing on the page in the order it was painted, { key (its owners' key), unit (its id; none for
 * a name), segs (segsOfUnit's, nameSeg's) }; `o.sourceOf(page)`: another page's compact items, for a crop cut from it (null:
 * none). Each item { str, x, y, w, h, base, dir, fontSize, from: 'kept' | 'moved' | 'translated', unit?, eol? } in PDF units
 * of the page (y up, unrotated, as LinkRecord.boxes): its box (x, y its left and bottom), its baseline, the size it is drawn
 * at; `unit` the drawn unit's id for a translated or moved item; `eol` where a copy breaks the line after it. In reading order
 */
export function textLayerOf(page, plan, drawn, o = {}) {
  const P = page?.items ?? NO_ITEMS, view = page?.view ?? [0, 0, 0, 0], self = page?.n
  const N = P.n
  const ops = plan?.ops ?? [], devOf = plan?.devOf ?? ((x, y) => [x, y]), owners = plan?.owners ?? []
  const things = (drawn ?? []).filter(d => d && Array.isArray(d.segs))
  const stats = { kept: 0, moved: 0, translated: 0, dropped: 0, work: 0, merged: 0 }
  // ---- each item erased or not, and by whose drawing (the operation that last erased it, in its owner's range)
  const budget = { left: TEXT_WORK_MAX }
  const test = ops.length ? eraserOf(ops) : null
  const owner = new Array(N).fill(null), erased = new Uint8Array(N)
  const ownerOf = k => { let lo = 0, hi = owners.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1, r = owners[m]; if (k < r[0]) hi = m - 1; else if (k >= r[1]) lo = m + 1; else return r[2] } return null }
  for (let i = 0; i < N && test; i++) {
    const [cx, cy] = centreOf(P, i)
    const [dx, dy] = devOf(cx, cy)
    const by = test(dx, dy, budget)
    // (past the budget: the rest kept)
    if (by === null) break
    if (by >= 0) { erased[i] = 1; owner[i] = ownerOf(by) }
  }
  stats.work = TEXT_WORK_MAX - Math.max(0, budget.left)
  // ---- the crops: each erased item of this page under a crop's source moved to it once (the first crop in drawing order that
  // holds it); a crop cut from another page takes that page's items under its source
  const claimed = new Uint8Array(N), byCrop = new Map()
  const other = new Map()
  for (const d of things) for (const s of d.segs) {
    if (!s.crop) continue
    const c = s.crop, list = []
    if (c.page === self) {
      for (let i = 0; i < N; i++) {
        if (!erased[i] || claimed[i]) continue
        const [cx, cy] = centreOf(P, i)
        if (inBox(cx, cy, c.src)) { claimed[i] = 1; list.push(relocated(itemOut(P, i, 'moved', d.unit), c)) }
      }
    } else {
      let Q = other.get(c.page)
      if (Q === undefined) { Q = o.sourceOf?.(c.page) ?? null; other.set(c.page, Q) }
      for (let i = 0; Q && i < Q.n; i++) {
        const [cx, cy] = centreOf(Q, i)
        if (inBox(cx, cy, c.src)) list.push(relocated(itemOut(Q, i, 'moved', d.unit), c))
      }
    }
    // (none under its source: the crop's own plain text over its drawn box)
    if (!list.length && /\S/u.test(c.text)) {
      const [d0, d1, d2, d3] = c.dst, h = d3 - d1
      list.push({ str: c.text, x: d0, y: d1, w: d2 - d0, h, base: d1 + 0.2 * h, dir: 'ltr', fontSize: h, from: 'moved', ...(d.unit !== undefined ? { unit: d.unit } : {}) })
    }
    for (const it of list) delete it.eol
    if (s.space && list.length) list.at(-1).str += ' '
    byCrop.set(s, list)
  }
  // ---- each drawn thing's anchor: the first item it erased, in the stream's order
  const anchor = new Map()
  for (let i = 0; i < N; i++) if (erased[i] && owner[i] !== null && !anchor.has(owner[i])) anchor.set(owner[i], i)
  // ---- the kept items: each inside a drawn thing's block where the stream sets it between two items that thing erased
  const keys = new Set(things.map(d => d.key))
  const prevOwner = new Array(N).fill(null), nextOwner = new Array(N).fill(null)
  for (let i = 0, last = null; i < N; i++) { prevOwner[i] = last; if (erased[i] && owner[i] !== null) last = owner[i] }
  for (let i = N - 1, next = null; i >= 0; i--) { nextOwner[i] = next; if (erased[i] && owner[i] !== null) next = owner[i] }
  const inner = new Map(), top = []
  for (let i = 0; i < N; i++) {
    if (erased[i]) { if (!claimed[i]) stats.dropped++; continue }
    stats.kept++
    const it = itemOut(P, i, 'kept')
    const u = prevOwner[i]
    if (u !== null && u === nextOwner[i] && keys.has(u)) (inner.get(u) ?? inner.set(u, []).get(u)).push(it)
    else top.push({ key: i, items: [it], block: false })
  }
  // ---- each drawn thing's block: its segments in order, a crop's moved items at its place, its inner kept items each before
  // the first of its entries after it
  const unanchored = []
  for (const d of things) {
    const seq = []
    for (const s of d.segs) {
      if (s.crop) { const list = byCrop.get(s) ?? []; stats.moved += list.length; seq.push(...list); continue }
      if (!s.str || !(s.w > 0) || !(s.h > 0)) continue
      const out = { str: s.str, x: s.x, y: s.y, w: s.w, h: s.h, base: s.base, dir: 'ltr', fontSize: s.size, from: 'translated', ...(d.unit !== undefined ? { unit: d.unit } : {}) }
      if (finite(s.lx0) && finite(s.lx1)) extents.set(out, [Math.min(s.lx0, s.x), Math.max(s.lx1, s.x + s.w)])
      seq.push(out)
      stats.translated++
    }
    const mine = inner.get(d.key) ?? []
    const items = mine.length ? interleave(seq, mine) : seq
    if (!items.length) continue
    const block = { key: anchor.get(d.key), items, block: true }
    if (block.key === undefined) unanchored.push(block); else top.push(block)
  }
  top.sort((a, b) => a.key - b.key)
  for (const b of unanchored) {
    const at = top.findIndex(e => after(b.items[0], e.items[0]))
    top.splice(at < 0 ? top.length : at, 0, b)
  }
  // ---- flattened, the breaks between entries made: a line's end where the next entry is on another line, a space where it goes
  // on along the line past a gap
  let items = []
  for (const e of top) {
    const first = items.length
    for (const it of e.items) items.push(it)
    if (e.block && items.length > first) items.at(-1).eol = true
  }
  // (between items of one source, the source's own breaks: PDF.js's for the page's items, the line's for a translation; between
  // two sources, a line's end where they stand on two lines, a space where they stand apart on one)
  for (let k = 1; k < items.length; k++) {
    const a = items[k - 1], b = items[k]
    if (a.eol || (a.from === b.from && (a.from !== 'translated' || a.unit === b.unit))) continue
    if (!sameLine(a, b)) a.eol = true
    else if (b.x - (a.x + a.w) > 0.15 * Math.min(a.fontSize, b.fontSize) && !BLANK_END.test(a.str) && !BLANK_START.test(b.str)) a.str += ' '
  }
  // (one span a run: the page's items that abut on one baseline at one size, a run PDF.js reads in pieces where its font changes)
  const n0 = items.length
  items = mergeRuns(items)
  if (items.length > TEXT_ITEMS_MAX) items = mergeLines(items)
  stats.merged = n0 - items.length
  if (items.length > TEXT_ITEMS_MAX) items.length = TEXT_ITEMS_MAX
  return { items, page: { w: view[2] - view[0], h: view[3] - view[1] }, stats }
}

/** a block's entries with its inner kept items, each before the first entry after it (in the stream's order among themselves) */
function interleave(seq, mine) {
  const before = seq.map(() => [])
  const end = []
  for (const it of mine) {
    const at = seq.findIndex(e => after(it, e))
    ;(at < 0 ? end : before[at]).push(it)
  }
  const out = []
  seq.forEach((e, k) => { out.push(...before[k], e) })
  out.push(...end)
  return out
}

/** the page's own items (kept, or moved with one crop) that abut on one baseline at one size merged into one, their texts joined
 *  as they are (no space: they abut), their boxes' union: a run PDF.js reads in pieces where its font changes (an italic word, a
 *  formula's symbols), one span in the host's layer and one measure. A subscript, a superscript (another size or baseline), a gap
 *  of a quarter em or more, a line's end and another source each begin a span of their own */
function mergeRuns(items) {
  const out = []
  for (const it of items) {
    const a = out.at(-1)
    const s = a ? Math.min(a.fontSize, it.fontSize) : 0
    if (a && !a.eol && a.from === it.from && a.from !== 'translated' && a.unit === it.unit && a.dir === it.dir && Math.abs(a.base - it.base) <= 0.1 * s && Math.abs(a.fontSize - it.fontSize) <= 0.05 * Math.max(a.fontSize, it.fontSize)) {
      const gap = it.x - (a.x + a.w)
      if (gap >= -0.1 * s && gap < 0.25 * s) {
        const y0 = Math.min(a.y, it.y), y1 = Math.max(a.y + a.h, it.y + it.h)
        Object.assign(a, { str: a.str + it.str, w: Math.max(a.x + a.w, it.x + it.w) - a.x, y: y0, h: y1 - y0 })
        if (it.eol) a.eol = true
        continue
      }
    }
    out.push(it)
  }
  return out
}

/** neighbouring items of one kind on one line merged into one (a page past TEXT_ITEMS_MAX): their texts joined, a space where
 *  they stand apart, their boxes' union */
function mergeLines(items) {
  const out = []
  for (const it of items) {
    const a = out.at(-1)
    if (a && !a.eol && a.from === it.from && a.unit === it.unit && a.dir === it.dir && sameLine(a, it) && it.x >= a.x + a.w - 0.2 * a.fontSize && it.x - (a.x + a.w) < 1.5 * a.fontSize) {
      const gap = it.x - (a.x + a.w) > 0.15 * a.fontSize && !BLANK_END.test(a.str) && !BLANK_START.test(it.str)
      const y0 = Math.min(a.y, it.y), y1 = Math.max(a.y + a.h, it.y + it.h)
      Object.assign(a, { str: a.str + (gap ? ' ' : '') + it.str, w: it.x + it.w - a.x, y: y0, h: y1 - y0, fontSize: Math.max(a.fontSize, it.fontSize) })
      if (it.eol) a.eol = true
      continue
    }
    out.push({ ...it })
  }
  return out
}
