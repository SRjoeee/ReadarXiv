// @vitest-environment node
// The engine's wrap of its own sample (tests/fixtures/pdf/ocg/: sample-1's final pass and the pair scripts/make-ocg-sample.mjs
// writes of it) is today's: the website's test wraps the same final pass with its Worker and compares it with this pair, so a
// change of the marked compile or of the wrap that leaves the pair stale is caught here, not at the website's pin (round 8 B9:
// marks-2's label points left it stale from 05e376096 on, our gates green). Remake: scripts/make-sample-bundle.mjs --final,
// then scripts/make-ocg-sample.mjs.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script of the repository's
import { sampleWrapSame } from '../../scripts/make-ocg-sample.mjs'

describe("the engine's recorded wrap of its sample", () => {
  it('is the wrap the engine makes of the committed final pass now (make-ocg-sample.mjs --check)', { timeout: 60_000 }, async () => {
    expect(await sampleWrapSame()).toBe(true)
  })
})
