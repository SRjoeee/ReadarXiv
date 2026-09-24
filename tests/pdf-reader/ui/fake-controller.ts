// A controller for the interface's tests: a state the test sets, every command a spy
import { type Mock, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { INITIAL, type ReaderController, type ReaderState } from '@/pdf-reader/controller'

/** the controller with every command a spy the test can read */
type Spied<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : T[K] }

export function fakeController(over: Partial<ReaderState> = {}) {
  let state: ReaderState = { ...INITIAL, settings: DEFAULT_CONFIG, paper: { id: '2608.02163', title: 'From Simple QA to Deep Research' }, display: 'bilingual', phase: 'ready', ...over }
  const listeners = new Set<() => void>()
  const controller = {
    getState: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
    attach: vi.fn(async () => ({})),
    setDisplay: vi.fn(), setSync: vi.fn(), setFigures: vi.fn(), zoomBy: vi.fn(), zoomTo: vi.fn(), goToPage: vi.fn(), patchSettings: vi.fn(), download: vi.fn(async () => {}),
  } as unknown as Spied<ReaderController>
  return { controller, set(next: Partial<ReaderState>) { state = { ...state, ...next }; for (const l of listeners) l() } }
}
