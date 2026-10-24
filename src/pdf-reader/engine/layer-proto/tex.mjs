// src/pdf-reader/engine/layer-proto/tex.mjs
// The layout file as the layer's only source of a unit (route step 2, 2026-10-22; the hybrid of 2026-10-06 before it drew a
// unit the file did not hold from v0's own heuristics): the per-unit reading (layer2.mjs prepareUnit, whose contract
// layer2.d.mts writes) takes its parts from the layout file, and a unit the file does not locate whole, or one with a visible
// piece the file has no position for, is the original's (locatedWhole).
//
// What the file knows: each line's baseline and size and its ink's extent across, the line's frame, each placeholder's ink by
// its own segments, a label's box, which of its lines are no text of its own (`held`: the lines kept, the alignment keeping
// none on the file's lines), and where a forced break `\\` ends a line (forcedBreaks). The rest of the unit's reading is the
// alignment with its source (which characters are its words, its style), the resolution's rules, and the finish (what becomes of
// each page character, which the restore reads). The page characters are PDF.js's, so that the paper's citations and macros a
// unit learns, and the characters the restore counts as accounted for, are the same keys whichever unit took them.
import { PH_FLAG } from '../layout/file.mjs'
import { naturalOf, pitchOf, roomOf } from './break-room.mjs'
import { charKey, charsOfUnit2, cropFields, cropPartsOfSegments, labelOf, learnCite, phClass2, phClassProven, PREDISPLAY, SHORT_SKIP, sourcePiecesOf, texToText2 } from './layer2.mjs'

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
 * Whether the layout file locates a unit whole, against the file (`lu`, its indexLayout unit, or null): the layer draws a
 * unit only from the file, so a unit the file does not hold, or one with a visible piece the file has no position for, is
 * the original's. Its lines are all carried (the maker writes a unit only where every one of its lines was carried to the
 * base page, so a unit in the file has them all); every one of its placeholders that is drawn as ink is found: a row with
 * segments, its own ink between its two points (layout/stream.mjs). Not found are a row LOST or with no segments, and no
 * row at all (but for a text macro, below). A symbol drawn from its source as text (\%, $\times$) is no piece to find,
 * whose glyph its line's erasing covers (`symbols: 'strict'` asks it too). A text symbol the file draws as its character
 * (PH_FLAG.TEXT: no segments, its glyph the line's) is found; a text macro the file holds no row for sets no ink
 * (inklessOf); an EMPTY piece, one TeX set no ink for where it stands, is drawn as nothing (emptyOf, the controller's ruling of
 * 2026-10-19): nothing of it is on the unit's lines to erase or to draw. A later display of a display group
 * (PH_FLAG.JOINED) is found with its group's first display, whose segments hold its ink; a LOST piece the file says
 * lies outside the unit's lines (PH_FLAG.OUTSIDE: before its start mark, a display after its end mark) is drawn as
 * nothing, its ink never erased (the maintainer's ruling of 2026-10-15, the p59 ruling's edge display). Its lines need not
 * be in reading order: those out of it are a display's rows or number the file lists after the line below, which the
 * unit's text reading keeps as the original's (measured: asking it sent 123 units to the original's reading and drew worse).
 * Returns { ok, why, kOf }: why one of 'unlocated', 'pieces', 'no row', 'lost'.
 */
export function locatedWhole(lu, unit, trPieces, { symbols = 'text' } = {}) {
  if (!lu) return { ok: false, why: 'unlocated' }
  const kOf = kOfPieces(unit, trPieces)
  if (!kOf) return { ok: false, why: 'pieces' }
  for (const [i, p] of unit.pieces.entries()) {
    // (as the unit is read: a formula of no letter or digit, "Σ_α^β", is no text symbol, phClassProven)
    const cls = p.t === 'nested' ? 'num' : p.t === 'ph' ? phClassProven(p.src).cls : null
    if (!cls || !VISIBLE.has(cls) || (cls === 'symbol' && symbols === 'text')) continue
    const row = lu.ph.get(kOf[i])
    if (!row) { if (MACROS.has(cls)) continue; return { ok: false, why: 'no row' } }
    if (row.flags & (PH_FLAG.EMPTY | PH_FLAG.TEXT | PH_FLAG.JOINED | PH_FLAG.OUTSIDE)) continue
    if (row.flags & PH_FLAG.LOST || !row.segs.length) return { ok: false, why: 'lost' }
  }
  return { ok: true, why: null, kOf }
}

/** LaTeX's forced line breaks: `\\` (starred, or with its optional space) and \newline, each set as \hfil\break, so that
 *  TeX ends the line there short of its measure and sets what follows on the next */
export const FORCED_BREAK = /^\\\\\*?(?:\[[^\]]*\])?$|^\\newline$/
/** a line ends short of its frame's measure by more than this share of its size (a justified line's ink reaches it, to a
 *  glyph's side bearing) */
const SHORT = 0.5

/**
 * Where each forced break of the unit's row ends a line of the file (the fix 3 of the 2608.16117 survey, 2026-10-15: its
 * paragraphs were separated by `\\ \\`, and the translation ran through the original's blank line mid-sentence). A
 * break group: the unit's forced breaks (FORCED_BREAK) in its order with nothing visible between them (text holding a
 * non-space character, or a placeholder v0 draws ink for); one breaks the unit's text where a visible piece that is no
 * display stands before it and after it (a display breaks it by itself; one at an edge of the unit ends no line of it).
 * TeX's breaks: each line of the file (not held) that ends short of its frame's measure (the rightmost ink of the frame's
 * lines not held, less SHORT of its size: the \hfil a forced break sets) with a line of the unit after it that is not
 * held either, no display's segment between the two nor on the line (a display's row the file does not hold). A unit in
 * two columns of one page pairs nothing (a placeholder's line is read by its baseline, which the other column's line may
 * share). The groups pair with TeX's breaks in order, as D4 pairs
 * displays with held runs (displayCover): only where they are as many; and the pairing holds only where every placeholder
 * the file finds (its segments, by the unit's line nearest each on its page) stands between the breaks its place in the
 * row says, as TeX set it. Returns a Map of each piece of a paired group, by its index, to { next, room, pitch }: `next`
 * the file's line after its break, the line TeX set the text after it on; `pitch` its frame's (break-room.mjs pitchOf:
 * its lines' gaps, its breaks' aside); `room` what TeX left between the two lines beyond the pitch, in pitches
 * (break-room.mjs roomOf: the gap over the pitch less one, never below 0: 1 for `\\ \\`, whose second break sets an
 * empty line, 0 for a lone `\\`, 0.63 for `\vspace{0.3cm}\\` at a pitch of 13.6), the unit's own rows' alone. Where TeX's
 * rule between two lines (`lineskip`, the paper's \lineskip and \lineskiplimit: the layout file's) set the next line
 * lower for its height, the short line's depth, the next line's height and \lineskip (their boxes the file's, as blocks2
 * reads a tall line's opening), the gap is measured from there: that opening is the tall line's, no room of the break's
 * (a lone `\\` before a fraction, 17 apart at a pitch of 12, is room 0, not 0.42). `room` and `pitch` are
 * null where `next` opens another frame (TeX drops glue at a frame's head, and the file says nothing more: the text after
 * it starts there), or where the frame has no two lines of its own next to each other besides its breaks' (no pitch of
 * its own to measure the gap by: another frame's leading may be another, and the text after it starts on TeX's line). The fix of 2026-10-16: within a frame, the break ends the laid line and leaves its room
 * in the drawing's pitches wherever the translation sets it (layer2.mjs breakLines), so that the unit keeps one leading
 * and its unused room is at its end, where the fill closes it; pinned to TeX's line, the room the translation of the text
 * before it did not use stood as a band before that line (2608.16117 page 3, unit 8: 4.4 pitches where TeX set 2).
 * Empty where nothing pairs (a ragged or centred unit's short lines, a break TeX set at a line's end), and the unit's text
 * then runs through as before.
 */
export function forcedBreaks(lu, unit, kOf = null, lineskip = null) {
  const out = new Map()
  if (!lu) return out
  const groups = []
  let group = null, before = null
  for (const [i, p] of unit.pieces.entries()) {
    if (p.t === 'ph' && FORCED_BREAK.test(p.src ?? '')) {
      if (!group) groups.push((group = { members: [], before, after: null }))
      group.members.push(i)
      continue
    }
    const cls = p.t === 'nested' ? 'num' : p.t === 'ph' ? phClass2(p.src).cls : null
    if (!(p.t === 'text' ? /\S/.test(p.s ?? '') : !!cls && VISIBLE.has(cls))) continue
    const kind = cls === 'display' ? 'display' : 'text'
    if (group) { group.after = kind; group = null }
    before = kind
  }
  const breaks = groups.filter(g => g.before === 'text' && g.after === 'text')
  if (!breaks.length) return out
  const L = lu.lines, F = lu.frames, held = new Set(lu.held ?? []), n = L.length / 8
  // (a unit in two columns of one page: a placeholder's line is read by its baseline alone below, which another column's
  // line may share, so nothing pairs)
  const columns = new Map()
  for (let f = 0; f < F.length; f += 6) { const c = columns.get(F[f]); if (c !== undefined && c !== F[f + 1]) return out; columns.set(F[f], F[f + 1]) }
  // (a display's segments, which may stand between two lines of the unit that are no display's rows, its own break, or
  // on a line of it, a display's row that is no held line: no line a forced break ends)
  const displays = []
  for (const row of lu.ph.values()) if (row.kind === 'display' && !(row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY))) for (let s = 0; s + 5 < row.segs.length; s += 6) displays.push([row.segs[s], row.segs[s + 2], row.segs[s + 4], row.segs[s + 5]])
  const cands = []
  for (let f = 0; f < F.length; f += 6) {
    const first = F[f + 2], count = F[f + 3]
    let right = -Infinity
    for (let j = first; j < first + count; j++) if (!held.has(j)) right = Math.max(right, L[8 * j + 2])
    for (let j = first; j < first + count; j++) {
      if (held.has(j) || j + 1 >= n || held.has(j + 1) || !(L[8 * j + 2] < right - SHORT * L[8 * j + 6])) continue
      const page = L[8 * j], hi = L[8 * j + 3], lo = L[8 * (j + 1) + 3]
      if (L[8 * (j + 1)] === page && displays.some(([pg, base]) => pg === page && base < hi && base > lo)) continue
      if (displays.some(([pg, , top, bottom]) => pg === page && Math.min(top, L[8 * j + 4]) > Math.max(bottom, L[8 * j + 5]))) continue
      cands.push(j)
    }
  }
  if (cands.length !== breaks.length) return out
  // (each found placeholder between the breaks its place in the row says: its segments on the unit's lines after the break
  // before it and up to the break after it)
  if (kOf) {
    const lineOf = (page, base) => {
      let best = -1
      for (let j = 0; j < n; j++) if (L[8 * j] === page && (best < 0 || Math.abs(L[8 * j + 3] - base) < Math.abs(L[8 * best + 3] - base))) best = j
      return best
    }
    let side = 0
    for (const [i, p] of unit.pieces.entries()) {
      while (side < breaks.length && breaks[side].members[0] < i) side++
      if (p.t !== 'ph' && p.t !== 'nested') continue
      const row = kOf[i] >= 0 ? lu.ph.get(kOf[i]) : null
      if (!row || row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY | PH_FLAG.JOINED | PH_FLAG.OUTSIDE)) continue
      for (let s = 0; s + 5 < row.segs.length; s += 6) {
        const j = lineOf(row.segs[s], row.segs[s + 2])
        if (j < 0 || (side > 0 && j <= cands[side - 1]) || (side < breaks.length && j > cands[side])) return out
      }
    }
  }
  // (each frame's pitch: the median gap of two of its own lines next to each other, its breaks' aside; a break's room is
  // its own frame's, where the unit changes its leading between frames)
  const frameOf = new Int32Array(n).fill(-1)
  for (let f = 0; f < F.length; f += 6) for (let j = F[f + 2]; j < F[f + 2] + F[f + 3]; j++) frameOf[j] = f
  const brk = new Set(cands), gaps = new Map()
  for (let j = 0; j + 1 < n; j++) {
    if (brk.has(j) || held.has(j) || held.has(j + 1) || frameOf[j] < 0 || frameOf[j] !== frameOf[j + 1]) continue
    ;(gaps.get(frameOf[j]) ?? gaps.set(frameOf[j], []).get(frameOf[j])).push(L[8 * j + 3] - L[8 * (j + 1) + 3])
  }
  breaks.forEach((g, b) => {
    const j = cands[b], f = frameOf[j]
    const pitch = f === frameOf[j + 1] ? pitchOf(gaps.get(f) ?? []) : null
    // (the gap less the two lines' distance with no break, TeX's rule's for a tall next line: break-room.mjs)
    const room = pitch === null ? null : roomOf(L[8 * j + 3] - L[8 * (j + 1) + 3], pitch, naturalOf(pitch, L[8 * j + 3] - L[8 * j + 5], L[8 * (j + 1) + 4] - L[8 * (j + 1) + 3], lineskip))
    for (const i of g.members) out.set(i, { next: j + 1, room, pitch })
  })
  return out
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
 * starting below it. `jOf`: each rectangle's line in the file, by its place (a rectangle v0 later replaces, a line it
 * starts at its label, keeps its place). `frameOf`: each file line's frame (its page's column).
 */
export function texRects(lu, maxPage = Infinity) {
  const rects = [], exact = new Map(), lineOf = new Map(), held = [], jOf = [], frameOf = new Map()
  const L = lu.lines, F = lu.frames, heldLines = new Set(lu.held ?? [])
  for (let f = 0; f < F.length; f += 6) {
    for (let j = F[f + 2]; j < F[f + 2] + F[f + 3]; j++) {
      const page = L[8 * j], base = L[8 * j + 3], size = L[8 * j + 6], top = L[8 * j + 4], bottom = L[8 * j + 5]
      if (page > maxPage) continue
      const r = [page, r2(L[8 * j + 1]), r2(base - BELOW * size), r2(L[8 * j + 2]), r2(base + ABOVE * size)]
      rects.push(r)
      exact.set(r, { baseline: base, size, top, bottom })
      lineOf.set(r, j)
      jOf.push(j)
      frameOf.set(j, f / 6)
      if (heldLines.has(j)) held.push(r)
    }
  }
  return { rects, exact, lineOf, held, jOf, frameOf }
}

/** whether a placeholder of the unit's sets no ink by the file: a text macro (v0's 'macro' or 'umacro') the file holds no
 *  row for (locatedWhole) */
export const inklessOf = (lu, kOf, p) => MACROS.has(p.cls) && !lu.ph.has(kOf[p.k])
/**
 * Whether a placeholder of the unit's is one TeX set no ink for, by the file (PH_FLAG.EMPTY; the controller's ruling of
 * 2026-10-19): the marked compile's content stream holds nothing between its two points, no glyph, path, image or shading
 * (layout/make.mjs, stream.mjs: what TeX ships elsewhere for it, a footnote's text, a float, lies outside its region and on
 * no line of the unit; one whose closing point was never read the maker writes LOST, its ink not known), or, an unmarked
 * piece at the unit's head or tail, arXiv's page shows no glyph beside the unit's mark on its line (its ink, if any, before
 * the unit's start or after its end, which its lines never take). Either way nothing of it is on the unit's lines: nothing
 * to erase and nothing to draw (2610.19159's \trajectoryMark{}, whose empty argument sets nothing, left 298 units
 * English). A piece the layer draws by its class, a text symbol, a space, one that sets nothing, as before
 */
export const emptyOf = (lu, kOf, p) => VISIBLE.has(p.cls) && p.cls !== 'symbol' && !!((lu.ph.get(kOf[p.k])?.flags ?? 0) & PH_FLAG.EMPTY)

/** each placeholder's fill by the file, by its piece index (`k`): its row's, the colour more than half its glyphs on arXiv's
 *  page are filled with (0xRRGGBB), MIXED_FILL where no one colour holds more than half, null where they are black or
 *  the file has no row with segments for it (layout/file.mjs indexLayout's `fill`) */
export const fillOf = (lu, kOf) => k => (lu && kOf && kOf[k] >= 0 ? lu.ph.get(kOf[k])?.fill ?? null : null)
/** each colour piece's run's fill by the file, by its piece index (`k`): the fill TeX set the run of a \textcolor or a \color
 *  switch in (0xRRGGBB, the file's `colours`), null where the file has none (its colour not known: no guess) */
export const colourOf = (lu, kOf) => k => (lu && kOf && kOf[k] >= 0 ? lu.colours?.get(kOf[k]) ?? null : null)

/** a row's segments (stride 6: page, x0, baseline, x1, top, bottom) as boxes */
const segmentsOf = segs => {
  const S = []
  for (let s = 0; s + 5 < segs.length; s += 6) S.push({ page: segs[s], x0: segs[s + 1], base: segs[s + 2], x1: segs[s + 3], top: segs[s + 4], bottom: segs[s + 5] })
  return S
}
/**
 * The unit's displayed formulas TeX set under a line of its own with its short skip: each segment of a display row the file
 * found (neither LOST nor EMPTY; a later display of a group, JOINED, has none of its own), as segmentsOf gives it, whose top
 * stands under the baseline of a line of the unit's (none it holds: a display's row) nearer than SHORT_SKIP of its size, a
 * line that ends PREDISPLAY em or more before the segment starts, with that line (`line`, its index in the file: once for
 * each such line). TeX's own test: \abovedisplayshortskip, nothing but stretch, under a line that ends 2 em before the
 * display (\predisplaysize), \abovedisplayskip under any other; a display as near under a line that runs on over it is set
 * so for another reason, and the original's line stands over it as it is. The segment is the block's of that line alone
 * (layer2.mjs shortSkipsTo: another column's line beside the display is none of its), and slotsAt holds the line laid
 * there to TeX's test too
 */
export function shortSkipsOf(lu) {
  const out = [], L = lu.lines, held = new Set(lu.held ?? [])
  for (const row of lu.ph.values()) {
    if (row.kind !== 'display' || row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY)) continue
    for (const s of segmentsOf(row.segs)) {
      for (let j = 0; j < L.length / 8; j++) {
        const base = L[8 * j + 3], size = L[8 * j + 6]
        if (held.has(j) || L[8 * j] !== s.page || !(s.top < base && s.top > base - SHORT_SKIP * size) || L[8 * j + 2] + PREDISPLAY * size > s.x0) continue
        out.push({ ...s, line: j })
      }
    }
  }
  return out
}
/** whether a page character of the unit stands in one of the segments: within its ink's extent across, a half point either
 *  side; an inline one's on its line, within a script's window of its baseline; a display's anywhere in its rows */
const insideOf = (S, c, display) => S.some(s => {
  const cx = (c.x0 + c.x1) / 2, y = c.ybEff ?? c.yb
  if (c.page !== s.page || cx < s.x0 - 0.5 || cx > s.x1 + 0.5 || y < s.bottom - 1 || y > s.top + 1) return false
  return display || Math.abs(y - s.base) < SCRIPT(c.size)
})

/**
 * A placeholder's rendering from its segments in the file (stride 6: page, x0, baseline, x1, top, bottom): the unit's
 * page characters inside them (within its ink's extent across, a half point either side; an inline one's on its line,
 * within a script's window of its baseline; a display's anywhere in its rows), the white space and line ends between
 * them, and the ink's box (its extent across and up and down, the baseline of its first segment's line, its segments' count
 * `lines` and the segments themselves, `segs`: a formula broken over lines is cropped by them, layer2.mjs drawnAs). Null where no
 * character of the unit is inside, but for a display (its rows outside the unit's lines are shown where they are).
 */
export function renderingOf(segs, uc, display) {
  const S = segmentsOf(segs)
  const real = c => !c.sep && !c.space && /\S/.test(c.ch)
  const inside = c => insideOf(S, c, display)
  const at = []
  uc.forEach((c, i) => { if (real(c) && inside(c)) at.push(i) })
  const box = { x0: Math.min(...S.map(s => s.x0)), x1: Math.max(...S.map(s => s.x1)), top: Math.max(...S.map(s => s.top)), bottom: Math.min(...S.map(s => s.bottom)), baseline: S[0].base, lines: S.length, segs }
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
 * The file's own renderings against the page's, the last check of a unit the file locates whole (layer2.mjs prepareUnit):
 * a placeholder is drawn from its row's segments (its own ink, layout/stream.mjs), so what it is drawn as is ink the
 * file holds, never a guess. The renderings the file gives are proven by their making (texParts renderings: a piece's
 * characters inside its segments, a formula's crops, a display's rows); what is left is the piece drawn as page text that
 * no Unicode of the file's stands for, and one the segments hold no character of at all. Either is its segments' crops,
 * one a line of them (layer2.mjs cropPartsOfSegments; E3, E3b, 2026-10-19), or, where it has none to be cropped from, the
 * unit's whole stays the original's: the answer is that placeholder's k (the run's `unproven`), else -1. Mutates the
 * crops it cuts.
 * Page text is drawn as its characters read, so a page-text rendering any of whose characters no Unicode of the file's
 * stands for is cropped, whatever proves its ink: layer2.mjs pageChars2's `nu`, a glyph its font's ToUnicode does not map,
 * which PDF.js reads by its code, or a private-use, replacement or control character. The reader would see another
 * character than the page's: 2307.16209 page 133, unit 442, drew "g(z′) = Í n g n (z′) n" for g(z') = Σ_n g_n(z')^n
 * (newtx's display sum, in txexs, which no ToUnicode maps). A rendering with no character of the unit in its segments (a
 * \\qed box drawn of rules) is its segments' crops likewise. A placeholder whose row is found and whose segments all lie on
 * pages past those the run shows (`shown`: a unit cut at the last page shown, its lines laid there too) is drawn as its
 * page text where the file has one, else as nothing: never its source's "?" (no character of it is read on a page not
 * shown; a reader shows every page). TeX's own nothing, a space and a text symbol (the controller's rulings of 2026-10-15:
 * layer2.mjs textSymbol) are exempt: a text symbol's source is its rendering's content, and its glyph is its line's,
 * erased with it.
 */
export function cropsOf(lu, kOf, shown = Infinity) {
  return res => {
    /** a found row's segments, all on pages shown, as its placeholder's crops, one a line of them (layer2.mjs
     *  cropPartsOfSegments) */
    const cropped = (r, S) => {
      if (r.cls === 'display' || !S.length) return false
      for (let s = 0; s + 5 < S.length; s += 6) if (S[s] > shown) return false
      const parts = cropPartsOfSegments(S)
      if (!parts) return false
      res.set(r.k, { ...cropFields(parts), text: texToText2(r.src ?? '') || '', sup: false, k: r.k, src: r.src, cls: r.cls, gap: { text: r.gap?.text ?? '', chars: r.gap?.chars ?? [], box: parts[0].seg, proof: true }, proof: true })
      return true
    }
    for (const r of res.values()) {
      if (!r) continue
      const row = lu.ph.get(kOf[r.k])
      const S = row && !(row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY | PH_FLAG.JOINED)) ? row.segs : []
      if (r.mode === 'orig-text' && (r.gap?.chars ?? []).some(c => c.nu)) { if (cropped(r, S)) continue; return r.k }
      if (r.cls === 'zero' || r.cls === 'space' || r.cls === 'symbol' || r.proof || r.gap?.proof) continue
      let past = S.length > 0, anyPast = false
      for (let s = 0; s + 5 < S.length; s += 6) if (S[s] <= shown) past = false; else anyPast = true
      if (past) {
        Object.assign(r, { mode: row.text ? 'source' : 'none', text: row.text ?? '', proof: true })
        continue
      }
      if (!anyPast && cropped(r, S)) continue
      return r.k
    }
    return -1
  }
}

/**
 * The unit's parts from the file (layer2.d.mts UnitParts), for a unit locatedWhole passes: part 1, the unit's lines
 * (`lines`, texRects' answer); part 3, its label by the file's box (the alignment's where the file has none, and a mark its
 * first line holds before its first word); part 4, the placeholders' renderings by their segments; where its forced breaks
 * end those lines (`breaks`, forcedBreaks; `lineskip`, the file's \lineskip and \lineskiplimit, or null); part 5, the file's
 * crops (cropsOf; `shown`, the last page the run shows). With extents 'tex', part 2 too, the file's erase rectangles (its
 * glyphs' boxes merged); else each line's extent as the alignment reads it from its characters.
 * `kOf`: each piece's source index (kOfPieces).
 */
export function texParts(lu, kOf, { lines, extents = 'v0', shown = Infinity, lineskip = null }) {
  const parts = {
    crops: cropsOf(lu, kOf, shown),
    fillOf: fillOf(lu, kOf),
    colourOf: colourOf(lu, kOf),
    renderings({ phs, uc, gaps, citeMap }) {
      const found = new Map(), joined = []
      for (const p of phs) {
        if (p.cls === 'zero' || p.cls === 'symbol') continue
        const row = lu.ph.get(kOf[p.k])
        // (a space TeX set ink for, its row found: a class's separator, llncs's \\and in \\keywords " \u00b7 ", drawn as that ink;
        // any other is a space, as before)
        if (p.cls === 'space' && (!row || row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY | PH_FLAG.JOINED) || !row.segs.length)) continue
        // (a later display of a display group: its group's rendering, below)
        if (p.cls === 'display' && row && row.flags & PH_FLAG.JOINED) { joined.push(p); continue }
        if (!row || row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY) || !row.segs.length) continue
        const g = renderingOf(row.segs, uc, p.cls === 'display')
        if (g) found.set(p, { ...(p.cls === 'cite' ? learnCite(p, g, citeMap) : g), proof: true })
      }
      // a later display of a display group: the group's ink is its first display's segments, its rendering kept where it
      // stands with them, the same lines (`held`: their keys), so that it breaks the unit's text where its group does
      if (joined.length) {
        const byK = new Map(phs.map(p => [kOf[p.k], p]))
        for (const p of joined) {
          let k = kOf[p.k] - 1
          while (k >= 0 && !(lu.ph.get(k)?.kind === 'display' && !(lu.ph.get(k).flags & PH_FLAG.JOINED))) k--
          const g = found.get(byK.get(k))
          if (!g) continue
          found.set(p, { text: '', chars: [], held: [...new Set([...(g.held ?? []), ...g.chars.filter(c => !c.sep && !c.space).map(c => `${c.page}|${c.rect.join()}`)])], proof: true })
        }
      }
      // (a text macro that sets no ink is drawn as nothing, as one outside the unit's lines is, its ink never erased, and one
      // TeX set no ink for, EMPTY; a text symbol the file draws as its character, as that)
      const fixed = p => {
        if (inklessOf(lu, kOf, p)) return { mode: 'none', text: '', proof: true }
        // (`empty`: TeX set no ink for it, which the checker counts as no rendering lost)
        if (emptyOf(lu, kOf, p)) return { mode: 'none', text: '', proof: true, empty: true }
        const row = lu.ph.get(kOf[p.k])
        // (`inPlace`: shown by its own ink, left where it stands: the checker's)
        if (row && row.flags & PH_FLAG.OUTSIDE) return { mode: 'none', text: '', proof: true, inPlace: true }
        return row && row.flags & PH_FLAG.TEXT && row.text && p.cls !== 'symbol' ? { mode: 'source', text: row.text, proof: true } : null
      }
      return { gaps, gapFor: p => found.get(p) ?? null, fixed, inked: p => found.has(p) }
    },
  }
  const { exact, lineOf } = lines, frameOf = lines.frameOf ?? new Map()
  const held = (lines.held ?? []).map(rectKey)
  parts.lines = (rects, charsByPage) => {
    const ext = new Map()
    const uc = charsOfUnit2(rects, charsByPage, ext, exact)
    const lineInfo = new Map()
    for (const r of rects) {
      const e = exact.get(r), j = lineOf.get(r), info = { baseline: e.baseline, size: e.size, top: e.top, bottom: e.bottom, exact: true, file: true, j, frame: frameOf.get(j) }
      lineInfo.set(rectKey(r), info)
      lineInfo.set(`${r[0]}|${r[2]}|${r[3]}|${r[4]}`, info)
    }
    return { uc, extents: ext, lineInfo, held }
  }
  // (and where its forced breaks end the file's lines, which its rectangles are: forcedBreaks, by TeX's rule between two
  // lines where the file gives its values)
  parts.breaks = unit => forcedBreaks(lu, unit, kOf, lineskip)
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
      // word and so in no gap, were erased as its text). Whether it begins with text is its source's, never its translation's
      // (labelOf)
      const rest = labelOf(out, unit, rects, charsByPage, gaps)
      const first = sourcePiecesOf(unit).find(p => p.t !== 'ph' || !['zero', 'space'].includes(phClass2(p.src).cls))
      if (out.label || out.firstX0 === undefined || first?.t !== 'text' || !/\S/.test(first.s)) return rest
      const key = rectKey(rects[0]), before = out.uc.filter(c => !c.sep && !c.space && /\S/.test(c.ch) && `${c.page}|${c.rect.join()}` === key && c.x1 <= out.firstX0 + 0.1)
      // (never the marks the source itself begins with, its own text: a cell's "(nats)", 2610.21085v1 p30 u358, whose "(" read
      // as a class's mark left the cell's line short of its bracket and its table's header group unfit)
      const own = (unit.src ?? '').match(/^[^\p{L}\p{N}]*/u)[0].replace(/\s/gu, '')
      const marks = before.map(c => c.ch).join('')
      if (before.length && before.every(c => !/[\p{L}\p{N}]/u.test(c.ch)) && !own.startsWith(marks)) out.label = { x1: Math.max(...before.map(c => c.x1)), text: marks, chars: before }
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
