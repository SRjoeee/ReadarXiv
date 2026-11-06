// Where a translation request runs (DESIGN §8.0), over the one chain of `@readarxiv/translate` (stage 4b): the
// background makes the chain once (`chainOf`, background/index.ts), so every tab and every configuration's transport
// shares its pacing, cooldowns and breaker; a transport is one configuration's translators on it, the rows its pages read
// before anything is asked, and what the popup is told of the engine that answers. Two implementations of the interface,
// so page translation and the settings page's connection test share one path (issue #42):
// - createLocalTransport (this file), in the background;
// - createMessageTransport (src/shared/transport.ts): every method a message, in content scripts and extension pages.
import { type Chain, Fault, identityOf, type Note, type PaperContext, type Result, sha256Hex, type Translator, type UnitIn, type Why } from '@readarxiv/translate'
import { chainRevision } from '@/config/revision'
import type { Config } from '@/config/schema'
import { chosenService, serviceOf, serviceRuns, type Service } from '@/config/services'
import type { WireFormat } from '@/core/protector/tokens'
import type { KeyValues } from '@/cache/translate-store'
import { batchLine, redact } from '@/shared/diagnostics'
import type { CancelledScopeRegistry } from './request/cancellation'
import { type Answerer, langOf, translatorOf, translatorsOf, type TranslatorDeps } from './translators'
import type { ProviderErrorKind, ProviderKind, TranslateContext } from './types'

/** The engine actually in use right now and the latest hand-over reason (§8.5); the popup explains by it why the translation changed engine */
export interface EngineStatus {
  id: string
  /** The engine that was put aside for this one; `id` lets the popup name it the way it names services (UI.md §2) */
  demoted?: { id: string; kind: ProviderErrorKind; message: string }
}

export interface ProviderStatus {
  /** The engine at the head of the chain — what the chosen service resolved to */
  providerId: string
  /** The service id as saved; differs from `providerId` when the saved id names nothing (a service deleted from another tab) */
  chosen: string
  /** Can it be used */
  available: boolean
  /** With the first choice unavailable, the first engine on the chain that can answer (§8.5) */
  fallback?: { id: string }
  model?: string
  /** What the content side cuts its calls by: the chosen service's request size */
  maxBatchChars: number
  maxBatchItems: number
  /** The session's wire format (§8.5): one per session; the page serialises its blocks in it */
  renderPath: WireFormat
  /** The config this chain was built from: the popup waits for these to match what it just saved before restarting a page */
  targetLanguage: string
  promptId: string
  /** `chainRevision` of the configuration this chain was built from; the toggle compares a page's revision with it */
  revision: string
  engine: EngineStatus
  /** The ids of the engines on the chain that serve the target now, by priority */
  chain: string[]
  /** Every hand-over still in force, by engine; `status` the failure's HTTP status where one is known (a refused key's 401) */
  demotions: { id: string; kind: ProviderErrorKind; status?: number }[]
  /** The chain's identity (`identityOf` its translators): what a row is keyed by besides the unit and the target */
  identity: string
}

/** A request: a session's units, its target as the status gave it (ISO 639-3), the paper's context */
export interface TranslateCall {
  units: UnitIn[]
  target: string
  context?: TranslateContext
  /** The cancellation scope: one id per run, withdrawn as a whole on restore */
  scope?: string
  /** A named service off the chain: the settings page's connection test; nothing of it is stored */
  providerId?: string
  /** A service as the settings page would save it, asked as the call carries it (its id is `providerId`). Carries a key
   *  across runtime messaging, as the stored configuration does across storage: never logged (hard rule 5) */
  candidate?: Service
}

/** A failure as it crosses the message boundary; `status` is the HTTP status where one is known (only a 401 is a key refused) */
export interface ErrorInfo { kind: ProviderErrorKind; message: string; status?: number }

/** A unit's result as a page takes it: the chain's, with the service that answered (`engine`, `kind`), or the failure's
 *  kind for the page's words */
export type UnitResult =
  | (Extract<Result, { ok: true }> & { engine?: string; kind?: ProviderKind })
  | (Extract<Result, { ok: false }> & { error: ErrorInfo })

export type TranslateResponse =
  | { ok: true; results: UnitResult[]; cached: number }
  | { ok: false; error: ErrorInfo }

export interface TranslationTransport {
  translate(call: TranslateCall): Promise<TranslateResponse>
  /** Withdraw the scope's calls; returns how many. Whether the scope is dead afterwards is the session router's decision (DESIGN §8.5) */
  cancel(scope: string): Promise<number>
  /** `scope`: the session's own chain. `fresh`: a chain built from the configuration as stored now (provider-status.ts) */
  status(scope?: string, options?: { fresh?: boolean }): Promise<ProviderStatus>
  /** Local only: every call withdrawn and every later one refused; the chain holder retires the chains a deletion replaces */
  retire?(): number
  isRetired?(): boolean
  /** Local only: a call is inside this transport now */
  busy?(): boolean
}

export interface LocalTransportDeps extends TranslatorDeps {
  /** the background's chain, with its store of answers */
  chain: Chain
  /** a chain with no store, for the connection test: its question is whether the endpoint answers now */
  probe: Chain
  /** the rows a page opened again reads; absent, none (tests) */
  rows?: KeyValues
  /** The registry of scopes ended for certain, written by the session router (DESIGN §8.5) */
  cancelled: Pick<CancelledScopeRegistry, 'has'>
  warn?: (line: string) => void
  /** a call's cost, for the diagnostics log (issue #237) */
  note?: (line: string) => void
  /** The reader's services whose key the endpoint refused (the service health record): not asked, from the start */
  rejected?: ReadonlySet<string>
  /** a refused key of one of the reader's services (a 401), for the health record */
  onFailure?: (info: { id: string; kind: ProviderErrorKind; message: string; status?: number }) => void
}

/** How long a hand-over of an engine that could not answer stands in the popup's words (fallback.ts's cooldown before) */
const HANDOVER_MS = 60_000
/** a probe of whether an engine serves the target now, for the status (providers/index.ts PROBE_MS before) */
const PROBE_MS = 2_000
/** the rows' key grammar: rises only if the key changes */
const ROWS = 'r1'

/** a stored row, or null where the value is none (a store that answers garbage is a miss) */
function rowOf(raw: string | null | undefined): Omit<Extract<Result, { ok: true }>, 'id'> | null {
  if (typeof raw !== 'string') return null
  try {
    const row = JSON.parse(raw) as Omit<Extract<Result, { ok: true }>, 'id'>
    return row && row.ok === true && Array.isArray(row.content) && typeof row.by === 'string' ? row : null
  } catch {
    return null
  }
}

/** What a failure is to a page: one of the kinds its words are keyed on (locale packs, `ui/strings.ts`) */
export function errorOf(why: Why, status?: number): ErrorInfo {
  switch (why.kind) {
    case 'refused':
      return { kind: 'invalid-response', message: 'no translator rebuilt the placeholders of the source' }
    case 'unavailable':
      return why.retryAfterMs ? { kind: 'rate-limit', message: `unavailable for ${why.retryAfterMs} ms` } : { kind: 'network', message: 'the translators could not be reached' }
    case 'aborted':
      return { kind: 'aborted', message: 'cancelled' }
    case 'unconfigured':
      switch (why.code) {
        case 'no-key':
        case 'needs-gesture':
          return { kind: 'no-key', message: why.code === 'no-key' ? 'no API key configured' : 'the language pack needs a user gesture to download' }
        case 'key-refused':
          return { kind: 'auth', message: 'the endpoint refused the key', ...(status !== undefined ? { status } : {}) }
        case 'no-model':
          return { kind: 'bad-request', message: 'the endpoint has no such model' }
        case 'no-language':
          return { kind: 'bad-request', message: 'no translator serves the target language' }
      }
  }
}

const within = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise(resolve => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(fallback) })
  })

/** the chain's context of a page's: the paper, the section, the glossary */
function paperContextOf(c: TranslateContext | undefined): PaperContext | undefined {
  if (!c) return undefined
  const out: PaperContext = {
    ...(c.paperTitle ? { title: c.paperTitle } : {}),
    ...(c.abstract ? { abstract: c.abstract } : {}),
    ...(c.sectionTitle ? { section: c.sectionTitle } : {}),
    ...(c.glossary?.length ? { glossary: c.glossary } : {}),
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * Whether a result is a row: what the chain gives again for the unit, whatever is asked, until the chain changes. An
 * answer by the first translator is; an answer by a later one only where each translator before it refused the unit —
 * not one that could not be reached, was cooling, had no key or no language pack, which may answer the next time — and
 * the runs floor only where every pass of the unit and its stretches was a refusal
 */
function isRow(r: Result, order: readonly Translator[], passed: ReadonlyMap<string, Map<string, Why['kind'][]>>): boolean {
  if (!r.ok || r.by === 'self') return false
  const refusedAll = (id: string, by: string) => {
    const whys = passed.get(id)?.get(by)
    return !!whys?.length && whys.every(w => w === 'refused')
  }
  if (r.by.startsWith('runs:')) {
    for (const [id, byT] of passed) {
      if (id !== r.id && !id.startsWith(`${r.id}~`)) continue
      for (const whys of byT.values()) if (whys.some(w => w !== 'refused')) return false
    }
    return order.every(t => refusedAll(r.id, t.identity))
  }
  const k = order.findIndex(t => t.identity === r.by)
  return k >= 0 && order.slice(0, k).every(t => refusedAll(r.id, t.identity))
}

export async function createLocalTransport(config: Config, deps: LocalTransportDeps): Promise<TranslationTransport> {
  const revision = await chainRevision(config)
  /** a refused key's status, from the reader's service, as its request failed */
  let lastStatus: number | undefined
  const tdeps: TranslatorDeps = { ...deps, onStatus: s => { lastStatus = s; deps.onStatus?.(s) } }
  const built = translatorsOf(config, tdeps)
  const chosen = chosenService(config)
  const rejected = (id: string) => deps.rejected?.has(id) === true
  // a service whose key the endpoint refused before is asked nothing: off at its first request, before any is sent
  const translators: Translator[] = built.translators.map(t => {
    const a = built.answerers.get(t.identity)
    if (!a || !rejected(a.id)) return t
    const refuse = (): never => {
      throw new Fault('off', 'key-refused', 'the endpoint refused this key before')
    }
    return { ...t, send: () => ({ [Symbol.asyncIterator]: () => ({ next: async () => refuse() }) }) }
  })
  const chainId = await identityOf(translators)
  const target = langOf(config.targetLanguage)
  const usesContext = translators.some(t => t.context)

  let retired = false
  /** calls in flight, by scope (`''` for none), each withdrawn by its controller */
  const live = new Map<string, Set<AbortController>>()
  let inFlight = 0
  /** the hand-overs in force, by service id, and the service that answered last (the popup's `engine`) */
  const demoted = new Map<string, { kind: ProviderErrorKind; message: string; status?: number; until: number }>()
  for (const t of translators) {
    const a = built.answerers.get(t.identity)
    if (a && rejected(a.id)) demoted.set(a.id, { kind: 'auth', message: 'the endpoint refused this key before', status: 401, until: Number.POSITIVE_INFINITY })
  }
  let lastAnswer: string = built.primary.id
  let lastDemoted: { id: string; kind: ProviderErrorKind; message: string } | undefined

  const rowKey = (u: UnitIn, lang: string, context: PaperContext | undefined) =>
    `${ROWS}|${chainId}|${lang}|${sha256Hex(JSON.stringify([u.kind ?? null, u.content, u.sentences === true, u.strict === true]))}|${usesContext && context ? sha256Hex(JSON.stringify(context)) : '-'}`

  /** one call of `chain` with `order`: results by unit, the rows read first and written after */
  async function run(chain: Chain, order: Translator[], answerers: ReadonlyMap<string, Answerer>, call: TranslateCall, rows: KeyValues | undefined, scope: string): Promise<TranslateResponse> {
    const context = paperContextOf(call.context)
    // the session's own target, as its status gave it (a session holds to the transport it started on, whose target it is)
    const lang = call.target ? langOf(call.target) : target
    const ac = new AbortController()
    const mine = live.get(scope) ?? new Set()
    live.set(scope, mine)
    mine.add(ac)
    inFlight++
    try {
      const out = new Map<string, UnitResult>()
      // the rows first: a unit with one is answered by it, nothing asked
      const keys = rows ? call.units.map(u => rowKey(u, lang, context)) : []
      const held = rows ? await within(rows.read(keys), 2_000, keys.map(() => null)) : []
      const todo: UnitIn[] = []
      call.units.forEach((u, i) => {
        const row = rowOf(held[i])
        if (row) out.set(u.id, { ...row, id: u.id, ...engineOf(row.by, answerers) })
        else todo.push(u)
      })
      const byId = new Map(todo.map(u => [u.id, u]))
      const cached = call.units.length - todo.length
      const passed = new Map<string, Map<string, Why['kind'][]>>()
      let sent = 0
      const note = (n: Note) => {
        if (n.kind === 'sent') {
          sent++
          return
        }
        const byT = passed.get(n.id) ?? new Map<string, Why['kind'][]>()
        passed.set(n.id, byT)
        byT.set(n.by, [...(byT.get(n.by) ?? []), n.why.kind])
        handover(answerers.get(n.by), n.why)
      }
      const writes: [string, string][] = []
      if (todo.length) {
        for await (const r of chain.translate(todo, lang, { translators: order, signal: ac.signal, note, ...(context ? { context } : {}) })) {
          if (r.ok) {
            const e = engineOf(r.by, answerers)
            if (e.engine) answered(e.engine)
            out.set(r.id, { ...r, ...e })
            if (rows && isRow(r, order, passed)) {
              const { id: _, ...row } = r
              writes.push([rowKey(byId.get(r.id) as UnitIn, lang, context), JSON.stringify(row)])
            }
          } else out.set(r.id, { ...r, error: errorOf(r.why, r.why.kind === 'unconfigured' && r.why.code === 'key-refused' ? lastStatus : undefined) })
        }
      }
      if (rows && writes.length) await within(rows.write(writes), 5_000, undefined)
      const results = call.units.map(u => out.get(u.id) ?? { id: u.id, ok: false as const, why: { kind: 'aborted' as const }, error: errorOf({ kind: 'aborted' }) })
      const failed = results.find(r => !r.ok)
      // what the call cost, for the diagnostics log (issue #237): a call the rows answered whole costs nothing and says nothing
      if (sent > 0 || failed) deps.note?.(batchLine({ ...(call.scope !== undefined ? { scope: call.scope } : {}), segments: call.units.length, cached, calls: sent, done: results.filter(r => r.ok).length, ...(failed && !failed.ok ? { failed: failed.error.kind } : {}) }))
      return { ok: true, results, cached }
    } finally {
      inFlight--
      mine.delete(ac)
      if (!mine.size) live.delete(scope)
    }
  }

  const engineOf = (by: string, answerers: ReadonlyMap<string, Answerer>): { engine?: string; kind?: ProviderKind } => {
    const identity = by.startsWith('runs:') ? by.slice(5) : by
    const a = answerers.get(identity) ?? (by === 'runs:mixed' ? built.primary : undefined)
    return a ? { engine: a.id, kind: a.kind } : {}
  }
  /** a translator passed over for a unit: a hand-over the popup may word, for what makes it more than the unit's */
  const handover = (a: Answerer | undefined, why: Why) => {
    if (!a || why.kind === 'refused' || why.kind === 'aborted') return
    if (why.kind === 'unconfigured' && why.code === 'no-language') return
    const info = errorOf(why, why.kind === 'unconfigured' && why.code === 'key-refused' ? lastStatus : undefined)
    const lasting = info.kind === 'no-key' || info.kind === 'auth'
    // a lasting hand-over already known (the health record's refused key, with its 401) keeps what it says
    if (lasting && demoted.get(a.id)?.until === Number.POSITIVE_INFINITY) return
    demoted.set(a.id, { kind: info.kind, message: info.message, ...(info.status !== undefined ? { status: info.status } : {}), until: lasting ? Number.POSITIVE_INFINITY : Date.now() + HANDOVER_MS })
    lastDemoted = { id: a.id, kind: info.kind, message: info.message }
    // a refused key of a stored service of the reader's (a 401): the health record's (background/health-guard.ts)
    if (info.kind === 'auth' && info.status === 401 && serviceOf(config, a.id)) deps.onFailure?.({ id: a.id, kind: 'auth', message: info.message, status: 401 })
    deps.warn?.(`[axt] ${a.id} passed over: ${redact(info.message)}`)
  }
  const answered = (id: string) => {
    lastAnswer = id
    demoted.delete(id)
  }

  const refusal = (scope: string | undefined): TranslateResponse => ({ ok: false, error: { kind: 'aborted', message: scope === undefined ? 'cancelled (chain retired)' : `cancelled (scope: ${scope})` } })

  const translate = async (call: TranslateCall): Promise<TranslateResponse> => {
    if (retired || (call.scope !== undefined && deps.cancelled.has(call.scope))) return refusal(call.scope)
    try {
      // A call naming a service takes no fallback and nothing stored: the settings page's "test connection" asks whether
      // the endpoint it names answers (issue #42), and a cached sample would report success for one that no longer does
      if (call.providerId !== undefined || call.candidate) {
        if (call.candidate && call.candidate.id !== call.providerId) return { ok: false, error: { kind: 'unknown', message: 'the candidate is not the service named' } }
        const id = call.providerId as string
        if (!call.candidate && !serviceOf(config, id) && !translators.some(t => built.answerers.get(t.identity)?.id === id)) return { ok: false, error: { kind: 'unknown', message: `engine ${id} is not on the current chain` } }
        lastStatus = undefined
        const one = translatorOf(id, config, tdeps, call.candidate ?? serviceOf(config, id))
        return await run(deps.probe, [one.translator], new Map([[one.translator.identity, one.answerer]]), call, undefined, call.scope ?? '')
      }
      return await run(deps.chain, translators, built.answerers, call, deps.rows, call.scope ?? '')
    } catch (e) {
      return { ok: false, error: { kind: 'unknown', message: redact(e instanceof Error ? e.message : String(e)) } }
    }
  }

  const status = async (): Promise<ProviderStatus> => {
    const now = Date.now()
    for (const [id, d] of demoted) if (d.until <= now) demoted.delete(id)
    // every probe bounded: a probe that hangs answers "unavailable" in time
    const serves = async (t: Translator): Promise<boolean> => {
      const a = built.answerers.get(t.identity)
      if (!a || rejected(a.id)) return false
      const service = serviceOf(config, a.id)
      if (service && !serviceRuns(service)) return false
      return within(Promise.resolve().then(() => t.supports(target)), PROBE_MS, false)
    }
    const ready = await Promise.all(translators.map(serves))
    const available = ready[0] === true
    const firstReady = ready.findIndex((r, i) => r && !demoted.has(built.answerers.get((translators[i] as Translator).identity)?.id ?? ''))
    const fallbackAt = available ? -1 : ready.findIndex((r, i) => r && i > 0)
    const idAt = (i: number) => built.answerers.get((translators[i] as Translator).identity)?.id ?? built.primary.id
    const active = demoted.has(lastAnswer) && firstReady >= 0 ? idAt(firstReady) : lastAnswer
    return {
      providerId: built.primary.id,
      chosen: config.provider,
      revision,
      available,
      ...(fallbackAt > 0 ? { fallback: { id: idAt(fallbackAt) } } : {}),
      ...(chosen?.model ? { model: chosen.model } : {}),
      maxBatchChars: built.maxBatchChars,
      maxBatchItems: built.maxBatchItems,
      renderPath: built.renderPath,
      targetLanguage: config.targetLanguage,
      promptId: config.prompts.promptId,
      chain: translators.flatMap((_, i) => (ready[i] ? [idAt(i)] : [])),
      demotions: [...demoted].map(([id, d]) => ({ id, kind: d.kind, ...(d.status !== undefined ? { status: d.status } : {}) })),
      identity: chainId,
      engine: { id: active, ...(active !== built.primary.id && lastDemoted ? { demoted: lastDemoted } : {}) },
    }
  }

  const withdraw = (scopes: Iterable<string>): number => {
    let n = 0
    for (const scope of scopes) {
      for (const ac of live.get(scope) ?? []) {
        ac.abort()
        n++
      }
    }
    return n
  }
  return {
    translate,
    cancel: async scope => withdraw([scope]),
    status,
    retire: () => {
      retired = true
      return withdraw([...live.keys()])
    },
    isRetired: () => retired,
    busy: () => inFlight > 0,
  }
}
