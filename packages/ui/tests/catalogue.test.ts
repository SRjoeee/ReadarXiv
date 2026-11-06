// The string catalogue, word for word what it was before the packs moved into the package: every leaf of every pack,
// flattened by the rule of catalogue.ts, equal to the snapshot taken at the stage's base commit
// (scripts/catalogue-snapshot.ts). Every id of docs/UI.md resolves to the same words in every locale as before
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCALE_CODES, LOCALES } from '../src/index.ts'
import { flattenCatalogue } from './catalogue.ts'

const BEFORE = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/catalogue-3f4da971c.json'), 'utf8'),
) as Record<string, string>

describe('the string catalogue', () => {
  it('holds the five interface languages it held', () => {
    expect(LOCALE_CODES).toEqual(['zh-CN', 'zh-TW', 'ja', 'ko', 'en'])
  })

  it('says every word it said at 3f4da971c, in every locale, and nothing more', () => {
    const now = flattenCatalogue(LOCALES)
    expect(Object.keys(now).length).toBeGreaterThan(2000)
    expect(now).toEqual(BEFORE)
  })
})
