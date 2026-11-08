// How the overlay's SVG text is rendered (compose/text-rendering.ts, docs/PDF-READER.md §11.8): `auto` where the browser lays
// a served face's words out alike under geometricPrecision and under `auto`, else geometricPrecision. The decision on two
// layouts of the same words; the probe over a document that lays them out (a fake one: the places each rendering gives); the
// decision made once a reader from a fixed probe in the faces' probe face, written on the reader's root; and the sheet.
import { describe, expect, it } from 'vitest'
import type { Faces } from '../src/compose/faces.ts'
import {
  ADVANCE_TOLERANCE,
  ATTRIBUTE,
  decideLayerText,
  decideOnce,
  MIN_EVIDENCE,
  PROBE_SIZES,
  PROBE_TEXT,
  type ProbeWord,
  probeWords,
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

/** faces whose probe face is `face` once its load ends (`gate`), and what they were asked */
function probeFaces(face: string | null, gate: Promise<void> = Promise.resolve()) {
  const asked: string[] = []
  const faces: Pick<Faces, 'classOf' | 'probeFace'> = {
    classOf: (id) => `c-${id.length}`,
    probeFace: async (text) => {
      asked.push(text)
      await gate
      return face
    },
  }
  return { faces, asked }
}

describe("decideOnce: decided once a reader from a fixed probe in a served face, never from a page's own words", () => {
  it('lays the fixed probe out in the probe face, loaded for it, at its sizes, and writes auto where it says auto', async () => {
    const mac = fakeHost(linear)
    const f = probeFaces('400 100px "axt-cmun-serif"')
    expect(await decideOnce(mac.host, f.faces)).toBe('auto')
    expect(f.asked).toEqual([PROBE_TEXT])
    expect(mac.attributes.get(ATTRIBUTE)).toBe('auto')
    // (its words the probe's alone, whatever a page holds: the probe text at each size, in the face's class)
    const cls = f.faces.classOf('400 100px "axt-cmun-serif"')
    expect(new Set(mac.state.seen)).toEqual(
      new Set(['geometricPrecision', 'auto'].map((r) => `${r}|${PROBE_TEXT}|${cls}`)),
    )
    expect(mac.state.seen.filter((x) => x.startsWith('auto|')).length).toBe(PROBE_SIZES.length * [...PROBE_TEXT].length)
  })

  it('tells evidence enough on its own: a page of few Latin words (2610.40645v1 p1 in Japanese) no longer decides', () => {
    // (the probe's advances, fractional under geometricPrecision, at least MIN_EVIDENCE: it never waits for a page that tells)
    const words: ProbeWord[] = PROBE_SIZES.map((size) => ({ text: PROBE_TEXT, cls: 'c', size }))
    expect(probeWords(fakeHost(linear).host, words)).toBe('auto')
    expect(PROBE_SIZES.length * ([...PROBE_TEXT].length - 1)).toBeGreaterThanOrEqual(MIN_EVIDENCE)
  })

  it('keeps geometricPrecision where auto rounds the advances (Linux), and where no served face can be had', async () => {
    const linux = fakeHost(rounded)
    linux.attributes.set(ATTRIBUTE, 'auto')
    expect(await decideOnce(linux.host, probeFaces('400 100px "axt-cmun-serif"').faces)).toBe('precise')
    expect(linux.attributes.has(ATTRIBUTE)).toBe(false)
    const none = fakeHost(linear)
    expect(await decideOnce(none.host, probeFaces(null).faces)).toBeNull()
    expect(none.state.probes).toBe(0)
    expect(none.attributes.has(ATTRIBUTE)).toBe(false)
    // (a reader closed while its face loads lays nothing out and writes nothing)
    const closed = fakeHost(linear)
    expect(await decideOnce(closed.host, probeFaces('400 100px "axt-cmun-serif"').faces, () => false)).toBeNull()
    expect([closed.state.probes, closed.attributes.size]).toEqual([0, 0])
  })
})

describe("the sheet: the overlay's text in the browser's smoothing and the PDF's black, geometricPrecision unless the probe said auto", () => {
  const sheet = READER_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = (selector: string) => {
    const at = sheet.indexOf(`${selector} {`)
    return at < 0 ? null : sheet.slice(at, sheet.indexOf('}', at) + 1)
  }
  it("sets the smoothing and geometricPrecision on every overlay, auto under the decision, the PDF's black where a run names no fill", () => {
    expect(rule('.axt-reader .axt-over > svg')).toMatch(/text-rendering: geometricPrecision;/)
    expect(rule('.axt-reader .axt-over > svg')).toMatch(/-webkit-font-smoothing: auto;/)
    expect(rule(`.axt-reader[${ATTRIBUTE}="auto"] .axt-over > svg`)).toMatch(/text-rendering: auto;/)
    // (the owner's ruling of 2026-11-08: the layer's ink is the PDF's own black, TeX's default colour, no longer #141414)
    expect(rule('.axt-reader .axt-over > svg text')).toMatch(/fill: #000;/)
  })
})
