// lab/typeset/gate-rows.mjs: the reader gate gives the entry a stored row as the product's chain reads one. The product never lays a
// reading its acceptance rule refuses (@readarxiv/translate's `accept`): its chain asks the next translator, or leaves the unit the
// original's. A gate that lays such a row draws what the reader never shows: a figure text whose reply lost its element, the
// element's ink kept where TeX set it and the reply's text laid over it (2610.19159v1-ja p51 on the door's rows)
import type { OutPiece, Unit } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { rowJudge } from '../../lab/typeset/gate-rows.mjs'

/** a unit of text and one element after it, as the prepare states a figure text that ends with a reference */
const unit: Unit = {
  id: 'a'.repeat(64),
  kind: 'para',
  content: [
    { t: 'text', s: 'Agent action: revise the discussion (' },
    { t: 'el', id: '1', kind: 'other', src: '\\ref{sec}' },
  ],
}
const text = (s: string): OutPiece => ({ t: 'text', s })

describe('the reader gate’s rows, judged by the product’s acceptance rule', () => {
  it('withholds a row the rule refuses for its elements, the unit left the original’s, the row counted once by its reason', () => {
    const judge = rowJudge()
    // (the reply lost its element: the chain refuses it, 'elements')
    const lost = [text('Revidieren Sie die Diskussion (')]
    expect(judge.takes('p-zh', unit, lost)).toBe(false)
    // (the gate reads a row for its runner, the entry and a name's lead: counted once)
    expect(judge.takes('p-zh', unit, lost)).toBe(false)
    expect(judge.withheld()).toEqual([{ pair: 'p-zh', kind: 'para', id: unit.id, why: 'elements' }])
  })
  it('withholds a reading that says nothing, as before', () => {
    const judge = rowJudge()
    expect(judge.takes('p-zh', unit, [text('( '), { t: 'el', id: '1' }])).toBe(false)
    expect(judge.withheld().map((x) => x.why)).toEqual(['empty'])
  })
  it('gives a row the rule accepts, and counts nothing', () => {
    const judge = rowJudge()
    expect(judge.takes('p-zh', unit, [text('Revidieren Sie die Diskussion ('), { t: 'el', id: '1' }])).toBe(true)
    expect(judge.withheld()).toEqual([])
  })
})
