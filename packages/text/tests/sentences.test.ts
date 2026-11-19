import { describe, expect, it } from 'vitest'
import { opensAfter, sentenceCuts } from '../src/index.ts'

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
  // (MONTH: Intl.Segmenter cuts after "Jan. " where no lower-case word follows the number before the next stop or capital, and
  // a year that ends its sentence, "2020.", is no numbered part's number (NUMBERED): the month's abbreviation alone keeps it)
  it("a month's abbreviation before its day or year ends no sentence, where a word's full stop before a year does", () => {
    const p = 'The data were collected in Jan. 2020. A second set followed.'
    expect(sentenceCuts(p)).toEqual([p.indexOf('A second')])
    const q = 'The data were collected in winter. 2020. A second set followed.'
    expect(sentenceCuts(q)).toEqual([q.indexOf('2020'), q.indexOf('A second')])
  })
  // (MONTH is CLDR's English abbreviated months, Intl.DateTimeFormat's `short` months of en and en-GB (en-GB's Sept), but those
  // whose abbreviation is the month's name itself (May): each keeps its sentence whole before a year that ends it, May. does not)
  it("the months whose abbreviation keeps a sentence whole are CLDR's English abbreviated months", () => {
    const months = (locale: string, month: 'short' | 'long') =>
      Array.from({ length: 12 }, (_, m) =>
        new Intl.DateTimeFormat(locale, { month, timeZone: 'UTC' }).format(new Date(Date.UTC(2020, m, 15))),
      )
    const abbreviated = new Set<string>()
    const unabbreviated = new Set<string>()
    for (const locale of ['en', 'en-GB']) {
      const long = months(locale, 'long')
      for (const [m, a] of months(locale, 'short').entries()) (a === long[m] ? unabbreviated : abbreviated).add(a)
    }
    expect(abbreviated.size).toBe(12)
    const whole = (a: string) =>
      sentenceCuts(`The data were collected in ${a}. 2020. A second set followed.`).length === 1
    for (const a of abbreviated) expect(whole(a), a).toBe(true)
    for (const a of unabbreviated) expect(whole(a), a).toBe(false)
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
  // (a TeX source's line end inside a paragraph is a space, as HTML's is: Intl.Segmenter breaks at every one, and the PDF's
  // units carry the source's own lines; 34,791 of the 88 corpus papers' 71,288 cuts stood at one with no stop before it)
  it('a line end in the text is a space: no sentence ends there; an empty line, a paragraph’s end, is one', () => {
    const p = 'We show the standard\ndeviations of the layer\r\nresponses.\nThe rest follows.'
    expect(sentenceCuts(p)).toEqual([p.indexOf('The')])
    const q = 'The prompt reads as follows \n\n  Given the question, answer it'
    expect(sentenceCuts(q)).toEqual([q.indexOf('\n') + 1])
    // (a break an element stands for still cuts: its stand-in is a line end)
    const r = `First line${OBJ}second line`
    expect(sentenceCuts(r, () => '\n')).toEqual([r.indexOf('second')])
  })
  // (Microsoft's own boundaries over the stored rows: a citation after a stop and white space, then a lower-case word, opens
  // the next sentence 54 of 54 times after a sentence's last word, 0 of 11 after an abbreviation's)
  it('a citation after a sentence’s stop and white space opens the next sentence; set against the sentence, it annotates it', () => {
    const cite = () => 'citation'
    const opens = `This is as shown. ${OBJ} reports that it fails. Then more.`
    expect(sentenceCuts(opens, cite)).toEqual([opens.indexOf(OBJ), opens.indexOf('Then')])
    const abbreviation = `Pham et al. ${OBJ} classify the examples. Then more.`
    expect(sentenceCuts(abbreviation, cite)).toEqual([abbreviation.indexOf('Then')])
    const example = `See e.g. ${OBJ} for a survey. Then more.`
    expect(sentenceCuts(example, cite)).toEqual([example.indexOf('Then')])
    const against = `It holds.${OBJ} We go on.`
    expect(sentenceCuts(against, cite)).toEqual([against.indexOf('We')])
    const before = `As shown ${OBJ}. Then more.`
    expect(sentenceCuts(before, cite)).toEqual([before.indexOf('Then')])
    const tied = `As in Ref.${OBJ}${OBJ} we see it. Then more.`
    expect(sentenceCuts(tied, (at) => (at === tied.indexOf(OBJ) ? undefined : 'citation'))).toEqual([
      tied.indexOf('Then'),
    ])
    // (where no word in lower case follows it, what follows decides as before: a comma goes on, a capital opens the next)
    const comma = `MoH = Model or Harness? ${OBJ}, LRB = LayerRAG-Bench.`
    expect(sentenceCuts(comma, cite)).toEqual([])
    const capital = `It holds. ${OBJ} We go on.`
    expect(sentenceCuts(capital, cite)).toEqual([capital.indexOf('We')])
  })
})

// (a title an author sets at a paragraph's opening with no stop after it, `\textbf{Global Matching} We leverage …`, the display
// design's F40: the place may end a sentence though nothing ends it there, as after an abbreviation that may end one, where
// what follows decides; words of our own)
describe('opensAfter: where a sentence opens after a place that may end one with no stop of its own', () => {
  const end = (s: string, title: string) => s.indexOf(title) + title.length
  it('opens at a word that begins a sentence: its offset', () => {
    const p = 'Global Matching We leverage the model.'
    expect(opensAfter(p, end(p, 'Matching'))).toBe(p.indexOf('We'))
  })
  it('opens at none where what follows goes on: lower case, a digit, an opening bracket', () => {
    for (const [p, title] of [
      ['RQ1 concerns the forecast.', 'RQ1'],
      ['Results 3 models were trained.', 'Results'],
      ['A tree learner (Section 3). One model.', 'learner'],
    ] as const)
      expect(opensAfter(p, end(p, title))).toBeNull()
  })
  it('reads the elements between the place and the text as no text: a citation hides no start, nor a lower-case word', () => {
    const cite = () => 'citation'
    const opens = `T5 ${OBJ} We propose a model.`
    expect(opensAfter(opens, 2, cite)).toBe(opens.indexOf('We'))
    const subject = `COIN ${OBJ} is a dataset.`
    expect(opensAfter(subject, 4, cite)).toBeNull()
  })
  it('opens at none where the place ends with an abbreviation’s letter, as the cutter merges one (`Model A We …`)', () => {
    const p = 'Model A We see.'
    expect(opensAfter(p, end(p, 'A'))).toBeNull()
  })
  it('opens at none where nothing follows', () => {
    expect(opensAfter('Global Matching ', 15)).toBeNull()
    expect(opensAfter(`Global Matching ${OBJ}`, 15, () => 'x')).toBeNull()
  })
})
