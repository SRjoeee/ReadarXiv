// Page-even (Plan 8b, Task 10; the instant layer's spec §4.5): a page's body units set at one size, the smallest any of
// them needs, and where the script's rules say so at one leading. Each unit is first laid at its own fit; once the page's
// last body unit is laid, the units above that setting are laid again from it, once: at most one re-laying a page. A
// unit on two pages keeps its own fit; headings, captions, footnotes and cells fit alone.
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
 * The page's even setting once all its body units are laid: the smallest scale any took, and in 'size-and-lead' the
 * smallest leading (in 'size', the rules' leadBase, from which each unit's own fit starts); null where nothing needs
 * laying again: in 'unit', with no unit, or with every unit already at it. The units above it are laid again with it
 * (layUnit's `maxScale` and `lead`), once.
 */
export function evenOf(laid, rules) {
  if (rules.even === 'unit' || !laid.length) return null
  const both = rules.even === 'size-and-lead'
  let scale = Infinity, lead = Infinity
  for (const u of laid) { scale = Math.min(scale, u.state.scale); lead = Math.min(lead, u.state.lead) }
  const above = laid.some(u => u.state.scale > scale + 1e-9 || (both && u.state.lead > lead + 1e-9))
  return above ? { maxScale: scale, lead: both ? lead : rules.leadBase } : null
}
