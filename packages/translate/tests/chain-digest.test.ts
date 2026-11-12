// CHAIN_DIGEST (src/chain.ts) is the chain's outcomes over its case table (tests/chain-cases.ts): a change to one of the
// chain's rules that changes an outcome fails here until `pnpm digests --write` writes the new digest, which moves every
// chain's identity (identityOf), so every row is asked again.
import { describe, expect, it } from 'vitest'
import { CHAIN_DIGEST } from '../src/chain.ts'
import { CASES, chainDigest, RULES } from './chain-cases.ts'

describe("the chain's behaviour digest", () => {
  it('is the hash of its outcomes over the case table', async () => {
    const got = await chainDigest()
    expect(got, `the chain's outcomes changed: CHAIN_DIGEST is now ${got}; \`pnpm digests --write\` writes it`).toBe(
      CHAIN_DIGEST,
    )
  })
  it('has a case for every rule, and every case names one of them', () => {
    expect([...new Set(CASES.map((c) => c.rule))].sort()).toEqual([...RULES].sort())
  })
  it('is the same on a second run: no case depends on the order the chain settles in', async () => {
    expect(await chainDigest()).toBe(await chainDigest())
  })
})
