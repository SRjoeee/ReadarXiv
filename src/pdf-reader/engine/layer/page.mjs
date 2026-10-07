// Page-even (Plan 8b, Task 10; the instant layer's spec §4.5): a page's body units set at one size, the smallest any of
// them needs. Each unit is first laid at its own fit; once the page's last body unit is laid, the units above that size
// are laid again from it, once: at most one re-laying a page. A unit on two pages keeps its own fit; headings, captions,
// footnotes and cells fit alone. The leading is never evened: each unit's starts from the rules' own, so that one unit
// that needs a tight leading does not set every paragraph of its page at it (fidelity-layer-report.md, fix 4).
//
// And every located unit's lines on a page, which the fit's widening and the drawing's keep-off read.
//
// Pure: no DOM, no clock. An original module (no port statement), importing nothing.

/** the kinds a page evens. The scorer's BODY_KINDS (Plan 8a) is the same three; Plan 8d asserts that the two are equal */
export const EVEN_KINDS = Object.freeze(['para', 'abstract', 'theorem'])
const EVEN = new Set(EVEN_KINDS)

/** a page's body units: located units of EVEN_KINDS whose frames all lie on the page, ids rising */
export function bodyUnits(file, page) {
  const out = []
  for (const id of file.onPage(page)) {
    const unit = file.unit(id)
    if (!unit || !EVEN.has(unit.kind) || unit.lines.length < 8 || unit.frames.length < 6) continue
    let here = true
    for (let o = 0; o < unit.frames.length; o += 6) if (unit.frames[o] !== page) { here = false; break }
    if (here) out.push(id)
  }
  return out
}

/**
 * The page's even setting once all its body units are laid: the smallest scale any took; null where nothing needs laying
 * again: in 'unit', with no unit, or with every unit already at it. The units above it are laid again with it (layUnit's
 * `maxScale`, each from the rules' own leading), once; one that comes back unfit keeps its first fit.
 */
export function evenOf(laid, rules) {
  if (rules.even === 'unit' || !laid.length) return null
  let scale = Infinity
  for (const u of laid) scale = Math.min(scale, u.state.scale)
  return laid.some(u => u.state.scale > scale + 1e-9) ? { maxScale: scale } : null
}

// every located unit's lines on a page, made once a file and page
const LINES = new WeakMap()
/** every located unit's lines on a page, by baseline rising: each its unit's id and kind, x0, x1, baseline (b) and size
 *  (s); and the largest size among them */
export function linesOn(file, page) {
  let pages = LINES.get(file)
  if (!pages) LINES.set(file, (pages = new Map()))
  let out = pages.get(page)
  if (out) return out
  const list = []
  let most = 0
  for (const id of file.onPage(page)) {
    const unit = file.unit(id)
    if (!unit) continue
    const L = unit.lines
    for (let o = 0; o + 7 < L.length; o += 8) {
      if (L[o] !== page) continue
      list.push({ id, kind: unit.kind, x0: L[o + 1], x1: L[o + 2], b: L[o + 3], s: L[o + 6] })
      if (L[o + 6] > most) most = L[o + 6]
    }
  }
  list.sort((a, b) => a.b - b.b)
  out = { list, most }
  pages.set(page, out)
  return out
}
