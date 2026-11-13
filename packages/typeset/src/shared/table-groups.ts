// S.table.groups (the owner's ruling of 2026-11-08: a table's cells drawn by group, the way the production site draws them): the
// cells a reader compares with one another, held together where the geometry needs it. Ported from engine 065c1d973
// translate/groups.mjs (groupOf), over TeX's grid as the part states it (Placed.cell) in place of today's rows: the groups are the
// entry's, before anything is set. A cell that cannot be drawn is the original's by itself, as a paragraph is (the coordinator's
// ruling (c) of 2026-11-13); its group is held where that cell spans (its box the others' too: lay/entry.ts holdsTable before the
// lay, lay/page.ts settleTies after it) and withheld whole where it lies on two pages (settleTies).
//
// The groups follow the table's own structure, TeX's tabular: the header's cells are one group, and below it each column's
// cells another, a cell spanning several columns (\multicolumn) one with the cells spanning the same columns, a cell spanning
// rows (\multirow) its column's. A table whose cells state no grid place (a part made before) is one group, as before.
//
// Which cells are language is decided by the cells' own texts and the table's structure (PDF-READER §18.72, the owner's direction
// of 2026-11-13), never by what came back from a translator: a text that holds no ordinary word, or only the paper's own names, is
// kept as written (Unit.kept, the engine's R1 and R2); a header cell is judged by itself (R3); and the cells of one body column
// between the same two rules are one group, kept together where more than half of them are kept (R4, keptByBlocks below). The
// column rule today's groups.mjs holds (a column at least NAMES_SHARE of whose cells came back from the translator as they went
// kept whole) is not ported: a translator's reply decides nothing here.

import type { Placed } from '@readarxiv/format'

/** a cell's grid place: its row, its first column, the columns it spans, 1 a header's (Placed.cell) */
export type CellPlace = readonly [row: number, col: number, span: number, head: 0 | 1]

/** a cell's group in its table (groups.mjs groupOf): `h` the header's cells, `c<col>` a column's, `c<col>+<span>` the cells
 *  spanning the same columns */
export const groupKey = (at: CellPlace): string => (at[3] ? 'h' : `c${at[1]}${at[2] > 1 ? `+${at[2]}` : ''}`)

/** a group of a table: its key, whether it is the header's, its cells (each its members' ords), in the tie's order */
export type TableGroup = { key: string; head: boolean; cells: (readonly number[])[] }

/** a table's cells by group (groupOf over each cell's place: a cell's members share its place, its first one's read), or null
 *  where a cell's place is not stated (the table one group, as a part made before) */
export function tableGroups(
  cells: readonly (readonly number[])[],
  placeOf: (ord: number) => CellPlace | undefined,
): TableGroup[] | null {
  const out = new Map<string, TableGroup>()
  for (const c of cells) {
    const at = c.length ? placeOf(c[0]!) : undefined
    if (!at) return null
    const key = groupKey(at)
    const g = out.get(key) ?? out.set(key, { key, head: !!at[3], cells: [] }).get(key)!
    g.cells.push(c)
  }
  return [...out.values()]
}

/** R4's one stated threshold: a group is the paper's names where MORE than half of its text cells are kept as written. A majority
 *  is the least that makes a block one kind of thing (names) rather than the other (words), with no number tuned to the corpus:
 *  exactly half is not more than half, and each of such a block's cells is laid by itself (lane table-judge: over the corpus's
 *  body columns the kept share stands at 0 or 1 in 72 % of them; 34 of 654 at exactly one half) */
export const moreThanHalf = (kept: number, cells: number): boolean => 2 * kept > cells

/**
 * R4 (PDF-READER §18.72): the members of a table's body that their block keeps as written. A block is the cells of one body
 * column (a cell's first column and the columns it spans, Placed.cell) between the same two rules (the band the part states over
 * and under each cell, Room.band and bandOpen: a summary row under its own rule is a block of its own, "Avg. Recovery" under the
 * dataset names of 2611.03953v2's Table 2); a header cell is in none (R3: judged by itself). Its text cells are its members with
 * a text of their own and no reason of the part's (Placed.why); where more than half of them are kept (`kept`: Unit.kept, R1 and
 * R2, or a fact of the source), the others are kept too. A table whose cells state no grid place votes nothing
 */
export function keptByBlocks(members: readonly Placed[], kept: (m: Placed) => boolean): Set<number> {
  const blocks = new Map<string, Placed[]>()
  for (const m of members) {
    if (!m.cell || m.cell[3] || typeof m.text !== 'string' || m.why) continue
    const key = `${m.cell[1]}+${m.cell[2]}|${m.room.band?.join(',') ?? ''}|${m.room.bandOpen ?? ''}`
    ;(blocks.get(key) ?? blocks.set(key, []).get(key)!).push(m)
  }
  const out = new Set<number>()
  for (const block of blocks.values())
    if (moreThanHalf(block.filter(kept).length, block.length)) for (const m of block) if (!kept(m)) out.add(m.ord)
  return out
}
