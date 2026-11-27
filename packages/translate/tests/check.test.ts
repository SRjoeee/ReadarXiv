// The model check's pass line (design §6) and what a check ran against.
import { describe, expect, it } from 'vitest'
import type { LlmEntry } from '../src/adapters/llm-shapes.ts'
import { type CheckSample, CheckSampleSchema, checkAgainstOf, checkOf, sampleDigestOf } from '../src/check.ts'
import type { Result } from '../src/contract.ts'
import { el, span, t, unit } from './pieces.ts'

const ID = 'llm:0123456789abcdef'
const ok = (id: string, by: string): Result => ({ id, ok: true, content: [{ t: 'text', s: 'x' }], by })
const no = (id: string): Result => ({ id, ok: false, why: { kind: 'refused' } })
const results = (n: number, okCount: number, by: string): Result[] =>
  Array.from({ length: n }, (_, i) => (i < okCount ? ok(`u${i}`, by) : no(`u${i}`)))

describe('checkOf: not below the free chain on the same sample', () => {
  it('38 of 40 against the free chain’s 39 fails', () => {
    expect(checkOf({ model: results(40, 38, ID), free: results(40, 39, 'google:x'), of: 40, identity: ID })).toEqual({
      ok: false,
      accepted: 38,
      of: 40,
      free: 39,
    })
  })
  it('39 and 39 passes', () => {
    expect(checkOf({ model: results(40, 39, ID), free: results(40, 39, 'microsoft:y'), of: 40, identity: ID }).ok).toBe(
      true,
    )
  })
  it('a unit no translator is asked for (`self`: no letter to send) counts for neither side', () => {
    // 40 units, the last one numbers only: both chains answer it `self`; the model accepts the 39 the free chain does
    const model = [...results(39, 39, ID), ok('u39', 'self')]
    const free = [...results(39, 39, 'google:x'), ok('u39', 'self')]
    expect(checkOf({ model, free, of: 40, identity: ID })).toEqual({ ok: true, accepted: 39, of: 40, free: 39 })
  })
  it('a result another translator answered (a fallback) is not the model’s; one of its runs is', () => {
    const model = [...results(38, 38, ID), ok('u38', 'google:x'), ok('u39', `runs:${ID}`)]
    expect(checkOf({ model, free: results(40, 39, 'google:x'), of: 40, identity: ID })).toEqual({
      ok: true,
      accepted: 39,
      of: 40,
      free: 39,
    })
  })
})

const entry: LlmEntry = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  shape: 'anthropic-messages',
  json: 'schema',
  reasoning: { thinking: { type: 'disabled' }, effort: 'low' },
}
const sample: CheckSample = {
  v: 1,
  target: 'zh-CN',
  units: [
    unit('a', [t('Let '), el('m', 'math'), t(' hold.')], true),
    unit('b', [span('s', 'italic', [t('Words')]), t(' end.')]),
  ],
}

describe('what a check ran against', () => {
  it('moves with the model and with the sample; equal for the same', () => {
    const d = sampleDigestOf(sample)
    expect(d).toMatch(/^[0-9a-f]{64}$/)
    const a = checkAgainstOf(entry, d)
    expect(checkAgainstOf(entry, d)).toBe(a)
    expect(checkAgainstOf({ ...entry, model: 'claude-haiku-5-6' }, d)).not.toBe(a)
    const other = sampleDigestOf({ ...sample, units: sample.units.slice(0, 1) })
    expect(other).not.toBe(d)
    expect(checkAgainstOf(entry, other)).not.toBe(a)
  })
  it('the sample’s digest is stable under the key order of its JSON', () => {
    const reordered = JSON.parse(
      '{"units":[{"sentences":true,"content":[{"s":"Let ","t":"text"},{"kind":"math","id":"m","t":"el"},{"s":" hold.","t":"text"}],"id":"a"},{"content":[{"content":[{"s":"Words","t":"text"}],"style":"italic","id":"s","t":"span"},{"s":" end.","t":"text"}],"id":"b"}],"target":"zh-CN","v":1}',
    ) as CheckSample
    expect(sampleDigestOf(reordered)).toBe(sampleDigestOf(sample))
  })
  it('the sample’s schema reads a sample and refuses what is none', () => {
    expect(CheckSampleSchema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample)
    expect(CheckSampleSchema.safeParse({ ...sample, v: 2 }).success).toBe(false)
    expect(CheckSampleSchema.safeParse({ ...sample, units: [{ id: 'x', content: [{ t: 'nope' }] }] }).success).toBe(
      false,
    )
  })
})
