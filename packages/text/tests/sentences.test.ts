import { describe, expect, it } from 'vitest'
import { sentenceCuts } from '../src/index.ts'

const OBJ = '￼'

describe('sentenceCuts over a projection', () => {
  it('cuts where a sentence begins, and nowhere in one', () => {
    expect(sentenceCuts('One sentence. Two here.')).toEqual([14])
    expect(sentenceCuts('Only one sentence here.')).toEqual([])
    expect(sentenceCuts('')).toEqual([])
  })
  it('an abbreviation ends no sentence; et al. does where a capital follows a new sentence', () => {
    expect(sentenceCuts('See Fig. 2 for details. Then more.')).toEqual([24])
    expect(sentenceCuts('By Smith et al. [3], we see it.')).toEqual([])
    expect(sentenceCuts('Oregon v. Mitchell held it. Next.')).toEqual([28])
    expect(sentenceCuts('As in App. B we show it. Done.')).toEqual([25])
  })
  it('an annotation belongs to the sentence before it; a formula reads as a word', () => {
    const p = `It holds.${OBJ} We go on.`
    expect(sentenceCuts(p, (at) => (at === 9 ? 'annotation' : undefined))).toEqual([11])
    const q = `Let ${OBJ} be a vertex. Then ${OBJ} holds.`
    expect(sentenceCuts(q, () => 'x')).toEqual([q.indexOf('Then')])
  })
  it("a full stop inside an element's own text cuts nothing", () => {
    const p = `As shown ${OBJ} the claim holds. Next one.`
    expect(sentenceCuts(p, () => '[11, Ex. 2.6]')).toEqual([p.indexOf('Next')])
  })
})
