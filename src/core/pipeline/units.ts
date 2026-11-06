// A segment of the page as a unit of the chain (DESIGN §8.6, stage 4b): its wire read by the protector's shim, each
// placeholder's element kind the rule file's, and whether it lights by sentence. The cut points are the translator's to
// set now (the tags adapter cuts the unit's text by its elements' kinds; Microsoft reports its own): what stays on this
// side is which blocks are cut at all.
import { elementKindOf, isNumberingLabel } from '@/core/rules/latexml'
import { visibleTextOf } from '@/core/sentences'
import type { WireFormat } from '@/core/protector'
import { unitOfWire, type WireUnit } from '@/core/protector/units'
import type { Segment } from './batches'

/**
 * Reference units. The sentence splitter has no precision guarantee here — journal abbreviations (`Sci. Rep. 14
 * (2024)`, `Theor. Comput. Sci.`) cut false boundaries, and a false boundary puts the highlight on half a sentence,
 * worse than none. So they are never cut on the tags wire, and aligned **whole**: a fragment (the authors, the title,
 * the venue) pairs with its translation as one sentence does. Microsoft's own boundaries cover them, as before
 * (measured 2026-09-17: 0 of 13 fragments lit under Google, 13 of 13 under Microsoft; the owner's report)
 */
const WHOLE_ONLY = new Set(['bibblock', 'bibitem'])

/**
 * What the page states of each element (the contract's Piece `el`): its kind, the rule file's; on the markers wire `alone`,
 * a marker of its own, as the protector writes it (the package's Microsoft adapter joins side-by-side elements for the PDF
 * wire; over the HTML fixtures' 159 blocks that have such elements, read strictly, one marker an element brought back 1,375
 * of their 1,378 placeholders and the joined marker 1,372: live, 2026-11-07, lane L6 stage 4b); and what it reads as to a
 * sentence cutter, its visible text (the page's own rule, `core/sentences`: a formula that ends in a full stop ends its
 * sentence, a citation in brackets continues it), but for a numbering label, which reads as a word: a heading's `2.1.` is no
 * sentence of its own (today's cut there was the one difference that was today's fault, 32 headings of the fixtures)
 */
export function unitOfSegment(segment: Segment, format: WireFormat): WireUnit & { whole: boolean } {
  const whole = format === 'tags' && segment.block.kind === 'text' && WHOLE_ONLY.has(segment.block.unit)
  const slots = segment.protected.slots
  const elementOf = (n: number) => {
    const node = slots.get(n)
    return {
      kind: elementKindOf(node),
      ...(format === 'markers' ? { alone: true } : {}),
      ...(node && !isNumberingLabel(node) ? { reads: visibleTextOf(node) } : {}),
    }
  }
  return { ...unitOfWire(segment.id, segment.text, format, { elementOf, sentences: !whole }), whole }
}
