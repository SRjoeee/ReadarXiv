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
/** the share of a page's lines the line check must have found a partner for, for the page to have a map: a page whose lines the
 *  check did not find (rebroken, set with other words) stays with none, and the reader judges it by its tokens (view/shapes.mjs
 *  IN_PLACE, the same share of its lines) */
export const MAP_FOUND = 0.9

/**
 * The moved lines of our base page, from the line check (`check`, lineCheckOf's: each of our lines' partner `lineAt` { page, dx, dy }
 * and `inPlace`, each of our tokens' line `tokenLine`) over our base page's tokens (`ours`, the tokens it was made of): Map arXiv's
 * page -> its entries, flat, MOVED_STRIDE each: [our page, x0, x1, bottom, top, arXiv's page, dx, dy]. Only a page the check placed
 * has a list: MAP_FOUND of its lines found a partner, and (where the check says, `pages`, `over`) it was read whole and drawn; a page
 * whose lines the check did not find (rebroken by other glue: its words arXiv's, its lines not) has none, and the reader judges it by
 * its tokens as before. A line is moved where its partner is not in place (another page, or its offset past LINE_PLACE). A page with a
 * moved line gives every one of its lines a place: a line with no partner there takes the offset of the nearest of its column's lines
 * that has one (above or below, by the baseline; none where its column has none), never of a line placed so. Each entry is on its own
 * page's list, and on its arXiv page's where that is another and has a list (what leaves a page is said there: a box of it is no box
 * of that page on arXiv's). A page placed where none of its lines moved has an empty list: the reader then knows where every box of
 * the page stands on arXiv's, its own in place where no entry carries it, whatever ink the page's tokens give (a page of displays,
 * whose formulas give arXiv's text layer few tokens: 2610.16663v1's page 15, 41 of its 43 lines in place, read as moved by their
 * tokens)
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
  // each page's lines, and the pages the check placed: their lines found, MAP_FOUND of them, and (where the check says which pages
  // it read and drew) read whole and drawn
  const onPage = new Map()
  for (const [l, b] of boxes) (onPage.get(b.page) ?? onPage.set(b.page, []).get(b.page)).push(l)
  const over = new Set(check.over ?? []), drawn = check.pages ? new Set(check.pages.filter(p => p.drawable && !over.has(p.page)).map(p => p.page)) : null
  const placed = new Set()
  for (const [page, ls] of onPage) if ((!drawn || drawn.has(page)) && ls.filter(l => check.lineAt[l]).length >= MAP_FOUND * ls.length) placed.add(page)
  // (a page placed: a list, empty where none of its lines moved; a line of a page placed that lands on a page not placed is said on its
  // own page alone, a box of it no box of that page on arXiv's, and lights there by the tokens)
  for (const page of placed) out.set(page, [])
  const add = (q, e) => { const list = out.get(q); if (list) list.push(...e) }
  const movedOff = (l, page) => { const p = check.lineAt[l]; return !!p && (p.page !== page || Math.abs(p.dx) > LINE_PLACE || Math.abs(p.dy) > LINE_PLACE) }
  for (const page of [...placed].sort((a, b) => a - b)) {
    const ls = onPage.get(page)
    if (!ls.some(l => movedOff(l, page))) continue
    // (a line of no partner: the offset of its column's nearest line that has one, by the baseline, a column a box's x-extent meets;
    // only the lines the check found are searched, never one placed so)
    const place = new Map()
    for (const l of ls) {
      const p = check.lineAt[l]
      if (p) { place.set(l, p); continue }
      const b = boxes.get(l), mid = (b.bottom + b.top) / 2
      let best = null, d = Infinity
      for (const m of ls) {
        const pm = check.lineAt[m], c = boxes.get(m)
        if (!pm || Math.min(b.x1, c.x1) <= Math.max(b.x0, c.x0)) continue
        const dm = Math.abs((c.bottom + c.top) / 2 - mid)
        if (dm < d) { d = dm; best = pm }
      }
      if (best) place.set(l, best)
    }
    for (const l of ls) {
      const p = place.get(l)
      // (a line in place on its own page carries nothing: its boxes stand where they stand)
      if (!p || (p.page === page && Math.abs(p.dx) <= LINE_PLACE && Math.abs(p.dy) <= LINE_PLACE)) continue
      const b = boxes.get(l), e = [page, r2(b.x0), r2(b.x1), r2(b.bottom), r2(b.top), p.page, r2(p.dx), r2(p.dy)]
      add(page, e)
      if (p.page !== page) add(p.page, e)
    }
  }
  return out
}
