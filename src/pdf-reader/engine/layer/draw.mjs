// What the web draws for a laid unit, as data (Plan 8b, Task 11; the instant layer's spec §4.5): on a page, the erase
// for the unit's lines there (the layout's, padded and kept off every other unit's lines), each crop of the original's ink
// with where it goes and how it is laid on the copy, and the text as runs, each with its x, face, size, spacing and
// colour. The web paints the erase and draws the crops on its copy of the page, then sets each run as SVG text at its
// line's baseline, inserting every string as text. And the arithmetic the web's pointer and highlight need over the laid
// lines: a sentence's boxes, the unit and offset under a point.
//
// Pure, as the layer is: no DOM, no clock, no randomness, no markup. An original module (no port statement), importing
// only relative modules, so that the reader's bundle holds it.
import { faceSize } from './fit.mjs'
import { keptOn } from './net.mjs'
import { linesOn } from './page.mjs'

/** of a line's size: its box's height above its baseline and below it (the em box), for a sentence's shape and a point */
const ASCENT = 0.75, DESCENT = 0.25

/**
 * PDF units each erase rectangle grows by on every side, within its line's own ink band (OWN_BAND). The layout's
 * rectangles are its glyphs' boxes from their faces' declared metrics, which leave a glyph's antialiased edge and a
 * descender past its face's declared descent unerased: rows of faint dots under the translation (the parity report,
 * §3.3). Measured with the keep-off and the darkened crops, on the 10 shared outputs: residue regions 31,337 to 1,001,
 * overlaps 326 to 291, other units' ink erased 170 to 166 (fidelity-layer-report.md, fix 2)
 */
export const ERASE_PAD = 0.6
/**
 * Of a line's size, below and above its baseline: the band its glyphs' ink takes. No unit's erase reaches into another
 * unit's band, even where the layout's rectangle does: a glyph box of a math face's declared descent (CMSY's 0.96 em)
 * reaches the next line, and erased there it takes another unit's ink with it
 */
export const INK_BAND = Object.freeze({ below: 0.25, above: 0.8 })
/** of a line's size, below and above its baseline: the most its own glyphs' ink takes (a descender of TeX Gyre Pagella
 *  reaches 0.27 em), past which its erase's pad does not go: further out there is no ink of the line's to take, only a
 *  neighbour's (a display's tall glyph, a figure) */
const OWN_BAND = Object.freeze({ below: 0.3, above: 0.85 })
/** PDF units kept clear between an erase and another unit's band */
const BAND_GAP = 0.15
/** a rectangle kept off other bands to less than this high is no rectangle: the layout's is drawn as it is */
const THINNEST = 0.5
/** an erase may meet a kept rendering by this much, across and up (the net's ERASE_SLACK) */
const KEPT_SLACK = 0.5
/** how the copy lays a crop on what is under it: darkened in (each channel the darker of the two), so that a crop's own
 *  paper never covers what lies under its box, a kept label or a crop beside it */
export const CROP_BLEND = 'darken'

/** the first index of a sorted list whose baseline is at least y */
function firstAt(list, y) {
  let lo = 0, hi = list.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].b < y) lo = m + 1; else hi = m }
  return lo
}

/**
 * A rectangle (x0, y0, x1, y1) of unit `id`'s line at baseline `b` kept off the band of every other unit's line it meets:
 * one on another baseline gives up the part of the rectangle on its side, one beside it on its own baseline only the pad
 * (`own`, the layout's rectangle, is never cut across). Null where nothing is left of it
 */
function keptOff(r, own, id, b, size, lines) {
  let [x0, y0, x1, y1] = r
  const { list, most } = lines
  for (let q = firstAt(list, y0 - INK_BAND.above * most); q < list.length && list[q].b <= y1 + INK_BAND.below * most; q++) {
    const L = list[q]
    if (L.id === id) continue
    const lo = L.b - INK_BAND.below * L.s, hi = L.b + INK_BAND.above * L.s
    if (hi <= y0 || lo >= y1 || Math.min(x1, L.x1) - Math.max(x0, L.x0) <= 0) continue
    if (Math.abs(L.b - b) < 0.5 * Math.min(L.s, size)) {
      if ((L.x0 + L.x1) / 2 > (own[0] + own[2]) / 2) x1 = Math.max(own[2], Math.min(x1, L.x0 - BAND_GAP))
      else x0 = Math.min(own[0], Math.max(x0, L.x1 + BAND_GAP))
    } else if (L.b < b) y0 = Math.max(y0, hi + BAND_GAP)
    else y1 = Math.min(y1, lo - BAND_GAP)
  }
  return y1 - y0 >= THINNEST && x1 > x0 ? [x0, y0, x1, y1] : null
}

/** whether a rectangle meets a kept rendering (x0, y0, x1, y1, stride 4) by more than KEPT_SLACK across and up */
function meetsKept(r, kept) {
  for (let q = 0; q + 3 < kept.length; q += 4) {
    if (Math.min(r[2], kept[q + 2]) - Math.max(r[0], kept[q]) > KEPT_SLACK && Math.min(r[3], kept[q + 3]) - Math.max(r[1], kept[q + 1]) > KEPT_SLACK) return true
  }
  return false
}

/**
 * The erase of a unit's line i: each of the layout's rectangles padded by ERASE_PAD within the line's own band, and kept
 * off every other unit's band; where the pad would meet a kept rendering (a display, a label) the layout's rectangle kept
 * off alone; and where keeping off leaves nothing, the layout's rectangle as it is
 */
function eraseOf(file, unit, i) {
  const rects = unit.erase[i], out = []
  if (!rects?.length) return out
  const page = unit.lines[8 * i], b = unit.lines[8 * i + 3], size = unit.lines[8 * i + 6]
  const lines = linesOn(file, page), kept = keptOn(file, page)
  for (let e = 0; e + 3 < rects.length; e += 4) {
    const own = [rects[e], rects[e + 1], rects[e + 2], rects[e + 3]]
    const y0 = Math.min(own[1], Math.max(own[1] - ERASE_PAD, b - OWN_BAND.below * size)), y1 = Math.max(own[3], Math.min(own[3] + ERASE_PAD, b + OWN_BAND.above * size))
    let r = keptOff([own[0] - ERASE_PAD, y0, own[2] + ERASE_PAD, y1], own, unit.id, b, size, lines)
    if (r && meetsKept(r, kept) && !meetsKept(own, kept)) r = keptOff(own, own, unit.id, b, size, lines)
    out.push(...(r ?? own))
  }
  return out
}

/** a text of one UTF-16 code unit that is no surrogate: a run that places each character holds only such, so that its x
 *  list has one value a code unit, as SVG addresses its characters */
const single = s => s.length === 1 && (s.charCodeAt(0) & 0xf800) !== 0xd800

/**
 * A line's runs, in reading order. A text item of one character joins the run before it where that one places each
 * character too and has its face, caps and colour (CJK characters, and Hangul or Latin letters tracked one by one): x
 * holds each character's place. Any other text item (a run of Latin or Hangul words, a CJK word, a character outside the
 * BMP) and every page text is a run of its own at one x, with the line's letter spacing, and a text item its word
 * spacing. A space is written where the translation has one between two items (the fit's `space`), and nowhere else (not
 * where trText has one for a group's piece): at the end of the item's run, with an x of its own where the run places each
 * character, or, after a crop, as a run of its own at the crop's right edge, in the face of the text beside it
 */
function runsOf(line) {
  const runs = []
  const items = line.items
  let run = null, each = false
  for (let q = 0; q < items.length; q++) {
    const it = items[q]
    if (it.kind === 'crop') {
      run = null
      if (it.space) {
        let face
        for (let r = q + 1; r < items.length && face === undefined; r++) face = items[r].face
        for (let r = q - 1; r >= 0 && face === undefined; r--) face = items[r].face
        if (face !== undefined) runs.push({ x: [it.x + it.w], text: ' ', face, caps: false, size: line.size * faceSize(face), letterSpacing: 0, wordSpacing: 0, colour: 0, shift: 0, from: it.to, to: it.to })
      }
      continue
    }
    const text = it.text ?? ''
    const one = it.kind === 'text' && single(text)
    const face = it.face, caps = !!it.caps
    if (one && run && each && run.face === face && run.caps === caps && run.colour === it.colour) {
      run.x.push(it.x)
      run.text += text
      run.to = it.to
    } else {
      run = {
        x: [it.x], text, face, caps, size: line.size * faceSize(face),
        letterSpacing: one ? 0 : line.letterSpacing, wordSpacing: it.kind === 'text' && !one ? line.wordSpacing : 0,
        colour: it.colour, shift: 0, from: it.from, to: it.to,
      }
      each = one
      runs.push(run)
    }
    if (it.space) {
      run.text += ' '
      if (each) run.x.push(it.x + it.w)
    }
    if (!each) run = null
  }
  return runs
}

/**
 * What the web draws for a unit on a page, in PDF units (y up):
 * - `erase`: for the unit's lines on that page, the layout's erase padded by ERASE_PAD and kept off every other unit's
 *   lines and every kept rendering (x0, y0, x1, y1, stride 4), and nothing else;
 * - `crops`: each crop's segments in turn (k, srcX0, srcBottom, srcX1, srcTop, dstX, dstBaseline, srcBaseline, scale,
 *   stride 9): drawn from the original page's pixels inside the segment at the unit's scale, side by side from its item's
 *   x, the segment's baseline (its line's in the original, so that a raised mark keeps its lift × the scale) on the line's;
 * - `blend`: how the copy lays the crops on what is under them (CROP_BLEND: darkened in, never pasted);
 * - `lines`: each laid line on the page, its baseline and its runs.
 */
export function drawUnit(input, laid, page) {
  const unit = input.file.unit(laid.id)
  const erase = [], crops = [], lines = []
  if (unit) {
    for (let i = 0; i < unit.erase.length; i++) {
      if (unit.lines[8 * i] !== page) continue
      for (const v of eraseOf(input.file, unit, i)) erase.push(v)
    }
  }
  const scale = laid.state.scale
  for (const line of laid.lines) {
    if (line.page !== page) continue
    for (const it of line.items) {
      if (it.kind !== 'crop') continue
      const s = unit?.ph.get(it.ph)?.segs ?? []
      let x = it.x
      // page, x0, baseline, x1, top, bottom
      for (let o = 0; o + 5 < s.length; o += 6) {
        crops.push(it.ph, s[o + 1], s[o + 5], s[o + 3], s[o + 4], x, line.baseline, s[o + 2], scale)
        x += (s[o + 3] - s[o + 1]) * scale
      }
    }
    lines.push({ baseline: line.baseline, runs: runsOf(line) })
  }
  return { id: laid.id, page, erase, crops, blend: CROP_BLEND, lines }
}

/** an item's text maps onto its offsets one code unit each (no ligature, no drawn hyphen, no page text) */
const exact = it => it.kind === 'text' && typeof it.text === 'string' && it.to - it.from === it.text.length && it.to > it.from
/** where offset `off` is drawn across an item whose text maps onto its offsets: by its share of the item's offsets */
const xAt = (it, off) => it.x + (it.w * (Math.min(Math.max(off, it.from), it.to) - it.from)) / (it.to - it.from)

/** a line's box: its slot, widened to its items, its em box high */
function boxOf(line) {
  let x0 = line.x0, x1 = line.x1
  for (const it of line.items) { x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x + it.w) }
  return { x0, y0: line.baseline - DESCENT * line.size, x1, y1: line.baseline + ASCENT * line.size }
}

/**
 * The laid boxes covering trText offsets [from, to): one a line that holds any of them, from where the first of its
 * offsets there is drawn to where the last ends, the line's em box high. Within an item of several characters an offset
 * is placed by its share of the item's width (an item's own characters are not measured here)
 */
export function spansOf(laid, from, to) {
  const out = []
  for (const line of laid.lines) {
    let x0 = Infinity, x1 = -Infinity
    for (const it of line.items) {
      // an item of no offsets of its own (a cut word's tail) goes with the offset before it
      const inside = it.to > it.from ? it.from < to && it.to > from : it.from > from && it.from <= to
      if (!inside) continue
      // any other item (a crop, a page text, a word with a drawn hyphen) is covered whole
      const whole = !exact(it)
      x0 = Math.min(x0, whole ? it.x : xAt(it, from))
      x1 = Math.max(x1, whole ? it.x + it.w : xAt(it, to))
    }
    if (x0 > x1) continue
    out.push({ page: line.page, x0, y0: line.baseline - DESCENT * line.size, x1, y1: line.baseline + ASCENT * line.size })
  }
  return out
}

/** the offset of a line's item under x: the character there by its share of the item, else the nearest item's edge */
function offsetAt(line, x) {
  let best = line.from, gap = Infinity
  for (const it of line.items) {
    if (x >= it.x && x <= it.x + it.w) {
      if (!exact(it) || it.w <= 0) return it.from
      return Math.min(it.to - 1, it.from + Math.floor(((x - it.x) / it.w) * (it.to - it.from)))
    }
    const d = x < it.x ? it.x - x : x - (it.x + it.w)
    if (d < gap) { gap = d; best = x < it.x ? it.from : it.to }
  }
  return best
}

/** the laid unit and offset under a point of a page: the smallest line box that holds it (the first on a tie), and the
 *  offset of its item there; null on none */
export function unitAt(laid, page, x, y) {
  let hit = null, area = Infinity
  for (const u of laid) {
    if (!u?.fit) continue
    for (const line of u.lines) {
      if (line.page !== page) continue
      const b = boxOf(line)
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue
      const a = (b.x1 - b.x0) * (b.y1 - b.y0)
      if (a < area) { area = a; hit = { id: u.id, line } }
    }
  }
  return hit ? { id: hit.id, offset: offsetAt(hit.line, x) } : null
}
