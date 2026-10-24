import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'
import { plainSource } from '@/pdf-reader/engine/translate/mt.mjs'

// Small capitals as the original sets them (2602.23285v2's appendix headings, 2026-10-24). A face of the Times family has no small
// capitals of its own: NFSS sets \scshape in a virtual face (ptmrc8t) that draws each lowercase letter as a capital of the upright
// face at 0.8 of the size, in the same PDF font as the capitals, so no font name says small capitals and the class's \sc is in
// no piece of the unit's source. The unit's size is its capitals' (TeX's nominal size), not the median its small capitals make,
// and it is set in small capitals; a real small-caps face and a unit of mixed sizes read as before

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
/** the unit read as the reader's layer reads it, on a layout file of its one line, and its tokens in `to` */
const read = (u: never, line: ReturnType<typeof lineOf>, to = 'es') => {
  const lu = {
    lines: Float64Array.from([1, line.rect[1]!, line.rect[3]!, 100, 108, 98, 10, 0]), frames: Float64Array.from([1, 0, 0, 1, -1, 0]), erase: [new Float64Array(0)], labels: new Float64Array(0), ph: new Map(),
  } as never
  const t = T.texRects(lu)
  const kOf = (u as unknown as { pieces: { k?: number }[] }).pieces.map(p => p.k ?? -1)
  const parts = T.texParts(lu, kOf, { lines: t })
  const prep = L2.prepareUnit(u, t.rects as never, [line.page as never], new Map() as never, null, parts as never) as unknown as { orig: { size: number; st: St } | null; measured: { st: { caps: boolean } | null } | null }
  const base = prep.orig ? { ...prep.orig.st } : BASE
  const tokens = L2.tokensOf2(u, prep as never, to, base as never, DESIGNS as never, P(to) as never, null, () => 0) as unknown as { s?: string; st: { caps?: boolean }; face: { caps?: boolean } }[] & { base: { caps: boolean } }
  // (the size the run lays the unit at: unitSizeOf's, the original's where an engine has none)
  const size = typeof L2.unitSizeOf === 'function' ? L2.unitSizeOf(prep as never, P(to) as never) : prep.orig?.size
  return { prep, tokens, drawn: tokens.filter(x => typeof x.s === 'string' && /\S/.test(x.s)), size }
}
/** the CSS rule of the class a face's run is drawn in (layer2.mjs faceClass, by way of svgOfName) */
const ruleOf = (face: unknown) => {
  const svg = L2.svgOfName({ occurrence: 1, text: 'Discusión', x: 0, baseline: 0, size: 10, face: face as never }, (x: number, y: number) => [x, y], 1)
  const cls = /class="(axf[0-9a-z-]+)"/.exec(svg)![1]
  const rules = [...document.head.querySelectorAll('style')].flatMap(e => [...(e.sheet?.cssRules ?? [])] as CSSStyleRule[])
  return rules.find(r => r.selectorText === `.${cls}`)?.cssText ?? ''
}

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

  it('in a CJK target: no case, at the nominal size × CJK_CAPS_SIZE (the owner\'s one value)', () => {
    // (the heading in Chinese, its characters by code point)
    const zh = String.fromCodePoint(0x8ba8, 0x8bba, 0xff1a, 0x5173, 0x952e, 0x89c1, 0x89e3)
    const { size, drawn } = read(unitOf(HEADING, [zh], 'heading'), heading(), 'zh')
    expect(L2.CJK_CAPS_SIZE).toBe(1)
    expect(size).toBeCloseTo(9.963 * L2.CJK_CAPS_SIZE, 3)
    // (a CJK run takes no small capitals: its face has none to draw)
    F.setRoleFaces('zh', 'times', resolveRules(BUILTIN_RULES, 'zh').cjkFaces)
    try {
      const face = F.faceOf({ fam: 'serif', bold: false, italic: false, caps: true, design: 'times' } as never, 'cjk', 'zh')
      expect(face.caps).toBe(false)
      expect(drawn.length).toBeGreaterThan(0)
    } finally { F.setRoleFaces(null as never, null as never, null) }
  })

  it('a section heading at 12 pt ("A EXPERIMENTAL SETTINGS"): its capitals 11.955, its small capitals 9.564', () => {
    const line = lineOf([['E', 11.955, times], ['XPERIMENTAL', 9.564, times], ['S', 11.955, times, 3], ['ETTINGS', 9.564, times]])
    const { prep, tokens } = read(unitOf([text('Experimental Settings')], ['Entornos experimentales'], 'heading'), line)
    expect(prep.orig!.size).toBeCloseTo(11.955, 3)
    expect(tokens.base.caps).toBe(true)
  })
})

describe('inline \\textsc in a paragraph', () => {
  // ("See \textsc{ComplexityWorld}.": 2608.07584's system name, most of a short unit's letters small capitals)
  const line = () => lineOf([['See', 9.963, times], ['C', 9.963, times, 2.5], ['OMPLEXITY', 7.97, times], ['W', 9.963, times], ['ORLD', 7.97, times], ['.', 9.963, times]])
  const source = [text('See '), open('\\textsc{', 1), text('ComplexityWorld'), close(1), text('.')]

  it('the paragraph is read at its text\'s size, not its small capitals\'', () => {
    for (const withSource of [true, false]) {
      const { prep } = read(unitOf(source, ['Véase ', 1, 2, 3, '.'], 'para', withSource), line())
      expect(prep.orig!.size).toBeCloseTo(9.963, 3)
    }
  })

  it('its base takes no small capitals, the \\textsc run alone takes them', () => {
    for (const withSource of [true, false]) {
      const { tokens, drawn } = read(unitOf(source, ['Véase ', 1, 2, 3, '.'], 'para', withSource), line())
      expect(tokens.base.caps).toBe(false)
      expect(drawn.map(t => [t.s, !!t.st.caps])).toEqual([['Véase', false], ['ComplexityWorld', true], ['.', false]])
    }
  })
})

describe('what reads as before', () => {
  it('a real small-caps face (CMCSC10): its lowercase letters drawn as themselves, at its size, small capitals by its name', () => {
    const line = lineOf([['Introduction', 9.963, cmcsc]])
    const { prep, tokens } = read(unitOf([text('Introduction')], ['Introducción'], 'heading'), line)
    expect(prep.orig!.size).toBeCloseTo(9.963, 3)
    expect(tokens.base.caps).toBe(true)
  })

  it('a case change at the capitals\' size (\\MakeUppercase): no small capitals, its size its own', () => {
    const line = lineOf([['INTRODUCTION', 9.963, times]])
    const { prep, tokens } = read(unitOf([text('Introduction')], ['Introducción'], 'heading'), line)
    expect(prep.orig!.size).toBeCloseTo(9.963, 3)
    expect(tokens.base.caps).toBe(false)
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

describe('small capitals drawn as they are measured', () => {
  // (the canvas measures a run's small capitals synthesized where its face has none of its own, fontString's 'small-caps'; the
  // layer's SVG sets font-synthesis none, so a face with neither smcp nor caps letters drew its lowercase letters as themselves)
  it('a face with no small capitals of its own synthesizes them; one with its own (smcp, or caps letters) draws those', () => {
    F.setRoleFaces('es', 'times', null)
    try {
      const of = (design: string, caps = true) => F.faceOf({ fam: 'serif', bold: false, italic: false, caps, design } as never, 'latin', 'es')
      const nimbus = of('times'), lmcaps = of('cm'), libertine = of('libertine')
      expect([nimbus.id, lmcaps.id, libertine.id]).toEqual(['nimbus-roman-regular', 'lm-roman-caps', 'libertine-regular'])
      // (Nimbus Roman, no smcp: synthesized, as the canvas measured it; Latin Modern's caps face and Libertine's smcp: their own)
      expect(ruleOf(nimbus)).toContain('font-variant: small-caps')
      expect(ruleOf(nimbus)).toContain('font-synthesis-small-caps: auto')
      for (const own of [lmcaps, libertine]) {
        expect(ruleOf(own)).toContain('font-variant: small-caps')
        expect(ruleOf(own)).not.toContain('font-synthesis')
      }
      expect(ruleOf(of('times', false))).not.toContain('small-caps')
    } finally { F.setRoleFaces(null as never, null as never, null) }
  })
})
