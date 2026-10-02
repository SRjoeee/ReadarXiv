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
