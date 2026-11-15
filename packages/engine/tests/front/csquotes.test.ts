// @vitest-environment node
// csquotes' \enquote as the source reader writes it: the unit's text holds the quotation marks TeX sets. Each expectation is
// what the pinned 2025 compile image (lab/pdf/compile-images.json: texlive/texlive@sha256:7056390eac37715fd3e01875037ceb4016cb
// 17d44c611f7bbbfa7a012007979f, TeX Live 2025, csquotes v5.2o) set for the same source under pdfLaTeX (polyglossia's under
// XeLaTeX), read off its PDF. csquotes.def declares the English style's two variants (\DeclareQuoteStyle[american]{english},
// line 71: “ ” outside, ‘ ’ inside; [british]{english}, line 77: ‘ ’ outside, “ ” inside) and the names that select each
// (lines 345 to 350: \DeclareQuoteAlias[american]{english}{american, canadian, english}, [british]{english}{british,
// australian, newzealand}; the babel aliases, lines 376 to 380: \DeclareQuoteAlias{american}{USenglish, usenglish},
// {british}{UKenglish, ukenglish}); its default option autostyle=tryonce (line 5) takes the style of babel's main language, its
// last option, at the end of the preamble (csquotes.sty), and `style=` or `autostyle=false` keeps the default, the American
// variant (line 338: \DeclareQuoteAlias[american]{english}{default}). Polyglossia's main language by its name alone (no
// `variant=`, which the reader does not read) set the American marks for english, american and british alike.
import { describe, expect, it } from 'vitest'
import { inMemory, loadProject } from '../../src/source/latex-front.ts'

const AMERICAN = 'AA “outer ‘inner’ words” BB'
const BRITISH = 'AA ‘outer “inner” words’ BB'
const BODY = 'AA \\enquote{outer \\enquote{inner} words} BB'
/** the units' text of a document of this preamble and BODY, the pieces' bytes read as UTF-8 */
function textOf(preamble: string) {
  const tex = `\\documentclass{article}\n${preamble}\n\\begin{document}\n${BODY}\n\\end{document}\n`
  const units = loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(tex)]])), 'main.tex', {}).units
  return units
    .map((u) =>
      u.pieces
        .map((p) => (p.t === 'text' ? new TextDecoder().decode(Uint8Array.from(p.s, (c) => c.charCodeAt(0))) : `[${p.t}]`))
        .join(''),
    )
    .join(' | ')
    .trim()
}
const babel = (name: string, csquotes = '') =>
  `\\usepackage[T1]{fontenc}\\usepackage[${name}]{babel}\\usepackage${csquotes ? `[${csquotes}]` : ''}{csquotes}`

describe("csquotes' quotation marks under babel's English names, as TeX sets them", () => {
  it('sets the American variant with no babel', () => {
    expect(textOf('\\usepackage[T1]{fontenc}\\usepackage{csquotes}')).toBe(AMERICAN)
  })
  for (const name of ['english', 'american', 'USenglish', 'canadian'])
    it(`sets the American variant under ${name}: double marks outside, single inside`, () => {
      expect(textOf(babel(name))).toBe(AMERICAN)
    })
  for (const name of ['british', 'UKenglish', 'australian', 'newzealand'])
    it(`sets the British variant under ${name}: single marks outside, double inside`, () => {
      expect(textOf(babel(name))).toBe(BRITISH)
    })
  it("takes babel's main language, its last option", () => {
    expect(textOf(babel('german,british'))).toBe(BRITISH)
  })
  it("sets csquotes' default, the American variant, where `style=` or `autostyle=false` turns the language's off", () => {
    for (const opts of ['style=american', 'style=english', 'autostyle=false']) expect([opts, textOf(babel('british', opts))]).toEqual([opts, AMERICAN])
  })
  it("sets the American variant under polyglossia's main language by its name alone", () => {
    for (const name of ['english', 'american', 'british'])
      expect([name, textOf(`\\usepackage{fontspec}\\usepackage{polyglossia}\\setmainlanguage{${name}}\\usepackage{csquotes}`)]).toEqual([name, AMERICAN])
  })
  it("sets csquotes' two lowercase babel aliases as csquotes.def styles them: usenglish American, ukenglish British", () => {
    expect(textOf(babel('usenglish'))).toBe(AMERICAN)
    expect(textOf(babel('ukenglish'))).toBe(BRITISH)
  })
})

// babel's main language: the one `main=` names, wherever it stands among the options, else the last language option. babel.sty
// (v26.3, the same image) stores each key=value option as \bbl@opt@<key> (lines 401, 405-410), appends \bbl@opt@main to the
// languages it loads (lines 4238-4240) and takes it out of the list before it (lines 4260-4273): the main language is loaded
// last. Each expectation the image's, compiled as above. A main language that is no English name (german: TeX sets „outer ‚inner‘
// words“) is one the reader does not state the marks of, as for any language not English: the \enquote call one placeholder
const UNKNOWN = 'AA [ph] BB'
describe("csquotes' quotation marks under babel's main language, `main=` wherever it stands", () => {
  for (const [opts, want] of [
    ['main=british,german', BRITISH],
    ['german,main=british', BRITISH],
    ['main=british', BRITISH],
    ['english,main=ukenglish', BRITISH],
    ['main=german,british', UNKNOWN],
    ['british,main=german', UNKNOWN],
    ['british,provide=*', BRITISH],
    ['german', UNKNOWN],
  ] as const)
    it(`[${opts}]{babel}: ${want === UNKNOWN ? 'a main language not English, the call one placeholder' : 'the British variant'}`, () => {
      expect(textOf(babel(opts))).toBe(want)
    })
})
