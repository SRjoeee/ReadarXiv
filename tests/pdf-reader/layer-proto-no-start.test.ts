import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { NO_START, noStart } from '@/pdf-reader/engine/layer-proto/no-start.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// No line opens with a mark UAX 14 keeps from a line's start (layer-proto/no-start.mjs: CL, CP, EX, IS, NS) or one the
// target's rules do (P.noStart: CJK's small kana and prolonged sound mark, its closing quotes, the per cent sign): the
// breaker (layer2.mjs breakLines) never breaks before one, across the spaces a translation sets before it too, unless
// nothing else fits (a word as wide as the line before it: the break it always made). The layer gate's lineStartPunct
// counts a drawn line that opens with such a mark by the same table (lab/pdf/spikes/layer-gate/measure.mjs).

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  // a canvas whose every character is 50 px at 100 px (5 pt at the size 10 these units are laid at), its ink 0.7 of the
  // size over the baseline and 0.2 under
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * [...s].length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
/** a target's built-in parameters, one state of the fit (no knob), no hyphenation, no autospace, no TeX rule between lines */
const params = (to: string) => ({ ...resolveRules(BUILTIN_RULES, to).params, borrow: 0, hyphen: 0, lineskip: null, order: [], growTo: 1, autospace: 0 })
/** one block of n lines 12 pt apart from 500, `w` pt wide */
const block = (n: number, w: number) => { const B = Array.from({ length: n }, (_, k) => 500 - 12 * k); return { page: 1, rects: B.map(b => [1, 0, b - 2, w, b + 8]), x0: 0, x1: w, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after: 0, centred: false } }
type Piece = { t: string; s?: string; src?: string }
const piecesOf = (text: string | Piece[]): Piece[] => (typeof text === 'string' ? [{ t: 'text', s: text }] : text)
/** a CJK character (and a CJK mark) a full em wide, as a CJK face sets it; anything else half an em */
const CJK_WIDE = /[\u2026\u201c\u201d\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/u
const cjkMeasure = (s: string) => [...s].reduce((a, ch) => a + (CJK_WIDE.test(ch) ? 100 : 50), 0)
/** a unit's text laid at size 10 in one block `w` pt wide: the layout, and its lines as text (a crop as [C]) */
function lay(text: string | Piece[], to: string, w: number, { lines = 8, resolved = new Map<number, unknown>(), measure }: { lines?: number; resolved?: Map<number, unknown>; measure?: (s: string) => number } = {}) {
  const P = params(to)
  const tokens = L2.tokensOf2({ kind: 'para', pieces: piecesOf(text) } as never, resolved as never, to, BASE as never, DESIGNS as never, P as never, null, measure as never)
  const layout = L2.layoutUnit2(tokens as never, [block(lines, w)] as never, 10, P as never)
  const shown = layout.lines.map(l => l.items.map(it => (it.t.crop ? '[C]' : it.t.space ? ' ' : it.t.s)).join(''))
  return { layout, shown }
}
/** whether a line's text opens with a character the target keeps from a line's start: UAX 14's, or its rules' */
const barredStart = (line: string, to: string) => { const ch = [...line.trimStart()][0] ?? ''; return noStart(ch) || (ch !== '' && params(to).noStart.includes(ch)) }
/** the lines after the first that open with such a character */
const opened = (shown: string[], to: string) => shown.slice(1).filter(l => barredStart(l, to))
/** all of a text's characters but its white space, in order */
const ink = (s: string) => s.replace(/\s+/g, '')
const HAN8 = '\u6c49\u5b57\u6c49\u5b57\u6c49\u5b57\u6c49\u5b57'

describe('the UAX 14 table', () => {
  it('is sorted ranges that do not overlap, and noStart reads it as a list of ranges would', () => {
    for (let k = 0; k < NO_START.length; k++) {
      expect(NO_START[k]![0]).toBeLessThanOrEqual(NO_START[k]![1])
      if (k > 0) expect(NO_START[k]![0]).toBeGreaterThan(NO_START[k - 1]![1])
    }
    const linear = (c: number) => NO_START.some(([a, b]) => c >= a && c <= b)
    for (let c = 0; c < 0x20000; c++) if (c < 0xd800 || c > 0xdfff) expect(noStart(String.fromCodePoint(c)), c.toString(16)).toBe(linear(c))
    expect(noStart(null)).toBe(false)
    expect(noStart('')).toBe(false)
  })
})

describe('a mark no line starts with stays with the text before it', () => {
  // (Latin, 46 pt: "aaaa bbbb" fills the line; the mark after the space would open the next one)
  const LATIN: [string, string][] = [['CL', '}'], ['CP', ')'], ['CP', ']'], ['EX', '!'], ['EX', '?'], ['IS', ','], ['IS', '.'], ['IS', ';'], ['IS', ':'], ['NS', '\u203c'], ['quote (the rules)', '\u201d'], ['quote (the rules)', '\u2019'], ['per cent (the rules)', '%']]
  for (const [cls, mark] of LATIN) {
    it(`Latin ${cls} ${mark} after a space: the word before it goes down with it`, () => {
      for (const to of ['de', 'fr', 'ru']) {
        const { shown, layout } = lay(`aaaa bbbb ${mark} cccc`, to, 46)
        expect(layout.clipped).toBe(false)
        expect(opened(shown, to), `${to}: ${JSON.stringify(shown)}`).toEqual([])
        expect(shown.slice(0, 2), to).toEqual(['aaaa', `bbbb ${mark}`])
        expect(ink(shown.join(' ')), to).toBe(ink(`aaaa bbbb ${mark} cccc`))
      }
    })
  }
  it('Latin: a closing brace right after a crop (no space, and no rule of the target names it) is no break', () => {
    const pieces = [{ t: 'text', s: 'aaaa bbbb ' }, { t: 'ph', src: '$x$' }, { t: 'text', s: '} cccc' }]
    const resolved = new Map([[1, { mode: 'crop', crop: [0, 100, 20, 110], baseline: 102 }]])
    expect(lay(pieces, 'de', 72, { resolved }).shown).toEqual(['aaaa bbbb', '[C]} cccc'])
  })
  // (CJK, 82 pt, a CJK character an em wide: eight fill the line; the mark after the translation's space would open the
  // next one, the line holding no room for it even with its blank half hung)
  const CJK: [string, string, string][] = [
    ['CL', '\uff0c', 'zh'], ['CL', '\u3002', 'zh'], ['CL', '\u3001', 'ja'], ['CL', '\uff09', 'zh'], ['CL', '\u300d', 'ja'], ['CL', '\u300f', 'ja'], ['CL', '\u3011', 'zh'], ['CL', '\u3009', 'zh'], ['CL', '\u300b', 'zh'], ['CL', '\u3015', 'zh'],
    ['EX', '\uff01', 'zh'], ['EX', '\uff1f', 'ja'], ['NS', '\uff1a', 'zh'], ['NS', '\uff1b', 'zh'], ['NS', '\u3005', 'ja'], ['NS', '\u309d', 'ja'], ['NS', '\u30fb', 'ja'],
    ['small kana (the rules)', '\u3041', 'ja'], ['small kana (the rules)', '\u3063', 'ja'], ['small kana (the rules)', '\u3083', 'ja'], ['small kana (the rules)', '\u30a1', 'ja'], ['prolonged sound mark (the rules)', '\u30fc', 'ja'],
    ['ellipsis (the rules)', '\u2026', 'zh'], ['quote (the rules)', '\u201d', 'zh'],
  ]
  for (const [cls, mark, to] of CJK) {
    it(`${to} ${cls} ${mark} after a space: the character before it goes down with it`, () => {
      const text = `${HAN8} ${mark}\u6c49\u5b57`
      const { shown, layout } = lay(text, to, 82, { measure: cjkMeasure })
      expect(layout.clipped).toBe(false)
      expect(opened(shown, to), JSON.stringify(shown)).toEqual([])
      expect(shown[0]).toBe(HAN8.slice(0, 7))
      expect(shown[1]!.startsWith(`\u5b57 ${mark}`)).toBe(true)
      expect(ink(shown.join(''))).toBe(ink(text))
    })
  }
  it("Japanese: a Latin closing parenthesis after a placeholder's letter and a space (1810.04805 ja p7)", () => {
    // (six characters, a space and "A": 70 pt; the parenthesis after the next space would open the second line)
    const { shown } = lay('\u305d\u308c\u305e\u308c\u306b\u6587 A )\u3068\u53ef\u80fd', 'ja', 76, { measure: cjkMeasure })
    expect(opened(shown, 'ja')).toEqual([])
    expect(shown[0]).toBe('\u305d\u308c\u305e\u308c\u306b\u6587')
    expect(shown[1]!.startsWith('A )')).toBe(true)
  })
  it('Korean, broken at spaces only: a comma after a space stays with the word before it', () => {
    const { shown } = lay('\ub2e8\uc5b4 \ub2e8\uc5b4\ub2e8\uc5b4 , \ub2e8\uc5b4', 'ko', 42)
    expect(opened(shown, 'ko')).toEqual([])
    expect(shown.slice(0, 2)).toEqual(['\ub2e8\uc5b4', '\ub2e8\uc5b4\ub2e8\uc5b4 ,'])
  })
  it("a formula drawn as the page's characters, its spaces kept: no break before its closing brace (2608.04322 de p4)", () => {
    const pieces = [{ t: 'text', s: 'aaaa ' }, { t: 'ph', src: '$\\{d_i\\}$' }, { t: 'text', s: ' cccc' }]
    const resolved = new Map([[1, { mode: 'orig-text', text: '{d i }' }]])
    const { shown } = lay(pieces, 'de', 46, { resolved })
    expect(opened(shown, 'de')).toEqual([])
    expect(shown.slice(0, 2)).toEqual(['aaaa {d', 'i } cccc'])
  })
  it('two marks after a space go down together with the word before them', () => {
    expect(lay('aaaa bbbb ). cccc', 'de', 48).shown.slice(0, 2)).toEqual(['aaaa', 'bbbb ).'])
  })
})

describe('where nothing else fits', () => {
  it('a word as wide as the line before the mark: the break it always made (the mark opens the next line, nothing lost)', () => {
    const { shown, layout } = lay('aaaaaaaaa , bb', 'de', 46)
    expect(layout.clipped).toBe(false)
    expect(shown).toEqual(['aaaaaaaaa', ', bb'])
  })
  it('a token wider than the line cut by its characters: the part left never opens with a mark', () => {
    const { shown } = lay('aaaaaaaaa)bbb', 'de', 46)
    expect(opened(shown, 'de')).toEqual([])
    expect(shown).toEqual(['aaaaaaaa', 'a)bbb'])
  })
})

describe('a closing mark that hangs', () => {
  it('a CJK closing mark that fits by its blank half stays on the line, its blank half (half an em) past the edge', () => {
    // (eight characters, 80 pt, and the full stop's ink half: 85 pt)
    const { shown, layout } = lay(`${HAN8}\u3002\u6c49\u5b57`, 'zh', 85, { measure: cjkMeasure })
    expect(shown[0]).toBe(`${HAN8}\u3002`)
    const first = layout.lines[0] as unknown as { used: number; cap: number }
    expect(first.used - first.cap).toBeCloseTo(5, 6)
  })
})

describe('a layout no barred start touches is the one it was', () => {
  // a seeded generator of texts in which no line can open with a barred mark: words of letters (Latin, Cyrillic, Hangul),
  // CJK ideographs and kana, digits, opening brackets and dashes, with the rules' marks only right after a character (where
  // the rules already kept them from a line's start) and never after a space; laid at widths no token is wider than,
  // every character of its own width. The digest is the layouts the breaker set before it learnt the barred starts
  const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const pick = (r: () => number, s: string) => { const a = [...s]; return a[Math.floor(r() * a.length)]! }
  const LETTERS: Record<string, string> = { de: 'abcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00fc\u00df', ru: '\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u043a\u043b\u043c\u043d\u043e\u043f\u0440\u0441\u0442', ko: '\uac00\ub098\ub2e4\ub77c\ub9c8\ubc14\uc0ac\uc544\uc790\ucc28' }
  const HAN = '\u6c49\u5b57\u6587\u672c\u7ffb\u8bd1\u6a21\u578b\u6570\u636e\u306e\u306f\u304c\u3092\u30c7\u30bf'
  const ATTACHED = ',.;:!?)\u3002\uff0c\u3001\uff09'
  const textOf = (r: () => number, to: string) => {
    const parts: string[] = []
    const n = 8 + Math.floor(r() * 30)
    for (let k = 0; k < n; k++) {
      let w = ''
      if ((to === 'zh' || to === 'ja') && r() < 0.6) for (let q = 1 + Math.floor(r() * 8); q > 0; q--) w += pick(r, HAN)
      else for (let q = 1 + Math.floor(r() * 7); q > 0; q--) w += pick(r, LETTERS[to] ?? LETTERS.de!)
      const y = r()
      if (y < 0.1) w = `(${w}`
      else if (y < 0.15) w = `${w}-${pick(r, LETTERS.de!)}${pick(r, LETTERS.de!)}`
      else if (y < 0.2) w = `${w}\u2014`
      if (r() < 0.25) w += pick(r, ATTACHED)
      if (r() < 0.1) w = `${Math.floor(r() * 1000)}${w}`
      parts.push(w)
    }
    return (to === 'zh' || to === 'ja') && r() < 0.5 ? parts.join('') : parts.join(' ')
  }
  const measure = (s: string) => [...s].reduce((a, ch) => a + 30 + ((ch.codePointAt(0)! * 7919) % 41), 0)
  it('is the same layout, line by line, for every target', () => {
    const r = rng(20261017)
    const out: string[] = []
    for (let n = 0; n < 240; n++) {
      const to = ['de', 'ru', 'zh', 'ja', 'ko'][n % 5]!
      const text = textOf(r, to)
      const w = 110 + Math.floor(r() * 90)
      const { shown, layout } = lay(text, to, w, { lines: 60, measure })
      expect(opened(shown, to), `${n}: ${JSON.stringify(shown)}`).toEqual([])
      out.push(JSON.stringify([to, w, layout.clipped, shown, layout.lines.map(l => Math.round((l as unknown as { used: number }).used * 1000))]))
    }
    expect(createHash('sha256').update(out.join('\n')).digest('hex').slice(0, 16)).toBe('a02276992d75c64a')
  })
})
