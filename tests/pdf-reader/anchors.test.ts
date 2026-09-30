import { describe, expect, it } from 'vitest'
import { anchorUnits, boundsFromMarks, type DocToken, type TextPage, tokenizeDocument, tokens, type UnitText } from '@/pdf-reader/engine/anchors.mjs'

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

describe('anchorUnits: a heading with a formula or a citation in it', () => {
  // the heading's text as the reader passes it: its placeholders dropped, and where they stood (mt.mjs unitText)
  const around = (heading: string[], unit: UnitText) => {
    const pages = [page([['the paragraph before it'], heading, ['the paragraph after it']])]
    const doc = tokenizeDocument(pages)
    const after = doc.findIndex((t, k) => k > 3 && t.t === 'the')
    return { doc, found: anchorUnits(doc, [{ id: 0, text: 'the paragraph before it' }, unit, { id: 2, text: 'the paragraph after it' }], { bounds: new Map([['0', [0, 3]], ['2', [after, after + 3]]]) }) }
  }

  it('is found with the formula\'s words where the formula stood (2608.02163: Round $n$ and the like)', () => {
    const { doc, found } = around(['Round', 'n:', 'Results'], { id: 1, text: 'Round : Results', gaps: [6] })
    expect(found.get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['round', 'n', 'results'])
  })

  it('in a translation too, one CJK character a word', () => {
    const { doc, found } = around(['第', 'n', '轮'], { id: 1, text: '第 轮', gaps: [2] })
    expect(found.get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['第', 'n', '轮'])
  })

  it('words the text does not have are let in only where a placeholder stood', () => {
    expect(around(['Round', 'n:', 'Results'], { id: 1, text: 'Round Results' }).found.get(1)).toBeNull()
  })
})

describe('anchorUnits: a display outside a unit\'s marks is the unit\'s', () => {
  // a page: the lines given as [y, items]; a page number low on it, as every page has
  const pageAt = (n: number, lines: Item[][]) => ({ page: n, items: [...lines.flat(), item(String(n), 150, 62, { eol: true })], styles: {} })
  // a line of text across the column, from 50 to 300, as justified lines are
  const words = (s: string, y: number, size = 10) => [item(s, 50, y, { size, width: 250, eol: true })]
  // a display: x = y, a subscript under its baseline, and its number at the right
  const display = (y: number) => [item('x = y', 150, y), item('i', 177, y - 3, { size: 7 }), item('(1)', 290, y, { eol: true })]
  const at = (doc: DocToken[], t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)

  it('a paragraph that ends with a display (latex-front\'s trail): the display is lit with it, the page\'s number is not (07683: a conjecture\'s display)', () => {
    const pages = [pageAt(1, [words('the paragraph before it', 700), words('it ends with a display', 676), display(652), words('another paragraph after', 620)]), pageAt(2, [words('more words on the next page', 700)])]
    const doc = tokenizeDocument(pages)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'it ends with a display', trail: 'xy' }, { id: 2, text: 'another paragraph after' }, { id: 3, text: 'more words on the next page' }]
    const found = anchorUnits(doc, units, { bounds: new Map([['0', [0, 3]], ['1', [4, 8]], ['2', [at(doc, 'another'), at(doc, 'another') + 2]], ['3', [at(doc, 'more'), at(doc, 'page')]]]) })
    expect(found.get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['it', 'ends', 'with', 'a', 'display', 'x', 'y', 'i', '1'])
    // the last paragraph of the page goes no further than its words: below it is the page's number
    expect(found.get(2)?.tokens.map(k => doc[k]?.t)).toEqual(['another', 'paragraph', 'after'])
  })

  it('the same display at the foot of its page: the page\'s number under it stays out', () => {
    const pages = [pageAt(1, [words('the paragraph before it', 700), words('it ends with a display', 100), display(76)]), pageAt(2, [words('more words on the next page', 700)])]
    const doc = tokenizeDocument(pages)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'it ends with a display', trail: 'xy' }, { id: 3, text: 'more words on the next page' }]
    const found = anchorUnits(doc, units, { bounds: new Map([['0', [0, 3]], ['1', [4, 8]], ['3', [at(doc, 'more'), at(doc, 'page')]]]) })
    expect(found.get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['it', 'ends', 'with', 'a', 'display', 'x', 'y', 'i', '1'])
    expect(found.get(1)?.tokens.at(-1)).toBe(12)
  })

  it('a paragraph that opens with a display (latex-front\'s lead) takes it', () => {
    const pages = [pageAt(1, [words('the paragraph before it', 700), display(676), words('where x is the input', 652)]), pageAt(2, [words('more words on the next page', 700)])]
    const doc = tokenizeDocument(pages)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'where x is the input', lead: 'xy' }, { id: 3, text: 'more words on the next page' }]
    const found = anchorUnits(doc, units, { bounds: new Map([['0', [0, 3]], ['1', [at(doc, 'where'), at(doc, 'input')]], ['3', [at(doc, 'more'), at(doc, 'page')]]]) })
    expect(found.get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['x', 'y', 'i', '1', 'where', 'x', 'is', 'the', 'input'])
    expect(found.get(0)?.tokens.map(k => doc[k]?.t)).toEqual(['the', 'paragraph', 'before', 'it'])
  })

  // the display's letters as latex-front gives them with the hint: x = y
  const row = (cells: string[], y: number) => cells.map((c, i) => item(c, 80 + i * 70, y, { eol: i === cells.length - 1 }))

  it('a table of the body\'s size where the display is not: the display closed the page before, the table opens the unit\'s page (the review of A1, I1 a)', () => {
    const pages = [
      pageAt(1, [words('the paragraph before it', 700), display(100)]),
      pageAt(2, [words('table one results of models', 730), row(['model', 'score', 'cost'], 710), row(['ours', '91', '12'], 698), words('where x is the input', 674), words('more words on the page', 650)]),
    ]
    const doc = tokenizeDocument(pages)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'where x is the input', lead: 'xy' }, { id: 2, text: 'table one results of models' }, { id: 3, text: 'more words on the page' }]
    const bounds = new Map<string, [number, number]>([['0', [0, 3]], ['1', [at(doc, 'where'), at(doc, 'input')]], ['2', [at(doc, 'table'), at(doc, 'models')]], ['3', [at(doc, 'more'), at(doc, 'page', at(doc, 'more'))]]])
    expect(anchorUnits(doc, units, { bounds, floating: id => id === 2 }).get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['where', 'x', 'is', 'the', 'input'])
  })

  it('a display alone that went over to the next page: the table under the paragraph is not the display (I1 b)', () => {
    const pages = [
      pageAt(1, [words('the paragraph before it', 700), words('we have that', 160), row(['model', 'score', 'cost'], 130), row(['ours', '91', '12'], 118), words('table one results of models', 98)]),
      pageAt(2, [display(700), words('more words on the page', 676)]),
    ]
    const doc = tokenizeDocument(pages)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'we have that', trail: 'xy' }, { id: 2, text: 'table one results of models' }, { id: 3, text: 'more words on the page' }]
    const bounds = new Map<string, [number, number]>([['0', [0, 3]], ['1', [at(doc, 'we'), at(doc, 'that')]], ['2', [at(doc, 'table'), at(doc, 'models')]], ['3', [at(doc, 'more'), at(doc, 'page', at(doc, 'more'))]]])
    expect(anchorUnits(doc, units, { bounds, floating: id => id === 2 }).get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['we', 'have', 'that'])
  })

  it('the translation moved the display inside the unit\'s words: the table set right after it is not taken (I1 c)', () => {
    const pages = [
      pageAt(1, [words('the paragraph before it', 700), words('it holds that', 676), display(652), words('the rest of it', 628), row(['model', 'score', 'cost'], 604), row(['ours', '91', '12'], 592), words('table one results of models', 572), words('more words on the page', 540)]),
      pageAt(2, [words('another page', 700)]),
    ]
    const doc = tokenizeDocument(pages)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'it holds that the rest of it', trail: 'xy' }, { id: 2, text: 'table one results of models' }, { id: 3, text: 'more words on the page' }, { id: 4, text: 'another page' }]
    const bounds = new Map<string, [number, number]>([['0', [0, 3]], ['1', [at(doc, 'it', 4), at(doc, 'it', at(doc, 'rest'))]], ['2', [at(doc, 'table'), at(doc, 'models')]], ['3', [at(doc, 'more'), at(doc, 'page', at(doc, 'more'))]], ['4', [at(doc, 'another'), at(doc, 'page', at(doc, 'another'))]]])
    expect(anchorUnits(doc, units, { bounds, floating: id => id === 2 }).get(1)?.tokens.map(k => doc[k]?.t)).not.toContain('model')
  })

  it('a tall display three body heights below the text, its words the display\'s own, is still taken (revtex: a bracket is no word)', () => {
    const pages = [pageAt(1, [words('the paragraph before it', 700), words('it ends with a display', 676), [item('x = y', 150, 642), item('out', 160, 638, { size: 7 }), item('(1)', 290, 642, { eol: true })], words('another paragraph after', 610)]), pageAt(2, [words('more words on the next page', 700)])]
    const doc = tokenizeDocument(pages)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'it ends with a display', trail: 'xyout sum' }, { id: 2, text: 'another paragraph after' }, { id: 3, text: 'more words on the next page' }]
    const found = anchorUnits(doc, units, { bounds: new Map([['0', [0, 3]], ['1', [4, 8]], ['2', [at(doc, 'another'), at(doc, 'another') + 2]], ['3', [at(doc, 'more'), at(doc, 'page')]]]) })
    expect(found.get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['it', 'ends', 'with', 'a', 'display', 'x', 'y', 'out', '1'])
  })

  it('a table set smaller right after the display is not taken with it', () => {
    const pages = [pageAt(1, [words('the paragraph before it', 700), words('it ends with a display', 676), display(652), words('model score cost', 632, 8), words('ours 0.91 12', 623, 8), words('another paragraph after', 596)]), pageAt(2, [words('more words on the next page', 700)])]
    const doc = tokenizeDocument(pages)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'it ends with a display', trail: 'xy' }, { id: 2, text: 'another paragraph after' }, { id: 3, text: 'more words on the next page' }]
    const found = anchorUnits(doc, units, { bounds: new Map([['0', [0, 3]], ['1', [4, 8]], ['2', [at(doc, 'another'), at(doc, 'another') + 2]], ['3', [at(doc, 'more'), at(doc, 'page')]]]) })
    expect(found.get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['it', 'ends', 'with', 'a', 'display', 'x', 'y', 'i', '1'])
  })
})

describe('anchorUnits: a unit with no text', () => {
  it('is not found, and the others are (a cell the translation left untranslated has no text: gt-eval, 2608.04322)', () => {
    const doc = tokenizeDocument([page([['some', 'words', 'here']])])
    const found = anchorUnits(doc, [{ id: 0, text: null as unknown as string }, { id: 1, text: 'some words here' }])
    expect(found.get(0)).toBeNull()
    expect(found.get(1)?.tokens).toEqual([0, 1, 2])
  })
})

describe('anchorUnits: a unit\'s display across a page break', () => {
  it('a unit with no display between its words fills nothing across the break: a table of its size at the next page\'s head, 12 pt, a float\'s skip shrunk to 16 pt (the review of A1, M1)', () => {
    const big = (str: string, x: number, y: number, eol = false) => ({ str, transform: [12, 0, 0, 12, x, y], width: str.length * 6, height: 12, hasEOL: eol, fontName: 'f' })
    const line = (s: string, y: number) => [{ ...big(s, 50, y, true), width: 300 }]
    const cells = (cs: string[], y: number) => cs.map((c, i) => big(c, 80 + i * 80, y, i === cs.length - 1))
    const pageOf = (n: number, lines: ReturnType<typeof big>[][]) => ({ page: n, items: [...lines.flat(), big(String(n), 150, 62, true)], styles: {} })
    const firstText = 700 - 2.64 - 17 - 9
    const pages = [
      pageOf(1, [line('the paragraph before it', 700), line('a long paragraph that goes', 100)]),
      pageOf(2, [line('table one results of models', 740), cells(['model', 'score', 'cost'], 714), cells(['ours', '91', '12'], 700), line('on over the page here', firstText), line('another paragraph after', firstText - 30)]),
    ]
    const doc = tokenizeDocument(pages)
    const at = (t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'a long paragraph that goes on over the page here' }, { id: 2, text: 'table one results of models' }, { id: 3, text: 'another paragraph after' }]
    const bounds = new Map<string, [number, number]>([['0', [0, 3]], ['1', [at('a', 4), at('here')]], ['2', [at('table'), at('models')]], ['3', [at('another'), at('after')]]])
    expect(anchorUnits(doc, units, { bounds, floating: id => id === 2 }).get(1)?.tokens.map(k => doc[k]?.t)).not.toContain('model')
  })

  const pageAt = (n: number, lines: Item[][]) => ({ page: n, items: [...lines.flat(), item(String(n), 150, 62, { eol: true })], styles: {} })
  const words = (s: string, y: number, size = 10) => [item(s, 50, y, { size, width: 250, eol: true })]
  const display = (y: number) => [item('x = y', 150, y), item('i', 177, y - 3, { size: 7 }), item('(1)', 290, y, { eol: true })]
  const at = (doc: DocToken[], t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)

  it('its parts at the foot of one page and the head of the next are lit with it; the footnote between, the page\'s number and a table set smaller are not (2608.29181: 39 tokens)', () => {
    const pages = [
      pageAt(1, [words('the paragraph before it', 700), words('a paragraph whose display', 124), display(100), words('a footnote set smaller', 80, 8)]),
      pageAt(2, [words('model score cost', 716, 8), words('ours 0.91 12', 707, 8), display(676), words('goes on over the page', 652), words('another paragraph after', 628)]),
    ]
    const doc = tokenizeDocument(pages)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'a paragraph whose display goes on over the page', inner: 'xy' }, { id: 2, text: 'a footnote set smaller' }, { id: 3, text: 'another paragraph after' }]
    const bounds = new Map<string, [number, number]>([['0', [0, 3]], ['1', [4, at(doc, 'page')]], ['2', [at(doc, 'footnote') - 1, at(doc, 'smaller')]], ['3', [at(doc, 'another'), at(doc, 'after')]]])
    const found = anchorUnits(doc, units, { bounds, floating: id => id === 2 })
    expect(found.get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['a', 'paragraph', 'whose', 'display', 'x', 'y', 'i', '1', 'x', 'y', 'i', '1', 'goes', 'on', 'over', 'the', 'page'])
  })
})
