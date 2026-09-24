import { describe, expect, it, vi } from 'vitest'
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
    const state = fold([note('digest'), note('source', { total: 40 }), note('translated', { got: 10, total: 40, lost: 2 })])
    expect(state.phase).toBe('translating')
    expect(state.progress).toBeCloseTo(0.25)
    expect(state.failedUnits).toBe(2)
  })

  it("says translating again when this machine's copy is being made again", () => {
    expect(fold([note('cache hit'), note('shown cached'), note('translated', { got: 1, total: 4, again: true })]).phase).toBe('retranslating')
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

  it('keeps the same state object for an event that changes nothing', () => {
    expect(reduce(INITIAL, { type: 'status', text: 'opening…' })).toBe(INITIAL)
  })
})

const fakeSession = (): Session => ({ setDisplay: vi.fn(), setSyncMode: vi.fn(), setCompositor: vi.fn(), setFigures: vi.fn(), zoomBy: vi.fn(), zoomTo: vi.fn(), goToPage: vi.fn() })
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
