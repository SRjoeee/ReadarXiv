// S.table.settle (design-b §1.5, T8): a table's consistency group decided once every cell of it is laid: painted whole, or
// withheld, the group the original's, where its cells lie on more than one page (the first page's would be painted before the
// last's are laid) or one of them could be set only clipped or not at all (a cell that cannot be drawn whole cannot be
// drawn). Ported from engine 065c1d973 run.mjs settleGroup RUN:2411-2425 (its verdict; withhold RUN:2401 is the page's).
//
// Its inputs, per laid cell: the pages its verdict placed it on (U.admit), whether its lay was refused (the round's last
// word) and whether its layout is clipped.

export type LaidCell = { pages: readonly number[]; refused: boolean; clipped: boolean }

/** S.table.settle: why the group is withheld, or null where it is painted whole (RUN:2411 settleGroup) */
export function tableSettle(cells: readonly LaidCell[]): 'on two pages' | 'a cell unfit' | null {
  const pages = new Set(cells.flatMap((p) => p.pages))
  return pages.size > 1 ? 'on two pages' : cells.some((p) => p.refused || p.clipped) ? 'a cell unfit' : null
}
