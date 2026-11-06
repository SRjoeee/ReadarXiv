// S.table.read (design-b §1.5, T7, A11, B28; the ruling of 2026-10-24: a table with one English cell beats an English table):
// a table's consistency group read from its members' rows: its cells (the members translated, but a cell the wrap cannot hide
// whose box is its own alone, which stays the original's, the rest drawn), and whether the group is split (a member expected
// and never come, or a cell not placed: the group stays the original's whole). Ported from engine 065c1d973 run.mjs readGroup
// RUN:1235-1246 (its `kept` RUN:1241).
//
// Its inputs, per member: whether its row is translated, whether the run holds it (a candidate of K), whether it was expected
// and never came (a part's: `byOpen`, the groups the open gave), and for a translated one its verdict (U.admit: placed, or
// its skip's code and why) and whether it spans columns or rows (unitSpans: \multicolumn, \multirow ← Placed's cell facts).

/** a member of a group as the rule reads it (the tap's per-member facts) */
export type GroupMember = {
  id: number
  translated: boolean
  cand: boolean
  awaitedMissing: boolean
  /** its verdict placed it (U.admit's `p`); null where it is not translated or not a candidate */
  placed: boolean | null
  skip: { code: string | null; why: string | null } | null
  spans: boolean | null
}
export type TableRead = { cells: number[] | null; split: boolean; kept: (boolean | null)[] }

/** a translated cell the wrap cannot hide, its box its own: the original's alone, its group drawn (RUN:1241 kept) */
export const keptCell = (m: GroupMember): boolean =>
  m.cand && m.placed === false && m.skip?.code === 'unhidden' && m.skip.why !== 'unhidden: spell' && !m.spans

/** S.table.read: the group's cells, null where it has none, and whether it is split (RUN:1235 readGroup) */
export function tableRead(members: readonly GroupMember[], byOpen: boolean): TableRead {
  const kept = members.map((m) => (m.translated ? keptCell(m) : null))
  const cells = members.filter((m, i) => m.translated && !kept[i]).map((m) => m.id)
  if (!cells.length) return { cells: null, split: false, kept }
  const byId = new Map(members.map((m) => [m.id, m]))
  const split =
    (byOpen && members.some((m) => m.awaitedMissing)) ||
    cells.some((id) => !(byId.get(id)!.cand && byId.get(id)!.placed))
  return { cells, split, kept }
}
