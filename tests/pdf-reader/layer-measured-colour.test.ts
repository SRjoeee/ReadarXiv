import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'
import { plainSource } from '@/pdf-reader/engine/translate/mt.mjs'

// Colour, weight and slant as measured attributes of the original's glyphs (E1 of the residuals' batch R2): a unit's base from
// its glyphs outside its styled pieces, a piece's colour from its own, a rendering of the page's characters in their own fills

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const serif = { fam: 'serif', bold: false, italic: false, caps: false, known: false, design: 'times' }
type St = typeof serif & { fill?: number }
const bold = (fill?: number): St => ({ ...serif, bold: true, ...(fill === undefined ? {} : { fill }) })
const plain = (fill?: number): St => ({ ...serif, ...(fill === undefined ? {} : { fill }) })
const italic = (fill?: number): St => ({ ...serif, italic: true, ...(fill === undefined ? {} : { fill }) })
/** a text item's characters, each half its size wide, from x on baseline 100 */
const item = (text: string, x: number, n: number, st: St | ((k: number) => St)) => [...text].map((ch, k) => ({ ch, x0: x + 5 * k, x1: x + 5 * (k + 1), yb: 100, size: 10, item: n, ix: x, k, st: typeof st === 'function' ? st(k) : st }))
/** the page of `items` ([text, st] in turn, one space apart) and its line's rectangle */
const pageOf = (items: [string, St | ((k: number) => St)][]) => {
  let x = 10
  const chars = items.flatMap(([t, st], n) => { const c = item(t, x, n, st); x += 5 * [...t].length + 5; return c })
  return { page: chars, rect: [1, 10, 97.85, x, 106.83] }
}
const text = (s: string, tr = false) => ({ t: 'text', s, ...(tr ? { tr: true } : {}) })
const ph = (src: string) => ({ t: 'ph', src })
const open = (src: string, id: number) => ({ t: 'open', id, src }), close = (id: number) => ({ t: 'close', id, src: '}' })
/** a drawn unit as rows.mjs unitOf makes it: its translated pieces, its source pieces by identity (each with its k) beside them */
const unitOf = (source: Record<string, unknown>[], translated: (number | string)[], kind = 'para') => {
  const src = source.map((p, k) => ({ ...p, k }))
  const u = { kind, src: plainSource({ pieces: src } as never), state: 'whole', pieces: translated.map(p => (typeof p === 'number' ? src[p] : text(p, true))) }
  Object.defineProperty(u, 'source', { value: src, enumerable: false })
  return u as never
}
const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
const P = () => ({ ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0 })
const tokensOf = (u: never, page: ReturnType<typeof pageOf>, parts: unknown = null) => {
  const prep = L2.prepareUnit(u, [page.rect] as never, [page.page as never], new Map() as never, null, parts as never)
  const tokens = L2.tokensOf2(u, prep as never, 'zh', BASE as never, DESIGNS as never, P() as never, null, () => 0) as unknown as { s?: string; st: { bold?: boolean; italic?: boolean; color?: string }; k?: number }[] & { base: { bold: boolean; italic: boolean; color?: string } }
  return { prep, tokens, drawn: tokens.filter(t => typeof t.s === 'string' && /\S/.test(t.s)) }
}

describe('sourceScopes and measuredStyle', () => {
  it('reads what each code point of the source is inside, any spelling: a bare group with a switch, a pair, a paper\'s own macro', () => {
    const u = unitOf([open('{', 1), ph('\\bf'), text(' Batch size'), close(1), text(': 16, 32')], []) as { src: string }
    const sc = L2.sourceScopes(u as never)!
    expect(u.src).toBe('Batch size : 16, 32')
    // (the group's letters bold-set, its white space and the text after it not)
    expect(sc.map(x => x.sets & 1).join('')).toBe('1111101111000000000')
    const m = unitOf([text('We see '), open('\\trajectoryRole[x]{', 1), open('\\textbf{', 2), text('a'), close(2), text(' b'), close(1)], []) as { src: string }
    const ms = L2.sourceScopes(m as never)!
    expect(ms.at(-1)).toEqual({ sets: 31, chain: [1] })
    expect(ms.at(-3)).toEqual({ sets: 31, chain: [1] })
    expect(ms[0]).toEqual({ sets: 0, chain: [] })
    // (no source pieces, or a text that is not the unit's: none read)
    expect(L2.sourceScopes({ src: 'x', pieces: [] } as never)).toBeNull()
    const off = unitOf([text('a b')], [])
    ;(off as { src: string }).src = 'a c'
    expect(L2.sourceScopes(off)).toBeNull()
  })

  it('ties go to regular, upright and black, else to the first glyph\'s value', () => {
    const c = (st: St, sets = 0) => ({ st: st as never, sets, chain: [] as number[] })
    expect(L2.measuredStyle([c(bold()), c(plain())])!.st.bold).toBe(false)
    expect(L2.measuredStyle([c(plain(0xff0000)), c(plain(0x0000ff))])!.fill).toBe(0xff0000)
    expect(L2.measuredStyle([c(plain(0x0000ff)), c(plain(0xff0000))])!.fill).toBe(0x0000ff)
    expect(L2.measuredStyle([c(plain(0x0000ff)), c(plain(0))])!.fill).toBe(0)
    // (the same input, the same answer)
    const xs = [c(bold(0x0c5388), 1), c(plain(0x0c5388)), c(italic(0), 2)]
    expect(L2.measuredStyle(xs)).toEqual(L2.measuredStyle(xs))
  })
})

describe('the unit\'s base, measured outside its styled pieces', () => {
  it('"{\\bf Batch size}: 16, 32" (1810.04805\'s u220): its text regular, its group bold, though the bold glyphs are most', () => {
    const page = pageOf([['Batch size', bold()], [':', plain()], ['16,', plain()], ['32', plain()]])
    const u = unitOf([open('{', 1), ph('\\bf'), text(' Batch size'), close(1), text(': 16, 32')], [0, 1, '\u6279\u6B21', 3, '\uFF1A16\uFF0C32'])
    const { tokens, drawn } = tokensOf(u, page)
    expect(tokens.base.bold).toBe(false)
    expect(drawn.map(t => [t.s, !!t.st.bold])).toEqual([['\u6279', true], ['\u6B21', true], ['\uFF1A16\uFF0C32', false]].flatMap(([s, b]) => (s === '\uFF1A16\uFF0C32' ? [['\uFF1A', b], ['16', b], ['\uFF0C', b], ['32', b]] : [[s, b]])))
  })

  it('"\\textbf{RQ1:} \\textit{...}" (2608.04322): each attribute from the glyphs no piece setting it holds: upright and regular', () => {
    const page = pageOf([['RQ1:', bold()], ['Does', italic()], ['it', italic()], ['work', italic()], ['well', italic()]])
    const u = unitOf([open('\\textbf{', 1), text('RQ1:'), close(1), text(' '), open('\\textit{', 2), text('Does it work well'), close(2)], [0, 'RQ1\uFF1A', 2, 4, '\u6709\u6548\u5417', 6])
    const { tokens } = tokensOf(u, page)
    expect([tokens.base.bold, tokens.base.italic]).toEqual([false, false])
  })

  it('a unit wholly inside a style pair: of all its glyphs (nothing lies outside)', () => {
    const page = pageOf([['Introduction', bold()]])
    const u = unitOf([open('\\textbf{', 1), text('Introduction'), close(1)], [0, '\u5F15\u8A00', 2], 'heading')
    expect(tokensOf(u, page).tokens.base.bold).toBe(true)
  })

  it('a heading its class colours (2610.20266\'s #0c5388), no colour piece in its source: drawn in its glyphs\' colour', () => {
    const page = pageOf([['Related', bold(0x0c5388)], ['Work', bold(0x0c5388)]])
    const u = unitOf([text('Related Work')], ['\u76F8\u5173\u5DE5\u4F5C'], 'heading')
    const { tokens, drawn } = tokensOf(u, page)
    expect(tokens.base.color).toBe('#0c5388')
    expect(new Set(drawn.map(t => t.st.color))).toEqual(new Set(['#0c5388']))
  })

  it('a colour inside a sentence is no base: the words outside it say black; the pair kept on the wire takes its own glyphs\' red', () => {
    const page = pageOf([['We', plain(0)], ['see', plain(0)], ['the', plain(0xff0000)], ['red', plain(0xff0000)], ['words', plain(0xff0000)], ['in', plain(0)], ['it', plain(0)]])
    const u = unitOf([text('We see '), open('\\mycolour{', 1), text('the red words'), close(1), text(' in it')], ['\u6211\u4EEC\u770B\u5230', 1, '\u7EA2\u8BCD', 3, '\u5728\u5176\u4E2D'])
    const { tokens, drawn } = tokensOf(u, page)
    expect(tokens.base.color).toBeUndefined()
    expect(drawn.map(t => t.st.color ?? null)).toEqual([null, null, null, null, '#ff0000', '#ff0000', null, null, null])
  })

  it('the trajectory header (2610.19159): a paper\'s own macros, each pair in its own glyphs\' colour, none of them black', () => {
    const page = pageOf([['Step', plain(0x245b60)], ['2149', plain(0x245b60)], ['Tool', plain(0x243447)], ['Output', plain(0x243447)]])
    const u = unitOf([open('\\trajectoryRole[out]{', 1), open('\\trajectoryIndex{', 2), text('Step 2149'), close(2), ph('\\enspace'), text(' Tool Output'), close(1)], [0, 1, '\u7B2C2149\u6B65', 3, 4, '\u5DE5\u5177\u8F93\u51FA', 6], 'heading')
    const { drawn } = tokensOf(u, page)
    const colour = (s: string) => drawn.filter(t => t.s!.includes(s)).map(t => t.st.color)
    expect(new Set(colour('2149'))).toEqual(new Set(['#245b60']))
    expect(new Set(colour('\u5DE5'))).toEqual(new Set(['#243447']))
  })

  it('a colours row (TeX\'s) wins over the measured colour of its piece', () => {
    const page = pageOf([['the', plain(0xff0000)], ['words', plain(0xff0000)]])
    const u = unitOf([open('\\textcolor{red}{', 1), text('the words'), close(1)], [0, '\u8FD9\u4E9B\u8BCD', 2])
    const { drawn } = tokensOf(u, page, { colourOf: (k: number) => (k === 0 ? 0x123456 : null) })
    expect(new Set(drawn.map(t => t.st.color))).toEqual(new Set(['#123456']))
  })
})

describe('a rendering of the page\'s characters, in their own fills', () => {
  it('"[16]": its brackets black, its number in the link\'s blue (a tie, which one majority fill drew in the run\'s ink)', () => {
    const page = pageOf([['as', plain(0)], ['in', plain(0)], ['[16]', k => plain(k === 1 || k === 2 ? 0x0000ff : 0)], ['here', plain(0)]])
    const u = unitOf([text('as in '), ph('\\cite{k}'), text(' here')], ['\u5982 ', 1, ' \u6240\u793A'])
    const { prep, drawn } = tokensOf(u, page)
    expect((prep.get(1) as { mode?: string } | undefined)?.mode).toBe('orig-text')
    expect(drawn.filter(t => t.k === 1).map(t => [t.s, t.st.color ?? null])).toEqual([['[', null], ['16', '#0000ff'], [']', null]])
  })

  it('cleveref\'s number in its link\'s green; "[1, 2]" its brackets and comma black, its numbers blue', () => {
    const page = pageOf([['see', plain(0)], ['Figure', plain(0)], ['1', plain(0x00aa00)], ['and', plain(0)]])
    const u = unitOf([text('see '), ph('\\cref{fig:a}'), text(' and')], ['\u89C1', 1, '\u548C'])
    // (v0 reads cleveref's rendering as its number, its name the gap's other part)
    expect(tokensOf(u, page).drawn.filter(t => t.k === 1).map(t => [t.s, t.st.color ?? null])).toEqual([['1', '#00aa00']])
    const cite = pageOf([['by', plain(0)], ['[1,', k => plain(k === 1 ? 0x0000ff : 0)], ['2]', k => plain(k === 0 ? 0x0000ff : 0)], ['here', plain(0)]])
    const v = unitOf([text('by '), ph('\\cite{a,b}'), text(' here')], ['\u7531', 1, '\u6240\u793A'])
    expect(tokensOf(v, cite).drawn.filter(t => t.k === 1).map(t => [t.s, t.st.color ?? null])).toEqual([['[', null], ['1', '#0000ff'], [',', null], ['2', '#0000ff'], [']', null]])
  })

  it('a rendering whose characters tell no fill is drawn as before (the run\'s colour)', () => {
    const page = pageOf([['as', plain()], ['[16]', plain()], ['here', plain()]])
    const u = unitOf([text('as '), ph('\\cite{k}'), text(' here')], ['\u5982 ', 1, ' \u6240\u793A'])
    expect(tokensOf(u, page).drawn.filter(t => t.k === 1).map(t => t.st.color ?? null)).toEqual([null])
  })
})

describe('a label or a lead in its glyphs\' colour', () => {
  it('styleOfChars carries the first glyph\'s fill: a colour, black (set, so that it wins over a colour around it), or none told', () => {
    expect(L2.styleOfChars([{ st: bold(0x0c5388) }] as never, 'times')).toMatchObject({ bold: true, color: '#0c5388' })
    const black = L2.styleOfChars([{ st: plain(0) }] as never, 'times')
    expect('color' in black && black.color === undefined).toBe(true)
    expect('color' in L2.styleOfChars([{ st: plain() }] as never, 'times')).toBe(false)
  })
})

describe('a font is one whatever its characters\' fills', () => {
  it('pageChars2 gives the characters of one font and fill one style, and every fill of a font one font class (fontOfStyle)', () => {
    const it0 = { str: 'see [16]', transform: [10, 0, 0, 10, 10, 100], width: 40, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }
    const cs = L2.pageChars2({ items: [it0] } as never, () => BASE as never, null, [[0, 0, 5, 0x0000ff, 7, 0]])
    const [s, b, one] = [cs[0]!, cs[4]!, cs[5]!]
    expect([s.st === b.st, (s.st as St).fill, (one.st as St).fill]).toEqual([true, 0, 0x0000ff])
    // (a tally of fonts counts them as one: colour splits no font's characters)
    expect(L2.fontOfStyle(s.st)).toBe(BASE)
    expect(L2.fontOfStyle(one.st)).toBe(BASE)
    // (a style no fill was set on is its own class)
    expect(L2.fontOfStyle(BASE)).toBe(BASE)
  })
})
