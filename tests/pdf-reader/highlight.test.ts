import { describe, expect, it } from 'vitest'
import { type Anchor, type DocToken, lineRects, tokenizeDocument } from '@/pdf-reader/engine/anchors.mjs'
import { blockOf, clickOf, hitOf, layoutOf, pageGeometry, runsOf } from '@/pdf-reader/engine/highlight.mjs'

// What a unit paints on a side and where the pointer lights it (highlight.mjs): the pages given as PDF.js's text items,
// each unit's tokens as anchorUnits would give them. A page is 600 wide; body text is 10 high on lines 12 apart, its
// glyphs from 2.2 under the baseline to 7.5 over it

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean; fontName: string }
/** a text item: `str` at (x, y), each character 5 units wide unless `width` says */
const item = (str: string, x: number, y: number, { width = str.length * 5, size = 10, eol = false } = {}): Item => ({ str, transform: [size, 0, 0, size, x, y], width, height: size, hasEOL: eol, fontName: 'f' })
/** a justified line of text from x0 to x1: one item, as wide as the measure */
const line = (s: string, y: number, x0 = 50, x1 = 300) => item(s, x0, y, { width: x1 - x0, eol: true })
/** n justified lines of eight words from y downwards */
const prose = (y: number, n: number, x0 = 50, x1 = 300) => Array.from({ length: n }, (_, i) => line('text text text text text text text text', y - 12 * i, x0, x1))
const VIEW = [0, 0, 600, 800]
const docOf = (pages: Item[][]) => tokenizeDocument(pages.map((items, i) => ({ page: i + 1, items, styles: {} })))
/** the layout of `pages` with each unit's tokens; the prose no unit given takes is a unit of its own on each page, as
 *  every paragraph of a paper is (the column edges are the units' lines') */
function side(pages: Item[][], units: [number, number[]][], kinds = new Map<number, string>(), views = pages.map(() => VIEW)) {
  const doc = docOf(pages)
  const used = new Set(units.flatMap(([, ks]) => ks))
  const rest = pages.map((_, i) => [1000 + i, doc.flatMap((t, k) => (t.page === i + 1 && t.t === 'text' && !used.has(k) ? [k] : []))] as [number, number[]]).filter(([, ks]) => ks.length)
  const anchors = new Map<number, Anchor | null>([...units, ...rest].map(([id, tokens]) => [id, { tokens, rects: lineRects(doc, tokens), coverage: 1, bounded: true }]))
  return layoutOf(doc, views, anchors, id => kinds.get(id))
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const at = (doc: DocToken[], t: string, from = 0) => doc.findIndex((d, k) => k >= from && d.t === t)
const r2 = (v: number) => Math.round(v * 100) / 100
/** the i-th of a list, which the test expects there */
const nth = <T>(xs: readonly T[], i = 0): T => { const x = xs[i]; if (x === undefined) throw new Error(`no item ${i} of ${xs.length}`); return x }
const across = (run: { x0: number; x1: number }) => [r2(run.x0), r2(run.x1)]

describe('layoutOf: the document\'s column text edges', () => {
  // two-sided: odd pages' text from 50 to 300, even pages' from 70 to 320; page 3 holds one paragraph around two
  // displays, none of its lines as long as the measure, so that its own lines would give no edges
  const pages = [prose(700, 20), prose(700, 20, 70, 320), [line('the unit starts here', 700, 50, 180), item('x = y', 140, 676), item('a + b', 150, 652), line('and it ends with some more words here', 628, 50, 298)]]
  const d = docOf(pages)

  it('a page of displays takes the document\'s edges, from every page\'s long lines: its unit snaps to the measure', () => {
    const run = nth(runsOf(side(pages, [[0, range(at(d, 'the'), d.length - 1)]]), 0))
    expect(run.page).toBe(3)
    expect(across(run)).toEqual([50, 300])
  })

  it('an even page\'s unit keeps to the even pages\' edges', () => {
    expect(across(nth(runsOf(side(pages, [[1, range(160, 175)]]), 1)))).toEqual([70, 320])
  })

  it('a page of another size keeps to its own edges: a landscape page\'s text does not widen a portrait page\'s', () => {
    // pages 1 and 3 odd, page 3 landscape (800 × 600) with its text from 50 to 750; on page 1 an overfull display
    const ps = [[...prose(700, 20), item('x = a + b + c', 60, 450, { width: 280 }), ...prose(430, 4)], prose(700, 20), prose(500, 20, 50, 750)]
    const d = docOf(ps), x = at(d, 'x'), p3 = d.findIndex(t => t.page === 3)
    const L = side(ps, [[0, range(x - 8, x + 11)], [1, range(p3 + 8, p3 + 23)]], new Map(), [VIEW, VIEW, [0, 0, 800, 600]])
    expect(across(nth(runsOf(L, 0)))).toEqual([50, 306])
    expect(across(nth(runsOf(L, 1)))).toEqual([50, 750])
  })
})

describe('runsOf: a unit\'s runs, one per page and column, and their rows', () => {
  it('a display\'s zig-zag — numerator, main line, denominator, a limit, its number — is one row between the text\'s', () => {
    // four lines of text, a display — 1 over n beside f =, its number at the right, a limit under a sum — then two
    const pages = [[...prose(760, 4), ...prose(700, 4), item('1', 140, 647, { size: 7 }), item('f =', 120, 640), item('n', 140, 633.5, { size: 7 }), item('(3)', 285, 640, { width: 15 }), item('i', 160, 630, { size: 5 }), ...prose(616, 2), ...prose(560, 20)]]
    const run = nth(runsOf(side(pages, [[0, range(32, 84)]]), 0))
    expect(run.rows.length).toBe(7)
    const display = nth(run.rows, 4)
    // from the numerator's top to the limit's foot, across to the number
    expect(display.y1).toBeCloseTo(647 + 0.75 * 7)
    expect(display.y0).toBeCloseTo(630 - 0.22 * 5)
    expect(display.x1).toBeCloseTo(300)
    // the boundaries between rows are the midpoints between them, falling
    expect(nth(run.mids, 3)).toBeCloseTo((nth(run.rows, 3).y0 + display.y1) / 2)
    for (let i = 1; i < run.mids.length; i++) expect(nth(run.mids, i)).toBeLessThan(nth(run.mids, i - 1))
  })

  it('lines of text 12 apart are rows of their own', () => {
    const pages = [prose(700, 30)]
    expect(nth(runsOf(side(pages, [[0, range(0, 39)]]), 0)).rows.length).toBe(5)
  })

  it('two columns: a unit that goes on at the top of the right column is two runs, each inside its column', () => {
    const pages = [[...prose(700, 30, 50, 290), ...prose(700, 30, 310, 550)]]
    // the left column's last three lines and the right column's first two
    const runs = runsOf(side(pages, [[0, range(8 * 27, 8 * 32 - 1)]]), 0)
    expect(runs.map(r => [r.col, ...across(r), r.rows.length])).toEqual([['L', 50, 290, 3], ['R', 310, 550, 2]])
  })

  it('two columns: an overfull display that passes the page\'s middle stays in its column, clamped 6 past its edge', () => {
    // the left column's lines from 50 to 290, a display in it running on to 305 (past the middle, 300, short of the
    // right column's text by more than the overhang): no full-width block over both columns
    const pages = [[...prose(700, 20, 50, 290), line('the paragraph ends with a display', 460, 50, 290), item('x = a + b + c + d', 60, 440, { width: 245 }), ...prose(420, 10, 50, 290), ...prose(700, 30, 310, 550)]]
    const d = docOf(pages), s = at(d, 'the')
    const runs = runsOf(side(pages, [[0, range(s, at(d, 'd', s))]]), 0)
    expect(runs.map(r => [r.col, ...across(r)])).toEqual([['L', 50, 296]])
  })

  it('two columns: a short line centred on the gutter, in neither column\'s text, is the page\'s: not clamped into the left column', () => {
    // a heading of 32 units at 284–316 (the review of B1's fix round: a run of 284–296), and one of 60 at 270–330
    const pages = (x0: number, x1: number) => [[...prose(740, 20, 50, 290), ...prose(740, 20, 310, 550), item('Results', x0, 480, { width: x1 - x0, eol: true }), ...prose(460, 20, 50, 290), ...prose(460, 20, 310, 550)]]
    for (const [x0, x1] of [[284, 316], [270, 330]] as const) {
      const ps = pages(x0, x1), h = at(docOf(ps), 'results')
      expect(runsOf(side(ps, [[0, [h]]], new Map([[0, 'heading']])), 0).map(r => [r.col, ...across(r)])).toEqual([['F', x0, x1]])
    }
  })

  it('two columns: a paragraph around a full-width display (revtex widetext) is cut by it, its own, in each column', () => {
    // left above, right above, the display across both columns, left below: four runs, none overlapping another
    const pages = [[...prose(740, 4, 50, 290), line('words above on the left of it', 692, 50, 290), line('more words above it on the left', 680, 50, 290), ...prose(740, 4, 310, 550), line('words above on the right of it', 692, 310, 550), line('more words above on the right', 680, 310, 550),
      item('x = y + z', 150, 656, { width: 300 }), line('words below on the left of it', 632, 50, 290), line('more words below on the left', 620, 50, 290), ...prose(608, 20, 50, 290), ...prose(632, 20, 310, 550)]]
    // the unit: the lines at 692 and 680 in both columns, the display at 656, the left column's lines at 632 and 620
    const unit = docOf(pages).flatMap((t, k) => ([692, 680, 656].includes(t.y) || ([632, 620].includes(t.y) && t.x < 300) ? [k] : []))
    const runs = runsOf(side(pages, [[0, unit]]), 0)
    // a column's runs from the top, the columns as the unit's words first reach them
    expect(runs.map(r => [r.col, r.rows.length, r.top > 670])).toEqual([['L', 2, true], ['L', 2, false], ['R', 2, true], ['F', 1, false]])
    for (const a of runs) for (const b of runs) if (a !== b) expect(Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.top, b.top) > Math.max(a.bottom, b.bottom)).toBe(false)
  })

  it('a column break over a page: one run on each page', () => {
    const runs = runsOf(side([prose(700, 30), prose(700, 30)], [[0, range(8 * 28, 8 * 32 - 1)]]), 0)
    expect(runs.map(r => [r.page, r.rows.length])).toEqual([[1, 2], [2, 2]])
  })

  it('a run is split where another unit\'s line stands between its rows in the column: a float set inside a paragraph', () => {
    const pages = [[...prose(700, 3), line('Table 1: a caption between', 652, 100, 250), ...prose(628, 3), ...prose(580, 20)]]
    const cap = at(docOf(pages), 'table')
    const layout = side(pages, [[0, [...range(0, 23), ...range(cap + 5, cap + 5 + 23)]], [1, range(cap, cap + 4)]])
    expect(runsOf(layout, 0).map(r => r.rows.length)).toEqual([3, 3])
  })

  it('an overfull display keeps up to 6 units past the column\'s edge; an edge within 3 units is the edge', () => {
    const pages = [[...prose(700, 20), line('short line ends near the edge', 460, 50, 298), item('x = a + b + c', 60, 440, { width: 245 }), line('and a longer display after it', 416), item('y = a + b + c', 60, 400, { width: 280 }), ...prose(380, 10)]]
    const d = docOf(pages), s = at(d, 'short')
    expect(across(nth(runsOf(side(pages, [[0, range(s, s + 5)]]), 0)))).toEqual([50, 300])
    expect(across(nth(runsOf(side(pages, [[0, range(s, at(d, 'x') + 3)]]), 0)))).toEqual([50, 305])
    expect(across(nth(runsOf(side(pages, [[0, range(s, at(d, 'y') + 3)]]), 0)))).toEqual([50, 306])
  })

  it('a table wider than the measure: a cell past the column\'s edge keeps its own ink (a float is not clamped)', () => {
    const pages = [[...prose(740, 20), item('cell', 320, 480, { eol: true }), ...prose(460, 10)]]
    const c = at(docOf(pages), 'cell')
    expect(across(nth(runsOf(side(pages, [[0, [c]]], new Map([[0, 'cell']])), 0)))).toEqual([320, 340])
  })

  it('a fraction\'s denominator hanging under a paragraph\'s last line is inside its block', () => {
    // the last line's inline fraction: numerator and denominator 7 high, 4 over and 4 under its baseline
    const pages = [[...prose(740, 20), ...prose(500, 2), item('last words', 50, 476, { width: 100 }), item('a', 160, 480, { size: 7 }), item('b', 160, 472, { size: 7, eol: true }), ...prose(440, 10)]]
    const d = docOf(pages), s = at(d, 'text', 160), b = at(d, 'b')
    const run = nth(runsOf(side(pages, [[0, range(s, b)]]), 0))
    expect(blockOf(run, 2).y0).toBeLessThanOrEqual(472 - 0.22 * 7)
    expect(blockOf(run, 2).y1).toBeCloseTo(500 + 7.5 + run.lead)
  })

  it('a unit ends after its closing mark: a CJK full stop inks half its em', () => {
    // a heading of a translation, two characters and a full stop in a 30-unit item
    const pages = [[...prose(740, 20), item('引言。', 50, 480, { width: 30, eol: true }), ...prose(460, 10)]]
    const h = at(docOf(pages), '引')
    expect(across(nth(runsOf(side(pages, [[0, [h, h + 1]]], new Map([[0, 'heading']])), 0)))).toEqual([50, 75])
  })

  it('a proof\'s box set apart to the column\'s edge is its last word\'s ink; a row of cells reaching the edge is not', () => {
    // a one-line proof, its box flush right at the edge (300); a cell, then three cells of a dash, the last at the edge
    const pages = [[...prose(740, 20), item('Trivial.', 50, 480), item('∎', 292, 480, { width: 8, eol: true }), item('cell', 50, 456), item('–', 150, 456), item('–', 220, 456), item('–', 292, 456, { width: 8, eol: true }), ...prose(432, 10)]]
    const d = docOf(pages), t = at(d, 'trivial'), c = at(d, 'cell')
    expect(across(nth(runsOf(side(pages, [[0, [t]]]), 0)))).toEqual([50, 300])
    expect(across(nth(runsOf(side(pages, [[0, [c]]], new Map([[0, 'cell']])), 0)))).toEqual([50, 70])
  })

  it('a theorem\'s head before its first word, which is no unit\'s, is in its block', () => {
    const pages = [[...prose(740, 20), item('Theorem 1.', 50, 480), item('Every word here is the theorem\'s own', 110, 480, { width: 190, eol: true }), ...prose(468, 10)]]
    const t = at(docOf(pages), 'every')
    expect(across(nth(nth(runsOf(side(pages, [[0, range(t, t + 7 + 16)]]), 0)).rows))).toEqual([50, 300])
    // after another unit's words on the line, only what follows them: a run-in heading is its own
    expect(across(nth(nth(runsOf(side(pages, [[0, range(t, t + 7 + 16)], [1, [t - 2]]]), 0)).rows))).toEqual([90, 300])
  })
})

describe('runsOf: what lies between a unit\'s words and is no unit\'s is its own, in running text', () => {
  // a line whose words end at 200, then an inline fraction's pieces set higher and lower, to 280 (anchorUnits' `between`
  // refuses such pieces when they leave the band of the words around them), then the next line's words
  const pages = [[...prose(740, 20), item('the last words', 50, 480, { width: 150 }), item('1', 230, 484, { size: 7 }), item('n', 230, 477, { size: 7 }), item('E Tr', 240, 480, { width: 40, eol: true }), line('then the text goes on here', 468), ...prose(456, 10)]]
  const d = docOf(pages), s = at(d, 'the', 160), t = at(d, 'then'), unit = [...range(s, s + 2), ...range(t, t + 5)]

  it('an inline formula `between` refused is taken into its row', () => {
    expect(across(nth(nth(runsOf(side(pages, [[0, unit]]), 0)).rows))[1]).toBe(280)
  })
  it('not in a caption, whose float would come with it', () => {
    expect(across(nth(nth(runsOf(side(pages, [[0, unit]], new Map([[0, 'caption']])), 0)).rows))[1]).toBe(200)
  })
  it('not where another unit\'s words stand among them', () => {
    expect(across(nth(nth(runsOf(side(pages, [[0, unit], [1, [at(d, 'tr', s)]]]), 0)).rows))[1]).toBe(200)
  })
})

describe('hitOf: the pointer lights what is painted, exactly', () => {
  // two paragraphs of three lines, a run-in heading on the second's first line
  const pages = [[...prose(740, 20), ...prose(496, 3), item('Heading.', 50, 460, { width: 40 }), item('the paragraph under a heading goes on', 95, 460, { width: 205, eol: true }), ...prose(448, 2), ...prose(424, 10)]]
  const h = at(docOf(pages), 'heading')
  // the heading given after its paragraph: the smaller wins, not the first found
  const layout = side(pages, [[0, range(160, 183)], [2, range(h + 1, h + 7 + 16)], [1, [h]]], new Map([[1, 'heading']]))
  const px = 2

  it('every point inside a unit\'s painted block lights it, or a smaller unit painted over it', () => {
    for (const id of [0, 2]) for (const run of runsOf(layout, id)) {
      const b = blockOf(run, px)
      for (let x = b.x0 + 0.25; x < b.x1; x += 1.5) for (let y = b.y0 + 0.25; y < b.y1; y += 1.5) {
        const hit = hitOf(layout, 1, x, y, px)?.id
        expect(hit === id || hit === 1, `${id} at ${x}, ${y}: ${hit}`).toBe(true)
      }
    }
  })
  it('nothing lights outside every block; the heading, smaller, wins over the paragraph it runs into', () => {
    expect(hitOf(layout, 1, 20, 470, px)).toBeNull()
    expect(hitOf(layout, 1, 60, 463, px)?.id).toBe(1)
    expect(hitOf(layout, 1, 200, 463, px)?.id).toBe(2)
  })
  it('the blocks are padded by half the leading above and below: two paragraphs\' blocks meet between them', () => {
    const p = nth(runsOf(layout, 0)), q = nth(runsOf(layout, 2))
    expect(p.lead).toBeCloseTo(1.15)
    expect(blockOf(p, px).y0).toBeCloseTo(blockOf(q, px).y1)
  })
  it('a footnote\'s blocks are padded by half its own lines\' leading; a page of few of them takes the document\'s', () => {
    // body text 10 high on lines 12 apart (a gap of 2.3); footnotes 8 high on lines 9 apart (7.76 high: a gap of 1.24)
    const note = (y: number, n: number) => Array.from({ length: n }, (_, i) => item('note note note note note note note note', 50, y - 9 * i, { width: 250, size: 8, eol: true }))
    const ps = [[...prose(740, 30), ...note(100, 4)], [...prose(740, 30), ...note(100, 2)]]
    const d = docOf(ps), a = at(d, 'note'), b = at(d, 'note', a + 32)
    const L = side(ps, [[0, range(a, a + 31)], [1, range(b, b + 15)]], new Map([[0, 'footnote'], [1, 'footnote']]))
    expect(nth(runsOf(L, 0)).lead).toBeCloseTo(0.62)
    expect(nth(runsOf(L, 1)).lead).toBeCloseTo(0.62)
    expect(nth(runsOf(L, 1000)).lead).toBeCloseTo(1.15)
  })
  it('a paragraph\'s pads are its interline space\'s, not its displays\' skips', () => {
    // four lines 12 apart (gaps of 2.3), then lines and displays alternating 15.7 apart (gaps of 6): more skips than spaces
    const ys = [700, 688, 676, 664, 648.3, 632.6, 616.9, 601.2]
    const ps = [[...prose(780, 6), ...ys.map(y => line('para para para para para para para para', y)), ...prose(560, 10)]]
    const d = docOf(ps), a = at(d, 'para')
    const L = side(ps, [[0, range(a, a + 63)]], new Map([[0, 'para']]))
    expect(nth(runsOf(L, 0)).lead).toBeCloseTo(1.15)
  })
  it('a page\'s geometry is made once, on its first use', () => {
    expect(pageGeometry(layout, 1)).toBe(pageGeometry(layout, 1))
  })
})

describe('clickOf: what a click levels the two sides by (session.mjs alignClick)', () => {
  // a paragraph: three lines, a display set in the middle of the measure, two lines
  const pages = [[...prose(740, 20), ...prose(496, 3), item('x = y', 150, 456), ...prose(436, 2), ...prose(400, 10)]]
  const layout = side(pages, [[0, range(160, 201)]])
  const px = 2
  it('a click in the pad above the first line is the unit\'s first line, at its top', () => {
    expect(clickOf(layout, 1, 100, 504.2, px)).toEqual({ id: 0, line: 0, f: 0 })
  })
  it('a click in the white space beside a display is the display\'s line, as far down it as the click', () => {
    const c = clickOf(layout, 1, 60, 458, px)
    expect([c?.id, c?.line]).toEqual([0, 3])
    expect(c?.f).toBeCloseTo((463.5 - 458) / 9.7)
  })
  it('a click between two of its lines is the nearer one\'s', () => {
    expect(clickOf(layout, 1, 100, 448, px)).toMatchObject({ id: 0, line: 4, f: 0 })
  })
  it('nothing outside what is painted: the click goes by what is around it', () => {
    expect(clickOf(layout, 1, 20, 480, px)).toBeNull()
  })
})
