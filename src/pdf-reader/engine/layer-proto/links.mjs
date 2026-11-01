// src/pdf-reader/engine/layer-proto/links.mjs
// The links of a laid page (3a; the 3a design, docs/ and the contract in reader.d.mts `LinkRecord`): the original's Link
// annotations read once as the page is drawn, owned by the unit whose rectangle holds their glyphs, and, once the page is final,
// frozen into the records `pageOf` answers. A pure leaf: no DOM, no clock, no PDF.js object but the plain data it is given, and
// of the engine's modules the memory predicate alone (pipeline/memory.mjs, which imports nothing).
//
// A link over text the layer redraws moves with it (3a-2): at a unit's first paint the annotations it owns (ownedBy) are
// matched to its pieces (matchUnit: by geometry, a citation's key, a url, the order of a kind) and placed over what is drawn of
// them (placeUnit: the drawn characters of a rendering, a crop's own map, a translated pair's tokens), `moved: true`. Once the
// page is final, an annotation no match took and none of whose glyph points the page's operations left erased is a record over
// the original's own ink (`moved: false`, its rectangle or quads, PDF.js's overlaid text as its name); any other is dropped and
// counted, never left over erased paper (freezeLinks).
//
// Glyph points are PDF.js's own rule (its SingleIntersector, which fills `overlaidText`): a glyph's advance centre on its
// baseline, strictly inside the annotation's rectangle or one of its quads. Two sets are kept for each annotation: the page's
// text items cut into characters of equal advance (`pointsOf`: the gate's instrument reads the same rule,
// lab/pdf/spikes/layer-gate/links.mjs) and the engine's own characters' advance centres (`charPoints`: pageChars2's widths).
// Neither is PDF.js's own reading, and they differ (equal advance puts a narrow glyph's centre where a neighbour's is); a link
// is left in place only if no point of EITHER set is erased, so that the gate's check and the engine's own agree on a link kept.
//
// Bounds (a page may be hostile): at most MAX_LINKS Link annotations a page are read (the rest counted unsupported), one with
// more than MAX_GLYPHS glyph points is not carried, the glyph points are found through a grid (not links x points), and the
// freeze spends at most WORK_MAX point-against-operation comparisons, dropping what is left as `unplaced`.

import { isMemoryError } from '../pipeline/memory.mjs'

/** the schemes a record's `url` may have (the contract's allow-list: PDF.js also lets ftp: and tel: through) */
export const LINK_SCHEMES = ['http:', 'https:', 'mailto:']
/** the border styles a record names (PDF.js's AnnotationBorderStyleType: 1 solid, 2 dashed, 5 underline) */
const BORDER_STYLES = { 1: 'solid', 2: 'dashed', 5: 'underline' }

/** the most Link annotations read on a page, the most glyph points one may hold, and the freeze's budget of point-against-box tests */
export const MAX_LINKS = 2000
export const MAX_GLYPHS = 200
export const WORK_MAX = 2e7
/**
 * How far a browser's advances may part from the layout's measure, as a share of the distance from a run's start: Chromium on
 * the Linux runner draws a long Latin word some 6 % wider than measured (its advances rounded to pixels), and glyphs drift along
 * a run from its start, which is fixed. A box at distance d into a run stands up to DRIFT_BOUND x d off its glyphs
 */
export const DRIFT_BOUND = 0.06

const finite = xs => xs.every(x => typeof x === 'number' && Number.isFinite(x))
const box4 = (a, b, c, d) => [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]
const collapse = s => s.replace(/\s+/gu, ' ').trim()

/** whether `url` is one a record may carry */
export function urlAllowed(url) {
  if (typeof url !== 'string' || !url) return false
  try { return LINK_SCHEMES.includes(new URL(url).protocol) } catch { return false }
}

/**
 * A page's annotations as PDF.js reports them (`page.getAnnotations()`), or null: a throw, a rejection, a page object that has no
 * such call (the tests' fakes), a reply that is no list. Never rejects, a page never failing for its links (L6), but for a
 * memory-class failure (pipeline/memory.mjs, C8.4), which it lets through: the run ends on it, no paper loses its links to it
 */
export async function readAnnots(page) {
  try {
    if (typeof page?.getAnnotations !== 'function') return null
    const raw = await page.getAnnotations()
    return Array.isArray(raw) ? raw : null
  } catch (e) {
    if (isMemoryError(e)) throw e
    return null
  }
}

/**
 * The glyph points of a page's text items (PDF.js items: { str, width, transform }): each non-space character's advance centre
 * on its baseline, in the item's direction, as parallel columns { x, y, ch } in item order
 */
export function pointsOf(items) {
  const x = [], y = [], ch = []
  for (const it of items ?? []) {
    const s = it?.str, t = it?.transform
    if (!s || !(Array.isArray(t) || ArrayBuffer.isView(t)) || t.length < 6) continue
    if (!finite([...t, it.width])) continue
    const n = Math.hypot(t[0], t[1])
    if (!n || !(it.width > 0)) continue
    const ux = t[0] / n, uy = t[1] / n, cs = [...s]
    for (let k = 0; k < cs.length; k++) {
      if (!/\S/u.test(cs[k])) continue
      const along = ((k + 0.5) / cs.length) * it.width
      x.push(t[4] + ux * along)
      y.push(t[5] + uy * along)
      ch.push(cs[k])
    }
  }
  return { x, y, ch }
}

/** the advance centres of the engine's characters (layer2.mjs pageChars2: { ch, x0, x1, yb, item, k }) on their baselines,
 *  non-space only, each with its key on its page (`item|k`: layer2.mjs charKey less the page), by which a unit's renderings
 *  name the characters they took */
export function charPoints(chars) {
  const x = [], y = [], ch = [], key = []
  for (const c of chars ?? []) {
    if (!/\S/u.test(c.ch)) continue
    x.push((c.x0 + c.x1) / 2); y.push(c.yb); ch.push(c.ch); key.push(`${c.item}|${c.k}`)
  }
  return { x, y, ch, key }
}

const CELL = 16
const CLAMP = 1 << 20
const cellOf = v => Math.max(-CLAMP, Math.min(CLAMP, Math.floor(v / CELL)))
const keyOf = (cx, cy) => (cx + CLAMP) * 4194304 + (cy + CLAMP)
/** a grid over the glyph points, so that a box finds its points without a pass over all of them */
function gridOf(p) {
  const cells = new Map()
  let x0 = Number.POSITIVE_INFINITY, x1 = Number.NEGATIVE_INFINITY, y0 = x0, y1 = x1
  for (let k = 0; k < p.x.length; k++) {
    const cx = cellOf(p.x[k]), cy = cellOf(p.y[k]), key = keyOf(cx, cy)
    const list = cells.get(key)
    if (list) list.push(k); else cells.set(key, [k])
    if (cx < x0) x0 = cx
    if (cx > x1) x1 = cx
    if (cy < y0) y0 = cy
    if (cy > y1) y1 = cy
  }
  return { cells, x0, x1, y0, y1, p }
}
/** the indices (ascending) of the grid's points strictly inside one of the boxes, or null where there are more than `limit`. A
 *  box over more cells than the grid holds reads the occupied cells instead of its own: a box spanning a hostile page's text set
 *  far apart costs the points, never the empty cells between them */
function hitsIn(grid, boxes, limit) {
  const seen = new Set()
  const { p } = grid
  const take = (list, b) => {
    for (const k of list) {
      if (!inside(p.x[k], p.y[k], b)) continue
      seen.add(k)
      if (seen.size > limit) return false
    }
    return true
  }
  for (const b of boxes) {
    const xa = Math.max(cellOf(b[0]), grid.x0), xb = Math.min(cellOf(b[2]), grid.x1), ya = Math.max(cellOf(b[1]), grid.y0), yb = Math.min(cellOf(b[3]), grid.y1)
    if (xa > xb || ya > yb) continue
    if ((xb - xa + 1) * (yb - ya + 1) > grid.cells.size) {
      for (const [key, list] of grid.cells) {
        const cx = Math.floor(key / 4194304) - CLAMP, cy = (key % 4194304) - CLAMP
        if (cx >= xa && cx <= xb && cy >= ya && cy <= yb && !take(list, b)) return null
      }
      continue
    }
    for (let cx = xa; cx <= xb; cx++) for (let cy = ya; cy <= yb; cy++) if (!take(grid.cells.get(keyOf(cx, cy)) ?? [], b)) return null
  }
  return [...seen].sort((a, b) => a - b)
}

/** a quad list (PDF.js's Float32Array of 8n numbers, or a plain list) as boxes [x0, y0, x1, y1], or null: none, or ill formed */
function quadBoxes(q) {
  if (!q || typeof q.length !== 'number' || !q.length) return null
  const flat = Array.from(q)
  if (flat.length % 8 || !finite(flat)) return null
  const out = []
  for (let i = 0; i < flat.length; i += 8) {
    const xs = [flat[i], flat[i + 2], flat[i + 4], flat[i + 6]], ys = [flat[i + 1], flat[i + 3], flat[i + 5], flat[i + 7]]
    out.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  }
  return out
}
const inside = (x, y, b) => x > b[0] && x < b[2] && y > b[1] && y < b[3]
const sound = b => b[0] < b[2] && b[1] < b[3]

/**
 * A page's Link annotations as the page keeps them until it is final, from PDF.js's list and the page's glyph points (`pointsOf`,
 * and the engine's own `charPoints` as `points2`). `i` is the rank among the page's Link annotations (any other subtype is not
 * counted), PDF.js's order: the number the gate's attribution names. One of: { i, unsupported: true } (no rectangle with an
 * area, a `url` outside the allow-list, a named action, JavaScript with no URL, an attachment, `unsafeUrl` alone, more than
 * MAX_GLYPHS glyph points: nothing the reader can carry), or { i, rect, boxes (its quads' boxes, else its rectangle: also where
 * its quads are ill formed), dest | url, ov (overlaid text, collapsed), border | null, g, g2: the two sets of glyph points
 * inside it as { x, y, ch } columns }. Past MAX_LINKS annotations a page the rest are counted unsupported and not kept
 */
export function annotsOf(raw, points, points2 = null) {
  const list = []
  const grid = gridOf(points), grid2 = points2 ? gridOf(points2) : null
  let i = 0, total = 0, unsupported = 0
  const pick = (p, idx) => ({ x: idx.map(k => p.x[k]), y: idx.map(k => p.y[k]), ch: idx.map(k => p.ch[k]), ...(p.key ? { key: idx.map(k => p.key[k]) } : {}) })
  for (const a of raw ?? []) {
    if (a?.subtype !== 'Link') continue
    const rank = i++
    if (rank >= MAX_LINKS) { unsupported++; continue }
    const rect = Array.isArray(a.rect) && a.rect.length === 4 && finite(a.rect) ? box4(...a.rect) : null
    const quads = a.quadPoints ? quadBoxes(a.quadPoints) : null
    const boxes = quads ?? (rect ? [rect] : [])
    let target = null
    if (typeof a.url === 'string' && a.url) { if (urlAllowed(a.url)) target = { url: a.url } }
    else if ((typeof a.dest === 'string' && a.dest) || (Array.isArray(a.dest) && a.dest.length)) target = { dest: a.dest }
    const hit = rect && sound(rect) && boxes.every(sound) && target ? hitsIn(grid, boxes, MAX_GLYPHS) : null
    const hit2 = hit && grid2 ? hitsIn(grid2, boxes, MAX_GLYPHS) : []
    if (!hit || !hit2) { list.push({ i: rank, unsupported: true }); unsupported++; continue }
    const bw = a.borderStyle?.width
    const color = a.color && a.color.length >= 3 ? [a.color[0], a.color[1], a.color[2]] : null
    const border = typeof bw === 'number' && Number.isFinite(bw) && bw > 0 && color ? { width: bw, rgb: color, style: BORDER_STYLES[a.borderStyle.style] ?? 'solid' } : null
    list.push({ i: rank, rect, boxes, ...target, ov: typeof a.overlaidText === 'string' ? collapse(a.overlaidText) : '', border, g: pick(points, hit), g2: grid2 ? pick(points2, hit2) : { x: [], y: [], ch: [], key: [] } })
    total++
  }
  return { list, total, unsupported }
}

/**
 * The hidden area of a page as a question: whether a point (device pixels) lies where the drawing's operations (a page record's
 * `ops`, device pixels [x, y, w, h]) left the original's ink hidden at the end. In their order: a unit's hidden rectangles hide; a
 * paste shows the page's ink again in its rectangles; a crop hides nothing
 */
export function erasedOf(ops) {
  const list = ops ?? []
  const within = (x, y, b) => x >= b[0] && x < b[0] + b[2] && y >= b[1] && y < b[1] + b[3]
  return (x, y) => {
    let erased = false
    for (const o of list) {
      if (o.op === 'hidden') { if (o.rects.some(b => within(x, y, b))) erased = true }
      else if (o.op === 'paste') { if (o.rects.some(b => within(x, y, b))) erased = false }
    }
    return erased
  }
}

/** an annotation's points for the questions asked of it: the points of both sets, else its rectangle's centre (a glyphless link) */
function pointsOfAnnot(a) {
  const n = a.g.x.length + a.g2.x.length
  if (!n) return [[(a.rect[0] + a.rect[2]) / 2, (a.rect[1] + a.rect[3]) / 2]]
  const out = []
  for (const g of [a.g, a.g2]) for (let k = 0; k < g.x.length; k++) out.push([g.x[k], g.y[k]])
  return out
}

/** a unit's rectangles on page q as ownership reads them: those its growth there left (`grown`, run.mjs growOn's, final once it
 *  has grown on q: a unit's lay may still move its first line's edge to its label, after the units ranked after it were matched),
 *  else its rectangles there; with their bounding box, or null where it has none on q */
function rectsOn(w, q) {
  // (a placed unit's own `grownRects`, or a unit as the freeze lists it, `grown`)
  const g = w.grownRects instanceof Map ? w.grownRects : w.grown instanceof Map ? w.grown : null
  const rs = g?.get(q) ?? (w.rects ?? []).filter(r => r[0] === q)
  return rs.length ? { rs, box: [Math.min(...rs.map(r => r[1])), Math.min(...rs.map(r => r[2])), Math.max(...rs.map(r => r[3])), Math.max(...rs.map(r => r[4]))] } : null
}
/** whether rectangles (rectsOn's) hold more than half of the points, charging the budget a test a point (and a rectangle);
 *  false once the budget is spent (the caller then reads no owner) */
function holdsMost(h, pts, budget) {
  const need = Math.floor(pts.length / 2) + 1
  let n = 0
  for (const [x, y] of pts) {
    if (--budget.left < 0) return false
    if (x < h.box[0] || x > h.box[2] || y < h.box[1] || y > h.box[3]) continue
    budget.left -= h.rs.length
    if (h.rs.some(r => x >= r[1] && x <= r[3] && y >= r[2] && y <= r[4])) n++
  }
  return n >= need
}
/**
 * The owner of each annotation of page q, one rule for the match and the freeze (the 3a design §3.2, as the run lays a page):
 * of `ranked` (units with rectangles on q, in order: the units placed with lines on q in their growth rank there, then for the
 * freeze's ranking the units left the original's), the first whose rectangles on q (rectsOn: as grown) hold more than half of
 * the annotation's points (both readings) owns it. Not "the most points" (the design's first wording): a unit ranked after another
 * may not have grown when the other is matched, and what it holds then is not final; the first with a majority is final once
 * every unit ranked before it has grown, which each has before it is laid. No unit with a majority: no owner, never matched.
 * `stop`: the index past which no owner is looked for (a unit's match: itself); `budget` ({ left }): the tests it may spend,
 * past which no test is made and an annotation has no owner (`skipped`, a Set given: the `i` of each annotation so left).
 * Returns a Map of annotation `i` to the owner's index in `ranked`
 */
export function ownersOf(list, ranked, q, { stop = ranked.length - 1, budget = { left: WORK_MAX }, skipped = null } = {}) {
  const on = ranked.slice(0, stop + 1).map(w => rectsOn(w, q))
  const out = new Map()
  for (const a of list ?? []) {
    if (a.unsupported) continue
    if (budget.left > 0) {
      const pts = pointsOfAnnot(a)
      const at = on.findIndex(h => h && budget.left >= 0 && holdsMost(h, pts, budget))
      if (budget.left >= 0) { if (at >= 0) out.set(a.i, at); continue }
    }
    skipped?.add(a.i)
  }
  return out
}
/** the annotations of page q that unit `u` owns (ownersOf, its match): `before`, the units ranked before it there; `skipped`, a
 *  Set given, takes the `i` of those its budget left unread (whose owner is not known: the match's `unplaced`) */
export function ownedIn(list, u, before, q, budget = { left: WORK_MAX }, skipped = null) {
  const owners = ownersOf(list, [...before, u], q, { budget, skipped })
  return (list ?? []).filter(a => !a.unsupported && owners.get(a.i) === before.length)
}

/** what an annotation points to, as the match tells its kinds apart: a citation (hyperref's `cite.<key>`), a footnote's mark
 *  (`Hfootnote.<n>`), any other destination (a reference, `\hyperref`), a url */
export function kindOfAnnot(a) {
  if (a.url !== undefined) return 'url'
  if (typeof a.dest === 'string' && a.dest.startsWith('cite.')) return 'cite'
  if (typeof a.dest === 'string' && /^Hfootnote\./.test(a.dest)) return 'note'
  return 'internal'
}

const CITE_SRC = /^\\(?![Nn]ocite)[A-Za-z]*[Cc]ite[A-Za-z]*\*?\s*(?:\[[^\]]*\]\s*)*\{([^{}]*)\}/
const REF_SRC = /^\\(?:ref|eqref|autoref|Autoref|cref|Cref|crefrange|Crefrange|cpageref|Cpageref|pageref|nameref|Nameref|vref|Vref|labelcref|subref|hyperref|hyperlink)\*?(?![A-Za-z])/
const NOTE_SRC = /^\\(?:footnote|footnotemark)(?![A-Za-z])/
const URL_SRC = /^\\url\*?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/
const HREF_SRC = /^\\href\*?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/

/** a URL as the match compares two: TeX's escapes undone in its argument (`\#`, `\%`, `\_`, `\&`, `\~`, `\$`), then the WHATWG
 *  parser's form of it; null where it is none */
export function urlOf(arg) {
  if (typeof arg !== 'string') return null
  try { return new URL(arg.replace(/\\([#%_&~$])/g, '$1')).href } catch { return null }
}

/** the link a unit's piece may carry, by its source (a placeholder, a nested footnote, or an open piece of a pair): { kind:
 *  'cite', keys } | { kind: 'url', url } | { kind: 'internal' } | { kind: 'note' } | null (none: text, a formula) */
export function linkKindOf(piece) {
  if (piece?.t === 'nested') return { kind: 'note' }
  const src = typeof piece?.src === 'string' ? piece.src : ''
  if (piece?.t === 'open') {
    const h = HREF_SRC.exec(src)
    if (h) { const url = urlOf(h[1]); return url ? { kind: 'url', url } : null }
    // (\hyperlink{name}{...} names its destination as the PDF does: matched by it)
    const n = /^\\hyperlink\s*\{([^{}]+)\}/.exec(src)
    if (n) return { kind: 'internal', name: n[1].trim() }
    return /^\\(?:hyperref|hyperlink)(?![A-Za-z])/.test(src) ? { kind: 'internal' } : null
  }
  if (piece?.t !== 'ph') return null
  const c = CITE_SRC.exec(src)
  if (c) return { kind: 'cite', keys: c[1].split(',').map(k => k.trim()).filter(Boolean) }
  const u = URL_SRC.exec(src) ?? HREF_SRC.exec(src)
  if (u) { const url = urlOf(u[1]); return url ? { kind: 'url', url } : null }
  if (NOTE_SRC.test(src)) return { kind: 'note' }
  if (REF_SRC.test(src)) return { kind: 'internal' }
  return null
}

/** whether a piece's source names one link target alone: a citation of one key, a url, a reference to one label, a footnote's
 *  mark (where its text is not found in its drawing, a link it took by key or url may then be laid over it whole) */
export function singleTarget(piece, kind) {
  if (!kind) return false
  if (kind.kind === 'cite') return kind.keys.length === 1
  if (kind.kind === 'internal') { const arg = /\{([^{}]*)\}/.exec(piece?.src ?? ''); return !!arg && !arg[1].includes(',') }
  return true
}

const sameTarget = (a, b) => (a.url !== undefined ? a.url === b.url : b.url === undefined && JSON.stringify(a.dest) === JSON.stringify(b.dest))
/** two annotations drawn alike: no border either, or the same width, colour and style (a record carries one border) */
const sameBorder = (a, b) => (!a.border || !b.border ? !a.border && !b.border : a.border.width === b.border.width && a.border.style === b.border.style && a.border.rgb.every((v, i) => v === b.border.rgb[i]))
const within = (x, y, s) => x >= s[1] - 0.5 && x <= s[3] + 0.5 && y >= s[5] - 0.5 && y <= s[4] + 0.5

/**
 * A unit's annotations matched to its pieces, once, at its first paint (the 3a design §3.3), each tier over what the tiers
 * before it left, and only certain matches made (a wrong link is worse than none):
 *  1. geometry: every character under the annotation (its engine characters, `g2`, by key) among one piece's rendering's (`gap`,
 *     the page characters it took), else every one of their points in one piece's segments of TeX's file (`segs`: a rendering
 *     with no characters, a source's or a citation's as the page wrote it before); a piece so found that is drawn as nothing or
 *     kept where it stands takes none (the annotation is the freeze's: in place over its ink, or dropped)
 *  2. key: a citation's `cite.X` against the unit's drawn citations holding X that took no annotation of it; a destination
 *     against the `\hyperlink` pairs that name it
 *  3. url: against its drawn `\url` and `\href` pieces and `\href` pairs of the same url that took none of it
 *  4. order, by kind: a footnote's mark against its drawn marks, another destination against its references and `\hyperref`
 *     or `\hyperlink` pairs, that took none of their kind.
 *  5. whole: the annotations of one target no tier took that hold, together, every one of the unit's own characters the
 *     drawing replaces (`own` of its `whole` target: a link round the unit's whole text, a contents entry's title, whose unit
 *     has no piece to take it), all to the unit's drawing; two targets that both do, none of them (`ambiguous`).
 * In 2 to 4 the annotations (page, then PDF order: TeX set them in the source's order) and the pieces in the SOURCE's order
 * (`ord`, each piece's index in the unit's source, never the translation's order, which may set two of them the other way) are
 * paired in turn where they are as many, all to the one piece where there is one and they are of one target (a citation's
 * name and year, a url over two lines), else none of them (`ambiguous`); so too where two pieces could take them and one has
 * no source index to order it by. `cands`: [{ q, a }] in page then PDF order; `targets`: [{ ord (its piece's index in the
 * source, or null), k | pair, kind, keys, url, name (a `\hyperlink`'s destination), single (its source names one target), gap
 * (Set of `page|item|k`) | null, segs ([page, x0, baseline, x1, top, bottom] ...) | null, draw ('text' | 'crop' | 'pair' |
 * 'whole' | null), own (the whole target's: [{ key, page, x0, x1, yb }]) }]; `budget` ({ left }): the tests it may spend, past which an annotation is `unplaced`. Returns { groups: [{ to:
 * target, annots: [{ q, a, tier }] }], tried: [{ q, i, why }] }
 */
export function matchUnit({ cands, targets, budget = { left: WORK_MAX } }) {
  const took = new Map(), tried = []
  const add = (T, c, tier) => { const g = took.get(T) ?? took.set(T, []).get(T); g.push({ ...c, tier }) }
  const left = []
  for (const c of cands) {
    const g = c.a.g2
    let hit = null, n = 0
    budget.left -= (g.key?.length ?? 0) * targets.length
    // (past its budget, a hostile page's: what is left is matched by nothing)
    if (budget.left < 0) { tried.push({ q: c.q, i: c.a.i, why: 'unplaced' }); continue }
    if (g.key?.length) {
      for (const T of targets) if (T.gap && g.key.every(key => T.gap.has(`${c.q}|${key}`))) { hit = T; n++ }
      if (!n) for (const T of targets) {
        if (!T.segs?.length) continue
        budget.left -= T.segs.length * g.x.length
        if (budget.left < 0) break
        if (g.x.every((x, j) => T.segs.some(s => s[0] === c.q && within(x, g.y[j], s)))) { hit = T; n++ }
      }
    }
    if (budget.left < 0) { tried.push({ q: c.q, i: c.a.i, why: 'unplaced' }); continue }
    if (n !== 1) { left.push(c); continue }
    if (hit.draw) add(hit, c, 'geometry')
  }
  // (what a target took already, by kind and target: a later tier pairs only the targets that took none of its own)
  const tookOf = (T, f) => (took.get(T) ?? []).some(x => f(x.a))
  const done = new Set()
  // (the pieces a tier pairs, in the source's order; null where two or more could take them and one has no place in the source)
  const inSource = list => (list.length > 1 && list.some(T => !Number.isInteger(T.ord)) ? null : list.slice().sort((a, b) => a.ord - b.ord))
  const assign = (anns, list, tier) => {
    if (!anns.length || !list.length) return
    for (const c of anns) done.add(c)
    const tgts = inSource(list)
    if (!tgts) { for (const c of anns) tried.push({ q: c.q, i: c.a.i, why: 'ambiguous' }); return }
    if (anns.length === tgts.length) anns.forEach((c, j) => add(tgts[j], c, tier))
    // (all to the one piece only where they are of one target: a pair's text, which no text found tells apart, is one link)
    else if (tgts.length === 1 && anns.every(c => sameTarget(c.a, anns[0].a))) for (const c of anns) add(tgts[0], c, tier)
    else for (const c of anns) tried.push({ q: c.q, i: c.a.i, why: 'ambiguous' })
  }
  const drawn = targets.filter(T => T.draw)
  // 2. key
  const byKey = new Map()
  for (const c of left) if (kindOfAnnot(c.a) === 'cite') { const x = c.a.dest.slice(5); (byKey.get(x) ?? byKey.set(x, []).get(x)).push(c) }
  for (const [x, anns] of byKey) assign(anns, drawn.filter(T => T.kind === 'cite' && T.keys?.includes(x) && !tookOf(T, a => a.dest === `cite.${x}`)), 'key')
  // (and a destination a \hyperlink names)
  const byName = new Map()
  for (const c of left) if (!done.has(c) && kindOfAnnot(c.a) === 'internal' && typeof c.a.dest === 'string' && drawn.some(T => T.name === c.a.dest)) (byName.get(c.a.dest) ?? byName.set(c.a.dest, []).get(c.a.dest)).push(c)
  for (const [name, anns] of byName) assign(anns, drawn.filter(T => T.name === name && !tookOf(T, a => a.dest === name)), 'key')
  // 3. url
  const byUrl = new Map()
  for (const c of left) if (kindOfAnnot(c.a) === 'url') { const u = urlOf(c.a.url) ?? c.a.url; (byUrl.get(u) ?? byUrl.set(u, []).get(u)).push(c) }
  for (const [u, anns] of byUrl) assign(anns, drawn.filter(T => T.kind === 'url' && T.url === u && !tookOf(T, a => a.url !== undefined && (urlOf(a.url) ?? a.url) === u)), 'url')
  // 4. order
  for (const kind of ['note', 'internal']) {
    const anns = left.filter(c => !done.has(c) && kindOfAnnot(c.a) === kind)
    // (a \hyperlink, which names its destination, is matched by it alone)
    assign(anns, drawn.filter(T => T.kind === kind && T.name === undefined && !tookOf(T, a => kindOfAnnot(a) === kind)), 'order')
  }
  // 5. whole: the annotations of one target that hold, together, every character of the unit's own the drawing replaces
  const whole = drawn.find(T => T.draw === 'whole' && T.own?.length)
  if (whole) {
    const byTarget = []
    for (const c of left) {
      if (done.has(c)) continue
      const g = byTarget.find(x => sameTarget(x[0].a, c.a))
      if (g) g.push(c); else byTarget.push([c])
    }
    budget.left -= whole.own.length * byTarget.length
    const holding = budget.left < 0 ? [] : byTarget.filter(g => {
      const under = new Set(g.flatMap(c => (c.a.g2.key ?? []).map(key => `${c.q}|${key}`)))
      return whole.own.every(ch => under.has(ch.key))
    })
    if (holding.length === 1) for (const c of holding[0]) add(whole, c, 'whole')
    else for (const g of holding) for (const c of g) tried.push({ q: c.q, i: c.a.i, why: 'ambiguous' })
  }
  return { groups: [...took].map(([to, annots]) => ({ to, annots })), tried }
}

const LETTER = /[\p{L}\p{N}]/u, INK = /\S/u, MARK = /[\p{M}\p{Lm}\p{Sk}]/u
/** a run of characters (one each, in order) as a match finds one in another: letters and digits alone, their accents and
 *  marks left out (NFKD, then no mark, modifier or spacing accent: a name the PDF set "Duriˇckovi´c" is the drawn "Durickovic"),
 *  or (`ink`) every non-space character, NFKC; with each UTF-16 unit's character */
function normed(chars, keep) {
  let s = ''
  const at = []
  const letters = keep === LETTER
  chars.forEach((ch, j) => { for (const c of ch.normalize(letters ? 'NFKD' : 'NFKC')) if (keep.test(c) && !(letters && MARK.test(c))) { s += c; for (let u = 0; u < c.length; u++) at.push(j) } })
  return { s, at }
}

/**
 * The records a unit's matched annotations make (the 3a design §3.4): in PDF units, from the layout's own numbers (never a
 * drawn element's box), one box a drawn line.
 * - A text rendering (`text`): the piece's drawn characters in their order (D); the annotation's own text (PDF.js's overlaid
 *   text, else its engine characters) found in D at or after where the piece's annotation before it ended, on letters and
 *   digits (every non-space character where it has none), widened over the marks at its ends that are its own (a hyphen, a
 *   full stop); each drawn line of what was
 *   found a box, across from the edge before its first character to the edge after its last (`edge`: the run's, as the SVG
 *   lays it out) and up and down its tokens' bands (`band`: the word table's). A word or number is found whole (no letter or
 *   digit of the drawing beside it: the "2" of "[12, 2]" is never the 2 of 12) unless an annotation of its target abuts it.
 *   Not found: the piece whole only where the annotation is its only one, the match told its target by its geometry, key or url
 *   (never by order alone) and the piece names one target (`single`), else none (`unplaced`). Two of one target whose ranges
 *   abut (no other character between) are one record (a link TeX broke over two lines: "Rad-" and "ford et al.").
 *   A range that starts deep inside a run, where the drift the run gathers before it (DRIFT_BOUND x its distance from the run's
 *   start) could reach half its first character's width, is `unplaced`: its box could stand over its neighbour's glyphs, another
 *   link's among them ("Sicherheitsbewertungsverfahren[12,13]" drawn as one run), and a wrong link is worse than none.
 * - A crop: the annotation's boxes mapped by the crop's own map from its source to where it is drawn, cut to the drawn box;
 *   named by the original's text under it (its overlaid text), what the crop shows there.
 * - A pair: each drawn line of its tokens (from the first to the last) a box; every annotation of it one record.
 * A record is named by what is drawn under it (a crop by its text), white space collapsed. One whose boxes lie on two pages (a
 * piece the layer set over a page break) keeps those of its first page alone: each annotation one record.
 * `lines`: the unit's laid lines, each { line, runs } (layer2.mjs lineRuns); `edge(line, run, at)`, `band(t, line)` ({ top,
 * bottom }); `scale`, the layout's; `budget` ({ left }): the work it may spend, past which a group is `unplaced`. Returns
 * { records: [{ page, li, x, rec, sources }], tried: [{ q, i, why }] }
 */
export function placeUnit({ groups, lines, edge, band, scale, budget = { left: WORK_MAX } }) {
  const records = [], tried = []
  const items = lines.reduce((n, l) => n + l.line.items.length, 0) + 1
  for (const { to, annots } of groups) {
    // (each group reads the unit's drawn items once and searches its piece's text: past the budget, nothing more is placed)
    budget.left -= items * (annots.length + 1)
    if (budget.left < 0) { for (const c of annots) tried.push({ q: c.q, i: c.a.i, why: 'unplaced' }); continue }
    if (to.draw === 'crop') placeCrop(to, annots, lines, scale, records, tried)
    else if (to.draw === 'pair' || to.draw === 'whole') placePair(to, annots, lines, edge, band, records, tried, budget)
    else placeText(to, annots, lines, edge, band, records, tried, budget)
  }
  return { records, tried }
}

const recordOf = (a, boxes, name) => {
  const rec = { boxes, ...(a.url !== undefined ? { url: a.url } : { dest: a.dest }), name, moved: true, order: 0 }
  if (a.border) rec.border = { width: a.border.width, rgb: [...a.border.rgb], style: a.border.style }
  return rec
}
const sound4 = b => b[0] < b[2] && b[1] < b[3]

/**
 * A drawn range's extent across on one line: from the edge before its first character to the edge after its last, the right end
 * carried on where nothing of its word stands after it: over its token's marks that are no letter or digit ("," of "(Taylor,"),
 * and on to where the next item starts, where that item begins a run of its own (its glyphs at their own place), or a quarter em
 * past a line's end. A browser lays a run's glyphs by its own advances, which the layout's measure is near but not exactly
 * (Chromium on Linux, wider): the glyphs drift right along a run from its start, so a box ends no nearer than the next run's
 * start, which drift never crosses. Its left end is its first character's: drift carries that character into the box, and what
 * stands before it, a mark or the gap, is where the run before drifts to (the long word before "[32]" drawn over its "[")
 */
function spanOf(line, e0, e1, edge, pad) {
  const startOf = (run, n) => run.items.find(([m]) => m === n)?.[1] ?? 0
  const items = line.items
  const x0 = edge(line, e0.run, e0.at)
  let x1 = edge(line, e1.run, e1.end)
  const t1 = items[e1.n].t, s1 = startOf(e1.run, e1.n)
  if (!LETTER.test(t1.s.slice(e1.end - s1))) {
    const end = edge(line, e1.run, s1 + t1.s.length)
    let m = e1.n + 1
    while (m < items.length && items[m].t.space) m++
    if (m >= items.length) x1 = end + pad
    else if (!e1.run.items.some(([k]) => k === m) && items[m].x > end) x1 = items[m].x
    else x1 = end
  }
  return { x0, x1 }
}

/** whether a drawn range's part on one line starts so deep inside its run that the drift the run gathers before it could carry
 *  a glyph across its box's edge: DRIFT_BOUND x its distance from the run's start, against half its first character's width */
function tooDeep(line, e0, edge) {
  const start = edge(line, e0.run, 0), x0 = edge(line, e0.run, e0.at), w0 = edge(line, e0.run, e0.end) - x0
  return !(DRIFT_BOUND * Math.abs(x0 - start) < Math.abs(w0) / 2)
}

/** the record of a drawn range of a unit's lines: one box a line, those of its first page alone; null where none is sound, or
 *  where a line's part starts too deep inside its run (tooDeep) */
function rangeRecord(entries, lines, edge, band) {
  if (!entries.length) return null
  const page = lines[entries[0].li].line.page
  const mine = entries.filter(e => lines[e.li].line.page === page)
  const boxes = [], lineOf = []
  for (const li of [...new Set(mine.map(e => e.li))]) {
    const on = mine.filter(e => e.li === li), { line } = lines[li]
    const e0 = on[0], e1 = on.at(-1)
    if (tooDeep(line, e0, edge)) return null
    let top = Number.NEGATIVE_INFINITY, bottom = Number.POSITIVE_INFINITY
    for (const n of new Set(on.map(e => e.n))) { const b = band(line.items[n].t, line); if (b.top > top) top = b.top; if (b.bottom < bottom) bottom = b.bottom }
    const { x0, x1 } = spanOf(line, e0, e1, edge, 0.25 * (top - bottom))
    const box = [Math.min(x0, x1), bottom, Math.max(x0, x1), top]
    if (sound4(box) && box.every(Number.isFinite)) { boxes.push(box); lineOf.push(li) }
  }
  if (!boxes.length) return null
  // (named by what is drawn under it: its characters, a space where the drawing has one between them)
  let name = ''
  mine.forEach((e, j) => {
    const p = mine[j - 1]
    if (p && spacedApart(p, e, lines)) name += ' '
    name += e.ch
  })
  return { page, li: lineOf[0], x: boxes[0][0], boxes: boxes.flat(), name: collapse(name) }
}

/** whether the drawing sets a space between two of its characters (drawn entries, `p` before `e`): a line's end between them, a
 *  space in their run between them, or a space among the items between them */
const spacedApart = (p, e, lines) => p.li !== e.li || (p.run === e.run ? /\s/.test(e.run.text.slice(p.end, e.at)) : lines[e.li].line.items.slice(p.n + 1, e.n).some(it => it.t.space))

function placeText(to, annots, lines, edge, band, records, tried, budget) {
  // the piece's drawn characters, in drawing order
  const D = []
  lines.forEach(({ line, runs }, li) => {
    for (const run of runs) {
      if (run.crop !== undefined) continue
      for (const [n, at] of run.items) {
        const t = line.items[n].t
        if (t.space || t.crop || t.k !== to.k || typeof t.s !== 'string' || t.ph === undefined) continue
        let o = at
        for (const ch of t.s) { D.push({ ch, li, run, at: o, end: o + ch.length, n }); o += ch.length }
      }
    }
  })
  if (!D.length) { for (const c of annots) tried.push({ q: c.q, i: c.a.i, why: 'unplaced' }); return }
  // (the search reads the drawn characters for each annotation, and each place its text is found at: charged before it is made)
  const ownOf = c => (c.a.ov ? [...c.a.ov] : c.a.g2.ch)
  budget.left -= D.length * annots.reduce((n, c) => n + ownOf(c).length + 1, 1)
  if (budget.left < 0) { for (const c of annots) tried.push({ q: c.q, i: c.a.i, why: 'unplaced' }); return }
  const dChars = D.map(e => e.ch)
  const forms = { letters: normed(dChars, LETTER), ink: normed(dChars, INK) }
  const found = []
  let from = 0
  // (in the original's order, page then PDF order, whichever tier matched each: each is looked for after the one before)
  const sorted = annots.slice().sort((a, b) => a.q - b.q || a.a.i - b.a.i)
  // (its own text, ownOf: PDF.js's overlaid text, read from the glyphs' own places; the engine's characters under it where that
  // is empty, whose places are its widths' estimate and may take a neighbour for one of its own)
  const formOf = own => { const A = normed(own, LETTER); return A.s ? { mode: 'letters', A } : { mode: 'ink', A: normed(own, INK) } }
  // (a word or a number found whole: no letter or digit of the drawing just before or after it in its word, the drawing's space
  // or a line's end ending a word (spacedApart: cleveref's "Figure 1", whose link is the number's alone), unless the annotation
  // before it, of its target, ended there, or the one after it, of its target, starts there: "Rad-" and "ford et al." drawn
  // "Radford")
  const isLetter = j => j >= 0 && j < D.length && LETTER.test(D[j].ch)
  sorted.forEach((c, n) => {
    const own = ownOf(c), { mode, A } = formOf(own)
    const F = forms[mode]
    const prev = found.at(-1), next = sorted[n + 1]
    const nextS = next && sameTarget(next.a, c.a) ? formOf(ownOf(next)) : null
    let s0 = -1
    if (A.s) {
      let u = F.at.findIndex(j => j >= from)
      if (u < 0) u = F.s.length
      for (let at = F.s.indexOf(A.s, u); at >= 0; at = F.s.indexOf(A.s, at + 1)) {
        const ds = F.at[at], de = F.at[at + A.s.length - 1]
        const leftOk = mode !== 'letters' || !isLetter(ds - 1) || spacedApart(D[ds - 1], D[ds], lines) || (prev && prev.de === ds - 1 && sameTarget(prev.c.a, c.a))
        const rightOk = mode !== 'letters' || !isLetter(de + 1) || spacedApart(D[de], D[de + 1], lines) || (nextS?.mode === 'letters' && F.s.startsWith(nextS.A.s, at + A.s.length))
        if (leftOk && rightOk) { s0 = at; break }
      }
    }
    if (s0 < 0) {
      // (not found: the piece whole, only where this is its one annotation, the match told its target (by its geometry, its
      // key or its url, never its order alone) and the piece names that target alone; else none)
      if (annots.length === 1 && c.tier !== 'order' && to.single) found.push({ c, ds: 0, de: D.length - 1 })
      else tried.push({ q: c.q, i: c.a.i, why: 'unplaced' })
      return
    }
    let ds = F.at[s0], de = F.at[s0 + A.s.length - 1]
    // (the marks at its ends that are its own: "Rad-" with its hyphen, "al." with its full stop)
    const ink = own.filter(ch => INK.test(ch))
    const first = ink.findIndex(ch => LETTER.test(ch)), last = ink.findLastIndex(ch => LETTER.test(ch))
    if (mode === 'letters') {
      for (let j = last + 1; j < ink.length && de + 1 < D.length && D[de + 1].ch === ink[j]; j++) de++
      for (let j = first - 1; j >= 0 && ds - 1 >= 0 && D[ds - 1].ch === ink[j] && ds - 1 >= from; j--) ds--
    }
    found.push({ c, ds, de })
    from = de + 1
  })
  // (two of one target, drawn alike, whose ranges abut: one record)
  const merged = []
  for (const f of found) {
    const prev = merged.at(-1)
    if (prev && prev.de + 1 === f.ds && sameTarget(prev.annots[0].a, f.c.a) && sameBorder(prev.annots[0].a, f.c.a)) { prev.de = f.de; prev.annots.push(f.c) }
    else merged.push({ ds: f.ds, de: f.de, annots: [f.c] })
  }
  for (const m of merged) {
    const r = rangeRecord(D.slice(m.ds, m.de + 1), lines, edge, band)
    if (!r) { for (const c of m.annots) tried.push({ q: c.q, i: c.a.i, why: 'unplaced' }); continue }
    records.push({ page: r.page, li: r.li, x: r.x, rec: recordOf(m.annots[0].a, r.boxes, r.name), sources: { annots: m.annots.map(c => [c.q, c.a.i]), tier: m.annots[0].tier } })
  }
}

function placeCrop(to, annots, lines, scale, records, tried) {
  // (each drawn crop of its placeholder: one, or one a part of a formula TeX broke over lines, in the drawing's order)
  const at = []
  lines.forEach(({ line }, li) => { line.items.forEach((it, n) => { if (it.t.crop?.k === to.k) at.push({ line, li, it, n }) }) })
  for (const c of annots) {
    // (each of the annotation's boxes (its quads', else its rectangle) by the map of each part of its page, cut to that part's
    // drawn box: a link over two lines of a crop is two boxes, never the rectangle round both; those of the first drawn page
    // any part of it is placed on, as a record's are)
    let first = null
    const box = []
    for (const x of at) {
      const { line, it } = x, r = it.t.crop, cr = r.crop
      if (c.q !== r.page || (first && line.page !== first.line.page)) continue
      const sx = it.w / (cr[2] - cr[0])
      const X = v => it.x + (v - cr[0]) * sx, Y = y => line.baseline + (y - r.baseline) * (line.seg?.scale ?? scale)
      const drawn = [it.x, Y(cr[1]), it.x + it.w, Y(cr[3])]
      const had = box.length
      for (const ar of c.a.boxes?.length ? c.a.boxes : [c.a.rect]) {
        const b = [Math.max(drawn[0], X(ar[0])), Math.max(drawn[1], Y(ar[1])), Math.min(drawn[2], X(ar[2])), Math.min(drawn[3], Y(ar[3]))]
        if (sound4(b) && b.every(Number.isFinite)) box.push(...b)
      }
      if (box.length > had && !first) first = x
    }
    if (!first) { tried.push({ q: c.q, i: c.a.i, why: 'unplaced' }); continue }
    // (named by what the crop shows under it: the original's text there, PDF.js's overlaid text; the crop's copy text names the
    // whole crop, which two links over one crop would share, and may not be what it shows)
    const name = collapse(c.a.ov || (annots.length === 1 ? at[0].it.t.crop.text : '') || c.a.g2.ch.join(''))
    records.push({ page: first.line.page, li: first.li, x: box[0], rec: recordOf(c.a, box, name), sources: { annots: [[c.q, c.a.i]], tier: c.tier } })
  }
}

function placePair(to, annots, lines, edge, band, records, tried, budget) {
  const D = []
  lines.forEach(({ line, runs }, li) => {
    for (const run of runs) {
      if (run.crop !== undefined) continue
      for (const [n, at] of run.items) {
        const t = line.items[n].t
        if (t.space || t.crop || typeof t.s !== 'string' || (to.draw !== 'whole' && t.st?.link !== to.pair)) continue
        let o = at
        for (const ch of t.s) { D.push({ ch, li, run, at: o, end: o + ch.length, n }); o += ch.length }
      }
    }
  })
  // (one pair's text is one record, of one border: annotations of it drawn otherwise cannot be told apart in it)
  if (annots.some(c => !sameBorder(c.a, annots[0].a))) { for (const c of annots) tried.push({ q: c.q, i: c.a.i, why: 'ambiguous' }); return }
  // (its characters read once a line it is on: charged before)
  budget.left -= D.length * (annots.length + 1)
  if (budget.left < 0) { for (const c of annots) tried.push({ q: c.q, i: c.a.i, why: 'unplaced' }); return }
  const r = rangeRecord(D, lines, edge, band)
  if (!r) { for (const c of annots) tried.push({ q: c.q, i: c.a.i, why: 'unplaced' }); return }
  const kept = to.draw === 'whole' ? keptOf(to.own, annots, r.page) : null
  const boxes = kept ? [...kept.before.flat(), ...r.boxes, ...kept.after.flat()] : r.boxes
  const name = kept ? collapse(`${kept.beforeText} ${r.name} ${kept.afterText}`) : r.name
  records.push({ page: r.page, li: r.li, x: r.x, rec: recordOf(annots[0].a, boxes, name), sources: { annots: annots.map(c => [c.q, c.a.i]), tier: annots[0].tier } })
}

/**
 * What a link round a unit's whole text holds besides it on `page`, which stays where TeX set it (a contents entry's number,
 * not the unit's: kept as the original's ink): of each of its boxes over the unit's own characters (`own`), the part before the
 * first of them and the part after the last, each where a glyph point of the annotation's stands there, with those glyphs'
 * text. The record keeps them beside the drawing, so that the number links on the translated page as on the original
 */
function keptOf(own, annots, page) {
  const out = { before: [], after: [], beforeText: '', afterText: '' }
  const ownKeys = new Set(own.map(c => c.key))
  for (const c of annots) {
    if (c.q !== page) continue
    const g = c.a.g2
    for (const b of c.a.boxes) {
      let lo = Number.POSITIVE_INFINITY, hi = Number.NEGATIVE_INFINITY
      for (const ch of own) if (ch.page === page && inside((ch.x0 + ch.x1) / 2, ch.yb, b)) { lo = Math.min(lo, ch.x0); hi = Math.max(hi, ch.x1) }
      if (!(lo < hi)) continue
      let before = '', after = ''
      for (let k = 0; k < g.x.length; k++) {
        if (ownKeys.has(`${c.q}|${g.key?.[k]}`) || !inside(g.x[k], g.y[k], b)) continue
        if (g.x[k] < lo) before += g.ch[k]
        else if (g.x[k] > hi) after += g.ch[k]
      }
      if (before && sound([b[0], b[1], lo, b[3]])) { out.before.push([b[0], b[1], lo, b[3]]); out.beforeText += before }
      if (after && sound([hi, b[1], b[2], b[3]])) { out.after.push([hi, b[1], b[2], b[3]]); out.afterText += after }
    }
  }
  return out.before.length || out.after.length ? out : null
}

/** a record over the original's own ink: the annotation's rectangle (or quads), named by PDF.js's overlaid text (the engine's
 *  characters under it where that is empty), not moved. `order` is set when the list is ranked */
export function inPlaceOf(a) {
  const name = a.ov || collapse(a.g2.ch.join(''))
  const rec = { boxes: a.boxes.flat(), ...(a.url !== undefined ? { url: a.url } : { dest: a.dest }), name, moved: false, order: 0 }
  if (a.border) rec.border = { width: a.border.width, rgb: [...a.border.rgb], style: a.border.style }
  return rec
}

/**
 * A page's links once it is final. `list`: the page's annotations (`annotsOf`'s, null where the read failed: then no link);
 * `ops`, `devOf(x, y)`: the page's operations and the map of a PDF point to their device pixels; `units`: the units with lines
 * on the page, those left the original's too; `consumed`: the annotations (by `i`) a unit's match took, with `moved` the records
 * those made (each { rec, stream, id, seq: its unit's drawing order on the page, sources }); `why`: the reason an owner's match
 * gave an annotation it left; `sources` asks for the attribution, the gate's.
 *
 * Each annotation not consumed: no point of either set erased by the operations -> in place; otherwise dropped, by the reason
 * its owner's match gave it (`why`: `ambiguous`, `unplaced`), else `unmatched`. What is left once the work budget (WORK_MAX) is
 * spent is dropped `unplaced`. The list is sorted and ranked: by the owner unit's stream index (no owner: after every owned
 * one), then its id, moved before in place, drawing order (moved: `seq`, the unit's own) or PDF order (in place).
 * Returns { records, sources, inPlace, moved (the annotations the moved records carry), dropped: { unmatched, ambiguous,
 * unplaced } }
 */
export function freezeLinks({ list, q, ops, devOf, units, consumed = null, why = null, moved = [], sources = false }) {
  const erased = erasedOf(ops)
  const cost = (ops?.length ?? 0) + 1
  // (each annotation's owner for the ranking, by the match's rule: `units` in their order)
  const ownerBudget = { left: WORK_MAX }
  const owners = ownersOf(list, units, q, { budget: ownerBudget })
  const entries = moved.map((m, k) => ({ rec: m.rec, stream: m.stream ?? Infinity, id: m.id ?? Infinity, kind: 0, seq: m.seq ?? k, src: m.sources ?? null }))
  const dropped = { unmatched: 0, ambiguous: 0, unplaced: 0 }
  let inPlace = 0, work = 0
  for (const a of list ?? []) {
    if (a.unsupported || consumed?.has(a.i)) continue
    const pts = pointsOfAnnot(a)
    work += pts.length * cost
    if (work > WORK_MAX) { dropped.unplaced++; continue }
    if (pts.some(([x, y]) => { const [dx, dy] = devOf(x, y); return erased(dx, dy) })) { dropped[why?.get(a.i) ?? 'unmatched']++; continue }
    inPlace++
    const owner = owners.has(a.i) ? units[owners.get(a.i)] : null
    entries.push({ rec: inPlaceOf(a), stream: owner?.stream ?? Infinity, id: owner?.id ?? Infinity, kind: 1, seq: a.i, src: { annots: [[q, a.i]], tier: 'place' } })
  }
  entries.sort((a, b) => (a.stream !== b.stream ? (a.stream < b.stream ? -1 : 1) : a.id !== b.id ? (a.id < b.id ? -1 : 1) : a.kind - b.kind || a.seq - b.seq))
  entries.forEach((e, k) => { e.rec.order = k })
  return { records: entries.map(e => e.rec), sources: sources ? entries.map(e => e.src) : null, inPlace, moved: moved.reduce((s, m) => s + (m.sources?.annots.length ?? 1), 0), dropped }
}

/** a copy of a page's kept links, none of its objects the record's (L5): the host may keep, change or transfer it */
export function copyLinks(records) {
  return (records ?? []).map(r => {
    const out = { boxes: r.boxes.slice(), ...(r.url !== undefined ? { url: r.url } : { dest: typeof r.dest === 'string' ? r.dest : structuredClone(r.dest) }), name: r.name, moved: r.moved, order: r.order }
    if (r.border) out.border = { width: r.border.width, rgb: [...r.border.rgb], ...(r.border.style ? { style: r.border.style } : {}) }
    return out
  })
}
