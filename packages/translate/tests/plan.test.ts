import { describe, expect, it } from 'vitest'
import { plan } from '../src/plan.ts'
import type { Policy } from '../src/policy.ts'
import type { Generation } from '../src/producers.ts'

/** today's chain for every target, and model `x` checked for `zh-CN`, upgraded to where `upgrade` says */
const policy = (o: { upgrade?: Policy['default']['upgrade']; pauseLlm?: boolean } = {}): Policy => ({
  version: 1,
  pauseLlm: o.pauseLlm ?? false,
  default: { ranking: ['llm:x', 'free:default'], fast: 'free:default', upgrade: o.upgrade ?? [] },
  activate: { minOwnShare: 0.95 },
  budget: { paidDailyUsd: 1, preheatMaxShare: 0.5 },
  free: [
    { id: 'default', engines: ['google', 'microsoft'] },
    { id: 'ms', engines: ['microsoft'] },
  ],
  models: [
    {
      id: 'x',
      provider: 'anthropic',
      model: 'claude-haiku',
      shape: 'anthropic-messages',
      json: 'schema',
      billing: { mode: 'paid', usdPerMTokIn: 1, usdPerMTokOut: 5 },
      checks: {
        'zh-CN': { at: '2026-11-26T00:00:00Z', ok: true, accepted: 40, of: 40, against: 'llm:0123456789abcdef|0' },
      },
    },
  ],
  groups: [],
  keys: [],
  upgrades: { inFlight: 2 },
  preheat: { perDay: 100, inFlight: 1, producers: [] },
})
const gen = (producer: Generation['producer'], state: Generation['state']): Generation => ({
  id: `${producer}-${state}`,
  producer,
  identity: '0123456789ab',
  state,
  ownShare: state === 'building' ? null : 1,
})
const fastDone = gen('free:default', 'complete')

describe("a target's translation steps: plan", () => {
  it('translates a paper with no generation by the fast producer', () => {
    expect(plan({ policy: policy(), target: 'zh-CN', generations: [] })).toEqual([
      { producer: 'free:default', why: 'fast' },
    ])
  })
  it('asks nothing more once the fast generation is complete and nothing is upgraded to', () => {
    expect(plan({ policy: policy(), target: 'zh-CN', generations: [fastDone] })).toEqual([])
  })
  it('asks nothing while the fast generation is building', () => {
    expect(plan({ policy: policy(), target: 'zh-CN', generations: [gen('free:default', 'building')] })).toEqual([])
  })
  it('upgrades a paper served by the fast generation to a checked model ranked above it', () => {
    expect(plan({ policy: policy({ upgrade: ['llm:x'] }), target: 'zh-CN', generations: [fastDone] })).toEqual([
      { producer: 'llm:x', why: 'upgrade' },
    ])
  })
  it('plans the fast translation and the upgrade together for a paper with no generation', () => {
    expect(plan({ policy: policy({ upgrade: ['llm:x'] }), target: 'zh-CN', generations: [] })).toEqual([
      { producer: 'free:default', why: 'fast' },
      { producer: 'llm:x', why: 'upgrade' },
    ])
  })
  it('plans no upgrade while models are paused, and still the fast translation', () => {
    const paused = policy({ upgrade: ['llm:x'], pauseLlm: true })
    expect(plan({ policy: paused, target: 'zh-CN', generations: [fastDone] })).toEqual([])
    expect(plan({ policy: paused, target: 'zh-CN', generations: [] })).toEqual([
      { producer: 'free:default', why: 'fast' },
    ])
  })
  it("plans no upgrade while the model's generation is building", () => {
    const generations = [fastDone, gen('llm:x', 'building')]
    expect(plan({ policy: policy({ upgrade: ['llm:x'] }), target: 'zh-CN', generations })).toEqual([])
  })
  it("plans no upgrade to a model whose generation for the paper's version and target was retired", () => {
    const generations = [fastDone, gen('llm:x', 'retired')]
    expect(plan({ policy: policy({ upgrade: ['llm:x'] }), target: 'zh-CN', generations })).toEqual([])
  })
  it("plans no fast translation where the fast producer's only generation was retired", () => {
    expect(plan({ policy: policy(), target: 'zh-CN', generations: [gen('free:default', 'retired')] })).toEqual([])
  })
  it("plans no upgrade where the model's generation is complete and selected", () => {
    const generations = [fastDone, gen('llm:x', 'complete')]
    expect(plan({ policy: policy({ upgrade: ['llm:x'] }), target: 'zh-CN', generations })).toEqual([])
  })
  it('plans no upgrade to a model for a target it has no passing check for', () => {
    expect(plan({ policy: policy({ upgrade: ['llm:x'] }), target: 'ja', generations: [fastDone] })).toEqual([])
  })
  it('plans no upgrade to a producer ranked below the one served', () => {
    const p = policy({ upgrade: ['llm:x'] })
    p.targets = { 'zh-CN': { ranking: ['free:ms', 'llm:x', 'free:default'], fast: 'free:default', upgrade: ['llm:x'] } }
    const generations = [fastDone, gen('free:ms', 'complete')]
    expect(plan({ policy: p, target: 'zh-CN', generations })).toEqual([])
  })
  it("reads a target's own part over `default`", () => {
    const p = policy({ upgrade: ['llm:x'] })
    p.targets = { 'zh-CN': { ranking: ['free:ms'], fast: 'free:ms', upgrade: [] } }
    expect(plan({ policy: p, target: 'zh-CN', generations: [fastDone] })).toEqual([
      { producer: 'free:ms', why: 'fast' },
    ])
    expect(plan({ policy: p, target: 'ko', generations: [] })).toEqual([{ producer: 'free:default', why: 'fast' }])
  })
})
