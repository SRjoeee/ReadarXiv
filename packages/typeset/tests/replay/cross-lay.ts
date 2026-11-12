// I6 across the pages' lays (design-a §1.4): a page's lay runs the fill of its own page and of the first page of every member on
// it (its pass pages, lay/page.ts), each over every member with a line there, so a unit begun on page f is laid and filled by
// page f's lay and by the lay of every later page that holds a member begun on f. Every one of them is to lay it alike: the
// page that draws its lines on f reads one, the page that draws its lines on f + 1 (a unit over the break) another, and the
// fill of f reads it beside the units it fills. The entry hands each unit begun on a pass page as it laid it
// (EntryOptions.lays, lay/page.ts UnitLay); this compares them, unit by unit, every lay against the first that laid it.
//
// One cause is known and stays (the lane page-target's trace of 2026-11-12, LATER.md): the head pass (shared/fill-page.ts
// headOf) reads the leading of the paragraph over a unit from that paragraph's current layout, and a paragraph begun on the
// page before f and ending in one line at the top of f is filled by f's lay (its first page is a pass page there) and left at
// its fit by f + 1's (it is not); so the unit under it is laid lower by one lay than by the other. Told by what it moves: the
// lays differ in the head, and else only in what the head pass's lay of the unit sets (fill-page.ts withLead: the head, no
// borrow, its first frame's leading, over the fill's state, whose mark `box` the layout a lay kept from S.fill.leads does not
// carry) and its lines' baselines; same state, scale, line count and pages, and every other field of the fit's state. Any
// other difference is new.
import type { UnitLay } from '../../src/lay/page.ts'

export type CrossLayDiffer = {
  ord: number
  /** its first page, whose pass laid it */
  page: number
  /** the pages whose lays laid it, the first the one compared with */
  by: number[]
  cause: 'head' | 'other'
  /** what differs: the fields, the first lay's value against the other's where it is a number */
  what: string
}
export type CrossLay = { units: number; twice: number; differ: CrossLayDiffer[] }

/** the fields of a fit's state the head pass's lay of a unit sets (fill-page.ts withLead over the fill's state) */
const HEAD_SETS: readonly string[] = ['head', 'borrow', 'lead', 'leads', 'box']

/** what differs between two lays of one unit, by field ('' where nothing), and whether the head pass's alone */
export function layDiffer(a: UnitLay, b: UnitLay): { what: string; head: boolean } {
  const num = (k: string, x: unknown, y: unknown) =>
    typeof x === 'number' && typeof y === 'number' ? `${k} ${x} / ${y}` : k
  // (its shape: state, scale, its lines' count and pages)
  const shape: string[] = []
  if (a.state !== b.state) shape.push(`state ${a.state} / ${b.state}`)
  if (a.scale !== b.scale) shape.push(num('scale', a.scale, b.scale))
  const la = a.lines ?? [],
    lb = b.lines ?? []
  if (la.length !== lb.length) shape.push(`lines ${la.length} / ${lb.length}`)
  else if (la.some((l, i) => l[0] !== lb[i]![0])) shape.push('lines: pages')
  // (its fit's state, field by field)
  const at = (x: UnitLay) => (x.at ?? {}) as Record<string, unknown>
  const fit = [...new Set([...Object.keys(at(a)), ...Object.keys(at(b))])]
    .sort()
    .filter((k) => JSON.stringify(at(a)[k]) !== JSON.stringify(at(b)[k]))
  const moved = la.length === lb.length && la.some((l, i) => l[1] !== lb[i]![1]) ? ['lines: baselines'] : []
  const what = [...shape, ...fit.map((k) => num(`at.${k}`, at(a)[k], at(b)[k])), ...moved].join('; ')
  const head = !shape.length && fit.includes('head') && fit.every((k) => HEAD_SETS.includes(k))
  return { what, head }
}

/** I6 across the lays: `lays`, by unit, its lays by the page whose lay laid it */
export function crossLayOf(lays: ReadonlyMap<number, ReadonlyMap<number, UnitLay>>): CrossLay {
  const out: CrossLay = { units: lays.size, twice: 0, differ: [] }
  for (const [ord, by] of [...lays].sort((a, b) => a[0] - b[0])) {
    if (by.size < 2) continue
    out.twice++
    const pages = [...by.keys()].sort((a, b) => a - b)
    const first = by.get(pages[0]!)!
    const differ = pages.slice(1).flatMap((pg) => {
      const d = layDiffer(first, by.get(pg)!)
      return d.what ? [{ pg, ...d }] : []
    })
    if (!differ.length) continue
    out.differ.push({
      ord,
      page: first.page,
      by: [pages[0]!, ...differ.map((d) => d.pg)],
      cause: differ.every((d) => d.head) ? 'head' : 'other',
      what: differ.map((d) => `p${d.pg}: ${d.what}`).join(' | '),
    })
  }
  return out
}
