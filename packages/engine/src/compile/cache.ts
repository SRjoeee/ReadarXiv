// The instrument's cache (design §4.3 "The instrument is cached"; contract stage 1b, deliverable 4): what the TeX runs of a
// paper's prepare made — the definitions the unmarked first pass wrote and the files it made for the reader (a job's .bbl),
// the probe's answers (asked in that first pass), the plan, and the marked compile's draft PDF and last log — stored under the
// digest of what decides them: the source as received, the marks code (MARKS_CODE: the reader and the marks writer), the
// tree (its image), the compiler, the date the compiles run under and the compile plan's name. A new engine build that
// does not change the marks runs only the JavaScript stages on the stored B; a try that dies after the compile resumes
// from it. The store itself is the host's (a directory in the lab, a bucket on the box): it keeps bytes by key.
import { sha256Hex, utf8 } from '@readarxiv/format'
import type { Plan } from '../marks/mark.ts'
import { MARKS_CODE } from './marks-code.ts'

export const INSTRUMENT_FORMAT = 'readarxiv-instrument 1'

/** what the instrument's TeX runs are a function of */
export interface InstrumentInputs {
  /** the paper's files as received, and its main file */
  files: ReadonlyMap<string, Uint8Array>
  main: string
  /** the tree it is compiled on: the image's pinned name */
  tree: string
  compiler: string
  /** SOURCE_DATE_EPOCH of every compile (arXiv's PDF's date), null where none */
  sourceDate?: number | null
  /** the compile plan, by name and options (drafts only, the recovery's step) */
  steps: string
  /** the marks code; MARKS_CODE unless a test names another */
  marks?: string
}

/** JSON with every object's keys sorted and a Map as its sorted entries: one text for one value */
export function canonical(v: unknown): string {
  if (v instanceof Map)
    return canonical(
      Object.fromEntries(
        [...v].map(([k, x]) => [String(k), x] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
    )
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',')}]`
  if (v && typeof v === 'object') {
    const keys = Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

/** the cache key of a paper's instrument: SHA-256 (hex) over the inputs, each file by its path and its bytes' digest */
export function instrumentKey(i: InstrumentInputs): string {
  const files = [...i.files]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([p, b]) => [p, sha256Hex(b)] as const)
  return sha256Hex(
    utf8(
      canonical({
        format: INSTRUMENT_FORMAT,
        marks: i.marks ?? MARKS_CODE,
        tree: i.tree,
        compiler: i.compiler,
        sourceDate: i.sourceDate ?? null,
        steps: i.steps,
        main: i.main,
        files,
      }),
    ),
  )
}

/** one compile the plan ran: its step, whether it was the store's, its TeX passes and milliseconds where known */
export interface CompileRun {
  step: string
  ms?: number
  passes?: number
  ok: boolean
  /** why it failed, the units it left unmarked, its errors the unmarked pass has not (the recovery's steps) */
  why?: string
  unmarked?: number
  errors?: number
}
/** what the store keeps of a paper's instrument */
export interface StoredInstrument {
  key: string
  /** the definitions dump of the unmarked first pass (readarxiv-definitions) */
  definitions: string
  /** the files that pass made for the source reader (path, bytes): the job's .bbl where the package ships none */
  made: [string, Uint8Array][]
  /** the probe's answers the placement took, as the first pass's log states them (JSON-able), null where none: a function of
   *  the key's inputs (the source, the tree, the marks code that writes the probe), never one of them */
  answers: unknown
  plan: Plan
  /** the marked compile's PDF (B: the draft) and its last TeX pass's log, as TeX wrote it (bytes read as Latin-1) */
  pdf: Uint8Array
  log: string
  compiles: CompileRun[]
}

const MAGIC = utf8(`${INSTRUMENT_FORMAT}\n`)

/** the stored form: the format's line, a JSON header's length (12 decimal digits) and the header, then the byte fields */
export function encodeStored(s: StoredInstrument): Uint8Array {
  const blobs = [s.pdf, ...s.made.map(([, b]) => b)]
  const header = utf8(
    JSON.stringify({
      key: s.key,
      definitions: s.definitions,
      made: s.made.map(([p, b]) => [p, b.length]),
      answers: s.answers ?? null,
      plan: s.plan,
      pdf: s.pdf.length,
      log: s.log,
      compiles: s.compiles,
    }),
  )
  const size = utf8(String(header.length).padStart(12, '0'))
  let n = MAGIC.length + size.length + header.length
  for (const b of blobs) n += b.length
  const out = new Uint8Array(n)
  let at = 0
  for (const part of [MAGIC, size, header, ...blobs]) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** the stored form read back; throws where it is not one, or not the key asked */
export function decodeStored(bytes: Uint8Array, key?: string): StoredInstrument {
  for (let j = 0; j < MAGIC.length; j++)
    if (bytes[j] !== MAGIC[j]) throw new Error('not a stored instrument of this format')
  const dec = new TextDecoder('utf-8', { fatal: true })
  let at = MAGIC.length
  const size = Number(dec.decode(bytes.subarray(at, at + 12)))
  at += 12
  const h = JSON.parse(dec.decode(bytes.subarray(at, at + size))) as Omit<StoredInstrument, 'pdf' | 'made'> & {
    pdf: number
    made: [string, number][]
  }
  at += size
  if (key !== undefined && h.key !== key) throw new Error('a stored instrument of another key')
  const pdf = bytes.slice(at, at + h.pdf)
  at += h.pdf
  const made: [string, Uint8Array][] = h.made.map(([p, n]) => {
    const b = bytes.slice(at, at + n)
    at += n
    return [p, b]
  })
  if (at !== bytes.length) throw new Error('a stored instrument cut short or overlong')
  return {
    key: h.key,
    definitions: h.definitions,
    made,
    answers: h.answers ?? null,
    plan: h.plan,
    pdf,
    log: h.log,
    compiles: h.compiles,
  }
}
