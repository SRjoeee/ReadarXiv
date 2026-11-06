// The gate's runner over one pair from lane L1's parts (stage one of the adapter, src/lay/adapt.ts): each member of the
// paper's L1 bundle (tests/replay/l1.ts) set by the adapter from the facts its part states (U.blocks, U.decor, U.params; the
// shared rows of its flow), its reading and tokens today's (the tap's last laid round of the same unit: joined by ord and
// content id), and each page laid by layPagePrepared from its own L1 part's flows and ties. Answers the laid units in the
// baseline's reader-dump format, the members the adapter did not set by what stops them, and, per adapted member, the first
// field of its setting that differs from today's (round.ts prepare over the same round: the blocks' pages, baselines and
// measures, their alignment and indent, the size, the leading, the edges): the rule whose stated facts changed it.
import type { FlowMember } from '../../src/lay/flow.ts'
import { adapt } from '../../src/lay/adapt.ts'
import { layPagePrepared } from '../../src/lay/page.ts'
import { fitMeasure } from '../../src/breaker/measure.ts'
import type { Metrics, RuleParams } from '../../src/types.ts'
import { type DumpUnit, dumpUnit, pieceCrops, viewsOf } from './display.ts'
import { walkCase } from './fit-input.ts'
import type { GateUnit } from './gate.ts'
import { type L1Placed, l1Paper } from './l1.ts'
import { prepare } from './round.ts'
import { derived, ledger } from './tap.ts'
import { paperOf, todayBundle } from './today.ts'

type Raw = Record<string, unknown>
export type GateL1 = {
  units: GateUnit[]
  /** members not set, by what stops them */
  stops: Map<string, number>
  /** per adapted member, the first field of its setting that differs from today's, or 'equal' */
  setting: Map<number, string>
  pages: number
  twoPages: number
  selfDiffer: string[]
  /** a page whose lay threw, and why */
  threw: string[]
  /** members whose flow's lay threw, and why (a width the table lacks: MissingMeasure) */
  thrown: Map<number, string>
  /** members of a table group one of whose cells the adapter did not set: the group stays the original's */
  tieHeld: Set<number>
}

const DETAIL = !!process.env.AXT_GATE_DETAIL
/** AXT_GATE_DEEP=<pair>:<ord>: every field of that member's preparation that differs from today's, printed */
const DEEP = process.env.AXT_GATE_DEEP
/** every difference between two values beyond 0.005, by path (functions and the tokens aside), at most 40 */
export function differences(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (out.length >= 40 || path.endsWith('.tokens') || path.endsWith('.measure') || path.endsWith('.patterns'))
    return out
  if (typeof a === 'function' || typeof b === 'function') return out
  if (typeof a === 'number' && typeof b === 'number') {
    if (!(Math.abs(a - b) <= 0.005 || a === b)) out.push(`${path}: ${a} against ${b}`)
    return out
  }
  if (a instanceof Map && b instanceof Map) return differences(Object.fromEntries(a), Object.fromEntries(b), path, out)
  if (a instanceof Set && b instanceof Set) return differences([...a], [...b], path, out)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}.length: ${a.length} against ${b.length}`)
    for (let i = 0; i < Math.min(a.length, b.length); i++) differences(a[i], b[i], `${path}[${i}]`, out)
    return out
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
      differences((a as Raw)[k], (b as Raw)[k], `${path}.${k}`, out)
    return out
  }
  if (a !== b && !(a == null && b == null))
    out.push(`${path}: ${JSON.stringify(a)?.slice(0, 80)} against ${JSON.stringify(b)?.slice(0, 80)}`)
  return out
}
let rules: { targets: Record<string, { params: Raw }> } | null = null
const r2 = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)

/** the first field of a member's setting that differs from today's prepared one, or 'equal' */
export function settingDiff(mine: FlowMember, today: FlowMember): string {
  if (mine.blocks.length !== today.blocks.length) return 'U.blocks: block count'
  for (let k = 0; k < mine.blocks.length; k++) {
    const a = mine.blocks[k]!,
      b = today.blocks[k]!
    if (a.page !== b.page || a.B.length !== b.B.length) return 'U.blocks: lines (page, count)'
    if (a.B.some((y, j) => Math.abs(y - b.B[j]!) > 0.01)) return 'U.blocks: baselines'
    if (Math.abs(a.x0 - b.x0) > 0.01 || Math.abs(a.x1 - b.x1) > 0.01)
      return `U.blocks/U.decor: measure (x0, x1)${DETAIL ? ` ${[a.x0, a.x1, b.x0, b.x1, a.widened, b.widened, a.rects.length].join(',')}` : ''}`
    if (Math.abs((a.indent ?? 0) - (b.indent ?? 0)) > 0.01) return 'U.blocks/U.decor: indent'
    if (!!a.centred !== !!b.centred) return 'U.blocks: centred'
    if ((a.flush ?? null) !== (b.flush ?? null)) return 'U.decor: flush'
    if (JSON.stringify(a.stop ?? null) !== JSON.stringify(b.stop ?? null)) return 'U.decor: stop (kept row)'
    if (Math.abs((a.pitch0 ?? 0) - (b.pitch0 ?? 0)) > 0.01) return 'U.blocks: pitch'
  }
  if (Math.abs(mine.s - today.s) > 0.01) return 'U.params: size'
  if (r2(mine.P.leadBase) !== r2(today.P.leadBase)) return 'U.params: leadBase'
  const ha = mine.P.halfLead,
    hb = today.P.halfLead
  if (!!ha !== !!hb || (ha && hb && (ha.head !== hb.head || ha.foot !== hb.foot))) return 'U.params: edges (head, foot)'
  if (ha && hb && Math.abs(ha.below - hb.below) > 0.01 && Number.isFinite(ha.below + hb.below))
    return 'U.params: edges (below)'
  if (!!mine.follower !== !!today.follower) return 'F.chains: follower'
  // (each line's box, top and bottom: TeX's fonts' boxes on A against the file's lines today)
  for (let k = 0; k < mine.blocks.length; k++)
    if (
      mine.blocks[k]!.rects.some(
        (r, j) =>
          Math.abs(r[2] - today.blocks[k]!.rects[j]![2]) > 0.01 ||
          Math.abs(r[4] - today.blocks[k]!.rects[j]![4]) > 0.01,
      )
    )
      return 'U.blocks: line boxes (top, bottom)'
  // (each line's extent, x0 and x1: its glyphs' advances on A against the file's line today)
  for (let k = 0; k < mine.blocks.length; k++)
    if (
      mine.blocks[k]!.rects.some(
        (r, j) =>
          Math.abs(r[1] - today.blocks[k]!.rects[j]![1]) > 0.005 ||
          Math.abs(r[3] - today.blocks[k]!.rects[j]![3]) > 0.005,
      )
    )
      return `U.blocks: line ends (x0, x1)${DETAIL ? ` ${JSON.stringify(mine.blocks[k]!.rects.map((r, j) => [r[1], r[3], today.blocks[k]!.rects[j]![1], today.blocks[k]!.rects[j]![3]]).filter((x) => Math.abs(x[1]! - x[3]!) > 0.005 || Math.abs(x[0]! - x[2]!) > 0.005))}` : ''}`
  if (JSON.stringify(mine.tokens.length) !== JSON.stringify(today.tokens.length)) return 'B.tokens: count'
  return 'equal'
}

/** a pair laid page by page from L1's parts, the reading and tokens today's; `metricsOf` the Metrics its lays measure with
 *  (default: the tap's table of today's measures, which throws MissingMeasure for a measure today never made) */
export function gateL1Pair(pair: string, o: { metricsOf?: (pair: string) => Metrics } = {}): GateL1 {
  const measure = o.metricsOf ? fitMeasure(o.metricsOf(pair)) : null
  const out: GateL1 = {
    units: [],
    stops: new Map(),
    setting: new Map(),
    pages: 0,
    twoPages: 0,
    selfDiffer: [],
    threw: [],
    thrown: new Map(),
    tieHeld: new Set(),
  }
  const stop = (why: string) => out.stops.set(why, (out.stops.get(why) ?? 0) + 1)
  const L = ledger(pair)
  const paper = paperOf(pair)
  const bundle = l1Paper(paper)
  if (!bundle) {
    stop('no L1 bundle of the paper')
    return out
  }
  rules ??= derived('rules')
  const R = { ...rules!.targets[L.target]!.params, adaptiveFill: L.info.adaptiveFill ?? null } as unknown as RuleParams
  const today = todayBundle(paper)
  const views = viewsOf(paper)
  // (every member once, from the part of its first page; its flow's neighbours)
  const byOrd = new Map<number, { m: L1Placed; before: L1Placed | null; after: L1Placed | null }>()
  for (const part of bundle.parts.values())
    for (const flow of part.flows)
      flow.forEach((m, k) => {
        if (!byOrd.has(m.ord)) byOrd.set(m.ord, { m, before: flow[k - 1] ?? null, after: flow[k + 1] ?? null })
      })
  // (L1's members joined to today's units by content id, equal ids by order among equals: the baseline's join rule)
  const todayById = new Map<string, (typeof L.units)[number][]>()
  for (const u of [...L.units].sort((a, b) => a.ord - b.ord)) {
    if (!u.id) continue
    const list = todayById.get(u.id) ?? []
    todayById.set(u.id, list)
    list.push(u)
  }
  const unitOf = new Map<number, (typeof L.units)[number]>()
  const seenId = new Map<string, number>()
  for (const [ord, x] of [...byOrd].sort((a, b) => a[0] - b[0])) {
    if (typeof x.m.text !== 'string') continue
    const k = seenId.get(x.m.text) ?? 0
    seenId.set(x.m.text, k + 1)
    const u = todayById.get(x.m.text)?.[k]
    if (u) unitOf.set(ord, u)
  }
  const adapted = new Map<number, FlowMember>()
  for (const [ord, x] of byOrd) {
    const u = unitOf.get(ord)
    if (typeof x.m.text !== 'string') {
      stop(`a ${x.m.kind} member (a babel name or a figure text: S.names, S.figures)`)
      continue
    }
    if (!u) {
      stop('no unit of today with its id')
      continue
    }
    const rounds = [...new Set(u.slots.filter((s) => s.by === 'X.cut').map((s) => s.round))]
    if (!rounds.length) {
      stop('not laid by today (no tokens of its to take)')
      continue
    }
    const c = walkCase(pair, u.ord, rounds.at(-1)!)
    if (typeof c === 'string') {
      stop(`today's round: ${c}`)
      continue
    }
    const label = c.slot('U.label', 'label')?.label as { drawn?: string } | null | undefined
    const decor = c.slot('U.decor', 'heading')
    const up = c.slot('U.params')
    const nextUnit = x.after ? unitOf.get(x.after.ord) : undefined
    const got = adapt({
      m: x.m,
      before: x.before,
      after: x.after,
      afterOpen: !!(nextUnit?.slots.find((s) => s.by === 'U.admit' && s.round === 0)?.value as Raw | undefined)?.ok,
      R,
      measure: (measure ?? (c.P as Raw).measure) as never,
      patterns: (c.P as Raw).patterns as never,
      view: (pg) => views.get(pg),
      rulesOf: (pg) => today?.rules(pg),
      lineskip: (bundle.parts.values().next().value?.paper.lineskip as [number, number] | undefined) ?? null,
      reading: {
        tokens: c.tokens as never,
        labelDrawn: label?.drawn ?? null,
        lead: !!(c.slot('U.lead', 'lead')?.lead ?? null),
        title: u.kind === 'heading' && !decor?.heading,
        front: false,
        cjkSize: undefined,
        // (the regions today's tokens block to: U.breaks' referenced, as the tokens were made with)
        referenced: new Set(
          (c.tokens as { blockTo?: number }[]).flatMap((t) => (Number.isInteger(t.blockTo) ? [t.blockTo!] : [])),
        ),
      },
    })
    if ('stop' in got) {
      stop(got.stop)
      continue
    }
    // (the CJK body face's size correction, B.faces': today's trackStart, as U.params read it)
    got.member.P.trackStart = up?.trackStart as number
    // (named by today's ords, which the ledger and the dumps hold: L1's ord of a unit can differ)
    const todayOrd = (o: number) => unitOf.get(o)?.ord ?? o
    const mem = got.member
    mem.ord = u.ord
    if (mem.follower) mem.follower = { ...mem.follower, id: todayOrd(mem.follower.id) }
    if (mem.rowStart)
      mem.rowStart = { ...mem.rowStart, row: { ...mem.rowStart.row, id: todayOrd(mem.rowStart.row.id) } }
    adapted.set(ord, mem)
    const td = prepare(c)
    out.setting.set(u.ord, settingDiff(mem, td))
    if (DEEP === `${pair}:${u.ord}`) console.log(JSON.stringify(differences(mem, td), null, 1))
  }
  pieceCrops(pair, new Map([...adapted].map(([o, m]) => [o, { tokens: m.tokens } as never])))
  const dumped = new Map<
    number,
    { first: number; d: DumpUnit; lines: DumpUnit['lines']; elements: NonNullable<DumpUnit['elements']> }
  >()
  // (a table group is laid whole or not at all, design-a §1.4: a group one of whose cells the adapter did not set stays the
  // original's whole, as today's withhold leaves a group a cell of which is not drawn)
  const tieHeld = new Set<number>()
  for (const part of bundle.parts.values())
    for (const t of (part.ties ?? []) as { rule: string; cells?: number[][] }[]) {
      const cells = (t.cells ?? []).flat()
      // (a cell today leaves the original's, its row kept or none, does not hold its group: the kept cell of 2026-10-24)
      const laidToday = (o: number) => !!unitOf.get(o)?.slots.some((x) => x.by === 'X.cut')
      if (t.rule === 'cells' && cells.some((o) => !adapted.has(o) && laidToday(o)))
        for (const o of cells) tieHeld.add(o)
    }
  for (const o of tieHeld) if (adapted.has(o)) out.tieHeld.add(adapted.get(o)!.ord)
  for (const [pg, part] of [...bundle.parts].sort((a, b) => a[0] - b[0])) {
    out.pages++
    // (its flows, cut where a member is not set: the one after it starts where TeX set it, as after a member left)
    const flows: FlowMember[][] = []
    for (const flow of part.flows) {
      let cur: FlowMember[] = []
      for (const m of flow) {
        const a = tieHeld.has(m.ord) ? undefined : adapted.get(m.ord)
        if (!a) {
          if (cur.length) flows.push(cur)
          cur = []
          continue
        }
        cur.push(cur.length ? a : { ...a, rowStart: undefined })
      }
      if (cur.length) flows.push(cur)
    }
    const ties = ((part.ties ?? []) as { rule: string; cells?: number[][] }[])
      .filter((t) => t.rule === 'cells')
      .map((t) => ({ rule: 'cells' as const, cells: (t.cells ?? []).flat().map((o) => unitOf.get(o)?.ord ?? o) }))
    // (a flow whose lay throws is left the original's alone, design-a §1.4: found by laying each flow of the page by itself,
    // then the page again without it; a width the table lacks is a measure the stated facts asked that today's run never made)
    let got: ReturnType<typeof layPagePrepared> | null = null
    try {
      got = layPagePrepared(pg, flows, ties, R)
    } catch {
      const ok = flows.filter((f) => {
        try {
          layPagePrepared(pg, [f], [], R)
          return true
        } catch (e) {
          const why =
            (e as Error)?.name === 'MissingMeasure' ? 'MissingMeasure' : String((e as Error)?.message ?? e).slice(0, 80)
          for (const m of f) if (m.pages[0] === pg || !m.pages.includes(pg)) out.thrown.set(m.ord, why)
          return false
        }
      })
      try {
        got = layPagePrepared(pg, ok, ties, R)
      } catch (e) {
        out.threw.push(`p${pg}: ${String((e as Error)?.message ?? e).slice(0, 120)}`)
      }
    }
    if (!got) continue
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
