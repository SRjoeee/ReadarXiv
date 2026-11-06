// S.nameLed (design-b §1.6 F1, E19): a unit whose first line follows on its line a babel name that leads no unit, the name's
// counter its row's (an appendix's contents line, "Appendix A: Top-p Scaling …", its title an ink unit), is laid from where the
// name's drawn word and counter end, the original's separation after them, as a shared line's next unit is from where the unit
// before it ends; where the name was not drawn, where TeX set it. Its line's in the name's column only: a unit across the
// gutter is the other column's. Ported from engine 065c1d973 run.mjs RUN:2184-2192, over S.names' records of its page
// (lane L1 states the pair as the flow: the name member, then the unit; Placed.join).
import type { NameRecord } from './names.ts'

/** the first block as S.nameLed reads it */
export type LedBlock = {
  page: number
  B: readonly number[]
  x0: number
  indent: number
  sizes?: readonly number[]
  centred?: boolean
}

/** S.nameLed: where the unit's first line starts after a drawn name that leads no unit on its line, or null (RUN:2184) */
export function nameLed(b: LedBlock | undefined, names: readonly NameRecord[]): number | null {
  if (!b || b.centred) return null
  const x = b.x0 + b.indent,
    size = b.sizes?.[0] ?? 10
  const nm = names.find(
    (r) =>
      r.drawn &&
      r.unit === undefined &&
      r.page === b.page &&
      Math.abs(r.box.baseline - b.B[0]!) < 0.25 * size &&
      r.box.x1 <= x + 0.5 &&
      x - r.box.x1 < 3 * size &&
      x >= r.column[0] &&
      x < r.column[1],
  )
  return nm ? nm.x! + nm.w! + Math.max(0, x - nm.box.x1) : null
}
