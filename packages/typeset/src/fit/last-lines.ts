// X.lastLines (design-b §1.5, T25; the ruling of 2026-10-19: a heading on the original's last baseline): a heading set in
// fewer lines than the original's stands on its last ones. Ported from engine 065c1d973 layer2.mjs toLastLines
// L2:4268-4314 (moved first as JavaScript by lab/typeset/move-fit.mjs, now TypeScript), held by the walk's replays.
import { originalLines } from '../unit/decor.ts'
import type { FitBlock, LaidLine } from './types.ts'

/** a slot as the move reads it: its block, baseline, measure and pitch */
type Row = { block: number; baseline: number; x0: number; x1: number; pitch?: number }

/**
 * A heading its translation sets in fewer lines than the original's (P.lastLines, run.mjs: a section heading): its lines
 * moved down onto the original's last ones, so that the room it frees falls above it, not between it and the text it heads
 * (the owner, 2026-10-19: 1810.04805's "C.2 Ablation for Different Masking Procedures", two lines, its Chinese one, left a
 * blank line before its paragraph; the coordinator's ruling: on the original's last baseline, past the page fill's floor,
 * footFloorAt, which would have left 7.4 pt of C.2's 13.5 under it). The last line goes onto the original's last baseline,
 * and every line above it as far down; each keeps its slot's measure (the first its start, where the heading's number is
 * drawn with it: run.mjs). Never nearer the next line of its column (the original's room under its last line, `below`:
 * P.halfLead, run.mjs edgesOf) than the size it is set at, `f`: the line's box clear of the next line's. Only a heading of
 * one block (its lines one run of a column); a body paragraph is never moved.
 *
 * Only where the lines keep their own room where they land (`slots`: the state's slots on the original's own rows, at its
 * pitch and with no page fill's floor, which the lines go past; the one within half a pitch of the row each is moved onto).
 * Its lines stay where they were laid if a line would end past where its new row's room ends: the stop of a row it shares
 * with the next unit, TeX's text ending there before what stays of the page (run.mjs keptAfter: amsthm's theorem note, whose
 * last row the theorem's body goes on after the note's `).`; 2610.18513v1 page 35, unit 316 moved down onto its row whole and
 * drawn over the body's first words), or a narrower measure. The same where a line after the first would start elsewhere
 * than on its row, or where the first line starts past its block's left edge with no start of its own (`start`: the number
 * run.mjs draws with it): what stands before it on its row stays there (a label kept as the original's, "Lemma A.2 ("), and
 * the text moved off it stood apart from it, at that line's indent on a row that has none. The lines are moved in place
 */
export function toLastLines(
  lines: LaidLine[],
  blocks: readonly FitBlock[] | null | undefined,
  below: number | undefined,
  f: number,
  slots: () => readonly Row[],
): void {
  if (blocks?.length !== 1 || !lines.length || lines.some((l) => l.block !== 0)) return
  const b = blocks[0]!,
    B = b.B
  if (lines.length >= originalLines(b)) return
  const last = Math.min(...B)
  const onto = last - lines.at(-1)!.baseline
  let by = onto
  if (Number.isFinite(below) && below! < f) by += f - below!
  if (!(by < -0.05)) return
  const room = slots().filter((sl) => sl.block === 0)
  for (const [i, l] of lines.entries()) {
    // (the row it lands on, the room under the last line taken into account: the slot there, within half a pitch)
    const y = l.baseline + by
    const at = room.reduce<Row | null>(
      (q, sl) => (!q || Math.abs(sl.baseline - y) < Math.abs(q.baseline - y) ? sl : q),
      null,
    )
    if (!at || Math.abs(at.baseline - y) > 0.5 * (at.pitch as number) || at.x1 < l.x1 - 0.05) return
    if (i > 0 ? Math.abs(at.x0 - l.x0) > 0.05 : !b.centred && b.start === undefined && l.x0 > at.x0 + 0.05) return
  }
  // (each line's target the original's line it now stands on, where it does: the record's drift reads it)
  for (const l of lines) {
    l.baseline += by
    const t = B.findIndex((v) => Math.abs(v - l.baseline) < 0.05)
    l.target = t >= 0 ? t : null
  }
}
