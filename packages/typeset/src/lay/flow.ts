// layFlow's composition over prepared members (design-b §1.6 L8: F1-F9 for each member in order): a member that continues the
// one before it on a shared line starts where that one's translation ends on the row (S.rowStart, F1, over the member
// before's share and blocks), then is laid (layMember: F2-F8, L9); where the member before was laid over this one's first row
// (S.overFollower) and this one is left the original's, not laid from its end, or laid from it only below its floor, the
// member before is laid again in its row alone and this one again from where it now ends (S.relay, F9: never taken on the
// corpus; a row of three is settled back one pair at a time). A line of TeX's several members share whole, which TeX set
// centred or flush right (RowLine), is laid as one run: its members run on as on any shared row, the run then placed as TeX
// placed the line (layLine). A member is prepared from its part (L5-L7: the unit's rules, the tokens) by the adapter; the
// composition reads nothing else.
import { hangOf, noLineStart } from '../breaker/break.types.ts'
import type { FitBlock } from '../fit/types.ts'
import type { FillLaid } from '../shared/fill-page.ts'
import { relay } from '../shared/relay.ts'
import { inkEndOf } from '../shared/share.ts'
import { lineRoom, lineShift, type Row, type RowLine, rowStart } from '../shared/row-start.ts'
import { type Rect, rectKey } from '../util.ts'
import type { Json, LedgerSlot, RuleParams } from '../types.ts'
import { layMember, type MemberLay, type Prepared } from './member.ts'
import { fin, Trace } from './trace.ts'

/** a member of a flow: prepared, and, where it continues the member before on a shared line, the row and its facts */
export type FlowMember = Prepared & {
  rowStart?: {
    row: Row
    /** its label carried with its first line (U.decor) */
    carried: boolean
    /** its own label on the row (the file's label row), or null */
    ownLabel: readonly number[] | null
    /** a character of the page stays on the row between the member before's end and x (Placed.join kept) */
    keptBetween: (x: number) => boolean
    /** where its text's first glyph stands on the row (its first line's start, the original's), its label before it */
    x: number
    /** where the tokens are the member's own (the adapter's, lay/read.ts): its label's crop, set on the row's baseline as its first
     *  line's start where its label on the row goes with it (RUN:2215-2224), and its first line's head edge then (the label
     *  drawn: U.params' halfLead.head). Today's tokens handed in hold the crop already */
    label?: { crop: (baseline: number) => Prepared['tokens'][number]; head: boolean }
  }
  /** the line of TeX's it shares whole with the members beside it, where TeX set that line centred or flush right */
  line?: RowLine
}
export type FlowLay = { ord: number; lay: MemberLay; ledBy?: number; slots: LedgerSlot[] }

/** each member of the flow laid in order (design-b §1.6 F1-F9) */
export function layFlowPrepared(members: readonly FlowMember[], R: RuleParams, trace = false): FlowLay[] {
  const out: FlowLay[] = []
  const layOne = (m: FlowMember, before: FlowLay | undefined, noOver: boolean): FlowLay => {
    const t = trace ? new Trace(1) : null
    let p: Prepared = noOver ? { ...m, noOver: true } : m
    let ledBy: number | undefined
    if (m.rowStart) {
      const b0 = m.blocks[0] ? ({ ...m.blocks[0] } as FitBlock) : undefined
      const laid = before?.lay.state === 'laid' ? (before.lay.lay as FillLaid) : null
      const rs = rowStart({
        row: m.rowStart.row,
        b0,
        carried: m.rowStart.carried,
        lead: before ? { refused: !laid, share: laid?.share ?? null } : null,
        ownLabel: m.rowStart.ownLabel,
        keptBetween: m.rowStart.keptBetween,
        leadBlocks: laid ? (laid.blocks as FitBlock[]) : null,
      })
      ledBy = rs.ledBy
      p = { ...p, blocks: b0 ? [b0, ...m.blocks.slice(1)] : m.blocks, onLeadOf: rs.onLeadOf }
      // (its label on the row goes with it: its ink's crop before its first token, which no line ends after alone (its first
      // word glued to it), on the row's baseline; the label so drawn, its first line's head is the line's own: RUN:2215-2224)
      const lab = m.rowStart.label
      if (rs.rowLabel && lab) {
        const toks = [...p.tokens]
        if (toks[0] && !toks[0].space) toks[0] = { ...toks[0], glue: true }
        p = {
          ...p,
          tokens: Object.assign([lab.crop(rs.rowLabel.baseline), ...toks], {
            base: (p.tokens as { base?: unknown }).base,
          }),
          P: p.P.halfLead ? { ...p.P, halfLead: { ...p.P.halfLead, head: lab.head } } : p.P,
        }
      }
      t?.put('F1', 'S.rowStart', {
        applied: rs.ledBy !== undefined,
        start: fin(b0?.start),
        startY: fin(b0?.startY),
        onLeadOf: (rs.onLeadOf as Json) ?? null,
        ledBy: rs.ledBy ?? null,
      })
    }
    const lay = layMember(p, R, t)
    return { ord: m.ord, lay, ...(ledBy !== undefined ? { ledBy } : {}), slots: t?.slots ?? [] }
  }
  for (let i = 0; i < members.length; ) {
    const n = lineAt(members, i)
    const run = n > 1 ? layLine(members.slice(i, i + n), layOne) : null
    if (run) {
      out.push(...run)
      i += n
      continue
    }
    out.push(layOne(members[i]!, out[i - 1], false))
    settleBack(out, members, i, layOne)
    i++
  }
  return out
}

/** how many members from `i` on are the line member `i` leads (RowLine), each of it (the adapter gives none to a member whose
 *  label would stay where TeX set it) and after the first laid from the one before on it (S.rowStart's row): 0 where it leads
 *  none so */
function lineAt(members: readonly FlowMember[], i: number): number {
  const ords = members[i]!.line?.ords
  if (!ords || ords[0] !== members[i]!.ord) return 0
  const run = members.slice(i, i + ords.length)
  return run.length === ords.length &&
    run.every((m, k) => m.ord === ords[k] && m.line?.ords[0] === ords[0] && (k === 0 || m.rowStart))
    ? ords.length
    : 0
}

/**
 * A paragraph of TeX's its members fill whole, set centred or flush right, laid as one run (the owner's: a translated author
 * line reflows as one line, its names, marks and separators run together, set as TeX set that line). Each member laid by
 * itself, a name stood centred on its own original's middle: the translations, shorter, left a hole before each (2610.21106v1
 * p1, amsart's "NI XIANG AND YUNI XIONG", 36 pt where TeX set 3.3; 2611.00342v1 p1, IJCAI's eleven names over three lines, a
 * hole before each comma, a name broken over two lines, a name's marks alone on a third). TeX set the paragraph as a whole:
 * its lines broken, each an hbox of its content at its natural width, then placed. So here: the members laid one after the
 * other over the paragraph's lines (TeX's rows, each its room: as wide as the run's members' lines may take, centred on the
 * row's middle or ending at its end), the first from its room's start, each after the one before from its ink's end at TeX's
 * separation, every one ragged to its room's end and on to the rows under it (a name that no longer fits on a row goes on
 * on the next, as TeX breaks a paragraph); each row's extent read off the lay (its first item's start to its last ink's end, a
 * closing mark's blank half that hangs aside, as a centred line's placing has it), then laid again with each row moved by
 * what stands it centred on TeX's row's middle, or ending at its end. Each row keeps its width either way, so the second lay
 * is the first one moved, row by row. Null, the members laid as before, where the run is not laid so: a member not laid, or
 * ending on no row of the paragraph
 */
function layLine(
  row: readonly FlowMember[],
  layOne: (m: FlowMember, before: FlowLay | undefined, noOver: boolean) => FlowLay,
): FlowLay[] | null {
  const line = row[0]!.line!
  const R = line.rows
  const left = Math.min(...row.map((m) => m.line!.left)),
    right = Math.max(...row.map((m) => m.line!.right))
  const rooms = R.map((r) => lineRoom(line.align, r, left, right))
  // (TeX's separation before a member: from the ink's end of the one before to its first glyph, its label's where that stands
  // on the row, S.rowStart's)
  const gapOf = (m: FlowMember) => {
    const rs = m.rowStart!
    return Math.max(0, (rs.ownLabel ? rs.ownLabel[2]! : m.blocks[0]!.rects[0]![1]!) - rs.row.x1)
  }
  // (a member's carried label that is a mark no line opens with, by the breaker's own rule (noLineStart: UAX 14's, the target's
  // line-start marks), IJCAI's \and's comma: TeX set it after the name before, the line's break after it. It goes at the end of
  // the member before, glued to its last token (its crop from that one's ink end on A to its own, TeX's separation before it
  // held), so that the breaker keeps it with the group before it, as it keeps such a mark inside one text: where the line no
  // longer holds that group with it, both go on to the next, and no line opens with the mark. 2611.00342v1 on staging (round 8
  // B3): the tenth name's comma opened the paragraph's second line, the ninth ending the first at the room's end. The member is
  // then laid from TeX's separation after the mark, its own label no longer before it. The crop names its owner (`of`): the
  // label stays the owner's, its group off on its page as where the owner draws it (entry.ts), so the comma is drawn once)
  const marks = row.map((m, k) => {
    const rs = m.rowStart,
      t0 = m.tokens[0]
    const text = t0?.crop?.text,
      ch = typeof text === 'string' ? [...text][0] : undefined
    if (k === 0 || !rs?.carried || !rs.ownLabel || !t0?.crop || !ch || !noLineStart(m.P)(ch)) return null
    const x0 = Math.min(rs.row.x1, rs.ownLabel[2]! - 0.4),
      x1 = rs.ownLabel[4]! + 0.4
    const box = t0.crop.crop as [number, number, number, number]
    return {
      token: {
        ...t0,
        crop: { ...t0.crop, crop: [x0, box[1], x1, box[3]], of: m.ord },
        cw: x1 - x0,
        glue: true,
      } as typeof t0,
      gap: Math.max(0, rs.x - x1),
    }
  })
  // (the room under the paragraph's last line a translation may borrow: its last member's, TeX's facts)
  const free = row.at(-1)!.blocks.at(-1)!.free
  // (and its two depths, where the borrow past TeX's bottom is asked: §18.37)
  const { toFoot, toInk } = row.at(-1)!.blocks.at(-1)!
  // (a member's block: the paragraph's lines from TeX's `r`th on, each its room moved by `shift`, its first from `start`, on the
  // baseline the line before it there was laid at where that is not TeX's, `startY`: a CJK line TeX's \lineskip rule set lower)
  const blockOf = (
    m: FlowMember,
    r: number,
    start: number,
    shift: readonly number[],
    startY: number | undefined,
  ): FitBlock => {
    const b0 = m.blocks[0]!,
      rs = R.slice(r)
    const below = b0.B[0]! - b0.rects[0]![2]!,
      above = b0.rects[0]![4]! - b0.B[0]!
    const rects = rs.map(
      (w, k) =>
        [
          w.page,
          rooms[r + k]![0] + shift[r + k]!,
          w.baseline - below,
          rooms[r + k]![1] + shift[r + k]!,
          w.baseline + above,
        ] as Rect,
    )
    const B = rs.map((w) => w.baseline)
    const pitch = R.length > 1 ? (R[0]!.baseline - R.at(-1)!.baseline) / (R.length - 1) : b0.pitch
    return {
      page: rs[0]!.page,
      rects,
      x0: Math.min(...rects.map((q) => q[1])),
      x1: Math.max(...rects.map((q) => q[3])),
      top: rects[0]![4],
      bottom: rects.at(-1)![2],
      h: rects[0]![4] - rects.at(-1)![2],
      pitch,
      pitch0: R.length > 1 ? pitch : b0.pitch0,
      indent: 0,
      centred: false,
      flush: 'left',
      // (each line its own measure: its room, moved)
      measures: new Map(rects.map((q) => [rectKey(q), [q[1], q[3]] as [number, number]])),
      after: b0.after,
      B,
      G: B,
      exact: B.map(() => true),
      sizes: B.map(() => b0.sizes[0] ?? m.s),
      free,
      ...(toFoot !== undefined ? { toFoot, toInk } : {}),
      flow: b0.flow,
      start,
      ...(startY !== undefined ? { startY } : {}),
    }
  }
  const last = R.at(-1)!
  // (a paragraph of several lines laid on TeX's lines, at its pitch: each member's own fit set its own leading, a CJK target's
  // looser than TeX's, and the next member, laid from where it ended, stood on no line of the paragraph's; one line, any)
  const fixed = R.length > 1 ? { leadBase: 1, leadFloor: 1 } : null
  // (the run laid: each member, the paragraph's lines as laid (their baselines, top down: the i-th stands for TeX's i-th), each
  // member's lines among them, and each line's extent, its first item's start to its last ink's end, a closing mark's blank half
  // that hangs aside, as a centred line's placing has it)
  // (each member broken only at its own spaces where a line holds it, as TeX broke the paragraph between words: its tokens glued
  // one to the next but at a space, and after the label it carries, the separator TeX set before it (IJCAI's \and's comma),
  // which closes the line before where the member goes on to the next. A CJK name holds no space: it goes on whole, where cut
  // between its characters by the fit, a name of three characters stood over two lines, two and one (2611.00342v1's "Woohyeon Kwon" on staging); one longer than a line is cut by the breaker as before)
  const tokensOf = (m: FlowMember, k: number) => {
    const own = marks[k] ? m.tokens.slice(1) : m.tokens,
      next = marks[k + 1]?.token
    const t = next ? [...own, next] : own
    const lead = k > 0 && !marks[k] && m.rowStart?.carried && t[0]?.crop ? 1 : 0
    return Object.assign(
      t.map((x, q) => (q <= lead || x.space || x.glue ? x : { ...x, glue: true })),
      { base: (m.tokens as { base?: unknown }).base },
    ) as typeof m.tokens
  }
  const lay = (shift: readonly number[]) => {
    const o: FlowLay[] = [],
      ys: number[] = [],
      rowsOf: number[][] = [],
      ext: [number, number][] = []
    let x = rooms[0]![0] + shift[0]!
    for (const [k, m] of row.entries()) {
      const r = k === 0 ? 0 : ys.length - 1
      const y = ys[r]
      const tokens = tokensOf(m, k)
      const layFrom = (from: number, start: number, startY: number | undefined) =>
        layOne(
          {
            ...m,
            ...(fixed ? { P: { ...m.P, ...fixed } } : {}),
            tokens,
            blocks: [blockOf(m, from, start, shift, startY)],
            rowStart: undefined,
            kept: null,
            follower: null,
            shareRow: { page: last.page, baseline: last.baseline, size: m.blocks[0]!.sizes[0] ?? m.s },
          },
          o[k - 1],
          true,
        )
      let got = layFrom(
        r,
        k === 0 ? x : x + (marks[k] ? marks[k]!.gap : gapOf(m)),
        y !== undefined && Math.abs(y - R[r]!.baseline) >= 0.05 ? y : undefined,
      )
      // (a member after the first opens on a line the members before it hold: its first word, which the breaker cuts by its
      // characters where a line holds nothing yet, is never cut there; where the rest of the line does not hold it whole, the
      // member goes on to the next line, as the mark it carried (above) made it go before. A CJK name of no space, its first
      // word, stood cut over two lines)
      const L0 = got.lay.state === 'laid' ? got.lay.lay.layout : null
      if (k > 0 && L0 && L0.lines.length > 1 && Math.abs(L0.lines[0]!.baseline - ys[r]!) < 0.05 && r + 1 < R.length) {
        const textOf = (t: { s?: string; crop?: { text?: unknown } }) =>
          t.s ?? (typeof t.crop?.text === 'string' ? t.crop.text : '')
        let word = ''
        for (const t of tokens) {
          if (t.space) break
          word += textOf(t)
        }
        const held = L0.lines[0]!.items.map((it) => (it.t.space ? ' ' : textOf(it.t))).join('')
        if (held.length < word.length && word.startsWith(held))
          got = layFrom(r + 1, rooms[r + 1]![0] + shift[r + 1]!, undefined)
      }
      if (got.lay.state !== 'laid') return null
      const L = got.lay.lay.layout
      if (!L.lines.length) return null
      const rs: number[] = []
      for (const l of L.lines) {
        let i = ys.findIndex((v) => Math.abs(v - l.baseline) < 0.05)
        if (i < 0) {
          if (l.page !== last.page || (ys.length && l.baseline > ys.at(-1)! - 0.05) || ys.length >= R.length)
            return null
          ys.push(l.baseline)
          i = ys.length - 1
        }
        if (i < r) return null
        rs.push(i)
        const end = l.x0 + l.used! - hangOf(l.items.at(-1), L.state.compress) * L.f,
          e = ext[i]
        ext[i] = e ? [Math.min(e[0], l.x0), Math.max(e[1], end)] : [l.x0, end]
      }
      x = inkEndOf(L.lines.at(-1)!, L, m.P.measure)
      rowsOf.push(rs)
      o.push(k ? { ...got, ledBy: row[k - 1]!.ord } : got)
    }
    return { o, ys, rowsOf, ext }
  }
  const first = lay(R.map(() => 0))
  if (!first) return null
  // (each line moved to stand as TeX set the paragraph's line it stands for: centred on its middle, or ending at its end)
  const shift = R.map((w, i) => {
    const e = first.ext[i]
    return e ? lineShift(line.align, w, e[0], e[1]) : 0
  })
  const run = lay(shift)
  if (!run || run.ys.join() !== first.ys.join() || run.rowsOf.some((rs, k) => rs.join() !== first.rowsOf[k]!.join()))
    return null
  return run.o
}

/** F9 S.relay (settleLeadOf RUN:2550-2558, relay RUN:2565): where the member before member j was laid over j's row and j is
 *  not laid from its end, the one before is laid again in its row alone, which settles in turn the pair before it (today's
 *  relay ends a lay, and the lay's end settles its own lead: a row three members share comes back whole), and j again from
 *  where it now ends, alone too */
export function settleBack(
  out: FlowLay[],
  members: readonly FlowMember[],
  j: number,
  layOne: (m: FlowMember, before: FlowLay | undefined, noOver: boolean) => FlowLay,
): void {
  if (j < 1) return
  const lead = out[j - 1]!.lay,
    got = out[j]!
  const r = relay(
    { id: members[j - 1]!.ord, over: lead.state === 'laid' && !!lead.over, refused: lead.state !== 'laid' },
    {
      refused: got.lay.state !== 'laid',
      ledBy: got.ledBy,
      knob: got.lay.state === 'laid' ? got.lay.lay.layout.knob : null,
      kept: true,
    },
    true,
  )
  if (!r.lead) return
  out[j - 1] = layOne(members[j - 1]!, out[j - 2], true)
  settleBack(out, members, j - 1, layOne)
  // (laid again as today's relay lays a unit: never over the row after it, noOver)
  if (r.follower) out[j] = layOne(members[j]!, out[j - 1], true)
}
