// B.place (design-b §1.5, G1): each line's items placed (justified within the caps, ragged, centred, flush), and a fit's
// breaking made a layout (laidOut). Today's code (layer2.mjs L2:3976-4038, L2:4136-4157), moved by
// lab/typeset/move-fit.mjs.
import { gapsOf, hangOf, inWord, latinishOf, lineExtent, squeezable, tabOf } from './break.ts'
import { inFlow, slotsAt } from './slots.ts'
import { toLastLines } from '../fit/last-lines.ts'
import { toStand } from '../fit/stand.ts'
import type { FitBlock, FitParams, FitState, LaidLine, Layout } from '../fit/types.ts'
import type { Broken } from './break.ts'
import type { Token } from './tokens.ts'

/** the unit's end mark's distances (Token.endMark) */
type EndMark = NonNullable<Token['endMark']>

/** each line's items placed: justified where the slack is within the caps (CJK per gap, but none inside a word: gapsOf,
 *  spaces per space), else left aligned; the unit's last line left aligned, and so a line TeX's own break ends (breakLines' `ends`: the part of a
 *  paragraph before a display, which TeX ends with \parfillskip, and a forced break, \\'s \hfil\break), its spacing the
 *  fit's state (its tracking), never spread to the edge; a centred block centred. `scale`: the fit's, the size drawn over the
 *  original's */
function placeItems(lines: LaidLine[], f: number, P: FitParams, scale: number): void {
  const last = lines.at(-1)
  for (const line of lines) {
    // (the unit's end mark at the end of its line, Token.endMark (breakLines): set at its place, as far from the line's right edge as
    // TeX set it, at the fit's scale as its crop is drawn (its rectangle's margin past the ink with it: §18.87); the text before it
    // in the room it leaves, the keep-off distance before its ink)
    const mark = line.items.at(-1)?.t.endMark ? line.items.pop() : null
    const pad = mark ? (mark.t.endMark as EndMark).pad * scale : 0
    const full = line.x1 - line.x0
    const cap =
      mark && line.items.length ? full - pad - mark.w - Math.min(0.5 * f, (mark.t.endMark as EndMark).gap) : full
    const natural = line.items.reduce((s, it) => s + it.w + (it.asp ?? 0) + (it.kern ?? 0), 0)
    // a closing mark at the line's end may stand in the margin by its blank half (hangOf)
    const end = line.items.at(-1)
    const hang = hangOf(end, P._compress as number) * f
    let slack = cap - natural + hang
    // (a label TeX hung beside the text, its room up to the hang's end: a box, no slack before the text's first item, tabOf)
    const kt = tabOf(line.items)
    const spaces = line.items.filter((it, n) => it.t.space && n > kt)
    const spW = spaces.reduce((s, it) => s + it.w, 0)
    const latinish = latinishOf(line.items, P)
    let perSpace = 0,
      perGap = 0
    line.mode = line.centred ? 'centred' : line === last || line.ends ? 'last' : 'just'
    // (a line of a unit TeX set flush left is ragged at its natural spacing, every line of one set flush right stands at the
    // right edge, its last too: \raggedleft sets no \parfillskip past it; lane B's B2, run.mjs)
    if (line.flush === 'left' && line.mode === 'just') line.mode = 'ragged'
    else if (line.flush === 'right') line.mode = 'right'
    // a line squeezed to take its last group (breakLines' squeezeTakes): its marks' blank halves first, as many as it needs,
    // then its word spaces down to spaceMin, then each gap by what is left, which breakLines kept within SQUEEZE em; a mark's
    // half more than it needed is spread as any line's slack
    if (line.squeezed && slack < 0 && !latinish && line.items.length > 1) {
      for (const it of squeezable(line.items, hang > 0, P._compress as number, P)) {
        if (slack >= 0) break
        it.w -= 0.5 * f
        if (it.t.punct === 'open') it.shift = (it.shift ?? 0) - 0.5 * f
        it.cut = true
        slack += 0.5 * f
      }
      if (slack < 0) {
        const by = Math.max(slack, -spW * (1 - P.spaceMin))
        if (spaces.length) perSpace = by / spaces.length
        const gaps = gapsOf(line.items)
        if (gaps > 0) perGap = (slack - (spaces.length ? by : 0)) / gaps
        slack = 0
      }
    }
    if (slack < 0 && spaces.length)
      perSpace = slack / spaces.length // shrunk spaces (never past spaceMin by the breaking)
    else if (line.mode === 'just' && slack > 0) {
      if (latinish) {
        const per = slack / spaces.length
        if (per <= P.spaceMax * (spW / spaces.length)) perSpace = per
        else line.mode = 'ragged'
      } else {
        const gaps = gapsOf(line.items)
        if (gaps > 0 && slack / gaps <= P.cjkJust * f) perGap = slack / gaps
        else if (gaps > 0) line.mode = 'ragged'
      }
    }
    if (line.mode === 'last' && slack < 0 && !spaces.length) slack = 0
    let x = line.x0 + (line.centred ? Math.max(0, slack) / 2 : line.mode === 'right' ? Math.max(0, slack) : 0)
    line.items.forEach((it, n) => {
      x += it.asp ?? 0
      it.x = x + (it.shift ?? 0)
      x +=
        it.w +
        (it.kern ?? 0) +
        (it.t.space && n > kt ? perSpace : 0) +
        (n < line.items.length - 1 && !inWord(line.items[n + 1]!) && n + 1 > kt ? perGap : 0)
    })
    line.used = x - line.x0
    line.cap = cap
    if (mark) {
      mark.x = line.x1 - pad - mark.w
      line.items.push(mark)
      line.used = mark.x + mark.w - line.x0
      line.cap = full
    }
  }
}
/** a table cell's lines as TeX set them in its box (FitBlock.box, lay/adapt.ts; docs/PDF-READER.md §18.75): the box as wide as
 *  its widest laid line, set in the cell's room (each line's slot) by the cell's class, each line in the box by its own; a line's
 *  items moved together, their spacing as placed. One box over every boxed line of the member, whichever block it is in (a
 *  forced break whose next line opens a region of its own sets its lines in two blocks, the cell's one box). A line's extent its
 *  ink's, as placeItems centres a single line: a closing mark that ends it stands in the margin by its blank half (hangOf) */
function boxLines(lines: LaidLine[], blocks: readonly FitBlock[], f: number, P: FitParams): void {
  const ls = lines.filter((l) => blocks[l.block]?.box && l.items.length)
  if (!ls.length) return
  const { cls, inner } = blocks[ls[0]!.block]!.box!
  const span = (l: LaidLine) => {
    const a = l.items[0]!,
      z = l.items.at(-1)!
    return [a.x as number, (z.x as number) + z.w - hangOf(z, P._compress as number) * f] as const
  }
  const W = Math.max(...ls.map((l) => span(l)[1] - span(l)[0]))
  for (const l of ls) {
    const room = l.x1 - l.x0
    const box0 = l.x0 + (cls === 'c' ? (room - W) / 2 : cls === 'r' ? room - W : 0)
    const [a, z] = span(l)
    const at = box0 + (inner === 'c' ? (W - (z - a)) / 2 : inner === 'r' ? W - (z - a) : 0)
    const dx = at - a
    if (Math.abs(dx) < 1e-9) continue
    for (const it of l.items) it.x = (it.x as number) + dx
    l.used = (l.used ?? 0) + dx
  }
}
/** a fit's breaking at its state made a layout: its lines placed, and what it set and lost counted; the lines TeX's rule
 *  opened (`opened`), and with no values for it (P.lineskip none) the lines that come nearer the one before them in their
 *  block than nothing, its foot over their top, and stay so (`unopened`: what the rule would have opened) */
function laidOut(
  { r, st, f }: { r: Broken; st: FitState; f: number },
  s: number,
  P: FitParams,
  tried: number,
  blocks: readonly FitBlock[],
): Layout {
  const clipped = r.rest < r.total
  P._compress = st.compress
  if (P.lastLines && !clipped)
    toLastLines(r.lines, blocks, P.halfLead?.below, f, () => slotsAt(blocks, { ...st, lead: 1, box: undefined }, P, s))
  // (a cell of an m or a b column stood in its row where TeX stands it, X.stand: every layout the fit and the page fill make
  // passes here before it is settled into its bands, §18.92)
  if (P.stand && !clipped) toStand(r.lines, blocks, P.stand)
  placeItems(r.lines, f, P, st.scale)
  boxLines(r.lines, blocks, f, P)
  const count = (t: Token) => (t.s ? [...t.s].length : t.crop ? 1 : 0)
  const allChars = r.tokens.reduce((a, t) => a + count(t), 0)
  const drawn = r.lines.reduce((a, l) => a + l.items.reduce((b, it) => b + count(it.t), 0), 0)
  let unopened = 0
  if (!P.lineskip)
    for (let i = 1; i < r.lines.length; i++) {
      const a = r.lines[i - 1]!,
        b = r.lines[i]!
      if (!inFlow(a, b) || !(a.baseline > b.baseline)) continue
      if (a.baseline - lineExtent(a, f, st.scale, P.measure).d < b.baseline + lineExtent(b, f, st.scale, P.measure).a)
        unopened++
    }
  // (`fitTrack`: the tracking the fit set the unit at, which a state made from this one keeps (run.mjs fillPage's): a line
  // squeezes at no tracking above it, breakLines' squeezes)
  const state = st.fitTrack === undefined ? { ...st, fitTrack: st.track } : st
  return {
    lines: r.lines,
    f,
    s,
    scale: st.scale,
    state,
    knob: clipped ? 'clip' : st.knob,
    clipped,
    lostChars: Math.max(0, allChars - drawn),
    chars: allChars,
    tried,
    spilled: !!r.spilled,
    opened: r.lines.filter((l) => (l.opened as number) > 0).length,
    unopened,
  }
}

export { laidOut }
