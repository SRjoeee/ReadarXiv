// The stored plan of an instrument (DESIGN §16, "The prepare's two halves"): what a prepare stores beside B and its log so
// that a later prepare of the same original makes the same instrument without TeX (the plan: the marked compile's options as
// it kept them, the job's .bbl as base64, the facts of the original it was made for), how it is read back (planOf), and the
// paper as the front half opens it, again with the .bbl (opened, withBbl). A module of its own, so that a host that keys the
// stored instrument by the code its compile side runs can name the plan's codec without the front half's readers of what is
// stored (front.ts prepareFront: instrumentOf, the units first).
import type { FailureReason } from '@readarxiv/format'
import { toBase64Url } from '@readarxiv/format'
import { openPaper, type Paper } from './front.types.ts'
import { isMemoryError } from './memory.ts'

/** what arXiv's PDF says that the front half reads: its page count, its day (seconds since the epoch: compile/base.mjs
 *  creationEpochOf), the TeX Live year its pdfTeX banner names (compile/guard.mjs texLiveOfPdf) */
export interface OriginalFacts {
  pages: number
  day: number | null
  banner: string | null
}

/** the instrument's four objects, in the order a prepare hands them out: B, its log, the plan (what the instrument is made of
 *  beside them) and the definitions */
export const INSTRUMENT_OBJECTS = ['b.pdf', 'log', 'plan', 'definitions'] as const
/** the instrument's four objects as a prepare makes them, and as a later prepare of the paper is given them back */
export type StoredInstrument = Record<(typeof INSTRUMENT_OBJECTS)[number], Uint8Array>

/** the paper's own reasons a prepare ends with (the server's words, `@readarxiv/format`'s FAILURE_REASONS) */
export type PrepareWhy = Extract<FailureReason, 'no-source' | 'too-large' | 'corrupt' | 'no-main' | 'cannot-typeset'>

/** a paper the front half refuses, thrown where the front end cannot read it */
export class FrontRefusal extends Error {
  readonly why: PrepareWhy
  constructor(why: PrepareWhy, message: string) {
    super(message)
    this.why = why
  }
}

/** a failure's message as a refusal's detail holds it (its first 300 characters) */
export const short = (e: unknown): string =>
  String((typeof e === 'object' && e !== null && 'message' in e ? e.message : undefined) ?? e).slice(0, 300)

const UTF8 = new TextEncoder()
const FROM_UTF8 = new TextDecoder()

/** bytes as base64, padded (what the plan stores a .bbl as) */
const toBase64 = (b: Uint8Array): string => {
  const s = toBase64Url(b).replaceAll('-', '+').replaceAll('_', '/')
  return s + '='.repeat((4 - (s.length % 4)) % 4)
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** base64's bytes; null where the text is not base64 */
const fromBase64 = (s: string): Uint8Array | null => {
  const body = s.replace(/={0,2}$/, '')
  if (body.length % 4 === 1 || !/^[A-Za-z0-9+/]*$/.test(body)) return null
  const out = new Uint8Array(Math.floor((body.length * 3) / 4))
  let o = 0
  for (let i = 0; i < body.length; i += 4) {
    const q = [0, 1, 2, 3].map((j) => B64.indexOf(body[i + j] ?? 'A'))
    const v = ((q[0] ?? 0) << 18) | ((q[1] ?? 0) << 12) | ((q[2] ?? 0) << 6) | (q[3] ?? 0)
    for (const [k, shift] of [
      [1, 16],
      [2, 8],
      [3, 0],
    ] as const)
      if (i + k < body.length) out[o++] = (v >> shift) & 255
  }
  return out
}

/** a value of the marked compile's options as the plan keeps it: a Map or a Set by its entries, anything else as its JSON */
type Kept = { map: [unknown, unknown][] } | { set: unknown[] } | { json: unknown } | null
const entries = (m: ReadonlyMap<unknown, unknown>): [unknown, unknown][] => [...m]
const members = (s: ReadonlySet<unknown>): unknown[] => [...s]
const keep = (v: unknown): Kept =>
  v === null || v === undefined
    ? null
    : v instanceof Map
      ? { map: entries(v) }
      : v instanceof Set
        ? { set: members(v) }
        : { json: v }
const unkeep = (k: Kept): unknown =>
  k === null ? null : 'map' in k ? new Map(k.map) : 'set' in k ? new Set(k.set) : k.json
/** a kept value as its JSON is read back, where it is one */
const keptOf = (x: unknown): Kept | undefined => {
  if (x === null) return null
  if (typeof x !== 'object') return undefined
  if ('map' in x)
    return Array.isArray(x.map) && x.map.every((e) => Array.isArray(e) && e.length === 2) ? { map: x.map } : undefined
  if ('set' in x) return Array.isArray(x.set) ? { set: x.set } : undefined
  return 'json' in x ? { json: x.json } : undefined
}
/** a kept value whose JSON reads back as the value: else the plan is not kept (a later prepare compiles again) */
const keeps = (v: unknown): Kept | undefined => {
  const k = keep(v)
  const shape = (x: unknown): unknown =>
    x instanceof Map ? { map: entries(x) } : x instanceof Set ? { set: members(x) } : x
  try {
    const back = keptOf(JSON.parse(JSON.stringify(k)))
    return back !== undefined && JSON.stringify(shape(unkeep(back))) === JSON.stringify(shape(v ?? null))
      ? k
      : undefined
  } catch {
    return undefined
  }
}

/** the plan: what the instrument is made of beside B and its log (the marked compile's options instrumentOf reads, as
 *  markedOfPaper made them: the probe's texts and inkless, TeX's \lineskip and \lineskiplimit as the mark probe's log stated
 *  them, which the marked compile's log does not hold, and the texts TeX set beside a decoration of their own; the job's .bbl
 *  the paper was opened with) and the facts of the original it was made for, so that a later prepare of the same original
 *  makes the same instrument without TeX. `lineskip` or `decorated` absent: the options had none */
interface Plan {
  front: 'today'
  v: 1
  texts: Kept
  inkless: Kept
  lineskip?: Kept
  decorated?: Kept
  /** the .bbl's bytes as base64 */
  bbl: { path: string; bytes: string } | null
  facts: OriginalFacts
}
/** the instrument's four objects as a prepare stores them, of what the marked compile gave (B, its log, the options instrumentOf
 *  reads), the job's .bbl the paper was opened with and the facts of the original it was compiled for: B as it is, the log and
 *  the plan as UTF-8 (the plan's JSON in this order of its keys), the definitions; null where the options do not read back as
 *  they are, so that no plan is stored that would not make the same instrument */
const storedInstrumentOf = ({
  finalPdf,
  log,
  options,
  bbl,
  facts: f,
}: {
  finalPdf: Uint8Array
  log: string
  options: Record<string, unknown>
  bbl: { path: string; bytes: Uint8Array } | null
  facts: OriginalFacts
}): StoredInstrument | null => {
  const texts = keeps(options.texts)
  const inkless = keeps(options.inkless)
  const lineskip = keeps(options.lineskip)
  const decorated = keeps(options.decorated)
  if (texts !== undefined && inkless !== undefined && lineskip !== undefined && decorated !== undefined) {
    const p: Plan = {
      front: 'today',
      v: 1,
      texts,
      inkless,
      ...(lineskip ? { lineskip } : {}),
      ...(decorated ? { decorated } : {}),
      bbl: bbl ? { path: bbl.path, bytes: toBase64(bbl.bytes) } : null,
      facts: { pages: f.pages, day: f.day, banner: f.banner },
    }
    return {
      'b.pdf': finalPdf,
      log: UTF8.encode(log),
      plan: UTF8.encode(JSON.stringify(p)),
      definitions: UTF8.encode('{"front":"today","definitions":null}'),
    }
  }
  return null
}
/** a plan as it is read: its .bbl's bytes decoded */
type ReadPlan = Omit<Plan, 'bbl'> & { bbl: { path: string; bytes: Uint8Array } | null }
/** the plan of the stored objects, where they hold one */
const planOf = (stored: StoredInstrument): ReadPlan | null => {
  let p: unknown
  try {
    p = JSON.parse(FROM_UTF8.decode(stored.plan))
  } catch {
    return null
  }
  if (typeof p !== 'object' || p === null || !('front' in p) || p.front !== 'today' || !('v' in p) || p.v !== 1)
    return null
  if (!('texts' in p) || !('inkless' in p) || !('facts' in p) || !('bbl' in p)) return null
  const texts = keptOf(p.texts)
  const inkless = keptOf(p.inkless)
  const lineskip = 'lineskip' in p ? keptOf(p.lineskip) : null
  const decorated = 'decorated' in p ? keptOf(p.decorated) : null
  if (texts === undefined || inkless === undefined || lineskip === undefined || decorated === undefined) return null
  const f = p.facts
  if (typeof f !== 'object' || f === null || !('pages' in f) || !('day' in f) || !('banner' in f)) return null
  const { pages, day, banner } = f
  if (typeof pages !== 'number' || !(day === null || typeof day === 'number')) return null
  if (!(banner === null || typeof banner === 'string')) return null
  const b = p.bbl
  let bbl: ReadPlan['bbl'] = null
  if (b !== null) {
    if (typeof b !== 'object' || !('path' in b) || !('bytes' in b)) return null
    if (typeof b.path !== 'string' || typeof b.bytes !== 'string') return null
    const bytes = fromBase64(b.bytes)
    if (!bytes) return null
    bbl = { path: b.path, bytes }
  }
  return {
    front: 'today',
    v: 1,
    texts,
    inkless,
    ...(lineskip ? { lineskip } : {}),
    ...(decorated ? { decorated } : {}),
    bbl,
    facts: { pages, day, banner },
  }
}

/** the paper opened (compile/live.mjs openPaper), its failures the front end's */
function opened(files: Map<string, Uint8Array>): Paper {
  try {
    return openPaper(files)
  } catch (e) {
    if (isMemoryError(e))
      throw new FrontRefusal('too-large', `an allocation failed opening the paper: ${short(e).slice(0, 200)}`)
    if (/no main file/.test(short(e))) throw new FrontRefusal('no-main', 'the package has no main TeX file')
    throw new FrontRefusal('cannot-typeset', `the front end could not read the paper: ${short(e).slice(0, 200)}`)
  }
}
/** the paper opened again with the job's .bbl (compile/paper.mjs madeBibliography's own reopening, its compiler kept) */
function withBbl(paper: Paper, bbl: { path: string; bytes: Uint8Array }): Paper {
  const files = new Map<string, Uint8Array>()
  for (const p of paper.fsys.list()) {
    const b = paper.fsys.read(p)
    if (b) files.set(p, b)
  }
  files.set(bbl.path, bbl.bytes)
  const again = openPaper(files)
  const meta = paper.meta
  Object.assign(again.meta, {
    compiler: meta.compiler,
    compilerGuessed: meta.compilerGuessed,
    ...(meta.compilerFrom ? { compilerFrom: meta.compilerFrom } : {}),
  })
  return again
}

export { FROM_UTF8, type Kept, keeps, opened, type Plan, planOf, type ReadPlan, storedInstrumentOf, unkeep, withBbl }
