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
    const before = out[i - 1]
    let got = layOne(m, before, false)
    // F9 S.relay: the member before laid over this one's row, and this one not laid from its end
    if (before && i > 0) {
      const lead = before.lay
      const r = relay(
        { id: members[i - 1]!.ord, over: lead.state === 'laid' && !!lead.over, refused: lead.state !== 'laid' },
        {
          refused: got.lay.state !== 'laid',
          ledBy: got.ledBy,
          knob: got.lay.state === 'laid' ? got.lay.lay.layout.knob : null,
          kept: true,
        },
        true,
      )
      if (r.lead) {
        out[i - 1] = layOne(members[i - 1]!, out[i - 2], true)
        if (r.follower) got = layOne(m, out[i - 1], false)
      }
    }
    out.push(got)
  })
  return out
}
