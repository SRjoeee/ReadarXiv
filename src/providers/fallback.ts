// The engine fallback chain (DESIGN §8.5). A thin orchestration that touches no queue: createTranslateService is
// already the closure of “one provider, one queue + cache + batching”, and the cache key carries
// providerId | model | promptKey, so different engines' translations are stored apart of themselves — the chain wraps
// the services rather than living inside them.
//
// The problem solved: an expired key, an exhausted quota or a network blip made run.ts stop the whole page (no-key /
// auth trigger scheduler.disconnect()), the reader waiting over half a translation. Hard rule 3: a failure must be recoverable and trigger the fallback chain.
import type { TranslateCall, TranslateMessageResponse, TranslateService } from './translate-service'
import { isPermanentErrorKind, type ProviderErrorKind, type TranslatedSegment, type TranslationProvider } from './types'
import { failureLine } from '@/shared/diagnostics'
import { getRequestErrorMeta } from './request/retry-policy'

export interface FallbackStep {
  provider: TranslationProvider
  service: TranslateService
}

export interface DemotedInfo {
  id: string
  kind: ProviderErrorKind
  message: string
  /** The HTTP status, when the failure had one; `onFailure` carries it (only a 401 is a refused key, the redesign's design, §4) */
  status?: number
}

export interface FallbackStatus {
  /** The engine chosen in the configuration */
  configuredId: string
  /** The engine in use right now; different from configuredId means a hand-over happened */
  activeId: string
  /** The latest hand-over still in force, for the popup to explain why the translation changed engine; none once every engine put aside answers again (#304) */
  demoted?: DemotedInfo
  /**
   * **Every** hand-over record still in force. `demoted` alone is not enough: after the LLM is demoted for good on
   * auth, a transient failure of the free engine in between makes `demoted` that transient one, and the caller would
   * think “this change of service is not permanent” (Codex on #157). The content side tells by it whether **the engine its session started on** has been put down for good
   */
  demotions: DemotedInfo[]
}

/**
 * No `reset()`: “the chain returns to the first choice once the reader fixed the configuration” (Codex on #50) is not
 * this layer's job. The chain lives in the background; when a language pack finishes downloading the popup sends
 * `axt:engine-ready` and the background **rebuilds the whole chain** — more thorough than clearing hand-over records: an
 * engine whose `isAvailable()` was false at build time never joined the chain, and no record clearing brings it back (DESIGN §8.5)
 */
export interface FallbackService extends TranslateService {
  status(): FallbackStatus
}

/**
 * The error kinds that trigger a hand-over. `aborted` is not among them — a cancelled session is no fault of the
 * engine's, and starting over on another would only be cancelled again. The queue's own retries (retry-policy) run out
 * before this is reached, so the chain stacks no retry on top.
 */
export const FALLBACK_KINDS: ReadonlySet<ProviderErrorKind> = new Set<ProviderErrorKind>([
  'no-key', 'auth', 'network', 'timeout', 'rate-limit', 'bad-request', 'invalid-response', 'unknown',
])

/**
 * The cool-down of a transient failure. Without one, under a lasting failure every call would wait out that engine's
 * retries and timeouts (up to 120 s) for nothing; too long, a brief blip would leave a worse engine in use for a long
 * while. 60 s is the compromise, injectable for tests
 */
export const DEFAULT_COOLDOWN_MS = 60_000

interface Demotion {
  info: DemotedInfo
  /** undefined = permanent (for this session) */
  until?: number
}

export function createFallbackService(
  steps: readonly FallbackStep[],
  opts: { cooldownMs?: number; now?: () => number; warn?: (line: string) => void; demoted?: readonly DemotedInfo[]; onFailure?: (info: DemotedInfo) => void } = {},
): FallbackService {
  if (steps.length === 0) throw new Error('a fallback chain needs at least one engine')
  const cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const now = opts.now ?? Date.now
  /**
   * Every hand-over, in the order it was made: the last one still in force is the status's `demoted`. Derived, not
   * remembered apart — a remembered "last" outlived its engine's recovery, and the popup named an engine that had
   * answered again as the one replaced (#304)
   */
  const demotions = new Map<string, Demotion>()

  // Demotions known before the first call (the redesign's design, §4): a service whose key the endpoint refused, which
  // the background remembers across sessions. For good, as any permanent kind is; a connection that succeeds clears
  // the record and rebuilds the chain. The first of them is set last, the most recent: with nothing translated yet,
  // this is still the reason the popup has for showing anything other than the configured engine (Codex review, round 1)
  const seeded = opts.demoted ?? []
  for (const info of [...seeded].reverse()) demotions.set(info.id, { info })

  const isDemoted = (id: string): boolean => {
    const demotion = demotions.get(id)
    if (!demotion) return false
    if (demotion.until === undefined) return true
    if (now() < demotion.until) return true
    // The cool-down expired: eligible again, and the next call decides whether it succeeds
    demotions.delete(id)
    return false
  }

  const available = (): FallbackStep[] => {
    const alive = steps.filter(step => !isDemoted(step.provider.id))
    // All demoted: back to the last step — better to fail once more and report the error as it is than to have no engine at all
    return alive.length > 0 ? alive : [steps[steps.length - 1]!]
  }

  const demote = (step: FallbackStep, error: { kind: ProviderErrorKind; message: string; status?: number }): void => {
    // the status kept: `auth` is a 401 or a 403, and only a 401 is about the key (the retranslate cue, page-action.ts)
    const info: DemotedInfo = { id: step.provider.id, kind: error.kind, message: error.message, ...(error.status !== undefined ? { status: error.status } : {}) }
    // taken out first, so that setting it again makes it the most recent
    demotions.delete(step.provider.id)
    demotions.set(step.provider.id, {
      info,
      // A configuration problem does not heal itself: demoted for good this session, no request wasted on trying (PERMANENT_ERROR_KINDS)
      ...(isPermanentErrorKind(error.kind) ? {} : { until: now() + cooldownMs }),
    })
    console.warn(`[axt] ${step.provider.id} demoted (${error.kind}): ${error.message}`)
    opts.warn?.(`[axt] ${step.provider.id} demoted: ${failureLine(error.kind, error.message, getRequestErrorMeta(error).statusCode)}`)
  }

  const translate = async (call: TranslateCall): Promise<TranslateMessageResponse> => {
    const chain = available()
    let last: TranslateMessageResponse | null = null
    // Which segments each step translated (the `partial` of §8.2). Every step on the chain resends the whole call, and
    // the cache key carries the provider, so a segment the previous step translated does not hit the cache at the
    // next — untranslated there, it would be lost. Collected here by id, and the union goes back with a failure: the
    // main engine translating A/B and the fallback C, the caller has to get all three (Codex on #163). A later one overrides an earlier: it is the newer result
    const gathered = new Map<string, TranslatedSegment>()
    const withGathered = (response: TranslateMessageResponse): TranslateMessageResponse => {
      // An aborted answer is the call's refusal — its scope died or its chain was retired — and carries nothing
      // back, not even what an earlier engine on the chain translated (local review)
      if (response.ok || gathered.size === 0 || response.error.kind === 'aborted') return response
      return { ...response, partial: [...gathered.values()] }
    }
    for (const [index, step] of chain.entries()) {
      const response = await step.service.translate(call)
      if (response.ok) {
        // One success clears that engine's hand-over record: a transient failure must not keep it in the cool-down
        demotions.delete(step.provider.id)
        return response
      }
      // Every failed step is reported, whether or not it goes on to demote: with fallback off the chain is one
      // step, and `demote` (which only runs when there is a next step to hand over to) is never reached — yet the
      // background still has to learn this engine's key was refused (Codex review, round 1)
      const { kind, message, status } = response.error
      opts.onFailure?.({ id: step.provider.id, kind, message, ...(status !== undefined ? { status } : {}) })
      for (const segment of response.partial ?? []) gathered.set(segment.id, segment)
      last = response
      const isLast = index === chain.length - 1
      if (isLast || !FALLBACK_KINDS.has(response.error.kind)) return withGathered(response)
      demote(step, response.error)
    }
    // chain is non-empty, so the loop runs at least once
    return withGathered(last!)
  }

  /** Restoring the original withdraws from every queue: one missed, and an in-flight request comes back to write the DOM */
  const cancel = (scope: string): number => steps.reduce((n, step) => n + step.service.cancel(scope), 0)
  const cancelAll = (): number => steps.reduce((n, step) => n + step.service.cancelAll(), 0)

  const status = (): FallbackStatus => {
    // An expired cool-down record does not count: `isDemoted` draws the line, and drops it
    const latest = [...demotions.keys()].filter(isDemoted).at(-1)
    return {
      configuredId: steps[0]!.provider.id,
      activeId: available()[0]!.provider.id,
      ...(latest !== undefined ? { demoted: demotions.get(latest)!.info } : {}),
      demotions: steps.filter(step => isDemoted(step.provider.id)).map(step => demotions.get(step.provider.id)!.info),
    }
  }

  return { translate, cancel, cancelAll, status }
}
