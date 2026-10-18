// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNoteSaver } from '../../lab/pdf/layer-lab/notes.mjs'

// The lab's notes (lab/pdf/layer-lab/notes.mjs): a note is kept a moment after the last key press, for the fixture and with the
// text it was typed with. A fixture opened within that moment must neither take the note nor lose it.

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function saver() {
  const kept: [string, string][] = []
  return { kept, notes: createNoteSaver({ save: (fixture, text) => { kept.push([fixture, text]) } }) }
}

describe('the note saver', () => {
  it('keeps the last text typed once the delay is up, and once', () => {
    const { kept, notes } = saver()
    notes.type('a', 'imp')
    vi.advanceTimersByTime(300)
    notes.type('a', 'important')
    vi.advanceTimersByTime(399)
    expect(kept).toEqual([])
    vi.advanceTimersByTime(1)
    expect(kept).toEqual([['a', 'important']])
    vi.advanceTimersByTime(5000)
    expect(kept).toHaveLength(1)
  })

  it('keeps a note for the fixture it was typed for when another fixture is opened before the delay is up', () => {
    const { kept, notes } = saver()
    notes.type('a', 'important')
    // (the page moves to fixture b: what it asks the saver is only to keep what is waiting, before the box shows b's note)
    notes.flush()
    expect(kept).toEqual([['a', 'important']])
    // (the delay that was running does nothing more: b's note is not written under a, and a's not under b)
    vi.advanceTimersByTime(1000)
    expect(kept).toEqual([['a', 'important']])
  })

  it('keeps a note waiting for another fixture when a note is typed for this one, rather than dropping it', () => {
    const { kept, notes } = saver()
    notes.type('a', 'for a')
    notes.type('b', 'for b')
    expect(kept).toEqual([['a', 'for a']])
    vi.advanceTimersByTime(400)
    expect(kept).toEqual([['a', 'for a'], ['b', 'for b']])
  })

  it('keeps nothing when nothing waits', () => {
    const { kept, notes } = saver()
    notes.flush()
    vi.advanceTimersByTime(1000)
    expect(kept).toEqual([])
  })
})
