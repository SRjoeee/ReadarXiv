// The sync's pure part (src/pdf-reader/engine/sync.mjs) on made-up layouts: a one-column pair is level line by line, the map rises
// everywhere and meets both ends, and the reading chain drops a unit found out of order. And what a click levels by
// (highlight.mjs clickOf, through session.mjs alignClick): a click anywhere in what the highlight paints is the unit's —
// its pads, a display's white space, a float set inside its block — and is levelled by the unit; off it, by what is
// around it. Exits non-zero on a failure.
import assert from 'node:assert/strict'
import { lineRects, tokenizeDocument } from '../../../src/pdf-reader/engine/anchors.mjs'
import { clickOf, layoutOf } from '../../../src/pdf-reader/engine/highlight.mjs'
import { flowChain, knots, lineTable, makeMap, posAt } from '../../../src/pdf-reader/engine/sync.mjs'

/** units of `n` lines each, one column, line height h, a gap g between units, starting at y0 */
function column(counts, { h, g, y0 }) {
  let y = y0
  return counts.map(n => { const lines = Array.from({ length: n }, () => { const l = { top: y, bot: y + h, page: 1, band: 'full' }; y += h; return l }); y += g; return lines })
}
const cases = []
{
  const L = column([3, 5, 2, 4], { h: 12, g: 10, y0: 50 }), R = column([4, 7, 2, 6], { h: 14, g: 16, y0: 60 })
  const units = L.map((lines, i) => ({ id: i, L: { stream: i, lines }, R: { stream: i, lines: R[i] } }))
  const chain = flowChain(units), tL = lineTable(chain, 'L'), tR = lineTable(chain, 'R')
  const B = makeMap(knots(chain, tL, tR, { endL: 400, endR: 600 }))
  cases.push(['one column: every line start of either side is level', () => {
    for (const t of [tL, tR]) for (const l of t) { const a = posAt(tL, l.lam0), b = posAt(tR, l.lam0); assert.ok(Math.abs(B.ltr(a) - b) < 0.5, `λ ${l.lam0}: ${B.ltr(a)} vs ${b}`) }
  }])
  cases.push(['the map rises and meets both ends, both ways', () => {
    let prev = -Infinity
    for (let y = 0; y <= 400; y += 0.5) { const v = B.ltr(y); assert.ok(v >= prev - 1e-9, `falls at ${y}`); prev = v }
    assert.ok(Math.abs(B.ltr(0)) < 1e-6 && Math.abs(B.ltr(400) - 600) < 1e-6 && Math.abs(B.rtl(600) - 400) < 1e-6)
  }])
}
cases.push(['a unit found out of order on one side leaves the chain', () => {
  const u = (id, a, b) => ({ id, L: { stream: a, lines: [{}] }, R: { stream: b, lines: [{}] } })
  assert.deepEqual(flowChain([u(0, 1, 1), u(1, 2, 9), u(2, 3, 3), u(3, 4, 4)]).map(x => x.id), [0, 2, 3])
}])

{
  // a page 600 × 800: body text 10 high on lines 12 apart from 50 to 300; a paragraph of three lines, a display set in
  // the middle of the measure, two lines; a paragraph around a wrapped figure — four lines short of it, two under it —
  // the figure's label a unit of its own
  const item = (str, x, y, width = str.length * 5) => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10, hasEOL: true, fontName: 'f' })
  const prose = (y, n, word = 'text', x1 = 300) => Array.from({ length: n }, (_, i) => item(`${word} `.repeat(8).trim(), 50, y - 12 * i, x1 - 50))
  const items = [...prose(740, 20), ...prose(496, 3, 'para'), item('x = y', 150, 456), ...prose(436, 2, 'para'), ...prose(400, 4, 'wrap', 200), item('Fig', 250, 376, 15), ...prose(352, 2, 'wrap'), ...prose(328, 8)]
  const doc = tokenizeDocument([{ page: 1, items, styles: {} }])
  const of = (...ts) => doc.flatMap((d, k) => (ts.includes(d.t) ? [k] : []))
  const para = of('para', 'x', 'y'), wrap = of('wrap'), body = of('text')
  const anchors = new Map([[0, para], [1, wrap], [2, body.filter(k => k < para[0])], [3, body.filter(k => k > wrap.at(-1))], [4, of('fig')]].map(([id, tokens]) => [id, { tokens, rects: lineRects(doc, tokens), coverage: 1, bounded: true }]))
  const L = layoutOf(doc, [[0, 0, 600, 800]], anchors, id => (id === 4 ? 'figure' : undefined))
  // a click there, in PDF units: the unit and its line, or null (placeAt)
  const click = (x, y) => { const c = clickOf(L, 1, x, y, 2.25); return c && [c.id, c.line] }
  cases.push(['a click in a block\'s pad above its first line is levelled by the unit, at its first line', () => assert.deepEqual(click(100, 504.2), [0, 0])])
  cases.push(['a click in a block\'s pad beside its lines is levelled by the unit, at the line there', () => assert.deepEqual(click(48.5, 479), [0, 2])])
  cases.push(['a click in the white space beside a display is levelled by the unit, at the display\'s line', () => assert.deepEqual(click(60, 458), [0, 3])])
  cases.push(['a click on a float set inside a paragraph\'s block is levelled by the paragraph, at the line beside it', () => assert.deepEqual(click(240, 378), [1, 2])])
  cases.push(['a click on the float\'s own text, a unit painted over the paragraph, is that unit\'s', () => assert.deepEqual(click(257, 378), [4, 0])])
  cases.push(['a click beside every block goes by what is around it', () => assert.equal(click(20, 480), null)])
}

let failed = 0
for (const [name, run] of cases) { try { run(); console.log('ok  ', name) } catch (e) { failed++; console.log('FAIL', name, '—', e.message.split('\n')[0]) } }
process.exitCode = failed ? 1 : 0
