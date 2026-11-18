import { describe, expect, it } from 'vitest'
import { LANG_CODES, toBcp47 } from '@/config/languages'
import { TARGETS } from '@/pdf-reader/engine/rules/layout.mjs'
import { READER_LANGUAGES } from '@/pdf-reader/host/languages'

describe('the languages the reader offers (the reader\'s design, §6.7)', () => {
  it('are the ones the layer sets (the engine\'s TARGETS), and every one of them', () => {
    expect(READER_LANGUAGES).toHaveLength(TARGETS.length)
    expect([...READER_LANGUAGES].sort()).toEqual(LANG_CODES.filter(c => (TARGETS as readonly string[]).includes(toBcp47(c))).sort())
  })

})

// The chrome names a target by the preference model's tag (packages/reader chrome/parts.tsx Languages): the extension's tables
// answer by the code that tag comes from (host/prefs.ts codeOf)
