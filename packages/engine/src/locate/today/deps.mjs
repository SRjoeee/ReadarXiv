// What today's ink makers (locate/ledger.ts, figure-text.ts, ink-units.ts: copies of src/pdf-reader/engine/layout's at abe884b5e,
// run by locate over arXiv's page) take of the front half where its home is still JavaScript: each copied as it is from the file
// and line named (abe884b5e), so that the makers read exactly what today's read, held equal to today's by
// tests/pdf-reader/locate-ink-today.test.ts; and, re-exported, what a typed home holds (no copy is kept of a home that is typed),
// until the makers import it from there. A copy leaves when its home is typed, and this file with the last of them.

// ---- own/stream.ts spellOf, columnsAt, regionsOf, their home's own (typed by lane t4-leaves): no copy is kept of a home that is
// typed. The copy's spellOf wrote its pattern's four characters `ˆˇ˘-˝` as themselves and the home writes
// \u02c6\u02c7\u02d8-\u02dd: the same code points (U+02C6, U+02C7, U+02D8-U+02DD), one pattern; the rest same code
export { columnsAt, regionsOf, spellOf } from '../../own/stream.ts'

// ---- layout/own.mjs:64, 73, 773-835 (OWN_WORK, RULE_EM, lineRulesOf)
export const OWN_WORK = 20_000_000
export const RULE_EM = 0.1
export function lineRulesOf(pages, glyphs, boxes, max = Infinity) {
  let work = boxes.length
  const over = () => ({ rules: [], work, over: true })
  const painted = boxes.filter(([p, b]) => (pages[p - 1].paths[b] ?? -1) >= 0)
  if (!painted.length) return { rules: [], work, over: work > max }
  const lines = []
  let last = null
  for (const [p, g] of glyphs) {
    work++
    const G = pages[p - 1].glyphs[g]
    if (!/\S/.test(G.u ?? '') || !(G.size > 0)) continue
    const on = l => l.p === p && Math.abs(l.y - G.y) < 0.5 * Math.max(l.size, G.size)
    let l = last && on(last) ? last : null
    if (!l) {
      work += lines.length
      if (work > max) return over()
      l = lines.find(on) ?? null
    }
    if (l) { l.x0 = Math.min(l.x0, G.x0); l.x1 = Math.max(l.x1, G.x1); l.size = Math.max(l.size, G.size); last = l; continue }
    last = { p, y: G.y, size: G.size, x0: G.x0, x1: G.x1 }
    lines.push(last)
  }
  const box = ([p, b]) => { const B = pages[p - 1].boxes; return [B[4 * b], B[4 * b + 1], B[4 * b + 2], B[4 * b + 3]] }
  const ruled = new Map()
  let most = 0
  for (const x of painted) {
    work += lines.length
    if (work > max) return over()
    const [x0, y0, x1, y1] = box(x), mid = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0
    const l = lines.find(l => l.p === x[0] && Math.abs(mid - l.y) < 0.5 * l.size && x0 >= l.x0 - 0.5 * l.size && x1 <= l.x1 + 0.5 * l.size && h <= RULE_EM * l.size && w >= 2 * h)
    if (l) { ruled.set(x, l.size); most = Math.max(most, l.size) }
  }
  if (!ruled.size) return { rules: [], work, over: false }
  const others = painted.filter(o => {
    if (ruled.has(o)) return false
    const [a0, b0, a1, b1] = box(o)
    return Math.min(a1 - a0, b1 - b0) <= RULE_EM * most
  })
  const rules = []
  for (const [x, size] of ruled) {
    work += others.length
    if (work > max) return over()
    const [x0, y0, x1, y1] = box(x), e = y1 - y0
    const framed = others.some(o => {
      if (o[0] !== x[0]) return false
      const [a0, b0, a1, b1] = box(o)
      return Math.min(a1 - a0, b1 - b0) <= RULE_EM * size && a0 <= x1 + e && x0 - e <= a1 && b0 <= y1 + e && y0 - e <= b1
    })
    if (!framed) rules.push(x)
  }
  return { rules, work, over: false }
}

// ---- source/latex-front.ts EMAIL_ADDRESS and ADDRESS_GROUP, their home's own (an e-mail address as a text writes it,
// keepAddresses'; several at one domain written once, keepGroups'): no copy is kept of a home that is typed
export { ADDRESS_GROUP, EMAIL_ADDRESS } from '../../source/latex-front.ts'

// ---- source/latex-front.ts identifiersIn, its home's own (each identifier of a text; keepIdentifiers'): no copy is kept of a
// home that is changed or typed
export { identifiersIn } from '../../source/latex-front.ts'

// ---- instrument/mt.ts utf8, its home's own (no copy is kept of a home that is typed)
export { utf8 } from '../../instrument/mt.ts'
