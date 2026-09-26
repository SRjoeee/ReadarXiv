// When the service health record is written (the redesign's design, §4). A mark says the endpoint refused a key: only
// a 401 means that — `auth` also covers a 403 (http-errors.ts), which is a moderation refusal or a disallowed origin,
// not the key. A mark is about the key and the address the request used, so a change of either, or the service's
// deletion, voids it. The background owns every write; the decisions are here, pure, and the keeper below wires them
// to the record's queue (shared/service-health.ts).
//
// A chain keeps the configuration it was built from for as long as it lives; a request queued on an old chain can
// still fail after the reader has replaced a bad key with one that already passed a connection test. Marking then
// would re-demote the new key and block it until another test clears the record — so a refusal marks only while the
// key and the address the failing chain used are still the ones stored **now** (Codex review, round 2).
import type { Config } from '@/config/schema'
import { SERVICE_ID_RE, serviceOf } from '@/config/services'
import type { ProviderErrorKind } from '@/providers/types'

/** What a failure says about itself: whose it was, its kind, and the HTTP status when it had one */
export interface Failure {
  id: string
  kind: ProviderErrorKind
  status?: number
}

/** A 401 answered to one of the reader's services: the only failure that can mark the record. Cheap, and asked first */
export function isRefusal(failure: Failure): boolean {
  return failure.kind === 'auth' && failure.status === 401 && SERVICE_ID_RE.test(failure.id)
}

/**
 * `chainConfig`: what the failing request was built from — the key and the address it actually used. `storedConfig`:
 * what is saved right now. True only for a refusal (`isRefusal`) of a service both name, whose key and address have
 * not moved since; a service since deleted answers false. A named call (the settings page's connection test) passes
 * the stored configuration as both: it was built from it. The keys are compared in memory only and never logged
 * (hard rule 5)
 */
export function shouldMarkRefusal(failure: Failure, chainConfig: Config, storedConfig: Config): boolean {
  if (!isRefusal(failure)) return false
  const used = serviceOf(chainConfig, failure.id)
  const now = serviceOf(storedConfig, failure.id)
  return used !== undefined && now !== undefined && used.apiKey === now.apiKey && used.baseURL === now.baseURL
}

/**
 * Which of the `marked` ids a change of the stored configuration from `previous` to `next` voids: a service whose key
 * or address changed, and a service no longer there. A rename or another model leaves the mark: the key the endpoint
 * refused is still the one sent. `previous` is null when the value before did not parse (a reset out of an unreadable
 * configuration): no key can be compared, and only the services no longer there are cleared — a key that may have
 * changed is left to the next connection test. A free engine's id is never the record's, and never cleared from here
 */
export function idsToClear(previous: Config | null, next: Config, marked: ReadonlySet<string>): string[] {
  return [...marked].filter(id => {
    if (!SERVICE_ID_RE.test(id)) return false
    const after = serviceOf(next, id)
    if (after === undefined) return true
    if (previous === null) return false
    const before = serviceOf(previous, id)
    return before === undefined || before.apiKey !== after.apiKey || before.baseURL !== after.baseURL
  })
}

export interface HealthKeeperDeps {
  getConfig(): Promise<Config>
  /** service-health.ts's `markRejected`: `still` is asked in the mark's own turn of the record's queue */
  mark(id: string, still: () => Promise<boolean>): Promise<void>
  /** service-health.ts's `clearRejectedAmong`: `pick` chooses in the clear's own turn, from the ids marked then */
  clearAmong(pick: (marked: ReadonlySet<string>) => readonly string[]): Promise<unknown>
  /** A fixed line for the diagnostics log: nothing that could hold a key */
  warn(line: string): void
}

/**
 * The background's two writers of the record besides the named call (handlers.ts): a chain's failure, and a change
 * of the stored configuration. Both decide inside the record's queue — the refusal reads the stored configuration in
 * its turn, the clear reads the marks in its — so a refusal whose write lands after a key change is still seen by the
 * clear that change asks for, and neither can undo the other. A storage failure ends as a fixed line, never as an
 * unhandled rejection
 */
export function createHealthKeeper(deps: HealthKeeperDeps) {
  return {
    /** A chain's failed step (fallback.ts's `onFailure`), with the configuration that chain was built from */
    failed(chainConfig: Config, failure: Failure): void {
      if (!isRefusal(failure)) return
      deps.mark(failure.id, async () => shouldMarkRefusal(failure, chainConfig, await deps.getConfig()))
        .catch(() => deps.warn('[axt] a refused key could not be recorded: the settings or the record could not be read'))
    },
    /** The stored configuration changed; `previous` is null when the value before did not parse (`idsToClear` says what then) */
    configChanged(next: Config, previous: Config | null): void {
      deps.clearAmong(marked => idsToClear(previous, next, marked))
        .catch(() => deps.warn('[axt] a refused key\'s mark could not be cleared: the record could not be written'))
    },
  }
}
