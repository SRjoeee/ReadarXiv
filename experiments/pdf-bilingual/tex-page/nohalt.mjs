// Stage 3 (S3a, fix round 1): would compiling as arXiv does serve the reader better? BusyTeX runs every TeX pass with
// --halt-on-error (and the drafts in batchmode); arXiv's compile goes on after an error that TeX recovers from and keeps
// the PDF. This measures that on the compiles that fail today — the 15 whose error the exit-status fix now reports and
// the 78 that failed on both pages — against arXiv's own PDF of the paper.
//   node experiments/pdf-bilingual/tex-page/nohalt.mjs variant      → out/tex-measure/nohalt-pipeline.js: the built
//        pipeline with every TeX pass in nonstopmode, without --halt-on-error, and its exit status not stopping the
//        compile (the passes, bibtex, xdvipdfmx run on; the PDF is kept when one is written); and nohalt-tags.txt: the
//        compiles that failed on the new page in its identity run (identity-new), probes aside, and a failure of the
//        page's own (a timeout) aside where today's page made the PDF
//   pnpm exec tsx experiments/pdf-bilingual/tex-page/measure.mjs --mode=identity --page=new --fresh --tabs=1 \
//        --tags=out/tex-measure/nohalt-tags.txt --pipeline=out/tex-measure/nohalt-pipeline.js --out=nohalt
//   node experiments/pdf-bilingual/tex-page/nohalt.mjs report      → per compile: a PDF or not, its pages against
//        arXiv's, the TeX errors it went past, its text against the halting page's (where there is one); a summary
// Needs pdfinfo and pdftotext (poppler).
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EXP = new URL('..', import.meta.url).pathname
const OUT = join(EXP, 'out/tex-measure')
const rows = file => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [])

if (process.argv[2] === 'variant') {
  const e = readdirSync(join(EXP, 'out/tex-site/e'))[0]
  let s = readFileSync(join(EXP, 'out/tex-site/e', e, 'busytex_pipeline.js'), 'utf8')
  const count = (re) => (s.match(re) ?? []).length
  const halts = count(/'--halt-on-error', /g), batch = count(/'--interaction=batchmode'/g)
  s = s.replaceAll("'--halt-on-error', ", '').replaceAll("'--interaction=batchmode'", "'--interaction=nonstopmode'")
  const exit = 'const effective_exit_code = is_tex_pass ? exit_code :'
  if (!s.includes(exit)) throw new Error('the exit-status patch is not in the built pipeline')
  s = s.replace(exit, '/* [no-halt measurement] a TeX pass goes on whatever its status */ const effective_exit_code = is_tex_pass ? 0 :')
  writeFileSync(join(OUT, 'nohalt-pipeline.js'), s)
  const today = new Map(rows(join(OUT, 'record-old/jobs.jsonl')).map(j => [j.tag, j]))
  const tags = rows(join(OUT, 'identity-new/jobs.jsonl')).filter(j => !j.skipped && !j.ok && !j.tag.endsWith('~probe') && !(j.error && today.get(j.tag)?.ok)).map(j => j.tag)
  writeFileSync(join(OUT, 'nohalt-tags.txt'), `${tags.join('\n')}\n`)
  console.log(`out/tex-measure/nohalt-pipeline.js: ${halts} --halt-on-error removed, ${batch} batchmode → nonstopmode, TeX's exit status ignored; nohalt-tags.txt: ${tags.length} compiles`)
  process.exit(0)
}

// report
const pages = f => { try { return Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))?.[1]) } catch { return null } }
const text = f => { try { return execFileSync('pdftotext', ['-q', f, '-'], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return '' } }
/** a text's size in units comparable across scripts: Latin words plus CJK characters */
const units = t => (t.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []).length + (t.match(/[\p{L}\p{N}]+/gu) ?? []).length
const pdfOf = (run, tag) => join(OUT, run, 'pdf', `${tag.replace('~', '__')}.pdf`)
const before = new Map(rows(join(OUT, 'record-old/jobs.jsonl')).map(j => [j.tag, j]))
const after = new Map(rows(join(OUT, 'identity-new/jobs.jsonl')).map(j => [j.tag, j]))
const nohalt = rows(join(OUT, 'nohalt/jobs.jsonl'))
const table = []
for (const r of nohalt) {
  const [id, job] = r.tag.split('~')
  const arxiv = join(EXP, 'data/corpus', id, 'arxiv.pdf')
  const arxivPages = pages(arxiv), arxivUnits = units(text(arxiv))
  const p = r.ok ? pages(pdfOf('nohalt', r.tag)) : null
  const u = r.ok ? units(text(pdfOf('nohalt', r.tag))) : null
  const today = before.get(r.tag)
  table.push({ tag: r.tag, job, masked: !!today?.ok && !after.get(r.tag)?.ok, ok: r.ok, pages: p, arxivPages, pageRatio: p && arxivPages ? +(p / arxivPages).toFixed(2) : null, textRatio: u && arxivUnits ? +(u / arxivUnits).toFixed(2) : null, todayPages: today?.ok ? pages(pdfOf('record-old', r.tag)) : null, errors: r.errors, firstError: (r.firstError ?? r.error ?? '').slice(0, 90) })
}
writeFileSync(join(OUT, 'nohalt-report.json'), JSON.stringify(table, null, 1))
const of = list => ({ n: list.length, pdf: list.filter(r => r.ok).length, full: list.filter(r => r.ok && r.pageRatio >= 0.9).length, short: list.filter(r => r.ok && r.pageRatio < 0.9).length })
const masked = table.filter(r => r.masked), failed = table.filter(r => !r.masked)
const originals = table.filter(r => r.job === 'orig')
console.log(`${table.length} compiles measured without halting (${masked.length} masked today, ${failed.length} failed on both pages)`)
console.log('  a PDF / at least 90 % of arXiv\'s pages / fewer:', JSON.stringify({ masked: of(masked), failed: of(failed), originals: of(originals) }))
for (const r of table) console.log(`${r.masked ? 'M' : 'F'} ${r.tag.padEnd(24)} ${r.ok ? `pdf ${String(r.pages).padStart(3)} p of ${String(r.arxivPages).padStart(3)} (${r.pageRatio}) text ${r.textRatio}${r.todayPages ? ` today ${r.todayPages} p` : ''}` : 'no PDF'.padEnd(36)} errors ${r.errors} ${r.firstError}`)
