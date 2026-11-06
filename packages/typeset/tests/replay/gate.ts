// The gate's runner over one pair, its members as today prepared them (lab/typeset/gate.mjs runs it on the corpus): every
// unit of the pair's ledger prepared from its last laid round (round.ts prepare: the tap's tokens, blocks, size, parameters,
// its row's start), and each page laid by the package's composition (src/lay/page.ts layPagePrepared: L8-L11, E1) from that
// page's own part, design-a §1.3: the flows with a line on the page, the flows of every page one of its members begins on,
// and every member of a tie holding one of them.
// Answers the pair's laid units in the baseline's reader-dump format (FORMAT.md §4: size, leading, lines with their text,
// crops), and risk 1 of the page decision: whether a member on two pages is laid alike from each page's part.
import { layPagePrepared } from '../../src/lay/page.ts'
import type { FlowMember } from '../../src/lay/flow.ts'
import type { RuleParams } from '../../src/types.ts'
import { type DumpUnit, dumpUnit, pieceCrops, viewsOf } from './display.ts'
import { walkCase } from './fit-input.ts'
import { prepare } from './round.ts'
import { derived, ledger } from './tap.ts'
import { paperOf } from './today.ts'

export type GateUnit = { id: string | null; ord: number; kind: string | null } & DumpUnit
export type GatePair = {
  units: GateUnit[]
  prepared: Set<number>
  pages: number
  twoPages: number
  /** members laid otherwise from another page's part than from their first page's (risk 1) */
  selfDiffer: string[]
  ms: number
}

let rules: { targets: Record<string, { params: Record<string, unknown> }> } | null = null

/** a pair laid page by page from its prepared members */
export function gatePair(pair: string): GatePair {
  const L = ledger(pair)
  rules ??= derived('rules')
  const R = { ...rules!.targets[L.target]!.params, adaptiveFill: L.info.adaptiveFill ?? null } as unknown as RuleParams
  const members = new Map<number, FlowMember>()
  for (const u of L.units) {
    const rounds = [...new Set(u.slots.filter((s) => s.by === 'X.cut').map((s) => s.round))]
    if (!rounds.length) continue
    const c = walkCase(pair, u.ord, rounds.at(-1)!)
    if (typeof c !== 'string') members.set(u.ord, prepare(c))
  }
  // (each crop given its piece, which the tokens file does not record: today's crop.k, the round's U.elements slot)
  pieceCrops(pair, new Map([...members].map(([o, m]) => [o, { tokens: m.tokens } as never])))
  const ties = ((L as unknown as { settles?: { ids: number[] }[] }).settles ?? []).map((s) => ({
    rule: 'cells' as const,
    cells: s.ids,
  }))
  const onPage = new Map<number, FlowMember[]>()
  for (const m of members.values())
    for (const pg of m.pages) {
      const list = onPage.get(pg) ?? []
      onPage.set(pg, list)
      list.push(m)
    }
  const views = viewsOf(paperOf(pair))
  const dumped = new Map<
    number,
    { first: number; d: DumpUnit; lines: DumpUnit['lines']; elements: NonNullable<DumpUnit['elements']> }
  >()
  const out: GatePair = { units: [], prepared: new Set(members.keys()), pages: 0, twoPages: 0, selfDiffer: [], ms: 0 }
  const t0 = performance.now()
  for (const pg of [...onPage.keys()].sort((a, b) => a - b)) {
    out.pages++
    const part = new Map<number, FlowMember>()
    for (const f of [pg, ...new Set(onPage.get(pg)!.map((m) => m.pages[0]!))])
      for (const m of onPage.get(f) ?? []) part.set(m.ord, m)
    // (and every member of a tie that holds one of them: a table group is decided whole, design-a §1.3 (c))
    for (const t of ties)
      if (t.cells.some((o) => part.has(o)))
        for (const o of t.cells) {
          const m = members.get(o)
          if (m) part.set(o, m)
        }
    const flows = [...part.values()].sort((a, b) => a.ord - b.ord).map((m) => [m])
    const got = layPagePrepared(
      pg,
      flows,
      ties.filter((t) => t.cells.some((o) => part.has(o))),
      R,
    )
    for (const pm of got.members) {
      if (pm.state !== 'laid' || !pm.lay) continue
      const d = dumpUnit(pm.lay, (p) => views.get(p))
      const lines = d.lines.filter((l) => l.page === pg),
        elements = (d.elements ?? []).filter((e) => e.page === pg)
      const prev = dumped.get(pm.ord)
      if (!prev) {
        dumped.set(pm.ord, { first: pg, d, lines, elements })
        continue
      }
      out.twoPages++
      if (JSON.stringify(prev.d) !== JSON.stringify(d))
        out.selfDiffer.push(`ord ${pm.ord}: p${prev.first} against p${pg}`)
      prev.lines.push(...lines)
      prev.elements.push(...elements)
    }
  }
  out.ms = performance.now() - t0
  for (const u of L.units) {
    const x = dumped.get(u.ord)
    if (x)
      out.units.push({
        id: u.id,
        ord: u.ord,
        kind: u.kind,
        size: x.d.size,
        leading: x.d.leading,
        lines: x.lines,
        ...(x.elements.length ? { elements: x.elements } : {}),
      })
  }
  return out
}
