import { describe, expect, it } from 'vitest'
import { displayBlockId } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { PH_FLAG, PH_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { type Anchor, type DocToken, lineRects, tokenizeDocument } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { layoutOf } from '@/pdf-reader/engine/view/highlight.mjs'
import { createShapes, mirror } from '@/pdf-reader/engine/view/shapes.mjs'
import { cutSide } from '../../lab/pdf/spikes/highlight-pages.mjs'

// A display's glyph whose text-layer box stands off its ink (view/shapes.mjs tellBoxes): arXiv's text layer draws a token's box from
// its font's ascent and descent, and a math extension font's (cmex10's, txexs's) hang under the baseline while a wide accent's ink
// stands over it — 2610.35877v1 p5's hat on the w in display (4)'s denominator, its box's middle 1.9 pt under the display's. Its
// middle out of the display's box, it stayed its paragraph's and lit with the sentence before the display: a band in the formula

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
const item = (str: string, x: number, y: number, width = str.length * 5, eol = false): Item => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10, hasEOL: eol, fontName: 'f' })
const WORDS = 'text text text text text text text text'
/** a paragraph line, the display "x = y (1)" with a hat drawn between its x and its = in the stream, its baseline 6 under the
 *  display's (its box 691.8–701.5, the display's 697.8–707.5: its middle out by 1.15 past the slack, its box meeting), a line on;
 *  and a word set apart from the display under it, in the stream between the display's glyphs too, whose box meets nothing */
const P1: Item[] = [item(WORDS, 50, 740, 500, true), item('x', 250, 700, 10), item('b', 252, 694, 6), item('=', 265, 700, 10), item('away', 400, 600, 20), item('y', 280, 700, 10), item('(1)', 535, 700, 15, true), item(WORDS, 50, 660, 500, true)]
const doc: DocToken[] = tokenizeDocument([{ page: 1, items: P1, styles: {} }])
const at = (y: number) => doc.flatMap((t, k) => (Math.abs(t.y - y) < 1 ? [k] : []))
const HAT = at(694), AWAY = at(600), DISPLAY = [...at(700), ...HAT]
const UNIT = [...at(740), ...DISPLAY, ...AWAY, ...at(660)].sort((a, b) => a - b)
const anchors = new Map<number, Anchor | null>([[1, { tokens: UNIT, rects: lineRects(doc, UNIT), coverage: 1, bounded: true, pairs: new Map(UNIT.filter(k => !DISPLAY.includes(k) && !AWAY.includes(k)).map((k, w) => [w, k])) }]])
const views = [[0, 0, 600, 800]]
const whole = layoutOf(doc, views, anchors, () => 'para')
const DK = PH_KINDS.indexOf('display'), DID = displayBlockId(1, 0)!
/** a line of the layout file (page, x0, x1, baseline, top, bottom, size, font), where arXiv's stands */
const row = (x0: number, x1: number, y: number) => [1, x0, x1, y, y + 7.5, y - 2.2, 10, 0]
const LAYOUT = {
  names: [],
  lines: [[1, [...row(50, 550, 740), ...row(250, 550, 700), ...row(50, 550, 660)]]],
  ph: [[1, 1, DK, PH_FLAG.NUMBERED, 1, 250, 700, 550, 707.5, 697.8]],
  labels: [],
}
function side() {
  const { parts, lefts } = cutSide(whole, anchors, views)
  const l = createShapes({ kindOf: () => 'para' }), m = mirror(l)
  l.addParts(parts.map((p, i) => ({ ...p, layout: i === 0 ? LAYOUT : null })) as never)
  l.addPage(lefts[1] as never)
  return { l, m }
}
const spansOf = (S: { layout: unknown }, id: number) => [...((S.layout as { spans: Map<number, Map<number, Int32Array>> }).spans.get(id)?.get(1) ?? [])]

describe('a display\'s glyph whose text-layer box stands off its ink is the display\'s (2610.35877v1 p5)', () => {
  it('the hat between two of the display\'s glyphs in the stream, its box meeting the display\'s, goes with the display', () => {
    const { l, m } = side()
    for (const S of [l, m]) {
      const display = spansOf(S, DID), unit = spansOf(S, 1)
      expect(display.length, 'the display holds its glyphs').toBeGreaterThan(0)
      // (the token ids are the page's: its first plus its place in the page's table, the doc's order on this one-page paper)
      const first = Math.min(...display, ...unit) - Math.min(...UNIT)
      expect(display, 'the hat is the display\'s').toContain(first + HAT[0]!)
      expect(unit, 'and not its paragraph\'s').not.toContain(first + HAT[0]!)
      // (no row of the paragraph's runs is the hat alone, lit with the sentence before the display)
      expect(S.shapes.runs(1).flatMap(r => r.rows).some(w => w.x0 >= 250 && w.x1 <= 260)).toBe(false)
    }
  })
  it('a word between the display\'s glyphs in the stream whose box meets none of the display\'s stays its paragraph\'s', () => {
    const { l } = side()
    const display = spansOf(l, DID), unit = spansOf(l, 1)
    const first = Math.min(...display, ...unit) - Math.min(...UNIT)
    expect(unit).toContain(first + AWAY[0]!)
    expect(display).not.toContain(first + AWAY[0]!)
  })
})
