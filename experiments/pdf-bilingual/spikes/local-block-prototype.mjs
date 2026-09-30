// Throwaway local-block experiment (plans/2026-09-30-local-block-prototype.md).
// Run from the worktree root: pnpm exec tsx experiments/pdf-bilingual/spikes/local-block-prototype.mjs
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, readFileSync, copyFileSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/live.mjs'
import { plainSource, plainTranslated, utf8 } from '../../../src/pdf-reader/engine/mt.mjs'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const exp = join(repo, 'experiments/pdf-bilingual')
const output = join(exp, 'data/runs/local-block-prototype')
mkdirSync(output, { recursive: true })
const fontRoot = process.env.AXT_PROTOTYPE_FONT_ROOT ?? '/Users/cheongzhiyan/Developer/ArxivTranslate/research/pdf-bilingual/data/tl2026/2026/texmf-dist/fonts'
const cases = [
  ['zh', '2212.06817', 'opentype/public/fandol/FandolSong-Regular.otf'],
  ['ja', '2608.05876', 'truetype/public/ipaex/ipaexm.ttf'],
  ['ko', '2608.21180', 'truetype/public/unfonts-core/UnBatang.ttf'],
  ['de', '2608.06701', 'opentype/public/tex-gyre/texgyretermes-regular.otf'],
  ['ru', '2608.24839', 'opentype/public/libertinus-fonts/LibertinusSerif-Regular.otf'],
]
const unitKey = u => `${u.kind}\u0000${JSON.stringify(u.pieces.map(p => [p.t, p.s ?? p.src ?? `${p.pre}\u0001${p.post}`]))}`
const fixtures = []
for (const [lang, paper, font] of cases) {
  const t0 = performance.now()
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(exp, 'data/corpus', paper, 'source.gz'))))
  const source = openPaper(files)
  const cache = JSON.parse(readFileSync(join(exp, 'data/runs/visual-eval', lang, paper, 'translation.json'), 'utf8'))
  const translations = new Map(cache.entries.map(e => [e.key, e.pieces]))
  const units = source.units.map((u, id) => {
    const tr = translations.get(unitKey(u))
    const protectedContent = u.pieces.some(p => p.t === 'nested' || (p.t === 'open' && !/^\\(?:emph|textbf|textit|textrm|textsf|texttt|text|mbox)\{$/.test(p.src)) || (p.t === 'ph' && !/^(?:~|\\label\{[^}]*\}|\\(?:noindent|bf|bfseries|it|itshape|em|small|par)|\\vspace\*?\{[^}]*\})$/.test(p.src)))
    const stack = [], runs = []
    let declaration = {}
    for (const piece of tr ?? []) {
      if (piece.t === 'open') stack.push({ bold: /textbf/.test(piece.src), italic: /emph|textit/.test(piece.src), mono: /texttt/.test(piece.src) })
      else if (piece.t === 'close') stack.pop()
      else if (piece.t === 'ph') {
        if (/^\\(?:bf|bfseries)$/.test(piece.src)) declaration = { ...declaration, bold: true }
        if (/^\\(?:it|itshape|em)$/.test(piece.src)) declaration = { ...declaration, italic: true }
        if (piece.src === '~') runs.push({ text: ' ' })
      } else if (piece.t === 'text') {
        const text = (piece.tr ? piece.s.replace(/\\(textbackslash|textasciitilde|textasciicircum)\{\}/g, ' ').replace(/\\([#$%&_{}])/g, '$1') : utf8(piece.s)).replace(/\s+/g, ' ')
        runs.push({ text, bold: declaration.bold || stack.some(s => s.bold), italic: declaration.italic || stack.some(s => s.italic), mono: stack.some(s => s.mono) })
      }
    }
    return { id, kind: u.kind, source: plainSource(u), text: tr ? plainTranslated(tr) : null, runs, protectedContent }
  })
  const dest = join(output, font.split('/').at(-1))
  if (!existsSync(join(fontRoot, font))) throw new Error(`The prototype needs this font asset: ${join(fontRoot, font)}`)
  copyFileSync(join(fontRoot, font), dest)
  fixtures.push({ lang, paper, font: `/fonts/${font.split('/').at(-1)}`, fontBytes: statSync(dest).size, units, prepareMs: performance.now() - t0 })
}
const pdfjs = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')))
const routes = [
  ['/prototype/', join(exp, 'local-block-prototype')], ['/fonts/', output], ['/pdfjs/', pdfjs],
  ['/engine/', join(repo, 'src/pdf-reader/engine')], ['/pdf/', join(exp, 'data/corpus')],
]
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.pdf': 'application/pdf', '.otf': 'font/otf', '.ttf': 'font/ttf', '.bcmap': 'application/octet-stream' }
const port = Number(process.env.PORT ?? 8091)
createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  res.setHeader('Cache-Control', 'no-cache')
  if (url.pathname === '/fixtures.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(fixtures)); return }
  const path = url.pathname === '/' ? '/prototype/index.html' : decodeURIComponent(url.pathname)
  const route = routes.find(([prefix]) => path.startsWith(prefix))
  if (!route) { res.writeHead(404).end(); return }
  const file = resolve(route[1], path.slice(route[0].length))
  if (!file.startsWith(`${resolve(route[1])}/`) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return }
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
  createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`Local block prototype: http://localhost:${port}/\n${fixtures.map(f => `${f.lang} ${f.paper}: ${f.units.length} units, ${f.prepareMs.toFixed(1)} ms source/cache preparation, ${(f.fontBytes / 1e6).toFixed(1)} MB font`).join('\n')}`))
