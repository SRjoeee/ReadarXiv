import { describe, expect, it } from 'vitest'
import { type ModelEntry, type Policy, parsePolicy, targetPolicyOf } from '../src/policy.ts'

/** the smallest valid policy: today's chain, alone, for every target */
const base = (): Policy => ({
  version: 1,
  pauseLlm: false,
  default: { ranking: ['free:default'], fast: 'free:default', upgrade: [] },
  activate: { minOwnShare: 0.95 },
  budget: { paidDailyUsd: 0, preheatMaxShare: 0.5 },
  free: [{ id: 'default', engines: ['google', 'microsoft'] }],
  models: [],
  groups: [],
  keys: [],
  upgrades: { inFlight: 2 },
  preheat: { perDay: 100, inFlight: 1, producers: [] },
})

/** a paid model whose check passed for `zh-CN` */
const model = (o: Partial<ModelEntry> = {}): ModelEntry => ({
  id: 'x',
  provider: 'anthropic',
  model: 'claude-haiku',
  shape: 'anthropic-messages',
  json: 'schema',
  billing: { mode: 'paid', usdPerMTokIn: 1, usdPerMTokOut: 5 },
  checks: { 'zh-CN': { at: '2026-11-26T00:00:00Z', ok: true, accepted: 40, of: 40 } },
  ...o,
})

/** a policy with model `x` ranked first and upgraded to for `zh-CN` */
const withX = (): Policy => {
  const p = base()
  p.models = [model()]
  p.targets = { 'zh-CN': { ranking: ['llm:x', 'free:default'], fast: 'free:default', upgrade: ['llm:x'] } }
  return p
}

/** the issues of a refused policy (the test fails if it is read) */
const refused = (v: unknown): string[] => {
  const r = parsePolicy(v)
  if (r.ok) throw new Error('read, where a refusal was expected')
  return r.issues
}
const names = (issues: string[], field: string) => issues.some((i) => i.startsWith(`${field}:`))

describe('a policy read: parsePolicy', () => {
  it('reads the smallest valid policy as it is', () => {
    const r = parsePolicy(base())
    expect(r).toEqual({ ok: true, policy: base() })
  })
  it('reads a policy that ranks a checked model for a named target', () => {
    expect(parsePolicy(withX()).ok).toBe(true)
  })
  it('refuses what is not an object, naming the whole', () => {
    expect(refused(null).length).toBeGreaterThan(0)
    expect(refused('policy').length).toBeGreaterThan(0)
  })
})

describe("a target's policy: targetPolicyOf", () => {
  it("is `default` for a target the policy does not name, the target's own where it does", () => {
    const p = base()
    expect(targetPolicyOf(p, 'ja')).toBe(p.default)
    const ja = { ranking: ['free:default' as const], fast: 'free:default' as const, upgrade: [] }
    p.targets = { ja }
    expect(targetPolicyOf(p, 'ja')).toBe(ja)
    expect(targetPolicyOf(p, 'ko')).toBe(p.default)
  })
  it('leaves out of `default` a model with no passing check for the target it is asked for, and keeps it where it has one', () => {
    const p = base()
    p.models = [model()]
    p.default = { ranking: ['llm:x', 'free:default'], fast: 'free:default', upgrade: ['llm:x'] }
    expect(parsePolicy(p).ok).toBe(true)
    expect(targetPolicyOf(p, 'zh-CN')).toBe(p.default)
    expect(targetPolicyOf(p, 'ja')).toEqual({ ranking: ['free:default'], fast: 'free:default', upgrade: [] })
  })
})

describe('what a policy is refused for: each names its field', () => {
  const cases: [string, string, (p: Policy) => unknown][] = [
    [
      'a ranking whose last is not a free chain',
      'targets.zh-CN.ranking',
      (p) => {
        p.targets = { 'zh-CN': { ranking: ['free:default', 'llm:x'], fast: 'free:default', upgrade: [] } }
        return p
      },
    ],
    [
      'an empty ranking',
      'default.ranking',
      (p) => {
        p.default.ranking = []
        return p
      },
    ],
    [
      'a ranking naming a free chain the policy has not',
      'default.ranking',
      (p) => {
        p.default.ranking = ['free:nope', 'free:default']
        return p
      },
    ],
    [
      'a ranking naming a model the policy has not',
      'targets.zh-CN.ranking',
      (p) => {
        p.targets = { 'zh-CN': { ranking: ['llm:nope', 'free:default'], fast: 'free:default', upgrade: [] } }
        return p
      },
    ],
    [
      'a ranking naming a producer twice',
      'default.ranking',
      (p) => {
        p.default.ranking = ['free:default', 'free:default']
        return p
      },
    ],
    [
      'a fast producer that is not a free chain',
      'targets.zh-CN.fast',
      (p) => {
        p.targets = { 'zh-CN': { ranking: ['llm:x', 'free:default'], fast: 'llm:x', upgrade: [] } }
        return p
      },
    ],
    [
      'a fast producer the ranking does not hold',
      'default.fast',
      (p) => {
        p.free.push({ id: 'ms', engines: ['microsoft'] })
        p.default.fast = 'free:ms'
        return p
      },
    ],
    [
      'an upgrade producer that is not a model',
      'targets.zh-CN.upgrade',
      (p) => {
        p.targets = { 'zh-CN': { ranking: ['llm:x', 'free:default'], fast: 'free:default', upgrade: ['free:default'] } }
        return p
      },
    ],
    [
      'an upgrade producer the ranking does not hold',
      'targets.zh-CN.upgrade',
      (p) => {
        p.models.push(model({ id: 'y' }))
        p.targets = { 'zh-CN': { ranking: ['llm:x', 'free:default'], fast: 'free:default', upgrade: ['llm:y'] } }
        return p
      },
    ],
    [
      'a ranked model with no passing check for the target',
      'targets.ja.ranking',
      (p) => {
        p.targets = { ...p.targets, ja: { ranking: ['llm:x', 'free:default'], fast: 'free:default', upgrade: [] } }
        return p
      },
    ],
    [
      'a ranked model whose check for the target failed',
      'targets.zh-CN.ranking',
      (p) => {
        p.models = [model({ checks: { 'zh-CN': { at: '2026-11-26T00:00:00Z', ok: false, accepted: 30, of: 40 } } })]
        return p
      },
    ],
    [
      'a producer name of no kind',
      'default.ranking.0',
      (p) => {
        ;(p.default.ranking as string[]) = ['google', 'free:default']
        return p
      },
    ],
    [
      'a preheat producer the default ranking does not hold',
      'preheat.producers.0',
      (p) => {
        p.preheat.producers = ['llm:x']
        return p
      },
    ],
    [
      'a key whose group the policy has not',
      'keys.0.group',
      (p) => {
        p.keys = [{ alias: 'k1', group: 'nope', order: 0, enabled: true }]
        return p
      },
    ],
    [
      'a paid model priced at zero',
      'models.0.billing.usdPerMTokIn',
      (p) => {
        p.models = [model({ billing: { mode: 'paid', usdPerMTokIn: 0, usdPerMTokOut: 5 } })]
        return p
      },
    ],
    [
      'a paid model with no price',
      'models.0.billing.usdPerMTokOut',
      (p) => {
        p.models = [model({ billing: { mode: 'paid', usdPerMTokIn: 1 } as ModelEntry['billing'] })]
        return p
      },
    ],
    [
      "a free model whose provider's group states neither a request nor a token limit",
      'models.0',
      (p) => {
        p.models = [model({ provider: 'siliconflow', billing: { mode: 'free' } })]
        p.groups = [{ id: 'sf', provider: 'siliconflow', limits: [{ per: 'day', usd: 1 }], verified: false }]
        return p
      },
    ],
    [
      'a free model whose provider has no group',
      'models.0',
      (p) => {
        p.models = [model({ provider: 'siliconflow', billing: { mode: 'free' } })]
        return p
      },
    ],
    [
      'a share to activate at zero',
      'activate.minOwnShare',
      (p) => {
        p.activate.minOwnShare = 0
        return p
      },
    ],
    [
      'a share to activate above one',
      'activate.minOwnShare',
      (p) => {
        p.activate.minOwnShare = 1.01
        return p
      },
    ],
    [
      'a preheat share above one',
      'budget.preheatMaxShare',
      (p) => {
        p.budget.preheatMaxShare = 1.5
        return p
      },
    ],
    [
      'a negative preheat share',
      'budget.preheatMaxShare',
      (p) => {
        p.budget.preheatMaxShare = -0.1
        return p
      },
    ],
    [
      'a negative budget',
      'budget.paidDailyUsd',
      (p) => {
        p.budget.paidDailyUsd = -1
        return p
      },
    ],
    [
      'a negative pool',
      'upgrades.inFlight',
      (p) => {
        p.upgrades.inFlight = -1
        return p
      },
    ],
    [
      'a negative pace',
      'preheat.perDay',
      (p) => {
        p.preheat.perDay = -1
        return p
      },
    ],
    [
      'a negative limit',
      'groups.0.limits.0.requests',
      (p) => {
        p.groups = [{ id: 'g', provider: 'anthropic', limits: [{ per: 'minute', requests: -5 }], verified: true }]
        return p
      },
    ],
    [
      'a negative key order',
      'keys.0.order',
      (p) => {
        p.groups = [{ id: 'g', provider: 'anthropic', limits: [], verified: true }]
        p.keys = [{ alias: 'k1', group: 'g', order: -1, enabled: true }]
        return p
      },
    ],
    [
      'a free chain of no engine',
      'free.0.engines',
      (p) => {
        p.free[0] = { id: 'default', engines: [] }
        return p
      },
    ],
    [
      'a free chain naming an engine twice',
      'free.0.engines',
      (p) => {
        p.free[0] = { id: 'default', engines: ['google', 'google'] }
        return p
      },
    ],
    [
      'two free chains of one id',
      'free.1.id',
      (p) => {
        p.free.push({ id: 'default', engines: ['microsoft'] })
        return p
      },
    ],
    [
      'two models of one id',
      'models.1.id',
      (p) => {
        p.models.push(model())
        return p
      },
    ],
    [
      'two groups of one id',
      'groups.1.id',
      (p) => {
        p.groups = [
          { id: 'g', provider: 'anthropic', limits: [], verified: true },
          { id: 'g', provider: 'openai', limits: [], verified: true },
        ]
        return p
      },
    ],
    [
      'two keys of one alias',
      'keys.1.alias',
      (p) => {
        p.groups = [{ id: 'g', provider: 'anthropic', limits: [], verified: true }]
        p.keys = [
          { alias: 'k1', group: 'g', order: 0, enabled: true },
          { alias: 'k1', group: 'g', order: 1, enabled: true },
        ]
        return p
      },
    ],
    ['an unknown top-level key', 'llmFirst', (p) => ({ ...p, llmFirst: true })],
    [
      'an unknown key of a target',
      'default.deadline',
      (p) => {
        ;(p.default as unknown as Record<string, unknown>).deadline = 3
        return p
      },
    ],
  ]
  for (const [what, field, make] of cases)
    it(what, () => {
      const issues = refused(make(withX()))
      expect(names(issues, field), `${field} in ${JSON.stringify(issues)}`).toBe(true)
    })
})
