// @vitest-environment node
// The parity's rows (packages/typeset/tests/replay/l1.ts keptRow): today's stored row of a unit whose kept runs v2's unit of
// the same glyphs holds as elements where today's held their ink otherwise (keptJoin: an address as text, a script TeX set in a
// text face as text or part text, part placeholder), said in v2's unit: the same translation, each element where the
// translator kept what today's held for it, the groups today's unit had round the addresses (empty in the row: Microsoft moved
// them to its end) gone with them, and the row's sentences counted in v2's projection. Where the row cannot be said exactly so,
// none. Synthetic units and rows.
import { describe, expect, it } from 'vitest'
import { keptRow } from '../../packages/typeset/tests/replay/l1.ts'

const url = (a: string, id: string) => ({ t: 'el' as const, id, kind: 'url', src: `\\url{${a}}` })
const text = (s: string) => ({ t: 'text' as const, s })
/** today's prepared unit: its flat pieces, the ones its door row's numbers name */
const today = (pieces: { kind: string; s?: string; src?: string }[]) => ({ ord: 107, id: 'x', kind: 'inknotes', text: pieces.map((p) => p.s ?? '').join(''), pieces, lines: [] })
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
    const got = keptRow([107, ['*通信对象：alan@gov.ai 和 soren@casp.ac。观点是我们的。', 1, 3, 5, 7], 'whole', 'microsoft'], t107, v108)
    expect(got).toEqual({
      content: [text('*通信对象：'), { t: 'el', id: '1' }, text(' 和 '), { t: 'el', id: '3' }, text('。观点是我们的。')],
    })
  })
  it('none where the translation does not hold an address as it went, or holds it twice', () => {
    expect(keptRow([107, ['*通信对象：alan 和 soren@casp.ac。', 1, 3, 5, 7], 'whole', 'microsoft'], t107, v108)).toBeNull()
    expect(keptRow([107, ['alan@gov.ai alan@gov.ai soren@casp.ac', 1, 3, 5, 7], 'whole', 'microsoft'], t107, v108)).toBeNull()
  })
  it("none where a group of today's holds translated text: v2's unit has no group for it", () => {
    expect(keptRow([107, ['*通信对象：', 1, 'alan@gov.ai', 3, ' 和 soren@casp.ac。'], 'whole', 'microsoft'], t107, v108)).toBeNull()
  })
  it("the row's sentences counted in v2's projection: each address one character, as an element is", () => {
    // ("Write to a@b.c. Then go.": the second sentence at 16 in today's text, 12 in v2's ("Write to " 9, the address one, ". "
    // 2); its translation's at 9 in today's row, 5 in v2's)
    const t = today([{ kind: 'text', s: 'Write to a@b.c. Then go.' }])
    const v = unit([text('Write to '), url('a@b.c', '1'), text('. Then go.')], true)
    const got = keptRow([1, ['写信给a@b.c。然后走。'], 'whole', 'microsoft', { src: [16], tr: [9] }], t, v)
    expect(got).toEqual({ content: [text('写信给'), { t: 'el', id: '1' }, text('。然后走。')], sentences: { src: [12], tr: [5] } })
  })
})

describe("today's row of a unit, said in v2's unit that holds its scripts as elements", () => {
  // (2610.20967v1 p1 t123: the names' marks, `$^{1}$` and `$^{1,2}$` under Times, today's text but for the math-italic comma's
  // placeholder ",2"; v2's ink unit holds each mark an element, rebuild/script-face)
  const math = (src: string, id: string) => ({ t: 'el' as const, id, kind: 'math', src })
  const t123 = today([
    { kind: 'text', s: 'Song-Ze Yu1, Fang-Duo Tsai1' },
    { kind: 'ph', src: '$,2$' },
    { kind: 'text', s: ', Yi-Hsuan Yang1' },
  ])
  const v124 = unit([text('Song-Ze Yu'), math('$^{1}$', '1'), text(', Fang-Duo Tsai'), math('$^{1,2}$', '3'), text(', Yi-Hsuan Yang'), math('$^{1}$', '5')])

  it("each mark the element v2 holds for it where the translation keeps what today's held for it, text and placeholder", () => {
    expect(keptRow([123, ['余宋泽1，蔡方多1', 1, '，杨怡萱1'], 'whole', 'microsoft'], t123, v124)).toEqual({
      content: [text('余宋泽'), { t: 'el', id: '1' }, text('，蔡方多'), { t: 'el', id: '3' }, text('，杨怡萱'), { t: 'el', id: '5' }],
    })
  })
  it('none where a mark could stand at two places of the translation, or where a placeholder of today’s it holds is not there', () => {
    expect(keptRow([123, ['余宋泽1，蔡方多1', 1, '，杨怡萱1（第1）'], 'whole', 'microsoft'], t123, v124)).toBeNull()
    expect(keptRow([123, ['余宋泽1，蔡方多1，杨怡萱1'], 'whole', 'microsoft'], t123, v124)).toBeNull()
  })
  it("the row's sentences counted in v2's projection: each mark one character, as an element is", () => {
    // ("Write to A12. Then go.": the second sentence at 14 in today's text, 13 in v2's (the mark "12" one character); its
    // translation's at 7 in today's row, 6 in v2's)
    const t = today([{ kind: 'text', s: 'Write to A12. Then go.' }])
    const v = unit([text('Write to A'), math('$^{12}$', '1'), text('. Then go.')], true)
    const got = keptRow([1, ['写信给A12。然后走。'], 'whole', 'microsoft', { src: [14], tr: [7] }], t, v)
    expect(got).toEqual({ content: [text('写信给A'), { t: 'el', id: '1' }, text('。然后走。')], sentences: { src: [13], tr: [6] } })
  })
})
