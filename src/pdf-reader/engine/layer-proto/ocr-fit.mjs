// A bitmap figure's label laid in its lines' boxes (the content class `ocr`, PDF-READER §19.15): the fit rule the layer draws each
// label by (run.mjs paintOcr). The translation fills the label's lines in their order, the original's lines' own lengths its
// measure, at the label's size (the extension's share of its thinnest line: layout/bitmap-text.mjs OCR_SIZE), shrunk as a whole
// where it does not fit, to `floor` of the size at the most (the layout rules' last floor, as a vector figure's: figure-fit.mjs);
// past it the label is left the original's (`unfit`), its patches not drawn either. A line is broken between words where the
// text has spaces, and between two characters of a script written without them (CJK); each line's text is set on the line's
// middle across it, along its direction, by the label's anchor (its start, its middle or its end). Its patches were found clear
// of other ink by the maker, and the reader draws every patch of a page before any label's text, so that no patch covers a
// translation. Pure; an original module (no port statement), importing nothing.

/** a line is filled to this share of its length at most (the patch's own margin is the rest) */
const FILL = 0.96
/** the size is shrunk by this share a step, from 1 down to the floor */
const STEP = 0.04
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

/**
 * Where a translation `text` is drawn in label `place` (ocr-rows.mjs placeOf's): { size, lines: [{ text, x, y, angle, width }] }
 * — its size, and each line it fills, on its baseline from (x, y) along `angle` (degrees anticlockwise, the page's), `width` long
 * —, or null where it does not fit at `floor` of the size. `measure(s)` a text's width at size 1 in the face it is drawn in
 */
export function fitOcr(place, text, measure, floor) {
  const lines = place.lines.map(({ quad }) => {
    const [p0, p1, , p3] = quad, L = len(p0, p1), T = len(p0, p3)
    return { p0, ux: (p1[0] - p0[0]) / (L || 1), uy: (p1[1] - p0[1]) / (L || 1), dx: (p3[0] - p0[0]) / (T || 1), dy: (p3[1] - p0[1]) / (T || 1), L, T }
  })
  if (!lines.length || lines.some(l => !(l.L > 0 && l.T > 0)) || !(place.size > 0)) return null
  const pieces = piecesOf(text.replace(/\s+/gu, ' ').trim())
  if (!pieces.length) return null
  const widths = pieces.map(p => measure(p)), bare = pieces.map(p => measure(p.trimEnd()))
  for (let k = 1; k >= floor - 1e-9; k -= STEP) {
    const size = place.size * k
    const set = []
    let i = 0
    for (const l of lines) {
      if (i >= pieces.length) break
      const room = l.L * FILL
      let w = 0, from = i
      while (i < pieces.length && (i === from ? bare[i] : w + bare[i]) * size <= room) { w += widths[i]; i++ }
      if (i === from) break
      set.push({ l, text: pieces.slice(from, i).join('').trimEnd(), width: (w - widths[i - 1] + bare[i - 1]) * size })
    }
    if (i < pieces.length) continue
    return {
      size,
      lines: set.map(({ l, text: t, width }) => {
        const offset = place.anchor === 'start' ? 0 : place.anchor === 'end' ? l.L - width : (l.L - width) / 2
        const across = l.T / 2 + MIDDLE * size
        return { text: t, x: l.p0[0] + l.ux * offset + l.dx * across, y: l.p0[1] + l.uy * offset + l.dy * across, angle: (Math.atan2(l.uy, l.ux) * 180) / Math.PI, width }
      }),
    }
  }
  return null
}
