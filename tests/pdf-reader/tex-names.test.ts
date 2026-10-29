import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { headInTarget, headName, refInTarget, refName } from '@/pdf-reader/engine/rules/tex-names.mjs'
import { BUILTIN_RULES, resolveRules, TARGETS } from '@/pdf-reader/engine/rules/layout.mjs'

// The names TeX's packages give a theorem's head and a generated reference in each target (PDF-READER §19.11): translator's
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
  it('is LPPL 1.3c data throughout, each source taken under it, as docs/THIRD_PARTY.md registers it', () => {
    expect(file.licence).toMatch(/^LPPL 1\.3c: /)
    expect(file.licence).not.toMatch(/GPL|GNU/)
    for (const f of Object.keys(file.files)) expect(file.licence.replace('{German,French,Spanish,Russian,Portuguese,Italian,Dutch,Polish,Turkish,Czech,Swedish,Bulgarian}', 'German'), f).toContain(f.replace(/-(?:French|Spanish|Russian|Portuguese|Italian|Dutch|Polish|Turkish|Czech|Swedish|Bulgarian)\.dict$/, '-German.dict'))
  })
  it('every target the readers offer has its entry', () => {
    expect(Object.keys(file.targets).sort()).toEqual([...TARGETS].sort())
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
    // (a number that is an appendix's letter alone: \thetheorem as \Alph, Devin on #468)
    expect(headInTarget('Theorem A.', 'zh')).toBe('\u5b9a\u7406 A.')
    expect(headInTarget('Lemma B (', 'fr')).toBe('Lemme B (')
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

describe('the languages of 2026-10-29: each package\'s names where it has the language, babel\'s a float\'s and an appendix\'s singular', () => {
  it('cleveref\'s and hyperref\'s for Italian, Dutch and Swedish, cleveref\'s alone for Ukrainian, translator\'s heads where it has them', () => {
    expect(renamed('Figures 1 and 2', 'it')).toBe('Figure 1 e 2')
    expect(renamed('Section 3', 'nl')).toBe('Paragraaf 3')
    expect(renamed('Theorem 2', 'sv')).toBe('Teorem 2')
    expect(renamed('Appendix B', 'uk')).toBe('Додаток B')
    expect(headName('Theorem', 'pl')).toBe('Twierdzenie')
    expect(headName('Theorem', 'cs')).toBe('Věta')
    expect(headName('Lemma', 'bg')).toBe('Лема')
    expect(headName('Theorem', 'id')).toBeNull()
  })
  it('in a target no reference package defines, its babel name for a float\'s or an appendix\'s singular, and no other form', () => {
    expect(renamed('Figure 3', 'pl')).toBe('Rysunek 3')
    expect(renamed('Table 2', 'tr')).toBe('Tablo 2')
    expect(renamed('Appendix A', 'id')).toBe('Lampiran A')
    expect(renamed('Figure 1', 'ms')).toBe('Gambar 1')
    // (a plural or an abbreviation is a form babel has no word of: the original's whole)
    expect(renamed('Figures 1 and 2', 'pl')).toBeNull()
    expect(renamed('Fig. 3', 'cs')).toBeNull()
    expect(renamed('Section 3', 'bg')).toBeNull()
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
  it('a lower-case or abbreviated form in the branch the target\'s definitions test (cleveref\'s german has no \\if@cref@capitalise: Devin on #468)', () => {
    expect(renamed('fig. 1', 'de')).toBe('Abb. 1')
    expect(renamed('Fig. 1', 'de')).toBe('Abb. 1')
    expect(renamed('figures 1 and 2', 'de')).toBe('Abbildungen 1 und 2')
    expect(renamed('equation (3)', 'es')).toBe('ecuaci\u00f3n (3)')
    // (a front matter's page in lower-case roman numerals: CodeRabbit on #468)
    expect(renamed('Page iv', 'de')).toBe('Seite iv')
  })
  it('numbers alone (\\labelcref): their conjunction alone, or nothing', () => {
    expect(refInTarget('3 and 4', 'de', labelsOf('de'))).toEqual([[1, 6, ' und ']])
    expect(refInTarget('(3)', 'zh', labelsOf('zh'))).toEqual([])
  })
})

describe('the paper\'s own name units (PDF-READER §19.14): a word no package names in the target, in its translation', () => {
  // (the translations a target's name units came back with, English to the target's: source/paper-names.mjs, run.mjs)
  const ZH = new Map([['Section', '\u8282'], ['and', '\u548c'], ['Assumption', '\u5047\u8bbe'], ['Theorem', '\u5b9a\u7406X'], ['Main Assumption', '\u4e3b\u8981\u5047\u8bbe']])
  const withNames = (text: string, to: string, names: ReadonlyMap<string, string>) => {
    const r = refInTarget(text, to, labelsOf(to), names)
    if (r === null) return null
    let out = '', at = 0
    for (const [a, b, w] of r) { out += text.slice(at, a) + w; at = b }
    return out + text.slice(at)
  }
  it('zh\'s "Section A.7" and every CJK target\'s "and", a plural read as its type\'s singular (2610.18513v1 p19)', () => {
    expect(withNames('Section A.7', 'zh', ZH)).toBe('\u8282 A.7')
    expect(withNames('Sections 5.2.1, 5.2.3 and 5.2.4', 'zh', ZH)).toBe('\u8282 5.2.1, 5.2.3 \u548c 5.2.4')
    expect(withNames('section 2', 'zh', ZH)).toBe('\u8282 2')
    expect(withNames('Theorems 2.1 and 2.2', 'zh', ZH)).toBe('\u5b9a\u7406 2.1 \u548c 2.2')
  })
  it('the paper\'s own names, the longest first; an inflected target\'s plural whole or not at all', () => {
    expect(withNames('Main Assumption 3', 'zh', ZH)).toBe('\u4e3b\u8981\u5047\u8bbe 3')
    expect(withNames('Assumption 2', 'de', new Map([['Assumption', 'Annahme']]))).toBe('Annahme 2')
    expect(withNames('Assumptions 1 and 2', 'de', new Map([['Assumption', 'Annahme']]))).toBeNull()
  })
  it('a package\'s word first, the name unit\'s only where there is none', () => {
    expect(withNames('Theorem A.17', 'zh', ZH)).toBe('\u5b9a\u7406 A.17')
    expect(headInTarget('Theorem 1.', 'zh', ZH)).toBe('\u5b9a\u7406 1.')
    expect(withNames('Figure 3', 'ja', new Map([['Figure', 'X']]))).toBe('\u56f3 3')
  })
  it('a theorem-like head no dictionary holds: zh\'s Assumption, ja\'s and ko\'s and zh-TW\'s every name', () => {
    expect(headInTarget('Assumption 1.', 'zh', ZH)).toBe('\u5047\u8bbe 1.')
    expect(headInTarget('Theorem 2.', 'ja', new Map([['Theorem', '\u5b9a\u7406']]))).toBe('\u5b9a\u7406 2.')
    expect(headInTarget('Definition 5.1 (', 'ko', new Map([['Definition', '\uc815\uc758']]))).toBe('\uc815\uc758 5.1 (')
    expect(headName('Conjecture', 'zh-TW', new Map([['Conjecture', '\u731c\u60f3']]))).toBe('\u731c\u60f3')
    // (a name of the characters a paper's name may hold: a hyphen, a stop, an apostrophe; Codex on #474)
    const own = new Map([['Sub-Claim', '\u5b50\u65ad\u8a00'], ['Thm.', '\u5b9a\u7406'], ["Hilbert's Lemma", '\u5e0c\u5c14\u4f2f\u7279\u5f15\u7406']])
    expect(headInTarget('Sub-Claim 1.', 'zh', own)).toBe('\u5b50\u65ad\u8a00 1.')
    expect(headInTarget('Thm. 2.', 'zh', own)).toBe('\u5b9a\u7406 2.')
    // (unnumbered: the stop the name's where a style sets none after it, else the head's after the name's; Devin on #474)
    expect(headInTarget('Thm.', 'zh', own)).toBe('\u5b9a\u7406')
    expect(headInTarget('Thm..', 'zh', own)).toBe('\u5b9a\u7406.')
    expect(headInTarget('Theorem.', 'zh', own)).toBe('\u5b9a\u7406.')
    expect(headInTarget("Hilbert's Lemma 2 (", 'zh', own)).toBe('\u5e0c\u5c14\u4f2f\u7279\u5f15\u7406 2 (')
    // (a package's name read as it was: the shortest name the number and punctuation leave)
    expect(headInTarget('Theorem A.17.', 'zh', own)).toBe('\u5b9a\u7406 A.17.')
    // (none where the name has no unit, or its translation none: the original's)
    expect(headInTarget('Assumption 1.', 'zh', new Map())).toBeNull()
    expect(headInTarget('Assumption 1.', 'zh', new Map([['Assumption', '  ']]))).toBeNull()
    // (and none in a language the table has no entry of: Danish, no target)
    expect(refName('Assumption', 'da', null, new Map([['Assumption', 'Antagelse']]))).toBeNull()
    expect(refName('Assumption', 'it', null, new Map([['Assumption', 'Ipotesi']]))).toBe('Ipotesi')
  })
})
