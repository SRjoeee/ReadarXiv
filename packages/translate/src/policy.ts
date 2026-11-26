// The translation policy: which producers a host ranks for each target, which one translates a paper at its first open,
// which language models upgrade it, and the limits they run under. One JSON document read by one schema; it holds names
// and aliases, never a key. A host reads it with `parsePolicy`, which states every refusal by the field it names, and
// asks `targetPolicyOf` for a target's part. Targets are an open string here: a host narrows them to its own table.
//
// What a valid policy promises its reader:
//   - every ranking ends in a free chain, so a paper always has a producer that costs nothing and needs no key;
//   - every producer it names exists in it: a free chain in `free`, a model in `models`;
//   - `fast` is a free chain the ranking holds, and every `upgrade` producer is a model the ranking holds, so what either
//     makes can be served;
//   - a model a named target ranks has a passing check for that target; a model `default` ranks serves only the targets
//     its check passed for (`effectiveOf` leaves it out of the others and names it), so no model translates a target it
//     was not checked on;
//   - a paid model states its prices above zero; a free model runs inside its provider's groups, each of which states a
//     limit in requests or tokens; no number is negative.

import { z } from 'zod'
import { type ProducerId, producerKindOf } from './producers.ts'

/** a target's part of the policy */
export interface TargetPolicy {
  /** best first; the last is a free chain */
  ranking: ProducerId[]
  /** the free chain that translates a paper at its first open */
  fast: ProducerId
  /** the models tried in order for every opened paper; may be empty */
  upgrade: ProducerId[]
}
/** a free chain: its engines in the order they are asked */
export interface FreeEntry {
  id: string
  engines: ('google' | 'microsoft')[]
}
/** a model's check for one target: whether it keeps the translator's contract on a fixed sample */
export interface ModelCheck {
  at: string
  ok: boolean
  accepted: number
  of: number
}
/** a language model as a producer; immutable once anything refers to it */
export interface ModelEntry {
  id: string
  provider: string
  model: string
  upstream?: string[]
  shape: 'anthropic-messages' | 'openai-chat'
  json: 'schema' | 'object'
  reasoning?: Record<string, unknown>
  sampling?: Record<string, number>
  billing: { mode: 'paid'; usdPerMTokIn: number; usdPerMTokOut: number } | { mode: 'free' }
  /** by target */
  checks: Record<string, ModelCheck>
}
/** one stated limit of a quota group, per window */
export interface QuotaLimit {
  per: 'minute' | 'day' | 'month' | 'total'
  usd?: number
  requests?: number
  tokens?: number
}
/** what a provider account allows: the keys of one account share one group */
export interface QuotaGroup {
  id: string
  provider: string
  limits: QuotaLimit[]
  /** false: the limits are not confirmed against the provider's console */
  verified: boolean
}
/** a key, by its alias in the gateway: never its value */
export interface KeyEntry {
  alias: string
  group: string
  order: number
  enabled: boolean
}
export interface Policy {
  version: number
  /** no new request to a model while true; what is translated is still served */
  pauseLlm: boolean
  default: TargetPolicy
  /** a target's own part, over `default` */
  targets?: Record<string, TargetPolicy>
  activate: { minOwnShare: number }
  /** paid spend only */
  budget: { paidDailyUsd: number; preheatMaxShare: number }
  free: FreeEntry[]
  models: ModelEntry[]
  groups: QuotaGroup[]
  keys: KeyEntry[]
  upgrades: { inFlight: number }
  preheat: { perDay: number; inFlight: number; producers: ProducerId[] }
}

// ---------------------------------------------------------------- the schema of each part

const name = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, 'a name of lower-case letters, digits, ".", "_" and "-"')
const label = z.string().min(1)
const count = z.number().int().nonnegative()
const amount = z.number().nonnegative()
const price = z.number().positive()
const producer = z.custom<ProducerId>((v) => typeof v === 'string' && producerKindOf(v) !== null, {
  error: 'a producer: `free:<name>` or `llm:<name>`',
})

const TargetPolicySchema = z.strictObject({ ranking: z.array(producer), fast: producer, upgrade: z.array(producer) })
const ENGINES = ['google', 'microsoft'] as const
const FreeEntrySchema = z.strictObject({
  id: name,
  engines: z
    .array(z.enum(ENGINES))
    .min(1)
    .refine((a) => new Set(a).size === a.length, 'each engine once'),
})
const ModelEntrySchema = z.strictObject({
  id: name,
  provider: label,
  model: label,
  upstream: z.array(label).optional(),
  shape: z.enum(['anthropic-messages', 'openai-chat']),
  json: z.enum(['schema', 'object']),
  reasoning: z.record(z.string(), z.unknown()).optional(),
  sampling: z.record(z.string(), z.number()).optional(),
  billing: z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('paid'), usdPerMTokIn: price, usdPerMTokOut: price }),
    z.strictObject({ mode: z.literal('free') }),
  ]),
  checks: z.record(z.string(), z.strictObject({ at: label, ok: z.boolean(), accepted: count, of: count })),
})
const QuotaGroupSchema = z.strictObject({
  id: label,
  provider: label,
  limits: z.array(
    z.strictObject({
      per: z.enum(['minute', 'day', 'month', 'total']),
      usd: amount.optional(),
      requests: count.optional(),
      tokens: count.optional(),
    }),
  ),
  verified: z.boolean(),
})
const KeyEntrySchema = z.strictObject({ alias: label, group: label, order: count, enabled: z.boolean() })

// ---------------------------------------------------------------- the rules across parts

type Path = (string | number)[]
type Report = (path: Path, message: string) => void

/** a later entry whose id an earlier one has */
function unique<T>(entries: readonly T[], idOf: (e: T) => string, path: Path, field: string, report: Report) {
  const seen = new Set<string>()
  entries.forEach((e, i) => {
    if (seen.has(idOf(e))) report([...path, i, field], `the ${field} "${idOf(e)}" is an earlier entry's`)
    seen.add(idOf(e))
  })
}

const tailOf = (id: ProducerId): string => id.slice(id.indexOf(':') + 1)
const own = <T>(rec: Record<string, T> | undefined, key: string): T | undefined =>
  rec !== undefined && Object.hasOwn(rec, key) ? rec[key] : undefined

/** whether a model `id` names has a passing check for `target`; a free chain needs none */
function checkedFor(p: Pick<Policy, 'models'>, id: ProducerId, target: string): boolean {
  if (producerKindOf(id) !== 'llm') return true
  const m = p.models.find((e) => e.id === tailOf(id))
  return own(m?.checks, target)?.ok === true
}

function checkTarget(p: Policy, t: TargetPolicy, path: Path, target: string | null, report: Report) {
  const exists = (id: ProducerId) =>
    producerKindOf(id) === 'free' ? p.free.some((e) => e.id === tailOf(id)) : p.models.some((e) => e.id === tailOf(id))
  const last = t.ranking.at(-1)
  if (last === undefined || producerKindOf(last) !== 'free')
    report([...path, 'ranking'], 'the last producer of a ranking is a free chain')
  t.ranking.forEach((id, i) => {
    if (!exists(id)) report([...path, 'ranking'], `"${id}" is no producer of this policy`)
    if (t.ranking.indexOf(id) !== i) report([...path, 'ranking'], `"${id}" is ranked twice`)
    if (target !== null && !checkedFor(p, id, target))
      report([...path, 'ranking'], `"${id}" has no passing check for "${target}"`)
  })
  if (producerKindOf(t.fast) !== 'free') report([...path, 'fast'], 'the fast producer is a free chain')
  else if (!exists(t.fast)) report([...path, 'fast'], `"${t.fast}" is no producer of this policy`)
  else if (!t.ranking.includes(t.fast)) report([...path, 'fast'], `"${t.fast}" is not in the ranking`)
  t.upgrade.forEach((id, i) => {
    if (producerKindOf(id) !== 'llm') report([...path, 'upgrade'], `"${id}" is not a model`)
    else if (!t.ranking.includes(id)) report([...path, 'upgrade'], `"${id}" is not in the ranking`)
    if (t.upgrade.indexOf(id) !== i) report([...path, 'upgrade'], `"${id}" is named twice`)
  })
}

function checkPolicy(p: Policy, report: Report) {
  unique(p.free, (e) => e.id, ['free'], 'id', report)
  unique(p.models, (e) => e.id, ['models'], 'id', report)
  unique(p.groups, (e) => e.id, ['groups'], 'id', report)
  unique(p.keys, (e) => e.alias, ['keys'], 'alias', report)
  checkTarget(p, p.default, ['default'], null, report)
  for (const target of Object.keys(p.targets ?? {})) {
    const t = own(p.targets, target)
    if (t) checkTarget(p, t, ['targets', target], target, report)
  }
  p.preheat.producers.forEach((id, i) => {
    if (!p.default.ranking.includes(id)) report(['preheat', 'producers', i], `"${id}" is not in the default ranking`)
  })
  p.keys.forEach((k, i) => {
    if (!p.groups.some((g) => g.id === k.group)) report(['keys', i, 'group'], `"${k.group}" is no group of this policy`)
  })
  p.models.forEach((m, i) => {
    if (m.billing.mode !== 'free') return
    const groups = p.groups.filter((g) => g.provider === m.provider)
    const bounded = (g: QuotaGroup) => g.limits.some((l) => l.requests !== undefined || l.tokens !== undefined)
    if (groups.length === 0 || !groups.every(bounded))
      report(['models', i], `a free model runs inside its provider's groups, each stating a request or a token limit`)
  })
}

/** the policy's schema: each part's shape, then the rules across parts (run only on a policy whose parts are whole) */
export const PolicySchema: z.ZodType<Policy> = z
  .strictObject({
    version: count,
    pauseLlm: z.boolean(),
    default: TargetPolicySchema,
    targets: z.record(z.string(), TargetPolicySchema).optional(),
    activate: z.strictObject({ minOwnShare: z.number().gt(0).lte(1) }),
    budget: z.strictObject({ paidDailyUsd: amount, preheatMaxShare: z.number().min(0).max(1) }),
    free: z.array(FreeEntrySchema),
    models: z.array(ModelEntrySchema),
    groups: z.array(QuotaGroupSchema),
    keys: z.array(KeyEntrySchema),
    upgrades: z.strictObject({ inFlight: count }),
    preheat: z.strictObject({ perDay: count, inFlight: count, producers: z.array(producer) }),
  })
  .superRefine((p, ctx) => checkPolicy(p, (path, message) => ctx.addIssue({ code: 'custom', path, message })))

const pathOf = (path: readonly PropertyKey[]): string => path.map(String).join('.')

/** a policy read, or every reason it is refused, each `<field>: <why>` */
export function parsePolicy(v: unknown): { ok: true; policy: Policy } | { ok: false; issues: string[] } {
  const r = PolicySchema.safeParse(v)
  if (r.success) return { ok: true, policy: r.data }
  const issues = r.error.issues.flatMap((i) =>
    i.code === 'unrecognized_keys'
      ? i.keys.map((k) => `${pathOf([...i.path, k])}: an unknown key`)
      : [`${pathOf(i.path) || '(policy)'}: ${i.message}`],
  )
  return { ok: false, issues }
}

/** a producer `default` names that a target's part leaves out, and why: a model with no passing check for the target */
export interface Dropped {
  producer: ProducerId
  why: 'no-check'
}

/** a target's part and what it left out: its own where the policy names it (nothing left out: validation refused a
 *  model with no passing check there); else `default`, less the models with no passing check for the target, each named
 *  once in `dropped`, so that nothing is left out silently */
export function effectiveOf(p: Policy, target: string): { policy: TargetPolicy; dropped: Dropped[] } {
  const named = own(p.targets, target)
  if (named) return { policy: named, dropped: [] }
  const d = p.default
  const served = (id: ProducerId) => checkedFor(p, id, target)
  const left = [...new Set([...d.ranking, ...d.upgrade].filter((id) => !served(id)))]
  if (left.length === 0) return { policy: d, dropped: [] }
  return {
    policy: { ranking: d.ranking.filter(served), fast: d.fast, upgrade: d.upgrade.filter(served) },
    dropped: left.map((producer) => ({ producer, why: 'no-check' })),
  }
}

/** a target's part: `effectiveOf`'s policy */
export function targetPolicyOf(p: Policy, target: string): TargetPolicy {
  return effectiveOf(p, target).policy
}
