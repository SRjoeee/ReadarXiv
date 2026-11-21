// The registry of dead page sessions (DESIGN §4.5, §8.5): what the session router marks, every service reads; a mark is
// there at once and for good, and it names one scope whole.
import { describe, expect, it } from 'vitest'
import { CancelledScopeRegistry } from '@/providers/request/cancellation'

describe('CancelledScopeRegistry', () => {
  it('knows no scope until one is marked', () => {
    const registry = new CancelledScopeRegistry()
    expect(registry.has('session-1')).toBe(false)
    expect(registry.has('')).toBe(false)
  })

  it('reads a mark at once, with nothing awaited between', () => {
    const registry = new CancelledScopeRegistry()
    registry.markScope('session-1')
    expect(registry.has('session-1')).toBe(true)
  })

  it('keeps a mark for good: later reads, a second mark and time change nothing', async () => {
    const registry = new CancelledScopeRegistry()
    registry.markScope('session-1')
    registry.markScope('session-1')
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(registry.has('session-1')).toBe(true)
  })

  it('matches a scope whole: neither a key it begins nor one that begins with it', () => {
    const registry = new CancelledScopeRegistry()
    registry.markScope('session-1')
    expect(registry.has('session-10')).toBe(false)
    expect(registry.has('session-')).toBe(false)
    expect(registry.has('Session-1')).toBe(false)
  })

  it('keeps each registry to itself: two background lifetimes share no marks', () => {
    const a = new CancelledScopeRegistry()
    const b = new CancelledScopeRegistry()
    a.markScope('session-1')
    b.markScope('session-2')
    expect([a.has('session-1'), a.has('session-2'), b.has('session-1'), b.has('session-2')]).toEqual([true, false, false, true])
  })
})
