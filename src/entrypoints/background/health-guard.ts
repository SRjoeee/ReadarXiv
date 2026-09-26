// Whether a chain's `auth` failure should mark the service health record (the redesign's design, §4). A chain keeps
// the configuration it was built from for as long as it lives; a request queued on an old chain can still fail after
// the reader has replaced a bad key with one that already passed a connection test. Marking then would re-demote the
// new key and block it until another test clears the record — this decides against the configuration stored **now**,
// not the one the failing chain used, so a key that has since changed is left alone (Codex review, round 2).
import type { Config } from '@/config/schema'
import { serviceOf } from '@/config/services'

/**
 * `chainConfig`: what the failing chain was built from — the key it actually sent. `storedConfig`: what is saved
 * right now. True only when both name the same service and its key has not moved since; a service since deleted, or
 * an id that never was one of the reader's own (a free engine), answers false. The keys are compared in memory only
 * and never logged (hard rule 5)
 */
export function shouldMarkRefusal(chainConfig: Config, storedConfig: Config, id: string): boolean {
  const used = serviceOf(chainConfig, id)
  const now = serviceOf(storedConfig, id)
  return used !== undefined && now !== undefined && used.apiKey === now.apiKey
}
