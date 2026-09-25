// What the background answers, by message type (DESIGN §8.0). The listener itself — which messages to leave alone,
// when the channel stays open, how a failure reaches the sender — is `answerMessages` (shared/messages.ts); this is
// the table it serves, and each entry holds the rule that belongs to its message. What a handler needs of the worker
// enters as a dependency, wired in ./index.ts, so the rules can be tested without a browser.
//
// Two ways of reporting a failure live side by side, each a contract with its callers: `translate`, `ocr` and the
// two cache messages answer `{ ok: false, … }` themselves, because their callers show the reason; the others reject,
// and the listener answers with the failure reply that `sendMessage` turns back into a rejection.
import type { Config } from '@/config/schema'
import { toErrorInfo } from '@/providers/translate-service'
import { type DiagnosticsExport, failureLine } from '@/shared/diagnostics'
import type { FloatingEntryState } from '@/shared/entry-settings'
import type { MessageHandlers } from '@/shared/messages'
import type { ChainHolder } from './chain'
import type { Diagnostics } from './diagnostics'
import { engineReady } from './engine-ready'
import type { OcrService } from './ocr'
import { type ConfigOffers, providerStatus } from './provider-status'
import type { SessionRouter } from './sessions'

export interface HandlerDeps {
  chain: ChainHolder
  router: SessionRouter
  offers: ConfigOffers
  ocr: Pick<OcrService, 'ocr'>
  diagnostics: Pick<Diagnostics, 'record' | 'restored' | 'export'>
  cache: { clear(): Promise<number>; cleanup(): Promise<unknown>; stats(): Promise<{ entries: number; bytes: number }> }
  /** The toggle of the key and the menu (context-menu.ts), for one tab */
  toggle(tabId: number): Promise<boolean>
  getConfig(): Promise<Config>
  getFloatingEntry(): Promise<FloatingEntryState>
  patchFloatingEntry(patch: Partial<FloatingEntryState>): Promise<{ saved: boolean; floating: FloatingEntryState }>
  /** The tab's zoom, the browser's to know; rejects for a tab that is gone */
  zoomOf(tabId: number): Promise<number>
  openSettings(): Promise<void>
  /** Light the toolbar button for one tab; rejects for a tab that is gone */
  lightAction(tabId: number): Promise<void>
  /** The environment a reader cannot be expected to report: the build, the browser, the platform */
  environment(): Promise<Omit<DiagnosticsExport, 'entries' | 'exportedAt'>>
}

const messageOf = (e: unknown): string => e instanceof Error ? e.message : String(e)

export function createHandlers(deps: HandlerDeps): MessageHandlers {
  const diag = (line: string) => deps.diagnostics.record('background', line)
  return {
    // A failed chain build (a provider constructor throwing) is answered honestly too: unanswered, the caller waits for “message channel closed”
    'axt:translate': (message, sender) => deps.router.forCall(message.scope, sender.tabId)
      .then(transport => transport.translate(message))
      .catch((e: unknown) => {
        const error = toErrorInfo(e)
        diag(`[axt] translate call failed before any request: ${failureLine(error.kind, error.message)}`)
        return { ok: false as const, error }
      }),

    'axt:cancel-scope': message => deps.router.drop([message.scope])
      .catch(() => 0)
      .then(cancelled => ({ cancelled })),

    // A session's own chain, the chain in force, or — after a save — one built from what is stored now.
    // A failure (a build that failed, the status deadline) is replied, not only logged: the page that asked
    // must see its request settle
    'axt:provider-status': (message, sender) => providerStatus(deps, message, sender.tabId),

    // Rebuild and move whom the sender says (./engine-ready.ts): a downloaded language pack moves one tab, a
    // deleted service moves everyone and retires its chain — the movers act on the chain in force
    'axt:engine-ready': message => engineReady(deps.chain, deps.router, message),

    // With IndexedDB unavailable an answer still goes back (Codex on #7), and a failure is reported as it is:
    // swallowing the exception into { removed: 0 } would let the reader believe the cache cleared when IndexedDB is
    // unusable (Codex on #52)
    'axt:cache-clear': () => deps.cache.clear()
      .then(removed => ({ ok: true as const, removed }))
      .catch((e: unknown) => ({ ok: false as const, message: messageOf(e) })),

    // The same protocol as cache-clear: “IndexedDB unusable” must not show as “the cache is empty”. Expired entries
    // are cleaned before counting — `get()` only treats them as misses and never deletes, and uncleaned the page
    // would keep showing a heap of unusable counts and bytes; this is also cleanup()'s only call site at run time (Codex on #52)
    'axt:cache-stats': () => deps.cache.cleanup()
      .then(() => deps.cache.stats())
      .then(stats => ({ ok: true as const, ...stats }))
      .catch((e: unknown) => ({ ok: false as const, message: messageOf(e) })),

    'axt:ocr': (message, sender) => {
      // The scope is bound to the sender's tab first: this may be the tab's first message carrying a scope, and unbound,
      // dropTab could not withdraw the queued recognition when the tab closes. The association only, no chain: OCR must not wait for the translation chain to build (Codex on #87, two rounds)
      if (message.scope) deps.router.bind(message.scope, sender.tabId)
      return deps.ocr.ocr(message)
        .catch((e: unknown) => ({ ok: false as const, error: { kind: 'unknown' as const, message: messageOf(e) } }))
    },

    // The floating button on the full text (§4.0c): the same toggle as the key and the menu, for the tab that asked.
    // From an extension page there is no tab to toggle, and nothing is answered
    'axt:toggle': (_message, sender) => sender.tabId === undefined ? undefined : deps.toggle(sender.tabId).then(acted => ({ acted })),

    // What a page needs of the settings (shared/entry-settings.ts): the configuration as this build reads it —
    // the defaults, when it cannot — never the raw stored value; the tab's zoom is the browser's to know
    'axt:entry-settings': (_message, sender) => Promise.all([
      deps.getConfig(),
      deps.getFloatingEntry(),
      sender.tabId === undefined ? 1 : deps.zoomOf(sender.tabId).catch(() => 1),
    ]).then(([config, floating, zoom]) => ({ uiLanguage: config.uiLanguage, openIn: config.reading.openIn, zoom, pdfReader: config.pdfReader.enabled, floating })),

    // The toolbar button lights for the tab the page is in (UI.md §5.1). Nothing is answered: the page does not wait
    // on it, and a tab closed meanwhile has no button to light
    'axt:page-usable': (_message, sender) => {
      if (sender.tabId !== undefined) void deps.lightAction(sender.tabId).catch(() => undefined)
      return undefined
    },

    // A content script cannot open the settings page itself; `openOptionsPage` brings an open one to the front
    'axt:open-settings': () => deps.openSettings().then(() => ({ opened: true })).catch(() => ({ opened: false })),

    // The floating button's state has one writer, this one, under a key of its own (background/floating-entry.ts)
    'axt:set-floating-entry': message => deps.patchFloatingEntry(message.patch),

    // Only our own contexts can reach runtime.onMessage (no externally_connectable), still the shape is checked:
    // a line is a string, the source one of the pages'; the ring's cap and the coalesced save bound the rest (Devin on #214)
    'axt:diag': message => {
      if (typeof message.line === 'string' && (message.src === 'content' || message.src === 'popup' || message.src === 'options')) deps.diagnostics.record(message.src, message.line)
      return undefined
    },

    'axt:diag-export': () => Promise.all([deps.diagnostics.restored, deps.environment()])
      .then(([, environment]) => deps.diagnostics.export(environment)),
  }
}
