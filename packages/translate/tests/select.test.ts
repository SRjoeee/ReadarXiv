import { describe, expect, it } from 'vitest'
import type { Generation } from '../src/producers.ts'
import { select } from '../src/select.ts'

const gen = (id: string, producer: Generation['producer'], state: Generation['state'] = 'complete'): Generation => ({
  id,
  producer,
  identity: producer === 'free:default' ? '064ad25e3aad' : '0123456789ab',
  state,
  ownShare: state === 'building' ? null : 1,
})
const a = gen('a', 'free:default')
const b = gen('b', 'llm:x')

describe('the generation a reader is served: select', () => {
  it("is the complete generation of the best-ranked producer that has one: a ranking's change alone flips it", () => {
    expect(select({ ranking: ['llm:x', 'free:default'], generations: [a, b] })).toBe(b)
    expect(select({ ranking: ['free:default', 'llm:x'], generations: [a, b] })).toBe(a)
  })
  it('passes over a generation that is building or retired', () => {
    expect(select({ ranking: ['llm:x', 'free:default'], generations: [a, gen('b', 'llm:x', 'building')] })).toBe(a)
    expect(select({ ranking: ['llm:x', 'free:default'], generations: [a, gen('b', 'llm:x', 'retired')] })).toBe(a)
  })
  it('is none where no generation is complete', () => {
    const building = [gen('a', 'free:default', 'building'), gen('b', 'llm:x', 'retired')]
    expect(select({ ranking: ['llm:x', 'free:default'], generations: building })).toBeNull()
    expect(select({ ranking: ['free:default'], generations: [] })).toBeNull()
  })
  it('never returns the generation of a producer the ranking does not hold, even the only complete one', () => {
    expect(select({ ranking: ['free:default'], generations: [gen('a', 'free:default', 'building'), b] })).toBeNull()
  })
  it("is a producer's later generation where it has several complete (given oldest first)", () => {
    const b2 = gen('b2', 'llm:x')
    expect(select({ ranking: ['llm:x', 'free:default'], generations: [b, a, b2] })).toBe(b2)
  })
})
