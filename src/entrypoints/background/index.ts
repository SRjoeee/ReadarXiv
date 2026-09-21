import { cachePortOf, translationCache } from '@/cache'
import { pickTargetLanguage } from '@/config/first-target'
import { chooseFirstTarget, getConfig, watchConfig } from '@/config/storage'
import { CancelledScopeRegistry } from '@/providers/request/cancellation'
import { createLocalTransport } from '@/providers/transport'
import { type AxtMessage, answerMessages, sendMessage, sendToTab } from '@/shared/messages'
import { createChainHolder } from './chain'
import { createHandlers } from './handlers'
import { createConfigOffers, statusInForce } from './provider-status'
import { createOcrService } from './ocr'
import { createRecogniserClient } from './recogniser'
import { createSessionRouter } from './sessions'
import { installContextMenu, refreshContextMenu, installToggleCommand, toggleTranslation } from './context-menu'
import { getFloatingEntry, patchFloatingEntry } from './floating-entry'
import { applyLocaleFrom, resolveLocale } from '@/ui/apply-locale'
import { setLocale } from '@/ui/strings'
import { savedFromStatus } from '@/shared/page-action'
import { BUILD_REF } from '@/shared/build'
import { createDiagnostics } from './diagnostics'

// The background: the engine chain, the queues, the cache and the recogniser, wired together (DESIGN §8.0); what it
// answers is the table in ./handlers.ts.
export default defineBackground(() => {
  // A new reader's target language follows the browser's languages, chosen once (config/first-target.ts). Registered
  // at the top, synchronously, as MV3 asks of an event that may be what wakes the worker; an update is not an
  // install, and an installation that already holds a configuration is left as it is (config/storage.ts)
  browser.runtime.onInstalled.addListener(details => {
    if (details.reason !== 'install') return
    void chooseFirstTarget(() => pickTargetLanguage(navigator.languages ?? [], browser.i18n.getUILanguage?.()))
      .catch(e => console.warn(`[axt] the first target language could not be saved (${e instanceof Error ? e.name : typeof e})`))
  })

  const cache = cachePortOf(translationCache)
  /** Scopes ended for certain — one registry (DESIGN §8.5): the session router writes it, the chain's services and OCR read it */
  const cancelled = new CancelledScopeRegistry()
  /** The diagnostics log (issue #156): this worker's warnings, the pages' `[axt]` lines; in session storage across workers, for the settings page's export */
  const DIAG_KEY = 'axt-diagnostics'
  const diagnostics = createDiagnostics({
    load: async () => (await browser.storage.session.get(DIAG_KEY).catch(() => ({}) as Record<string, unknown>))[DIAG_KEY],
    save: async entries => { await browser.storage.session.set({ [DIAG_KEY]: entries }).catch(() => undefined) },
  })
  const diag = (line: string) => diagnostics.record('background', line)

  /** The chain in force, one per worker (./chain.ts): built lazily, rebuilt when the configuration that shapes it changes */
  const chain = createChainHolder({
    load: async config => {
      const resolved = config ?? await getConfig()
      return { config: resolved, transport: await createLocalTransport(resolved, { cache, cancelled, warn: diag }) }
    },
    // The router is created below; a superseded chain is only ever swept after a build, long after that
    owned: transport => router.sessionsOn(transport) > 0,
  })
  const transportOf = () => chain.current()
  /** The interface language this worker uses, to recognise “the reader changed it” (the context menu's title has to be redrawn) */
  let uiLanguage: string | null = null

  // The chain learns of a change by reading the store, in order with the popup's `fresh` asks — never from the
  // event's own value, which carries no order (provider-status.ts says why)
  const offers = createConfigOffers({ load: getConfig, chain })
  watchConfig(next => {
    // A changed interface language redraws the menu: the worker does not restart for it, and unredrawn the title would stay in the old language (Codex on #161)
    if (next.uiLanguage !== uiLanguage) {
      uiLanguage = next.uiLanguage
      applyLocaleFrom(next.uiLanguage)
      refreshContextMenu(menuDeps)
    }
    void offers.offer()
  })

  /**
   * The binding of sessions to chains (see ./sessions.ts): a session holds to the chain it started on, and a closed
   * tab withdraws its requests. The price is two chains briefly side by side when the configuration changes in the
   * middle of a translation, the cross-tab concurrency budget doubled until the old session ends; a deliberate trade — better one extra set of queues for a while than a round of translation changing engine or language halfway (Codex on #59).
   * A settings change while a page is on therefore starts a **new** session that replaces the
   * old one in place (content `start(…, restart)`, DESIGN §8.5); the old session's requests are
   * cancelled by its scope as before
   */
  /**
   * The recogniser of image translation (DESIGN §15.3): in an offscreen document, opened when the first bitmap needs
   * reading. Withdrawing a session withdraws its queued recognitions too (the router's onDrop)
   */
  const recogniser = createRecogniserClient({
    offscreen: {
      has: () => browser.offscreen.hasDocument(),
      create: () => browser.offscreen.createDocument({ url: browser.runtime.getURL('/ocr.html'), reasons: ['WORKERS'], justification: 'Runs text recognition for figure translation in a WebAssembly worker' }),
      close: () => browser.offscreen.closeDocument(),
    },
    run: request => sendMessage({ type: 'axt:ocr-run', ...request }),
  })
  const ocr = createOcrService({ backend: recogniser, cache, cancelled, warn: diag })
  const router = createSessionRouter({
    current: transportOf,
    cancelled,
    retireOthers: () => chain.retireOthers(),
    cancelScope: scope => chain.cancelScope(scope),
    onDrop: scope => ocr.cancel(scope),
    /**
     * Is that tab still the page it was: ask it.
     *
     * A page still there answers with the same session id; navigated away, its content script is gone and
     * `sendMessage` throws outright. Asked once only when the grace expires, and only when the tab made no request at all in that time
     */
    /**
     * Is this tab still loading. `status` of `tabs.get` is not among the fields that need the `tabs` permission (url /
     * title / favIconUrl are the guarded ones), so this asks for no wider permission
     */
    stillLoading: async tabId => {
      try {
        return (await browser.tabs.get(tabId)).status === 'loading'
      } catch {
        return false
      }
    },
    stillThere: async (tabId, scope) => {
      try {
        // A page that answered with a failure said nothing about which page it is: `sendToTab` rejects, and that is `unknown`, not `other`
        const status = await sendToTab<{ session?: string | null } | undefined>(tabId, { type: 'axt:page-status' })
        return status?.session === scope ? 'same' : 'other'
      } catch {
        // The message did not arrive: the page may be gone, or the new document's content script may not be installed yet. Indistinguishable, so no death sentence
        return 'unknown'
      }
    },
  })

  // Both lifecycle hooks give only tabId / status, needing no "tabs" permission
  const dropTab = (tabId: number, why: string) => {
    void router.dropTab(tabId).then(n => {
      if (n > 0) {
        const line = `[axt] tab ${tabId} ${why}: ${n} queued / in-flight requests withdrawn`
        console.debug(line)
        diag(line)
      }
    })
  }
  // The context menu (issue #146): the second entry, the same message as the popup's action.
  // **Registered synchronously**, without waiting for the locale pack (context-menu.ts says why): the menu is built in
  // the fallback language first and rebuilt once the pack is read, so the title follows the interface language (UI.md §6)
  /**
   * The saved settings as the toggle decides on them (shared/page-action.ts): their identity, and whether they run —
   * from the chain in force, which is built from them. The popup decides the same from the settings it holds
   */
  const saved = async () => {
    // One snapshot: the chain in force, built from what is stored now (offered in order with every other offer),
    // and still in force once its probes have answered
    await offers.offer()
    return savedFromStatus((await statusInForce(chain)).status)
  }
  const menuDeps = {
    create: (options: { id: string; title: string; contexts: string[]; documentUrlPatterns: string[] }) =>
      browser.contextMenus.create(options as Parameters<typeof browser.contextMenus.create>[0]),
    removeAll: () => browser.contextMenus.removeAll(),
    onClicked: (handler: Parameters<typeof browser.contextMenus.onClicked.addListener>[0]) => browser.contextMenus.onClicked.addListener(handler),
    send: sendToTab,
    saved,
  }
  installContextMenu(menuDeps)
  // The reader changed the interface language while this read was out: the watcher has swapped the pack already, and
  // this old snapshot must not put it back. **Judge, then apply**: `applyLocale` itself calls setLocale, and checking
  // the gate after it returns, the pack has been swapped back already (Codex on #161, in two rounds: this place and its position)
  void resolveLocale().then(code => {
    if (uiLanguage !== null) return
    uiLanguage = code
    setLocale(code)
    refreshContextMenu(menuDeps)
  })
  // The keyboard shortcut (UI.md S-P-50): same toggle, third entry
  installToggleCommand({
    onCommand: handler => browser.commands.onCommand.addListener(handler),
    activeTab: async () => (await browser.tabs.query({ active: true, currentWindow: true }))[0],
    send: sendToTab,
    saved,
  })

  // The floating button undoes the page's zoom (§4.0c): every tab is told when its zoom changes. A tab with none of
  // our scripts has nobody listening, and that rejection is nothing to report
  browser.tabs.onZoomChange.addListener(({ tabId, newZoomFactor }) => {
    const message: AxtMessage<'axt:zoom-changed'> = { type: 'axt:zoom-changed', zoom: newZoomFactor }
    void sendToTab(tabId, message).catch(() => undefined)
  })

  browser.tabs.onRemoved.addListener(tabId => dropTab(tabId, 'closed'))
  /**
   * Navigating away withdraws too (Codex on #59): `onRemoved` covers closing only, and a tab moving to another URL
   * does not fire it. And “a new scope on the same tab withdraws the old one” happens only when **the new page is an
   * arXiv paper too** — moved to any other site, the old queue runs on until the batches exhaust their budget.
   *
   * **But loading cannot tell a same-document hash change from a real departure**: measured, clicking a citation in
   * the body that jumps to the references gives a `changeInfo` of just `{status:'loading'}` as well, with no `url` to
   * compare (neither hook carries the `tabs` permission). Withdrawing on the spot sentences a living page to death,
   * and the translations of its second half all come back aborted (reported by the owner on 2026-09-09). So the router
   * holds it for a while: one more request from this tab means the page is still there, and the withdrawal is cancelled
   */
  const onTabUpdated: Parameters<typeof browser.tabs.onUpdated.addListener>[0] = (tabId, changeInfo) => {
    // **Both loading and complete press once.** When a cross-document navigation commits slowly, the old document is
    // still alive after loading, the probe at the deadline reaches it, it answers with the same session, and the
    // withdrawal is let go — then it is gone and nobody asks a second time (Codex on #143). At complete the new document
    // is in place: a same-document hash change still answers “still here”, a real departure answers with a new session or not at all
    if (changeInfo.status === 'loading' || changeInfo.status === 'complete') router.mayHaveLeft(tabId)
  }
  browser.tabs.onUpdated.addListener(onTabUpdated)

  // What this worker answers (./handlers.ts), behind the one listener that knows how to answer (shared/messages.ts)
  browser.runtime.onMessage.addListener(answerMessages(createHandlers({
    chain,
    router,
    offers,
    ocr,
    diagnostics,
    cache: translationCache,
    toggle: tabId => toggleTranslation({ send: sendToTab, saved }, tabId),
    getConfig,
    getFloatingEntry,
    patchFloatingEntry,
    zoomOf: tabId => browser.tabs.getZoom(tabId),
    openSettings: () => browser.runtime.openOptionsPage(),
    environment: async () => ({
      extension: { version: browser.runtime.getManifest().version, buildRef: BUILD_REF },
      browser: navigator.userAgent,
      platform: (await browser.runtime.getPlatformInfo().catch(() => ({ os: 'unknown' }))).os,
    }),
  })))
})
