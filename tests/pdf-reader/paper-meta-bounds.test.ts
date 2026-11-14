// @vitest-environment node
// What arXiv would compile (packages/engine/src/source/paper-meta.mjs) after the code change of the typing lane T6, held to the
// module before it (helpers/paper-meta-before.mjs, be7ee2121 verbatim but its imports), value for value and error for error: the
// main file's candidates sorted by a preferred name, `preferred(b) - preferred(a)` (two booleans, which JavaScript subtracts as
// 1 and 0 and a type checker refuses), is `Number(preferred(b)) - Number(preferred(a))`, the same numbers. Held on file systems
// written here: each way a main file is found (arXiv's 00README.json, read or unreadable, its legacy 00README, a guess among
// files of a class: preferred names, lengths, parts included, documents, subfiles and standalone pictures), and seeded packages
// of every such file.
import { describe, expect, it } from 'vitest'
import { analyze } from '../../packages/engine/src/source/paper-meta.ts'
import { analyze as analyzeBefore } from './helpers/paper-meta-before.mjs'

/** a seeded generator (mulberry32) */
function seeded(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] as T }
}

const fsOf = (files: Record<string, string>) => {
  const map = new Map(Object.entries(files).map(([f, t]) => [f, new TextEncoder().encode(t)]))
  return { list: () => [...map.keys()], read: (p: string) => map.get(p) ?? null }
}
const outcome = (f: () => unknown) => {
  try {
    return { value: f() }
  } catch (e) {
    return { error: String((e as { message?: unknown })?.message ?? e) }
  }
}
const same = (files: Record<string, string>, label: string) =>
  expect(outcome(() => analyze(fsOf(files))), label).toEqual(outcome(() => analyzeBefore(fsOf(files))))

const DOC = (body = 'Words of the paper.') => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`
const CLASS_ONLY = '\\documentclass{article}\n\\newcommand\\x{y}\n'

describe('analyze', () => {
  it('finds the main file as before, each way', () => {
    same({ 'main.tex': DOC() }, 'one file')
    same({ 'a.tex': CLASS_ONLY, 'paper.tex': CLASS_ONLY }, 'a preferred name first')
    same({ 'paper.tex': CLASS_ONLY, 'a.tex': CLASS_ONLY }, 'a preferred name first, listed last')
    same({ 'a.tex': CLASS_ONLY, 'b.tex': `${CLASS_ONLY}more and longer` }, 'the longer body')
    same({ 'ms.tex': CLASS_ONLY, 'main.tex': CLASS_ONLY }, 'two preferred names')
    same({ 'x.tex': DOC(), 'y.tex': DOC('another') }, 'two documents: the first path')
    same({ 'main.tex': DOC('\\input{intro}'), 'intro.tex': DOC() }, 'a part included')
    same({ 'main.tex': DOC('\\subfile{chapters/child}'), 'chapters/child.tex': '\\documentclass[../main]{subfiles}\n\\begin{document}x\\end{document}' }, 'a subfile')
    same({ 'fig.tex': '\\documentclass{standalone}\\begin{document}x\\end{document}', 'paper.tex': CLASS_ONLY }, 'a standalone picture')
    same({ '00README.json': JSON.stringify({ sources: [{ filename: 'p.tex', usage: 'toplevel' }], process: { compiler: 'latex+dvips_ps2pdf' }, texlive_version: '2023' }), 'p.tex': DOC() }, 'README json')
    same({ '00README.json': '{ not json', 'main.tex': DOC() }, 'README unreadable')
    same({ '00README.json': JSON.stringify({ sources: 3 }), 'main.tex': DOC() }, 'README of no list')
    same({ '00README.json': JSON.stringify({ sources: [{ filename: 'gone.tex', usage: 'toplevel' }] }), 'a.tex': CLASS_ONLY, 'main.tex': CLASS_ONLY }, 'README main missing')
    same({ '00README': 'p.tex toplevelfile\n', 'p.tex': DOC() }, 'legacy README')
    same({ 'notes.txt': 'no TeX' }, 'no main')
  })

  it('finds it as before on seeded packages', () => {
    const r = seeded(43)
    const NAMES = ['main.tex', 'ms.tex', 'paper.tex', 'manuscript.tex', 'arxiv.tex', 'intro.tex', 'sec/a.tex', 'chapters/child.tex', 'supp.tex', 'fig.tex', 'x.ltx', 'y.latex', 'a.cls', 'b.sty', 'refs.bib', 'main.bbl', 'paper.bbl', 'fig.eps', 'fig.pdf', 'img.png']
    const TEXTS = [DOC(), DOC('\\input{intro}'), DOC('\\include{supp}\\import{sec}{a}'), DOC('\\subfile{chapters/child}'), CLASS_ONLY, `${CLASS_ONLY}${'longer '.repeat(20)}`, '\\documentclass[../main]{subfiles}\\begin{document}x\\end{document}', '\\documentclass{standalone}\\begin{document}x\\end{document}', '% \\documentclass{article}', 'Just text.', DOC('\\usepackage{fontspec}'), DOC('\\usepackage[backend=biber]{biblatex}'), '\\documentstyle{article}\\begin{document}x\\end{document}']
    const READMES: Record<string, string>[] = [{}, {}, {}, { '00README.json': JSON.stringify({ sources: [{ filename: 'main.tex', usage: 'toplevel' }, { filename: 'supp.tex', usage: 'toplevel' }] }) }, { '00README.json': '[' }, { '00README': 'paper.tex toplevelfile\nsupp.tex toplevelfile\n' }, { '00README.XXX': 'nothing here' }]
    for (let n = 0; n < 2000; n++) {
      const files: Record<string, string> = { ...r.pick(READMES) }
      for (let k = 1 + r.int(6); k > 0; k--) files[r.pick(NAMES)] = r.pick(TEXTS)
      same(files, `seeded ${n}: ${Object.keys(files).join(' ')}`)
    }
  })
})
