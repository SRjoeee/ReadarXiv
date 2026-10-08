import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { createController, INITIAL, reduce, type Session } from '@/pdf-reader/controller'
import type { SessionEvent, SessionHost } from '@/pdf-reader/engine/session.mjs'

const note = (event: string, counts: Partial<{ got: number; total: number; lost: number; again: boolean }> = {}): SessionEvent => ({ type: 'note', event, data: {}, got: 0, total: 0, lost: 0, again: false, ...counts })
const fold = (events: SessionEvent[], from = INITIAL) => events.reduce(reduce, from)

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

  it('is ready once the original is open, when the original alone is shown', () => {
    expect(fold([{ type: 'display', mode: 'original' }, note('opened')]).phase).toBe('ready')
    expect(fold([{ type: 'display', mode: 'bilingual' }, note('opened')]).phase).toBe('loading')
  })

  it("a copy shown counts the passages it holds in the original from the moment it is on screen, whatever follows — current, not checked, or translated again (N-5)", () => {
    // the service unreachable: the copy shown, and nothing after it
    expect(fold([note('digest'), note('cache hit'), note('shown cached', { lost: 2 })])).toMatchObject({ phase: 'ready', shown: 'copy', failedUnits: 2 })
    // translated again: the run's own count from its start
    expect(fold([note('shown cached', { lost: 2 }), note('translating', { again: true })]).failedUnits).toBe(0)
  })

  it("a copy current on a visit again counts the passages it holds in the original, as the run that made it did (I-6 of 2026-10-04)", () => {
    expect(fold([note('digest'), note('cache hit'), note('shown cached'), note('cache current', { lost: 2 })])).toMatchObject({ phase: 'ready', failedUnits: 2 })
    expect(fold([note('digest'), note('cache hit'), note('shown cached'), note('cache current')]).failedUnits).toBe(0)
  })

  it("counts the translation's progress and the paragraphs the service failed on", () => {
    const state = fold([note('digest'), note('engine'), note('translating'), note('source', { total: 40 }), note('translated', { got: 10, total: 40, lost: 2 })])
    expect(state.phase).toBe('translating')
    expect(state.progress).toBeCloseTo(0.25)
    expect(state.failedUnits).toBe(2)
  })

  it('counts the compiles that end once the translation is over — every paragraph in or lost, or the service stopped — and from nothing at a run\'s start (the F2 review\'s M1)', () => {
    const start = [note('translating', { total: 4 }), note('fonts', { total: 4 }), note('translated', { got: 2, total: 4 }), note('preview', { got: 2, total: 4 })]
    expect(fold(start).finishing).toBe(-1)
    const over = fold([...start, note('translated', { got: 4, total: 4 }), note('preview', { got: 4, total: 4 }), note('original', { got: 4, total: 4 }), note('typeset', { got: 4, total: 4 }), note('final', { got: 4, total: 4 })])
    expect(over.finishing).toBe(3)
    expect(fold([note('translating', { total: 4 })], over).finishing).toBe(-1)
    expect(fold([...start, note('translated', { got: 3, total: 4, lost: 1 }), note('final', { got: 3, total: 4, lost: 1 })]).finishing).toBe(1)
    expect(fold([...start, note('stopped', { got: 2, total: 4 }), note('final', { got: 2, total: 4 })]).finishing).toBe(1)
  })

  it("says translating again when this machine's copy is being made again", () => {
    expect(fold([note('cache hit'), note('shown cached'), note('engine'), note('translating', { again: true }), note('translated', { got: 1, total: 4, again: true })]).phase).toBe('retranslating')
  })

  // the phases a run passes through, each once, in order: what the capsule would show (the design, §8)
  const phases = (events: SessionEvent[]) => {
    const seen: string[] = []
    events.reduce((state, event) => {
      const next = reduce(state, event)
      if (seen.at(-1) !== next.phase) seen.push(next.phase)
      return next
    }, INITIAL)
    return seen
  }
  const bilingual: SessionEvent = { type: 'display', mode: 'bilingual' }
  const copyShown = [note('digest'), note('cache hit'), note('cached opened'), note('shown cached')]

  it("goes from loading to reading on a revisit with a current copy, never through translating (final review)", () => {
    expect(phases([bilingual, note('opened'), ...copyShown, note('engine'), note('cache current')])).toEqual(['loading', 'ready'])
  })

  it("reads this machine's copy when no service can check it (final review)", () => {
    expect(phases([bilingual, note('opened'), ...copyShown, note('done')])).toEqual(['loading', 'ready'])
  })

  it("keeps reading this machine's copy when the network is down, the failure kept (final review)", () => {
    const events: SessionEvent[] = [bilingual, note('opened'), ...copyShown, note('engine'), note('translating', { again: true }), { type: 'fail', event: 'fetch failed', text: '', kind: 'network' }]
    expect(fold(events)).toMatchObject({ phase: 'ready', failure: 'network' })
    expect(phases(events)).not.toContain('failed')
  })

  it("translates again, never as a first translation, when this machine's copy is being replaced (final review)", () => {
    const run = [note('source fetched', { again: true }), note('source', { total: 4, again: true }), note('anchored', { again: true }), note('translated', { got: 4, total: 4, again: true }), note('shown preview', { again: true }), note('shown final', { again: true }), note('done', { again: true })]
    expect(phases([bilingual, note('opened'), ...copyShown, note('engine'), note('translating', { again: true }), ...run])).toEqual(['loading', 'ready', 'retranslating', 'ready'])
  })

  it('loads, then translates, when a translation is asked for after the original alone was read', () => {
    expect(phases([note('opened'), bilingual, note('digest'), note('engine'), note('translating'), note('source', { total: 4 }), note('shown final'), note('done')])).toEqual(['ready', 'loading', 'translating', 'ready'])
  })

  it('has a final to download while a copy or the final is on screen, not while a draft replaces it (final review)', () => {
    const copy = fold(copyShown)
    expect(copy.finalReady).toBe(true)
    const draft = fold([note('engine'), note('translating', { again: true }), note('shown preview', { again: true })], copy)
    expect(draft.finalReady).toBe(false)
    expect(fold([note('shown final', { again: true })], draft).finalReady).toBe(true)
    expect(fold([note('digest'), note('cache hit'), note('cached opened'), note('cache unusable')]).finalReady).toBe(false)
  })

  it("names a failure by the chain's error kinds alone, the popup's reasons (final review)", () => {
    expect(fold([{ type: 'fail', event: 'failed', text: '', kind: 'auth' }]).failure).toBe('auth')
    expect(fold([{ type: 'fail', event: 'no engine', text: '', kind: 'unavailable' }]).failure).toBe('unknown')
  })

  it('has the final ready once it is on screen, or once a current copy is', () => {
    expect(fold([note('translated', { got: 4, total: 4 }), note('shown final'), note('done', { got: 4, total: 4 })])).toMatchObject({ phase: 'ready', finalReady: true, progress: 1 })
    expect(fold([note('digest'), note('cache hit'), note('shown cached'), note('cache current')])).toMatchObject({ phase: 'ready', finalReady: true })
  })

  it('tells a paper that cannot be had from a language not supported from a failure', () => {
    expect(fold([{ type: 'fail', event: 'no source', text: '' }])).toMatchObject({ available: false, phase: 'ready', failure: null })
    // nothing typeset, every strategy tried: a paper that cannot be had as a bilingual PDF too, not a failure to retry
    expect(fold([{ type: 'fail', event: 'cannot typeset', text: '' }])).toMatchObject({ available: false, phase: 'ready', failure: null })
    // its HTML version, where the reader can go instead
    expect(fold([{ type: 'html', url: 'https://arxiv.org/html/1706.03762#readarxiv' }])).toMatchObject({ htmlVersion: 'https://arxiv.org/html/1706.03762#readarxiv' })
    expect(fold([{ type: 'fail', event: 'not verified', text: '' }])).toMatchObject({ languageSupported: false, phase: 'ready', failure: null })
    expect(fold([{ type: 'fail', event: 'no engine', text: '', kind: 'no-key' }])).toMatchObject({ phase: 'failed', failure: 'no-key' })
    expect(fold([{ type: 'fail', event: 'crashed', text: '' }])).toMatchObject({ phase: 'failed', failure: 'unknown' })
  })

  it('a run that could show only part of its translation: said, the preview kept, the translated displays not greyed; a run again starts without it (S-R-19)', () => {
    const s = fold([note('shown preview', { got: 9, total: 103 }), { type: 'html', url: 'https://arxiv.org/html/x#readarxiv' }, { type: 'fail', event: 'shown in part', text: '' }, note('done', { got: 103, total: 103 })])
    expect(s).toMatchObject({ partial: true, available: true, phase: 'ready', shown: 'preview', failure: null, htmlVersion: 'https://arxiv.org/html/x#readarxiv' })
    expect(INITIAL.partial).toBe(false)
    expect(fold([note('translating', { got: 0, total: 103 })], s).partial).toBe(false)
  })

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
    expect(reduce(INITIAL, { type: 'status', text: 'opening…' })).toBe(INITIAL)
  })
})

const fakeSession = (): Session => ({ setDisplay: vi.fn(), setSyncMode: vi.fn(), setCompositor: vi.fn(), setFigures: vi.fn(), zoomBy: vi.fn(), zoomTo: vi.fn(), goToPage: vi.fn(), patchSettings: vi.fn(), pdfBytes: vi.fn(async () => null), goToUnit: vi.fn(), lead: vi.fn(), retry: vi.fn(), setNarrow: vi.fn(), pinch: vi.fn() })
const panes = () => ({ left: document.createElement('div'), right: document.createElement('div') })

describe('createController', () => {
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
