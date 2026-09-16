// The diagnostics ring buffer (issue #156): the last few hundred lines the extension logged, kept in the worker's
// memory and mirrored into session storage — a service worker sleeps within minutes, the buffer must outlive it, and
// the browser closing is where a session's diagnostics end. Fed by the background itself (request failures,
// hand-overs, withdrawals) and by the content script's `[axt]` lines through `axt:diag`; read by the settings
// page's export. Never an API key (redact), never page text — the lines carry block ids, counts and paper ids only
import { type DiagnosticEntry, type DiagnosticSource, type DiagnosticsExport, normalizeEntries, redact } from '@/shared/diagnostics'

export interface DiagnosticsDeps {
  load(): Promise<unknown>
  save(entries: DiagnosticEntry[]): Promise<void>
  now?: () => number
  /** How many lines are kept; the oldest go first */
  limit?: number
  /** The save is coalesced: a burst of lines (one tidy pass per batch) writes storage once */
  flushMs?: number
  schedule?: (run: () => void, ms: number) => number
  cancel?: (id: number) => void
}

export interface Diagnostics {
  record(src: DiagnosticSource, line: string): void
  entries(): DiagnosticEntry[]
  /** The lines the previous worker left in session storage are in place */
  restored: Promise<void>
  export(env: Omit<DiagnosticsExport, 'entries' | 'exportedAt'>): DiagnosticsExport
}

export const DIAGNOSTICS_LIMIT = 500

export function createDiagnostics(deps: DiagnosticsDeps): Diagnostics {
  const now = deps.now ?? Date.now
  const limit = deps.limit ?? DIAGNOSTICS_LIMIT
  const flushMs = deps.flushMs ?? 250
  const schedule = deps.schedule ?? ((run, ms) => setTimeout(run, ms) as unknown as number)
  const cancel = deps.cancel ?? (id => clearTimeout(id))
  let entries: DiagnosticEntry[] = []
  /** Recorded before the restore finished: they come after what was restored, in the order they were logged */
  let early: DiagnosticEntry[] | null = []
  let timer = 0

  const trim = () => { if (entries.length > limit) entries = entries.slice(entries.length - limit) }
  const flush = () => {
    timer = 0
    void deps.save(entries).catch(() => undefined)
  }
  const later = () => {
    if (timer !== 0) cancel(timer)
    timer = schedule(flush, flushMs)
  }

  const restored = deps.load()
    .then(stored => { entries = normalizeEntries(stored) }, () => { entries = [] })
    .then(() => {
      // What arrived while the load was out goes after what was loaded, and is saved now: a flush before the merge
      // would have written an empty buffer over the previous worker's lines (Devin on #214)
      const pending = early ?? []
      entries = entries.concat(pending)
      early = null
      trim()
      if (pending.length > 0) later()
    })

  return {
    record(src, line) {
      const entry: DiagnosticEntry = { t: now(), src, line: redact(line) }
      if (early) early.push(entry) // saved by the restore, once the buffer is whole
      else {
        entries.push(entry)
        trim()
        later()
      }
    },
    entries: () => entries.slice(),
    restored,
    export: env => ({ exportedAt: new Date(now()).toISOString(), ...env, entries: entries.slice() }),
  }
}
