import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { headInTarget, headName, refInTarget, refName } from '@/pdf-reader/engine/rules/tex-names.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// The names TeX's packages give a theorem's head and a generated reference in each target (PDF-READER §19.10): translator's
// theorem dictionaries (ctex's for Chinese), cleveref's and hyperref's language definitions, ctex's names, babel's (the layout
// rules' labels) where a target has no other; nothing written by hand

const labelsOf = (lang: string) => resolveRules(BUILTIN_RULES, lang).labels
/** a reference's text with its replacements made */
const renamed = (text: string, to: string) => {
  const r = refInTarget(text, to, labelsOf(to))
  if (r === null) return null
  let out = '', at = 0
  for (const [a, b, w] of r) { out += text.slice(at, a) + w; at = b }
  return out + text.slice(at)
}

describe('the table is TeX Live\'s', () => {
  const file = JSON.parse(readFileSync('src/pdf-reader/engine/rules/tex-names.json', 'utf8'))
  it('names the image and the files it was read from, each by its digest', () => {
    expect(file.image).toMatch(/^texlive\/texlive:TL2025-historic@sha256:[0-9a-f]{64}$/)
    for (const f of ['cleveref.sty', 'hyperref.sty', 't1enc.dfu', 't2aenc.dfu', 'ctex-name-utf8.cfg', 'translator-theorem-dictionary-ChineseUTF8.dict']) expect(file.files[f]).toMatch(/^[0-9a-f]{64}$/)
  })
  it('every target the readers offer has its entry', () => {
    expect(Object.keys(file.targets).sort()).toEqual(['de', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh', 'zh-TW'])
  })
})

describe('headName and headInTarget: a theorem-like head\'s name in translator\'s dictionary, its number and punctuation kept', () => {
  it('ctex\'s Chinese names', () => {
    expect(headName('Definition', 'zh')).toBe('\u5b9a\u4e49')
    expect(headName('Proposition', 'zh')).toBe('\u547d\u9898')
    expect(headName('Lemma', 'zh')).toBe('\u5f15\u7406')
    expect(headName('Corollary', 'zh')).toBe('\u63a8\u8bba')
    expect(headName('Theorem', 'zh')).toBe('\u5b9a\u7406')
  })
  it('a head before its note keeps its bracket, one after its number its stop (2610.18513v1 p18 u150, p19 u157)', () => {
    expect(headInTarget('Definition 5.1 (', 'zh')).toBe('\u5b9a\u4e49 5.1 (')
    expect(headInTarget('Proposition 5.1 (', 'zh')).toBe('\u547d\u9898 5.1 (')
    expect(headInTarget('Theorem 2.', 'fr')).toBe('Théorème 2.')
    expect(headInTarget('Lemma A.3.', 'de')).toBe('Lemma A.3.')
    expect(headInTarget('Lemma 3.', 'de')).toBe('Lemma 3.')
    expect(headInTarget('Main Theorem.', 'de')).toBe('Hauptsatz.')
  })
  it('TeX\'s accents and Cyrillic decoded by LaTeX\'s own tables', () => {
    expect(headName('Definition', 'fr')).toBe('Définition')
    expect(headName('Definition', 'pt')).toBe('Definição')
    expect(headName('Lemma', 'ru')).toBe('Лемма')
  })
  it('none for a name no dictionary holds, or a target with none', () => {
    expect(headInTarget('Assumption 1.', 'zh')).toBeNull()
    expect(headInTarget('Theorem 1.', 'ja')).toBeNull()
    expect(headInTarget('Theorem 1.', 'zh-TW')).toBeNull()
    expect(headInTarget('1.', 'zh')).toBeNull()
  })
})

describe('refInTarget: a generated reference in the target\'s names, never half in either language', () => {
  it('a theorem-like name as its head reads, its number kept (2610.18513v1 p19 u156, "Theorem A.17")', () => {
    expect(renamed('Theorem A.17', 'zh')).toBe('\u5b9a\u7406 A.17')
    expect(renamed('Theorem 5.1', 'zh')).toBe('\u5b9a\u7406 5.1')
  })
  it('cleveref\'s names and conjunctions where it defines the target', () => {
    expect(renamed('Sections 5.2.1, 5.2.3 and 5.2.4', 'de')).toBe('Abschnitte 5.2.1, 5.2.3 und 5.2.4')
    expect(renamed('Figures 1 and 2', 'es')).toBe('Figuras 1 y 2')
    expect(renamed('Eq. (3)', 'fr')).toBe('Équation (3)')
    expect(renamed('Appendix B', 'ru')).toBe('Приложение B')
  })
  it('babel\'s name of its type in a target cleveref does not define (a float\'s, an appendix\'s)', () => {
    expect(renamed('Figure 3', 'ja')).toBe('\u56f3 3')
    expect(renamed('Tables 1 and 2', 'zh')).toBeNull()
    expect(renamed('Appendix A', 'zh')).toBe('\u9644\u5f55 A')
    expect(refName('Appendix', 'zh-TW', labelsOf('zh-TW'))).toBe('\u9644\u9304')
  })
  it('the original\'s whole where a name or a conjunction has no word in the target', () => {
    expect(renamed('Section A.7', 'zh')).toBeNull()
    expect(renamed('Sections 5.2.1, 5.2.3 and 5.2.4', 'zh')).toBeNull()
    expect(renamed('Theorems 2.1 and 2.2', 'zh')).toBeNull()
    expect(renamed('Assumption 2', 'de')).toBeNull()
    expect(renamed('Theorem 1 of the paper', 'zh')).toBeNull()
  })
  it('numbers alone (\\labelcref): their conjunction alone, or nothing', () => {
    expect(refInTarget('3 and 4', 'de', labelsOf('de'))).toEqual([[1, 6, ' und ']])
    expect(refInTarget('(3)', 'zh', labelsOf('zh'))).toEqual([])
  })
})
