// layPage's composition over prepared flows (design-b §1.6 L8-L11, E1): every flow of the part laid (L8, layFlow), each laid
// member's fill leadings with it (L9); then each pass page the page reads, ascending (its own and the first page of every
// member with a line on it: design-a §1.3), filled over the members with a line there in stream order (L10, S.fill.page's
// pass); the table groups settled (L11, S.table.settle: a group on two pages or with a cell unfit is withheld whole); the
// page's members as drawn (E1, D.display). Pure: the flows are laid anew on each call, nothing is kept between calls.
import { type DisplayLine, displayLines } from '../emit/display.ts'
import type { PageRules } from '../shared/fill-page.ts'
import { fillPass, type PassUnit } from '../shared/fill-pass.ts'
import type { FillTarget } from '../shared/fill-target.ts'
import { tableSettle } from '../shared/table-settle.ts'
import { depthUnder } from '../fit/walk.ts'
import type { FitBlock, FitState, Layout } from '../fit/types.ts'
import type { EvenKnob, LedgerSlot, RuleParams, Unlaid } from '../types.ts'
import { type FlowMember, layFlowPrepared } from './flow.ts'
import { fin, layoutOf, linesOf } from './trace.ts'

/** a member on the page as laid: its state, its fit, its lines as drawn (D.display), its trace; where its fit or its page's fill
 *  let its lines past TeX's text block bottom, how far they went (`fit.over`), where the fill evened it, what it took
 *  (`evened`), and where it is laid at its size tie's one size, that size and the member whose need set it (`tie`): types.ts
 *  Laid */
export type PageMember = {
  ord: number
  state: 'laid' | Unlaid
  fit?: { size: number; lead: number; track: number; borrowed: number; over?: number }
  evened?: { by: EvenKnob[]; lines: number }
  tie?: { scale: number; by: number }
  lines: DisplayLine[]
  /** the unit as its lay and its fill left it (the gate's dump reads it) */
  lay?: PassUnit
  /** why its flow's lay threw, where it did (state 'error') */
  error?: string
  slots: LedgerSlot[]
}
/** a member begun on a pass page of the call, as the call laid it and that page's fill left it: every page's lay that runs that
 *  pass lays it alike (I6), which the cross-lay check compares (EntryOptions.lays) */
export type UnitLay = {
  ord: number
  /** its first page, whose pass filled it */
  page: number
  state: PageMember['state']
  /** where laid: its scale of its own size, the state it was laid at, each line's page, baseline and the size it is drawn at
   *  (its run's, `seg`, where the unit is laid a run at a time: fit/runs.ts; else the layout's own) */
  scale?: number
  at?: FitState
  lines?: [page: number, baseline: number, size: number][]
}
export type PreparedPage = {
  page: number
  members: PageMember[]
  passes: { page: number; target: FillTarget | null }[]
  tables: { cells: number[]; why: string | null }[]
  /** every member laid in the call, on any page (a member of a tie the page's part holds may have no line on it): its scale of
   *  its own size */
  fits: [ord: number, scale: number][]
  /** the same members' scales as their own lays set them, before any page's fill (a tie reads a member begun on a page after
   *  another's first page so, as the page's first lay set it: tieCaps) */
  unfilled: [ord: number, scale: number][]
  /** every member begun on a pass page of the call, as laid and filled (a member of a pass page with no line on this one too) */
  passed: UnitLay[]
}

/** two scales of a tie alike: within the fit's thousandths (its caps are floored to them: U.params, a cell's cap) */
const SAME = 0.0005
/** the pages a member has lines on (its pages) begin with its first */
const firstPage = (m: FlowMember) => m.pages[0] ?? 0
/** how far under TeX's text block bottom a layout's lines stand where the state that laid them let them past it (FitState.over:
 *  the fit's borrow, §18.37; the page fill's foot step, §18.57; a line of a unit laid in runs by its run's state), to the
 *  hundredth up; 0 where none does. The state's own `over` is what it allows (the foot's a line of the unit's pitch), not this */
const pastBottom = (L: Layout, blocks: readonly FitBlock[]) =>
  depthUnder(
    L.lines.filter((l) => ((l.seg?.state ?? L.state).over ?? 0) > 0),
    blocks,
  )

/** a part's tie as the page lays it: a table group's members' ords (`cells`), or members laid at one size (`size`: one paragraph
 *  of TeX's the front end cut at a float, a run-in head and its paragraph; a figure's set is no tie the page lays, each of its
 *  texts at its own size: lay/entry.ts) */
export type PageTie = { rule: 'cells'; cells: readonly number[] } | { rule: 'size'; ords: readonly number[] }

/**
 * Page `page` laid from its part's flows (each member prepared), its ties, the rules: design-b's L8-L11 and E1. The members of a
 * size tie laid on the page at one scale of their own sizes, the smallest any of them is laid at: each laid larger is capped there
 * (its fit's states from that scale down, P.capScale) and the page laid again (the checkpoint's free-9: a paragraph's first
 * part at its size, its part after the float shrunk; the maintainer's ruling: the text of one paragraph is to be even). By scale,
 * not by points: a run-in head TeX set smaller than its paragraph keeps the original's ratio to it, and neither shrinks the other
 * for being of another size (the coordinator's decision under that ruling, 2026-11-08: 2610.30034v1 p2's head at 8.97 capped its
 * paragraph at 8.97, 0.9 of its 9.96). The least a member is capped at is its tie-mates' begun on its own first page or before
 * (tieCaps, §18.64): a later page's pass never reaches back over the page break
 */
export function layPagePrepared(
  page: number,
  flows: readonly (readonly FlowMember[])[],
  ties: readonly PageTie[],
  R: RuleParams,
  trace = false,
): PreparedPage {
  const cells = ties.filter((t): t is Extract<PageTie, { rule: 'cells' }> => t.rule === 'cells')
  const first = layPageTied(page, flows, cells, R, trace)
  const sizes = ties.filter((t): t is Extract<PageTie, { rule: 'size' }> => t.rule === 'size')
  if (!sizes.length) return first
  // (every tied member laid in the call, whether or not it has a line on this page: the part holds the tie's every flow, so each
  // page a tie is laid for caps alike; read off the page's members alone, a member on pages 1-2 tied to one on page 2 was laid
  // at its own size for page 1 and at the other's for page 2)
  // (never under the fit's floor: a member another of its tie was set under the floor (X.further's shrink) for is capped at the
  // floor, no lower; the checkpoint's (6), no rule drives a unit there that its own text does not. A member's own floor where
  // U.params sets one: a line of the page's head or foot keeps its size)
  const floor = Number((R as unknown as { floor?: number }).floor ?? 0)
  const floorOf = new Map<number, number>()
  for (const f of flows) for (const m of f) floorOf.set(m.ord, Math.max(floor, Number(m.P.floor ?? floor)))
  // (each laid larger capped at the least and the page laid again, until none is: the members of one paragraph share a row, and
  // one laid at the least the first time, laid again beside one capped (its last line ending sooner), can come out larger
  // (2608.16117v1-de p19: t57 capped at t59's 0.875, t59 then 0.975). A member laid at the least is not capped: capped at its
  // own scale its walk sets it otherwise (t115 p38, 15 lines borrowed at 0.875, 14 capped there). Each round lowers a cap, never
  // under the floor: it ends)
  const cap = new Map<number, number>()
  const firstOf = new Map<number, number>()
  for (const f of flows) for (const m of f) firstOf.set(m.ord, firstPage(m))
  // (each member's scale as its own lay set it, before any page's fill and any tie's cap: the same in every lay that lays it.
  // The FIRST lay's, read in every round: a later round's lay of a member is set under the cap a page's fill gave it, which
  // carried that fill back to a tie-mate begun earlier (2610.21098v1 ord 12); and read, not left out: a later tie-mate's own fit
  // still caps (left out, 2608.16117v1's ord 115 grew past it). §18.64)
  const own = new Map(first.unfilled)
  // (each cap's origin: the member whose own need set it, and whether its page's fill did, the evening's size step)
  const origin = new Map<number, TieOrigin>()
  let laid = first
  for (;;) {
    const of = { of: origin, filledOf: new Map(laid.unfilled) }
    if (!tieCaps(sizes, new Map(laid.fits), own, firstOf, (o) => floorOf.get(o) ?? floor, cap, of))
      return tieStated(laid, cap, origin, own)
    const capped = flows.map((f) =>
      f.map((m) => {
        const c = cap.get(m.ord)
        return c === undefined ? m : { ...m, P: { ...m.P, capScale: Math.min(m.P.capScale ?? 1, c) } }
      }),
    )
    laid = layPageTied(page, capped, cells, R, trace)
  }
}

/**
 * One round of a page's size ties (layPagePrepared): each tied member laid larger than the least of its tie capped there, in
 * `cap`, never under its floor and never above a cap set before; `fitOf` the scale each
 * member is laid at, its page's fill passes run, `ownOf` the scale its own lay set it at before any page's fill and any tie's
 * cap, `firstOf` the page each begins on. Whether a cap was lowered. A tie caps a member from the scales the passes up to its own first page leave its
 * tie-mates at (docs/PDF-READER.md §18.64): a tie-mate begun on that page or before as
 * laid and filled, one begun after it as its own lay set it, never as a later page's fill set it, nor a cap that fill set. Every lay that draws a unit
 * runs the pass of the page it begins on, and a later page's pass runs in some of them alone (a page's lay runs its own page's
 * and the first page of each member on it), so a later page's fill (its shrink, its evening, §18.57) capping a tie-mate begun
 * earlier set it at one size in one lay and another in the next (I6 across the pages' lays: 2610.21098v1 ord 12, its first
 * page at 1 and its second at the 0.975 page 2's fill set its list's last item at). A tie may so stand one fill step apart
 * across a page break, the member begun earlier keeping its size: I6 outranks the tie's evenness
 */
export function tieCaps(
  sizes: readonly Extract<PageTie, { rule: 'size' }>[],
  fitOf: ReadonlyMap<number, number>,
  ownOf: ReadonlyMap<number, number>,
  firstOf: ReadonlyMap<number, number>,
  floorOf: (ord: number) => number,
  cap: Map<number, number>,
  origin?: { of: Map<number, TieOrigin>; filledOf: ReadonlyMap<number, number> },
): boolean {
  let lowered = false
  // (the caps and their origins as the round was laid at: a cap lowered in this call is not yet a scale of any member's)
  const was = new Map(cap)
  const wasOf = new Map(origin?.of ?? [])
  for (const t of sizes) {
    const on = t.ords.filter((o) => fitOf.has(o))
    // (a member is capped only by a mate the call lays: a tie with one member laid caps nothing)
    if (on.length < 2) continue
    for (const o of on) {
      const from = firstOf.get(o) ?? 0
      const before = (q: number) => (firstOf.get(q) ?? 0) <= from
      const at = (q: number) => (before(q) ? fitOf.get(q) : (ownOf.get(q) ?? fitOf.get(q))) as number
      const least = Math.min(...on.map(at))
      const c = Math.max(least, floorOf(o))
      if ((fitOf.get(o) as number) > c + SAME && c < (cap.get(o) ?? Number.POSITIVE_INFINITY) - SAME) {
        cap.set(o, c)
        lowered = true
        if (origin) origin.of.set(o, originOf(on, at, before, least, fitOf, was, wasOf, origin.filledOf))
      }
    }
  }
  return lowered
}

/** the origin of a cap a tie sets: the member laid at the tie's least (`least`), one laid at its own need first where two
 *  stand there: one laid at a cap of its own in the round hands on that cap's origin. `fill` where its page's fill set it there
 *  in the round, under its scale before the fill (`filledOf`: the evening's size step, §18.57), never one read at its own lay
 *  (`before` false) */
export type TieOrigin = { by: number; fill: boolean }
function originOf(
  on: readonly number[],
  at: (q: number) => number,
  before: (q: number) => boolean,
  least: number,
  fitOf: ReadonlyMap<number, number>,
  was: ReadonlyMap<number, number>,
  wasOf: ReadonlyMap<number, TieOrigin>,
  filledOf: ReadonlyMap<number, number>,
): TieOrigin {
  const capped = (q: number) => before(q) && was.has(q) && Math.abs((fitOf.get(q) as number) - was.get(q)!) <= SAME
  const there = on.filter((q) => at(q) <= least + SAME)
  // (the least is one of `on`'s own scales: some member stands there)
  const q = (there.find((x) => !capped(x)) ?? there[0])!
  if (capped(q) && wasOf.has(q)) return wasOf.get(q)!
  const fit = fitOf.get(q) as number
  return { by: q, fill: before(q) && (filledOf.get(q) ?? fit) - fit > SAME }
}

/** EVEN_TRIES' order of the knobs, which a stated `evened.by` keeps */
const KNOBS: readonly EvenKnob[] = ['track', 'room', 'size', 'foot']
/**
 * The final round of a page's size ties, stated (docs/PDF-READER.md §18.64): each member laid at its tie's cap states `tie`,
 * the cap and the member whose own need set it, in the round that set it (TieOrigin, followed back through the caps); that
 * member states the tie too, by itself, at its own scale. Where its own page's fill set it there (the evening's size step,
 * §18.57) and its final lines still stand the step under its own size, its `evened` names the size step among the knobs its
 * final lines carry, and its line count on the page at its fitted layout of the final round: a later round lays it at the cap
 * its own step set, where the size knob has nothing more to give, and its statement lost the step (2608.25210v2-zh p11: ord
 * 200 evened by a size step in the first round, ord 199 capped there, 200 capped in turn through 199 in the third and stating
 * its tracking alone). The statement is of the final lay, its lines: no knob of an earlier round's but the step its scale holds
 */
function tieStated(
  laid: PreparedPage,
  cap: ReadonlyMap<number, number>,
  origin: ReadonlyMap<number, TieOrigin>,
  own: ReadonlyMap<number, number>,
): PreparedPage {
  const fits = new Map(laid.fits)
  const atCap = (o: number) => cap.has(o) && fits.has(o) && Math.abs(fits.get(o)! - cap.get(o)!) <= SAME
  const by = new Map<number, TieOrigin>()
  for (const o of cap.keys()) if (atCap(o) && origin.has(o)) by.set(o, origin.get(o)!)
  const origins = new Map([...by.values()].map((x) => [x.by, x]))
  const members = laid.members.map((m): PageMember => {
    const of = by.get(m.ord)
    const self = origins.get(m.ord)
    if (!of && !self) return m
    const tie = of ? { scale: cap.get(m.ord)!, by: of.by } : { scale: fits.get(m.ord) ?? 1, by: m.ord }
    if (tie.by !== m.ord) return { ...m, tie }
    // (the originating member: the size step its scale holds, where its page's fill took it)
    const step = (self ?? of)!.fill && fits.has(m.ord) && fits.get(m.ord)! < (own.get(m.ord) ?? 1) - SAME
    if (!step || m.evened?.by.includes('size')) return { ...m, tie }
    const knobs = new Set([...(m.evened?.by ?? []), 'size'])
    return {
      ...m,
      tie,
      evened: { by: KNOBS.filter((k) => knobs.has(k)), lines: m.evened?.lines ?? m.lines.length },
    }
  })
  return { ...laid, members }
}

function layPageTied(
  page: number,
  flows: readonly (readonly FlowMember[])[],
  ties: readonly { rule: 'cells'; cells: readonly number[] }[],
  R: RuleParams,
  trace: boolean,
): PreparedPage {
  try {
    return layPageOnce(page, flows, ties, R, trace)
  } catch (e) {
    if (e instanceof RangeError) throw e
    // (a throw past the flows' own lays: the page's fill (L10), one decision a page, which fills the units in place. The page
    // is laid anew without the flows whose own lay of the page throws; their members are 'error', with the reason)
    const why = (x: unknown) => `${(x as Error)?.name ?? 'Error'}: ${String((x as Error)?.message ?? x).slice(0, 160)}`
    const bad: { flow: readonly FlowMember[]; why: string }[] = []
    const good = flows.filter((f) => {
      try {
        layPageOnce(page, [f], [], R, false)
        return true
      } catch (x) {
        if (x instanceof RangeError) throw x
        bad.push({ flow: f, why: why(x) })
        return false
      }
    })
    const errorOf = (m: FlowMember, w: string): PageMember => ({
      ord: m.ord,
      state: 'error',
      lines: [],
      error: w,
      slots: [],
    })
    let out: PreparedPage
    // (the members of the flows left out, 'error' with their reason: a table group one of whose cells is among them is left
    // the original's whole, one verdict for a group's members)
    const failed = new Map<number, { m: FlowMember; why: string }>()
    for (const { flow, why: w } of bad) for (const m of flow) failed.set(m.ord, { m, why: w })
    try {
      out = layPageOnce(page, good, ties, R, trace, failed)
    } catch (x) {
      if (x instanceof RangeError) throw x
      // (the flows throw together and none alone: the page's every member stays the original's)
      return {
        page,
        members: flows
          .flat()
          .filter((m) => m.pages.includes(page))
          .map((m) => errorOf(m, why(x))),
        passes: [],
        tables: [],
        fits: [],
        unfilled: [],
        passed: [],
      }
    }
    return out
  }
}

type Lay = { m: FlowMember; unit?: PassUnit; state: 'laid' | Unlaid; slots: LedgerSlot[]; error?: string }
/** L11, S.table.settle: each table group decided by one verdict for its members (RUN:2401-2425); a group a member of which is
 *  not laid by its own lay (its flow threw: 'error'; refused) is left the original's whole, every cell with it; a group the
 *  call holds no member of is not this page's. Its members' states set in `lays` */
export function settleTies(
  ties: readonly { rule: 'cells'; cells: readonly number[] }[],
  lays: ReadonlyMap<number, Lay>,
): PreparedPage['tables'] {
  const tables: PreparedPage['tables'] = []
  for (const t of ties) {
    const cells = t.cells.map((o) => lays.get(o)).filter((x) => x !== undefined)
    // (a group whose members the caller did not hand in, but for those its flows' lays hold: not decided here)
    if (cells.length < t.cells.length) continue
    const why = tableSettle(
      cells.map((x) => ({ pages: x.m.pages, refused: x.state !== 'laid', clipped: !!x.unit?.layout.clipped })),
    )
    tables.push({ cells: [...t.cells], why })
    if (why)
      for (const x of cells) {
        if (x.state === 'laid') x.state = 'cells'
        x.unit = undefined
      }
  }
  return tables
}

/** the page laid once: a throw of a flow's own lay is that flow's (its members 'error'); any other throw is the caller's */
function layPageOnce(
  page: number,
  flows: readonly (readonly FlowMember[])[],
  ties: readonly { rule: 'cells'; cells: readonly number[] }[],
  R: RuleParams,
  trace: boolean,
  failed: ReadonlyMap<number, { m: FlowMember; why: string }> = new Map(),
): PreparedPage {
  // L8, L9
  const lays = new Map<number, Lay>()
  for (const [o, { m, why }] of failed) lays.set(o, { m, state: 'error', slots: [], error: why })
  for (const flow of flows) {
    // (a flow whose lay throws leaves its members the original's, 'error' with the reason, and touches no other flow (design-a
    // §1.4; today any throw refuses its unit, RUN:2521-2526); a memory error is the caller's)
    let laidFlow: ReturnType<typeof layFlowPrepared>
    try {
      laidFlow = layFlowPrepared(flow, R, trace)
    } catch (e) {
      if (e instanceof RangeError) throw e
      const why = `${(e as Error)?.name ?? 'Error'}: ${String((e as Error)?.message ?? e).slice(0, 160)}`
      for (const m of flow) lays.set(m.ord, { m, state: 'error', slots: [], error: why })
      continue
    }
    for (const [i, got] of laidFlow.entries()) {
      const m = flow[i]!
      const unit =
        got.lay.state === 'laid'
          ? (Object.assign(got.lay.lay, { fillable: !!R.adaptiveFill, pages: m.pages }) as PassUnit)
          : undefined
      lays.set(m.ord, { m, unit, state: got.lay.state, slots: got.slots })
    }
  }
  const all = [...lays.values()].sort((a, b) => a.m.ord - b.m.ord)
  // L10: the pass pages, ascending, each over the members laid with a line on it (a part holds every flow with a line on the
  // first page of each member on this one, design-a §1.3 (b): each pass page's members here are all of that page's)
  const passPages = [
    ...new Set([page, ...all.filter((x) => x.m.pages.includes(page)).map((x) => firstPage(x.m))]),
  ].sort((a, b) => a - b)
  const passes: PreparedPage['passes'] = []
  const unfilled = all.flatMap((x) => (x.unit?.layout ? [[x.m.ord, x.unit.layout.scale] as [number, number]] : []))
  if (R.adaptiveFill)
    for (const f of passPages) {
      const laid = all.filter((x) => x.unit && x.m.pages.includes(f)).map((x) => x.unit!)
      const { told } = fillPass(f, laid, R as unknown as PageRules)
      passes.push({ page: f, target: told })
    }
  // L11: each table group, one verdict for its members
  const tables = settleTies(ties, lays)
  // E1: the members with a line on the page
  const members: PageMember[] = all
    .filter((x) => x.m.pages.includes(page))
    .map((x) => {
      const L = x.unit?.layout
      const slots = [...x.slots]
      if (trace && x.unit && passPages.includes(firstPage(x.m)) && firstPage(x.m) === page)
        slots.push({
          step: 'L10',
          by: 'S.fill.page',
          round: 1,
          value: {
            page,
            target: fin(passes.find((q) => q.page === page)?.target?.target ?? null),
            layout: layoutOf(L),
            lines: linesOf(L),
            leadBase: fin(x.unit.P?.leadBase),
          },
        })
      const over = L ? pastBottom(L, x.unit!.blocks) : 0
      const ev = x.unit?.evened
      return {
        ord: x.m.ord,
        state: x.unit ? 'laid' : x.state === 'laid' ? 'cells' : x.state,
        ...(L
          ? {
              fit: {
                size: L.f,
                lead: L.state.lead,
                track: L.state.track,
                borrowed: L.state.borrow,
                ...(over > 0 ? { over } : {}),
              },
            }
          : {}),
        ...(ev ? { evened: { by: [...ev.by], lines: ev.lines.find(([q]) => q === page)?.[1] ?? 0 } } : {}),
        lines: L ? displayLines(L, page) : [],
        ...(x.unit ? { lay: x.unit } : {}),
        ...(x.error ? { error: x.error } : {}),
        slots,
      }
    })
  const fits = all.flatMap((x) => (x.unit?.layout ? [[x.m.ord, x.unit.layout.scale] as [number, number]] : []))
  const passed = all
    .filter((x) => passPages.includes(firstPage(x.m)))
    .map((x): UnitLay => {
      const L = x.unit?.layout
      return {
        ord: x.m.ord,
        page: firstPage(x.m),
        state: x.unit ? 'laid' : x.state === 'laid' ? 'cells' : x.state,
        ...(L
          ? {
              scale: L.scale,
              at: L.state,
              lines: L.lines.map((l): [number, number, number] => [l.page, l.baseline, l.seg?.f ?? L.f]),
            }
          : {}),
      }
    })
  return { page, members, passes, tables, fits, unfilled, passed }
}
