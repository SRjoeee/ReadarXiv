// The replay's access to the tap (baseline/tap/TAP.md §6): today's reader's recorded inputs and outputs of each rule, kept in
// lab-data and never committed (they hold licensed papers' text). A replay test reads them by path and is skipped where the
// path is absent (hosted CI, a fresh clone): AXT_LAB_DATA names the lab-data directory, else the maintainer's.
// Every replay test states its own timeout, 120 s: the package's config sets none, so vitest's 5 s applied, and a replay that
// takes 3 s alone (round.test.ts at load 40) passed it under the whole suite's workers.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { CJK, punctOf } from '../../src/breaker/script.ts'

export const LAB = process.env.AXT_LAB_DATA ?? '/Users/cheongzhiyan/Developer/readarxiv-lab-data'
export const TAP = join(LAB, 'refactor-2026-11', 'baseline', 'tap')
/** the inputs lane L3's lab tools derive from the tap with today's own code (lab/typeset/), beside the tap */
export const DERIVED = join(LAB, 'refactor-2026-11', 'lanes', 'L3', 'replay')
export const hasTap = existsSync(join(TAP, 'samples'))
/** today's engine (065c1d973), read-only: its data files (the rule set, tex-names.json) until Rules' own data files exist */
export const TODAY = process.env.AXT_TODAY ?? '/Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/refactor-read'
export const todayFile = (path: string) => join(TODAY, 'src', 'pdf-reader', 'engine', path)
export const hasToday = existsSync(todayFile('rules/tex-names.json'))
export const hasDerived = (name: string) => existsSync(join(DERIVED, `${name}.json.gz`))

export const readGz = (file: string): unknown => JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'))

/** today's rule params (resolveRules') less the fields an owner's ruling removed from the port's rule set (lab/typeset/
 *  rules-data.mjs RULED_OUT: `borrowGap`, the clearance a borrowed line kept over the next ink, which TeX's paragraph separation
 *  replaces, 2026-11-08) */
export function ruledParams<T>(params: T): T {
  const o = { ...(params as Record<string, unknown>) }
  delete o.borrowGap
  return o as T
}
/** today's blocks (the tap's walked blocks) as today's walk offered their room: its borrow knob offered a block's room only
 *  where a block of the unit held a whole line of it at the original's pitch (statesOf's `most`), so a room under a line borrowed
 *  nothing. The owner's ruling of 2026-11-08 (borrowing bounded by TeX's facts, before shrinking) offers that room too (fit/
 *  walk.ts: a line TeX's \lineskip rule sets lower takes a fraction of a line): a unit whose every block's room is under a line
 *  is replayed with none, today's walk's states */
export function ruledRoom<B extends { free?: unknown; pitch0?: unknown }>(blocks: B[], s: number): B[] {
  return underALine(blocks, s)
    ? blocks.map((b) => (typeof b.free === 'number' && b.free > 0 ? { ...b, free: 0 } : b))
    : blocks
}
/** a walk's blocks have room and none of it holds a whole line at its pitch (statesOf's `most` 0): today's walk offered none */
function underALine(blocks: readonly { free?: unknown; pitch0?: unknown }[], s: number): boolean {
  const room = (b: { free?: unknown }) => (typeof b.free === 'number' ? b.free : 0)
  const pitch = (b: { pitch0?: unknown }) => (typeof b.pitch0 === 'number' ? b.pitch0 : 1.2 * s)
  return blocks.some((b) => room(b) > 0) && !blocks.some((b) => Math.floor(room(b) / pitch(b) + 1e-6) > 0)
}
/** a token of today's as the mark-space ruling reads it */
type SpacedToken = {
  space?: boolean
  keep?: boolean
  s?: unknown
  cls?: unknown
  st?: { fam?: unknown } | null
  face?: { id?: unknown }
}
/**
 * Today's tokens as the ruling of 2026-11-10 makes them (lane cjk-space, B.tokens: no space beside a full-width mark's blank
 * side, xeCJK's rule, whatever stands on the mark's other side; tests/unit/mark-space.test.ts): each space today set after a
 * closing mark or before an opening mark (script.ts punctOf) that is full-width, a mark of the CJK blocks or one set in the
 * target's CJK face (`cjk`, its faces' ids: rolesOf's), removed; a space after a head (`keep`) or in a monospaced run stays.
 * With how many it removed: a replay counts the ruling where it applies, and compares nothing of it against today
 */
export function markSpaced<T extends SpacedToken>(
  tokens: readonly T[],
  cjk: ReadonlySet<string>,
): { tokens: T[]; removed: number } {
  const edge = (t: T | undefined, end: boolean) => {
    if (!t || t.space || t.cls !== 'cjk' || typeof t.s !== 'string' || !t.s) return false
    const cps = [...t.s],
      ch = end ? cps.at(-1)! : cps[0]!
    return punctOf(ch) === (end ? 'close' : 'open') && (CJK.test(ch) || cjk.has(String(t.face?.id)))
  }
  const near = (q: number, step: number) => {
    for (; q >= 0 && q < tokens.length; q += step) if (!tokens[q]!.space) return tokens[q]
    return undefined
  }
  const out = tokens.filter(
    (t, q) =>
      !t.space || !!t.keep || t.st?.fam === 'mono' || !(edge(near(q - 1, -1), true) || edge(near(q + 1, 1), false)),
  )
  return { tokens: out, removed: tokens.length - out.length }
}
/**
 * Today's tokens as the second ruling of 2026-11-10 makes them (lane cjk-space, B.tokens: a mark's class, `punct`, only where it
 * is full-width): a curly quote's today gave a class where the target sets it in its Latin face (not one of `cjk`'s faces) none.
 * With how many it changed
 */
export function quotesUnmarked<T extends { s?: unknown; cls?: unknown; punct?: unknown; face?: { id?: unknown } }>(
  tokens: readonly T[],
  cjk: ReadonlySet<string>,
): { tokens: T[]; changed: number } {
  let changed = 0
  const out = tokens.map((t) => {
    if (t.cls !== 'cjk' || typeof t.s !== 'string' || !t.punct || CJK.test(t.s) || cjk.has(String(t.face?.id))) return t
    changed++
    return { ...t, punct: null }
  })
  return { tokens: out, changed }
}
const flooredOf = new Map<string, { floored: Set<number>; pages: Set<number>; units: Set<number> }>()
/**
 * What the gap ruling of 2026-11-08 (the gap under a paragraph held to its own leading alone, never the next paragraph's:
 * fill-page.ts, slots.mjs footFloorAt) changes of a pair's record: the units a pass of today's decided with the next
 * paragraph's leading over its own (`floored`: the decision's `next` above its `lead`, which today's state carried), the pages
 * of those passes (`pages`), and every unit with a line on one of them (`units`: the pass's size reads every body unit it
 * fills, and one no longer set closer may be short of its fill). A replay of a page or of a fill that differs there is the
 * ruling's
 */
export function flooredIn(pair: string): { floored: Set<number>; pages: Set<number>; units: Set<number> } {
  const got = flooredOf.get(pair)
  if (got) return got
  const L = ledger(pair)
  const pagesOf = (u: Ledger['units'][number]) =>
    ((u.slots.find((s) => s.by === 'U.admit' && s.round === 0)?.value as { pages?: number[] } | undefined)?.pages ??
      []) as number[]
  const floored = new Set<number>(),
    pages = new Set<number>()
  for (const pass of L.passes as { page: number; units: { id: number; lead?: number; next?: number | null }[] }[])
    for (const u of pass.units)
      if (typeof u.next === 'number' && typeof u.lead === 'number' && u.next > u.lead + 1e-9) {
        floored.add(u.id)
        pages.add(pass.page)
      }
  const units = new Set(L.units.filter((u) => pagesOf(u).some((p) => pages.has(p))).map((u) => u.ord))
  const out = { floored, pages, units }
  flooredOf.set(pair, out)
  return out
}

const roomUnderOf = new Map<string, { runs: Set<number>; pages: Set<number>; units: Set<number> }>()
/**
 * What the room ruling (fit/walk.ts: a room under a whole line offered too) changes of a pair's record that ruledRoom cannot
 * restate: a unit laid in runs (X.runs, its walked blocks cut at its displays) walks each run alone, so a run whose blocks' room
 * is above 0 and under a line at their pitch, where another run's holds a whole line (ruledRoom leaves the unit's room as it
 * is), was offered none of it by today's walk and is now; where that run went on past the borrow knob (its state's knob 'lead'
 * or 'shrink': it did not fit before it), its lay is the ruling's (`runs`: those units). The pages those stand on (`pages`), and
 * every unit with a line on one of them (`units`: a pass's size reads every body unit it fills). A replay of a page or of a fill
 * that differs there is the ruling's
 */
export function roomUnderIn(pair: string): { runs: Set<number>; pages: Set<number>; units: Set<number> } {
  const got = roomUnderOf.get(pair)
  if (got) return got
  const L = ledger(pair)
  type Block = { free?: number; pitch0?: number }
  const pagesOf = (u: Ledger['units'][number]) =>
    ((u.slots.find((s) => s.by === 'U.admit' && s.round === 0)?.value as { pages?: number[] } | undefined)?.pages ??
      []) as number[]
  const runs = new Set<number>(),
    pages = new Set<number>()
  for (const u of L.units)
    for (const r of u.slots.filter((s) => s.by === 'X.runs')) {
      const at = (by: string) =>
        u.slots.find((s) => s.by === by && s.round === r.round)?.value as Record<string, unknown>
      const s = (at('U.params')?.s as number | undefined) ?? 10
      const walked = ruledRoom((at('X.cut')?.walkedBlocks ?? []) as Block[], s)
      const laid = (r.value as { laidRuns?: { runs?: unknown[] } | null }).laidRuns
      for (const run of (laid?.runs ?? []) as {
        bi0: number
        blocks: number
        layout?: { state?: { knob?: string } }
      }[]) {
        const own = walked.slice(run.bi0, run.bi0 + run.blocks)
        const knob = run.layout?.state?.knob
        if (underALine(own, s) && (knob === 'lead' || knob === 'shrink')) {
          runs.add(u.ord)
          for (const p of pagesOf(u)) pages.add(p)
        }
      }
    }
  const units = new Set(L.units.filter((u) => pagesOf(u).some((p) => pages.has(p))).map((u) => u.ord))
  const out = { runs, pages, units }
  roomUnderOf.set(pair, out)
  return out
}

/** a capture of the tap, as its sample file holds it */
export type Capture = { rule: string; round: number; value: unknown }
export type Entry = {
  pair: string
  ord: number
  id: string | null
  kind: string | null
  /** the ledger's rounds of the unit (a round given up on NeedPixels left out) */
  rounds?: { round: number; kind: string }[]
  branches: string[]
  captures: Capture[]
  slots: { step: string; by: string; round: number; value: unknown }[]
}
export type Sample = { rule: string; branches: Record<string, { count: number; sample: unknown[] }>; entries: Entry[] }

export const sample = (rule: string): Sample => readGz(join(TAP, 'samples', `${rule}.json.gz`)) as Sample
export const derived = <T>(name: string): T => readGz(join(DERIVED, `${name}.json.gz`)) as T

/** a pair's ledger (TAP.md §5): every unit's slots of every round, the fill passes, the table groups */
export type Ledger = {
  pair: string
  target: string
  info: Record<string, unknown>
  units: { ord: number; id: string | null; kind: string | null; slots: Entry['slots'] }[]
  passes: unknown[]
}
const ledgers = new Map<string, Ledger>()
export const ledger = (pair: string): Ledger => {
  const l = ledgers.get(pair) ?? (readGz(join(TAP, 'ledgers', `${pair}.ledger.json.gz`)) as Ledger)
  ledgers.set(pair, l)
  return l
}
/**
 * The ledger's round of a capture's round. A sample entry's captures are numbered by pass 2's own lays, a round given up on
 * NeedPixels among them; the ledger leaves those out and numbers the rest again (TAP.md §2, its NOTES.md: the entry's
 * `rounds`). Where the two counts agree a round is its own; where the ledger holds one round it is the last lay's, and an
 * earlier capture's round was given up (null); otherwise the round cannot be told (undefined)
 */
export function ledgerRound(e: Entry, round: number): number | null | undefined {
  const raw = [...new Set(e.captures.map((c) => c.round))].sort((a, b) => a - b)
  const n = e.rounds?.length ?? raw.length
  if (raw.length === n) return round
  if (n === 1) return round === raw.at(-1) ? 1 : null
  return undefined
}
/** a unit's slot of one rule in one round, from its pair's ledger; undefined where it has none */
export const slotOf = (pair: string, ord: number, round: number, by: string): unknown =>
  ledger(pair)
    .units.find((u) => u.ord === ord)
    ?.slots.find((s) => s.by === by && s.round === round)?.value

/** a pair's page characters as the run read them (pageChars2), by page: a capture's `chars` names the pages it read */
const pages = new Map<string, Record<string, unknown[]>>()
export const pagesOf = (pair: string): Record<string, unknown[]> => {
  const p =
    pages.get(pair) ??
    (readGz(join(TAP, 'samples', 'pages', `${pair}.pages.json.gz`)) as { pages: Record<string, unknown[]> }).pages
  pages.set(pair, p)
  return p
}

/** the rules whose sample files capture a unit's reading (U.elements:in and :out) */
export const READING_RULES = ['U.breaks', 'U.elements', 'U.label', 'U.marks', 'U.rename', 'B.tokens'] as const
/** every sampled round that holds a reading, once (by pair|ord|round), from every rule's sample file that captures one */
export function readings(): { key: string; e: Entry; round: number; rule: string; c: Record<string, unknown> }[] {
  const seen = new Set<string>()
  const out: ReturnType<typeof readings> = []
  for (const rule of READING_RULES)
    for (const e of sample(rule).entries)
      for (const [round, c] of roundsOf(e)) {
        const key = `${e.pair}|${e.ord}|${round}`
        if (!c['U.elements:in'] || !c['U.elements:out'] || seen.has(key)) continue
        seen.add(key)
        out.push({ key, e, round, rule, c })
      }
  return out
}

/** an entry's captures by round, each rule's value decoded (unser) */
export function roundsOf(e: Entry): Map<number, Record<string, unknown>> {
  const m = new Map<number, Record<string, unknown>>()
  for (const c of e.captures) {
    const r = m.get(c.round) ?? {}
    m.set(c.round, r)
    r[c.rule] = unser(c.value)
  }
  return m
}

type Node = Record<string, unknown>
const isNode = (v: unknown): v is Node => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * A capture decoded (the tap's tools/samples.mjs unser, ported): {$u} undefined, {$num} a non-finite number, {$fn} a
 * function's name, {$ta} a typed array, {$arr} an array with own props, {$map}/{$set} with {$props}, {$id} an object others
 * name by {$ref}, {$hidden} its non-enumerable own props
 */
export function unser(x: unknown): unknown {
  const byId = new Map<unknown, unknown>()
  const shellOf = (v: Node): unknown =>
    '$arr' in v || '$ta' in v ? [] : '$map' in v ? new Map() : '$set' in v ? new Set() : {}
  const index = (v: unknown): void => {
    if (v === null || typeof v !== 'object') return
    if (Array.isArray(v)) {
      for (const e of v) index(e)
      return
    }
    const n = v as Node
    if ('$id' in n) byId.set(n.$id, shellOf(n))
    for (const e of Object.values(n)) index(e)
  }
  index(x)
  const props = (o: object, v: Node) => {
    for (const [k, e] of Object.entries((v.$props as Node | undefined) ?? {})) (o as Node)[k] = go(e)
    for (const [k, e] of Object.entries((v.$hidden as Node | undefined) ?? {}))
      Object.defineProperty(o, k, { value: go(e), writable: true, configurable: true, enumerable: false })
  }
  const go = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v
    if (Array.isArray(v)) return v.map(go)
    const n = v as Node
    if ('$ref' in n) return byId.get(n.$ref)
    if ('$u' in n) return undefined
    if ('$num' in n) return Number(n.$num)
    if ('$fn' in n) return { fn: n.$fn }
    if ('$big' in n) return BigInt(n.$big as string)
    const o = '$id' in n ? byId.get(n.$id) : shellOf(n)
    if ('$ta' in n) {
      for (const e of n.v as unknown[]) (o as unknown[]).push(go(e))
      return o
    }
    if ('$arr' in n) {
      for (const e of n.$arr as unknown[]) (o as unknown[]).push(go(e))
      props(o as object, n)
      return o
    }
    if ('$map' in n) {
      for (const [k, e] of n.$map as [unknown, unknown][]) (o as Map<unknown, unknown>).set(go(k), go(e))
      props(o as object, n)
      return o
    }
    if ('$set' in n) {
      for (const e of n.$set as unknown[]) (o as Set<unknown>).add(go(e))
      props(o as object, n)
      return o
    }
    for (const [k, e] of Object.entries(n)) if (k !== '$id' && k !== '$hidden') (o as Node)[k] = go(e)
    props(o as object, { $hidden: n.$hidden })
    return o
  }
  return go(x)
}

/**
 * The first difference between two values, as a path and the two sides, or null where they are equal: Maps by their
 * entries in order (and their own props), Sets by their members in order, objects by their own enumerable keys in any
 * order with a key holding undefined taken as absent, numbers by ===, with NaN equal to NaN. A function, or a capture's
 * stand-in for one ({fn}), equals any other
 */
export function firstDifference(a: unknown, b: unknown, path = ''): string | null {
  const fnLike = (v: unknown) => typeof v === 'function' || (isNode(v) && Object.keys(v).length === 1 && 'fn' in v)
  if (fnLike(a) && fnLike(b)) return null
  if (typeof a === 'number' && typeof b === 'number')
    return a === b || (Number.isNaN(a) && Number.isNaN(b)) ? null : at(path, a, b)
  if (a === b) return null
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map)) return at(path, kind(a), kind(b))
    if (a.size !== b.size) return at(`${path}.size`, a.size, b.size)
    const ea = [...a],
      eb = [...b]
    for (let i = 0; i < ea.length; i++) {
      const d =
        firstDifference(ea[i]![0], eb[i]![0], `${path}<key ${i}>`) ??
        firstDifference(ea[i]![1], eb[i]![1], `${path}<${String(ea[i]![0])}>`)
      if (d) return d
    }
    return firstDifference({ ...a }, { ...b }, `${path}<props>`)
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set)) return at(path, kind(a), kind(b))
    return firstDifference([...a], [...b], `${path}<set>`)
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!(Array.isArray(a) && Array.isArray(b))) return at(path, kind(a), kind(b))
    if (a.length !== b.length) return at(`${path}.length`, a.length, b.length)
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`)
      if (d) return d
    }
    return null
  }
  if (isNode(a) && isNode(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      const d = firstDifference(a[k], b[k], `${path}.${k}`)
      if (d) return d
    }
    return null
  }
  return at(path, a, b)
}
const kind = (v: unknown) =>
  v instanceof Map ? 'Map' : v instanceof Set ? 'Set' : Array.isArray(v) ? 'Array' : typeof v
const at = (path: string, a: unknown, b: unknown) =>
  `${path || '(root)'}: ${JSON.stringify(a)?.slice(0, 200)} against ${JSON.stringify(b)?.slice(0, 200)}`
