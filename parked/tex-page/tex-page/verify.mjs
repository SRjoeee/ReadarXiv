// Stage 3 (S3a, fix round 1): the bucket against the upload list (upload.mjs), through the CDN, after an upload and
// before tex.html is switched to the new page:
//  - every object of the page and the engine (b/, c/, e/, the index, tex.html): its Content-Type, Content-Encoding and
//    Cache-Control as listed (an object stored as it is may come compressed by the CDN), and its bytes, decoded,
//    those of its file (SHA-256) — asked with brotli and without;
//  - every path the index lists, under t/<tid>/: there (HEAD), with the listed type, encoding and cache headers; the
//    bytes of a sample of them, decoded, with brotli and without.
// At most `rate` requests a second (the zone allows 2,000 per 10 s per address).
//   node experiments/pdf-bilingual/tex-page/verify.mjs --base=https://tex.readarxiv.org [--list=out/tex-upload/<cv>.tsv]
//        [--sample=2000] [--rate=100]
// Prints each object that differs and the counts; fails when one does.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseIndex } from '../poc-site/tex-tree.mjs'
import { parseList } from './upload.mjs'

const sha = bytes => createHash('sha256').update(new Uint8Array(bytes)).digest('hex')
const encodeKey = key => key.split('/').map(encodeURIComponent).join('/')

/** a request rate: `take()` resolves when the next request may go */
function limiter(rate) {
  let next = 0
  return () => {
    const now = performance.now()
    const at = Math.max(now, next)
    next = at + 1000 / rate
    return new Promise(r => setTimeout(r, at - now))
  }
}

/**
 * The checks, with `fetch` (the platform's: it decodes a brotli body) → { checked, failures: [{ key, what }] }.
 * `rows`: the upload list; `indexText`: the tree's index (its paths are the tree's objects to find); `sample`: how many
 * tree files' bytes to check (spread over the list); `parallel` requests at a time, at most `rate` a second
 */
export async function verify({ base, rows, indexText, fetch, sample = 2000, rate = 100, parallel = 16, log = () => {} }) {
  const take = limiter(rate)
  const failures = []
  const fail = (key, what) => { failures.push({ key, what }); log(`${key}: ${what}`) }
  const byKey = new Map(rows.map(r => [r.key, r]))
  const treeRow = rows.find(r => /^t\/[^/]+\/index-[0-9a-f]{12}\.txt$/.test(r.key))
  const tid = treeRow?.key.split('/')[1]
  const headersMatch = (r, res) => {
    const got = { type: res.headers.get('content-type') ?? '', encoding: res.headers.get('content-encoding') ?? '', cache: res.headers.get('cache-control') ?? '' }
    if (got.encoding === 'identity') got.encoding = ''
    // an object stored as it is may be compressed on the way by the CDN (its bytes are checked decoded); one stored
    // compressed must say so, or the browser takes the compressed bytes for the file
    if (!r.encoding) got.encoding = ''
    for (const k of ['type', 'encoding', 'cache']) if (got[k] !== r[k]) fail(r.key, `${k} ${JSON.stringify(got[k])}, not ${JSON.stringify(r[k])}`)
  }
  const get = async (r, encoding) => {
    await take()
    try {
      const res = await fetch(`${base}/${encodeKey(r.key)}`, { headers: { 'accept-encoding': encoding } })
      if (res.status !== 200) return fail(r.key, `${encoding}: HTTP ${res.status}`)
      if (encoding === 'br') headersMatch(r, res)
      const got = sha(await res.arrayBuffer())
      if (got !== r.sha256) fail(r.key, `${encoding}: decoded bytes ${got.slice(0, 12)}, not ${r.sha256.slice(0, 12)}`)
    } catch (e) { fail(r.key, `${encoding}: ${e?.message ?? e}${e?.cause?.code ? ` (${e.cause.code})` : ''}`) }
  }
  const head = async (r, key) => {
    await take()
    try {
      const res = await fetch(`${base}/${encodeKey(key)}`, { method: 'HEAD', headers: { 'accept-encoding': 'br' } })
      if (res.status !== 200) return fail(key, `HTTP ${res.status}`)
      if (r) headersMatch(r, res)
    } catch (e) { fail(key, `${e?.message ?? e}${e?.cause?.code ? ` (${e.cause.code})` : ''}`) }
  }
  const run = async jobs => { for (let i = 0; i < jobs.length; i += parallel) await Promise.all(jobs.slice(i, i + parallel).map(j => j())) }

  const site = rows.filter(r => !r.key.startsWith(`t/${tid}/`) || r === treeRow)
  await run(site.flatMap(r => [() => get(r, 'br'), () => get(r, 'identity')]))
  const { names } = parseIndex(indexText)
  const paths = [...names.values()].flat().sort()
  const keys = paths.map(p => `t/${tid}/${p}`)
  for (const k of keys) if (!byKey.has(k)) fail(k, 'in the index, not in the upload list')
  await run(keys.map(k => () => head(byKey.get(k), k)))
  const step = Math.max(1, Math.floor(keys.length / Math.max(1, sample)))
  const sampled = keys.filter((_, i) => i % step === 0).slice(0, sample).map(k => byKey.get(k)).filter(Boolean)
  await run(sampled.flatMap(r => [() => get(r, 'br'), () => get(r, 'identity')]))
  return { checked: { site: site.length, tree: keys.length, sampled: sampled.length }, failures }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
  const base = arg('base', null)
  if (!base) throw new Error('--base=<the CDN\'s address>')
  const dir = new URL('../out/tex-upload', import.meta.url).pathname
  const latest = () => readdirSync(dir).filter(f => f.endsWith('.tsv')).map(f => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  const rows = parseList(readFileSync(arg('list', null) ?? latest(), 'utf8'))
  const index = rows.find(r => /^t\/[^/]+\/index-[0-9a-f]{12}\.txt$/.test(r.key))
  const indexText = index.encoding ? new TextDecoder().decode(new Uint8Array((await import('node:zlib')).brotliDecompressSync(readFileSync(index.file)))) : readFileSync(index.file, 'utf8')
  const t0 = performance.now()
  const r = await verify({ base: base.replace(/\/$/, ''), rows, indexText, fetch, sample: Number(arg('sample', '2000')), rate: Number(arg('rate', '100')), log: line => console.log(`DIFF ${line}`) })
  console.log(`${r.checked.site} page and engine objects, ${r.checked.tree} index paths, ${r.checked.sampled} tree files' bytes: ${r.failures.length} differences, ${Math.round((performance.now() - t0) / 1000)} s`)
  process.exit(r.failures.length ? 1 : 0)
}
