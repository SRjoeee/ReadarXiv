// The page's translation session (DESIGN §4.3): everything the content entry used to hold, behind one
// object whose dependencies are injected so the whole lifecycle runs under vitest against a
// happy-dom document and fake backends. The content entry only maps browser messages onto it.
//
// One session = one run (observer and requests) + one id as the cancellation scope (DESIGN §10).
// The id belongs to this object: `start()` mints one and every callback of that run closes over
// `alive()`; after `restore()` or a restart, results that arrive late are dropped there.
import { type RenderPath, wireFormatOf } from '@/cache/key'
import { type Look, lookOf } from '@/config/appearance'
import { DEFAULT_CONFIG, type Config } from '@/config/schema'
import type { Block } from '@/core/extractor'
import type { PaperContext } from '@/core/extractor/context'
import { collectImageTargets, startImageTranslation, type ImageBytes, type ImageRun, type ImageTarget } from '@/core/image'
import { type NameEvidence, nameEvidence } from '@/core/names'
import { startTranslation, type Progress, type TranslationRun } from '@/core/pipeline'
import { escapeText, unescapeText } from '@/core/protector/escape'
import {
  applyStyle, createModeController, createPlaceKeeper, createPrep, installAnchorFallback, type Mode, type ModeController, relabelFailed, restore, type SentenceHighlight, setImageModes,
  startSentenceHighlight,
} from '@/core/renderer'
import { translateCall } from '@/core/run/call'
import { createSerialQueue } from '@/core/scheduler/serial'
import { newSessionId } from '@/core/scheduler/session'
import { translateTitle, type TitleTranslator } from '@/core/scheduler/title'
import type { TranslationTransport } from '@/providers/transport'
import { isFigureText, visibleText } from '@/core/rules/latexml'
import { isPermanentErrorKind, type TranslateContext } from '@/providers/types'
import type { PageStatus } from '@/shared/messages'
import type { ImageProgress, OcrCall, OcrMessageResponse } from '@/shared/ocr'
import { createIdleTrace } from './idle-trace'
import { parseFatal } from '@/core/pipeline/fatal'

export interface SessionDeps {
  doc: Document
  blocks: Block[]
  /** The arXiv id; null when this is not a paper page */
  paper: string | null
  /** Title and abstract, extracted once before any translation is on the page */
  context: PaperContext
  /** The background's translation chain, behind the message transport */
  backend: TranslationTransport
  /** OCR of one bitmap (`axt:ocr`) */
  ocr: (call: OcrCall) => Promise<OcrMessageResponse>
  /** Bytes of one bitmap; the image pipeline's own `fetch` through the HTTP cache when absent (tests inject) */
  fetchImage?: (url: string, signal?: AbortSignal) => Promise<ImageBytes>
  config: { get(): Promise<Config>; set(config: Config): Promise<void> }
  /** Switch the words this script puts on the page to the interface's language (UI.md §6) */
  applyLocale: (uiLanguage: string) => void
  /** Debug lines; the e2e suites read some of them (`session idle`, `translation stopped`) */
  trace?: (line: string) => void
  /**
   * The page began or stopped showing its translation (`progress.state` moved): whatever on the page says which of
   * the two it is — the floating button's tick (DESIGN §4.0c) — follows from here, whoever asked for the change
   */
  onState?: (state: Progress['state']) => void
}

/** Why a start was refused; the popup turns the code into the interface's sentence (DESIGN §4.2: the core knows no locale pack) */
export type StartRefusal = 'already-on' | 'session-over' | 'not-paper' | 'nothing-to-translate' | 'backend-silent' | 'no-service'

export type StartResult = { started: true; reason?: undefined; detail?: undefined } | { started: false; reason: StartRefusal; detail?: string }

export interface PageSession {
  /** The first configuration read has finished (whether or not it succeeded); `status()` waits for it */
  ready: Promise<void>
  /**
   * `restart` replaces a running session in place. `from` is the session an **automatic** restart was
   * decided in: the reads inside are awaited, and the reader may restore the page during them —
   * a stale continuation must not translate the page again (Codex on #157)
   */
  /** `from`: the session a restart was decided on; `epoch`: the page's action epoch a command was decided on — either, stale, refuses the start */
  start(requested?: Mode, restart?: boolean, from?: string, epoch?: string): Promise<StartResult>
  /** Back to the original page: stop everything, remove every injected node and attribute */
  /** `from`: the session the restore was decided on; once it has ended the restore is not the reader's and does nothing */
  /** `epoch`: the page's action epoch the restore was decided on; an earlier one, or another document's, is refused */
  restore(epoch?: string): { removedNodes: number; refused?: true }
  /** Switch side / stack / only without a new session; the preference is persisted */
  setMode(mode: Mode): Promise<{ mode: Mode; effective: Mode }>
  /** Hand blocks to the running text pipeline (retry, tests); nothing outside a session */
  translate(blocks: Block[]): Promise<void>
  /** Hand images to the running image pipeline — all of this session's targets by default (retry, tests) */
  translateImages(targets?: ImageTarget[]): Promise<void>
  /** Retry every failed block and image; returns how many were handed back */
  retryFailed(): number
  /** A configuration change while the page is open (the `watchConfig` subscriber) */
  onConfig(config: Config): void
  status(): Promise<PageStatus>
}

/**
 * One round of image translation (§15): what `startImages` creates. The settings can switch image translation within a
 * session, and the round is then replaced whole — nothing of the previous one stays reachable
 */
interface ImageRound {
  run: ImageRun
  targets: ImageTarget[]
  progress(): ImageProgress | null
}

/**
 * What one start creates, ended as one (`endLive`). It used to be fifteen variables reset by four lists, which had
 * begun to differ; a callback of a session is alive while the record it closed over is the one in force
 */
interface LiveSession {
  /** The session id: the cancellation scope of every request it makes (DESIGN §10) */
  id: string
  /** The start-time inputs, for the parts a settings change can restart on their own (images) */
  config: Config
  context: TranslateContext
  renderPath: RenderPath
  /** What the session runs on (PageStatus.running) */
  running: NonNullable<PageStatus['running']>
  /**
   * Whether this session has already been restarted by a permanent hand-over. **One per session**: kept across
   * sessions it would suppress the restart a later service needs when that one hands over to the same engine
   * (Codex on #157), and unbounded within a session it could chase a chain down step by step
   */
  restarted: boolean
  /** The mode in effect is the controller's call by viewport (§7.2); the preference the reader switches to on this page */
  modes: ModeController
  /** The teardown of the in-page anchor fallback (issue #44) */
  uninstallAnchors: () => void
  /** The hover highlight (§7.7); with the setting off no listener is attached at all */
  highlight: SentenceHighlight | null
  // Null while the record is being built: a run may call back as it starts, and the record has to be in force by then
  run: TranslationRun | null
  title: TitleTranslator | null
  images: ImageRound | null
}

/**
 * The paper's running text, the evidence of the name rule (§15.1): the visible text of the text blocks — formulas and
 * code left out, as for every test on what a reader sees (§5.3) — less the labels of a figure drawn in the paper
 * (§15.6), which are what the rule is asked about, not evidence of it
 */
function proseOf(blocks: readonly Block[]): string {
  return blocks.filter(block => block.kind === 'text' && !isFigureText(block.el)).map(block => visibleText(block.el)).join('\n')
}

export function createPageSession(deps: SessionDeps): PageSession {
  const { doc, blocks, paper, backend } = deps
  const trace = deps.trace ?? (() => undefined)
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  /**
   * The session in force; null on a page that shows no translation. It stays after a fatal error stopped its run —
   * the translations are still on the page, and the mode still switches — until the next start or a restore.
   * No record, no mode controller: no data-axt-mode is written onto an untranslated page, and the popup sees the
   * configured preference
   */
  let live: LiveSession | null = null
  /**
   * The reader's place across the relayouts done on their behalf (renderer/place.ts): a start, a restore, a change of
   * the mode in effect, the tidy layer's full pass. Told **before** the writes, each time; it lives as long as the page
   */
  const place = createPlaceKeeper(doc, blocks)
  /** The page's prose read for names once, when a figure first needs it: the blocks are the page's, whichever session asks */
  let evidence: NameEvidence | undefined
  const names = (): NameEvidence => {
    if (evidence) return evidence
    const t0 = now()
    const prose = proseOf(blocks)
    evidence = nameEvidence(prose)
    trace(`names: ${prose.length} characters of prose read in ${Math.round(now() - t0)} ms`)
    return evidence
  }
  /**
   * The mode the reader saved. **A status request waits for it to come back**: the popup stops retrying the moment
   * it gets a non-empty status, so any guess before then may pin the mode bar on the wrong stop — a reader who
   * upgraded has “stack” stored while the default is “side” (Codex on #161, in two rounds: the default, then the
   * guessing itself). The default is only the fallback for a failed read
   */
  let savedMode: Mode = DEFAULT_CONFIG.mode
  /** `setMode`'s saves and the re-reads of the stored mode, one after another (core/scheduler/serial.ts) */
  const modeSaves = createSerialQueue()
  let configRead: () => void = () => undefined
  const ready = new Promise<void>(resolve => { configRead = resolve })
  /** The translation's appearance (§7.5): the style and highlight profiles the reader chose, written as attributes and variables on <html> */
  let look: Look = lookOf(DEFAULT_CONFIG)
  /**
   * The appearance has three writers: the read at start-up, the read in start(), and onConfig. The first two are
   * “snapshots at the time of the request”, and only the watcher holds the newest value, so once the watcher has
   * written, no configuration read may put the style back to an older snapshot — the appearance the settings page
   * just saved would otherwise be swallowed by one late await result, and the storage event has been consumed and
   * does not come again (Codex on #106, in two rounds, one per reader). The two readers share this one gate rather
   * than judging on their own
   */
  let styleFromWatcher = false
  const adoptStyle = (next: Look) => {
    if (!styleFromWatcher) look = next
  }
  /**
   * The same gate for the interface's language: this read is a snapshot from when it was issued,
   * and a language chosen while it was in flight would be undone by its continuation — the paper
   * would keep the previous language until some other configuration event came along
   * (Codex on #161, the same shape as the appearance read above)
   */
  const adoptLocale = (uiLanguage: string) => {
    if (!styleFromWatcher) deps.applyLocale(uiLanguage)
  }
  void deps.config.get()
    .then(config => { savedMode = config.mode; adoptLocale(config.uiLanguage); adoptStyle(lookOf(config)) })
    // A failed read lets it through too: the popup would show “reading” for ever without an answer, and the defaults are at least a usable one
    .catch(e => trace(`configuration read failed (${e instanceof Error ? e.name : typeof e}), answering with the defaults for now`))
    .finally(() => configRead())

  /**
   * The page's action epoch (PageStatus.epoch): every start that commits and every restore moves the counter, and
   * the document's own id keeps a command decided on another document — the same tab before a reload — from
   * matching by count alone (local review)
   */
  const documentId = newSessionId()
  let actions = 0
  const epochNow = () => `${documentId}#${actions}`
  const idle = (): Progress => ({ state: 'idle', total: blocks.length, requested: 0, done: 0, failed: 0, cached: 0, inFlight: 0 })
  let progress: Progress = idle()
  /** The one place `progress` is written, so a change of state is told exactly once (`deps.onState`) */
  const setProgress = (next: Progress) => {
    const moved = next.state !== progress.state
    progress = next
    if (moved) deps.onState?.(next.state)
  }

  /**
   * End the session in force, everything a start created: disconnect the observers, remove the pending nodes, take
   * the mode controller and the anchor fallback off, withdraw the queued and in-flight requests. The translations on
   * the page stay — taking them off is `restore`'s
   */
  function endLive(): void {
    const ended = live
    if (!ended) return
    // First: every callback of the ended session is dead from here on
    live = null
    ended.highlight?.stop()
    ended.title?.stop()
    ended.run?.stop()
    ended.images?.run.stop()
    ended.modes.stop()
    ended.uninstallAnchors()
    // Withdrawing requests is best effort: queued batches are not sent, an in-flight fetch is aborted, and what cannot be withdrawn is stopped by each callback's alive()
    void backend.cancel(ended.id)
  }

  /**
   * Overlapping starts are one start. A second click or key press while the first is still asking its status must
   * not mint a second session: both would be bound provisionally, the first's first request would drop the second
   * as the tab's stale scope, and the second would then take the page over with a dead scope — every request of
   * it aborted (local review). The later caller gets the earlier start's outcome
   */
  let starting: { key: string; promise: Promise<StartResult> } | null = null
  function start(requested?: Mode, restart = false, from?: string, epoch?: string): Promise<StartResult> {
    // The same request twice is one start; a different one — another epoch, a restart over a plain start — waits for
    // the one in flight and is then judged on its own terms against the page as it is by then: a restart made
    // obsolete by a restore must not swallow the translate the reader asked for after it
    const key = `${requested ?? ''}|${restart}|${from ?? ''}|${epoch ?? ''}`
    if (starting?.key === key) return starting.promise
    // A start that throws — the settings unreadable, a crash in the run's own synchronous start (DESIGN §10) — reaches
    // its caller as a failure. The line is for the diagnostics log, which shows what the page did: the error's name
    // only, since a message may be an endpoint's (Codex on #214)
    const run = () => begin(requested, restart, from, epoch).catch(e => {
      console.error('[axt] start failed', e)
      trace(`start failed (${e instanceof Error ? e.name : typeof e}; message withheld)`)
      throw e
    })
    const promise: Promise<StartResult> = (starting ? starting.promise.then(run, run) : run()).finally(() => { if (starting?.promise === promise) starting = null })
    starting = { key, promise }
    return promise
  }

  /**
   * `from`: the session a restart was decided on (the automatic restart after a permanent hand-over names its own).
   * `epoch`: the page's action epoch a command from the popup or the toggle was decided on. Either, when given and
   * stale, refuses the start: the page moved on since the decision
   */
  async function begin(requested?: Mode, restart = false, from?: string, epoch?: string): Promise<StartResult> {
    if (progress.state === 'on' && !restart) return { started: false, reason: 'already-on' }
    if (from !== undefined && live?.id !== from) return { started: false, reason: 'session-over' }
    if (epoch !== undefined && epoch !== epochNow()) return { started: false, reason: 'session-over' }
    if (!paper) return { started: false, reason: 'not-paper' }
    if (blocks.length === 0) return { started: false, reason: 'nothing-to-translate' }
    const tStart = now()
    const config = await deps.config.get()
    // The glossary goes out with every batch (§8.2). **An empty glossary omits the field**: with it every existing cache key would change at once, invalidating everything
    const context: TranslateContext = config.glossary.length > 0 ? { ...deps.context, glossary: config.glossary } : deps.context
    // The engine chain lives in the background; only the capabilities batch planning and render-path choice need are taken here (§2 item 3)
    // The session id is minted before the status is asked: the status request carries it, and the background binds
    // the session to the chain it answers about — a chain built from the configuration as stored now (`fresh`). The
    // target and the revision the session runs on come from that chain, not from the configuration read above: a
    // save between the two would otherwise leave the session pinned to a chain other than the settings it records
    // (local review). Nothing awaits after the state below is committed
    const session = newSessionId()
    let status: Awaited<ReturnType<typeof backend.status>>
    try {
      status = await backend.status(session, { fresh: true })
    } catch (e) {
      return { started: false, reason: 'backend-silent', detail: e instanceof Error ? e.message : String(e) }
    }
    // The status request bound this session to a chain provisionally (provider-status.ts). A start refused from here
    // on never makes the request that would settle that binding, and the abandoned scope would keep its chain and
    // engines alive until the tab's next session took over (Codex on #184): a refusal releases it
    const release = (reason: StartRefusal): StartResult => {
      void backend.cancel(session)
      return { started: false, reason }
    }
    // The first choice unavailable while the chain still has a fallback: start as usual, the requests land straight on the free engine (§8.5)
    if (!status.available && !status.fallback) return release('no-service')
    // The reader may have restored the page while the two reads above were in flight
    if (from !== undefined && live?.id !== from) return release('session-over')
    if (epoch !== undefined && epoch !== epochNow()) return release('session-over')
    trace(`start: ready in ${Math.round(now() - tStart)} ms, since page start ${Math.round(tStart)} ms`)

    // From here to the end of this function the page is written to, and laid out anew once: the reader's place first
    place.keep()
    endLive() // the previous session, stopped but not restored (a restart, or a retry after a fatal error)
    adoptStyle(lookOf(config))
    const startEngine = status.engine.id
    const target = status.targetLanguage
    const started: LiveSession = {
      id: session,
      config,
      context,
      renderPath: status.renderPath,
      running: { provider: status.chosen, target, engine: startEngine, revision: status.revision },
      restarted: false,
      modes: createModeController(doc, requested ?? config.mode, { beforeChange: () => place.keep(), onChange: enterSide }),
      // The in-page anchor fallback (issue #44): in only mode the target block is hidden, and a clicked cross-reference goes nowhere
      uninstallAnchors: installAnchorFallback(doc),
      // Attached on this path only: with no translation on there is no translation, and nothing to compare
      highlight: config.reading.sentenceHighlight ? startSentenceHighlight(doc) ?? null : null,
      run: null,
      title: null,
      images: null,
    }
    // In force before anything below starts: a run may call back as it starts
    live = started
    actions++
    const alive = () => live === started
    setProgress({ ...idle(), state: 'on' })
    prep.reset() // a new session: the mirrors may run once more, the width cache is cleared, the column width is re-read
    enterSide(started.modes.effective())
    // Each busy → idle transition is one line the e2e suites read (idle-trace.ts)
    const traceIdle = createIdleTrace<Progress>({ now, trace }, p => p.inFlight > 0, (p, ms) =>
      // The fatal's kind only: the message is the endpoint's, and the trace reaches the diagnostics log (Codex on #214)
      `session idle: ${p.done}/${p.requested} requested of ${p.total}, ${p.failed} failed, ${p.cached} cached, ${ms} ms${p.fatal ? `, fatal: ${parseFatal(p.fatal).kind}` : ''}`)
    started.run = startTranslation({
      doc,
      blocks,
      target,
      mode: started.modes.effective(),
      appearance: look,
      paper,
      // The title + the abstract go with every batch (DESIGN §8.2)
      context,
      capabilities: { maxBatchChars: status.maxBatchChars, maxBatchItems: status.maxBatchItems, renderPath: status.renderPath },
      transport: request => backend.translate(request),
      scope: session,
      preload: config.preload,
      // A figure's text — the labels inside a picture, blocks like any other (§15.6) — is asked for where the reader
      // has figures translated, the images' gate: refused, a label waits unasked and the gate opening offers it again
      admit: block => !isFigureText(block.el) || (started.config.image.enabled && started.config.image.modes.includes(started.modes.effective())),
      // The blocks this batch just touched go to the tidy layer: only their containers are touched, no whole-paper re-scan per pass (issue #46)
      onRendered: rendered => {
        if (!alive()) return
        prep.touch(rendered)
      },
      onProvider: id => {
        if (!alive()) return
        started.running.engine = id
        if (id === startEngine || started.restarted) return
        // A permanent hand-over (missing or rejected key) would leave the paragraphs already on
        // screen from one service and the rest from another. Start over on the service that is
        // actually available, so the whole page reads from one hand (UI.md, decided 2026-09-10).
        // Temporary hand-overs (rate limits, timeouts) keep going: they come back on their own
        void backend.status(session).then(s => {
          if (!alive()) return
          // Ask **this session's own chain** about **this session's own engine**: the page keeps
          // the chain it started on while another tab changes the settings, and the most recent
          // hand-over may belong to some intermediate free engine that failed transiently
          // (Codex on #157)
          const kind = s.demotions.find(d => d.id === startEngine)?.kind
          if (kind === undefined || !isPermanentErrorKind(kind)) return
          started.restarted = true
          trace(`hand-over to ${id} is permanent (${kind}); restarting the page on it`)
          void start(undefined, true, session)
        }).catch(() => undefined)
      },
      onProgress: p => {
        // The session has ended (restore / restart): an old run's callbacks are ignored
        if (!alive()) return
        setProgress(p)
        traceIdle(p)
      },
    })
    // The tab title is translated too (§10): the same service, the same cache; the title is plain text, escaped and decoded by the placeholder protocol
    started.title = translateTitle(doc, {
      isCurrent: alive,
      warn: trace,
      translate: async text => {
        // The same envelope as the runs' (run/call.ts): an empty context is left out here too
        const res = await backend.translate(translateCall(
          { target, paper, scope: session, context },
          [{ id: 'document.title', text: escapeText(text, wireFormatOf(status.renderPath)) }],
          status.renderPath,
        ))
        return res.ok ? unescapeText(res.result.segments[0]?.text ?? '', wireFormatOf(status.renderPath)) || null : null
      },
    })
    started.images = startImages(started, config)
    return { started: true }
  }

  /**
   * Image translation (§15): images are taken by viewport like text blocks, and the page's translation does not wait
   * for them; with the current mode outside the reader's ticked set, an image entering the viewport parks and is
   * translated on switching back
   */
  function startImages(session: LiveSession, config: Config): ImageRound | null {
    // The overlays and the mode gate of the previous round (restarted after a fatal error without a restore) are taken
    // off first: with image translation off or the target language changed, the old ones must not
    // show; the new round replaces them when it reaches the image (Codex on #89)
    setImageModes(doc, [])
    if (!config.image.enabled || config.image.modes.length === 0) return null
    // The display gate is a figure's text's too (§15.6), and that needs no round: a paper may hold pictures and not one image
    setImageModes(doc, config.image.modes)
    if (!paper) return null
    const targets = collectImageTargets(doc)
    if (targets.length === 0) return null
    const alive = () => live === session

    let progress: ImageProgress | null = null
    // Read by callbacks that may fire while the run starts
    let run: ImageRun | null = null
    const traceIdle = createIdleTrace<ImageProgress>({ now, trace }, p => p.requested - p.done - p.failed > 0, (p, ms) => `images idle: ${p.done}/${p.requested} of ${p.total}, ${p.failed} failed, ${ms} ms${waitingNote()}`)
    /** Names the targets never requested when idle arrives with some left over — the e2e's one nondeterministic check, `5/5 of 6`, needs to say which image and whether it was parked */
    const waitingNote = () => {
      const left = run?.waiting() ?? []
      if (left.length === 0) return ''
      const shown = left.slice(0, 8).map(w => `${w.target.id || w.target.kind}${w.parked ? ' (parked)' : ''}`)
      return `; waiting: ${shown.join(', ')}${left.length > 8 ? `, +${left.length - 8}` : ''}; observer holds ${run?.observing() ?? 0}`
    }
    run = startImageTranslation({
      renderPath: session.renderPath,
      doc,
      targets,
      paper,
      // The target the session runs on — the chain's, recorded at start (see `running`), not the configuration's
      target: session.running.target,
      scope: session.id,
      preload: config.preload,
      context: session.context,
      names,
      ocr: call => deps.ocr(call),
      translate: request => backend.translate(request),
      onTrace: line => trace(line),
      ...(deps.fetchImage ? { fetchBytes: deps.fetchImage } : {}),
      // The mode gate, the same for both kinds of image
      isEnabled: () => config.image.enabled && config.image.modes.includes(session.modes.effective()),
      isCurrent: alive,
      onProgress: p => {
        if (!alive()) return
        progress = p
        traceIdle(p)
      },
      // The overlay is in: in side mode the figure it sits in is split in two (§7.2), the tidy layer's job
      onRendered: rendered => {
        if (!alive()) return
        prep.touch(rendered)
      },
    })
    trace(`images: ${targets.filter(t => t.kind === 'svg').length} SVG + ${targets.filter(t => t.kind === 'raster').length} bitmaps, modes ${config.image.modes.join('/')}`)

    const round: ImageRound = { run, targets, progress: () => progress }
    return round
  }

  /**
   * The tidy after a translation arrives (DESIGN §7.2 / §10, issue #46): footnote placement, split figures, mirrors,
   * table fitting, margin alignment. Driven by the dirty blocks the pipeline hands over per batch, each pass touching
   * only their containers; the mirrors run once per session; the column width is read at the start of a pass,
   * before anything is written. All of it is renderer/prep.ts; this only wires it up
   */
  const prep = createPrep(doc, {
    isSide: () => live?.modes.effective() === 'side',
    trace,
    keepPlace: () => place.keep(),
    // The split copies' failure widgets retry through the run, as the original's side does (issue #170)
    retry: blockId => {
      const block = live?.run?.failed().find(b => b.id === blockId)
      if (block) void live?.run?.translate([block])
    },
  })

  /**
   * The mode in effect moved, or a session started in it: what waited for the mode may go, and the tidy layer enters
   * or leaves side — what that takes is its own to know (renderer/prep.ts `side`)
   */
  function enterSide(effective: Mode): void {
    // The mode gate may have just opened: parked images are released (§15), and the figures' text held with them (§15.6)
    live?.images?.run.resume()
    live?.run?.resume()
    prep.side(effective === 'side')
  }

  async function setMode(mode: Mode): Promise<{ mode: Mode; effective: Mode }> {
    // With no translation on the page there is nothing to lay out: the choice is a preference, saved for the start
    // that reads it. No controller, no attribute on <html> — nothing is written before a translation starts
    // (DESIGN §4.1), and nothing would take a controller made here down again. On a translated page the switch is
    // immediate; only the save below waits
    const effective = live ? live.modes.choose(mode) : mode
    if (live) enterSide(effective)
    // **Saved in order**: each save reads the store and compares, so two choices in quick succession, both reading
    // before either wrote, would leave the store on the first while the page shows the second
    await modeSaves(async () => {
      // After the first configuration read, which writes the same variable: a choice made before it came back would
      // be overwritten by the stored mode it carries
      await ready
      const config = await deps.config.get()
      if (config.mode !== mode) await deps.config.set({ ...config, mode })
      // Recorded once stored. A refused save (the stored settings cannot be read, config/storage.ts) rejects above
      // and leaves the preference as it was: on a translated page the switch holds for the page, on an untranslated
      // one nothing changed, and the caller tells the reader it was not saved
      savedMode = mode
    })
    return { mode, effective }
  }

  /**
   * Re-read the stored mode on the chain the saves run on, after the first read: whatever order the events and the
   * first read's snapshot arrive in, the last word is a read made after every write this page knows of
   */
  function refreshSavedMode(): void {
    // A failed read leaves the preference as it was; the next event, or the next save, reads again
    void modeSaves(async () => {
      await ready
      savedMode = (await deps.config.get()).mode
    }).catch(() => undefined)
  }

  function restorePage(epoch?: string): { removedNodes: number; refused?: true } {
    if (epoch !== undefined && epoch !== epochNow()) return { removedNodes: 0, refused: true }
    actions++
    place.keep()
    endLive()
    prep.reset()
    const result = restore(doc)
    setProgress(idle())
    trace(`translation stopped: ${result.removedNodes} nodes removed`)
    return { removedNodes: result.removedNodes }
  }

  // An appearance changed on the settings page applies at once (#47): only the injected sheet and the attributes on
  // <html> are recomputed, not one translation node is touched, and no translation is requested again (§8.5's
  // chainConfigChanged ignores style anyway). A subscription rather than a message: the settings page is itself the
  // active tab and cannot reach the content page; a subscription also updates every open paper at once
  function onConfig(config: Config): void {
    // The gate first, the comparison after: the watcher firing means it holds the newest stored content, even when
    // nothing needs redrawing this time. Otherwise “the page started with the old appearance + the reader clicks
    // restore defaults” takes the equal-value fast path, the gate is not raised, and the old snapshot from the
    // following getConfig() puts the non-default appearance back (Codex on #106)
    styleFromWatcher = true
    // The stored mode, changed here or in another tab: an untranslated page reports it and its next start uses it.
    // A translated page keeps its own switch (the controller's preference) until it is restored. **Read from the store,
    // not taken from the event**: storage events carry no order (#182), and one for an earlier write arriving late
    // would put an older mode back
    refreshSavedMode()
    // The hover highlight is a front-page toggle (UI.md S-P-80), so it takes effect on this page
    // at once: installed or torn down mid-session, no translation node touched. Outside a session
    // there is nothing to pair, and start() reads the setting itself
    if (live?.run) {
      if (config.reading.sentenceHighlight && !live.highlight) live.highlight = startSentenceHighlight(doc) ?? null
      else if (!config.reading.sentenceHighlight && live.highlight) {
        live.highlight.stop()
        live.highlight = null
      }
    }
    // The preload range (UI.md S-O-50): the whole-paper stop reaches an open paper at once — everything still waiting
    // for the viewport is handed to both runs now. Any other change applies from the next session: a running
    // observer's distance cannot be moved, and what was requested cannot be taken back (Devin on #222)
    if (live?.run && config.preload.margin === 'all' && live.config.preload.margin !== 'all') {
      live.run.release()
      live.images?.run.release()
    }
    if (live) live.config = { ...live.config, preload: config.preload }
    // Image translation, both the switch (popup) and the per-mode list (settings): on starts the
    // image run for this session, off stops it and hides every overlay through the display gate,
    // and a change to the modes has to reach both the gate and the run that reads it — otherwise
    // unticking the current mode leaves the overlays up and keeps requesting (Codex on #157).
    // The text run is not touched either way
    if (live?.run && (config.image.enabled !== live.config.image.enabled || config.image.modes.join(' ') !== live.config.image.modes.join(' '))) {
      live.config = config
      // The round is replaced whole: stopped, out of the record, its display gate closed — and a new one only when
      // image translation is still on
      live.images?.run.stop()
      live.images = null
      setImageModes(doc, [])
      if (config.image.enabled) live.images = startImages(live, config)
      // The same gate holds the figures' text back in the text run (§15.6), and under side decides which member of
      // a label's pair a figure's copy holds: the figures with labels are tidied again, their copies' keys having moved
      live.run.resume()
      prep.touch(blocks.filter(block => isFigureText(block.el)))
    }
    // The language changed: the failure widgets already drawn copied the words into their own shadow roots and have to be rewritten (Codex on #161)
    deps.applyLocale(config.uiLanguage)
    relabelFailed(doc)
    const next = lookOf(config)
    if (JSON.stringify(next) === JSON.stringify(look)) return
    look = next
    applyStyle(doc, look)
  }

  return {
    ready,
    start,
    restore: restorePage,
    setMode,
    translate: picked => live?.run?.translate(picked) ?? Promise.resolve(),
    translateImages: picked => live?.images?.run.translate(picked ?? live.images.targets) ?? Promise.resolve(),
    retryFailed() {
      const failed = live?.run?.failed() ?? []
      void live?.run?.translate(failed)
      const failedImages = live?.images?.run.failed() ?? []
      void live?.images?.run.translate(failedImages)
      return failed.length + failedImages.length
    },
    // No round — image translation off, or switched off since — has nothing to release, and says so
    onConfig,
    // Wait for the first configuration read: one answer settles this round's popup mode bar (see the note on savedMode)
    status: () => ready.then(() => {
      const images = live?.images?.progress() ?? null
      return {
        paper,
        mode: live?.modes.effective() ?? savedMode,
        preference: live?.modes.preference() ?? savedMode,
        progress,
        session: live?.id ?? null,
        epoch: epochNow(),
        ...(images ? { images } : {}),
        ...(live ? { running: live.running } : {}),
      }
    }),
  }
}
