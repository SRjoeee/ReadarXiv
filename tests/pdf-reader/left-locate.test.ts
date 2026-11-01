import { describe, expect, it } from 'vitest'
import { anchorUnits, type DocToken, frameOfTokens, orderOf, placesIn, type TextPage, tokenizeDocument, type UnitText } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { rangedAnchors } from '@/pdf-reader/engine/pipeline/left-part.mjs'
import { inMemory, loadProject } from '@/pdf-reader/engine/source/latex-front.mjs'

// Two roots of units the left located nowhere (the owner's report on 1810.04805v2, 2026-10-30): a unit without marks is searched
// between its marked neighbours, which were read in the units' numbers' order, the bibliography's entries numbered after the
// appendix (page 16: its paragraphs the marks did not bound searched between the appendix's last and an entry on page 10, an
// empty window); and a footnote over a page break owned the next page's column between its two parts (page 4: the headings
// there, matched inside it, placed nowhere)

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number): Item => ({ str, transform: [10, 0, 0, 10, x, y], width: 200, height: 10, hasEOL: true, fontName: 'f' })
/** a page of lines, each one text item at (50, y), and its folio */
const pageOf = (n: number, lines: [string, number][]): TextPage => ({ page: n, items: [item(String(n), 150, 62), ...lines.map(([s, y]) => item(s, 50, y))], styles: {} } as unknown as TextPage)
const words = (doc: DocToken[], f: { tokens: number[] } | null | undefined) => f?.tokens.map(k => doc[k]?.t) ?? null
const bounds = (doc: DocToken[], spans: [number, string, string][]) => {
  const at = (t: string) => doc.findIndex(d => d.t === t)
  return new Map(spans.map(([id, a, b]) => [String(id), [at(a), at(b)] as [number, number]]))
}

describe('the front end: the units in the order TeX sets them (texOrder)', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  it('an appendix after the bibliography: its entries are numbered last, set before the appendix', () => {
    const p = loadProject(inMemory(new Map([['main.tex', enc('\\documentclass{article}\\begin{document}\nThe body of the paper.\n\\begin{thebibliography}{1}\n\\bibitem{a} A first entry of the list.\n\\bibitem{b} A second entry of the list.\n\\end{thebibliography}\n\\appendix\n\\section{More}\nThe appendix text here.\n\\end{document}')]])), 'main.tex')
    const kinds = p.units.map(u => u.kind)
    expect(kinds).toEqual(['para', 'heading', 'para', 'reference', 'reference'])
    expect(p.texOrder).toEqual([0, 3, 4, 1, 2])
  })
  it('nothing moved: null', () => {
    const p = loadProject(inMemory(new Map([['main.tex', enc('\\documentclass{article}\\begin{document}\nOne paragraph.\n\n\\section{A head}\nAnother one.\n\\end{document}')]])), 'main.tex')
    expect(p.texOrder).toBeNull()
  })
  it('orderOf: an order of the units, null where it is their own, refused where it is none', () => {
    expect(orderOf(null, 3)).toBeNull()
    expect(orderOf([0, 1, 2], 3)).toBeNull()
    expect(orderOf([0, 2, 1], 3)).toEqual([0, 2, 1])
    for (const bad of [[0, 1], [0, 1, 1], [0, 1, 3], [0, 1, 1.5]]) expect(() => orderOf(bad, 3), JSON.stringify(bad)).toThrow(TypeError)
    expect([...placesIn([2], [0, 2, 1])]).toEqual([1])
  })
})

// (the bibliography on page 2, the appendix on page 3: its first paragraph marked, the paragraph and the heading after it not; the
// second entry long enough that the search's margin either side of a neighbour, anchors.mjs MARGIN, does not reach across it)
const FILLER = Array.from({ length: 30 }, (_, l) => Array.from({ length: 8 }, (_, w) => `w${l}x${w}`).join(' '))
const BIB = [
  pageOf(1, [['the body of the paper', 700]]),
  pageOf(2, [['alpha first entry text', 700], ['beta second entry text', 688], ...FILLER.map((s, l) => [s, 676 - 12 * l] as [string, number])]),
  pageOf(3, [['marked appendix paragraph words', 700], ['unmarked appendix paragraph here', 676], ['closing head', 652]]),
]
// (numbered as the front end numbers them: the entries last)
const BIB_UNITS: UnitText[] = [
  { id: 0, text: 'the body of the paper' },
  { id: 1, text: 'marked appendix paragraph words' },
  { id: 2, text: 'unmarked appendix paragraph here' },
  { id: 3, text: 'closing head' },
  { id: 4, text: 'alpha first entry text' },
  { id: 5, text: `beta second entry text ${FILLER.join(' ')}` },
]
const BIB_ORDER = [0, 4, 5, 1, 2, 3]
const BIB_BOUNDS: [number, string, string][] = [[0, 'the', 'paper'], [4, 'alpha', 'text'], [5, 'beta', 'w29x7'], [1, 'marked', 'words']]

describe('a unit without marks is searched between its marked neighbours in the order TeX sets the text', () => {
  const doc = tokenizeDocument(BIB)
  const F = frameOfTokens(doc)
  const ordered = BIB_ORDER.map(i => BIB_UNITS[i] as UnitText)
  it('the appendix\'s unmarked paragraph and heading after its last marked unit, the entries numbered after them: found', () => {
    const found = anchorUnits(doc, ordered, { bounds: bounds(doc, BIB_BOUNDS), frame: () => F })
    expect(words(doc, found.get(2))).toEqual(['unmarked', 'appendix', 'paragraph', 'here'])
    expect(words(doc, found.get(3))).toEqual(['closing', 'head'])
    expect(words(doc, found.get(4))).toEqual(['alpha', 'first', 'entry', 'text'])
  })
  it('in the numbers\' order the window between the appendix and the entries is empty (the defect)', () => {
    const found = anchorUnits(doc, BIB_UNITS, { bounds: bounds(doc, BIB_BOUNDS), frame: () => F })
    expect(found.get(2)).toBeNull()
    expect(found.get(3)).toBeNull()
  })
  it('the page stream (rangedAnchors) over the units in that order, each called by its id, is the whole path\'s, whatever order the marks come in', () => {
    const whole = anchorUnits(doc, ordered, { bounds: bounds(doc, BIB_BOUNDS), frame: () => F })
    const b = bounds(doc, BIB_BOUNDS)
    for (const marking of [[0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 0], [3, 0, 5, 1, 4, 2]]) {
      const R = rangedAnchors(doc, ordered, { frame: () => F })
      const got = new Map<number, unknown>()
      for (const id of marking) {
        R.mark(id, b.get(String(id)) ?? null)
        R.run((id2: number, an: unknown) => got.set(id2, an), (id2: number) => { if (!got.has(id2)) got.set(id2, null) })
      }
      for (const [id, an] of whole) expect(JSON.stringify(got.get(id) ?? null), `unit ${id}, marked ${marking}`).toBe(JSON.stringify(an))
      for (const id of [0, 1, 2, 3, 4, 5]) expect(R.isSettled(id)).toBe(true)
    }
  })
})

describe('a marked unit over a page break owns its own lines on each page, not the page\'s text between them', () => {
  // (the footnote's first line at page 1's foot, its last at page 2's foot; between them in the stream, page 2's column: a
  // heading no mark bounds, then a marked paragraph)
  const pages = [
    pageOf(1, [['the paragraph that calls the note', 700], ['note one two three four', 120]]),
    pageOf(2, [['pre training model', 700], ['unlike earlier work we train here', 676], ['note five six seven eight', 120]]),
  ]
  const doc = tokenizeDocument(pages)
  const F = frameOfTokens(doc)
  const units: UnitText[] = [{ id: 0, text: 'the paragraph that calls the note' }, { id: 1, text: 'note one two three four note five six seven eight' }, { id: 2, text: 'pre training model' }, { id: 3, text: 'unlike earlier work we train here' }]
  const at = (t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)
  const b = new Map([['0', [at('the'), at('note')]], ['1', [at('note', at('note') + 1), at('eight')]], ['3', [at('unlike'), at('here')]]] as [string, [number, number]][])
  it('the heading between the footnote\'s two parts is placed, the footnote keeps both its parts', () => {
    const found = anchorUnits(doc, units, { bounds: b, floating: id => id === 1, frame: () => F })
    expect(words(doc, found.get(2))).toEqual(['pre', 'training', 'model'])
    expect(words(doc, found.get(1))).toEqual(['note', 'one', 'two', 'three', 'four', 'note', 'five', 'six', 'seven', 'eight'])
    expect(words(doc, found.get(3))).toEqual(['unlike', 'earlier', 'work', 'we', 'train', 'here'])
  })
})

describe('a range shrunk to its own lines never crosses another marked unit\'s range', () => {
  // (2307.16209v1 p115: a paragraph over a page break goes on below a caption set at the next page's head, whose second line
  // repeats the paragraph's words; its whole range held the caption's inside it)
  const pages = [
    pageOf(1, [['the paragraph begins here and goes', 700]]),
    pageOf(2, [['figure two shows the layout', 700], ['on and on and goes further', 688], ['to the end of the figure', 676], ['on and on and goes further still', 400], ['to its very last words', 388]]),
  ]
  const doc = tokenizeDocument(pages)
  const F = frameOfTokens(doc)
  const units: UnitText[] = [{ id: 0, text: 'the paragraph begins here and goes on and on and goes further still to its very last words' }, { id: 1, text: 'figure two shows the layout on and on and goes further to the end of the figure' }]
  const at = (t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)
  const b = new Map([['0', [at('the'), at('words')]], ['1', [at('figure'), at('figure', at('figure') + 1)]]] as [string, [number, number]][])
  it('the caption keeps every line of its own, the paragraph its lines below it', () => {
    const found = anchorUnits(doc, units, { bounds: b, floating: id => id === 1, frame: () => F })
    expect(words(doc, found.get(1))).toEqual(['figure', 'two', 'shows', 'the', 'layout', 'on', 'and', 'on', 'and', 'goes', 'further', 'to', 'the', 'end', 'of', 'the', 'figure'])
    expect(words(doc, found.get(0))).toEqual(['the', 'paragraph', 'begins', 'here', 'and', 'goes', 'on', 'and', 'on', 'and', 'goes', 'further', 'still', 'to', 'its', 'very', 'last', 'words'])
  })
})
