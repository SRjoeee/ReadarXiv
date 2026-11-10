// S.share (design-b §1.5, E29): the shared row as a unit's layout leaves it (where its text and its ink end there), and
// whether a layout keeps it (keepsShare, read by S.fill.page). Ported from engine 065c1d973 layer2.mjs L2:4321-4424 (onShare,
// inkEndOf, shareOf, keepsShare; moved first as JavaScript by lab/typeset/move-fit.mjs, now TypeScript), held by the chain's
// and the fill's replays on the corpus. Its ink measures are the call's (`m`).
import type { FitMeasure } from '../breaker/measure.ts'
import type { FitBlock, LaidLine, Layout } from '../fit/types.ts'

/** the shared row as a unit's layout leaves it */
export type Share = {
  page: number
  y: number
  band: number
  x0: number
  x1: number
  end: number | null
  at: number | null
  ink: number | null
  above?: boolean
  kept?: boolean
}
/** a layout as inkEndOf reads its size and state: a run laid apart holds its own (`seg`) */
type Sized = { f: number; state?: { track?: number; trackLatin?: number } }

/** whether a laid line stands on a shared row (shareOf): on its page, within an em of its baseline, across the block it is in */
const onShare = (share: Share, l: LaidLine) =>
  l.page === share.page &&
  Math.abs(l.baseline - share.y) < share.band &&
  Math.min(l.x0 + l.used!, share.x1) > Math.max(l.x0, share.x0)

/**
 * Where a laid line's text's ink ends (PDF units): its last drawn item's own right edge, measured as its width is, its text in its
 * face at 100 px (inkRight100, TextMetrics' actualBoundingBoxRight: what the face draws, not its advances) at the size it is drawn, its
 * tracking between its characters and an oblique face's slant over its ink's height; a crop's box. Never past the line's end,
 * which it is where the canvas gives no ink. A full-width closing mark's blank half is in its advance and so in the line's end,
 * and no text: 2010.11929v2 p4's "Inductive bias." in Chinese ends in an ideographic full stop (U+3002) whose ink ends 0.34 em
 * into its em in Source Han Serif. `L` the layout, whose size and state a line of a run laid apart holds itself (`seg`)
 */
export function inkEndOf(line: LaidLine, L: Layout, m: FitMeasure): number {
  const end = line.x0 + line.used!
  const it = line.items?.findLast((q) => q.t.crop || (q.t.s && !q.t.space && q.t.face))
  if (!it) return end
  const t = it.t
  if (t.crop) return Math.min(end, it.x! + it.w)
  const r = m.inkRight100(t.s!, t.face!)
  if (r === null) return end
  const S = (line.seg ?? L) as Sized,
    f = S.f,
    k = (t.sup ? 0.62 : 1) * (t.sc ?? 1)
  // (a word's tracking, drawn as letter spacing after each of its characters, stands before its last one's ink; a CJK character
  // laid alone carries its own after it, in its advance)
  const track = t.sup ? 0 : ((t.cls === 'cjk' ? S.state?.track : S.state?.trackLatin) ?? 0)
  let x = it.x! + (r * k * f) / 100 + track * f * Math.max(0, [...t.s!].length - 1)
  // (an oblique face skews its glyphs about the baseline: its ink's top-right corner stands its height times the slant further on)
  if (t.face!.oblique)
    x +=
      Math.max(0, (m.ink100(t.s!, t.face!).a * k * f) / 100 + (t.sup ? 0.36 * f : 0)) *
      Math.tan((t.face!.oblique * Math.PI) / 180)
  return Math.min(end, x)
}
/**
 * The shared row as a unit's layout leaves it: `row` (the unit's last row in the layout file: page, baseline, size) in the
 * unit's block that holds it (its x0 and x1, so that a line of another column on that baseline is no line of the row),
 * `end`, the furthest end of the unit's text laid within an em of the row (its lines there, which the next unit's first line
 * would meet), and `at`, the baseline of the line that ends there: the row's own where the unit's line stands on TeX's, else
 * where its leading set it (a paragraph's two lines spread over its three rows, 2608.16117's unit 115 on page 39, 7.2 pt
 * over the row), which the next unit's first line stands on, so that the row reads as one line; `ink`, the furthest its text's
 * ink reaches there (inkEndOf: short of `end` by a full-width mark's blank half), which the next unit is laid from. Where it
 * set none there, its translation ended higher: its last line, where it stands on the row's page within the row's block, is
 * the shared line (`above`), the original's one paragraph read on, the next unit's first line on it after its ink (laid on
 * TeX's row under it, a line's height under a translation spread at its own leading, the two stood less than an em apart:
 * 2610.21085v1 p2's items, 12 pt at 11.95 pt type); all null where that line is another page's or column's (the row is free).
 * Null where no block of the unit holds the row (a row kept as the original's, or dropped as another unit's): the row stays
 * the original's.
 */
export function shareOf(
  layout: Layout,
  blocks: readonly FitBlock[],
  row: { page: number; baseline: number; size: number; x0?: number; x1?: number },
  m: FitMeasure,
): Share | null {
  const b = blocks.find((q) => q.page === row.page && q.B.some((y) => Math.abs(y - row.baseline) < 0.05))
  if (!b) return null
  // (the block's extent from where it was laid: a member laid from the one before's end (S.rowStart's `start`) stands left of its
  // original's extent where that one's translation is the shorter, and its row is still its own: read by the original's alone,
  // the third of three members on a row had no share to be laid from and stood at the second's original start, 2610.22065v1's
  // names every other one)
  const share: Share = {
    page: row.page,
    y: row.baseline,
    band: row.size,
    x0: Math.min(b.x0, b.start ?? b.x0),
    x1: b.x1,
    end: null,
    at: null,
    ink: null,
  }
  for (const l of layout.lines) {
    if (!onShare(share, l)) continue
    if (share.end === null || l.x0 + l.used! > share.end) {
      share.end = l.x0 + l.used!
      share.at = l.baseline
    }
    const ink = inkEndOf(l, layout, m)
    if (share.ink === null || ink > share.ink) share.ink = ink
  }
  const last = layout.lines.at(-1)
  if (
    share.end === null &&
    last &&
    last.page === row.page &&
    last.baseline > row.baseline + 0.05 &&
    Math.min(last.x0 + last.used!, b.x1) > Math.max(last.x0, b.x0)
  ) {
    share.end = last.x0 + last.used!
    share.at = last.baseline
    share.ink = inkEndOf(last, layout, m)
    share.above = true
  }
  return share
}
/** whether a layout of a unit keeps its shared row as the unit's fit left it (shareOf): its text there ending no further
 *  right, nor its ink (`ink`, which the next unit is laid from), none there where the fit set none, and the line that ends
 *  furthest there on the baseline the fit set it at (`at`), so that the next unit on the row, laid from the fit's ink and on its
 *  baseline, stays clear of it and on its line (run.mjs fillPage). True with no share, and with one no next unit is laid from
 *  (`kept`: something stays between the two on the row, run.mjs keptAfter, and the unit's own line there ends where TeX's did,
 *  its slot's `stop`) */
export function keepsShare(share: Share | null | undefined, layout: Layout, m: FitMeasure): boolean {
  if (!share || share.kept) return true
  // (the shared line its last line above the row, `above`: still its last line, on that baseline, ending no further right; and
  // nothing of it on the row)
  if (share.above) {
    const last = layout.lines.at(-1)
    if (!last || layout.lines.some((l) => onShare(share, l))) return false
    return (
      last.page === share.page &&
      Math.abs(last.baseline - share.at!) < 0.01 &&
      last.x0 + last.used! <= share.end! + 0.01 &&
      inkEndOf(last, layout, m) <= share.ink! + 0.01
    )
  }
  let far: LaidLine | null = null
  for (const l of layout.lines) {
    if (!onShare(share, l)) continue
    if (share.end === null || l.x0 + l.used! > share.end + 0.01) return false
    if (share.ink !== null && inkEndOf(l, layout, m) > share.ink + 0.01) return false
    if (!far || l.x0 + l.used! > far.x0 + far.used!) far = l
  }
  return far === null || share.at === null || Math.abs(far.baseline - share.at) < 0.01
}
