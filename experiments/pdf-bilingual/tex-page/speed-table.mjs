// speed.mjs's rows as a table: for each link and visit, today's page against the new one — the time to the first
// preview (median over the papers and languages measured, and each one), the megabytes sent, the requests the
// compiles waited for, and the compiles' own times.
//   node experiments/pdf-bilingual/tex-page/speed-table.mjs [--run=speed]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const rows = readFileSync(join(new URL('../out/tex-measure', import.meta.url).pathname, arg('run', 'speed'), 'speed.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
const median = xs => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
const s = ms => (ms == null ? '-' : (ms / 1000).toFixed(1))
console.log('| link (Mbit/s / ms) | visit | lang | first preview, today → new (s) | MB sent | requests waited for | probe + preview compile (s) |')
console.log('|---|---|---|---|---|---|---|')
for (const profile of [...new Set(rows.map(r => r.profile))]) {
  for (const visit of ['first', 'revisit']) {
    for (const lang of [...new Set(rows.map(r => r.lang))]) {
      const of = page => rows.filter(r => r.profile === profile && r.visit === visit && r.lang === lang && r.page === page)
      const o = of('old'), n = of('new')
      const each = o.map(r => { const m = n.find(x => x.paper === r.paper); return `${s(r.firstPreviewMs)} → ${s(m?.firstPreviewMs)}` }).join('; ')
      console.log(`| ${profile} | ${visit} | ${lang} | ${s(median(o.map(r => r.firstPreviewMs)))} → ${s(median(n.map(r => r.firstPreviewMs)))} (${each}) | ${(median(o.map(r => r.bytes)) / 1e6).toFixed(1)} → ${(median(n.map(r => r.bytes)) / 1e6).toFixed(1)} | ${median(o.map(r => r.blocking))} → ${median(n.map(r => r.blocking))} | ${s(median(o.map(r => r.probeMs + r.previewMs)))} → ${s(median(n.map(r => r.probeMs + r.previewMs)))} |`)
    }
  }
}
const failed = rows.filter(r => !r.ok || r.error)
if (failed.length) console.log(`\nnot ok: ${failed.map(r => `${r.page} ${r.profile} ${r.paper} ${r.lang} ${r.visit}: ${r.error ?? 'no PDF'}`).join('; ')}`)
