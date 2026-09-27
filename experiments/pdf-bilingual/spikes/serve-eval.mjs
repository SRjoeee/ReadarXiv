// experiments/pdf-bilingual/spikes/serve-eval.mjs
// The visual evaluation's page and its data, served on this machine only
// (plans/2026-09-27-geometry-lock-visual-eval-design.md). Files only: / is the page, /data/ the data directory.
//   node experiments/pdf-bilingual/spikes/serve-eval.mjs [--port=8090] [--data=<dir>]
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const opt = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d
const port = Number(opt('port', 8090)), data = resolve(opt('data', join(root, 'data/runs/visual-eval')))
const page = join(root, 'visual-eval/index.html')
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' }
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  const file = path === '/' ? page : path.startsWith('/data/') ? resolve(data, normalize(path.slice('/data/'.length))) : null
  if (!file || (file !== page && !file.startsWith(`${data}/`)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('not found'); return }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' })
  createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/`))
