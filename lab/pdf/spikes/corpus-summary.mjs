import { readFileSync, writeFileSync } from 'node:fs'
import { analyze } from './paper-meta.mjs'
const rows = JSON.parse(readFileSync(new URL('../out/corpus.json', import.meta.url)))
const c = (a, f) => a.filter(f).length
console.log('drawn', rows.length, '| 404', c(rows, r => r.srcStatus === 404), '| pdf-only', c(rows, r => r.kind === 'pdf-only'), '| tar', c(rows, r => r.kind === 'tar'), '| single', c(rows, r => r.kind === 'single'), '| errors', c(rows, r => r.error), '| arxiv pdf', c(rows, r => r.pdfStatus === 200))
const M = rows.filter(r => r.kind === 'tar' || r.kind === 'single').map(r => ({ id: r.id, ...analyze(new URL(`../data/corpus/${r.id}/src`, import.meta.url).pathname) }))
writeFileSync(new URL('../out/corpus-meta.json', import.meta.url), JSON.stringify(M, null, 1))
const tally = k => Object.entries(M.reduce((a, m) => ((a[m[k]] = (a[m[k]] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  ')
console.log('TeX packages', M.length)
console.log('readme:', tally('readme'))
console.log('compiler:', tally('compiler'), '| guessed', c(M, m => m.compilerGuessed))
console.log('TL version:', tally('tlVersion'))
console.log('class:', tally('documentclass'))
console.log('main guessed', c(M, m => m.mainGuessed), '| no main', c(M, m => !m.main))
console.log('multi-file', c(M, m => m.inputs > 0), '| bbl', c(M, m => m.bbl), '| bib no bbl', c(M, m => m.bib && !m.bbl), '| biblatex', c(M, m => m.biblatex), '| eps', c(M, m => m.eps > 0), '| local cls', c(M, m => m.localCls > 0), '| class shipped', c(M, m => m.classLocal), '| local sty', c(M, m => m.localSty > 0), '| unicode-engine pkgs', c(M, m => m.unicodeEngineOnly), '| shell-escape pkgs', c(M, m => m.shellEscape), '| tikz', c(M, m => m.tikz))
