// fromView (session/events.ts): the reading view's events as today's session tells them, folded by the chrome's controller
// (packages/reader chrome/model.ts reduce, whose own cases are the package's: tests/chrome/model.test.ts)
import { describe, expect, it } from 'vitest'
import { type SessionEvent as ChromeEvent, INITIAL, reduce } from '@readarxiv/reader'
import { fromView } from '@/pdf-reader/session/events'

/** the view's events as the session tells them, folded as the chrome's controller folds them */
const fold = (events: object[], paper = '2600.00001') =>
  events.map(e => fromView(e as never, paper)).filter((e): e is NonNullable<typeof e> => e !== null).reduce((state, e) => reduce(state, e as ChromeEvent), INITIAL)

describe('fromView: the reading view\'s events as the session\'s, the controller\'s second source', () => {
  it('folds an open, a page, a scale with its zoom, the display and the sync into the same state the session gives', () => {
    const state = fold([
      { type: 'display', display: 'original' }, { type: 'loading', loaded: 5, total: 10 }, { type: 'opened', pages: 4 }, { type: 'paper', title: 'A paper' },
      { type: 'page', side: 'right', page: 2, pages: 4, laid: false }, { type: 'scale', scale: 1.25, zoom: 'page-fit' }, { type: 'sync', on: false, available: true },
    ])
    expect(state).toMatchObject({ display: 'original', loaded: 0.5, phase: 'ready', paper: { id: '2600.00001', title: 'A paper' }, scale: 1.25, zoom: 'page-fit', sync: false })
    expect(state.sides.right).toEqual({ page: 2, pages: 4 })
  })

  it('a view opened is ready in every display, and a retry that opens it mends a failure', () => {
    const open = fold([{ type: 'display', display: 'bilingual' }, { type: 'opened', pages: 4 }])
    expect(open).toMatchObject({ display: 'bilingual', phase: 'ready' })
    const mended = fold([{ type: 'display', display: 'bilingual' }, { type: 'failed', error: '503' }, { type: 'opened', pages: 4 }])
    expect(mended).toMatchObject({ phase: 'ready', failure: null })
  })

  it('says a PDF that could not be opened is the network\'s failure, tells nothing of a dropped original, and the layer\'s state and pages laid', () => {
    const failed = fromView({ type: 'failed', error: '404' }, '2600.00001')
    expect(failed).toMatchObject({ type: 'fail', event: 'fetch failed', kind: 'network' })
    expect(fold([{ type: 'failed', error: '404' }])).toMatchObject({ phase: 'failed', failure: 'network' })
    expect(fromView({ type: 'dropped' }, 'x')).toBeNull()
    expect(fromView({ type: 'layer', state: 'open', laid: 1, total: 4 }, 'x')).toEqual({ type: 'layer', state: 'open', laid: 1, total: 4 })
  })

  it('passes on the pages the layer shows as arXiv\'s by the rule, and leaves them out where there are none: the end a translation holds waits on them (the controller\'s laying)', () => {
    expect(fromView({ type: 'layer', state: 'open', laid: 0, total: 13, original: 2 }, 'x')).toEqual({ type: 'layer', state: 'open', laid: 0, total: 13, original: 2 })
    expect(fromView({ type: 'layer', state: 'open', laid: 1, total: 13 }, 'x')).toEqual({ type: 'layer', state: 'open', laid: 1, total: 13 })
    // told after a translation done in side by side, nothing laid: the end held is told
    const held = [{ type: 'display', mode: 'bilingual' }, { type: 'opened' }, { type: 'coming' }, { type: 'translating', got: 0, total: 9, lost: 0 }, { type: 'translated', got: 9, total: 9, lost: 0, stopped: null }].reduce((s, e) => reduce(s, e as ChromeEvent), INITIAL)
    expect(held).toMatchObject({ phase: 'translating', laying: true })
    const ruled = fromView({ type: 'layer', state: 'open', laid: 0, total: 13, original: 2 }, 'x')!
    expect(reduce(held, ruled as ChromeEvent)).toMatchObject({ phase: 'ready', laying: false })
  })
})
