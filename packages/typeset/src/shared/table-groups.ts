// S.table.groups (the owner's ruling of 2026-11-08: a table's cells translated or kept by group, the way the production site
// judges them): the cells a reader compares with one another are translated whole or kept whole. Ported from engine 065c1d973
// translate/groups.mjs (groupOf, decideGroups, NAMES_SHARE, unchanged), over TeX's grid as the part states it (Placed.cell)
// in place of today's rows: the decision is the entry's, after translation and before anything is set from it, on every
// call, over each member's own row (a unit's row is shared by every cell of its text; a group is its table's cells).
//
// The groups follow the table's own structure, TeX's tabular: the header's cells are one group, and below it each column's
// cells another, a cell spanning several columns (\multicolumn) one with the cells spanning the same columns, a cell spanning
// rows (\multirow) its column's. A table whose cells state no grid place (a part made before) is one group, as before.
//
// The decision: a column of which at least NAMES_SHARE of the cells came back from the translator as they went is a column of
// names (models, datasets, methods), kept whole; any other is translated whole. A cell the paper keeps as it is before asking
// (Unit.kept: its name rule) counts as one that came back as it went: that is what it is kept for, and asked alone a name may
// come back as a word; so does one no translator was sent (no row with every row in). The header's cells are descriptive
// ("Model", "Training Cost") and translated as a group. A cell whose translation failed holds its group the original's
// (holdsTable, the entry's: today's untranslatable group, kept whole).

/** a cell's grid place: its row, its first column, the columns it spans, 1 a header's (Placed.cell) */
export type CellPlace = readonly [row: number, col: number, span: number, head: 0 | 1]

/**
 * The share of a column's cells that must come back from the translator as they went for the column to be read as names and
 * kept (groups.mjs NAMES_SHARE, today's measure: the 29 layer-lab fixtures and six corpus papers whose tables Microsoft had
 * answered, lab/pdf/spikes/table-groups.mjs, 2026-10-07; columns of names of models and methods stand at 0.40-0.46, the one
 * column of words below 0.5 at 0.40)
 */
export const NAMES_SHARE = 0.4

/** a cell's group in its table (groups.mjs groupOf): `h` the header's cells, `c<col>` a column's, `c<col>+<span>` the cells
 *  spanning the same columns */
export const groupKey = (at: CellPlace): string => (at[3] ? 'h' : `c${at[1]}${at[2] > 1 ? `+${at[2]}` : ''}`)

/** a text with its white space gone and each letter that stands alone lower case: what "came back as it went" compares */
const bare = (s: string) =>
  s
    .normalize('NFC')
    .replace(/(?<![\p{L}\p{N}])\p{L}(?![\p{L}\p{N}])/gu, (l) => l.toLowerCase())
    .replace(/\s+/gu, '')
/** whether a translation is its source but for white space and the case of single letters (groups.mjs unchanged) */
export const unchanged = (src: string, tr: string): boolean => bare(src) === bare(tr)

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

/** what a member's row says of the decision: it came back as it went (or was never to be asked), it came back changed (or
 *  failed: no cell of it is the same), or it tells nothing (a member that stays the original's whatever its row) */
export type CellAnswer = 'same' | 'changed' | null

/** whether a group is a column of names, kept whole (groups.mjs decideGroups' `names`): a body group at least NAMES_SHARE of
 *  whose cells came back as they went, a cell being so where none of its members came back changed; a cell none of whose
 *  members tells anything is none of the count */
export function namesGroup(head: boolean, cells: readonly (readonly CellAnswer[])[]): boolean {
  if (head) return false
  let same = 0,
    n = 0
  for (const c of cells) {
    if (c.every((x) => x === null)) continue
    n++
    if (!c.includes('changed')) same++
  }
  return n > 0 && same >= NAMES_SHARE * n
}
