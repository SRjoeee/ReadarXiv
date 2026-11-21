// F9 S.relay settles back a row three members share (review of #606, Codex's finding on flow.ts): the middle member laid
// again in its row alone and left unfit makes the first, laid over the middle one's row, be laid again too (today's
// settleLeadOf RUN:2550-2558: a relay ends a lay, and that lay's end settles its own lead).
import { describe, expect, it } from 'vitest'
import { type FlowLay, type FlowMember, settleBack } from '../../src/lay/flow.ts'

const laid = (ord: number, over: boolean): FlowLay =>
  ({ ord, lay: { state: 'laid', over, lay: { layout: { knob: 'base' } } }, slots: [] }) as unknown as FlowLay
const refused = (ord: number): FlowLay => ({ ord, lay: { state: 'unfit' }, slots: [] }) as unknown as FlowLay

describe('settleBack', () => {
  it('lays the first member again where the middle one, laid again alone, is left unfit', () => {
    const members = [0, 1, 2].map((ord) => ({ ord }) as unknown as FlowMember)
    const calls: string[] = []
    const layOne = (m: FlowMember, _b: FlowLay | undefined, noOver: boolean): FlowLay => {
      calls.push(`${m.ord}${noOver ? ' alone' : ''}`)
      if (m.ord === 0) return laid(0, !noOver)
      if (m.ord === 1) return noOver ? refused(1) : laid(1, true)
      return refused(2)
    }
    const out = [laid(0, true), laid(1, true), refused(2)]
    settleBack(out, members, 2, layOne)
    // (2 unfit under 1's overhang: 1 alone, unfit; then 0 over 1's row: 0 alone, 1 again from where 0 ends, alone; then 2
    // again from where 1 now ends, alone: today's relay of each)
    expect(calls).toEqual(['1 alone', '0 alone', '1 alone', '2 alone'])
    expect(out[0]!.lay.state).toBe('laid')
    expect((out[0]!.lay as { over?: boolean }).over).toBe(false)
  })
  it('leaves a row whose follower is laid from its lead’s end as it is', () => {
    const members = [0, 1].map((ord) => ({ ord }) as unknown as FlowMember)
    const out = [laid(0, true), { ...laid(1, false), ledBy: 0 }]
    settleBack(out, members, 1, () => {
      throw new Error('no lay again')
    })
    expect(out.map((x) => x.lay.state)).toEqual(['laid', 'laid'])
  })
})
