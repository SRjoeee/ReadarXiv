// Stage 3 (S3a): the identity check. First the index: every distinct request today's page made of texlive-server in
// the record run, resolved by the new page's index (tex-tree.mjs) — the same answer (found or not), the same file,
// the same size. Then every compile of the new page's run against today's (measure.mjs): the same outcome and the same
// PDF, byte for byte (both runs fix the PDFs' dates). Lists every compile that differs, with its first error on each
// side and its page count where there is a PDF (pdfinfo, from poppler, when installed).
//   node experiments/pdf-bilingual/tex-page/compare.mjs [--old=record-old] [--new=identity-new]
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseIndex, resolve } from '../poc-site/tex-tree.mjs'

const OUT = new URL('../out/tex-measure', import.meta.url).pathname
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const OLD = arg('old', 'record-old'), NEW = arg('new', 'identity-new')
const jobs = run => new Map(readFileSync(join(OUT, run, 'jobs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(j => !j.skipped).map(j => [j.tag, j]))
const pages = (run, tag) => { try { return Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [join(OUT, run, 'pdf', `${tag.replace('~', '__')}.pdf`)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))?.[1]) } catch { return null } }
const SITE = new URL('../out/tex-site', import.meta.url).pathname
const tree = JSON.parse(readFileSync(join(SITE, 'tree.json'), 'utf8'))
const index = parseIndex(readFileSync(join(SITE, 't', tree.tid, tree.index), 'utf8'))
const requests = new Map()
const logged = join(OUT, OLD, 'requests.jsonl')
if (existsSync(logged)) for (const l of readFileSync(logged, 'utf8').trim().split('\n')) { const r = JSON.parse(l); requests.set(`${r.fmt}/${r.name}`, r) }
const wrong = [...requests.values()].filter(r => {
  const p = resolve(index, r.fmt, r.name)
  return (p ? 200 : 404) !== r.status || (p && (p.split('/').pop() !== r.fileid || statSync(join(tree.root, p)).size !== r.bytes))
})
console.log(`the index: ${requests.size} distinct requests of today's page, ${requests.size - wrong.length} answered as texlive-server did (found or not, the file, its size), ${wrong.length} not`)
for (const r of wrong.slice(0, 20)) console.log(JSON.stringify(r))

const before = jobs(OLD), after = jobs(NEW)
const kinds = new Map()
const differ = []
let same = 0, failedBoth = 0
for (const [tag, n] of after) {
  const o = before.get(tag)
  if (!o) continue
  const job = tag.split('~')[1]
  const k = kinds.get(job) ?? { compiles: 0, same: 0 }
  kinds.set(job, k)
  k.compiles++
  if (o.ok === n.ok && (o.pdfSha ?? null) === (n.pdfSha ?? null)) {
    same++
    k.same++
    if (!o.ok && job !== 'probe') failedBoth++
    continue
  }
  differ.push({ tag, ok: `${o.ok} → ${n.ok}`, pages: o.ok || n.ok ? `${o.ok ? pages(OLD, tag) : '-'} → ${n.ok ? pages(NEW, tag) : '-'}` : null, error: [o.firstError ?? o.error ?? null, n.firstError ?? n.error ?? null], network: n.network?.length ? n.network : undefined })
}
console.log(`${after.size} compiles of the new page, ${[...after.keys()].filter(t => before.has(t)).length} also run on today's: ${same} the same (outcome and PDF bytes; ${failedBoth} of them failed on both, probes aside), ${differ.length} differ`)
for (const [job, k] of [...kinds].sort()) console.log(`  ${job.padEnd(10)} ${k.same} of ${k.compiles} the same`)
for (const d of differ) console.log(JSON.stringify(d))
