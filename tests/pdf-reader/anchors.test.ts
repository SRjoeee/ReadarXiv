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
