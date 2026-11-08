// How the overlay's SVG text is rendered (docs/PDF-READER.md §11.8, "The layer's text, at the page's weight"; today's
// src/pdf-reader/engine/view/text-rendering.mjs at a79722e78, carried over the Page). The sheet (styles.ts) draws the overlay's
// text with `text-rendering: geometricPrecision`, so that a word's glyphs advance as the Metrics measured them on a canvas: a
// system that lays a web font out on whole-pixel advances (Chromium on Linux) would otherwise move a Latin word's letters, by up
// to 4.5 CSS px over a page of German. But on macOS, Chromium draws geometricPrecision without the system's font smoothing: 80 %
// of the ink PDF.js gives the same face at the same size, the translation lighter than the page around it (the maintainer's
// ruling of 2026-10-29; seen again by him on 2026-11-08 in this reader, which drew it so until this module: 80 % of the ink its
// own `auto` gives on 1706.03762v7's abstract). There `auto` keeps every glyph where geometricPrecision puts it and draws at
// the canvas's weight.
//
// So the overlay takes `auto` where the browser lays its words out alike under both, and geometricPrecision elsewhere: a feature
// test, not a platform's, on the overlay's own words in its own faces (a face the system holds is laid out with fractional
// advances under both on Linux too, where the served web fonts are not, so no probe in a system face can tell). The first laid
// page that tells decides, once a reader: its runs drawn from one place each (a Latin word: one x, its glyphs advancing as the
// browser lays them; a CJK run has an x a character, which no rendering moves) laid out again twice off the view, in their
// classes and sizes, under each rendering; their glyphs' advances compared. The answer is an attribute of the reader's root
// (`data-axt-layer-text="auto"`) that the sheet reads; until a page tells, and wherever it says no, geometricPrecision.
import type { Faces } from './faces.ts'
import type { Page } from './page.ts'

/** CSS px: the most one glyph's advance may differ between the two renderings for the overlay to take `auto`. macOS's differ
 *  by a 64th of a pixel at two sizes (0.01 at most); a whole-pixel advance by up to half a pixel */
export const ADVANCE_TOLERANCE = 0.05
/** the fewest advances a decision for `auto` rests on, each fractional under geometricPrecision (more than a tenth of a pixel
 *  from a whole one: an advance a whole-pixel layout would move); fewer, as on a page of monospaced words, tells nothing */
export const MIN_EVIDENCE = 16
/** the most runs a page's probe lays out again */
export const PROBE_RUNS = 24
/** the attribute of the reader's root the sheet reads, and its value where the overlay takes `auto` */
export const ATTRIBUTE = 'data-axt-layer-text'
/** the probe's scale: CSS px a PDF unit at the reader's 100 % (PDF.js's CSS units, 96 / 72) */
const PX_PER_UNIT = 4 / 3
const SVG_NS = 'http://www.w3.org/2000/svg'

export type LayerText = 'auto' | 'precise'
/** a run of one place, as the probe lays it out again: its text, its face's class, its size (PDF units) */
export interface ProbeWord {
  text: string
  cls: string
  size: number
}

/**
 * The overlay's text rendering from two layouts of the same words: `precise` and `auto`, each word's characters' start x (one
 * array a word), in units of `unit` CSS px. 'precise' where any glyph's advance within a word differs by more than
 * ADVANCE_TOLERANCE CSS px, or a word was laid out to another number of characters; 'auto' where none does and at least
 * MIN_EVIDENCE advances are fractional under geometricPrecision; null where the words tell too little (too few advances, every
 * one whole, a place that is not a number, or no words)
 */
export function decideLayerText(
  precise: readonly (readonly number[] | null)[] | null,
  auto: readonly (readonly number[] | null)[] | null,
  unit = PX_PER_UNIT,
): LayerText | null {
  if (!Array.isArray(precise) || !Array.isArray(auto) || precise.length !== auto.length || !(unit > 0)) return null
  let evidence = 0
  for (let r = 0; r < precise.length; r++) {
    const a = precise[r],
      b = auto[r]
    if (!a || !b) return null
    if (a.length !== b.length) return 'precise'
    for (let i = 1; i < a.length; i++) {
      const pa = ((a[i] as number) - (a[i - 1] as number)) * unit,
        pb = ((b[i] as number) - (b[i - 1] as number)) * unit
      if (!Number.isFinite(pa) || !Number.isFinite(pb)) return null
      if (Math.abs(pa - pb) > ADVANCE_TOLERANCE) return 'precise'
      if (Math.abs(pa - Math.round(pa)) > 0.1) evidence++
    }
  }
  return evidence >= MIN_EVIDENCE ? 'auto' : null
}

/** a laid page's runs drawn from one place each (no `dx`: a CJK run's characters each have theirs) of two characters or more,
 *  PROBE_RUNS at most, in the classes the overlay draws them in */
export function wordsOf(page: Page, faces: Pick<Faces, 'classOf'>): ProbeWord[] {
  const out: ProbeWord[] = []
  for (const m of page.members) {
    if (m.state !== 'laid') continue
    for (const [, , , items] of m.lines)
      for (const it of items) {
        if ('src' in it || it.dx?.length || [...it.s.trim()].length < 2) continue
        out.push({ text: it.s, cls: faces.classOf(it.face), size: it.size })
        if (out.length >= PROBE_RUNS) return out
      }
  }
  return out
}

/** each character's start x of a laid <text>, or null where the browser lays no SVG text out (a DOM without layout) */
function placesOf(text: SVGTextElement): number[] | null {
  const n = text.getNumberOfChars?.()
  if (!(n > 0)) return null
  const xs: number[] = new Array(n)
  for (let i = 0; i < n; i++) xs[i] = text.getStartPositionOfChar(i).x
  return xs
}

/**
 * The words laid out again in a hidden SVG under `host` (the reader's root: its faces' classes apply there), once under
 * geometricPrecision and once under `auto`, and the decision on them (decideLayerText). null where there are none, the document
 * lays no SVG text out or the layout throws
 */
export function probeWords(host: Element, words: readonly ProbeWord[]): LayerText | null {
  if (!words.length) return null
  const doc = host.ownerDocument
  const svg = doc.createElementNS(SVG_NS, 'svg')
  const width = 2000,
    height = 40 * words.length
  svg.setAttribute('viewBox', `0 0 ${width / PX_PER_UNIT} ${height / PX_PER_UNIT}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;font-synthesis:none'
  const lines = (['geometricPrecision', 'auto'] as const).map((rendering) =>
    words.map((w, i) => {
      const t = doc.createElementNS(SVG_NS, 'text')
      t.setAttribute('x', '0')
      t.setAttribute('y', String((20 + 40 * i) / PX_PER_UNIT))
      t.setAttribute('font-size', String(w.size))
      t.setAttribute('class', w.cls)
      t.style.cssText = `text-rendering:${rendering};white-space:pre`
      t.textContent = w.text
      svg.append(t)
      return t
    }),
  )
  host.append(svg)
  try {
    const [precise, auto] = lines.map((texts) => texts.map(placesOf))
    if (precise?.some((p) => !p) || auto?.some((p) => !p)) return null
    return decideLayerText(precise ?? null, auto ?? null, PX_PER_UNIT)
  } catch {
    return null
  } finally {
    svg.remove()
  }
}

/** the overlay's text rendering told by a laid page's own words (null: the page tells nothing, the next one may), written on
 *  the reader's root: the attribute for `auto`, none for `precise` (the sheet's geometricPrecision). It never throws: a commit
 *  calls it */
export function decideOn(root: HTMLElement, page: Page, faces: Pick<Faces, 'classOf'>): LayerText | null {
  let answer: LayerText | null = null
  try {
    answer = probeWords(root, wordsOf(page, faces))
  } catch {
    answer = null
  }
  if (answer === 'auto') root.setAttribute(ATTRIBUTE, 'auto')
  else if (answer === 'precise') root.removeAttribute(ATTRIBUTE)
  return answer
}
