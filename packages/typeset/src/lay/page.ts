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
import type { LedgerSlot, RuleParams, Unlaid } from '../types.ts'
import { type FlowMember, layFlowPrepared } from './flow.ts'
import { fin, layoutOf, linesOf } from './trace.ts'

/** a member on the page as laid: its state, its fit, its lines as drawn (D.display), its trace */
export type PageMember = {
  ord: number
  state: 'laid' | Unlaid
  fit?: { size: number; lead: number; track: number }
  lines: DisplayLine[]
  /** the unit as its lay and its fill left it (the gate's dump reads it) */
  lay?: PassUnit
  /** why its flow's lay threw, where it did (state 'error') */
  error?: string
  slots: LedgerSlot[]
}
export type PreparedPage = {
  page: number
  members: PageMember[]
  passes: { page: number; target: FillTarget | null }[]
  tables: { cells: number[]; why: string | null }[]
  /** every member laid in the call, on any page (a member of a tie the page's part holds may have no line on it): its scale of
   *  its own size */
  fits: [ord: number, scale: number][]
}

/** two scales of a tie alike: within the fit's thousandths (its caps are floored to them: U.params, a cell's cap) */
const SAME = 0.0005
/** the pages a member has lines on (its pages) begin with its first */
const firstPage = (m: FlowMember) => m.pages[0] ?? 0

/** a part's tie as the page lays it: a table group's members' ords (`cells`), or members laid at one size (`size`: one paragraph
 *  of TeX's the front end cut at a float, a figure's set) */
export type PageTie = { rule: 'cells'; cells: readonly number[] } | { rule: 'size'; ords: readonly number[] }

/**
 * Page `page` laid from its part's flows (each member prepared), its ties, the rules: design-b's L8-L11 and E1. The members of a
 * size tie laid on the page at one scale of their own sizes, the smallest any of them is laid at: each laid larger is capped there
 * (its fit's states from that scale down, P.capScale) and the page laid again (the checkpoint's free-9: a paragraph's first
 * part at its size, its part after the float shrunk; the maintainer's ruling: the text of one paragraph is to be even). By scale,
 * not by points: a run-in head TeX set smaller than its paragraph keeps the original's ratio to it, and neither shrinks the other
 * for being of another size (the coordinator's decision under that ruling, 2026-11-08: 2610.30034v1 p2's head at 8.97 capped its
 * paragraph at 8.97, 0.9 of its 9.96)
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
  // own scale its walk sets it otherwise (t115 p38, 15 lines at 0.875 and 14 capped there, when it borrowed). Each round lowers a cap, never
  // under the floor: it ends)
  const cap = new Map<number, number>()
  let laid = first
  for (;;) {
    const fitOf = new Map(laid.fits)
    let lowered = false
    for (const t of sizes) {
      const on = t.ords.filter((o) => fitOf.has(o))
      if (on.length < 2) continue
      const least = Math.min(...on.map((o) => fitOf.get(o) as number))
      for (const o of on) {
        const c = Math.max(least, floorOf.get(o) ?? floor)
        if ((fitOf.get(o) as number) > c + SAME && c < (cap.get(o) ?? Number.POSITIVE_INFINITY) - SAME) {
          cap.set(o, c)
          lowered = true
        }
      }
    }
    if (!lowered) return laid
    const capped = flows.map((f) =>
      f.map((m) => {
        const c = cap.get(m.ord)
        return c === undefined ? m : { ...m, P: { ...m.P, capScale: Math.min(m.P.capScale ?? 1, c) } }
      }),
    )
    laid = layPageTied(page, capped, cells, R, trace)
  }
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
      return {
        ord: x.m.ord,
        state: x.unit ? 'laid' : x.state === 'laid' ? 'cells' : x.state,
        ...(L
          ? {
              fit: {
                size: L.f,
                lead: L.state.lead,
                track: L.state.track,
              },
            }
          : {}),
        lines: L ? displayLines(L, page) : [],
        ...(x.unit ? { lay: x.unit } : {}),
        ...(x.error ? { error: x.error } : {}),
        slots,
      }
    })
  const fits = all.flatMap((x) => (x.unit?.layout ? [[x.m.ord, x.unit.layout.scale] as [number, number]] : []))
  return { page, members, passes, tables, fits }
}
