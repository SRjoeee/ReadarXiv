// What laying a page waits for (design-a §1.4 "one state per call"): the rows its members are set from that are not in while
// more may come. Made before any work, in O(members) map reads: a part's every member names its row by `text` (a unit's id;
// a generated word, a babel name, names none). The paper's own names (`paper.names`: the words a head and a generated
// reference read where no package names them) are not waited for, as today's reader never awaits a name unit (RUN:813-819:
// given at the open or taken with the rows, read where they are in). With `rows.done`, a missing row is no wait: its members
// are 'none' and the page commits; nor is a unit the paper keeps as it is (`rows.kept`), whose row never comes: a kept unit
// on a page (a running head's, a footnote's ink) held the page until the target's whole translation had ended (staging,
// 2026-11-08: 2611.07042v1's pages 1 to 3, an inkheads unit on each).
import type { Part } from '@readarxiv/format'
import type { Rows } from '../types.ts'

/** the ids of the rows page `part` waits for, each once, in the part's stream order; empty where it can be laid. A member of a
 *  kind in `leave` (the reader's: shown untranslated) waits for nothing */
export function waitOf(
  part: Pick<Part, 'flows' | 'paper'>,
  rows: Rows,
  leave: ReadonlySet<string> = new Set(),
): string[] {
  if (rows.done) return []
  const out: string[] = []
  const seen = new Set<string>()
  const need = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    if (!rows.get(id) && !rows.kept?.(id)) out.push(id)
  }
  for (const flow of part.flows)
    for (const m of flow) {
      // (a member that stays the original's whatever the rows (the prepare's why) waits for nothing)
      if (m.why || typeof m.text !== 'string' || leave.has(m.kind)) continue
      need(m.text)
    }
  return out
}
