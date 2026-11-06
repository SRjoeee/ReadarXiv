// The replay's access to the tap (baseline/tap/TAP.md §6): today's reader's recorded inputs and outputs of each rule, kept in
// lab-data and never committed (they hold licensed papers' text). A replay test reads them by path and is skipped where the
// path is absent (hosted CI, a fresh clone): AXT_LAB_DATA names the lab-data directory, else the maintainer's.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

export const LAB = process.env.AXT_LAB_DATA ?? '/Users/cheongzhiyan/Developer/readarxiv-lab-data'
export const TAP = join(LAB, 'refactor-2026-11', 'baseline', 'tap')
/** the inputs lane L3's lab tools derive from the tap with today's own code (lab/typeset/), beside the tap */
export const DERIVED = join(LAB, 'refactor-2026-11', 'lanes', 'L3', 'replay')
export const hasTap = existsSync(join(TAP, 'samples'))
export const hasDerived = (name: string) => existsSync(join(DERIVED, `${name}.json.gz`))

export const readGz = (file: string): unknown => JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'))

/** a capture of the tap, as its sample file holds it */
export type Capture = { rule: string; round: number; value: unknown }
export type Entry = {
  pair: string
  ord: number
  id: string | null
  kind: string | null
  branches: string[]
  captures: Capture[]
  slots: { step: string; by: string; round: number; value: unknown }[]
}
export type Sample = { rule: string; branches: Record<string, { count: number; sample: unknown[] }>; entries: Entry[] }

export const sample = (rule: string): Sample => readGz(join(TAP, 'samples', `${rule}.json.gz`)) as Sample
export const derived = <T>(name: string): T => readGz(join(DERIVED, `${name}.json.gz`)) as T

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
