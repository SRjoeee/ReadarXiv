import { describe, expect, it } from 'vitest'
import { diffRules, edit, isEdited, reset, same, sourceOf, fieldValue } from '../../lab/pdf/layer-lab/rules-model.mjs'
import { BUILTIN_RULES, parseRules, RULES_FIELDS, type RuleField, type RuleSet, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// The rules panel's model (lab/pdf/layer-lab/rules-model.mjs, the rules-as-data plan §7): where a field's value for a target
// comes from, how an edit lands in the language or the script, how it is taken back, and how two sets differ

const field = (path: string): RuleField => {
  const f = RULES_FIELDS.find(x => x.path === path)
  if (!f) throw new Error(path)
  return f
}
/** the built-in set, thawed: a set to edit */
const fresh = (): RuleSet => structuredClone(BUILTIN_RULES) as RuleSet
const BASE = fresh()

describe('the value of a field for a target', () => {
  it('is the language\'s own over the script\'s, as resolveRules reads them', () => {
    // (de overrides latinPatterns; zh does not)
    expect(fieldValue(BASE, field('latinPatterns'), 'Latn', 'de')).toBe('de')
    expect(fieldValue(BASE, field('latinPatterns'), 'Latn', 'fr')).toBe('en')
    expect(fieldValue(BASE, field('leadBase'), 'Hans', 'zh')).toBe(1.3)
    // a language's own field and a set's field
    expect(fieldValue(BASE, field('labels'), 'Hans', 'zh')).toEqual(BASE.languages.zh!.labels)
    expect(fieldValue(BASE, field('hyphenation.en.left'), 'Latn', 'de')).toBe(2)
    // every script field of every built-in target agrees with the resolver
    for (const [tag, script] of [['zh', 'Hans'], ['zh-TW', 'Hant'], ['ja', 'Jpan'], ['ko', 'Kore'], ['de', 'Latn'], ['fr', 'Latn'], ['es', 'Latn'], ['ru', 'Cyrl']] as const) {
      const params = resolveRules(BASE, tag).params as unknown as Record<string, unknown>
      for (const f of RULES_FIELDS) if (f.scope === 'script' && f.path !== 'cjkFaces') expect(fieldValue(BASE, f, script, tag), `${tag} ${f.path}`).toEqual(params[f.path])
    }
  })
})

describe('where the value comes from', () => {
  it('is the script, the language, the set, or an unsaved edit', () => {
    expect(sourceOf(BASE, BASE, field('leadBase'), 'Hans', 'zh')).toBe('script')
    expect(sourceOf(BASE, BASE, field('latinPatterns'), 'Latn', 'de')).toBe('language')
    expect(sourceOf(BASE, BASE, field('latinPatterns'), 'Latn', 'fr')).toBe('script')
    expect(sourceOf(BASE, BASE, field('labels'), 'Hans', 'zh')).toBe('language')
    expect(sourceOf(BASE, BASE, field('hyphenation.minWord'), 'Hans', 'zh')).toBe('set')
    const edited = edit(BASE, field('leadBase'), 'Hans', 'zh', 1.35)
    expect(sourceOf(edited, BASE, field('leadBase'), 'Hans', 'zh')).toBe('edit')
    // (an edit is for the target shown: another language of the script, or another field, is not edited)
    expect(isEdited(edited, BASE, field('leadBase'), 'Hans', 'zh')).toBe(true)
    expect(isEdited(edited, BASE, field('leadFloor'), 'Hans', 'zh')).toBe(false)
    expect(isEdited(edited, BASE, field('leadBase'), 'Jpan', 'ja')).toBe(false)
  })
})

describe('an edit', () => {
  it('applies to the language by default: its own value, the script and the other languages as they were', () => {
    const f = field('leadBase')
    const next = edit(BASE, f, 'Hans', 'zh', 1.35)
    expect(next.languages.zh!.leadBase).toBe(1.35)
    expect(next.scripts.Hans.leadBase).toBe(1.3)
    expect(fieldValue(next, f, 'Hans', 'zh')).toBe(1.35)
    expect(resolveRules(next, 'zh').params.leadBase).toBe(1.35)
    // (the set it came from is not touched, and what comes out is a set)
    expect(BASE.languages.zh).not.toHaveProperty('leadBase')
    expect(parseRules(next)).toEqual(next)
  })

  it('moves to the script when asked: every language of the script, and the language\'s own value of it taken away', () => {
    const f = field('leadBase')
    // (ja has an override of its own for the script's field first)
    const pinned = edit(BASE, f, 'Jpan', 'ja', 1.2)
    expect(fieldValue(pinned, f, 'Jpan', 'ja')).toBe(1.2)
    const next = edit(pinned, f, 'Jpan', 'ja', 1.4, 'script')
    expect(next.scripts.Jpan.leadBase).toBe(1.4)
    expect(next.languages.ja).not.toHaveProperty('leadBase')
    expect(fieldValue(next, f, 'Jpan', 'ja')).toBe(1.4)
    // (the other scripts are not reached)
    expect(next.scripts.Hans.leadBase).toBe(BASE.scripts.Hans.leadBase)
    // a script of several languages reaches them all: Latn's de, fr and es
    const latn = edit(BASE, field('leadBase'), 'Latn', 'fr', 1.1, 'script')
    for (const tag of ['de', 'fr', 'es']) expect(resolveRules(latn, tag).params.leadBase, tag).toBe(1.1)
    expect(resolveRules(latn, 'ru').params.leadBase).toBe(BASE.scripts.Cyrl.leadBase)
  })

  it('has one place for a language\'s own field and for the set\'s', () => {
    const labels = edit(BASE, field('labels'), 'Hans', 'zh', { figure: 'F', table: 'T' })
    expect(labels.languages.zh!.labels).toEqual({ figure: 'F', table: 'T' })
    expect(edit(BASE, field('labels'), 'Hans', 'zh', null).languages.zh!.labels).toBeNull()
    const hy = edit(BASE, field('hyphenation.de.right'), 'Latn', 'de', 3)
    expect(hy.hyphenation.de.right).toBe(3)
    expect(hy.hyphenation.en).toEqual(BASE.hyphenation.en)
  })

  it('replaces an object field whole and copies the value it is given', () => {
    const fill = { band: 0.1, track: 0.05, size: 1.1 }
    const next = edit(BASE, field('adaptiveFill'), 'Hans', 'zh', fill)
    fill.band = 0.4
    expect(next.languages.zh!.adaptiveFill).toEqual({ band: 0.1, track: 0.05, size: 1.1 })
    expect(edit(BASE, field('adaptiveFill'), 'Hans', 'zh', null).languages.zh!.adaptiveFill).toBeNull()
    expect(resolveRules(edit(BASE, field('adaptiveFill'), 'Hans', 'zh', null), 'zh').params.adaptiveFill).toBeNull()
  })
})

describe('taking an edit back', () => {
  it('restores the field in both places, whichever scope the edit was made in', () => {
    const f = field('leadBase')
    const inLanguage = edit(BASE, f, 'Hans', 'zh', 1.35)
    expect(same(reset(inLanguage, BASE, f, 'Hans', 'zh'), BASE)).toBe(true)
    const inScript = edit(BASE, f, 'Hans', 'zh', 1.35, 'script')
    expect(same(reset(inScript, BASE, f, 'Hans', 'zh'), BASE)).toBe(true)
    // (a language's own value that the base had comes back, not away)
    const pinned = edit(BASE, f, 'Jpan', 'ja', 1.2)
    const moved = edit(pinned, f, 'Jpan', 'ja', 1.4, 'script')
    const back = reset(moved, pinned, f, 'Jpan', 'ja')
    expect(back.languages.ja!.leadBase).toBe(1.2)
    expect(back.scripts.Jpan.leadBase).toBe(BASE.scripts.Jpan.leadBase)
  })

  it('leaves the other fields\' edits where they are', () => {
    const two = edit(edit(BASE, field('leadBase'), 'Hans', 'zh', 1.35), field('floor'), 'Hans', 'zh', 0.7)
    const next = reset(two, BASE, field('leadBase'), 'Hans', 'zh')
    expect(isEdited(next, BASE, field('leadBase'), 'Hans', 'zh')).toBe(false)
    expect(next.languages.zh!.floor).toBe(0.7)
    const labels = edit(BASE, field('labels'), 'Hans', 'zh', null)
    expect(same(reset(labels, BASE, field('labels'), 'Hans', 'zh'), BASE)).toBe(true)
    const hy = edit(BASE, field('hyphenation.minWord'), 'Hans', 'zh', 6)
    expect(same(reset(hy, BASE, field('hyphenation.minWord'), 'Hans', 'zh'), BASE)).toBe(true)
  })
})

describe('how two sets differ', () => {
  it('names no field for equal sets, whatever their version and note', () => {
    expect(diffRules(BASE, fresh())).toEqual([])
    expect(diffRules(BASE, { ...fresh(), version: 9, note: 'another' })).toEqual([])
  })

  it('names each field that differs with its two values, a field absent from one side left out of it', () => {
    const next = edit(edit(edit(BASE, field('leadBase'), 'Hans', 'zh', 1.35), field('trackStart'), 'Latn', 'fr', 0.01, 'script'), field('hyphenation.en.left'), 'Latn', 'fr', 3)
    expect(diffRules(BASE, next)).toEqual([
      { path: 'hyphenation.en.left', from: 2, to: 3 },
      { path: 'scripts.Latn.trackStart', from: BASE.scripts.Latn.trackStart, to: 0.01 },
      { path: 'languages.zh.leadBase', to: 1.35 },
    ])
    expect(diffRules(next, BASE).at(-1)).toEqual({ path: 'languages.zh.leadBase', from: 1.35 })
  })

  it('takes an object field whole, and a language only one set holds whole', () => {
    const next = edit(BASE, field('adaptiveFill'), 'Hans', 'zh', { band: 0.1, track: 0.05, size: 1.1 })
    expect(diffRules(BASE, next)).toEqual([{ path: 'languages.zh.adaptiveFill', to: { band: 0.1, track: 0.05, size: 1.1 } }])
    const more = fresh()
    more.languages.sv = { labels: null }
    expect(diffRules(BASE, more)).toEqual([{ path: 'languages.sv', to: { labels: null } }])
  })

  it('does not depend on the order of an object\'s keys', () => {
    const a = fresh()
    const b = fresh()
    b.scripts.Hans.adaptiveFill = { size: 1.1, track: 0.05, band: 0.05 }
    expect(diffRules(a, b)).toEqual([])
  })
})
