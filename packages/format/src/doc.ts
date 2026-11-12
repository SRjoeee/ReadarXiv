// The documents our server's /api/v2 routes give a reader, version 1: the paper's document (what the paper's prepare and the
// asked target's run are, and the layer that serves), the open's ask and its answer, a refusal of the open's new work. The
// contract between the reader (both hosts) and our server, stated once: the reader parses what it receives with these, and the
// server writes them. Only what is on the wire: how the server stores a paper, keys its objects or bounds its work is its own.
//
// A reader ignores a field it does not know (zod strips it), so adding a field is free. A released reader meets a server that
// has moved on (the extension updates days after our server), so its compatibility rule is built into the reading, by one
// distinction:
//   - a word that decides what the reader DOES is closed: `v`, a prepare's `state` and a target's `state`. An unknown one makes
//     the document unreadable: such a change is a new `v`;
//   - a word that only refines what the reader is TOLD is read openly: a prepare's and a target's `why`, a prepare's `stage`,
//     the refusal's `why`. An unknown one is read as none: an unknown `why` is the generic failure (the sentence `internal` has),
//     with the record's retry time where it has one, and takes no action a known word would (no re-ask of `busy`, no time of
//     `quota`); an unknown `stage` is no stage (the progress line holds where it is). The targets' keys are read openly too.
// The server's side stays closed: it writes only its words (the sets below), and refines these where it writes them (its
// grammar of segments, epochs, chains and preparations, its targets); a reader reads no more than this states.
import { z } from 'zod'
import { Digest, FORMAT } from './schema.ts'

const int = z.number().int().nonnegative()
const time = z.number().int().nonnegative()

/** the bundle formats a reader of this package reads, as it names them to our server (`formats`, `f=`) */
export const FORMATS = [FORMAT] as const
/** why a prepare or a target's run failed, in the server's words (a reader's words for each are its own) */
export const FAILURE_REASONS = [
  'not-found',
  'no-source',
  'too-large',
  'corrupt',
  'no-main',
  'cannot-typeset',
  'translation-down',
  'deadline',
  'unavailable',
  'busy',
  'quota',
  'internal',
] as const
export type FailureReason = (typeof FAILURE_REASONS)[number]
/** a prepare's stages, in their order */
export const PREPARE_STAGES = ['fetching', 'compiling', 'units', 'laying-out', 'bundle'] as const
export type PrepareStage = (typeof PREPARE_STAGES)[number]

/** a word read openly: one of `words`, or none (null) for a word this reader does not know */
const openWord = <const W extends readonly [string, ...string[]]>(words: W) =>
  z
    .string()
    .nullable()
    .transform((w): W[number] | null =>
      w !== null && (words as readonly string[]).includes(w) ? (w as W[number]) : null,
    )

/** an immutable object: `GET /api/v2/o/<path>`, its bytes `bytes` long and their SHA-256 `sha256` */
export const Ref = z.object({ path: z.string().max(160), sha256: Digest, bytes: int })
const refs = z.array(Ref).max(64)

/** what a run is: its attempt (0 before any), its state, why it failed, no new attempt before `retryAt` (ms since the epoch on
 *  our server's clock; failed with none: none under the server's build), when its state last changed */
const run = {
  attempt: int,
  state: z.enum(['none', 'running', 'done', 'failed']),
  why: openWord(FAILURE_REASONS),
  retryAt: time.nullable(),
  at: time,
}

/**
 * The paper's document: every answer of the follow and every frame of its stream is a whole one, and a reader keeps the newest
 * (`fold`). `pv` the paper version's segment, `rev` rising with every change a reader can see (a new `epoch` starts it again
 * and wins). `prepare`: the prepare's run, the build that runs it, its stage, the units it has read so far (told as soon as the
 * source is read), and after a paper that cannot be prepared whether arXiv has an HTML version of it. `layer`: what serves (its
 * catalog, its units, its format, its build, and `stale` where another build than the server's made it), null where none
 * serves in a format the reader named. `targets`: the asked target alone, its run, the chain that translates it, the units it
 * was given, its rows so far, how many of its units are done, and the page the reader named (`view`).
 */
export const PaperDoc = z.object({
  v: z.literal(1),
  pv: z.string().max(32),
  epoch: z.string(),
  rev: int,
  paper: z.string(),
  version: int,
  prepare: z.object({
    ...run,
    build: z.string().nullable(),
    stage: openWord(PREPARE_STAGES),
    units: refs,
    html: z.boolean().nullable(),
  }),
  layer: z.object({ catalog: Ref, units: refs, format: int, build: z.string(), stale: z.boolean() }).nullable(),
  targets: z.record(
    z.string(),
    z.object({
      ...run,
      translator: z.string(),
      units: refs.nullable(),
      rows: refs,
      done: int,
      total: int,
      view: int,
    }),
  ),
})

/** the document a reader keeps of two: the one of another epoch, or of a higher revision */
export const fold = <D extends { epoch: string; rev: number }>(held: D | null, d: D): D =>
  !held || d.epoch !== held.epoch || d.rev > held.rev ? d : held

/** `POST /api/v2/open`: the paper, its version (none: the latest), the target (none where the reader makes its rows), the
 *  formats it reads, the page it reads */
export const OpenAsk = z.object({
  paper: z.string().max(40),
  version: z.number().int().positive().optional(),
  target: z.string().nullable(),
  formats: z.array(int).min(1).max(8),
  view: int.optional(),
})
/** a refusal of the open's new work, the visitor's quota or our server's capacity: the instant it ends (`retryAt`, on our
 *  server's clock: a quota's period's end exactly, the time a reader says), that instant's distance from the answer to the
 *  millisecond (`retryAfterMs`, what a reader counts on its own clock) and in whole seconds rounded up (`retryAfterS`) */
export const OpenRefused = z.object({
  why: openWord(['quota', 'busy']),
  retryAt: time,
  retryAfterMs: int,
  retryAfterS: int,
})
/** the open's answer: the paper's document, where to follow it, and the refusal of its new work where there is one */
export const OpenAnswer = z.object({ doc: PaperDoc, follow: z.string().nullable(), refused: OpenRefused.optional() })

export type Ref = z.infer<typeof Ref>
export type PaperDoc = z.infer<typeof PaperDoc>
export type OpenAsk = z.infer<typeof OpenAsk>
export type OpenRefused = z.infer<typeof OpenRefused>
export type OpenAnswer = z.infer<typeof OpenAnswer>
