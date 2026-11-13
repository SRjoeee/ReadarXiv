// What laying a page waits for (design-a §1.4 "one state per call"): the rows its members are set from that are not in while
// more may come. Made before any work, in O(members) map reads: a part's every member names its row by `text` (a unit's id;
// a generated word, a babel name, names none). The paper's own names (`paper.names`: the words a head and a generated
// reference read where no package names them) are waited for where drawn: a member whose facts can draw one (drawsName)
// waits for every name of its paper, as its lay reads them, so that what a page reads is what it waits for (docs/PDF-READER.md
// §19.14; the server and the reader ask for the names first, and a refused row ends the wait). With `rows.done`, a missing row
// is no wait: its members are 'none' and the page commits; nor is a unit the paper keeps as it is (`rows.kept`), whose row
// never comes: a kept unit on a page (a running head's, a footnote's ink) held the page until the target's whole translation
// had ended (staging, 2026-11-08: 2611.07042v1's pages 1 to 3, an inkheads unit on each).
import { type Part, type Placed, toggleKind } from '@readarxiv/format'
import type { Rows } from '../types.ts'
import { renamedBy } from '../unit/rename.ts'
import { namedWaits } from './named.ts'
import { srcOfEl } from './read.ts'

/** the id of the row member `m` is set from, or null where it stays the original's whatever the rows: the prepare's why, no
 *  row of its own (a generated word, a babel name), a kind in `leave` (the reader's: shown untranslated), a unit the paper
 *  keeps (`rows.kept`: its row never comes). The one test of what a page waits for of a member's own row (waitOf) and of
 *  whether its lay reads that row at all (lay/entry.ts, lay/figures.ts): what a page reads is what it waits for */
export function ownRowOf(m: Placed, rows: Rows, leave: ReadonlySet<string>): string | null {
  if (m.why || typeof m.text !== 'string' || leave.has(toggleKind(m)) || rows.kept?.(m.text)) return null
  return m.text
}

/** whether member `m`'s facts can draw one of its paper's own names (Part.paper.names, §19.14): a theorem's or a heading's head
 *  name (Label.name, which U.label names in the target, the paper's word where the rules have none), or an element whose source
 *  a cross-referencing package generates or a citation's note (U.rename's sources, renamedBy, over each element's source as the
 *  part states it, srcOfEl). The one test of which members a page waits for its paper's names for (waitOf) and which members'
 *  reading is given them at all (lay/entry.ts): no other member reads a name's row */
export function drawsName(m: Placed): boolean {
  if ((m.kind === 'theorem' || m.kind === 'heading') && m.label?.name) return true
  return (m.els ?? []).some(([id, e]) => renamedBy(srcOfEl(id, e)))
}

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
      // (a member that stays the original's whatever the rows waits for nothing)
      const own = ownRowOf(m, rows, leave)
      if (own === null) continue
      need(own)
      // (a unit naming a person of the block elsewhere, with the names shown: its variant's row and the block's, named.ts)
      for (const id of namedWaits(part, own, leave)) need(id)
      // (a member that can draw one of the paper's own names: every name of its paper)
      if (drawsName(m)) for (const [, id] of part.paper.names ?? []) need(id)
    }
  return out
}
