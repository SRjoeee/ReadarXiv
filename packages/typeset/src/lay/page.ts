// layPage's composition over prepared flows (design-b §1.6 L8-L11, E1): every flow of the part laid (L8, layFlow), each laid
// member's fill leadings with it (L9); then each pass page the page reads, ascending (its own and the first page of every
// member with a line on it: design-a §1.3), filled over the members with a line there in stream order (L10, S.fill.page's
// pass); the table groups settled (L11, S.table.settle: a group on two pages or with a cell unfit is withheld whole); the
// page's members as drawn (E1, D.display). Pure: the flows are laid anew on each call, nothing is kept between calls.
import { type DisplayLine, displayLines } from '../emit/display.ts'
import type { PageRules } from '../shared/fill-page.types.ts'
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
  fit?: { size: number; lead: number; track: number; borrowed: number }
  lines: DisplayLine[]
  /** the unit as its lay and its fill left it (the gate's dump reads it) */
  lay?: PassUnit
  slots: LedgerSlot[]
}
export type PreparedPage = {
  page: number
  members: PageMember[]
  passes: { page: number; target: FillTarget | null }[]
  tables: { cells: number[]; why: string | null }[]
}

/** the pages a member has lines on (its pages) begin with its first */
const firstPage = (m: FlowMember) => m.pages[0] ?? 0

/**
 * Page `page` laid from its part's flows (each member prepared), its ties (`cells`: a table group's members' ords), the rules:
 * design-b's L8-L11 and E1
 */
export function layPagePrepared(
  page: number,
  flows: readonly (readonly FlowMember[])[],
  ties: readonly { rule: 'cells'; cells: readonly number[] }[],
  R: RuleParams,
  trace = false,
): PreparedPage {
  // L8, L9
  const lays = new Map<number, { m: FlowMember; unit?: PassUnit; state: 'laid' | Unlaid; slots: LedgerSlot[] }>()
  for (const flow of flows)
    for (const [i, got] of layFlowPrepared(flow, R, trace).entries()) {
      const m = flow[i]!
      const unit =
        got.lay.state === 'laid'
          ? (Object.assign(got.lay.lay, { fillable: !!R.adaptiveFill, pages: m.pages }) as PassUnit)
          : undefined
      lays.set(m.ord, { m, unit, state: got.lay.state, slots: got.slots })
    }
  const all = [...lays.values()].sort((a, b) => a.m.ord - b.m.ord)
  // L10: the pass pages, ascending, each over the members laid with a line on it
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
  // L11: each table group whose members are all laid or decided
  const tables: PreparedPage['tables'] = []
  for (const t of ties) {
    const cells = t.cells.map((o) => lays.get(o)).filter((x) => x !== undefined)
    if (cells.length < t.cells.length) continue
    const why = tableSettle(
      cells.map((x) => ({ pages: x.m.pages, refused: x.state !== 'laid', clipped: !!x.unit?.layout.clipped })),
    )
    tables.push({ cells: [...t.cells], why })
    if (why)
      for (const x of cells) {
        x.state = 'cells'
        x.unit = undefined
      }
  }
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
                borrowed: L.state.borrow,
              },
            }
          : {}),
        lines: L ? displayLines(L, page) : [],
        ...(x.unit ? { lay: x.unit } : {}),
        slots,
      }
    })
  return { page, members, passes, tables }
}
