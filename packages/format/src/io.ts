// Reading and writing the bundle's objects. Every object is canonical JSON in UTF-8 (keys sorted, no spacing, -0 written 0),
// named by the SHA-256 of its bytes. A reader checks, in this order and before anything is parsed: the digest (where it is
// given), the size bound of its kind, then the count of values and the depth of nesting; then JSON.parse, then the schema.
// Where trust changes this is the check: the box's service reading its child's objects, and the browser reading the bundle's
// head, parts and units (packages/reader/src/reader.ts, each `read` with its digest). A target's Rows objects our server serves
// are not read here: the browser holds each to its length and digest (packages/reader/src/session/client.ts `object`) and
// parses it with JSON.parse (packages/reader/src/reader.ts, where it reads the server's rows).
import type { z } from 'zod'
import { fromUtf8, sha256Hex, utf8 } from './bytes.ts'
import { Head, Part, Row, Rows, Units } from './schema.ts'

export const SCHEMAS = { head: Head, units: Units, part: Part, row: Row, rows: Rows } as const
export type ObjKind = keyof typeof SCHEMAS
export type Obj<K extends ObjKind> = z.infer<(typeof SCHEMAS)[K]>

/** each kind's bounds: bytes, JSON values (every string, number, literal, array and object counted) and nesting depth */
export const BOUNDS: Readonly<Record<ObjKind, { bytes: number; values: number; depth: number }>> = Object.freeze({
  head: { bytes: 64 * 1024, values: 16 * 1024, depth: 8 },
  units: { bytes: 1024 * 1024, values: 256 * 1024, depth: 48 },
  part: { bytes: 4 * 1024 * 1024, values: 1024 * 1024, depth: 16 },
  row: { bytes: 256 * 1024, values: 32 * 1024, depth: 48 },
  // (a paper's rows for a target: its every unit's row, the largest paper's some 2 MB of text)
  rows: { bytes: 16 * 1024 * 1024, values: 4 * 1024 * 1024, depth: 48 },
})

/** why an object was refused: its kind, and what failed (digest, bounds, json, schema) */
export class FormatError extends Error {
  readonly kind: string
  readonly why: 'digest' | 'bounds' | 'json' | 'schema' | 'value'
  constructor(kind: string, why: FormatError['why'], message: string) {
    super(`${kind}: ${message}`)
    this.name = 'FormatError'
    this.kind = kind
    this.why = why
  }
}

/** the values and the deepest nesting of a JSON text, counted over its bytes without parsing it (strings skipped whole);
 *  stops counting past the bounds */
export function shapeOf(b: Uint8Array, bound: { values: number; depth: number }): { values: number; depth: number } {
  let values = 0
  let depth = 0
  let deepest = 0
  let i = 0
  const n = b.length
  while (i < n && values <= bound.values && deepest <= bound.depth) {
    const c = b[i] as number
    if (c === 0x22) {
      values++
      i++
      while (i < n && b[i] !== 0x22) i += b[i] === 0x5c ? 2 : 1
      i++
    } else if (c === 0x7b || c === 0x5b) {
      values++
      depth++
      if (depth > deepest) deepest = depth
      i++
    } else if (c === 0x7d || c === 0x5d) {
      depth--
      i++
    } else if (c === 0x2d || (c >= 0x30 && c <= 0x39) || c === 0x74 || c === 0x66 || c === 0x6e) {
      values++
      i++
      while (i < n) {
        const d = b[i] as number
        if (
          d === 0x2c ||
          d === 0x7d ||
          d === 0x5d ||
          d === 0x3a ||
          d === 0x20 ||
          d === 0x0a ||
          d === 0x0d ||
          d === 0x09
        )
          break
        i++
      }
    } else i++
  }
  return { values, depth: deepest }
}

/** read an object of a kind: its digest (where given), its bounds, its JSON, its schema. Throws a FormatError */
export function read<K extends ObjKind>(kind: K, bytes: Uint8Array, digest?: string): Obj<K> {
  if (digest !== undefined && sha256Hex(bytes) !== digest)
    throw new FormatError(kind, 'digest', 'its bytes are not its digest')
  const bound = BOUNDS[kind]
  if (bytes.length > bound.bytes) throw new FormatError(kind, 'bounds', `${bytes.length} bytes, past ${bound.bytes}`)
  const shape = shapeOf(bytes, bound)
  if (shape.values > bound.values) throw new FormatError(kind, 'bounds', `more than ${bound.values} values`)
  if (shape.depth > bound.depth) throw new FormatError(kind, 'bounds', `nested deeper than ${bound.depth}`)
  const text = fromUtf8(bytes)
  if (text === null) throw new FormatError(kind, 'json', 'not UTF-8')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    throw new FormatError(kind, 'json', e instanceof Error ? e.message : String(e))
  }
  const parsed = SCHEMAS[kind].safeParse(value)
  if (!parsed.success)
    throw new FormatError(
      kind,
      'schema',
      parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    )
  return parsed.data as Obj<K>
}

/** a value as canonical JSON: object keys sorted by code unit, no spacing, -0 written 0, undefined members left out;
 *  throws for a number that is not finite and for anything JSON cannot hold */
export function canonical(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(value)) throw new FormatError('value', 'value', `a number that is not finite (${value})`)
      return Object.is(value, -0) ? '0' : JSON.stringify(value)
    case 'string':
      return JSON.stringify(value)
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonical(v))).join(',')}]`
      const o = value as Record<string, unknown>
      const keys = Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
    }
    default:
      throw new FormatError('value', 'value', `a ${typeof value} in an object`)
  }
}

/** write an object of a kind: checked by its schema and its bounds first (what write gives, read takes), as canonical bytes,
 *  and their digest */
export function write<K extends ObjKind>(kind: K, value: Obj<K>): { bytes: Uint8Array; digest: string } {
  const parsed = SCHEMAS[kind].safeParse(value)
  if (!parsed.success)
    throw new FormatError(
      kind,
      'schema',
      parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    )
  // (what the schema read: a field it does not know is not written)
  const bytes = utf8(canonical(parsed.data))
  const bound = BOUNDS[kind]
  if (bytes.length > bound.bytes) throw new FormatError(kind, 'bounds', `${bytes.length} bytes, past ${bound.bytes}`)
  const shape = shapeOf(bytes, bound)
  if (shape.values > bound.values || shape.depth > bound.depth)
    throw new FormatError(kind, 'bounds', `${shape.values} values, depth ${shape.depth}`)
  return { bytes, digest: sha256Hex(bytes) }
}
