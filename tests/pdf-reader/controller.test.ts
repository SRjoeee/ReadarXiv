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

  it('is ready once the original is open, when the original alone is shown', () => {
    expect(fold([{ type: 'display', mode: 'original' }, note('opened')]).phase).toBe('ready')
    expect(fold([{ type: 'display', mode: 'bilingual' }, note('opened')]).phase).toBe('loading')
  })

  it("counts the translation's progress and the paragraphs the service failed on", () => {
    const state = fold([note('digest'), note('engine'), note('translating'), note('source', { total: 40 }), note('translated', { got: 10, total: 40, lost: 2 })])
    expect(state.phase).toBe('translating')
    expect(state.progress).toBeCloseTo(0.25)
    expect(state.failedUnits).toBe(2)
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
    expect(fold([{ type: 'fail', event: 'not verified', text: '' }])).toMatchObject({ languageSupported: false, phase: 'ready', failure: null })
    expect(fold([{ type: 'fail', event: 'no engine', text: '', kind: 'no-key' }])).toMatchObject({ phase: 'failed', failure: 'no-key' })
    expect(fold([{ type: 'fail', event: 'crashed', text: '' }])).toMatchObject({ phase: 'failed', failure: 'unknown' })
  })

  it("knows when the extension's settings could not be read", () => {
    expect(fold([{ type: 'notice', why: { kind: 'tooNew' } }]).settingsUnreadable).toBe(true)
    expect(fold([{ type: 'notice', why: { kind: 'tooNew' } }, { type: 'notice', why: null }]).settingsUnreadable).toBe(false)
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
