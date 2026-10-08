import { describe, expect, it } from 'vitest'
import { HYPHEN_LANGS, loadHyphenator } from '@/pdf-reader/engine/layer/hyphen.mjs'

// Slice 1's hyphenation is the interface alone: the layer asks, and no language hyphenates until Slice 2's patterns

describe('loadHyphenator in Slice 1', () => {
  it('names the six languages the rule set hyphenates', () => {
    expect(HYPHEN_LANGS).toEqual(['en', 'de', 'fr', 'es', 'pt', 'ru'])
    expect(Object.isFrozen(HYPHEN_LANGS)).toBe(true)
  })

  it('resolves null for every language, those it names and any other', async () => {
    for (const lang of [...HYPHEN_LANGS, 'ja', 'zh', '']) expect(await loadHyphenator(lang)).toBeNull()
  })
})
