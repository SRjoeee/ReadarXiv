// @vitest-environment node
// The parity's counterfactual for lane url-join (lab/typeset/parity/unjoin.mjs, the coordinator's ruling of 2026-11-10): the
// elements of the candidate's parts the engine reads as one word as written (literal, a copy with no white space), each given
// back the text a run without that rule read off the same glyphs, a space at each line end, where the two differ by white
// space alone; nothing else. Synthetic parts only.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { withUnjoined, wordsUnjoined } from '../../lab/typeset/parity/unjoin.mjs'

type El = { kind: string; literal?: number; copy?: string; text?: string; fills?: [string, number][]; ink?: number[][] }
const partOf = (members: { ord: number; els: [string, El][] }[]) => ({ flows: [members.map((m) => ({ ...m, kind: 'para' }))] })
const url = (text: string, o: Partial<El> = {}): El => ({ kind: 'other', literal: 1, copy: 'https://a.io/lo/ng', text, ...o })

describe("the parity's lay with a URL's line ends read as spaces again (lane url-join)", () => {
  it("finds a URL whose text the run without the rule read with a space at its line end, and that one alone", () => {
    const now = new Map([[3, partOf([{ ord: 7, els: [['2', url('https://a.io/lo/ng')], ['4', { kind: 'cite', copy: '[1]', text: 'A et al.' }]] }])]])
    const was = new Map([[3, partOf([{ ord: 7, els: [['2', url('https://a.io/ lo/ng')], ['4', { kind: 'cite', copy: '[1]', text: 'A et al.' }]] }])]])
    const found = wordsUnjoined(now, was)
    expect(found.map((f: { page: number; ord: number; text: string }) => [f.page, f.ord, f.text])).toEqual([[3, 7, 'https://a.io/ lo/ng']])
  })
  it('a mark TeX sets as written whose copy holds no white space too; a copy with a space, another text, or no prior: none', () => {
    const doi = { kind: 'other', literal: 1, copy: '10.1/x-2' }
    const now = new Map([
      [
        1,
        partOf([
          { ord: 1, els: [['1', { ...doi, text: '10.1/x-2' }]] },
          { ord: 2, els: [['1', { kind: 'code', literal: 1, copy: 'a b', text: 'a b' }]] },
          { ord: 3, els: [['1', url('https://a.io/lo/ng')]] },
          { ord: 4, els: [['1', url('https://a.io/lo/ng')]] },
        ]),
      ],
    ])
    const was = new Map([
      [
        1,
        partOf([
          { ord: 1, els: [['1', { ...doi, text: '10.1/x- 2' }]] },
          { ord: 2, els: [['1', { kind: 'code', literal: 1, copy: 'a b', text: 'a  b' }]] },
          { ord: 3, els: [['1', url('https://a.io/ lo/nx')]] },
        ]),
      ],
    ])
    expect(wordsUnjoined(now, was).map((f: { ord: number }) => f.ord)).toEqual([1])
    expect(wordsUnjoined(now, null)).toEqual([])
  })
  it('lays with the prior text and runs, then puts the candidate\'s back, whatever the lay does', () => {
    const el = url('https://a.io/lo/ng', { fills: [['https://a.io/lo/ng', 128]] })
    const now = new Map([[3, partOf([{ ord: 7, els: [['2', el]] }])]])
    const was = new Map([[3, partOf([{ ord: 7, els: [['2', url('https://a.io/ lo/ng', { fills: [['https://a.io/ lo/ng', 128]] })]] }])]])
    const seen = withUnjoined(wordsUnjoined(now, was), () => [el.text, el.fills?.[0]?.[0]])
    expect(seen).toEqual(['https://a.io/ lo/ng', 'https://a.io/ lo/ng'])
    expect([el.text, el.fills?.[0]?.[0]]).toEqual(['https://a.io/lo/ng', 'https://a.io/lo/ng'])
    expect(() =>
      withUnjoined(wordsUnjoined(now, was), () => {
        throw new Error('lay')
      }),
    ).toThrow('lay')
    expect(el.text).toBe('https://a.io/lo/ng')
  })
})
