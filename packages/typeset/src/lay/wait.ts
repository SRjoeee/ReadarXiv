// What laying a page waits for (design-a §1.4 "one state per call"): the rows its members are set from that are not in while
// more may come. Made before any work, in O(members) map reads: a part's every member names its row by `text` (a unit's id;
// a generated word, a babel name, names none), and the paper's names' rows (`paper.names`) are read by the members they lead.
// With `rows.done`, a missing row is no wait: its members are 'none' and the page commits.
import type { Part } from '@readarxiv/format'
import type { Rows } from '../types.ts'

/** the ids of the rows page `part` waits for, each once, in the part's stream order; empty where it can be laid */
export function waitOf(part: Pick<Part, 'flows' | 'paper'>, rows: Rows): string[] {
  if (rows.done) return []
  const out: string[] = []
  const seen = new Set<string>()
  const need = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    if (!rows.get(id)) out.push(id)
  }
  for (const flow of part.flows)
    for (const m of flow) {
      // (a member that stays the original's whatever the rows (the prepare's why) waits for nothing)
      if (m.why || typeof m.text !== 'string') continue
      need(m.text)
    }
  for (const [, id] of part.paper.names ?? []) need(id)
  return out
}
