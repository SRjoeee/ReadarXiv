// The layer's per-script rules (layer-rules.mjs), beside the TeX path's design (typeset/type.mjs DESIGN): the priors the
// sweep starts from, every field both renderers hold equal to the TeX path's or listed with its reason, the language's
// hyphenation filled in, and the module the reader loads free of imports (scripts.mjs re-exports it)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as rules from '../rules/layer-rules.mjs'
import { LAYER_DIVERGES, LAYER_RULES, type LayerRules, layerRulesFor } from '../rules/layer-rules.mjs'
import * as scripts from '@/pdf-reader/engine/pipeline/scripts.mjs'
import { DESIGN } from '@/pdf-reader/engine/pipeline/typeset/type.mjs'

type Script = keyof typeof LAYER_RULES
const SCRIPTS: Script[] = ['Hans', 'Hant', 'Jpan', 'Kore', 'Latn', 'Cyrl']

// the plan's table (2026-10-06, iteration 2's chosen values); superseded as data by the sweep's pull request (§6.2 step 5)
const PRIORS: Record<Script, LayerRules> = {
  Hans: { leadBase: 1.3, leadFloor: 1.0, trackMin: -0.05, letterMin: 0, compress: 2, borrowMax: 1, sizeStep: 0.025, sizeFloor: 0.75, even: 'size', autospace: 0.2, spaceMax: 1.0, hyphenate: 'en' },
  Hant: { leadBase: 1.3, leadFloor: 1.0, trackMin: -0.05, letterMin: 0, compress: 0, borrowMax: 1, sizeStep: 0.025, sizeFloor: 0.75, even: 'size', autospace: 0.2, spaceMax: 1.0, hyphenate: 'en' },
  Jpan: { leadBase: 1.0, leadFloor: 1.0, trackMin: -0.05, letterMin: 0, compress: 2, borrowMax: 1, sizeStep: 0.025, sizeFloor: 0.75, even: 'size', autospace: 0.2, spaceMax: 1.0, hyphenate: 'en' },
  Kore: { leadBase: 1.0, leadFloor: 1.0, trackMin: -0.05, letterMin: 0, compress: 2, borrowMax: 1, sizeStep: 0.025, sizeFloor: 0.75, even: 'size', autospace: 0, spaceMax: 1.0, hyphenate: 'en' },
  Latn: { leadBase: 1.0, leadFloor: 0.95, trackMin: 0, letterMin: -0.01, compress: 0, borrowMax: 1, sizeStep: 0.025, sizeFloor: 0.75, even: 'size', autospace: 0, spaceMax: 1.2, hyphenate: null },
  Cyrl: { leadBase: 1.0, leadFloor: 0.95, trackMin: 0, letterMin: -0.01, compress: 0, borrowMax: 1, sizeStep: 0.025, sizeFloor: 0.75, even: 'size', autospace: 0, spaceMax: 1.2, hyphenate: null },
}

/** the fields the TeX path also holds, and its value for each: base leading, leading's floor, scale's or size's floor,
 *  tracking's floor (an alphabet's design has no tracking) */
const texFields = (script: Script): Partial<Record<keyof LayerRules, number>> => {
  const d = DESIGN[script]
  return d.cjk
    ? { leadBase: d.base.lead, leadFloor: d.lead[0], sizeFloor: d.scale[0], trackMin: d.track[0] }
    : { leadBase: d.base, leadFloor: d.lead[0], sizeFloor: d.size[0] }
}

describe('the layer\'s per-script rules', () => {
  it('every script\'s rules are the priors', () => {
    expect(Object.keys(LAYER_RULES).sort()).toEqual([...SCRIPTS].sort())
    for (const s of SCRIPTS) expect(LAYER_RULES[s], s).toStrictEqual(PRIORS[s])
    expect(Object.isFrozen(LAYER_RULES)).toBe(true)
    for (const s of SCRIPTS) expect(Object.isFrozen(LAYER_RULES[s]), s).toBe(true)
  })

  it('every shared field equals the TeX path\'s or is listed with a reason, and every listed one differs', () => {
    expect(Object.keys(LAYER_DIVERGES).every(s => s in LAYER_RULES)).toBe(true)
    for (const s of SCRIPTS) {
      const tex = texFields(s)
      const listed = LAYER_DIVERGES[s] ?? []
      expect(new Set(listed.map(d => d.field)).size, `${s}: a field listed twice`).toBe(listed.length)
      for (const d of listed) {
        expect(d.field in tex, `${s}.${d.field}: listed, but the TeX path holds no such field`).toBe(true)
        expect(d.tex, `${s}.${d.field}: the TeX path's value`).toBe(tex[d.field])
        expect(LAYER_RULES[s][d.field], `${s}.${d.field}: listed, yet equal`).not.toBe(d.tex)
        expect(d.why.trim().length, `${s}.${d.field}: no reason`).toBeGreaterThan(10)
      }
      for (const [field, value] of Object.entries(tex) as [keyof LayerRules, number][]) {
        if (listed.some(d => d.field === field)) continue
        expect(LAYER_RULES[s][field], `${s}.${field}: differs from the TeX path's and is not listed`).toBe(value)
      }
    }
    // the plan's rows, exactly
    const rows = Object.fromEntries(Object.entries(LAYER_DIVERGES).map(([s, l]) => [s, l.map(d => [d.field, d.tex]).sort()]))
    const cjk = [['leadFloor', 1.2], ['sizeFloor', 0.92], ['trackMin', 0]].sort()
    expect(rows).toEqual({ Hans: cjk, Hant: cjk, Jpan: [['sizeFloor', 0.92], ['trackMin', 0]], Kore: [['sizeFloor', 0.92], ['trackMin', 0]], Latn: [['sizeFloor', 0.9]], Cyrl: [['sizeFloor', 0.9]] })
  })

  it('layerRulesFor fills hyphenate by the language', () => {
    for (const [lang, script, hyphenate] of [
      ['de', 'Latn', 'de'], ['fr', 'Latn', 'fr'], ['es', 'Latn', 'es'], ['pt', 'Latn', 'pt'], ['ru', 'Cyrl', 'ru'],
      ['zh', 'Hans', 'en'], ['zh-TW', 'Hant', 'en'], ['zh-Hant', 'Hant', 'en'], ['ja', 'Jpan', 'en'], ['ko', 'Kore', 'en'],
    ] as const) {
      expect(layerRulesFor(lang), lang).toStrictEqual({ ...LAYER_RULES[script], hyphenate })
    }
    // a language of the script that Task 8 has no patterns for: its script's rules, unhyphenated
    expect(layerRulesFor('it')).toStrictEqual({ ...LAYER_RULES.Latn, hyphenate: null })
    expect(layerRulesFor('uk')).toStrictEqual({ ...LAYER_RULES.Cyrl, hyphenate: null })
    // the rules handed out are not the table's to change
    expect(Object.isFrozen(layerRulesFor('de'))).toBe(true)
    expect(() => layerRulesFor('ar')).toThrow(/ar/)
    expect(() => layerRulesFor('hi')).toThrow()
  })

  it('scripts.mjs re-exports scriptOf and the layer\'s rules, and layer-rules.mjs imports nothing', () => {
    // scripts.mjs's importers (typeset/plan.mjs, parked/lab/spikes/lang-gate.mjs, tex-hints.test.ts) get the one function
    expect(scripts.scriptOf).toBe(rules.scriptOf)
    expect(scripts.LAYER_RULES).toBe(LAYER_RULES)
    expect(scripts.LAYER_DIVERGES).toBe(LAYER_DIVERGES)
    expect(scripts.layerRulesFor).toBe(layerRulesFor)
    expect(rules.scriptOf('zh-TW')).toBe('Hant')
    expect(rules.scriptOf('sr')).toBe('Cyrl')
    const source = readFileSync('parked/engine/rules/layer-rules.mjs', 'utf8')
    // no static import, no re-export from another module, no dynamic import, no require
    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bexport\s[^\n;]*\bfrom\s*['"]/)
    expect(source).not.toMatch(/\bimport\s*\(/)
    expect(source).not.toMatch(/\brequire\s*\(/)
  })
})
