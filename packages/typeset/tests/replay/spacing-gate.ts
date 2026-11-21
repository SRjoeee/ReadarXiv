// The spacing rule's gate (the display design's 2d as the owner amended it on 2026-11-13, the coordinator's rulings of
// 2026-11-16, docs/PDF-READER.md §18.90): four lines over the runner's laid members, each member read once, on the page of its
// first line, each line 0 to pass.
// (i) a float's member (the unit's own kind, a caption: U.params floatMember) laid above its pitch by rule 1 (U.params leadOf over
//     its own blocks: the script's factor on its own pitch), with room taken or none: nothing spreads it (TeX builds a float's box
//     once, at its natural size: the slack stays under it). Those of them holding room they took are counted beside.
// (ii) a body member (one the page fill fills: every member but a float's, a note too: a run of sibling blocks in a column shares
//     its page's rhythm, the coordinator's ruling of 2026-11-17) laid above its page's target and band (the fill's own target of
//     the page it begins on, PreparedPage.passes, and the script's adaptiveFill.band): the fill's own promise, held to every member
//     it lays (shared/fill-page.ts leadOf, `top`), with room taken or none: an invariant of the fill, which the rule does not
//     touch. A member the fill lays not (its fitted state does not set it again: FillLaid.fillLead null, the fill's `no fill
//     leading`) keeps its fit's leading, the walk's: counted beside, as the fill states it.
// (iii) a member laid closer than its script's floor (leadFloor: the block's own original pitch for the scripts set by a factor,
//     a share of it for the alphabets, whose floor and order the rule does not touch).
// (iv) a member laid under its original size (1, or a cell's band cap) though one more lay there, with every knob its order
//     takes before the size at its bound (all its room; the leading at its floor where the order closes it before the size, at its
//     rule-1 pitch where it does not), sets every token, and whose step no stated cause explains: neither the evening's (the page
//     states it: Laid.evened names the size step, §18.57) nor a size tie's (the lay states the tie: Laid.tie, §18.64, its `by` the
//     member whose own need set the tie's one size, itself where it is that member: laid alone at its size with its mates where
//     the tie left them, such a member fits, though at the one size for all it did not). The evening's steps and the ties' are
//     printed beside it, never failed: the owner's accepted costs. The cause is read from what the page states, never derived again.
// Read off the runner's members (layPagePrepared: the unit as its lay and the page's fill left it, PageMember.lay), where the
// fit's state and its blocks are; the leading of every frame the fill set apart (FitState.leads) read with the unit's.
// Each line reads every run of a member (PR #649's review, 4593874239): a unit its displays split is laid a run at a time, each
// run at its own state and size (fit/runs.ts layoutRuns; the fill fills each run apart and joins them again, shared/fill-pass.ts),
// and the joined layout's own state and scale are its first run's; each line carries its run's (`seg`, joinRuns). So a member is
// read run by run, each distinct run of its lines once, in order, with that run's own fill leading, parameters, tokens and blocks
// (FillLaid.runs, the run whose state the line carries); a member of one run is read by its layout's own, as before. A failing
// member's entry names each run that fails the line (`run 2 of 3`), and the record's line of each run read names its run.
import type { Token } from '../../src/breaker/tokens.ts'
import { layoutAt } from '../../src/fit/at.ts'
import type { FitBlock, FitParams, FitState, LaidLine } from '../../src/fit/types.ts'
import type { PageMember } from '../../src/lay/page.ts'
import type { RuleParams } from '../../src/types.ts'
import { floatMember, leadOf } from '../../src/unit/params.ts'

export type SpacingGate = {
  /** the members read (each once), by class (`float` a float's member, `body` every other, a note too) */
  read: Map<string, number>
  /** the members of two runs or more read (a display splits them: each run read), by class and kind (`body paragraph`) */
  runs: Map<string, number>
  /** the runs read of those members */
  runsRead: number
  /** a run whose state no run of its unit's lay holds (read by its line's state and size, with its unit's facts): none expected */
  unmatched: string[]
  /** the four lines: each failing member as `p<page> ord <ord> <kind>: <numbers>`, a member of runs `…: run <k> of <n>: <numbers>`
   *  for each run that fails the line */
  floatSpread: string[]
  takenSpread: string[]
  /** above its page's target and band, a body member the fill lays not (its fitted state does not set it again): beside (ii) */
  unfilled: string[]
  underFloor: string[]
  stepped: string[]
  /** (i)'s members holding room they took (in a run that fails the line) */
  floatHeld: number
  /** the size steps a stated cause explains, by cause (`evened`, `tie`) and whether a lay at the original size sets the member
   *  whole (`, fits at its size`): each run read so */
  explained: Map<string, number>
  /** each line by the kind of its members */
  by: Map<string, number>
}

export const newSpacingGate = (): SpacingGate => ({
  read: new Map(),
  runs: new Map(),
  runsRead: 0,
  unmatched: [],
  floatSpread: [],
  takenSpread: [],
  unfilled: [],
  underFloor: [],
  stepped: [],
  floatHeld: 0,
  explained: new Map(),
  by: new Map(),
})

const r3 = (x: number) => Math.round(x * 1000) / 1000
const add = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)

/** a run of a member as the gate reads it: its place (`k` of `n`), its size and state, and its own lay's facts */
type RunRead = {
  k: number
  n: number
  scale: number
  st: FitState & { glue?: boolean }
  P: FitParams
  tokens: readonly Token[]
  blocks: readonly FitBlock[]
  knob: string
  fillLead: number | null | undefined
}
/**
 * A laid member's runs, in order: each distinct run its lines carry (LaidLine.seg, by its state: joinRuns hangs one on every line
 * of a run), with the run of its unit's lay whose layout holds that state (FillLaid.runs: its fill leading, parameters, tokens,
 * blocks and knob); a member whose lines carry fewer than two, its layout's own, as the gate read every member before. `lost`
 * is told each run no run of the lay holds (read by its line's state and size with the unit's own facts)
 */
function runsRead(u: NonNullable<PageMember['lay']>, lost: (k: number, n: number) => void): RunRead[] {
  const L = u.layout
  const segs: NonNullable<LaidLine['seg']>[] = []
  for (const l of L.lines) if (l.seg && !segs.some((g) => g.state === l.seg!.state)) segs.push(l.seg)
  if (segs.length < 2)
    return [
      {
        k: 0,
        n: 1,
        scale: L.scale,
        st: L.state,
        P: u.P,
        tokens: u.tokens,
        blocks: u.blocks,
        knob: L.knob,
        fillLead: u.fillLead,
      },
    ]
  return segs.map((g, k) => {
    const r = u.runs?.find((q) => q.layout.state === g.state)
    if (!r) lost(k, segs.length)
    return {
      k,
      n: segs.length,
      scale: g.scale,
      st: g.state,
      P: r?.P ?? u.P,
      tokens: r?.tokens ?? u.tokens,
      blocks: r?.blocks ?? u.blocks,
      knob: r?.layout.knob ?? L.knob,
      fillLead: r ? r.fillLead : u.fillLead,
    }
  })
}

/**
 * The four lines over page `page`'s laid members (the runner's), each member on the page of its first line, each of its runs
 * read. `R` the rule set's params the page was laid with; `targetOf` the page fill's target of a page (its pass's, null where none
 * tells); `gapOf` the class of the gap its part states under a member (Room.gap's, '-' none), for the record; `tell` where given,
 * each run read, a line of facts a lab tool records (its kind, class, rule-1 pitch, page target, laid leadings, room taken, size,
 * gap, the lines it fails, and last its run, `<k>/<n>`)
 */
export function spacingGate(
  page: number,
  members: readonly PageMember[],
  R: RuleParams,
  out: SpacingGate,
  targetOf: (page: number) => number | null,
  gapOf: (ord: number) => string = () => '',
  tell?: (line: string) => void,
) {
  const floor = Number((R as unknown as { leadFloor?: number }).leadFloor ?? 1)
  const band = Number((R as unknown as { adaptiveFill?: { band?: number } | null }).adaptiveFill?.band ?? 0)
  const target = targetOf(page)
  for (const pm of members) {
    const u = pm.lay
    const L = u?.layout
    if (pm.state !== 'laid' || !u || !L || L.lines[0]?.page !== page) continue
    const kind = u.unit.kind
    const cls = floatMember(kind) ? 'float' : 'body'
    add(out.read, cls)
    const at = `p${page} ord ${pm.ord} ${kind}`
    const runs = runsRead(u, (k, n) => out.unmatched.push(`${at}: run ${k + 1} of ${n}`))
    if (runs.length > 1) {
      add(out.runs, `${cls} ${kind}`)
      out.runsRead += runs.length
    }
    const rule1 = leadOf(u.blocks, u.s, R as unknown as Parameters<typeof leadOf>[2])
    // (each line's failing runs, each run's numbers named by its run where the member has more than one)
    const fail = {
      floatSpread: [] as string[],
      takenSpread: [] as string[],
      unfilled: [] as string[],
      underFloor: [] as string[],
      stepped: [] as string[],
    }
    let held = false
    for (const run of runs) {
      const { st, P } = run
      const leads = [st.lead, ...(st.leads ?? []).filter((v): v is number => v !== undefined)]
      const hi = Math.max(...leads),
        lo = Math.min(...leads)
      const taken = st.borrow > 0 || !!st.glue || (st.over ?? 0) > 0
      const fails: string[] = []
      const nums = `${run.n > 1 ? `run ${run.k + 1} of ${run.n}: ` : ''}lead ${r3(hi)}${lo < hi ? ` (${r3(lo)})` : ''} over rule 1's ${rule1}, page target ${target ?? 'none'} band ${band}, fill leading ${run.fillLead === undefined ? 'none' : run.fillLead}, scale ${run.scale}, room ${st.borrow}${st.glue ? '+free' : ''}${st.over ? ` over ${st.over}` : ''}${pm.evened ? `, evened by ${pm.evened.by.join('+')}` : ''}`
      if (cls === 'float' && hi > rule1 + 1e-9) {
        fail.floatSpread.push(nums)
        if (taken) held = true
        fails.push('i')
      }
      if (cls === 'body' && target !== null && hi > r3(target + band) + 1e-9) {
        // (a unit its fitted state does not set again as the fill lays it keeps its fit (FillLaid.fillLead null: fillLeadsOf, the
        // fill's `no fill leading`; a run's own, the fill filling each run apart): the fill lays it not, and its promise is of the
        // units it lays; counted beside)
        if (run.fillLead === null) fail.unfilled.push(nums)
        else {
          fail.takenSpread.push(nums)
          fails.push('ii')
        }
      }
      if (lo < floor - 1e-9) {
        fail.underFloor.push(`${nums}, the floor ${floor}`)
        fails.push('iii')
      }
      // (iv): its original size, a cell's band cap where it has one (U.params cellBands: a size tie caps paragraphs, never a cell)
      const top = kind === 'cell' ? Math.min(1, P.capScale ?? 1) : 1
      let cause = ''
      if (run.scale < top - 1e-9) {
        cause = pm.evened?.by.includes('size')
          ? 'evened'
          : pm.tie
            ? pm.tie.by === pm.ord
              ? 'tie (its own need)'
              : 'tie'
            : ''
        // (the knobs its order takes before the size: the leading at its floor where the order closes it first (the scripts set by
        // a factor), at its rule-1 pitch where the size comes first (the alphabets' order, which the rule does not touch))
        const order = (P.order ?? []) as readonly string[]
        const leadFirst = order.includes('lead') && order.indexOf('lead') < order.indexOf('shrink')
        const atTop: FitState & { glue?: boolean } = {
          ...st,
          scale: top,
          lead: leadFirst ? P.leadFloor : rule1,
          ...(P.cjk ? { track: Math.min(st.track, P.trackMin) } : { trackLatin: Math.min(st.trackLatin, P.trackMin) }),
          compress: P.compressMax >= 2 ? 2 : st.compress,
          borrow: 99,
          glue: true,
          knob: 'gate',
        }
        delete atTop.leads
        delete atTop.over
        delete atTop.box
        delete atTop.head
        const fits = !layoutAt(run.tokens, run.blocks, u.s, P, atTop).clipped
        if (cause) add(out.explained, `${cause}${fits ? ', fits at its size' : ''}`)
        else if (fits) {
          fail.stepped.push(`${nums}, sets whole at ${top} (knob ${run.knob})`)
          fails.push('iv')
        }
      }
      tell?.(
        [
          page,
          pm.ord,
          kind,
          cls,
          rule1,
          r3(hi),
          r3(lo),
          st.borrow,
          st.glue ? 1 : 0,
          st.over ?? 0,
          run.scale,
          L.lines.filter((l) => run.n === 1 || l.seg?.state === st).length,
          pm.evened ? pm.evened.by.join('+') : '',
          pm.tie ? pm.tie.by : '',
          fails.join(','),
          target ?? '',
          gapOf(pm.ord),
          cause,
          `${run.k + 1}/${run.n}`,
        ].join('\t'),
      )
    }
    // (a member's entry on each line it fails: every failing run of it named)
    const entry = (xs: readonly string[]) => `${at}: ${xs.join('; ')}`
    if (fail.floatSpread.length) {
      out.floatSpread.push(entry(fail.floatSpread))
      add(out.by, `(i) ${kind}`)
      if (held) out.floatHeld++
    }
    if (fail.takenSpread.length) {
      out.takenSpread.push(entry(fail.takenSpread))
      add(out.by, `(ii) ${kind}`)
    }
    if (fail.unfilled.length) out.unfilled.push(entry(fail.unfilled))
    if (fail.underFloor.length) {
      out.underFloor.push(entry(fail.underFloor))
      add(out.by, `(iii) ${kind}`)
    }
    if (fail.stepped.length) {
      out.stepped.push(entry(fail.stepped))
      add(out.by, `(iv) ${kind}`)
    }
  }
}
