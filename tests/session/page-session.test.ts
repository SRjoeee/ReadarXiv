// The page session (DESIGN §4.3): what the content entry did before it became an adapter, fixed here
// before anything about it is simplified. The pipeline, renderer and scheduler run for real against
// the test document; only the browser-side dependencies (backend, OCR, config store,
// locale) are fakes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '@/config/schema'
import { extract } from '@/core/extractor'
import { ID_ATTR } from '@/core/extractor'
import { MODE_ATTR, ON_ATTR, STATE_ATTR, UNDERLINE_ATTR } from '@/core/renderer/attrs'
import { IMG_MODES_ATTR } from '@/core/renderer/image'
import { createPageSession, type PageSession, type SessionDeps } from '@/core/session'
import type { ProviderStatus, TranslationTransport } from '@/providers/transport'
import type { TranslateCall } from '@/providers/translate-service'
import type { ImageBytes } from '@/core/image'
import type { OcrCall, OcrLine } from '@/shared/ocr'
import { chainRevision } from '@/config/revision'
import { behindSettings } from '@/shared/page-action'

const PAGE =
  '<h2 class="ltx_title ltx_title_section" id="s1">Introduction</h2>'
  + '<p class="ltx_p" id="p1">One sentence here.</p>'
  + '<p class="ltx_p" id="p2">Two sentences here.</p>'
const FIGURE = '<figure class="ltx_figure" id="F1"><img class="ltx_graphics" src="https://arxiv.org/html/x/fig.png" alt=""><figcaption class="ltx_caption">Figure 1. A plot.</figcaption></figure>'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const settle = async (rounds = 4) => { for (let i = 0; i < rounds; i++) await tick() }

function providerStatus(over: Partial<ProviderStatus> = {}): ProviderStatus {
  return {
    providerId: 'microsoft', available: true, maxBatchChars: 100_000, maxBatchItems: 100, renderPath: 'tags',
    targetLanguage: 'cmn', promptId: 'default', revision: 'r1', chosen: 'microsoft', engine: { id: 'microsoft' },
    chain: ['microsoft'], demotions: [], identity: '', ...over,
  }
}

interface HarnessOptions {
  page?: string
  paper?: string | null
  config?: Partial<Config>
  /** What the backend says it translated with */
  provider?: string
  status?: (scope: string | undefined, call: number, options?: { fresh?: boolean }) => ProviderStatus | Promise<ProviderStatus>
  /** Hold the very first configuration read until `releaseConfig()` */
  holdFirstConfig?: boolean
  /** Hold the n-th backend status read until `releaseStatus()` */
  holdStatusAt?: number
  /** Bytes the image pipeline gets for any bitmap URL */
  fetchImage?: (url: string) => Promise<ImageBytes>
  /** What the fake OCR recognises in every bitmap */
  ocrLines?: OcrLine[]
}

function harness(options: HarnessOptions = {}) {
  document.head.innerHTML = '<title>A Paper</title>'
  document.body.innerHTML = `<article class="ltx_document">${options.page ?? PAGE}</article>`
  const blocks = extract(document)
  let config: Config = { ...DEFAULT_CONFIG, ...options.config }
  /** Set: the store refuses every write with this (config/storage.ts does while the stored value cannot be read) */
  let refusal: Error | null = null
  const calls: TranslateCall[] = []
  const cancelled: string[] = []
  const statusCalls: (string | undefined)[] = []
  const ocrCalls: OcrCall[] = []
  let releaseStatus: () => void = () => undefined
  const backend: TranslationTransport = {
    async translate(call) {
      calls.push(call)
      return { ok: true, result: { segments: call.request.segments.map(s => ({ id: s.id, text: s.text })), provider: options.provider ?? 'microsoft' }, cached: 0 }
    },
    async cancel(scope) { cancelled.push(scope); return 0 },
    async status(scope, statusOptions) {
      statusCalls.push(scope)
      if (options.holdStatusAt === statusCalls.length) await new Promise<void>(resolve => { releaseStatus = resolve })
      return options.status ? options.status(scope, statusCalls.length, statusOptions) : providerStatus()
    },
  }
  let releaseConfig: () => void = () => undefined
  let reads = 0
  const deps: SessionDeps = {
    doc: document,
    blocks,
    paper: options.paper === undefined ? '2410.00260' : options.paper,
    context: { paperTitle: 'A Paper' },
    backend,
    ocr: async call => {
      ocrCalls.push(call)
      if (!options.ocrLines) return { ok: false, error: { kind: 'unknown', message: 'no OCR in this test' } }
      return { ok: true, result: { width: 100, height: 100, lines: options.ocrLines }, cached: false }
    },
    ...(options.fetchImage ? { fetchImage: options.fetchImage } : {}),
    config: {
      get: async () => {
        reads += 1
        // What a read returns is what was stored when it was made: a held read hands back that snapshot, not the store
        // at release — the slow first read that races a write elsewhere
        const snapshot = config
        if (reads === 1 && options.holdFirstConfig) await new Promise<void>(resolve => { releaseConfig = resolve })
        return snapshot
      },
      set: async next => {
        if (refusal) throw refusal
        config = next
      },
    },
    applyLocale: vi.fn(),
    trace: vi.fn(),
  }
  const session = createPageSession(deps)
  return {
    session, blocks, calls, cancelled, statusCalls, ocrCalls, deps,
    config: () => config,
    refuseWrites: (error: Error) => { refusal = error },
    releaseConfig: () => releaseConfig(),
    releaseStatus: () => releaseStatus(),
    trace: () => (deps.trace as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0])),
  }
}

let live: PageSession | null = null
afterEach(() => {
  live?.restore()
  live = null
  document.body.innerHTML = ''
})

describe('page session', () => {
  it('answers status only after the first configuration read, with the stored mode as the preference', async () => {
    const h = harness({ config: { mode: 'stack' }, holdFirstConfig: true })
    let answered = false
    const pending = h.session.status().then(status => { answered = true; return status })
    await settle()
    expect(answered).toBe(false)
    h.releaseConfig()
    const status = await pending
    expect(status).toEqual({ paper: '2410.00260', mode: 'stack', preference: 'stack', progress: { state: 'idle', total: 3, requested: 0, done: 0, failed: 0, cached: 0, inFlight: 0 }, session: null, epoch: expect.any(String) })
  })

  it('start: marks the page, mints a session, reports what it runs on', async () => {
    const h = harness()
    live = h.session
    expect(await h.session.start()).toEqual({ started: true })
    await settle()
    const html = document.documentElement
    expect(html.hasAttribute(ON_ATTR)).toBe(true)
    // the stored preference is `side`; the effective mode depends on the test window's width (§7.2)
    const effective = html.getAttribute(MODE_ATTR)
    expect(['side', 'stack']).toContain(effective)
    expect(document.querySelectorAll(`[${ID_ATTR}]`)).toHaveLength(3)
    expect(document.querySelectorAll(`[${STATE_ATTR}="pending"]`)).toHaveLength(3)
    const status = await h.session.status()
    expect(status.session).toEqual(expect.any(String))
    expect(status.preference).toBe(DEFAULT_CONFIG.mode)
    expect(status.mode).toBe(effective)
    expect(status.progress.state).toBe('on')
    // What the chain reported: the fake status says revision r1 and chosen microsoft
    expect(status.running).toEqual({ provider: 'microsoft', target: DEFAULT_CONFIG.targetLanguage, engine: 'microsoft', revision: 'r1' })
    expect(status.images).toBeUndefined()
  })

  it('the session runs on the chain it is told about, bound to it: target and revision come from the status, asked fresh with the session\'s own scope (local review)', async () => {
    // The chain in force was built from a save the configuration read here does not see yet (target jpn); the
    // session runs on the chain's settings, which is what the status, asked fresh, reports
    const h = harness({ holdStatusAt: 1, status: (_scope, _call, statusOptions) => providerStatus(statusOptions?.fresh ? { targetLanguage: 'jpn', revision: 'r-jpn' } : {}) })
    live = h.session
    const pending = h.session.start()
    await settle()
    expect(h.config().targetLanguage).toBe('cmn')
    h.releaseStatus()
    expect(await pending).toEqual({ started: true })
    const status = await h.session.status()
    expect(status.running).toMatchObject({ target: 'jpn', revision: 'r-jpn', provider: 'microsoft' })
    expect(h.statusCalls[0]).toBe(status.session)
    // The store having moved on past the chain is what "behind" means; the same settings are not
    expect(behindSettings(status, await chainRevision({ ...h.config(), targetLanguage: 'fra' as Config['targetLanguage'] }))).toBe(true)
    expect(behindSettings(status, 'r-jpn')).toBe(false)
    await h.session.translate(h.blocks.slice(0, 1))
    expect(h.calls.length).toBeGreaterThan(0)
    expect(h.calls.every(c => c.request.target === 'jpn')).toBe(true)
  })

  it('the action epoch moves with every start and restore; a command from an earlier epoch is refused, a translate decided on an idle page included (local review)', async () => {
    const h = harness()
    live = h.session
    const idle = (await h.session.status()).epoch!
    await h.session.start()
    const on = (await h.session.status()).epoch!
    expect(on).not.toBe(idle)
    // A restore decided on the epoch before the (automatic) restart is refused and says so
    await h.session.start(undefined, true)
    expect(h.session.restore(on)).toEqual({ removedNodes: 0, refused: true })
    expect((await h.session.status()).session).not.toBeNull()
    const restarted = (await h.session.status()).epoch!
    expect(h.session.restore(restarted).refused).toBeUndefined()
    expect((await h.session.status()).session).toBeNull()
    // The restore moved the epoch too: a translate decided on the page as it was just before the restore is refused
    expect((await h.session.status()).epoch).not.toBe(restarted)
    expect(await h.session.start(undefined, false, undefined, restarted)).toEqual({ started: false, reason: 'session-over' })
    // Idle → on → idle: a translate decided on the first idle epoch must not translate the page the reader restored
    expect(await h.session.start(undefined, false, undefined, idle)).toEqual({ started: false, reason: 'session-over' })
    expect((await h.session.status()).session).toBeNull()
    expect((await h.session.status()).progress.state).toBe('idle')
    // Decided on the current epoch, it starts
    expect(await h.session.start(undefined, false, undefined, (await h.session.status()).epoch)).toEqual({ started: true })
  })

  it('an epoch belongs to its document: the same tab reloaded starts a new document whose epochs never match the old one\'s', async () => {
    // Both documents at the same count: the old one translated once (count 1), the new one translated once (count 1)
    const before = harness()
    await before.session.start()
    const stale = (await before.session.status()).epoch!
    before.session.restore()
    const after = harness()
    live = after.session
    await after.session.start()
    // A restore decided on the old document, arriving after the reload, must not undo the new document's translation
    expect(after.session.restore(stale)).toEqual({ removedNodes: 0, refused: true })
    expect((await after.session.status()).session).not.toBeNull()
    const kept = (await after.session.status()).session
    // Refused either way — the page is on (alreadyOn) and the epoch is another document's; the session stays
    expect(await after.session.start(undefined, false, undefined, stale)).toMatchObject({ started: false })
    after.session.restore()
    expect(await after.session.start(undefined, false, undefined, stale)).toEqual({ started: false, reason: 'session-over' })
    expect((await after.session.status()).session).toBeNull()
    expect(kept).not.toBeNull()
  })

  it('a start made obsolete while it waits does not swallow the different start asked for after it', async () => {
    const h = harness({ holdStatusAt: 2 })
    live = h.session
    await h.session.start()
    const first = (await h.session.status()).epoch!
    // A restart decided on the page as it is; its status is held. Meanwhile the reader restores, then asks to translate
    const restart = h.session.start(undefined, true, undefined, first)
    await settle()
    expect(h.session.restore().refused).toBeUndefined()
    const idle = (await h.session.status()).epoch!
    const translate = h.session.start(undefined, false, undefined, idle)
    h.releaseStatus()
    expect(await restart).toEqual({ started: false, reason: 'session-over' })
    expect(await translate).toEqual({ started: true })
    expect((await h.session.status()).progress.state).toBe('on')
  })

  it('a start refused after its status was asked releases the session the status bound provisionally (Codex on #184)', async () => {
    // No usable service: the chain answered, so the scope is bound over there; the refusal cancels it
    const none = harness({ status: () => providerStatus({ available: false }) })
    live = none.session
    expect(await none.session.start()).toEqual({ started: false, reason: 'no-service' })
    expect(none.statusCalls).toHaveLength(1)
    expect(none.cancelled).toEqual([none.statusCalls[0]])
    live.restore()
    // The page moved while the status was on its way (an epoch decided before): refused, and released just the same
    const moved = harness({ holdStatusAt: 2 })
    live = moved.session
    await moved.session.start()
    const first = (await moved.session.status()).epoch!
    const restart = moved.session.start(undefined, true, undefined, first)
    await settle()
    moved.session.restore()
    moved.releaseStatus()
    expect(await restart).toEqual({ started: false, reason: 'session-over' })
    expect(moved.cancelled).toContain(moved.statusCalls[1])
  })

  it('overlapping starts are one start: a second click while the first is asking its status mints no second session (local review)', async () => {
    const h = harness({ holdStatusAt: 1 })
    live = h.session
    const first = h.session.start()
    const second = h.session.start()
    await settle()
    expect(h.statusCalls).toHaveLength(1)
    h.releaseStatus()
    expect(await first).toEqual({ started: true })
    expect(await second).toEqual({ started: true })
    const status = await h.session.status()
    expect(status.session).toBe(h.statusCalls[0])
    expect(h.cancelled).toEqual([])
    // Once the start has settled, a start is a start again: refused while on, as before
    expect(await h.session.start()).toEqual({ started: false, reason: 'already-on' })
  })

  it('a second start is refused while the session is on; a restart replaces it and cancels the old scope', async () => {
    const h = harness()
    live = h.session
    await h.session.start()
    const first = (await h.session.status()).session!
    expect(await h.session.start()).toEqual({ started: false, reason: 'already-on' })
    expect(await h.session.start(undefined, true)).toEqual({ started: true })
    const second = (await h.session.status()).session!
    expect(second).not.toBe(first)
    expect(h.cancelled).toEqual([first])
  })

  it('refuses to start off a paper page, on an empty page, without a backend, and without any usable service', async () => {
    expect(await harness({ paper: null }).session.start()).toEqual({ started: false, reason: 'not-paper' })
    expect(await harness({ page: '<div class="ltx_para"></div>' }).session.start()).toEqual({ started: false, reason: 'nothing-to-translate' })
    const silent = harness({ status: () => Promise.reject(new Error('gone')) })
    expect(await silent.session.start()).toEqual({ started: false, reason: 'backend-silent', detail: 'gone' })
    const none = harness({ status: () => providerStatus({ available: false }) })
    expect(await none.session.start()).toEqual({ started: false, reason: 'no-service' })
    // a fallback on the chain is enough to start: the requests land on the free engine (§8.5)
    const fallback = harness({ status: () => providerStatus({ available: false, fallback: { id: 'google-web' } }) })
    live = fallback.session
    expect(await fallback.session.start()).toEqual({ started: true })
  })

  it('restore: every injected node and attribute goes, the scope is cancelled, and a stale automatic restart is refused', async () => {
    const h = harness()
    await h.session.start()
    await settle()
    const id = (await h.session.status()).session!
    const result = h.session.restore()
    expect(result.removedNodes).toBeGreaterThanOrEqual(0)
    expect(document.querySelectorAll('[class*="axt-"], [data-axt-on]')).toHaveLength(0)
    expect(Array.from(document.querySelectorAll('*')).some(el => Array.from(el.attributes).some(a => a.name.startsWith('data-axt-')))).toBe(false)
    expect(h.cancelled).toEqual([id])
    const status = await h.session.status()
    expect(status.session).toBeNull()
    expect(status.progress.state).toBe('idle')
    expect(status.running).toBeUndefined()
    // the continuation of a restart decided in the old session must not translate the page again (Codex on #157)
    expect(await h.session.start(undefined, true, id)).toEqual({ started: false, reason: 'session-over' })
    expect((await h.session.status()).session).toBeNull()
  })

  it('tells its state once per change, whoever asked for it: on at a start, stopped by a fatal error, idle at a restore (the floating button\'s tick)', async () => {
    const h = harness()
    const states: string[] = []
    h.deps.onState = state => states.push(state)
    await h.session.start()
    await settle()
    // Progress moves many times while the page is on; the state was told once
    await h.session.translate(h.blocks.slice(1))
    await settle()
    expect(states).toEqual(['on'])
    h.session.restore()
    expect(states).toEqual(['on', 'idle'])
    // A restore with nothing on the page changes no state, and tells nothing
    h.session.restore()
    expect(states).toEqual(['on', 'idle'])

    h.deps.backend.translate = async () => ({ ok: false, error: { kind: 'auth', message: 'refused', isolatable: false } })
    live = h.session
    await h.session.start()
    await settle()
    await h.session.translate(h.blocks.slice(1))
    await settle()
    expect(states).toEqual(['on', 'idle', 'on', 'stopped'])
  })

  it('translates the blocks it is handed and reports progress', async () => {
    const h = harness()
    live = h.session
    await h.session.start()
    await settle()
    await h.session.translate(h.blocks.slice(1))
    const id = (await h.session.status()).session!
    expect(h.calls.length).toBeGreaterThanOrEqual(1)
    expect(h.calls.every(c => c.scope === id)).toBe(true)
    const status = await h.session.status()
    expect(status.progress).toMatchObject({ state: 'on', requested: 2, done: 2, failed: 0 })
    expect(document.querySelectorAll('.axt-t')).toHaveLength(2)
    // The line the e2e suites parse (extension.mjs's IDLE regex): one per busy → idle transition, in this format
    const idle = h.trace().filter(line => line.startsWith('session idle:'))
    expect(idle.length).toBeGreaterThanOrEqual(1)
    for (const line of idle) expect(line).toMatch(/^session idle: \d+\/\d+ requested of \d+, \d+ failed, \d+ cached, \d+ ms$/)
    expect(h.session.retryFailed()).toBe(0)
  })

  it('the whole-paper range chosen mid-session releases everything still waiting in the run; any other range applies from the next session (Devin on #222)', async () => {
    const h = harness()
    live = h.session
    await h.session.start()
    await settle()
    // happy-dom has no IntersectionObserver and no layout: nothing enters the viewport by itself
    expect((await h.session.status()).progress).toMatchObject({ state: 'on', requested: 0 })
    h.session.onConfig({ ...h.config(), preload: { margin: 1800, threshold: 0 } })
    await settle()
    expect((await h.session.status()).progress).toMatchObject({ requested: 0 })
    h.session.onConfig({ ...h.config(), preload: { margin: 'all', threshold: 0 } })
    await settle()
    expect((await h.session.status()).progress).toMatchObject({ requested: h.blocks.length, done: h.blocks.length, failed: 0 })
    // Chosen again: nothing is left to release, and nothing is requested twice
    const calls = h.calls.length
    h.session.onConfig({ ...h.config(), preload: { margin: 'all', threshold: 0 } })
    await settle()
    expect(h.calls.length).toBe(calls)
  })

  it('a fatal error reaches the idle line as its kind only: the message is the endpoint\'s, and the trace feeds the diagnostics log (Codex on #214)', async () => {
    const h = harness()
    live = h.session
    h.deps.backend.translate = async () => ({ ok: false, error: { kind: 'auth', message: 'Unauthorized: key=ZZZ-my-secret; request was: the Fourier transform of f', isolatable: false } })
    await h.session.start()
    await settle()
    await h.session.translate(h.blocks.slice(1))
    await settle()
    const idle = h.trace().filter(line => line.startsWith('session idle:'))
    expect(idle.length).toBeGreaterThanOrEqual(1)
    expect(idle[idle.length - 1]).toMatch(/, fatal: auth$/)
    for (const line of h.trace()) {
      expect(line).not.toContain('my-secret')
      expect(line).not.toContain('Fourier')
    }
  })

  it('restoring the page while an automatic restart awaits the backend refuses that restart and sends nothing more', async () => {
    // the restart's own status read (the second one) is held so the restore can land in the middle of it (Codex on #157)
    const h = harness({ holdStatusAt: 2 })
    live = h.session
    await h.session.start()
    await settle()
    const id = (await h.session.status()).session!
    const restart = h.session.start(undefined, true, id)
    await settle()
    h.session.restore()
    const before = h.calls.length
    h.releaseStatus()
    expect(await restart).toEqual({ started: false, reason: 'session-over' })
    expect((await h.session.status()).session).toBeNull()
    expect(document.documentElement.hasAttribute(ON_ATTR)).toBe(false)
    expect(h.calls.length).toBe(before)
    // The restore cancelled the session; the refused restart released the session its status had bound provisionally
    expect(h.cancelled[0]).toBe(id)
    expect(h.cancelled).toHaveLength(2)
    expect(h.cancelled[1]).toBe(h.statusCalls.at(-1))
  })

  it('every request — text, title, OCR and image labels — carries the active session id, and a restart moves them to the new one', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer
    const h = harness({
      page: PAGE + FIGURE,
      config: { image: { enabled: true, modes: ['side', 'stack', 'only'] } },
      fetchImage: async () => ({ bytes: png, mime: 'image/png' }),
      ocrLines: [{ text: 'Energy density', quad: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.2], [0.1, 0.2]], conf: 0.99 }],
    })
    live = h.session
    await h.session.start()
    await settle()
    const id = (await h.session.status()).session!
    await h.session.translate(h.blocks.slice(1))
    await h.session.translateImages()
    await settle(6)
    expect(h.calls.some(c => c.request.segments[0]?.id === 'document.title')).toBe(true)
    expect(h.calls.some(c => c.request.segments[0]?.id.endsWith('#L0'))).toBe(true)
    expect(h.calls.length).toBeGreaterThanOrEqual(3)
    expect(h.calls.map(c => c.scope)).toEqual(h.calls.map(() => id))
    expect(h.ocrCalls.map(c => c.scope)).toEqual([id])
    // after a restart the new id goes out, never the old one
    await h.session.start(undefined, true)
    const next = (await h.session.status()).session!
    const since = h.calls.length
    await h.session.translate(h.blocks.slice(1))
    await settle()
    expect(h.calls.length).toBeGreaterThan(since)
    expect(h.calls.slice(since).map(c => c.scope)).toEqual(h.calls.slice(since).map(() => next))
  })

  it('the title goes out in the same envelope as the blocks: on a page with no title or abstract to send, it carries no context, and a block only its heading', async () => {
    // To the cache key an absent context and an empty one are two contexts (run/call.ts); the title used to send `{}`
    const h = harness()
    h.deps.context = {}
    live = h.session
    await h.session.start()
    await settle()
    await h.session.translate(h.blocks.slice(1))
    await settle()
    const title = h.calls.find(c => c.request.segments[0]?.id === 'document.title')
    const block = h.calls.find(c => c.request.segments[0]?.id !== 'document.title')
    expect(title).toBeDefined()
    expect(block).toBeDefined()
    expect(title?.request.context).toBeUndefined()
    // The block sits under a heading, which is a context of its own; nothing of the paper's goes with it
    expect(block?.request.context).toEqual({ sectionTitle: 'Introduction' })
    expect(title?.cache).toEqual(block?.cache)
  })

  it('a permanent hand-over restarts the page once on the serving engine; a temporary one does not', async () => {
    let handedOver = false
    const h = harness({
      provider: 'google-web',
      // A session's start asks fresh with its own scope; the hand-over check asks about its scope without fresh
      status: (scope, _call, statusOptions) => {
        if (scope !== undefined && !statusOptions?.fresh) { handedOver = true; return providerStatus({ demotions: [{ id: 'microsoft', kind: 'auth' }] }) }
        return providerStatus(handedOver ? { engine: { id: 'google-web' }, chain: ['microsoft', 'google-web'] } : {})
      },
    })
    live = h.session
    await h.session.start()
    const first = (await h.session.status()).session!
    await h.session.translate(h.blocks.slice(1, 2))
    await settle(8)
    const second = (await h.session.status()).session!
    expect(second).not.toBe(first)
    expect(h.cancelled).toEqual([first])
    expect(h.statusCalls).toContain(first)
    expect(h.trace().some(line => line.startsWith('hand-over to google-web is permanent (auth)'))).toBe(true)
    // the new session runs on google-web: translating again changes nothing
    await h.session.translate(h.blocks.slice(2, 3))
    await settle(8)
    expect((await h.session.status()).session).toBe(second)

    const temporary = harness({
      provider: 'google-web',
      status: (scope, _call, statusOptions) => providerStatus(scope !== undefined && !statusOptions?.fresh ? { demotions: [{ id: 'microsoft', kind: 'rate-limit' }] } : {}),
    })
    live?.restore()
    live = temporary.session
    await temporary.session.start()
    const id = (await temporary.session.status()).session!
    await temporary.session.translate(temporary.blocks.slice(1, 2))
    await settle(8)
    expect((await temporary.session.status()).session).toBe(id)
    expect(temporary.cancelled).toEqual([])
  })

  it('a look chosen while the first configuration read is in flight survives that read (the watcher gate)', async () => {
    const underlined = { id: 'svc-test', name: 'Test', color: '', opacity: 1, underline: 'solid' as const, thickness: 1 as const, blur: false, css: '' }
    const h = harness({ holdFirstConfig: true })
    live = h.session
    const chosen: Config = { ...h.config(), appearance: { ...h.config().appearance, styles: [...h.config().appearance.styles, underlined], activeStyle: 'svc-test' } }
    h.session.onConfig(chosen)
    // the late read returns the stored configuration, whose active style has no underline
    h.releaseConfig()
    await h.session.ready
    await h.session.start()
    expect(document.documentElement.getAttribute(UNDERLINE_ATTR)).toBe('solid')
  })

  it('a start that throws reaches its caller as a failure, and the diagnostics line names the error without its message', async () => {
    const h = harness()
    live = h.session
    await h.session.ready
    h.deps.config.get = async () => { throw new TypeError('the endpoint said: sk-not-for-the-log') }
    await expect(h.session.start()).rejects.toThrow(TypeError)
    expect(h.trace()).toContain('start failed (TypeError; message withheld)')
    expect(h.trace().join('\n')).not.toContain('sk-not-for-the-log')
    // The failed start is over: the next one is judged on its own
    h.deps.config.get = async () => h.config()
    expect(await h.session.start()).toEqual({ started: true })
  })

  it('setMode before any session is a saved preference and writes nothing on the page; on a translated page it switches the attribute at once', async () => {
    const h = harness({ config: { mode: 'side' } })
    live = h.session
    const before = document.documentElement.outerHTML
    expect(await h.session.setMode('stack')).toEqual({ mode: 'stack', effective: 'stack' })
    // Nothing is written before a translation starts (DESIGN §4.1): no attribute, and no controller left listening
    expect(document.documentElement.outerHTML).toBe(before)
    expect(h.config().mode).toBe('stack')
    const status = await h.session.status()
    expect(status.preference).toBe('stack')
    expect(status.mode).toBe('stack')
    await h.session.start()
    expect(document.documentElement.getAttribute(MODE_ATTR)).toBe('stack')
    await h.session.setMode('only')
    expect(document.documentElement.getAttribute(MODE_ATTR)).toBe('only')
    expect((await h.session.status()).preference).toBe('only')
    // After a restore the page is untranslated again: the same rule
    h.session.restore()
    const restored = document.documentElement.outerHTML
    await h.session.setMode('side')
    expect(document.documentElement.outerHTML).toBe(restored)
    expect(h.config().mode).toBe('side')
  })

  it('a display chosen on the HTML page lets the PDF reader\'s original go too, the stored mode the same or not (the reader\'s design, §3)', async () => {
    const h = harness({ config: { mode: 'side', pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: true } } })
    live = h.session
    await h.session.setMode('side')
    expect([h.config().mode, h.config().pdfReader.original]).toEqual(['side', false])
    await h.deps.config.set({ ...h.config(), pdfReader: { ...h.config().pdfReader, original: true } })
    await h.session.setMode('stack')
    expect([h.config().mode, h.config().pdfReader.original]).toEqual(['stack', false])
  })

  it('a save the store refuses on an untranslated page changes nothing: the preference reported, and the next start, stay the stored ones', async () => {
    const h = harness({ config: { mode: 'side' } })
    live = h.session
    h.refuseWrites(new Error('refused'))
    await expect(h.session.setMode('stack')).rejects.toThrow('refused')
    expect((await h.session.status()).preference).toBe('side')
    await h.session.start()
    // The preference, not the attribute: the test window is narrow, where side is shown stacked
    expect((await h.session.status()).preference).toBe('side')
  })

  it('two choices in quick succession are saved in order: the store ends on the last one, as the page does', async () => {
    const h = harness({ config: { mode: 'side' } })
    live = h.session
    await h.session.status()
    // Not awaited one by one: both would read `side` before either wrote, and the second would skip its write
    await Promise.all([h.session.setMode('stack'), h.session.setMode('side')])
    expect(h.config().mode).toBe('side')
    expect((await h.session.status()).preference).toBe('side')
  })

  it('a mode saved in another tab reaches an untranslated page: it reports that preference and starts in it', async () => {
    const h = harness({ config: { mode: 'side' } })
    live = h.session
    await h.session.status()
    const stored = { ...h.config(), mode: 'only' as const }
    await h.deps.config.set(stored)
    h.session.onConfig(stored)
    await settle()
    expect((await h.session.status()).preference).toBe('only')
    await h.session.start()
    expect(document.documentElement.getAttribute(MODE_ATTR)).toBe('only')
  })

  it('a slow first read does not put back the mode another tab saved while it was out', async () => {
    const h = harness({ config: { mode: 'side' }, holdFirstConfig: true })
    live = h.session
    await settle()
    // Another tab saves `only`; its event lands before the first read, which took its snapshot of `side`, comes back
    const stored = { ...h.config(), mode: 'only' as const }
    await h.deps.config.set(stored)
    h.session.onConfig(stored)
    h.releaseConfig()
    await settle()
    expect((await h.session.status()).preference).toBe('only')
  })

  it('a late event for an earlier write does not put an older mode back: the page re-reads the store, it does not trust the event', async () => {
    const h = harness({ config: { mode: 'side' } })
    live = h.session
    await h.session.status()
    await h.session.setMode('stack')
    await h.session.setMode('only')
    // Storage events carry no order: the one for the first write arrives last, carrying `stack`
    h.session.onConfig({ ...h.config(), mode: 'stack' })
    await settle()
    expect((await h.session.status()).preference).toBe('only')
  })

  it('a save the store refuses rejects after the page has switched: the mode holds here, and the caller learns it was not saved', async () => {
    const h = harness({ config: { mode: 'side' } })
    live = h.session
    await h.session.start()
    h.refuseWrites(new Error('refused'))
    await expect(h.session.setMode('stack')).rejects.toThrow('refused')
    expect(document.documentElement.getAttribute(MODE_ATTR)).toBe('stack')
    expect(h.config().mode).toBe('side')
  })

  it('a configuration change re-applies the interface language and nothing else is required to see it', async () => {
    const h = harness()
    live = h.session
    await h.session.start()
    h.session.onConfig({ ...h.config(), uiLanguage: 'en' })
    expect(h.deps.applyLocale).toHaveBeenCalledWith('en')
  })

  it('images: a bitmap is read as soon as it is handed over — nothing is waited for — and the switch clears the overlays gate', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer
    const h = harness({
      page: PAGE + FIGURE,
      config: { image: { enabled: true, modes: ['side', 'stack', 'only'] } },
      fetchImage: async () => ({ bytes: png, mime: 'image/png' }),
      ocrLines: [{ text: 'Energy density', quad: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.2], [0.1, 0.2]], conf: 0.99 }],
    })
    live = h.session
    await h.session.start()
    await settle()
    expect(document.documentElement.getAttribute(IMG_MODES_ATTR)).toBe('side stack only')
    expect(h.trace().some(line => line.startsWith('images: 0 SVG + 1 bitmaps'))).toBe(true)
    await h.session.translateImages()
    await settle(6)
    expect(h.ocrCalls).toHaveLength(1)
    // switching image translation off mid-session drops the gate attribute
    h.session.onConfig({ ...h.config(), image: { enabled: false, modes: [] } })
    expect(document.documentElement.hasAttribute(IMG_MODES_ATTR)).toBe(false)
  })

  describe('a figure\'s text — the labels of a TikZ picture, blocks of the text run (§15.6) — is asked for where the reader has figures translated', () => {
    const PICTURE = '<figure class="ltx_figure" id="F2"><svg class="ltx_picture"><foreignObject><span class="ltx_foreignobject_container"><span class="ltx_foreignobject_content" id="label">Shared Expert</span></span></foreignObject></svg></figure>'
    const asked = (h: ReturnType<typeof harness>) => h.calls.flatMap(call => call.request.segments.map(seg => seg.id))

    it('figures on: a label is asked for with the text around it, and the display gate is set though the paper holds not one image', async () => {
      const h = harness({ page: PAGE + PICTURE, config: { image: { enabled: true, modes: ['side', 'stack', 'only'] } } })
      live = h.session
      await h.session.start()
      await settle()
      expect(document.documentElement.getAttribute(IMG_MODES_ATTR)).toBe('side stack only')
      await h.session.translate(h.blocks)
      expect(asked(h)).toContain('label')
      expect(document.getElementById('label')!.nextElementSibling?.classList.contains('axt-t')).toBe(true)
    })

    it('figures off: the label is held, unasked, while every other block is translated; turned on mid-session it is asked for, and only it', async () => {
      const h = harness({ page: PAGE + PICTURE, config: { image: { enabled: false, modes: [] } } })
      live = h.session
      await h.session.start()
      await settle()
      await h.session.translate(h.blocks)
      expect(asked(h)).not.toContain('label')
      expect(asked(h).length).toBeGreaterThan(0)
      expect(document.getElementById('label')!.nextElementSibling).toBeNull()
      const before = asked(h).length

      h.session.onConfig({ ...h.config(), image: { enabled: true, modes: ['side', 'stack', 'only'] } })
      await vi.waitFor(() => expect(asked(h)).toContain('label'))
      expect(asked(h).slice(before).filter(id => id !== 'label')).toEqual([])
      expect(document.getElementById('label')!.nextElementSibling?.classList.contains('axt-t')).toBe(true)
    })

    it('the modes the reader ticked, not the switch alone: figures on in translation only, a label reached in stacked waits, and the switch to that mode releases it', async () => {
      const h = harness({ page: PAGE + PICTURE, config: { mode: 'stack', image: { enabled: true, modes: ['only'] } } })
      live = h.session
      await h.session.start()
      await settle()
      await h.session.translate(h.blocks)
      expect(asked(h)).not.toContain('label')
      await h.session.setMode('only')
      await vi.waitFor(() => expect(asked(h)).toContain('label'))
    })
  })

  it('images switched off mid-session leave no round behind: nothing to hand over', async () => {
    const h = harness({ page: PAGE + FIGURE, config: { image: { enabled: true, modes: ['side', 'stack', 'only'] } } })
    live = h.session
    await h.session.start()
    await settle()
    h.session.onConfig({ ...h.config(), image: { enabled: false, modes: [] } })
    await h.session.translateImages()
    await settle(6)
    expect(h.ocrCalls).toEqual([])
    expect((await h.session.status()).images).toBeUndefined()
  })
})
