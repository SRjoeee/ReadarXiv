import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A Chinese or Japanese line around an inline formula (2026-10-23, the (j) rows of the release route's sweep: letter-spaced
// lines). A Chinese translation sets no space between a character and its formula, and the crop was glued to the token
// before it, so the character, the formula and the mark after it were one group a line could not take: the line ended
// early and its gaps were spread up to cjkJust (2610.10069 page 7, unit 49: 4.84 em over 25 gaps, 0.194 em a gap).
// xeCJK sets \CJKecglue there, a place TeX may break; and TeX takes the cheaper of two breaks by their badness. So the
// line may break before the formula, and a line takes a group it misses by a little by squeezing (its marks' blank halves,
// its spaces to spaceMin, then at most 0.02 em a gap) where that costs less a gap than stretching without it
// (layer2.mjs tokensOf2's crop glue, breakLines' squeezeTakes, placeItems). Korean and the alphabets are as they were.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * [...s].length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
/** a target's built-in parameters at one state of the fit (no knob: the most natural, marks compressed at a line's start and
 *  between two), no hyphenation, no autospace, no TeX rule between lines */
const params = (to: string) => ({ ...resolveRules(BUILTIN_RULES, to).params, borrow: 0, hyphen: 0, lineskip: null, order: [], growTo: 1, autospace: 0 })
/** one block of n lines 12 pt apart from 500, `w` pt wide, at size 10 */
const block = (n: number, w: number) => { const B = Array.from({ length: n }, (_, k) => 500 - 12 * k); return { page: 1, rects: B.map(b => [1, 0, b - 2, w, b + 8]), x0: 0, x1: w, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after: 0, centred: false } }
/** a CJK character or mark a full em wide (10 pt at size 10), as a CJK face sets it; anything else half an em */
const CJK_WIDE = /[　-鿿가-힯＀-￯]/u
const measure = (s: string) => [...s].reduce((a, ch) => a + (CJK_WIDE.test(ch) ? 100 : 50), 0)
const HAN = '汉', COMMA = '，', OPEN = '（'
const han = (n: number) => HAN.repeat(n)
/** a formula piece, drawn as a crop `w` pt wide */
const crop = (w: number) => ({ mode: 'crop', page: 1, crop: [0, 498, w, 506], baseline: 500 })
type Piece = { t: string; s?: string; src?: string }
const text = (s: string): Piece => ({ t: 'text', s }), ph = (): Piece => ({ t: 'ph', src: '$x$' })
/** a unit's pieces laid at size 10 in one block `w` pt wide; each formula piece's crop width in `crops`, by piece index */
function lay(pieces: Piece[], to: string, w: number, crops: Record<number, number> = {}, lines = 4) {
  const P = params(to)
  const resolved = new Map(Object.entries(crops).map(([k, cw]) => [Number(k), crop(cw)]))
  const tokens = L2.tokensOf2({ kind: 'para', pieces } as never, resolved as never, to, BASE as never, DESIGNS as never, P as never, null, measure as never)
  const layout = L2.layoutUnit2(tokens as never, [block(lines, w)] as never, 10, P as never)
  type Item = { t: { s?: string; crop?: unknown; space?: boolean; punct?: string }; x: number; w: number }
  const ls = layout.lines as unknown as { items: Item[]; mode: string; used: number; cap: number; squeezed?: boolean }[]
  const shown = ls.map(l => l.items.map(it => (it.t.crop ? '[F]' : it.t.space ? ' ' : it.t.s)).join(''))
  /** each gap's adjustment of a line, in em: an item's start less the end of the one before it at its natural width */
  const gaps = (n: number) => { const its = ls[n]!.items; return its.slice(1).map((it, q) => Math.round(((it.x - (its[q]!.x + its[q]!.w)) / 10) * 10000) / 10000) }
  return { tokens, layout, lines: ls, shown, gaps }
}
const cropTokens = (tokens: unknown[]) => (tokens as { crop?: unknown; glue?: boolean }[]).filter(t => t.crop)

describe('a line may break before an inline formula that follows a CJK character (xeCJK’s \\CJKecglue)', () => {
  // eight characters, then a formula of 25 pt and a comma, then more text
  const unit = [text(han(8)), ph(), text(`${COMMA}${han(6)}`)]
  it('the crop is glued to no CJK character or plain CJK mark before it, in Chinese and Japanese', () => {
    for (const to of ['zh', 'ja', 'zh-TW']) {
      expect(cropTokens(lay(unit, to, 200, { 1: 25 }).tokens).map(t => t.glue), to).toEqual([false])
      expect(cropTokens(lay([text(`${han(3)}${COMMA}`), ph(), text(han(2))], to, 200, { 1: 25 }).tokens).map(t => t.glue), to).toEqual([false])
    }
  })
  it('stays glued after a mark no line ends with, and in Korean and the alphabets', () => {
    expect(cropTokens(lay([text(`${han(3)}${OPEN}`), ph(), text(han(2))], 'zh', 200, { 1: 25 }).tokens).map(t => t.glue)).toEqual([true])
    expect(cropTokens(lay([text('가나'), ph(), text(' 다')], 'ko', 200, { 1: 25 }).tokens).map(t => t.glue)).toEqual([true])
    for (const to of ['de', 'ru']) expect(cropTokens(lay([text('word'), ph(), text(' more')], to, 200, { 1: 25 }).tokens).map(t => t.glue), to).toEqual([true])
  })
  it("ends the line after the characters before the formula, where the glue had sent the last one down with it, its gaps spread", () => {
    // 84 pt: the eighth character and the group after it, formula and comma, are 35 pt; with them glued, the line held seven
    // characters, 14 pt over six gaps, 0.233 em a gap; it now holds the eight, 4 pt over seven gaps, 0.057 em
    const { shown, lines, gaps } = lay(unit, 'zh', 84, { 1: 25 })
    expect(shown[0]).toBe(han(8))
    expect(shown[1]!.startsWith(`[F]${COMMA}`)).toBe(true)
    expect(lines[0]!.mode).toBe('just')
    for (const g of gaps(0)) expect(g).toBeCloseTo(0.0571, 3)
  })
})

describe('a CJK line squeezes to take the group it misses by a little, where that costs less than stretching without it', () => {
  it('takes the formula and its comma at 1 pt over: each gap closed by 0.011 em, the comma hung, within 0.02 em a gap', () => {
    // 109 pt: eight characters (80), the formula (25) and the comma, hung by its blank half: 110 pt. Without them the line
    // would stretch 29 pt over seven gaps
    const { shown, lines, gaps } = lay([text(han(8)), ph(), text(`${COMMA}${han(6)}`)], 'zh', 109, { 1: 25 })
    expect(shown[0]).toBe(`${han(8)}[F]${COMMA}`)
    expect(lines[0]!.squeezed).toBe(true)
    expect(lines[0]!.mode).toBe('just')
    for (const g of gaps(0)) expect(g).toBeCloseTo(-0.0111, 3)
    expect(Math.min(...gaps(0))).toBeGreaterThanOrEqual(-0.02)
    // (the line's end is the comma's ink: its blank half past the edge, as any line's closing mark)
    expect(lines[0]!.used - lines[0]!.cap).toBeCloseTo(5, 6)
  })
  it("gives a mark's blank half first, as CJK punctuation compression does, and spreads what it gave too much", () => {
    // 102 pt: three characters, a comma, four characters (80) and the formula (25): 3 pt over. The comma gives its 5 pt, and
    // the 2 pt left over are spread over the eight gaps; no gap closes
    const { shown, lines, gaps } = lay([text(`${han(3)}${COMMA}${han(4)}`), ph(), text(han(6))], 'zh', 102, { 1: 25 })
    expect(shown[0]).toBe(`${han(3)}${COMMA}${han(4)}[F]`)
    expect(lines[0]!.squeezed).toBe(true)
    expect(lines[0]!.items[3]!.w).toBeCloseTo(5, 6)
    for (const g of gaps(0)) expect(g).toBeCloseTo(0.025, 3)
    expect(lines[0]!.used).toBeCloseTo(102, 6)
  })
  it('breaks before the group where the stretch without it is the cheaper', () => {
    // 101 pt: ten characters (100), 1 pt of slack over nine gaps, 0.011 em; a formula of 2 pt is squeezed in (1 pt over
    // ten gaps, 0.010 em), one of 2.5 pt is not (0.015 em), though 0.02 em a gap would take it
    const at = (cw: number) => lay([text(han(10)), ph(), text(han(4))], 'zh', 101, { 1: cw })
    expect(at(2).shown[0]).toBe(`${han(10)}[F]`)
    expect(at(2).lines[0]!.squeezed).toBe(true)
    const wider = at(2.5)
    expect(wider.shown[0]).toBe(han(10))
    expect(wider.lines[0]!.squeezed).toBeUndefined()
    for (const g of wider.gaps(0)) expect(g).toBeCloseTo(0.0111, 3)
  })
  it('gives nothing from a line with no slack: a full line breaks before even a narrow formula', () => {
    const full = lay([text(han(10)), ph(), text(han(4))], 'zh', 100, { 1: 1 })
    expect(full.shown[0]).toBe(han(10))
    expect(full.lines[0]!.squeezed).toBeUndefined()
    for (const g of full.gaps(0)) expect(g).toBe(0)
  })
  it('takes no more than its marks and 0.02 em a gap give: a group past that leaves the line stretched as before', () => {
    // 101.9 pt: ten characters (100) and a formula. One of 3.8 pt is 1.9 pt over, within the ten gaps' 2 pt and cheaper a
    // gap than the line's 1.9 pt of stretch over nine; one of 4.1 pt is 2.2 pt over, past them: the line keeps its stretch
    const at = (cw: number) => lay([text(han(10)), ph(), text(han(4))], 'zh', 101.9, { 1: cw })
    expect(at(3.8).lines[0]!.squeezed).toBe(true)
    expect(Math.min(...at(3.8).gaps(0))).toBeGreaterThanOrEqual(-0.02)
    const past = at(4.1)
    expect(past.shown[0]).toBe(han(10))
    expect(past.lines[0]!.squeezed).toBeUndefined()
    for (const g of past.gaps(0)) expect(g).toBeCloseTo(0.0211, 3)
  })
  it('leaves the marks alone where the state has compressed them all (compressMax reached)', () => {
    // at compress 2 every mark has already lost its blank half: the comma gives nothing more, and 3 pt over is past the
    // gaps' 1.8 pt
    const P = params('zh')
    const tokens = L2.tokensOf2({ kind: 'para', pieces: [text(`${han(3)}${COMMA}${han(4)}`), ph(), text(han(6))] } as never, new Map([[1, crop(30)]]) as never, 'zh', BASE as never, DESIGNS as never, P as never, null, measure as never)
    const st = { lead: 1, track: 0, trackLatin: 0, compress: 2, borrow: 0, scale: 1, knob: 'track' }
    const l = L2.layoutAt(tokens as never, [block(4, 102)] as never, 10, P as never, st as never)
    const first = l.lines[0] as unknown as { items: { t: { s?: string; crop?: unknown } }[]; squeezed?: boolean }
    expect(first.squeezed).toBeUndefined()
    expect(first.items.some(it => it.t.crop)).toBe(false)
  })
})

describe("a line whose next group is a long formula ends before it, stretched or ragged as before", () => {
  it('stretches within cjkJust, and is ragged past it', () => {
    // ten characters of 10 pt and a formula of 30 pt: 20 pt over, far past what the line can give
    const just = lay([text(han(9)), ph(), text(han(4))], 'zh', 100, { 1: 30 })
    expect(just.shown[0]).toBe(han(9))
    expect(just.lines[0]!.mode).toBe('just')
    for (const g of just.gaps(0)) expect(g).toBeCloseTo(0.125, 3)
    const ragged = lay([text(han(5)), ph(), text(han(4))], 'zh', 100, { 1: 60 })
    expect(ragged.shown[0]).toBe(han(5))
    expect(ragged.lines[0]!.mode).toBe('ragged')
    for (const g of ragged.gaps(0)) expect(g).toBe(0)
  })
})

describe('Korean and the alphabets are laid as they were', () => {
  it('never squeezes a line set at spaces', () => {
    // words of 20 pt and spaces of 5: five words are 120 pt, 116 with their spaces at spaceMin, 1 pt more than the line
    const words = Array.from({ length: 8 }, (_, k) => (k ? ' wort' : 'wort')).join('')
    for (const to of ['de', 'ko']) {
      const { lines } = lay([text(words)], to, 115, {}, 4)
      expect(lines.some(l => l.squeezed), to).toBe(false)
      expect(lines[0]!.items.filter(it => !it.t.space).length, to).toBe(4)
    }
  })
})
