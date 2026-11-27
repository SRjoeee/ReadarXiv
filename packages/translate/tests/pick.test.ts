import { describe, expect, it } from 'vitest'
import { pick } from '../src/pick.ts'
import type { KeyEntry } from '../src/policy.ts'

const keys = (): KeyEntry[] => [
  { alias: 'k2', group: 'g', order: 1, enabled: true },
  { alias: 'k1', group: 'g', order: 0, enabled: true },
  { alias: 'k3', group: 'h', order: 0, enabled: true },
]

describe('pick: the key a request is sent with', () => {
  it('the first enabled key by order, then alias, whose group has room', () => {
    expect(pick(keys(), { roomy: new Set(['g', 'h']), off: new Set() })).toBe('k1')
  })
  it('a key the ledger disabled is passed over', () => {
    expect(pick(keys(), { roomy: new Set(['g', 'h']), off: new Set(['k1']) })).toBe('k3')
  })
  it('a group without room is passed over', () => {
    expect(pick(keys(), { roomy: new Set(['g']), off: new Set(['k1']) })).toBe('k2')
  })
  it('a key not enabled is passed over; none left is null', () => {
    const ks = keys().map((k) => (k.alias === 'k2' ? { ...k, enabled: false } : k))
    expect(pick(ks, { roomy: new Set(['g']), off: new Set(['k1']) })).toBeNull()
    expect(pick(keys(), { roomy: new Set(), off: new Set() })).toBeNull()
  })
  it('the input is not changed: a frozen list does not throw', () => {
    const ks = Object.freeze(keys().map((k) => Object.freeze(k)))
    expect(pick(ks, { roomy: new Set(['g', 'h']), off: new Set() })).toBe('k1')
    expect(ks.map((k) => k.alias)).toEqual(['k2', 'k1', 'k3'])
  })
})
