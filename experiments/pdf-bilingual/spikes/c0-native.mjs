// C0, native control: each unchanged source compiled with TeX Live 2026 in the texlive/texlive container, the way arXiv
// would — its compiler, its main file, the .bbl kept when there is one, no network, 300 s. Separates "the paper does not
// build on TeX Live 2026" from "BusyTeX cannot build it". Output: out/c0-native.json
//   node spikes/c0-native.mjs [parallel=6]
import { execFile, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { analyze } from './paper-meta.mjs'

const run = promisify(execFile)
const PARALLEL = Number(process.argv[2] ?? 6)
const ONLY = process.argv.slice(3)
const root = new URL('..', import.meta.url).pathname
const corpus = JSON.parse(readFileSync(join(root, 'out/corpus.json'), 'utf8')).filter(r => r.kind === 'tar' || r.kind === 'single')
const outFile = join(root, 'out/c0-native.json')
const results = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : []
const done = new Set(results.map(r => r.id))
const FLAG = { pdflatex: '-pdf', xelatex: '-xelatex', lualatex: '-lualatex', latex: '-pdfps' }

const pages = pdf => { try { return Number(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }).match(/^Pages:\s+(\d+)/m)?.[1]) } catch { return null } }

async function one(row) {
  const src = join(root, 'data/corpus', row.id, 'src')
  const meta = analyze(src)
  const out = { id: row.id, version: row.version, ...meta }
  if (!meta.main) return { ...out, result: 'no-main' }
  const work = join(root, 'data/runs/native', row.id)
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true }); cpSync(src, work, { recursive: true })
  const args = ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', '-v', `${work}:/work`, '-w', '/work', 'texlive/texlive:latest',
    'timeout', '300', 'latexmk', FLAG[meta.compiler] ?? '-pdf', ...(meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-file-line-error', '-f', meta.main]
  const t0 = Date.now()
  let code = 0
  try { await run('docker', args, { maxBuffer: 1 << 26 }) } catch (e) { code = e.code ?? 1; out.dockerErr = String(e.stderr ?? e.message ?? '').slice(-300) }
  out.ms = Date.now() - t0
  out.exit = code
  out.timedOut = code === 124
  // TeX writes its output where it runs, the root of the package, even for a main file in a subdirectory
  const stemAtRoot = meta.main.split('/').pop().replace(/\.[^.]+$/, '')
  const pdf = join(work, `${stemAtRoot}.pdf`)
  out.pages = existsSync(pdf) ? pages(pdf) : null
  out.arxivPages = pages(join(root, 'data/corpus', row.id, 'arxiv.pdf'))
  try {
    const log = readFileSync(join(work, `${stemAtRoot}.log`), 'latin1')
    out.firstError = (log.match(/^(?:\S+:\d+: .*|! .*)$/m)?.[0] ?? '').slice(0, 200)
    out.missing = [...new Set([...log.matchAll(/File `([^']+)' not found/g)].map(m => m[1]))].slice(0, 5)
  } catch { out.firstError = 'no log' }
  out.result = out.pages == null ? 'no-pdf' : out.arxivPages && Math.abs(out.pages - out.arxivPages) <= 1 ? 'pass' : 'pages-differ'
  return out
}

const queue = corpus.filter(r => !done.has(r.id) && (!ONLY.length || ONLY.includes(r.id)))
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  while (queue.length) {
    const row = queue.shift()
    const r = await one(row)
    results.push(r)
    writeFileSync(outFile, JSON.stringify(results, null, 1))
    console.log(`${r.id} ${r.result} ${r.compiler} ${r.documentclass} pages=${r.pages}/${r.arxivPages} ${Math.round((r.ms ?? 0) / 1000)}s ${r.firstError ?? ''}`.slice(0, 220))
  }
}))
