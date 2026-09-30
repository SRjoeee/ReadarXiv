import { describe, expect, it } from 'vitest'
import { anchorUnits, boundsFromMarks, type TextPage, tokenizeDocument, tokens, type UnitText } from '@/pdf-reader/engine/anchors.mjs'

// Where each unit sits in a PDF, found from the text layer (anchors.mjs): the page given as PDF.js's text items, the
// units as the reader passes them. Heights are 10 PDF units, lines 12 apart down from y = 700

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
/** a text item as getTextContent gives it: `str` at (x, y), each character 5 units wide unless `width` says */
const item = (str: string, x: number, y: number, { width = str.length * 5, size = 10, eol = false } = {}): Item => ({ str, transform: [size, 0, 0, size, x, y], width, height: size, hasEOL: eol, fontName: 'f' })
/** one page of lines, each line its items laid left to right from x = 50 with a space between */
const page = (lines: string[][], n = 1): TextPage & { items: Item[] } => ({
  page: n,
  items: lines.flatMap((words, l) => {
    let x = 50
    return words.map((w, k) => { const it = item(w, x, 700 - l * 12, { eol: k === words.length - 1 }); x += w.length * 5 + 5; return it })
  }),
  styles: {},
})
/** the document and each unit's place, `bounds` the marked units' first and last tokens: [id, first, last] */
const anchors = (pages: TextPage[], units: UnitText[], bounds: [number, number, number][]) => {
  const doc = tokenizeDocument(pages)
  return { doc, found: anchorUnits(doc, units, { bounds: new Map(bounds.map(([id, a, b]) => [String(id), [a, b]])) }) }
}

describe('tokens: a run of Latin letters or digits ends where a CJK character begins', () => {
  it('a figure number or a name before CJK text is a token of its own', () => {
    expect(tokens('图3显示NTK块矩').map(t => t.t)).toEqual(['图', '3', '显', '示', 'ntk', '块', '矩'])
    // after CJK, and between Latin words, as before
    expect(tokens('块矩NTK and 2 heads').map(t => t.t)).toEqual(['块', '矩', 'ntk', 'and', '2', 'heads'])
  })

  it('a translated heading whose Latin word the text layer gives apart from its CJK characters is found (2608.08350: a heading of the translation was never located)', () => {
    // the text layer sets the Latin word and the CJK characters in two fonts, as two items with no space between;
    // the unit's text is one string, and the heading has no marks: it is found as a run of words between its marked
    // neighbours
    const pages = [{ page: 1, items: [...page([['甲乙丙丁戊己']]).items, item('NTK', 50, 688), item('块矩的谱', 65, 688, { eol: true }), ...page([[], [], ['庚辛壬癸子丑']]).items], styles: {} }]
    const { doc, found } = anchors(pages, [{ id: 0, text: '甲乙丙丁戊己' }, { id: 1, text: 'NTK块矩的谱' }, { id: 2, text: '庚辛壬癸子丑' }], [[0, 0, 5], [2, 11, 16]])
    expect(found.get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['ntk', '块', '矩', '的', '谱'])
  })

  it('a copy\'s marks carried with a word cut the old way still bound their unit: its first part at the start, its last at the end', () => {
    // a copy on this machine keeps the word each mark of our original stood by, cut when a Latin run took the CJK
    // characters after it in: one word where the text layer now gives five
    const doc = tokenizeDocument([{ page: 1, items: [item('3', 50, 700), item('显示结果', 55, 700, { eol: true })], styles: {} }])
    const marks = new Map([['0s', { page: 1, x: 50, y: 700, t: '3显示结果' }], ['0e', { page: 1, x: 75, y: 700, t: '3显示结果' }]])
    expect(boundsFromMarks(doc, marks).get('0')).toEqual([0, 4])
  })
})

describe('tokenizeDocument: a word printed over itself is read once', () => {
  // pdfLaTeX's CJK bold (CJKutf8): each character printed three times, 0.21 units apart at 14 (2608.02991, 2608.29181)
  const bold = (s: string, x: number, y: number) => [...s].flatMap((c, k) => [0, 0.21, 0.42].map(d => item(c, x + k * 14 + d, y, { width: 14, size: 14 })))

  it('a bold heading is found between its marked neighbours, each of its characters one token', () => {
    const pages = [{ page: 1, items: [...page([['甲乙丙丁戊己']]).items, ...bold('相关工作', 50, 686), ...page([[], [], ['庚辛壬癸子丑']]).items], styles: {} }]
    const { doc, found } = anchors(pages, [{ id: 0, text: '甲乙丙丁戊己' }, { id: 1, text: '相关工作' }, { id: 2, text: '庚辛壬癸子丑' }], [[0, 0, 5], [2, 10, 15]])
    expect(doc.map(t => t.t).join('')).toBe('甲乙丙丁戊己相关工作庚辛壬癸子丑')
    expect(found.get(1)?.tokens).toEqual([6, 7, 8, 9])
  })

  it('the same word twice, a space apart, is two words', () => {
    expect(tokenizeDocument([page([['the', 'the', 'end']])]).map(t => t.t)).toEqual(['the', 'the', 'end'])
  })
})

describe('anchorUnits: a word the text layer gives in parts is lit whole', () => {
  it('a small-caps heading is lit to the end of its word, not over its first capital (every IEEEtran section title, 2608.06701)', () => {
    // I + NTRODUCTION, the capital and the smaller capitals two items with no space between: one token with the
    // capital's box, then the rest of the word with its own box and no text
    const pages = [{ page: 1, items: [...page([['the paragraph before it']]).items, item('I', 50, 688, { width: 7 }), item('NTRODUCTION', 57, 688, { size: 8, width: 66, eol: true }), ...page([[], [], ['the paragraph after it']]).items], styles: {} }]
    const { doc, found } = anchors(pages, [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'Introduction' }, { id: 2, text: 'the paragraph after it' }], [[0, 0, 3], [2, 6, 9]])
    expect(doc.slice(4, 6).map(t => t.t)).toEqual(['introduction', ''])
    expect(found.get(1)?.rects.map(r => [r.x0, r.x1])).toEqual([[50, 123]])
  })

  it('a unit whose last word a hyphen cuts at a line\'s end is lit on the line its word ends on', () => {
    const pages = [page([['the', 'last', 'word', 'is', 'hyphen-'], ['ated']])]
    const { found } = anchors(pages, [{ id: 0, text: 'the last word is hyphenated' }], [[0, 0, 4]])
    expect(found.get(0)?.rects.map(r => [r.x0, r.x1])).toEqual([[50, 165], [50, 70]])
  })
})
