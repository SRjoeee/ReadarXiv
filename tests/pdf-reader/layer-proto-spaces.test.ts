import { beforeAll, describe, expect, it } from 'vitest'
import { addUnitWords, newWords } from '@/pdf-reader/engine/layer-proto/words.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// White space in a target whose script sets no spaces between words (Chinese, Japanese: the layout rules' keepAll false), and
// the source's explicit glue in every target (E3 of the 50-paper sweep's residuals, 2026-10-19):
// - a space whose nearest drawn neighbours are both Han, Kana or full-width punctuation is not drawn, whatever set it there:
//   the translator's reply, a TeX inter-word space (`~`, `\ `), a forced break the layout does not locate (`\\`);
// - except the space after a styled pair that opens the unit (a run-in head: `\noindent\textbf{Title}` and the text after
//   it, where the sweep's ten rows have TeX's own inter-word space);
// - explicit glue (`\enspace`, `\quad`, `\hspace{6pt}`, \u2026) is a kern at TeX's width after the token before it, never a
//   U+0020: the reply's padding around its marker goes with it;
// - Korean and the alphabets keep every space; a formula crop keeps the space beside it (its autospace).

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type Tex = typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
let L2: L2
let T: Tex
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  T = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
})

const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
const paramsFor = (to: string) => ({ ...resolveRules(BUILTIN_RULES, to).params, autospace: 0, compressMax: -1, hyphen: 0 })
const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
const open = (src: string, id = 1) => ({ t: 'open', id, src }), close = (id = 1) => ({ t: 'close', id, src: '}' })
/** each character 50 wide at 100 px: a kern's width shows as the rest */
const measure = (s: string) => 50 * [...s].length
type Tok = { s?: string; space?: boolean; w100: number; kern?: boolean; kernW?: number; glue?: boolean; crop?: unknown }
const tokensOf = (pieces: unknown[], to = 'zh', resolved: unknown = new Map()) =>
  L2.tokensOf2({ kind: 'para', src: '', pieces } as never, resolved as never, to, BASE as never, DESIGNS as never, paramsFor(to) as never, null, measure as never) as unknown as Tok[]
/** the tokens as a string: a space as "_", a kern as "+<em>", a crop as "X" */
const shape = (ts: Tok[]) => ts.map(t => (t.space ? '_' : t.crop ? 'X' : `${t.s}${t.kernW ? `+${t.kernW / 100}` : ''}`)).join(' ')

describe('a space between two CJK characters in Chinese and Japanese', () => {
  it("is not drawn where the reply holds it, beside an ideograph, a kana or a full-width mark", () => {
    expect(shape(tokensOf([text('\u76f8\u5bf9\u4e8e  \u7684\u5e73\u7a33')]))).toBe('\u76f8 \u5bf9 \u4e8e \u7684 \u5e73 \u7a33')
    expect(shape(tokensOf([text('\u5f00\u59cb\uff0c \u662f')]))).toBe('\u5f00 \u59cb \uff0c \u662f')
    expect(shape(tokensOf([text('\u3042 \u30a2')], 'ja'))).toBe('\u3042 \u30a2')
  })
  it('is not drawn where a TeX space set it: a tie, a control space, a forced break the layout does not locate', () => {
    for (const src of ['~', '\\ ', '\\\\']) {
      const r = new Map([[1, { mode: 'none', text: ' ', k: 1, cls: 'space' }]])
      expect(shape(tokensOf([text('\u4f8b\u5982'), ph(src), text('\u5b58\u6839')], 'zh', r)), src).toBe('\u4f8b \u5982 \u5b58 \u6839')
    }
  })
  it('is drawn beside a Latin word, a formula crop, and in Korean and the alphabets', () => {
    expect(shape(tokensOf([text('\u4f7f\u7528 BERT \u548c')]))).toBe('\u4f7f \u7528 _ BERT _ \u548c')
    const crop = new Map([[1, { mode: 'crop', crop: [0, 0, 10, 10], page: 1, baseline: 2, k: 1, cls: 'other' }]])
    expect(shape(tokensOf([text('\u8bbe '), ph('$X$'), text(' \u548c')], 'zh', crop))).toBe('\u8bbe _ X _ \u548c')
    expect(shape(tokensOf([text('\uac00 \ub098')], 'ko'))).toBe('\uac00 _ \ub098')
    expect(shape(tokensOf([text('a b')], 'de'))).toBe('a _ b')
  })
  it("is drawn after a styled pair that opens the unit: a run-in head", () => {
    // 2610.22065's `\noindent\textbf{Full Component Ablation}\nTable~\ref{\u2026}`: TeX's own inter-word space after the head
    const head = [ph('\\noindent'), open('\\textbf{'), text('\u5168\u7ec4\u4ef6\u6d88\u878d'), close(), text(' \u8868\u683c')]
    expect(shape(tokensOf(head))).toBe('\u5168 \u7ec4 \u4ef6 \u6d88 \u878d _ \u8868 \u683c')
    // a pair inside the sentence is no head: its padding goes
    expect(shape(tokensOf([text('\u8fd9'), open('\\textbf{'), text('\u4e09\u79cd'), close(), text(' \u4f20\u8f93')]))).toBe('\u8fd9 \u4e09 \u79cd \u4f20 \u8f93')
    // nor is a pair after the unit's first drawn token, though nothing but a space stands before it
    expect(shape(tokensOf([text('\u7532 '), open('\\textbf{'), text('\u4e59'), close(), text(' \u4e19')]))).toBe('\u7532 \u4e59 \u4e19')
  })
  it('is drawn inside a code run, and in a unit whose source sets CJK with spaces between', () => {
    // (a code run's spaces are its content: `\\texttt{\u6211 \u7231 \u5317\u4eac}`)
    expect(shape(tokensOf([text('\u4ee3\u7801 '), open('\\texttt{'), text('\u6211 \u7231 \u5317\u4eac'), close()]))).toBe('\u4ee3 \u7801 \u6211 _ \u7231 _ \u5317 \u4eac')
    // (a paper that writes Chinese with spaces between, its own: its translation's spaces stand as well)
    const own = L2.tokensOf2({ kind: 'para', src: 'as in \u6211 \u7231', pieces: [text('\u76f8\u5bf9 \u7684')] } as never, new Map() as never, 'zh', BASE as never, DESIGNS as never, paramsFor('zh') as never, null, measure as never) as unknown as Tok[]
    expect(shape(own)).toBe('\u76f8 \u5bf9 _ \u7684')
  })
  it('is drawn in Korean between full-width marks, and beside a curly quote where the rules set no CJK quotes', () => {
    // Korean sets spaces between its words (keepAll): its corner brackets keep the space between them
    expect(shape(tokensOf([text('\u300c\uac00\u300d \u300c\ub098\u300d')], 'ko'))).toBe('\u300c\uac00\u300d _ \u300c\ub098\u300d')
    // a target's rules that set no curly quote as CJK's: the space beside one stands
    const P = { ...paramsFor('zh'), cjkQuotes: false }
    const at = (cjkQuotes: boolean) => shape(L2.tokensOf2({ kind: 'para', src: '', pieces: [text('\u201c\u7532\u201d \u4e59')] } as never, new Map() as never, 'zh', BASE as never, DESIGNS as never, { ...P, cjkQuotes } as never, null, measure as never) as unknown as Tok[])
    expect(at(false)).toContain('_')
    expect(at(true)).not.toContain('_')
  })
  it('is drawn beside a superscript (a footnote mark), which is no CJK edge', () => {
    const r = new Map([[1, { mode: 'orig-text', text: '\u6ce8', sup: true, k: 1, cls: 'other' }]])
    expect(shape(tokensOf([text('\u7532'), ph('\\footnotemark'), text(' \u4e59')], 'zh', r))).toBe('\u7532 \u6ce8 _ \u4e59')
  })
})

describe("the source's explicit glue: a kern at TeX's width, never a space", () => {
  it('\\enspace is half an em after the token before it, its padding in the reply gone, in Chinese and in German', () => {
    const zh = tokensOf([text('\u7b2c2149\u6b65'), ph('\\enspace'), text(' \u5de5\u5177\u8f93\u51fa')])
    expect(shape(zh)).toBe('\u7b2c 2149 \u6b65+0.5 \u5de5 \u5177 \u8f93 \u51fa')
    const de = tokensOf([text('Step 2149 '), ph('\\enspace'), text(' Tool Output')], 'de')
    expect(shape(de)).toBe('Step _ 2149+0.5 Tool _ Output')
    // a kern is no break: the word after it stands with the one before it (TeX's \kern)
    expect(de.find(t => t.s === 'Tool')?.glue).toBe(true)
  })
  it('\\quad and \\qquad are one and two ems, glue a line may break at; \\, \\: \\; and \\thinspace their kerns', () => {
    const q = tokensOf([text('Acknowledgements'), ph('\\quad'), text('We thank')], 'de')
    expect(shape(q)).toBe('Acknowledgements+1 We _ thank')
    expect(q.find(t => t.s === 'We')?.glue).toBeFalsy()
    expect(shape(tokensOf([text('a'), ph('\\qquad'), text('b')], 'de'))).toBe('a+2 b')
    for (const [src, em] of [['\\,', 1 / 6], ['\\thinspace', 1 / 6], ['\\:', 2 / 9], ['\\;', 5 / 18]] as const) {
      const t = tokensOf([text('100'), ph(src), text('%')], 'de')
      expect(t[0]?.kernW, src).toBeCloseTo(100 * em, 6)
    }
  })
  it('\\hspace at its length, in em of the unit\'s size for an absolute one; none it cannot read', () => {
    const at = (src: string) => tokensOf([text('\u7532'), ph(src), text('\u4e59')], 'zh', Object.assign(new Map(), { orig: { size: 12 } }))[0]?.kernW ?? 0
    expect(at('\\hspace{2em}')).toBeCloseTo(200, 6)
    expect(at('\\hspace*{1em}')).toBeCloseTo(100, 6)
    // 6pt at a 12 bp size: TeX's points are 72.27 to the inch, PDF's 72
    expect(at('\\hspace{6pt}')).toBeCloseTo((100 * 6 * 72) / 72.27 / 12, 6)
    expect(at('\\hspace{3mm}')).toBeCloseTo((100 * 3 * 72) / 25.4 / 12, 6)
    for (const src of ['\\hspace{-1em}', '\\hspace{\\fill}', '\\hspace{0.5\\linewidth}', '\\hspace{1ex}']) expect(at(src), src).toBe(0)
    // a unit whose size is not known has no absolute glue
    expect(tokensOf([text('\u7532'), ph('\\hspace{6pt}'), text('\u4e59')])[0]?.kernW ?? 0).toBe(0)
  })
  it('takes the place of the autospace: no CJK\u2013Latin space after a kern', () => {
    const asp = (pieces: unknown[]) => (L2.tokensOf2({ kind: 'para', src: '', pieces } as never, new Map() as never, 'zh', BASE as never, DESIGNS as never, { ...paramsFor('zh'), autospace: 0.25 } as never, null, measure as never) as unknown as { s?: string; asp?: boolean }[]).find(t => t.s === 'BERT')?.asp ?? false
    expect(asp([text('\u5b57BERT')])).toBe(true)
    expect(asp([text('\u5b57'), ph('\\quad'), text('BERT')])).toBe(false)
  })
  it("stays after a word the breaker cuts in two: the word's tail holds it, never its head", () => {
    const P = paramsFor('de')
    const block = { page: 1, rects: [[1, 10, 97.85, 60, 106.83], [1, 10, 85.85, 60, 94.83]], x0: 10, x1: 60, B: [100, 88], exact: [true, true], sizes: [10, 10], pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
    const L = L2.layoutUnit2(tokensOf([text('aaaaaaaaaaaaaa'), ph('\\quad'), text('b')], 'de') as never, [block] as never, 10, P as never)
    const items = L.lines.flatMap(l => l.items.map(it => it.t as Tok))
    expect(items.map(t => [t.s, t.kernW ?? 0])).toEqual([['aaaaaaaaaa', 0], ['aaaa', 100], ['b', 0]])
  })
  it("at the unit's start, none: TeX's line starts after it", () => {
    expect(shape(tokensOf([ph('\\noindent'), ph('\\hspace*{1em}'), text('\u7532\u4e59')]))).toBe('\u7532 \u4e59')
  })
  it('its width is laid and drawn: the next character stands a kern further, and no space is in the text drawn', () => {
    const tokens = tokensOf([text('\u6b65'), ph('\\enspace'), text(' \u5de5')]) as never
    const P = paramsFor('zh')
    const block = { page: 1, rects: [[1, 10, 97.85, 300, 106.83]], x0: 10, x1: 300, B: [100], exact: [true], sizes: [10], pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
    const L = L2.layoutUnit2(tokens, [block] as never, 10, P as never) as unknown as { lines: { items: { x: number; t: { s?: string } }[] }[] }
    const [a, b] = L.lines[0]!.items
    // (the character's own 0.5 em at size 10, and the kern's 0.5 em)
    expect(b!.x - a!.x).toBeCloseTo(10, 6)
    const svg = L2.svgOfUnit(L as never, 1, (x: number, y: number) => [x, 792 - y], 1, 0)
    expect(svg).toContain('>\u6b65\u5de5<')
  })
  it('a kern at the end of a laid line is dropped from its width', () => {
    const P = paramsFor('de')
    const tokens = tokensOf([text('aa'), ph('\\quad'), text('bbbbbbbbbbbbbbbbbbbbbbbbbbbb')], 'de') as never
    const block = { page: 1, rects: [[1, 10, 97.85, 30, 106.83], [1, 10, 85.85, 300, 94.83]], x0: 10, x1: 300, B: [100, 88], exact: [true, true], sizes: [10, 10], pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
    const L = L2.layoutUnit2(tokens, [{ ...block, x1: 30 }] as never, 10, P as never) as unknown as { f: number; lines: { used: number; items: { w: number }[] }[] }
    // ("aa" alone, at the size the fit chose: its two characters' half ems, no em of glue after them)
    expect(L.lines.length).toBeGreaterThan(1)
    expect(L.lines[0]!.items.at(-1)!.w).toBeCloseTo(L.f, 6)
    // and its word box is its two characters, the kern taken off once (the word table: words.mjs)
    const tagged = L2.tokensOf2({ kind: 'para', src: '', pieces: [{ ...text('aa'), tr: true }, ph('\\quad'), { ...text('bbbbbbbbbbbbbbbbbbbbbbbbbbbb'), tr: true }] } as never, new Map() as never, 'de', BASE as never, DESIGNS as never, P as never, null, measure as never, true)
    const LT = L2.layoutUnit2(tagged, [{ ...block, x1: 30 }] as never, 10, P as never)
    const W = newWords()
    addUnitWords(W, LT, 1, 0, null as never)
    expect(W.r[0]! - W.l[0]!).toBeCloseTo(LT.f, 6)
  })
  it("after a crop, it is an advance after the crop's image, never its width: the image, its word box and its link drawn at its own", async () => {
    // a formula 10 wide, then \\quad (an em at size 10): the crop drawn 10 wide, the word after it 20 on
    const r = Object.assign(new Map([[1, { mode: 'crop', crop: [0, 0, 10, 10], page: 1, baseline: 2, k: 1, cls: 'other', text: 'X' }]]), { orig: { size: 10 } })
    const P = paramsFor('de')
    const block = { page: 1, rects: [[1, 10, 97.85, 300, 106.83]], x0: 10, x1: 300, B: [100], exact: [true], sizes: [10], pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
    const L = L2.layoutUnit2(tokensOf([text('a '), ph('$X$'), ph('\\quad'), text('bbb ccc')], 'de', r) as never, [block] as never, 10, P as never)
    expect(L.scale).toBe(1)
    const items = L.lines[0]!.items, c = items.findIndex(it => it.t.crop)
    expect(items[c + 1]!.x - items[c]!.x).toBeCloseTo(20, 6)
    const id = (x: number, y: number) => [x, y]
    const audit: { what: string; dst?: number[] }[] = []
    const ops = L2.unitOps(L, [], 1, { px: id, k: 1, hasSource: () => true, pxOf: () => id, audit: audit as never, id: 3 } as never) as { op: string; dst?: number[] }[]
    expect(ops.find(o => o.op === 'crop')!.dst![2]).toBeCloseTo(10, 6)
    const a = audit.find(x => x.what === 'crop')!.dst!
    expect(a[2]! - a[0]!).toBeCloseTo(10, 6)
    const W = newWords()
    addUnitWords(W, L, 1, 3, null as never)
    const at = [...Array(W.n).keys()].find(i => Math.abs(W.l[i]! - items[c]!.x) < 1e-6)!
    expect(W.r[at]! - W.l[at]!).toBeCloseTo(10, 6)
    const { placeUnit } = await import('@/pdf-reader/engine/layer-proto/links.mjs')
    const annot = { i: 0, rect: [0, 0, 10, 10], boxes: [[0, 0, 10, 10]], url: 'https://x.org', ov: 'X', border: null, g: { x: [], y: [], ch: [] }, g2: { x: [], y: [], ch: [], key: [] } }
    const lines = L.lines.map(line => ({ line, runs: L2.lineRuns(line, L) }))
    const placed = placeUnit({ groups: [{ to: { ord: 1, k: 1, kind: 'url', url: 'https://x.org', single: true, gap: null, segs: null, draw: 'crop' }, annots: [{ q: 1, a: annot, tier: 'url' }] }], lines, edge: () => 0, band: () => ({ top: 0, bottom: 0 }), scale: L.scale } as never)
    const b = placed.records[0]!.rec.boxes
    expect(b[2]! - b[0]!).toBeCloseTo(10, 6)
  })
  it('is a space in the text copied: a word before it and the word after it are two words', () => {
    const P = paramsFor('de')
    const block = { page: 1, rects: [[1, 10, 97.85, 300, 106.83]], x0: 10, x1: 300, B: [100], exact: [true], sizes: [10], pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
    const copied = (pieces: unknown[], to: string) => {
      const L = L2.layoutUnit2(tokensOf(pieces, to) as never, [block] as never, 10, (to === 'de' ? P : paramsFor(to)) as never)
      return L2.svgOfUnit(L as never, 1, (x: number, y: number) => [x, 792 - y], 1, 0).replace(/<[^>]+>/g, '')
    }
    expect(copied([text('Step 2149'), ph('\\enspace'), text(' Tool Output')], 'de')).toBe('Step 2149 Tool Output ')
    expect(copied([text('Acknowledgements'), ph('\\quad'), text(' We thank')], 'de')).toBe('Acknowledgements We thank ')
    expect(copied([text('GPT'), ph('\\quad'), text(' BERT')], 'zh')).toBe('GPT BERT ')
  })
})

describe('a space placeholder TeX set ink for is drawn as that ink', () => {
  // 2610.21547's keywords, `Federated Learning \\and Transfer Learning`: llncs's \\and in \\keywords sets " \u00b7 " between them,
  // and the layout file finds that ink as the placeholder's own (a found row with its segment); drawn as a space, the dot
  // was erased with the line and lost
  const serif = { fam: 'serif', bold: false, italic: false, caps: false, known: false }
  const item = (s: string, x: number, yb: number, size: number, n: number) => [...s].map((ch, k) => ({ ch, x0: x + 0.5 * size * k, x1: x + 0.5 * size * (k + 1), yb, size, item: n, ix: x, k, st: serif }))
  const lu = {
    lines: Float64Array.from([1, 10, 120, 500, 507, 498, 10, 0]), frames: Float64Array.from([1, 0, 0, 1, -1, 0]), erase: [new Float64Array(0)],
    ph: new Map([[1, { kind: 'macro', flags: 0, segs: Float64Array.from([1, 58, 500, 61, 503, 500]) }]]), labels: new Float64Array(0),
  } as never
  const page = [...item('Federated', 10, 500, 10, 0), ...item('\u00b7', 58, 500, 6, 1), ...item('Transfer', 66, 500, 10, 2)]
  const u = { kind: 'para', src: 'Federated Transfer', pieces: [text('\u8054\u90a6 '), ph('\\and'), text(' \u8f6c\u79fb')] } as never
  const read = (file: boolean) => {
    const t = T.texRects(lu)
    return file ? L2.prepareUnit(u, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'lines', lines: t }) as never) : L2.prepareUnit(u, t.rects as never, [page as never], new Map() as never)
  }
  it('as its page text where the file finds its row, and set as a CJK mark in Chinese (no space either side)', () => {
    const prep = read(true)
    expect(prep.unproven).toBeUndefined()
    expect(prep.get(1)).toMatchObject({ mode: 'orig-text', text: '\u00b7' })
    expect(shape(L2.tokensOf2(u, prep as never, 'zh', BASE as never, DESIGNS as never, paramsFor('zh') as never, null, measure as never) as never)).toBe('\u8054 \u90a6 \u00b7 \u8f6c \u79fb')
  })
  it('as a space where nothing tells its ink (v0 alone)', () => {
    expect(read(false).get(1)).toMatchObject({ mode: 'none', text: ' ' })
  })
})
