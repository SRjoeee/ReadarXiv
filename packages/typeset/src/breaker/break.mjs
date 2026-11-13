// B.break (design-b §1.5, T22): a unit's tokens broken into the slots of a state, TeX's \lineskip rule settled between
// lines, a word cut or hyphenated where it must be, a CJK line squeezed to take its group. Today's code (layer2.mjs
// L2:3283-3893, graphemesOf L2:316-317, headOfCut L2:2431-2436), moved by lab/typeset/move-fit.mjs; typed by
// break.types.ts. Its measures are the call's (`P.measure`, `m`), its patterns `P.patterns`.
import { textless } from './cuts.ts'
import { breakPoints } from './hyph.ts'
import { keptPair, kinsokuOf, noStart } from './script.ts'
import { inFlow, texRoomOf } from './slots.ts'

const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' })
/** a text's graphemes, each a string: what a reader sees as one character */
const graphemesOf = t => Array.from(GRAPHEMES.segment(t), g => g.segment)
/**
 * Whether a placeholder of phClass2's 'symbol' (no Latin letter or digit in its rendering) is a text symbol, the one
 * kind the file's crops exempt (tex.mjs cropsOf): its drawn text one grapheme (\%, \_, $\times$, $^\dagger$), and a formula's
/** a token cut in two by the breaker, its head: no kern of its own (the kern stays after the word's tail) */
const headOfCut = (t, extra) => {
  if (!t.kernW) return { ...t, ...extra }
  const { kernW: _w, kernEnd: _end, ...rest } = t
  return { ...rest, ...extra }
}
/**
 * A crop's own extent over its baseline (`up`) and under it (`down`), PDF units at the original's scale: the segment's box
 * where the crop was cut from one (`gap.box`, the ink TeX set, cropOfBox), never the rectangle drawn, whose antialias
 * margin is the drawing's and no part of TeX's box. A crop with no segment (v0 alone, which opens no line and only
 * counts what it would have) takes its rectangle
 */
function cropExtent(r) {
  const b = r.gap?.box
  return b?.top !== undefined ? { up: b.top - b.baseline, down: b.baseline - b.bottom } : { up: r.crop[3] - r.baseline, down: r.baseline - r.crop[1] }
}
/**
 * A laid line's extent over its baseline (`a`) and under it (`d`), PDF units, at its drawn size `f` and the layout's
 * `scale`: its text's ink (ink100, the drawn glyphs' own; a superscript at 0.62 of the size raised 0.36 em, small capitals the
 * layer draws at their share, `sc`, as svgOfUnit sets them) and each crop's, over and under its TeX baseline, drawn at the scale
 * (cropOfBox). `text`: its text's alone
 */
export function lineExtent(line, f, scale, m) {
  let a = 0, d = 0, ta = 0, td = 0
  for (const it of line.items) {
    const t = it.t
    if (t.crop) { const e = cropExtent(t.crop); a = Math.max(a, e.up * scale); d = Math.max(d, e.down * scale); continue }
    if (!t.s || t.space || !t.face) continue
    const ink = m.ink100(t.s, t.face), k = (t.sup ? 0.62 : 1) * (t.sc ?? 1), up = t.sup ? 0.36 * f : 0
    ta = Math.max(ta, up + (ink.a * k * f) / 100)
    td = Math.max(td, (ink.d * k * f) / 100 - up)
  }
  return { a: Math.max(a, ta), d: Math.max(d, td), text: { a: ta, d: td } }
}
/**
 * A URL's crop cut at the last of its break points (El.breaks: where TeX's url package may break it, the x between two of its
 * glyphs on the page and the UTF-16 code units of its copy text before it) whose head is no wider than `room` at the layout's
 * scale: the head, its crop up to the cut and its text the copy text before it, and the tail, from the cut, the break points
 * after it its own; null where none fits (`least`: the first, where nothing of the line holds anything yet)
 */
const urlCut = (t, room, scale, least) => {
  const c = t.crop, rect = c.crop, text = c.text ?? ''
  let at = null
  for (const b of c.breaks) if ((b[0] - rect[0]) * scale <= room + 0.01 || (least && at === null)) at = b
  if (!at || at[0] <= rect[0] || at[0] >= rect[2]) return null
  // (`cut`: its edges cut between two glyphs, 1 its left, 2 its right, which the reader draws with no antialiased margin)
  const head = { ...c, crop: [rect[0], rect[1], at[0], rect[3]], text: text.slice(0, at[1]), breaks: undefined, cut: ((c.cut ?? 0) & 1) | 2 }
  const rest = c.breaks.filter(b => b[0] > at[0]).map(b => [b[0], b[1] - at[1]])
  const tail = { ...c, crop: [at[0], rect[1], rect[2], rect[3]], text: text.slice(at[1]), breaks: rest.length ? rest : undefined, cut: ((c.cut ?? 0) & 2) | 1 }
  // (`of`: the token cut, the whole URL each part is of, which the gate's I4 reads as drawn once where its parts tile it)
  const of = t.of ?? t
  return { head: headOfCut(t, { crop: head, cw: at[0] - rect[0], of }), tail: { ...t, crop: tail, cw: rect[2] - at[0], glue: false, asp: false, of } }
}
/** the explicit glue after a token at size f (tokensOf2 kernOn's `kernW`, at 100 px), an advance its laid item holds apart from
 *  its width (`kern`) */
const kernOf = (t, f) => ((t.kernW ?? 0) * f) / 100
/** a token's own width at size f: no kern after it (tokensOf2 kernOn's `kernW`), which its item holds apart (kernOf) */
const tokW = (t, f, st, scale) => {
  if (t.crop) return t.cw * scale
  if (t.space) return (t.w100 * f) / 100
  let w = (t.w100 * f) / 100
  if (t.cls === 'cjk') w += st.track * f * [...t.s].length
  else if (st.trackLatin) w += st.trackLatin * f * [...t.s].length
  return w
}
/**
 * The most a CJK line closes each gap between its items to take one more group (breakLines' squeeze), in em: TeX's CJKglue
 * between two CJK characters has no shrink at all, so the squeeze is kept to the least that takes a group a line misses by a
 * little. 0.02 em is the study's (2026-10-23, the (j) rows of the release route's sweep): it took 264 of the sweep's 378
 * letter-spaced lines, with half of all justified CJK lines already within 0.02 em of their natural spacing
 */
const SQUEEZE = 0.02
/**
 * The stretch a gap past which a CJK line squeezes rather than stretch (breakLines' squeezeTakes), in em: below it the
 * stretch does not read as letter-spaced (87 % of the sweep's justified CJK lines are within 0.05 em of their natural
 * spacing), and the line is set as before; the squeeze is for the lines a group left letter-spaced
 */
const STRETCH_MIN = 0.05
/** whether an item continues the word of the item before it (tokensOf2's pushText: a piece after a break point inside a word,
 *  `brk` — a URL's after its `/`, `.`, `-`, a compound's after its hyphen —, or a run of one case of a word, `cont`): the gap
 *  before it is a break point with no glue, as TeX's url package sets one (\Urlmuskip 0mu: a penalty) and as TeX sets every
 *  word, so no CJK line's slack or squeeze goes into it (placeItems, squeezeTakes). 2608.25210v2 p17: a URL whose line ends
 *  are joins (lane url-join), cut at its break points, was letter-spaced to the measure, 1.9-2.7 pt after each "/". And an
 *  element set right after the one before it, nothing between in the source or the row (`tight`, tokens.ts): one word as TeX set it
 *  (2111.09276v1 p1, two highlights of one word drawn apart by the line's slack) */
const inWord = it => !!(it.t.brk || it.t.cont || it.t.tight)
/** the index of a line's first text item set at a label's hang (`tabbed`, breakLines), -1 for none: TeX's hang is a box, so the
 *  label before it and the room up to it take no slack (placeItems) */
const tabOf = items => items.findIndex(it => it.tabbed)
/** a line's gaps that take a CJK line's slack or squeeze: those between two of its items `items` (from the n-th on, n > 0),
 *  but the ones inside a word (inWord) and those of a hung label (tabOf) */
const gapsOf = items => { const kt = tabOf(items); let n = 0; for (let k = 1; k < items.length; k++) if (!inWord(items[k]) && k > kt) n++; return n }
/** whether a line is set as Latin text, its slack in its word spaces (placeItems): it has spaces (a hung label's aside), and its
 *  script breaks only at spaces or fewer than half its items are CJK */
const latinishOf = (items, P) => { const kt = tabOf(items); return items.some((it, k) => it.t.space && k > kt) && (P.keepAll || items.filter(it => it.t.cls === 'cjk').length < items.length / 2) }
/** the marks of a line whose blank half a squeeze may take (placeItems): its marks with one as their face draws them (the
 *  tokens' `punct`, script.ts markOf: a mark whose ink crosses its em's middle has none, Harano Aji's colon and question mark,
 *  Source Han Serif TC's full stop) that have not lost it (`cut`), but the closing mark at its end where it hangs in the margin;
 *  none where the state compresses as far as the rules let it (compress 2: every mark has lost its half) or the rules compress
 *  none (compressMax 0) */
const squeezable = (items, hangs, compress, P) => (compress < P.compressMax ? items.filter((it, n) => it.t.punct && !it.cut && !(hangs && n === items.length - 1)) : [])
/**
 * A full-width mark's blank half at a line's edge, which is none of the line's ink, in em of the line's size: the half of its
 * em its face draws no ink in (a closing mark's ink in the first, an opening mark's in the second: the tokens' `punct`, the
 * face's own measure, script.ts markOf; a mark whose ink crosses the middle has none, and keeps its whole box). An
 * opening mark that opens a line loses its leading half wherever the state compresses the marks at all (compress 1 or 2: a
 * target whose rules compress none keeps it, leadOf); a closing mark that ends a line hangs its trailing half past the line's
 * edge, unless the mark has lost that half already (`cut`; at compress 2 every mark has, hangOf). So a line stands on its
 * room by its ink: every line the breaker sets, justified, centred or flush (groupOf, stretchOf, placeItems), and a figure
 * text on its anchor (S.figures)
 */
/** whether a character is a mark no line opens with: UAX 14's (no-start.mjs, the one table the layer gate's lineStartPunct reads
 *  too) or the target's rules' (P.noStart: CJK's small kana and prolonged sound mark, its closing quotes, the per cent sign) */
const noLineStart = P => {
  const kinsoku = kinsokuOf(P.noStart ?? '', P.noEnd ?? '')
  return ch => noStart(ch) || kinsoku.starts(ch)
}
const leadOf = (it, compress) => (it?.t.punct === 'open' && compress >= 1 ? 0.5 : 0)
const hangOf = (it, compress) => (it?.t.punct === 'close' && !it.cut && compress < 2 ? 0.5 : 0)
/**
 * Tokens into slots, greedily, at font size f: each line { ...slot, items: [{ t, w, shift }] } with the items' natural
 * widths (punctuation compressed as the state allows), the space a line may shrink, and `rest`, the first token left.
 * No line the breaker opens starts with a mark UAX 14 or the target's rules keep from a line's start (`barred`): such a
 * mark stays with the group before it, across a space too, unless that group with it is longer than a line by itself
 * (the break the glue alone allows), or a token cut by its characters would leave one at the head of its tail (the cut
 * moves back before it). A line TeX's own break opens (`newline`, `blockTo`) is tokensOf2's: its `dropped`.
 */
function breakLines(tokensIn, slotsIn, f, st, P, scale, strict = true, blocks = null) {
  let tokens = tokensIn
  // (a token laid in part, or loosed from the glue before it, is replaced where it stands, in the pass's own copy of the
  // tokens, made at the first such change: the caller's are read by every pass of the unit)
  const setToken = (q, t) => {
    if (tokens === tokensIn) tokens = tokensIn.slice()
    tokens[q] = t
  }
  const slots = slotsIn.slice()
  const lines = []
  let li = 0, i = 0
  const half = 0.5 * f
  // (the marks no line opens with: a character UAX 14 keeps from a line's start, no-start.mjs, the one table the layer
  // gate's lineStartPunct reads too, or one the target's rules do, P.noStart: CJK's small kana and prolonged sound mark,
  // its closing quotes, the per cent sign; `barred`, a token that opens with one)
  const barredChar = noLineStart(P)
  const barred = t => !t.space && typeof t.s === 'string' && t.s !== '' && barredChar(t.s)
  // (a word wider than its line cut by its characters, each a grapheme, what a reader sees as one character: a letter and the
  // marks over it, a flag's two regional indicators; never before a mark no line opens with, nor inside a pair UAX 14 keeps)
  const cutBarred = (chars, k) => barredChar(chars[k]) || keptPair(chars[k - 1], chars[k])
  let line = null
  // (`past`: how many of the unit's kept regions the text has passed before the line's first item, the walk's own count
  // (`consumed`, below): where the page's word table writes a region's kept lines, words.mjs, in the text's order whatever
  // slot the text after a display stands on)
  // (`slotOf`: each line's slot, which a line laid again from its first token opens on again: the page breaks' fallback, strand)
  const slotOf = new Map()
  const open = () => {
    line = { ...slots[li], items: [], x: 0, spaces: 0, from: i, past: consumed }
    lines.push(line)
    slotOf.set(line, slots[li])
  }
  // TeX's rule between two consecutive lines (its \lineskip and \lineskiplimit, P.lineskip, the paper's own: the layout
  // file's): where the line just closed comes nearer the line before it than lineskiplimit, its top to that line's foot
  // (lineExtent: the drawn text's ink and its crops'), the two baselines are set that line's depth and its height plus
  // lineskip apart. The later slots of its flow are pushed down with it, each only as far as it then comes within its
  // pitch of the slot above it (TeX's \baselineskip from the line set lower): a gap the grid holds wider than the pitch,
  // the room TeX opened in the original for a tall line of its own (a formula the translation sets on another line, the
  // gap v0 split a paragraph at), takes the push in, and the slots under it stay where they were. A slot pushed past its
  // foot (slotsAt: its block's, or its flow's through a gap of the paragraph's own) is dropped; the line itself pushed
  // past it fails the state (`over`, the first token of its line), as a unit too long for its lines does (1810.04805's
  // page 6, unit 81: the formula one line higher than in the original, the line under it opened into the room TeX had
  // opened under the formula, where v0's block ended). The line before is the last laid above it in its flow (inFlow):
  // its block; or, the blocks on TeX's lines (a layout file's), the block that follows it in the file, its first line next
  // to this one's last in the same frame with no kept region between, where v0 split a paragraph's lines in two (at a gap
  // TeX opened in the original). v0's own blocks (the anchors' rectangles of a unit the file does not locate whole, a
  // display's rows among them) are no flow: nothing says the line below is the next. A slot never moves up, nor does a
  // line: the rule only opens (a \lineskiplimit over \lineskip that would set two lines nearer is not applied). No values
  // (a file that has none, v0 alone): no line opens
  let over = null
  // (the later slots of a line's flow from slot `from` pushed down by `push`, `above` where the slot over them was: each
  // only as far as it then comes within its pitch of the slot above it; one pushed past its foot dropped, and the next
  // held to the one before it, not to the slot that is gone)
  const pushDown = (from, push, above, ref) => {
    for (let q = from; q < slots.length; q++) {
      const sl = slots[q]
      if (!inFlow(sl, ref) || !(sl.baseline < above)) continue
      const by = Math.max(0, push - Math.max(0, above - sl.baseline - sl.pitch))
      if (!(by > 0)) break
      if (sl.baseline - by < sl.foot - 0.05) { slots.splice(q, 1); q--; continue }
      slots[q] = { ...sl, baseline: sl.baseline - by }
      push = by
      above = sl.baseline
    }
  }
  // (a line's extent kept as settle reads it, by the items it held then: the line closed is the one before at the next close,
  // and it is read again only where it took or lost an item since. Items are only pushed onto a line and its spaces popped
  // off its end, so its count and its last item tell them)
  const extents = new Map()
  const extentOf = l => {
    const was = extents.get(l), n = l.items.length, last = l.items[n - 1]
    if (was && was.n === n && was.last === last) return was.e
    const e = lineExtent(l, f, scale, P.measure)
    extents.set(l, { n, last, e })
    return e
  }
  const settle = () => {
    if (!P.lineskip || !line?.items.length || over !== null) return
    let k = lines.length - 2
    while (k >= 0 && !lines[k].items.length) k--
    const prev = lines[k]
    if (!prev || !inFlow(prev, line) || !(prev.baseline > line.baseline)) return
    const [skip, limit] = P.lineskip
    const e0 = extentOf(prev), e1 = extentOf(line)
    if (prev.baseline - e0.d - (line.baseline + e1.a) >= limit) return
    // (the ink stands in for TeX's boxes, which the translation's lines have none of; but where the pair holds a formula TeX set
    // in the original, TeX measured that formula's room itself: the distance TeX left between its line and the next (a crop on
    // the upper line) or the one before (on the lower), texRoomOf. Where that distance already keeps the two lines' ink
    // \lineskiplimit apart, TeX's rule holds at it, and the pair is set no farther apart than it: the ink of a radical or an
    // ascender passes its box by a few hundredths, and the rule on the ink opened 1706.03762's Spanish unit 33 by 2.35 under the
    // fraction TeX had opened 2.26 under, its last line past its foot, the unit a size smaller)
    let dist = e0.d + e1.a + skip, tex = -Infinity
    for (const it of prev.items) if (it.t.crop) tex = Math.max(tex, texRoomOf(blocks, it.t.crop, true))
    for (const it of line.items) if (it.t.crop) tex = Math.max(tex, texRoomOf(blocks, it.t.crop, false))
    if (tex - e0.d - e1.a >= limit) dist = Math.min(dist, tex)
    const shift = dist - (prev.baseline - line.baseline)
    // (a line opens; it never moves up. Where \lineskiplimit is over \lineskip, TeX sets a clearance between the two to
    // \lineskip, nearer than the slots, and every line after it nearer with it: that needs each later slot moved up,
    // which is not built. The line moved up alone spaced a paragraph unevenly, 10 and 14 apart where TeX sets 10, and a
    // \lineskiplimit of \maxdimen set every line touching the one above; so a negative shift is not applied)
    if (!(shift > 0)) return
    const was = line.baseline
    line.baseline -= shift
    line.opened = shift
    // (a block's last slot dropped, the next block's first is a pitch under the line set lower, not under the slot that is
    // gone)
    pushDown(li + 1, shift, was, line)
    if (line.baseline < line.foot - 0.05) { over = line.from; stop = true }
  }
  // iteration 3: the kept regions the text has passed (a break token each); the text may not run on into a block below
  // a region before its break (strict), or it reads before the formula it follows in the translation
  let consumed = 0, stop = false, spilled = false
  // (a slot over the last line laid, beside it in its column, is no line of the text's: a paragraph's lines go down. The
  // file's lines of a paragraph that sets a tall inline formula may come out of that order, its rows' lines after the line
  // under them: 2610.21026 page 8, unit 91, whose line laid at 694.1 after the one at 684.8 ran over the formula's crop.
  // Only a slot above it: a row the file splits from a line on its own baseline is that line's, 2610.21288 u5)
  const overLast = sl => {
    let k = lines.length - 1
    while (k >= 0 && !lines[k].items.length) k--
    const prev = lines[k]
    return !!prev && prev.page === sl.page && sl.baseline > prev.baseline + 0.05 && Math.min(prev.x1, sl.x1) > Math.max(prev.x0, sl.x0)
  }
  // (the line before a run's boundary is the run's last line, TeX's own law: where a display begins, TeX breaks the paragraph
  // so far as a paragraph, \parfillskip appended (The TeXbook ch. 19; tex.web §1145, init_math's line_break), so that line
  // ends where its text ends, ragged, and never in a discretionary hyphen. A boundary is a kept region TeX set between two
  // partial paragraphs of the unit, whatever it holds: the next slot the walk opens lies after more of them (a slot's
  // `after`) than the line's own. On the in-order walk the region's break ends that line (below, the blockTo token); where a
  // run's text fits its own slots at no state and the walk's last resort runs it on past the region (layoutUnit2's
  // `strict` false: `spilled`), the line before the region is still its run's last: it ends at a legal break that is no
  // hyphenation point, and is set ragged (advance). 2610.21106v1-zh p3's remark with Google's text: "Hes-" before the display
  // and "sian" after it)
  const nextSlotOf = from => {
    let q = from + 1
    while (q < slots.length && overLast(slots[q])) q++
    return q
  }
  const beforeBoundary = () => {
    const q = nextSlotOf(li)
    return q < slots.length && (slots[q].after ?? 0) > (slots[li].after ?? 0)
  }
  // (the frame breaks the lines hold (the pageBreak token, below: a page's or a column's), in the text's order: { pg, fr, at,
  // line, sent }, `fr` the frame it sends the text to (the unit's block it begins with, `blockBase` the run's first block's
  // place in the unit: a run laid alone), `pg` its page, `at` the token's index and `line` the line that holds it, `sent` once
  // the line after it opened in its frame. Two in one line: the first sends the next line, which then holds the second.
  // `immediate`: the breaks laid at their token (strand). `runFrom`: the index in `lines` of the current run's first line, the
  // line a display's break opened)
  const held = [], immediate = new Set()
  let runFrom = 0
  const base = P.blockBase ?? 0
  /** whether slot or line `sl` is in break `h`'s frame or past it */
  const reaches = (sl, h) => (h.fr !== null && h.fr !== undefined ? sl.block + base >= h.fr : sl.page >= h.pg)
  /** whether two lines stand in one frame: one page, one column */
  const oneFrame = (a, b) => a.page === b.page && Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0)
  /** break `h`'s frame's first slot past slot `from`, where the text may go on there (`past` the regions it has passed): none
   *  past a display not passed */
  const pageSlot = (h, from = li, past = consumed) => {
    let q = from + 1
    while (q < slots.length && !reaches(slots[q], h)) q++
    return q < slots.length && !((slots[q].after ?? 0) > past) ? slots[q] : null
  }
  /** the lines after line `was` hold the breaks `was` held and has not sent */
  const carry = was => { for (const h of held) if (h.line === was && !h.sent) h.line = line }
  /**
   * A held break whose frame got no text of its run: the run's text ended on the line that holds it, or on the line after it
   * that a forced break left empty (a display's break, the unit's end). That line is laid again from its first token on the
   * frame's first slot, whole, and the line before it ends the earlier frame, full; where no line of its run stands before it
   * in its frame (that frame would keep none of the run), it is laid again on its own slot with the break at its token, short
   * there (`immediate`); a break the line after the one that held it carried, which has no token on its line, is let go.
   * The one place a held break's fate is decided, in every lay of the unit (the fit's, the page fill's, a run's alone).
   * True where it laid a line again, the walk going on from its first token
   */
  const strand = () => {
    for (let k = 0; k < held.length; k++) {
      const h = held[k], at = lines.indexOf(h.line), L = h.line
      if (at < 0 || lines.slice(at + 1).some(l => l.items.length && reaches(l, h))) { held.splice(k--, 1); continue }
      let p = at - 1
      while (p >= runFrom && !lines[p].items.length) p--
      const first = p < runFrom || !oneFrame(lines[p], L)
      const own = slots.indexOf(slotOf.get(L))
      const to = own < 0 || (first && h.at < L.from) ? null : first ? slots[own] : pageSlot(h, own, L.past)
      if (!to) { held.splice(k--, 1); continue }
      // (the breaks whose token is before the line, carried to it or past it: held again by the line laid again; the rest are
      // reached again)
      const kept = held.filter(x => x !== h && !x.sent && x.at < L.from)
      held.length = 0
      lines.length = at
      i = L.from
      consumed = L.past
      if (first) immediate.add(h.at)
      li = slots.indexOf(to)
      open()
      for (const x of kept) held.push({ ...x, line, sent: false })
      return true
    }
    return false
  }
  const advance = () => {
    // (the line holds a page break: the next line opens on that page's first slot, where the text may still go on there)
    let k = -1, to = null
    while ((k = held.findIndex(h => h.line === line && !h.sent)) >= 0 && !(to = pageSlot(held[k]))) held.splice(k, 1)
    settle()
    if (stop) return
    if (to) {
      li = slots.indexOf(to)
      if (li < 0) { stop = true; return }
      const was = line
      held[k].sent = true
      open()
      carry(was)
      return
    }
    li = nextSlotOf(li)
    if (li >= slots.length) return
    if ((slots[li].after ?? 0) > consumed) {
      if (strict === true) { stop = true; return }
      spilled = true
    }
    // (the line left before a run's boundary is the run's last: ragged, as a region's break ends it, beforeBoundary)
    if ((slots[li].after ?? 0) > (line.after ?? 0)) { trim(line); line.ends = true }
    open()
  }
  // a group's widths, tokens `from` to `end` on the line in hand, with its punctuation compressed: at the line's start an
  // opening mark loses its blank half, two marks together lose the blank between them, and with compressMax 2 every mark
  // loses its blank half (a space the group holds before its barred mark, `sp`, as wide as the line's spaces and
  // shrinking as they do)
  const groupOf = (from, end) => {
    const items = []
    let w = 0, sp = 0, rig = 0, edge
    let prev = line.items.at(-1)?.t ?? null
    for (let q = from; q < end; q++) {
      const t = tokens[q]
      if (t.space) { const tw = tokW(t, f, st, scale); items.push({ t, w: tw }); w += tw; sp += tw; prev = t; continue }
      let tw = tokW(t, f, st, scale), shift = 0
      const lead = prev ? 0 : leadOf({ t }, st.compress) * f
      if (lead) {
        // the line's opening mark: its leading blank half (leadOf)
        tw -= lead
        shift = -lead
      } else if (t.punct && st.compress >= 2) {
        tw -= half
        if (t.punct === 'open') shift = -half
      } else if (t.punct && st.compress === 1) {
        if (prev?.punct === 'close') {
          // two marks together: the first loses its trailing blank half (the second keeps its own)
          const last = items.length ? items.at(-1) : line.items.at(-1)
          if (last && !last.cut) {
            last.w -= half
            last.cut = true
            if (items.length) w -= half
            else line.x -= half
          }
        } else if (t.punct === 'open' && prev?.punct) {
          // an opening mark after another mark: its leading blank half
          tw -= half
          shift = -half
        }
      }
      const asp = t.asp && (line.items.length || items.length) ? P.autospace * f : 0
      // (`kern`: the explicit glue after it, an advance of its own beside its width, which trim drops at a line's end: no part of
      // what it draws, a crop's image, a word's box)
      const kern = kernOf(t, f)
      // (the line's first text after a label TeX hung beside its text block (the slot's `hangGap`, B.slots): it starts at the hang,
      // the drawn label's end and the space TeX set after the label, the label's own spaces after it aside (TeX's hang: the
      // label box's width); `tabbed`, the hang's edge the group's `edge`)
      const hung = line.hangGap !== undefined && !t.label ? line.items.concat(items) : null
      let tab = 0, atTab = false
      if (edge === undefined && hung?.some(it => it.t.label) && hung.every(it => it.t.label || it.t.space)) {
        atTab = true
        let x = 0, end = 0
        for (const it of hung) {
          x += (it.asp ?? 0) + it.w + (it.kern ?? 0)
          if (it.t.label) end = x
        }
        tab = end + line.hangGap - (line.x + w + asp)
        edge = line.x0 + end + line.hangGap
      }
      // (the label's spaces then a box's, TeX's hang: none shrinks, `rig` the line's own already counted, the group's taken out)
      if (atTab) {
        rig = line.items.reduce((a, it) => a + (it.t.space && !it.rigid ? it.w : 0), 0)
        for (const it of items) if (it.t.space && !it.rigid) { it.rigid = true; sp -= it.w }
      }
      // (`cut`: the mark has lost its blank half, which a squeezed line does not take from it again, placeItems)
      items.push({ t, w: tw, shift, asp: asp + tab, ...(atTab ? { tabbed: true } : {}), ...(kern ? { kern } : {}), ...(shift ? { cut: true } : {}) })
      w += tw + asp + tab + kern
      prev = t
    }
    // a closing mark at the line's end hangs its blank half (hangOf)
    const hang = hangOf(items.at(-1), st.compress) * f
    return { items, w, sp, hang, rig, edge }
  }
  /** whether a group fits the line in hand: its spaces and the line's shrunk to spaceMin, a closing mark at its end hung */
  const fits = (g, cap) => line.x - (line.spaces - g.rig) * (1 - P.spaceMin) - g.sp * (1 - P.spaceMin) + g.w - g.hang <= cap + 0.01
  // (a group set at a hung label's end makes the label's spaces on the line a box's, TeX's hang: they shrink no more, `rig`)
  // (and its hang's edge every later line of the hung block starts at, `hung` (B.slots): TeX's \hangindent, the label box's width)
  const take = g => {
    if (g.edge !== undefined) for (let q = li + 1; q < slots.length; q++) if (slots[q].hung && slots[q].block === line.block) slots[q] = { ...slots[q], x0: g.edge }
    if (g.rig) { for (const it of line.items) if (it.t.space) it.rigid = true; line.spaces -= g.rig }
    for (const it of g.items) { line.items.push(it); if (it.t.space && !it.rigid) line.spaces += it.w }
    line.x += g.w
  }
  // (a line's trailing spaces dropped, and the kern of its last token: glue TeX drops at a break, a kern the line no longer
  // needs)
  const trim = l => {
    while (l.items.at(-1)?.t.space) { const sp = l.items.pop(); l.x -= sp.w; l.spaces -= sp.w }
    const end = l.items.at(-1)
    if (end?.kern) { l.x -= end.kern; end.kern = 0 }
  }
  // A CJK line squeezed to take the group it misses (`squeezes`: Chinese and Japanese, the scripts that break between CJK
  // characters): light compression before stretching, as TeX takes the cheaper of the two breaks by their badness. The line
  // takes the group where the group overflows it by no more than the line can give, its marks' blank halves (the usual CJK
  // punctuation compression, where the state compresses less than the rules let it) and then SQUEEZE em a gap, its word
  // spaces at spaceMin as `fits` takes them; and only where the line would otherwise be letter-spaced, its stretch a gap
  // without the group (`stretchOf`) past STRETCH_MIN em, and the squeeze a gap less than that stretch. placeItems sets it
  // (`squeezed`). The gaps close no further than the tracking floor, trackMin: the squeeze and the unit's tracking together
  // never set two characters nearer than the fit's tightest state does. Never a centred line, nor one placeItems sets as
  // Latin text; nor at a tracking above the one the fit set the unit at (`fitTrack`, laidOut's), which only the page fill
  // sets (run.mjs fillPage: a unit short of its frame letter-spaced to fill it), whose lines the squeeze would take back
  const squeezes = !!P.cjk && !P.keepAll && !(st.track > (st.fitTrack ?? P.trackStart ?? 0) + 1e-9)
  const gapSqueeze = Math.max(0, Math.min(SQUEEZE, st.track - (P.trackMin ?? 0))) * f
  /** the stretch a gap the line in hand is justified by if it is closed here: its trailing spaces and its last kern dropped
   *  and its closing mark hung, as trim and placeItems leave it; Infinity where it has no gap */
  const stretchOf = cap => {
    let n = line.items.length, x = line.x
    while (n > 0 && line.items[n - 1].t.space) x -= line.items[--n].w
    if (n < 2) return Infinity
    const end = line.items[n - 1]
    const hang = hangOf(end, st.compress) * f
    const gaps = gapsOf(line.items.slice(0, n))
    return gaps > 0 ? (cap - (x - (end.kern ?? 0)) + hang) / gaps : Infinity
  }
  /** whether the line in hand squeezes to take group g, which does not fit it */
  const squeezeTakes = (g, cap) => {
    if (!squeezes || line.centred || !line.items.length) return false
    const all = line.items.concat(g.items)
    if (latinishOf(all, P)) return false
    const need = line.x - (line.spaces - g.rig + g.sp) * (1 - P.spaceMin) + g.w - g.hang - cap
    const gaps = gapsOf(all)
    const stretch = stretchOf(cap)
    return gaps > 0 && stretch > STRETCH_MIN * f && need <= squeezable(all, g.hang > 0, st.compress, P).length * half + gapSqueeze * gaps + 1e-9 && need / gaps < stretch
  }
  /**
   * Whether an address that does not fit the line in hand (`t`, a URL's crop with its url package's break points) goes whole to
   * the next line, the break before it (the coordinator's ruling of 2026-11-12, PDF-READER §18.50: an address is one thing to
   * a reader): it fits the next line whole, and the line in hand closed here would not be placed justified and visibly
   * stretched. Visibly stretched is the breaker's own two bounds: placed justified, its stretch a gap within the script's
   * cjkJust (placeItems: past it the line is set ragged, unstretched), and above STRETCH_MIN (under it the stretch does not
   * read as letter-spaced). So a line that would be set ragged, or is nearly full, keeps the address whole; one letter-spaced to
   * its measure (2303.11366v4 p1's abstract, 0.205 em a gap) has it cut at its break points, as one longer than a line is.
   * STRETCH_MIN reads a CJK line alone (squeezeTakes's: a target that breaks between CJK characters, a line not set as Latin
   * text), and the breaker states no visible stretch of a Latin line's spaces: a Latin-ish line's address is cut as before
   */
  const keepsWhole = (t, cap) => {
    let n = line.items.length
    while (n > 0 && line.items[n - 1].t.space) n--
    if (!P.cjk || P.keepAll || latinishOf(line.items.slice(0, n), P)) return false
    const next = slots[li + 1]
    if (!next || tokW(t, f, st, scale) > next.x1 - next.x0 + 0.01) return false
    const stretch = stretchOf(cap)
    return !(stretch > STRETCH_MIN * f && stretch <= P.cjkJust * f)
  }
  if (slots.length) open()
  // (the walk ends where the text does; a page break held on its last lines whose page got none of it is laid then, strand,
  // and the walk goes on from the line it lays again)
  for (;;) {
  while (i < tokens.length && li < slots.length && !stop) {
    // a forced break of TeX's inside a frame (tokensOf2's `newline`): the laid line ends there (a line it finds empty, the
    // text before it having filled the last, is no line of its own, as TeX's break at a full line's end sets none), and
    // TeX's room after it, in pitches (`room`), is left before the next line, the later slots of the ended line's flow
    // pushed down by it as TeX's rule pushes them (pushDown): the room is wherever the translation sets the break, and
    // what the unit does not use of its slots stays at its end. A next slot in another flow (the break at a frame's
    // foot) takes no room: TeX drops glue at a frame's head
    if (tokens[i].newline !== undefined) {
      const room = tokens[i].room ?? 0
      i++
      // (the line TeX's \\ ends, \hfil\break: ragged, placeItems)
      if (line.items.length) { trim(line); line.ends = true; advance() }
      if (stop || li >= slots.length || !(room > 0)) continue
      let k = lines.length - 2
      while (k >= 0 && !lines[k].items.length) k--
      const prev = lines[k]
      if (!prev || !inFlow(prev, slots[li])) continue
      pushDown(li, room * slots[li].pitch, prev.baseline, prev)
      // (the empty line opened on its slot before the room moved it: opened again where the slot now is, or on the next
      // where it was dropped)
      lines.pop()
      if (li >= slots.length) continue
      if ((slots[li].after ?? 0) > consumed) {
        if (strict === true) { stop = true; continue }
        spilled = true
      }
      open()
      continue
    }
    // a frame break of the paragraph's (withPageBreaks, pageCutsOf: a page's or a column's, `frame` the unit's block the frame
    // begins with): reached in an earlier frame, the line that holds it ends where the breaker ends it, and the text goes on on
    // the frame's first slot (`held`, advance): a paragraph over a page break leaves no short line before it, as TeX never does
    // (the owner, 2026-10-30: 1706.03762's Chinese §3.2.2 ended page 4 half a line short, the word for "output" split over
    // pages 4 and 5); reached at a line's start (or one `immediate`, strand's fallback), there. Where the run's text ends on
    // the line that holds it, so that its frame would get none, strand lays that line there whole. Reached in that frame or
    // later (the earlier one already full), or where that frame's first slot lies after a display the text has not passed
    // (the source sets the text before the display: the display's own break places it), nothing
    // (a cut of the frames' share (pageCutsOf `share`): a break only at a state that holds the share, else nothing)
    if (tokens[i].pageBreak !== undefined && tokens[i].share && !st.share) {
      i++
      continue
    }
    if (tokens[i].pageBreak !== undefined) {
      const h = { pg: tokens[i].pageBreak, fr: tokens[i].frame ?? null, at: i, sent: false }
      i++
      if (reaches(line, h)) continue
      const to = pageSlot(h)
      if (!to) continue
      if (line.items.length && !immediate.has(h.at)) { held.push({ ...h, line }); continue }
      if (line.items.length) trim(line)
      settle()
      if (stop) break
      li = slots.indexOf(to)
      if (li < 0) { stop = true; break }
      const was = line
      open()
      carry(was)
      continue
    }
    if (tokens[i].blockTo !== undefined) {
      consumed = Math.max(consumed, tokens[i].blockTo + 1)
      if (!line.items.length) line.past = consumed
      if ((slots[li].after ?? 0) < consumed) {
        let q = li + 1
        while (q < slots.length && (slots[q].after ?? 0) < consumed) q++
        if (q < slots.length) {
          // (the slot by itself, not by its index: settle may drop slots of this line's flow above the display, before
          // it; the slot below the display is of another flow, which settle never moves)
          const to = slots[q]
          trim(line)
          // (the part of the paragraph before a display ends with TeX's \parfillskip: its last line ragged, placeItems; a page
          // break the run's lines hold whose page got none of its text is laid first: strand)
          if (held.length && strand()) continue
          line.ends = true
          settle()
          if (stop) break
          li = slots.indexOf(to)
          open()
          if (!tokens[i].brk) runFrom = lines.length - 1
        }
      }
      i++
      continue
    }
    // the unit's end mark (Token.endMark, lay/adapt.ts; docs/PDF-READER.md §18.52): at the end of the line the text ends on, its
    // rectangle as far from the line's right edge as TeX set it (`pad`), where the text ends the keep-off distance before its ink
    // (TeX's own distance and half an em at most, B.slots' rule for ink that stays: `gap`), the line's spaces shrunk as `fits`
    // takes them and a closing mark at its end hung; else on a line of its own (amsthm's \penalty9999 before it: a break only
    // where it does not fit). placeItems sets it there. A line it cannot open (no slot left) leaves the state unset, the fit's
    if (tokens[i].endMark) {
      const t = tokens[i]
      trim(line)
      const w = tokW(t, f, st, scale)
      const room = line.x1 - line.x0 - t.endMark.pad - w - Math.min(half, t.endMark.gap)
      const hang = hangOf(line.items.at(-1), st.compress) * f
      if (!line.items.length || line.x - line.spaces * (1 - P.spaceMin) - hang <= room + 0.01) {
        line.items.push({ t, w, shift: 0, asp: 0 })
        i++
        continue
      }
      advance()
      continue
    }
    const cap = line.x1 - line.x0
    // a token and those glued to it; a space is a group of its own (what is glued after it is the next group's: the
    // footnote marks iteration 1 lost were skipped here with the space before them)
    let j = i + 1
    if (!tokens[i].space) while (j < tokens.length && tokens[j].glue && !tokens[j].space) j++
    // (and a mark no line opens with, `barred`, joins the group before it, past the spaces between them too: a translation's
    // space before its comma or its bracket, a formula drawn as the page's characters with its spaces, a mark after a crop
    // that no rule glues. The line breaks before the group, never before the mark: kinsoku's push-out, the word or the
    // character before the mark going down with it. `own`: the group as its glue alone makes it, which a line it opens
    // takes where the joined group is longer than the line: the break the breaker always made there, nothing else fitting)
    // (and a tie, the source's `~`: TeX's \penalty10000 and its interword glue, a space no line breaks at: the group runs on
    // through its space, the token after it and what is glued to that; the space stays in the group, drawn and stretched as
    // the line's spaces are (groupOf's `sp`). A tied group longer than the line is broken at `own`, as a joined one is)
    const own = j
    if (!tokens[i].space) for (;;) {
      let q = j
      if (q + 1 < tokens.length && tokens[q].tie && !tokens[q + 1].space) {
        j = q + 2
        while (j < tokens.length && tokens[j].glue && !tokens[j].space) j++
        continue
      }
      while (q < tokens.length && tokens[q].space) q++
      if (q >= tokens.length || !barred(tokens[q])) break
      j = q + 1
      while (j < tokens.length && tokens[j].glue && !tokens[j].space) j++
    }
    const t0 = tokens[i]
    if (t0.space) {
      if (line.items.length) {
        const w = tokW(t0, f, st, scale)
        line.items.push({ t: t0, w })
        line.x += w
        line.spaces += w
      }
      i = j
      continue
    }
    const shrink = line.spaces * (1 - P.spaceMin)
    let g = groupOf(i, j)
    if (j > own && !line.items.length && !fits(g, cap)) { j = own; g = groupOf(i, j) }
    const { items } = g
    if (fits(g, cap)) {
      take(g)
      i = j
      continue
    }
    if (!line.items.length) {
      // nothing on the line yet, and the group is longer than it: cut by characters (a URL, a long formula word)
      if (tokens[i + 1]?.cont) {
        // (a word of small capitals the layer draws, cut into runs of one case, `cont`: as many of its characters as the line
        // holds, across its runs, as a word of one token is cut below; never its first run alone on a line of its own)
        let m = i + 1
        while (m < tokens.length && tokens[m].cont) m++
        let q = i, used = 0
        for (; q < m; q++) {
          const tw = tokW(tokens[q], f, st, scale)
          if (used + tw > cap) break
          line.items.push({ t: tokens[q], w: tw, shift: 0, asp: 0 })
          used += tw
        }
        if (q === m) {
          // (the word whole on the line: what is glued after it goes on, as the group's first token alone does below)
          if (tokens[m]) setToken(m, { ...tokens[m], glue: false })
        } else {
          const t = tokens[q], chars = graphemesOf(t.s)
          const per = chars.map(c => (P.measure.w100(c, t.face) * (t.sc ?? 1) * f) / 100)
          let k = 0, head = 0
          while (k < chars.length && used + head + per[k] <= cap) head += per[k++]
          if (q === i) { k = Math.max(1, k); head = per.slice(0, k).reduce((a, b) => a + b, 0) }
          while (k > 1 && k < chars.length && cutBarred(chars, k)) { k--; head -= per[k] }
          if (k > 0) {
            line.items.push({ t: headOfCut(t, { s: chars.slice(0, k).join('') }), w: head, shift: 0, asp: 0 })
            used += head
            const tail = chars.slice(k).join('')
            setToken(q, { ...t, s: tail, w100: P.measure.w100(tail, t.face) * (t.sc ?? 1), glue: false, cont: false, asp: false })
          } else setToken(q, { ...t, glue: false, cont: false })
        }
        line.x += used
        i = q
      } else if (t0.s && graphemesOf(t0.s).length > 1 && tokW(t0, f, st, scale) > cap) {
        const chars = graphemesOf(t0.s)
        let k = 0, used = 0
        const per = chars.map(c => (P.measure.w100(c, t0.face) * (t0.sc ?? 1) * f) / 100)
        while (k < chars.length && used + per[k] <= cap) used += per[k++]
        k = Math.max(1, k)
        // (the part left never opens with a mark no line starts with, nor parts a pair UAX 14 keeps: the cut moves back before it)
        while (k > 1 && k < chars.length && cutBarred(chars, k)) k--
        line.items.push({ t: headOfCut(t0, { s: chars.slice(0, k).join('') }), w: per.slice(0, k).reduce((a, b) => a + b, 0), shift: 0, asp: 0 })
        const tail = chars.slice(k).join('')
        setToken(i, { ...t0, s: tail, w100: P.measure.w100(tail, t0.face) * (t0.sc ?? 1), glue: false, asp: false })
      } else if (t0.crop?.breaks?.length && tokW(t0, f, st, scale) > cap && urlCut(t0, cap, scale, true)) {
        // (a URL longer than the line by itself: cut at the last of its break points that fits, else at its first)
        const cut = urlCut(t0, cap, scale, true)
        line.items.push({ t: cut.head, w: cut.head.cw * scale, shift: 0, asp: 0 })
        line.x += cut.head.cw * scale
        setToken(i, cut.tail)
      } else if (t0.ownLabel && lines.length === 1 && li + 1 < slots.length) {
        // (a unit's own label carried to its first line's start (run.mjs ownLabelOnRow), on a shared line that holds it and not
        // its first word: never alone at the line's end (2610.21098v1 p2's "(2)", the end of the line before its item's text).
        // The line is left as a sliver is (slotsAt), and the unit opens on its next)
      } else {
        // the group's first token alone (the rest goes on): a glued group never runs past the line
        line.items.push(items[0])
        line.x += items[0].w + (items[0].asp ?? 0)
        if (tokens[i + 1]) setToken(i + 1, { ...tokens[i + 1], glue: false })
        i++
      }
      advance()
      continue
    }
    // a CJK line squeezed to take the group (squeezeTakes)
    if (squeezeTakes(g, cap)) {
      take(g)
      line.squeezed = true
      i = j
      continue
    }
    // a word hyphenated: the most of it that fits, with its hyphen; never on the line before a run's boundary, its run's last
    // line (beforeBoundary)
    if (P.hyphen && t0.hyph && t0.s && !beforeBoundary()) {
      const word = t0.s
      const pts = breakPoints(word.replace(/[^A-Za-zÀ-ɏЀ-ӿ]+$/, ''), t0.hyph, P.patterns?.[t0.hyph] ?? null, P.hyphenation[t0.hyph])
      const asp = items[0].asp
      const room = cap + shrink - line.x - asp
      let cut = null
      for (let q = pts.length - 1; q >= 0; q--) {
        const head = `${word.slice(0, pts[q])}-`
        const hw = (P.measure.w100(head, t0.face) * f) / 100 + (st.trackLatin ? st.trackLatin * f * head.length : 0)
        if (hw <= room + 0.01) { cut = { head, hw, at: pts[q] }; break }
      }
      if (cut) {
        line.items.push({ t: headOfCut(t0, { s: cut.head, hyphenated: true }), w: cut.hw, shift: 0, asp })
        line.x += cut.hw + asp
        const tail = word.slice(cut.at)
        setToken(i, { ...t0, s: tail, w100: P.measure.w100(tail, t0.face) * (t0.sc ?? 1), glue: false, asp: false })
      }
    }
    // a URL TeX set whole, broken where its url package lets TeX break it (El.breaks): the most of it that fits, its crop cut
    // between two of its glyphs there, as a word is hyphenated; the rest opens the next line (2303.11366v4 p1's abstract: the
    // URL whole on the next line left the line before it letter-spaced to its measure, the maintainer's of 2026-11-08). Only on
    // a line set justified: where TeX set the unit flush left or right or centred (placeItems: at its natural spacing), no line
    // is stretched, and TeX, whose \rightskip stretch there costs a short line nothing, breaks before the URL rather than inside
    // it at its url package's penalty: whole on the next line, as the original sets it (2608.25210v2 p1's VLDB footnote,
    // \raggedright, its URL cut after "https://"). And on a justified line only where the line, the address whole on the next,
    // would be placed justified and visibly stretched (keepsWhole): one placement would set ragged, or nearly full, keeps it
    // whole, as the original and today's do (2610.21880v1 p1's footnote: "sohani@mail." cut where its line before would be set
    // ragged at 0.27-0.32 em a gap)
    if (t0.crop?.breaks?.length && !line.centred && !line.flush && !keepsWhole(t0, cap)) {
      const asp = items[0].asp ?? 0
      const cut = urlCut(t0, cap + shrink - line.x - asp, scale, false)
      if (cut) {
        line.items.push({ t: cut.head, w: cut.head.cw * scale, shift: 0, asp })
        line.x += cut.head.cw * scale + asp
        setToken(i, cut.tail)
      }
    }
    // the line is closed: its trailing spaces dropped
    trim(line)
    advance()
  }
  let end = i
  while (end < tokens.length && textless(tokens[end])) end++
  if (stop || end < tokens.length || !held.length || !strand()) break
  }
  for (const l of lines) trim(l)
  // (the last line, settled as the others were when they closed)
  if (!stop) settle()
  // break tokens left at the end place nothing
  while (i < tokens.length && (tokens[i].blockTo !== undefined || tokens[i].newline !== undefined || tokens[i].pageBreak !== undefined)) i++
  return { lines: lines.filter(l => l.items.length), rest: over ?? i, total: tokens.length, tokens, spilled }
}

export { breakLines, gapsOf, hangOf, inWord, latinishOf, leadOf, noLineStart, squeezable, tabOf }
