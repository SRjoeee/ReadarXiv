import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { unitId } from '../../src/source/id.ts'
import type { Piece } from '../../src/source/types.ts'

/** the id as the baseline's FORMAT.md §2 states it, over the flat tagged list */
const reference = (kind: string, flat: unknown[]) =>
  createHash('sha256')
    .update(JSON.stringify([kind, flat]), 'utf8')
    .digest('hex')

describe('unitId: the content id, its piece walk iterative', () => {
  it('tags text, elements, spans (with and without their open or close) and nested units in the source order', () => {
    const content: Piece[] = [
      { t: 'text', s: 'A ' },
      { t: 'el', id: 'e0', kind: 'math', src: '$x$' },
      { t: 'span', id: 's1', style: 'bold', open: '\\textbf{', close: '}', content: [{ t: 'text', s: 'b' }] },
      { t: 'span', id: 's2', style: 'group', close: '}', content: [{ t: 'text', s: 'cut' }] },
      { t: 'unit', id: 'u3', unit: 'abc', pre: '\\footnote{', post: '}' },
    ]
    expect(unitId('para', content)).toBe(
      reference('para', [
        ['t', 'A '],
        ['p', '$x$'],
        ['o', '\\textbf{'],
        ['t', 'b'],
        ['c', '}'],
        ['t', 'cut'],
        ['c', '}'],
        ['n', '\\footnote{', 'abc', '}'],
      ]),
    )
  })
  it('names a unit of spans nested 20,000 deep, as the flat list it stands for', () => {
    const n = 20_000
    let inner: Piece[] = [{ t: 'text', s: 'deep' }]
    for (let k = 0; k < n; k++)
      inner = [{ t: 'span', id: `s${k}`, style: 'group', open: '{', close: '}', content: inner }]
    const flat = [...Array(n).fill(['o', '{']), ['t', 'deep'], ...Array(n).fill(['c', '}'])]
    expect(unitId('para', inner)).toBe(reference('para', flat))
  })
})
