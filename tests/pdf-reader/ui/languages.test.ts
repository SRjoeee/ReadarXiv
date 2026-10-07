import { describe, expect, it } from 'vitest'
import { LANG_CODES, toBcp47 } from '@/config/languages'
import { verified } from '@/pdf-reader/engine/scripts.mjs'
import { languageItems, READER_LANGUAGES } from '@/pdf-reader/ui/languages'

describe('the languages the reader typesets (the reader\'s design, §6.7)', () => {
  it('are the nine the typesetting gate verified, and every one of them', () => {
    expect(READER_LANGUAGES).toHaveLength(9)
    expect([...READER_LANGUAGES].sort()).toEqual(LANG_CODES.filter(c => verified(toBcp47(c))).sort())
  })

  it('are named each in its own language, in the design\'s order, the current one selected', () => {
    const items = languageItems('kor')
    expect(items.map(i => i.name)).toEqual(['日本語', '简体中文', '繁體中文', '한국어', 'Deutsch', 'Español', 'Français', 'Português', 'Русский'])
    expect(items.filter(i => i.selected).map(i => i.name)).toEqual(['한국어'])
  })
})
