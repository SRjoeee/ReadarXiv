// Phase 11 of locate (PHASES, locate.ts): a babel name that leads a unit, bound to it.
// Reads: the index; the record's `members` (their lines' columns, phase 8's).
// Writes: the members' `leads` and `leader`.
import { type Member, sameColumn, type Work } from './work.ts'

export function leadNames(w: Work): void {
  const { NB, pageB, unitB, gB } = w.ix
  const { members } = w
  // ---- a babel name that leads a unit (today's RUN_IN, make.mjs leadAt: the first unit start after the name's end on its line,
  // in its column, in our compile): the unit whose glyph TeX set next after the name's in B's stream (glyphs of no unit between
  // aside), that glyph its first, on the name's baseline on B (0.5 pt, leadAt's) from the name's end on (0.05 pt, leadAt's).
  // TeX's stream tells the column: after a column's last line it goes on at the next column's top, never at a line beside it
  {
    const memberOfUnit = new Map<number, Member>()
    for (const mem of members) if (mem.name === undefined && mem.unit >= 0) memberOfUnit.set(mem.unit, mem)
    for (const n of members) {
      if (n.name === undefined || !n.located || n.bLast < 0) continue
      let b = n.bLast + 1
      while (b < NB && pageB[b] === pageB[n.bLast] && (unitB[b] as number) < 0) b++
      if (b >= NB || pageB[b] !== pageB[n.bLast]) continue
      const led = memberOfUnit.get(unitB[b] as number)
      if (!led || led.bFirst !== b) continue
      const g = gB(b),
        e = gB(n.bLast)
      if (Math.abs(g.y - e.y) > 0.5 || g.x0 < e.x1 - 0.05) continue
      // (in its column: a left column's last line and the right column's first can share a baseline, the stream going on from
      // the one to the other; the columns as columnsAndMeasures read them on A, a line over both (2) of either)
      const nc = n.lines.at(-1)?.[1],
        lc = led.lines[0]?.[1]
      if (nc !== undefined && lc !== undefined && !sameColumn(nc, lc)) continue
      n.leads = led.ord
      led.leader = n.ord
    }
  }
}
