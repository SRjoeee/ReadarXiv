// src/pdf-reader/engine/layer-proto/tex.mjs
// The layer's hybrid (step 2 of its new direction, 2026-10-06): v0's per-unit reading (layer2.mjs prepareUnit, whose
// contract layer2.d.mts writes) with its parts from the layout file wherever the file locates the unit whole, and v0's
// own heuristics everywhere else. A unit the file does not locate whole is v0's, unchanged: a miss of the file never
// leaves a unit English that v0 draws.
//
// What the file knows that v0 guesses: each line's baseline and size and its ink's extent across (v0 reads them from the
// anchors' rectangles and the text layer's estimates), the line's frame, each placeholder's ink by its own segments (v0
// aligns the page's words with the source and takes the runs left over), and a label's box. The rest of the unit's
// reading is the same for both: the alignment with its source (which characters are its words, its style, the lines it
// keeps), the resolution's rules, and the finish (what becomes of each page character, which the restore reads). The
// page characters are PDF.js's in both, so that the paper's citations and macros a unit learns, and the characters the
// restore counts as accounted for, are the same keys whichever source a unit took.
import { PH_FLAG } from '../layout/file.mjs'
import { charKey, charsOfUnit2, labelOf, learnCite, phClass2 } from './layer2.mjs'

/** v0's placeholder classes that draw ink of their own (layer-proto/check.mjs VISIBLE; a nested footnote's mark is 'num') */
const VISIBLE = new Set(['cite', 'num', 'other', 'macro', 'umacro', 'display', 'symbol'])
/** v0's classes of a text macro: one the file holds no row for sets no ink (LAYOUT 3: the maker marks no macro TeX's ink
 *  probe says sets nothing, nor one its class says cannot), and is drawn as nothing */
const MACROS = new Set(['macro', 'umacro'])
/** an anchors' rectangle's share of its line's size below and above its baseline (Times' descent and ascent, as anchors.mjs
 *  lineRects measures a line and v0's reading of a line is set to) */
const BELOW = 0.215, ABOVE = 0.683
/** a glyph on a line, scripts included: its baseline within this of the line's (the layout maker's SCRIPT) */
const SCRIPT = size => 0.6 * Math.max(size, 5) + 1.5
const r2 = v => Math.round(v * 100) / 100
const rectKey = r => `${r[0]}|${r.slice(1).join()}`

/**
 * Each of a translated unit's pieces' source index (`k`, the layout file's), from the units file's pieces of the same unit
 * (spec §4.3: [0, text] | [1, k] | [2, k, style] | [3, k]), which hold the translation's pieces one to one; -1 for a
 * text piece and a placeholder the units file writes as text. Null where the two do not hold the same pieces.
 */
export function kOfPieces(unit, trPieces) {
  if (!Array.isArray(trPieces) || trPieces.length !== unit.pieces.length) return null
  const out = []
  for (const [i, p] of unit.pieces.entries()) {
    const t = trPieces[i]
    if (!Array.isArray(t)) return null
    if (p.t === 'text') { if (t[0] !== 0) return null; out.push(-1); continue }
    if ((p.t === 'open' && t[0] !== 2) || (p.t === 'close' && t[0] !== 3)) return null
    out.push(t[0] === 0 ? -1 : t[1])
  }
  return out
}

/**
 * Whether the layout file locates a unit whole, against the file (`lu`, its indexLayout unit, or null): its lines all
 * carried (the maker writes a unit only where every one of its lines was carried to arXiv's page, so a unit in the file
 * has them all); every one of its placeholders that v0 draws ink for found, neither LOST nor EMPTY, but a symbol v0 draws
 * from its source as text (\%, $\times$), whose glyph its line's erasing covers, wherever it is (`symbols: 'strict'`:
 * that too). A text symbol the file draws as its character (PH_FLAG.TEXT: no segments, its glyph the line's) is found; a
 * text macro the file holds no row for sets no ink (inklessOf). Its lines need not be in reading order: those out of it
 * are a display's rows or number the file lists after the line below, which v0's reading keeps as the original's
 * (measured: asking it sent 123 units to v0 and drew worse).
 * Returns { ok, why, kOf }: why one of 'unlocated', 'pieces', 'no row', 'lost', 'empty'.
 */
export function locatedWhole(lu, unit, trPieces, { symbols = 'text' } = {}) {
  if (!lu) return { ok: false, why: 'unlocated' }
  const kOf = kOfPieces(unit, trPieces)
  if (!kOf) return { ok: false, why: 'pieces' }
  for (const [i, p] of unit.pieces.entries()) {
    const cls = p.t === 'nested' ? 'num' : p.t === 'ph' ? phClass2(p.src).cls : null
    if (!cls || !VISIBLE.has(cls) || (cls === 'symbol' && symbols === 'text')) continue
    const row = lu.ph.get(kOf[i])
    if (!row) { if (MACROS.has(cls)) continue; return { ok: false, why: 'no row' } }
    if (row.flags & PH_FLAG.EMPTY) return { ok: false, why: 'empty' }
    if (row.flags & PH_FLAG.TEXT) continue
    if (row.flags & PH_FLAG.LOST || !row.segs.length) return { ok: false, why: 'lost' }
  }
  return { ok: true, why: null, kOf }
}

/**
 * The unit's lines from the file, on the pages up to `maxPage`, as v0's rectangles [page, x0, y0, x1, y1]: across their
 * words' ink, and up and down an anchors' rectangle's band from their exact baselines (the file's top and bottom are its
 * fonts' declared boxes, which reach a line lower under CMSY's descent, and v0 reads a line's extent from its characters
 * anyway). With each rectangle's exact baseline and size (`exact`) and its line in the file (`lineOf`). The file's frames
 * (its lines by page and column) bound no block: v0's own rule of where a block ends splits every block they would, and a
 * full-width caption's short last line, which the file puts in a column of its own, stays in its block. A line the
 * unit's source does not write (the file's `held`: a display it does not hold, inside it) is kept as the original's
 * (`held`, its rectangles): v0's reading of a display's lines inside a unit, no slot, never erased, the text after it
 * starting below it.
 */
export function texRects(lu, maxPage = Infinity) {
  const rects = [], exact = new Map(), lineOf = new Map(), held = []
  const L = lu.lines, F = lu.frames, heldLines = new Set(lu.held ?? [])
  for (let f = 0; f < F.length; f += 6) {
    for (let j = F[f + 2]; j < F[f + 2] + F[f + 3]; j++) {
      const page = L[8 * j], base = L[8 * j + 3], size = L[8 * j + 6]
      if (page > maxPage) continue
      const r = [page, r2(L[8 * j + 1]), r2(base - BELOW * size), r2(L[8 * j + 2]), r2(base + ABOVE * size)]
      rects.push(r)
      exact.set(r, { baseline: base, size })
      lineOf.set(r, j)
      if (heldLines.has(j)) held.push(r)
    }
  }
  return { rects, exact, lineOf, held }
}

/** whether a placeholder of the unit's sets no ink by the file: a text macro (v0's 'macro' or 'umacro') the file holds no
 *  row for (locatedWhole) */
export const inklessOf = (lu, kOf, p) => MACROS.has(p.cls) && !lu.ph.has(kOf[p.k])

/**
 * A placeholder's rendering from its segments in the file (stride 6: page, x0, baseline, x1, top, bottom): the unit's
 * page characters inside them (within its ink's extent across, a half point either side; an inline one's on its line,
 * within a script's window of its baseline; a display's anywhere in its rows), the white space and line ends between
 * them, and the ink's box (its extent across and up and down, the baseline of its first segment's line, its segments). Null where no
 * character of the unit is inside, but for a display (its rows outside the unit's lines are shown where they are).
 */
export function renderingOf(segs, uc, display) {
  const S = []
  for (let s = 0; s + 5 < segs.length; s += 6) S.push({ page: segs[s], x0: segs[s + 1], base: segs[s + 2], x1: segs[s + 3], top: segs[s + 4], bottom: segs[s + 5] })
  const yOf = c => c.ybEff ?? c.yb
  const real = c => !c.sep && !c.space && /\S/.test(c.ch)
  const inside = c => S.some(s => {
    const cx = (c.x0 + c.x1) / 2, y = yOf(c)
    if (c.page !== s.page || cx < s.x0 - 0.5 || cx > s.x1 + 0.5 || y < s.bottom - 1 || y > s.top + 1) return false
    return display || Math.abs(y - s.base) < SCRIPT(c.size)
  })
  const at = []
  uc.forEach((c, i) => { if (real(c) && inside(c)) at.push(i) })
  const box = { x0: Math.min(...S.map(s => s.x0)), x1: Math.max(...S.map(s => s.x1)), top: Math.max(...S.map(s => s.top)), bottom: Math.min(...S.map(s => s.bottom)), baseline: S[0].base, lines: S.length }
  if (!at.length) return display ? { text: '', chars: [], box } : null
  // between them, a space of the text layer inside a segment, and a break between two items or lines with one of the
  // rendering's characters either side (in v0's reading a formula's big operator may stand on the line above, and all
  // that line's spaces after it are no part of the formula)
  const mine = new Set(at)
  const ownBefore = i => { for (let q = i - 1; q >= at[0]; q--) if (real(uc[q])) return mine.has(q); return false }
  const ownAfter = i => { for (let q = i + 1; q <= at.at(-1); q++) if (real(uc[q])) return mine.has(q); return false }
  const chars = []
  for (let i = at[0]; i <= at.at(-1); i++) {
    const c = uc[i]
    if (real(c) ? mine.has(i) : c.sep || c.space ? ownBefore(i) && ownAfter(i) : inside(c)) chars.push(c)
  }
  return { text: chars.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars, box }
}

/**
 * The unit's parts from the file (layer2.d.mts UnitParts), for a unit locatedWhole passes. `use`:
 * - 'ph': part 4 alone, the placeholders' renderings by their segments (the unit's lines v0's);
 * - 'lines': part 1 too, the unit's lines (`lines`, texRects' answer), and part 3, its label by the file's box (v0's
 *   where the file has none, and a mark its first line holds before its first word);
 * - extents 'tex' (with 'lines'): part 2 too, the file's erase rectangles (its glyphs' boxes merged); else each line's
 *   extent as v0 reads it from its characters.
 * `kOf`: each piece's source index (kOfPieces).
 */
export function texParts(lu, kOf, { use, lines = null, extents = 'v0' }) {
  const parts = {
    renderings({ phs, uc, gaps, citeMap }) {
      const found = new Map()
      for (const p of phs) {
        if (p.cls === 'zero' || p.cls === 'space' || p.cls === 'symbol') continue
        const row = lu.ph.get(kOf[p.k])
        if (!row || row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY) || !row.segs.length) continue
        const g = renderingOf(row.segs, uc, p.cls === 'display')
        if (g) found.set(p, p.cls === 'cite' ? learnCite(p, g, citeMap) : g)
      }
      // (a text macro that sets no ink is drawn as nothing; a text symbol the file draws as its character, as that)
      const fixed = p => {
        if (inklessOf(lu, kOf, p)) return { mode: 'none', text: '' }
        const row = lu.ph.get(kOf[p.k])
        return row && row.flags & PH_FLAG.TEXT && row.text && p.cls !== 'symbol' ? { mode: 'source', text: row.text } : null
      }
      return { gaps, gapFor: p => found.get(p) ?? null, fixed }
    },
  }
  if (use !== 'lines') return parts
  const { exact, lineOf } = lines
  const held = (lines.held ?? []).map(rectKey)
  parts.lines = (rects, charsByPage) => {
    const ext = new Map()
    const uc = charsOfUnit2(rects, charsByPage, ext, exact)
    const lineInfo = new Map()
    for (const r of rects) {
      const e = exact.get(r), info = { baseline: e.baseline, size: e.size, exact: true, file: true }
      lineInfo.set(rectKey(r), info)
      lineInfo.set(`${r[0]}|${r[2]}|${r[3]}|${r[4]}`, info)
    }
    return { uc, extents: ext, lineInfo, held }
  }
  if (extents === 'tex') {
    parts.extents = (_lines, rects) => {
      const out = new Map()
      for (const r of rects) {
        const e = lu.erase[lineOf.get(r)] ?? new Float64Array(0), boxes = []
        for (let q = 0; q + 3 < e.length; q += 4) boxes.push([e[q], e[q + 1], e[q + 2], e[q + 3]])
        out.set(r, boxes)
      }
      return out
    }
  }
  parts.label = (out, unit, rects, charsByPage, gaps) => {
    const lb = lu.labels
    if (lb.length < 7) {
      // none in the file: v0's; and where the unit begins with text, a mark its first line holds before its first source
      // word (the file's first line starts at the unit's own mark, before the class's: a footnote's ∗ and †, which are no
      // word and so in no gap, were erased as its text)
      const rest = labelOf(out, unit, rects, charsByPage, gaps)
      const first = unit.pieces.find(p => p.t !== 'ph' || !['zero', 'space'].includes(phClass2(p.src).cls))
      if (out.label || out.firstX0 === undefined || first?.t !== 'text' || !/\S/.test(first.s)) return rest
      const key = rectKey(rects[0]), before = out.uc.filter(c => !c.sep && !c.space && /\S/.test(c.ch) && `${c.page}|${c.rect.join()}` === key && c.x1 <= out.firstX0 + 0.1)
      if (before.length && before.every(c => !/[\p{L}\p{N}]/u.test(c.ch))) out.label = { x1: Math.max(...before.map(c => c.x1)), text: before.map(c => c.ch).join(''), chars: before }
      return rest
    }
    // the label's box (kind, page, x0, baseline, x1, top, bottom): the page's characters inside it
    const [, page, x0, , x1, top, bottom] = lb
    const chars = (charsByPage[page - 1] ?? []).filter(c => /\S/.test(c.ch) && (c.x0 + c.x1) / 2 >= x0 - 0.5 && (c.x0 + c.x1) / 2 <= x1 + 0.5 && c.yb >= bottom - 0.5 && c.yb <= top + 0.5).sort((a, b) => a.x0 - b.x0).map(c => ({ ...c, page }))
    out.label = { x1: Math.max(x1, ...chars.map(c => c.x1)), text: chars.map(c => c.ch).join(''), chars }
    // what the unit's lines hold of it is the label's, no rendering's
    const keys = new Set(chars.map(charKey))
    const real = c => !c.sep && !c.space && /\S/.test(c.ch)
    return gaps.map(g => (g.chars.some(c => keys.has(charKey(c))) ? (cs => ({ text: cs.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars: cs }))(g.chars.filter(c => !real(c) || !keys.has(charKey(c)))) : g)).filter(g => g.chars.some(real))
  }
  return parts
}
