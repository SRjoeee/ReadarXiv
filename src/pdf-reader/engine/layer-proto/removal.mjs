// src/pdf-reader/engine/layer-proto/removal.mjs
// The layer's side of the text-removed PDF (layout/remove.mjs): which of arXiv's glyphs each drawn unit replaces, and
// where on the page the removed page's pixels go in for it. The invariant: the glyphs the remover takes out of a page are
// the glyphs the layer replaces there, exactly, unit by unit:
// - a unit the layout file locates whole (the hybrid's, tex.mjs) replaces the glyphs the file gives it: those on its
//   lines (each line's baseline, within a script's window, and its erase rectangles, which are its own glyphs' boxes
//   merged), its inline placeholders' glyphs and rules by their segments; a display formula, a label and a placeholder the
//   layer keeps stay, and so does a character the layer shows where it is (its reading's 'keep' and 'orphan');
// - any other unit (v0's own) replaces the glyphs of the characters its reading accounts for ('acc': its text, and the
//   renderings it draws elsewhere), the text layer's characters carried to the content stream's glyphs by place and
//   character; and inside a crop, the glyphs no character of the text layer stands for (a big bracket PDF.js gives a blank
//   Unicode) and the rules.
// A glyph is one unit's: the file's owner first, else the first unit painted that accounts for it.
//
// The drawing (unitOps' removal path): the original page stays, and over each drawn unit the removed page's pixels go in
// where the original and the removed page differ and that difference is the unit's (every differing pixel is taken by
// the removed glyph it touches first, so that a mask never reaches another unit's glyphs, and grows past a glyph's box
// over the ink it actually has: a big operator's tail), a pixel more around it. The crops are cut from the page holding
// the placeholders alone. Nothing is erased, nothing put back.
//
// An original module (no port statement), importing only relative modules.
import { swapMasks } from '../layer/swap.mjs'
import { PH_FLAG } from '../layout/file.mjs'
import { pageInk } from '../layout/ink.mjs'

/** each unit's share of where the original and its removed page differ (the reader's own, layer/swap.mjs swapMasks) */
export const pageMasks = swapMasks

/** a glyph on a line, scripts included: its baseline within this of the line's (the layout maker's SCRIPT) */
const SCRIPT = size => 0.6 * Math.max(size, 5) + 1.5
const real = c => !c.sep && !c.space && /\S/.test(c.ch)
const keyOf = (page, c) => `${page}|${c.item}|${c.k}`
const norm = s => String(s ?? '').normalize('NFKC').replace(/\s+/g, '')

/** a page's ink as the remover names its glyphs and rules (pageInk with `indices` and `blanks`) */
export async function inkOfPage(OPS, page) {
  const ops = await page.getOperatorList()
  return pageInk(OPS, ops, page.commonObjs, { rotate: page.rotate ?? 0, indices: true, blanks: true })
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
 * take it; a blank glyph (no Unicode: a big bracket) is also a line's inside one of its inline placeholders' segments. A
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
    if (best < 0) continue
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
  if (tex) {
    const { kOf } = tex
    const keep = new Set()
    for (const c of prep.uc) {
      if (c.page !== page || !real(c)) continue
      const cat = prep.cat.get(keyOf(page, c))
      const g = charMap.get(keyOf(page, c))
      if (cat === 'keep' || cat === 'orphan') { if (g !== undefined) keep.add(g) }
      else if (cat === 'acc' && g !== undefined && own.owner[g] !== id && own.owner[g] !== -1) notOwned++
    }
    // the placeholders the layer keeps where they are
    const keptK = new Set(resolutions.filter(r => r.mode === 'kept').map(r => kOf[r.k]).filter(k => k >= 0))
    for (let g = 0; g < G.length; g++) if (own.owner[g] === id && !keep.has(g) && !(own.ph[g] >= 0 && keptK.has(own.ph[g])) && mine(g)) glyphs.add(g)
    // and the characters it accounts for that the file gives no unit: a symbol set off by a space at a line's end (the
    // file's lines are its words', and the layer grows them over what stands beside them, as v0 grows its own: 1512.03385
    // page 10's "@" and "=")
    for (const c of prep.uc) {
      if (c.page !== page || !real(c) || prep.cat.get(keyOf(page, c)) !== 'acc') continue
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
    // each crop: what the layer cuts is its box, so the placeholders' page holds what lies inside it and is the unit's
    // (its placeholder's glyphs, and any of the unit's own or nobody's: a fraction's denominator the file sets as a line
    // of its own, which the reading keeps where it is), never another unit's; and its rules, by their middle. The
    // removed page loses the same glyphs and rules: a rule that runs past the box (a fraction's bar over a denominator
    // the file left out of the placeholder) is the crop's, drawn as far as the box reaches; left on the page, the
    // translation was laid over it
    for (const r of resolutions) {
      if (r.mode !== 'crop' || r.page !== page || !r.crop) continue
      const k = kOf[r.k]
      const [bx0, by0, bx1, by1] = r.crop
      const inBox = (x, y) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1
      const cg = [], cp = []
      for (let g = 0; g < G.length; g++) {
        const x = G[g]
        if (x.n < 0) continue
        const o = own.owner[g], q = own.ph[g]
        const ok = q === k ? o === id : inBox((x.x0 + x.x1) / 2, (x.top + x.bottom) / 2) && (o === id || o === -1) && q === -1
        if (ok && mine(g)) { glyphs.add(g); cg.push(g) }
      }
      ink.paths.forEach((m, b) => {
        if (m < 0) return
        const [x0, y0, x1, y1] = ink.boxes.slice(4 * b, 4 * b + 4)
        const o = own.paths.get(b)
        if (o && (o.id !== id || o.k !== k)) return
        if (!o && !inBox((x0 + x1) / 2, (y0 + y1) / 2)) return
        cp.push(b)
        paths.add(b)
        if (!o && !(x0 >= bx0 - 0.3 && x1 <= bx1 + 0.3 && y0 >= by0 - 0.3 && y1 <= by1 + 0.3)) crossing++
      })
      crops.push({ k: r.k, glyphs: cg, paths: cp })
    }
  } else {
    const fileTaken = g => own.owner[g] >= 0 && fileDrawn.has(own.owner[g])
    // (each text item all of whose characters here it accounts for: the rules inside its box are erased with it, as v0's
    // restore leaves erased the ink such an item covers)
    const items = new Map()
    for (const c of prep.uc) {
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
