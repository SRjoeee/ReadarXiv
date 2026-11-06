// A controller for the chrome's tests: a state the test sets, every command a spy. Its preferences are the reader's defaults
// with the highlight's bands a host gives (the package's DEFAULTS name none: the host's land with its preferences)
import { type Mock, vi } from 'vitest'
import { INITIAL, type ReaderController, type ReaderState } from '../../src/chrome/model.ts'
import { DEFAULTS, type Prefs } from '../../src/prefs.ts'

/** the controller with every command a spy the test can read */
type Spied<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : T[K] }

/** the preferences the tests read: the defaults, and three bands, two built in (named by the reader) and one the visitor's */
export const PREFS: Prefs = {
  ...DEFAULTS,
  bands: [
    { id: 'soft-green', colour: '#cdeccd', name: null },
    { id: 'sky', colour: '#cfe3f7', name: null },
    { id: 'mine', colour: '#f4d9e4', name: 'Mine' },
  ],
}

export function fakeController(over: Partial<ReaderState> = {}) {
  let state: ReaderState = {
    ...INITIAL,
    prefs: PREFS,
    paper: { id: '2608.02163', title: 'From Simple QA to Deep Research' },
    display: 'bilingual',
    phase: 'ready',
    ...over,
  }
  const listeners = new Set<() => void>()
  const controller = {
    getState: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    attach: vi.fn(async () => ({})),
    setDisplay: vi.fn(),
    setSync: vi.fn(),
    zoomBy: vi.fn(),
    zoomTo: vi.fn(),
    goToPage: vi.fn(),
    setPrefs: vi.fn(),
    pinch: vi.fn(),
    download: vi.fn(async () => {}),
    goToHeading: vi.fn(),
    lead: vi.fn(),
    retry: vi.fn(),
    setNarrow: vi.fn(),
  } as unknown as Spied<ReaderController>
  return {
    controller,
    set(next: Partial<ReaderState>) {
      state = { ...state, ...next }
      for (const l of listeners) l()
    },
  }
}
