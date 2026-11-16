// The records of the equivalence check (equivalence.ts): the capture of today's tests (capture-setup.ts: each reply today's
// readers judged, with today's verdict), then the web repository's reading table quoted; and today's typing of each, written
// once by today-typed.ts while today's engine runs and read by equivalence.ts in its place (amendment 8.3 of the refactor's
// design: today's answers frozen before the cut-over deletes today's engine).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { UnitIn } from '../../packages/translate/src/index.ts'

export type TexPiece = { t: string; s?: string; src?: string; id?: number; sets?: number }
export type Rec = { src: 'pdf' | 'html' | 'web'; format: 'markers' | 'tags'; wire: string; reply: string; today: boolean; reason?: string | null; kind?: string | null; pieces?: TexPiece[]; test?: string | null; file?: string | null }

/** the web repository's reading table (readarxiv-web worker/tests/mt.test.ts, "an answer the reading takes": mt.mjs readsBack
 *  over each wire, the Workflow's accepts), its wires typed as the HTML page's are: its engine is not run here (the web
 *  worktree's submodule is not checked out), so its verdicts are quoted */
const WEB: [string, string, boolean][] = [
  ['@a# x @b#', 'y @b# z @a#', true],
  ['@a# x @b#', 'y @a# z', false],
  ['@a# x', '@a# @a# y', false],
  ['@a# x', '@a# @c# y', false],
  ['mail @@ host @a#', 'courriel @@ hôte @a#', true],
  ['text', '', false],
  ['The model @a# reads.', '\u6a21\u578b@a\u8bfb\u3002', true],
  ['@@@a# x', 'y @@@a#', true],
  ['mail @@ host @a#', 'mail @@@@ host @a#', true],
  ['mail @@ host @a#', 'mail @@ host', false],
]

/** every record the check reads, in order: the capture's lines, then the web's table */
export function recordsOf(capture: string): Rec[] {
  return [
    ...readFileSync(capture, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Rec),
    ...WEB.map(([wire, reply, today]): Rec => ({ src: 'web', format: 'markers', wire, reply, today, file: 'readarxiv-web worker/tests/mt.test.ts', test: 'the reading table' })),
  ]
}

/** a record's identity: two records of one key are compared once, the first */
export const keyOf = (r: Rec): string => JSON.stringify([r.src, r.format, r.pieces ?? r.wire, r.reply])

const sha256 = (b: string | Uint8Array): string => createHash('sha256').update(b).digest('hex')

/** today's typing of a record: the unit as the translate package's adapters are handed it, the notes on what the typing could
 *  not carry over, the HTML wire's ids in order; or `skip`, a PDF unit today's wire never sends (its back-reference list) */
export type Typed = { skip: true } | { unit: UnitIn; notes: string[]; order?: number[] }
export const TYPED_FORMAT = 'readarxiv-equivalence-today 1'
export type TodayTyped = { format: string; capture: string; typed: [string, Typed][] }

/** the frozen typing as written: each distinct record's by the SHA-256 of its key, in the records' order, and the SHA-256 of
 *  the capture it was made over */
export function typedFile(capture: string, typed: [string, Typed][]): TodayTyped {
  return { format: TYPED_FORMAT, capture: sha256(readFileSync(capture)), typed: typed.map(([key, t]) => [sha256(key), t]) }
}

/** the frozen typing read for a capture, by key: throws where it is of another format or was made over another capture */
export function typedOf(file: string, capture: string): (r: Rec) => Typed | undefined {
  const f = JSON.parse(readFileSync(file, 'utf8')) as TodayTyped
  if (f.format !== TYPED_FORMAT) throw new Error(`${file}: format ${f.format}, this reader reads ${TYPED_FORMAT}`)
  const digest = sha256(readFileSync(capture))
  if (f.capture !== digest) throw new Error(`${file}: today's typing of another capture (${f.capture.slice(0, 12)}; ${capture} is ${digest.slice(0, 12)})`)
  const at = new Map(f.typed)
  return r => at.get(sha256(keyOf(r)))
}
