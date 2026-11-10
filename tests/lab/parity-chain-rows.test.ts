// @vitest-environment node
// The parity's v2 rows are the door's replies as v2 reads a reply (lab/typeset/parity/rows.mjs readAsChain): the translate
// package's chain reads every accepted reply with its groups placed back where the translation states them
// (packages/translate/src/groups.ts placeGroups), so the parity hands v2 today's stored reply read so, as the reader would
// get it from the chain; today's side keeps today's reading of the same reply. Synthetic units and rows.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { readAsChain } from '../../lab/typeset/parity/rows.mjs'

const unit = {
  id: 'u',
  kind: 'para',
  content: [
    { t: 'text', s: 'Only ' },
    { t: 'span', id: '1', style: 'bold', open: '\\textbf{', close: '}', content: [{ t: 'text', s: '(B1)' }] },
    { t: 'text', s: ' is required.' },
  ],
}

describe("the parity's v2 rows: the door's replies read as the chain reads a reply", () => {
  it("places a group today's reply moved to its end, empty, around its own text", () => {
    const door = { id: 'u', ok: true, by: 'microsoft', content: [{ t: 'text', s: '只需 （B1） 。' }, { t: 'span', id: '1', content: [] }] }
    const rows = readAsChain({ get: (k: string) => (k === 'u' ? door : undefined), done: true }, new Map([['u', unit]]))
    expect(rows.get('u').content).toEqual([
      { t: 'text', s: '只需 ' },
      { t: 'span', id: '1', content: [{ t: 'text', s: '（B1）' }] },
      { t: 'text', s: ' 。' },
    ])
    expect(rows.done).toBe(true)
  })
  it('gives every other row as it is: a failed one, one of a unit the bundle does not hold', () => {
    const failed = { id: 'u', ok: false, why: { kind: 'refused' } }
    const rows = readAsChain({ get: () => failed, done: false }, new Map([['u', unit]]))
    expect(rows.get('u')).toBe(failed)
    const other = { id: 'x', ok: true, by: 'm', content: [{ t: 'text', s: 'x' }] }
    expect(readAsChain({ get: () => other, done: true }, new Map()).get('x')).toBe(other)
  })
})
