// lab/typeset/gate-rows.mjs: whether the reader gate (gate-l1.mjs) gives a stored row, judged by the product's own acceptance rule
// (@readarxiv/translate's `accept`, over the unit as the chain states it to a translator, `unitInOf`), and the rows it withheld,
// each once. Not shipped.
import { accept } from '../../packages/translate/src/accept.ts'
import { unitInOf } from '../../packages/translate/src/bundle.ts'

/**
 * A judge of one run's rows. `takes(pair, unit, content)`: whether the row is given. A reading the rule refuses, for whatever
 * reason it refuses (an element lost or doubled, a span, an id the unit lacks, nothing said, too short), is no row: the product's
 * chain never lays one (it asks its next translator for that unit, or leaves the unit the original's), and the gate, holding no
 * other reply, leaves the unit the original's as the product leaves it. Each row is judged as often as the gate reads it (its
 * runner, the entry, a name's lead): `withheld()` holds each once, by pair and unit id, with the rule's reason
 */
export function rowJudge() {
  const withheld = new Map()
  return {
    takes(pair, unit, content) {
      const r = accept(unitInOf(unit), content)
      if (r.ok) return true
      withheld.set(`${pair} ${unit.id}`, { pair, kind: unit.kind, id: unit.id, why: r.why })
      return false
    },
    withheld: () => [...withheld.values()],
  }
}
