import { describe, expect, it } from 'vitest'
import * as entry from '../src/index.ts'
import { adapterOf, chrome, type Fetch, google, microsoft, TRANSLATE_PURPOSE } from '../src/index.ts'

describe('@readarxiv/translate', () => {
  it('states what the package is for', () => {
    expect(TRANSLATE_PURPOSE).toBe('the translator contract, its adapters and the chain that falls back between them')
  })
  it("exports the translation policy's modules: its schema and reading, a producer's name and identity, plan and select", () => {
    for (const name of [
      'PolicySchema',
      'parsePolicy',
      'targetPolicyOf',
      'effectiveOf',
      'producerKindOf',
      'producerIdentityOf',
      'plan',
      'select',
    ])
      expect(typeof (entry as Record<string, unknown>)[name], name).not.toBe('undefined')
  })
  it("exports the LLM translator and the policy's spending decisions", () => {
    for (const name of [
      'llm',
      'llmIdentityOf',
      'LLM_LIMITS',
      'SPEND_MS',
      'CONTEXT_RULE',
      'LLM_TARGETS',
      'refusalOf',
      'bodyShapeOf',
      'pick',
      'checkOf',
      'checkAgainstOf',
      'sampleDigestOf',
      'CheckSampleSchema',
    ])
      expect(typeof (entry as Record<string, unknown>)[name], name).not.toBe('undefined')
  })
  it('its types are exported too (a compile-time check: this test fails to type-check without them)', () => {
    type Named = [
      entry.Spend,
      entry.Ticket,
      entry.Held,
      entry.Settlement,
      entry.LlmOptions,
      entry.LlmEntry,
      entry.Usage,
      entry.ModelRefusal,
      entry.RefusalClass,
      entry.PickState,
      entry.CheckSample,
    ]
    const named: Named | null = null
    expect(named).toBeNull()
  })
  it('runs in Node, with no DOM', () => {
    expect('document' in globalThis).toBe(false)
  })
})

describe("an identity's adapter (adapterOf): what a host keys a limit it shares among its translators by", () => {
  const fetch: Fetch = async () => {
    throw new Error('no request')
  }
  it("each adapter's translator is its own, whatever its identity's digest", () => {
    expect(adapterOf(microsoft({ fetch }).identity)).toBe('microsoft')
    expect(adapterOf(google({ fetch }).identity)).toBe('google')
    expect(adapterOf(chrome({ api: null }).identity)).toBe('chrome')
    expect(adapterOf('microsoft:0123456789abcdef')).toBe('microsoft')
  })
  it("an identity no adapter here makes is none: a host's own translator, a name alone, another shape", () => {
    for (const identity of [
      'llm:0123456789abcdef',
      'llm:1',
      'nameless',
      'microsoft',
      'microsoft:',
      'google:0123',
      'runs:microsoft:0123456789abcdef',
      'Microsoft:0123456789abcdef',
      'constructor:0123456789abcdef',
    ])
      expect(adapterOf(identity), identity).toBeNull()
  })
})
