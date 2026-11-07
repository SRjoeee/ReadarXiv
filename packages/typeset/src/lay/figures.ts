// S.figures over the part (design-b §1.6 L4; shared/figures.ts, today's paintFigures): a page's figure texts, each drawn in its
// translation where it says something its source does not, in the faces of its style, each set (a size tie) at one size, on its
// original's baseline from its anchor's edge into the free line beside its box, the original's where it does not fit. Its
// facts are the part's, as the prepare states them from today's figure reading (layout/figure-text.mjs): its line (its box
// along its run and its baseline), its anchor (Placed.align: l start, c centre, r end), its room before and after its box
// (Room.side), the stroke under its text (Room.under), its style (size, fill, family, weight, slant), its own text
// (Placed.plain), its set (Tie size). A figure text drawn is one laid line of its runs, its text group off. What is not drawn
// stays the original's: one whose ink stays (the part's why, `unwrapped`: a label today's figure reading leaves where it
// stands), a turned one (`kind`: design-a's Item has no turn, a contract for lane L4), one whose anchor the part does not state
// (`kind`, align 'j'), its row none (`none`) or failed (the row's why, as the entry's contentOf), the same as its source
// (`none`), unfit or crowded (`unfit`), a face no served face holds (`served`). A part made before the prepare stated a figure
// text's own text (Placed.plain) is not read here: the entry reads its figure texts as it did before (entry.ts).
import type { Part, Placed, Row } from '@readarxiv/format'
import { faceOf } from '../breaker/faces.ts'
import { fontString } from '../breaker/measure.ts'
import { shown, type TextPiece } from '../breaker/text.ts'
import type { TextItem } from '../emit/display.ts'
import { type FigureRow, type FigureUnit, figures } from '../shared/figures.ts'
import type { FaceId, Laid, Metrics, RuleParams, Rows, Unlaid } from '../types.ts'
import type { PaperReading } from './read.ts'

const ANCHOR = { l: 'start', c: 'centre', r: 'end' } as const

/** a figure text's row as S.figures reads it: its translation's text pieces (an element a space); none where it has none (a
 *  failed row's reason is the entry's, figuresOf) */
function unitOf(row: Row | undefined): FigureUnit | undefined {
  if (!row?.ok) return undefined
  const pieces: TextPiece[] = []
  const walk = (ps: typeof row.content) => {
    for (const p of ps)
      if (p.t === 'text') pieces.push({ t: 'text', s: p.s, tr: true })
      else if (p.t === 'el') pieces.push({ t: 'text', s: ' ' })
      else walk(p.content)
  }
  walk(row.content)
  return { state: 'whole', pieces }
}

/**
 * The figure texts of page `page` among `members` (kind `figure`): each one's outcome, a laid line where drawn, a state where
 * not, and the faces to wait for
 */
export function figuresOf(
  part: Part,
  members: readonly Placed[],
  rows: Rows,
  o: { paper: PaperReading; R: RuleParams; metrics: Metrics },
): { laid: Map<number, Laid['lines']>; why: Map<number, Unlaid>; wait: [FaceId, string][] } {
  const page = part.page
  const laid = new Map<number, Laid['lines']>()
  const why = new Map<number, Unlaid>()
  // (its set: the size tie that holds it, by the tie's first member; else its own)
  const setOf = new Map<number, string>()
  for (const t of part.ties ?? []) if (t.rule === 'size') for (const ord of t.ords) setOf.set(ord, `s${t.ords[0]}`)
  const rowsOf: FigureRow[] = []
  const byOrd = new Map<number, Placed>()
  for (const m of members) {
    const l = m.lines[0]
    if (!l || l[0] !== page) continue
    const row = typeof m.text === 'string' ? rows.get(m.text) : undefined
    if (m.why) why.set(m.ord, m.why)
    else if (m.dir || m.lines.length !== 1 || m.align === 'j') why.set(m.ord, 'kind')
    // (a row that failed: its reason kept, as the entry's contentOf keeps it, #631's review; S.figures fits no set over it)
    else if (row && !row.ok) why.set(m.ord, row.why.kind)
    else {
      const size = m.style.size
      const side = m.room.side
      byOrd.set(m.ord, m)
      rowsOf.push({
        id: m.ord,
        group: `f${m.ord}`,
        page,
        x: l[2],
        y: l[4],
        ux: 1,
        uy: 0,
        length: l[3] - l[2],
        size,
        ascent: (l[5] - l[4]) / size,
        descent: (l[4] - l[6]) / size,
        anchor: ANCHOR[m.align as keyof typeof ANCHOR],
        fill: m.style.fill ?? -1,
        font: m.style.design ?? '',
        cls: { fam: m.style.role, bold: !!m.style.bold, italic: !!m.style.slant },
        set: setOf.get(m.ord) ?? `f${m.ord}`,
        before: side ? l[2] - side[0] : 0,
        after: side ? side[1] - l[3] : 0,
        under: m.room.under ?? null,
      })
    }
  }
  if (!rowsOf.length) return { laid, why, wait: [] }
  const R = o.R as unknown as { cjkQuotes?: boolean; floorMin: number }
  const got = figures({
    figures: rowsOf,
    unit: (id) => {
      const t = byOrd.get(id)!.text
      return unitOf(typeof t === 'string' ? rows.get(t) : undefined)
    },
    src: (id) =>
      shown({ t: 'text', s: byOrd.get(id)?.plain ?? '' })
        .replace(/\s+/g, ' ')
        .trim(),
    grouped: () => true,
    designs: o.paper.designs,
    faceOf: (st, cls) => faceOf(o.paper.roles, st, cls),
    rules: { cjkQuotes: R.cjkQuotes, floorMin: R.floorMin },
    metrics: o.metrics,
  })
  const w100 = (s: string, f: Parameters<typeof fontString>[0]) => o.metrics.advance(fontString(f, 100), 100, s)
  for (const f of got.figures) {
    if (!f.drawn) {
      why.set(
        f.id,
        f.why === 'unfit' || f.why === 'crowded'
          ? 'unfit'
          : f.why === 'served'
            ? ('served' as Unlaid)
            : f.why === 'waiting'
              ? 'waiting'
              : 'none',
      )
      continue
    }
    const items: TextItem[] = []
    let x = f.x!
    for (const r of f.runs!) {
      items.push({ s: r.s, x, face: fontString(r.face, 100), size: f.size!, ...(f.fill ? { fill: f.fill } : {}) })
      x += (w100(r.s, r.face) / 100) * f.size!
    }
    laid.set(f.id, [[f.y!, f.x!, x, items]])
  }
  return { laid, why, wait: got.wait }
}
