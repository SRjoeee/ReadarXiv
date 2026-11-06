// rulesFor over the data files: every language of the set resolves, a script's fields under a language's own, choices kept.
import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../../src/data/rules/index.ts'
import { NoRules, resolveRules, rulesFor, scriptOf } from '../../src/rules-for.ts'

describe('rulesFor', () => {
  it('resolves every language of the set, each written in a script the set holds', () => {
    for (const t of Object.keys(LANGUAGES)) expect(resolveRules(t).script).toBe(scriptOf(t))
    expect(scriptOf('zh-TW')).toBe('Hant')
    expect(resolveRules('zh-TW').params.centredPunct).toBe(true)
  })
  it('reads English’s patterns, the language’s own Latin, and a Cyrillic target’s', () => {
    expect(resolveRules('de').patterns).toEqual(['en', 'de'])
    expect(resolveRules('ru').patterns).toEqual(['en', 'ru'])
    expect(resolveRules('zh').patterns).toEqual(['en'])
  })
  it('answers fresh objects, the reader’s choices, and refuses a target it has no rules for', () => {
    const a = rulesFor('fr'),
      b = rulesFor('fr', { captions: { figure: 'original', table: 'target' }, leave: ['cell'] })
    expect(a.set).not.toBe(b.set)
    expect(a.captions).toEqual({ figure: 'target', table: 'target' })
    expect(b.leave).toEqual(['cell'])
    expect(() => rulesFor('xx')).toThrow(NoRules)
  })
})
