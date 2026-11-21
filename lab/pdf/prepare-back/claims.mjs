// lab/pdf/prepare-back/claims.mjs: the A glyphs locate gives a unit that have no partner on B (the neighbour claim), each
// classed (run.mjs --claims; claims-sum.mjs sums them over a run). A glyph a member owns on A with no partner on B came from
// the claim alone (every other A glyph of a member is a matched one's partner). Classes, first that holds: `hyphen` a hyphen
// at the end of an A line (align's lineEnd) in the font of the matched glyph before it; `form` drawn inside a form XObject;
// `font` in another font than both matched neighbours; `off` off every line of the unit's matched glyphs (no line of them on
// its page holds its baseline within half a size); `other`. Each with its hunk's class and what B holds in the hunk. Not
// shipped.
import { cutLines, hunkName } from '@readarxiv/engine'

const HYPHENS = new Set(['-', '‐', '­', '‑'])

export function claimsOf(ins, tally) {
  const m = tally.mapping
  const L = tally.locatedAll
  const pagesA = tally.pagesA.map(p => p.page)
  const NA = m.offA[pagesA.length]
  const pageA = new Int32Array(NA)
  pagesA.forEach((pg, p) => { for (let j = 0; j < pg.glyphs.length; j++) pageA[m.offA[p] + j] = p + 1 })
  const gA = a => pagesA[pageA[a] - 1].glyphs[a - m.offA[pageA[a] - 1]]
  const NB = m.offB[ins.ink.pages.length]
  const unitB = new Int32Array(NB).fill(-1)
  ins.ink.pages.forEach((pg, p) => { const ow = ins.glyphs[p]; if (ow) for (let j = 0; j < pg.glyphs.length; j++) unitB[m.offB[p] + j] = ow.unit[j] })
  const pageB = new Int32Array(NB)
  ins.ink.pages.forEach((pg, p) => { for (let j = 0; j < pg.glyphs.length; j++) pageB[m.offB[p] + j] = p + 1 })
  const gB = b => ins.ink.pages[pageB[b] - 1].glyphs[b - m.offB[pageB[b] - 1]]
  const lineEnd = a => {
    if (a + 1 >= NA || pageA[a + 1] !== pageA[a]) return true
    const g = gA(a), h = gA(a + 1)
    return Math.abs(h.y - g.y) > 0.5 * Math.max(h.size, g.size) || h.x0 < g.x0
  }
  const out = []
  for (const mem of L.members) {
    if (mem.unit < 0 || !mem.located) continue
    const mine = [...mem.text, ...mem.label, ...[...mem.els.values()].flat()].sort((x, y) => x - y)
    const claimed = mine.filter(a => m.aToB[a] < 0)
    if (!claimed.length) continue
    const matched = mine.filter(a => m.aToB[a] >= 0)
    const lines = cutLines(matched, a => ({ page: pageA[a], g: gA(a) }))
    for (const a of claimed) {
      const g = gA(a)
      let pv = a - 1
      while (pv >= 0 && m.aToB[pv] < 0) pv--
      let nx = a + 1
      while (nx < NA && m.aToB[nx] < 0) nx++
      const P = gA(pv), N = gA(nx)
      const bp = m.aToB[pv], bn = m.aToB[nx]
      // (what B holds between the two partners: its glyphs' owners)
      const bSide = { mine: 0, others: 0, none: 0, text: '' }
      if (bp >= 0 && bn > bp) for (let b = bp + 1; b < bn && b - bp < 400; b++) {
        if (m.bToA[b] >= 0) continue
        const o = unitB[b]
        if (o === mem.unit) bSide.mine++
        else if (o < 0) bSide.none++
        else bSide.others++
        if (bSide.text.length < 60) bSide.text += gB(b).u
      }
      const onLine = lines.some(l => l.page === pageA[a] && Math.abs(l.base - g.y) < 0.5 * Math.max(l.most, g.size))
      const cls = HYPHENS.has(g.u) && lineEnd(a) && g.base === P.base ? 'hyphen' : g.form ? 'form' : g.base !== P.base && g.base !== N.base ? 'font' : !onLine ? 'off' : 'other'
      // (for a glyph of no class of construction: the unit's B glyphs of its Unicode on its page, and where their partners are)
      const twins = cls === 'other' ? [] : undefined
      if (twins) for (let b = m.offB[pageA[a] - 1]; b < m.offB[pageA[a]] && twins.length < 12; b++) if (unitB[b] === mem.unit && gB(b).u === g.u) twins.push({ b, x0: +gB(b).x0.toFixed(2), y: +gB(b).y.toFixed(2), base: gB(b).base, a: m.bToA[b], ax0: m.bToA[b] >= 0 ? +gA(m.bToA[b]).x0.toFixed(2) : null, ay: m.bToA[b] >= 0 ? +gA(m.bToA[b]).y.toFixed(2) : null })
      out.push({ a, ord: mem.ord, unit: mem.unit, kind: mem.kind, page: pageA[a], u: g.u, blank: !/\S/.test(g.u), base: g.base, x0: g.x0, y: g.y, size: g.size, form: !!g.form, nForm: !!P.form || !!N.form, hunk: hunkName(m.hunkA[a]), cls, bSide, place: mem.place, ...(twins ? { twins } : {}) })
    }
  }
  // (runs: consecutive claimed glyphs of one member, with the A stream's text around them)
  const runs = []
  for (const c of out) {
    const r = runs.at(-1)
    if (r && r.ord === c.ord && r.to === c.a - 1) { r.to = c.a; r.glyphs.push(c); continue }
    runs.push({ ord: c.ord, from: c.a, to: c.a, glyphs: [c] })
  }
  const textAt = (lo, hi, p) => { let s = ''; for (let a = Math.max(0, lo); a <= Math.min(NA - 1, hi); a++) if (pageA[a] === p) s += gA(a).u; return s }
  for (const r of runs) {
    const p = pageA[r.from]
    r.page = p
    r.text = r.glyphs.map(c => c.u).join('')
    r.before = textAt(r.from - 30, r.from - 1, p)
    r.after = textAt(r.to + 1, r.to + 30, p)
  }
  return { glyphs: out, runs }
}
