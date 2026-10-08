// #292: how soon can a translated PDF show its first pages? Per paper, in one page with one BusyTeX runner (as a
// reader that keeps its compiler warm): the whole translation compiled as today (every pass), then single passes that
// borrow the original compile's .aux for references — the whole document, and prefixes cut at a paragraph boundary
// at the top level of the main file, closed with \end{document}. Times, pages and errors per compile.
// Uses the same compile layer as c0-browser.mjs (SITE, EXTRA_DIR, PRELOAD, ENDPOINT).
//   node spikes/prefix-browser.mjs id ...
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { createRequire } from 'node:module'
const { chromium } = createRequire(new URL('../../../', import.meta.url))('playwright')
const root = new URL('..', import.meta.url).pathname
const ENDPOINT = process.env.ENDPOINT ?? 'http://localhost:8070'
const SITE = process.env.SITE ?? 'data/busytex-patched'
const EXTRA_DIR = process.env.EXTRA_DIR ?? join(root, 'data/pk-flat')
const FRACTIONS = (process.env.FRACTIONS ?? '0.1,0.25,0.5').split(',').map(Number)
const meta = JSON.parse(readFileSync(join(root, 'out/corpus-meta.json'), 'utf8'))
const walk = d => readdirSync(d).flatMap(n => { const f = join(d, n); return statSync(f).isDirectory() ? walk(f) : [f] })
const IMAGE = /\.(png|jpe?g|pdf|eps|gif|bmp|tiff?)$/i
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' }
const pagesOf = pdf => { try { return Number(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }).match(/^Pages:\s+(\d+)/m)?.[1]) } catch { return null } }

/** paragraph boundaries at the top level of the body: after a blank line, or before a sectioning or \input line, with
 *  no open brace or environment; each with how far into the document it is (included files counted at their size) */
function cutPoints(text, dir) {
  const b0 = text.search(/\\begin\s*\{document\}/), e0 = text.search(/\\end\s*\{document\}/)
  const start = b0 + text.slice(b0).match(/^\\begin\s*\{document\}/)[0].length
  const size = f => { for (const p of [f, `${f}.tex`]) { const q = join(dir, p); if (existsSync(q) && statSync(q).isFile()) return statSync(q).size } return 0 }
  const out = []
  let brace = 0, env = 0, weight = 0
  for (let i = start; i < e0; i++) {
    const c = text[i]
    if (c === '\\') {
      const m = text.slice(i, i + 200).match(/^\\(begin|end)\s*\{([^}]*)\}|^\\(input|include)\s*\{([^}]*)\}|^\\[\s\S]/)
      if (m[1] === 'begin') env++
      else if (m[1] === 'end') env--
      else if (m[3] && brace === 0 && env === 0) { out.push({ pos: i, weight }); weight += size(m[4]) }
      i += m[0].length - 1; weight += m[0].length; continue
    }
    if (c === '%') { const n = text.indexOf('\n', i); i = n < 0 ? e0 : n; continue }
    if (c === '{') brace++
    else if (c === '}') brace--
    weight++
    if (c === '\n' && brace === 0 && env === 0) {
      const rest = text.slice(i + 1, i + 40)
      if (/^[ \t]*\n/.test(rest) || /^\\(section|subsection|paragraph)\b/.test(rest)) out.push({ pos: i + 1, weight })
    }
  }
  return { cuts: out, total: weight, end: e0 }
}

let current = null
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0])
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  try {
    if (path === '/') { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><title>prefix</title>') }
    if (path === '/job.json') return res.end(JSON.stringify(current))
    if (path.startsWith('/extra/')) return res.end(readFileSync(join(EXTRA_DIR, path.slice(7))))
    const file = path.startsWith('/lib/') ? join(root, 'node_modules/texlyre-busytex/dist', path.slice(5)) : path.startsWith('/src/') ? join(current.dir, path.slice(5)) : join(root, SITE, path.slice(1))
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream'); res.end(readFileSync(file))
  } catch { res.statusCode = 404; res.end() }
}).listen(0)
const origin = `http://localhost:${server.address().port}`

async function runInPage(endpoint) {
  const { BusyTexRunner, XeLatex, PdfLatex } = await import('/lib/index.js')
  const job = await (await fetch('/job.json')).json()
  const read = async p => new Uint8Array(await (await fetch('/src/' + p.split('/').map(encodeURIComponent).join('/'))).arrayBuffer())
  const t0 = performance.now()
  const runner = new BusyTexRunner({ busytexBasePath: '/busytex', preloadDataPackages: job.preload })
  await runner.initialize(true)
  const out = { initMs: Math.round(performance.now() - t0), runs: [] }
  const shared = await Promise.all(job.files.map(async path => ({ path, content: await read(path) })))
  const aux = await Promise.all(job.aux.map(async path => ({ path, content: await read('.axt-aux/' + path) })))
  const extra = await Promise.all((job.extra ?? []).map(async x => ({ path: x, content: new Uint8Array(await (await fetch('/extra/' + x)).arrayBuffer()) })))
  const Engine = job.compiler === 'xelatex' ? XeLatex : PdfLatex
  for (const v of job.variants) {
    const input = await read(v.main)
    const files = [...shared, ...extra, ...(v.aux ? aux : [])]
    const t1 = performance.now()
    const r = await new Engine(runner).compile({ input, mainTexPath: job.main, additionalFiles: files, bibtex: job.bbl ? false : null, rerun: v.rerun, remoteEndpoint: endpoint, verbose: 'silent' })
    const row = { name: v.name, ms: Math.round(performance.now() - t1), success: r.success, passes: (r.logs ?? []).filter(l => /latex|xetex|pdftex/i.test(l.cmd) && !/xdvipdfmx/.test(l.cmd)).length }
    const log = String(r.log ?? '')
    row.errors = (log.match(/^(?:\S+:\d+: |! )/gm) ?? []).length
    row.firstError = (log.match(/^(?:\S+:\d+: .*|! .*)$/m)?.[0] ?? '').slice(0, 160)
    if (r.pdf) { let s = ''; for (let i = 0; i < r.pdf.length; i += 0x8000) s += String.fromCharCode(...r.pdf.subarray(i, i + 0x8000)); row.pdf = btoa(s) }
    out.runs.push(row)
  }
  runner.terminate?.()
  return out
}

const browser = await chromium.launch()
const context = await browser.newContext()
const outFile = join(root, process.env.OUT ?? 'out/prefix-browser.json')
const results = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')).filter(r => !process.argv.slice(2).includes(r.id)) : []
for (const id of process.argv.slice(2)) {
  const m = meta.find(x => x.id === id), main = m.main, stem = main.split('/').pop().replace(/\.tex$/, '')
  const from = existsSync(join(root, 'data/runs/c1-mt-marks/zh', id)) ? join(root, 'data/runs/c1-mt-marks/zh', id) : join(root, 'data/runs/c1-mt/zh', id)
  const work = join(root, 'data/runs/prefix', id)
  rmSync(work, { recursive: true, force: true })
  // the translated source without its own build products: nothing of the finished translation may leak in
  const BUILD = /\.(aux|log|xdv|fls|fdb_latexmk|out|toc|lof|lot|blg|synctex\.gz)$/
  for (const f of walk(from)) {
    const rel = relative(from, f)
    if (BUILD.test(rel) || rel === join(dirname(main), `${stem}.pdf`).replace(/^\.\//, '')) continue
    const to = join(work, rel); mkdirSync(dirname(to), { recursive: true }); if (IMAGE.test(f)) linkSync(f, to); else copyFileSync(f, to)
  }
  // the original's .aux files, from its own compile: labels, citations and page numbers of the English layout
  const nativeDir = join(root, 'data/runs/native', id)
  const auxFiles = walk(nativeDir).filter(f => f.endsWith('.aux')).map(f => relative(nativeDir, f))
  for (const a of auxFiles) { const to = join(work, '.axt-aux', a); mkdirSync(dirname(to), { recursive: true }); copyFileSync(join(nativeDir, a), to) }
  const text = readFileSync(join(work, main), 'latin1')
  const { cuts, total } = cutPoints(text, dirname(join(work, main)))
  const variants = [{ name: 'full, every pass', main, rerun: null, aux: false }, { name: 'full, one pass', main, rerun: false, aux: true }]
  for (const f of FRACTIONS) {
    const c = cuts.reduce((a, b) => (Math.abs(b.weight / total - f) < Math.abs(a.weight / total - f) ? b : a), cuts[0])
    const file = `.axt-prefix-${f}.tex`
    writeFileSync(join(work, dirname(main), file), Buffer.from(text.slice(0, c.pos) + '\n\\end{document}\n', 'latin1'))
    variants.push({ name: `prefix ${Math.round((c.weight / total) * 100)}%, one pass`, main: join(dirname(main), file).replace(/^\.\//, ''), rerun: false, aux: true })
  }
  variants.push({ name: 'full, one pass (again)', main, rerun: false, aux: true })
  // the same pass with graphicx in draft mode: every image a frame of its own size, nothing decoded or embedded
  const draft = join(dirname(main), '.axt-draft.tex')
  writeFileSync(join(work, draft), Buffer.concat([Buffer.from('\\PassOptionsToPackage{draft}{graphicx}\n'), readFileSync(join(work, main))]))
  variants.push({ name: 'full, one pass, draft images', main: draft.replace(/^\.\//, ''), rerun: false, aux: true })
  const files = walk(work).map(p => relative(work, p)).filter(p => !p.startsWith('.axt-') && !p.includes('/.axt-') && p !== main && !p.endsWith('00README.json') && !p.endsWith('units.json'))
  current = { dir: work, main, compiler: 'xelatex', bbl: m.bbl, files, aux: auxFiles, extra: readdirSync(EXTRA_DIR), preload: (process.env.PRELOAD ?? '/busytex/texlive-basic.js').split(','), variants }
  const page = await context.newPage()
  await page.goto(origin + '/')
  const r = await page.evaluate(runInPage, ENDPOINT).catch(e => ({ error: String(e).slice(0, 300) }))
  await page.close()
  const row = { id, initMs: r.initMs, error: r.error, runs: [] }
  for (const run of r.runs ?? []) {
    if (run.pdf) { const p = join(work, `${run.name.replace(/[^a-z0-9%]+/gi, '-')}.pdf`); writeFileSync(p, Buffer.from(run.pdf, 'base64')); delete run.pdf; run.pages = pagesOf(p) }
    row.runs.push(run)
  }
  results.push(row)
  console.log(id, `init ${row.initMs} ms`, row.error ?? '')
  for (const x of row.runs) console.log(`   ${x.name.padEnd(26)} ${String(x.ms).padStart(6)} ms  passes ${x.passes}  pages ${x.pages}  errors ${x.errors} ${x.firstError}`)
  writeFileSync(outFile, JSON.stringify(results, null, 1))
}
await browser.close(); server.close()
