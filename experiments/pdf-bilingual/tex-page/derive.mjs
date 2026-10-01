// Stage 3 (S3a): from the record run (measure.mjs --mode=record) to tex-page/measured.json, build.mjs's input: which
// preloaded files each engine's compiles stat or open (the slim preloads), and the manifest's keys (manifest.mjs
// buildManifest, at the share `--threshold` of the visits). Also says what a manifest built without a paper would have
// done for it (leave-one-out): the requests left before its first preview, and the bytes fetched ahead it did not use.
//   node experiments/pdf-bilingual/tex-page/derive.mjs [--run=record-old] [--threshold=0.25]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildManifest } from './manifest.mjs'

const HERE = new URL('.', import.meta.url).pathname
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const RUN = join(HERE, '../out/tex-measure', arg('run', 'record-old'))
const THRESHOLD = Number(arg('threshold', '0.25'))
const rows = file => readFileSync(join(RUN, file), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))

/** the job names' scripts (measure.mjs LANGS): a translation's script; the probe and the marked original are Latin */
const SCRIPT = { de: 'Latn', ru: 'Cyrl', zh: 'Hans', zhc: 'Hans', zht: 'Hant', ja: 'Jpan', ko: 'Kore' }
const FALLBACK = new Set(['zhc'])
const jobs = rows('jobs.jsonl').filter(j => !j.skipped && j.engine)
const papers = rows('papers.jsonl').filter(p => p.compiler)
const opened = new Map()
for (const o of rows('opened.jsonl')) opened.set(o.tag, o.files)
const fetched = new Map() // tag → Map key → bytes (200s)
const asked = new Map() // tag → Set key (every request)
for (const r of rows('requests.jsonl')) {
  if (!asked.has(r.tag)) { asked.set(r.tag, new Set()); fetched.set(r.tag, new Map()) }
  asked.get(r.tag).add(`${r.fmt}/${r.name}`)
  if (r.status === 200) fetched.get(r.tag).set(`${r.fmt}/${r.name}`, r.bytes)
}

const slim = { pdflatex: new Set(), xelatex: new Set() }
for (const j of jobs) for (const f of opened.get(j.tag) ?? []) slim[j.engine]?.add(f)

const scriptOf = j => SCRIPT[j.script] ?? 'Latn'
const visitsOf = list => list.map(j => ({ paper: j.paper, engine: j.engine, script: scriptOf(j), first: !FALLBACK.has(j.script), keys: new Set(fetched.get(j.tag)?.keys() ?? []) }))
const manifest = buildManifest(visitsOf(jobs), { threshold: THRESHOLD })

// leave-one-out: each paper's first preview in German (pdfLaTeX) and in Chinese (XeLaTeX + xeCJK), its probe before
const size = new Map()
for (const m of fetched.values()) for (const [k, b] of m) size.set(k, b)
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
const loo = { de: [], zh: [] }
for (const p of papers) {
  const others = buildManifest(visitsOf(jobs.filter(j => j.paper !== p.id)), { threshold: THRESHOLD })
  for (const [lang, script] of [['de', null], ['zh', 'Hans']]) {
    const probe = jobs.find(j => j.tag === `${p.id}~probe`), prev = jobs.find(j => j.tag === `${p.id}~${lang}-prev`)
    if (!probe || !prev?.ok) continue
    const ahead = new Set([...(others.engines[p.compiler] ?? []), ...(others.engines[prev.engine] ?? []), ...(script ? others.fonts[script] ?? [] : [])])
    const need = new Set([...(fetched.get(probe.tag)?.keys() ?? []), ...(fetched.get(prev.tag)?.keys() ?? [])])
    const before = new Set([...(asked.get(probe.tag) ?? []), ...(asked.get(prev.tag) ?? [])])
    loo[lang].push({ requestsToday: before.size, left: [...need].filter(k => !ahead.has(k)).length, aheadBytes: [...ahead].reduce((n, k) => n + (size.get(k) ?? 0), 0), unused: [...ahead].filter(k => !need.has(k)).reduce((n, k) => n + (size.get(k) ?? 0), 0) })
  }
}
const mb = n => +(n / 1e6).toFixed(2)
const summary = Object.fromEntries(Object.entries(loo).map(([lang, xs]) => [lang, { papers: xs.length, requestsToday: median(xs.map(x => x.requestsToday)), requestsLeft: median(xs.map(x => x.left)), requestsLeftMax: Math.max(...xs.map(x => x.left)), aheadMB: mb(median(xs.map(x => x.aheadBytes))), unusedMB: mb(median(xs.map(x => x.unused))) }]))

const out = {
  about: 'Measured by tex-page/measure.mjs --mode=record on the corpus, derived by tex-page/derive.mjs; read by tex-page/build.mjs',
  run: arg('run', 'record-old'),
  papers: papers.length,
  compiles: jobs.length,
  threshold: THRESHOLD,
  leaveOneOut: summary,
  slim: Object.fromEntries(Object.entries(slim).map(([e, s]) => [e, [...s].sort()])),
  manifest,
}
writeFileSync(join(HERE, 'measured.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(`${papers.length} papers, ${jobs.length} compiles; slim: pdflatex ${slim.pdflatex.size}, xelatex ${slim.xelatex.size} paths opened`)
console.log(`manifest at ${THRESHOLD}: ${Object.entries(manifest.engines).map(([e, k]) => `${e} ${k.length}`).join(', ')}; fonts ${Object.entries(manifest.fonts).map(([s, k]) => `${s} ${k.length}`).join(', ')}`)
console.log('leave-one-out, before the first preview (probe + preview):', JSON.stringify(summary))
