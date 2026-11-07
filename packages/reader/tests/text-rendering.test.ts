// How the overlay's SVG text is rendered (compose/text-rendering.ts, docs/PDF-READER.md §11.8): `auto` where the browser lays
// the overlay's own words out alike under geometricPrecision and under `auto`, else geometricPrecision. The decision on two
// layouts of the same words; the words a laid page offers (its runs of one place); the probe over a document that lays them
// out (a fake one: the places each rendering gives); the decision written on the reader's root; and the sheet.
import { describe, expect, it } from 'vitest'
import type { Item, Page } from '../src/compose/page.ts'
import {
  ADVANCE_TOLERANCE,
  ATTRIBUTE,
  decideLayerText,
  decideOn,
  MIN_EVIDENCE,
  PROBE_RUNS,
  type ProbeWord,
  probeWords,
  wordsOf,
} from '../src/compose/text-rendering.ts'
import { READER_CSS } from '../src/styles.ts'

/** a word's starts from its advances */
const startsOf = (advances: number[]) => {
  const xs = [0]
  for (const a of advances) xs.push((xs.at(-1) as number) + a)
  return xs
}
/** a serif word's advances at 10 PDF units: fractional, as a canvas measures them */
const word = (n: number, seed = 0) => Array.from({ length: n }, (_, i) => 3.9 + (((i + seed) * 37) % 11) * 0.28)
/** words enough to decide on: four of twelve letters */
const WORDS = [0, 1, 2, 3].map((s) => word(12, s))
const laid = (words: number[][], f: (a: number) => number = (a) => a) => words.map((w) => startsOf(w.map(f)))
/** CSS px a PDF unit at 100 % */
const U = 4 / 3
/** three Han characters (a CJK run's text) */
const HAN = String.fromCodePoint(0x4e2d, 0x6587, 0x5b57)

describe('decideLayerText: the decision on two layouts of the same words', () => {
  it("is auto where they are laid out alike, and with macOS's differences: a 64th of a pixel at two sizes", () => {
    expect(decideLayerText(laid(WORDS), laid(WORDS))).toBe('auto')
    let k = 0
    expect(
      decideLayerText(
        laid(WORDS),
        laid(WORDS, (a) => a + (k++ % 2 ? 1 : -1) / 64 / U),
      ),
    ).toBe('auto')
  })

  it("is precise where auto lays a word out on whole pixels (Linux), or one glyph's advance moves past the tolerance", () => {
    expect(
      decideLayerText(
        laid(WORDS),
        laid(WORDS, (a) => Math.round(a * U) / U),
      ),
    ).toBe('precise')
    const one = WORDS.map((w) => [...w])
    ;(one[2] as number[])[5] = ((one[2] as number[])[5] as number) + (ADVANCE_TOLERANCE * 1.5) / U
    expect(decideLayerText(laid(WORDS), laid(one))).toBe('precise')
    // (a word laid out to another number of characters is another layout)
    expect(decideLayerText(laid(WORDS), [...laid(WORDS).slice(0, 3), startsOf(word(11, 3))])).toBe('precise')
  })

  it('tells nothing from too little: few advances, every one whole (a monospaced face at its size), no words', () => {
    const short = [word(4)]
    expect(decideLayerText(laid(short), laid(short))).toBeNull()
    const mono = [0, 1, 2, 3].map(() => Array.from({ length: 12 }, () => 6 / U))
    expect(decideLayerText(laid(mono), laid(mono))).toBeNull()
    expect(decideLayerText([], [])).toBeNull()
    // (but a whole-pixel difference is a difference, whatever the evidence)
    expect(
      decideLayerText(
        laid(short),
        laid(short, (a) => Math.round(a * U) / U),
      ),
    ).toBe('precise')
    expect(MIN_EVIDENCE).toBeGreaterThan(4)
  })

  it('takes nothing it cannot read', () => {
    const nan = laid(WORDS)
    ;(nan[1] as number[])[4] = Number.NaN
    expect(decideLayerText(laid(WORDS), nan)).toBeNull()
    expect(decideLayerText(null, laid(WORDS))).toBeNull()
    expect(decideLayerText(laid(WORDS), laid(WORDS).slice(1))).toBeNull()
    expect(decideLayerText(laid(WORDS), laid(WORDS), 0)).toBeNull()
  })
})

/** a laid page of one member whose one line holds `items`; a faces' class a face */
const pageOf = (items: Item[], state: 'laid' | 'waiting' = 'laid'): Page => ({
  page: 1,
  wait: { rows: [], faces: [] },
  members: [{ ord: 0, page: 1, state, off: 1, lines: [[700, 72, 540, items]], lit: { left: [], right: [], own: [] } }],
  links: [],
})
const faces = { classOf: (id: string) => `c-${id.length}` }
const run = (s: string, o: Partial<Extract<Item, { face: string }>> = {}): Item => ({
  s,
  x: 72,
  face: '400 100px "axt-nimbus-roman"',
  size: 10,
  ...o,
})

describe('wordsOf: the words a laid page offers, its runs of one place', () => {
  it('takes a run of one x and two characters or more, in its class and size', () => {
    expect(wordsOf(pageOf([run('Transformer ', { size: 9.96 })]), faces)).toEqual([
      { text: 'Transformer ', cls: faces.classOf('400 100px "axt-nimbus-roman"'), size: 9.96 },
    ])
  })

  it('leaves out a CJK run (an x a character, which no rendering moves), a single character, a crop, a member not laid', () => {
    const items: Item[] = [
      run(HAN, { dx: [0, 10, 20] }),
      run('a'),
      { s: 'x^2', x: 90, src: [1, 90, 690, 100, 710, 700], k: 1, piece: '3' },
      run('Boyce'),
    ]
    expect(wordsOf(pageOf(items), faces).map((w) => w.text)).toEqual(['Boyce'])
    expect(wordsOf(pageOf([run('Boyce')], 'waiting'), faces)).toEqual([])
  })

  it('takes PROBE_RUNS words at most', () => {
    const many = Array.from({ length: PROBE_RUNS + 10 }, (_, i) => run(`word${i}`))
    expect(wordsOf(pageOf(many), faces)).toHaveLength(PROBE_RUNS)
  })
})

/** a host whose document lays SVG text out by `layout` (each rendering's places for a text, or null to throw); its attributes
 *  and what was put in it */
function fakeHost(layout: ((rendering: string, text: string, cls: string) => number[] | null) | 'none') {
  const attributes = new Map<string, string>()
  const state = { probes: 0, removed: 0, seen: [] as string[] }
  type El = Record<string, unknown> & {
    attrs: Record<string, string>
    style: { cssText: string }
    textContent: string
  }
  const element = (name: string) => {
    const el: El = {
      attrs: {},
      style: { cssText: '' },
      textContent: '',
      setAttribute(k: string, v: string) {
        el.attrs[k] = v
      },
      append() {},
      remove() {
        state.removed++
      },
    }
    if (name === 'text' && layout !== 'none') {
      el.getNumberOfChars = () => el.textContent.length
      el.getStartPositionOfChar = (i: number) => {
        const rendering = /text-rendering:([^;]+)/.exec(el.style.cssText)?.[1] ?? ''
        state.seen.push(`${rendering}|${el.textContent}|${el.attrs.class}`)
        const xs = layout(rendering, el.textContent, el.attrs.class ?? '')
        if (!xs) throw new Error('no layout')
        return { x: xs[i], y: 0 }
      }
    }
    return el
  }
  const host = {
    ownerDocument: { createElementNS: (_ns: string, name: string) => element(name) },
    append() {
      state.probes++
    },
    setAttribute: (k: string, v: string) => attributes.set(k, v),
    removeAttribute: (k: string) => attributes.delete(k),
  }
  return { host: host as unknown as HTMLElement, attributes, state }
}
const linear = (_: string, text: string) => startsOf([...text].map((_c, i) => word(text.length)[i] as number))
const rounded = (rendering: string, text: string) =>
  startsOf(
    [...text].map((_c, i) =>
      rendering === 'auto' ? Math.round((word(text.length)[i] as number) * U) / U : (word(text.length)[i] as number),
    ),
  )
const someWords: ProbeWord[] = ['Homogenisierungsproblems', 'Transformer', 'quasinormal', 'Tutwiler'].map((text) => ({
  text,
  cls: 'axt-sf-1',
  size: 10,
}))

describe('probeWords: the words laid out again under both renderings, off the view, in their own classes', () => {
  it('is auto where both lay them out alike (macOS), precise where auto rounds their advances (Linux)', () => {
    expect(probeWords(fakeHost(linear).host, someWords)).toBe('auto')
    expect(probeWords(fakeHost(rounded).host, someWords)).toBe('precise')
  })

  it('lays the words out in their own classes, and takes its SVG out again', () => {
    const f = fakeHost(linear)
    probeWords(f.host, someWords)
    expect(new Set(f.state.seen)).toEqual(
      new Set(someWords.flatMap((w) => [`geometricPrecision|${w.text}|axt-sf-1`, `auto|${w.text}|axt-sf-1`])),
    )
    expect(f.state.probes).toBe(1)
    expect(f.state.removed).toBe(1)
  })

  it('tells nothing where there are no words, the document lays no SVG text out, or its layout throws', () => {
    expect(probeWords(fakeHost(linear).host, [])).toBeNull()
    expect(probeWords(fakeHost('none').host, someWords)).toBeNull()
    const f = fakeHost(() => null)
    expect(probeWords(f.host, someWords)).toBeNull()
    expect(f.state.removed).toBe(1)
  })
})

describe("decideOn: a laid page's words decide, written on the reader's root", () => {
  const page = pageOf(['Homogenisierungsproblems ', 'Transformer ', 'quasinormal ', 'Tutwiler'].map((s) => run(s)))
  it('writes data-axt-layer-text="auto" where the words say auto, takes it away where they say precise', () => {
    const mac = fakeHost(linear)
    expect(decideOn(mac.host, page, faces)).toBe('auto')
    expect(mac.attributes.get(ATTRIBUTE)).toBe('auto')
    const linux = fakeHost(rounded)
    linux.attributes.set(ATTRIBUTE, 'auto')
    expect(decideOn(linux.host, page, faces)).toBe('precise')
    expect(linux.attributes.has(ATTRIBUTE)).toBe(false)
  })

  it('leaves a page that tells nothing (no runs of one place, a layout that throws) undecided, the root untouched', () => {
    const f = fakeHost(linear)
    expect(decideOn(f.host, pageOf([run(HAN.slice(0, 2), { dx: [0, 10] })]), faces)).toBeNull()
    expect(f.state.probes).toBe(0)
    const broken = fakeHost(() => null)
    expect(decideOn(broken.host, page, faces)).toBeNull()
    expect(f.attributes.size + broken.attributes.size).toBe(0)
  })
})

describe("the sheet: the overlay's text in the browser's smoothing and the layer's ink, geometricPrecision unless a page said auto", () => {
  const sheet = READER_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = (selector: string) => {
    const at = sheet.indexOf(`${selector} {`)
    return at < 0 ? null : sheet.slice(at, sheet.indexOf('}', at) + 1)
  }
  it('sets the smoothing and geometricPrecision on every overlay, auto under the decision, #141414 where a run names no fill', () => {
    expect(rule('.axt-reader .axt-over > svg')).toMatch(/text-rendering: geometricPrecision;/)
    expect(rule('.axt-reader .axt-over > svg')).toMatch(/-webkit-font-smoothing: auto;/)
    expect(rule(`.axt-reader[${ATTRIBUTE}="auto"] .axt-over > svg`)).toMatch(/text-rendering: auto;/)
    expect(rule('.axt-reader .axt-over > svg text')).toMatch(/fill: #141414;/)
  })
})
