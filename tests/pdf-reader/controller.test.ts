import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { createController, fromView, INITIAL, reduce, type Session } from '@/pdf-reader/controller'
import type { SessionEvent, SessionHost } from '@/pdf-reader/session/events'
import { capsuleOf, cardOf, lineOf, spokenOf } from '@/pdf-reader/ui/status'

const fold = (events: SessionEvent[], from = INITIAL) => events.reduce(reduce, from)
const opened: SessionEvent = { type: 'opened' }
const laid = (n: number): SessionEvent => ({ type: 'layer', state: 'open', laid: n, total: 4 })

describe('reduce: the session events folded into the reader state', () => {
  it("follows the display, the scale and each side's page", () => {
    const state = fold([{ type: 'display', mode: 'bilingual' }, { type: 'scale', scale: 1.3 }, { type: 'page', side: 'right', page: 4, pages: 26 }])
    expect(state.display).toBe('bilingual')
    expect(state.scale).toBe(1.3)
    expect(state.sides).toEqual({ left: { page: 1, pages: 0 }, right: { page: 4, pages: 26 } })
  })

  it('follows the PDF\'s download as a share, in hundredths, nothing for a download of unknown size (the maintainer, 2026-09-25)', () => {
    const state = fold([{ type: 'loading', loaded: 250, total: 1000 }])
    expect(state.loaded).toBe(0.25)
    expect(reduce(state, { type: 'loading', loaded: 251, total: 1000 })).toBe(state)
    expect(fold([{ type: 'loading', loaded: 250, total: 0 }]).loaded).toBe(0)
    expect(fold([{ type: 'loading', loaded: 1200, total: 1000 }]).loaded).toBe(1)
  })

  it('is ready once the original is open, in every display: the original is readable while the layer comes; its download is the original', () => {
    for (const mode of ['original', 'bilingual', 'translation'] as const) expect(fold([{ type: 'display', mode }, opened]).phase, mode).toBe('ready')
    expect(fold([opened]).download).toBe('original')
    expect(INITIAL.download).toBe('none')
  })
})

// The layer as the reader's only translated view (Stage 5 Task 12): every row of its fallback table, on the events alone
describe('reduce: the layer\'s states (Task 12)', () => {
  const phases = (events: SessionEvent[]) => {
    const seen: string[] = []
    events.reduce((state, event) => {
      const next = reduce(state, event)
      if (seen.at(-1) !== next.phase) seen.push(next.phase)
      return next
    }, INITIAL)
    return seen
  }
  it('a layer and a working service: loading, then translating as rows come, then reading; the pages laid counted', () => {
    const events: SessionEvent[] = [opened, { type: 'coming' }, { type: 'translating', got: 0, total: 40, lost: 0 }, laid(1), { type: 'translating', got: 10, total: 40, lost: 2 }]
    expect(fold(events)).toMatchObject({ phase: 'translating', progress: 0.25, failedUnits: 2, layer: { laid: 1, total: 4 } })
    const done = fold([...events, { type: 'translated', got: 38, total: 40, lost: 2, stopped: null }])
    expect(done).toMatchObject({ phase: 'ready', progress: 0.95, failedUnits: 2, failure: null })
    expect(phases([...events, { type: 'translated', got: 40, total: 40, lost: 0, stopped: null }])).toEqual(['ready', 'translating', 'ready'])
  })

  it('laying: a translation done before a page of the layer is laid where the translation shows holds its end, the line on and the translation said, until one is; the original display waits on nothing', () => {
    const bilingual: SessionEvent = { type: 'display', mode: 'bilingual' }
    const start: SessionEvent = { type: 'translating', got: 0, total: 9, lost: 0 }, end: SessionEvent = { type: 'translated', got: 9, total: 9, lost: 0, stopped: null }
    const done = fold([bilingual, opened, { type: 'coming' }, start, end])
    expect(done).toMatchObject({ phase: 'translating', progress: 1 })
    expect(lineOf(done).on).toBe(true)
    expect(spokenOf(done)).toBe(spokenOf(fold([bilingual, opened, start])))
    expect(fold([laid(1)], done)).toMatchObject({ phase: 'ready', progress: 1 })
    // a page laid before the end: ready at once
    expect(fold([bilingual, opened, laid(1), start, end]).phase).toBe('ready')
    // the original shown: nothing waits on a page; the translation chosen afterwards waits on nothing either
    const original = fold([opened, start, end])
    expect(original.phase).toBe('ready')
    expect(fold([bilingual], original).phase).toBe('ready')
    // the layer refused meanwhile: reading, the original stays
    expect(fold([{ type: 'layer', state: 'refused', laid: 0, total: 4 }], done).phase).toBe('ready')
  })

  it('laying ends on a page shown as arXiv\'s by the rule (the side\'s `original`: no part lays a line on it), with nothing laid: told after the end or before it; such a page draws no translation, so a run stopped short over it keeps its card', () => {
    // 2610.30854v1 on staging 9236d8f8: our compile set pages 1 to 9 a line apart from arXiv's, the page check drew none of them,
    // and the end was held while the reader looked at page 1, the line on until a page past 9 was laid
    const bilingual: SessionEvent = { type: 'display', mode: 'bilingual' }
    const start: SessionEvent = { type: 'translating', got: 0, total: 9, lost: 0 }, end: SessionEvent = { type: 'translated', got: 9, total: 9, lost: 0, stopped: null }
    const ruled: SessionEvent = { type: 'layer', state: 'open', laid: 0, total: 13, original: 2 }
    const done = fold([bilingual, opened, { type: 'coming' }, start, end])
    expect(done).toMatchObject({ phase: 'translating', laying: true })
    const after = fold([ruled], done)
    expect(after).toMatchObject({ phase: 'ready', laying: false, layer: { laid: 0, total: 13, original: 2 } })
    expect(lineOf(after).on).toBe(false)
    // told before the end: the end is not held
    expect(fold([bilingual, opened, ruled, start, end])).toMatchObject({ phase: 'ready', laying: false })
    // stopped short over it, nothing laid: the card with the service's reason, as with no page at all
    expect(fold([bilingual, opened, ruled, { type: 'translated', got: 0, total: 9, lost: 9, stopped: 'network' }])).toMatchObject({ phase: 'failed', failure: 'network' })
    // the view's event passes it on, and leaves it out where there is none
    expect(fromView({ type: 'layer', state: 'open', laid: 0, total: 13, original: 2 }, 'x')).toEqual(ruled)
    expect(fromView({ type: 'layer', state: 'open', laid: 1, total: 13 }, 'x')).toEqual({ type: 'layer', state: 'open', laid: 1, total: 13 })
  })

  it('a layer and a failing service: the card with its reason while nothing is laid; laid pages stay readable, the notice with its retry', () => {
    expect(fold([opened, { type: 'fail', event: 'service', text: '', kind: 'no-key' }])).toMatchObject({ phase: 'failed', failure: 'no-key' })
    const stopped = fold([opened, laid(2), { type: 'translated', got: 10, total: 40, lost: 30, stopped: 'network' }])
    expect(stopped).toMatchObject({ phase: 'ready', failure: 'network', failedUnits: 30 })
    expect(fold([opened, { type: 'translated', got: 0, total: 40, lost: 40, stopped: 'network' }])).toMatchObject({ phase: 'failed', failure: 'network' })
    // a retry that translates mends it
    expect(fold([{ type: 'translating', got: 10, total: 40, lost: 0 }], stopped)).toMatchObject({ phase: 'translating', failure: null })
  })

  it('preparing: the original, the prepare\'s place and progress, then the layer as it comes', () => {
    const p = fold([opened, { type: 'preparing', position: 3, progress: null }, { type: 'preparing', position: null, progress: 0.4 }])
    expect(p).toMatchObject({ phase: 'preparing', preparing: { position: null, progress: 0.4 }, available: true })
    expect(fold([{ type: 'coming' }, { type: 'translating', got: 0, total: 9, lost: 0 }], p)).toMatchObject({ phase: 'translating', preparing: { position: null, progress: 0.4 } })
    expect(fold([{ type: 'coming' }, { type: 'prepared' }], p)).toMatchObject({ phase: 'ready', preparing: null })
  })

  it('the prepare is a state of its own, ended by the catalog: a poll once the translation has begun moves no phase, and nothing flips (the review\'s probe)', () => {
    const prep = (position: number | null, progress: number): SessionEvent => ({ type: 'preparing', position, progress })
    const seq: SessionEvent[] = [
      opened, prep(2, 0.1), { type: 'coming' }, { type: 'translating', got: 0, total: 40, lost: 0 }, prep(null, 0.3),
      { type: 'translating', got: 20, total: 40, lost: 3 }, { type: 'translated', got: 40, total: 40, lost: 3, stopped: null },
      prep(null, 0.6), { type: 'coming' }, laid(3), { type: 'prepared' },
    ]
    const phases: string[] = [], spoken: string[] = []
    let s = INITIAL
    for (const e of seq) { s = reduce(s, e); phases.push(s.phase); spoken.push(spokenOf(s)) }
    expect(phases).toEqual(['ready', 'preparing', 'preparing', 'translating', 'translating', 'translating', 'ready', 'ready', 'ready', 'ready', 'ready'])
    // said once each, never back: the status region does not flip between the two
    expect(spoken.filter((w, i) => w && w !== spoken[i - 1])).toHaveLength(2)
    // held beside the translation while it lasts, gone with the catalog
    expect(fold(seq.slice(0, 5)).preparing).toEqual({ position: null, progress: 0.3 })
    expect(s.preparing).toBeNull()
    // the translation ended, a poll after it leaves the line off and the passages that failed told
    const after = fold(seq.slice(0, 8))
    expect(lineOf(after).on).toBe(false)
    expect(capsuleOf(after, { noticeClosed: false, narrowShown: false, refusalsSeen: 0 })?.kind).toBe('notice')
  })

  it('no source, no PDF, a prepare that cannot succeed: the translated displays greyed, the HTML version offered', () => {
    for (const why of ['no-source', 'no-pdf', 'cannot-prepare', 'unknown-versions'] as const) {
      expect(fold([opened, { type: 'preparing', position: 1, progress: 0 }, { type: 'unavailable', why, retryAt: null }]), why).toMatchObject({ available: false, phase: 'ready', preparing: null, languageSupported: true, unavailable: { why } })
    }
    expect(fold([{ type: 'html', url: 'https://arxiv.org/html/1706.03762#readarxiv' }])).toMatchObject({ htmlVersion: 'https://arxiv.org/html/1706.03762#readarxiv' })
  })

  it('refused, unreachable: the original, passing (the displays not greyed); the layer coming after a retry clears it', () => {
    for (const why of ['refused', 'unreachable'] as const) {
      const s = fold([opened, { type: 'unavailable', why, retryAt: why === 'refused' ? 1234 : null }])
      expect(s, why).toMatchObject({ available: true, phase: 'ready', unavailable: { why, retryAt: why === 'refused' ? 1234 : null } })
      expect(fold([{ type: 'coming' }], s).unavailable).toBeNull()
    }
    // the view's side refused (a part, the base, the composed document): no layer for the visit, the original stays
    expect(fold([opened, { type: 'layer', state: 'refused', laid: 0, total: 4 }])).toMatchObject({ phase: 'ready', unavailable: { why: 'unreachable' } })
  })

  it('a layer that draws nothing is the paper\'s (a head over arXiv\'s PDF: the run says `cannot-prepare` at the head), and the side\'s own refusal at the base, before or after, does not make it a moment\'s: the lasting word stands, the displays greyed', () => {
    const refused: SessionEvent = { type: 'layer', state: 'refused', laid: 0, total: 4 }, lasting: SessionEvent = { type: 'unavailable', why: 'cannot-prepare', retryAt: null }
    for (const order of [[lasting, refused], [refused, lasting]]) {
      expect(fold([opened, ...order]), JSON.stringify(order.map(e => e.type))).toMatchObject({ phase: 'ready', available: false, unavailable: { why: 'cannot-prepare', retryAt: null } })
    }
    // a limit's wait (passing) is the side's refusal's to replace, as before
    expect(fold([opened, { type: 'unavailable', why: 'refused', retryAt: 99 }, refused]).unavailable).toEqual({ why: 'unreachable', retryAt: null })
  })

  it('the original not opened (its fetch failed): the run\'s translation meanwhile leaves its card; the original\'s open mends it', () => {
    const failed = fold([{ type: 'fail', event: 'fetch failed', text: '', kind: 'network' }, { type: 'translating', got: 3, total: 9, lost: 0 }, { type: 'translated', got: 9, total: 9, lost: 0, stopped: null }])
    expect(failed).toMatchObject({ phase: 'failed', failure: 'network', progress: 1 })
    expect(fold([{ type: 'page', side: 'left', page: 1, pages: 4 }, opened], failed)).toMatchObject({ phase: 'ready', failure: null })
  })

  it('a target the layer does not set: the language not supported (the menu offered), the paper not greyed', () => {
    expect(fold([opened, { type: 'unavailable', why: 'target', retryAt: null }])).toMatchObject({ languageSupported: false, available: true, phase: 'ready' })
  })

  it('the engine fails fast (network), the PDF opens later: the failure card stays, with its retry; the reverse, the PDF\'s own fetch failure mended by its open, is cleared (Devin, Codex on #391)', () => {
    const service = fold([{ type: 'fail', event: 'service', text: '', kind: 'network' }, opened])
    expect(service).toMatchObject({ phase: 'failed', failure: 'network' })
    expect(cardOf(service)).toEqual({ reason: expect.any(String), action: 'retry' })
    const pdf = fold([{ type: 'fail', event: 'fetch failed', text: '', kind: 'network' }, opened])
    expect(pdf).toMatchObject({ phase: 'ready', failure: null })
    expect(cardOf(pdf)).toBeNull()
    // the run's events over a service's failure leave it the service's: no original's fetch failure is made of it
    expect(fold([{ type: 'fail', event: 'service', text: '', kind: 'no-key' }, { type: 'translated', got: 0, total: 9, lost: 0, stopped: null }, opened]).failure).not.toBe('network')
  })

  describe('a failure per origin: the PDF\'s and the service\'s, each set and cleared by its own events alone (Codex on #391)', () => {
    const pdfFails: SessionEvent = { type: 'fail', event: 'fetch failed', text: '', kind: 'network' }
    const serviceFails = (kind: 'network' | 'no-key' = 'no-key'): SessionEvent => ({ type: 'fail', event: 'service', text: '', kind })
    const recovers: SessionEvent = { type: 'translating', got: 0, total: 9, lost: 0 }
    it('the PDF fails, then the service: the PDF\'s card first (nothing reads without the original), its retry; the service\'s held', () => {
      const s = fold([pdfFails, serviceFails()])
      expect(s.failures).toEqual({ pdf: 'network', service: 'no-key' })
      expect(s.phase).toBe('failed')
      expect(cardOf(s)?.action).toBe('retry')
    })
    it('the service fails, then the PDF: the PDF\'s card first all the same', () => {
      const s = fold([serviceFails(), pdfFails])
      expect(s.failures).toEqual({ pdf: 'network', service: 'no-key' })
      expect(cardOf(s)?.action).toBe('retry')
      // the run's events under no original move nothing
      expect(fold([{ type: 'translated', got: 0, total: 9, lost: 0, stopped: null }], s)).toMatchObject({ phase: 'failed', failures: { pdf: 'network' } })
    })
    it('the PDF opens: the service\'s card stays, actionable (no key: the settings); the service recovers: the PDF\'s card stays', () => {
      const opened1 = fold([pdfFails, serviceFails(), opened])
      expect(opened1).toMatchObject({ phase: 'failed', failures: { pdf: null, service: 'no-key' }, failure: 'no-key' })
      expect(cardOf(opened1)?.action).toBe('settings')
      const recovered = fold([pdfFails, serviceFails('network'), recovers])
      expect(recovered).toMatchObject({ phase: 'failed', failures: { pdf: 'network', service: null }, failure: 'network' })
      expect(cardOf(recovered)?.action).toBe('retry')
    })
    it('both fail, then each recovers, in either order: reading at the end, no failure left', () => {
      for (const order of [[opened, recovers], [recovers, opened]]) {
        const s = fold([pdfFails, serviceFails('network'), ...order])
        expect(s.failures, JSON.stringify(order.map(e => e.type))).toEqual({ pdf: null, service: null })
        expect(s.failure).toBeNull()
        expect(s.phase).not.toBe('failed')
      }
    })
  })

  it('the original opening after a service failed keeps the service\'s reason: the card stays the one that says what to do (no key: the settings) (Codex on #390)', () => {
    const noKey = fold([{ type: 'fail', event: 'service', text: '', kind: 'no-key' }, opened])
    expect(noKey).toMatchObject({ phase: 'failed', failure: 'no-key' })
    // the original's own fetch failure, mended by its open: cleared, reading
    const fetchFailed = fold([{ type: 'fail', event: 'fetch failed', text: '', kind: 'network' }, opened])
    expect(fetchFailed).toMatchObject({ phase: 'ready', failure: null })
  })

  it("names a failure by the chain's error kinds alone, the popup's reasons (final review)", () => {
    expect(fold([{ type: 'fail', event: 'service', text: '', kind: 'auth' }]).failure).toBe('auth')
    expect(fold([{ type: 'fail', event: 'service', text: '', kind: 'unavailable' as never }]).failure).toBe('unknown')
    expect(fold([{ type: 'fail', event: 'crashed', text: '' }])).toMatchObject({ phase: 'failed', failure: 'unknown' })
  })
})

describe('reduce: the settings and what the reader holds', () => {
  it("knows when the extension's settings could not be read", () => {
    expect(fold([{ type: 'notice', why: { kind: 'tooNew' } }]).settingsUnreadable).toBe(true)
    expect(fold([{ type: 'notice', why: { kind: 'tooNew' } }, { type: 'notice', why: null }]).settingsUnreadable).toBe(false)
  })

  it('counts the writes of the settings that were refused, except while the settings cannot be read, which the notice says; only a write of this page that went through mends them (D2, Devin on #329)', () => {
    expect(INITIAL).toMatchObject({ refusals: 0, mended: 0 })
    expect(fold([{ type: 'refused' }, { type: 'refused' }])).toMatchObject({ refusals: 2, mended: 0 })
    // the session tells of the unreadable settings before the refusal that follows from them
    expect(fold([{ type: 'notice', why: { kind: 'tooNew' } }, { type: 'refused' }]).refusals).toBe(0)
    // the settings shown again — a language pack that came, a read, another tab's change — mend nothing: no write went through
    const refused = fold([{ type: 'refused' }])
    for (const event of [{ type: 'settings', config: DEFAULT_CONFIG, pack: null }, { type: 'settings', config: DEFAULT_CONFIG, pack: 'available' }, { type: 'settings', config: { ...DEFAULT_CONFIG, targetLanguage: 'jpn' }, pack: null }] as SessionEvent[]) {
      expect(fold([event], refused), JSON.stringify(event)).toMatchObject({ refusals: 1, mended: 0 })
    }
    // a write that went through proves storage takes one, and a refusal after is a new one
    const mended = fold([{ type: 'saved' }], refused)
    expect(mended).toMatchObject({ refusals: 1, mended: 1 })
    expect(fold([{ type: 'refused' }], mended)).toMatchObject({ refusals: 2, mended: 1 })
    // nothing refused: a write that went through changes nothing
    expect(reduce(INITIAL, { type: 'saved' })).toBe(INITIAL)
    expect(reduce(mended, { type: 'saved' })).toBe(mended)
  })

  it('knows the paper and its title', () => {
    expect(fold([{ type: 'paper', id: '2608.02163', title: 'A Title' }]).paper).toEqual({ id: '2608.02163', title: 'A Title' })
  })

  it('holds the sync the reader applies, whatever the settings say (Part 2\'s final review)', () => {
    expect(INITIAL.sync).toBe(true)
    expect(fold([{ type: 'sync', on: false }]).sync).toBe(false)
  })

  it('holds the language pack beside the settings', () => {
    expect(fold([{ type: 'settings', config: DEFAULT_CONFIG, pack: 'available' }]).pack).toBe('available')
  })

  it('holds the heading being read, as the session places it (Task 21)', () => {
    expect(INITIAL.currentHeading).toBeNull()
    expect(fold([{ type: 'heading', id: 29 }]).currentHeading).toBe(29)
  })

  it('holds the contents', () => {
    const entries = [{ id: 2, title: '引言', original: 'Introduction', level: 1 as const, page: 1 }]
    expect(fold([{ type: 'outline', entries }]).outline).toEqual(entries)
  })

  it('holds the settings the session read', () => {
    expect(INITIAL.settings).toBeNull()
    expect(fold([{ type: 'settings', config: DEFAULT_CONFIG, pack: null }]).settings).toBe(DEFAULT_CONFIG)
  })

  it('keeps the same state object for an event that changes nothing', () => {
    expect(reduce(INITIAL, { type: 'sync', on: true })).toBe(INITIAL)
    expect(reduce(INITIAL, { type: 'layer', state: 'open', laid: 0, total: 0 })).toBe(INITIAL)
  })
})

const fakeSession = (): Session => ({ setDisplay: vi.fn(), setSyncMode: vi.fn(), zoomBy: vi.fn(), zoomTo: vi.fn(), goToPage: vi.fn(), patchSettings: vi.fn(), pdfBytes: vi.fn(async () => null), openOriginal: vi.fn(), goToUnit: vi.fn(), lead: vi.fn(), retry: vi.fn(), setNarrow: vi.fn(), pinch: vi.fn() })
const panes = () => ({ left: document.createElement('div'), right: document.createElement('div') })

describe('createController', () => {
  it('the original\'s download is arXiv\'s own PDF opened by the browser: no byte of it read through the reader', async () => {
    const session = fakeSession()
    const controller = createController({ open: async () => session, params: new URLSearchParams('paper=2600.00001v1') })
    await controller.attach(panes())
    await controller.download('original')
    expect(session.openOriginal).toHaveBeenCalledOnce()
    expect(session.pdfBytes).not.toHaveBeenCalled()
  })

  it('both failures told in the start\'s order: the controller shows the PDF\'s, then, once it opens, the service\'s (Codex on #391)', async () => {
    let host: SessionHost | null = null
    const controller = createController({ open: async (h: SessionHost) => { host = h; return fakeSession() }, params: new URLSearchParams('paper=2600.00001v1') })
    await controller.attach(panes())
    const tell = (e: SessionEvent) => (host as unknown as SessionHost).emit(e)
    tell({ type: 'fail', event: 'fetch failed', text: '', kind: 'network' })
    tell({ type: 'fail', event: 'service', text: '', kind: 'no-key' })
    expect(cardOf(controller.getState())?.action).toBe('retry')
    tell({ type: 'opened' })
    expect(cardOf(controller.getState())?.action).toBe('settings')
  })

  it('a session that could not open: the failure card, and its retry loads the page again rather than doing nothing (Codex on #301)', async () => {
    const reload = vi.spyOn(location, 'reload').mockImplementation(() => undefined)
    const controller = createController({ open: async () => { throw new Error('the session module did not load') }, params: new URLSearchParams() })
    await controller.attach(panes()).catch(() => undefined)
    expect(controller.getState().phase).toBe('failed')
    controller.retry()
    await Promise.resolve(); await Promise.resolve()
    expect(reload).toHaveBeenCalledOnce()
    reload.mockRestore()
  })

  it('opens the session once, whatever the number of attaches, and tells its listeners of each change', async () => {
    const session = fakeSession()
    const open = vi.fn(async (host: SessionHost) => {
      host.emit({ type: 'display', mode: 'translation' })
      return session
    })
    const controller = createController({ open, params: new URLSearchParams('paper=2608.02163') })
    const heard = vi.fn()
    controller.subscribe(heard)
    const p = panes()
    await Promise.all([controller.attach(p), controller.attach(p)])
    expect(open).toHaveBeenCalledOnce()
    expect(open.mock.calls[0]![0]).toMatchObject({ left: p.left, right: p.right })
    expect(open.mock.calls[0]![0].params.get('paper')).toBe('2608.02163')
    expect(controller.getState().display).toBe('translation')
    expect(heard).toHaveBeenCalledOnce()
  })

  it('tells its listeners of nothing that did not change: a page reported again, a pinch or a step while no zoom is chosen (the final review)', async () => {
    let host!: SessionHost
    const controller = createController({ open: async h => { host = h; return fakeSession() }, params: new URLSearchParams() })
    await controller.attach(panes())
    host.emit({ type: 'page', side: 'left', page: 3, pages: 20 })
    controller.pinch('left', 1.1, [0, 0])
    const heard = vi.fn()
    controller.subscribe(heard)
    host.emit({ type: 'page', side: 'left', page: 3, pages: 20 })
    controller.pinch('left', 1.1, [0, 0])
    controller.zoomBy(1.1)
    expect(heard).not.toHaveBeenCalled()
  })

  it('carries out a command given while the session is still opening, once it is open', async () => {
    const session = fakeSession()
    let resolve!: (s: Session) => void
    const controller = createController({
      open: () =>
        new Promise<Session>(r => {
          resolve = r
        }),
      params: new URLSearchParams(),
    })
    const attached = controller.attach(panes())
    controller.setDisplay('bilingual')
    controller.setSync(true)
    controller.setSync(false)
    expect(session.setDisplay).not.toHaveBeenCalled()
    resolve(session)
    await attached
    await Promise.resolve()
    expect(session.setDisplay).toHaveBeenCalledWith('bilingual')
    expect(vi.mocked(session.setSyncMode).mock.calls).toEqual([['same'], ['off']])
  })

  it('reports a session that could not be opened as a failure, and drops the commands queued for it (final review)', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const controller = createController({ open: () => Promise.reject(new Error('no module')), params: new URLSearchParams() })
    controller.setDisplay('bilingual')
    await expect(controller.attach(panes())).rejects.toThrow('no module')
    controller.setDisplay('translation')
    await new Promise(r => setTimeout(r, 0))
    process.off('unhandledRejection', unhandled)
    expect(controller.getState()).toMatchObject({ phase: 'failed', failure: 'unknown' })
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('passes a change of the settings to the session, once it is open', async () => {
    const session = fakeSession()
    const controller = createController({ open: async () => session, params: new URLSearchParams() })
    const change = (c: typeof DEFAULT_CONFIG) => ({ ...c, mode: 'only' as const })
    controller.patchSettings(change)
    await controller.attach(panes())
    controller.patchSettings(change)
    await Promise.resolve()
    expect(session.patchSettings).toHaveBeenCalledOnce()
    expect(session.patchSettings).toHaveBeenCalledWith(change)
  })

  it('knows the paper\'s id from the address before the session says anything', () => {
    const controller = createController({ open: async () => fakeSession(), params: new URLSearchParams('paper=hep-th/9711200') })
    expect(controller.getState().paper).toEqual({ id: 'hep-th/9711200', title: '' })
  })

  it('an address with no paper is known from the address alone: nothing is loading, and the translated displays are out of reach (D1)', () => {
    const none = createController({ open: async () => fakeSession(), params: new URLSearchParams() }).getState()
    expect(none).toMatchObject({ noPaper: true, phase: 'ready', available: false, paper: { id: '', title: '' } })
    // an empty id is no paper either, with or without the live run asked for
    for (const query of ['paper=', 'live=1', 'live=1&paper=']) expect(createController({ open: async () => fakeSession(), params: new URLSearchParams(query) }).getState().noPaper, query).toBe(true)
    // and so is a value that is no arXiv id: neither the toolbar nor a link names it (PDF-READER §11.1)
    for (const query of ['paper=../list/cs.AI/new', 'paper=javascript:alert(1)', 'live=1&paper=1706.03762/../../x']) expect(createController({ open: async () => fakeSession(), params: new URLSearchParams(query) }).getState(), query).toMatchObject({ noPaper: true, paper: { id: '' } })
    // a paper named: the reader loads it as before
    expect(createController({ open: async () => fakeSession(), params: new URLSearchParams('paper=2608.02163') }).getState()).toMatchObject({ noPaper: false, phase: 'loading', available: true })
    expect(INITIAL.noPaper).toBe(false)
  })

  describe('the page\'s first read of the settings is drawn from the first frame, whatever it found (D2)', () => {
    const later = (config = { ...DEFAULT_CONFIG, targetLanguage: 'jpn' as const }): SessionEvent => ({ type: 'settings', config, pack: null })
    let host!: SessionHost
    const made = (reading: Parameters<typeof createController>[0]['reading'], params = 'paper=2608.02163') => createController({ open: async h => { host = h; return fakeSession() }, params: new URLSearchParams(params), reading })

    it('a read that answered: its settings are the state before any session says anything, readable', () => {
      const config = { ...DEFAULT_CONFIG, targetLanguage: 'jpn' as const }
      expect(made({ config, fallbackReason: null }).getState()).toMatchObject({ settings: config, settingsUnreadable: false })
    })

    it('a value that cannot be read, or a read that did not answer in time (null): the defaults, said to be unreadable; the session\'s settings replace them when they come', async () => {
      const unreadable = made({ config: DEFAULT_CONFIG, fallbackReason: { kind: 'tooNew', stored: 99, supported: 20 } })
      expect(unreadable.getState()).toMatchObject({ settings: DEFAULT_CONFIG, settingsUnreadable: true })
      const silent = made(null)
      expect(silent.getState()).toMatchObject({ settings: DEFAULT_CONFIG, settingsUnreadable: true })
      // storage answers at last: the session shows them, and the reader is itself again
      await silent.attach(panes())
      host.emit(later())
      host.emit({ type: 'notice', why: null })
      expect(silent.getState()).toMatchObject({ settings: { targetLanguage: 'jpn' }, settingsUnreadable: false })
    })

    it('no first read: nothing is known until the session says, and an address with no paper says it too', () => {
      expect(made(undefined).getState()).toMatchObject({ settings: null, settingsUnreadable: false })
      expect(made(null, '').getState()).toMatchObject({ settings: DEFAULT_CONFIG, settingsUnreadable: true, noPaper: true })
    })
  })

  it('an address with no paper keeps the original selected whatever display the session or the settings ask for: no translated display is there to be had (Devin on #329)', async () => {
    let host!: SessionHost
    const controller = createController({ open: async h => { host = h; return fakeSession() }, params: new URLSearchParams() })
    await controller.attach(panes())
    // the session\'s first display comes from the saved settings, and another tab\'s change can bring another
    for (const mode of ['translation', 'bilingual', 'translation'] as const) {
      host.emit({ type: 'display', mode })
      expect(controller.getState(), mode).toMatchObject({ display: 'original', noPaper: true })
    }
    // a paper named follows the session as ever
    const named = createController({ open: async h => { host = h; return fakeSession() }, params: new URLSearchParams('paper=2608.02163') })
    await named.attach(panes())
    host.emit({ type: 'display', mode: 'translation' })
    expect(named.getState().display).toBe('translation')
  })

  it('hands the session the page\'s first read of the settings, so that a storage that did not answer is not waited on twice (Codex on #329)', async () => {
    const reading = { config: DEFAULT_CONFIG, fallbackReason: null }
    for (const given of [reading, null, undefined]) {
      let host!: SessionHost
      const controller = createController({ open: async h => { host = h; return fakeSession() }, params: new URLSearchParams('paper=2608.02163'), ...(given === undefined ? {} : { reading: given }) })
      await controller.attach(panes())
      expect(host.reading, String(given && 'read')).toBe(given)
    }
  })

  it('remembers the zoom chosen from the menu, and forgets it on a step', async () => {
    const session = fakeSession()
    const controller = createController({ open: async () => session, params: new URLSearchParams() })
    await controller.attach(panes())
    controller.zoomTo('page-fit')
    expect(controller.getState().zoom).toBe('page-fit')
    controller.zoomBy(1.1)
    expect(controller.getState().zoom).toBeNull()
  })

  it('knows the window is narrow once told, and tells the session once', async () => {
    const session = { ...fakeSession(), setNarrow: vi.fn() }
    const controller = createController({ open: async () => session, params: new URLSearchParams() })
    await controller.attach(panes())
    controller.setNarrow(true)
    controller.setNarrow(true)
    await Promise.resolve()
    expect(controller.getState().narrow).toBe(true)
    expect(session.setNarrow).toHaveBeenCalledOnce()
  })

  it('stops telling a listener that unsubscribed', async () => {
    const controller = createController({
      open: async host => {
        host.emit({ type: 'scale', scale: 2 })
        return fakeSession()
      },
      params: new URLSearchParams(),
    })
    const heard = vi.fn()
    controller.subscribe(heard)()
    await controller.attach(panes())
    expect(heard).not.toHaveBeenCalled()
  })
})

describe('fromView: the reading view\'s events as the session\'s, the controller\'s second source', () => {
  it('folds an open, a page, a scale with its zoom, the display and the sync into the same state the session gives', () => {
    const state = fold([
      { type: 'display', display: 'original' }, { type: 'loading', loaded: 5, total: 10 }, { type: 'opened', pages: 4 }, { type: 'paper', title: 'A paper' },
      { type: 'page', side: 'right', page: 2, pages: 4, laid: false }, { type: 'scale', scale: 1.25, zoom: 'page-fit' }, { type: 'sync', on: false, available: true },
    ].map(e => fromView(e as never, '2600.00001')).filter((e): e is SessionEvent => e !== null))
    expect(state).toMatchObject({ display: 'original', loaded: 0.5, phase: 'ready', paper: { id: '2600.00001', title: 'A paper' }, scale: 1.25, zoom: 'page-fit', sync: false })
    expect(state.sides.right).toEqual({ page: 2, pages: 4 })
  })

  it('a view opened is ready in every display, and a retry that opens it mends a failure', () => {
    const view = (e: object) => fromView(e as never, '2600.00001') as SessionEvent
    const open = fold([{ type: 'display', display: 'bilingual' }, { type: 'opened', pages: 4 }].map(view))
    expect(open).toMatchObject({ display: 'bilingual', phase: 'ready' })
    const mended = fold([{ type: 'display', display: 'bilingual' }, { type: 'failed', error: '503' }, { type: 'opened', pages: 4 }].map(view))
    expect(mended).toMatchObject({ phase: 'ready', failure: null })
  })

  it('says a PDF that could not be opened is the network\'s failure, tells nothing of a dropped original, and the layer\'s state and pages laid', () => {
    const failed = fromView({ type: 'failed', error: '404' }, '2600.00001')
    expect(failed).toMatchObject({ type: 'fail', event: 'fetch failed', kind: 'network' })
    expect(fold([failed as SessionEvent])).toMatchObject({ phase: 'failed', failure: 'network' })
    expect(fromView({ type: 'dropped' }, 'x')).toBeNull()
    expect(fromView({ type: 'layer', state: 'open', laid: 1, total: 4 }, 'x')).toEqual({ type: 'layer', state: 'open', laid: 1, total: 4 })
  })

  it('keeps the zoom the controller chose where the engine does not say (the session\'s scale), and takes it where it does', () => {
    const chose = { ...INITIAL, zoom: 'page-fit' as const }
    expect(reduce(chose, { type: 'scale', scale: 2 }).zoom).toBe('page-fit')
    expect(reduce(chose, { type: 'scale', scale: 2, zoom: null }).zoom).toBeNull()
  })
})

