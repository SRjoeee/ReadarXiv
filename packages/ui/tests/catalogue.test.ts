// The string catalogue, word for word what it was before the packs moved into the package: every leaf of every pack,
// flattened by the rule of catalogue.ts, equal to the snapshot taken at the stage's base commit
// (scripts/catalogue-snapshot.ts). Every id of docs/UI.md resolves to the same words in every locale as before; a word the
// catalogue gained since is named in ADDED, by its path, in every locale, so that nothing else moves unseen
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCALE_CODES, LOCALES } from '../src/index.ts'
import { flattenCatalogue } from './catalogue.ts'

const BEFORE = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/catalogue-3f4da971c.json'), 'utf8'),
) as Record<string, string>

/** the words the catalogue gained since 3f4da971c, each a pack's path, with its id in docs/UI.md */
const ADDED: readonly string[] = [
  // S-R-28: a font lost (added 2026-11-19; the owner's sentence approved 2026-11-21)
  'R.status.facesLost',
]

describe('the string catalogue', () => {
  it('holds the five interface languages it held', () => {
    expect(LOCALE_CODES).toEqual(['zh-CN', 'zh-TW', 'ja', 'ko', 'en'])
  })

  it('says every word it said at 3f4da971c, in every locale, and beyond them only the words added since, in every locale', () => {
    const now = flattenCatalogue(LOCALES)
    expect(Object.keys(now).length).toBeGreaterThan(2000)
    expect(Object.fromEntries(Object.keys(BEFORE).map((k) => [k, now[k]]))).toEqual(BEFORE)
    const gained = Object.keys(now).filter((k) => !Object.hasOwn(BEFORE, k))
    expect(gained.sort()).toEqual(LOCALE_CODES.flatMap((code) => ADDED.map((path) => `${code} ${path}`)).sort())
  })
})
