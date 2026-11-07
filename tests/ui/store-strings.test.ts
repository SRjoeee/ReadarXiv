// The two strings Chrome itself shows (UI.md §6, public/_locales): the extensions page's and the store's description,
// and the shortcut's. Chrome picks the folder by its own interface language, so every interface language has one
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCALES, LOCALE_CODES } from '@readarxiv/ui'

const DIR = join(import.meta.dirname, '../../public/_locales')
const read = (folder: string) => JSON.parse(readFileSync(join(DIR, folder, 'messages.json'), 'utf8')) as Record<string, { message: string; description: string }>
/** Chrome names a locale's folder with an underscore: zh_CN, zh_TW */
const folderOf = (code: string) => code.replace('-', '_')

describe("the strings Chrome shows", () => {
  it('every interface language has its folder, and no folder is without its language', () => {
    expect(readdirSync(DIR).sort()).toEqual(LOCALE_CODES.map(folderOf).sort())
  })

  it('each folder holds the same two messages; the description fits the store\'s 132 characters (docs/RELEASE.md); the shortcut says what the context menu says', () => {
    const keys = Object.keys(read('en')).sort()
    for (const code of LOCALE_CODES) {
      const messages = read(folderOf(code))
      expect(Object.keys(messages).sort(), code).toEqual(keys)
      expect([...messages.description!.message].length, code).toBeLessThanOrEqual(132)
      expect(messages.toggle!.message, code).toBe(LOCALES[code].S.page.menuToggle)
    }
  })
})
