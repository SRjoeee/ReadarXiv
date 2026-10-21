import { describe, expect, it } from 'vitest'
import { inMemory } from '@/pdf-reader/engine/source/latex-front.mjs'
import { analyze } from '@/pdf-reader/engine/source/paper-meta.mjs'

// How many toplevel sources arXiv compiled, and which one is the main file: from 00README where the package has one,
// else guessed from the files no other file includes (1008.0072v1: a revtex4 paper and its supplement, no 00README; arXiv's
// legacy AutoTeX compiled both and joined them, the paper's pages first)

const enc = (s: string) => new TextEncoder().encode(s)
const doc = (body: string) => `\\documentclass{revtex4}\n\\begin{document}\n${body}\n\\end{document}\n`
const meta = (files: [string, string][]) => analyze(inMemory(new Map(files.map(([p, t]): [string, Uint8Array] => [p, enc(t)]))))

describe('analyze: the toplevel sources', () => {
  it('with no 00README, counts the \\documentclass files no other file includes, the main file the one arXiv joins first', () => {
    // (the supplement longer than the paper, in either order in the package: the main is the paper all the same)
    const paper = doc('The paper. '.repeat(10)), supp = doc('A longer supplement. '.repeat(40))
    for (const files of [[['Paper_Final.tex', paper], ['Supplementary_Final.tex', supp]], [['Supplementary_Final.tex', supp], ['Paper_Final.tex', paper]]] as [string, string][][]) {
      const m = meta(files)
      expect(m).toMatchObject({ main: 'Paper_Final.tex', mainGuessed: true, toplevels: 2 })
    }
  })
  it('with no 00README and several uncited files, the main is the first path even where a later one has the preferred name', () => {
    // (arXiv joins a.tex's pages first: main.tex would be compared with a.tex's pages)
    expect(meta([['main.tex', doc('The paper. '.repeat(40))], ['a.tex', doc('A cover page.')]])).toMatchObject({ main: 'a.tex', toplevels: 2 })
  })
  it('a subfile named from a file in a directory (\\subfile{child} in chapters/) is a part, counted once with its main', () => {
    const m = meta([
      ['main.tex', doc('The paper.\n\\input{chapters/index}')],
      ['chapters/index.tex', '\\subfile{child}\n'],
      ['chapters/child.tex', `\\documentclass[../main.tex]{subfiles}\n\\begin{document}\n${'A long chapter. '.repeat(40)}\n\\end{document}\n`],
    ])
    expect(m).toMatchObject({ main: 'main.tex', toplevels: 1 })
  })
  it('a standalone figure, a subfiles part or a stub of a class alone is no toplevel source: the paper the main, as before', () => {
    const paper = doc('The paper. '.repeat(40))
    const fig = '\\documentclass{standalone}\n\\begin{document}\nA figure.\n\\end{document}\n'
    const part = '\\documentclass[../x.tex]{subfiles}\n\\begin{document}\nA part.\n\\end{document}\n'
    for (const [name, other] of [['fig/a.tex', fig], ['chapter.tex', part], ['a-stub.tex', '\\documentclass{article}\n']] as [string, string][]) {
      expect(meta([['zpaper.tex', paper], [name, other]]), name).toMatchObject({ main: 'zpaper.tex', toplevels: 1 })
    }
  })
  it('a letter beside the paper is a document of its own: two toplevel sources, the first path the main', () => {
    const letter = '\\documentclass{letter}\n\\begin{document}\nDear editor.\n\\end{document}\n'
    expect(meta([['paper.tex', doc('The paper. '.repeat(40))], ['letter.tex', letter]])).toMatchObject({ main: 'letter.tex', toplevels: 2 })
  })
  it('with no 00README, a \\documentclass file another file \\inputs is a part: one toplevel source', () => {
    const m = meta([['paper.tex', doc('The paper.\n\\input{supplement}')], ['supplement.tex', doc('A supplement. '.repeat(40))]])
    expect(m).toMatchObject({ main: 'paper.tex', toplevels: 1 })
  })
  it('00README.json\'s toplevel sources are the count, as before', () => {
    const readme = JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'ms.tex' }, { usage: 'include', filename: 'supp.tex' }], process: { compiler: 'pdflatex' } })
    const m = meta([['00README.json', readme], ['ms.tex', doc('The paper.')], ['supp.tex', doc('A supplement.')]])
    expect(m).toMatchObject({ readme: 'json', main: 'ms.tex', toplevels: 1 })
    expect(m.mainGuessed).toBeUndefined()
  })
  it('a legacy 00README\'s toplevelfile lines are the count, as before', () => {
    const m = meta([['00README.XXX', 'b.tex toplevelfile\na.tex toplevelfile\n'], ['a.tex', doc('A.')], ['b.tex', doc('B.')], ['c.tex', doc('C.')]])
    expect(m).toMatchObject({ readme: 'legacy', main: 'b.tex', toplevels: 2 })
    expect(m.mainGuessed).toBeUndefined()
  })
  it('a 00README whose toplevel file the package lacks: the main is guessed, the count stays the 00README\'s', () => {
    const readme = JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'gone.tex' }], process: { compiler: 'pdflatex' } })
    const m = meta([['00README.json', readme], ['a.tex', doc('A.')], ['b.tex', doc('B.')]])
    expect(m).toMatchObject({ main: 'a.tex', mainGuessed: true, toplevels: 1 })
  })
})
