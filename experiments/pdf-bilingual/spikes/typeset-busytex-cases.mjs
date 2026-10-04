// experiments/pdf-bilingual/spikes/typeset-busytex-cases.mjs
// The typesetting rule's TeX under the reader's own compiler — BusyTeX in Chromium, its pdfTeX and its XeTeX — for the
// cases whose answer hangs on the LaTeX it ships: each page's columns as MARK_DEF reads them (latex-front.mjs), at the
// end of a revtex paper whose grid closes at \end{document} before its last pages go out. typeset-tex-cases.mjs is the
// native reference for the same documents. Needs the TeX Live package server (texlive-server, http://localhost:8070;
// ENDPOINT to change it), data/busytex-patched (README.md, setup) and Playwright's Chromium. One pass a document, no
// bibtex: marks and destinations are set as the pages go out. Exits non-zero on a failure.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/typeset-busytex-cases.mjs
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { MARK_DEF } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { openPaper, translationFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'
import { texErrors, unitsAtErrors } from '../../../src/pdf-reader/engine/tex-errors.mjs'
import { marksOf } from '../../../src/pdf-reader/engine/typeset/places.mjs'

const { chromium } = createRequire(new URL('../../../', import.meta.url))('playwright')
const root = new URL('..', import.meta.url).pathname
const ENDPOINT = process.env.ENDPOINT ?? 'http://localhost:8070'
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' }

// the documents, as typeset-tex-cases.mjs has them: marked paragraphs, then references with no unit mark
const marked = (n, from = 0) => Array.from({ length: n }, (_, j) => j + from).map(k => `\\leavevmode\\axtmark{${k}s}\\lipsum[${k + 1}]\\par`).join('\n')
const bib = n => `\\begin{thebibliography}{99}${Array.from({ length: n }, (_, k) => `\\bibitem{b${k}} A. Author${k}, B. Writer, and C. Someone, A title of a paper that runs on for a while, Journal ${k} (2020) ${100 + k}.`).join('\n')}\\end{thebibliography}`
const refsLast = refs => `\\documentclass[aps,prb,twocolumn]{revtex4-2}\\usepackage{lipsum}\\begin{document}\\title{T}\\maketitle ${marked(14)}${bib(refs)}\\end{document}\n`
const oneEnd = `\\documentclass[twocolumn]{article}\\usepackage{lipsum}\\begin{document}${marked(14)}\\onecolumn ${marked(4, 20)}${bib(40)}\\end{document}\n`
const docs = ['pdflatex', 'xelatex'].flatMap(engine => [
  { name: `refs-${engine}`, engine, src: MARK_DEF + refsLast(90) },
  { name: `refs2-${engine}`, engine, src: MARK_DEF + refsLast(260) },
  { name: `end1-${engine}`, engine, src: MARK_DEF + oneEnd },
])

// the compile's safety net (compile-resilience-cases.mjs is the native reference): a unit whose translation breaks TeX,
// in the main file and in a file it \inputs, and a letter lost made an error by \tracinglostchars=3 — each placed by
// BusyTeX's log, read through lastTexLog, in its unit alone
const ZH = '\u8bba\u6587', enc = s => new TextEncoder().encode(s)
const PARAS = n => Array.from({ length: n }, (_, k) => `Paragraph ${k} of the paper runs on, with words that make a line of prose.`).join('\n\n')
/** a paper's files translated into `word`s, unit `bad`'s text put through `breaking` raw; its files as translationFiles
 *  writes them under the strategy `pick` chooses, and each unit's lines in them */
function translatedFiles(files, { lang, pick, word, breaking, bad, tracked = false }) {
  const paper = openPaper(new Map([...files].map(([p, t]) => [p, enc(t)])))
  const tr = new Map(paper.units.map((u, i) => [u, u.pieces.map(p => (p.t === 'text' ? { ...p, tr: true, s: i === bad ? breaking(p.s.replace(/[A-Za-z]{2,}/g, word)) : p.s.replace(/[A-Za-z]{2,}/g, word) } : p))]))
  const spans = {}, out = translationFiles(paper, tr, { strategy: pick(strategiesFor(paper.meta, lang)), fonts: null, draft: true, aux: null, bbl: null, spans })
  const given = new Map(out)
  if (tracked) given.set('main.tex', new Uint8Array([...enc('\\AtBeginDocument{\\tracinglostchars=3\\relax}'), ...out.get('main.tex')]))
  const all = new Map([...[...files].map(([p, t]) => [p, enc(t)]), ...given])
  return { paper, out, lines: spans.lines(), bad, main: new TextDecoder().decode(all.get('main.tex')), extra: [...all].filter(([p]) => p !== 'main.tex').map(([path, b]) => ({ path, content: new TextDecoder().decode(b) })) }
}
// a footnote's own words that break TeX, and its paragraph's (compile-resilience-cases.mjs, 1b): TeX logs the footnote's
// error where its argument ends, and the footnote is placed, not its paragraph
const NOTED = `\\documentclass{article}\n\\begin{document}\n${PARAS(2)}\n\nA paragraph 1234567890123, with a note\\footnote{The note 2345678901234, says 3456789012345 and more.} and words 9876543210 after it.\n\n${PARAS(1)}\n\\end{document}\n`
const notedUnits = openPaper(new Map([['main.tex', enc(NOTED)]])).units
const NOTE = notedUnits.findIndex(u => u.nested), NOTED_PARA = notedUnits.findIndex(u => u.pieces.some(p => p.t === 'nested'))
const SAFETY = {
  'unit-note': { engine: 'xelatex', ...translatedFiles(new Map([['main.tex', NOTED]]), { lang: 'zh', pick: s => s[0], word: ZH, breaking: t => t.replace(/,/, ' \\foo_bar,'), bad: NOTE }) },
  'unit-noted-para': { engine: 'xelatex', ...translatedFiles(new Map([['main.tex', NOTED]]), { lang: 'zh', pick: s => s[0], word: ZH, breaking: t => t.replace(/,/, ' \\foo_bar,'), bad: NOTED_PARA }) },
  'unit-main': { engine: 'xelatex', ...translatedFiles(new Map([['main.tex', `\\documentclass{article}\n\\begin{document}\n${PARAS(6)}\n\\end{document}\n`]]), { lang: 'zh', pick: s => s[0], word: ZH, breaking: t => t.replace(/,/, ' \\foo_bar,'), bad: 3 }) },
  'unit-input': { engine: 'xelatex', ...translatedFiles(new Map([['main.tex', `\\documentclass{article}\n\\begin{document}\n${PARAS(3)}\n\n\\input{sections/b}\n\\end{document}\n`], ['sections/b.tex', `${PARAS(5)}\n`]]), { lang: 'zh', pick: s => s[0], word: ZH, breaking: t => t.replace(/,/, ' \\foo_bar,'), bad: 5 }) },
  'lost-xe': { engine: 'xelatex', lost: true, ...translatedFiles(new Map([['main.tex', `\\documentclass{article}\n\\begin{document}\n${PARAS(4)}\n\\end{document}\n`]]), { lang: 'de', pick: s => s[1], word: 'W\u00f6rter', breaking: t => t.replace(/,/, ' \u3067,'), bad: 2, tracked: true }) },
  'lost-pdf': { engine: 'pdflatex', lost: true, ...translatedFiles(new Map([['main.tex', `\\documentclass{article}\n\\begin{document}\n${PARAS(3)}\n\\end{document}\n`]]), { lang: 'de', pick: s => s[0], word: 'Worte', breaking: t => t.replace(/,/, ' \\char200,'), bad: 1, tracked: true }) },
}
for (const [name, d] of Object.entries(SAFETY)) docs.push({ name, engine: d.engine, src: d.main, extra: d.extra, keepLog: true })

const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0])
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  try {
    if (path === '/') { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><title>cases</title>') }
    const file = path.startsWith('/lib/') ? join(root, 'node_modules/texlyre-busytex/dist', path.slice(5)) : join(root, 'data/busytex-patched', path.slice(1))
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream'); res.end(readFileSync(file))
  } catch { res.statusCode = 404; res.end() }
}).listen(0)

/** in the page: each document compiled once, its PDF as base64 and its log's first error */
async function inPage({ endpoint, docs }) {
  const { BusyTexRunner, PdfLatex, XeLatex } = await import('/lib/index.js')
  const runner = new BusyTexRunner({ busytexBasePath: '/busytex', preloadDataPackages: ['/busytex/texlive-basic.js'] })
  await runner.initialize(true)
  const out = []
  for (const d of docs) {
    const Engine = d.engine === 'xelatex' ? XeLatex : PdfLatex
    const r = await new Engine(runner).compile({ input: d.src, mainTexPath: d.extra ? 'main.tex' : `${d.name}.tex`, additionalFiles: d.extra ?? [], bibtex: false, rerun: false, remoteEndpoint: endpoint, verbose: 'silent' })
    let pdf = null
    if (r.pdf?.length && !d.keepLog) { let s = ''; for (let i = 0; i < r.pdf.length; i += 0x8000) s += String.fromCharCode(...r.pdf.subarray(i, i + 0x8000)); pdf = btoa(s) }
    out.push({ name: d.name, pdf, error: (String(r.log ?? '').match(/^! .*$/m)?.[0] ?? '').slice(0, 160), ...(d.keepLog ? { log: String(r.log ?? ''), made: !!r.pdf?.length } : {}) })
  }
  runner.terminate?.()
  return out
}

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const results = await page.evaluate(inPage, { endpoint: ENDPOINT, docs: docs.map(({ name, engine, src, extra, keepLog }) => ({ name, engine, src, extra, keepLog })) })
  for (const r of results.filter(x => SAFETY[x.name])) {
    const d = SAFETY[r.name], errors = texErrors(r.log).filter(e => !d.lost || /^Missing character/.test(e.message))
    const placed = unitsAtErrors(errors, d.out, d.lines).map(u => d.paper.units.indexOf(u))
    check(`BusyTeX's ${d.engine}, ${r.name}: ${d.lost ? 'with \\tracinglostchars=3 the lost letter an error at its line' : 'the failure, halting it, placed'} in unit ${d.bad} alone`, !r.made && errors.length === 1 && JSON.stringify(placed) === JSON.stringify([d.bad]), JSON.stringify({ made: r.made, errors, placed, head: r.log.slice(0, 200) }))
  }
  const cols = {}
  for (const r of results.filter(x => !SAFETY[x.name])) {
    if (!r.pdf) { cols[r.name] = `no PDF ${r.error}`; continue }
    const task = getDocument({ data: new Uint8Array(Buffer.from(r.pdf, 'base64')), verbosity: 0 })
    try { cols[r.name] = (await marksOf(await task.promise)).columns.join('') } finally { await task.destroy() }
  }
  for (const engine of ['pdflatex', 'xelatex']) {
    const one = cols[`refs-${engine}`], two = cols[`refs2-${engine}`], end = cols[`end1-${engine}`]
    check(`BusyTeX's ${engine}: the references alone on revtex's last page, or its last two, read two columns`, /^2{3,}$/.test(one) && /^2{4,}$/.test(two), JSON.stringify([one, two]))
    check(`BusyTeX's ${engine}: a document that ends in one column ends in one`, /^2+1+$/.test(end), end)
  }
} finally { await browser.close(); server.close() }
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
