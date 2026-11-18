// The two entries beside the package's own that a host's pages take with no pack and no control (the manifest's `./languages`
// and `./bands`): the interface's languages and the pick of one from what the visitor chose and the browser's languages, which
// a page that may not load the packs still picks as the reader does; and the highlight's built-in bands, each its colour and its
// strength, which a host offers and gives the reader as the reader names them. Each reaches its own file alone, no package and
// no pack; what it states is what the package's entry states (the languages its packs', the bands the ones its catalogue names).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as bands from '../src/bands.ts'
import * as ui from '../src/index.ts'
import * as languages from '../src/languages.ts'

const SRC = join(import.meta.dirname, '../src')
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as {
  exports: Record<string, string>
}
/** every module a file names, comments out */
const namedBy = (file: string): string[] => {
  const text = readFileSync(join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  return [
    ...text.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
    ...text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
    ...text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g),
  ].map((m) => m[1] as string)
}

describe('@readarxiv/ui/languages', () => {
  it('is an entry of the package that reaches the table of codes alone: no pack, no control', () => {
    expect(manifest.exports['./languages']).toBe('./src/languages.ts')
    expect(namedBy('languages.ts')).toEqual(['./locales/codes.ts'])
    expect(namedBy('locales/codes.ts')).toEqual([])
    expect(Object.keys(languages).sort()).toEqual(['LOCALE_CODES', 'pickLocale'])
  })
  it("the languages are the packs', in the table's order; the pick is the package's own", () => {
    expect(languages.LOCALE_CODES).toEqual(Object.keys(ui.LOCALES))
    expect(languages.LOCALE_CODES).toBe(ui.LOCALE_CODES)
    expect(languages.pickLocale).toBe(ui.pickLocale)
  })
  it("picks the visitor's choice where it is one of them, else the first of the browser's languages it has, else English", () => {
    expect(languages.pickLocale('ja', ['zh-CN'])).toBe('ja')
    expect(languages.pickLocale('auto', ['zh-HK', 'en'])).toBe('zh-TW')
    expect(languages.pickLocale(undefined, ['de-DE', 'zh-Hans-TW'])).toBe('zh-CN')
    expect(languages.pickLocale('constructor', ['ko-KR'])).toBe('ko')
    expect(languages.pickLocale(undefined, ['x-klingon'])).toBe('en')
  })
})

describe('@readarxiv/ui/bands', () => {
  it('is an entry of the package, its own file, which names no module', () => {
    expect(manifest.exports['./bands']).toBe('./src/bands.ts')
    expect(namedBy('bands.ts')).toEqual([])
    expect(Object.keys(bands)).toEqual(['BUILT_IN_BANDS'])
    expect(ui.BUILT_IN_BANDS).toBe(bands.BUILT_IN_BANDS)
  })
  it('each built-in band its id, its colour and its strength, the first the one a visitor starts on; fixed', () => {
    expect(bands.BUILT_IN_BANDS.map((b) => Object.keys(b).sort())).toEqual(
      bands.BUILT_IN_BANDS.map(() => ['colour', 'id', 'opacity']),
    )
    expect(bands.BUILT_IN_BANDS[0]?.id).toBe('soft-green')
    expect(Object.isFrozen(bands.BUILT_IN_BANDS) && bands.BUILT_IN_BANDS.every((b) => Object.isFrozen(b))).toBe(true)
  })
  it('every pack names every built-in band, and no other', () => {
    const ids = bands.BUILT_IN_BANDS.map((b) => b.id).sort()
    for (const code of ui.LOCALE_CODES)
      expect(Object.keys(ui.LOCALES[code].O.reading.builtInHighlights).sort(), code).toEqual(ids)
  })
})
