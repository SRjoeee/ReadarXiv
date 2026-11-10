// B.cover and S.relay on synthetic cases (B.cover's `served` needs the served slices' coverage, which the tap does not record;
// S.relay never runs on the corpus).
import { describe, expect, it } from 'vitest'
import { cover, runsOfTokens } from '../../src/breaker/cover.ts'
import type { Face, Token } from '../../src/breaker/tokens.ts'
import { relay } from '../../src/shared/relay.ts'
import type { Metrics } from '../../src/types.ts'

const face = (family: string, ids?: string[]): Face =>
  ({
    family,
    weight: 400,
    style: 'normal',
    oblique: 0,
    stand: 'serif',
    caps: false,
    size: 1,
    id: ids?.[0],
    ids,
  }) as Face
const SERIF = face('"axt-nimbus-roman"', ['nimbus-roman']),
  CJK = face('"axt-shs-sc"', ['shs-sc'])
const metricsOf = (ready: (font: string, text: string) => boolean | 'never'): Metrics => ({
  ready,
  advance: () => 0,
  ink: () => [0, 0, 0],
})

describe('B.cover', () => {
  const toks: Token[] = [
    { s: 'ab', face: SERIF },
    { space: true, face: SERIF },
    { s: '\u4e2d', face: CJK, hyph: 'en' },
    { s: 'x', face: face('serif') },
    { crop: {} } as Token,
  ] as Token[]
  it('reads each role face once with every character it sets, a space and a cut word’s hyphen', () => {
    expect(runsOfTokens(toks).map((r) => [r.font, r.text])).toEqual([
      ['400 100px "axt-nimbus-roman"', 'ab '],
      ['400 100px "axt-shs-sc"', '\u4e2d-'],
    ])
  })
  it('is ready where every face is, waits for one not loaded, and leaves the unit where no slice holds a character', () => {
    expect(
      cover(
        toks,
        metricsOf(() => true),
      ),
    ).toEqual({ ok: true })
    expect(
      cover(
        toks,
        metricsOf((f) => !f.includes('shs')),
      ),
    ).toEqual({ wait: [['400 100px "axt-shs-sc"', '\u4e2d-']] })
    expect(
      cover(
        toks,
        metricsOf((f, t) => (f.includes('shs') && t.includes('-') ? 'never' : true)),
      ),
    ).toEqual({
      ok: false,
      why: 'served',
      missing: '-',
    })
  })
})

describe('S.relay', () => {
  const lead = { id: 3, over: true, refused: false }
  const led = { refused: false, ledBy: 3, knob: 'none', kept: true }
  it('lays nothing again where the head was not laid over the row, or the follower was laid from its end', () => {
    expect(relay(null, led, true)).toEqual({ lead: false, follower: false })
    expect(relay({ ...lead, over: false }, led, true)).toEqual({ lead: false, follower: false })
    expect(relay({ ...lead, refused: true }, led, true)).toEqual({ lead: false, follower: false })
    expect(relay(lead, led, true)).toEqual({ lead: false, follower: false })
  })
  it('lays the head again where the follower is left, not led, or led below its floor; the follower again from it', () => {
    expect(relay(lead, { ...led, refused: true }, true)).toEqual({ lead: true, follower: true })
    expect(relay(lead, { ...led, ledBy: 2 }, true)).toEqual({ lead: true, follower: false })
    expect(relay(lead, { ...led, knob: 'below-floor' }, true)).toEqual({ lead: true, follower: true })
    expect(relay(lead, { ...led, knob: 'below-floor' }, false)).toEqual({ lead: true, follower: false })
    expect(relay(lead, { ...led, refused: true, kept: false }, true)).toEqual({ lead: true, follower: false })
  })
})
