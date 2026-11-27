// A window's history as the reader's HostHistory (session/window-history.ts): the reader's state beside the host's, the address
// never touched, a state of another version read as none, and the unwind of an orderly close (the extension's frame taken away
// while arXiv's page stays: none of the reader's entries left in the page's history).
import { afterEach, describe, expect, it } from 'vitest'
import type { Entry } from '../src/session/jumps.ts'
import { windowHistory } from '../src/session/window-history.ts'

const entry = (n: number): Entry => ({ v: 1, n, place: { page: n + 1, at: 0.25, side: 'right' }, light: null })
const popped = () =>
  new Promise<void>((done) => window.addEventListener('popstate', () => setTimeout(done, 0), { once: true }))

afterEach(() => {
  history.replaceState(null, '')
})

describe('windowHistory', () => {
  it('keeps the host’s state and the address', () => {
    const href = location.href
    history.replaceState({ site: 1 }, '')
    const h = windowHistory(window)
    h.mark(entry(0))
    expect(history.state).toEqual({ site: 1, axt: entry(0) })
    h.push(entry(1))
    expect(history.state).toEqual({ site: 1, axt: entry(1) })
    expect(location.href).toBe(href)
    expect(h.current()).toEqual(entry(1))
  })

  it('reads an entry of another version, or a host’s own state, as none', () => {
    const h = windowHistory(window)
    history.replaceState({ axt: { ...entry(1), v: 2 } }, '')
    expect(h.current()).toBeNull()
    history.replaceState({ site: 1 }, '')
    expect(h.current()).toBeNull()
    history.replaceState('a string', '')
    expect(h.current()).toBeNull()
  })

  it('tells a traversal with the entry it lands on', async () => {
    const h = windowHistory(window)
    const told: (Entry | null)[] = []
    const off = h.listen((e) => told.push(e))
    h.mark(entry(0))
    h.push(entry(1))
    const p = popped()
    h.back()
    await p
    expect(told).toEqual([entry(0)])
    off()
  })

  it('unwinds an orderly close: back over every entry of the reader’s, told to no listener', async () => {
    const h = windowHistory(window)
    const told: (Entry | null)[] = []
    const off = h.listen((e) => told.push(e))
    h.mark(entry(0))
    h.push(entry(1))
    h.push(entry(2))
    await h.unwind()
    expect(h.current()).toEqual(entry(0))
    expect(told).toEqual([])
    off()
  })

  it('an unwind with no entry of the reader’s goes nowhere', async () => {
    const h = windowHistory(window)
    const before = history.length
    await h.unwind()
    expect(history.length).toBe(before)
  })
})
