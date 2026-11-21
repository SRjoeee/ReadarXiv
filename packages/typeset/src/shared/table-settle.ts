// S.table.settle: a table's consistency group decided once every cell of it is laid: painted whole, or one of its cells could
// be set only clipped or not at all (a cell that cannot be drawn whole cannot be drawn), which lay/page.ts settleTies leaves
// the original's by itself, its group with it where that cell spans; withholding is the page's. A group whose cells lie on
// more than one page is laid like any other, each cell by itself (PDF-READER §18.72): each page's part holds every member of
// a tie it touches (the bundle's part), so every page lays the group whole and decides it alike.
//
// Its inputs, per laid cell: whether its lay was refused (the round's last word) and whether its layout is clipped.

type LaidCell = { refused: boolean; clipped: boolean }

/** S.table.settle: why a cell of the group is withheld, or null where the group is painted whole */
export function tableSettle(cells: readonly LaidCell[]): 'a cell unfit' | null {
  return cells.some((p) => p.refused || p.clipped) ? 'a cell unfit' : null
}
