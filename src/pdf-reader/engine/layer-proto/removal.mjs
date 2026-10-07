// src/pdf-reader/engine/layer-proto/removal.mjs
// The layer's side of the text-removed PDF (layout/remove.mjs): which of arXiv's glyphs the paper's add-on removes, which
// of them each drawn unit replaces, and where on the page the removed page's pixels go in for it.
// - The add-on is one a paper, whatever the target (pagePlan): every unit the layout file holds has its glyphs removed,
//   those the file gives it (fileOwnership: on its lines' baselines, within a script's window and its erase rectangles,
//   its inline placeholders' by their segments), its label's, its placeholders' rules and its lines'; and the
//   placeholders' page holds each inline placeholder's glyphs and rules.
// - A drawn unit the file locates whole (the hybrid's, tex.mjs) replaces of them (unitRemoval) what its reading does
//   not keep: a display formula, a placeholder the layer keeps, a label it keeps and a character it shows where it is
//   (its reading's 'keep' and 'orphan') stay, shown from the original. What it accounts for that the file gives no unit
//   it replaces too, erased the old way (the add-on kept it).
// - Any other unit (v0's own reading) is drawn the old way, erased and put back: its own rule (the text layer's
//   characters carried to the content stream's glyphs by place and character) is what the old way erases.
// A glyph is one unit's: the file's owner first, else the first unit painted that accounts for it.
//
// Each glyph's box is its outline's (layout/ink.mjs: Node's PDF.js gives it; the browser takes it from the add-on's
// outline table), so the server and the browser own alike, and a swap is its glyphs' outline boxes (layer/swap.mjs
// swapRects), no pixel read. The crops are cut from the page holding the placeholders alone.
//
// An original module (no port statement), importing only relative modules.
import { SWAP_PAD, swapRects } from '../layer/swap.mjs'
import { PH_FLAG } from '../layout/file.mjs'
import { pageInk } from '../layout/ink.mjs'

/** a glyph on a line, scripts included: its baseline within this of the line's (the layout maker's SCRIPT) */
const SCRIPT = size => 0.6 * Math.max(size, 5) + 1.5
const real = c => !c.sep && !c.space && /\S/.test(c.ch)
const keyOf = (page, c) => `${page}|${c.item}|${c.k}`
const norm = s => String(s ?? '').normalize('NFKC').replace(/\s+/g, '')

/** a page's ink as the remover names its glyphs and rules (pageInk with `indices`; every painted glyph, a blank one too),
 *  each glyph's box its outline's: this reading's where PDF.js gives it (Node), else the paper's outline table's (the
 *  browser: `outlines`, layout/ink.mjs readOutlines of the add-on's manifest), so that both readings own alike */
export async function inkOfPage(OPS, page, outlines = null, collect = null) {
  const ops = await page.getOperatorList()
  return pageInk(OPS, ops, page.commonObjs, { rotate: page.rotate ?? 0, indices: true, outlines, collect })
}

/**
 * The paper's removal on a page, from the layout file alone (the add-on is one a paper, whatever the target): every unit
 * the file holds replaces there every glyph the file gives it (fileOwnership's: its lines' and its placeholders'), the
 * glyphs of its label (the file's label box: drawn in the target's name where the final names it so), its placeholders'
 * rules and the rules its lines hold; the placeholders' page holds each inline placeholder's glyphs and rules, and the
 * ink no unit's text is (`id` -1: a crop of what the file does not find is cut from it, through its own boxes). What a
 * target's drawing keeps of these (a line its reading keeps, a placeholder it keeps, a label it keeps) is shown from the
 * original: its swap leaves them out. Returns { units: [{ id, glyphs: [n, k, …], paths }], crops: [{ id, k, glyphs,
 * paths }], shows, glyphs } (layout/remove.mjs RemovalPlan's page), and `own`, the ownership it was made from, with
 * `label` (glyph -> the unit whose label it is, -1).
 */
export function pagePlan(index, page, ink, own = fileOwnership(index, page, ink)) {
  const G = ink.glyphs, n = G.length
  const label = new Int32Array(n).fill(-1)
  for (const id of index.onPage(page)) {
    const lb = index.unit(id).labels
    for (let o = 0; o + 6 < lb.length; o += 7) {
      if (lb[o + 1] !== page) continue
      const x0 = lb[o + 2], x1 = lb[o + 4], top = lb[o + 5], bottom = lb[o + 6]
      for (let g = 0; g < n; g++) {
        const x = G[g], mid = (x.x0 + x.x1) / 2, cy = (x.top + x.bottom) / 2
        if (x.n >= 0 && own.owner[g] === -1 && label[g] === -1 && mid >= x0 - 0.05 && mid <= x1 + 0.05 && cy >= bottom - 0.05 && cy <= top + 0.05) label[g] = id
      }
    }
  }
  const units = new Map(), crops = new Map()
  const unitOf = id => units.get(id) ?? units.set(id, { id, glyphs: [], paths: [] }).get(id)
  const cropOf = (id, k) => crops.get(`${id}.${k}`) ?? crops.set(`${id}.${k}`, { id, k, glyphs: [], paths: [] }).get(`${id}.${k}`)
  for (let g = 0; g < n; g++) {
    const x = G[g], id = own.owner[g] >= 0 ? own.owner[g] : label[g]
    if (id < 0 || x.n < 0) continue
    unitOf(id).glyphs.push(x.n, x.k)
    if (own.owner[g] >= 0 && own.ph[g] >= 0) cropOf(id, own.ph[g]).glyphs.push(x.n, x.k)
  }
  for (const [b, o] of own.paths) { const m = ink.paths[b]; unitOf(o.id).paths.push(m); cropOf(o.id, o.k).paths.push(m) }
  for (const [b, id] of own.linePaths) unitOf(id).paths.push(ink.paths[b])
  // and the ink no unit's text is (no line's glyph, no line's rule): the placeholders' page holds it too, so that a crop
  // of what the file does not find (a placeholder v0 reads on its own, LOST to the file) is cut from it as well, each
  // through its own ink's boxes, never another line's
  const free = { id: -1, k: -1, glyphs: [], paths: [] }
  for (let g = 0; g < n; g++) if (G[g].n >= 0 && own.owner[g] === -1 && label[g] === -1) free.glyphs.push(G[g].n, G[g].k)
  ink.paths.forEach((m, b) => { if (m >= 0 && !own.paths.has(b) && !own.linePaths.has(b)) free.paths.push(m) })
  const byId = (a, b) => a.id - b.id || (a.k ?? 0) - (b.k ?? 0)
  return { units: [...units.values()].sort(byId), crops: [...crops.values(), ...(free.glyphs.length || free.paths.length ? [free] : [])].sort(byId), shows: ink.shows, glyphs: n, own: { ...own, label } }
}

/**
 * The text layer's characters on a page carried to its glyphs: each text item's characters, in order, against the glyphs
 * on its baseline within its extent, in order across, spelt alike (a ligature's one glyph for its two characters); where
 * they do not spell alike, by place among the next few. Returns Map(`page|item|k` -> glyph index).
 */
export function glyphsOfChars(chars, ink, page) {
  const out = new Map()
  const G = ink.glyphs
  const order = []
  for (let g = 0; g < G.length; g++) if (G[g].n >= 0) order.push(g)
  order.sort((a, b) => G[a].y - G[b].y || G[a].x0 - G[b].x0 || a - b)
  const ys = order.map(g => G[g].y)
  const lower = y => { let lo = 0, hi = ys.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ys[m] < y) lo = m + 1; else hi = m } return lo }
  const taken = new Uint8Array(G.length)
  const items = new Map()
  for (const c of chars) { let l = items.get(c.item); if (!l) items.set(c.item, (l = [])); l.push(c) }
  for (const cs of items.values()) {
    cs.sort((a, b) => a.k - b.k)
    const text = cs.filter(real)
    if (!text.length) continue
    const yb = cs[0].yb, size = cs[0].size || 1, tol = Math.max(0.02, 0.01 * size)
    let x0 = Infinity, x1 = -Infinity
    for (const c of cs) { if (c.x0 < x0) x0 = c.x0; if (c.x1 > x1) x1 = c.x1 }
    const cand = []
    for (let q = lower(yb - tol); q < order.length && ys[q] <= yb + tol; q++) {
      const g = order[q], mid = (G[g].x0 + G[g].x1) / 2
      if (!taken[g] && mid >= x0 - 0.5 && mid <= x1 + 0.5) cand.push(g)
    }
    cand.sort((a, b) => G[a].x0 - G[b].x0 || a - b)
    const spelt = cand.map(g => norm(G[g].u))
    let a = 0, b = 0
    const give = (c, g) => { out.set(keyOf(page, c), g); taken[g] = 1 }
    while (a < text.length && b < cand.length) {
      const s = spelt[b]
      if (!s || taken[cand[b]]) { b++; continue }
      if (text.slice(a, a + s.length).map(c => norm(c.ch)).join('') === s) {
        for (let q = 0; q < s.length; q++) give(text[a + q], cand[b])
        a += s.length
        b++
        continue
      }
      // out of order (an accent set apart, a glyph of two characters): this character among the next glyphs, or this
      // glyph among the next characters, else this character is no glyph's
      const ch = norm(text[a].ch)
      let found = -1
      for (let q = b; q < Math.min(cand.length, b + 4); q++) if (!taken[cand[q]] && spelt[q] === ch) { found = q; break }
      if (found >= 0) { give(text[a], cand[found]); a++; if (found === b) b++; continue }
      let later = -1
      for (let q = a + 1; q < Math.min(text.length, a + 4); q++) if (norm(text[q].ch) === s) { later = q; break }
      if (later >= 0) { a = later; continue }
      a++
    }
  }
  return out
}

/**
 * The layout file's ownership of a page's glyphs and rules (the maker's rule, from what the file holds): a glyph is the
 * line's whose baseline it stands on within a script's window, inside the line's extent across and one of its erase
 * rectangles, outside every kept rectangle (a display's segments, a label), the nearest by baseline where two lines would
 * take it; a blank glyph (no Unicode: a big bracket) is also a line's inside one of its inline placeholders' segments; and
 * a glyph no line takes inside an inline placeholder's segment is that placeholder's (a deep subscript). A
 * line's glyph inside one of its unit's inline placeholders' segments on that line is that placeholder's; a rule (a
 * painted path) inside an inline placeholder's segment is its. Returns { owner (glyph -> unit id, -1), ph (glyph -> the
 * placeholder's source index k, -1), paths: Map(box index -> { id, k }), linePaths: Map(box index -> unit id) }: a rule
 * wholly inside a line's erase rectangle and no placeholder's is the line's unit's.
 */
export function fileOwnership(index, page, ink) {
  const G = ink.glyphs, n = G.length
  const owner = new Int32Array(n).fill(-1), ph = new Int32Array(n).fill(-1)
  const lines = [], segs = [], kept = []
  for (const id of index.onPage(page)) {
    const u = index.unit(id)
    const L = u.lines
    for (let o = 0, j = 0; o + 7 < L.length; o += 8, j++) if (L[o] === page) lines.push({ id, j, x0: L[o + 1], x1: L[o + 2], base: L[o + 3], erase: u.erase[j] ?? new Float64Array(0) })
    for (const [k, row] of u.ph) {
      const S = row.segs
      for (let s = 0; s + 5 < S.length; s += 6) {
        if (S[s] !== page) continue
        const seg = { id, k, x0: S[s + 1], base: S[s + 2], x1: S[s + 3], top: S[s + 4], bottom: S[s + 5] }
        if (row.kind === 'display') kept.push([seg.x0, seg.bottom, seg.x1, seg.top])
        else if (!(row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY))) segs.push(seg)
      }
    }
    const lb = u.labels
    for (let o = 0; o + 6 < lb.length; o += 7) if (lb[o + 1] === page) kept.push([lb[o + 2], lb[o + 6], lb[o + 4], lb[o + 5]])
  }
  const inBox = (x, y, x0, y0, x1, y1, pad) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad
  const inErase = (e, x, y, pad) => { for (let q = 0; q + 3 < e.length; q += 4) if (inBox(x, y, e[q], e[q + 1], e[q + 2], e[q + 3], pad)) return true; return false }
  for (let g = 0; g < n; g++) {
    const x = G[g]
    if (x.n < 0) continue
    const mid = (x.x0 + x.x1) / 2, cy = (x.top + x.bottom) / 2
    if (kept.some(r => inBox(mid, cy, r[0], r[1], r[2], r[3], 0.05))) continue
    let best = -1, d = Infinity
    for (let l = 0; l < lines.length; l++) {
      const L = lines[l], dy = Math.abs(x.y - L.base)
      if (dy >= SCRIPT(x.size) || dy >= d) continue
      if (mid < L.x0 - 0.05 || mid > L.x1 + 0.05) continue
      const inSeg = x.blank && segs.some(s => s.id === L.id && Math.abs(s.base - L.base) < 0.5 && inBox(mid, cy, s.x0, s.bottom, s.x1, s.top, 0.3))
      if (!inErase(L.erase, mid, cy, x.blank ? 0.3 : 0.05) && !inSeg) continue
      best = l
      d = dy
    }
    if (best < 0) {
      // a glyph no line takes that lies inside an inline placeholder's segment is that placeholder's: a subscript set
      // deeper than a script's window of its line (1706.03762's 1/√d_k, whose k the crop lacked and left standing)
      const seg = segs.find(s => inBox(mid, cy, s.x0, s.bottom, s.x1, s.top, x.blank ? 0.3 : 0.1))
      if (seg) { owner[g] = seg.id; ph[g] = seg.k }
      continue
    }
    const L = lines[best]
    owner[g] = L.id
    for (const s of segs) if (s.id === L.id && Math.abs(s.base - L.base) < 0.5 && inBox(mid, cy, s.x0, s.bottom, s.x1, s.top, x.blank ? 0.3 : 0.1)) { ph[g] = s.k; break }
  }
  const paths = new Map(), linePaths = new Map()
  ink.paths.forEach((m, b) => {
    if (m < 0) return
    const [x0, y0, x1, y1] = ink.boxes.slice(4 * b, 4 * b + 4)
    const s = segs.find(s => x0 >= s.x0 - 0.3 && x1 <= s.x1 + 0.3 && y0 >= s.bottom - 0.3 && y1 <= s.top + 0.3)
    if (s) { paths.set(b, { id: s.id, k: s.k }); return }
    // a rule the file erases with a line (wholly inside one of its erase rectangles, a radical's bar over a glyph the line
    // holds): the line's unit's, not a placeholder's
    if (kept.some(r => x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1])) return
    const L = lines.find(L => { const e = L.erase; for (let q = 0; q + 3 < e.length; q += 4) if (x0 >= e[q] - 0.3 && x1 <= e[q + 2] + 0.3 && y0 >= e[q + 1] - 0.3 && y1 <= e[q + 3] + 0.3) return true; return false })
    if (L) linePaths.set(b, L.id)
  })
  return { owner, ph, paths, linePaths }
}

/**
 * What a drawn unit replaces on a page: { glyphs, paths } (indices into the page's ink) and, for each of its crops whose
 * source is this page, the crop's glyphs and rules (`crops`: { k, glyphs, paths }, the placeholders-only page's). `tex`:
 * { lu, kOf } for a unit the file locates whole (the hybrid's), null for v0's own; `prep` its reading; `own` the page's
 * fileOwnership; `charMap` glyphsOfChars'; `unmapped` the page's glyphs no character is carried to; `claimed` (glyph ->
 * unit id) the glyphs units painted before took, which this one adds its own to; `fileDrawn` the ids the hybrid draws by
 * the file's geometry (their glyphs no other unit takes). Returns also `taken` (glyphs another unit had) and `notOwned`
 * (characters accounted for whose glyph the file gives no unit or another).
 */
export function unitRemoval({ id, page, prep, tex, own, charMap, unmapped, ink, claimed, fileDrawn }) {
  const G = ink.glyphs
  const glyphs = new Set(), paths = new Set(), crops = []
  let taken = 0, notOwned = 0, crossing = 0
  const mine = g => { const c = claimed.get(g); if (c !== undefined && c !== id) { taken++; return false } return true }
  const resolutions = [...prep.values()].filter(r => r && r.k !== undefined)
  // the unit's characters: its lines', and a float label's it draws in the target's name (labelInTarget), which a
  // file's first line, starting at the unit's own mark, does not hold
  const chars = prep.label?.drawn ? [...prep.uc, ...prep.label.chars] : prep.uc
  if (tex) {
    const { kOf } = tex
    const keep = new Set()
    for (const c of chars) {
      if (c.page !== page || !real(c)) continue
      const cat = prep.cat.get(keyOf(page, c))
      const g = charMap.get(keyOf(page, c))
      if (cat === 'keep' || cat === 'orphan') { if (g !== undefined) keep.add(g) }
      else if (cat === 'acc' && g !== undefined && own.owner[g] !== id && own.owner[g] !== -1) notOwned++
    }
    // the placeholders the layer keeps where they are
    const keptK = new Set(resolutions.filter(r => r.mode === 'kept').map(r => kOf[r.k]).filter(k => k >= 0))
    for (let g = 0; g < G.length; g++) if (own.owner[g] === id && !keep.has(g) && !(own.ph[g] >= 0 && keptK.has(own.ph[g])) && mine(g)) glyphs.add(g)
    // and the characters it accounts for that the file gives no unit, on one of its lines' own baselines: a symbol set
    // off by a space at a line's end (the file's lines are its words', and the layer grows them over what stands beside
    // them, as v0 grows its own: 1512.03385 page 10's "@" and "="); and its drawn label's. Not what only a script's window
    // of its baseline holds (a big bracket's piece below a table cell's line, 1512.03385's Table 1: its ink no unit's)
    const L = tex.lu.lines, bases = []
    for (let o = 0; o + 7 < L.length; o += 8) if (L[o] === page) bases.push([L[o + 3], L[o + 6]])
    const labelled = new Set(prep.label?.drawn ? prep.label.chars.map(c => keyOf(page, c)) : [])
    for (const c of chars) {
      if (c.page !== page || !real(c) || prep.cat.get(keyOf(page, c)) !== 'acc') continue
      if (!labelled.has(keyOf(page, c)) && !bases.some(([b, size]) => Math.abs(c.yb - b) < 0.2 * size)) continue
      const g = charMap.get(keyOf(page, c))
      if (g !== undefined && own.owner[g] === -1 && !keep.has(g) && mine(g)) glyphs.add(g)
    }
    for (const [b, o] of own.paths) if (o.id === id && !keptK.has(o.k)) paths.add(b)
    // a line's rule goes with the line's glyphs it lies by (over it, or beside it within half an em: an underscore
    // between two), where the layer replaces them (a display's bar stays with its kept glyphs)
    for (const [b, u] of own.linePaths) {
      if (u !== id) continue
      const [x0, y0, x1, y1] = ink.boxes.slice(4 * b, 4 * b + 4), cy = (y0 + y1) / 2
      let replaced = 0, left = 0
      for (let g = 0; g < G.length; g++) {
        if (own.owner[g] !== id) continue
        const x = G[g], mid = (x.x0 + x.x1) / 2
        if (mid < x0 - 0.5 * x.size || mid > x1 + 0.5 * x.size || Math.abs(x.y - cy) >= SCRIPT(x.size)) continue
        if (glyphs.has(g)) replaced++
        else left++
      }
      if (replaced && replaced >= left) paths.add(b)
    }
    // each crop: its placeholder's glyphs and rules, as the file gives them (its segments), which the placeholders'
    // page holds and the removed page lacks; nothing else inside its box, whoever's (a crop grown over the ink beside it,
    // a big bracket below a table cell's formula, took that ink away with it: 1512.03385's Table 1)
    for (const r of resolutions) {
      if (r.mode !== 'crop' || r.page !== page || !r.crop) continue
      const k = kOf[r.k]
      const cg = [], cp = []
      for (let g = 0; g < G.length; g++) if (G[g].n >= 0 && own.ph[g] === k && own.owner[g] === id && mine(g)) { glyphs.add(g); cg.push(g) }
      for (const [b, o] of own.paths) if (o.id === id && o.k === k) { cp.push(b); paths.add(b) }
      crops.push({ k: r.k, glyphs: cg, paths: cp })
    }
  } else {
    const fileTaken = g => own.owner[g] >= 0 && fileDrawn.has(own.owner[g])
    // (each text item all of whose characters here it accounts for: the rules inside its box are erased with it, as v0's
    // restore leaves erased the ink such an item covers)
    const items = new Map()
    for (const c of chars) {
      if (c.page !== page || !real(c)) continue
      const acc = prep.cat.get(keyOf(page, c)) === 'acc'
      const it = items.get(c.item) ?? items.set(c.item, { all: true, x0: Infinity, x1: -Infinity, yb: c.yb, size: c.size }).get(c.item)
      if (!acc) it.all = false
      it.x0 = Math.min(it.x0, c.x0); it.x1 = Math.max(it.x1, c.x1); it.size = Math.max(it.size, c.size)
      if (!acc) continue
      const g = charMap.get(keyOf(page, c))
      if (g === undefined) continue
      if (fileTaken(g)) { taken++; continue }
      if (mine(g)) glyphs.add(g)
    }
    const covered = [...items.values()].filter(it => it.all).map(it => [it.x0 - 0.3, it.yb - 0.3 * it.size, it.x1 + 0.3, it.yb + 0.9 * it.size])
    ink.paths.forEach((m, b) => {
      if (m < 0 || own.paths.has(b) || own.linePaths.has(b)) return
      const bx = ink.boxes.slice(4 * b, 4 * b + 4)
      if (covered.some(r => bx[0] >= r[0] && bx[2] <= r[2] && bx[1] >= r[1] && bx[3] <= r[3])) paths.add(b)
    })
    for (const r of resolutions) {
      if (r.mode !== 'crop' || r.page !== page || !r.crop) continue
      const [x0, y0, x1, y1] = r.crop
      const cg = []
      for (const c of r.gap?.chars ?? []) {
        if (c.page !== page || !real(c)) continue
        const g = charMap.get(keyOf(page, c))
        if (g !== undefined && glyphs.has(g)) cg.push(g)
      }
      // the glyphs inside the crop no character stands for (a big bracket), and its rules
      for (const g of unmapped) {
        const x = G[g], mid = (x.x0 + x.x1) / 2, cy = (x.top + x.bottom) / 2
        if (mid >= x0 && mid <= x1 && cy >= y0 && cy <= y1 && !fileTaken(g) && mine(g)) { glyphs.add(g); cg.push(g) }
      }
      const cp = []
      ink.paths.forEach((m, b) => {
        if (m < 0) return
        const bx = ink.boxes.slice(4 * b, 4 * b + 4)
        if (bx[0] >= x0 - 0.3 && bx[2] <= x1 + 0.3 && bx[1] >= y0 - 0.3 && bx[3] <= y1 + 0.3 && !own.paths.has(b) && !own.linePaths.has(b)) { paths.add(b); cp.push(b) }
      })
      crops.push({ k: r.k, glyphs: cg, paths: cp })
    }
  }
  for (const g of glyphs) claimed.set(g, id)
  return { glyphs: [...glyphs].sort((a, b) => a - b), paths: [...paths].sort((a, b) => a - b), crops, taken, notOwned, crossing }
}

/**
 * The ink the paper's add-on keeps on a page that meets its units' rectangles (the file's: each line's erase rectangles,
 * each inline placeholder's segments, each label's box; grown by the swap's pad: those a reader may draw over): every glyph the plan (pagePlan's `units`)
 * does not remove, by its outline's box, and every graphic it does not (a rule, an image, a shading), by its box. Where
 * a unit's rectangle meets one, a fill with paper would take it, and the removed page is swapped in instead. Returns
 * x0, y0, x1, y1 stride 4, rounded to a hundredth, for the manifest (fileSwap's `dirty`).
 */
export function pageDirty(index, page, ink, plan, pad = SWAP_PAD) {
  const at = new Map(), byPath = new Map()
  ink.glyphs.forEach((g, i) => { if (g.n >= 0) at.set(`${g.n}.${g.k}`, i) })
  ink.paths.forEach((m, b) => { if (m >= 0) byPath.set(m, b) })
  const gone = new Set(), goneP = new Set()
  for (const u of plan?.units ?? []) {
    for (let q = 0; q + 1 < u.glyphs.length; q += 2) gone.add(at.get(`${u.glyphs[q]}.${u.glyphs[q + 1]}`))
    for (const m of u.paths ?? []) goneP.add(byPath.get(m))
  }
  const rects = []
  for (const id of index.onPage(page)) {
    const u = index.unit(id)
    for (let j = 0; j < u.erase.length; j++) { const e = u.erase[j]; if (!e || u.lines[8 * j] !== page) continue; for (let o = 0; o + 3 < e.length; o += 4) rects.push([e[o] - pad, e[o + 1] - pad, e[o + 2] + pad, e[o + 3] + pad]) }
    // (an inline placeholder's: a display's rows are its own, kept, and no reader draws over them; fileSwap's)
    for (const row of u.ph.values()) {
      if (row.kind === 'display' || row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY)) continue
      for (let o = 0; o + 5 < row.segs.length; o += 6) if (row.segs[o] === page) rects.push([row.segs[o + 1] - pad, row.segs[o + 5] - pad, row.segs[o + 3] + pad, row.segs[o + 4] + pad])
    }
    const lb = u.labels
    for (let o = 0; o + 6 < lb.length; o += 7) if (lb[o + 1] === page) rects.push([lb[o + 2] - pad, lb[o + 6] - pad, lb[o + 4] + pad, lb[o + 5] + pad])
  }
  const meets = b => rects.some(r => b[0] < r[2] && b[2] > r[0] && b[1] < r[3] && b[3] > r[1])
  const out = []
  const add = b => { if (meets(b)) out.push(...b.map(v => Math.round(v * 100) / 100)) }
  ink.glyphs.forEach((g, i) => { if (g.n >= 0 && !gone.has(i) && g.ix1 > g.ix0 && g.top > g.bottom) add([g.ix0, g.bottom, g.ix1, g.top]) })
  for (let b = 0; 4 * b + 3 < ink.boxes.length; b++) if (!goneP.has(b)) add(ink.boxes.slice(4 * b, 4 * b + 4))
  return out
}

/**
 * The rules on a page near its units' lines (the manifest's `rules`: x0, y0, x1, y1 stride 4, rounded to a hundredth):
 * each painted path the page's ink holds as a thin box (no more than RULE_THICK across one way, RULE_LONG or more the
 * other: a table's rule, a footnote's, an underline's) that stands above a line of the layout file's, within 1.3 of its
 * size over its baseline, or below it, within 0.8 under, across its extent, and not through its own glyphs' band. Where
 * the reader sets a line's text taller than the original's (a CJK script's em box over Latin capitals), it keeps that
 * text clear of them (run.mjs clearScale); they are the PDF's own geometry, as exact as the file's lines
 */
const RULE_THICK = 1.5, RULE_LONG = 2
export function pageRules(index, page, ink) {
  const lines = []
  for (const id of index.onPage(page)) {
    const u = index.unit(id)
    for (let j = 0; 8 * j + 7 < u.lines.length; j++) {
      const L = u.lines.subarray ? u.lines.subarray(8 * j, 8 * j + 8) : u.lines.slice(8 * j, 8 * j + 8)
      if (L[0] === page) lines.push(L)
    }
  }
  const out = []
  for (let b = 0; 4 * b + 3 < ink.boxes.length; b++) {
    if (!(ink.paths[b] >= 0)) continue
    const [x0, y0, x1, y1] = [ink.boxes[4 * b], ink.boxes[4 * b + 1], ink.boxes[4 * b + 2], ink.boxes[4 * b + 3]]
    const w = x1 - x0, h = y1 - y0
    if (Math.min(w, h) > RULE_THICK || Math.max(w, h) < RULE_LONG) continue
    const near = lines.some(L => {
      const [, lx0, lx1, base, top, bottom, size] = L
      if (Math.min(x1, lx1) - Math.max(x0, lx0) <= 0.5) return false
      if (y0 < top && y1 > bottom) return false
      return (y0 >= base && y0 <= base + 1.3 * size) || (y1 <= base && y1 >= base - 0.8 * size)
    })
    if (near) out.push(...[x0, y0, x1, y1].map(v => Math.round(v * 100) / 100))
  }
  return out
}

/**
 * A unit's drawing over the text-removed PDF from the layout file's rectangles alone: the browser reads none of the page's
 * ink. What the unit replaces is what the add-on removed of it (pagePlan: every glyph the file gives it), but what its
 * reading keeps: its lines' erase rectangles (the file's: its glyphs' outline boxes merged) and its placeholders' segments,
 * less the lines the reading keeps as the original's and the placeholders it keeps; its label's box where it draws the
 * label in the target's name. Those rectangles, each grown by the swap's pad and cut away from what must stay (`others`:
 * the page's other units' rectangles; what this unit keeps; the characters its reading leaves where they are), are
 * filled with paper where no kept ink lies under them (`dirty`, the manifest's: the ink the add-on keeps that meets the
 * page's units' rectangles), and the removed page swapped in where some does. The characters the reading accounts for
 * that the file gives no rectangle (a symbol at a line's end, beside its last word) are erased over their boxes
 * (`extra`). A crop is cut from the original through its placeholder's segments (`clips`, by the piece's index: `rects`
 * grown, `own` as they are). Every box [x0, y0, x1, y1], PDF units, y up; `lines`: the rectangles replaced less what the reading keeps (a
 * label, a kept formula: never this unit's residue), for the audit.
 */
export function fileSwap({ page, lu, kOf, lines, prep, others = [], dirty = [], pad = SWAP_PAD }) {
  const keepKeys = new Set(prep.keep ?? [])
  const resolutions = [...prep.values()].filter(r => r && r.k !== undefined)
  const keptK = new Set(resolutions.filter(r => r.mode === 'kept').map(r => kOf[r.k]).filter(k => k >= 0))
  // (kept: what its reading keeps of it, which its audit's boxes leave out as well; avoid: that, other units', and the
  // characters it accounts for nowhere, which are left showing but are its own residue)
  const mine = [], kept = [], avoid = [...others]
  const keep = (...boxes) => { kept.push(...boxes); avoid.push(...boxes) }
  const boxesOf = e => { const out = []; for (let q = 0; q + 3 < (e?.length ?? 0); q += 4) out.push([e[q], e[q + 1], e[q + 2], e[q + 3]]); return out }
  // its lines on the page: their erase rectangles, but those the reading keeps (and its held lines, which have none)
  const bases = []
  lines.rects.forEach((r, i) => {
    if (r[0] !== page) return
    // (by its place: v0 may have put another rectangle there, its first line's started at its label)
    const j = lines.jOf?.[i] ?? lines.lineOf.get(r)
    if (j === undefined) return
    bases.push([lu.lines[8 * j + 3], lu.lines[8 * j + 6]])
    if (keepKeys.has(`${r[0]}|${r.slice(1).join()}`)) keep(...boxesOf(lu.erase[j]))
    else mine.push(...boxesOf(lu.erase[j]))
  })
  // its inline placeholders' segments: replaced, or kept where the reading keeps them; a display's rows are its own
  for (const [k, row] of lu.ph) {
    if (row.kind === 'display' || row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY)) continue
    const S = row.segs, segs = []
    for (let o = 0; o + 5 < S.length; o += 6) if (S[o] === page) segs.push([S[o + 1], S[o + 5], S[o + 3], S[o + 4]])
    if (keptK.has(k)) keep(...segs)
    else mine.push(...segs)
  }
  // its label: replaced where the reading draws it in the target's name, else the original's
  const lb = lu.labels
  for (let o = 0; o + 6 < lb.length; o += 7) {
    if (lb[o + 1] !== page) continue
    const b = [lb[o + 2], lb[o + 6], lb[o + 4], lb[o + 5]]
    if (prep.label?.drawn) mine.push(b)
    else keep(b)
  }
  // the characters the reading leaves where they are: those it accounts for nowhere, and those it keeps on a line it
  // replaces (a label or a placeholder it reads as kept where the file has no row for it: a run-in head, a list's mark)
  const real = c => !c.sep && !c.space && /\S/.test(c.ch)
  const charBox = c => [c.x0, c.yb - 0.22 * c.size, c.x1, c.yb + 0.78 * c.size]
  // (a label it draws in the target's name is replaced, its characters with it)
  const relabelled = new Set(prep.label?.drawn ? prep.label.chars.map(c => `${c.page}|${c.item}|${c.k}`) : [])
  for (const c of prep.uc ?? []) {
    if (c.page !== page || !real(c)) continue
    const key = `${page}|${c.item}|${c.k}`, cat = prep.cat?.get(key)
    if (cat === 'orphan') avoid.push(charBox(c))
    else if (cat === 'keep' && !relabelled.has(key) && !keepKeys.has(`${c.page}|${c.rect.join()}`)) keep(charBox(c))
  }
  const rects = swapRects(mine, avoid, pad)
  const meets = (r, b) => b[0] < r[2] && b[2] > r[0] && b[1] < r[3] && b[3] > r[1]
  const swap = [], fill = []
  for (const r of rects) (dirty.some(d => meets(r, d)) ? swap : fill).push(r)
  // what it accounts for that no rectangle of the file's covers, on one of its lines' own baselines
  const inMine = c => { const x = (c.x0 + c.x1) / 2, y = c.yb + 0.3 * c.size; return mine.some(b => x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad) }
  const extra = []
  for (const c of prep.uc ?? []) {
    if (c.page !== page || !real(c) || prep.cat?.get(`${page}|${c.item}|${c.k}`) !== 'acc') continue
    if (!bases.some(([b, size]) => Math.abs(c.yb - b) < 0.2 * size) || inMine(c)) continue
    const b = charBox(c)
    extra.push([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad])
  }
  // each crop through its placeholder's segments
  const clips = new Map()
  for (const r of resolutions) {
    if (r.mode !== 'crop' || r.page !== page) continue
    const row = lu.ph.get(kOf[r.k])
    if (!row) continue
    const own = []
    for (let o = 0; o + 5 < row.segs.length; o += 6) if (row.segs[o] === page) own.push([row.segs[o + 1], row.segs[o + 5], row.segs[o + 3], row.segs[o + 4]])
    if (own.length) clips.set(r.k, { rects: own.map(b => [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]), own })
  }
  return { swap, fill, extra, clips, lines: swapRects(mine, kept, 0) }
}

/** the page's glyphs no text-layer character is carried to (a blank glyph among them) */
export function unmappedOf(ink, charMap) {
  const mapped = new Set(charMap.values())
  const out = []
  for (let g = 0; g < ink.glyphs.length; g++) if (ink.glyphs[g].n >= 0 && !mapped.has(g)) out.push(g)
  return out
}

/** a unit's removal as the plan names it: its glyphs as n, k pairs and its rules as paths' places */
export function planOf(ink, glyphs, paths) {
  const out = { glyphs: [], paths: [] }
  for (const g of glyphs) out.glyphs.push(ink.glyphs[g].n, ink.glyphs[g].k)
  for (const b of paths) out.paths.push(ink.paths[b])
  return out
}
/** a plan's glyphs and rules back to indices into this reading's ink (null for one it does not hold) */
export function indicesOf(ink, plan) {
  const at = new Map()
  ink.glyphs.forEach((g, i) => { if (g.n >= 0) at.set(`${g.n}.${g.k}`, i) })
  const byPath = new Map()
  ink.paths.forEach((m, b) => { if (m >= 0) byPath.set(m, b) })
  const glyphs = [], paths = []
  for (let i = 0; i + 1 < plan.glyphs.length; i += 2) { const g = at.get(`${plan.glyphs[i]}.${plan.glyphs[i + 1]}`); if (g === undefined) return null; glyphs.push(g) }
  for (const m of plan.paths ?? []) { const b = byPath.get(m); if (b === undefined) return null; paths.push(b) }
  return { glyphs, paths }
}
