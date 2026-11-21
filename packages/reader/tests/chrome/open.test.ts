// A reader made into the chrome's session (chrome/open.ts openSession), the one glue of both hosts: the reader's state told as
// the chrome's events, with a host's own telling; the page's end, closed only where the page is left for good (a pagehide
// the back-forward cache keeps is no end); the chrome's commands the reader's, a patch's classes merged; the hold only for a
// host that asks for it
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionEvent } from '../../src/chrome/model.ts'
import type { ReaderState } from '../../src/reader.ts'

const made = vi.hoisted(() => ({ reader: null as unknown, opened: [] as unknown[] }))
vi.mock('../../src/reader.ts', async (real) => ({
  ...(await real<object>()),
  openReader: (_root: unknown, o: unknown) => {
    made.opened.push(o)
    return made.reader
  },
}))
const { openSession } = await import('../../src/chrome/open.ts')
const { DEFAULTS } = await import('../../src/prefs.ts')

function fakeReader() {
  let state = {
    paper: { id: '2600.00001', version: 1, title: '', html: null, pdf: '' },
    prefs: DEFAULTS,
    settings: { s: 'landed', refused: 0 },
    original: { s: 'opening', loaded: 0, total: 0 },
    layer: { s: 'none' },
    rows: { target: 'de', from: 'here', s: 'none' },
    view: {
      display: 'bilingual',
      sync: { on: true, available: false },
      scale: 1,
      zoom: 'page-width',
      narrow: false,
      sides: { left: { page: 1, pages: 0 }, right: { page: 1, pages: 0 } },
      outline: [],
      heading: null,
    },
    reconnecting: false,
    network: false,
    crashed: false,
  } as unknown as ReaderState
  const listeners = new Set<() => void>()
  const reader = {
    state: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    do: vi.fn(),
    probe: vi.fn(() => ({ laidPages: 0 })),
    close: vi.fn(),
    set(s: Partial<ReaderState>) {
      state = { ...state, ...s }
      for (const l of listeners) l()
    },
  }
  made.reader = reader
  return reader
}
const chrome = (emitted: unknown[]) =>
  ({
    left: document.createElement('div'),
    right: document.createElement('div'),
    emit: (e: unknown) => emitted.push(e),
  }) as never
const pagehide = (persisted: boolean) => dispatchEvent(Object.assign(new Event('pagehide'), { persisted }))

afterEach(() => {
  made.opened = []
})

describe('openSession', () => {
  it("opens the reader on the host's paper (a promise of it too), tells its state through the host's telling", async () => {
    const reader = fakeReader()
    const emitted: unknown[] = []
    const tell = vi.fn(
      (events: readonly SessionEvent[], _s: ReaderState, _before: ReaderState | null): SessionEvent[] => [
        ...events,
        { type: 'opened' },
      ],
    )
    await openSession({ host: {} as never, paper: async () => '2600.00001v1', tell })(chrome(emitted))
    expect(made.opened).toMatchObject([{ paper: '2600.00001v1' }])
    expect(emitted.at(-1)).toEqual({ type: 'opened' })
    const n = tell.mock.calls.length
    reader.set({ crashed: true })
    expect(tell.mock.calls.length).toBe(n + 1)
    expect(tell.mock.calls.at(-1)?.[2]).toMatchObject({ crashed: false })
  })
  it('the page put away in the back-forward cache keeps its reader; the page left for good closes it, once', async () => {
    const reader = fakeReader()
    const closed = vi.fn()
    await openSession({ host: {} as never, paper: '2600.00001v1', closed })(chrome([]))
    pagehide(true)
    expect(reader.close).not.toHaveBeenCalled()
    pagehide(false)
    pagehide(false)
    expect([reader.close.mock.calls.length, closed.mock.calls.length]).toEqual([1, 1])
  })
  it("the chrome's commands are the reader's: a patch's classes merged into the shown ones; the hold only for a host that asks", async () => {
    const reader = fakeReader()
    const session = await openSession({ host: {} as never, paper: '2600.00001v1' })(chrome([]))
    session.setPrefs({ classes: { references: true } })
    expect(reader.do).toHaveBeenLastCalledWith({
      do: 'set',
      prefs: { classes: { ...DEFAULTS.classes, references: true } },
    })
    session.retry()
    expect(reader.do).toHaveBeenLastCalledWith({ do: 'retry' })
    expect(session.hold).toBeUndefined()
    fakeReader()
    const held = await openSession({ host: {} as never, paper: '2600.00001v1', hold: true })(chrome([]))
    held.hold?.(true)
    expect((made.reader as { do: ReturnType<typeof vi.fn> }).do).toHaveBeenLastCalledWith({ do: 'hold', on: true })
  })
})
