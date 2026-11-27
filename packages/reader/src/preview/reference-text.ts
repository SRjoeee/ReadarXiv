// A reference's own text, as its page draws it on A (link previews' §3.3 "A reference with no metadata", D §4.2): the citation
// card of phase 1 shows it. Read from the paper's units and its page's part, which the reader holds: the unit's text pieces,
// each element by its copy text as its part states it (El.text, the glyphs' text on A, else El.copy, its source's plain text:
// a formula as linear text), a forced break a space, a nested unit (a note's) nothing; never an element's TeX source. An element
// that states neither is nothing, and counted (`lost`: how often a reference loses text so is measured by the browser probe).
// White space collapsed. Its label (the bibliography's number or key, Label.num) apart: the card shows the text, the search's
// query leaves the label out.
import type { El, Part, Piece, Placed, Unit } from '@readarxiv/format'

/** the search's query at most, characters [start] (open item 4), cut at a word */
export const QUERY_MAX = 300

/** the member of a part that places a unit, or null */
export function memberOf(part: Part, unitId: string): Placed | null {
  for (const flow of part.flows) for (const m of flow) if (m.text === unitId) return m
  return null
}

/** a reference's text, its label apart, and how many of its elements stated no text; null where the part places no member of
 *  the unit */
export function referenceText(unit: Unit, part: Part): { text: string; label: string | null; lost: number } | null {
  const m = memberOf(part, unit.id)
  if (!m) return null
  const els = new Map<string, El>(m.els ?? [])
  let lost = 0
  const walk = (pieces: readonly Piece[]): string => {
    let out = ''
    for (const p of pieces) {
      if (p.t === 'text') out += p.s
      else if (p.t === 'span') out += walk(p.content)
      else if (p.t === 'el') {
        const el = els.get(p.id)
        if (p.kind === 'break' || el?.brk) out += ' '
        else if (el?.text !== undefined) out += el.text
        else if (el?.copy !== undefined) out += el.copy
        else lost++
      }
    }
    return out
  }
  const text = walk(unit.content).replace(/\s+/g, ' ').trim()
  return { text, label: m.label?.num?.[0] ?? null, lost }
}

/** the search's query of a reference's text: its label off its head, cut at the last word boundary within QUERY_MAX */
export function queryOf(text: string, label: string | null): string {
  let s = text.trim()
  if (label && s.startsWith(label)) s = s.slice(label.length).trim()
  if (s.length <= QUERY_MAX) return s
  const cut = s.slice(0, QUERY_MAX + 1)
  const at = cut.lastIndexOf(' ')
  return (at > 0 ? cut.slice(0, at) : s.slice(0, QUERY_MAX)).trim()
}
