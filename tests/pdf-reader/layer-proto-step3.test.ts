import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

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
/** a target's parameters, the layout rules' built-in ones (what a run is opened with), a fresh object each call */
const params = (to: string) => resolveRules(BUILTIN_RULES, to).params

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

describe("a shrunk line keeps the original's pitch, and the alphabets shrink before they lead closer (D6, F6a)", () => {
  // a block of n lines 12 pt apart from 500, 100 pt wide, at size 10; words of three letters, 15 pt at size 10 and a space of
  // 2.5 (it may shrink to 0.8 of it): six words a line at the full size, seven from 0.85
  const block = (n: number) => { const B = Array.from({ length: n }, (_, k) => 500 - 12 * k); return { page: 1, rects: B.map(b => [1, 0, b - 2, 100, b + 8]), x0: 0, x1: 100, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after: 0, centred: false } }
  const words = (n: number) => Array.from({ length: n }, (_, q) => [...(q ? [{ space: true, w100: 25 }] : []), { s: 'xxx', cls: 'latin', w100: 150, st: {} }]).flat()
  const P = (o: object = {}) => ({ ...params('de'), borrow: 0, hyphen: 0, ...o })
  it("sets every line of a shrunk unit on the original's own baselines: the pitch is the original's whatever the size", () => {
    const b = block(4)
    const l = L2.layoutUnit2(words(27) as never, [b] as never, 10, P() as never)
    expect(l.clipped).toBe(false)
    expect(l.scale).toBeLessThan(1)
    expect(l.state.lead).toBe(1)
    expect(l.lines.map(x => x.baseline)).toEqual(b.B)
  })
  it('shrinks before it leads closer: 123 words take 0.85 on the original\'s pitch, not the full size at 0.95 of it', () => {
    // (at the full size 20 lines hold 120 words, and at a leading of 0.95 21 lines hold 126: the order of today's alphabets
    // took that; theirs since D6 shrinks to 0.85 first, seven words a line)
    expect(params('de').order).toEqual(['track', 'borrow', 'shrink', 'lead'])
    const l = L2.layoutUnit2(words(123) as never, [block(20)] as never, 10, P() as never)
    expect([l.scale, l.state.lead, l.clipped]).toEqual([0.85, 1, false])
    const before = L2.layoutUnit2(words(123) as never, [block(20)] as never, 10, P({ order: ['track', 'borrow', 'lead', 'shrink'] }) as never)
    expect([before.scale, before.state.lead]).toEqual([1, 0.95])
  })
  it('leads closer than the original only at the size floor: 145 words take 0.8 at 0.95 of its pitch', () => {
    const l = L2.layoutUnit2(words(145) as never, [block(20)] as never, 10, P() as never)
    expect([l.scale, l.state.lead, l.clipped]).toEqual([0.8, 0.95, false])
  })
  it("keeps CJK's order: the leading down to the original's pitch first, then the size", () => {
    for (const t of ['zh', 'zh-TW', 'ja', 'ko']) expect(params(t).order, t).toEqual(['track', 'borrow', 'lead', 'shrink'])
    for (const t of ['de', 'fr', 'es', 'pt', 'ru']) expect(params(t).order, t).toEqual(['track', 'borrow', 'shrink', 'lead'])
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
  const P = () => ({ ...params('de'), borrow: 0 })
  // one line of text before a display, three after it, which leaves the original one line below it and three above it
  const blocks = [block([500, 488, 476, 464], 0), block([300], 1)]
  const after = [word(18), space, word(18), space, word(18)]
  it("is clipped in the translation's order, and set whole once the text may run on into the lines above the display", () => {
    const tokens = [word(18), { blockTo: 0, w100: 0 }, ...after]
    expect(L2.layoutUnit2(tokens as never, blocks as never, 10, P() as never).clipped).toBe(true)
    const flow = L2.layoutUnit2(tokens as never, blocks as never, 10, { ...P(), flowPast: true } as never)
    expect(flow.clipped).toBe(false)
    expect(flow.scale).toBe(1)
    // the display breaks the line once: its text after it starts on the next line, above the display
    expect(flow.lines.map(l => l.baseline)).toEqual([500, 488, 476, 464])
  })
  it("breaks the line once a region: a placeholder kept in the display's lines after it is no second break", () => {
    const tokens = [word(18), { blockTo: 0, w100: 0 }, word(4), { blockTo: 0, w100: 0 }, word(4)]
    const flow = L2.layoutUnit2(tokens as never, blocks as never, 10, { ...P(), flowPast: true } as never)
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
    const P = { ...params('ko'), trackStart: 0.04, borrow: 0 }
    // 16 syllables: 80 pt, 6.4 pt of tracking, 7.5 of spaces; 18: 90 pt, which fits once the tracking is down to 0.03
    expect(L2.layoutUnit2(words(4, 4) as never, [block] as never, 10, P as never).state.track).toBeCloseTo(0.04, 6)
    expect(L2.layoutUnit2(words(3, 6) as never, [block] as never, 10, P as never).state.track).toBeCloseTo(0.03, 6)
    expect(L2.layoutUnit2(words(4, 4) as never, [block] as never, 10, { ...P, trackStart: 0 } as never).state.track).toBe(0)
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
    const P = { ...params('zh'), leadBase: 1, borrow: 0 }
    const natural = L2.layoutUnit2(words(2, 13) as never, [block] as never, 10, P as never)
    expect(natural.scale).toBe(1)
    const grown = L2.layoutUnit2(words(2, 13) as never, [block] as never, 10, { ...P, growTo: 1.1 } as never)
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

describe("the room before a rule (capScale, layer2.mjs cellBands): the fit's states never above it", () => {
  const block = { page: 1, rects: [[1, 0, 98, 100, 108], [1, 0, 83, 100, 93]], x0: 0, x1: 100, B: [100, 85], exact: [true, true], sizes: [10, 10], pitch0: 15, free: 0, indent: 0, after: 0, centred: false }
  const words = (n: number, of: number) => Array.from({ length: n }, (_, q) => [...(q ? [{ space: true, w100: 25 }] : []), { s: '\uD55C'.repeat(of), cls: 'cjk', w100: 50 * of, st: {} }]).flat()
  it('starts at the cap, and grows no further than it', () => {
    const P = { ...params('zh'), leadBase: 1, borrow: 0 }
    expect(L2.layoutUnit2(words(2, 13) as never, [block] as never, 10, { ...P, capScale: 0.92 } as never).scale).toBeLessThanOrEqual(0.92)
    expect(L2.layoutUnit2(words(2, 13) as never, [block] as never, 10, { ...P, growTo: 1.1, capScale: 1 } as never).scale).toBe(1)
  })
  it("shrinks on the uncapped steps under the cap, down to the floor: a cap of 0.956 still reaches 0.8", () => {
    // one line of 100 pt and two words of 124.5 pt at size 10, their space not shrinking: they fit at 0.8, not at 0.806
    // (0.956 less three steps)
    const one = { ...block, rects: [[1, 0, 98, 100, 108]], B: [100], exact: [true], sizes: [10] }
    const word = [{ s: 'W', cls: 'latin', w100: 600, st: {} }, { space: true, w100: 25 }, { s: 'W', cls: 'latin', w100: 620, st: {} }]
    const P = { ...params('zh'), leadBase: 1, borrow: 0, order: ['shrink'], floor: 0.8, step: 0.05, trackMin: 0, compressMax: 0, hyphen: 0, spaceMin: 1 }
    const r = L2.layoutUnit2(word as never, [one] as never, 10, { ...P, capScale: 0.956 } as never)
    expect(r.clipped).toBe(false)
    expect(r.scale).toBe(0.8)
  })
})

describe("a CJK cell's bands between the rules over and under its lines (cellBands, clearLines)", () => {
  // 1706.03762's Table 4 header: size 9.96, the original's line 6.8 over its baseline and 2.14 under, the rule over it
  // 7.63 over, the one under it 3.28 under
  const B = 690.22
  const cell = (rects: number[][], Bs: number[]) => [{ page: 10, B: Bs, rects }]
  const rules = [100, B + 7.63, 200, B + 8.03, 100, B - 3.68, 200, B - 3.28]
  it('holds the em box between the rules less the clearance, never past the original foot: 0.93 of the size', () => {
    const r = L2.cellBands(cell([[10, 120, B - 2.14, 180, B + 6.8]], [B]), () => rules, 9.96, params('zh'))
    // the band runs from the original's foot (2.14 under, above the rule under plus 0.5) to the rule over less 0.5
    expect(r?.cap).toBe(0.93)
    const band = r?.bands.get(0)?.[0]
    expect(band?.lo).toBeCloseTo(B - 2.14, 6)
    expect(band?.hi).toBeCloseTo(B + 7.13, 6)
    // where the line is drawn at the cap, it moves down by the least that clears the rule over: 1.02 pt
    const lines = [{ block: 0, baseline: B }]
    L2.clearLines(lines, r!.bands, 9.96 * 0.93)
    expect(B - lines[0]!.baseline).toBeCloseTo(1.02, 2)
    expect(lines[0]!.baseline + 0.88 * 9.96 * 0.93).toBeLessThanOrEqual(B + 7.13 + 1e-9)
  })
  it("reads the room kept to a rule and the floor of the cap from the rules' cellClear and cellCapMin", () => {
    const at = (o: object) => L2.cellBands(cell([[10, 120, B - 2.14, 180, B + 6.8]], [B]), () => rules, 9.96, { ...params('zh'), ...o })
    expect(at({})?.cap).toBe(0.93)
    // a wider clearance narrows the band: the rule over less 1 pt is below the original's own top, which holds it (6.8 over)
    expect(at({ cellClear: 1 })?.cap).toBe(0.897)
    // and the cap never falls below the rules' floor, however little room there is
    expect(at({ cellClear: 1, cellCapMin: 0.95 })?.cap).toBe(0.95)
    expect(at({ cellCapMin: 0.3 })?.cap).toBe(0.93)
  })
  it("keeps the original's own top where the rule is nearer, and takes no rule beside the line nor a page without any", () => {
    const tight = [100, B + 6.9, 200, B + 7.3]
    expect(L2.cellBands(cell([[10, 120, B - 2.14, 180, B + 6.8]], [B]), () => tight, 9.96, params('zh'))?.bands.get(0)?.[0]?.hi).toBeCloseTo(B + 6.8, 6)
    expect(L2.cellBands(cell([[10, 220, B - 2.14, 280, B + 6.8]], [B]), () => rules, 9.96, params('zh'))).toBeNull()
    expect(L2.cellBands(cell([[10, 120, B - 2.14, 180, B + 6.8]], [B]), () => undefined, 9.96, params('zh'))).toBeNull()
  })
  it("holds a line widened over the paper beside it to a rule over the part it was widened onto", () => {
    // the re-review of round 3, M4: a cell's rectangle over x 10-40, its block widened to x 80; the rule over x 50-80
    const wide = [{ page: 10, B: [B], rects: [[10, 10, B - 2.14, 40, B + 6.8]], x0: 10, x1: 80 }]
    const over = [50, B + 7.63, 80, B + 8.03]
    expect(L2.cellBands(wide as never, () => over, 9.96, params('zh'))?.bands.get(0)?.[0]?.hi).toBeCloseTo(B + 7.13, 6)
    expect(L2.cellBands([{ ...wide[0]!, x1: 40 }] as never, () => over, 9.96, params('zh'))).toBeNull()
  })
  it("moves no line set on a pitch of its own, and none a size that clears unmoved", () => {
    const r = L2.cellBands(cell([[10, 120, B - 2.14, 180, B + 6.8]], [B]), () => rules, 9.96, params('zh'))!
    const off = [{ block: 0, baseline: B - 4 }]
    L2.clearLines(off, r.bands, 9.96)
    expect(off[0]!.baseline).toBe(B - 4)
    const small = [{ block: 0, baseline: B }]
    L2.clearLines(small, r.bands, 9.96 * 0.8)
    expect(small[0]!.baseline).toBe(B)
  })
})


describe("adaptiveFill (D, the default) keeps a CJK cell clear of its rule (Codex's review of PR A, finding 5)", () => {
  it("re-lays a fillable cell at its fill leading and settles it in its band: its em box under the rule over it", async () => {
    const { fillPage, settleLayout } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    // a cell of two lines on a loose original (pitch 15 at 10 pt), the rule over its first line 7.63 over its baseline
    const block = { page: 1, rects: [[1, 0, 97.86, 100, 106.8], [1, 0, 82.86, 100, 91.8]], x0: 0, x1: 100, B: [100, 85], exact: [true, true], sizes: [10, 10], pitch0: 15, free: 0, indent: 0, after: 0, centred: false }
    const rules = [0, 107.63, 100, 108.03]
    const words = (n: number, of: number) => Array.from({ length: n }, (_, q) => [...(q ? [{ space: true, w100: 25 }] : []), { s: '\u6c49'.repeat(of), cls: 'cjk', w100: 50 * of, st: {} }]).flat()
    // as openProto: its parameters with adaptiveFill's defaults, the cell held to its band (capScale), fillable
    const P = { ...params('zh'), adaptiveFill: { band: 0.05, track: 0.05, size: 1.1 } }
    const clear = L2.cellBands([block] as never, () => rules, 10, params('zh'))!
    const rel = L2.leadOf([block] as never, 10, { ...P, leadRel: true } as never)
    expect(rel).toBeLessThanOrEqual(P.leadBase - 0.05)
    const p = { id: 1, unit: { kind: 'cell' }, pages: [1], tokens: words(2, 10), blocks: [block], s: 10, clear, P: { ...P, leadBase: rel, growTo: 0, capScale: clear.cap } as Record<string, unknown>, layout: null as never as { lines: { block: number; baseline: number }[]; scale: number } }
    p.layout = L2.layoutUnit2(p.tokens as never, p.blocks as never, 10, p.P as never) as never
    settleLayout(p)
    const clearOf = () => p.layout.lines[0]!.baseline + 0.88 * 10 * p.layout.scale
    expect(clearOf()).toBeLessThanOrEqual(107.13 + 1e-9)
    // the page's fill pass lays it anew: still clear
    let filled = false
    fillPage([p] as never, P as never, null, () => { filled = true })
    expect(filled).toBe(true)
    expect(clearOf()).toBeLessThanOrEqual(107.13 + 1e-9)
  })
})

describe("the page fill (adaptiveFill, D6's F6b): every original's units spread over their frames, to one rhythm a page", () => {
  // blocks of six lines 12 pt apart from 500, 100 pt wide, at size 10; CJK characters 10 pt wide at size 10, ten a line
  const block = (n = 6) => { const B = Array.from({ length: n }, (_, k) => 500 - 12 * k); return { page: 1, rects: B.map(b => [1, 0, b - 2, 100, b + 8]), x0: 0, x1: 100, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after: 0, centred: false } }
  const chars = (n: number) => Array.from({ length: n }, () => ({ s: '\u6c49', cls: 'cjk', w100: 100, st: {} }))
  type Unit = { id: number; unit: { kind: string }; pages: number[]; tokens: unknown[]; blocks: unknown[]; s: number; P: Record<string, unknown>; layout: { lines: { baseline: number }[]; scale: number; state: { lead: number; scale: number; track: number } }; fillLead?: number | null }
  // (the fill's top at 1.8 em, the mechanism's numbers: the built-in Chinese one is 2, as the next test holds)
  const P = (o: Record<string, unknown> = {}) => ({ ...params('zh'), borrow: 0, fillLead: 1.8, adaptiveFill: { band: 0.05, track: 0, size: 1.1 }, ...o })
  /** a unit laid as openProto lays it before its page's pass: at the script's leading on a solid-set original */
  const laid = (id: number, n: number, PP = P(), kind = 'para'): Unit => {
    const p = { id, unit: { kind }, pages: [1], tokens: chars(n), blocks: [block()], s: 10, P: { ...PP, growTo: 0 } } as unknown as Unit
    p.layout = L2.layoutUnit2(p.tokens as never, p.blocks as never, 10, p.P as never) as never
    return p
  }
  type Held = { last: number; anchor: number; lines: number }
  type Told = { target: number | null; own: number | null; body: boolean; lines: number; anchor: number | null }
  const fill = async (units: Unit[], PP: Record<string, unknown> = P(), held: Held | null = null) => (await import('@/pdf-reader/engine/layer-proto/run.mjs')).fillPage(units as never, PP as never, held)
  /** pages passed in order, each { units, own } (the own target its units are made to tell): the targets they are held to */
  const paper = async (pages: { units: Unit[]; own: number }[], PP: Record<string, unknown>) => {
    const { nextHeld } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    let held: Held | null = null
    const targets: number[] = []
    for (const pg of pages) {
      for (const u of pg.units) { u.fillLead = pg.own; (u as unknown as { fillTop: number }).fillTop = 3 }
      const r: Told = (await fill(pg.units, PP, held))!
      targets.push(r.target!)
      held = nextHeld(held, r)
    }
    return targets
  }
  const steps = (ts: number[]) => ts.slice(1).every((t, k) => Math.abs(t - ts[k]!) <= 0.05 + 1e-9)
  const baselines = (p: Unit) => p.layout.lines.map(l => l.baseline)

  it('builds in a top of 2 em for Chinese, 1.7 for Japanese and Korean, and the original\'s own pitch for the alphabets', () => {
    expect(['zh', 'zh-TW', 'ja', 'ko', 'de', 'fr', 'es', 'pt', 'ru'].map(t => params(t).fillLead)).toEqual([2, 2, 1.7, 1.7, null, null, null, null, null])
  })

  it("spreads a unit up to fillLead em of its drawn size: 1.8 em over a pitch of 1.2 em is 1.5 of it, 3 em sets its last line on the original's", async () => {
    // (no size grown: the leading alone)
    const PP = P({ adaptiveFill: { band: 0.05, track: 0, size: 1 } })
    const two = laid(1, 20, PP)
    expect(two.layout.state.lead).toBe(1.3)
    expect(await fill([two], PP)).toMatchObject({ target: 1.5, own: 1.5, body: true, lines: 6 })
    expect(baselines(two)).toEqual([500, 482])
    const P3 = { ...PP, fillLead: 3 }
    const three = laid(2, 30, P3)
    await fill([three], P3)
    expect(three.fillLead).toBe(2.5)
    expect(baselines(three)).toEqual([500, 470, 440])
  })

  it("holds a long paper's targets within a band of its fullest page's, however steadily they climb", async () => {
    // (forty pages of one six-line paragraph each, their own targets 0.03 above the last page's from 1.3: the pages are
    // equally full, so the first stays the anchor, and every target stays within 0.05 of it and of the page before)
    const PP = P({ fillLead: 3 })
    const ts = await paper(Array.from({ length: 40 }, (_, k) => ({ units: [laid(k, 20, PP)], own: Math.round((1.3 + 0.03 * k) * 1000) / 1000 })), PP)
    expect(ts[0]).toBe(1.3)
    expect(Math.max(...ts)).toBeCloseTo(1.35, 6)
    expect(steps(ts)).toBe(true)
  })

  it("anchors on the fullest page, not on a title page: the full pages climb to their own and stay within a band of it", async () => {
    // (a title page of one six-line paragraph telling 1.08, then pages of three, their own 1.33 climbing 0.03 a page: the
    // first full page anchors at 1.33; the targets step up 0.05 a page from 1.08 and stop at 1.38)
    const PP = P({ fillLead: 3 })
    const pages = [{ units: [laid(0, 20, PP)], own: 1.08 }, ...Array.from({ length: 12 }, (_, k) => ({ units: [laid(3 * k + 1, 20, PP), laid(3 * k + 2, 20, PP), laid(3 * k + 3, 20, PP)], own: Math.round((1.33 + 0.03 * k) * 1000) / 1000 }))]
    const ts = await paper(pages, PP)
    expect(ts.slice(0, 7)).toEqual([1.08, 1.13, 1.18, 1.23, 1.28, 1.33, 1.38])
    expect(Math.max(...ts)).toBeCloseTo(1.38, 6)
    expect(steps(ts)).toBe(true)
  })

  it('moves the anchor to a fuller page that comes later, and holds the pages after it to it', async () => {
    // (five pages of one paragraph at 1.3, then one of three at 1.5, then pages of one at 1.6: the anchor moves to the
    // fuller page's 1.5, and the targets climb by the band to 1.55, not to 1.6)
    const PP = P({ fillLead: 3 })
    const one = (k: number, own: number) => ({ units: [laid(k, 20, PP)], own })
    const pages = [...[0, 1, 2, 3, 4].map(k => one(k, 1.3)), { units: [laid(5, 20, PP), laid(6, 20, PP), laid(7, 20, PP)], own: 1.5 }, ...[8, 9, 10, 11, 12, 13].map(k => one(k, 1.6))]
    const ts = await paper(pages, PP)
    expect(ts.slice(0, 5)).toEqual([1.3, 1.3, 1.3, 1.3, 1.3])
    // (the fuller page itself is held by the anchor before it, 1.3, and the page before: 1.35)
    expect(ts[5]).toBeCloseTo(1.35, 6)
    expect(ts.slice(6)).toEqual([1.4, 1.45, 1.5, 1.55, 1.55, 1.55])
    expect(steps(ts)).toBe(true)
  })

  it("holds the page's target within the band of the running one, and each unit within the band over the target", async () => {
    const PP = P({ fillLead: 3 })
    const a = laid(1, 30, PP), b = laid(2, 30, PP)
    expect(await fill([a, b], PP, { last: 2, anchor: 2, lines: 6 })).toMatchObject({ target: 2.05, body: true, lines: 12 })
    expect([a.layout.state.lead, b.layout.state.lead]).toEqual([2.1, 2.1])
  })

  it("leaves the original's pitch alone where fillLead is empty (the alphabets): a unit is not spread past it", async () => {
    const PP = { ...params('de'), borrow: 0, adaptiveFill: { band: 0.05, track: 0, size: 1 } }
    expect(PP.fillLead).toBeNull()
    const de = laid(1, 20, PP as never)
    await fill([de], PP)
    expect(de.fillLead).toBe(1)
    expect(baselines(de)).toEqual([500, 488])
  })

  it('sets a unit whose fit took a closer leading at it: its fill leading is the loosest that still sets it, from its own', async () => {
    // (50 characters: four lines at 1.3 hold 40; the fit takes 1.25, five lines; at 1.26 four)
    const b = laid(1, 50)
    expect(b.layout.state.lead).toBe(1.25)
    await fill([b])
    expect(b.fillLead).toBe(1.25)
    expect(b.layout.lines).toHaveLength(5)
  })

  it("sets a page's body at one size below 1 too: two units the fit shrank to 0.925 and 0.85 both end at 0.85", async () => {
    // (blocks of two lines; at the original's pitch, its tracking tightened, 22 characters take 0.925, eleven a line, and
    // 24 take 0.85, twelve)
    const two = (id: number, n: number) => { const u = laid(id, n); u.blocks = [{ ...(u.blocks[0] as object), B: [500, 488], rects: [[1, 0, 498, 100, 508], [1, 0, 486, 100, 496]], exact: [true, true], sizes: [10, 10] }]; u.layout = L2.layoutUnit2(u.tokens as never, u.blocks as never, 10, u.P as never) as never; return u }
    const a = two(1, 22), b = two(2, 24)
    expect([a.layout.scale, b.layout.scale]).toEqual([0.925, 0.85])
    await fill([a, b])
    expect([a.layout.scale, b.layout.scale]).toEqual([0.85, 0.85])
    expect(a.layout.lines.length).toBeLessThanOrEqual(2)
  })

  it("counts a page's continuations in its body lines for the anchor: a page of a continuation alone can become the anchor", async () => {
    const { fillPage, nextHeld } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const PP = P({ fillLead: 3 })
    // (a unit begun on page 1 and running on over the whole of page 2: ten lines there, 1.4 its fill leading)
    const u = laid(1, 20, PP)
    const b1 = u.blocks[0] as { B: number[] }
    u.pages = [1, 2]
    u.blocks = [b1, { ...(b1 as object), page: 2, B: Array.from({ length: 10 }, (_, k) => 600 - 12 * k) }]
    u.fillLead = 1.4
    const r = fillPage([] as never, PP as never, null, () => {}, { page: 2, continuing: [u] as never })
    expect(r).toMatchObject({ body: false, lines: 10, anchor: 1.4 })
    // (held from a page of six lines at 1.3: the continuation's page, fuller, becomes the anchor; the last stays)
    expect(nextHeld({ last: 1.3, anchor: 1.3, lines: 6 }, r)).toEqual({ last: 1.3, anchor: 1.4, lines: 10 })
    expect(nextHeld({ last: 1.3, anchor: 1.3, lines: 12 }, r)).toEqual({ last: 1.3, anchor: 1.3, lines: 12 })
  })

  it("grows the page's body units to one size where each is still short, and none where one cannot grow: never a size a unit", async () => {
    const alone = laid(1, 20)
    await fill([alone])
    expect(alone.layout.scale).toBe(1.1)
    // (38 characters take four lines at the full size, five past it: it cannot grow, and the page's other unit neither)
    const a = laid(1, 20), b = laid(2, 38)
    await fill([a, b])
    expect([a.layout.scale, b.layout.scale]).toEqual([1, 1])
    // (nor where a body unit is full: the five-line unit at 1.25)
    const c = laid(1, 20), d = laid(2, 50)
    await fill([c, d])
    expect([c.layout.scale, d.layout.scale]).toEqual([1, 1])
    // (a unit not of the body takes its leading and tracking, never the page's size)
    const e = laid(1, 20), cap = laid(2, 20, P(), 'caption')
    await fill([e, cap])
    expect([e.layout.scale, cap.layout.scale]).toEqual([1.1, 1])
  })
})

describe("the leftover packed (P.leftover 'pack', D6's F6c): each paragraph keeps the original's gap to the one above", () => {
  // three paragraphs of a column, 12 pt apart at size 10: A's four lines from 500, B's three from 440, C's two from 400
  const unitOf = (id: number, B: number[], drawn: number[], o: { kind?: string; pages?: number[]; blocks?: number } = {}) => {
    const block = { page: 1, x0: 0, x1: 200, B, sizes: B.map(() => 10), pitch0: 12 }
    return { id, unit: { kind: o.kind ?? 'para' }, pages: o.pages ?? [1], s: 10, blocks: Array.from({ length: o.blocks ?? 1 }, () => block), layout: { f: 10, lines: drawn.map(baseline => ({ page: 1, block: 0, baseline })) } }
  }
  const run = () => [unitOf(1, [500, 488, 476, 464], [500, 485]), unitOf(2, [440, 428, 416], [440, 428]), unitOf(3, [400, 388], [400, 388])]
  const pack = async (units: ReturnType<typeof unitOf>[], rects: [number, number[]][] = [], chars: { ch: string; x0: number; x1: number; yb: number; size: number }[] = []) =>
    (await import('@/pdf-reader/engine/layer-proto/run.mjs')).packPage(1, units as never, rects, chars)
  const gap = (a: ReturnType<typeof unitOf>, b: ReturnType<typeof unitOf>) => Math.min(...a.layout.lines.map(l => l.baseline)) - 2.2 - (Math.max(...b.layout.lines.map(l => l.baseline)) + 7.5)

  it("moves each paragraph up to the original's gap under the one above, the moves adding up to the run's end", async () => {
    const [a, b, c] = run()
    const moves = await pack([a!, b!, c!])
    // (A ends two lines and three points short: B rises 21, and C, under B a line short, 33)
    expect([...moves]).toEqual([[2, 21], [3, 33]])
    expect(b!.layout.lines.map(l => l.baseline)).toEqual([461, 449])
    expect(gap(a!, b!)).toBeCloseTo(461.8 - 447.5, 6)
    expect(gap(b!, c!)).toBeCloseTo(413.8 - 407.5, 6)
  })

  it('moves nothing past a fixed thing: another unit\'s line, a character of the page between them, or a figure\'s room', async () => {
    const [a, b, c] = run()
    // (a heading's line between A and B: B stays, and C rises under B alone, a line)
    const moves = await pack([a!, b!, c!], [[9, [1, 0, 450, 100, 458]]])
    expect([...moves]).toEqual([[3, 12]])
    const [a2, b2, c2] = run()
    expect([...(await pack([a2!, b2!, c2!], [], [{ ch: 'x', x0: 50, x1: 55, yb: 452, size: 10 }]))]).toEqual([[3, 12]])
    const far = [unitOf(1, [500, 488, 476, 464], [500, 485]), unitOf(2, [400, 388], [400, 388])]
    expect((await pack(far)).size).toBe(0)
    // (and none whose first line holds what stays: a run-in heading's line beside it, or a label's characters before it)
    const [a3, b3, c3] = run()
    expect([...(await pack([a3!, b3!, c3!], [[9, [1, 0, 437.85, 40, 446.83]]]))]).toEqual([[3, 12]])
    const [a4, b4, c4] = run()
    b4!.blocks[0] = { ...b4!.blocks[0]!, indent: 40 } as never
    expect([...(await pack([a4!, b4!, c4!], [], [{ ch: 'B', x0: 2, x1: 30, yb: 440, size: 10 }]))]).toEqual([[3, 12]])
  })

  it('moves over no ink that stays: it stops the clearance short of a rule or a kept box it would rise into, and stays for one in its own band', async () => {
    // (ink that stays, as boxes [x0, y0, x1, y1]: the lowest foot among those a box meets; the clearance 0.35 of the pitch, 4.2)
    const inkOf = (boxes: [number, number, number, number][]) => (x0: number, x1: number, y0: number, y1: number) => {
      const met = boxes.filter(([bx0, by0, bx1, by1]) => bx0 < x1 && bx1 > x0 && by0 < y1 && by1 > y0)
      return met.length ? Math.min(...met.map(([, by0]) => by0)) : null
    }
    const packWith = async (boxes: [number, number, number, number][]) => {
      const units = run()
      const moves = await (await import('@/pdf-reader/engine/layer-proto/run.mjs')).packPage(1, units as never, [], [], inkOf(boxes), 0.35)
      return { moves, units }
    }
    // (none: B rises its 21, C its 33)
    expect([...(await packWith([])).moves]).toEqual([[2, 21], [3, 33]])
    // a rule between A and B, at 454.5 to 455.5: B's top (440 + 8.8) rises to 4.2 under it, 1.5
    const rule = await packWith([[0, 454.5, 200, 455.5]])
    expect(rule.moves.get(2)).toBeCloseTo(1.5, 6)
    expect(Math.max(...rule.units[1]!.layout.lines.map(l => l.baseline)) + 8.8).toBeLessThanOrEqual(454.5 - 4.2 + 1e-9)
    // a kept box in A's frame's blank, at 469 to 471: B rises 16
    expect((await packWith([[50, 469, 60, 471]])).moves.get(2)).toBeCloseTo(16, 6)
    // ink that stays in B's own band (a kept glyph among its lines): B does not move
    expect((await packWith([[50, 430, 55, 436]])).moves.has(2)).toBe(false)
  })

  it("moves no unit of two blocks, on two pages or not of the body, and none drawn to its frame's foot", async () => {
    for (const o of [{ blocks: 2 }, { pages: [1, 2] }, { kind: 'caption' }]) {
      const [a, , c] = run()
      expect((await pack([a!, unitOf(2, [440, 428, 416], [440, 428], o), c!])).has(2), JSON.stringify(o)).toBe(false)
    }
    const full = [unitOf(1, [500, 488, 476, 464], [500, 488, 476, 464]), unitOf(2, [440, 428, 416], [440, 428, 416])]
    expect((await pack(full)).size).toBe(0)
  })
})

describe('the ink that stays (stayingInk): the page\'s ink but the glyphs the drawing takes away, and the dirty boxes', () => {
  // a map of 100 x 100 cells at one device pixel a cell and a PDF unit, PDF y up: a rule at row 40 (PDF y 59 to 60) across x
  // 10-90, a glyph at rows 70-72 and x 20-24 (PDF y 27 to 30)
  const map = () => {
    const ink = new Uint8Array(100 * 100)
    for (let c = 10; c <= 90; c++) ink[40 * 100 + c] = 1
    for (let r = 70; r <= 72; r++) for (let c = 20; c <= 24; c++) ink[r * 100 + c] = 1
    return { w: 100, h: 100, ink, factor: 1 }
  }
  const io = { toDev: (x: number, y: number) => [x, 100 - y], toPdf: (x: number, y: number) => [x, 100 - y] }
  it('finds a rule as text does, the lowest ink first, and none past a glyph the drawing takes away', async () => {
    const { stayingInk } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const all = stayingInk({ map: map(), ...io })
    expect(all(0, 100, 50, 70)).toBe(59)
    expect(all(0, 100, 20, 70)).toBe(27)
    expect(all(30, 100, 20, 50)).toBeNull()
    const taken = stayingInk({ map: map(), ...io, accounted: [[20, 27.5, 25, 30]] })
    expect(taken(0, 100, 20, 50)).toBeNull()
    expect(taken(0, 100, 20, 70)).toBe(59)
    // (a dirty box: the add-on's kept ink under a unit's rectangle, ink whatever the map says)
    expect(stayingInk({ map: map(), ...io, dirty: [[50, 10, 60, 20]] })(40, 70, 0, 30)).toBe(9)
  })
})
