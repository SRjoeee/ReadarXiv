// What `pnpm digests` recomputes (tests/digests.ts) is what the repository's tests hold: every behaviour digest's literal is
// the hash of its case table, the same table its own test reads (accept.test.ts, translatorSuite, chain-digest.test.ts).
import { describe, expect, it } from 'vitest'
import { DIGESTS } from './digests.ts'

describe('every behaviour digest of the repository, as `pnpm digests` computes it', () => {
  for (const d of DIGESTS)
    it(`${d.name} (${d.file})`, async () => {
      const got = await d.compute()
      expect(got, `${d.name} is now ${got}: \`pnpm digests --write\` writes it`).toBe(d.literal)
    })
  it('names each constant once', () => {
    expect(new Set(DIGESTS.map((d) => d.name)).size).toBe(DIGESTS.length)
  })
})
