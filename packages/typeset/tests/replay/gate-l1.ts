// The gate's runner over one pair from lane L1's parts (stage one of the adapter, src/lay/adapt.ts): each member of the
// paper's L1 bundle (tests/replay/l1.ts) set by the adapter from the facts its part states (U.blocks, U.decor, U.params; the
// shared rows of its flow), its reading and tokens today's (the tap's last laid round of the same unit: joined by ord and
// content id), and each page laid by layPagePrepared from its own L1 part's flows and ties. Answers the laid units in the
// baseline's reader-dump format, the members the adapter did not set by what stops them, and, per adapted member, the first
// field of its setting that differs from today's (round.ts prepare over the same round: the blocks' pages, baselines and
// measures, their alignment and indent, the size, the leading, the edges): the rule whose stated facts changed it.
import type { OutPiece, Part, Row } from '@readarxiv/format'
import { layPage } from '../../src/lay/entry.ts'
import type { FlowMember } from '../../src/lay/flow.ts'
import { readFileSync } from 'node:fs'
import { adapt, rectOf } from '../../src/lay/adapt.ts'
import {
  paperOf as paperReading,
  type PaperReading,
  readMember,
  type RowUnit,
  rowPieces,
  sourcePieces,
} from '../../src/lay/read.ts'
import { fontString } from '../../src/breaker/measure.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { V0Piece } from '../../src/unit/breaks.ts'
import { doorRows } from './rows.ts'
import { todayFile } from './tap.ts'
import { layPagePrepared, type PageMember } from '../../src/lay/page.ts'
import { fitMeasure } from '../../src/breaker/measure.ts'
import type { Metrics, RuleParams, Rows } from '../../src/types.ts'
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
  /** the invariants over every laid member (design §4.9: I3 its ink overlaps no other laid unit's, I4 each element drawn once,
   *  I5 no line wider than its slot, no fit under the floor): what breaks each, by member */
  inv: {
    laid: number
    lines: number
    I3: string[]
    I4: string[]
    I5: string[]
    I5by: Map<string, { n: number; max: number }>
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
  entry?: { alike: number; differ: number; ex: string[]; ms: number[] }
}

/** I3-I5 over a page's laid members (their lines on the page, as their lay and the page's fill left them) */
export function invariantsOf(page: number, members: readonly PageMember[], R: RuleParams, inv: GateL1['inv']) {
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
      const over = used - (l.x1 - l.x0)
      // (I5 restated, the placement's own guarantee (B.place placeItems L2:3976-4038): a line ends within its slot but for the
      // blank half of a closing mark it ends with (`hang`, half the size, at a compression under 2), and for a line whose
      // items cannot be set narrower: no word space to shrink and no gap a squeeze took (an overfull box, TeX's); each line
      // past its slot classed by which, its largest excess beside its count)
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
      boxes.push({
        ord: pm.ord,
        x0: l.x0,
        x1: l.x0 + used,
        y0: l.baseline - 0.215 * size,
        y1: l.baseline + 0.683 * size,
      })
    }
    if (L.scale < floor - 1e-9) inv.I5.push(`ord ${pm.ord}: set at ${L.scale} under the floor ${floor}`)
    // (each element's crop token drawn once over its lines, every page's)
    const seen = new Map<unknown, number>()
    for (const l of L.lines)
      for (const it of l.items) if ((it.t as { crop?: unknown }).crop) seen.set(it.t, (seen.get(it.t) ?? 0) + 1)
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
      if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5)
        inv.I3.push(`ords ${a.ord} and ${b.ord}: their lines overlap on p${page}`)
    }
}
const l0Page = (L: { lines: readonly { page: number }[] }) => L.lines[0]?.page

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
let heads: Record<string, { heads: Record<string, string> }> | null = null

/** the inputs a named correction's effect substitutes, today's value for the part's: `free` the borrow room under each block
 *  (Room.below's freeFor), `measure` each block's measure x0..x1 (the column's), `next` the room under the last line
 *  (Room.next: U.params' halfLead.below), `side` the widened blocks (X.further's), `all` the whole prepared member (the
 *  tokens too); a block's only where the two cut as many blocks */
export type Substitute = 'free' | 'measure' | 'next' | 'side' | 'all' | `.${string}`
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
      if (w === 'free') {
        b.free = t.free
        b.freeOf = t.freeOf
      }
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
    reading?: 'today' | 'part'
    substitute?: readonly Substitute[]
    /** each page laid again by design-a's entry (layPage over the part and the rows), compared with the runner's lay */
    entry?: boolean
  } = {},
): GateL1 {
  const measure = o.metricsOf ? fitMeasure(o.metricsOf(pair)) : null
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
    inv: { laid: 0, lines: 0, I3: [], I4: [], I5: [], I5by: new Map() },
    ms: [],
    adaptMs: 0,
    inputs: new Map(),
    readMs: 0,
    tokens: new Map(),
    ...(o.entry ? { entry: { alike: 0, differ: 0, ex: [], ms: [] } } : {}),
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
  if (o.reading === 'part' && part0) {
    paperR = paperReading(part0.paper.faces.fonts, L.target, rulesFor(L.target as never).cjkFaces as never)
    heads ??= (JSON.parse(readFileSync(todayFile('rules/tex-names.json'), 'utf8')) as { targets: typeof heads }).targets
  }
  // (each page's lowest unit line, as today's pageBottom: RUN:911 over every unit's rectangles but a figure's)
  const bottoms = new Map<number, number>()
  for (const part of bundle.parts.values())
    for (const flow of part.flows)
      for (const m of flow) {
        if (m.kind === 'figure' || m.kind === 'inkfigures' || m.kind === 'name') continue
        for (const l of m.lines) {
          const r = rectOf(l, m)
          const y = r[2] + 0.24 * (r[4] - r[2])
          bottoms.set(r[0], Math.min(bottoms.get(r[0]) ?? Number.POSITIVE_INFINITY, y))
        }
      }
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
    patternsSeen ??= (c.P as Raw).patterns as Record<string, unknown> | undefined
    const label = c.slot('U.label', 'label')?.label as { drawn?: string } | null | undefined
    const decor = c.slot('U.decor', 'heading')
    const up = c.slot('U.params')
    const nextUnit = x.after ? unitOf.get(x.after.ord) : undefined
    // (the reading and the tokens from the part (lay/read.ts) where asked, with today's as the oracle: E1's input level)
    let reading = {
      tokens: c.tokens as never,
      labelDrawn: label?.drawn ?? null,
      lead: !!(c.slot('U.lead', 'lead')?.lead ?? null),
      title: u.kind === 'heading' && !decor?.heading,
      front: false,
      cjkSize: undefined as number | undefined,
      // (the regions today's tokens block to: U.breaks' referenced, as the tokens were made with)
      referenced: new Set(
        (c.tokens as { blockTo?: number }[]).flatMap((t) => (Number.isInteger(t.blockTo) ? [t.blockTo!] : [])),
      ) as ReadonlySet<number>,
      own: false,
    }
    let tokensVerdict: string | null = null
    if (o.reading === 'part') {
      // (a row by the unit's id: rows are keyed by content (design-a §1.5), and a unit the paper repeats (a running head on
      // every page) has one row, which today's door holds under its first ord)
      const row = doors?.get(u.ord) ?? (u.id ? doorById.get(u.id) : undefined)
      const src = bundle.units.get(x.m.text)
      if (!row || !src || !(row[2] === 'whole' || row[2] === 'partial') || !metrics || !paperR) {
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
      // as before, to hold the two equal)
      const content = outOfDoor(row[1], source)
      if (!content) {
        stop('the reading: a row piece no source piece is')
        continue
      }
      const pieces = process.env.AXT_GATE_SOURCE
        ? (row[1].map((q) =>
            typeof q === 'string' ? ({ t: 'text', tr: true, s: q } as V0Piece) : source[q],
          ) as V0Piece[])
        : rowPieces(x.m, content)
      const tr = performance.now()
      let rd: ReturnType<typeof readMember>
      try {
        rd = readMember({
          m: x.m,
          unit: { kind: u.kind, ...(reading.title ? { title: true } : {}), state: row[2], pieces } as RowUnit,
          rects: x.m.lines.map((l) => rectOf(l, x.m)),
          to: L.target,
          P: R as never,
          paper: paperR,
          labels: {
            words: (rules!.targets[L.target] as { labels?: Record<string, string> }).labels ?? null,
            captions: { figure: 'target', table: 'target' },
            heads: heads?.[L.target]?.heads ?? null,
            names: null,
          },
          relabels: !!x.m.label && !((x.m.fixed ?? 0) & 4),
          metrics,
          shown: Number.POSITIVE_INFINITY,
        })
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
        title: reading.title,
        front: false,
        cjkSize: rd.cjkSize,
        referenced: rd.referenced,
        own: true,
      }
    }
    const ta = performance.now()
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
      reading,
      bottomOf: (pg) => bottoms.get(pg),
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
      // page, baseline and size; today's rows carry the lead's id and extent beside them)
      const rest = differences(mem, td).filter(
        (d) =>
          !/\.(h|pitch): .* against undefined$|^\.noOver: undefined against false$|^\.(follower\.row|shareRow)\.(id|x0|x1|size): undefined against/.test(
            d,
          ),
      )
      if (rest.length) setting = `prepared: ${rest[0]!.replace(/\[\d+\]/g, '[]').replace(/: .*$/, '')}`
      if (process.env.AXT_GATE_FREE && rest[0]?.includes('.free'))
        console.log(
          `FREE ${pair} ${u.ord} ${rest[0]} blocks ${mem.blocks.length} last ${mem.blocks.at(-1)!.B.at(-1)} below ${x.m.room.below} bottom ${bottoms.get(mem.blocks.at(-1)!.page)}`,
        )
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
  // (the entry's rows: each member's door row as the translation package's Result, by its unit's id)
  let entryRows: Rows | null = null
  if (out.entry && doors) {
    const byId = new Map<string, Row>()
    for (const [ord, x] of byOrd) {
      const u = unitOf.get(ord)
      const row = u ? (doors.get(u.ord) ?? (u.id ? doorById.get(u.id) : undefined)) : undefined
      const src = typeof x.m.text === 'string' ? bundle.units.get(x.m.text) : undefined
      if (!row || !src || typeof x.m.text !== 'string' || byId.has(x.m.text)) continue
      if (!(row[2] === 'whole' || row[2] === 'partial')) continue
      const content = outOfDoor(row[1], sourcePieces(src.content))
      if (content) byId.set(x.m.text, { id: x.m.text, ok: true, by: String(row[3]), content })
    }
    entryRows = { get: (k) => byId.get(k), done: true }
  }
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
    // (a table's cells, and the members laid at one size: one paragraph of TeX's the front end cut at a float, a figure's set)
    const ties = ((part.ties ?? []) as { rule: string; cells?: number[][]; ords?: number[] }[]).map((t) =>
      t.rule === 'cells'
        ? { rule: 'cells' as const, cells: (t.cells ?? []).flat().map((o) => unitOf.get(o)?.ord ?? o) }
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
    if (got) invariantsOf(pg, got.members, R, out.inv)
    if (got && out.entry && entryRows && metrics) {
      const t1 = performance.now()
      const page = layPage(
        part as Part,
        entryRows,
        { ...rulesFor(L.target as never), set: R, hyph: patternsSeen ?? {} },
        metrics,
        {
          heads: heads?.[L.target]?.heads ?? null,
        },
      )
      out.entry.ms.push(performance.now() - t1)
      const mine = new Map(page.members.map((m) => [unitOf.get(m.ord)?.ord ?? m.ord, m]))
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
      }
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
