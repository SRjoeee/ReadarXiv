import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Audit } from '@/pdf-reader/engine/layer-proto/check.mjs'
import { breakPoints, hyphenationOf, patternsOfTex, TEX_PATTERN_ENCODINGS } from '@/pdf-reader/engine/layer-proto/hyph.mjs'
import { layGroups, layOrder } from '@/pdf-reader/engine/layer-proto/run.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// The layer's v0: the approved prototype ported into the engine (layer-proto/, from readarxiv-web's exp/instant-layer
// at 9e56fca). Its drawing is measured by the layer gate against the prototype's own floor (--engine-kind=proto); these
// are its pure parts: the order the prototype's page laid units in, the hyphenation patterns it read from TeX's files,
// and how it reads a placeholder's source

describe("v0's lay order: main.js's promises when every page after the first is drawn after the last batch", () => {
  const u = (id: number, pages: number[]) => ({ id, pages })
  it('a page-one unit is laid in its batch; a unit on later pages when its last page is drawn, in the order it began to wait', () => {
    // a [1] lays at once; b [1, 2] waits on page 2 only after a turn of the queue, behind c and e, which waited at once;
    // e [2, 3] then waits on page 3 behind f
    const placed = [u(0, [1]), u(1, [1, 2]), u(2, [2]), u(3, [1]), u(4, [2, 3]), u(5, [3])]
    expect(layGroups(placed)).toEqual([[1, [0, 3]], [2, [2, 1]], [3, [5, 4]]])
    expect(layOrder(placed)).toEqual([0, 3, 2, 1, 5, 4])
  })
  it('batches: a later batch waits behind the units of earlier ones', () => {
    const placed = [u(0, [1, 2]), u(1, [2]), u(2, [1, 2]), u(3, [2])]
    // batch 2: 1 waits, then 0 after its turn; batch 2's 3 waits, then 2
    expect(layOrder(placed, 2)).toEqual([1, 0, 3, 2])
    // one batch: 1 and 3 wait at once, 0 and 2 after their turn
    expect(layOrder(placed, 8)).toEqual([1, 3, 0, 2])
  })
  it('a paper with no units lays nothing on its first page', () => {
    expect(layGroups([])).toEqual([[1, []]])
  })
})

describe("v0's hyphenation: TeX's pattern files read as the prototype's host read them", () => {
  it('reads the patterns and exceptions, comments out first', () => {
    const tex = '% \\patterns{not these}\n\\patterns{ % the real ones\n.ach4 a1b\n2bc }\n\\hyphenation{ ta-ble pro-ject }\n'
    expect(patternsOfTex(tex)).toEqual({ patterns: ['.ach4', 'a1b', '2bc'], exceptions: ['ta-ble', 'pro-ject'] })
  })
  it("reads dehyphn.tex's T1 umlauts and its \\3, and leaves out the OT1 repeats", () => {
    const tex = '\\patterns{\n\\n{"a1b} 1\\3e \\c{x1y}\n}\n'
    expect(patternsOfTex(tex).patterns).toEqual(['\u00E41b', '1\u00DFe'])
  })
  it('breaks a word where the patterns allow, and an exception as written', () => {
    const data = { pats: new Map([['ab', [0, 1, 0]]]), exceptions: new Map([['table', 'ta-ble']]), maxLen: 2 }
    // (the fewest letters before and after a break are the layout rules': English's 2 and 3, German's 2 and 2)
    expect(breakPoints('xxabxx', 'de', data, { left: 2, right: 2 })).toEqual([3])
    expect(breakPoints('table', 'en', data, { left: 2, right: 3 })).toEqual([2])
    // (a minimum is part of the answer: the same word under another is not the cached one)
    expect(breakPoints('xxabxx', 'de', data, { left: 4, right: 2 })).toEqual([])
    expect(breakPoints('xxabxx', 'de', data, { left: 2, right: 2 })).toEqual([3])
    // the minimums are required for a language of patterns (a type error to leave out, and a refusal named by what is missing)
    // @ts-expect-error — mins is required for 'en'
    expect(() => breakPoints('table', 'en', data)).toThrow(/mins/)
    expect(() => breakPoints('table', 'de', data, undefined as never)).toThrow(TypeError)
    expect(() => breakPoints('table', 'en', data, { left: 2 } as never)).toThrow(/mins/)
    // Russian by its rules: never a single letter left (and needs no minimums)
    for (const at of breakPoints('\u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430', 'ru', true)) expect(at >= 2 && at <= 7).toBe(true)
  })
  it("reads hyph-utf8's files as UTF-8, its letters as they are (French's \u00FF too), never TeX's 8-bit escapes", () => {
    const tex = '% hyph-fr\n\\patterns{\n.\u00E9l1ec \u00E83 1\u00FF \'a4 % a comment\n}\n'
    expect(patternsOfTex(tex, 'utf8').patterns).toEqual(['.\u00E9l1ec', '\u00E83', '1\u00FF', "'a4"])
    // (a Latin-1 file's 0xFF is dehyphn.tex's \u00DF)
    expect(patternsOfTex(tex).patterns).toContain('1\u00DF')
  })
  it('breaks each target\'s words where TeX does under babel, with its own patterns and minimums (#121-4; the ten of 2026-10-29)', () => {
    // (TeX's \showhyphens of each word under babel's language in the pinned TeX Live image, and the patterns of hyph-utf8's
    // files there that can apply to them: tests/fixtures/hyph/README.md. English's patterns broke 7 of fr, es and pt's 54 as
    // TeX does; English's and Russian's rules 26 of the ten languages' 188)
    const F = JSON.parse(readFileSync(resolve('tests/fixtures/hyph/hyph-utf8-words.json'), 'utf8')) as { tex: Record<string, string[]>; patterns: Record<string, string[]>; exceptions: Record<string, string[]> }
    const targets = ['fr', 'es', 'pt', 'it', 'nl', 'pl', 'tr', 'id', 'ms', 'cs', 'sv', 'uk', 'bg']
    expect(Object.keys(F.tex).sort()).toEqual([...targets].sort())
    for (const to of targets) {
      const { script, params } = resolveRules(BUILTIN_RULES, to)
      const lang = script === 'Cyrl' ? params.cyrillicPatterns : params.latinPatterns
      // (Malay's are Indonesian's, as babel's malay.ldf takes them: TeX has none of Malay's own)
      expect(lang, to).toBe(to === 'ms' ? 'id' : to)
      expect(TEX_PATTERN_ENCODINGS[lang as 'fr'], to).toBe('utf8')
      const data = hyphenationOf({ patterns: F.patterns[lang] ?? [], exceptions: F.exceptions[lang] ?? [] })
      for (const w of F.tex[to]!) {
        const word = w.replaceAll('-', ''), want: number[] = []
        let k = 0
        for (const ch of w) { if (ch === '-') want.push(k); else k++ }
        expect(breakPoints(word, lang, data, params.hyphenation[lang as 'fr']), `${to} ${w}`).toEqual(want)
      }
    }
  })
})

describe('a word lowered as its patterns\' language lowers it', () => {
  it('lowers a word as its patterns\' language does: Turkish\'s I is ı and its İ is i, and a word the lower case lengthens has no break', () => {
    const F = JSON.parse(readFileSync(resolve('tests/fixtures/hyph/hyph-utf8-words.json'), 'utf8')) as { patterns: Record<string, string[]>; exceptions: Record<string, string[]> }
    const tr = hyphenationOf({ patterns: F.patterns.tr!, exceptions: [] })
    const mins = resolveRules(BUILTIN_RULES, 'tr').params.hyphenation.tr
    // (TeX's: İs-ta-tis-tik-sel, Işık-lan-dırma, İn-ce-leme)
    expect(breakPoints('İstatistiksel', 'tr', tr, mins)).toEqual([2, 4, 7, 10])
    expect(breakPoints('Işıklandırma', 'tr', tr, mins)).toEqual([4, 7])
    expect(breakPoints('İnceleme', 'tr', tr, mins)).toEqual([2, 4])
    // (in a language that lowers İ to i and a combining dot, the word's offsets would be one off past it: none is given)
    expect('İstatistiksel'.toLocaleLowerCase('en')).toHaveLength(14)
    expect(breakPoints('İstatistiksel', 'en', tr, mins)).toEqual([])
  })
})

describe("v0's reading of a placeholder's source", () => {
  let L2: typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  beforeAll(async () => {
    // layer2.mjs measures with a canvas made when it loads; the test environment has none, and these functions measure nothing
    const g = globalThis as { OffscreenCanvas?: unknown }
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
    L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  })
  it('a symbol and an accent as their characters', () => {
    expect(L2.texToText2('\\%')).toBe('%')
    expect(L2.texToText2('\\~{n}')).toBe('\u00F1')
    expect(L2.texToText2('$\\dagger$')).toBe('\u2020')
  })
  it("a paper's own macro is looked for on the page: in math a crop's, in text the page's text", () => {
    expect(L2.phClass2('$\\sqrt{\\dmodel}$')).toEqual({ cls: 'other', unknown: true })
    expect(L2.phClass2('\\bert')).toEqual({ cls: 'umacro', unknown: true })
    expect(L2.phClass2('\\cite{he2016}')).toEqual({ cls: 'cite' })
  })
})

describe("v0's CJK class: a character is CJK by its code point", () => {
  let L2: typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  beforeAll(async () => {
    const g = globalThis as { OffscreenCanvas?: unknown }
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
    L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  })
  // the class as it was before astral characters were told apart: a non-`u` class, so that a surrogate half is a code unit
  // of the BMP and every character outside it fell in the range a lone high surrogate does; and its compatibility ideographs'
  // range as it was meant, U+F900 to U+FAFF, where U+8C48 to U+FAFF took U+A000 to U+F8FF, Hangul's extended jamo among them
  // (CJK still: U+A960 to U+A97F, U+D7B0 to U+D7FF)
  const WAS = (to: string) => (to === 'ko'
    ? /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/
    : /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF\u201C\u201D\u2018\u2019\u2014\u2026\u00B7]/)
  const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
  const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
  // (a target's own parameters, the layout rules' built-in ones, but no autospace, no compressed punctuation, no hyphenation)
  const paramsFor = (to: string) => ({ ...resolveRules(BUILTIN_RULES, to).params, autospace: 0, compressMax: -1, hyphen: 0 })
  /** the class (`cjk` or `latin`) each of `chars` is set in for a target, one character a token */
  const classes = (chars: string[], to: string) => {
    const unit = { kind: 'para', pieces: [{ t: 'text', s: chars.join(' ') }] }
    const tokens = L2.tokensOf2(unit as never, new Map() as never, to, BASE as never, DESIGNS, paramsFor(to) as never, null, () => 0).filter(t => !t.space)
    expect(tokens.map(t => t.s)).toEqual(chars)
    return tokens.map(t => t.cls)
  }

  it('keeps every character of the BMP in the class it had, for a Korean target and for the others', () => {
    // (white space is a gap between tokens, never classed; a lone surrogate half is a code point of its own to a `u` class)
    const bmp: string[] = []
    for (let cp = 0; cp < 0x10000; cp++) { const ch = String.fromCharCode(cp); if (!/\s/.test(ch)) bmp.push(ch) }
    for (const to of ['zh', 'ko']) {
      const got = classes(bmp, to)
      const was = bmp.map(ch => (WAS(to).test(ch) ? 'cjk' : 'latin'))
      expect(got.filter((c, i) => c !== was[i]).length, to).toBe(0)
      // (a sanity check on the comparison itself: both classes are populated)
      expect(got.filter(c => c === 'cjk').length).toBeGreaterThan(40000)
      expect(got.filter(c => c === 'latin').length).toBeGreaterThan(10000)
    }
  })

  it('classes an astral character as CJK only in the ideographic planes', () => {
    const cjk = [0x20000, 0x2a6df, 0x2f800, 0x2fa1d, 0x30000, 0x3134a, 0x323af, 0x323b0]
    const other = [
      0x1d44e, 0x1d7d8, 0x1d6fd, 0x1d714, // Mathematical Alphanumeric Symbols: an italic a, a double-struck 8, a bold beta, an italic omega
      0x1f600, 0x10400, 0x1e900, 0x10fffd, // an emoji, Deseret, Adlam, a private use character
    ]
    for (const to of ['zh', 'zh-TW', 'ja', 'ko', 'fr']) {
      expect(classes(cjk.map(cp => String.fromCodePoint(cp)), to), to).toEqual(cjk.map(() => 'cjk'))
      expect(classes(other.map(cp => String.fromCodePoint(cp)), to), to).toEqual(other.map(() => 'latin'))
    }
  })

  it("a Chinese word holding a math letter breaks between its CJK characters only: the letter stays with the Latin run it is in", () => {
    const unit = { kind: 'para', pieces: [{ t: 'text', s: '\u6c49\u5b57\u{1D44E}\u{1D44F}\u6c49' }] }
    const tokens = L2.tokensOf2(unit as never, new Map() as never, 'zh', BASE as never, DESIGNS, paramsFor('zh') as never, null, () => 0)
    expect(tokens.map(t => [t.s, t.cls])).toEqual([['\u6c49', 'cjk'], ['\u5b57', 'cjk'], ['\u{1D44E}\u{1D44F}', 'latin'], ['\u6c49', 'cjk']])
  })
})

describe("v0's drawing as data: recorded in its own device pixels, drawn at any resolution from the page drawn there", () => {
  let L2: typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  beforeAll(async () => {
    const g = globalThis as { OffscreenCanvas?: unknown }
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
    L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  })
  // a page 792 units tall at 2.5 device pixels a unit; a unit's hidden lines, a kept placeholder, a kept character, a crop of page 1
  const k = 2.5
  const px = (x: number, y: number): [number, number] => [x * k, (792 - y) * k]
  const L = { scale: 0.9, lines: [{ page: 1, baseline: 688, items: [{ x: 120, w: 18, t: { crop: { crop: [40, 500, 60, 510], page: 1, baseline: 502, k: 3 } } }, { x: 150, w: 10, t: { crop: { crop: [70, 600, 80, 610], page: 1, baseline: 602 } } }] }] } as unknown as Parameters<typeof L2.hideOps>[0]
  const dev = (b: number[]) => { const [ax, ay] = px(b[0]!, b[3]!), [bx, by] = px(b[2]!, b[1]!); return [ax, ay, bx - ax, by - ay].map(v => expect.closeTo(v, 9)) }
  /** a 2D context that records its calls */
  const recorder = () => {
    const calls: unknown[][] = []
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_, name: string) => (...args: unknown[]) => { calls.push([name, ...args]) },
      set: (_, name: string, v) => { calls.push([`=${name}`, v]); return true },
    })
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
  }
  it('records where the unit\'s ink is hidden, what is pasted back from B and C, and its crops: a placeholder\'s from B through its segments, a label\'s from C', () => {
    const audit: Audit[] = []
    const hidden = [[100, 698, 302, 712], [98, 684, 252, 698]], fromB = [[60, 680, 70, 690]], fromC = [[200, 684, 206, 694]]
    const clips = new Map([[3, { rects: [[40, 500, 50, 510]], own: [[40.6, 500.6, 49.4, 509.4]] }]])
    const ops = L2.hideOps(L, 1, { px, k, hasSource: () => true, pxOf: () => px, hidden, fromB, fromC, clips, audit, id: 7 })
    expect(ops.map(o => o.op)).toEqual(['hidden', 'paste', 'paste', 'crop', 'crop'])
    expect(ops[0]).toEqual({ op: 'hidden', rects: hidden.map(dev) })
    expect(ops[1]).toEqual({ op: 'paste', page: 1, plane: 'B', unit: 7, rects: fromB.map(dev) })
    expect(ops[2]).toEqual({ op: 'paste', page: 1, plane: 'C', unit: 7, rects: fromC.map(dev) })
    // the crop: its source's box, laid at the item's place with its baseline on the line's, at the fit's scale, through its segment
    expect(ops[3]).toEqual({ op: 'crop', page: 1, plane: 'B', src: [40 * k, (792 - 510) * k, 20 * k, 10 * k].map(v => expect.closeTo(v, 9)), dst: [120 * k, (792 - (688 + 8 * 0.9)) * k, 18 * k, 10 * 0.9 * k].map(v => expect.closeTo(v, 9)), clip: [dev([40, 500, 50, 510])] })
    // a crop of no piece (a label's ink, whose group B hides) from C, with no clip
    expect(ops[4]).toMatchObject({ op: 'crop', plane: 'C' })
    expect(ops[4]).not.toHaveProperty('clip')
    expect(audit.map(a => (a as { what: string }).what)).toEqual(['erase', 'erase', 'crop', 'crop'])
  })
  it('leaves out a crop whose page is not drawn, and records it nowhere; a unit with nothing hidden has no hidden operation', () => {
    const audit: Audit[] = []
    const ops = L2.hideOps(L, 1, { px, k, hasSource: () => false, pxOf: () => px, audit, id: 7 })
    expect(ops).toEqual([])
    expect(audit).toEqual([])
  })
  const ops = [
    { op: 'hidden', rects: [[10, 20, 30, 40]] },
    { op: 'paste', page: 1, plane: 'C', rects: [[12.5, 22, 4, 4]] },
    { op: 'crop', page: 2, plane: 'B', src: [1, 2, 3, 4], dst: [5, 6, 7, 8] },
  ] as Parameters<typeof L2.drawOps>[1]
  it("draws over render A at v0's own resolution: nothing for what is hidden, the paste out to whole device pixels, the crop darkened in", () => {
    const { ctx, calls } = recorder()
    const c1 = { id: 'C1' } as unknown as CanvasImageSource, b2 = { id: 'B2' } as unknown as CanvasImageSource
    L2.drawOps(ctx, ops, 1, (p, plane) => (p === 1 && plane === 'C' ? c1 : p === 2 && plane === 'B' ? b2 : null))
    expect(calls).toEqual([
      ['save'],
      ['save'], ['beginPath'], ['rect', 12, 22, 5, 4], ['clip'], ['drawImage', c1, 0, 0], ['restore'],
      ['=globalCompositeOperation', 'darken'], ['drawImage', b2, 1, 2, 3, 4, 5, 6, 7, 8], ['=globalCompositeOperation', 'source-over'],
      ['restore'],
    ])
  })
  it('draws at any other resolution scaled, cut from the planes drawn there; an operation with no plane drawn is left out', () => {
    const { ctx, calls } = recorder()
    const c1 = { id: 'C1' } as unknown as CanvasImageSource
    L2.drawOps(ctx, ops, 2, (p, plane) => (p === 1 && plane === 'C' ? c1 : null))
    expect(calls).toEqual([
      ['save'],
      ['save'], ['beginPath'], ['rect', 25, 44, 8, 8], ['clip'], ['drawImage', c1, 0, 0], ['restore'],
      ['restore'],
    ])
  })
})

describe("a unit's first lines: never laid over ink a unit does not erase (step 2)", () => {
  let L2: typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  let T: typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
  beforeAll(async () => {
    const g = globalThis as { OffscreenCanvas?: unknown }
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
    L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
    T = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
  })
  /** the unit read with a layout file of one line (page, x0, x1, baseline, top, bottom, size, font) and no placeholder */
  const readFile = (unit: never, line: number[], page: object[], kOf: number[]) => {
    const lu = { lines: Float64Array.from(line), frames: Float64Array.from([line[0]!, 0, 0, 1, -1, 0]), erase: [new Float64Array(0)], ph: new Map(), labels: new Float64Array(0) } as never
    const t = T.texRects(lu)
    return L2.prepareUnit(unit, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, kOf, { lines: t }) as never)
  }
  const serif = { fam: 'serif', bold: false, italic: false, caps: false, known: false } as never
  /** a text item's characters, each half its size wide, from x on baseline yb */
  const item = (text: string, x: number, yb: number, size: number, n: number, st = serif) => [...text].map((ch, k) => ({ ch, x0: x + 0.5 * size * k, x1: x + 0.5 * size * (k + 1), yb, size, item: n, ix: x, k, st }))
  it('a far-in first line keeps its start, where another unit\'s line stands before it', () => {
    const [b] = L2.blocksOf2([[1, 200, 98, 400, 107], [1, 50, 86, 400, 95]] as never, [[0, 0, 612, 792]])
    expect(b?.rects[0]?.[1]).toBe(200)
    expect(b?.indent).toBe(150)
  })
  it("a first line that opens with what its source does not write, before its first word, keeps it as a label", () => {
    const page = [...item('Input Representations', 10, 100, 10, 0, { ...serif as object, bold: true } as never), ...item('To make it work', 130, 100, 10, 1)]
    const line = [1, 10, 210, 100, 108, 97, 10, 0]
    const unit = { kind: 'para', src: 'To make it work', pieces: [{ t: 'text', s: '\n' }, { t: 'text', s: '\u4E3A\u4E86' }] } as never
    const p = readFile(unit, line, page, [-1, -1])
    expect(p.label?.text).toBe('Input Representations')
    // not where it is the source's own text, which the alignment missed
    const own = { kind: 'para', src: 'Input Representations To make it work', pieces: [{ t: 'text', s: '\u4E3A\u4E86' }] } as never
    const pageMissed = [...item('Inputt Representationss', 10, 100, 10, 0), ...item('To make it work', 130, 100, 10, 1)]
    expect(readFile(own, line, pageMissed, [-1]).label).toBeUndefined()
  })
})

