// @vitest-environment node
// The gate of `silent` (lab/pdf/prepare-back/silent-gate.mjs, run by run.mjs, exit 5): an element a unit states sets nothing
// where it stands may have no placement in a part that states ink or a text TeX set for it. Units and parts of my own.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { silentInkOf } from '../../lab/pdf/prepare-back/silent-gate.mjs'

const unit = { id: 'u1', kind: 'para', content: [{ t: 'text', s: 'A ' }, { t: 'el', id: '1', kind: 'macro', src: '\\fi', silent: 1 }, { t: 'span', id: '2', style: 'bold', content: [{ t: 'el', id: '3', kind: 'other', src: '\\bfseries', silent: 1 }] }, { t: 'el', id: '4', kind: 'macro', src: '\\x' }] }
const part = (els: [string, object][]) => ({ flows: [[{ ord: 0, text: 'u1', els }]] })

describe('the gate of silent', () => {
  it('passes a silent element every placement of which states no ink and a text of nothing, or none', () => {
    expect(silentInkOf([unit], [part([['1', { kind: 'umacro', ink: [], text: '' }], ['3', { kind: 'zero', ink: [] }]])]).count).toBe(0)
    // (and one in no part: nothing to contradict it)
    expect(silentInkOf([unit], []).count).toBe(0)
  })
  it('fails one a placement of which states ink, or a text TeX set, a group’s element among them', () => {
    const got = silentInkOf([unit], [part([['1', { kind: 'umacro', ink: [], text: 'x' }]]), part([['3', { kind: 'zero', ink: [[1, 0, 0, 1, 1, 0]] }]])])
    expect(got).toEqual({ count: 2, rows: [['u1', '1', 'text'], ['u1', '3', 'ink']] })
  })
  it('reads no element that is not silent, whatever its part states', () => {
    expect(silentInkOf([unit], [part([['4', { kind: 'umacro', ink: [[1, 0, 0, 1, 1, 0]], text: 'x' }]])]).count).toBe(0)
  })
})
