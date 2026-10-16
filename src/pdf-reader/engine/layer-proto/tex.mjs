// src/pdf-reader/engine/layer-proto/tex.mjs
// The layer's hybrid (step 2 of its new direction, 2026-10-06): v0's per-unit reading (layer2.mjs prepareUnit, whose
// contract layer2.d.mts writes) with its parts from the layout file wherever the file locates the unit whole, and v0's
// own heuristics everywhere else. A unit the file does not locate whole is v0's, unchanged: a miss of the file never
// leaves a unit English that v0 draws.
//
// What the file knows that v0 guesses: each line's baseline and size and its ink's extent across (v0 reads them from the
// anchors' rectangles and the text layer's estimates), the line's frame, each placeholder's ink by its own segments (v0
// aligns the page's words with the source and takes the runs left over), a label's box, which of its lines are no text of
// its own (`held`: the lines kept, the alignment keeping none on the file's lines), and where a forced break `\\` ends
// a line (forcedBreaks). The rest of the unit's reading is the same for both: the alignment with its source (which
// characters are its words, its style), the resolution's rules, and the finish (what becomes of each page character,
// which the restore reads). The
// page characters are PDF.js's in both, so that the paper's citations and macros a unit learns, and the characters the
// restore counts as accounted for, are the same keys whichever source a unit took.
import { PH_FLAG } from '../layout/file.mjs'
import { charKey, charsOfUnit2, cropOfBox, labelOf, learnCite, phClass2, phClassProven } from './layer2.mjs'

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
 * (measured: asking it sent 123 units to v0 and drew worse). With `held` (the file's lines taken, texParts 'lines'), a
 * displayed formula LOST or with no segments is found too where the file's held lines cover it (displayCover: D4 step 1,
 * 2026-10-08): it is kept where it stands, as its held lines are, and breaks the unit's text there. A later display of a
 * display group (PH_FLAG.JOINED) is found with its group's first display, whose segments hold its ink; a LOST piece the
 * file says lies outside the unit's lines (PH_FLAG.OUTSIDE: before its start mark, a display after its end mark) is found
 * with the file's lines (`held`) as drawn as nothing, its ink never erased (the maintainer's ruling of 2026-10-15, the p59 ruling's edge display). So a
 * unit the file holds is drawn by the file, a piece by its own segments, wherever every piece of it is one the file
 * accounts for; any other LOST piece sends it to v0's reading, where no rendering of it can be proven (proofOf) and the
 * unit stays the original's.
 * Returns { ok, why, kOf }: why one of 'unlocated', 'pieces', 'no row', 'lost', 'empty'.
 */
export function locatedWhole(lu, unit, trPieces, { symbols = 'text', held = false } = {}) {
  if (!lu) return { ok: false, why: 'unlocated' }
  const kOf = kOfPieces(unit, trPieces)
  if (!kOf) return { ok: false, why: 'pieces' }
  let cover
  for (const [i, p] of unit.pieces.entries()) {
    // (as the unit is read under the proof: a formula of no letter or digit, "Σ_α^β", no text symbol, phClassProven)
    const cls = p.t === 'nested' ? 'num' : p.t === 'ph' ? phClassProven(p.src).cls : null
    if (!cls || !VISIBLE.has(cls) || (cls === 'symbol' && symbols === 'text')) continue
    const row = lu.ph.get(kOf[i])
    if (!row) { if (MACROS.has(cls)) continue; return { ok: false, why: 'no row' } }
    if (row.flags & PH_FLAG.EMPTY) return { ok: false, why: 'empty' }
    if (row.flags & (PH_FLAG.TEXT | PH_FLAG.JOINED)) continue
    // (outside the unit's lines: the file's lines, which never hold it; v0's rectangles may)
    if (row.flags & PH_FLAG.OUTSIDE && held) continue
    if (row.flags & PH_FLAG.LOST || !row.segs.length) {
      if (cls === 'display' && held && (cover ??= displayCover(lu, unit, kOf)).has(i)) continue
      return { ok: false, why: 'lost' }
    }
  }
  return { ok: true, why: null, kOf }
}

/**
 * Which of the unit's held runs covers each of its displayed formulas, by its piece's index (D4 step 1), read from TeX's
 * file and the source's order alone, never from the translation's pieces: a translation that sets nothing between two
 * displays the source keeps apart, or moves its words across one, says nothing of where TeX set them (2307.16209 page
 * 59, unit 198: Microsoft dropped the "with" between (3.53) and (3.54), the groups read from its pieces paired nothing,
 * and v0 laid the text over (3.54)).
 * - A held run: the file's `held` lines (those the unit's source does not write: a display's rows; no slot, never erased)
 *   consecutive in one frame, so on one page and in one column, in the unit's line order. TeX sets the source in order,
 *   so the runs stand in the source's order of the display groups they hold, one group a run. Only a display's rows are
 *   one: a run the found segments of an inline placeholder meet, and no display's, is that placeholder's (a fraction's
 *   numerator or denominator, which the file reads as a line of its own and holds), and is not counted.
 * - The displays in their source order (`kOf`), in groups: a display JOINED to the one before it is of its group (TeX
 *   gave it no point, its ink the first's); any other display after a found one, or a found one, is a group of its own
 *   (it has its own point: the maker JOINs a display TeX set in the group of a found one), as is one with a placeholder
 *   the file holds a row for between it and the one before (every visible piece has one). Two LOST displays with no row
 *   between them are one group where only placeholders lie between them in the source (nothing visible: TeX's display
 *   group); where a text piece of the source does, its words (white space, or a line of TeX's) are not the file's, and
 *   the runs' count decides.
 * - Where each group is: a group with a found display is where its segments are, each on the lines of one run (meeting
 *   one of their bands on its page), or off the unit's lines, no segment meeting any (a display after the unit's last
 *   line, before its first, at a column's foot past its lines); a LOST group the file says lies outside the unit's
 *   lines (OUTSIDE: a display after its end mark, which stands on the unit's last line) is off them, left as the
 *   original's ink. The LOST groups between two found groups on runs (or before the first, after the last) take the
 *   runs between theirs in order, each its own where they are as many, or joined across the text between them where
 *   the joined are.
 * Returns a Map of each display of a group on a run to its run's lines: a display LOST or with no segments so covered is
 * kept where it stands, as its held lines are. Empty where the file and the order do not agree (a segment on another
 * line of the unit or on two runs, a found group out of order, a run no group takes or a LOST group no run is left for:
 * a run that is no display, another unit's line the anchor took; a display whose rows hold the source's words and are
 * not held; one display over two frames; three LOST groups and the runs' count saying neither all apart nor all joined).
 * A LOST group's run rests on the order and the count alone, no segment checks it. Where the count agrees and the run is
 * the wrong one, the break moves (which run the flow breaks at) and the held lines stay the original's, drawn and never
 * erased; but a LOST display whose own rows are not held (they hold the source's words) is then laid on another run, and
 * its rows are erased as the unit's text: its ink is lost.
 */
export function displayCover(lu, unit, kOf) {
  const L = lu.lines, F = lu.frames, held = new Set(lu.held ?? []), none = new Map()
  const { LOST, EMPTY, JOINED, OUTSIDE } = PH_FLAG
  // the unit's displays by their source index, and the source's pieces the translation holds as no text
  const ds = [], placed = new Set()
  for (const [i, p] of unit.pieces.entries()) {
    if (kOf[i] >= 0) placed.add(kOf[i])
    if (p.t === 'ph' && phClass2(p.src).cls === 'display') ds.push({ i, k: kOf[i], row: lu.ph.get(kOf[i]) })
  }
  if (ds.some(d => !d.row)) return none
  ds.sort((a, b) => a.k - b.k)
  const meets = (j, s, S) => L[8 * j] === S[s] && Math.min(S[s + 4], L[8 * j + 4]) > Math.max(S[s + 5], L[8 * j + 5])
  const isFound = row => !(row.flags & (LOST | EMPTY | JOINED)) && row.segs.length > 0
  // the held runs: a display's rows, not an inline placeholder's (the found segments of one meeting it, and no display's)
  const displays = new Set(ds.map(d => d.k))
  const metBy = (run, display) => {
    for (const [k, row] of lu.ph) {
      if (displays.has(k) !== display || !isFound(row)) continue
      const S = row.segs
      for (let s = 0; s + 5 < S.length; s += 6) if (run.some(j => meets(j, s, S))) return true
    }
    return false
  }
  const all = []
  for (let f = 0; f < F.length; f += 6) {
    let run = null
    for (let j = F[f + 2]; j < F[f + 2] + F[f + 3]; j++) {
      if (!held.has(j)) { run = null; continue }
      if (!run) all.push((run = []))
      run.push(j)
    }
  }
  const runs = all.filter(run => !metBy(run, false) || metBy(run, true)), runOf = new Map()
  runs.forEach((run, n) => { for (const j of run) runOf.set(j, n) })
  // (the rows' source indices sorted once, each boundary a binary search: a unit may hold thousands of pieces)
  const rowKs = Float64Array.from(lu.ph.keys()).sort()
  const rowBetween = (a, b) => {
    let lo = 0, hi = rowKs.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (rowKs[mid] <= a) lo = mid + 1; else hi = mid }
    return lo < rowKs.length && rowKs[lo] < b
  }
  const textBetween = (a, b) => { for (let k = a + 1; k < b; k++) if (!placed.has(k)) return true; return false }
  // the groups; `open`: one whose boundary with the group before it the file does not give (LOST both, text between)
  const groups = []
  for (const d of ds) {
    const g = groups.at(-1), prev = g?.members.at(-1), f = d.row.flags
    const lostPair = !!prev && !!(f & LOST) && !!(prev.row.flags & LOST) && !(f & OUTSIDE) === !(prev.row.flags & OUTSIDE) && !rowBetween(prev.k, d.k)
    const open = lostPair && textBetween(prev.k, d.k)
    if (prev && (f & JOINED || (lostPair && !open))) g.members.push(d)
    else groups.push({ members: [d], at: null, open })
  }
  // each group's run (its index), -1 off the unit's lines, or null: LOST, the order's to place
  for (const g of groups) {
    const found = g.members.filter(d => isFound(d.row))
    if (!found.length) { if (g.members.every(d => d.row.flags & (OUTSIDE | EMPTY))) g.at = -1; continue }
    for (const { row: { segs: S } } of found) {
      for (let s = 0; s + 5 < S.length; s += 6) {
        const on = new Set()
        let any = false
        for (let j = 0; j < L.length / 8; j++) if (meets(j, s, S)) { any = true; if (runOf.has(j)) on.add(runOf.get(j)) }
        const r = on.size === 1 ? [...on][0] : any ? null : -1
        if (r === null || (g.at !== null && g.at !== r)) return none
        g.at = r
      }
    }
  }
  const out = new Map()
  let next = 0, lost = []
  const take = (g, r) => { for (const d of g.members) out.set(d.i, runs[r]) }
  // the LOST groups since the last group on a run take the runs before `upTo`: each its own, or joined across their
  // open boundaries, where those are as many
  const settle = upTo => {
    let stretch = lost
    if (upTo - next !== lost.length) {
      // (the join rests on the runs' count alone: where a LOST display's rows make no run of their own, at a page's or a
      // column's foot past the unit's lines or holding the source's words and not held, the count can join two displays
      // the source keeps apart. The file cannot tell: the root fix is the maker writing why a display is LOST, a later
      // display of a group whose first was not found apart from one LOST on its own, a new flag of the layout file's
      // schema; debt #299)
      stretch = []
      for (const g of lost) { if (g.open && stretch.length) stretch.at(-1).members.push(...g.members); else stretch.push({ members: [...g.members] }) }
      if (upTo - next !== stretch.length) return false
    }
    stretch.forEach((g, n) => take(g, next + n))
    lost = []
    return true
  }
  for (const g of groups) {
    if (g.at === null) { lost.push(g); continue }
    if (g.at < 0) continue
    if (g.at < next || !settle(g.at)) return none
    take(g, g.at)
    next = g.at + 1
  }
  return settle(runs.length) ? out : none
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
 * row says, as TeX set it. Returns a Map of each piece of a paired group, by its index, to { next, room }: `next` the
 * file's line after its break, the line TeX set the text after it on; `room` what TeX left between the two lines beyond
 * the unit's pitch, in pitches (the gap over the pitch less one, never below 0: 1 for `\\ \\`, whose second break sets an
 * empty line, 0 for a lone `\\`, 0.63 for `\vspace{0.3cm}\\` at a pitch of 13.6), the unit's own rows' alone. `room` is
 * null where `next` opens another frame (TeX drops glue at a frame's head, and the file says nothing more: the text after
 * it starts there), or where the unit has no two lines of its own next to each other in a frame besides its breaks' (no
 * pitch to measure the gap by). The fix of 2026-10-16: within a frame, the break ends the laid line and leaves its room
 * in the drawing's pitches wherever the translation sets it (layer2.mjs breakLines), so that the unit keeps one leading
 * and its unused room is at its end, where the fill closes it; pinned to TeX's line, the room the translation of the text
 * before it did not use stood as a band before that line (2608.16117 page 3, unit 8: 4.4 pitches where TeX set 2).
 * Empty where nothing pairs (a ragged or centred unit's short lines, a break TeX set at a line's end), and the unit's text
 * then runs through as before.
 */
export function forcedBreaks(lu, unit, kOf = null) {
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
  // (the unit's pitch: the median gap of two of its own lines next to each other in one frame, its breaks' aside)
  const frameOf = new Int32Array(n).fill(-1)
  for (let f = 0; f < F.length; f += 6) for (let j = F[f + 2]; j < F[f + 2] + F[f + 3]; j++) frameOf[j] = f
  const brk = new Set(cands), gaps = []
  for (let j = 0; j + 1 < n; j++) {
    if (brk.has(j) || held.has(j) || held.has(j + 1) || frameOf[j] < 0 || frameOf[j] !== frameOf[j + 1]) continue
    const g = L[8 * j + 3] - L[8 * (j + 1) + 3]
    if (g > 0) gaps.push(g)
  }
  gaps.sort((a, b) => a - b)
  const p0 = gaps.length ? (gaps[(gaps.length - 1) >> 1] + gaps[gaps.length >> 1]) / 2 : null
  breaks.forEach((g, b) => {
    const j = cands[b]
    const room = p0 === null || frameOf[j] !== frameOf[j + 1] ? null : Math.max(0, Math.round(((L[8 * j + 3] - L[8 * (j + 1) + 3]) / p0 - 1) * 1000) / 1000)
    for (const i of g.members) out.set(i, { next: j + 1, room })
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

/** a row's segments (stride 6: page, x0, baseline, x1, top, bottom) as boxes */
const segmentsOf = segs => {
  const S = []
  for (let s = 0; s + 5 < segs.length; s += 6) S.push({ page: segs[s], x0: segs[s + 1], base: segs[s + 2], x1: segs[s + 3], top: segs[s + 4], bottom: segs[s + 5] })
  return S
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
 * them, and the ink's box (its extent across and up and down, the baseline of its first segment's line, its segments). Null where no
 * character of the unit is inside, but for a display (its rows outside the unit's lines are shown where they are).
 */
export function renderingOf(segs, uc, display) {
  const S = segmentsOf(segs)
  const real = c => !c.sep && !c.space && /\S/.test(c.ch)
  const inside = c => insideOf(S, c, display)
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

/** a display's rendering from the held run that covers it (displayCover): the unit's characters on the run's lines, and
 *  the lines themselves (`held`, their keys), which hold it where its characters are none */
function heldRendering(run, lines, uc) {
  const keys = new Set()
  lines.rects.forEach((r, i) => { if (run.includes(lines.jOf?.[i] ?? lines.lineOf.get(r))) keys.add(rectKey(r)) })
  const chars = uc.filter(c => !c.sep && !c.space && /\S/.test(c.ch) && keys.has(`${c.page}|${c.rect.join()}`))
  return { text: chars.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars, held: [...keys], proof: true }
}

/**
 * Part 5, the proof (layer2.mjs prepareUnit), for any unit the hybrid draws: the one place the hybrid's safe rule is held
 * (the math round's `unproven`, from its crops to every rendering; the maintainer's ruling of 2026-10-15). A placeholder
 * is drawn only from what proves it: TeX's own (one that sets nothing, a space; a rendering the file gives: a placeholder's segments, a display's held run or its group, a text symbol's TEXT row, one
 * outside the unit's lines drawn as nothing, a macro TeX said sets no ink: `proof`), or of v0's reading:
 * - a crop, cut from its placeholder's own ink, the file's segment of its row on the crop's page that its rectangle meets
 *   (stream ownership, layout/stream.mjs), on that segment's baseline (layer2.mjs cropOfBox): its rendering the same;
 * - its page text, or its ink kept where it stands, where every character of it stands in its row's segments.
 * Where none does (its row LOST, EMPTY, JOINED or missing, the unit not in the file, `lu` null, or its pieces not the
 * file's, `kOf` null), or the rendering is no page ink (its source's plain text, a citation as the page wrote it before,
 * a display drawn as nothing), nothing proves which ink is the placeholder's — a crop of the page's rectangle carries
 * whatever stands in it (2307.16209 page 38's "ıe", from the line above), v0's alignment hands a rendering to the next
 * placeholder along (2608.16117's unit 28) — and the answer is that placeholder's k: its unit stays the original's (the
 * run's `unproven`). Else -1. Mutates the crops it cuts. A placeholder whose row is found and whose segments all lie on
 * pages past those the run shows (`shown`: a unit cut at the last page shown, its lines laid there too) is proven by the
 * file, and drawn as its page text where the file has one, else as nothing: never its source's "?" (no character of it
 * is read on a page not shown; a reader shows every page).
 * Page text is drawn as its characters read, so a page-text rendering any of whose characters no Unicode of the file's
 * stands for is no proof, whatever proves its ink (the file's own segments too), and its k the answer: layer2.mjs
 * pageChars2's `nu`, a glyph its font's ToUnicode does not map, which PDF.js reads by its code, or a private-use,
 * replacement or control character. The reader would see another character than the page's: 2307.16209 page 133, unit
 * 442, drew "g(z′) = Í n g n (z′) n" for g(z') = Σ_n g_n(z')^n (newtx's display sum, in txexs, which no ToUnicode maps).
 * The one exemption (the controller's rulings of 2026-10-15): a LaTeX text symbol v0 draws from its source (\%,
 * $\times$, $^\dagger$: layer2.mjs textSymbol, a 'symbol' whose drawn text is one grapheme with no `_`, `^`, `/` or `√(`).
 * Its source is its rendering's content, a character LaTeX's own definition sets, and its glyph is its line's, erased
 * with it; the rule is against guessing where a formula's ink is, which a symbol asks for none of. A formula of no
 * letter or digit ($\sum_{\alpha}^{\beta}$, drawn "Σ_α^β" from its source) is no text symbol: a unit under the proof
 * reads it as 'other' (phClassProven), and it is proven as any formula is.
 */
export function proofOf(lu, kOf, shown = Infinity) {
  return res => {
    for (const r of res.values()) {
      if (!r) continue
      // (whatever proves where its ink is: page text is drawn as its characters read, and one no Unicode of the file's
      // stands for, pageChars2's `nu`, reads as no glyph the page shows)
      if (r.mode === 'orig-text' && (r.gap?.chars ?? []).some(c => c.nu)) return r.k
      if (r.cls === 'zero' || r.cls === 'space' || r.cls === 'symbol' || r.proof || r.gap?.proof) continue
      const row = lu && kOf ? lu.ph.get(kOf[r.k]) : null
      const S = row && !(row.flags & (PH_FLAG.LOST | PH_FLAG.EMPTY | PH_FLAG.JOINED)) ? row.segs : []
      let past = S.length > 0
      for (let s = 0; s + 5 < S.length; s += 6) if (S[s] <= shown) past = false
      if (past) {
        Object.assign(r, { mode: row.text ? 'source' : 'none', text: row.text ?? '', proof: true })
        continue
      }
      if (r.mode === 'crop') {
        if (r.gap?.box) continue
        let seg = null
        for (let s = 0; s + 5 < S.length && !seg; s += 6) {
          if (S[s] !== r.page) continue
          const box = { x0: S[s + 1], x1: S[s + 3], top: S[s + 4], bottom: S[s + 5], baseline: S[s + 2], lines: 1 }
          if (Math.min(box.x1, r.crop[2]) > Math.max(box.x0, r.crop[0]) && Math.min(box.top, r.crop[3]) > Math.max(box.bottom, r.crop[1])) seg = box
        }
        if (!seg) return r.k
        Object.assign(r, cropOfBox(seg))
        r.gap = { ...r.gap, box: seg }
        continue
      }
      const real = (r.gap?.chars ?? []).filter(c => !c.sep && !c.space && /\S/.test(c.ch))
      const segs = segmentsOf(S)
      if ((r.mode === 'orig-text' || r.mode === 'kept') && real.length && segs.length && real.every(c => insideOf(segs, c, r.cls === 'display'))) continue
      return r.k
    }
    return -1
  }
}

/**
 * The unit's parts from the file (layer2.d.mts UnitParts), for a unit locatedWhole passes. `use`:
 * - 'ph': part 4 alone, the placeholders' renderings by their segments (the unit's lines v0's);
 * - 'lines': part 1 too, the unit's lines (`lines`, texRects' answer), and part 3, its label by the file's box (v0's
 *   where the file has none, and a mark its first line holds before its first word); and where its forced breaks end
 *   those lines (`breaks`, forcedBreaks);
 * - extents 'tex' (with 'lines'): part 2 too, the file's erase rectangles (its glyphs' boxes merged); else each line's
 *   extent as v0 reads it from its characters.
 * - and part 5 for any `use`, the proof of every rendering (proofOf; `shown`, the last page the run shows).
 * `kOf`: each piece's source index (kOfPieces).
 */
export function texParts(lu, kOf, { use, lines = null, extents = 'v0', shown = Infinity }) {
  const parts = {
    proof: proofOf(lu, kOf, shown),
    renderings({ unit, phs, uc, gaps, citeMap }) {
      const found = new Map(), joined = []
      let cover
      for (const p of phs) {
        if (p.cls === 'zero' || p.cls === 'space' || p.cls === 'symbol') continue
        const row = lu.ph.get(kOf[p.k])
        // (a later display of a display group: its group's rendering, below)
        if (p.cls === 'display' && row && row.flags & PH_FLAG.JOINED) { joined.push(p); continue }
        // (a display the held lines cover, LOST or with no segments: its run's lines, kept where they stand, and a break
        // in the unit's text, as a found display's rows are: locatedWhole)
        if (p.cls === 'display' && lines?.lineOf && row && !(row.flags & PH_FLAG.EMPTY) && (row.flags & PH_FLAG.LOST || !row.segs.length)) {
          const run = (cover ??= displayCover(lu, unit, kOf)).get(p.k)
          if (run) found.set(p, heldRendering(run, lines, uc))
          continue
        }
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
      // (a text macro that sets no ink is drawn as nothing, as one outside the unit's lines is, its ink never erased; a
      // text symbol the file draws as its character, as that)
      const fixed = p => {
        if (inklessOf(lu, kOf, p)) return { mode: 'none', text: '', proof: true }
        const row = lu.ph.get(kOf[p.k])
        // (`inPlace`: shown by its own ink, left where it stands: the checker's)
        if (row && row.flags & PH_FLAG.OUTSIDE && lines?.lineOf) return { mode: 'none', text: '', proof: true, inPlace: true }
        return row && row.flags & PH_FLAG.TEXT && row.text && p.cls !== 'symbol' ? { mode: 'source', text: row.text, proof: true } : null
      }
      return { gaps, gapFor: p => found.get(p) ?? null, fixed }
    },
  }
  if (use !== 'lines') return parts
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
  // (and where its forced breaks end the file's lines, which its rectangles are: forcedBreaks)
  parts.breaks = unit => forcedBreaks(lu, unit, kOf)
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
