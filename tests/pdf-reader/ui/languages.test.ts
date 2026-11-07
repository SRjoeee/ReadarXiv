import { describe, expect, it } from 'vitest'
import { LANG_CODE_TO_LOCALE_NAME, LANG_CODES, toBcp47 } from '@/config/languages'
import { TARGETS } from '@/pdf-reader/engine/rules/layout.mjs'
import { chromeLanguages, languageItems, ownName, READER_LANGUAGES } from '@/pdf-reader/host/languages'
import { languageKeywords } from '@/ui/language-keywords'

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

// The chrome names a target by the preference model's tag (packages/reader chrome/parts.tsx Languages): the extension's tables
// answer by the code that tag comes from (host/prefs.ts codeOf)
describe('the languages as the chrome asks for them (chromeLanguages)', () => {
  const languages = chromeLanguages()

  it('name a target by its own name, as the menu lists it, whatever the interface\'s language; a tag the table lacks by the tag itself', () => {
    for (const code of READER_LANGUAGES) expect(languages.name(toBcp47(code)), code).toBe(LANG_CODE_TO_LOCALE_NAME[code])
    expect([languages.name('zzz'), ownName('zzz')]).toEqual(['zzz', 'zzz'])
  })

  it('tag a target by the tag it is: its own name is drawn in that language (WCAG 3.1.2)', () => {
    for (const code of READER_LANGUAGES) expect(languages.tag(toBcp47(code))).toBe(toBcp47(code))
    expect(languages.tag('ja')).toBe('ja')
  })

  it('list the rows by tag, in the menu\'s order and with its keywords, the current tag selected', () => {
    const items = languages.items('ko')
    expect(items.map(i => i.id)).toEqual(READER_LANGUAGES.map(toBcp47))
    expect(items.map(i => i.name)).toEqual(languageItems('kor').map(i => i.name))
    expect(items.map(i => i.keywords)).toEqual(READER_LANGUAGES.map(c => languageKeywords(c) ?? ''))
    expect(items.find(i => i.id === 'de')?.keywords).toContain('deu')
    expect(items.filter(i => i.selected).map(i => i.id)).toEqual(['ko'])
    // a target the reader does not offer: none selected
    expect(languages.items('zzz').filter(i => i.selected)).toEqual([])
  })
})
