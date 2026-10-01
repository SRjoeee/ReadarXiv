import { describe, expect, it } from 'vitest'
import { anchorUnits, boundsFromMarks, type DocToken, inkEdges, markWords, sentenceStarts, type TextPage, tokenizeDocument, tokens, type UnitText } from '@/pdf-reader/engine/anchors.mjs'

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
  it('the private-use area is no CJK: a bracket\'s pieces (U+F8F1…) and other private glyphs are no tokens; a compatibility ideograph is one', () => {
    // the range was typed with the compatibility ideograph U+F900, which normalization turned into U+8C48, so that it ran
    // on over U+A000–U+F8FF
    expect(tokens('\uf8f1\uf8f2\uf8f3')).toEqual([])
    expect(tokens('a\ue000b')).toEqual([{ t: 'a', at: 0, len: 1 }, { t: 'b', at: 2, len: 1 }])
    expect(tokens('\uf900').map(t => t.t)).toEqual(['\u8c48'])
    expect(tokenizeDocument([{ page: 1, items: [item('\uf8f1', 50, 700), item('x', 60, 700, { eol: true })], styles: {} }]).map(t => t.t)).toEqual(['x'])
  })

  it('a mark that is no letter inside the CJK spans is no token: the katakana middle dot between a compound\'s words (the re-review of A1, m4)', () => {
    expect(tokens('ニューラル・ネット').map(t => t.t)).toEqual(['ニ', 'ュ', 'ー', 'ラ', 'ル', 'ネ', 'ッ', 'ト'])
  })

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

  it('a word the tokenizer still joins with a CJK character — a Latin word hyphenated at a line\'s end, CJK on the next — is carried whole, and bounds its unit (the review of A1, M2)', () => {
    const doc = tokenizeDocument([{ page: 1, items: [item('GPT-', 50, 700, { eol: true }), item('风格的模型', 50, 688, { eol: true })], styles: {} }])
    expect(doc[0]?.t).toBe('gpt风')
    const marks = markWords(doc, new Map([['0s', { page: 1, x: 50, y: 700 }], ['0e', { page: 1, x: 75, y: 688 }]]))
    expect(boundsFromMarks(doc, marks).get('0')).toEqual([0, doc.length - 1])
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

describe('inkEdges: a token\'s ink reaches over the marks that touch it', () => {
  // the ink's left and right edges: the token's box widened over the punctuation and brackets its item sets against it,
  // so that a highlight ends after a sentence's full stop; what anchoring reads (t, x, w) is the same
  const edges = (items: Item[]) => {
    const doc = tokenizeDocument([{ page: 1, items, styles: {} }]), { l, r } = inkEdges(doc)
    return doc.map((t, k) => [t.t, t.x, t.w, l[k], r[k]])
  }

  it('a closing mark after a word, an opening one before it, in the word\'s item', () => {
    expect(edges([item('word.', 50, 700), item('(it)', 90, 700), item('ends),', 120, 700, { eol: true })])).toEqual([
      ['word', 50, 20, 50, 75],
      ['it', 95, 10, 90, 110],
      ['ends', 120, 20, 120, 150],
    ])
  })

  it('the words a hyphen joins: their boxes, which anchoring reads, an even share of the item; their ink a proportional face\'s widths, the hyphen with the word it follows', () => {
    // their ink where a proportional face's widths put them in the item (Times-Roman's: state- 2166, of- 1166, art 1055
    // thousandths of an em, over its 60 units), their boxes an even share as anchoring reads them
    const got = edges([item('plain', 50, 700), item('state-of-art', 80, 700, { eol: true })])
    expect(got.map(([t, x, w]) => [t, x, w])).toEqual([['plain', 50, 25], ['state', 80, 25], ['of', 110, 10], ['art', 125, 15]])
    const at = (n: number) => 80 + (60 * n) / 4387
    expect(got.map(([, , , l, r]) => [l, r].map(v => Math.round(Number(v) * 1000) / 1000))).toEqual([[50, 75], [80, at(2166)], [at(2166), at(3332)], [at(3332), 140]].map(p => p.map(v => Math.round(v * 1000) / 1000)))
  })

  it('an item\'s characters take a proportional face\'s widths, not an even share: the next sentence\'s first word after a wide one\'s full stop, a Latin word among CJK characters; a monospaced item\'s an even share', () => {
    // "mmm. iii": an even share put the i's at 5/8 of the item, inside the m's ink (2608.06701 on the canvas: "T|his")
    const [m, i] = edges([item('mmm. iii', 50, 700, { width: 80, eol: true })])
    const em = 80 / (3 * 778 + 250 + 250 + 3 * 278)
    expect(m![4]).toBeCloseTo(50 + em * (3 * 778 + 250), 3)
    expect(i![3]).toBeCloseTo(50 + em * (3 * 778 + 500), 3)
    // "用GPU。图": CJK characters a full em, the Latin letters Times-Roman's; the stop inks its left half
    const cjk = edges([item('用GPU。图', 50, 680, { width: 60, eol: true })])
    const u = 60 / (1000 + 722 + 556 + 722 + 1000 + 1000)
    expect(cjk.map(([t]) => t)).toEqual(['用', 'gpu', '图'])
    expect(cjk[1]![4]).toBeCloseTo(50 + u * (1000 + 722 + 556 + 722 + 500), 3)
    expect(cjk[2]![3]).toBeCloseTo(50 + u * (1000 + 722 + 556 + 722 + 1000), 3)
    // a monospaced face (getTextContent's styles say so): an even share, as the face sets it
    const doc = tokenizeDocument([{ page: 1, items: [{ ...item('mmm. iii', 50, 700, { width: 80, eol: true }), fontName: 'tt' }], styles: { tt: { fontFamily: 'monospace' } } }])
    expect(inkEdges(doc).l[1]).toBeCloseTo(50 + 50, 3)
  })

  it('in an item mostly of CJK characters, a dash or a quotation mark of the general punctuation is set in a full em too', () => {
    // "模型——图": the CJK font sets the two em dashes a full em each, as its characters (the review of B3: 39 such items
    // a CJK font's text layer classed serif, the dashes half an em, the next character up to 0.97 em off)
    const [, , tu] = edges([item('模型——图', 50, 700, { width: 50, eol: true })])
    expect(tu![0]).toBe('图')
    expect(tu![3]).toBeCloseTo(90, 3)
    // among Latin letters, a dash keeps its half em
    const [, w] = edges([item('a—b', 50, 680, { width: 30, eol: true })])
    expect(w![3]).toBeCloseTo(50 + (30 * (444 + 500)) / (444 + 500 + 500), 3)
  })

  it('a CJK closing mark inks half its em: the full stop after a character, and a bracket then a stop', () => {
    // 。 and 」 are set in a full em and ink their left half; 「 inks its right half
    expect(edges([item('模型。', 50, 700, { width: 30 }), item('「图」。', 100, 700, { width: 40, eol: true })])).toEqual([
      ['模', 50, 10, 50, 60],
      ['型', 60, 10, 60, 75],
      ['图', 110, 10, 105, 135],
    ])
  })

  it('an item of marks alone on the word\'s baseline carries the word\'s ink to its end; one on another baseline does not', () => {
    // a formula's closing bracket and full stop set in their own font; a display's row of operators below
    expect(edges([item('word', 50, 700), item(').', 70, 700, { width: 8 }), item('x', 50, 688), item('=+', 60, 680, { width: 12, eol: true })])).toEqual([
      ['word', 50, 20, 50, 78],
      ['x', 50, 5, 50, 55],
    ])
  })

  it('the carry stops at a gap over half an em or a space: a table\'s cells of dashes beside a word are not its ink', () => {
    // a cell's word, then three cells holding a dash 30 units apart (2608.02163: a cell lit over its neighbours); a word,
    // a space, a bracket
    expect(edges([item('准确性', 50, 700, { width: 30 }), item('–', 110, 700), item('–', 140, 700), item('–', 170, 700), item('ab', 50, 688), item(' ', 60, 688, { width: 3 }), item(')', 63, 688, { eol: true })])).toEqual([
      ['准', 50, 10, 50, 60],
      ['确', 60, 10, 60, 70],
      ['性', 70, 10, 70, 80],
      ['ab', 50, 10, 50, 60],
    ])
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

  it('a table\'s rows of numbers where the display is not: taken only between lines the display\'s letters explain (the re-review of A1, m1)', () => {
    const pages = [
      pageAt(1, [words('the paragraph before it', 700), display(100)]),
      pageAt(2, [words('table one batch size and accuracy', 742), row(['batch', 'accuracy'], 722), row(['32', '81.2'], 710), row(['64', '82.0'], 698), words('where x is the input', 674), words('more words on the page', 650)]),
    ]
    const doc = tokenizeDocument(pages)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'where x is the input', lead: 'xyi' }, { id: 2, text: 'table one batch size and accuracy' }, { id: 3, text: 'more words on the page' }]
    const bounds = new Map<string, [number, number]>([['0', [0, 3]], ['1', [at(doc, 'where'), at(doc, 'input')]], ['2', [at(doc, 'table'), at(doc, 'accuracy')]], ['3', [at(doc, 'more'), at(doc, 'page', at(doc, 'more'))]]])
    expect(anchorUnits(doc, units, { bounds, floating: id => id === 2 }).get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['where', 'x', 'is', 'the', 'input'])
  })

  it('a display\'s row of digits alone between its rows of letters is taken with them', () => {
    const pages = [pageAt(1, [words('the paragraph before it', 700), words('it ends with a display', 676), [item('x = y', 150, 652, { eol: true })], [item('1 2', 160, 646, { size: 7, eol: true })], [item('z = w', 150, 640, { eol: true })], words('another paragraph after', 600)]), pageAt(2, [words('more words on the next page', 700)])]
    const doc = tokenizeDocument(pages)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'it ends with a display', trail: 'xyzw' }, { id: 2, text: 'another paragraph after' }, { id: 3, text: 'more words on the next page' }]
    const found = anchorUnits(doc, units, { bounds: new Map([['0', [0, 3]], ['1', [4, 8]], ['2', [at(doc, 'another'), at(doc, 'another') + 2]], ['3', [at(doc, 'more'), at(doc, 'page')]]]) })
    expect(found.get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['it', 'ends', 'with', 'a', 'display', 'x', 'y', '1', '2', 'z', 'w'])
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

describe('anchorUnits: a unit\'s own words across a page or column break (fix round 2 of the review of A1)', () => {
  const line = (s: string, x: number, y: number) => [item(s, x, y, { width: 200, eol: true })]
  // the page's number first in the stream: after a word a hyphen cuts at the page's end, the tokenizer would join it
  const pageOf = (n: number, lines: Item[][]) => ({ page: n, items: [item(String(n), 150, 62, { eol: true }), ...lines.flat()], styles: {} })
  const words = (doc: DocToken[], f: { tokens: number[] } | null | undefined) => f?.tokens.map(k => doc[k]?.t)

  it('a word a hyphen cut over a page: both halves are the unit\'s', () => {
    const pages = [pageOf(1, [line('the paragraph before it', 50, 700), line('we have to gen-', 50, 100)]), pageOf(2, [line('erate the text again here', 50, 700), line('another paragraph after', 50, 676)])]
    const doc = tokenizeDocument(pages)
    const at = (t: string) => doc.findIndex(d => d.t === t)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'we have to generate the text again here' }, { id: 2, text: 'another paragraph after' }]
    const found = anchorUnits(doc, units, { bounds: new Map([['0', [0, 3]], ['1', [at('we'), at('here')]], ['2', [at('another'), at('after')]]]) })
    expect(words(doc, found.get(1))).toEqual(['we', 'have', 'to', 'gen', 'erate', 'the', 'text', 'again', 'here'])
  })

  it('the words a placeholder set at a column\'s end are the unit\'s; a table\'s row at the next column\'s head sharing its word is not', () => {
    // the text has the placeholder's place only (\\swe{}~\\cite{…}); the page has its words, after the column's last matched word
    const pages = [pageOf(1, [line('the paragraph before it', 50, 700), line('an example where the plan', 50, 676), line('was originally resolved by SWE-agent [37]', 50, 100),
      line('resolved model score', 300, 720), line('ours 91 12', 300, 708), line('with a model', 300, 690), line('another paragraph after', 300, 666)]), pageOf(2, [line('more words on the next page', 50, 700)])]
    const doc = tokenizeDocument(pages)
    const at = (t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'an example where the plan was originally resolved by with a model' }, { id: 2, text: 'another paragraph after' }, { id: 3, text: 'more words on the next page' }]
    const found = anchorUnits(doc, units, { bounds: new Map([['0', [0, 3]], ['1', [at('an'), at('model', at('with'))]], ['2', [at('another'), at('after')]], ['3', [at('more'), at('page')]]]) })
    expect(words(doc, found.get(1))).toEqual(['an', 'example', 'where', 'the', 'plan', 'was', 'originally', 'resolved', 'by', 'swe', 'agent', '37', 'with', 'a', 'model'])
  })
})

describe('anchorUnits: a unit\'s display across a page break', () => {
  it('a unit with a display between its words fills the break with the display\'s lines and its own words, not a table\'s row whose words the paragraph uses (the re-review of A1, m2)', () => {
    const b12 = (str: string, x: number, y: number, eol = false, width = str.length * 6) => ({ str, transform: [12, 0, 0, 12, x, y], width, height: 12, hasEOL: eol, fontName: 'f' })
    const line = (s: string, y: number) => [b12(s, 50, y, true, 300)]
    const cells = (cs: string[], y: number) => cs.map((c, i) => b12(c, 80 + i * 80, y, i === cs.length - 1))
    const pageOf = (n: number, lines: ReturnType<typeof b12>[][]) => ({ page: n, items: [...lines.flat(), b12(String(n), 150, 62, true)], styles: {} })
    // an in-text table at the next page's head, 11 pt above the text: a float's skip no rule of distance can tell from a
    // display's
    const firstText = 700 - 2.64 - 11 - 9
    const pages = [
      pageOf(1, [line('the paragraph before it', 700), line('our model has a lower cost and', 124), [b12('x = y', 150, 100), b12('(1)', 290, 100, true)]]),
      pageOf(2, [line('table one results of models', 740), cells(['model', 'cost'], 714), cells(['ours', '12'], 700), line('so the score of ours is better', firstText), line('another paragraph after', firstText - 30)]),
    ]
    const doc = tokenizeDocument(pages)
    const at = (t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'our model has a lower cost and so the score of ours is better', inner: 'xy' }, { id: 2, text: 'table one results of models' }, { id: 3, text: 'another paragraph after' }]
    const bounds = new Map<string, [number, number]>([['0', [0, 3]], ['1', [at('our'), at('better')]], ['2', [at('table'), at('models')]], ['3', [at('another'), at('after')]]])
    const got = anchorUnits(doc, units, { bounds, floating: id => id === 2 }).get(1)?.tokens.map(k => doc[k]?.t)
    expect(got).toEqual(['our', 'model', 'has', 'a', 'lower', 'cost', 'and', 'x', 'y', '1', 'so', 'the', 'score', 'of', 'ours', 'is', 'better'])
  })

  // 12 pt: the body's heights put 19 pt of room where a float stands 16 pt away at the least (\textfloatsep, 20 pt less
  // 4), its glyphs further (the re-review of A1, m3)
  const b12 = (str: string, x: number, y: number, eol = false, width = str.length * 6) => ({ str, transform: [12, 0, 0, 12, x, y], width, height: 12, hasEOL: eol, fontName: 'f' })
  const line12 = (s: string, y: number) => [b12(s, 50, y, true, 300)]
  const cells12 = (cs: string[], y: number) => cs.map((c, i) => b12(c, 80 + i * 80, y, i === cs.length - 1))
  const page12 = (n: number, lines: ReturnType<typeof b12>[][]) => ({ page: n, items: [b12(String(n), 150, 62, true), ...lines.flat()], styles: {} })
  // the text's first baseline `skip` points of box below a row at baseline 700 (ascent 9, descent 2.64): 17, a float at
  // the page's head (the review's probe); 11, an in-text float
  const below = (skip = 17) => 700 - 2.64 - skip - 9

  for (const [rest, skip] of [['results', 17], ['final results', 17], ['results', 11]] as const) {
    it(`a unit's last words alone on the next page, ${skip} pt under a table whose last row repeats them ("${rest}"): the row is not the unit's`, () => {
      const pages = [
        page12(1, [line12('the paragraph before it', 700), line12(rest === 'results' ? 'long paragraph that ends with the final' : 'long paragraph that ends with the', 100)]),
        page12(2, [line12('table one scores of models', 740), cells12(['model', 'score'], 714), cells12(rest.split(' ').concat(['12']), 700), line12(rest, below(skip)), line12('another paragraph after', below(skip) - 30)]),
      ]
      const doc = tokenizeDocument(pages)
      const at = (t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)
      const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'long paragraph that ends with the final results' }, { id: 2, text: 'table one scores of models' }, { id: 3, text: 'another paragraph after' }]
      const bounds = new Map<string, [number, number]>([['0', [at('the'), at('it')]], ['1', [at('long'), doc.length - 4]], ['2', [at('table'), at('models')]], ['3', [at('another'), at('after')]]])
      expect(anchorUnits(doc, units, { bounds, floating: id => id === 2 }).get(1)?.tokens.map(k => doc[k]?.t)).not.toContain('12')
    })
  }

  it('a figure\'s labels a float\'s skip above the text are not a display\'s part across the break, whatever the body\'s size', () => {
    const pages = [
      page12(1, [line12('the paragraph before it', 700), line12('our model has a lower cost and', 124), [b12('x = y', 150, 100), b12('(1)', 290, 100, true)]]),
      page12(2, [cells12(['x', 'y'], 700), line12('so the score of ours is better', below()), line12('another paragraph after', below() - 30)]),
    ]
    const doc = tokenizeDocument(pages)
    const at = (t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'our model has a lower cost and so the score of ours is better', inner: 'xy' }, { id: 3, text: 'another paragraph after' }]
    const bounds = new Map<string, [number, number]>([['0', [at('the'), at('it')]], ['1', [at('our'), at('better')]], ['3', [at('another'), at('after')]]])
    expect(anchorUnits(doc, units, { bounds }).get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['our', 'model', 'has', 'a', 'lower', 'cost', 'and', 'x', 'y', '1', 'so', 'the', 'score', 'of', 'ours', 'is', 'better'])
  })

  it('a display below the unit\'s last line on its page, 18 pt away at a 12 pt body, is the unit\'s: the float\'s bound holds above the next page\'s first line only', () => {
    const text = 400, display = 400 - 2.64 - 18 - 9
    const pages = [
      page12(1, [line12('the paragraph before it', 700), line12('our model has a lower cost and', text), cells12(['x', 'y'], display)]),
      page12(2, [line12('so the score of ours is better', 700), line12('another paragraph after', 670)]),
    ]
    const doc = tokenizeDocument(pages)
    const at = (t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'our model has a lower cost and so the score of ours is better', inner: 'xy' }, { id: 3, text: 'another paragraph after' }]
    const bounds = new Map<string, [number, number]>([['0', [at('the'), at('it')]], ['1', [at('our'), at('better')]], ['3', [at('another'), at('after')]]])
    expect(anchorUnits(doc, units, { bounds }).get(1)?.tokens.map(k => doc[k]?.t)).toEqual(['our', 'model', 'has', 'a', 'lower', 'cost', 'and', 'x', 'y', 'so', 'the', 'score', 'of', 'ours', 'is', 'better'])
  })

  it('a display\'s part across the break 15.5 pt from the unit\'s word at a 10 pt body is the unit\'s: the bound is no tighter than the body\'s heights there', () => {
    const at10 = (str: string, x: number, y: number, eol = false) => item(str, x, y, { eol, width: str.length * 5 })
    const text = 700 - 2.2 - 15.5 - 7.5
    const pages = [
      { page: 1, items: [at10('1', 150, 62, true), at10('the paragraph before it', 50, 700, true), at10('our model has a lower cost and', 50, 124, true)], styles: {} },
      { page: 2, items: [at10('2', 150, 62, true), at10('x', 80, 700), at10('y', 160, 700, true), at10('so the score of ours is better', 50, text, true), at10('another paragraph after', 50, text - 24, true)], styles: {} },
    ]
    const doc = tokenizeDocument(pages)
    const at = (t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)
    const units = [{ id: 0, text: 'the paragraph before it' }, { id: 1, text: 'our model has a lower cost and so the score of ours is better', inner: 'xy' }, { id: 3, text: 'another paragraph after' }]
    const bounds = new Map<string, [number, number]>([['0', [at('the'), at('it')]], ['1', [at('our'), at('better')]], ['3', [at('another'), at('after')]]])
    expect(anchorUnits(doc, units, { bounds }).get(1)?.tokens.map(k => doc[k]?.t)).toContain('x')
  })

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

// Sentence level (B3, report-B option X): each sentence's first word found inside the unit's marks by the unit's own
// text match, the unit's tokens to the page's
describe('sentenceStarts: where each sentence after the first begins on the page', () => {
  const text = 'Alpha beta gamma. Delta epsilon zeta eta. Theta iota kappa.'
  const lines = (delta = 'Delta') => [page([['Alpha', 'beta', 'gamma.', delta, 'epsilon'], ['zeta', 'eta.', 'Theta', 'iota', 'kappa.']])]

  it('the page token of each sentence\'s first word, from offsets in the text the side was anchored by', () => {
    const { doc, found } = anchors(lines(), [{ id: 0, text }], [[0, 0, 9]])
    const s = sentenceStarts(found.get(0), text, [text.indexOf('Delta'), text.indexOf('Theta')])
    expect([...(s ?? [])].map(k => doc[k]?.t)).toEqual(['delta', 'theta'])
  })

  it('one sentence: none begins after the first', () => {
    const { found } = anchors(lines(), [{ id: 0, text }], [[0, 0, 9]])
    expect([...(sentenceStarts(found.get(0), text, []) ?? [1])]).toEqual([])
  })

  it('a first word the text match did not find: the sentence\'s next word it found; none in the sentence, no sentences', () => {
    const { doc, found } = anchors(lines('Deltas'), [{ id: 0, text }], [[0, 0, 9]])
    expect([...(sentenceStarts(found.get(0), text, [text.indexOf('Delta'), text.indexOf('Theta')]) ?? [])].map(k => doc[k]?.t)).toEqual(['epsilon', 'theta'])
    expect(sentenceStarts(found.get(0), text, [text.indexOf('Delta'), text.indexOf('epsilon')])).toBeNull()
  })

  it('a unit without marks, offsets that do not rise inside the text, or no offsets: none', () => {
    const { found } = anchors(lines(), [{ id: 0, text }], [])
    expect(sentenceStarts(found.get(0), text, [text.indexOf('Delta')])).toBeNull()
    const marked = anchors(lines(), [{ id: 0, text }], [[0, 0, 9]]).found.get(0)
    expect(sentenceStarts(marked, text, [text.indexOf('Theta'), text.indexOf('Delta')])).toBeNull()
    expect(sentenceStarts(marked, text, [text.length + 5])).toBeNull()
    expect(sentenceStarts(marked, text, undefined)).toBeNull()
  })
})
