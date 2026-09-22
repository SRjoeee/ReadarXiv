// Corpus for C0: a uniform random draw of August 2026 submissions (2608.00001–2608.31132), seeded, so the compile rate it
// gives is unbiased. For each id: the source package (latest version) and arXiv's own PDF of that version, one request
// every 3.2 s. Output: data/corpus/<id>/src/ (unpacked), data/corpus/<id>/arxiv.pdf, out/corpus.json.
//   node spikes/corpus.mjs [count=130]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const COUNT = Number(process.argv[2] ?? 130)
const MAX_ID = 31132
const UA = 'ReadarXiv-research/0.1 (compile-rate sample; github.com/SRjoeee/ReadarXiv issue 290)'
const root = new URL('..', import.meta.url).pathname
const dataDir = join(root, 'data/corpus')
const outFile = join(root, 'out/corpus.json')
mkdirSync(dataDir, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))

// mulberry32, seed 290: the same draw every time
let seed = 290
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const ids = new Set()
while (ids.size < COUNT) ids.add(`2608.${String(1 + Math.floor(rand() * MAX_ID)).padStart(5, '0')}`)

const rows = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : []
const done = new Set(rows.map(r => r.id))
for (const id of ids) {
  if (done.has(id)) continue
  const row = { id }
  const dir = join(dataDir, id)
  try {
    const res = await fetch(`https://arxiv.org/src/${id}`, { headers: { 'User-Agent': UA } })
    row.srcStatus = res.status
    if (res.ok) {
      const type = res.headers.get('content-type') ?? ''
      const name = (res.headers.get('content-disposition') ?? '').match(/filename="?([^";]+)/)?.[1] ?? ''
      row.version = name.match(/v(\d+)\.(?:tar\.gz|gz|pdf)$/)?.[1] ?? null
      const buf = Buffer.from(await res.arrayBuffer())
      row.srcBytes = buf.length
      if (/pdf/.test(type)) row.kind = 'pdf-only'
      else {
        mkdirSync(join(dir, 'src'), { recursive: true })
        const gz = join(dir, 'source.gz')
        writeFileSync(gz, buf)
        const raw = execFileSync('gzip', ['-dc', gz], { maxBuffer: 1 << 30 })
        // a tar archive carries "ustar" at offset 257; anything else is one gzipped file, almost always TeX
        if (raw.subarray(257, 262).toString() === 'ustar') { execFileSync('tar', ['-xzf', gz, '-C', join(dir, 'src')]); row.kind = 'tar' }
        else { writeFileSync(join(dir, 'src', `${id}.tex`), raw); row.kind = 'single' }
      }
    }
    await sleep(3200)
    if (row.kind && row.kind !== 'pdf-only' && row.version) {
      const pdf = await fetch(`https://arxiv.org/pdf/${id}v${row.version}`, { headers: { 'User-Agent': UA } })
      row.pdfStatus = pdf.status
      if (pdf.ok) writeFileSync(join(dir, 'arxiv.pdf'), Buffer.from(await pdf.arrayBuffer()))
      await sleep(3200)
    }
  } catch (e) { row.error = String(e).slice(0, 300) }
  rows.push(row)
  writeFileSync(outFile, JSON.stringify(rows, null, 1))
  console.log(JSON.stringify(row))
}
