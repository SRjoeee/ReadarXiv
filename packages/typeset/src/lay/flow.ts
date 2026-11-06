// layFlow's composition over prepared members (design-b §1.6 L8: F1-F9 for each member in order): a member that continues the
// one before it on a shared line starts where that one's translation ends on the row (S.rowStart, F1, over the member
// before's share and blocks), then is laid (layMember: F2-F8, L9); where the member before was laid over this one's first row
// (S.overFollower) and this one is left the original's, not laid from its end, or laid from it only below its floor, the
// member before is laid again in its row alone and this one again from where it now ends (S.relay, F9: never taken on the
// corpus; a row of three is settled back one pair at a time). A member is prepared from its part (L5-L7: the unit's rules,
// the tokens) by the adapter; the composition reads nothing else.
import type { FitBlock } from '../fit/types.ts'
import type { FillLaid } from '../shared/fill-page.types.ts'
import { relay } from '../shared/relay.ts'
import { type Row, rowStart } from '../shared/row-start.ts'
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
  members.forEach((m, i) => {
    out.push(layOne(m, out[i - 1], false))
    settleBack(out, members, i, layOne)
  })
  return out
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
