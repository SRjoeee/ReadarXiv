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
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { isBuiltInService, isLlmChosen } from '@/config/services'
import type { Mode } from '@/core/renderer'
import { promptExists } from '@/providers/prompt-library'
import type { ProviderStatus } from '@/providers/transport'
import type { AxtMessage, EntryStatus, MessageHandlers, PageStatus, sendMessage, sendToActiveTab } from '@/shared/messages'
import type { PackState } from '@/shared/pack'
import { rejectedServices, watchRejected } from '@/shared/service-health'
import { messageFor } from '@/shared/page-action'
import { type SurfaceConfig, type SurfaceConfigDeps, createSurfaceConfig } from '@/shared/surface-config'
import { S } from '@/ui/strings'
import { readQuery } from './find'
import { createProviderAsks } from './provider-asks'
import { MANAGE_PROMPTS, MANAGE_SERVICES, MANAGE_STYLES, type MenuKind, type PopupInput, actionErrorText, runnable, startRefusalText } from './view-model'

export interface PopupActions {
  translate(): void
  /** On an abstract or PDF page: open this paper's HTML version and translate it there */
  openHtml(): void
  /** An abstract or PDF page: the paper's bilingual PDF, where `reading.openIn` says (the reader's design, §2) */
  openPdf(): void
  /** The PDF reader open: show the translation, or the original (`pdfReader.original`; the reader's design, §9.2) */
  readerTranslate(): void
  readerOriginal(): void
  /** A new session over the running one, or after a pause: the page follows the saved settings */
  retranslate(): void
  restore(): void
  chooseMode(mode: Mode): void
  retryFailed(): void
  openMenu(kind: MenuKind): void
  /** Closes that menu if it is the one open — two popovers' toggles may arrive in either order — or, with none, whichever is */
  closeMenu(kind?: MenuKind): void
  /** A service id, a built-in id, or MANAGE_SERVICES */
  chooseService(id: string): void
  chooseLanguage(code: Config['targetLanguage']): void
  choosePrompt(id: string): void
  /** An appearance style id; the page's own config watcher applies it, so no restart */
  chooseStyle(id: string): void
  setHighlight(on: boolean): void
  setImages(on: boolean): void
  downloadPack(): void
  /** P0's field (the redesign's design, §5.4): what it holds now; a paper it names is checked once it has been still */
  setQuery(text: string): void
  /** An address of P0's — a paper translating, arXiv's search — opened in a new tab, the popup closing after it */
  openLink(url: string): void
  /** With `link` omitted, the settings page on its own default section; with it, straight to that row (§6.1's deep links) */
  openOptions(link?: OptionsLink): void
}

/** The settings page's rows the popup's Manage… rows open (the redesign's design, §6.1): it opens the section and lights the row */
export type OptionsLink = 'translate/services' | 'translate/prompts' | 'appearance/styles'

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
  /**
   * The active tab's address, where the extension may read it — arXiv's pages, by its host permission — or null. The
   * host permissions also reach openrouter.ai, translate-pa.googleapis.com, edge.microsoft.com and any origin the
   * reader granted, none of which is a tab whose address this reads
   */
  tabUrl(): Promise<string | null>
  /**
   * P0's two checks of a paper (the redesign's design, §5.4): its HTML version and its bilingual PDF, the address each
   * opens or null for one ruled out, by the PDF page's own rule (core/pdf/entry.ts)
   */
  entriesOf(id: string): Promise<{ html: string | null; pdf: string | null }>
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
/** How long P0's field must be still before the paper it names is checked (the redesign's design, §5.4): never a keystroke */
export const STILL_MS = 300

/**
 * `seed.rejected`: the record of refused keys as it was read before the first render, beside the configuration
 * (main.tsx), so that no state counts a refused service as runnable and then flips (the branch's final review). The
 * read and the watch below keep it current from there
 */
export function createPopupState(host: PopupHost, seed: { rejected?: readonly string[] } = {}): PopupState {
  let page: PageStatus | null = null
  /** What an abstract or PDF page answered; asked only when no full text is there to answer (§4.0b) */
  let entry: EntryStatus | null = null
  let saved: ProviderStatus | null = null
  let session: ProviderStatus | null = null
  let menu: MenuKind | null = null
  let shortcut: string | null = null
  /** The reader's services whose key was refused (the service health record): read as the popup starts, then followed */
  let rejected: readonly string[] = seed.rejected ?? []
  let error: string | null = null
  let running = false
  /**
   * Whether the start() now current is still the one running, read by a callback about to write state it settled
   * after: reassigned fresh by every start(), so a callback from a start already stopped stays guarded even once a
   * later start has set its own flag true (StrictMode's start / stop / start; as `src/ui/use-rejected.ts` guards its
   * effect with `live`)
   */
  let isLive = (): boolean => false
  /** The active tab's address (host.tabUrl): undefined until it answers */
  let tabUrl: string | null | undefined
  /** The first ask about the tab's page has settled: until then nothing is known, and the popup draws its brand row alone */
  let settled = false
  /** P0's field, and its checks: each paper's answer by id, each id asked once, and the timer that waits for stillness */
  let query = ''
  const checked = new Map<string, { html: string | null; pdf: string | null }>()
  const checking = new Set<string>()
  let stillTimer: ReturnType<typeof setTimeout> | null = null

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
  const stopSilent = () => {
    if (silentTimer === null) return
    clearInterval(silentTimer)
    silentTimer = null
    // whether the popup still asks is part of what it shows: an arXiv page still silent is loading, not P0 (§5.4)
    changed()
  }
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
    changed()
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
      // settled with the entry's answer, not before: the moment between would be drawn as P0 (the redesign's design, §5.4)
      host.toTab({ type: 'axt:entry-status' }).then(answer => { entry = answer ?? null; settled = true; changed() }).catch(() => { entry = null; settled = true; changed() })
    }
    host.toTab({ type: 'axt:page-status' })
      .then(status => { if (!status) { askEntry(); return } entry = null; settled = true; setPage(status) })
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
 * With a row only a tab of our own will do — `openOptionsPage` passes no hash, and the settings page tells sections apart by the hash (App.tsx).
 * A reader who clicks “Manage styles…” and lands on “Services” is worse off than one with an extra tab
 */
  const openOptions = (link?: OptionsLink): void => {
    if (!link) host.openOptionsPage()
    else void host.openTab(host.url(`/options.html#${link}`))
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
    if (!runnable(next, packState, rejected)) return // the view shows the page as behind the settings
    // The chain the restart will run on: one built from what was just saved (background/provider-status.ts)
    await asks.saved()
    await host.toTab(messageFor('retranslate', status.epoch) as AxtMessage<'axt:translate-page'>)
  }

  const patchConfig = surface.patch

  /** P0's two checks of a paper, once per id (§5.4): the answer kept, the view told — but not once its start has stopped */
  const check = (id: string) => {
    checking.add(id)
    // A late answer is still that paper's answer, kept for a later start (so it is not asked again); only the
    // notification is withheld once stopped
    void host.entriesOf(id).then(found => { checked.set(id, found) }, () => undefined).finally(() => {
      checking.delete(id)
      if (isLive()) changed()
    })
  }

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
    // The PDF entry: the paper's PDF asking for the reader, translating, opened as the HTML one is — except on the PDF
    // page itself, where it is this page's: its hash alone changes and the reader opens over it. A second tab of the
    // paper on screen answers nothing (Part 5's final review)
    openPdf: () => void guard(async () => {
      const href = entry?.pdf
      if (!href) return
      if (entry?.kind !== 'pdf' && (surface.state().config ?? DEFAULT_CONFIG).reading.openIn === 'new-tab') await host.openTab(href)
      else if (!(await host.toTab({ type: 'axt:open-pdf' }))?.opened) {
        // the page could not open it after all — a source that turned out to be a PDF alone, answered after the popup
        // asked: the popup stays, and asks again, so that the entry greys (Codex on #301)
        entry = (await host.toTab({ type: 'axt:entry-status' }).catch(() => null)) ?? null
        changed()
        return
      }
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
    // opens in it (Devin on #247: the choice was lost, and the popup reported a failure). A display chosen is a
    // translated one: the PDF reader's original goes too (its design, §3), and the reader, open or next, follows. The
    // reader cannot stack: stacked is greyed there, and a call for it does nothing (§9.2)
    chooseMode: (mode: Mode) => void guard(async () => {
      if (entry?.readerOpen && mode === 'stack') return
      if (entry) await patchConfig(latest => ({ ...latest, mode, pdfReader: { ...latest.pdfReader, original: false } }))
      else await host.toTab({ type: 'axt:set-mode', mode })
    }),
    // the PDF reader open: what it shows, through the settings it follows (§9.2)
    readerTranslate: () => void guard(async () => { await patchConfig(latest => ({ ...latest, pdfReader: { ...latest.pdfReader, original: false } })) }),
    readerOriginal: () => void guard(async () => { await patchConfig(latest => ({ ...latest, pdfReader: { ...latest.pdfReader, original: true } })) }),
    retryFailed: () => void guard(async () => { await host.toTab({ type: 'axt:retry-failed' }) }),
    openMenu: kind => { menu = kind; changed() },
    closeMenu: kind => {
      if (kind !== undefined && menu !== kind) return
      menu = null
      changed()
    },
    chooseService: id => void guard(async () => {
      menu = null
      changed()
      // The last row of the menu is not a service: it opens the page where services are managed
      if (id === MANAGE_SERVICES) return void openOptions('translate/services')
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
      if (id === MANAGE_PROMPTS) return void openOptions('translate/prompts')
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
      // The last row is not a style but the place to manage them (S-P-83). Styles are in the Appearance section, their own row
      if (id === MANAGE_STYLES) return void openOptions('appearance/styles')
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
      await patchConfig(latest => ({ ...latest, image: { enabled } }))
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
    setQuery: text => {
      query = text
      if (stillTimer !== null) clearTimeout(stillTimer)
      stillTimer = null
      const named = readQuery(text)
      if (named.kind === 'paper' && !checked.has(named.id) && !checking.has(named.id)) {
        stillTimer = setTimeout(() => { stillTimer = null; check(named.id) }, STILL_MS)
      }
      changed()
    },
    // Everything P0 opens, it opens in a new tab, whatever `reading.openIn` says: that setting is about leaving a
    // paper's page, and the page under this popup is not one (§5.4). The popup goes once the tab is open
    openLink: url => void guard(async () => {
      await host.openTab(url)
      host.close()
    }),
  }

  /**
   * What the view is given. The session's chain only while the page is on — unknown until it answers, never the saved
   * chain in its place (Codex on #185) — and the saved settings' chain for what a start would run on; the tab once its
   * page has been heard from; P0's field with the checks' answer for the paper it names (the redesign's design, §5.4)
   */
  const inputNow = (): PopupInput => {
    const { config, revision: savedRevision, pack } = surface.state()
    const named = readQuery(query)
    const answer = named.kind === 'paper' ? checked.get(named.id) : undefined
    return {
      page, entry, saved, session: on() ? session : null, config, pack, menu, shortcut, savedRevision, rejected,
      tab: settled && tabUrl !== undefined ? { url: tabUrl, asking: silentTimer !== null } : null,
      find: { query, entries: named.kind === 'paper' && answer ? { id: named.id, ...answer } : null },
    }
  }

  return {
    start() {
      running = true
      // This start's own liveness: false once its stop runs below, whether or not a later start has since set its
      // own back to true (the StrictMode remount this guards against)
      let live = true
      isLive = () => live
      const stopSurface = surface.start()
      refresh()
      askWhileSilent()
      // The page is not running until it says so: the saved settings' chain is what a start would run on
      void asks.saved()
      // Guarded like tabUrl below: an answer that lands once this start has stopped must not write or notify
      host.shortcut().then(found => { if (!live) return; shortcut = found; changed() }).catch(() => { if (!live) return; shortcut = null; changed() })
      // the tab's address, where the extension may read it: an arXiv paper's page not answering yet is loading (§5.4)
      host.tabUrl().then(url => { if (!live) return; tabUrl = url; changed() }, () => { if (!live) return; tabUrl = null; changed() })
      // Subscribed first, read after: an event heard while the read is still out means the read answers a moment
      // already superseded, and applying it would overwrite what the event just gave (Codex review, round 3)
      let heardRejected = false
      // A change of the record asks again what a start would run on: the chain in force is rebuilt by the background on
      // any such change, and the retranslate cue (view-model.ts) reads it (the branch's final review)
      const stopRejected = watchRejected(ids => { heardRejected = true; rejected = [...ids]; changed(); void asks.saved() })
      // A read that fails leaves no mark shown, and the watcher still brings the next change. `live` catches what
      // `heardRejected` alone cannot: a read still out when this start stopped, answering only once a later start
      // (StrictMode's start / stop / start) has its own subscription current — this one must not overwrite it
      void rejectedServices().then(ids => { if (live && !heardRejected) { rejected = [...ids]; changed() } }).catch(() => undefined)
      const stopBroadcasts = host.onBroadcast({
        // A pack downloaded on the settings page: this popup's Download button must not stay over an installed pack
        'axt:pack-changed': message => {
          if (message.target) surface.receivePack(message.target)
          return undefined
        },
      })
      return () => {
        running = false
        live = false
        stopSurface()
        stopBroadcasts()
        stopSilent()
        stopPoll()
        stopRejected()
        if (stillTimer !== null) { clearTimeout(stillTimer); stillTimer = null }
      }
    },
    state() {
      snapshot ??= { input: inputNow(), error }
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    actions,
  }
}
