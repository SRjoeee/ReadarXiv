// X.runs (design-b §1.5, T6, T32, E28; the ruling of 2026-10-09: sizes per unit): a unit's runs between its displays,
// each laid as its own text block, joined as one layout; and whether a layout keeps the pages its fit set its lines on.
// Today's code (layer2.mjs L2:4163-4257, L2:4379-4400), moved by lab/typeset/move-fit.mjs; typed by runs.types.ts.
import { textless } from '../breaker/cuts.mjs'
import { layoutUnit2 } from './walk.mjs'

/**
 * A unit's runs between its kept regions (a display, `blockTo`): the text between two regions is set on the slots between
 * them alone (breakLines: slots of its `after`), so each run is a text block of its own. Each run: its blocks (those of one
 * `after`, consecutive from the unit's block `bi0`) and its tokens (the region's breaks that open it first; a region with no
 * text after it before the next breaks with the run after it, or, at the unit's end, with the run before it). Null where the
 * unit is one run, where a run with text has no slots of its own or a block no run's text (the walk's own rules then place
 * it), or where the blocks are not in the order of their regions
 */
export function runsOf(tokens, blocks) {
  if (blocks.length < 2) return null
  // (a run opens at a display alone: a forced break that opens another frame (tokensOf2's `brk`) breaks the line, and its
  // frames stay the run's, as the unit's own walk sets them. Each token kept with its place in the unit's (`idx`))
  const by = new Map()
  let consumed = 0, key = 0
  tokens.forEach((t, i) => {
    if (t.blockTo !== undefined) {
      consumed = Math.max(consumed, t.blockTo + 1)
      if (!t.brk) key = consumed
    }
    ;(by.get(key) ?? by.set(key, []).get(key)).push([t, i])
  })
  // (a run that sets nothing goes with the next one, or the last one at the end)
  const keys = [...by.keys()].sort((a, b) => a - b), runs = []
  let carry = []
  for (const k of keys) {
    const ts = [...carry, ...by.get(k)]
    carry = []
    if (!ts.some(([t]) => !textless(t))) { carry = ts; continue }
    runs.push({ after: k, tokens: ts.map(x => x[0]), idx: ts.map(x => x[1]) })
  }
  if (carry.length && runs.length) { runs.at(-1).tokens.push(...carry.map(x => x[0])); runs.at(-1).idx.push(...carry.map(x => x[1])) }
  if (runs.length < 2) return null
  // (the display after a run ends its last line, TeX's \parfillskip before it: ragged, as the unit's own walk ends it there,
  // breakLines; a forced break of no room ends it so where the run is laid alone)
  for (const r of runs.slice(0, -1)) r.tokens.push({ newline: -1, room: 0, w100: 0 })
  let at = 0
  for (const [i, r] of runs.entries()) {
    const bi0 = at, upto = runs[i + 1]?.after ?? Infinity
    if (at < blocks.length && (blocks[at].after ?? 0) !== r.after) return null
    while (at < blocks.length && (blocks[at].after ?? 0) < upto) at++
    if (at === bi0) return null
    r.bi0 = bi0
    r.blocks = blocks.slice(bi0, at)
  }
  return at === blocks.length ? runs : null
}
/** a run's parameters (layoutRuns): its first block's place in the unit (slotsAt's first line), and the gap under the paragraph
 *  (P.halfLead, footFloorAt) and a heading's last lines the unit's last run's alone */
export const runParams = (P, run, last) => ({ ...P, blockBase: run.bi0, lastLines: false, ...(last ? {} : { halfLead: null }) })
/**
 * A unit's runs (runsOf) laid each at its own state: the first of the fit's states at which its own text fits its own slots,
 * so that only a cramped run shrinks, its leading its own too (the owner's ruling of 2026-10-09, sizes per unit, carried to
 * its natural unit: a block between two displays reads as its own text block). Every run fits at the state the unit fitted
 * at (the unit's walk sets each run on its own slots), so each comes out at that state or a more natural one. One tracking
 * a paragraph: the walk tightens a run's tracking (and its CJK punctuation's compression) before it shrinks it, so a cramped
 * run is set tighter than a roomy one, and a paragraph's parts would read at two letter spacings, its roomy part's last line
 * looser than its own paragraph's tightest lines (the sweep's (j)); each run is laid again from the tightest tracking any of
 * them needs (P.runTrack), its own size and leading still its own. Null where the unit is one run or a run does not fit alone; else { layout: joinRuns', runs: each with its blocks,
 * tokens, `bi0`, `P` and `layout` }
 */
export function layoutRuns(tokens, blocks, s, P, fit = null) {
  const runs = runsOf(tokens, blocks)
  if (!runs) return null
  for (const [i, r] of runs.entries()) {
    r.P = runParams(P, r, i === runs.length - 1)
    r.layout = layoutUnit2(r.tokens, r.blocks, s, r.P)
    if (r.layout.clipped) return null
  }
  const trackOf = st => (P.cjk ? st.track : st.trackLatin)
  const tight = runs.reduce((a, r) => (trackOf(r.layout.state) < trackOf(a.layout.state) - 1e-9 || (trackOf(r.layout.state) <= trackOf(a.layout.state) + 1e-9 && r.layout.state.compress > a.layout.state.compress) ? r : a)).layout.state
  const R = { track: tight.track, trackLatin: tight.trackLatin, compress: tight.compress }
  for (const r of runs) {
    const st = r.layout.state
    if (Math.abs(trackOf(st) - trackOf(R)) < 1e-9 && st.compress === R.compress) continue
    r.P = { ...r.P, runTrack: R }
    r.layout = layoutUnit2(r.tokens, r.blocks, s, r.P)
    if (r.layout.clipped) return null
  }
  // (no run sets a token on a later page than the unit's fit did (`fit`, its lines; keepsPages): a run set larger holds
  // fewer lines on a page's frame, and the page cuts keep text only from the page before. Where one would, the unit is laid
  // as one)
  if (fit && !runs.every(r => keepsPages(fit, r.layout.lines.map(l => ({ from: r.idx[l.from] ?? r.idx.at(-1), page: l.page })), tokens))) return null
  return { layout: joinRuns(runs), runs }
}
/**
 * The runs' layouts as the unit's one layout: their lines in order, each line's block its place in the unit's blocks, and each
 * with its run's size, scale and state (`seg`: what the drawing, the word table and the links read a line by, where it is
 * there); the layout's own fields the first run's, its counts summed. The runs' own layouts are not changed
 */
export function joinRuns(runs) {
  const first = runs[0].layout
  const lines = runs.flatMap(r => { const seg = { f: r.layout.f, scale: r.layout.scale, state: r.layout.state }; return r.layout.lines.map(l => ({ ...l, block: l.block + r.bi0, seg })) })
  const sum = k => runs.reduce((a, r) => a + (r.layout[k] ?? 0), 0)
  return { ...first, lines, clipped: false, lostChars: sum('lostChars'), chars: sum('chars'), tried: sum('tried'), spilled: runs.some(r => r.layout.spilled), opened: sum('opened'), unopened: sum('unopened'), runs: runs.length }
}
/**
 * Whether `lines` set no token on a later page than the fit's lines (`fit`) set it, read by each line's first token (`from`):
 * the page fill spreads a unit's lines over its frames, and a looser leading holds fewer of them on a page's frame, so it can
 * carry text the source sets on one page over to the next, which the page cuts (pageCutsOf) only keep from the page before.
 * 2610.21884v1's unit 10 in Chinese, a paragraph over pages 1 and 2: its last run filled to 1.61 set a sentence of page 1 at
 * the top of page 2 (the sweep's (i)). Read for a unit's runs (run.mjs fillPage, fillLeadsOf): a unit of one run is filled as
 * before, byte for byte, though the same can befall it (34 pages of 19 Chinese papers move where it is read for every unit;
 * left to its own change). A line after a page break of the source's (`tokens`, the lines' own: withPageBreaks' token) may
 * stand on the break's page: its text is that page's in the source, and the line that holds the break ends where the
 * breaker ends it, sooner at a looser state (breakLines), so that the tail of that line goes on to the page it belongs to
 */
export function keepsPages(fit, lines, tokens = null) {
  const breaks = []
  tokens?.forEach((t, i) => { if (t.pageBreak !== undefined) breaks.push([i, t.pageBreak]) })
  const sent = from => breaks.reduce((pg, [i, b]) => (i < from ? Math.max(pg, b) : pg), -Infinity)
  let j = 0
  for (const l of lines) {
    while (j + 1 < fit.length && fit[j + 1].from <= l.from) j++
    if (fit[j] && l.page > fit[j].page && !(l.page <= sent(l.from))) return false
  }
  return true
}

