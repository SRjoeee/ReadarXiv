// @vitest-environment node
// The parity's rows (packages/typeset/tests/replay/l1.ts addressedRow): today's stored row of a unit whose addresses v2's unit
// of the same glyphs holds as elements (addressedJoin), said in v2's unit: the same translation, each address the element v2
// holds for it where the translator kept it, the groups today's unit had round the addresses (empty in the row: Microsoft moved
// them to its end) gone with them, and the row's sentences counted in v2's projection. Where the row cannot be said exactly so,
// none. Synthetic units and rows.
import { describe, expect, it } from 'vitest'
import { addressedRow } from '../../packages/typeset/tests/replay/l1.ts'

const url = (a: string, id: string) => ({ t: 'el' as const, id, kind: 'url', src: `\\url{${a}}` })
const text = (s: string) => ({ t: 'text' as const, s })
/** today's prepared unit: its flat pieces, the ones its door row's numbers name */
const today = (pieces: { kind: string; s?: string }[]) => ({ ord: 107, id: 'x', kind: 'inknotes', text: pieces.map((p) => p.s ?? '').join(''), pieces, lines: [] })
const unit = (content: object[], sentences = false) => ({ id: 'v', kind: 'inknotes', content, ...(sentences ? { sentences: true } : {}) }) as never

describe("today's row of a unit, said in v2's unit that holds its addresses as elements", () => {
  // (2609.36054v2 p1 t107: today's grey groups round the addresses, Microsoft's row its translation then 1, 3, 5, 7: the groups
  // moved to its end, empty)
  const t107 = today([
    { kind: 'text', s: '*Correspondence to: ' },
    { kind: 'open' },
    { kind: 'text', s: 'alan@gov.ai' },
    { kind: 'close' },
    { kind: 'text', s: ' and ' },
    { kind: 'open' },
    { kind: 'text', s: 'soren@casp.ac.' },
    { kind: 'close' },
    { kind: 'text', s: ' The views are ours.' },
  ])
  const v108 = unit([text('*Correspondence to: '), url('alan@gov.ai', '1'), text(' and '), url('soren@casp.ac', '3'), text('. The views are ours.')])

  it('each address the element v2 holds for it, where the translation keeps it; the empty groups gone', () => {
    const got = addressedRow([107, ['*通信对象：alan@gov.ai 和 soren@casp.ac。观点是我们的。', 1, 3, 5, 7], 'whole', 'microsoft'], t107, v108)
    expect(got).toEqual({
      content: [text('*通信对象：'), { t: 'el', id: '1' }, text(' 和 '), { t: 'el', id: '3' }, text('。观点是我们的。')],
    })
  })
  it('none where the translation does not hold an address as it went, or holds it twice', () => {
    expect(addressedRow([107, ['*通信对象：alan 和 soren@casp.ac。', 1, 3, 5, 7], 'whole', 'microsoft'], t107, v108)).toBeNull()
    expect(addressedRow([107, ['alan@gov.ai alan@gov.ai soren@casp.ac', 1, 3, 5, 7], 'whole', 'microsoft'], t107, v108)).toBeNull()
  })
  it("none where a group of today's holds translated text: v2's unit has no group for it", () => {
    expect(addressedRow([107, ['*通信对象：', 1, 'alan@gov.ai', 3, ' 和 soren@casp.ac。'], 'whole', 'microsoft'], t107, v108)).toBeNull()
  })
  it("the row's sentences counted in v2's projection: each address one character, as an element is", () => {
    // ("Write to a@b.c. Then go.": the second sentence at 16 in today's text, 12 in v2's ("Write to " 9, the address one, ". "
    // 2); its translation's at 9 in today's row, 5 in v2's)
    const t = today([{ kind: 'text', s: 'Write to a@b.c. Then go.' }])
    const v = unit([text('Write to '), url('a@b.c', '1'), text('. Then go.')], true)
    const got = addressedRow([1, ['写信给a@b.c。然后走。'], 'whole', 'microsoft', { src: [16], tr: [9] }], t, v)
    expect(got).toEqual({ content: [text('写信给'), { t: 'el', id: '1' }, text('。然后走。')], sentences: { src: [12], tr: [5] } })
  })
})
