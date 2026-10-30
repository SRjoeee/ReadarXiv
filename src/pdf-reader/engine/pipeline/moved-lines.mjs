// Our page's lines that stand elsewhere on arXiv's page (the moved pages' line map, M2 of the unified light; the owner's ruling of
// 2026-10-30: fixed in this release). The reader tells each block of a page by its boxes of our page (view/shapes.mjs: the maker's inventory), and these stand on
// arXiv's ink only where our compile set the page as arXiv's did. On a page our compile set otherwise — another TeX Live's glue
// moving every line a few points, a line carried over a column's or a page's break (1810.04805v2's page 16, its lines 3 to 27 pt
// higher than arXiv's) — the boxes stand beside arXiv's lines, and the left lit only what the anchors located. The line check
// (layout/carry.mjs lineCheckOf, the page pass's) already finds each of our lines on arXiv's PDF: its partner's page and the median
// offset of its matched words. Shipped in the left part of each page a line leaves or lands on, it lets the reader carry a box onto
// arXiv's page, as the line it stands on moved, and tell the page by the same rule as a page in place.
//
// An original module (no port statement). It imports the line check's tolerance and the wire's stride: pure, no PDF.js.
import { LINE_PLACE } from '../layout/carry.mjs'
import { MOVED_STRIDE } from '../layer-proto/format.mjs'
const r2 = v => Math.round(v * 100) / 100

/**
 * The moved lines of our base page, from the line check (`check`, lineCheckOf's: each of our lines' partner `lineAt` { page, dx, dy }
 * and `inPlace`, each of our tokens' line `tokenLine`) over our base page's tokens (`ours`, the tokens it was made of): Map arXiv's
 * page -> its entries, flat, MOVED_STRIDE each: [our page, x0, x1, bottom, top, arXiv's page, dx, dy]. A line is moved where its
 * partner is not in place (another page, or its offset past LINE_PLACE). A page with a moved line gives every one of its lines a
 * place: a line with no partner there takes the offset of the nearest of its column's lines that has one (above or below, by the
 * baseline; none where its column has none). Each entry is on its arXiv page's list, and on its own page's where that is another
 * (what leaves a page is said there too: a box of it is no box of that page on arXiv's). Every page the check read whole and drew
 * (not past its work, `over`; drawable) has a list, empty where none of its lines moved: the reader then knows where every box of the
 * page stands on arXiv's, its own in place where no entry carries it, whatever ink the page's tokens give (a page of displays, whose
 * formulas give arXiv's text layer few tokens: 2610.16663v1's page 15, 41 of its 43 lines in place, read as moved by their tokens)
 */
export function movedLinesOf(check, ours) {
  const out = new Map()
  if (!check?.lineAt || !check.tokenLine) return out
  // each of our lines' box and page, of the tokens it holds
  const boxes = new Map()
  for (let k = 0; k < ours.length; k++) {
    const l = check.tokenLine[k], t = ours[k]
    if (l < 0 || !t) continue
    const b = boxes.get(l)
    const x0 = t.x, x1 = t.x + t.w, bottom = t.bottom ?? t.y, top = t.top ?? t.y + t.h
    if (!b) boxes.set(l, { page: t.page, x0, x1, bottom, top })
    else { if (x0 < b.x0) b.x0 = x0; if (x1 > b.x1) b.x1 = x1; if (bottom < b.bottom) b.bottom = bottom; if (top > b.top) b.top = top }
  }
  // the pages with a line moved, and each page's lines
  const moved = l => { const p = check.lineAt[l]; return !!p && !check.inPlace[l] }
  const onPage = new Map(), hit = new Set()
  for (const [l, b] of boxes) {
    ;(onPage.get(b.page) ?? onPage.set(b.page, []).get(b.page)).push(l)
    if (moved(l) && (Math.abs(check.lineAt[l].dx) > LINE_PLACE || Math.abs(check.lineAt[l].dy) > LINE_PLACE || check.lineAt[l].page !== b.page)) hit.add(b.page)
  }
  const add = (q, e) => { const list = out.get(q) ?? out.set(q, []).get(q); list.push(...e) }
  // (every page the check read and drew: a list, empty where nothing moved)
  const over = new Set(check.over ?? [])
  for (const p of check.pages ?? []) if (p.drawable && !over.has(p.page) && onPage.has(p.page)) out.set(p.page, [])
  for (const page of [...hit].sort((a, b) => a - b)) {
    const ls = onPage.get(page)
    const place = new Map()
    for (const l of ls) { const p = check.lineAt[l]; if (p) place.set(l, { page: p.page, dx: p.dx, dy: p.dy }) }
    // (a line of no partner: its column's nearest placed line's offset, by the baseline; a column a box's x-extent meets)
    for (const l of ls) {
      if (place.has(l)) continue
      const b = boxes.get(l), mid = (b.bottom + b.top) / 2
      let best = null, d = Infinity
      for (const m of ls) {
        const pm = place.get(m), c = boxes.get(m)
        if (!pm || m === l || Math.min(b.x1, c.x1) <= Math.max(b.x0, c.x0)) continue
        const dm = Math.abs((c.bottom + c.top) / 2 - mid)
        if (dm < d) { d = dm; best = pm }
      }
      if (best) place.set(l, best)
    }
    for (const l of ls) {
      const p = place.get(l)
      if (!p) continue
      // (a line in place on its own page carries nothing: its boxes stand where they stand)
      if (p.page === page && Math.abs(p.dx) <= LINE_PLACE && Math.abs(p.dy) <= LINE_PLACE) continue
      const b = boxes.get(l), e = [page, r2(b.x0), r2(b.x1), r2(b.bottom), r2(b.top), p.page, r2(p.dx), r2(p.dy)]
      add(p.page, e)
      if (p.page !== page) add(page, e)
    }
  }
  return out
}
