import { describe, expect, it } from 'vitest'
import { inMemory } from '@/pdf-reader/engine/source/latex-front.mjs'
import { openPaper, originalFiles, translationFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { analyze } from '@/pdf-reader/engine/source/paper-meta.mjs'
import { untar } from '@/pdf-reader/engine/source/tar.mjs'

// One name for one file across the PDF reader's engine: the name the source package holds it under, which is the one
// TeX's file system has too (the TeX page writes each file at its path joined to the project's directory). Under two
// names a file is two to the TeX page, written in the order of their names and the last one read: 2608.08350's
// translation, written back as ./sections/a.tex, lost to the package's sections/a.tex

const enc = (s: string) => new TextEncoder().encode(s)
const ascii = (b: Uint8Array, at: number, s: string) => { for (let i = 0; i < s.length; i++) b[at + i] = s.charCodeAt(i) }
/** a tar archive of regular files under the names given */
function tar(files: [string, string][]) {
  const blocks: Uint8Array[] = []
  for (const [name, text] of files) {
    const data = enc(text), header = new Uint8Array(512)
    ascii(header, 0, name)
    ascii(header, 124, `${data.length.toString(8).padStart(11, '0')}\0`)
    ascii(header, 156, '0')
    ascii(header, 257, 'ustar\0')
    const body = new Uint8Array(Math.ceil(data.length / 512) * 512)
    body.set(data)
    blocks.push(header, body)
  }
  blocks.push(new Uint8Array(1024))
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0))
  let at = 0
  for (const b of blocks) { out.set(b, at); at += b.length }
  return out
}
const readme = (main: string) => JSON.stringify({ sources: [{ usage: 'toplevel', filename: main }], process: { compiler: 'pdflatex' } })

describe('the package\'s files under the names TeX\'s file system has them', () => {
  it('untar: ./main.tex (an archive made of a directory\'s contents) is main.tex, and a name with ./ or // inside is the one file it names', () => {
    const files = untar(tar([['./main.tex', 'm'], ['./sections/./a.tex', 'a'], ['figures//b.png', 'b']]))
    expect([...files.keys()]).toEqual(['main.tex', 'sections/a.tex', 'figures/b.png'])
  })
})

describe('analyze: the main file and its bibliography as TeX reads them', () => {
  it('takes 00README.json\'s ./paper.tex as the package\'s paper.tex, not a guess', () => {
    const meta = analyze(inMemory(new Map([['00README.json', enc(readme('./paper.tex'))], ['paper.tex', enc('\\documentclass{article}\\begin{document}x\\end{document}')]])))
    expect(meta.main).toBe('paper.tex')
    expect(meta.mainGuessed).toBeUndefined()
  })
  it('guessing, leaves out a file included under another spelling (\\subfile{./chapters/ch1}): it is a part, not the main', () => {
    const meta = analyze(inMemory(new Map([
      ['thesis.tex', enc('\\documentclass{book}\\begin{document}\\subfile{./chapters/ch1}\\end{document}')],
      ['chapters/ch1.tex', enc(`\\documentclass[../thesis.tex]{subfiles}\\begin{document}${'A long chapter. '.repeat(20)}\\end{document}`)],
    ])))
    expect(meta.main).toBe('thesis.tex')
  })
  it('a main file in a directory (2608.12333: latex/arxiv.tex) has its bibliography where TeX reads it, arxiv.bbl in the root', () => {
    const files = (bbl: string) => inMemory(new Map([['00README.json', enc(readme('latex/arxiv.tex'))], ['latex/arxiv.tex', enc('\\documentclass{article}\\begin{document}x\\end{document}')], [bbl, enc('')]]))
    expect(analyze(files('arxiv.bbl')).bbl).toBe(true)
    expect(analyze(files('latex/arxiv.bbl')).bbl).toBe(false)
  })
})

describe('the original\'s and the translation\'s files: each a file the package holds, or what TeX writes for its main file', () => {
  // 2608.12333's main file is latex/arxiv.tex: TeX runs in the root, where it writes and reads arxiv.aux and arxiv.bbl;
  // written back as latex/arxiv.aux and latex/arxiv.bbl the run's references and bibliography were in no preview
  const paper = () => openPaper(new Map([
    ['00README.json', enc(readme('latex/arxiv.tex'))],
    ['latex/arxiv.tex', enc('\\documentclass{article}\n\\begin{document}\n\\input{./sections/intro}\n\\import{sections/}{method}\n\\bibliography{refs}\n\\end{document}\n')],
    ['sections/intro.tex', enc('An introduction.\n')],
    ['sections/method.tex', enc('A method.\n')],
  ]))
  const strategy = { xe: false, engine: 'pdflatex', pre: () => '' }
  it('the marked original', () => {
    expect([...originalFiles(paper()).keys()].sort()).toEqual(['latex/arxiv.tex', 'sections/intro.tex', 'sections/method.tex'])
  })
  it('the translation, with the run\'s .aux and .bbl in the root under the job\'s name', () => {
    const out = translationFiles(paper(), new Map(), { strategy, fonts: {}, draft: true, aux: '\\relax', bbl: '\\begin{thebibliography}{1}\\end{thebibliography}' })
    expect([...out.keys()].sort()).toEqual(['arxiv.aux', 'arxiv.bbl', 'latex/arxiv.tex', 'sections/intro.tex', 'sections/method.tex'])
  })
})
