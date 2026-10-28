// src/pdf-reader/engine/view/text-rendering.mjs
// How the layer's SVG text is rendered (docs/PDF-READER.md §11.8, "The layer's text, at the page's weight"). The layer draws
// its text with `text-rendering: geometricPrecision` (engine.css) so that a word's glyphs advance as the engine measured them
// on a canvas: a system that lays a web font out on whole-pixel advances (Chromium on Linux, at a pixel ratio of 1 and of 2
// alike) would otherwise move a Latin word's letters, by up to 4.5 CSS px over a page of German (2608.16117v1 p2, 2026-10-29).
// But on macOS, Chromium draws geometricPrecision without the system's font smoothing: 80 % of the ink PDF.js gives the same
// face at the same size, so the translation read lighter than the page around it and than BabelDOC's (the maintainer's
// ruling of 2026-10-29). There `auto` keeps every glyph where geometricPrecision puts it (0.17 CSS px at most over 16,528
// characters of four papers: the ends of long words) and draws at the canvas's weight.
//
// So the layer takes `auto` where the browser lays its words out alike under both, and geometricPrecision elsewhere: a feature
// test, not a platform's. It is the layer's own words that tell, in the layer's own faces: a face the system holds is laid out
// with fractional advances under both on Linux too, where the web fonts the layer draws in are not, so no probe in a system
// face can tell (the first form of this test, in the system's serif, took `auto` on Linux). The first laid page that tells
// decides, once a document: its words drawn from one place each (a Latin word: one x, its glyphs advancing as the browser
// lays them) are laid out again twice off the view, at the layer's scale, in their faces and sizes, under each rendering;
// their glyphs' advances compared. The answer is an attribute of <html> (`data-axt-layer-text="auto"`) that engine.css reads;
// until a page tells, and wherever it says no, geometricPrecision.
//
// An original module (no port statement).

/** CSS px: the most one glyph's advance may differ between the two renderings for the layer to take `auto`. macOS's differ
 *  by a 64th of a pixel at two sizes (0.01 at most); a whole-pixel advance by up to half a pixel */
export const ADVANCE_TOLERANCE = 0.05
/** the fewest advances a decision for `auto` rests on, each fractional under geometricPrecision (more than a tenth of a pixel
 *  from a whole one: an advance a whole-pixel layout would move); fewer, as on a page of monospaced words, tells nothing */
export const MIN_EVIDENCE = 16
/** the most words a page's probe lays out again */
export const PROBE_RUNS = 24
/** the attribute of <html> engine.css reads, and its value where the layer takes `auto` */
export const ATTRIBUTE = 'data-axt-layer-text'
const SVG_NS = 'http://www.w3.org/2000/svg'
/** the probe's scale: a layer's own at the reader's 75 %, 1.25 viewBox units a CSS px (layer-proto/run.mjs scale) */
const UNITS_PER_PX = 1.25

/**
 * The layer's text rendering from two layouts of the same words: `precise` and `auto`, each word's characters' start x (one
 * array a word), in units of `unit` CSS px. 'precise' where any glyph's advance within a word differs by more than
 * ADVANCE_TOLERANCE CSS px, or a word was laid out to another number of characters; 'auto' where none does and at least
 * MIN_EVIDENCE advances are fractional under geometricPrecision; null where the words tell too little (too few advances, every
 * one whole, a place that is not a number, or no words)
 */
export function decideLayerText(precise, auto, unit = 1 / UNITS_PER_PX) {
  if (!Array.isArray(precise) || !Array.isArray(auto) || precise.length !== auto.length || !(unit > 0)) return null
  let evidence = 0
  for (let r = 0; r < precise.length; r++) {
    const a = precise[r], b = auto[r]
    if (!a || !b) return null
    if (a.length !== b.length) return 'precise'
    for (let i = 1; i < a.length; i++) {
      const pa = (a[i] - a[i - 1]) * unit, pb = (b[i] - b[i - 1]) * unit
      if (!Number.isFinite(pa) || !Number.isFinite(pb)) return null
      if (Math.abs(pa - pb) > ADVANCE_TOLERANCE) return 'precise'
      if (Math.abs(pa - Math.round(pa)) > 0.1) evidence++
    }
  }
  return evidence >= MIN_EVIDENCE ? 'auto' : null
}

/**
 * A laid page's words drawn from one place each, at most PROBE_RUNS: each a <tspan> of the page's SVG with one x and two
 * characters or more (a CJK run holds an x a character, which no rendering moves), as { text, family, weight, style, size,
 * spacing } in its own face and size (the SVG's units). `view` reads a computed style (the SVG's document's window)
 */
export function wordsOf(svg, view = svg?.ownerDocument?.defaultView) {
  const out = []
  if (!svg || !view) return out
  for (const s of svg.querySelectorAll('tspan')) {
    const x = (s.getAttribute('x') ?? '').trim()
    const text = s.textContent ?? ''
    if (!x || /\s/.test(x) || s.getAttribute('fill-opacity') === '0' || [...text.trim()].length < 2) continue
    const cs = view.getComputedStyle(s)
    out.push({ text, family: cs.fontFamily, weight: cs.fontWeight, style: cs.fontStyle, size: s.getAttribute('font-size') ?? '12.5', spacing: s.getAttribute('letter-spacing') })
    if (out.length >= PROBE_RUNS) break
  }
  return out
}

/** each character's start x of a laid <text>, or null where the browser lays no SVG text out (a DOM without layout) */
function placesOf(text) {
  const n = text.getNumberOfChars?.()
  if (!(n > 0)) return null
  const xs = new Array(n)
  for (let i = 0; i < n; i++) xs[i] = text.getStartPositionOfChar(i).x
  return xs
}

/**
 * The words laid out again in a hidden SVG of the layer's scale, once under geometricPrecision and once under `auto`, and the
 * decision on them (decideLayerText). null where there are none, the document lays no SVG text out or the layout throws
 */
export function probeWords(doc, words) {
  const root = doc?.body ?? doc?.documentElement
  if (!root || !words?.length || typeof doc.createElementNS !== 'function') return null
  const svg = doc.createElementNS(SVG_NS, 'svg')
  const width = 2000, height = 40 * words.length
  svg.setAttribute('viewBox', `0 0 ${width * UNITS_PER_PX} ${height * UNITS_PER_PX}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;font-synthesis:none'
  const lines = ['geometricPrecision', 'auto'].map(rendering => words.map((w, i) => {
    const t = doc.createElementNS(SVG_NS, 'text')
    t.setAttribute('x', '0')
    t.setAttribute('y', String((20 + 40 * i) * UNITS_PER_PX))
    t.setAttribute('font-size', w.size)
    if (w.spacing) t.setAttribute('letter-spacing', w.spacing)
    t.style.cssText = `text-rendering:${rendering};white-space:pre`
    t.style.fontFamily = w.family
    t.style.fontWeight = w.weight
    t.style.fontStyle = w.style
    t.textContent = w.text
    svg.append(t)
    return t
  }))
  root.append(svg)
  try {
    const [precise, auto] = lines.map(texts => texts.map(placesOf))
    if (precise.some(p => !p) || auto.some(p => !p)) return null
    return decideLayerText(precise, auto, 1 / UNITS_PER_PX)
  } catch {
    return null
  } finally {
    svg.remove()
  }
}

/** each document's decisions, by the source of the faces its layer is drawn in */
const decided = new WeakMap()
/** a decision written on <html>: the attribute for `auto`, none for anything else (engine.css's geometricPrecision) */
function write(doc, answer) {
  if (answer === 'auto') doc.documentElement?.setAttribute(ATTRIBUTE, 'auto')
  else doc.documentElement?.removeAttribute?.(ATTRIBUTE)
}
/**
 * The layer's text rendering for a document, decided from a laid page's SVG (`svg`, in the document) the first time a page
 * tells, and written on its <html>: `data-axt-layer-text="auto"` where the layer takes `auto`, no attribute (engine.css's
 * geometricPrecision) elsewhere. Returns the decision, or null while no page has told. It never throws: a commit calls it,
 * and a page whose words cannot be read leaves the decision to the next.
 * `faces` names the source of the faces the layer is drawn in, each a decision of its own: a system can lay its own faces out
 * otherwise than the web fonts a reader serves (Linux: fractional advances under both renderings for the one, whole pixels
 * under `auto` for the other). The readers draw in the faces they serve alone (the default); the layer lab also in the system's
 * (its prototype's faces), and a decision made for one never stands for the other: a source not decided yet draws in
 * geometricPrecision, whatever another said
 */
export function applyLayerText(svg, doc = svg?.ownerDocument, faces = 'served') {
  if (!doc) return null
  let bySource = decided.get(doc)
  if (!bySource) decided.set(doc, (bySource = new Map()))
  if (bySource.has(faces)) {
    const answer = bySource.get(faces)
    write(doc, answer)
    return answer
  }
  let answer = null
  try { answer = probeWords(doc, wordsOf(svg)) } catch { answer = null }
  if (answer === null) {
    if (bySource.size) write(doc, null)
    return null
  }
  bySource.set(faces, answer)
  write(doc, answer)
  return answer
}
