// S.table.groups (the owner's ruling of 2026-11-08: a table's cells drawn by group, the way the production site draws them): the
// cells a reader compares with one another are drawn whole or left the original's whole where one of them cannot be drawn.
// Ported from engine 065c1d973 translate/groups.mjs (groupOf), over TeX's grid as the part states it (Placed.cell) in place of
// today's rows: the groups are the entry's, before anything is set (a group a cell of which is not set holds the others the
// original's, lay/entry.ts holdsTable; one a cell of which its lay refuses is withheld, lay/page.ts settleTies).
//
// The groups follow the table's own structure, TeX's tabular: the header's cells are one group, and below it each column's
// cells another, a cell spanning several columns (\multicolumn) one with the cells spanning the same columns, a cell spanning
// rows (\multirow) its column's. A table whose cells state no grid place (a part made before) is one group, as before.
//
// No group is decided by what its cells say: a table's cell is text like any other, and the translator decides a name (the owner,
// 2026-11-13). The column rule today's groups.mjs holds (a column at least NAMES_SHARE of whose cells came back as they went kept
// whole as names) is not ported: each cell is laid by its own row, a reply equal to its source as any other.

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
