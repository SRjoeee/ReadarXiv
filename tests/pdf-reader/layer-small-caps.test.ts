import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules, TARGETS } from '@/pdf-reader/engine/rules/layout.mjs'
import { plainSource } from '@/pdf-reader/engine/translate/mt.mjs'

// Small capitals as the original sets them (2602.23285v2's appendix headings, 2026-10-24). A face of the Times family has no small
// capitals of its own: NFSS sets \scshape in a virtual face (ptmrc8t) that draws each lowercase letter as a capital of the upright
// face at 0.8 of the size, in the same PDF font as the capitals, so no font name says small capitals and the class's \sc is in
// no piece of the unit's source. The unit's size is its capitals' (TeX's nominal size), not the median its small capitals make,
// and it is set in small capitals, which the layer draws itself where its face has none of its own: each lowercase letter as the
// face's capital at the share of the size the page sets them at, measured as it is drawn, no browser synthesizing any. Case is
// each character's, in the target's case mapping. A unit its class sets in the text's capitals (REVTeX's \MakeTextUppercase) is
// drawn in the target's capitals; a real small-caps face and a unit of mixed sizes read as before

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type Tex = typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
type Fonts = typeof import('@/pdf-reader/engine/layer-proto/fonts.mjs')
let L2: L2
let T: Tex
let F: Fonts
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  T = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
  F = await import('@/pdf-reader/engine/layer-proto/fonts.mjs')
})

/** NimbusRomNo9L-Regu as classifyFont reads it: no small capitals in its name */
const times = { fam: 'serif', bold: false, italic: false, caps: false, known: true, design: 'times' }
/** CMCSC10: Computer Modern's small capitals, its lowercase letters drawn as themselves */
const cmcsc = { fam: 'serif', bold: false, italic: false, caps: true, known: true, design: 'cm' }
type St = typeof times
/**
 * A line of page characters from runs [text, size, st, gap before], on baseline 100: each character half its size wide, a run
 * glued to the one before (one word) unless it has a gap, each run its own text item (PDF.js gives one a font size)
 */
const lineOf = (runs: [string, number, St, number?][]) => {
  let x = 10
  const chars = runs.flatMap(([t, size, st, gap = 0], n) => {
    x += gap
    return [...t].map((ch, k) => { const c = { ch, x0: x, x1: x + 0.5 * size, yb: 100, size, item: n, ix: x, k, st }; x += 0.5 * size; return c })
  })
  return { page: chars, rect: [1, 10, 97, x, 109] }
}
const text = (s: string, tr = false) => ({ t: 'text', s, ...(tr ? { tr: true } : {}) })
const open = (src: string, id: number) => ({ t: 'open', id, src }), close = (id: number) => ({ t: 'close', id, src: '}' })
/** a drawn unit as rows.mjs unitOf makes it (its source pieces beside its translated ones: a reader's), or as the gate's record
 *  gives it (`source` false: no source pieces) */
const unitOf = (source: Record<string, unknown>[], translated: (number | string)[], kind = 'para', withSource = true) => {
  const src = source.map((p, k) => ({ ...p, k }))
  const u = { kind, src: plainSource({ pieces: src } as never), state: 'whole', pieces: translated.map(p => (typeof p === 'number' ? src[p] : text(p, true))) }
  if (withSource) Object.defineProperty(u, 'source', { value: src, enumerable: false })
  return u as never
}
const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
const P = (to = 'es') => ({ ...resolveRules(BUILTIN_RULES, to).params, autospace: 0, compressMax: -1, hyphen: 0 })
type Tok = { s?: string; st: { caps?: boolean; upper?: boolean }; face: { caps?: boolean; id?: string }; sc?: number; w100: number; glue?: boolean; cls?: string; space?: boolean }
type Measure = (s: string, face: unknown) => number
/** the unit read as the reader's layer reads it, on a layout file of its one line, and its tokens in `to` (measured by `measure`) */
const read = (u: never, line: ReturnType<typeof lineOf>, to = 'es', measure: Measure = () => 0) => {
  const lu = {
    lines: Float64Array.from([1, line.rect[1]!, line.rect[3]!, 100, 108, 98, 10, 0]), frames: Float64Array.from([1, 0, 0, 1, -1, 0]), erase: [new Float64Array(0)], labels: new Float64Array(0), ph: new Map(),
  } as never
  const t = T.texRects(lu)
  const kOf = (u as unknown as { pieces: { k?: number }[] }).pieces.map(p => p.k ?? -1)
  const parts = T.texParts(lu, kOf, { lines: t })
  const prep = L2.prepareUnit(u, t.rects as never, [line.page as never], new Map() as never, null, parts as never) as unknown as { orig: { size: number; st: St & { upper?: boolean } } | null; measured: { st: { caps: boolean } | null } | null; capsRatio?: number }
  const base = prep.orig ? { ...prep.orig.st } : BASE
  const tokens = L2.tokensOf2(u, prep as never, to, base as never, DESIGNS as never, P(to) as never, null, measure as never) as unknown as Tok[] & { base: { caps: boolean; upper?: boolean } }
  // (the size the run lays the unit at: unitSizeOf's)
  const size = L2.unitSizeOf(prep as never, P(to) as never)
  return { prep, tokens, drawn: tokens.filter(x => typeof x.s === 'string' && /\S/.test(x.s)), size }
}
/** each drawn token as [its text as drawn, the share of the size it is drawn at] */
const shares = (drawn: Tok[]) => drawn.map(t => [t.s, t.sc ?? 1])
/** a unit's pieces as tokens with no page read: `fields` the reading's (its size, its small capitals' share, its renderings by k) */
const tokensOf = (pieces: unknown[], to: string, base: Record<string, unknown>, fields: Record<string, unknown> = {}, measure?: Measure, renderings: [number, unknown][] = []) =>
  L2.tokensOf2({ kind: 'heading', src: '', pieces } as never, Object.assign(new Map(renderings), { orig: { size: 10 }, ...fields }) as never, to, { ...BASE, ...base } as never, DESIGNS as never, P(to) as never, null, measure as never) as unknown as Tok[]
const capsBase = { caps: true }
/** the CSS rule of the class a face's run is drawn in (layer2.mjs faceClass, by way of svgOfName) */
const ruleOf = (face: unknown) => {
  const svg = L2.svgOfName({ occurrence: 1, text: 'Discusión', x: 0, baseline: 0, size: 10, face: face as never }, (x: number, y: number) => [x, y], 1)
  const cls = /class="(axf[0-9a-z-]+)"/.exec(svg)![1]
  const rules = [...document.head.querySelectorAll('style')].flatMap(e => [...(e.sheet?.cssRules ?? [])] as CSSStyleRule[])
  return rules.find(r => r.selectorText === `.${cls}`)?.cssText ?? ''
}
/** the role table's face of a Latin run in `design`, for `to` */
const roleFace = (to: string, design: string, st: Record<string, unknown> = {}) => F.faceOf({ fam: 'serif', bold: false, italic: false, caps: true, design, ...st } as never, 'latin', to)
const withRoles = <R>(to: string, fn: () => R): R => {
  F.setRoleFaces(to, 'times', resolveRules(BUILTIN_RULES, to).cjkFaces)
  try { return fn() } finally { F.setRoleFaces(null as never, null as never, null) }
}
/** one block of `n` lines `width` wide, at size 10 */
const block = (width: number, n = 1) => ({ page: 1, rects: Array.from({ length: n }, (_, k) => [1, 0, 98 - 12 * k, width, 106 - 12 * k]), x0: 0, x1: width, B: Array.from({ length: n }, (_, k) => 100 - 12 * k), exact: Array(n).fill(true), sizes: Array(n).fill(10), pitch0: 12, free: 0, indent: 0, after: 0, centred: false })

/** ICLR's "A.1 Discussion: Key insights of …" (2602.23285v2 page 15): its capitals at 9.963 pt, its lowercase letters as capitals at 7.97 */
const heading = () => lineOf([['D', 9.963, times], ['ISCUSSION', 7.97, times], [':', 9.963, times], ['K', 9.963, times, 3], ['EY', 7.97, times], ['INSIGHTS', 7.97, times, 2.4], ['OF', 7.97, times, 2.4]])
const HEADING = [text('Discussion: Key insights of')]

describe('a heading its class sets in faked small capitals (ICLR, IEEEtran, under \\usepackage{times})', () => {
  it('is read at its capitals\' size, TeX\'s nominal size, not the median its small capitals make', () => {
    for (const withSource of [true, false]) {
      const { prep, size } = read(unitOf(HEADING, ['Discusión: perspectivas clave de'], 'heading', withSource), heading())
      expect(prep.orig!.size).toBeCloseTo(9.963, 3)
      expect(size).toBeCloseTo(9.963, 3)
    }
  })

  it('is set in small capitals: a reader\'s unit by its measured base, the gate\'s (no source pieces) by its majority\'s', () => {
    const reader = read(unitOf(HEADING, ['Discusión: perspectivas clave de'], 'heading'), heading())
    expect(reader.prep.measured!.st!.caps).toBe(true)
    expect(reader.tokens.base.caps).toBe(true)
    expect(new Set(reader.drawn.map(t => !!t.st.caps))).toEqual(new Set([true]))
    const gate = read(unitOf(HEADING, ['Discusión: perspectivas clave de'], 'heading', false), heading())
    expect(gate.prep.measured!.st).toBeNull()
    expect(gate.tokens.base.caps).toBe(true)
  })

  it('an ink unit (its source our page\'s own capitals) as a source unit: at its full letters\' size, in small capitals', () => {
    // (a running head in ICLR's Times \\sc that no source unit owns: its source the glyphs' text, "REFERENCES"; drawn at 9.6, the
    // median its small capitals make, beside source headings drawn at 12)
    const line = lineOf([['R', 12, times], ['EFERENCES', 9.6, times]])
    const zh = String.fromCodePoint(0x53c2, 0x8003, 0x6587, 0x732e)
    for (const to of ['zh', 'es']) {
      const { prep, size } = read(unitOf([text('REFERENCES')], [to === 'zh' ? zh : 'Referencias'], 'inkheads'), line, to)
      expect(prep.orig!.size).toBeCloseTo(12, 3)
      expect(size).toBeCloseTo(12, 3)
      expect(prep.orig!.st.caps).toBe(true)
    }
    // (one in capitals at one size, a case change's: its size, no small capitals, as before)
    const upper = read(unitOf([text('REFERENCES')], ['Referencias'], 'inkheads'), lineOf([['REFERENCES', 10, times]]))
    expect([upper.prep.orig!.size, upper.prep.orig!.st.caps]).toEqual([10, false])
    // (one with a lowercase glyph, a drop cap before it: read as before, no small capitals)
    const drop = read(unitOf([text('Once upon a time')], ['Erase una vez'], 'inkorphan'), lineOf([['O', 20, times], ['nce upon a time', 10, times]]))
    expect(drop.prep.orig!.st.caps).toBe(false)
  })

  it('in a CJK target: no case, at the nominal size × CJK_CAPS_SIZE (the owner\'s one value, 1)', () => {
    // (the heading in Chinese, its characters by code point)
    const zh = String.fromCodePoint(0x8ba8, 0x8bba, 0xff1a, 0x5173, 0x952e, 0x89c1, 0x89e3)
    const { size, drawn } = read(unitOf(HEADING, [zh], 'heading'), heading(), 'zh')
    expect(L2.CJK_CAPS_SIZE).toBe(1)
    expect(size).toBeCloseTo(9.963 * L2.CJK_CAPS_SIZE, 3)
    // (a CJK character has no case: drawn as it is, at the size, in a face asked no small capitals)
    expect(drawn.every(t => t.sc === undefined && t.s === t.s!.toLowerCase())).toBe(true)
    withRoles('zh', () => expect(F.faceOf({ fam: 'serif', bold: false, italic: false, caps: true, design: 'times' } as never, 'cjk', 'zh').caps).toBe(false))
  })

  it('a section heading at 12 pt ("A EXPERIMENTAL SETTINGS"): its capitals 11.955, its small capitals 9.564', () => {
    const line = lineOf([['E', 11.955, times], ['XPERIMENTAL', 9.564, times], ['S', 11.955, times, 3], ['ETTINGS', 9.564, times]])
    const { prep, tokens } = read(unitOf([text('Experimental Settings')], ['Entornos experimentales'], 'heading'), line)
    expect(prep.orig!.size).toBeCloseTo(11.955, 3)
    expect(tokens.base.caps).toBe(true)
    expect(prep.capsRatio).toBe(0.8)
  })
})

describe('small capitals the layer draws itself, at the share the page sets them at', () => {
  it('the share is read from the unit\'s own glyphs: 7.97 of 9.963 is 0.8, 5 of 7 (2608.27181\'s table) 0.71', () => {
    expect(read(unitOf(HEADING, ['x'], 'heading'), heading()).prep.capsRatio).toBe(0.8)
    const table = lineOf([['E', 6.974, times], ['ASY', 4.981, times], ['H', 6.974, times, 2], ['ARD', 4.981, times]])
    const { prep, drawn } = read(unitOf([text('Easy Hard')], ['Fácil difícil'], 'cell'), table)
    expect(prep.capsRatio).toBe(0.71)
    expect(shares(drawn)).toEqual([['F', 1], ['ÁCIL', 0.71], ['DIFÍCIL', 0.71]])
  })

  it('each lowercase letter as its capital at that share, the rest as it is, each run of one case a token glued to the one before', () => {
    const { tokens, drawn } = read(unitOf(HEADING, ['Discusión: perspectivas clave de'], 'heading'), heading())
    expect(shares(drawn)).toEqual([['D', 1], ['ISCUSIÓN', 0.8], [':', 1], ['PERSPECTIVAS', 0.8], ['CLAVE', 0.8], ['DE', 0.8]])
    // (no break inside a word: its runs glued, its spaces where the translation has them)
    expect(drawn.slice(1, 3).every(t => t.glue)).toBe(true)
    expect(tokens.filter(t => t.space).length).toBe(3)
    // (the face asked no small capitals: nothing for a browser to synthesize)
    expect(drawn.every(t => t.face.caps === false)).toBe(true)
  })

  it('measured as drawn: a run\'s width is its capitals\' at the share, the expanded string where the case mapping expands it', () => {
    const widths: Measure = s => [...s].reduce((a, ch) => a + (/\p{Lu}/u.test(ch) ? 70 : 50), 0)
    const drawn = tokensOf([text('Größe x', true)], 'de', capsBase, { capsRatio: 0.8 }, widths).filter(t => t.s && /\S/.test(t.s))
    expect(shares(drawn)).toEqual([['G', 1], ['RÖSSE', 0.8], ['X', 0.8]])
    for (const t of drawn) expect(t.w100).toBeCloseTo(widths(t.s!, t.face) * (t.sc ?? 1), 9)
  })

  it('where the page tells no share (a face of real small capitals the target\'s face has none of): SMALL_CAPS_RATIO, 0.8', () => {
    expect(L2.SMALL_CAPS_RATIO).toBe(0.8)
    const line = lineOf([['Introduction', 9.963, cmcsc]])
    const { prep, drawn } = read(unitOf([text('Introduction')], ['Introducción'], 'heading'), line)
    expect(prep.capsRatio).toBeUndefined()
    expect(shares(drawn)).toEqual([['I', 1], ['NTRODUCCIÓN', 0.8]])
  })

  it('a rendering of the page\'s own characters keeps the small capitals the page sets: a macro\'s capitals at 7.97 beside 9.963', () => {
    const chars = [...'ODEBRAIN'].map((ch, k) => ({ ch, size: k < 4 ? 9.963 : 7.97, st: times }))
    const drawn = tokensOf([text('Ideas clave de ', true), { t: 'ph', src: '\\ours', k: 1 }], 'es', capsBase, { orig: { size: 9.963 } }, undefined, [[1, { mode: 'orig-text', text: 'ODEBRAIN', gap: { chars } }]]).filter(t => t.s && /\S/.test(t.s))
    expect(shares(drawn).slice(-2)).toEqual([['ODEB', 1], ['RAIN', 0.8]])
  })

  it('a formula\'s text takes neither small capitals nor capitals', () => {
    const drawn = tokensOf([text('Para ', true), { t: 'ph', src: '$x$', k: 1 }], 'es', { caps: true, upper: true }, {}, undefined, [[1, { mode: 'math', math: true, text: 'x' }]]).filter(t => t.s && /\S/.test(t.s))
    expect(shares(drawn)).toEqual([['PARA', 1], ['x', 1]])
  })

  it('a word longer than its line is cut by its characters across its runs of one case, as a word of one token is (Codex on #461)', () => {
    // ("Introduction" at 10 in a frame 30 wide: I 5, each small capital 4; the line takes I and NTRODU, 29, the next CTION. Its
    // capital alone on a line of its own, the runs after it cut on the next, it took three)
    const tokens = tokensOf([text('Introduction', true)], 'es', capsBase, { capsRatio: 0.8 }, undefined) as never
    const L = L2.layoutUnit2(tokens, [block(30, 3)] as never, 10, P() as never) as unknown as { lines: { items: { t: Tok }[] }[] }
    expect(L.lines.map(l => l.items.map(it => [it.t.s, it.t.sc ?? 1]))).toEqual([[['I', 1], ['NTRODU', 0.8]], [['CTION', 0.8]]])
  })

  it('laid and drawn alike: each run a <tspan> at its share of the size, its edge where its tokens\' widths put it', () => {
    const tokens = tokensOf([text('Discusión: perspectivas', true)], 'es', capsBase, { capsRatio: 0.8 }) as never
    const L = L2.layoutUnit2(tokens, [block(400)] as never, 10, P() as never) as unknown as { f: number; lines: { items: { t: Tok; x: number; w: number }[] }[] }
    const line = L.lines[0]!
    const runs = L2.lineRuns(line as never, L as never).filter(r => !('crop' in r && r.crop !== undefined)) as { text: string; sc?: number; xs: number[]; items: [number, number][] }[]
    expect(runs.map(r => [r.text.trim(), r.sc ?? 1])).toEqual([['D', 1], ['ISCUSIÓN', 0.8], [':', 1], ['PERSPECTIVAS', 0.8]])
    for (const run of runs) {
      // (its drawn width by runEdge, the browser's layout of the <tspan>: its items' laid widths, the space after it aside)
      const own = run.text.replace(/ $/, '')
      const w = L2.runEdge(run as never, own.length, line as never, L as never) - L2.runEdge(run as never, 0, line as never, L as never)
      const laid = run.items.filter(([n]) => !line.items[n]!.t.space).reduce((a, [n]) => a + line.items[n]!.w, 0)
      expect(w).toBeCloseTo(laid, 9)
      expect(run.xs[0]).toBeCloseTo(line.items[run.items[0]![0]]!.x, 9)
    }
    const svg = L2.svgOfUnit(L as never, 1, (x: number, y: number) => [x, 792 - y], 1, 0)
    const spans = [...svg.matchAll(/font-size="([\d.]+)"[^>]*>([^<]*)</g)].map(m => [m[2]!.trim(), Number(m[1])])
    expect(spans).toEqual([['D', 10], ['ISCUSIÓN', 8], [':', 10], ['PERSPECTIVAS', 8]])
    expect(svg).not.toContain('small-caps')
  })
})

describe('case is each character\'s, in the target\'s case mapping', () => {
  const runsOf = (s: string, to: string) => L2.caseRuns(s, 0.8, L2.upperOf(to)).map(r => [r.s, r.k])

  it('every target the reader offers, one of each script: an alphabet\'s letters, a CJK script\'s Latin words', () => {
    expect([...TARGETS].sort()).toEqual(['bg', 'cs', 'de', 'es', 'fr', 'id', 'it', 'ja', 'ko', 'ms', 'nl', 'pl', 'pt', 'ru', 'sv', 'tr', 'uk', 'zh', 'zh-TW'])
    expect(runsOf('Árbol', 'es')).toEqual([['Á', 1], ['RBOL', 0.8]])
    // (the languages of 2026-10-29: Turkish's i is İ in capitals and its ı is I, Ukrainian's ї Ї)
    expect(runsOf('Łódź', 'pl')).toEqual([['Ł', 1], ['ÓDŹ', 0.8]])
    expect(runsOf('Işık istatistik', 'tr')).toEqual([['I', 1], ['ŞIK', 0.8], [' ', 1], ['İSTATİSTİK', 0.8]])
    expect(runsOf('Їхній', 'uk')).toEqual([['Ї', 1], ['ХНІЙ', 0.8]])
    expect(runsOf('Příloha', 'cs')).toEqual([['P', 1], ['ŘÍLOHA', 0.8]])
    expect(runsOf('Étude', 'fr')).toEqual([['É', 1], ['TUDE', 0.8]])
    expect(runsOf('Ação', 'pt')).toEqual([['A', 1], ['ÇÃO', 0.8]])
    expect(runsOf('Обсуждение', 'ru')).toEqual([['О', 1], ['БСУЖДЕНИЕ', 0.8]])
    // (in a CJK target: its characters no case, its Latin words' letters as any alphabet's)
    const han = String.fromCodePoint(0x8ba8, 0x8bba), kana = String.fromCodePoint(0x30e2, 0x30c7, 0x30eb), hangul = String.fromCodePoint(0xd1a0, 0xb860)
    for (const [to, cjk] of [['zh', han], ['zh-TW', han], ['ja', kana], ['ko', hangul]] as const) {
      const drawn = tokensOf([text(`${cjk}ODEBrain`, true)], to, capsBase, { capsRatio: 0.8 }).filter(t => t.s && /\S/.test(t.s))
      expect(drawn.filter(t => t.cls === 'cjk').every(t => t.sc === undefined)).toBe(true)
      expect(shares(drawn.filter(t => t.cls === 'latin'))).toEqual([['ODEB', 1], ['RAIN', 0.8]])
    }
  })

  it('any cased script (Greek, Armenian, Georgian\'s Mkhedruli); a script with no case, a digit, a mark of punctuation as they are', () => {
    expect(runsOf('Λόγος', 'el')).toEqual([['Λ', 1], ['ΟΓΟΣ', 0.8]])
    expect(runsOf('Բառ', 'hy')).toEqual([['Բ', 1], ['ԱՌ', 0.8]])
    expect(runsOf(String.fromCodePoint(0x10e1, 0x10d8), 'ka')[0]![1]).toBe(0.8)
    // (Arabic, Devanagari, Thai: no case; digits and marks: none)
    for (const s of [String.fromCodePoint(0x0643, 0x062a, 0x0627, 0x0628), String.fromCodePoint(0x0915, 0x093f, 0x0924), String.fromCodePoint(0x0e2b, 0x0e19, 0x0e31), '2026, (1).']) expect(runsOf(s, 'en')).toEqual([[s, 1]])
  })

  it('the target\'s own rules: Turkish dotted and dotless i, German ß as SS, Greek\'s tonos dropped, Lithuanian\'s dot above', () => {
    expect(runsOf('Şiir ılık', 'tr')).toEqual([['Ş', 1], ['İİR', 0.8], [' ', 1], ['ILIK', 0.8]])
    expect(runsOf('Straße', 'de')).toEqual([['S', 1], ['TRASSE', 0.8]])
    expect(runsOf('Καλημέρα', 'el')).toEqual([['Κ', 1], ['ΑΛΗΜΕΡΑ', 0.8]])
    // (i with a combining dot above: one letter, its mark with it, the dot dropped in Lithuanian's capital and kept in the root's)
    expect(runsOf('Ki̇', 'lt')).toEqual([['K', 1], ['I', 0.8]])
    expect(runsOf('Ki̇', 'en')).toEqual([['K', 1], ['İ', 0.8]])
    // (no code, or one no locale takes: the root's mapping, never the device's)
    for (const to of [undefined, '', 'not a tag']) expect(L2.upperOf(to as never)('i')).toBe('I')
  })
})

describe('a unit its class sets in the text\'s capitals (REVTeX\'s \\MakeTextUppercase section titles, 2610.21288)', () => {
  // ("2 RELATED WORK": its capitals at the text's size where the source writes "Related Work")
  const line = () => lineOf([['RELATED', 9.963, times], ['WORK', 9.963, times, 2.5]])
  const source = [text('Related Work')]

  it('is read in capitals, not small capitals, at its size', () => {
    for (const withSource of [true, false]) {
      const { prep, tokens } = read(unitOf(source, ['Trabajos relacionados'], 'heading', withSource), line())
      expect(prep.orig!.size).toBeCloseTo(9.963, 3)
      expect(prep.orig!.st.upper).toBe(true)
      expect(tokens.base.caps).toBe(false)
      expect(prep.capsRatio).toBeUndefined()
    }
  })

  it('its translation in the target\'s capitals at its size, a CJK character as it is, a Latin word inside it in capitals', () => {
    const at = (to: string, tr: string) => shares(read(unitOf(source, [tr], 'heading'), line(), to).drawn)
    expect(at('es', 'Trabajos relacionados')).toEqual([['TRABAJOS', 1], ['RELACIONADOS', 1]])
    expect(at('de', 'Verwandte Größen')).toEqual([['VERWANDTE', 1], ['GRÖSSEN', 1]])
    expect(at('ru', 'Связанные работы')).toEqual([['СВЯЗАННЫЕ', 1], ['РАБОТЫ', 1]])
    const zh = String.fromCodePoint(0x76f8, 0x5173, 0x5de5, 0x4f5c)
    const drawn = read(unitOf(source, [`${zh} Transformer`], 'heading'), line(), 'zh').drawn
    expect(drawn.filter(t => t.cls === 'cjk').map(t => t.s).join('')).toBe(zh)
    expect(drawn.filter(t => t.cls === 'latin').map(t => t.s)).toEqual(['TRANSFORMER'])
    expect(read(unitOf(source, ['x'], 'heading'), line(), 'zh').size).toBeCloseTo(9.963, 3)
  })

  it('a sentence\'s own capitals (an acronym, its first letter) say nothing of it', () => {
    const para = lineOf([['We', 9.963, times], ['use', 9.963, times, 2.5], ['LLMs', 9.963, times, 2.5], ['here.', 9.963, times, 2.5]])
    const { prep, tokens } = read(unitOf([text('We use LLMs here.')], ['Usamos LLMs aquí.']), para)
    expect(prep.orig!.st.upper).toBeUndefined()
    expect(tokens.base.upper).toBeUndefined()
  })
})

describe('inline \\textsc in a paragraph', () => {
  // ("See \textsc{ComplexityWorld}.": 2608.07584's system name, most of a short unit's letters small capitals)
  const line = () => lineOf([['See', 9.963, times], ['C', 9.963, times, 2.5], ['OMPLEXITY', 7.97, times], ['W', 9.963, times], ['ORLD', 7.97, times], ['.', 9.963, times]])
  const source = [text('See '), open('\\textsc{', 1), text('ComplexityWorld'), close(1), text('.')]
  const DRAWN = [['Véase', 1], ['C', 1], ['OMPLEXITY', 0.8], ['W', 1], ['ORLD', 0.8], ['.', 1]]

  it('the paragraph is read at its text\'s size, not its small capitals\'', () => {
    for (const withSource of [true, false]) {
      const { prep } = read(unitOf(source, ['Véase ', 1, 2, 3, '.'], 'para', withSource), line())
      expect(prep.orig!.size).toBeCloseTo(9.963, 3)
    }
  })

  it('the same in the switch\'s spelling, {\\sc …}, cut into a group and the switch (CodeRabbit on #461)', () => {
    const switched = [text('See '), open('{', 1), { t: 'ph', src: '\\sc' }, text(' ComplexityWorld'), close(1), text('.')]
    for (const withSource of [true, false]) {
      const { tokens, drawn } = read(unitOf(switched, ['Véase ', 1, 2, 3, 4, '.'], 'para', withSource), line())
      expect(tokens.base.caps).toBe(false)
      expect(shares(drawn)).toEqual(DRAWN)
    }
  })

  it('its base takes no small capitals, the \\textsc run alone takes them', () => {
    for (const withSource of [true, false]) {
      const { tokens, drawn } = read(unitOf(source, ['Véase ', 1, 2, 3, '.'], 'para', withSource), line())
      expect(tokens.base.caps).toBe(false)
      expect(shares(drawn)).toEqual(DRAWN)
      expect(drawn.map(t => !!t.st.caps)).toEqual([false, true, true, true, true, false])
    }
  })
})

describe('what reads as before', () => {
  it('a real small-caps face (CMCSC10): its lowercase letters drawn as themselves, at its size, small capitals by its name', () => {
    const line = lineOf([['Introduction', 9.963, cmcsc]])
    const { prep, tokens } = read(unitOf([text('Introduction')], ['Introducción'], 'heading'), line)
    expect(prep.orig!.size).toBeCloseTo(9.963, 3)
    expect(tokens.base.caps).toBe(true)
    expect(prep.orig!.st.upper).toBeUndefined()
  })

  it('a \\MakeUppercase in a smaller group (Devin on #461): the front end makes it a placeholder, its capitals no word of the source', () => {
    // ("See {\small\MakeUppercase{important}} results here.": latex-front's pieces as it cuts them, "IMPORTANT" at 9 pt beside 10 pt
    // text, so its letters are a placeholder's rendering, never paired with "important" and never read as small capitals)
    const line = lineOf([['See', 9.963, times], ['IMPORTANT', 8.966, times, 2.5], ['results', 9.963, times, 2.5], ['here.', 9.963, times, 2.5]])
    const source = [text('See '), open('{', 1), { t: 'ph', src: '\\small' }, { t: 'ph', src: '\\MakeUppercase{important}' }, close(1), text(' results here.')]
    for (const withSource of [true, false]) {
      const { prep, tokens } = read(unitOf(source, ['Véase ', 1, 2, 3, 4, ' resultados aquí.'], 'para', withSource), line)
      expect(prep.orig!.size).toBeCloseTo(9.963, 3)
      expect(tokens.base.caps).toBe(false)
      expect(tokens.base.upper).toBeUndefined()
    }
  })

  it('a unit of genuinely mixed sizes ({\\small …} inside a paragraph): the median of all its glyphs, as before', () => {
    // (its small text lowercase as the source writes it: no case changed, nothing set aside)
    const line = lineOf([['Results', 9.963, times], ['are', 9.963, times, 2.5], ['shown', 7.97, times, 2.5], ['in', 7.97, times, 2], ['full', 7.97, times, 2], ['here', 7.97, times, 2]])
    const { prep, tokens } = read(unitOf([text('Results are '), open('{', 1), text('shown in full here'), close(1)], ['Resultados ', 1, 2, 3]), line)
    expect(prep.orig!.size).toBeCloseTo(7.97, 3)
    expect(tokens.base.caps).toBe(false)
  })

  it('a unit whose every letter is a capital the source writes lowercase: no letter to read their size against, read as before', () => {
    const line = lineOf([['INTRODUCTION', 7.97, times]])
    const { prep, tokens } = read(unitOf([text('introduction')], ['introducción'], 'heading'), line)
    expect(prep.orig!.size).toBeCloseTo(7.97, 3)
    expect(tokens.base.caps).toBe(false)
    expect(tokens.base.upper).toBeUndefined()
  })

  it('measuredStyle\'s small capitals as before where no glyph is a faked one: its glyphs\' faces\' names, a tie to none', () => {
    const c = (st: St, sets = 0) => ({ st: st as never, sets, chain: [] as number[] })
    expect(L2.measuredStyle([c(cmcsc), c(times), c(cmcsc)])!.st.caps).toBe(true)
    expect(L2.measuredStyle([c(cmcsc), c(times)])!.st.caps).toBe(false)
    expect(L2.measuredStyle([c(times), c(times), c(cmcsc, 4)])!.st.caps).toBe(false)
  })
})

describe('measuredStyle with faked small capitals', () => {
  it('a faked one tells them; a capital or digit of a face of no small capitals tells nothing beside it; a lowercase letter drawn as itself tells none', () => {
    const f = (small: boolean, lower: boolean) => ({ st: times as never, sets: 0, chain: [] as number[], small, lower })
    // ("ODEBRAIN: a model", its capitals many: its one lowercase word's letters say small capitals)
    expect(L2.measuredStyle([f(false, false), f(false, false), f(false, false), f(true, true)])!.st.caps).toBe(true)
    expect(L2.measuredStyle([f(false, false), f(true, true), f(false, true), f(false, true)])!.st.caps).toBe(false)
  })
})

describe('faces: no browser synthesizes small capitals, a face of real ones draws its own', () => {
  it('Nimbus Roman (no smcp): its runs drawn by the layer, its rule asking none; Libertine\'s smcp its own; Latin Modern\'s caps face its letters', () => {
    withRoles('es', () => {
      const nimbus = roleFace('es', 'times'), lmcaps = roleFace('es', 'cm'), libertine = roleFace('es', 'libertine')
      expect([nimbus.id, lmcaps.id, libertine.id]).toEqual(['nimbus-roman-regular', 'lm-roman-caps', 'libertine-regular'])
      expect([L2.selfCaps(nimbus), L2.selfCaps(lmcaps), L2.selfCaps(libertine)]).toEqual([true, false, false])
      for (const face of [nimbus, lmcaps]) expect(ruleOf(face)).not.toMatch(/small-caps|font-synthesis/)
      expect(ruleOf(libertine)).toContain('font-variant: small-caps')
      expect(ruleOf(libertine)).not.toContain('font-synthesis')
      // (Latin Modern's caps face measured in its own letters: no small capitals asked of the canvas either)
      expect(lmcaps.caps).toBe(false)
      expect(F.fontString(lmcaps, 100)).not.toContain('small-caps')
      expect(F.fontString(libertine, 100)).toContain('small-caps')
    })
  })

  it('a real small-caps face\'s run is one token in its own letters, as before; a bold Times run, whose face has none, the layer\'s', () => {
    withRoles('es', () => {
      // (Libertine's smcp, Latin Modern's caps face, and CMU's bold smcp, which CM's bold small capitals take)
      for (const [design, bold, id] of [['libertine', false, 'libertine-regular'], ['cm', false, 'lm-roman-caps'], ['cm', true, 'cmun-serif-bold']] as const) {
        const drawn = tokensOf([text('Discusión', true)], 'es', { caps: true, bold, design }).filter(t => t.s && /\S/.test(t.s))
        expect(drawn[0]!.face.id).toBe(id)
        expect(shares(drawn)).toEqual([['Discusión', 1]])
      }
      const bold = tokensOf([text('Discusión', true)], 'es', { caps: true, bold: true, design: 'times' }).filter(t => t.s && /\S/.test(t.s))
      expect(bold[0]!.face.id).toBe('nimbus-roman-bold')
      expect(shares(bold)).toEqual([['D', 1], ['ISCUSIÓN', 0.8]])
    })
  })

  it('a babel name in a face of real small capitals the target\'s face has none of: its runs drawn by the layer, each at its own place', () => {
    withRoles('es', () => {
      const drawn = L2.nameRuns('Tabla', roleFace('es', 'times'), 'es')
      expect(drawn.runs.map(r => [r.s, r.k])).toEqual([['T', 1], ['ABLA', 0.8]])
      expect(drawn.text).toBe('TABLA')
      expect(drawn.face.caps).toBe(false)
      const svg = L2.svgOfName({ occurrence: 1, text: 'Tabla', x: 10, baseline: 0, size: 10, face: drawn.face, runs: drawn.runs } as never, (x: number, y: number) => [x, y], 1)
      // (the fake canvas: 50 at 100 px a character; "T" 5 wide at size 10, so ABLA from 15, at 8)
      expect([...svg.matchAll(/x="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)</g)].map(m => [m[3], Number(m[1]), Number(m[2])])).toEqual([['T', 10, 10], ['ABLA', 15, 8]])
      expect(L2.runsWidth(drawn)).toBeCloseTo(0.5 + 4 * 0.5 * 0.8, 9)
      // (a name in no small capitals: one <tspan>, as before)
      const plain = L2.nameRuns('Tabla', roleFace('es', 'times', { caps: false }), 'es')
      expect(plain.runs).toEqual([{ s: 'Tabla', k: 1 }])
    })
  })
})
