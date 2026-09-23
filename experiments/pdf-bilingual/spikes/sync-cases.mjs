// The sync's pure part (poc-reader/sync.mjs) on made-up layouts: a one-column pair is level line by line, the map rises
// everywhere and meets both ends, and the reading chain drops a unit found out of order. Exits non-zero on a failure.
import assert from 'node:assert/strict'
import { flowChain, knots, lineTable, makeMap, posAt } from '../poc-reader/sync.mjs'

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

let failed = 0
for (const [name, run] of cases) { try { run(); console.log('ok  ', name) } catch (e) { failed++; console.log('FAIL', name, '—', e.message.split('\n')[0]) } }
process.exitCode = failed ? 1 : 0
