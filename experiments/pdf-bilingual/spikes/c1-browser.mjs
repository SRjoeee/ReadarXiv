// C1 in the browser: the prepared variants (pseudo-translation + CJK strategy + adaptation rules) compiled by BusyTeX in
// Chromium against the aligned package server, then measured like the native runs: target text present, no leaked
// placeholder, no new ??, no lost image, no new errors (against the same paper's C0 browser log).
//   node spikes/c1-browser.mjs <variant,variant> [id ...]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { prepare } from './c1-prepare.mjs'
const root = new URL('..', import.meta.url).pathname
const [variantsArg, ...only] = process.argv.slice(2)
const variants = variantsArg.split(',')
const ids = only.length ? only : JSON.parse(readFileSync(join(root, 'out/c0-browser-patched-full.json'), 'utf8')).filter(r => r.result === 'pass').map(r => r.id)
const dirs = [], infos = {}
for (const id of ids) for (const v of variants) {
  const work = join(root, 'data/runs/c1b', id, v)
  const info = prepare(root, id, v, work)
  if (info.result) continue
  writeFileSync(join(work, '.axt-job.json'), JSON.stringify({ main: info.main, engine: info.engine, bbl: info.bbl, documentclass: info.documentclass }))
  dirs.push(work); infos[`${id}/${v}`] = info
}
const OUT = process.env.OUT ?? 'out/c1-browser.json', PDF_DIR = join(root, 'data/runs/c1b-pdf')
mkdirSync(PDF_DIR, { recursive: true })
execFileSync('node', [join(root, 'spikes/c0-browser.mjs')], { stdio: 'inherit', env: { ...process.env, DIRS: dirs.join(','), OUT, PDF_DIR } })
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }
const sig = pdf => { if (!existsSync(pdf)) return null; const t = (sh('pdftotext', ['-q', pdf, '-']) ?? '').replace(/-\n/g, ''); return { cjk: (t.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length, de: (t.match(/Effizienz/g) ?? []).length, unresolved: (t.match(/\?\?|\[\?\]/g) ?? []).length, images: (sh('pdfimages', ['-list', pdf]) ?? '').split('\n').filter(l => /^\s*\d+\s+\d+\s+image/.test(l)).length } }
const errs = file => { try { return (readFileSync(file, 'latin1').match(/^(?:\S+:\d+: |! )/gm) ?? []).length } catch { return null } }
const rows = JSON.parse(readFileSync(join(root, OUT), 'utf8')).map(r => {
  const info = infos[r.id]; const [id] = r.id.split('/')
  const s = sig(join(PDF_DIR, `${r.id.replace('/', '__')}.pdf`)), ref = sig(join(root, 'data/runs/browser', `${id}.pdf`))
  const newErrors = (errs(join(PDF_DIR, `${r.id.replace('/', '__')}.log`)) ?? 0) - (errs(join(root, 'data/runs/browser', `${id}.log`)) ?? 0)
  const found = !s ? null : info.lang === 'de' ? (info.expectedDe ? s.de / info.expectedDe : 1) : (info.expectedCjk ? s.cjk / info.expectedCjk : 1)
  const whole = s && ref && newErrors <= 0 && (info.variant.startsWith('xe-only') || found >= 0.9) && s.unresolved <= ref.unresolved && s.images >= ref.images
  return { ...r, variant: info.variant, lang: info.lang, found: found == null ? null : +found.toFixed(3), newErrors, verdict: !s ? 'no-pdf' : whole ? 'whole' : newErrors > 0 ? 'errors' : 'damaged' }
})
writeFileSync(join(root, OUT.replace(/\.json$/, '-verdict.json')), JSON.stringify(rows, null, 1))
const by = {}
for (const r of rows) { const b = (by[r.variant] ??= { n: 0, whole: 0 }); b.n++; if (r.verdict === 'whole') b.whole++ }
console.log(JSON.stringify(by))
