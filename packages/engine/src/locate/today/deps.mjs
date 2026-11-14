// What today's ink makers (locate/ink-units.ts: a copy of src/pdf-reader/engine/layout's at abe884b5e, run by locate over arXiv's
// page) take of own/own, whose home is still JavaScript: copied as it is from the file and line named (abe884b5e), so that the
// maker reads exactly what today's reads. Every other name the makers take of the front half they import from its typed home;
// this file goes when own/own is typed.

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
