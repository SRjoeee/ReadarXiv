// lab/pdf/prepare-back/hidden.mjs: the members of a paper whose every glyph arXiv's own page paints over (run.mjs --hidden; the
// lane fresh-fixes' census, 2026-11-11). Not shipped. A glyph is hidden where a shape painted after it (pageInk's paint order:
// its boxAt, the boxes painted before it) is an opaque fill (pageInk's `opaque`: a fill of a colour at alpha 1, no blend mode,
// no soft mask, every clip a rectangle on the page's axes) whose box and outline hold its ink box (ix0-ix1 across, its font's
// band up and down); `unseen` where pageInk reads it shows nothing at all (outside its clip, alpha 0). A member is wholly hidden
// where every glyph of its text is (blank ones aside), partly where some are. Each with its kind, its state (the bundle's
// stateOf: wrapped, or why not), its characters, its lines on A; and the cost: each page's opaque fills, the glyph-fill box
// tests (`checks`: each glyph against each opaque fill painted after it, as this scan makes them; an index of the fills by place
// would make fewer) and the outline tests (`pairs`: a fill painted after the glyph whose box holds its ink box). Turned glyphs
// (a figure text set turned, pageInk's `turned`) are not read: a member of them alone is in no count.
import { stateOf } from '@readarxiv/engine'

/** whether point (x, y) is inside an outline of segments [x0, y0, x1, y1, …] by the nonzero rule */
function inside(segs, x, y) {
  let w = 0
  for (let i = 0; i < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3]
    if (ay <= y) {
      if (by > y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) > 0) w++
    } else if (by <= y && (bx - ax) * (y - ay) - (x - ax) * (by - ay) < 0) w--
  }
  return w !== 0
}

export function hiddenOf(tally) {
  const L = tally.locatedAll
  const m = tally.mapping
  const addOn = tally.addOn
  const pages = []
  const hiddenAt = new Map()
  let pairs = 0, checks = 0, opaque = 0, glyphsAll = 0, unaligned = 0
  tally.pagesA.forEach((pa, p) => {
    const raw = pa.raw, doc = pa.page
    const off = m.offA[p]
    if (!raw?.glyphs?.length || raw.glyphs.length !== doc.glyphs.length || raw.glyphs.some((g, j) => g.u !== doc.glyphs[j].u)) {
      if (doc.glyphs.length) unaligned++
      pages.push({ page: p + 1, aligned: false })
      return
    }
    const fills = []
    for (const [k, s] of raw.shapes ?? []) if (s.opaque) fills.push(k)
    fills.sort((a, b) => a - b)
    opaque += fills.length
    glyphsAll += raw.glyphs.length
    let hid = 0, pagePairs = 0, pageChecks = 0
    raw.glyphs.forEach((g, j) => {
      if (g.unseen) { hiddenAt.set(off + j, 'unseen'); hid++; return }
      const x0 = Math.min(g.ix0, g.ix1), x1 = Math.max(g.ix0, g.ix1), y0 = Math.min(g.bottom, g.top), y1 = Math.max(g.bottom, g.top)
      const after = raw.boxAt[j] ?? Infinity
      for (const k of fills) {
        if (k < after) continue
        pageChecks++
        const b = [raw.boxes[4 * k], raw.boxes[4 * k + 1], raw.boxes[4 * k + 2], raw.boxes[4 * k + 3]]
        if (!(Math.min(b[0], b[2]) <= x0 && Math.max(b[0], b[2]) >= x1 && Math.min(b[1], b[3]) <= y0 && Math.max(b[1], b[3]) >= y1)) continue
        pagePairs++
        const segs = raw.shapes.get(k).segs
        if (inside(segs, x0, y0) && inside(segs, x1, y0) && inside(segs, x0, y1) && inside(segs, x1, y1)) {
          hiddenAt.set(off + j, k)
          hid++
          break
        }
      }
    })
    pairs += pagePairs
    checks += pageChecks
    pages.push({ page: p + 1, aligned: true, glyphs: raw.glyphs.length, opaque: fills.length, checks: pageChecks, pairs: pagePairs, hidden: hid })
  })
  const gA = (a) => {
    let p = 0
    while (m.offA[p + 1] !== undefined && m.offA[p + 1] <= a) p++
    return { p, g: tally.pagesA[p].page.glyphs[a - m.offA[p]] }
  }
  const members = []
  for (const mem of L.members) {
    if (!mem.located || !mem.text.length) continue
    const ink = mem.text.filter((a) => /\S/u.test(gA(a).g?.u ?? ''))
    if (!ink.length) continue
    const n = ink.filter((a) => hiddenAt.has(a)).length
    if (!n) continue
    const st = 'refused' in addOn ? { drawn: false, why: 'page' } : stateOf(mem, addOn)
    members.push({
      ord: mem.ord,
      id: mem.id,
      kind: mem.kind,
      figure: !!mem.figure,
      whole: n === ink.length,
      hidden: n,
      of: ink.length,
      unseen: ink.filter((a) => hiddenAt.get(a) === 'unseen').length,
      wrapped: !!st.drawn,
      why: st.why ?? null,
      chars: ink.length,
      lines: mem.lines.map((l) => [l[0], l[2], l[3], l[4], l[5], l[6]]),
    })
  }
  return { pages: tally.pagesA.length, unaligned, glyphs: glyphsAll, opaque, checks, pairs, members }
}
