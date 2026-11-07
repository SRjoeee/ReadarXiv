// The chain's translators from the saved configuration (src/providers/translators.ts): today's order and today's format
// rule, the engines offered as configured (DESIGN §8.5); whether one serves the target now is its own, asked per call
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import type { Config } from '@/config/schema'
import { translatorsOf } from '@/providers/translators'
import { WIRE_FORMATS } from '@/providers/wire-formats'

const SVC = { id: 'svc-abcd1234', kind: 'openai-compat' as const, name: 'Mine', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-x', model: 'x/y', thinking: 'disabled' as const }
const deps = { fetch: async () => { throw new Error('no network') }, chromeApi: { availability: async () => 'available', create: async () => ({ translate: async () => '' }) } }
const ids = (c: Partial<Config>) => {
  const t = translatorsOf({ ...DEFAULT_CONFIG, ...c } as Config, deps)
  return { chain: t.translators.map(x => t.answerers.get(x.identity)?.id), renderPath: t.renderPath, primary: t.primary.id }
}

describe('the translators of a configuration (DESIGN §8.5)', () => {
  it("the shipped default: Microsoft, then Google's, on markers; the built-in engine keeps tags only and does not join", () => {
    expect(ids({})).toEqual({ chain: ['microsoft', 'google-web'], renderPath: 'markers', primary: 'microsoft' })
  })
  it("one of the reader's services first, then the built-in engine and Google's, on tags", () => {
    expect(ids({ provider: SVC.id, services: [SVC] })).toEqual({ chain: [SVC.id, 'chrome-builtin', 'google-web'], renderPath: 'tags', primary: SVC.id })
  })
  it('Google first takes tags: the built-in engine joins, Microsoft never (markers only, #98)', () => {
    expect(ids({ provider: 'google-web' })).toEqual({ chain: ['google-web', 'chrome-builtin'], renderPath: 'tags', primary: 'google-web' })
    expect(ids({ provider: 'chrome-builtin' })).toEqual({ chain: ['chrome-builtin', 'google-web'], renderPath: 'tags', primary: 'chrome-builtin' })
  })
  it('with the fallback off only the first choice remains; a deleted service falls to the shipped default', () => {
    expect(ids({ provider: SVC.id, services: [SVC], fallback: { enabled: false } }).chain).toEqual([SVC.id])
    expect(ids({ provider: 'svc-gone0000', services: [] }).chain).toEqual(['microsoft', 'google-web'])
  })
  it("a service without its key stays first (the popup points to the settings page by it); it is off at its first request", () => {
    expect(ids({ provider: SVC.id, services: [{ ...SVC, apiKey: '' }] }).chain).toEqual([SVC.id, 'chrome-builtin', 'google-web'])
  })
  it('the render path is the first choice\'s first wire format (the settings page reads the same table)', () => {
    expect(ids({}).renderPath).toBe(WIRE_FORMATS.microsoft[0])
    expect(ids({ provider: SVC.id, services: [SVC] }).renderPath).toBe(WIRE_FORMATS['openai-compat'][0])
  })
  it('Microsoft is not offered the three targets whose Cyrillic it cannot write', async () => {
    const t = translatorsOf({ ...DEFAULT_CONFIG, targetLanguage: 'bos' } as Config, deps)
    expect(await t.translators[0]?.supports('bs')).toBe(false)
    const zh = translatorsOf(DEFAULT_CONFIG, deps)
    expect(await zh.translators[0]?.supports('zh')).toBe(true)
  })
})
