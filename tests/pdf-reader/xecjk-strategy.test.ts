import { describe, expect, it } from 'vitest'
import { openPaper, translationFiles } from '@/pdf-reader/engine/live.mjs'
import { strategiesFor } from '@/pdf-reader/engine/scripts.mjs'

// What the CJK strategies under XeLaTeX add for papers that fail there as they stand (the investigation of XeLaTeX under
// BusyTeX, 2026-10-01: causes A and E). Their TeX is checked natively by experiments/pdf-bilingual/spikes/cjk-cases.mjs

const SOURCE = '\\documentclass{article}\n\\usepackage{CJKutf8}\n\\usepackage{microtype}\n\\begin{document}\nA paragraph of the paper, with a name \\begin{CJK*}{UTF8}{gbsn}\u5f20\u4e09\\end{CJK*} in it.\n\\end{document}\n'
const paper = () => openPaper(new Map([['main.tex', new TextEncoder().encode(SOURCE)]]))
const main = (files: Map<string, Uint8Array>) => new TextDecoder().decode(files.get('main.tex'))

describe('A: a paper that loads CJK or CJKutf8 itself, under xeCJK', () => {
  const [xe, cjkutf8] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
  it('keeps the packages from loading before \\documentclass, as xeCJK refuses to follow them (a strategy\'s `front`)', () => {
    const text = main(translationFiles(paper(), new Map(), { strategy: xe as never, fonts: null, draft: false }))
    const front = text.indexOf('\\disable@package@load{CJKutf8}')
    expect(front).toBeGreaterThan(-1)
    expect(front).toBeLessThan(text.indexOf('\\documentclass'))
    expect(text.indexOf('\\disable@package@load{CJK}')).toBeLessThan(text.indexOf('\\documentclass'))
  })
  it('and sets its CJK environments as plain groups, after xeCJK', () => {
    const pre = xe?.pre(null) ?? ''
    expect(pre.indexOf('\\newenvironment{CJK*}')).toBeGreaterThan(pre.indexOf('\\usepackage{xeCJK}'))
  })
  it('not under CJKutf8, the pdfLaTeX fallback, where the paper\'s own CJKutf8 is the strategy\'s', () => {
    expect(cjkutf8?.front ?? '').toBe('')
    expect(main(translationFiles(paper(), new Map(), { strategy: cjkutf8 as never, fonts: null, draft: false }))).not.toContain('\\disable@package@load')
  })
})

describe('E: xeCJK\'s microtype patch, set right after xeCJK', () => {
  it('sets microtype\'s \\MT@char@ wherever xeCJK sets \\MT@char, which it leaves at -1 (CTeX-org/ctex-kit#1104)', () => {
    const pre = strategiesFor({ compiler: 'pdflatex' }, 'ja')[0]?.pre(null) ?? ''
    const at = pre.indexOf('\\cs_set_protected:Npn \\__xeCJK_get_ambiguous_slot:')
    expect(at).toBeGreaterThan(pre.indexOf('\\usepackage{xeCJK}'))
    expect(pre.slice(at)).toContain('\\cs_set_eq:NN \\MT@char@ \\MT@char')
  })
  it('by wrapping xeCJK\'s own function, whatever it names its slots: the TeX page\'s xeCJK has \\c__xeCJK_ambiguous_slot_prop, a newer one \\g__… (2026-10-02)', () => {
    const pre = strategiesFor({ compiler: 'pdflatex' }, 'zh')[0]?.pre(null) ?? ''
    expect(pre).toContain('\\cs_new_eq:NN \\__axt_xeCJK_get_ambiguous_slot: \\__xeCJK_get_ambiguous_slot:')
    expect(pre).not.toMatch(/ambiguous_slot_prop/)
  })
  it('not where no xeCJK is loaded', () => {
    for (const s of strategiesFor({ compiler: 'pdflatex' }, 'ru')) expect(s.pre(null)).not.toContain('__xeCJK_get_ambiguous_slot')
  })
})

describe('P: pdfTeX\'s unit px, which XeTeX does not know, under XeLaTeX (1810.04805: \\includegraphics[width=360px])', () => {
  const IMAGE = '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nAn image \\includegraphics[width=360px]{a.pdf} in a paragraph.\n\\end{document}\n'
  const image = () => openPaper(new Map([['main.tex', new TextEncoder().encode(IMAGE)]]))
  it('a pdfLaTeX paper set by XeLaTeX has graphicx\'s sizes in px given in bp, before \\documentclass', () => {
    const [xe] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
    const text = main(translationFiles(image(), new Map(), { strategy: xe as never, fonts: null, draft: false }))
    const at = text.indexOf('\\AddToHook{package/graphicx/after}{\\axt@pxkeys}')
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeLessThan(text.indexOf('\\documentclass'))
    expect(text).toContain('\\else#1{#2bp}\\fi')
    // the source as it is: only the size TeX reads goes through it
    expect(text).toContain('\\includegraphics[width=360px]{a.pdf}')
  })
  it('not under the paper\'s own pdfLaTeX, which knows px', () => {
    const [es] = strategiesFor({ compiler: 'pdflatex' }, 'es')
    expect(main(translationFiles(image(), new Map(), { strategy: es as never, fonts: null, draft: false }))).not.toContain('\\axt@pxkeys')
  })
})

describe('2307.16209 into zh: siunitx 3.6.2\'s locale file, and a heading uppercased under CJKutf8', () => {
  const [xe, cjkutf8] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
  it('S: wherever the target\'s locale is the document\'s, siunitx\'s lookup passes over a file that is not there (josephwright/siunitx#891)', () => {
    for (const lang of ['zh', 'zh-Hant', 'ja', 'de', 'ru']) {
      const pre = strategiesFor({ compiler: 'pdflatex' }, lang)[0]?.pre(null) ?? ''
      const guard = pre.indexOf('\\cs_if_exist:NT \\__siunitx_locale_setup:n')
      expect(guard).toBeGreaterThan(pre.indexOf('\\babelprovide'))
      expect(pre.slice(guard)).toContain('\\file_if_exist:nT {#1} { \\__axt_siunitx_locale_setup:n {#1} }')
      // in 3.6.2 alone, dated 2026-09-18: at least that day, and not the next (the review of fix/tex-path-errors, M3)
      expect(pre.slice(pre.indexOf('\\babelprovide'), guard)).toContain('\\IfPackageAtLeastTF { siunitx } { 2026-09-18 } { \\IfPackageAtLeastTF { siunitx } { 2026-09-19 } { } {')
    }
  })
  it('U: under CJKutf8 each CJK byte is made protected as soon as the CJK environment begins', () => {
    const pre = cjkutf8?.pre(null) ?? ''
    expect(pre).toContain('\\AtBeginDocument{\\begin{CJK}{UTF8}{gbsn}\\axtcjkprotect}')
    expect(pre.indexOf('\\gdef\\axtcjkprotect')).toBeLessThan(pre.indexOf('\\AtBeginDocument'))
    expect(pre).toContain('\\cs_set_protected_nopar:Npn #1 {#1}')
    // the \lccode it borrows is given back
    expect(pre).toMatch(/\\@tempcnta\\lccode126 [\s\S]*\\lccode126=\\@tempcnta\}/)
  })
  it('not under xeCJK, whose characters are XeTeX\'s own', () => {
    expect(xe?.pre(null)).not.toContain('axtcjkprotect')
  })
})
