// lab/typeset/gate-rows.mjs: whether the reader gate (gate-l1.mjs) gives the entry a stored row, judged by the product's own
// acceptance rule (@readarxiv/translate's `accept`, over the unit as the chain states it to a translator, `unitInOf`), and the
// rows it judged, each once. Not shipped.
import { accept } from '../../packages/translate/src/accept.ts'
import { unitInOf } from '../../packages/translate/src/bundle.ts'

/**
 * A judge of one run's rows. `takes(pair, unit, content)`: whether the row is given; a reading that says nothing (the rule's
 * 'empty': no letter or digit where the unit has a letter) is no translation of its unit under any reading, given as no row; one
 * the rule's other clauses refuse is given as it is, the door holding no other reply of its unit. Each row is judged as often as
 * the gate reads it (its runner, the entry, a name's lead): `withheld()` and `given()` hold each once, by pair and unit id
 */
export function rowJudge() {
  const withheld = new Map()
  const given = new Map()
  return {
    takes(pair, unit, content) {
      const r = accept(unitInOf(unit), content)
      if (r.ok) return true
      const x = { pair, kind: unit.kind, id: unit.id, why: r.why }
      if (r.why !== 'empty') {
        given.set(`${pair} ${unit.id}`, x)
        return true
      }
      withheld.set(`${pair} ${unit.id}`, x)
      return false
    },
    withheld: () => [...withheld.values()],
    given: () => [...given.values()],
  }
}
