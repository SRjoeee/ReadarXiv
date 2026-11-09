// layFlow's composition over prepared members (design-b §1.6 L8: F1-F9 for each member in order): a member that continues the
// one before it on a shared line starts where that one's translation ends on the row (S.rowStart, F1, over the member
// before's share and blocks), then is laid (layMember: F2-F8, L9); where the member before was laid over this one's first row
// (S.overFollower) and this one is left the original's, not laid from its end, or laid from it only below its floor, the
// member before is laid again in its row alone and this one again from where it now ends (S.relay, F9: never taken on the
// corpus; a row of three is settled back one pair at a time). A line of TeX's several members share whole, which TeX set
// centred or flush right (RowLine), is laid as one run: its members run on as on any shared row, the run then placed as TeX
// placed the line (layLine). A member is prepared from its part (L5-L7: the unit's rules, the tokens) by the adapter; the
// composition reads nothing else.
import { hangOf } from '../breaker/break.types.ts'
import type { FitBlock } from '../fit/types.ts'
import type { FillLaid } from '../shared/fill-page.ts'
import { relay } from '../shared/relay.ts'
import { lineRoom, lineShift, type Row, type RowLine, rowStart } from '../shared/row-start.ts'
import { shareOf } from '../shared/share.ts'
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
 * A line of TeX's its members share whole, set centred or flush right, laid as one run (the owner's: a translated author
 * line reflows as one line, its names, marks and separators run together, set as TeX set that line). Each member laid by
 * itself, a name stood centred on its own original's middle: the translations, shorter, left a hole before each (2610.21106v1
 * p1, amsart's "NI XIANG AND YUNI XIONG", 36 pt where TeX set 3.3). TeX centred the line as a whole: an hbox of its content
 * at its natural width, then placed. So here: the members laid as a run from the room's start (the first at it, each after
 * the one before from its ink's end at TeX's separation, S.rowStart, every one ragged to the room's end), its extent read off
 * the lay (the first one's start to the last one's end, a closing mark's blank half that hangs aside, as a centred line's
 * placing has it), then laid again from where that run stands centred on the line's middle, or ends at its end. The room
 * holds the run's width either way, so the second lay is the first one moved. Null, the members laid as before, where the run
 * is not one line: a member not laid, laid on more lines than its one, or not laid from the one before (a label carried with
 * its line, U.decor's)
 */
function layLine(
  row: readonly FlowMember[],
  layOne: (m: FlowMember, before: FlowLay | undefined, noOver: boolean) => FlowLay,
): FlowLay[] | null {
  const line = row[0]!.line!
  const [lo, hi] = lineRoom(line, line.left, row.at(-1)!.line!.right)
  // (each member's line ragged to the room's end; the first from `start`, each after it from where the one before ends)
  const asRun = (start: number): FlowMember[] =>
    row.map((m, k) => {
      const b0 = m.blocks[0]!
      const b: FitBlock = {
        ...b0,
        centred: false,
        flush: 'left',
        measures: null,
        indent: 0,
        x1: hi,
        ...(k === 0 ? { x0: lo, start } : { x0: b0.rects[0]![1]! }),
      }
      return { ...m, blocks: [b, ...m.blocks.slice(1)] }
    })
  const lay = (ms: FlowMember[]): FlowLay[] => {
    const o: FlowLay[] = []
    ms.forEach((m, k) => {
      o.push(layOne(m, o[k - 1], false))
      settleBack(o, ms, k, layOne)
    })
    return o
  }
  // (the run's extent: its first member's start to its last one's end, each laid on its one line, each after the first from
  // the one before)
  const extent = (o: FlowLay[]): [number, number] | null => {
    const ls = o.map((x) => (x.lay.state === 'laid' ? x.lay.lay.layout : null))
    if (o.some((x, k) => k > 0 && x.ledBy === undefined) || ls.some((L) => L?.lines.length !== 1)) return null
    const a = ls[0]!.lines[0]!,
      L = ls.at(-1)!,
      z = L.lines[0]!
    return [a.x0, z.x0 + z.used! - hangOf(z.items.at(-1), L.state.compress) * L.f]
  }
  const first = extent(lay(asRun(lo)))
  if (!first) return null
  const run = lay(asRun(lo + lineShift(line, first[0], first[1])))
  if (!extent(run)) return null
  // (the run's end held as the run laid it: the page's fill sets none of the run's members further right, the last one as no
  // member laid before another on a row (S.share, keepsShare); grown by its tracking, the last name moved the run's end and the
  // line off where TeX set it, 2610.10069v1 p1's third name 5.7 pt, its line 3.2 pt right of TeX's middle)
  const z = run.at(-1)!.lay
  if (z.state === 'laid' && !z.lay.share) {
    const b = z.lay.blocks[0]!
    z.lay.share = shareOf(
      z.lay.layout,
      z.lay.blocks,
      { page: b.page, baseline: b.B[0]!, size: b.sizes?.[0] ?? z.lay.s },
      z.lay.P.measure,
    )
  }
  return run
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
