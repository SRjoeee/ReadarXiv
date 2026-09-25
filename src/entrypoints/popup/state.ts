// What the popup knows and what it can do about it (docs/UI.md §4): the page's status and the asks that keep it
// current, the two provider statuses, the open menu, the last error — and the actions, each of which may
// end in a restart of the page on the settings it just saved. No React here: `data.ts` binds it, and the tests drive
// it through this interface with a scripted page and background.
//
// The defects this file has had were nearly all of **order** — an answer that came late, a poll against a click, a
// status shown beside the wrong chain — and order lived in React effects, where no test reached it. The rules:
//
// - The page is asked its status at the start and after every action; while it does not answer, six more times at
//   500 ms (the content script is injected at document_idle); while it translates, every 500 ms (§10 has no "finished").
// - Two provider statuses, never confused (local review): the **saved** settings' chain — asked at the start, whenever
//   the page is not running, after a configuration lands — and the running **session's** own chain, polled while the
//   page is on and dropped when the page reports another session (Codex on #185). provider-asks.ts keeps each honest.
// - A click acts on the epoch read **at the click**, not on the last poll's: an automatic hand-over restart between
//   polls would make the poll's stale and the command refused (local review).
// - A settings change while the page is on restarts it in place, once the background's chain reflects the save; a
//   choice that cannot run only saves, and the view shows the page as behind the settings.
import { type Config, DEFAULT_CONFIG, MODE_VALUES } from '@/config/schema'
import { isBuiltInService, isLlmChosen } from '@/config/services'
import type { Mode } from '@/core/renderer'
import { promptExists } from '@/providers/prompt-library'
import type { ProviderStatus } from '@/providers/transport'
import type { AxtMessage, EntryStatus, MessageHandlers, PageStatus, sendMessage, sendToActiveTab } from '@/shared/messages'
import type { PackState } from '@/shared/pack'
import { messageFor } from '@/shared/page-action'
import { type SurfaceConfig, type SurfaceConfigDeps, createSurfaceConfig } from '@/shared/surface-config'
import { S } from '@/ui/strings'
import { createProviderAsks } from './provider-asks'
import { MANAGE_SERVICES, MANAGE_STYLES, type MenuKind, type PopupInput, actionErrorText, runnable, startRefusalText } from './view-model'

export interface PopupActions {
  translate(): void
  /** On an abstract or PDF page: open this paper's HTML version and translate it there */
  openHtml(): void
  /** An abstract or PDF page: the paper's bilingual PDF, where `reading.openIn` says (the reader's design, §2) */
  openPdf(): void
  /** A new session over the running one, or after a pause: the page follows the saved settings */
  retranslate(): void
  restore(): void
  chooseMode(mode: Mode): void
  retryFailed(): void
  openMenu(kind: MenuKind): void
  closeMenu(): void
  /** A service id, a built-in id, or MANAGE_SERVICES */
  chooseService(id: string): void
  chooseLanguage(code: Config['targetLanguage']): void
  choosePrompt(id: string): void
  /** An appearance style id; the page's own config watcher applies it, so no restart */
  chooseStyle(id: string): void
  setHighlight(on: boolean): void
  setImages(on: boolean): void
  downloadPack(): void
  /** With `section` omitted, opens the settings page on its own default section; with it, straight to that section */
  openOptions(section?: OptionsSection): void
}

/** The settings page's section names, matching SECTIONS in options/App.tsx */
export type OptionsSection = 'services' | 'reading' | 'prompts' | 'data'

/**
 * What the popup needs of the browser: the seam. Production gives the extension's own (`data.ts`); the tests a page
 * and a background that answer by script
 */
export interface PopupHost {
  /** To the active tab's content script; rejects when nothing listens, resolves `undefined` when a listener ignores the message */
  toTab: typeof sendToActiveTab
  toBackground: typeof sendMessage
  /** The background's broadcasts to the open surfaces (`axt:pack-changed`); returns the way to stop */
  onBroadcast(handlers: MessageHandlers): () => void
  openTab(url: string): Promise<unknown>
  /** Brings a settings tab already open to the front rather than opening another */
  openOptionsPage(): void
  /** The extension's URL of a path */
  url(path: string): string
  /** The translate shortcut as bound right now, formatted by Chrome for the platform (⌥T / Alt+T); null when unbound */
  shortcut(): Promise<string | null>
  /** Framed beside the floating button rather than under the toolbar (embedded.ts) */
  embedded: boolean
  close(): void
  /** Download the offline service's pack for a target — from the click itself (shared/pack.ts says why) */
  downloadPack(target: string): Promise<unknown>
  /** The surface configuration's own needs of the page (shared/surface-config.ts) */
  config: Pick<SurfaceConfigDeps, 'localeStale' | 'reload' | 'packState' | 'announce'>
}

export interface PopupState {
  /** Ask, follow and poll; returns the way to stop. Nothing is asked before this */
  start(): () => void
  /** The same object until something changed */
  state(): { input: PopupInput; error: string | null }
  subscribe(listener: () => void): () => void
  actions: PopupActions
}

/** How often the page is asked again: while it does not answer, and while it translates */
const ASK_EVERY_MS = 500
/** How many more times a page that does not answer is asked: it may still be loading */
const ASKS_WHILE_SILENT = 6

export function createPopupState(host: PopupHost): PopupState {
  let page: PageStatus | null = null
  /** What an abstract or PDF page answered; asked only when no full text is there to answer (§4.0b) */
  let entry: EntryStatus | null = null
  let saved: ProviderStatus | null = null
  let session: ProviderStatus | null = null
  let menu: MenuKind | null = null
  let shortcut: string | null = null
  let error: string | null = null
  let running = false

  const listeners = new Set<() => void>()
  let snapshot: { input: PopupInput; error: string | null } | null = null
  const changed = () => {
    snapshot = null
    for (const listener of [...listeners]) listener()
  }

  /**
   * The configuration this popup shows, the digest of its chain settings and the offline service's language pack
   * (§8.4), read, patched and followed by the surface configuration. A configuration that lands after the first — a
   * save here, a change saved elsewhere — is followed by an ask for the chain the background now gives it
   */
  const surface: SurfaceConfig = createSurfaceConfig({
    ...host.config,
    onLanded: (_, from) => { if (from === 'own' || from === 'elsewhere') void asks.saved() },
  })
  surface.subscribe(changed)

  /**
   * Service availability. Re-queried after a pack download and after every config change, or the translate button
   * stays in the state it had when the popup opened. The two asks' bookkeeping is provider-asks.ts: only the newest
   * saved ask publishes; one session ask in flight at a time, given up on after a while so a stalled one cannot hold
   * the polling
   */
  const asks = createProviderAsks({
    send: host.toBackground,
    publishSaved: status => { saved = status; changed() },
    // An answer for a session the page no longer reports publishes nothing
    publishSession: (scope, status) => { if ((page?.session ?? null) === scope) { session = status; changed() } },
  })

  const on = () => page?.progress.state === 'on'

  /** The retry while the page is silent, and the poll while it translates: at most one of each */
  let silentTimer: ReturnType<typeof setInterval> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  const stopSilent = () => { if (silentTimer !== null) clearInterval(silentTimer); silentTimer = null }
  const stopPoll = () => { if (pollTimer !== null) clearInterval(pollTimer); pollTimer = null }
  /**
   * While the page is still loading the content script is not injected yet (document_idle), so the first ask has no
   * receiver; ask again a few times instead of declaring "not an arXiv page" at once (Codex on #3)
   */
  const askWhileSilent = () => {
    stopSilent()
    let attempts = 0
    silentTimer = setInterval(() => {
      if (++attempts > ASKS_WHILE_SILENT) return stopSilent()
      refresh()
    }, ASK_EVERY_MS)
  }

  /** The page's status landed (or its absence did): what follows from how it differs from the one before */
  const setPage = (next: PageStatus | null) => {
    const before = { page, on: on(), session: page?.session ?? null }
    page = next
    // A new session — the page restarted from A to B, or stopped — starts with no chain status of its own: A's
    // hand-overs are not B's (Codex on #185); the next poll fills it
    if ((page?.session ?? null) !== before.session) session = null
    if (running) {
      if (before.page !== null && page === null) askWhileSilent()
      if (page !== null) stopSilent()
      if (on() !== before.on) {
        // The saved settings' chain is asked whenever the page is not running — at the start, and again when it stops.
        // A page that is on shows its session's chain and the polling stops with it: had the first ask failed, nothing
        // would ask again, and the button would stay disabled after “Show original” (local review)
        if (on()) poll()
        else { stopPoll(); void asks.saved() }
      }
    }
    changed()
  }

  const refresh = () => {
    /**
     * The full text answers `axt:page-status`; an abstract or PDF page does not, and then the popup asks what it is
     * instead (UI.md S-P-03b).
     *
     * **A missing answer arrives two ways**: a page with no content script at all rejects ("could not establish
     * connection"), while a page whose content script has a listener that ignores this message **resolves with
     * `undefined`** — which is what the entry pages do, and what put `undefined` where a `PageStatus` was expected.
     * Both are the same thing here: no full text on this tab.
     */
    const askEntry = () => {
      setPage(null)
      host.toTab({ type: 'axt:entry-status' }).then(answer => { entry = answer ?? null; changed() }).catch(() => { entry = null; changed() })
    }
    host.toTab({ type: 'axt:page-status' })
      .then(status => { if (!status) { askEntry(); return } entry = null; setPage(status) })
      .catch(askEntry)
  }

  /**
   * Progress while translation is on: scrolling keeps triggering, there is no "finished" (§10). The replaced-service
   * state lives in the background and is asked alongside — measured at millisecond round-trips (DESIGN §8.0)
   */
  const poll = () => {
    stopPoll()
    pollTimer = setInterval(() => {
      refresh()
      const scope = page?.session ?? null
      if (scope) void asks.session(scope)
      else void asks.saved()
    }, ASK_EVERY_MS)
  }

  const guard = async (run: () => Promise<void>) => {
    error = null
    changed()
    try {
      await run()
    } catch (e) {
      error = actionErrorText(e)
      changed()
    }
    refresh()
  }

/**
 * Open the settings page. **Without a section, `openOptionsPage`**: it brings the tab already open to the front rather than opening another.
 * With a section only a tab of our own will do — `openOptionsPage` passes no hash, and the settings page tells sections apart by the hash (App.tsx).
 * A reader who clicks “Manage styles…” and lands on “Services” is worse off than one with an extra tab
 */
  const openOptions = (section?: OptionsSection): void => {
    if (!section) host.openOptionsPage()
    else void host.openTab(host.url(`/options.html#${section}`))
    // The toolbar's popup closes by itself when another tab takes the focus; framed beside the floating button it
    // would still be open when the reader comes back, so it asks to go (embedded.ts)
    if (host.embedded) host.close()
  }

  /**
   * The three page commands, each decided on the epoch the page reports **at the click** (see the head of this file)
   * and worded by the one place that words them for every door (shared/page-action.ts)
   */
  const epochNow = async () => (await host.toTab({ type: 'axt:page-status' })).epoch
  const begin = async (action: 'translate' | 'retranslate') => host.toTab(messageFor(action, await epochNow()) as AxtMessage<'axt:translate-page'>)
  const showOriginal = async () => host.toTab(messageFor('restore', await epochNow()) as AxtMessage<'axt:restore-page'>)

  /** After a settings change: restart the page on the new settings if it is on and they can run */
  const restartIfOn = async (next: Config, packState: PackState | null) => {
    const status = await host.toTab({ type: 'axt:page-status' }).catch(() => null)
    if (status?.progress.state !== 'on') return
    if (!runnable(next, packState)) return // the view shows the page as behind the settings
    // The chain the restart will run on: one built from what was just saved (background/provider-status.ts)
    await asks.saved()
    await host.toTab(messageFor('retranslate', status.epoch) as AxtMessage<'axt:translate-page'>)
  }

  const patchConfig = surface.patch

  const actions: PopupActions = {
    // The abstract and PDF pages: the page navigates itself to the HTML version, which starts translating on arrival
    // (`#readarxiv`). The popup closes with it, as it does when a click sends the reader elsewhere
    openHtml: () => void guard(async () => {
      const href = entry?.html
      if (!href) throw new Error(S.note.noHtml)
      // A new tab by default (config `reading.openIn`, v16): the abstract or PDF page the reader is on stays where
      // it is. The popup opens it itself — `tabs.create` needs no permission — while “this tab” is the page's own
      // navigation, which needs none either
      if ((surface.state().config ?? DEFAULT_CONFIG).reading.openIn === 'new-tab') await host.openTab(href)
      else {
        const { opened } = await host.toTab({ type: 'axt:open-html' })
        if (!opened) throw new Error(S.note.noHtml)
      }
      host.close()
    }),
    // The PDF entry: the paper's PDF asking for the reader, translating, opened as the HTML one is
    openPdf: () => void guard(async () => {
      const href = entry?.pdf
      if (!href) return
      if ((surface.state().config ?? DEFAULT_CONFIG).reading.openIn === 'new-tab') await host.openTab(href)
      else await host.toTab({ type: 'axt:open-pdf' })
      host.close()
    }),
    // A translate delivered late must not translate a page the reader translated and restored meanwhile (local review)
    translate: () => void guard(async () => {
      const r = await begin('translate')
      if (!r.started) throw new Error(startRefusalText(r))
    }),
    retranslate: () => void guard(async () => {
      const r = await begin('retranslate')
      if (!r.started) throw new Error(startRefusalText(r))
    }),
    restore: () => void guard(async () => {
      const r = await showOriginal()
      if (r.refused) throw new Error(S.page.sessionOver)
    }),
    // The full text switches its layout and saves the preference itself (`axt:set-mode`). An abstract or PDF page
    // has no layout to switch and no listener for that message: there the preference is saved here, and the paper
    // opens in it (Devin on #247: the choice was lost, and the popup reported a failure)
    chooseMode: (mode: Mode) => void guard(async () => {
      if (entry) await patchConfig(latest => ({ ...latest, mode }))
      else await host.toTab({ type: 'axt:set-mode', mode })
    }),
    retryFailed: () => void guard(async () => { await host.toTab({ type: 'axt:retry-failed' }) }),
    openMenu: kind => { menu = kind; changed() },
    closeMenu: () => { menu = null; changed() },
    chooseService: id => void guard(async () => {
      menu = null
      changed()
      // The last row of the menu is not a service: it opens the page where services are managed
      if (id === MANAGE_SERVICES) return void openOptions()
      const next = await patchConfig(latest => (
        // The menu may have been built before another tab deleted this service; storing an id that
        // names nothing would leave the reader looking at a choice nothing honours (Codex on #157)
        isBuiltInService(id) || latest.services.some(s => s.id === id) ? { ...latest, provider: id } : latest
      ))
      if (next.provider !== id) return
      const packState = id === 'chrome-builtin' ? await surface.checkPack(next.targetLanguage) : surface.state().pack
      await restartIfOn(next, packState)
    }),
    chooseLanguage: code => void guard(async () => {
      menu = null
      changed()
      const next = await patchConfig(latest => ({ ...latest, targetLanguage: code }))
      const packState = await surface.checkPack(code)
      await restartIfOn(next, packState)
    }),
    choosePrompt: id => void guard(async () => {
      menu = null
      changed()
      // Same as the service and style menus: this list may have been built before another tab deleted the prompt, and
      // an id that names nothing resolves to the default silently (providers/prompt-library.ts)
      const next = await patchConfig(latest => (promptExists(latest.prompts, id) ? { ...latest, prompts: { ...latest.prompts, promptId: id } } : latest))
      if (next.prompts.promptId !== id) return
      // Any of the reader's services is an LLM, and each is chosen through its own id — comparing
      // against 'openai-compat' was never true after v12, so the page kept the old prompt (Codex on #157)
      if (isLlmChosen(next)) await restartIfOn(next, surface.state().pack)
    }),
    // The page's config watcher redraws the translations in the new style; no session restarts
    chooseStyle: id => void guard(async () => {
      menu = null
      changed()
      // The last row is not a style but the place to manage them (S-P-83). Styles live in the “Reading” section, so the section goes along
      if (id === MANAGE_STYLES) return void openOptions('reading')
      // Same as the service menu: this list may have been built before another tab deleted the
      // profile, and a dangling id leaves every profile unmarked while the page reads the first
      // one (Codex on #161)
      await patchConfig(latest => (
        latest.appearance.styles.some(p => p.id === id) ? { ...latest, appearance: { ...latest.appearance, activeStyle: id } } : latest
      ))
    }),
    // Both switches are applied live by the page's own config watcher; nothing to send
    setHighlight: enabled => void guard(async () => {
      await patchConfig(latest => ({ ...latest, reading: { ...latest.reading, sentenceHighlight: enabled } }))
    }),
    setImages: enabled => void guard(async () => {
      // A reader who had unticked every mode migrates with an empty list; switching image
      // translation back on then shows as enabled while no mode can run it (Codex on #157)
      await patchConfig(latest => ({ ...latest, image: { enabled, modes: enabled && latest.image.modes.length === 0 ? [...MODE_VALUES] : latest.image.modes } }))
    }),
    // From the click itself (shared/pack.ts says why); the menu shows a spinner meanwhile
    downloadPack: () => void guard(async () => {
      const config = surface.state().config
      if (!config) return
      await surface.downloadPack(config.targetLanguage, host.downloadPack)
      // The service chain lives in background (§8.0): have it rebuild one so the now-usable offline
      // service is back on it. The promise shown next to this button is about **this** tab, so only
      // its session moves onto the new chain (Codex on #157)
      await host.toBackground({ type: 'axt:engine-ready', id: 'chrome-builtin', ...(page?.session ? { scope: page.session } : {}) }).catch(() => undefined)
      void asks.saved()
    }),
    openOptions,
  }

  return {
    start() {
      running = true
      const stopSurface = surface.start()
      refresh()
      askWhileSilent()
      // The page is not running until it says so: the saved settings' chain is what a start would run on
      void asks.saved()
      host.shortcut().then(found => { shortcut = found; changed() }).catch(() => { shortcut = null; changed() })
      const stopBroadcasts = host.onBroadcast({
        // A pack downloaded on the settings page: this popup's Download button must not stay over an installed pack
        'axt:pack-changed': message => {
          if (message.target) surface.receivePack(message.target)
          return undefined
        },
      })
      return () => {
        running = false
        stopSurface()
        stopBroadcasts()
        stopSilent()
        stopPoll()
      }
    },
    state() {
      const { config, revision: savedRevision, pack } = surface.state()
      // The view gets both: the session's chain only while the page is on — unknown until it answers, never the saved
      // chain in its place (Codex on #185) — and the saved settings' chain for what a start would run on
      snapshot ??= { input: { page, entry, saved, session: on() ? session : null, config, pack, menu, shortcut, savedRevision }, error }
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    actions,
  }
}
