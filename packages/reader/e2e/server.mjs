// The harness's server on the loopback: the built page and PDF.js's assets (.out), and the objects of our server's v2 routes
// from the fixtures, each answered as R2 answers (a strong entity-tag, ranges as 206). Every request is counted by path.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.map': 'application/json',
}

/** an object's answer to a request: whole, or the range its Range header names (206), with a strong ETag of its bytes */
export function answerBytes(req, res, bytes, { type = 'application/octet-stream', etag = null, cors = false } = {}) {
  const tag = etag ?? `"${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}"`
  const headers = { 'content-type': type, etag: tag, 'accept-ranges': 'bytes', 'cache-control': 'no-store' }
  if (cors)
    Object.assign(headers, {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range, etag, content-length',
    })
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '')
  if (!m) {
    res.writeHead(200, { ...headers, 'content-length': bytes.length })
    return res.end(req.method === 'HEAD' ? undefined : bytes)
  }
  const a = Number(m[1]),
    b = m[2] === '' ? bytes.length - 1 : Math.min(Number(m[2]), bytes.length - 1)
  if (a >= bytes.length || b < a) {
    res.writeHead(416, { ...headers, 'content-range': `bytes */${bytes.length}` })
    return res.end()
  }
  const body = bytes.subarray(a, b + 1)
  res.writeHead(206, { ...headers, 'content-range': `bytes ${a}-${b}/${bytes.length}`, 'content-length': body.length })
  return res.end(req.method === 'HEAD' ? undefined : body)
}

/** the server: `out` the built page, `objects` a Map of our server's paths (e.g. /api/v2/o/arxiv/x.pdf) to files, `routes` more
 *  handlers by path prefix ((req, res, url) => boolean) */
export async function startServer({ out, objects = new Map(), routes = [] }) {
  const counts = new Map()
  const log = []
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    counts.set(url.pathname, (counts.get(url.pathname) ?? 0) + 1)
    log.push({ path: url.pathname, query: url.search, range: req.headers.range ?? null, at: performance.now() })
    for (const r of routes) if (url.pathname.startsWith(r.prefix) && r.handle(req, res, url) !== false) return
    const obj = objects.get(url.pathname)
    if (obj)
      return answerBytes(req, res, readFileSync(obj), { type: TYPES[extname(obj)] ?? 'application/octet-stream' })
    const file = normalize(join(out, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)))
    if (!file.startsWith(out) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      return res.end('not served')
    }
    return answerBytes(req, res, readFileSync(file), { type: TYPES[extname(file)] ?? 'application/octet-stream' })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  return { origin: `http://127.0.0.1:${port}`, counts, log, close: () => new Promise((r) => server.close(r)) }
}
