import { beforeAll, describe, expect, it } from 'vitest'

// Step 3 of the layer's new direction (2026-10-07): v0's (and the hybrid's) weak spots, each fixed at its root and
// measured by the layer gate (--engine-kind=proto --proto-tex=lines); these are the fixes' pure rules.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  // layer2.mjs measures with a canvas made when it loads; the test environment has none, and these rules measure nothing
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

describe("the leading, relative to the original's own pitch", () => {
  const zh = { leadBase: 1.3 }
  const blocks = (...pitches: (number | null)[]) => pitches.map(pitch0 => ({ pitch0 }))
  it("is the script's own where the original is set solid: 10 pt on 12, 11 pt on 13.6 (TeX's), and closer", () => {
    expect(L2.leadOf(blocks(12), 10, zh)).toBe(1.3)
    expect(L2.leadOf(blocks(13.6), 10.91, zh)).toBe(1.3)
    expect(L2.leadOf(blocks(11), 10, zh)).toBe(1.3)
  })
  it("is not stacked on a looser pitch: one and a half spacing takes 1.3 of a solid line, double spacing its own", () => {
    // 1.3 × 1.25 × 11.96 = 19.44 pt against the thesis's 17.93: 1.084, not 1.3 (23.3 pt, 1.95 em)
    expect(L2.leadOf(blocks(17.93), 11.96, zh)).toBeCloseTo(1.084, 3)
    expect(L2.leadOf(blocks(24), 12, zh)).toBe(1)
  })
  it("reads the original's pitch as its blocks' median, and leaves a unit with none, or a leading of 1, as it is", () => {
    expect(L2.leadOf(blocks(null, 18, 18, 12), 12, zh)).toBeCloseTo((1.3 * 1.25 * 12) / 18, 3)
    expect(L2.leadOf(blocks(null), 12, zh)).toBe(1.3)
    expect(L2.leadOf(blocks(18), 12, { leadBase: 1 })).toBe(1)
  })
})

describe("v0's displayed formulas: the engine's environments", () => {
  it('reads subequations, alignat, flalign, dmath and IEEEeqnarray as displays, not as inline formulas', async () => {
    const { phClass } = await import('@/pdf-reader/engine/layer-proto/layer1.mjs')
    for (const env of ['subequations', 'alignat', 'flalign', 'dmath', 'IEEEeqnarray', 'equation*', 'align'])
      expect(phClass(`\\begin{${env}}x = 1\\end{${env}}`)).toBe('display')
    expect(phClass('\\begin {subequations}x\\end{subequations}')).toBe('display')
    expect(phClass('$x = 1$')).toBe('other')
  })
  it("draws a table's rules and a strut a translation carries as nothing, a rule with a width still looked for", async () => {
    const { phClass, texToText } = await import('@/pdf-reader/engine/layer-proto/layer1.mjs')
    for (const src of ['\\specialrule{1pt}{-1pt}{0pt}', '\\rule{0pt}{2.2ex}', '\\rule[-1ex]{0pt}{3ex}', '\\cmidrule(lr){2-3}', '\\arrayrulecolor{gray}', '\\includegraphics[width=5cm]{{berimbau.jpg}}']) {
      expect(phClass(src)).toBe('zero')
      expect(texToText(src)).toBe('')
    }
    expect(phClass('\\rule{1cm}{1pt}')).toBe('other')
  })
})

describe('no unit drawn in part: the text run past a display where the slots after it are too few', () => {
  // a line is 100 pt wide at size 10, each 'x' 5 pt (the test's canvas: 50 px a character at 100 px)
  const word = (n: number) => ({ s: 'x'.repeat(n), cls: 'latin', w100: 50 * n, st: {} })
  const space = { space: true, w100: 25 }
  const block = (B: number[], after: number) => ({ page: 1, rects: B.map(b => [1, 0, b - 2, 100, b + 8]), x0: 0, x1: 100, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after, centred: false })
  const P = () => ({ ...L2.defaultParams('de'), borrow: 0 })
  // one line of text before a display, three after it, which leaves the original one line below it and three above it
  const blocks = [block([500, 488, 476, 464], 0), block([300], 1)]
  const after = [word(18), space, word(18), space, word(18)]
  it("is clipped in the translation's order, and set whole once the text may run on into the lines above the display", () => {
    const tokens = [word(18), { blockTo: 0, w100: 0 }, ...after]
    expect(L2.layoutUnit2(tokens as never, blocks as never, 10, P() as never, 'de').clipped).toBe(true)
    const flow = L2.layoutUnit2(tokens as never, blocks as never, 10, { ...P(), flowPast: true } as never, 'de')
    expect(flow.clipped).toBe(false)
    expect(flow.scale).toBe(1)
    // the display breaks the line once: its text after it starts on the next line, above the display
    expect(flow.lines.map(l => l.baseline)).toEqual([500, 488, 476, 464])
  })
  it("breaks the line once a region: a placeholder kept in the display's lines after it is no second break", () => {
    const tokens = [word(18), { blockTo: 0, w100: 0 }, word(4), { blockTo: 0, w100: 0 }, word(4)]
    const flow = L2.layoutUnit2(tokens as never, blocks as never, 10, { ...P(), flowPast: true } as never, 'de')
    expect(flow.lines.map(l => l.items.filter(it => it.t.s).length)).toEqual([1, 2])
  })
})

describe("a crop's baseline, without a source that knows its ink: its line's", () => {
  const ch = (ch: string, yb: number, size: number) => ({ ch, x0: 0, x1: 1, yb, size, item: 0, ix: 0, k: 0, st: {}, page: 3, rect: [10, 440, 200, 452] })
  const lineInfo = (baseline: number, size: number, exact = true) => new Map([['3|10,440,200,452', { baseline, size, exact }]])
  it("sets i^{th} on its 'i', the glyph of its line's text size, not on the script most of it is", () => {
    const real = [ch('i', 442.41, 10.91), ch('t', 446.37, 7.97), ch('h', 446.37, 7.97)]
    expect(L2.cropBaselineOf(real as never, lineInfo(442.41, 10.91) as never, real as never)).toBeCloseTo(442.41, 2)
  })
  it('sets a formula all scripts (a fraction) on its line, measured there; on its own glyphs where its line is not', () => {
    const real = [ch('√', 180.22, 6.97), ch('1', 182.93, 6.97), ch('d', 174.8, 6.97)]
    expect(L2.cropBaselineOf(real as never, lineInfo(179.0, 9.96) as never, real as never)).toBe(179.0)
    expect(L2.cropBaselineOf(real as never, lineInfo(179.0, 9.96, false) as never, real as never)).toBe(180.22)
    expect(L2.cropBaselineOf(real as never, null, real as never)).toBe(180.22)
  })
})

describe("a unit's first line grown over the words its source begins with ('Google Google Research')", () => {
  // characters 4 pt wide from x, a space 2 pt; one item a word, as PDF.js gives a footnote's line
  const lineOf = (text: string, x: number, yb = 84.55) => {
    const out: object[] = []
    let at = x, item = 0
    for (const w of text.split(' ')) { [...w].forEach((ch, k) => { out.push({ ch, x0: at + 4 * k, x1: at + 4 * (k + 1), yb, size: 9, item, ix: at, k, st: {} }) }); at += 4 * w.length + 2; item++ }
    return out
  }
  it("takes the line's head the anchors and the layout file left out, word by word, past the unit's own part of its page", async () => {
    const { norm, wordsOf } = await import('@/pdf-reader/engine/layer-proto/layer1.mjs')
    const page = lineOf('‡Work performed while at Google Research.', 100)
    const start = (page as { ch: string; x0: number }[]).find(c => c.ch === 'R')?.x0 ?? 0
    const rect = [1, start, 82.6, start + 40, 90.7]
    // the unit's own part of its page (60 pt either side) holds only the line's last words; the band holds it all
    const local = [page.filter(c => (c as { x0: number }).x0 >= start - 60)]
    L2.extendRects([rect] as never, local as never, [] as never, 'Work performed while at Google Research.', wordsOf as never, norm as never, [page] as never)
    expect(rect[1]).toBe(100)
  })
  it('takes no run that is not where its source begins, nor any on a later line', async () => {
    const { norm, wordsOf } = await import('@/pdf-reader/engine/layer-proto/layer1.mjs')
    const page = lineOf('as shown in Google Research.', 100)
    const start = (page as { ch: string; x0: number }[]).find(c => c.ch === 'R')?.x0 ?? 0
    const rect = [1, start, 82.6, start + 40, 90.7]
    L2.extendRects([rect] as never, [page] as never, [] as never, 'Work performed while at Google Research.', wordsOf as never, norm as never)
    expect(rect[1]).toBe(start)
  })
})

describe("Hangul's advance given back: the fit's tracking starts where its face's size correction left it", () => {
  const block = { page: 1, rects: [[1, 0, 98, 100, 108]], x0: 0, x1: 100, B: [100], exact: [true], sizes: [10], pitch0: null, free: 0, indent: 0, after: 0, centred: false }
  // Korean words of syllables 5 pt wide at size 10, a space 2.5 pt (it may shrink to 0.8 of it)
  const words = (n: number, of: number) => Array.from({ length: n }, (_, q) => [...(q ? [{ space: true, w100: 25 }] : []), { s: '\uD55C'.repeat(of), cls: 'cjk', w100: 50 * of, st: {} }]).flat()
  it('sets the first state at trackStart, and tightens from it down to trackMin where the text needs it', () => {
    const P = { ...L2.defaultParams('ko'), trackStart: 0.04, borrow: 0 }
    // 16 syllables: 80 pt, 6.4 pt of tracking, 7.5 of spaces; 18: 90 pt, which fits once the tracking is down to 0.03
    expect(L2.layoutUnit2(words(4, 4) as never, [block] as never, 10, P as never, 'ko').state.track).toBeCloseTo(0.04, 6)
    expect(L2.layoutUnit2(words(3, 6) as never, [block] as never, 10, P as never, 'ko').state.track).toBeCloseTo(0.03, 6)
    expect(L2.layoutUnit2(words(4, 4) as never, [block] as never, 10, { ...P, trackStart: 0 } as never, 'ko').state.track).toBe(0)
  })
})

describe('the thesis pitch, switchable: the leading rule off, and fillBySize', () => {
  it("leaves the script's leading on any pitch where the rule is off (leadRel: false)", () => {
    expect(L2.leadOf([{ pitch0: 17.93 }] as never, 11.96, { leadBase: 1.3, leadRel: false } as never)).toBe(1.3)
  })
  it('grows a unit whose natural state leaves lines to spare to the largest size up to growTo that sets it whole, on the same pitch', () => {
    // two lines of 100 pt at pitch 15; two words of 13 syllables, 65 pt at size 10, a line each with room to spare: they
    // still fit a line each at 1.1 (71.5 pt), the lines on the original's baselines
    const block = { page: 1, rects: [[1, 0, 98, 100, 108], [1, 0, 83, 100, 93]], x0: 0, x1: 100, B: [100, 85], exact: [true, true], sizes: [10, 10], pitch0: 15, free: 0, indent: 0, after: 0, centred: false }
    const words = (n: number, of: number) => Array.from({ length: n }, (_, q) => [...(q ? [{ space: true, w100: 25 }] : []), { s: '한'.repeat(of), cls: 'cjk', w100: 50 * of, st: {} }]).flat()
    const P = { ...L2.defaultParams('zh'), leadBase: 1, borrow: 0 }
    const natural = L2.layoutUnit2(words(2, 13) as never, [block] as never, 10, P as never, 'zh')
    expect(natural.scale).toBe(1)
    const grown = L2.layoutUnit2(words(2, 13) as never, [block] as never, 10, { ...P, growTo: 1.1 } as never, 'zh')
    expect(grown.scale).toBeGreaterThan(1)
    expect(grown.scale).toBeLessThanOrEqual(1.1)
    expect(grown.lines.map(l => l.baseline)).toEqual([100, 85])
    expect(grown.clipped).toBe(false)
  })
})

describe("TeX's control symbols in a source's rendering (texToText2): the character, never their syntax", () => {
  it('an escaped special is its character, an alignment tab and a control space are spaces, an escaped brace is kept', () => {
    // "Vinyals \& Kaiser" drew as "Vinyals \ Kaiser" (1706.03762's Table 4), "\$" as "\", "\{a\}" as "a"
    expect(['\\&', '\\%', '\\#', '\\$', '\\_', '\\{', '\\}'].map(s => L2.texToText2(s))).toEqual(['&', '%', '#', '$', '_', '{', '}'])
    expect(L2.texToText2('$\\{\\theta\\}_{\\text{Ang}}$')).toBe('{\u03b8}_(Ang)')
    // 2307.16209: "D=l^\u03bc\u2202_\u03bc,\\ \u0394" drew its control space's backslash
    expect(L2.texToText2('$D=l^{{\\mu}}\\partial_{{\\mu}},\\ \\Delta =n^{{\\mu}}$')).toBe('D=l^\u03bc\u2202_\u03bc, \u0394 =n^\u03bc')
    expect(L2.texToText2('$a\\,b\\;c\\!d~e$')).toBe('a b cd e')
    expect(L2.texToText2('a & b \\\\ c & d')).toBe('a b c d')
  })
})

describe("the room before a rule (capScale, run.mjs clearScale): the fit's states never above it", () => {
  const block = { page: 1, rects: [[1, 0, 98, 100, 108], [1, 0, 83, 100, 93]], x0: 0, x1: 100, B: [100, 85], exact: [true, true], sizes: [10, 10], pitch0: 15, free: 0, indent: 0, after: 0, centred: false }
  const words = (n: number, of: number) => Array.from({ length: n }, (_, q) => [...(q ? [{ space: true, w100: 25 }] : []), { s: '\uD55C'.repeat(of), cls: 'cjk', w100: 50 * of, st: {} }]).flat()
  it('starts at the cap, and grows no further than it', () => {
    const P = { ...L2.defaultParams('zh'), leadBase: 1, borrow: 0 }
    expect(L2.layoutUnit2(words(2, 13) as never, [block] as never, 10, { ...P, capScale: 0.92 } as never, 'zh').scale).toBeLessThanOrEqual(0.92)
    expect(L2.layoutUnit2(words(2, 13) as never, [block] as never, 10, { ...P, growTo: 1.1, capScale: 1 } as never, 'zh').scale).toBe(1)
  })
  it("shrinks on the uncapped steps under the cap, down to the floor: a cap of 0.956 still reaches 0.8", () => {
    // one line of 100 pt and two words of 124.5 pt at size 10, their space not shrinking: they fit at 0.8, not at 0.806
    // (0.956 less three steps)
    const one = { ...block, rects: [[1, 0, 98, 100, 108]], B: [100], exact: [true], sizes: [10] }
    const word = [{ s: 'W', cls: 'latin', w100: 600, st: {} }, { space: true, w100: 25 }, { s: 'W', cls: 'latin', w100: 620, st: {} }]
    const P = { ...L2.defaultParams('zh'), leadBase: 1, borrow: 0, order: ['shrink'], floor: 0.8, step: 0.05, trackMin: 0, compressMax: 0, hyphen: 0, spaceMin: 1 }
    const r = L2.layoutUnit2(word as never, [one] as never, 10, { ...P, capScale: 0.956 } as never, 'zh')
    expect(r.clipped).toBe(false)
    expect(r.scale).toBe(0.8)
  })
})

