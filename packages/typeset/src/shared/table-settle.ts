// S.table.settle (design-b §1.5, T8): a table's consistency group decided once every cell of it is laid: painted whole, or one of
// its cells could be set only clipped or not at all (a cell that cannot be drawn whole cannot be drawn), which lay/page.ts
// settleTies leaves the original's by itself, its group with it where that cell spans. Ported from engine 065c1d973 run.mjs
// settleGroup RUN:2411-2425 (its verdict; withhold RUN:2401 is the page's) but its pages: the engine there withheld a group whose
// cells lie on more than one page whole, its first page painted before its last was laid; here each page's part holds every member
// of a tie it touches (the bundle's part, its (c)), every page lays the group whole, and a group on two pages is laid like any
// other, each cell by itself (the coordinator's ruling, PDF-READER §18.72).
//
// Its inputs, per laid cell: whether its lay was refused (the round's last word) and whether its layout is clipped.

export type LaidCell = { refused: boolean; clipped: boolean }

/** S.table.settle: why a cell of the group is withheld, or null where the group is painted whole (RUN:2411 settleGroup) */
export function tableSettle(cells: readonly LaidCell[]): 'a cell unfit' | null {
  return cells.some((p) => p.refused || p.clipped) ? 'a cell unfit' : null
}
