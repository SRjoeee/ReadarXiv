// A segment of the page as a unit of the chain (DESIGN §8.6, stage 4b): its wire read by the protector's shim, each
// placeholder's element kind the rule file's, and whether it lights by sentence. The cut points are the translator's to
// set now (the tags adapter cuts the unit's text by its elements' kinds; Microsoft reports its own): what stays on this
// side is which blocks are cut at all.
import { elementKindOf } from '@/core/rules/latexml'
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
 * On the markers wire every element is stated as one that ends a stretch of side-by-side elements (the contract's kind
 * `display`, whose only effect on a wire is that), so that each keeps its own marker on the HTML page, as the protector
 * wrote it: the package's Microsoft adapter joins side-by-side elements into one marker (the PDF wire's rule), and over
 * the HTML fixtures' 159 blocks that have such elements, read strictly, one marker an element brought back 1,375 of their
 * 1,378 placeholders and the joined marker 1,372 (live, 2026-11-07, one run each; lane L6 stage 4b). The markers wire's
 * sentences are Microsoft's own, so a stated kind reads as no cut there; on the tags wire the kinds are the rule file's
 */
const APART = 'display'

export function unitOfSegment(segment: Segment, format: WireFormat): WireUnit & { whole: boolean } {
  const whole = format === 'tags' && segment.block.kind === 'text' && WHOLE_ONLY.has(segment.block.unit)
  const slots = segment.protected.slots
  const kindOf = format === 'markers' ? () => APART : (n: number) => elementKindOf(slots.get(n))
  return { ...unitOfWire(segment.id, segment.text, format, { kindOf, sentences: !whole }), whole }
}
