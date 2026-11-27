// The model check (the translation policy's design §6): a fixed, versioned sample of units through a model, judged
// against the free chain on the same sample. It shows a model keeps the translator's contract; it says nothing about
// quality. The sample is the host's file (papers of mixed licences stay out of this repository); its schema, its digest
// and the pass line are here. A check is stored with what it ran against, and lapses when the entry, the prompt, the
// wire or the sample changes: the model's identity holds the first three, the sample's digest the last.
import { z } from 'zod'
import { llmIdentityOf } from './adapters/llm.ts'
import type { LlmEntry } from './adapters/llm-shapes.ts'
import type { Lang, Piece, Result, UnitIn } from './contract.ts'
import { sha256Hex } from './sha256.ts'

/** the check's fixed sample (the host's file): a version, the target, the units */
export interface CheckSample {
  v: 1
  target: Lang
  units: readonly UnitIn[]
}

const flag = z.union([z.boolean(), z.literal(1)]).optional()
const PieceSchema: z.ZodType<Piece> = z.lazy(() =>
  z.union([
    z.strictObject({ t: z.literal('text'), s: z.string() }),
    z.strictObject({
      t: z.literal('el'),
      id: z.string(),
      kind: z.string(),
      stop: z.string().optional(),
      alone: z.boolean().optional(),
      reads: z.string().optional(),
      silent: flag,
      newblock: flag,
      after: z.string().optional(),
      name: z.string().optional(),
      nameLang: z.string().optional(),
      text: z.string().optional(),
    }),
    z.strictObject({
      t: z.literal('span'),
      id: z.string(),
      style: z.string(),
      must: flag,
      stop: z.string().optional(),
      content: z.array(PieceSchema),
    }),
  ]),
)
const UnitInSchema: z.ZodType<UnitIn> = z.strictObject({
  id: z.string(),
  kind: z.string().optional(),
  content: z.array(PieceSchema),
  sentences: z.boolean().optional(),
  entry: z.boolean().optional(),
  strict: z.boolean().optional(),
})
export const CheckSampleSchema: z.ZodType<CheckSample> = z.strictObject({
  v: z.literal(1),
  target: z.string().min(1),
  units: z.array(UnitInSchema).min(1),
})

/** a value as JSON with its objects' keys sorted */
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(',')}]`
    : typeof v === 'object' && v !== null
      ? `{${Object.keys(v)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
          .join(',')}}`
      : JSON.stringify(v)

/** sha256 of the sample's canonical JSON (its objects' keys sorted): the same sample, however its file orders its keys */
export function sampleDigestOf(s: CheckSample): string {
  return sha256Hex(canonical(s))
}

/** what a check ran against: the model's identity and the sample's digest; a check whose `against` differs has lapsed */
export function checkAgainstOf(entry: LlmEntry, sampleDigest: string): string {
  return `${llmIdentityOf(entry)}|${sampleDigest}`
}

/** the pass line (design §6): the share of the sample the model's chain accepted (after one re-ask; `by` its identity
 *  or `runs:` it) is not below the free chain's on the same sample */
export function checkOf(o: { model: readonly Result[]; free: readonly Result[]; of: number; identity: string }): {
  ok: boolean
  accepted: number
  of: number
  free: number
} {
  const accepted = o.model.filter((r) => r.ok && (r.by === o.identity || r.by === `runs:${o.identity}`)).length
  const free = o.free.filter((r) => r.ok).length
  return { ok: accepted >= free, accepted, of: o.of, free }
}
