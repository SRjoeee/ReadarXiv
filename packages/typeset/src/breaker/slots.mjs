// B.slots (design-b §1.5): the slots (lines) a unit's blocks hold at a state of the fit, and the floor a paragraph's last line
// keeps over the next line of its column. Today's code (layer2.mjs L2:3118-3281, flowMeasureAt L2:597-610, inFlow L2:3061),
// moved by lab/typeset/move-fit.mjs; typed by slots.types.ts.
import { measureOf, measureOn } from '../unit/blocks.ts'

/** whether two laid lines or slots are one flow of TeX's lines (blocks2: blocks of one unit that follow each other in the
 *  layout file with only the unit's own lines between, in one frame, and no kept region the text passes; every other block
 *  a flow of its own) */
const inFlow = (a, b) => a.flow === b.flow
/** a block's foot at a state: the lowest baseline a line of it is laid at, its last less what it borrows (its room TeX's facts
 *  leave, Block.free: the owner's ruling of 2026-11-08) */
const lowOf = (b, st, s) => b.B.at(-1) - Math.min(b.free ?? 0, st.borrow * (b.pitch0 ?? 1.2 * s))
/**
 * The gap under a paragraph never tighter than its lines (the half-leading round, 2026-10-17, its second form): the lowest
 * baseline a unit's last line may take at a state, where the next line of its column in the original keeps its own baseline
 * (P.halfLead.below: the original's room from the unit's last baseline down to that line; run.mjs edgesOf). A paragraph's
 * first line stays on the original's first baseline, as TeX set it, whatever is over it (a heading, a figure, a skip, the
 * page's head): a first line moved under it by half the leading drifted from the original by (L - 1) / 2 of a pitch on 56 %
 * of the paragraph starts in CJK, 70 % of them with a leading's room over them already (the maintainer's question). So the
 * room a gap lacks is the paragraph's above it: where the next line would stand nearer its last line than its own leading,
 * L p0, and the original's own skip there past its pitch, it ends higher by the deficit, its last baseline no lower than that
 * line's plus L p0 and the skip, its fill spread over a shorter height. Its own leading alone, never the next paragraph's
 * (the owner's ruling of 2026-11-08, chosen on a preview of the rules: today's held the gap to the larger of both, and a
 * paragraph whose translation nearly fills its block was pulled under the leading its own block allows, 1810.04805v2 p8 t156
 * at 1.08 among neighbours at 1.38-1.5, its own 1.14)
 * (the page fill's states, `box`: slotsAt stops its last frame's slots there, so that the lines a frame holds still fall with
 * the leading and the fill's search is monotone). Where the original leaves that much or more (a heading's room, nothing under
 * it in its column) nothing changes. Null where nothing is asked: at the original's pitch or
 * closer (the alphabets: nothing moves), a last line it shares with ink that stays (`foot` false: a unit begins on it), a
 * last frame of one line (no room to give), no line under it
 */
function footFloorAt(blocks, st, P, s) {
  const e = P.halfLead
  if (!e?.foot || !blocks.length) return null
  return floorOver(blocks.at(-1), e.below, st.lead, st, s)
}
/** the floor of block `b`'s last line at leading L, the original's next line of its column `below` under its last baseline: the
 *  gap under a paragraph at its own leading (footFloorAt), or null */
function floorOver(b, below, L, st, s) {
  if (!(L > 1 + 1e-9) || !Number.isFinite(below)) return null
  const low = lowOf(b, st, s)
  if (!(b.B[0] - low > 0.05)) return null
  // (and the original's own skip at that boundary, its room past its pitch, capped at a pitch as the gate's measure caps
  // it, measure.mjs paraGapsOf: a NeurIPS \parskip of 5.5 pt under 11 is kept over the leading, where without it a gap of a
  // pitch and a skip equalled a leading of 1.5 and the paragraphs ran together)
  const p0 = b.pitch0 ?? 1.2 * s, skip = Math.min(Math.max(0, below - p0), p0)
  let floor = b.B.at(-1) - below + L * p0 + skip
  // (a state that borrows room under it, TeX's (Room.runs, Room.sep): the gap measured from the borrow's limit, its foot,
  // which stands TeX's separation over the next ink; at its own leading that much higher, the original's skip past the
  // separation (a list's \itemsep, flush bottom's stretch) the borrow's. Lab option (i) of 2026-11-09, shown to the owner alone and with (iii):
  // 1810.04805v2's references that need every line of theirs stood at the original's pitch among entries spread to 1.38)
  if (b.B.at(-1) - low > 1e-9) floor = Math.min(floor, low + (L - 1) * p0)
  return floor > low + 1e-9 ? floor : null
}
/**
 * The same floor under each paragraph TeX states inside the unit (the owner's ruling of 2026-11-08, (a): the gap under a
 * paragraph follows its own leading, a paragraph's that ends a unit or one that ends inside it): a block whose next block opens
 * a paragraph (`opens`: SpanAt.opens, El.opens) in its column, the original's next line that paragraph's first, its leading
 * the block's own (`leads`, the page fill's: each paragraph filled at its own). 2608.25210v2 p3's prompt boxes: an item's
 * run-in text, then its prompt in a frame; a first paragraph filled to its block's foot stood a pitch of the original over the
 * second, its own lines half again as far apart. Null where nothing is asked
 */
function paraFloorAt(blocks, bi, st, s) {
  const b = blocks[bi], n = blocks[bi + 1]
  if (!n?.opens || n.page !== b.page || !(Math.min(b.x1, n.x1) > Math.max(b.x0, n.x0))) return null
  return floorOver(b, b.B.at(-1) - n.B[0], st.leads?.[bi] ?? st.lead, st, s)
}
/** footFloorAt for the fill leadings' guesses of a closer leading (run.mjs guessCloser): the floor a state asks, or null */
export const footFloorOf = (blocks, st, P, s) => footFloorAt(blocks, st, P, s)
/** of a line's size: a display whose top stands under its baseline nearer than this is in reach of its descent (TeX's
 *  \abovedisplayshortskip, nothing but stretch, sets one that near; its \abovedisplayskip does not) */
export const SHORT_SKIP = 0.3
/** of a line's size: how far before a display TeX's short skip asks the line over it to end (\predisplaysize, the line's
 *  width and 2 em) */
export const PREDISPLAY = 2
/** how near a formula's baseline is to a line's of the file for it to stand on that line (PDF units): both are written to a
 *  hundredth */
const ON_LINE = 0.05
/**
 * The distance TeX set between the line of the original a formula `r` (a crop) stands on and the line after it (`below`, the
 * crop on the upper line of a pair) or before it, on the unit's grid (its blocks' `G`, the forced breaks' room closed): TeX's
 * own \lineskip rule for that formula, read from its baselines (breakLines' settle). The line is the one the formula stands
 * on: on the crop's page and baseline, its rectangle holding the crop's centre, never a line of another block merely across
 * it (a unit's two blocks side by side have lines at one baseline each, and a block's span is its widest line's: the review
 * of #496), nor the other half of a line its rectangles cut in two. -Infinity where the unit's blocks hold no line of the
 * original under the crop, or none past it on that side
 */
export function texRoomOf(blocks, r, below) {
  const cx = (r.crop[0] + r.crop[2]) / 2
  for (const b of blocks ?? []) {
    if (b.page !== r.page) continue
    const j = b.B.findIndex((y, i) => Math.abs(y - r.baseline) <= ON_LINE && b.rects[i][1] <= cx && cx <= b.rects[i][3])
    if (j < 0) continue
    const G = b.G ?? b.B, k = below ? j + 1 : j - 1
    return k >= 0 && k < G.length ? Math.abs(G[j] - G[k]) : -Infinity
  }
  return -Infinity
}
/**
 * The measure TeX set at baseline `y` for a line a unit flows on from the unit before over the rows that unit's translation
 * left, down to the shared row (`flowX`, run.mjs layout2: the row's baseline and the unit before's block that holds it): the
 * unit before's at the rows it had, the shared row both units' (the row's start the one's, its end the other's, each its own
 * measure there), between two rows the narrower of both (measureOn). Never a block's outer bounds where TeX changed its measure:
 * those take in rows further down, beside which another measure stood (a wrapfigure beside the rows around the shared row,
 * wider rows under it: the review of #595). 2608.16117v1 p19's u59, its first block the shared row's remainder alone beside
 * Figure 9, flows on at the paragraph's full measure, the unit before's rows'
 */
function flowMeasureAt(b, y) {
  const { y: row, lead } = b.flowX
  const j = lead.B.findIndex(v => Math.abs(v - row) < 0.05)
  const a = measureOf(lead, row, j), c = measureOf(b, row, 0), shared = [Math.min(a[0], c[0]), Math.max(a[1], c[1])]
  return measureOn((lead.G ?? lead.B).slice(0, j + 1), i => (i < j ? measureOf(lead, y, i) : shared), y)
}
/** the slots (lines) a unit's blocks hold at a state: each { block, page, x0, x1, baseline, target, centred }. The pitch is
 *  the original's times the leading, whatever the size (D6's F6a, 2026-10-08: a Latin line shrunk with its size sat on none
 *  of the original's baselines and its unit ended a fraction of a line short, the blank added to the gap below it; every
 *  script's lines now stay on the original's baselines while the size shrinks, as CJK's did) */
function slotsAt(blocks, st, P, s) {
  const out = []
  // (each block's foot, the lowest a line of it is laid at: its last baseline less what it borrows; a line TeX's rule moves
  // down may go on past it into the next block of its flow where blocks2 found nothing kept between them, `through`, to
  // the foot of the last block it so runs into, `foot`; the page fill's states (`box`) the unit's last frame's no lower than
  // a leading over the next line of its column, footFloorAt)
  const lows = blocks.map(b => lowOf(b, st, s))
  const floor = st.box ? footFloorAt(blocks, st, P, s) : null
  if (floor !== null) lows[lows.length - 1] = floor
  // (and under each paragraph TeX states inside the unit, at its own leading: paraFloorAt)
  if (st.box)
    for (let bi = 0; bi + 1 < blocks.length; bi++) {
      const f = paraFloorAt(blocks, bi, st, s)
      if (f !== null) lows[bi] = f
    }
  const feet = lows.slice()
  for (let bi = blocks.length - 2; bi >= 0; bi--) if (blocks[bi].through) feet[bi] = feet[bi + 1]
  // (a run's blocks are laid alone, layoutRuns: the unit's first line is the first block's of the unit, P.blockBase the run's
  // first block's place in it)
  const base = P.blockBase ?? 0
  for (const [bi, b] of blocks.entries()) {
    const p0 = b.pitch0 ?? 1.2 * s
    // (a block of a frame before the unit's last filled at a leading of its own, `leads` (S.fill.leads: each frame of a paragraph
    // over a page or column break filled over its own block); the unit's last frame's the state's)
    const lead = st.leads?.[bi] ?? st.lead
    const pitch = p0 * lead
    const onGrid = Math.abs(lead - 1) < 1e-6
    const low = lows[bi]
    const firstBlock = bi + base === 0
    // (on the original's pitch, its grid: its forced breaks' gaps closed, blocks2, the foot B's own; and its gaps TeX's
    // \lineskip rule opened closed to the pitch, blocks2's `E`)
    const G = onGrid && b.E ? b.E : b.G ?? b.B
    for (let k = 0; k < 400; k++) {
      // (the first line on a shared row stands on the baseline the line before it there was laid at, `startY`, where that is
      // not TeX's (run.mjs layout2, shareOf's `at`): the row's line, its measure the row's, whatever the block's foot)
      const shared = firstBlock && k === 0 && b.startY !== undefined
      // (where that line is the last of the unit before, its translation ended above TeX's shared row (`onLead`, shareOf's
      // `above`): the unit's lines flow on from it at its own pitch, as one paragraph read on; one that leaves no room there
      // has its first line a pitch under it)
      const flows = firstBlock && b.onLead && k > 0
      let y = shared ? b.startY : flows ? b.startY - k * pitch : onGrid ? (k < G.length ? G[k] : G.at(-1) - (k - G.length + 1) * pitch) : b.B[0] - k * pitch
      // (the page fill's states, `head`: the unit's first block lower by the room the gap over it lacks, where the paragraph over
      // it cannot end higher (S.fill.page headOf: its last line alone on its frame's first line, TeX's widow), its foot its own)
      if (st.head && firstBlock && !shared && b.startY === undefined) y -= st.head
      // never two lines closer than 0.7 of the pitch (a baseline the text layer could not tell)
      if (out.length && out.at(-1).block === bi && y > out.at(-1).baseline - 0.7 * pitch) y = out.at(-1).baseline - pitch
      if (y < low - 0.05 && !shared) break
      const target = k === 0 || (onGrid && !flows && k < b.B.length) ? k : null
      // (each slot the measure of the line it is laid at, where the paragraph's changed: measuresOf; the block's grid, its
      // pitch and its flow its own across the change, one paragraph's)
      // (a line flowed on from the unit before over the rows its translation left, the shared row included, `flowX` (run.mjs
      // layout2): the measure TeX set at its height, the two units' rows' around the row (flowMeasureAt); under it, the unit's
      // own rows')
      const [mx0, mx1] = flows && b.flowX && y >= b.flowX.y - 0.05 ? flowMeasureAt(b, y) : measureOf(b, y, (onGrid || shared) && !flows && k < G.length ? k : -1)
      // (the first line's start: the block's indent, or where a shared line leaves it, `start`, run.mjs layout2)
      // (and a block a forced break's region opens, `opens` (blocksOf2): its first line TeX's paragraph's, at its indent)
      let x0 = firstBlock && k === 0 && b.start !== undefined ? b.start : (firstBlock || b.opens) && k === 0 && !b.centred ? b.x0 + b.indent : mx0
      // (a label TeX hung beside the block's text (`hang`, lay/adapt.ts): the first line starts at the label, its text where TeX's
      // hang ends, `tab`, the block's start (breakLines))
      let tab
      if (firstBlock && k === 0 && b.start === undefined && b.hang !== undefined && !b.centred && b.hang < x0) {
        tab = x0
        x0 = b.hang
      }
      // (a line laid over a display TeX set with its short skip, `shortSkips` (tex.mjs shortSkipsOf: under a line of the unit
      // that ends 2 em before it), whose top stands under its baseline in reach of its descent: it ends 2 em before the display,
      // as TeX's own test asks of the line before a display set so, and what no longer fits is the fit's. 2608.16117 page 23,
      // unit 76: German's last line ran on over the matrix TeX set 1.1 pt under its short line)
      const em = s * st.scale
      let x1 = mx1
      for (const d of b.shortSkips ?? []) if (d.top < y && d.top > y - SHORT_SKIP * em && Math.min(x1, d.x1) > Math.max(x0, d.x0)) x1 = Math.min(x1, d.x0 - PREDISPLAY * em)
      // (ink that stays beside the original's lines, no member's (`stays`, Room.stays: amsthm's QED box after a proof's last
      // words, four rules TeX set at the measure's end): a line whose reach meets it, from its descent's (SHORT_SKIP, as a
      // display's top above) to its em over its baseline (no text glyph rises past its body), ends before it, or, where it stood
      // before the original's line, starts after it, as far off it as TeX set that line (`gap`: 2610.20484v1 p1 t6's start 1.49
      // pt after an initial) and half an em at most, as the line widened beside a glyph keeps (U.decor widen; a QED box TeX's
      // \hfill set 101 pt off). Borrowed or not: a ragged last line missed it by its shortness alone, and a line borrowed under it
      // made the row full (2610.40645v1-ja p12 t80)
      for (const k of b.stays ?? []) {
        if (!(k.y0 < y + em && k.y1 > y - SHORT_SKIP * em)) continue
        const gap = Math.min(0.5 * em, k.gap)
        if (k.right) x1 = Math.min(x1, k.x0 - gap)
        else x0 = Math.max(x0, k.x1 + gap)
      }
      // a sliver beside a formula (narrower than 1.5 em) holds no text: its words were the formula's
      if (x1 - x0 < 1.5 * s * st.scale) continue
      const slot = { block: bi, page: b.page, x0, x1, baseline: y, target, centred: b.centred, pitch, after: b.after ?? 0, foot: feet[bi], flow: b.flow ?? bi }
      if (tab !== undefined) slot.tab = tab
      // (a unit TeX set flush left or flush right, run.mjs: placeItems sets its lines by it)
      if (b.flush) slot.flush = b.flush
      out.push(slot)
    }
    // (a line on a shared row whose rest stays another's, `stop` (run.mjs keptAfter): of the block's slots within an em of its
    // baseline, the nearest ends where TeX ended the unit's text there; one that leaves too narrow for text gives way, as a
    // sliver does, and the next nearest takes the stop. One slot alone: on rows closer than an em, the row before the shared
    // one is no line of it; and where the row is the block's foot, with no slot on it, the slot nearest it may stand over its
    // baseline by more than half a pitch, within an em, its text over what stays there)
    if (b.stop) {
      const d = sl => Math.abs(sl.baseline - b.stop.y)
      const near = out.filter(sl => sl.block === bi && d(sl) < b.stop.band).sort((p, q) => d(p) - d(q))
      for (const sl of near) {
        sl.x1 = Math.min(sl.x1, b.stop.x1)
        if (sl.x1 - sl.x0 >= 1.5 * s * st.scale) break
        out.splice(out.indexOf(sl), 1)
      }
    }
  }
  return out
}

export { inFlow, slotsAt }
