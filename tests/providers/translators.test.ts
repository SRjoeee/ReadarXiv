// The chain's translators from the saved configuration (src/providers/translators.ts): today's order and today's format
// rule, the engines offered as configured (DESIGN §8.5); whether one serves the target now is its own, asked per call
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import type { Config } from '@/config/schema'
import { readerProviderOf } from '@/config/services'
import { readerTranslatorsOf, translatorsOf } from '@/providers/translators'
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

// The PDF reader's translators (the owner's ruling of 2026-11-19): a reader who never chose a translator (`providerChosen`,
// v22) asks the website's chain, Google's then Microsoft's, each writing its own wire (the package's chain), whatever the
// page's wire rule says; a reader who chose one keeps the page's chain, as before
describe("the PDF reader's translators of a configuration", () => {
  const reader = (c: Partial<Config>) => {
    const t = readerTranslatorsOf({ ...DEFAULT_CONFIG, ...c } as Config, deps)
    return { chain: t.translators.map(x => t.answerers.get(x.identity)?.id), primary: t.primary.id }
  }
  it("chosen by nobody: Google's, then Microsoft's, as the website asks them; the page's chain the same as before", () => {
    expect(reader({})).toEqual({ chain: ['google-web', 'microsoft'], primary: 'google-web' })
    expect(ids({})).toEqual({ chain: ['microsoft', 'google-web'], renderPath: 'markers', primary: 'microsoft' })
    // (the switch of the automatic fallback is an LLM service's, which nobody who never chose has: the website's chain whole)
    expect(reader({ fallback: { enabled: false } }).chain).toEqual(['google-web', 'microsoft'])
  })
  it("chosen: the page's chain, Microsoft's, Google's, Chrome's or a service of the reader's own first", () => {
    for (const c of [{ provider: 'microsoft' }, { provider: 'google-web' }, { provider: 'chrome-builtin' }, { provider: SVC.id, services: [SVC] }, { provider: SVC.id, services: [SVC], fallback: { enabled: false } }]) {
      const page = ids({ ...c, providerChosen: true })
      expect(reader({ ...c, providerChosen: true }), c.provider).toEqual({ chain: page.chain, primary: page.primary })
    }
    expect(reader({ provider: 'microsoft', providerChosen: true }).chain).toEqual(['microsoft', 'google-web'])
  })
  it("the website's two are the package's adapters, as the page's chain makes them: the same identities", () => {
    const site = readerTranslatorsOf(DEFAULT_CONFIG, deps)
    const page = translatorsOf(DEFAULT_CONFIG, deps)
    expect(site.translators.map(t => t.identity)).toEqual([...page.translators].reverse().map(t => t.identity))
  })
})

// The PDF reader's translator (config/services.ts readerProviderOf, UI.md S-P-46): one statement of who its chain asks first,
// which its service menu names and checks, so that the menu can never show one translator while the chain asks another
describe("the PDF reader's translator, the one its chain asks first", () => {
  const shapes: [string, Partial<Config>][] = [
    ['never chosen', {}],
    ['never chosen, the fallback off', { fallback: { enabled: false } }],
    ["Microsoft's chosen", { provider: 'microsoft', providerChosen: true }],
    ["Google's chosen", { provider: 'google-web', providerChosen: true }],
    ["Chrome's chosen", { provider: 'chrome-builtin', providerChosen: true }],
    ["a service of the reader's own chosen", { provider: SVC.id, services: [SVC], providerChosen: true }],
  ]
  it("never chosen: Google's; chosen: the pick, whichever it is", () => {
    expect(shapes.map(([, c]) => readerProviderOf({ ...DEFAULT_CONFIG, ...c }))).toEqual(['google-web', 'google-web', 'microsoft', 'google-web', 'chrome-builtin', SVC.id])
  })
  it('is the first the chain asks, and the one it names as its own (primary)', () => {
    for (const [name, c] of shapes) {
      const config = { ...DEFAULT_CONFIG, ...c } as Config
      const t = readerTranslatorsOf(config, deps)
      const first = t.answerers.get(t.translators[0]!.identity)?.id
      expect([first, t.primary.id], name).toEqual([readerProviderOf(config), readerProviderOf(config)])
    }
  })
})
