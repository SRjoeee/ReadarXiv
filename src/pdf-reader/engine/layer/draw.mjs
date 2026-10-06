// What the web draws for a laid unit, as data (Plan 8b, Task 11; the instant layer's spec §4.5): on a page, the layout's
// own erase for the unit's lines there, each crop of the original's ink with where it goes, and the text as runs, each
// with its x, face, size, spacing and colour. The web paints the erase and draws the crops on its copy of the page, then
// sets each run as SVG text at its line's baseline, inserting every string as text. And the arithmetic the web's pointer
// and highlight need over the laid lines: a sentence's boxes, the unit and offset under a point.
//
// Pure, as the layer is: no DOM, no clock, no randomness, no markup. An original module (no port statement), importing
// only relative modules, so that the reader's bundle holds it.
import { faceSize } from './fit.mjs'

/** of a line's size: its box's height above its baseline and below it (the em box), for a sentence's shape and a point */
const ASCENT = 0.75, DESCENT = 0.25

/** a text of one UTF-16 code unit that is no surrogate: a run that places each character holds only such, so that its x
 *  list has one value a code unit, as SVG addresses its characters */
const single = s => s.length === 1 && (s.charCodeAt(0) & 0xf800) !== 0xd800

/**
 * A line's runs, in reading order. A text item of one character joins the run before it where that one places each
 * character too and has its face, caps and colour (CJK characters, and Hangul or Latin letters tracked one by one): x
 * holds each character's place. Any other text item (a run of Latin or Hangul words, a CJK word, a character outside the
 * BMP) and every page text is a run of its own at one x, with the line's letter spacing, and a text item its word
 * spacing. A gap between an item and the next (a space of trText) is written as a space at the end of the item's run, with
 * an x of its own where the run places each character, for copying and finding; a crop writes none
 */
function runsOf(line) {
  const runs = []
  const items = line.items
  let run = null, each = false
  for (let q = 0; q < items.length; q++) {
    const it = items[q], next = items[q + 1]
    if (it.kind === 'crop') { run = null; continue }
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
    if (next !== undefined && next.from > it.to) {
      run.text += ' '
      if (each) run.x.push(it.x + it.w)
    }
    if (!each) run = null
  }
  return runs
}

/**
 * What the web draws for a unit on a page, in PDF units (y up):
 * - `erase`: the layout's erase for the unit's lines on that page, and nothing else (x0, y0, x1, y1, stride 4);
 * - `crops`: each crop's segments in turn (k, srcX0, srcBottom, srcX1, srcTop, dstX, dstBaseline, srcBaseline, scale,
 *   stride 9): drawn from the original page's pixels inside the segment at the unit's scale, side by side from its item's
 *   x, the segment's baseline (its line's in the original, so that a raised mark keeps its lift × the scale) on the line's;
 * - `lines`: each laid line on the page, its baseline and its runs.
 */
export function drawUnit(input, laid, page) {
  const unit = input.file.unit(laid.id)
  const erase = [], crops = [], lines = []
  if (unit) {
    for (let i = 0; i < unit.erase.length; i++) {
      if (unit.lines[8 * i] !== page) continue
      for (const v of unit.erase[i]) erase.push(v)
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
  return { id: laid.id, page, erase, crops, lines }
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
