// C1 (native, pseudo-translation): every C0-clean paper, its prose replaced by target-language text of similar length
// through the front end, compiled with TeX Live 2026 in Docker under each CJK strategy. Measures whether the patched
// source compiles (C1) and whether what came out is whole (F signals), without machine translation in the way.
//   node spikes/c1-native.mjs [parallel=5] [id ...]
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { prepare, STRATEGIES } from './c1-prepare.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const PARALLEL = Number(process.argv[2] ?? 5)
const ONLY = process.argv.slice(3)
const outFile = join(root, process.env.OUT ?? 'out/c1-native.json')
const results = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : []
const done = new Set(results.map(r => `${r.id}/${r.variant}`))
const clean = JSON.parse(readFileSync(join(root, 'out/c0-browser-patched-full.json'), 'utf8')).filter(r => r.result === 'pass').map(r => r.id)
const ids = ONLY.length ? ONLY : clean

const FLAG = { pdflatex: '-pdf', xelatex: '-xelatex', lualatex: '-lualatex', latex: '-pdfps' }
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }

function pdfSignals(pdf) {
  if (!existsSync(pdf)) return null
  const text = (sh('pdftotext', ['-q', pdf, '-']) ?? '').replace(/-\n/g, '')
  return {
    pages: Number(sh('pdfinfo', [pdf])?.match(/^Pages:\s+(\d+)/m)?.[1]) || null,
    cjk: (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length,
    de: (text.match(/Effizienz/g) ?? []).length,
    leaks: (text.match(/⟦/g) ?? []).length,
    unresolved: (text.match(/\?\?|\[\?\]/g) ?? []).length,
    images: (sh('pdfimages', ['-list', pdf]) ?? '').split('\n').filter(l => /^\s*\d+\s+\d+\s+image/.test(l)).length,
    englishWords: (text.match(/\b(the|and|of|we|is|that|with|for|this|are)\b/gi) ?? []).length,
  }
}

async function one(id, variant) {
  const st = STRATEGIES[variant]
  const work = join(root, 'data/runs/c1', id, variant)
  const out = prepare(root, id, variant, work)
  if (out.result) return out
  const { engine, main: mainFile, bbl } = out
  const meta = { main: mainFile, bbl }
  const args = ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', '-v', `${work}:/work`, '-w', '/work', 'texlive/texlive:latest',
    'timeout', process.env.TIMEOUT ?? '300', 'latexmk', FLAG[engine] ?? '-pdf', ...(meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-file-line-error', '-f', meta.main]
  const t0 = Date.now()
  try { await run('docker', args, { maxBuffer: 1 << 26 }) } catch (e) { out.exit = e.code ?? 1 }
  out.ms = Date.now() - t0
  const stem = meta.main.split('/').pop().replace(/\.[^.]+$/, '')
  const sig = pdfSignals(join(work, `${stem}.pdf`))
  const ref = pdfSignals(join(root, 'data/runs/native', id, `${stem}.pdf`))
  try {
    const log = readFileSync(join(work, `${stem}.log`), 'latin1')
    out.firstError = (log.match(/^(?:\S+:\d+: .*|! .*)$/m)?.[0] ?? '').slice(0, 200)
    out.errors = (log.match(/^(?:\S+:\d+: |! )/gm) ?? []).length
    out.overfull = (log.match(/^Overfull \\hbox/gm) ?? []).length
    try { const refLog = readFileSync(join(root, 'data/runs/native', id, `${stem}.log`), 'latin1'); out.refOverfull = (refLog.match(/^Overfull \\hbox/gm) ?? []).length; out.refErrors = (refLog.match(/^(?:\S+:\d+: |! )/gm) ?? []).length } catch {}
  } catch { out.firstError = 'no log' }
  out.pdf = !!sig
  if (sig && ref) Object.assign(out, { pages: sig.pages, refPages: ref.pages, cjk: sig.cjk, de: sig.de, leaks: sig.leaks - ref.leaks, newUnresolved: sig.unresolved - ref.unresolved, lostImages: ref.images - sig.images, englishLeft: +(sig.englishWords / Math.max(1, ref.englishWords)).toFixed(3) })
  // compiled = a PDF; whole = the translation is in it (≥ 90 % of the inserted target text found), nothing leaked, no new ??, no lost image
  const found = st.lang === 'de' ? (out.expectedDe ? out.de / out.expectedDe : 1) : out.expectedCjk ? out.cjk / out.expectedCjk : 1
  out.found = sig ? +found.toFixed(3) : null
  out.newErrors = (out.errors ?? 0) - (out.refErrors ?? 0)
  const expectFound = st.translate === false ? true : found >= 0.9
  out.result = !sig ? 'no-pdf' : out.newErrors > 0 ? 'errors' : expectFound && out.leaks === 0 && out.newUnresolved <= 0 && out.lostImages <= 0 ? 'whole' : 'damaged'
  return out
}

const VARIANTS = process.env.VARIANTS ? process.env.VARIANTS.split(',') : Object.keys(STRATEGIES).filter(v => !v.endsWith('+a'))
const queue = ids.flatMap(id => VARIANTS.map(v => [id, v])).filter(([id, v]) => !done.has(`${id}/${v}`))
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  while (queue.length) {
    const [id, v] = queue.shift()
    const r = await one(id, v)
    results.push(r)
    writeFileSync(outFile, JSON.stringify(results, null, 1))
    console.log(`${id} ${v.padEnd(11)} ${r.result.padEnd(8)} err+${r.newErrors} found=${r.found} pages=${r.pages}/${r.refPages} leaks=${r.leaks} ??+${r.newUnresolved} ${Math.round((r.ms ?? 0) / 1000)}s ${r.firstError ?? r.error ?? ''}`.slice(0, 230))
  }
}))
