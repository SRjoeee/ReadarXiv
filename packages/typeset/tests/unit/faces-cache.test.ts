// B.faces' two lookups cached by their tag (scriptOf, alphabetOf: pure functions of a language tag, cached as today's are):
// the cached answer is the direct one for every target the product lays and for tags of every shape, asked once or again;
// faceOf answers the same with the cache warm as from a module just loaded (its cache empty) over every face family the
// catalogue holds, each target, each weight, slant and caps; and the cache holds at most TAGS_CACHED tags.
import { describe, expect, it, vi } from 'vitest'
import { FACES } from '../../src/data/faces.ts'
import { alphabetOf, type CjkFaces, faceOf, rolesFor, scriptOf, TAGS_CACHED } from '../../src/breaker/faces.ts'
import type { TStyle } from '../../src/breaker/tokens.ts'

/** the targets with roles, and their CJK families as the rule set gives them */
const TARGETS: [string, CjkFaces][] = [
  ['zh', { group: 'shs-sc' }],
  ['zh-TW', { group: 'shs-tc' }],
  ['ja', { group: 'haranoaji' }],
  ['ko', { group: 'shs-k' }],
  ...['ru', 'uk', 'de', 'fr', 'es', 'pt', 'it', 'nl', 'pl', 'tr', 'cs', 'sv', 'en'].map((t): [string, CjkFaces] => [
    t,
    null,
  ]),
]
const DESIGNS = [
  ...new Set([
    'times',
    'cm',
    'libertine',
    'palatino',
    'charter',
    'garamond',
    'utopia',
    'helvetica',
    'cmss',
    'courier',
    'cmtt',
    'beramono',
    'inconsolata',
    'biolinum',
    'none',
  ]),
]

describe('B.faces: the tag lookups cached', () => {
  it('answers what the tag says, first and again, for the targets and tags of every shape', () => {
    const tags = [...TARGETS.map(([t]) => t), 'zh-Hant', 'zh-Hans-CN', 'sr', 'sr-Latn', 'ar', 'hi', 'el', 'he', 'th']
    for (const tag of tags)
      for (let i = 0; i < 2; i++) {
        expect([tag, scriptOf(tag)]).toEqual([tag, new Intl.Locale(tag).maximize().script])
        const language = new Intl.Locale(tag).language
        const direct = ['de', 'fr', 'es', 'pt', 'ru', 'it', 'nl', 'pl', 'tr', 'cs', 'sv', 'uk'].includes(language)
          ? language
          : new Intl.Locale(tag).maximize().script === 'Cyrl'
            ? 'Cyrl'
            : 'Latn'
        expect([tag, alphabetOf(tag)]).toEqual([tag, direct])
      }
  })

  it('gives every run the face a module with its cache empty gives it', async () => {
    const runs: [string, CjkFaces, string, TStyle, 'cjk' | 'latin'][] = []
    const families = new Set(Object.values(FACES).map((f) => f.family))
    expect(families.size).toBeGreaterThan(10)
    for (const [target, cjk] of TARGETS)
      for (const design of DESIGNS)
        for (const fam of ['serif', 'sans', 'mono', 'math'])
          for (const bold of [false, true])
            for (const italic of [false, true])
              for (const caps of [false, true])
                for (const cls of ['cjk', 'latin'] as const)
                  runs.push([target, cjk, design, { fam, design, bold, italic, caps }, cls])
    const warm = runs.map(([t, cjk, d, st, cls]) => faceOf(rolesFor(t, d, cjk), st, cls))
    vi.resetModules()
    const fresh = await import('../../src/breaker/faces.ts')
    const cold = runs.map(([t, cjk, d, st, cls]) => fresh.faceOf(fresh.rolesFor(t, d, cjk), st, cls))
    expect(cold).toEqual(warm)
  })

  it('keeps at most TAGS_CACHED tags and answers past them all the same', () => {
    // (more distinct valid tags than the cache keeps: English in every two-letter region)
    const many = Array.from(
      { length: TAGS_CACHED + 50 },
      (_, i) => `en-${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
    )
    for (const tag of many) expect(scriptOf(tag)).toBe(new Intl.Locale(tag).maximize().script)
  })
})
