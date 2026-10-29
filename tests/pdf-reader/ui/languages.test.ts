import { describe, expect, it } from 'vitest'
import { LANG_CODES, toBcp47 } from '@/config/languages'
import { TARGETS } from '@/pdf-reader/engine/rules/layout.mjs'
import { languageItems, READER_LANGUAGES } from '@/pdf-reader/ui/languages'

describe('the languages the reader offers (the reader\'s design, §6.7)', () => {
  it('are the ones the layer sets (the engine\'s TARGETS), and every one of them', () => {
    expect(READER_LANGUAGES).toHaveLength(TARGETS.length)
    expect([...READER_LANGUAGES].sort()).toEqual(LANG_CODES.filter(c => (TARGETS as readonly string[]).includes(toBcp47(c))).sort())
  })

  it('are named each in its own language, by script (CJK in the design\'s order, Latin, Cyrillic), the current one selected', () => {
    const items = languageItems('kor')
    const names = items.map(i => i.name)
    expect(names).toEqual([
      '日本語', '简体中文', '繁體中文', '한국어',
      'Bahasa Indonesia', 'Bahasa Melayu', 'Čeština', 'Deutsch', 'Español', 'Français', 'Italiano', 'Nederlands', 'Polski', 'Português', 'Svenska', 'Türkçe',
      'Български', 'Русский', 'Українська',
    ])
    // (each alphabet's languages in the order of their own names, as a reader reads the list)
    const collate = new Intl.Collator('und').compare
    for (const [from, to] of [[4, 16], [16, 19]] as const) expect(names.slice(from, to)).toEqual([...names.slice(from, to)].sort(collate))
    expect(items.filter(i => i.selected).map(i => i.name)).toEqual(['한국어'])
  })
})
