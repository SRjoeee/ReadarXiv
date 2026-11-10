// lab/typeset/parity/rows.mjs: the parity's v2 rows, the door's stored replies as v2 reads a reply. The translate package's chain
// reads every accepted reply with each group it did not bring back placed around its own text where the translation states it
// (packages/translate/src/groups.ts placeGroups): the reader is given rows so read. The door's rows are today's stored replies
// (the same translation on both sides); today's side draws today's reading of them, v2's side this one, so that a difference is
// the reading's and the drawing's, never the translator's.
import { unitInOf } from '../../../packages/translate/src/bundle.ts'
import { placeGroups } from '../../../packages/translate/src/groups.ts'

/** `rows` (the entry's Rows: get by unit id, done, kept) with every translated row read as the chain reads a reply, its unit
 *  from `units` (the bundle's, by id); any other row, and one of a unit `units` does not hold, as it is */
export function readAsChain(rows, units) {
  const read = new Map()
  return {
    ...rows,
    get(k) {
      const row = rows.get(k)
      const unit = units.get(k)
      if (!row?.ok || !unit) return row
      if (!read.has(k)) read.set(k, { ...row, content: placeGroups(unitInOf(unit), row.content) })
      return read.get(k)
    },
  }
}
