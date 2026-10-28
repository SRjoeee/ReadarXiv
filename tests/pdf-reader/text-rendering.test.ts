// How the layer's SVG text is rendered (engine/view/text-rendering.mjs, docs/PDF-READER.md §11.8): `auto` where the browser
// lays the layer's own words out alike under geometricPrecision and under `auto`, else geometricPrecision. The decision on two
// layouts of the same words; the words a laid page offers (its runs of one place); the probe over a document that lays them
// out (a fake one: the places each rendering gives); the decision made once a document and written on <html>; and the sheet
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADVANCE_TOLERANCE, ATTRIBUTE, applyLayerText, decideLayerText, MIN_EVIDENCE, PROBE_RUNS, type ProbeWord, probeWords, wordsOf } from '@/pdf-reader/engine/view/text-rendering.mjs'

/** a word's starts from its advances */
const startsOf = (advances: number[]) => { const xs = [0]; for (const a of advances) xs.push(xs.at(-1)! + a); return xs }
/** a serif word's advances at 12.5 units (10 CSS px): fractional, as a canvas measures them */
const word = (n: number, seed = 0) => Array.from({ length: n }, (_, i) => 5.2 + (((i + seed) * 37) % 11) * 0.37)
/** words enough to decide on: four of twelve letters */
const WORDS = [0, 1, 2, 3].map(s => word(12, s))
const laid = (words: number[][], f: (a: number) => number = a => a) => words.map(w => startsOf(w.map(f)))

describe('decideLayerText: the decision on two layouts of the same words', () => {
  it('is auto where they are laid out alike, and with macOS\'s differences: a 64th of a pixel at two sizes', () => {
    expect(decideLayerText(laid(WORDS), laid(WORDS))).toBe('auto')
    let k = 0
    expect(decideLayerText(laid(WORDS), laid(WORDS, a => a + (k++ % 2 ? 1 : -1) / 64))).toBe('auto')
    // (a drift along a word, no glyph's own advance moved by more than the tolerance: the ends of long words, 0.17 px off)
    expect(decideLayerText(laid(WORDS), laid(WORDS, a => a + 0.01))).toBe('auto')
  })

  it('is precise where auto lays a word out on whole pixels (Linux), or one glyph\'s advance moves past the tolerance', () => {
    // (whole pixels at 10 CSS px: 0.8 CSS px a unit, each advance rounded to a whole CSS px)
    expect(decideLayerText(laid(WORDS), laid(WORDS, a => Math.round(a * 0.8) / 0.8))).toBe('precise')
    const one = WORDS.map(w => [...w])
    one[2]![5] = one[2]![5]! + (ADVANCE_TOLERANCE * 1.5) / 0.8
    expect(decideLayerText(laid(WORDS), laid(one))).toBe('precise')
    // (a word laid out to another number of characters is another layout)
    expect(decideLayerText(laid(WORDS), [...laid(WORDS).slice(0, 3), startsOf(word(11, 3))])).toBe('precise')
  })

  it('tells nothing from too little: few advances, every one whole (a monospaced face at its size), no words', () => {
    const short = [word(4)]
    expect(decideLayerText(laid(short), laid(short))).toBeNull()
    const mono = [0, 1, 2, 3].map(() => Array.from({ length: 12 }, () => 7.5))
    expect(decideLayerText(laid(mono), laid(mono))).toBeNull()
    expect(decideLayerText([], [])).toBeNull()
    // (but a whole-pixel difference is a difference, whatever the evidence)
    expect(decideLayerText(laid(short), laid(short, a => Math.round(a * 0.8) / 0.8))).toBe('precise')
    expect(MIN_EVIDENCE).toBeGreaterThan(4)
  })

  it('reads the tolerance in CSS px (the probe\'s units are 0.8 CSS px), and takes nothing it cannot read', () => {
    const off = WORDS.map(w => [...w])
    off[0]![3] = off[0]![3]! + 0.06
    // (0.06 units: 0.048 CSS px at 0.8 a unit, over the tolerance at 1)
    expect(decideLayerText(laid(WORDS), laid(off), 0.8)).toBe('auto')
    expect(decideLayerText(laid(WORDS), laid(off), 1)).toBe('precise')
    const nan = laid(WORDS)
    nan[1]![4] = Number.NaN
    expect(decideLayerText(laid(WORDS), nan)).toBeNull()
    expect(decideLayerText(null, laid(WORDS))).toBeNull()
    expect(decideLayerText(laid(WORDS), laid(WORDS).slice(1))).toBeNull()
    expect(decideLayerText(laid(WORDS), laid(WORDS), 0)).toBeNull()
  })
})

/** a laid page's SVG of tspans ({ x, text, size, opacity }) and a window that styles each in one face */
function pageOf(spans: { x: string; text: string; size?: string; spacing?: string; opacity?: string }[]) {
  const tspans = spans.map(s => ({
    textContent: s.text,
    getAttribute: (k: string) => ({ x: s.x, 'font-size': s.size ?? '12.5', 'letter-spacing': s.spacing ?? null, 'fill-opacity': s.opacity ?? null } as Record<string, string | null>)[k] ?? null,
  }))
  const svg = { querySelectorAll: (q: string) => (q === 'tspan' ? tspans : []) }
  const view = { getComputedStyle: () => ({ fontFamily: '"axt-cmun-serif", "axt-lm-math"', fontWeight: '400', fontStyle: 'normal' }) }
  return { svg: svg as unknown as SVGSVGElement, view: view as unknown as Window }
}

describe('wordsOf: the words a laid page offers, its runs of one place', () => {
  it('takes a word of one x and two characters or more, in its own face, size and tracking', () => {
    const { svg, view } = pageOf([{ x: '10.5', text: 'Transformer ', size: '11.2', spacing: '0.12' }])
    expect(wordsOf(svg, view)).toEqual([{ text: 'Transformer ', family: '"axt-cmun-serif", "axt-lm-math"', weight: '400', style: 'normal', size: '11.2', spacing: '0.12' }])
  })

  it('leaves out a CJK run (an x a character, which no rendering moves), a single character, a formula\'s invisible text', () => {
    const { svg, view } = pageOf([
      { x: '10 22.5 35', text: '中文字' }, { x: '50', text: 'a' }, { x: '60', text: 'x^2 + y^2', opacity: '0' }, { x: '70', text: 'Boyce' },
    ])
    expect(wordsOf(svg, view).map(w => w.text)).toEqual(['Boyce'])
  })

  it('takes PROBE_RUNS words at most, and none from no page', () => {
    const { svg, view } = pageOf(Array.from({ length: PROBE_RUNS + 10 }, (_, i) => ({ x: String(i * 40), text: `word${i}` })))
    expect(wordsOf(svg, view)).toHaveLength(PROBE_RUNS)
    expect(wordsOf(null, view)).toEqual([])
  })
})

/** a document that lays SVG text out by `layout` (each rendering's places for a word, or null to throw); `state` counts */
function fakeDocument(layout: ((rendering: string, text: string) => number[] | null) | 'none') {
  const attributes = new Map<string, string>()
  const state = { probes: 0, removed: 0 }
  type Element = Record<string, unknown> & { attrs: Record<string, string>; children: unknown[]; style: Record<string, string>; textContent: string }
  const element = (name: string) => {
    const el: Element = {
      name, attrs: {}, style: { cssText: '' }, children: [], textContent: '',
      setAttribute(k: string, v: string) { el.attrs[k] = v },
      append(c: unknown) { el.children.push(c) },
      remove() { state.removed++ },
    }
    if (name === 'text' && layout !== 'none') {
      el.getNumberOfChars = () => el.textContent.length
      el.getStartPositionOfChar = (i: number) => {
        const rendering = /text-rendering:([^;]+)/.exec(el.style.cssText ?? '')?.[1] ?? ''
        const xs = layout(rendering, el.textContent)
        if (!xs) throw new Error('no layout')
        return { x: xs[i], y: 0 }
      }
    }
    return el
  }
  const doc = {
    body: { append() { state.probes++ } },
    documentElement: { setAttribute: (k: string, v: string) => attributes.set(k, v) },
    createElementNS: (_ns: string, name: string) => element(name),
  }
  return { doc: doc as unknown as Document, attributes, state }
}
const linear = (_: string, text: string) => startsOf([...text].map((_c, i) => word(text.length)[i]!))
const rounded = (rendering: string, text: string) => startsOf([...text].map((_c, i) => (rendering === 'auto' ? Math.round(word(text.length)[i]! * 0.8) / 0.8 : word(text.length)[i]!)))
const someWords: ProbeWord[] = ['Homogenisierungsproblems', 'Transformer', 'quasinormal', 'Tutwiler'].map(text => ({ text, family: 'axt-cmun-serif', weight: '400', style: 'normal', size: '12.5', spacing: null }))

describe('probeWords: the words laid out again under both renderings, off the view, in their own faces', () => {
  it('is auto where both lay them out alike (macOS), precise where auto rounds their advances (Linux)', () => {
    expect(probeWords(fakeDocument(linear).doc, someWords)).toBe('auto')
    expect(probeWords(fakeDocument(rounded).doc, someWords)).toBe('precise')
  })

  it('lays the words out in their own faces, and takes its SVG out again', () => {
    const seen: string[] = []
    const f = fakeDocument((rendering, text) => { seen.push(`${rendering}|${text}`); return linear(rendering, text) })
    probeWords(f.doc, someWords)
    expect(new Set(seen)).toEqual(new Set(someWords.flatMap(w => [`geometricPrecision|${w.text}`, `auto|${w.text}`])))
    expect(f.state.probes).toBe(1)
    expect(f.state.removed).toBe(1)
  })

  it('tells nothing where there are no words, the document lays no SVG text out, or its layout throws', () => {
    expect(probeWords(fakeDocument(linear).doc, [])).toBeNull()
    expect(probeWords(fakeDocument('none').doc, someWords)).toBeNull()
    const f = fakeDocument(() => null)
    expect(probeWords(f.doc, someWords)).toBeNull()
    expect(f.state.removed).toBe(1)
    expect(probeWords(null, someWords)).toBeNull()
  })
})

describe('applyLayerText: decided once a document, from the first laid page that tells, written on <html>', () => {
  const page = pageOf(['Homogenisierungsproblems', 'Transformer', 'quasinormal', 'Tutwiler'].map((text, i) => ({ x: String(i * 100), text })))
  const svgIn = (doc: Document) => Object.assign(Object.create(page.svg as object), { ownerDocument: { ...doc, defaultView: page.view } }) as unknown as SVGSVGElement

  it('writes data-axt-layer-text="auto" where the words say auto, nothing where they say precise', () => {
    const mac = fakeDocument(linear)
    expect(applyLayerText(svgIn(mac.doc), mac.doc)).toBe('auto')
    expect(mac.attributes.get(ATTRIBUTE)).toBe('auto')
    const linux = fakeDocument(rounded)
    expect(applyLayerText(svgIn(linux.doc), linux.doc)).toBe('precise')
    expect(linux.attributes.has(ATTRIBUTE)).toBe(false)
  })

  it('decides once: a later page reads the first answer, and lays nothing out again', () => {
    const f = fakeDocument(linear)
    applyLayerText(svgIn(f.doc), f.doc)
    applyLayerText(svgIn(f.doc), f.doc)
    expect(f.state.probes).toBe(1)
  })

  it('leaves a page that tells nothing (no words of one place) undecided, for the next page to tell', () => {
    const f = fakeDocument(linear)
    const cjk = pageOf([{ x: '10 22.5', text: '中文' }])
    const cjkSvg = Object.assign(Object.create(cjk.svg as object), { ownerDocument: { ...f.doc, defaultView: cjk.view } }) as unknown as SVGSVGElement
    expect(applyLayerText(cjkSvg, f.doc)).toBeNull()
    expect(f.attributes.has(ATTRIBUTE)).toBe(false)
    expect(applyLayerText(svgIn(f.doc), f.doc)).toBe('auto')
    expect(f.attributes.get(ATTRIBUTE)).toBe('auto')
  })
})

describe('the sheet (engine.css): the layer\'s SVG text in the browser\'s smoothing, geometricPrecision unless a page said auto', () => {
  const SHEET = readFileSync(join(process.cwd(), 'src/pdf-reader/engine/view/engine.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = (selector: string) => {
    const at = SHEET.indexOf(`${selector} {`)
    return at < 0 ? null : SHEET.slice(at, SHEET.indexOf('}', at) + 1)
  }
  it('sets the smoothing and geometricPrecision on every layer, and auto under the decision\'s attribute', () => {
    expect(rule('.axt-layer > svg')).toMatch(/text-rendering: geometricPrecision;/)
    expect(rule('.axt-layer > svg')).toMatch(/-webkit-font-smoothing: auto;/)
    expect(rule(`html[${ATTRIBUTE}="auto"] .axt-layer > svg`)).toMatch(/text-rendering: auto;/)
  })
})
