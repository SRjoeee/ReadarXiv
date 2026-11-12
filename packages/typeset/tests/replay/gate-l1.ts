// The gate's runner over one pair from lane L1's parts (stage one of the adapter, src/lay/adapt.ts): each member of the
// paper's L1 bundle (tests/replay/l1.ts) set by the adapter from the facts its part states (U.blocks, U.decor, U.params; the
// shared rows of its flow), its reading and tokens today's (the tap's last laid round of the same unit: joined by ord and
// content id), and each page laid by layPagePrepared from its own L1 part's flows and ties. Answers the laid units in the
// baseline's reader-dump format, the members the adapter did not set by what stops them, and, per adapted member, the first
// field of its setting that differs from today's (round.ts prepare over the same round: the blocks' pages, baselines and
// measures, their alignment and indent, the size, the leading, the edges): the rule whose stated facts changed it.
import type { OutPiece, Part, Row, Unit } from '@readarxiv/format'
import { layPage, nameOf } from '../../src/lay/entry.ts'
import { waitOf } from '../../src/lay/wait.ts'
import { ownNamesOf } from '../../src/unit/rename.ts'
import type { LinkFate } from '../../src/lay/links.ts'
import { keptBefore, ledBy } from '../../src/lay/lead.ts'
import type { FlowMember } from '../../src/lay/flow.ts'
import { appendFileSync } from 'node:fs'
import { adapt, type Reading, rectOf, rowLinesOf, sharedPaper } from '../../src/lay/adapt.ts'
import {
  paperOf as paperReading,
  type PaperReading,
  measured,
  readMember,
  type RowUnit,
  rowPieces,
  sourcePieces,
} from '../../src/lay/read.ts'
import { fontString } from '../../src/breaker/measure.ts'
import { MissingMeasure } from '../../src/metrics/table.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { V0Piece } from '../../src/unit/breaks.ts'
import { type DoorRow, doorRows, doorSentences } from './rows.ts'
import { layPagePrepared, type PageMember, type UnitLay } from '../../src/lay/page.ts'
import { type CrossLay, crossLayOf } from './cross-lay.ts'
import { type FitMeasure, fitMeasure } from '../../src/breaker/measure.ts'
import type { Face } from '../../src/breaker/tokens.ts'
import type { LaidLine, Layout } from '../../src/fit/types.ts'
import { inkEndOf } from '../../src/shared/share.ts'
import type { Metrics, RuleParams, Rows } from '../../src/types.ts'
import { type DumpUnit, dumpUnit, pieceCrops, viewsOf } from './display.ts'
import { type Cover, coverDone, coverOf, newCover } from './cover.ts'
import { newParasGate, type ParasGate, parasGate } from './paras-gate.ts'
import { walkCase } from './fit-input.ts'
import type { GateUnit } from './gate.ts'
import { keptJoin, keptRow, type L1Placed, l1Paper, type TodayPrepared, todayPrepared, todayUnitOf } from './l1.ts'
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
  /** the invariants over every laid member (design §4.9: I3 its ink overlaps no other laid unit's, I4 each element drawn once,
   *  I5 no line wider than its slot, no fit under the floor): what breaks each, by member */
  inv: {
    laid: number
    lines: number
    I3: string[]
    I4: string[]
    I5: string[]
    I5by: Map<string, { n: number; max: number }>
    /** members set under the fit's floor (R.floor), by today's ord: X.further's `shrink` (the checkpoint's (6): a correction
     *  never drives a unit there, so the runner lists them, its run with today's members (--subst=all) beside) */
    below: number[]
  }
  /** each page's lay (layPagePrepared: L8-E1), ms; the adapter's setting of every member (L6), ms in all */
  ms: number[]
  adaptMs: number
  /** E1 (with the reading from the part): per adapted member, the first of its typesetter's inputs that differs from today's
   *  (the setting's first, then the tokens'), or 'equal' */
  inputs: Map<number, string>
  /** the reading's time (L5, L7: lay/read.ts), ms in all */
  readMs: number
  /** E1's reading level alone (with the reading from the part): per member, the first difference of its tokens from today's */
  tokens: Map<number, string>
  /** the entry's check (o.entry): the runner's laid members laid alike by layPage, those not, examples; each page's time by the
   *  entry (the reading, the adapter and the lay: what a reader pays a page), ms */
  entry?: {
    alike: number
    differ: number
    ex: string[]
    ms: number[]
    names: Map<string, number>
    /** what became of the parts' links (lay/links.ts LinkFate), and examples of the dropped */
    links: Map<string, number>
    linkEx: Map<string, string[]>
    /** the figure texts (S.figures over the part): each figure member on its first page, by its turn and its state */
    figures: Map<string, number>
    /** Laid.lit over the laid members: those lit, a laid line with no box on the right, the panes' entries apart */
    lit: { laid: number; lines: number; boxes: number; apart: number; empty: number }
    /** I10, the sentence cover over every member lit (cover.ts): each piece drawn in exactly one sentence on each pane, the
     *  panes' sentences the same */
    cover: Cover
    /** I6 across the pages' lays (cross-lay.ts): each unit begun on a pass page as every page's lay that runs that pass lays it */
    crossLay?: CrossLay
    /** the paragraph points (paras-gate.ts): each the part states whose row carries its anchor laid opening on TeX's line */
    paras: ParasGate
    /** the reads gate (o.leave), by reading option: the pages laid under it, the row ids their lays read, those the page's wait
     *  set does not hold and on how many pages, examples */
    reads?: Map<string, { pages: number; reads: number; outside: number; outsidePages: number; ex: string[] }>
  }
}

/** I3-I5 over a page's laid members (their lines on the page, as their lay and the page's fill left them) */
/**
 * How far a line's last item, a crop, stands past the ink it is cut from (`inks`: the ink boxes the part states for the member,
 * its elements' El.ink and its label's, [page, x0, y0, x1, y1, baseline]), in the line's drawn units: its antialiased margin
 * (crops.ts cropOfBox, 0.4 pt a side) at the scale it is drawn at; 0 for a text item, a crop cut at its right edge between two
 * glyphs (no margin there), or one whose ink the part does not state (read by its box, as before)
 */
export function pastInk(end: unknown, inks: readonly (readonly number[])[] | undefined): number {
  const it = end as { t?: { crop?: { page?: number; crop?: number[]; cut?: number } }; w?: number } | undefined
  const c = it?.t?.crop
  if (!c?.crop || !inks?.length || ((c.cut ?? 0) & 2) !== 0) return 0
  const [x0, y0, x1, y1] = c.crop as [number, number, number, number]
  // (the ink box it is cut from: on its page and within it, across and up and down; of a crop of several, the one ending last)
  let ink: number | null = null
  for (const k of inks)
    if (k[0] === c.page && k[1]! >= x0 - 0.01 && k[3]! <= x1 + 0.01 && k[2]! >= y0 - 0.01 && k[4]! <= y1 + 0.01)
      ink = ink === null ? k[3]! : Math.max(ink, k[3]!)
  if (ink === null || x1 <= x0) return 0
  return ((x1 - ink) * (it?.w ?? x1 - x0)) / (x1 - x0)
}

export function invariantsOf(
  page: number,
  members: readonly PageMember[],
  R: RuleParams,
  inv: GateL1['inv'],
  inksOf?: (ord: number) => readonly (readonly number[])[] | undefined,
  /** the measure I3 reads a run's ink right from where the lay's own has none: the served faces' (the reader's canvas always
   *  gives one; the tap's table lacks the right of a run today never asked it of) */
  served?: FitMeasure | null,
) {
  const floor = Math.min(Number((R as Raw).floor ?? 1), Number((R as Raw).floorMin ?? 1))
  const boxes: { ord: number; x0: number; x1: number; y0: number; y1: number }[] = []
  for (const pm of members) {
    const L = pm.lay?.layout
    if (pm.state !== 'laid' || !L) continue
    inv.laid++
    const size = L.f
    for (const l of L.lines) {
      if (l.page !== page) continue
      inv.lines++
      const used = (l.used as number | undefined) ?? l.x1 - l.x0
      // (I5 restated, the placement's own guarantee (B.place placeItems L2:3976-4038): a line ends within its slot but for the
      // blank half of a closing mark it ends with (`hang`, half the size, at a compression under 2), and for a line whose
      // items cannot be set narrower: no word space to shrink and no gap a squeeze took (an overfull box, TeX's); each line
      // past its slot classed by which, its largest excess beside its count. What is drawn past the slot: a crop that ends the
      // line is read by its ink, the box the part states for it (pastInk), not by the box it is cut with, whose antialiased
      // margin stands past its ink (round B13, the coordinator's ruling (b): an end mark TeX set flush to the measure's end is
      // drawn there, PDF-READER §18.52; its crop's margin, 0.4 pt, is no ink past the slot)
      const over = used - (l.x1 - l.x0) - pastInk(l.items.at(-1), inksOf?.(pm.ord))
      if (over > 1e-6) {
        const end = l.items.at(-1) as { t?: { punct?: string }; cut?: boolean } | undefined
        const hang =
          end?.t?.punct === 'close' && !end.cut && Number((pm.lay!.P as Raw | undefined)?._compress ?? 0) < 2
            ? 0.5 * size
            : 0
        const spaces = l.items.some((it) => (it as { t?: { space?: boolean } }).t?.space)
        const cls =
          over <= hang + 1e-6
            ? 'a closing mark’s blank half past the slot'
            : !spaces && !l.squeezed
              ? 'overfull: no space to shrink, not squeezed'
              : spaces
                ? 'past the slot with spaces to shrink'
                : 'squeezed past the slot'
        // (AXT_GATE_OVER=<pt>: each line past its slot by more, with its member)
        if (process.env.AXT_GATE_OVER && over > Number(process.env.AXT_GATE_OVER))
          console.log(
            `OVER p${page} ord ${pm.ord} ${over.toFixed(2)} pt (${cls}) line [${l.x0}, ${l.baseline}, ${l.x1}]`,
          )
        const b = inv.I5by.get(cls) ?? inv.I5by.set(cls, { n: 0, max: 0 }).get(cls)!
        b.n++
        b.max = Math.max(b.max, over)
        if (cls.startsWith('past') || cls.startsWith('squeezed'))
          inv.I5.push(`ord ${pm.ord}: a line ${over.toFixed(2)} pt past its slot (${cls})`)
      }
      // (I3 reads ink, design §4.9: the line from its first item to its last glyph's ink, not its measure nor its advance, so that
      // a CJK mark's blank half (a run-in head's ideographic full stop, its follower set after its ink and the original's
      // separation, today's shareOf `ink`) overlaps nothing, and a line set flush right or centred starts where its text does,
      // not at its measure's start, which widened into the paper beside it (U.decor widen: a right-hand running head's measure
      // to the left one's ink; the google-lay lane: 4 of the round's I3 were Google's longer left head ending inside the right
      // head's measure, 55 pt clear of its first glyph). Never from before the measure's start: what the breaker sets there is
      // an opening mark it hangs (B.break leadOf), whose ink the measure does not place within its box; read from the
      // measure's start, as before (read from its box, 3 of typeset-today's lines did overlap the line before by a hung
      // bracket's box, none by its ink). Its end the product's, S.share's inkEndOf: the run's own ink right, its tracking, its
      // slant)
      const first = l.items.find((it) => !(it.t as { space?: boolean }).space)
      if (process.env.AXT_GATE_HUNG && first?.x !== undefined && first.x < l.x0 - 0.01)
        console.log(
          `HUNG p${page} ord ${pm.ord} ${(l.x0 - first.x).toFixed(2)} ${JSON.stringify((first.t as { s?: string }).s ?? ((first.t as { crop?: unknown }).crop ? 'crop' : '?'))} ${(first.t as { punct?: string }).punct ?? ''}`,
        )
      boxes.push({
        ord: pm.ord,
        x0: Math.max(l.x0, first?.x ?? l.x0),
        x1: inkEnd(l, L, (pm.lay!.P as { measure?: FitMeasure }).measure, served) ?? l.x0 + used,
        y0: l.baseline - 0.215 * size,
        y1: l.baseline + 0.683 * size,
      })
    }
    if (L.scale < floor - 1e-9) inv.I5.push(`ord ${pm.ord}: set at ${L.scale} under the floor ${floor}`)
    if (L.scale < Number((R as Raw).floor ?? 0) - 1e-9 && l0Page(L) === page) inv.below.push(pm.ord)
    // (each element's crop token drawn once over its lines, every page's; a URL cut where TeX's url package breaks it, the
    // breaker's urlCut, is drawn once where its parts tile its crop: each part `of` it, from its left edge to its right)
    const seen = new Map<unknown, number>()
    const cuts = new Map<unknown, number[][]>()
    for (const l of L.lines)
      for (const it of l.items) {
        const t = it.t as { crop?: { crop: number[] }; of?: unknown }
        if (!t.crop) continue
        if (t.of) (cuts.get(t.of) ?? cuts.set(t.of, []).get(t.of)!).push(t.crop.crop)
        else seen.set(it.t, (seen.get(it.t) ?? 0) + 1)
      }
    for (const [of, rects] of cuts) {
      const whole = (of as { crop: { crop: number[] } }).crop.crop
      const xs = rects.map((r) => [r[0]!, r[2]!]).sort((a, b) => a[0]! - b[0]!)
      const tiles = xs.every((r, k) =>
        k ? Math.abs(r[0]! - xs[k - 1]![1]!) < 1e-9 : Math.abs(r[0]! - whole[0]!) < 1e-9,
      )
      if (tiles && Math.abs(xs.at(-1)![1]! - whole[2]!) < 1e-9) seen.set(of, (seen.get(of) ?? 0) + 1)
    }
    if (l0Page(L) === page)
      for (const t of pm.lay!.tokens as readonly { crop?: unknown; ownLabel?: boolean }[])
        if (t.crop && !t.ownLabel && (seen.get(t) ?? 0) !== 1) {
          inv.I4.push(`ord ${pm.ord}: an element drawn ${seen.get(t) ?? 0} times`)
          break
        }
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!,
        b = boxes[j]!
      if (a.ord === b.ord) continue
      if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5) {
        inv.I3.push(`ords ${a.ord} and ${b.ord}: their lines overlap on p${page}`)
        // (AXT_GATE_I3=1: each overlap's two boxes, as I3 reads them)
        if (process.env.AXT_GATE_I3) console.log(`I3BOX p${page} ${JSON.stringify(a)} ${JSON.stringify(b)}`)
      }
    }
}
const l0Page = (L: { lines: readonly { page: number }[] }) => L.lines[0]?.page
/** where a laid line's ink ends: the product's reading of it (S.share's inkEndOf: its last item's, a crop's box, a text's own
 *  ink right at the size it is drawn, never past its advance), its run's ink right `served`'s where the lay's measure has none
 *  (the tap's table holds no right of a run today never asked it of: read by its advance, a CJK closing mark's blank half was
 *  ink, the google-lay lane's four I3 of 2610.37818v1's header cells ending in an ideographic full stop); null where the
 *  measure lacks the run (MissingMeasure) */
export function inkEnd(l: LaidLine, L: Layout, m: FitMeasure | undefined, served?: FitMeasure | null): number | null {
  if (!m) return null
  const right = (s: string, face: Face): number | null => {
    const r = m.inkRight100(s, face)
    if (r !== null || !served) return r
    try {
      return served.inkRight100(s, face)
    } catch (e) {
      // (a run no served face holds: the reader draws it in a face of the system's, no measure of ours)
      if (e instanceof MissingMeasure || (e as Error)?.name === 'Unserved') return null
      throw e
    }
  }
  try {
    return inkEndOf(l, L, { ...m, inkRight100: right })
  } catch (e) {
    if (e instanceof MissingMeasure) return null
    throw e
  }
}

const DETAIL = !!process.env.AXT_GATE_DETAIL
/** AXT_GATE_DEEP=<pair>:<ord>: every field of that member's preparation that differs from today's, printed */
const DEEP = process.env.AXT_GATE_DEEP
/** every difference between two values beyond 0.005, by path (functions and the tokens aside), at most 40 */
export function differences(a: unknown, b: unknown, path = '', out: string[] = [], tol = 0.005): string[] {
  if (out.length >= 40 || path.endsWith('.tokens') || path.endsWith('.measure') || path.endsWith('.patterns'))
    return out
  if (typeof a === 'function' || typeof b === 'function') return out
  if (typeof a === 'number' && typeof b === 'number') {
    if (!(Math.abs(a - b) <= tol || a === b)) out.push(`${path}: ${a} against ${b}`)
    return out
  }
  if (a instanceof Map && b instanceof Map)
    return differences(Object.fromEntries(a), Object.fromEntries(b), path, out, tol)
  if (a instanceof Set && b instanceof Set) return differences([...a], [...b], path, out, tol)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}.length: ${a.length} against ${b.length}`)
    for (let i = 0; i < Math.min(a.length, b.length); i++) differences(a[i], b[i], `${path}[${i}]`, out, tol)
    return out
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
      differences((a as Raw)[k], (b as Raw)[k], `${path}.${k}`, out, tol)
    return out
  }
  if (a !== b && !(a == null && b == null))
    out.push(`${path}: ${JSON.stringify(a)?.slice(0, 80)} against ${JSON.stringify(b)?.slice(0, 80)}`)
  return out
}
let rules: { targets: Record<string, { params: Raw }> } | null = null
const r2 = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)

/** a door row's pieces (a translated text, or a source piece by its index) as the translation package's Result holds a row:
 *  its texts (a source's text piece by its text), the source's elements (and nested units) by id, its groups as spans of
 *  their content; null where a piece is no source piece */
export function outOfDoor(row: readonly (string | number)[], source: readonly V0Piece[]): OutPiece[] | null {
  const top: OutPiece[] = []
  const stack: { id: string; content: OutPiece[] }[] = []
  const at = () => stack.at(-1)?.content ?? top
  for (const q of row) {
    if (typeof q === 'string') {
      at().push({ t: 'text', s: q })
      continue
    }
    const p = source[q]
    if (!p) return null
    if (p.t === 'text') at().push({ t: 'text', s: p.s })
    else if (p.t === 'ph' || p.t === 'nested') at().push({ t: 'el', id: String(q) })
    else if (p.t === 'open') {
      const sp = { t: 'span' as const, id: String(q), content: [] as OutPiece[] }
      at().push(sp)
      stack.push(sp)
    } else if (!stack.pop()) {
      // (a close with no open: the group began before the unit, and wraps what came before it at its level, as the
      // instrument's contentOf reads the source; an open with no close runs to the end)
      const content = top.splice(0)
      top.push({ t: 'span', id: String((p as { id?: unknown }).id ?? q), content })
    }
  }
  return top
}

/**
 * The entry's members of a page by the ord of today's unit each is joined to (`unitOf`: part ord -> today's unit), the runner's
 * members' key. A member no unit of today's joins (its unit's text moved, no door row: lane style-wire) is one the runner
 * never lays, so it is left out: keyed by its own part ord, it stood in for the member of today's unit of that ord (round 8 B8:
 * 97 of the entry's 747 members "not alike")
 */
export function entryByToday<M extends { ord: number }>(
  members: readonly M[],
  unitOf: ReadonlyMap<number, { ord: number }>,
): Map<number, M> {
  const out = new Map<number, M>()
  for (const m of members) {
    const u = unitOf.get(m.ord)
    if (u) out.set(u.ord, m)
  }
  return out
}

/** the first field of a member's setting that differs from today's prepared one, or 'equal' */
export function settingDiff(mine: FlowMember, today: FlowMember, tokens = true): string {
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
  // (the size and the leading base as the lay reads them, every digit: the part states the size as the page does)
  if (Math.abs(mine.s - today.s) > 1e-6) return 'U.params: size, under a hundredth apart'
  if (r2(mine.P.leadBase) !== r2(today.P.leadBase)) return 'U.params: leadBase'
  if (Math.abs(mine.P.leadBase - today.P.leadBase) > 1e-6) return 'U.params: leadBase, under a hundredth apart'
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
      return `U.blocks: line ends (x0, x1)${mine.blocks[k]!.rects.every((r, j) => Math.abs(r[1] - today.blocks[k]!.rects[j]![1]) <= 0.0100001 && Math.abs(r[3] - today.blocks[k]!.rects[j]![3]) <= 0.0100001) ? ', a hundredth apart (half hundredths)' : ''}${DETAIL ? ` ${JSON.stringify(mine.blocks[k]!.rects.map((r, j) => [r[1], r[3], today.blocks[k]!.rects[j]![1], today.blocks[k]!.rects[j]![3]]).filter((x) => Math.abs(x[1]! - x[3]!) > 0.005 || Math.abs(x[0]! - x[2]!) > 0.005))}` : ''}`
  if (tokens && mine.tokens.length !== today.tokens.length) return 'B.tokens: count'
  return 'equal'
}

type Tok = Record<string, unknown>
const FLAGS = [
  'space',
  'glue',
  'brk',
  'cont',
  'asp',
  'punct',
  'hyph',
  'sc',
  'keep',
  'sup',
  'ph',
  'k',
  'math',
  'label',
  'leadEnd',
  'leadGap',
  'kern',
  'kernEm',
  'kernW',
  'kernEnd',
  'newline',
  'room',
  'blockTo',
  'cls',
]
const near = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 0.01 : a === b || (a == null && b == null)
/** the first difference of two measured token lists (B.tokens, B.measure), with its place; null where equal */
export function tokensDiff(mine: readonly Tok[], today: readonly Tok[]): string | null {
  for (let j = 0; j < Math.max(mine.length, today.length); j++) {
    const a = mine[j],
      b = today[j]
    const at = (k: string) =>
      `${k} [${j}: ${JSON.stringify(a?.s ?? (a?.crop ? 'crop' : a?.space ? ' ' : ''))?.slice(0, 24)} against ${JSON.stringify(b?.s ?? (b?.crop ? 'crop' : b?.space ? ' ' : ''))?.slice(0, 24)}]`
    if (!a || !b) return at('B.tokens: count')
    if (!!a.crop !== !!b.crop) return at('U.elements: crop or text')
    if (a.crop && b.crop) {
      const ca = a.crop as { crop: number[]; baseline: number },
        cb = b.crop as { crop: number[]; baseline: number }
      if (ca.crop.some((v, q) => !near(v, cb.crop[q])) || !near(ca.baseline, cb.baseline)) {
        // (every coordinate a hundredth off at most: a value at half a hundredth that the two reads of A round apart)
        const half =
          ca.crop.every((v, q) => Math.abs(v - cb.crop[q]!) <= 0.0100001) &&
          Math.abs(ca.baseline - cb.baseline) <= 0.0100001
        if (process.env.AXT_GATE_CROPS)
          console.log(
            `CROP ${ca.crop.map((v, q) => (v - cb.crop[q]!).toFixed(2)).join(' ')} ${(ca.baseline - cb.baseline).toFixed(2)} ${(a as { crop: { src?: string } }).crop.src ?? ''}`,
          )
        return at(half ? 'U.elements: a crop’s box, a hundredth apart (half hundredths)' : 'U.elements: a crop’s box')
      }
      if (!near(a.cw, b.cw)) return at('U.elements: a crop’s width')
      continue
    }
    if ((a.s ?? null) !== (b.s ?? null)) return at('B.tokens: text')
    for (const f of FLAGS) if (!near(a[f], b[f])) return at(`B.tokens: ${f}`)
    const fa = a.face ? fontString(a.face as never, 100) : null,
      fb = b.face ? fontString(b.face as never, 100) : null
    if (fa !== fb) return at(`B.faces: face (${fa} against ${fb})`)
    if (!near(a.w100, b.w100)) return at('B.measure: width')
    const sa = (a.st ?? {}) as Tok,
      sb = (b.st ?? {}) as Tok
    for (const f of ['color', 'upper'])
      if (JSON.stringify(sa[f] ?? null) !== JSON.stringify(sb[f] ?? null)) return at(`B.tokens: style ${f}`)
    // (a link's group by its presence: its id is the group's, today's a number of the paper's, the part's the open piece's)
    if ((sa.link === undefined) !== (sb.link === undefined)) return at('B.tokens: style link')
    if (!near(a.at, b.at) || !near(a.end, b.end)) return at('B.tokens: word table (at, end)')
  }
  return null
}
/** the inputs a named correction's effect substitutes, today's value for the part's: `measure` each block's measure x0..x1
 *  (the column's), `next` the room under the last line
 *  (Room.next: U.params' halfLead.below), `side` the widened blocks (X.further's), `all` the whole prepared member (the
 *  tokens too); a block's only where the two cut as many blocks */
export type Substitute = 'measure' | 'next' | 'side' | 'all' | `.${string}`
export function substitute(mem: FlowMember, td: FlowMember, what: readonly Substitute[]) {
  const same = mem.blocks.length === td.blocks.length
  for (const w of what) {
    if (w === 'all') {
      const { ord, follower, rowStart } = mem
      Object.assign(mem, td, { ord, follower, rowStart })
      continue
    }
    // (a field of the member by its path, `.P.x` or `.blocks.x` (each block's), to find which one an equal-input difference reads)
    if (w.startsWith('.')) {
      const [f, g] = w.slice(1).split('.') as [string, string | undefined]
      const a = mem as unknown as Raw,
        b = td as unknown as Raw
      if (!g) a[f] = b[f]
      else if (f === 'blocks') {
        if (same)
          mem.blocks.forEach((x, k) => {
            ;(x as unknown as Raw)[g] = (td.blocks[k] as unknown as Raw)[g]
          })
      } else a[f] = { ...(a[f] as Raw), [g]: (b[f] as Raw)[g] }
      continue
    }
    if (w === 'next' && mem.P.halfLead && td.P.halfLead)
      mem.P = { ...mem.P, halfLead: { ...mem.P.halfLead, below: td.P.halfLead.below } }
    if (w === 'side') mem.wide = td.wide
    if (!same) continue
    mem.blocks.forEach((b, k) => {
      const t = td.blocks[k]!
      if (w === 'measure') {
        b.x0 = t.x0
        b.x1 = t.x1
      }
    })
  }
}

/** a pair laid page by page from L1's parts, the reading and tokens today's; `metricsOf` the Metrics its lays measure with
 *  (default: the tap's table of today's measures, which throws MissingMeasure for a measure today never made) */
export function gateL1Pair(
  pair: string,
  o: {
    metricsOf?: (pair: string) => Metrics
    /** the measurer I3 reads an ink right from where `metricsOf`'s has none (the lab's served faces, served-metrics.mjs) */
    served?: Metrics | null
    reading?: 'today' | 'part'
    substitute?: readonly Substitute[]
    /** each page laid again by design-a's entry (layPage over the part and the rows), compared with the runner's lay */
    entry?: boolean
    /** the members no id or glyphs joined (`members`), each joined to one of today's units (`today`, the ords no member is
     *  joined to): ord -> today's ord, its row then laid in the member's unit (the parity's: stage 1a's statement of the unit
     *  the member's holds whole, the two of one content, lab/typeset/parity/join.mjs heldJoin) */
    held?: (members: readonly L1Placed[], today: readonly number[]) => ReadonlyMap<number, number>
    /** the members each of which holds two or more of today's units whole, its text theirs in order (lab/typeset/parity/join.mjs
     *  joinedJoin: F0's lines, a figure paragraph, a word joined across a size change): ord -> today's ords and the plan its row is
     *  said by, each piece today's unit's row (its text) or one of the member's elements */
    joined?: (
      members: readonly L1Placed[],
      today: readonly number[],
    ) => ReadonlyMap<
      number,
      { todays: readonly number[]; plan: readonly ({ t: 'today'; i: number } | { t: 'el'; id: string })[] }
    >
    /** whether the entry is given a member's door row (its runner's judgement by the translate package's rule, which this
     *  package may not import): one refused is no row, the unit left the original's, as the chain makes no row of a reading
     *  that says nothing */
    accept?: (unit: Unit, content: readonly OutPiece[]) => boolean
    /** the reads gate (what a page reads is what it waits for, docs/PDF-READER.md §19.15): with `entry`, each page laid again by
     *  layPage under each of these reading options (a name, and the unit kinds its toggles leave the original's: Rules.leave,
     *  the reader's compose/classes.ts leftKinds; the reader's default and every option on), over the entry's rows, each row id
     *  its lay reads recorded; an id its page's wait set does not hold (waitOf over no row in, the rows going on: every row the
     *  page would wait for) is counted (GateL1's entry.reads), no exemption: 0 to pass */
    leave?: ReadonlyMap<string, readonly string[]>
    /** where given, each page's lay under each option told: the ids it read and its wait set (a lab tool's record) */
    reads?: (option: string, page: number, read: ReadonlySet<string>, waits: ReadonlySet<string>) => void
  } = {},
): GateL1 {
  const measure = o.metricsOf ? fitMeasure(o.metricsOf(pair)) : null
  const servedMeasure = o.served ? fitMeasure(o.served) : null
  const metrics = o.metricsOf?.(pair) ?? null
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
    inv: { laid: 0, lines: 0, I3: [], I4: [], I5: [], I5by: new Map(), below: [] },
    ms: [],
    adaptMs: 0,
    inputs: new Map(),
    readMs: 0,
    tokens: new Map(),
    ...(o.entry
      ? {
          entry: {
            alike: 0,
            differ: 0,
            ex: [],
            ms: [],
            names: new Map(),
            links: new Map(),
            linkEx: new Map(),
            figures: new Map(),
            lit: { laid: 0, lines: 0, boxes: 0, apart: 0, empty: 0 },
            cover: newCover(),
            paras: newParasGate(),
            ...(o.leave ? { reads: new Map() } : {}),
          },
        }
      : {}),
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
  // (AXT_GATE_NOFILL: no page fill, to time a page without it)
  const R = {
    ...rules!.targets[L.target]!.params,
    adaptiveFill: process.env.AXT_GATE_NOFILL ? null : (L.info.adaptiveFill ?? null),
  } as unknown as RuleParams
  const today = todayBundle(paper)
  const views = viewsOf(paper)
  // (the reading from the part: the door's rows, the paper's designs and roles from its part's fonts, the label's names)
  const part0 = bundle.parts.values().next().value
  const doors = o.reading === 'part' ? doorRows(pair) : null
  const doorById = new Map<string, NonNullable<ReturnType<typeof doorRows>> extends Map<number, infer R> ? R : never>()
  if (doors)
    for (const u of L.units) if (u.id && doors.has(u.ord) && !doorById.has(u.id)) doorById.set(u.id, doors.get(u.ord)!)
  let paperR: PaperReading | null = null
  if (o.reading === 'part' && part0)
    paperR = paperReading(part0.paper.faces.fonts, L.target, rulesFor(L.target as never).cjkFaces as never)
  // (every member once, from the part of its first page; its flow's neighbours, a name none (it is no row of theirs): the name
  // the part binds to a member its lead (lay/lead.ts, as the entry sets it))
  const byOrd = new Map<
    number,
    { m: L1Placed; before: L1Placed | null; after: L1Placed | null; leader: L1Placed | null }
  >()
  const beside = (x: L1Placed | undefined) => (!x || x.kind === 'name' ? null : x)
  for (const part of bundle.parts.values())
    for (const flow of part.flows)
      flow.forEach((m, k) => {
        const b = flow[k - 1]
        if (!byOrd.has(m.ord))
          byOrd.set(m.ord, {
            m,
            before: beside(b),
            after: beside(flow[k + 1]),
            leader: b?.kind === 'name' && b.bound ? b : null,
          })
      })
  // (the free paper a member shares on its baseline with a member beside it, and the line of TeX's it shares whole with the
  // members beside it, as the entry reads them over a page's part (entry.ts: sharedPaper, rowLinesOf with flush-left lines),
  // from the part of the page its first line stands on: the gate judges what the reader draws (the google-lay lane: without
  // them the runner gave a right-hand running head its measure from the left one's ink, the reader from the middle of the
  // paper between them)
  const sharedOf = new Map<number, readonly [number, number]>()
  const lineOf = new Map<number, NonNullable<Parameters<typeof adapt>[0]['line']>>()
  for (const [pg, part] of bundle.parts) {
    const sh = sharedPaper(part.flows, pg)
    const rl = rowLinesOf(part.flows, { left: true })
    for (const flow of part.flows)
      for (const m of flow) {
        if (m.lines[0]?.[0] !== pg) continue
        if (sh.has(m.ord) && !sharedOf.has(m.ord)) sharedOf.set(m.ord, sh.get(m.ord)!)
        if (rl.has(m.ord) && !lineOf.has(m.ord)) lineOf.set(m.ord, rl.get(m.ord)!)
      }
  }
  const rules0 = rulesFor(L.target as never)
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
  // (by today's id of its unit: a figure text whose glyphs set a run in another face is today's text alone, todayUnitOf)
  const todayIdOf = (id: string) => {
    const u = bundle.units.get(id)
    return u ? todayUnitOf(u).id : id
  }
  for (const [ord, x] of [...byOrd].sort((a, b) => a[0] - b[0])) {
    if (typeof x.m.text !== 'string') continue
    const tid = todayIdOf(x.m.text)
    const k = seenId.get(tid) ?? 0
    seenId.set(tid, k + 1)
    const u = todayById.get(tid)?.[k]
    if (u) unitOf.set(ord, u)
  }
  // (then the members no id joined, by their glyphs: a unit whose kept runs v2 holds as elements, its addresses and its scripts,
  // where today's held them otherwise, l1.ts keptJoin; its row today's said in v2's unit, keptRow)
  const keptOf = new Map<number, TodayPrepared>()
  const prepared = todayPrepared(paper)
  if (prepared) {
    const joined = new Set([...unitOf.values()].map((u) => u.ord))
    const free = [...byOrd].filter(([o]) => !unitOf.has(o)).map(([, x]) => x.m)
    const left = L.units.filter((u) => !joined.has(u.ord) && prepared.has(u.ord)).map((u) => prepared.get(u.ord)!)
    for (const [o, t] of keptJoin(free, bundle.units, left)) {
      const u = L.units.find((x) => x.ord === t)
      if (!u) continue
      unitOf.set(o, u)
      keptOf.set(o, prepared.get(t)!)
    }
  }
  // (then, where the caller joins them (the parity's `held`), the members neither joined to today's unit theirs holds whole)
  if (o.held) {
    const joined = new Set([...unitOf.values()].map((u) => u.ord))
    const free = [...byOrd].filter(([ord]) => !unitOf.has(ord)).map(([, x]) => x.m)
    const left = L.units.filter((u) => !joined.has(u.ord)).map((u) => u.ord)
    for (const [ord, t] of o.held(free, left)) {
      const u = L.units.find((x) => x.ord === t)
      if (u) unitOf.set(ord, u)
    }
  }
  // (and the members holding several of today's units, each its row said by theirs in its order, joinedRow)
  const joinedOf = new Map<
    number,
    { todays: readonly number[]; plan: readonly ({ t: 'today'; i: number } | { t: 'el'; id: string })[] }
  >()
  if (o.joined) {
    const joined = new Set([...unitOf.values()].map((u) => u.ord))
    const free = [...byOrd].filter(([ord]) => !unitOf.has(ord)).map(([, x]) => x.m)
    const left = L.units.filter((u) => !joined.has(u.ord)).map((u) => u.ord)
    for (const [ord, j] of o.joined(free, left)) {
      const u = L.units.find((x) => x.ord === j.todays[0])
      if (!u) continue
      unitOf.set(ord, u)
      joinedOf.set(ord, j)
    }
  }
  /** a joined member's row: each of today's units in its plan its door row's text, each element the member's own, today's texts
   *  apart by a space where the target writes one between words; null where one of them has no row whole or in part */
  const joinedRow = (ord: number): { content: OutPiece[]; by: string } | null => {
    const j = joinedOf.get(ord)
    if (!j || !doors) return null
    const gap = /^(zh|ja|ko)/.test(L.target) ? '' : ' '
    const content: OutPiece[] = []
    let by = ''
    for (const p of j.plan) {
      if (p.t === 'el') {
        content.push({ t: 'el', id: p.id })
        continue
      }
      const r = doors.get(j.todays[p.i]!)
      if (!r || !(r[2] === 'whole' || r[2] === 'partial')) return null
      by ||= String(r[3])
      const s = r[1].filter((q): q is string => typeof q === 'string').join('')
      const last = content.at(-1)
      if (last?.t === 'text') last.s += gap + s
      else content.push({ t: 'text', s })
    }
    return { content, by }
  }
  /** a member's door row as the translation package's Result holds it, in the unit's own pieces: the door's, or today's row
   *  said in v2's unit where the two hold its kept runs otherwise; null where a piece is no source piece */
  const rowOf = (
    ord: number,
    row: DoorRow,
    src: Unit,
  ): { content: OutPiece[]; sentences?: { src: number[]; tr: number[] } } | null => {
    const t = keptOf.get(ord)
    if (t) return keptRow(row, t, src)
    const source = sourcePieces(todayUnitOf(src).content)
    const content = outOfDoor(row[1], source)
    if (!content || (o.accept && !o.accept(src, content))) return null
    // (the sentences today laid, where the prepare marks the unit lit by sentence: as a translator is asked for them)
    const sentences = src.sentences ? doorSentences(row, source) : undefined
    return { content, ...(sentences ? { sentences } : {}) }
  }
  // (the paper's own name units' door rows, by the ids the part states them by (Part.paper.names): what a head reads where the
  // target's packages name it not, as the entry reads them from its rows, ownNamesOf)
  const nameRows = new Map<string, Row>()
  if (doors)
    for (const [, id] of part0?.paper.names ?? []) {
      const u = todayById.get(id)?.[0]
      const row = u ? doors.get(u.ord) : undefined
      const src = bundle.units.get(id)
      if (!row || !src || !(row[2] === 'whole' || row[2] === 'partial')) continue
      const content = outOfDoor(row[1], sourcePieces(src.content))
      if (content) nameRows.set(id, { id, ok: true, by: String(row[3]), content })
    }
  const ownNames = ownNamesOf(part0?.paper.names, nameRows)
  const adapted = new Map<number, FlowMember>()
  let patternsSeen: Record<string, unknown> | undefined
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
    // (a unit the paper keeps as it is (Unit.kept: its names, code, an algorithm's body) is never translated, whatever row is
    // given of it, as the entry leaves it (entry.ts contentOf): a row of it laid here was laid by the runner alone (the
    // google-lay lane: the lab's Google fill asked for 45 kept code cells of 2608.06007v1, which the product never asks)
    if (bundle.units.get(x.m.text)?.kept) {
      stop('a unit the paper keeps (Unit.kept): never translated')
      continue
    }
    patternsSeen ??= (c.P as Raw).patterns as Record<string, unknown> | undefined
    const label = c.slot('U.label', 'label')?.label as { drawn?: string } | null | undefined
    const up = c.slot('U.params')
    const nextUnit = x.after ? unitOf.get(x.after.ord) : undefined
    // (the reading and the tokens from the part (lay/read.ts) where asked, with today's as the oracle: E1's input level)
    let reading: Reading = {
      tokens: c.tokens as never,
      labelDrawn: label?.drawn ?? null,
      lead: !!(c.slot('U.lead', 'lead')?.lead ?? null),
      cjkSize: undefined as number | undefined,
      // (the regions today's tokens block to: U.breaks' referenced, as the tokens were made with)
      referenced: new Set(
        (c.tokens as { blockTo?: number }[]).flatMap((t) => (Number.isInteger(t.blockTo) ? [t.blockTo!] : [])),
      ) as ReadonlySet<number>,
      own: false,
    }
    let tokensVerdict: string | null = null
    // (led by a name: set with its lead (the entry's ledBy), or after the name kept the original's (keptBefore); today's reading
    // holds its own lead in its tokens, the member its label and first line from the name)
    let mm: L1Placed = x.m
    let nameLead: ReturnType<typeof ledBy> = null
    if (x.leader && metrics) {
      const designs = (paperR ?? paperReading(part0!.paper.faces.fonts, L.target, rules0.cjkFaces as never)).designs
      const w = x.leader.why ? null : nameOf(x.leader, true, { ...rules0, set: R }, metrics, { designs } as never)
      nameLead =
        w && 'lead' in w && (o.reading === 'part' || reading.lead) ? ledBy(x.leader, x.m, w.lead, designs) : null
      mm = nameLead ? nameLead.m : keptBefore(x.leader, x.m)
    }
    if (o.reading === 'part') {
      // (a row by the unit's id: rows are keyed by content (design-a §1.5), and a unit the paper repeats (a running head on
      // every page) has one row, which today's door holds under its first ord)
      const row = doors?.get(u.ord) ?? (u.id ? doorById.get(u.id) : undefined)
      const src = bundle.units.get(x.m.text)
      const jr = joinedOf.has(ord) ? joinedRow(ord) : undefined
      if (jr === null) {
        stop('the reading: a joined unit with a piece of today’s with no row')
        continue
      }
      if (!src || !metrics || !paperR || (!jr && (!row || !(row[2] === 'whole' || row[2] === 'partial')))) {
        stop(`the reading: ${!row ? 'no door row' : !src ? 'no unit of the part' : `a row ${row[2]}`}`)
        if (!row && process.env.AXT_GATE_NOROW)
          console.log(`NOROW ${pair} ord ${u.ord} ${u.kind} ${x.m.kind} ${String(x.m.text).slice(0, 12)}`)
        continue
      }
      if (x.m.els?.some(([, e]) => e.ends || e.opens !== undefined)) {
        stop('breaks (U.breaks not adapted)')
        continue
      }
      const source = sourcePieces(src.content)
      // (the door's row as the translation package's Result would hold it (its text, the source's elements and groups by id):
      // the reading takes the pieces from it and the member's facts alone, rowPieces; AXT_GATE_SOURCE=1 the unit's own pieces
      // as before, to hold the two equal); a unit whose kept runs v2 holds as elements, today's row said in v2's unit
      const content = jr
        ? jr.content
        : keptOf.has(ord)
          ? (rowOf(ord, row!, src)?.content ?? null)
          : outOfDoor(row![1], source)
      if (!content) {
        stop('the reading: a row piece no source piece is')
        continue
      }
      const pieces =
        process.env.AXT_GATE_SOURCE && row && !jr
          ? (row[1].map((q) =>
              typeof q === 'string' ? ({ t: 'text', tr: true, s: q } as V0Piece) : source[q],
            ) as V0Piece[])
          : rowPieces(mm, content)
      const tr = performance.now()
      let rd: ReturnType<typeof readMember>
      try {
        rd = readMember({
          m: mm,
          unit: {
            kind: u.kind,
            ...(x.m.title ? { title: true } : {}),
            state: jr ? 'whole' : row![2],
            pieces,
          } as RowUnit,
          rects: mm.lines.map((l) => rectOf(l, mm)),
          to: L.target,
          P: R as never,
          paper: paperR,
          labels: {
            words: (rules!.targets[L.target] as { labels?: Record<string, string> }).labels ?? null,
            captions: { figure: 'target', table: 'target' },
            heads: rules0.heads,
            names: ownNames,
          },
          refs: rules0.refs,
          relabels: !!mm.label && !((mm.fixed ?? 0) & 4),
          lead: nameLead?.lead ?? null,
          shown: Number.POSITIVE_INFINITY,
        })
        rd = { ...rd, tokens: measured(rd.tokens, metrics!) }
      } catch (e) {
        // (a width the Metrics given lacks: the tap's table holds today's measures alone)
        if ((e as Error)?.name !== 'MissingMeasure') throw e
        stop('the reading: a measure the table lacks')
        continue
      }
      out.readMs += performance.now() - tr
      // (today's own tokens: those the tap recorded, before the label crops the run set ahead of them)
      let todays = c.tokens as unknown as Tok[]
      if (c.slot('U.decor', 'carriedCrop')?.carriedCrop) todays = todays.slice(1)
      if ((todays[0] as { ownLabel?: boolean } | undefined)?.ownLabel) todays = todays.slice(1)
      tokensVerdict = rd.unproven >= 0 ? 'U.elements: unproven' : tokensDiff(rd.tokens as unknown as Tok[], todays)
      out.tokens.set(u.ord, tokensVerdict ?? 'equal')
      // (a member whose reading is unproven is not laid, as the entry leaves it: its ink stays the original's)
      if (rd.unproven >= 0) {
        stop('the reading: unproven')
        continue
      }
      if (DEEP === `${pair}:${u.ord}`)
        console.log(
          JSON.stringify({
            unproven: rd.unproven,
            verdict: tokensVerdict,
            res: [...rd.resolutions],
            els: x.m.els,
            mine: (rd.tokens as unknown as Tok[]).map((t) => ({ ...t, face: undefined, st: t.st })),
            today: todays.map((t) => ({ ...t, face: undefined, st: t.st })),
          }),
        )
      reading = {
        tokens: rd.tokens as never,
        labelDrawn: rd.labelDrawn,
        lead: rd.lead,
        cjkSize: rd.cjkSize,
        referenced: rd.referenced,
        breaks: rd.breaks,
        own: true,
      }
    }
    const ta = performance.now()
    const got = adapt({
      m: mm,
      before: x.before,
      after: x.after,
      afterOpen: !!(nextUnit?.slots.find((s) => s.by === 'U.admit' && s.round === 0)?.value as Raw | undefined)?.ok,
      R,
      measure: (measure ?? (c.P as Raw).measure) as never,
      patterns: (c.P as Raw).patterns as never,
      view: (pg) => views.get(pg),
      rulesOf: (pg) => today?.rules(pg),
      lineskip: (bundle.parts.values().next().value?.paper.lineskip as [number, number] | undefined) ?? null,
      reading,
      ...(sharedOf.has(x.m.ord) ? { shared: sharedOf.get(x.m.ord)! } : {}),
      ...(lineOf.has(x.m.ord) ? { line: lineOf.get(x.m.ord)! } : {}),
    })
    out.adaptMs += performance.now() - ta
    if ('stop' in got) {
      stop(got.stop)
      continue
    }
    // (the CJK body face's size correction, B.faces': today's trackStart, as U.params read it, where the reading is today's)
    if (o.reading !== 'part') got.member.P.trackStart = up?.trackStart as number
    // (named by today's ords, which the ledger and the dumps hold: L1's ord of a unit can differ)
    const todayOrd = (o: number) => unitOf.get(o)?.ord ?? o
    const mem = got.member
    mem.ord = u.ord
    if (mem.follower) mem.follower = { ...mem.follower, id: todayOrd(mem.follower.id) }
    if (mem.rowStart)
      mem.rowStart = { ...mem.rowStart, row: { ...mem.rowStart.row, id: todayOrd(mem.rowStart.row.id) } }
    adapted.set(ord, mem)
    const td = prepare(c)
    let setting = settingDiff(mem, td, o.reading !== 'part')
    // (every other field of the prepared member the lay reads, beyond the named ones: the first that differs, by its path; a
    // block's h and pitch the walk sets on today's, and noOver unset against false, are no input)
    if (setting === 'equal') {
      // (nor the fields of a shared row no rule reads: the follower's row is read by its page and baseline, S.share's by its
      // page, baseline and size; today's rows carry the lead's id and extent beside them. Nor a block's borrow room, `free`:
      // today's its page's pixel map's and a share of a pitch, the port's TeX's (Room.runs, Room.sep: the owner's ruling of
      // 2026-11-08), nor the two depths it is read from, which the borrow past TeX's bottom reads apart (`toFoot`, `toInk`:
      // the ruling of 2026-11-12, PDF-READER §18.37), which today's has not)
      const rest = differences(mem, td).filter(
        (d) =>
          !/\.(h|pitch): .* against undefined$|^\.noOver: undefined against false$|^\.(follower\.row|shareRow)\.(id|x0|x1|size): undefined against|\.(free|toFoot|toInk): /.test(
            d,
          ),
      )
      if (rest.length) setting = `prepared: ${rest[0]!.replace(/\[\d+\]/g, '[]').replace(/: .*$/, '')}`
    }
    out.setting.set(u.ord, setting)
    if (o.reading === 'part') out.inputs.set(u.ord, setting !== 'equal' ? setting : (tokensVerdict ?? 'equal'))
    if (DEEP === `${pair}:${u.ord}`)
      console.log(
        JSON.stringify(differences(mem, td), null, 1),
        // (and every number apart at all: the comparison's tolerance hides a difference the lay may read)
        JSON.stringify({ s: [mem.s, td.s], P: differences(mem.P, td.P, '.P', [], 0) }),
      )
    // (a named correction's effect: today's value of the inputs named substituted into the member, the rest the part's; its
    // classes above are the member's own)
    if (o.substitute?.length) substitute(mem, td, o.substitute)
  }
  pieceCrops(pair, new Map([...adapted].map(([o, m]) => [o, { tokens: m.tokens } as never])))
  const dumped = new Map<
    number,
    {
      first: number
      d: DumpUnit
      lines: DumpUnit['lines']
      elements: NonNullable<DumpUnit['elements']>
      sizes: number[]
    }
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
  // (the entry's rows: each member's door row as the translation package's Result, by its unit's id; `said`, the ids whose row
  // is today's row of other units said in v2's (several of today's joined, kept runs held as elements, a figure text flattened),
  // which no translator gave v2's unit: lab/typeset/parity/fresh.mjs freshNeeds)
  let entryRows: (Rows & { said(id: string): boolean }) | null = null
  if (out.entry && doors) {
    const byId = new Map<string, Row>(nameRows)
    const said = new Set<string>()
    for (const [ord, x] of byOrd) {
      // (a member holding several of today's: theirs in its order, joinedRow)
      if (joinedOf.has(ord) && typeof x.m.text === 'string' && !byId.has(x.m.text)) {
        const jr = joinedRow(ord)
        if (jr) {
          byId.set(x.m.text, { id: x.m.text, ok: true, by: jr.by, content: jr.content })
          said.add(x.m.text)
        }
        continue
      }
      const u = unitOf.get(ord)
      const row = u ? (doors.get(u.ord) ?? (u.id ? doorById.get(u.id) : undefined)) : undefined
      const src = typeof x.m.text === 'string' ? bundle.units.get(x.m.text) : undefined
      if (!row || !src || typeof x.m.text !== 'string' || byId.has(x.m.text)) continue
      if (!(row[2] === 'whole' || row[2] === 'partial')) continue
      // (today's row names today's pieces: of a figure text whose runs L1's holds as groups, its one text; of a unit whose
      // kept runs v2 holds as elements, said in v2's unit; with the sentences today laid, where the unit is lit by sentence)
      const r = rowOf(ord, row, src)
      if (!r) continue
      byId.set(x.m.text, { id: x.m.text, ok: true, by: String(row[3]), ...r })
      if (keptOf.has(ord) || todayUnitOf(src) !== src) said.add(x.m.text)
    }
    // (and the units the paper keeps as they are, as the reader's rows say them (reader.ts, Unit.kept): never translated)
    entryRows = {
      get: (k) => byId.get(k),
      done: true,
      kept: (k) => bundle.units.get(k)?.kept === true,
      said: (k) => said.has(k),
    }
  }
  // (the entry's lays of each unit begun on a pass page, by the page whose lay laid it: I6 across the lays, cross-lay.ts)
  const laysOf = new Map<number, Map<number, UnitLay>>()
  // (the rule ledger's recorder, where a lab run installed it (lab/rules/register.mjs): the pair, the page of each case)
  type Recorder = { context(next: { paper?: string; page?: number | null }): void }
  const ledgerRecorder = (globalThis as { __axtRules?: Recorder }).__axtRules
  ledgerRecorder?.context({ paper: pair, page: null })
  for (const [pg, part] of [...bundle.parts].sort((a, b) => a[0] - b[0])) {
    out.pages++
    ledgerRecorder?.context({ page: pg })
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
    // (the ink boxes the part states for each member laid, by its laid ord: its elements' and its label's, which I5 reads a crop
    // ending a line by)
    const inksBy = new Map<number, number[][]>()
    for (const m of part.flows.flat()) {
      const a = adapted.get(m.ord)
      if (a)
        inksBy.set(a.ord, [
          ...(m.els ?? []).flatMap(([, e]) => e.ink as number[][]),
          ...(m.label?.ink ? [m.label.ink as number[]] : []),
        ])
    }
    // (a table's cells, and the members laid at one size: one paragraph of TeX's the front end cut at a float, a figure's set;
    // a table decided over the cells handed in, as today's settleGroup over the cells whose rows are translated: a cell left
    // out that holds its table is tieHeld's, and one handed whole with a cell left out, settleTies skips: the entry's rule)
    const handed = new Set(flows.flat().map((m) => m.ord))
    const ties = ((part.ties ?? []) as { rule: string; cells?: number[][]; ords?: number[] }[]).map((t) =>
      t.rule === 'cells'
        ? {
            rule: 'cells' as const,
            cells: (t.cells ?? [])
              .flat()
              .map((o) => unitOf.get(o)?.ord ?? o)
              .filter((o) => handed.has(o)),
          }
        : { rule: 'size' as const, ords: (t.ords ?? []).map((o) => unitOf.get(o)?.ord ?? o) },
    )
    // (a flow whose lay throws is left the original's alone by the composition, design-a §1.4: its members 'error', the reason
    // with them)
    let got: ReturnType<typeof layPagePrepared> | null = null
    const t0 = performance.now()
    try {
      got = layPagePrepared(pg, flows, ties, R)
      out.ms.push(performance.now() - t0)
      if (process.env.AXT_GATE_PAGE === String(pg))
        console.log(`PAGE ${pg}: ${got.members.length} members, ${(performance.now() - t0).toFixed(2)} ms`)
    } catch (e) {
      out.threw.push(`p${pg}: ${String((e as Error)?.message ?? e).slice(0, 120)}`)
    }
    if (got) invariantsOf(pg, got.members, R, out.inv, (ord) => inksBy.get(ord), servedMeasure)
    if (got && out.entry && entryRows && metrics) {
      const t1 = performance.now()
      const linkFates: LinkFate[] = []
      const lays: UnitLay[] = []
      const page = layPage(
        part as Part,
        entryRows,
        { ...rulesFor(L.target as never), set: R, hyph: patternsSeen ?? {} },
        metrics,
        { linkFates, lays },
      )
      out.entry.ms.push(performance.now() - t1)
      for (const x of lays) {
        const by = laysOf.get(x.ord) ?? new Map<number, UnitLay>()
        laysOf.set(x.ord, by.set(pg, x))
      }
      coverOf(out.entry.cover, page, part as Part, metrics, pair)
      parasGate(out.entry.paras, pair, pg, page, part as Part, entryRows, bundle.units)
      // (the reads gate: the page laid under each reading option, every row id its lay reads against what the page would wait
      // for while rows come; the entry's rows as they are, every row in)
      for (const [option, left] of o.leave ?? []) {
        const leave = new Set(left)
        const waits = new Set(waitOf(part as Part, { get: () => undefined, done: false, kept: entryRows.kept }, leave))
        const read = new Set<string>()
        const recorded: Rows = {
          get: (id) => {
            read.add(id)
            return entryRows!.get(id)
          },
          done: entryRows.done,
          kept: entryRows.kept,
        }
        layPage(
          part as Part,
          recorded,
          { ...rulesFor(L.target as never, { leave: [...left] }), set: R, hyph: patternsSeen ?? {} },
          metrics,
        )
        o.reads?.(option, pg, read, waits)
        const outside = [...read].filter((id) => !waits.has(id))
        const r = out.entry.reads!.get(option) ?? { pages: 0, reads: 0, outside: 0, outsidePages: 0, ex: [] }
        out.entry.reads!.set(option, r)
        r.pages++
        r.reads += read.size
        r.outside += outside.length
        if (outside.length) r.outsidePages++
        if (outside.length && r.ex.length < 3)
          r.ex.push(`p${pg}: ${outside.length} (${outside.map((x) => x.slice(0, 8)).join(', ')})`)
      }
      // (the links' fates, the dropped with an example each; the laid members' boxes on both panes)
      ;((part as Part).links ?? []).forEach((l, i) => {
        // (an annotation of a member's other page, which the part holds with its page: counted apart)
        const f = `${l.page && l.page !== pg ? 'across ' : ''}${linkFates[i] ?? 'none'}`
        out.entry!.links.set(f, (out.entry!.links.get(f) ?? 0) + 1)
        // (AXT_GATE_LINKS=<file>: each link's fate a line, its pair, page, index in the part's and owner, to compare two runs)
        if (process.env.AXT_GATE_LINKS)
          appendFileSync(
            process.env.AXT_GATE_LINKS,
            `${pair}\tp${pg}\t${i}\t${f}\t${l.owner?.[0] ?? ''} ${l.owner?.[1] || 'text'}\n`,
          )
        const ex = out.entry!.linkEx.get(f) ?? []
        if (ex.length < 3 && ['off', 'targets', 'unmatched', 'unplaced', 'none'].includes(f))
          out.entry!.linkEx.set(f, [...ex, `${pair} p${pg} ord ${l.owner?.[0]} ${l.owner?.[1] || 'text'}`])
      })
      for (const m of (part as Part).flows.flat())
        if (m.kind === 'figure' && m.lines[0]?.[0] === pg) {
          const st = page.members.find((x) => x.ord === m.ord)?.state ?? 'none'
          const k = `${m.dir ? 'turned' : 'level'}: ${st}`
          out.entry.figures.set(k, (out.entry.figures.get(k) ?? 0) + 1)
        }
      // (AXT_GATE_LIT=<file>: each member's boxes on both panes a line, its pair, page, unit, kind and state, never its ord (a
      // kept block merged moves the ords of the units made after it), to compare two runs' highlights piece by piece)
      if (process.env.AXT_GATE_LIT) {
        const byOrd = new Map((part as Part).flows.flat().map((m) => [m.ord, m]))
        const r2 = (v: unknown): unknown =>
          typeof v === 'number' ? Math.round(v * 100) / 100 : Array.isArray(v) ? v.map(r2) : v
        appendFileSync(
          process.env.AXT_GATE_LIT,
          page.members
            .map((x) => {
              const m = byOrd.get(x.ord)
              const unit = typeof m?.text === 'string' ? m.text : JSON.stringify(m?.text ?? null)
              return `${pair}\tp${pg}\t${unit}\t${m?.kind ?? ''}\t${x.state}\t${JSON.stringify(r2(x.lit))}\n`
            })
            .join(''),
        )
      }
      for (const x of page.members) {
        if (x.state !== 'laid' || !x.lines.length) continue
        const lit = out.entry.lit
        lit.laid++
        lit.lines += x.lines.length
        lit.boxes += x.lit.right[0]?.length ?? 0
        if (x.lit.left.length !== x.lit.right.length) lit.apart++
        if (!x.lit.right[0]?.length) lit.empty++
      }
      // (the babel names the entry sets, S.names over the part: each name member on its first page, by its key and state)
      for (const m of (part as Part).flows.flat())
        if (m.kind === 'name' && typeof m.text !== 'string' && m.lines[0]?.[0] === pg) {
          const st = page.members.find((x) => x.ord === m.ord)?.state ?? 'none'
          const k = `${m.text.name}: ${st}`
          out.entry.names.set(k, (out.entry.names.get(k) ?? 0) + 1)
        }
      const mine = entryByToday(page.members, unitOf)
      for (const pm of got.members) {
        const e = mine.get(pm.ord)
        const same =
          !!e &&
          e.state === pm.state &&
          e.lines.length === pm.lines.length &&
          e.lines.every(
            (l, j) =>
              Math.abs(l[0] - pm.lines[j]![0]) <= 0.01 &&
              Math.abs(l[1] - pm.lines[j]![1]) <= 0.01 &&
              Math.abs(l[2] - pm.lines[j]![2]) <= 0.01 &&
              l[3].length === pm.lines[j]![3].length,
          )
        if (same) out.entry.alike++
        else {
          // (AXT_GATE_ENTRY=1: each member the entry lays otherwise, with the states of its table's cells in the entry)
          if (process.env.AXT_GATE_ENTRY) {
            const tie = (part.ties ?? []).find((t) => t.rule === 'cells' && t.cells.flat().includes(e?.ord ?? -1))
            const states =
              tie?.rule === 'cells'
                ? tie.cells.flat().map((o) => `${o}:${page.members.find((x) => x.ord === o)?.state}`)
                : []
            const ln = (l: readonly unknown[] | undefined) =>
              l
                ? `[${(l as number[]).slice(0, 3).join(', ')}] ${((l[3] as { s?: string; size?: number }[]) ?? []).map((it) => `${it.s}@${it.size?.toFixed?.(2)}`).join('|')}`
                : '-'
            console.log(
              `ENTRY ${pair} p${pg} ord ${pm.ord}: ${e?.state ?? 'none'} against ${pm.state}; its table: ${states.join(' ')}; entry ${ln(e?.lines[0])} runner ${ln(pm.lines[0])}`,
            )
          }
          out.entry.differ++
          if (out.entry.ex.length < 5)
            out.entry.ex.push(
              `p${pg} ord ${pm.ord}: ${e ? `${e.state} ${e.lines.length} lines` : 'none'} against ${pm.state} ${pm.lines.length}`,
            )
        }
      }
    }
    for (const pm of got?.members ?? [])
      if (pm.error && !out.thrown.has(pm.ord))
        out.thrown.set(pm.ord, pm.error.replace(/^MissingMeasure:.*/, 'MissingMeasure'))
    if (!got) continue
    for (const pm of got.members) {
      // (AXT_GATE_LAID=<pair>:<ord>: that member's blocks and laid lines, as its lay left them)
      if (process.env.AXT_GATE_LAID === `${pair}:${pm.ord}` && pm.lay) {
        const L = pm.lay.layout as unknown as Raw & { lines: Raw[] }
        console.log(
          `LAID p${pg} ord ${pm.ord} f ${L.f} scale ${L.scale} knob ${L.knob} clipped ${L.clipped}`,
          JSON.stringify(
            (pm.lay.blocks as unknown as Raw[]).map((b) => [b.page, b.x0, b.x1, b.B, b.free, b.widened, b.start]),
          ),
          JSON.stringify(
            L.lines.map((l) => [l.page, l.block, l.baseline, l.x0, l.x1, l.used, (l.items as unknown[]).length]),
          ),
        )
        // (and AXT_GATE_ITEMS=1: each line's items, where each starts, its width and its text)
        if (process.env.AXT_GATE_ITEMS)
          for (const l of L.lines as { page: number; items: { x?: number; w: number; t: Raw }[] }[])
            console.log(
              `ITEMS p${l.page}`,
              l.items
                .map(
                  (it) =>
                    `${(it.x ?? Number.NaN).toFixed(2)}+${it.w.toFixed(2)}:${String(it.t.s ?? (it.t.crop ? 'crop' : it.t.space ? '_' : '?'))}`,
                )
                .join(' '),
            )
      }
      if (pm.state !== 'laid' || !pm.lay) continue
      const d = dumpUnit(pm.lay, (p) => views.get(p))
      const lines = d.lines.filter((l) => l.page === pg),
        elements = (d.elements ?? []).filter((e) => e.page === pg),
        // (the size each line on the page is drawn at by the page's own lay: a unit laid in runs, each its run's)
        sizes = d.lines.flatMap((l, j) => (l.page === pg ? [d.sizes?.[j] ?? (d.size as number)] : []))
      const prev = dumped.get(pm.ord)
      if (!prev) {
        dumped.set(pm.ord, { first: pg, d, lines, elements, sizes })
        continue
      }
      out.twoPages++
      if (JSON.stringify(prev.d) !== JSON.stringify(d))
        out.selfDiffer.push(`ord ${pm.ord}: p${prev.first} against p${pg}`)
      prev.lines.push(...lines)
      prev.elements.push(...elements)
      prev.sizes.push(...sizes)
    }
  }
  ledgerRecorder?.context({ page: null })
  if (out.entry) coverDone(out.entry.cover, pair)
  if (out.entry && laysOf.size) out.entry.crossLay = crossLayOf(laysOf)
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
        ...(x.sizes.some((s) => s !== x.d.size) ? { sizes: x.sizes } : {}),
      })
  }
  return out
}
