// X.stand (docs/PDF-READER.md §18.92): a table cell of an m or a b column stood in its row where TeX stands it (Placed.stand).
import type { FitBlock, LaidLine } from './types.ts'

/**
 * A cell's laid lines stood as TeX stands its class in its row, once they are laid (Placed.stand, the engine's reading of the
 * marked compile's AXT-CELL; FitParams.stand): array.sty (v2.6n, TeX Live 2025's) sets an m cell's paragraph in a \vbox and
 * lowers it by half its height past the strut's (\ar@align@mcell, \baselineskip being none inside the alignment), so that the
 * middle of its first and last baselines stands on the row's baseline whatever its count of lines (a one-line cell on it too: its
 * box no taller than the strut, "align at baseline"); a b cell is a \vbox, its last line on the row's baseline; a p cell a \vtop,
 * its first line there, where B.slots starts every cell's lines (no stand stated). The original's lines on arXiv's page show
 * where TeX stood them, so the laid block is moved, every line by the same: an m cell's with the middle of its first and last
 * baselines on the middle of the original's first and last, a b cell's with its last on the original's last. One rule, whatever
 * the count of the laid lines and whatever pitch the fit or the page fill gave them: the same count at the same pitch is no move.
 * Only a member of one block, every laid line its own (its lines one cell's: a unit the source walk ran on past its row's end into
 * the next row's cell, its lines in two blocks, is laid as before). The lines are moved in place, before they are placed across
 * (B.place) and settled into their bands (S.settle, which clears a line standing on one of the original's baselines and none
 * other); each line's target the original's line it now stands on, where it does (X.lastLines' way)
 */
export function toStand(lines: LaidLine[], blocks: readonly FitBlock[] | null | undefined, stand: 'm' | 'b'): void {
  if (blocks?.length !== 1 || !lines.length || lines.some((l) => l.block !== 0)) return
  const B = blocks[0]!.B
  const ys = lines.map((l) => l.baseline)
  const by =
    stand === 'm'
      ? (Math.max(...B) + Math.min(...B)) / 2 - (Math.max(...ys) + Math.min(...ys)) / 2
      : Math.min(...B) - Math.min(...ys)
  if (Math.abs(by) < 1e-9) return
  for (const l of lines) {
    l.baseline += by
    const t = B.findIndex((v) => Math.abs(v - l.baseline) < 0.05)
    l.target = t >= 0 ? t : null
  }
}
