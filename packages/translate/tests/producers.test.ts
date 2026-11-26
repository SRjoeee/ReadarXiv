import { describe, expect, it } from 'vitest'
import { google } from '../src/adapters/google.ts'
import { microsoft } from '../src/adapters/microsoft.ts'
import { identityOf } from '../src/chain.ts'
import type { Fetch } from '../src/contract.ts'
import { producerIdentityOf, producerKindOf } from '../src/producers.ts'

const fetch: Fetch = async () => {
  throw new Error('no request')
}

describe("a producer's name: `free:<name>` or `llm:<name>`, what a policy calls it", () => {
  it('names its kind', () => {
    expect(producerKindOf('free:default')).toBe('free')
    expect(producerKindOf('llm:haiku')).toBe('llm')
    expect(producerKindOf('llm:deepseek-v4.flash_2')).toBe('llm')
  })
  it('is none for anything else: no kind, an empty tail, a capital, a space, a leading punctuation', () => {
    for (const bad of ['google', 'free:', 'llm:', 'FREE:x', 'free:a b', '', 'free:-a', 'free:X', 'paid:x', 'free:a:b'])
      expect(producerKindOf(bad), bad).toBeNull()
  })
})

describe("a producer's identity: the 12 hex that key its works and rows", () => {
  const list = [google({ fetch }), microsoft({ fetch })]
  it("is the head of the chain's identity over its ordered translators", async () => {
    const id = await producerIdentityOf(list)
    expect(id).toMatch(/^[0-9a-f]{12}$/)
    expect(id).toBe((await identityOf(list)).slice(0, 12))
  })
  it('holds the order of its translators', async () => {
    expect(await producerIdentityOf([...list].reverse())).not.toBe(await producerIdentityOf(list))
  })
})
