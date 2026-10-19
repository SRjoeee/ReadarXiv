import { describe, expect, it } from 'vitest'
import { type Anchor, type DocToken, lineRects, sentenceStarts, tokenizeDocument, tokens as wordsOf } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { layoutOf, runsOf, sentenceOf } from '@/pdf-reader/engine/view/highlight.mjs'
import { createShapes, layerShapes } from '@/pdf-reader/engine/view/shapes.mjs'
import { cutSide } from '../../lab/pdf/spikes/highlight-pages.mjs'

// The sentence highlight's pairing (PDF-READER §17.3, §17.8): a sentence lights what the text puts in it, on both panes, never
// another sentence's words. A paragraph of three sentences, its middle one holding a displayed formula on a line of its own:
// "Aaa bbb. Ccc ddd $$x$$ eee fff. Ggg hhh." On the left arXiv's text (the formula's glyph between its words, paired with no
// word); on the right the layer's word table, each token with its word, or its place in the translation (the formula's kept
// line: the space its placeholder becomes)

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, eol = false): Item => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10, hasEOL: eol, fontName: 'f' })
/** a line of words, each its own item, from x0 */
const words = (s: string, y: number, x0 = 50) => s.split(' ').map((w, i, all) => item(w, x0 + 30 * i, y, i === all.length - 1))
const PAGE = [...words('Aaa bbb. Ccc ddd', 740), item('x', 290, 716, true), ...words('eee fff. Ggg hhh.', 692)]
const doc: DocToken[] = tokenizeDocument([{ page: 1, items: PAGE, styles: {} }])
const views = [[0, 0, 600, 800]]
const tokensOfUnit = doc.map((_, k) => k)
/** the unit's source, the formula a placeholder (a space), and its sentences' offsets */
const SRC = 'Aaa bbb. Ccc ddd eee fff. Ggg hhh.'
const SRC_OFFSETS = [SRC.indexOf('Ccc'), SRC.indexOf('Ggg')]
const display = doc.findIndex(t => t.t === 'x')
// the left's pairs: each word of the source on its token, the formula's glyph on none
const pairs = new Map(doc.flatMap((_, k) => (k === display ? [] : [k])).map((k, w) => [w, k]))
const anchors = new Map<number, Anchor | null>([[0, { tokens: tokensOfUnit, rects: lineRects(doc, tokensOfUnit), coverage: 1, bounded: true, pairs }]])
const whole = layoutOf(doc, views, anchors, () => 'para')
const PAD = 2.25

/** the left made page by page, and the right over it */
function sides() {
  const { parts, lefts } = cutSide(whole, anchors, views)
  const left = createShapes({ kindOf: () => 'para' })
  left.addParts(parts)
  left.addPage(lefts[1]!)
  return { left, right: layerShapes(left) }
}

/** the translation the right draws: the source's words, the formula's placeholder a space between "ddd" and "eee" */
const TR = SRC
const TR_OFFSETS = [TR.indexOf('Ccc'), TR.indexOf('Ggg')]
const SPACE = TR.indexOf(' eee')
type Tok = { s: string; x: number; y: number; word: number; at: number }
/** the right's tokens: its words' lines moved down 10, the formula's kept line where the original's is */
const RIGHT: Tok[] = [
  ...'Aaa bbb. Ccc ddd'.split(' ').map((s, i) => ({ s, x: 50 + 30 * i, y: 730, word: i, at: TR.indexOf(s) })),
  { s: 'x', x: 280, y: 716, word: -1, at: SPACE },
  ...'eee fff. Ggg hhh.'.split(' ').map((s, i) => ({ s, x: 50 + 30 * i, y: 682, word: 4 + i, at: TR.indexOf(s) })),
]
/** a laid page's words of the unit, its tokens in the order given */
function laid(toks: Tok[]) {
  const n = toks.length, f = (g: (t: Tok) => number) => Float32Array.from(toks, g)
  return {
    tokens: { n, l: f(t => t.x), r: f(t => t.x + 5 * t.s.length), y: f(t => t.y), h: f(() => 10), top: f(t => t.y + 7.5), bottom: f(t => t.y - 2.2) },
    word: Int32Array.from(toks, t => t.word), at: Int32Array.from(toks, t => t.at), spans: [[0, [0, n]]] as [number, number[]][], original: [],
  }
}
/** the sentence of a word of the text by its sentences' word starts */
const sentenceOfWord = (text: string, offsets: number[], w: number) => offsets.filter(o => wordsOf(text.slice(0, o)).length <= w).length

/** each sentence's shapes on a pane, and the tokens whose centre each covers (0.3 inside its edge) */
function lit(shapes: { runs: (id: number) => readonly object[]; sentence: (run: never, starts: Int32Array, s: number, padX: number) => { page: number; x0: number; x1: number; y0: number; y1: number }[] }, starts: Int32Array, centres: { x: number; y: number }[]) {
  const rects = [0, 1, 2].map(s => shapes.runs(0).flatMap(run => shapes.sentence(run as never, starts, s, PAD)))
  return rects.map(rs => centres.map((c, i) => (rs.some(r => c.x >= r.x0 + 0.3 && c.x <= r.x1 - 0.3 && c.y >= r.y0 + 0.3 && c.y <= r.y1 - 0.3) ? i : -1)).filter(i => i >= 0))
}

describe('a sentence lights the words the text puts in it, on both panes', () => {
  const truthR = RIGHT.map(t => (t.word >= 0 ? sentenceOfWord(TR, TR_OFFSETS, t.word) : TR_OFFSETS.filter(o => o <= t.at).length))
  const byTruth = (truth: number[]) => [0, 1, 2].map(s => truth.flatMap((t, i) => (t === s ? [i] : [])))

  for (const [order, toks] of [
    ['in the flow (the display between the text around it)', RIGHT],
    ['the display written after the text (the word table before the fix)', [...RIGHT.filter(t => t.s !== 'x'), RIGHT.find(t => t.s === 'x')!]],
  ] as const) {
    it(`on a laid page, whatever the table's order: ${order}`, () => {
      const { left, right } = sides()
      right.lay(1, laid([...toks]))
      const ls = left.starts(0, SRC, SRC_OFFSETS)!
      const rs = right.starts(0, TR, TR_OFFSETS, ls)!
      expect(rs).not.toBeNull()
      expect(rs.length).toBe(ls.length)
      expect(right.shapes.fits(0, rs, true)).toBe(true)
      // each sentence's shape holds its own tokens and no other's (C and X), the display in the middle one
      const centres = toks.map(t => ({ x: t.x + 2.5 * t.s.length, y: t.y + 2.65 }))
      const truth = toks.map(t => truthR[RIGHT.indexOf(t)]!)
      expect(truth[toks.findIndex(t => t.s === 'x')]).toBe(1)
      expect(lit(right.shapes, rs, centres)).toEqual(byTruth(truth))
    })
  }

  it('on the left, by the words its tokens are paired with, the formula\'s glyph by the stream: unchanged from the starts alone', () => {
    const { left } = sides()
    const ls = left.starts(0, SRC, SRC_OFFSETS)!
    expect(left.shapes.fits(0, ls, true)).toBe(true)
    const centres = doc.map(t => ({ x: t.x + t.w / 2, y: (t.top + t.bottom) / 2 }))
    const truth = doc.map((_, k) => (k === display ? 1 : sentenceOfWord(SRC, SRC_OFFSETS, [...pairs].find(([, t]) => t === k)![0])))
    expect(lit(left.shapes, ls, centres)).toEqual(byTruth(truth))
    // the shapes the starts alone give, the layout made whole: the same
    const plain = sentenceStarts(anchors.get(0), SRC, SRC_OFFSETS)!
    for (let s = 0; s < 3; s++) expect(left.shapes.runs(0).flatMap(run => left.shapes.sentence(run, ls, s, PAD))).toEqual(runsOf(whole, 0).flatMap(run => sentenceOf(whole, run, plain, s, PAD)))
  })

  it('lights the unit whole where the drawing does not keep the text\'s order: the text after a display run on above it', () => {
    // ('flow': the line after the display laid on the slot above it, the display below that line. By the stream's order and
    // its floor the display was the last sentence's; by the text the middle sentence spans the last one's row)
    const toks: Tok[] = [...RIGHT.slice(0, 4), { ...RIGHT[4]!, y: 694 }, ...RIGHT.slice(5).map(t => ({ ...t, y: 718 }))]
    const { left, right } = sides()
    right.lay(1, laid(toks))
    const rs = right.starts(0, TR, TR_OFFSETS, left.starts(0, SRC, SRC_OFFSETS))!
    expect(rs).not.toBeNull()
    expect(right.shapes.fits(0, rs, true)).toBe(false)
  })
})

describe('a sentence of one run painted over another run\'s word of another sentence', () => {
  // A page of two columns (units 1 and 2 hold four long lines in each); unit 0 in the left column, its display wider than the
  // column (across the middle: a run of its own, the page's full width), its two lines on either side of the line where the
  // second sentence begins. The display's run paints its sentence across its rows, over that line
  const items = [
    ...words('Aaa bbb.', 740), item('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 200, 728, true), item('yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy', 200, 704, true),
    ...words('Ccc ddd', 716), ...words('eee fff.', 692),
    ...[0, 1, 2, 3].map(i => item('left column text of another unit here', 50, 600 - 12 * i, true)),
    ...[0, 1, 2, 3].map(i => item('right column text of another unit here', 310, 600 - 12 * i, true)),
  ]
  const d2: DocToken[] = tokenizeDocument([{ page: 1, items, styles: {} }])
  const u0 = d2.flatMap((t, k) => (t.y > 650 ? [k] : [])), u1 = d2.flatMap((t, k) => (t.y < 650 && t.x < 300 ? [k] : [])), u2 = d2.flatMap((t, k) => (t.y < 650 && t.x > 300 ? [k] : []))
  const glyphs = new Set(d2.flatMap((t, k) => (/^[xy]+$/.test(t.t) ? [k] : [])))
  const src = 'Aaa bbb. Ccc ddd eee fff.', offsets = [src.indexOf('Ccc')]
  const a2 = new Map<number, Anchor | null>([
    [0, { tokens: u0, rects: lineRects(d2, u0), coverage: 1, bounded: true, pairs: new Map(u0.filter(k => !glyphs.has(k)).map((k, w) => [w, k])) }],
    [1, { tokens: u1, rects: lineRects(d2, u1), coverage: 1, bounded: true }],
    [2, { tokens: u2, rects: lineRects(d2, u2), coverage: 1, bounded: true }],
  ])

  it('lights the unit whole: its runs\' sentences each hold their own words, but not apart from each other', () => {
    const w2 = layoutOf(d2, views, a2, () => 'para')
    const { parts, lefts } = cutSide(w2, a2, views)
    const left = createShapes({ kindOf: () => 'para' })
    left.addParts(parts)
    left.addPage(lefts[1]!)
    const ls = left.starts(0, src, offsets)!
    expect(ls).not.toBeNull()
    const runs = left.shapes.runs(0)
    expect(new Set(runs.map(r => r.col))).toEqual(new Set(['L', 'F']))
    // the display's run (the page's width) paints the first sentence over "Ccc", the second's first word, in its own run
    const display = runs.find(r => r.col === 'F')!, ccc = d2.find(t => t.t === 'ccc')!
    const at = { x: ccc.x + ccc.w / 2, y: (ccc.top + ccc.bottom) / 2 }
    expect(left.shapes.sentence(display, ls, 0, 0).some(r => at.x > r.x0 && at.x < r.x1 && at.y > r.y0 && at.y < r.y1)).toBe(true)
    expect(left.shapes.fits(0, ls, true)).toBe(false)
  })
})
