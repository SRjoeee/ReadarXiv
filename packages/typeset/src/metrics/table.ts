// The table adapter of Metrics (design-b §4 `recordedMetrics`, design-a §4 `tableMetrics`): every measure answered from a
// table of measures made at 100 px, as today's canvas made them (layer2.mjs w100, ink100, inkRight100 measure each run at
// 100 px and scale). The tap writes one such table per (paper, target): every first measure of a (canvas font, text) of
// today's run (baseline/tap/TAP.md §5, `metrics/<pair>.metrics.json.gz`), so that a port measures today's exact widths in
// Node. A measure the table lacks is a failure of the replay, never a guess: it throws MissingMeasure.
import type { FaceId, Metrics } from '../types.ts'

/** a table of measures at 100 px: [face, text, width, ink ascent, ink descent], and [face, text, ink right] */
export type MeasureTable = {
  widths: readonly (readonly [face: FaceId, text: string, w100: number, ascent100: number, descent100: number])[]
  /** the ink of a text measured for its ink alone (ink100 of a text no width was read of) */
  inks?: readonly (readonly [face: FaceId, text: string, ascent100: number, descent100: number])[]
  rights?: readonly (readonly [face: FaceId, text: string, right100: number | null])[]
}

/** a measure the table does not hold */
export class MissingMeasure extends Error {
  readonly face: FaceId
  readonly text: string
  constructor(face: FaceId, text: string, what: string) {
    super(`no ${what} of ${JSON.stringify(text.slice(0, 40))} in ${face}`)
    this.name = 'MissingMeasure'
    this.face = face
    this.text = text
  }
}

/** a measure at 100 px at another size: itself at 100 (so that a port asking at 100 reads the table's own number, as
 *  today's code reads w100), else scaled as a canvas scales a font's advance */
const at = (v100: number, size: number) => (size === 100 ? v100 : (v100 * size) / 100)

/**
 * Metrics from a table. `ready` is true for a face the table measures text in, false for any other: the table records
 * what loaded faces measured, and holds no coverage of its own
 */
export function tableMetrics(table: MeasureTable): Metrics {
  const widths = new Map<string, readonly [number, number, number]>()
  const faces = new Set<FaceId>()
  for (const [face, text, w, a, d] of table.widths) {
    widths.set(`${face}|${text}`, [w, a, d])
    faces.add(face)
  }
  const inks = new Map<string, readonly [number, number]>()
  for (const [face, text, a, d] of table.inks ?? []) inks.set(`${face}|${text}`, [a, d])
  const rights = new Map<string, number | null>()
  for (const [face, text, r] of table.rights ?? []) rights.set(`${face}|${text}`, r)
  const width = (face: FaceId, text: string) => {
    const m = widths.get(`${face}|${text}`)
    if (!m) throw new MissingMeasure(face, text, 'width')
    return m
  }
  return {
    ready: (face) => faces.has(face),
    advance: (face, size, text) => at(width(face, text)[0], size),
    ink: (face, size, text) => {
      const m = widths.get(`${face}|${text}`)
      const [a, d] = m ? [m[1], m[2]] : (inks.get(`${face}|${text}`) ?? [])
      if (a === undefined || d === undefined) throw new MissingMeasure(face, text, 'ink')
      const r = rights.get(`${face}|${text}`)
      return [at(a, size), at(d, size), r === undefined || r === null ? Number.NaN : at(r, size)]
    },
  }
}
