// Stage 3 (S3a): from the record run (measure.mjs --mode=record) to tex-page/measured.json, build.mjs's input — the
// shares of the corpus's papers whose compiles of each engine opened each file of BusyTeX's preloaded tier, and whose
// visits fetched each file of the tree (manifest.mjs sharesOf; a file only one paper needed is left out: one paper
// says nothing of the next). build.mjs keeps what is worth fetching ahead (manifest.mjs worth, over the reference link)
// in the slim preloads and the manifest.
// Also says what preloads and a manifest made from the other papers would have done for each paper (leave-one-out):
// the files left for its compiles to ask for before its first preview, and the bytes fetched ahead.
//   node experiments/pdf-bilingual/tex-page/derive.mjs [--run=record-old]
// Needs out/tex-build/basic (build.mjs unpacks the preloaded tier there), BusyTeX's texmf.cnf (data/busytex-site) and
// the TeX Live tree (TEXLIVE_TREE).
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseIndex, resolve } from '../poc-site/tex-tree.mjs'
import { buildManifest, REFERENCE, scannedOnly, sharesOf, worth } from './manifest.mjs'
import { brotliSizes } from './sizes.mjs'
import { treeIndex } from './tree.mjs'

const HERE = new URL('.', import.meta.url).pathname
const EXP = join(HERE, '..')
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const RUN = join(EXP, 'out/tex-measure', arg('run', 'record-old'))
const BASIC = join(EXP, 'out/tex-build/basic')
const TREE = process.env.TEXLIVE_TREE ?? join(dirname(realpathSync(join(EXP, 'data/corpus'))), 'tl2026/2026/texmf-dist')
if (!existsSync(BASIC)) throw new Error('no unpacked preloaded tier: run build.mjs once')
const rows = file => readFileSync(join(RUN, file), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))

/** the job names' scripts (jobs.mjs SCRIPT): a translation's; the probe and the marked original are the paper's own */
const SCRIPT = { de: 'Latn', ru: 'Cyrl', zh: 'Hans', zhc: 'Hans', zht: 'Hant', ja: 'Jpan', ko: 'Kore' }
const FALLBACK = new Set(['zhc'])
/** the engine BusyTeX runs: classic LaTeX is compiled by pdfLaTeX (tex-page.mjs engineOf) */
const ENGINE = { latex: 'pdflatex' }
const jobs = rows('jobs.jsonl').filter(j => !j.skipped && j.engine).map(j => ({ ...j, engine: ENGINE[j.engine] ?? j.engine }))
const papers = rows('papers.jsonl').filter(p => p.compiler).map(p => ({ ...p, compiler: ENGINE[p.compiler] ?? p.compiler }))
const opened = new Map(rows('opened.jsonl').map(o => [o.tag, o.files]))
/** the preloaded tier's files the compiles opened (not its directories) */
const allBasic = new Set([...opened.values()].flat().filter(f => f.startsWith('/') && existsSync(join(BASIC, f)) && statSync(join(BASIC, f)).isFile()))
const fetched = new Map() // tag → Set key (200s)
const asked = new Map() // tag → Set key (every request)
for (const r of rows('requests.jsonl')) {
  if (!asked.has(r.tag)) { asked.set(r.tag, new Set()); fetched.set(r.tag, new Set()) }
  asked.get(r.tag).add(`${r.fmt}/${r.name}`)
  if (r.status === 200) fetched.get(r.tag).add(`${r.fmt}/${r.name}`)
}

/** engine → { papers, shares: { path: share } } of the preloaded files its papers' compiles stat or open (a fallback's
 *  too: the preload is the engine's, whichever strategy runs it) */
function openedShares(list) {
  const out = {}
  for (const engine of ['pdflatex', 'xelatex']) {
    const by = new Map()
    const ps = new Set()
    for (const j of list.filter(j => j.engine === engine)) {
      ps.add(j.paper)
      for (const f of opened.get(j.tag) ?? []) { if (!by.has(f)) by.set(f, new Set()); by.get(f).add(j.paper) }
    }
    out[engine] = { papers: ps.size, shares: Object.fromEntries([...by].filter(([f]) => allBasic.has(f)).sort().map(([f, s]) => [f, s.size / ps.size]).filter(([, s]) => s * ps.size >= 1)) }
  }
  return out
}
const scriptOf = j => SCRIPT[j.script] ?? 'Latn'
const visitsOf = list => list.map(j => ({ paper: j.paper, engine: j.engine, script: scriptOf(j), first: !FALLBACK.has(j.script), keys: fetched.get(j.tag) ?? new Set() }))
/** a share measured on one paper alone is left out */
const atLeastTwo = ({ papers: n, shares }) => ({ papers: n, shares: Object.fromEntries(Object.entries(shares).filter(([, s]) => s * n >= 2 - 1e-9)) })
const measure = list => {
  const o = openedShares(list), f = sharesOf(visitsOf(list))
  return {
    opened: Object.fromEntries(Object.entries(o).map(([e, d]) => [e, atLeastTwo(d)])),
    fetched: { groups: Object.fromEntries(Object.entries(f.groups).map(([g, d]) => [g, atLeastTwo(d)])), pooled: Object.fromEntries(Object.entries(f.pooled).map(([e, d]) => [e, atLeastTwo(d)])) },
  }
}
/** the compiles that count: those that made their PDF, and the probes (which make none by design). A compile that
 *  failed stopped short of files its paper's visit would need, and the visit goes on to the next strategy anyway */
const counted = list => list.filter(j => j.ok || j.job === 'probe')
const measured = measure(counted(jobs))

// the sizes on the wire the rule weighs: the preloaded tier's files, and the tree's files the requests named — by the
// page's own index (build.mjs builds the same), the file any program would be given (the record run's requests do not
// say which program asked; the few names whose file depends on it are small)
const index = parseIndex(treeIndex(TREE, readFileSync(join(EXP, 'data/busytex-site/busytex/texmf.cnf'), 'utf8')).text)
const pathOf = key => { const at = key.indexOf('/'); return resolve(index, Number(key.slice(0, at)), key.slice(at + 1)) }
const allKeys = new Set([...fetched.values()].flatMap(s => [...s]))
const sizes = await brotliSizes([...[...allBasic].map(f => join(BASIC, f)), ...[...allKeys].map(pathOf).filter(Boolean).map(p => join(TREE, p))])
const keySize = key => { const p = pathOf(key); return p ? sizes.get(join(TREE, p)) ?? Infinity : Infinity }
const basicSize = f => sizes.get(join(BASIC, f)) ?? Infinity
const keep = worth(REFERENCE)

/** what a measurement keeps ahead: { slim: { engine: Set path }, manifest } */
const ahead = m => ({
  slim: Object.fromEntries(Object.entries(m.opened).map(([e, d]) => [e, new Set(Object.entries(d.shares).filter(([f, s]) => !scannedOnly(e, f) && keep(basicSize(f), s)).map(([f]) => f))])),
  manifest: buildManifest(m.fetched, (k, s) => keep(keySize(k), s)),
})

// leave-one-out: each paper's first preview in German and in Chinese (XeLaTeX + xeCJK), its probe before
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
const loo = { de: [], zh: [] }
for (const p of papers) {
  const a = ahead(measure(counted(jobs.filter(j => j.paper !== p.id))))
  for (const [lang, script] of [['de', null], ['zh', 'Hans']]) {
    const probe = jobs.find(j => j.tag === `${p.id}~probe`), prev = jobs.find(j => j.tag === `${p.id}~${lang}-prev`)
    if (!probe || !prev?.ok) continue
    const engines = [...new Set([probe.engine, prev.engine])]
    const files = new Set([...engines.flatMap(e => a.manifest.engines[e] ?? []), ...(script ? a.manifest.fonts[script] ?? [] : [])])
    const need = new Set([...(fetched.get(probe.tag) ?? []), ...(fetched.get(prev.tag) ?? [])])
    const before = new Set([...(asked.get(probe.tag) ?? []), ...(asked.get(prev.tag) ?? [])])
    const local = [...(opened.get(probe.tag) ?? []).map(f => [probe.engine, f]), ...(opened.get(prev.tag) ?? []).map(f => [prev.engine, f])]
    const notPreloaded = new Set(local.filter(([e, f]) => f.startsWith('/texlive/texmf-dist/') && allBasic.has(f) && !scannedOnly(e, f) && !a.slim[e]?.has(f)).map(([, f]) => f))
    loo[lang].push({
      requestsToday: before.size,
      left: [...need].filter(k => !files.has(k)).length + notPreloaded.size,
      slimBytes: engines.reduce((n, e) => n + [...a.slim[e]].reduce((m, f) => m + basicSize(f), 0), 0),
      manifestBytes: [...files].reduce((n, k) => n + (Number.isFinite(keySize(k)) ? keySize(k) : 0), 0),
    })
  }
}
const mb = n => +(n / 1e6).toFixed(2)
const leaveOneOut = Object.fromEntries(Object.entries(loo).map(([lang, xs]) => [lang, { papers: xs.length, requestsToday: median(xs.map(x => x.requestsToday)), requestsLeft: median(xs.map(x => x.left)), requestsLeftP90: [...xs.map(x => x.left)].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)], slimMB: mb(median(xs.map(x => x.slimBytes))), manifestMB: mb(median(xs.map(x => x.manifestBytes))) }]))

const all = ahead(measured)
writeFileSync(join(HERE, 'measured.json'), `${JSON.stringify({
  about: 'Measured by tex-page/measure.mjs --mode=record on the corpus, derived by tex-page/derive.mjs; read by tex-page/build.mjs. Shares of papers; a file one paper needed is left out',
  run: arg('run', 'record-old'), papers: papers.length, compiles: jobs.length, reference: REFERENCE, leaveOneOut,
  ...measured,
}, null, 1)}\n`)
console.log(`${papers.length} papers, ${jobs.length} compiles`)
console.log(`kept ahead over the reference link (${REFERENCE.mbit} Mbit/s, ${REFERENCE.rtt} ms): preloads ${Object.entries(all.slim).map(([e, s]) => `${e} ${s.size} files`).join(', ')}; manifest ${Object.entries(all.manifest.engines).map(([e, k]) => `${e} ${k.length}`).join(', ')}; fonts ${Object.entries(all.manifest.fonts).map(([s, k]) => `${s} ${k.length}`).join(', ')}`)
console.log('leave-one-out, before the first preview (probe + preview):', JSON.stringify(leaveOneOut))
