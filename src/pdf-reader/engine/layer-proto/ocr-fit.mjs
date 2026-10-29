// A bitmap figure's label laid in its lines' boxes (the content class `ocr`, PDF-READER §19.15): the fit rule the layer draws each
// label by (run.mjs paintOcr), by its set (the owner's rule of 2026-10-29 for a figure's labels, PDF-READER §19.12: the labels of
// one set at one size). The translation fills the label's lines in their order, the original's lines' own lengths its measure, at
// the label's size (its set's: layout/bitmap-text.mjs setsOf) shrunk by a factor where it does not fit: each label's need is the
// largest factor it fits at (ocrNeed, in steps of STEP down to `floor`, the layout rules' last floor, as a vector figure's:
// figure-fit.mjs), and its set is drawn at the least need of its labels that fit at `floor` (ocrSetFactor), never a label alone;
// one that needs less is left the original's (`unfit`), its patches not drawn either. A line is broken between words where the
// text has spaces, and between two characters of a script written without them (CJK); each line's text is set on the line's
// middle across it, along its direction, by the label's anchor (its start, its middle or its end). Its patches were found clear
// of other ink by the maker, and the reader draws every patch of a page before any label's text, so that no patch covers a
// translation. Pure; an original module (no port statement), importing nothing.

/** a line is filled to this share of its length at most (the patch's own margin is the rest) */
const FILL = 0.96
/** the size is shrunk by this share a step, from 1 down to the floor */
const STEP = 0.04
/** a line within this of level, degrees, is drawn level (the recogniser's quad of a level line leans by its pixels' noise: a
 *  label's translation is then in the page's text layer, as a level figure label's) */
const LEVEL = 1
/** the em box's middle above the baseline, in em (a CJK face's [-0.12, 0.88]): set on the line's middle across it */
const MIDDLE = 0.38
/** the text's pieces a line may break after: a word with the spaces after it, or one character of a script written without
 *  spaces (a closing mark of it kept with the character before) */
export function piecesOf(text) {
  const out = []
  for (const m of text.matchAll(/[\u2e80-\u9fff\uac00-\ud7af\u3040-\u30ff\uf900-\ufaff\uff00-\uffef][\u3001\u3002\uff0c\uff0e\uff1a\uff1b\uff01\uff1f\uff09\u300d\u300f\u3011]*\s*|[^\s\u2e80-\u9fff\uac00-\ud7af\u3040-\u30ff\uf900-\ufaff\uff00-\uffef]+\s*|\s+/gu)) out.push(m[0])
  return out
}
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** a label's lines' frames and the translation's pieces measured at size 1 (null where nothing can be laid) */
function prepared(place, text, measure) {
  const lines = place.lines.map(({ quad }) => {
    const [p0, p1, , p3] = quad, L = len(p0, p1), T = len(p0, p3)
    return { p0, ux: (p1[0] - p0[0]) / (L || 1), uy: (p1[1] - p0[1]) / (L || 1), dx: (p3[0] - p0[0]) / (T || 1), dy: (p3[1] - p0[1]) / (T || 1), L, T }
  })
  if (!lines.length || lines.some(l => !(l.L > 0 && l.T > 0)) || !(place.size > 0)) return null
  const pieces = piecesOf(text.replace(/\s+/gu, ' ').trim())
  if (!pieces.length) return null
  return { lines, pieces, widths: pieces.map(p => measure(p)), bare: pieces.map(p => measure(p.trimEnd())) }
}
/** the translation filled into the label's lines at `size`: each line's run of pieces and its width, or null where it does not fit */
function fill(m, size) {
  const set = []
  let i = 0
  for (const l of m.lines) {
    if (i >= m.pieces.length) break
    const room = l.L * FILL
    let w = 0, from = i
    while (i < m.pieces.length && (i === from ? m.bare[i] : w + m.bare[i]) * size <= room) { w += m.widths[i]; i++ }
    if (i === from) break
    set.push({ l, text: m.pieces.slice(from, i).join('').trimEnd(), width: (w - m.widths[i - 1] + m.bare[i - 1]) * size })
  }
  return i < m.pieces.length ? null : set
}

/**
 * The largest factor of the label's size, from 1 down by STEP to `floor`, that translation `text` fits label `place` at
 * (ocr-rows.mjs placeOf's), or null where it fits at none. `measure(s)` a text's width at size 1 in the faces it is drawn in
 */
export function ocrNeed(place, text, measure, floor) {
  const m = prepared(place, text, measure)
  if (!m) return null
  for (let k = 1; k > floor + 1e-9; k -= STEP) if (fill(m, place.size * k)) return k
  // (the floor itself, where the steps from 1 do not land on it: a floor of 0.65 is tested, not only 0.68 and 0.64)
  return floor > 0 && fill(m, place.size * floor) ? floor : null
}

/** a set's one factor: the least need of its labels that fit (ocrNeed's, null for one that fits at none), 1 where none does */
export function ocrSetFactor(needs) {
  const fit = needs.filter(k => k !== null)
  return fit.length ? Math.min(...fit) : 1
}

/**
 * Where translation `text` is drawn in label `place` at factor `k` of its size: { size, lines: [{ text, x, y, angle, width }] } —
 * its size, and each line it fills, on its baseline from (x, y) along `angle` (degrees anticlockwise, the page's), `width` long
 * —, or null where it does not fit at it
 */
export function layOcr(place, text, measure, k) {
  const m = prepared(place, text, measure)
  if (!m) return null
  const size = place.size * k, set = fill(m, size)
  if (!set) return null
  return {
    size,
    lines: set.map(({ l, text: t, width }) => {
      const offset = place.anchor === 'start' ? 0 : place.anchor === 'end' ? l.L - width : (l.L - width) / 2
      const across = l.T / 2 + MIDDLE * size
      const angle = (Math.atan2(l.uy, l.ux) * 180) / Math.PI
      return { text: t, x: l.p0[0] + l.ux * offset + l.dx * across, y: l.p0[1] + l.uy * offset + l.dy * across, angle: Math.abs(angle) < LEVEL ? 0 : angle, width }
    }),
  }
}

/** one label fitted alone (a set of one): laid at its own need, or null where it fits at none */
export function fitOcr(place, text, measure, floor) {
  const k = ocrNeed(place, text, measure, floor)
  return k === null ? null : layOcr(place, text, measure, k)
}
